/**
 * Proposal 0025, step 2 (the maintainer, 2026-11-18; docs/decisions/2026-11-18-07-purity-in-mesh.md): a purity of the
 * bottoms (or the distillate) of a column with a decanter written among the MESH equations, ln(x_i / value) = 0 (the
 * mass fraction on the mass basis) in place of the reboiler's energy balance, as DWSIM's Naphtali-Sandholm solver
 * writes a component-fraction specification (src/units/columns/specifications.js and engine.js, MESH_SPECS). Water +
 * ethanol + cyclohexane, NRTL with the default sets (docs/METHOD_SELECTION.md rules 3 and 7, as F4, F6 and F7):
 *  - F9 (F6's column, 3 mol % water in the bottoms) and F10 (F7's column, 2 mass % water in the bottoms) converge, and
 *    match the independent reference on ChemSep's three-phase stage with its own purity row
 *    (validation/python/reference_mesh_vll.py --purity, fixture validation/fixtures/columns-vll-purity.json) within
 *    F1's tolerances. Before step 2 the outer loop of the specifications refused both (its first trial column did not
 *    converge);
 *  - F11 and F12 (the dehydration column specified by 0.1 mol % water in the bottoms, 30 and 40 stages, feed on 10,
 *    12 % water and 3.3 % cyclohexane): near-dry ethanol, against the same reference;
 *  - on the branch the engine reaches with 3 mol % cyclohexane in the feed, the bottoms' cyclohexane falls to zero as
 *    the water asked for in the bottoms falls (the decanter's distillate liquid hardly moves): the branch ends near
 *    1.6 mol % water, at a component flow of zero, not at a turning point of the purity. Stated, not designed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system } from "../src/index.js";
import { solveCascade } from "../src/units/columns/engine.js";
import { solveCase, PURITY_CASES } from "../validation/columns_vll_engine_starts.mjs";

const load = p => JSON.parse(readFileSync(new URL(`../validation/${p}`, import.meta.url)));
const ref = load("fixtures/columns-vll-purity.json").cases;
const caseOf = id => load(`data/columns/vll/${id}.json`);
const sum = v => v.reduce((a, b) => a + b, 0);

const solved = new Map();
function solve(id) {
  if (!solved.has(id)) solved.set(id, solveCase(caseOf(id), undefined, ref[id].three_phase.feed_enthalpy_J_mol[0]));
  return solved.get(id);
}
const bottomsFraction = (r, basis, MW) => {
  const b = r.products.bottoms.flows, w = basis === "mass" ? b.map((v, i) => v * MW[i]) : b;
  return w[0] / sum(w);
};

for (const id of PURITY_CASES) {
  test(`${id}: converges with the bottoms purity among the MESH equations, the purity met`, () => {
    const c = caseOf(id), s = c.specs[0], r = solve(id);
    assert.equal(r.converged, true);
    assert.match(r.solver.specifications.method, /^among the MESH equations: ln\(x \/ [\d.]+\) = 0 for the (mole|mass) fraction of Water in the bottoms, in place of the reboiler's energy balance/);
    assert.equal(r.solver.specifications.column_solves, 1);
    assert.match(r.solver.start, /^entrainer start/);
    const sys = system({ components: c.components, model: c.thermo.model, vapour: c.thermo.vapour });
    const a = bottomsFraction(r, s.basis, sys.MW);
    assert.equal(r.specifications.length, 1);
    assert.equal(r.specifications[0].met, true);
    assert.ok(Math.abs(r.specifications[0].achieved - s.value) <= 1e-9 * s.value, `achieved ${r.specifications[0].achieved}`);
    assert.ok(Math.abs(a - s.value) <= 1e-9 * s.value, `bottoms water ${a} (${s.basis} fraction)`);
    // the distillate flow is found, not given
    assert.equal(r.adjusted[0].variable, "distillate_rate");
    assert.ok(Math.abs(r.adjusted[0].value - sum(r.products.distillate.flows)) < 1e-9);
  });

  test(`${id}: the three-phase reference's profile, liquids and duties, within F1's tolerances`, () => {
    const c = caseOf(id), q = ref[id].three_phase, tol = c.tolerances.numerical.engine_against_reference;
    const r = solve(id);
    r.stages.forEach((s, j) => {
      const p = q.stages[j], where = `${id} stage ${s.stage}`;
      assert.ok(Math.abs(s.T_K - p.T_K) <= tol.T_K_absolute, `${where}: T ${s.T_K} vs ${p.T_K}`);
      assert.ok(Math.abs(s.L_mol_s - p.L_mol_s) <= tol.flows_relative * p.L_mol_s, `${where}: L ${s.L_mol_s} vs ${p.L_mol_s}`);
      assert.ok(Math.abs(s.V_mol_s - p.V_mol_s) <= tol.flows_relative * Math.max(p.V_mol_s, 1e-300) || (p.V_mol_s === 0 && s.V_mol_s === 0), `${where}: V`);
      s.x.forEach((v, i) => assert.ok(Math.abs(v - p.x[i]) <= tol.mole_fractions_absolute, `${where}: x ${i} ${v} vs ${p.x[i]}`));
      if (j === 0) return;
      assert.equal(!!s.liquids, !!p.liquids, `${where}: two liquids or one`);
      if (p.liquids) {
        for (const k of ["light", "heavy"]) {
          s.liquids[k].x.forEach((v, i) => assert.ok(Math.abs(v - p.liquids[k].x[i]) <= tol.mole_fractions_absolute, `${where}: ${k} x ${i}`));
          assert.ok(Math.abs(s.liquids[k].flow - p.liquids[k].flow_mol_s) <= tol.flows_relative * s.L_mol_s, `${where}: ${k} flow`);
        }
      }
    });
    r.stages[0].x_distillate.forEach((v, i) => assert.ok(Math.abs(v - q.stages[0].x_distillate[i]) <= tol.mole_fractions_absolute, `distillate x ${i}`));
    assert.ok(Math.abs(sum(r.products.distillate.flows) - q.D_mol_s) <= tol.flows_relative * q.D_mol_s, "D");
    assert.ok(Math.abs(r.duties.condenser_W - q.Q_condenser_W) <= tol.duties_relative * Math.abs(q.Q_condenser_W), "condenser duty");
    assert.ok(Math.abs(r.duties.reboiler_W - q.Q_reboiler_W) <= tol.duties_relative * Math.abs(q.Q_reboiler_W), "reboiler duty");
  });
}

test("F9 and F10: what the columns are (stated, not designed): the same steady states as F6 and F7, now reached from a purity", () => {
  const f9 = solve(PURITY_CASES[0]), f10 = solve(PURITY_CASES[1]);
  const B = r => sum(r.products.bottoms.flows), xB = r => r.products.bottoms.flows.map(v => v / B(r));
  // F9: two liquids on stages 5 to 10, as F6 (B = 61 there, 3.12 % water); F10: one liquid on every stage, as F7 (B = 66
  // there, 4.94 % water, which is 1.98 mass %)
  assert.deepEqual(f9.stages.map((s, j) => j > 0 && !!s.liquids).map((v, j) => (v ? j + 1 : 0)).filter(Boolean), [5, 6, 7, 8, 9, 10]);
  assert.ok(Math.abs(B(f9) - 60.69) < 0.01 && Math.abs(xB(f9)[2] - 0.00376) < 0.00002, `F9 B ${B(f9)}, bottoms ${xB(f9)}`);
  assert.equal(f10.stages.filter((s, j) => j > 0 && s.liquids).length, 0);
  assert.ok(Math.abs(B(f10) - 66.14) < 0.01 && Math.abs(xB(f10)[0] - 0.04996) < 0.00002, `F10 B ${B(f10)}, bottoms ${xB(f10)}`);
});

test("F11 and F12: near-dry ethanol (stated, not designed): 0.1 mol % water, about 0.14 mol % cyclohexane in the bottoms", () => {
  const B = r => sum(r.products.bottoms.flows), xB = r => r.products.bottoms.flows.map(v => v / B(r));
  for (const [id, b, c, two] of [[PURITY_CASES[2], 54.001, 0.00137, [10, 11]], [PURITY_CASES[3], 54.020, 0.00144, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]]]) {
    const r = solve(id);
    assert.ok(Math.abs(B(r) - b) < 0.002, `${id} B ${B(r)}`);
    assert.ok(Math.abs(xB(r)[0] - 0.001) < 1e-12 && Math.abs(xB(r)[2] - c) < 0.00002 && xB(r)[1] > 0.9975, `${id} bottoms ${xB(r)}`);
    assert.deepEqual(r.stages.map((s, j) => j > 0 && !!s.liquids).map((v, j) => (v ? j + 1 : 0)).filter(Boolean), two);
  }
});

test("the branch the engine reaches with 3 % cyclohexane ends where the bottoms' cyclohexane runs out (about 1.6 mol % water), not at a turning point", () => {
  // F10's column (30 stages, feed on 10, 12 % water, 3 % cyclohexane), the mole fraction of water in the bottoms
  // lowered step by step, each column started from the last. The decanter's distillate liquid stays within 0.003 of one
  // composition, so the water and the cyclohexane leave in the distillate in one ratio (about 0.27, the feed's is 0.25):
  // the cyclohexane runs out first. Its flow in the bottoms falls in a straight line with the water asked for and
  // reaches zero near 1.6 %; the purity keeps falling to the end (no turning point), so continuation in the purity, or
  // pseudo-arc-length, cannot carry this branch to drier bottoms (docs/decisions/2026-11-18-07-purity-in-mesh.md)
  const c = caseOf(PURITY_CASES[1]), f = c.column.feed;
  const sys = system({ components: c.components, model: c.thermo.model, vapour: c.thermo.vapour });
  const H = ref[PURITY_CASES[1]].three_phase.feed_enthalpy_J_mol[0];
  let prev = null;
  const pts = [];
  for (const xw of [0.03, 0.02, 0.018, 0.016]) {
    const r = solveCascade({ sys, P_kPa: c.pressure_kPa, stages: c.column.stages, phases: "VLL", start: prev,
      ends: { condenser: "decanter", reflux_liquid: "light" }, feeds: [{ stage: f.stage, flows: f.z.map(z => z * f.flow_mol_s), H_W: f.flow_mol_s * H }],
      specs: [{ kind: "bottoms_purity", component: "water", value: xw }] });
    pts.push({ xw, cB: r.products.bottoms.flows[2], xD: r.stages[0].x_distillate });
    prev = r;
  }
  for (const p of pts) p.xD.forEach((v, i) => assert.ok(Math.abs(v - pts[0].xD[i]) < 0.003, `distillate ${p.xD} vs ${pts[0].xD}`));
  for (let k = 1; k < pts.length; k++) assert.ok(pts[k].cB < pts[k - 1].cB, "the bottoms' cyclohexane falls");
  const slope = (pts[1].cB - pts[2].cB) / (pts[1].xw - pts[2].xw);
  const end = pts[2].xw - pts[2].cB / slope;
  assert.ok(end > 0.0155 && end < 0.0162, `the line reaches zero cyclohexane at ${end}`);
  assert.ok(pts[3].cB < 0.002, `${pts[3].cB} mol/s of cyclohexane left in the bottoms at 1.6 % water`);
});
