// Ideal-gas heat capacity derived from the liquid where no open record exists (the maintainer, 2026-10-17;
// src/thermo/pure.js; docs/decisions/2026-10-17-02-liquid-heat-capacity.md):
//   h_IG(T) = integral of cp_L from 298.15 K + g(T) - g(298.15 K), g = dHvap - h_R,sat,  cp_IG = dh_IG/dT.
// Checked against components that have an ideal-gas record, with the record hidden: furan and 2-methylfuran, whose
// records come the way those of the components using the derivation do (measured vapour pressures through Clapeyron;
// the WebBook's ideal-gas tables are the independent values), and CoolProp fluids.
// Methods (docs/METHOD_SELECTION.md): NRTL (the set fitted to Havasi et al. 2016) with an ideal-gas vapour for
// GVL + ethanol at low pressure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pure, system } from "../src/index.js";

const hidden = id => pure(id, { properties: { idealGasHeatCapacity: { available: false, searched: ["hidden by the test"] } } });

test("the derived ideal-gas heat capacity meets the records it was not made from", () => {
  for (const [id, tol] of [["furan", 0.03], ["2-methylfuran", 0.03], ["n-hexane", 0.03], ["toluene", 0.03], ["benzene", 0.035]]) {
    const d = hidden(id), r = pure(id);
    const rec = d.record("idealGasHeatCapacity");
    assert.ok(rec.derived, `${id}: derived`);
    for (const T of [300, 320, 340]) {
      if (T > rec.Tmax_K) continue;
      const dev = d.property("idealGasHeatCapacity", T) / r.property("idealGasHeatCapacity", T) - 1;
      assert.ok(Math.abs(dev) < tol, `${id} at ${T} K: ${(100 * dev).toFixed(2)} %`);
    }
  }
});

test("components without an open ideal-gas heat capacity: derived where their liquid records reach 298.15 K", () => {
  for (const id of ["gvl", "2-methyltetrahydrofuran", "1-3-propanediol", "cpme", "methyl-lactate", "ethyl-lactate", "limonene", "furfuryl-alcohol"]) {
    const p = pure(id), rec = p.record("idealGasHeatCapacity");
    assert.ok(rec?.derived, `${id}: derived record`);
    assert.ok(rec.Tmin_K <= 298.15 && rec.Tmax_K > 298.15);
    assert.match(rec.source.name, /Derived from the liquid heat capacity and the heat of vaporization/);
    assert.equal(p.hIdealGas(298.15), 0, `${id}: the reference stays the ideal gas at 298.15 K`);
    // the pure liquid's enthalpy (h_IG + h_R,sat - dHvap) now equals the mixtures' (anchored at 298.15 K, then the
    // integral of cp_L: src/thermo/enthalpy.js), which never needed the ideal-gas heat capacity
    const T = Math.min(rec.Tmax_K, 330) - 1;
    // (pure() takes the Peng-Robinson residual of the saturated vapour when there are critical constants, so the
    // mixture is given the same vapour)
    const mix = system({ components: [id], model: "ideal", vapour: p.Tc_K ? "PR" : "ideal" }).phase("liquid", T, 101.325, [1]).h_J_mol;
    assert.ok(Math.abs(p.liquidEnthalpy(T) - mix) < 1e-3, `${id}: ${p.liquidEnthalpy(T)} vs ${mix}`);
    // outside the records it refuses with the reason
    assert.throws(() => p.property("idealGasHeatCapacity", rec.Tmax_K + 5), /derived from its liquid heat capacity and heat of vaporization/);
  }
  // the levulinates' measured liquid heat capacities start above 298.15 K: no derivation, the "no open data" stays
  assert.throws(() => pure("methyl-levulinate").hIdealGas(320), /No open data for ideal-gas heat capacity/);
});

test("a flash with GVL in the vapour balances its energy", () => {
  const sys = system({ components: ["gvl", "ethanol"], model: "NRTL" });
  const a = sys.flash({ z: [0.3, 0.7], T: 340, P: 30 });
  assert.ok(a.VF > 0 && a.VF < 1, `two phases: VF ${a.VF}`);
  assert.ok(a.phases.find(q => q.type === "vapour").composition[0] > 1e-4, "GVL is in the vapour");
  const b = sys.flash({ z: [0.3, 0.7], P: 30, H: a.H_J_mol });
  assert.ok(Math.abs(b.T - 340) < 1e-4, `PH flash returns the temperature: ${b.T}`);
});
