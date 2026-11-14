/**
 * CHEPTA-Lab's column requests on chepta 0.6.2 (2026-11-14; docs/decisions/2026-11-14-05-column-fixes-lab-062.md):
 * the inputs that showed each fault, from validation/data/columns/lab-requests-0.6.2/ (copied unchanged from Lab).
 *  - EA-12 = M3: a column's max_iterations governs its Newton iterations (0.6.2 stopped each attempt at 12, whatever
 *    it said), and without it a slow attempt is resumed before the column gives up;
 *  - a converged absorber whose product's P-H flash fails is given by its stage temperature, its enthalpy checked;
 *  - EA-9 = M1: traces (ppm of CO and N2 with Peng-Robinson) do not stop a column's start.
 * These are checks of the solver reaching the MESH solution it already defines (its equations are validated in
 * columns-rigorous*.test.js and columns-vll.test.js against independent references); the numbers asserted here are
 * balances and the iteration counts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "../src/api/dispatcher.js";

const load = name => JSON.parse(readFileSync(new URL(`../validation/data/columns/lab-requests-0.6.2/${name}.request.json`, import.meta.url)));
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const withColumn = (req, id, patch) => {
  const r = structuredClone(req);
  const b = r.input.flowsheet.blocks.find(x => x.id === id);
  Object.assign(b.spec, patch);
  return r;
};
/** Each component's flow in equals its flow out over the column, relative to the feed. */
function balanced(value, inIds, outIds) {
  const st = value.streams, comps = Object.keys(st[inIds[0]].flow_kmol_h);
  const F = sum(Object.fromEntries(inIds.map(k => [k, sum(st[k].flow_kmol_h)])));
  for (const c of comps) {
    const a = inIds.reduce((s, k) => s + (st[k].flow_kmol_h[c] ?? 0), 0), b = outIds.reduce((s, k) => s + (st[k].flow_kmol_h[c] ?? 0), 0);
    assert.ok(Math.abs(a - b) <= 1e-6 * F, `${c}: in ${a}, out ${b} kmol/h`);
  }
}
const streamsOf = (req, block) => {
  const s = req.input.flowsheet.streams;
  return { inIds: s.filter(x => x.to.startsWith(`${block}.`)).map(x => x.id), outIds: s.filter(x => x.from.startsWith(`${block}.`)).map(x => x.id) };
};

test("EA-12 / M3: max_iterations governs the column's Newton iterations; 0.6.2 stopped at 12 whatever it said", () => {
  const req = load("iso-scds5-r2-reflux55000");
  // a limit of 15: each attempt runs 15 iterations, and the limit is named
  const r15 = run(withColumn(req, "SCDS5", { max_iterations: 15 }));
  assert.equal(r15.outcome, "not_converged");
  assert.match(r15.error.message, /\(15 iterations, \d+ ms: it stopped at its iteration limit \(maxIterations = 15\)\)/);
  assert.doesNotMatch(r15.error.message, /12 iterations/);
  // a limit of 100: the same column converges, after more than 12 iterations
  const r100 = run(withColumn(req, "SCDS5", { max_iterations: 100 }));
  assert.equal(r100.outcome, "ok", r100.error?.message);
  const it = r100.value.blocks.SCDS5.state.iterations;
  assert.ok(it > 12 && it <= 100, `iterations ${it}`);
  const { inIds, outIds } = streamsOf(req, "SCDS5");
  balanced(r100.value, inIds, outIds);
});

test("EA-12: without max_iterations, a Newton attempt stopped early is resumed before the column gives up", () => {
  const req = load("iso-scds5-r2-reflux55000");
  const r = run(req);
  assert.equal(r.outcome, "ok", r.error?.message);
  const solver = r.value.blocks.SCDS5.state.solver;
  assert.match(solver.start, /Newton resumed without the early stop/);
  assert.ok(solver.tried.some(t => /resumed from where the .* stopped/.test(t)), solver.tried.join(" | "));
  const { inIds, outIds } = streamsOf(req, "SCDS5");
  balanced(r.value, inIds, outIds);
});

test("an absorber whose product's P-H flash fails is given at its stage temperature, its enthalpy flow the column's", () => {
  const req = load("iso-scds5-paper-reflux70000");
  const r = run(req);
  assert.equal(r.outcome, "ok", r.error?.message);
  const { inIds, outIds } = streamsOf(req, "SCDS5");
  balanced(r.value, inIds, outIds);
  // the energy balance of the column (no duties: an absorber) closes on the products' enthalpy flows
  const st = r.value.streams, H = ids => ids.reduce((a, k) => a + st[k].H_kW, 0);
  assert.ok(Math.abs(H(inIds) - H(outIds)) <= 1e-5 * Math.abs(H(inIds)), `H in ${H(inIds)}, out ${H(outIds)} kW`);
});

test("EA-9 / M1: ppm of CO and N2 in a Peng-Robinson column's feed no longer stop its start; they leave with the vapour distillate", () => {
  for (const name of ["u-column-partial-pr", "u-column-total-pr"]) {
    const req = load(name);
    const r = run(req);
    assert.equal(r.outcome, "ok", `${name}: ${r.error?.message}`);
    const { inIds, outIds } = streamsOf(req, "COLUMN");
    balanced(r.value, inIds, outIds);
    const top = outIds.find(k => /distillate/.test(k)), st = r.value.streams;
    for (const c of ["carbon-monoxide", "nitrogen", "carbon-dioxide"]) {
      const share = st[top].flow_kmol_h[c] / st[inIds[0]].flow_kmol_h[c];
      assert.ok(share > 0.99, `${name}: ${c} in the distillate ${share}`);
    }
  }
});

test("EA-8: a column that does not converge with two liquids allowed is not told to turn them on", () => {
  // F1 (1-butanol + water, NRTL, two liquids on stages 1 and 2; test/columns-vll.test.js), stopped after 1 iteration
  const f1 = JSON.parse(readFileSync(new URL("../validation/data/columns/F1-butanol-water-two-liquids.json", import.meta.url)));
  const f = f1.column.feed, KMOL_H = 3.6;
  const input = { components: f1.components, thermo: { model: "NRTL", vapour: "ideal" },
    feed: { flow_kmol_h: Object.fromEntries(f1.components.map((id, i) => [id, f.z[i] * f.flow_mol_s * KMOL_H])), P_kPa: f1.pressure_kPa, VF: 0 },
    column: { mode: "rigorous", stages: 6, feed_stage: 3, phases: "VLL", reflux_ratio: 2, distillate_kmol_h: 20 * KMOL_H, max_iterations: 1 } };
  const r = run({ capability: "solve_column", input });
  assert.equal(r.outcome, "not_converged");
  assert.doesNotMatch(r.error.message, /turn on "look for two liquids on the stages"/);
  assert.match(r.error.message, /Two liquids are allowed on the stages \(phases "VLL"\)/);
  // with one liquid the advice stays (the F1 refusal of test/columns-vll.test.js)
  const vl = run({ capability: "solve_column", input: { ...input, column: { ...input.column, phases: "VL" } } });
  assert.notEqual(vl.outcome, "ok");
});

test("M4: the minimum-approach exchanger meets its approach with the zones it is checked with; counterflow is not called crossflow", () => {
  // CHEPTA-Lab's HE5 (methanol plant, PR): a condensing hot side against a boiling cold side, dTmin 2 K. 0.6.2 searched
  // with 10 zones, checked with 20, found 1.65 K and refused it as a "crossflow exchanger"
  const req = load("u-he5-dTmin2");
  const r = run(req);
  assert.equal(r.outcome, "ok", r.error?.message);
  const hx = r.value.blocks.HE5.sizing;
  assert.equal(hx.arrangement, "counterflow");
  assert.ok(Math.abs(hx.dT_min_K - 2) <= 0.05, `dT_min ${hx.dT_min_K}`);
  assert.ok(Math.abs(r.value.blocks.HE5.balance.energy_kW) <= 1e-6 * hx.duty_kW);
});
