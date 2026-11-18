/**
 * Proposal 0024 (two liquids in columns), tests 1 and 3 and the validated case (the maintainer, 2026-11-14;
 * docs/decisions/2026-11-14-07-two-liquids-in-columns.md):
 *  - the validated case F4 (validation/data/columns/vll/F4-ethanol-water-cyclohexane-decanter.json): heterogeneous
 *    azeotropic distillation of water + ethanol with cyclohexane and a decanter on the condenser. NRTL with the default
 *    sets, each fitted to open binary data (docs/METHOD_SELECTION.md rules 3 and 7: polar, two liquids); none was fitted
 *    to ternary data, so the comparison with the measured ternary data of Gomis et al. (2005; NIST TRC ThermoML Archive,
 *    validation/data/lle/water_ethanol_cyclohexane_vlle_gomis2005.json) states the model's deviation;
 *  - every two-liquid column (F3, F4, F5) against the independent reference on ChemSep's full three-phase stage
 *    (validation/python/reference_mesh_vll.py --three-phase, fixture validation/fixtures/columns-vll-three-phase.json),
 *    with today's stage ("split") and the smooth stage of part (c) (two_liquid_stage "smooth"), within F1's tolerances.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system } from "../src/index.js";
import { solveCase } from "../validation/columns_vll_engine_starts.mjs";

const load = p => JSON.parse(readFileSync(new URL(`../validation/${p}`, import.meta.url)));
const ref = load("fixtures/columns-vll-three-phase.json").cases;
const gomis = load("data/lle/water_ethanol_cyclohexane_vlle_gomis2005.json");
const caseOf = id => load(`data/columns/${id.startsWith("F3") ? "" : "vll/"}${id}.json`);
const sum = v => v.reduce((a, b) => a + b, 0);

const solved = new Map();
function solve(id, form) {
  const k = `${id} ${form}`;
  if (!solved.has(k)) solved.set(k, solveCase(caseOf(id), form === "split" ? undefined : form, ref[id].three_phase.feed_enthalpy_J_mol[0]));
  return solved.get(k);
}

for (const id of ["F3-ethyl-acetate-ethanol-water-some-stages", "F4-ethanol-water-cyclohexane-decanter", "F5-ethyl-acetate-product-column-lab"]) {
  for (const form of ["split", "smooth"]) {
    test(`${id}, two_liquid_stage "${form}": the three-phase reference's profile, liquids and duties, within F1's tolerances`, () => {
      const c = caseOf(id), q = ref[id].three_phase, tol = c.tolerances.numerical.engine_against_reference;
      const r = solve(id, form);
      assert.equal(r.converged, true);
      const decanter = c.column.condenser === "decanter";
      r.stages.forEach((s, j) => {
        const p = q.stages[j], where = `${id} ${form} stage ${s.stage}`;
        assert.ok(Math.abs(s.T_K - p.T_K) <= tol.T_K_absolute, `${where}: T ${s.T_K} vs ${p.T_K}`);
        assert.ok(Math.abs(s.L_mol_s - p.L_mol_s) <= tol.flows_relative * p.L_mol_s, `${where}: L ${s.L_mol_s} vs ${p.L_mol_s}`);
        assert.ok(Math.abs(s.V_mol_s - p.V_mol_s) <= tol.flows_relative * Math.max(p.V_mol_s, 1e-300) || (p.V_mol_s === 0 && s.V_mol_s === 0), `${where}: V`);
        s.x.forEach((v, i) => assert.ok(Math.abs(v - p.x[i]) <= tol.mole_fractions_absolute, `${where}: x ${i} ${v} vs ${p.x[i]}`));
        if (j === 0) return;
        // the two-liquid stages are the reference's, and each liquid matches
        assert.equal(!!s.liquids, !!p.liquids, `${where}: two liquids or one`);
        if (p.liquids) {
          for (const k of ["light", "heavy"]) {
            s.liquids[k].x.forEach((v, i) => assert.ok(Math.abs(v - p.liquids[k].x[i]) <= tol.mole_fractions_absolute, `${where}: ${k} x ${i}`));
            assert.ok(Math.abs(s.liquids[k].flow - p.liquids[k].flow_mol_s) <= tol.flows_relative * s.L_mol_s, `${where}: ${k} flow`);
          }
        }
      });
      if (decanter) r.stages[0].x_distillate.forEach((v, i) => assert.ok(Math.abs(v - q.stages[0].x_distillate[i]) <= tol.mole_fractions_absolute, `distillate x ${i}`));
      assert.ok(Math.abs(sum(r.products.distillate.flows) - q.D_mol_s) <= tol.flows_relative * q.D_mol_s, "D");
      assert.ok(Math.abs(r.duties.condenser_W - q.Q_condenser_W) <= tol.duties_relative * Math.abs(q.Q_condenser_W), "condenser duty");
      assert.ok(Math.abs(r.duties.reboiler_W - q.Q_reboiler_W) <= tol.duties_relative * Math.abs(q.Q_reboiler_W), "reboiler duty");
      if (form === "smooth") {
        const t = r.solver.two_liquid_stage;
        assert.equal(t.formulation, "smooth");
        assert.equal(t.eps, 1e-5);
        assert.equal(t.check.passed, true);
      }
    });
  }
}

const sysOf = c => system({ components: c.components, model: c.thermo.model, vapour: c.thermo.vapour });

test("F4: the top vapour and the pinched vapour below the feed lie on the model's three-phase vapour line (a liquid of their composition boils into two liquids and gives them back)", () => {
  const c = caseOf("F4-ethanol-water-cyclohexane-decanter"), sys = sysOf(c), r = solve(c.id, "split");
  const two = r.stages.filter((s, j) => j > 0 && s.liquids);
  assert.deepEqual(two.map(s => s.stage), ref[c.id].three_phase.check.two_liquid_stages);
  assert.ok(two.length >= 15, `${two.length} stages with two liquids`);
  for (const s of [r.stages[1], r.stages[11]]) {
    // the condensate of this vapour at the column's pressure: its bubble point (the three-phase flash, VF = 0)
    const f = sys.flash({ z: s.y, P: c.pressure_kPa, VF: 0 });
    assert.equal(f.phases.filter(p => p.type === "liquid" && p.fraction > 0).length, 2, `stage ${s.stage}: the condensate holds two liquids`);
    assert.ok(f.T > 335 && f.T < 336.5, `stage ${s.stage}: ${f.T}`);
  }
  // the decanter: the top vapour condensed at its bubble point is the decanter (stage 1 at that temperature)
  const f = sys.flash({ z: r.stages[1].y, P: c.pressure_kPa, VF: 0 });
  assert.ok(Math.abs(f.T - r.stages[0].T_K) < 1e-6, `decanter ${r.stages[0].T_K} vs ${f.T}`);
});

test("the model's ternary heterogeneous azeotrope at 101.3 kPa against the measured one (Gomis et al. 2005): the deviation stated", () => {
  const c = caseOf("F4-ethanol-water-cyclohexane-decanter"), sys = sysOf(c);
  // the azeotrope as the fixed point of z -> the vapour of z at its bubble point (a residue curve's end, the
  // minimum-boiling node); the flash splits the liquid into two where it must
  let z = c.components.map(k => gomis.azeotrope.x[k]), T = 0;
  for (let k = 0; k < 200; k++) {
    const f = sys.flash({ z, P: gomis.P_kPa, VF: 0 });
    const v = f.incipient.composition, d = Math.max(...v.map((a, i) => Math.abs(a - z[i])));
    z = v; T = f.T;
    if (d < 1e-12) break;
  }
  const f = sys.flash({ z, P: gomis.P_kPa, VF: 0 });
  assert.equal(f.phases.filter(p => p.type === "liquid" && p.fraction > 0).length, 2, "heterogeneous");
  assert.ok(Math.max(...f.incipient.composition.map((a, i) => Math.abs(a - z[i]))) < 1e-10, "an azeotrope: y = x");
  const meas = c.components.map(k => gomis.azeotrope.x[k]);
  const dT = T - gomis.azeotrope.T_K, dy = z.map((v, i) => v - meas[i]);
  // the model, from binary pairs only (docs/decisions/2026-11-17-01-two-liquid-columns.md): 335.43 K against 335.6 K,
  // water 0.157 against 0.188, ethanol 0.324 against 0.292, cyclohexane 0.520 against 0.520
  assert.ok(Math.abs(dT + 0.17) < 0.02, `T: ${T}`);
  assert.ok(Math.abs(dy[0] + 0.031) < 0.003 && Math.abs(dy[1] - 0.032) < 0.003 && Math.abs(dy[2]) < 0.003, `y: ${z}`);
});

test("F4: the decanter's two liquids lie on the model's tie line at the decanter's temperature", () => {
  const c = caseOf("F4-ethanol-water-cyclohexane-decanter"), sys = sysOf(c), r = solve(c.id, "split");
  const s = r.stages[0], R = s.L_mol_s, D = sum(r.products.distillate.flows);
  const z = s.x.map((v, i) => (R * v + D * s.x_distillate[i]) / (R + D));
  // the condensate at the decanter's temperature and pressure: the flash's liquid-liquid split (subcooled by nothing:
  // the decanter is at the reflux's bubble point, so a vanishing vapour may appear; its fraction is checked)
  const f = sys.flash({ z, T: s.T_K, P: c.pressure_kPa });
  const liq = f.phases.filter(p => p.type === "liquid");
  assert.equal(liq.length, 2);
  assert.ok(f.VF < 1e-6, `VF ${f.VF}`);
  const light = liq.reduce((a, b) => (a.composition[2] > b.composition[2] ? a : b)), heavy = liq.find(p => p !== light);
  light.composition.forEach((v, i) => assert.ok(Math.abs(v - s.x[i]) < 1e-6, `reflux ${i}: ${v} vs ${s.x[i]}`));
  heavy.composition.forEach((v, i) => assert.ok(Math.abs(v - s.x_distillate[i]) < 1e-6, `distillate ${i}`));
});

test("F4's model against the measured VLLE of Gomis et al. (2005) at 101.3 kPa: the deviations stated", () => {
  const c = caseOf("F4-ethanol-water-cyclohexane-decanter"), sys = sysOf(c);
  // each measured tie line: the bubble point (VF = 0) of the mean of its two liquids; compared, the temperature and the
  // vapour (water, ethanol) of the model
  const col = Object.fromEntries(gomis.columns.map((k, i) => [k, i]));
  let dTmax = 0, dymax = 0;
  const failed = [];
  for (const row of gomis.rows) {
    const xI = [row[col.x_1_I], row[col.x_2_I]], xII = [row[col.x_1_II], row[col.x_2_II]];
    const z = [0, 1].map(i => (xI[i] + xII[i]) / 2);
    let f;
    try { f = sys.flash({ z: [z[0], z[1], 1 - z[0] - z[1]], P: gomis.P_kPa, VF: 0 }); } catch (e) { failed.push([row[col.T_K], e.code]); continue; }
    const y = f.incipient.composition;
    dTmax = Math.max(dTmax, Math.abs(f.T - row[col.T_K]));
    dymax = Math.max(dymax, Math.abs(y[0] - row[col.y_1]), Math.abs(y[1] - row[col.y_2]));
  }
  // stated, not fitted (the decision file): the bubble temperatures within 0.51 K, the vapour within 0.021 mole
  // fraction. The bubble points of the two tie lines nearest the azeotrope (335.54 K) are not found by the flash ("the
  // K-values did not converge"): a limit of the three-phase flash, reported, not hidden
  assert.ok(dTmax < 0.52, `dT ${dTmax}`);
  assert.ok(dymax < 0.021, `dy ${dymax}`);
  assert.deepEqual(failed, [[335.54, "NO_CONVERGENCE"], [335.54, "NO_CONVERGENCE"]]);
});
