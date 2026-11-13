// Acetic acid below its triple point (289.81 K): the records ChemSep covers there keep ChemSep's own range; the liquid
// heat capacity (ChemSep starts at 289.69 K, no open measured value below) is extrapolated with a warning: 10 K at most
// in the strict range mode (decision 2026-11-12-05), without that limit otherwise (the maintainer, 2026-11-13; decision
// docs/decisions/2026-11-13-03-extrapolation-policy.md). Method: NRTL (METHOD_SELECTION.md, acid + water).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pure, system, withRangePolicy } from "../src/index.js";

test("acetic acid: ChemSep's lower ends are kept below the triple point", () => {
  const p = pure("acetic acid");
  const at = { liquidDensity: 273.15, liquidViscosity: 288.15, surfaceTension: 288.15, liquidThermalConductivity: 274.09, liquidHeatCapacity: 289.69 };
  for (const [name, T] of Object.entries(at)) assert.equal(p.record(name).Tmin_K, T, name);
  assert.ok(Math.abs(p.property("liquidDensity", 288.15) - 1060) < 15); // about 1.06 g/cm3 near 15 degC
});

// The maintainer, 2026-11-12: below a liquid heat-capacity record (and a vapour-pressure record in a mixture) the
// calculation continues, with a warning naming the extrapolation. The 10 K limit of 2026-11-12 holds in the strict
// range mode only (2026-11-13): these tests changed from "refused beyond 10 K" to "calculated with the warning, refused
// in the strict mode" (the maintainer's decision changing behaviour, not a result made to pass).
test("acetic acid at 288.15 K: works with its warnings, pure and with water", () => {
  for (const components of [["acetic acid"], ["acetic acid", "water"]]) {
    const s = system({ components, model: "NRTL" });
    const z = components.map(() => 1 / components.length);
    const r = s.flash({ z, T: 288.15, P: 101.325 });
    assert.equal(r.phases[0].type, "liquid");
    assert.ok(r.warnings.some(w => /^Acetic acid: liquid heat capacity at 288\.15 K is 1\.54 K below its range \(289\.69-400 K\): the value is continued linearly from the record's end, through its value and slope there\. This is an extrapolation, not data\.$/.test(w)), r.warnings.join(" | "));
    assert.ok(r.warnings.some(w => /^Acetic acid: vapour pressure at 288\.15 K is 1\.85 K below its range \(290-523\.15 K\): .*This is an extrapolation, not data\.$/.test(w)), r.warnings.join(" | "));
    // the same in the strict mode (within its 10 K)
    const strict = withRangePolicy({ strictRanges: true }, () => s.flash({ z, T: 288.15, P: 101.325 }));
    assert.ok(Math.abs(strict.H_J_mol - r.H_J_mol) < 1e-6 * Math.abs(r.H_J_mol), `${strict.H_J_mol} vs ${r.H_J_mol}`);
    // no warning inside the records
    assert.ok(!s.flash({ z, T: 300, P: 101.325 }).warnings.some(w => /extrapolat/.test(w)));
  }
});

test("acetic acid at 275 K: calculated with the warning (14.7 K below the record); the strict mode refuses, naming the 10 K limit", () => {
  for (const components of [["acetic acid"], ["acetic acid", "water"]]) {
    const s = system({ components, model: "NRTL" });
    const z = components.map(() => 1 / components.length);
    const r = s.flash({ z, T: 275, P: 101.325 });
    assert.equal(r.phases[0].type, "liquid");
    assert.ok(r.warnings.some(w => /^Acetic acid: liquid heat capacity at 275 K is 14\.69 K below its range/.test(w)), r.warnings.join(" | "));
    assert.throws(() => withRangePolicy({ strictRanges: true }, () => s.flash({ z, T: 275, P: 101.325 })), e => e.code === "OUT_OF_RANGE" && /10 K/.test(e.message));
  }
});

test("the strict mode's liquid heat-capacity refusal beyond 10 K names what was searched (the vapour pressure given, so the enthalpy is what refuses)", () => {
  const s = system({ components: ["acetic acid"], model: "NRTL", psat: () => [1] });
  assert.ok(Number.isFinite(s.flash({ z: [1], T: 279, P: 101.325 }).H_J_mol));
  assert.throws(() => withRangePolicy({ strictRanges: true }, () => s.flash({ z: [1], T: 279, P: 101.325 })), e => e.code === "OUT_OF_RANGE" && /Martin and Andon/.test(e.message) && /10 K at most/.test(e.message));
});
