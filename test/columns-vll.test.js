// Proposal 0015, milestone M2b (W2): the column's own property method with the P-H boundary, two liquids on the stages
// (phases "VLL") and the decanter condenser.
// Against: W7's case F1 (validation/data/columns/F1-butanol-water-two-liquids.json) solved with two liquids, and two
// cases of W2 (1-butanol + water + methanol; F1's column with a decanter), all three solved by W2's independent
// reference validation/python/reference_mesh_vll.py (fixture validation/fixtures/columns-vll.json; W7's M2b reference
// was not on main when this was written), within F1's numerical tolerances.
// The property methods: NRTL for butanol + water (docs/METHOD_SELECTION.md rules 3 and 7: polar, two liquids possible;
// only an activity model shows the second liquid); UNIQUAC as the other method across the boundary (an activity model
// that also describes two liquids, with ChemSep's set for the pair); Peng-Robinson only where a test needs a method that
// cannot hold two liquids (the refusals).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { system, solveFlowsheet, stream, flowsheetStatus } from "../src/index.js";
import { run } from "../src/api/dispatcher.js";
import { solveCascade } from "../src/units/columns/engine.js";
import { readProject, projectOf, stateFromProject } from "../src/ui/project.js";
import { initialState } from "../src/ui/app-logic.js";
import { runInNodeWorker, closeNodeWorkers } from "../src/runtime/node-worker.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const f1 = JSON.parse(readFileSync(new URL("../validation/data/columns/F1-butanol-water-two-liquids.json", import.meta.url)));
const fixture = JSON.parse(readFileSync(new URL("../validation/fixtures/columns-vll.json", import.meta.url)));
const SPEC_OF = { reflux_ratio: "reflux_ratio", distillate_flow_mol_s: "distillate_rate", bottoms_flow_mol_s: "bottoms_rate", boilup_ratio: "boilup_ratio" };
const KMOL_H = 3.6;
const sum = v => v.reduce((a, b) => a + b, 0);

/** A case of the fixture through the engine: the feed a saturated liquid (q = 1, its bubble point; each feed is one stable liquid). */
function solveCase(c) {
  const sys = system({ components: c.components, model: c.thermo.model, vapour: c.thermo.vapour });
  const f = c.column.feed, P = c.pressure_kPa;
  const Tb = sys.bubbleT(f.z, P).T;
  assert.ok(sys.isLiquidStable(f.z, Tb), "the feed is one liquid");
  return solveCascade({ sys, P_kPa: P, stages: c.column.stages, phases: "VLL", ends: { condenser: c.column.condenser, reflux_liquid: c.column.reflux_liquid },
    feeds: [{ stage: f.stage, flows: f.z.map(z => z * f.flow_mol_s), H_W: f.flow_mol_s * sys.enthalpy("liquid", Tb, P, f.z) }],
    specs: c.specs.map(s => ({ kind: SPEC_OF[s.kind], value: s.value })) });
}

for (const [id, rec] of Object.entries(fixture.cases)) {
  test(`two liquids on the stages, ${id}: the reference's profile, the liquids of every stage and the duties, within F1's tolerances`, () => {
    const c = typeof rec.case === "string" ? f1 : rec.case, ref = rec.rigorous;
    const tol = f1.tolerances.numerical.engine_against_reference, bal = f1.tolerances.numerical.balances_on_every_stage;
    const r = solveCase(c);
    assert.equal(r.converged, true);
    assert.equal(r.phases, "VLL");
    const F = c.column.feed.flow_mol_s;
    assert.ok(r.residuals.material <= bal.material_relative_to_feed * F && r.residuals.energy <= bal.energy_relative_to_feed_times_10kJ_mol * F * 1e4);
    r.stages.forEach((s, j) => {
      const q = ref.stages[j], where = `${id} stage ${s.stage}`;
      assert.ok(Math.abs(s.T_K - q.T_K) <= tol.T_K_absolute, `${where}: T ${s.T_K} vs ${q.T_K}`);
      assert.ok(Math.abs(s.L_mol_s - q.L_mol_s) <= tol.flows_relative * q.L_mol_s, `${where}: L`);
      assert.ok(Math.abs(s.V_mol_s - q.V_mol_s) <= tol.flows_relative * q.V_mol_s || (q.V_mol_s === 0 && s.V_mol_s === 0), `${where}: V`);
      s.x.forEach((v, i) => assert.ok(Math.abs(v - q.x[i]) <= tol.mole_fractions_absolute, `${where}: x ${i}`));
      const decanterStage = c.column.condenser === "decanter" && j === 0;
      if (decanterStage) return;
      // which stages hold two liquids, and the light and the heavy liquid of each
      assert.equal(!!s.liquids, !!q.liquids, `${where}: two liquids or one`);
      if (q.liquids) {
        for (const k of ["light", "heavy"]) {
          assert.ok(Math.abs(s.liquids[k].flow - q.liquids[k].flow_mol_s) <= tol.flows_relative * q.liquids[k].flow_mol_s, `${where}: ${k} flow`);
          s.liquids[k].x.forEach((v, i) => assert.ok(Math.abs(v - q.liquids[k].x[i]) <= tol.mole_fractions_absolute, `${where}: ${k} x ${i}`));
        }
        assert.ok(s.liquids.light.rho < s.liquids.heavy.rho);
      }
    });
    const D = sum(r.products.distillate.flows);
    assert.ok(Math.abs(D - ref.D_mol_s) <= tol.flows_relative * ref.D_mol_s, `${id}: D ${D} vs ${ref.D_mol_s}`);
    r.products.distillate.flows.forEach((v, i) => assert.ok(Math.abs(v / D - ref.x_D[i]) <= tol.mole_fractions_absolute, `${id}: x_D ${i}`));
    assert.ok(Math.abs(r.duties.condenser_W - ref.Q_condenser_W) <= tol.duties_relative * Math.abs(ref.Q_condenser_W), `${id}: condenser duty`);
    assert.ok(Math.abs(r.duties.reboiler_W - ref.Q_reboiler_W) <= tol.duties_relative * Math.abs(ref.Q_reboiler_W), `${id}: reboiler duty`);
  });
}

test("F1: with two liquids the column solves (stages 1 and 2 hold two, at the heterogeneous boiling point); with one liquid it is still refused", () => {
  const r = solveCase(f1);
  assert.deepEqual(r.stages.filter(s => s.liquids).map(s => s.stage), [1, 2]);
  assert.ok(Math.abs(r.stages[0].T_K - r.stages[1].T_K) < 1e-9, "a binary with two liquids and a vapour boils at one temperature (Gibbs' phase rule)");
  const vl = run({ capability: "solve_column", input: f1Input({ phases: undefined }) });
  assert.equal(vl.outcome, "unsupported");
  assert.equal(vl.error.code, "PHASE_SPLIT");
  assert.match(vl.error.message, /stages 1, 2[\s\S]*look for two liquids on the stages/);
});

/** F1 through the request path (kmol/h). */
function f1Input(column = {}, thermo = { model: "NRTL", vapour: "ideal" }) {
  const f = f1.column.feed;
  return { components: f1.components, thermo,
    feed: { flow_kmol_h: Object.fromEntries(f1.components.map((id, i) => [id, f.z[i] * f.flow_mol_s * KMOL_H])), P_kPa: f1.pressure_kPa, VF: 0 },
    column: { mode: "rigorous", stages: 6, feed_stage: 3, phases: "VLL", reflux_ratio: 2, distillate_kmol_h: 20 * KMOL_H, ...column } };
}

test("F1 with two liquids through solve_column: ok, the profile shows both liquids by density, the checks by group", () => {
  const r = run({ capability: "solve_column", input: f1Input() });
  assert.equal(r.outcome, "ok", r.error?.message);
  const col = r.value.column, ref = fixture.cases["F1-butanol-water-two-liquids"].rigorous;
  assert.equal(col.phases, "VLL");
  assert.deepEqual(col.two_liquid_stages, [1, 2]);
  const s1 = col.profile[0];
  assert.equal(s1.liquids.named_by, "density");
  assert.ok(Math.abs(s1.liquids.light.x["1-butanol"] - ref.stages[0].liquids.light.x[0]) < 1e-7);
  assert.ok(Math.abs(s1.liquids.heavy.L_kmol_h - ref.stages[0].liquids.heavy.flow_mol_s * KMOL_H) < 1e-6 * s1.liquids.heavy.L_kmol_h);
  assert.equal(col.profile[3].liquids, null);
  assert.equal(r.checks.columns.C1.converged, true);
  assert.match(col.notes.join(" "), /Two liquids on stages 1, 2/);
});

test("refusals: two liquids with an equation of state; LL; a decanter without two liquids, with two specifications, with a reflux ratio", () => {
  // benzene + toluene in Peng-Robinson (docs/METHOD_SELECTION.md rule 1, hydrocarbons): a method that cannot hold two liquids
  const pr = run({ capability: "solve_column", input: { components: ["benzene", "toluene"], thermo: { model: "PR" },
    feed: { flow_kmol_h: { benzene: 50, toluene: 50 }, P_kPa: 101.325, VF: 0 }, column: { mode: "rigorous", stages: 10, feed_stage: 5, phases: "VLL", reflux_ratio: 2, distillate_kmol_h: 50 } } });
  assert.equal(pr.outcome, "unsupported");
  assert.match(pr.error.message, /need an activity model[\s\S]*PR is an equation of state/);
  const ll = run({ capability: "solve_column", input: f1Input({ phases: "LL" }) });
  assert.equal(ll.outcome, "unsupported");
  const noVll = run({ capability: "solve_column", input: f1Input({ phases: "VL", condenser: "decanter", reflux_ratio: undefined }) });
  assert.equal(noVll.outcome, "invalid_input");
  assert.match(noVll.error.message, /decanter[\s\S]*two liquids/);
  const two = run({ capability: "solve_column", input: f1Input({ condenser: "decanter", reflux_ratio: undefined, boilup_ratio: 2 }) });
  assert.equal(two.outcome, "invalid_input");
  assert.match(two.error.message, /give one \(the decanter fixes the reflux\)/);
  const reflux = run({ capability: "solve_column", input: f1Input({ condenser: "decanter", distillate_kmol_h: undefined }) });
  assert.equal(reflux.outcome, "invalid_input");
  assert.throws(() => solveCascade({ sys: system({ components: f1.components, model: "NRTL" }), P_kPa: 101.325, stages: 6, phases: "VLL",
    ends: { condenser: "decanter" }, feeds: [{ stage: 3, flows: [60, 40], H_W: 0 }], specs: [{ kind: "reflux_ratio", value: 2 }] }), /reflux_ratio cannot be given/);
});

test("a decanter: the degrees of freedom count one specification; the butanol-rich liquid refluxed, the water-rich one the distillate", () => {
  const fs = { components: f1.components,
    blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { "1-butanol": 216, water: 144 }, P_kPa: 101.325, VF: 0 } },
      { id: "C1", type: "column", spec: { mode: "rigorous", stages: 6, feed_stage: 3, phases: "VLL", condenser: "decanter", distillate_kmol_h: 126 } },
      { id: "P1", type: "product" }, { id: "P2", type: "product" }],
    streams: [{ id: "S1", from: "F1.out", to: "C1.in" }, { id: "D", from: "C1.distillate", to: "P1.in" }, { id: "B", from: "C1.bottoms", to: "P2.in" }] };
  const sys = system({ components: f1.components, model: "NRTL" });
  const st = flowsheetStatus(sys, fs);
  assert.equal(st.blocks.C1.needed - st.blocks.C1.given, 0, JSON.stringify(st.blocks.C1));
  const r = solveFlowsheet(sys, fs);
  const c = r.blocks.C1, ref = fixture.cases["W2-VLL-butanol-water-decanter"].rigorous;
  assert.equal(c.state.reflux_liquid, "light");
  assert.equal(c.profile[0].liquids.reflux, "light");
  assert.ok(c.profile[0].liquids.light.x.water < c.profile[0].liquids.heavy.x.water);
  assert.ok(Math.abs(r.streams.D.z[1] - ref.x_D[1]) < 1e-7, "the distillate is the water-rich liquid");
  assert.ok(Math.abs(c.state.reflux_ratio - ref.stages[0].L_mol_s / ref.D_mol_s) < 1e-6);
  assert.ok(Math.abs(c.balance.energy_kW) < 1e-6 * c.state.reboiler_kW);
});

// ---- the column's own property method: the P-H boundary

/** A feed, a column with its own method, and the two products, in the flowsheet's method `model`. */
function ownMethodFlowsheet(model, column, feed = { flow_kmol_h: { "1-butanol": 216, water: 144 }, T_K: 360, P_kPa: 101.325 }) {
  return { components: f1.components, thermo: { model, vapour: "ideal" },
    blocks: [{ id: "F1", type: "feed", spec: feed }, { id: "C1", type: "column", spec: { mode: "rigorous", stages: 6, feed_stage: 3, ...column } },
      { id: "P1", type: "product" }, { id: "P2", type: "product" }],
    streams: [{ id: "S1", from: "F1.out", to: "C1.in" }, { id: "D", from: "C1.distillate", to: "P1.in" }, { id: "B", from: "C1.bottoms", to: "P2.in" }] };
}

for (const [flowsheetModel, columnModel] of [["UNIQUAC", "NRTL"], ["NRTL", "UNIQUAC"]]) {
  test(`the P-H boundary, flowsheet ${flowsheetModel} and column ${columnModel}: flows, pressure and enthalpy kept at every stream, the temperature from a P-H flash in the receiving method, no energy created or lost`, () => {
    const sys = system({ components: f1.components, model: flowsheetModel });
    const own = system({ components: f1.components, model: columnModel });
    const r = solveFlowsheet(sys, ownMethodFlowsheet(flowsheetModel, { phases: "VLL", condenser: "decanter", distillate_kmol_h: 126, method: { model: columnModel, vapour: "ideal" } }));
    const c = r.blocks.C1;
    assert.equal(c.method.model, columnModel);
    assert.equal(c.method.flowsheet_model, flowsheetModel);
    // into the column: the feed's enthalpy flow kept, its temperature in the column's method by an independent P-H flash
    const feed = r.streams.S1, b0 = c.state.boundary[0];
    assert.equal(b0.into, "column");
    assert.equal(b0.H_kW, feed.H_kW);
    const inCol = stream(own, { flow_kmol_h: feed.flows, P_kPa: feed.P_kPa, H_kW: feed.H_kW });
    assert.ok(Math.abs(b0.T_after_K - inCol.T_K) < 1e-9 && Math.abs(b0.dT_K - (inCol.T_K - feed.T_K)) < 1e-9);
    // the same T in the other method would not keep the energy: the boundary is needed
    const sameT = stream(own, { flow_kmol_h: feed.flows, P_kPa: feed.P_kPa, T_K: feed.T_K });
    assert.ok(Math.abs(sameT.H_kW - feed.H_kW) > 1, `the methods differ at the same T by ${sameT.H_kW - feed.H_kW} kW`);
    // out of the column: each product's enthalpy flow is the column's, its temperature by P-H in the flowsheet's method
    for (const [sid, name] of [["D", "the distillate"], ["B", "the bottoms"]]) {
      const q = c.state.boundary.find(x => x.stream === name), s = r.streams[sid];
      assert.equal(q.into, "flowsheet");
      assert.ok(Math.abs(q.H_kW - s.H_kW) < 1e-9);
      assert.ok(Math.abs(q.T_after_K - s.T_K) < 1e-9);
      // both directions: back across into the column's method, the stream returns to the column's temperature
      const back = stream(own, { flow_kmol_h: s.flows, P_kPa: s.P_kPa, H_kW: s.H_kW });
      assert.ok(Math.abs(back.T_K - q.T_before_K) < 1e-6, `${name}: back in ${columnModel} at ${back.T_K} K, the column's ${q.T_before_K} K`);
    }
    // the block's and the flowsheet's energy balance: in + duty = out, in the flowsheet's method
    assert.ok(Math.abs(c.balance.energy_kW) < 1e-6, `block ${c.balance.energy_kW} kW`);
    assert.ok(Math.abs(r.balance.energy_kW) < 1e-6, `flowsheet ${r.balance.energy_kW} kW`);
    assert.match(c.notes.join(" "), new RegExp(`own property method, ${columnModel}[\\s\\S]*the feed [+-]`));
  });
}

test("the P-H boundary in a recycle: part of the distillate back to the feed, the column in its own method; no energy created or lost", () => {
  const sys = system({ components: f1.components, model: "UNIQUAC" });
  const fs = { components: f1.components, thermo: { model: "UNIQUAC", vapour: "ideal" },
    blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { "1-butanol": 180, water: 180 }, T_K: 350, P_kPa: 101.325 } },
      { id: "M1", type: "mixer" },
      { id: "C1", type: "column", spec: { mode: "rigorous", stages: 6, feed_stage: 3, phases: "VLL", reflux_ratio: 2, bottoms_kmol_h: 180, method: { model: "NRTL", vapour: "ideal" } } },
      { id: "S1", type: "splitter", spec: { fractions: [0.3, "rest"] } }, { id: "P1", type: "product" }, { id: "P2", type: "product" }],
    streams: [{ id: "A", from: "F1.out", to: "M1.in" }, { id: "B", from: "M1.out", to: "C1.in" }, { id: "D", from: "C1.distillate", to: "S1.in" },
      { id: "R", from: "S1.out", to: "M1.in", tear: true }, { id: "D2", from: "S1.out", to: "P1.in" }, { id: "W", from: "C1.bottoms", to: "P2.in" }] };
  const r = solveFlowsheet(sys, fs);
  assert.equal(r.loops.length, 1);
  const c = r.blocks.C1;
  assert.ok(c.state.boundary.length === 3 && c.state.boundary.every(q => Number.isFinite(q.dT_K)));
  const duties = sum(Object.values(r.blocks).map(b => b.duty_kW ?? 0));
  const feedsH = r.streams.A.H_kW, productsH = r.streams.D2.H_kW + r.streams.W.H_kW;
  // the flowsheet's balance from its own streams: feed + duties = products, to the recycle's tolerance
  const closure = Math.abs(feedsH + duties - productsH);
  assert.ok(closure < 1e-3 * Math.abs(c.state.reboiler_kW) * 1e-3, `energy closure ${closure} kW of a ${c.state.reboiler_kW} kW reboiler`);
  assert.ok(Math.abs(c.balance.energy_kW) < 1e-6);
});

test("the receiving method cannot represent the state: a feed of two liquids into a column in Peng-Robinson is refused, the feed named", () => {
  const sys = system({ components: f1.components, model: "NRTL" });
  const fs = ownMethodFlowsheet("NRTL", { reflux_ratio: 2, distillate_kmol_h: 30, method: { model: "PR" } }, { flow_kmol_h: { "1-butanol": 30, water: 70 }, T_K: 300, P_kPa: 101.325 });
  assert.equal(solveFlowsheet.length >= 2, true);
  let err = null;
  try { solveFlowsheet(sys, fs); } catch (e) { err = e; }
  assert.ok(err, "refused");
  assert.equal(err.code, "PHASE_SPLIT");
  assert.match(err.message, /the feed cannot cross into the column's method \(PR\)[\s\S]*cannot represent this state/);
  const r = run({ capability: "solve_flowsheet", input: { flowsheet: fs } });
  assert.equal(r.outcome, "unsupported");
  assert.equal(r.value, undefined);
});

test("the column's own method through the request path: the block's method and boundary in the qualifications and the reproduction", () => {
  const fs = ownMethodFlowsheet("UNIQUAC", { phases: "VLL", condenser: "decanter", distillate_kmol_h: 126, method: { model: "NRTL", vapour: "ideal" } });
  const r = run({ capability: "solve_flowsheet", input: { flowsheet: fs } });
  assert.equal(r.outcome, "ok", r.error?.message);
  assert.equal(r.qualifications.block_methods.C1.model, "NRTL");
  assert.equal(r.qualifications.block_methods.C1.boundary_streams.length, 3);
  assert.deepEqual(r.reproduction.block_methods.C1, { model: "NRTL", vapour: "ideal", sets: null, prefer: null });
  assert.equal(r.reproduction.method.model, "UNIQUAC");
});

test("two liquids, a decanter and the column's own method in a project: format 6, reopened, the same numbers; the command line and the worker agree", async () => {
  const fs = ownMethodFlowsheet("UNIQUAC", { phases: "VLL", condenser: "decanter", reflux_liquid: "light", distillate_kmol_h: 126, method: { model: "NRTL", vapour: "ideal" } });
  fs.blocks.forEach((b, k) => { b.x = 40 + 160 * k; b.y = 160; });
  const doc = projectOf(initialState({ components: [], flowsheet: fs }), { version: "test" });
  assert.equal(doc.fugacity_project, 6);
  const back = stateFromProject(readProject(JSON.parse(JSON.stringify(doc))));
  assert.deepEqual(back.flowsheet.blocks.find(b => b.id === "C1").spec, fs.blocks.find(b => b.id === "C1").spec);
  const sys = system({ components: f1.components, model: "UNIQUAC" });
  assert.deepEqual(solveFlowsheet(sys, back.flowsheet).blocks.C1.profile, solveFlowsheet(sys, fs).blocks.C1.profile);
  // the command line (chepta run on the saved project) and the worker give the library's numbers
  const dir = mkdtempSync(join(tmpdir(), "chepta-vll-")), file = join(dir, "vll.chepta.json");
  writeFileSync(file, JSON.stringify(doc));
  const cli = spawnSync(process.execPath, [join(ROOT, "bin", "chepta.mjs"), "run", file], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
  assert.equal(cli.status, 0, cli.stderr);
  const lib = run({ capability: "solve_flowsheet", input: { project: doc } });
  assert.deepEqual(JSON.parse(cli.stdout).value.blocks.C1.profile, lib.value.blocks.C1.profile);
  const there = await runInNodeWorker({ capability: "solve_flowsheet", input: { project: doc } });
  assert.equal(there.outcome, "ok");
  assert.deepEqual(there.value.blocks.C1.profile, lib.value.blocks.C1.profile);
  closeNodeWorkers();
});

// ---- W7's M2b cases (validation/data/columns/F1, F2, F3, G1 to G3; reference validation/python/reference_mesh.py,
// fixture validation/fixtures/columns.json), each within its own tolerances

const w7 = JSON.parse(readFileSync(new URL("../validation/fixtures/columns.json", import.meta.url))).cases;
const caseOf = id => JSON.parse(readFileSync(new URL(`../validation/data/columns/${id}.json`, import.meta.url)));
const twoLiquidStages = stages => stages.filter(q => q.liquids && q.liquids.beta_II > 1e-9 && q.liquids.beta_II < 1 - 1e-9).map(q => q.stage);

for (const [id, key] of [["F1-butanol-water-two-liquids", "rigorous_VLL"], ["F2-butanol-water-decanter", "rigorous"], ["F3-ethyl-acetate-ethanol-water-some-stages", "rigorous"]]) {
  test(`W7's ${id} with two liquids on the stages: the reference's profile and two-liquid stages, within the case's tolerances`, () => {
    const c = caseOf(id), ref = w7[id][key], f = c.column.feed;
    const tol = c.tolerances.numerical.engine_against_reference, decanter = c.column.condenser === "decanter";
    const sys = system({ components: c.components, model: c.thermo.model, vapour: c.thermo.vapour });
    // the feed's enthalpy as the reference states it (F2's feed is two liquids at its bubble point)
    const r = solveCascade({ sys, P_kPa: c.pressure_kPa, stages: c.column.stages, phases: "VLL",
      ends: { condenser: c.column.condenser, ...(decanter ? { reflux_liquid: "light" } : {}) },
      feeds: [{ stage: f.stage, flows: f.z.map(z => z * f.flow_mol_s), H_W: f.flow_mol_s * ref.feed_enthalpy_J_mol[0] }],
      specs: c.specs.filter(s => SPEC_OF[s.kind]).map(s => ({ kind: SPEC_OF[s.kind], value: s.value })) });
    r.stages.forEach((s, j) => {
      const q = ref.stages[j], where = `${id} stage ${s.stage}`;
      assert.ok(Math.abs(s.T_K - q.T_K) <= tol.T_K_absolute, `${where}: T ${s.T_K} vs ${q.T_K}`);
      assert.ok(Math.abs(s.L_mol_s - q.L_mol_s) <= tol.flows_relative * q.L_mol_s, `${where}: L ${s.L_mol_s} vs ${q.L_mol_s}`);
      assert.ok(Math.abs(s.V_mol_s - q.V_mol_s) <= tol.flows_relative * q.V_mol_s || (q.V_mol_s === 0 && s.V_mol_s === 0), `${where}: V`);
      // the decanter's stage: W7's x is the condensate, the engine's the reflux (compared below)
      if (!(decanter && j === 0)) s.x.forEach((v, i) => assert.ok(Math.abs(v - q.x[i]) <= tol.mole_fractions_absolute, `${where}: x ${i}`));
    });
    assert.deepEqual(r.stages.filter(s => s.liquids && !(decanter && s.stage === 1)).map(s => s.stage), twoLiquidStages(ref.stages).filter(k => !(decanter && k === 1)));
    if (decanter) {
      const d = ref.stages[0].decanter;
      r.stages[0].x.forEach((v, i) => assert.ok(Math.abs(v - d.reflux_x[i]) <= tol.mole_fractions_absolute, `reflux x ${i}`));
      r.stages[0].x_distillate.forEach((v, i) => assert.ok(Math.abs(v - d.distillate_x[i]) <= tol.mole_fractions_absolute, `distillate x ${i}`));
      assert.ok(r.products.bottoms.flows[0] / sum(r.products.bottoms.flows) >= 0.99, "the case's branch: 0.99 or more butanol at the bottom");
    }
    const D = sum(r.products.distillate.flows);
    assert.ok(Math.abs(D - ref.D_mol_s) <= tol.flows_relative * ref.D_mol_s, `D ${D} vs ${ref.D_mol_s}`);
    assert.ok(Math.abs(r.duties.condenser_W - ref.Q_condenser_W) <= tol.duties_relative * Math.abs(ref.Q_condenser_W), "condenser duty");
    assert.ok(Math.abs(r.duties.reboiler_W - ref.Q_reboiler_W) <= tol.duties_relative * Math.abs(ref.Q_reboiler_W), "reboiler duty");
  });
}

/** G1 (and G2 with the recycle): the column in NRTL inside a Peng-Robinson flowsheet (the case's methods). */
function gFlowsheet(c, T_K, recycle) {
  const f = c.column.feed, K = KMOL_H, B = c.specs.find(s => s.kind === "bottoms_flow_mol_s").value;
  return { components: c.components, thermo: { model: c.flowsheet_thermo.model },
    blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: Object.fromEntries(c.components.map((id, i) => [id, f.flow_mol_s * f.z[i] * K])), T_K, P_kPa: c.pressure_kPa } },
      ...(recycle ? [{ id: "M1", type: "mixer" }, { id: "S1", type: "splitter", spec: { fractions: [recycle.share_of_bottoms, "rest"] } }] : []),
      { id: "C1", type: "column", spec: { mode: "rigorous", stages: c.column.stages, feed_stage: f.stage, reflux_ratio: c.specs[0].value,
        bottoms_kmol_h: B * K / (recycle ? 1 - recycle.share_of_bottoms : 1), method: { model: c.thermo.model, vapour: c.thermo.vapour } } },
      { id: "P1", type: "product" }, { id: "P2", type: "product" }],
    streams: recycle
      ? [{ id: "A", from: "F1.out", to: "M1.in" }, { id: "B", from: "M1.out", to: "C1.in" }, { id: "D", from: "C1.distillate", to: "P1.in" },
        { id: "W", from: "C1.bottoms", to: "S1.in" }, { id: "W2", from: "S1.out", to: "P2.in" },
        // the recycle's start: a toluene-rich liquid near the bottoms (only a first guess; the loop converges to the case's)
        { id: "R", from: "S1.out", to: "M1.in", tear: true, guess: { flow_kmol_h: { benzene: 0.7 * K, toluene: 5.2 * K }, T_K: 382, P_kPa: c.pressure_kPa } }]
      : [{ id: "A", from: "F1.out", to: "C1.in" }, { id: "D", from: "C1.distillate", to: "P1.in" }, { id: "W2", from: "C1.bottoms", to: "P2.in" }] };
}

for (const id of ["G1-own-method-boundary", "G2-own-method-recycle"]) {
  test(`W7's ${id}: each crossing's temperature, the duties and the energy balance, within the case's tolerances`, () => {
    const c = caseOf(id), b = w7[id].boundary, tol = c.tolerances.numerical;
    const sys = system({ components: c.components, model: c.flowsheet_thermo.model });
    const r = solveFlowsheet(sys, gFlowsheet(c, c.column.feed.T_K, c.recycle), c.recycle ? { tolerance: 1e-10 } : undefined);
    const col = r.blocks.C1, at = Object.fromEntries(col.state.boundary.map(q => [q.stream, q]));
    const near = (a, e, what) => assert.ok(Math.abs(a - e) <= tol.boundary.T_K_absolute, `${what}: ${a} vs ${e}`);
    near(at["the feed"].T_after_K, b.column_feed.column_method.T_K, "the feed in the column's method");
    near(r.streams.D.T_K, b.products.distillate.flowsheet_method.T_K, "the distillate in the flowsheet's method");
    near(r.streams.W2.T_K, b.products.bottoms.flowsheet_method.T_K, "the bottoms in the flowsheet's method");
    near(at["the distillate"].dT_K, b.products.distillate.dT_K, "the distillate's change");
    near(at["the bottoms"].dT_K, b.products.bottoms.dT_K, "the bottoms' change");
    assert.ok(Math.abs(col.state.condenser_kW * 1000 / b.energy.Q_condenser_W - 1) <= tol.engine_against_reference.duties_relative);
    assert.ok(Math.abs(col.state.reboiler_kW * 1000 / b.energy.Q_reboiler_W - 1) <= tol.engine_against_reference.duties_relative);
    // no energy created or lost: the case's limit, relative to the feed times 10 kJ/mol
    const limit_W = tol.boundary.energy_relative_to_feed_times_10kJ_mol * c.column.feed.flow_mol_s * 1e4;
    assert.ok(Math.abs(r.balance.energy_kW * 1000) <= limit_W, `energy ${r.balance.energy_kW * 1000} W, limit ${limit_W} W`);
  });
}

test("W7's G3-own-method-cannot-represent: a cold Peng-Robinson feed the column's NRTL cannot represent is refused (OUT_OF_RANGE), the feed, the method and the record named", () => {
  const c = caseOf("G3-own-method-cannot-represent");
  const r = run({ capability: "solve_flowsheet", input: { flowsheet: gFlowsheet(c, c.column.feed.T_K, null) } });
  assert.equal(r.outcome, c.expected.outcome);
  assert.equal(r.error.code, c.expected.code);
  assert.equal(r.value, undefined);
  assert.match(r.error.message, /the feed cannot cross into the column's method \(NRTL[\s\S]*Benzene: its liquid heat-capacity record starts at 278\.68 K/);
});
