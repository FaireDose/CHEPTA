// Components without measured critical constants (proposal 0009; src/thermo/critical.js). gamma-Valerolactone (GVL)
// has open measured vapour pressures, liquid densities and a calorimetric enthalpy of vaporization, but no measured Tc
// or Pc in any open source. It is not given estimated constants: activity models with an ideal-gas vapour use it, the
// equations of state refuse it with the reason, and its pure vapour is an ideal gas.
// Method choice (docs/METHOD_SELECTION.md): an activity model for water + GVL, a polar mixture at low pressure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { system, pure } from "../src/index.js";
import { autoTemperature } from "../src/ui/app-logic.js";

test("GVL has no critical constants and says which sources were searched", () => {
  const p = pure("gvl");
  assert.equal(p.Tc_K, null);
  assert.equal(p.Pc_kPa, null);
  assert.equal(p.omega, null);
  assert.equal(p.critical.available, false);
  assert.ok(p.critical.searched.some(s => /ThermoML/.test(s)) && p.critical.searched.some(s => /WebBook/.test(s)));
  // the vapour-pressure record covers the measured temperatures only (no critical point to anchor it)
  const vp = p.record("vapourPressure");
  assert.ok(vp.Tmax_K < 500, `record ends at ${vp.Tmax_K} K`);
  assert.throws(() => p.psat(vp.Tmax_K + 5), /outside the range/);
  assert.ok(Math.abs(p.Tb_K - 478.9) < 0.5, `Tb ${p.Tb_K}`);
});

test("activity models with an ideal-gas vapour use GVL", () => {
  // the ideal solution: between the two boiling points; Modified UNIFAC 2.0 runs too, with its known deviation for
  // this pair (src/data/known-issues.json, test/mod-unifac.test.js)
  const b = system({ components: ["water", "gvl"], model: "ideal" }).bubbleT([0.5, 0.5], 101.325);
  assert.ok(b.T > 373.12 && b.T < 478.9, `bubble point ${b.T} K between the two boiling points`);
  assert.ok(b.y[0] > 0.5, "water is the more volatile");
  const m = system({ components: ["water", "gvl"], model: "MOD-UNIFAC-2" }).bubbleT([0.9, 0.1], 101.325);
  assert.ok(Number.isFinite(m.T) && m.y[0] > 0.9);
});

test("Peng-Robinson and SRK refuse GVL with the reason, for both phases and for an activity model's vapour", () => {
  for (const model of ["PR", "SRK"]) {
    assert.throws(() => system({ components: ["water", "gvl"], model }), /gamma-Valerolactone has no measured critical constants.*cannot be used/);
  }
  assert.throws(() => system({ components: ["water", "gvl"], model: "MOD-UNIFAC-2", vapour: "PR" }),
    /gamma-Valerolactone has no measured critical constants.*Peng-Robinson vapour cannot be used/);
});

test("GVL's pure vapour is an ideal gas and its liquid comes from the records", () => {
  const p = pure("gvl");
  const V = p.props(490, 1);   // above the end of the vapour-pressure record, at 1 kPa: a vapour
  assert.equal(V.phase, "vapour");
  assert.equal(V.Z, 1);
  assert.ok(Math.abs(V.rho_kg_m3 - 100.1158e-3 * 1000 / (8.314462618 * 490)) < 1e-9);
  assert.match(V.notes.join(" "), /no measured critical constants: its vapour is taken as an ideal gas/);
  const L = p.props(298.15, 101.325);
  assert.equal(L.phase, "liquid");
  assert.ok(L.rho_kg_m3 > 1000 && L.rho_kg_m3 < 1100, `density ${L.rho_kg_m3}`);
  assert.ok(L.dHvap_J_mol > 50000 && L.dHvap_J_mol < 60000, `dHvap ${L.dHvap_J_mol}`);
});

test("the P-x-y temperature picked for a component without Tc lies inside its vapour-pressure record", () => {
  const T = autoTemperature(["water", "gvl"]);
  const vp = pure("gvl").record("vapourPressure");
  assert.ok(T >= vp.Tmin_K && T <= vp.Tmax_K, `T ${T}`);
});
