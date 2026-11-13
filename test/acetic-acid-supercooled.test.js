// Acetic acid below its triple point (289.81 K): the records ChemSep covers there keep ChemSep's own range; the liquid
// heat capacity (ChemSep starts at 289.69 K, no open measured value below) is extrapolated 10 K at most, with a warning.
// Decision: docs/decisions/2026-11-12-05-acetic-acid-supercooled.md. Method: NRTL (METHOD_SELECTION.md, acid + water).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pure, system } from "../src/index.js";

test("acetic acid: ChemSep's lower ends are kept below the triple point", () => {
  const p = pure("acetic acid");
  const at = { liquidDensity: 273.15, liquidViscosity: 288.15, surfaceTension: 288.15, liquidThermalConductivity: 274.09, liquidHeatCapacity: 289.69 };
  for (const [name, T] of Object.entries(at)) assert.equal(p.record(name).Tmin_K, T, name);
  assert.ok(Math.abs(p.property("liquidDensity", 288.15) - 1060) < 15); // about 1.06 g/cm3 near 15 degC
});

// The maintainer, 2026-11-12: below a liquid heat-capacity record (and a vapour-pressure record in a mixture) the
// calculation continues up to 10 K beyond the range, with a warning naming the extrapolation; farther it refuses.
test("acetic acid at 288.15 K: works with both warnings, pure and with water", () => {
  for (const components of [["acetic acid"], ["acetic acid", "water"]]) {
    const s = system({ components, model: "NRTL" });
    const z = components.map(() => 1 / components.length);
    const r = s.flash({ z, T: 288.15, P: 101.325 });
    assert.equal(r.phases[0].type, "liquid");
    assert.ok(r.warnings.some(w => /Acetic acid: 288\.15 K is 1\.54 K below its liquid heat-capacity record \(289\.69-400 K\): the heat capacity is extrapolated linearly .* 10 K at most\. This is an extrapolation, not data\./.test(w)), r.warnings.join(" | "));
    assert.ok(r.warnings.some(w => /Acetic acid: 288\.15 K is 1\.85 K below its vapour-pressure record \(290-523\.15 K\).*beyond its range\. This is an extrapolation, not data\./.test(w)), r.warnings.join(" | "));
    // no warning inside the records
    assert.ok(!s.flash({ z, T: 300, P: 101.325 }).warnings.some(w => /extrapolat/.test(w)));
  }
});

test("acetic acid at 275 K: refused, naming the 10 K limit", () => {
  for (const components of [["acetic acid"], ["acetic acid", "water"]]) {
    const s = system({ components, model: "NRTL" });
    const z = components.map(() => 1 / components.length);
    assert.throws(() => s.flash({ z, T: 275, P: 101.325 }), e => e.code === "OUT_OF_RANGE" && /10 K/.test(e.message));
  }
});

test("the liquid heat-capacity refusal beyond 10 K names what was searched (the vapour-pressure limit is reached first for acetic acid, so the enthalpy is asked for directly)", () => {
  const s = system({ components: ["acetic acid"], model: "NRTL", psat: () => [1] });
  assert.throws(() => s.flash({ z: [1], T: 279, P: 101.325 }), e => e.code === "OUT_OF_RANGE" && /Martin and Andon/.test(e.message) && /10 K at most/.test(e.message));
});
