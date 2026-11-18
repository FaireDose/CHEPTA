/**
 * Proposal 0025, step 1 (the maintainer, 2026-11-18; docs/decisions/2026-11-18-03-entrainer-start.md): the entrainer
 * start of a column with a decanter (src/units/columns/engine.js, entrainerStart). Ethanol with 12 mol % water and
 * 3 mol % cyclohexane, a decanter on the condenser, the organic (light) liquid refluxed: every bubble-point start's
 * condensate holds one liquid, so before step 1 every start was refused. NRTL with the default sets
 * (docs/METHOD_SELECTION.md rules 3 and 7: polar, below 10 bar, two liquids; as F4).
 *  - F6 (20 stages, feed on 5, B = 61 mol/s) and F7 (30 stages, feed on 10, B = 66 mol/s) converge from the entrainer
 *    start, and match the independent reference on ChemSep's three-phase stage
 *    (validation/python/reference_mesh_vll.py --entrainer, fixture validation/fixtures/columns-vll-entrainer.json)
 *    within F1's tolerances, as F4 does in test/columns-heteroazeotropic.test.js;
 *  - the decanter's liquids lie on the model's tie line;
 *  - the "dry-ethanol" specification of decision 2026-11-18-01 (12 % water, 1.17 % cyclohexane, B = 66.0 mol/s) has no
 *    column with this decanter: the distillate is the aqueous liquid of a three-phase state, and on the model's curve of
 *    those liquids none carries at most the feed's water and the feed's cyclohexane in 34 mol/s.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system } from "../src/index.js";
import { cascadeThermo } from "../src/units/columns/engine.js";
import { twoLiquidThermo } from "../src/units/columns/two-liquids.js";
import { solveCase, ENTRAINER_CASES } from "../validation/columns_vll_engine_starts.mjs";

const load = p => JSON.parse(readFileSync(new URL(`../validation/${p}`, import.meta.url)));
const ref = load("fixtures/columns-vll-entrainer.json").cases;
const caseOf = id => load(`data/columns/vll/${id}.json`);
const sum = v => v.reduce((a, b) => a + b, 0);

const solved = new Map();
function solve(id) {
  if (!solved.has(id)) solved.set(id, solveCase(caseOf(id), undefined, ref[id].three_phase.feed_enthalpy_J_mol[0]));
  return solved.get(id);
}

for (const id of ENTRAINER_CASES) {
  test(`${id}: converges from the entrainer start, every bubble-point start refused for one liquid in the condensate`, () => {
    const r = solve(id);
    assert.equal(r.converged, true);
    assert.match(r.solver.start, /^entrainer start \(the top vapour at the heterogeneous azeotrope 0\.1566, 0\.3235, 0\.5199 at 335\.4 K/);
    const bp = r.solver.tried.filter(t => /bubble-point start/.test(t));
    assert.equal(bp.length, 5);
    bp.forEach(t => assert.match(t, /its condensate holds one liquid, so it was not used/));
    assert.match(r.solver.tried.at(-1), /^Newton from the entrainer start/);
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

test("F6 and F7: what the columns are (stated, not designed): the reflux the decanter allows, the bottoms, the stages with two liquids", () => {
  const f6 = solve(ENTRAINER_CASES[0]), f7 = solve(ENTRAINER_CASES[1]);
  const R = r => r.stages[0].L_mol_s / sum(r.products.distillate.flows);
  const xB = r => { const b = r.products.bottoms.flows; return b.map(v => v / sum(b)); };
  // the reflux ratio is the decanter's lever rule, about 1.39 to 1.40 as on every converged column of decision
  // 2026-11-18-01; the start's 1.316 is that of the condensate of the model's azeotrope
  assert.ok(Math.abs(R(f6) - 1.392) < 0.002, `F6 R ${R(f6)}`);
  assert.ok(Math.abs(R(f7) - 1.399) < 0.002, `F7 R ${R(f7)}`);
  // F6: the steady state with two liquids on stages 5 to 10 (bottoms 3.1 % water, 0.41 % cyclohexane), the one decision
  // 2026-11-18-01 reached by continuation (point 4); F7: one liquid on every stage, 4.9 % water in the bottoms
  assert.deepEqual(f6.stages.map((s, j) => j > 0 && !!s.liquids).map((v, j) => (v ? j + 1 : 0)).filter(Boolean), [5, 6, 7, 8, 9, 10]);
  assert.ok(Math.abs(xB(f6)[0] - 0.0312) < 0.0002 && Math.abs(xB(f6)[2] - 0.0041) < 0.0002, `F6 bottoms ${xB(f6)}`);
  assert.equal(f7.stages.filter((s, j) => j > 0 && s.liquids).length, 0);
  assert.ok(Math.abs(xB(f7)[0] - 0.0494) < 0.0002 && Math.abs(xB(f7)[2] - 0.0087) < 0.0002, `F7 bottoms ${xB(f7)}`);
});

test("F6: the decanter's two liquids lie on the model's tie line at the decanter's temperature", () => {
  const c = caseOf(ENTRAINER_CASES[0]), sys = system({ components: c.components, model: c.thermo.model, vapour: c.thermo.vapour });
  const s = solve(c.id).stages[0], R = s.L_mol_s, D = sum(solve(c.id).products.distillate.flows);
  const z = s.x.map((v, i) => (R * v + D * s.x_distillate[i]) / (R + D));
  const f = sys.flash({ z, T: s.T_K, P: c.pressure_kPa });
  const liq = f.phases.filter(p => p.type === "liquid");
  assert.equal(liq.length, 2);
  assert.ok(f.VF < 1e-6, `VF ${f.VF}`);
  const light = liq.reduce((a, b) => (a.composition[2] > b.composition[2] ? a : b)), heavy = liq.find(p => p !== light);
  light.composition.forEach((v, i) => assert.ok(Math.abs(v - s.x[i]) < 1e-6, `reflux ${i}: ${v} vs ${s.x[i]}`));
  heavy.composition.forEach((v, i) => assert.ok(Math.abs(v - s.x_distillate[i]) < 1e-6, `distillate ${i}`));
});

test("the dry-ethanol specification of decision 2026-11-18-01 (12 % water, 1.17 % cyclohexane, B = 66.0 mol/s) has no column with this decanter", () => {
  // The decanter is at its reflux's bubble point with two liquids: a three-phase state, so its distillate (the aqueous
  // liquid) lies on the model's curve of aqueous liquids in vapour-liquid-liquid equilibrium at 101.325 kPa, traced
  // here by the bubble points of liquids across the two-liquid region (cyclohexane : water fixed at 6 : 4, ethanol
  // from 10 to 60 %). The bottoms (66 mol/s) cannot be negative, so the distillate (34 mol/s) carries at most the
  // feed's 12 mol/s of water and 1.17 mol/s of cyclohexane: x_water <= 0.3529 and x_cyclohexane <= 0.0344 together.
  // Along the curve the cyclohexane of the aqueous liquid rises as its water falls, and where its water is 0.3529 or
  // less its cyclohexane is above 0.037: no point meets both
  const sys = system({ components: ["water", "ethanol", "cyclohexane"], model: "NRTL", vapour: "ideal" });
  const th = twoLiquidThermo(cascadeThermo(sys, 101.325), sys);
  const D = 34, pts = [];
  for (let e = 0.10; e <= 0.60 + 1e-9; e += 0.01) {
    const x = [0.4 * (1 - e), e, 0.6 * (1 - e)], T = th.bubbleT(x), l = th.liquids(x, T, 1, -1);
    if (l) pts.push(l.heavy.x);
  }
  assert.ok(pts.length > 40, `${pts.length} points on the curve`);
  for (let k = 1; k < pts.length; k++) assert.ok(pts[k][0] < pts[k - 1][0] && pts[k][2] > pts[k - 1][2], "water falls, cyclohexane rises");
  assert.ok(pts[0][0] > 12 / D && pts.at(-1)[0] < 12 / D, "the curve spans the distillate's water");
  for (const p of pts) assert.ok(!(D * p[0] <= 12 && D * p[2] <= 1.17), `a distillate that fits: ${p}`);
  const first = pts.find(p => D * p[0] <= 12);
  assert.ok(first[2] > 0.037, `${first}`);
});
