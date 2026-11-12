// Acetic acid below its triple point (289.81 K): the records ChemSep covers there keep ChemSep's own range; the liquid
// heat capacity (ChemSep starts at 289.69 K, no open measured value below) stays refused, and says what was searched.
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

test("acetic acid at 288.15 K: the liquid enthalpy is refused, naming what was searched and where it works", () => {
  for (const components of [["acetic acid"], ["acetic acid", "water"]]) {
    const s = system({ components, model: "NRTL" });
    const z = components.map(() => 1 / components.length);
    assert.throws(() => s.flash({ z, T: 288.15, P: 101.325 }),
      e => e.code === "OUT_OF_RANGE" && /289\.69 K/.test(e.message) && /Martin and Andon/.test(e.message) && /16\.5/.test(e.message));
    assert.doesNotThrow(() => s.flash({ z, T: 290, P: 101.325 }));
  }
});
