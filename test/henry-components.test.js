// Henry components (proposal 0017; the maintainer, 2026-11-04): in an activity model with water, a gas with a Henry's
// law constant in water dissolves by f = H x (unsymmetric convention, activity coefficient 1 at infinite dilution), water
// by Raoult's law. Checked against the IAPWS G7-04 check values (through the system), against Carroll, Slupsky and
// Mather (1991), an evaluated correlation of the measured solubility of CO2 in water (validation/data/henry/), and, for
// a column, against the independent reference of test/columns-absorber.test.js (case H9).
// Method (docs/METHOD_SELECTION.md step 2, proposal 0017): an activity model with Henry's law for gases in water; NRTL is
// named, and with water the only solvent its parameters are not used, so "ideal" gives the same numbers (checked).
// Other methods appear only where a refusal is tested.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, henry, withRangePolicy } from "../src/index.js";

const carroll = JSON.parse(readFileSync(new URL("../validation/data/henry/co2_water_carroll1991.json", import.meta.url)));

test("CO2, N2 and O2 in water are Henry components: K = H / P with IAPWS G7-04's H (its check values, table 6)", () => {
  const s = system({ components: ["carbon-dioxide", "nitrogen", "oxygen", "water"], model: "NRTL" });
  assert.deepEqual(s.info.henry.components, ["carbon-dioxide", "nitrogen", "oxygen"]);
  assert.deepEqual(s.henry, [true, true, true, false]);
  // IAPWS G7-04, table 6: ln(kH / 1 GPa) at 300 and 400 K (also in test/henry.test.js)
  const CHECK = { 300: [-1.7508, 2.1716, 1.5024], 400: [-0.5450, 2.3509, 1.8832] };
  for (const [T, want] of Object.entries(CHECK)) {
    const ps = s.psat(+T);
    want.forEach((v, i) => assert.ok(Math.abs(Math.log(ps[i] / 1e6) - v) < 6e-5, `${s.names[i]} ${T} K: ${Math.log(ps[i] / 1e6)} vs ${v}`));
    const x = [1e-5, 1e-5, 1e-5, 1 - 3e-5], K = s.lnKValues(x, [0.3, 0.3, 0.3, 0.1], +T, 101.325).map(Math.exp);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(K[i] / (henry(s.ids[i], "water", +T) / 101.325) - 1) < 1e-12);
  }
  assert.match(s.warnings(300, 101.325).join(" "), /dissolve in water by Henry's law/);
});

test("the solubility of CO2 in water against Carroll, Slupsky and Mather (1991), Table 3, within 3.5 %", () => {
  // Table 3 is the authors' correlation of about 100 measured investigations (an evaluated set, not a measurement);
  // IAPWS G7-04 is another correlation. The flash at T and the total pressure gives the saturated liquid; the 3.5 % is
  // this project's tolerance for two correlations of the same data (largest difference found: 3.1 %, at 10 degC)
  for (const model of ["NRTL", "ideal"]) {
    const s = system({ components: ["carbon-dioxide", "water"], model });
    for (const [tC, a, b] of carroll.rows) {
      [[101.325, a], [500, b]].forEach(([P, want]) => {
        const f = s.flash({ z: [0.5, 0.5], T: tC + 273.15, P });
        const x = f.phases.find(p => p.type === "liquid").composition[0] * 1000;
        assert.ok(Math.abs(x / want - 1) < 0.035, `${model}, ${tC} degC, ${P} kPa: x = ${x.toFixed(4)} / 1000 vs ${want}`);
      });
    }
  }
});

test("a dissolved gas's liquid enthalpy: its ideal-gas enthalpy minus R T^2 d ln H / dT (the enthalpy of solution)", () => {
  const s = system({ components: ["carbon-dioxide", "water"], model: "NRTL" });
  const T = 298.15, P = 101.325, x = 1e-3, R = 8.314462618;
  const hMix = s.enthalpy("liquid", T, P, [x, 1 - x]), hW = s.enthalpy("liquid", T, P, [0, 1]);
  const hCO2 = (hMix - (1 - x) * hW) / x;
  const dlnH = (Math.log(henry("carbon-dioxide", "water", T + 0.01)) - Math.log(henry("carbon-dioxide", "water", T - 0.01))) / 0.02;
  const hIG = s.enthalpy("vapour", T, P, [1, 0]);
  assert.ok(Math.abs(hCO2 - (hIG - R * T * T * dlnH)) < 1e-6, `${hCO2} vs ${hIG - R * T * T * dlnH}`);
  // the enthalpy of solution is negative (CO2 dissolves with heat released), about -20 kJ/mol near 25 degC
  assert.ok(hCO2 - hIG < -15000 && hCO2 - hIG > -25000, `${hCO2 - hIG} J/mol`);
});

test("what Henry components refuse: another solvent, a temperature outside the equation, a cubic vapour; a gas without a constant as before", () => {
  // another liquid beside water: the gases are not Henry components (as before, a gas-phase reactor's system keeps working);
  // an absorber refuses them with the reason (test/columns-absorber.test.js)
  assert.equal(system({ components: ["carbon-dioxide", "hydrogen", "methanol", "water"], model: "ideal" }).info.henry, undefined);
  // outside the range of CO2's equation (274.19-642.66 K): continued with a warning at the answer's temperature; the strict
  // range mode refuses (the maintainer, 2026-11-13; this line changed from "refused")
  const s = system({ components: ["carbon-dioxide", "water"], model: "NRTL" });
  assert.ok(Number.isFinite(s.psat(270)[0]));
  assert.ok(s.warnings(270, 101.325).some(w => /^Carbon dioxide: Henry's law constant in water at 270 K is 4\.19 K below its range \(274\.19-642\.66 K\)/.test(w)), s.warnings(270, 101.325).join(" | "));
  assert.throws(() => withRangePolicy({ strictRanges: true }, () => s.psat(270)), e => e.code === "OUT_OF_RANGE" && /274.19/.test(e.message));
  // with a cubic vapour
  assert.throws(() => system({ components: ["carbon-dioxide", "water"], model: "NRTL", vapour: "PR" }), e => e.code === "NOT_AVAILABLE" && /ideal-gas vapour/.test(e.message));
  // a gas with no Henry's law constant (helium): refused for its missing pair, as before
  assert.throws(() => system({ components: ["helium", "water"], model: "NRTL" }), e => e.code === "MISSING_DATA");
  // henry: false keeps the old behaviour (CO2 + water then needs an NRTL pair)
  assert.throws(() => system({ components: ["carbon-dioxide", "water"], model: "NRTL", henry: false }), e => e.code === "MISSING_DATA");
  // without water a gas is not a Henry component (Raoult's law, as before)
  assert.equal(system({ components: ["ethane", "propane"], model: "ideal" }).info.henry, undefined);
});
