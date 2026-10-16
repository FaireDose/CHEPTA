// Inert solids (the maintainer, 2026-10-16: "allowed to have an inert solid for the moment"; src/equilibrium/inert-solids.js)
// and the switch between the user's record and the databank's (use: false). The checks:
//  - the fluid part flashes exactly as it would alone, the solid adds its own phase and the integral of its heat
//    capacity (an independent numerical integral here), and the vapour fraction counts every mole;
//  - P-H gives the T-P state back; a stream of solid alone is heated by its heat capacity;
//  - in a flowsheet the solid leaves a flash drum with the liquid and a component separator filters it out, and the
//    mass and energy balances close;
//  - refusals: a vapour fraction above the fluid share, bubble points, a solid without a heat capacity;
//  - a record switched off is kept but not used.
// Methods (docs/METHOD_SELECTION.md): NRTL for ethanol + water at 1 atm. The solid's heat capacity is made up (a
// constant and a linear record): the point is the bookkeeping, not the numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { system, solveFlowsheet, checkUserData, createSystem, pure } from "../src/index.js";
import { setEntryUse, userDataList } from "../src/ui/user-data-file.js";

const src = { name: "test: made-up numbers" };
const cp = (A, B = 0) => ({ equation: "DIPPR100", coefficients: { A, B }, units: "J/mol/K", Tmin_K: 250, Tmax_K: 800, source: src });
const catalyst = (A = 45, B = 0.02) => ({ name: "Catalyst", MW: 60.08, class: "solid", source: src, properties: { solidHeatCapacity: cp(A, B) } });
const ud = checkUserData({ components: { "user:catalyst": catalyst() } });
const hs = T => { let s = 0; const n = 2000, d = (T - 298.15) / n; for (let k = 0; k < n; k++) { const t = 298.15 + (k + 0.5) * d; s += (45 + 0.02 * t) * d; } return s; };

test("the fluid part flashes as it would alone; the solid adds its own phase and enthalpy", () => {
  const sys = system({ components: ["water", "ethanol", "Catalyst"], model: "NRTL", userData: ud });
  const fluid = system({ components: ["water", "ethanol"], model: "NRTL" });
  const z = [0.6, 0.2, 0.2], zf = [0.75, 0.25];
  const a = sys.flash({ z, T: 360, P: 101.325 }), b = fluid.flash({ z: zf, T: 360, P: 101.325 });
  assert.ok(Math.abs(a.VF - 0.8 * b.VF) < 1e-12, "the vapour fraction counts the solid too");
  const solid = a.phases.find(p => p.type === "solid");
  assert.ok(Math.abs(solid.fraction - 0.2) < 1e-12 && solid.composition[2] === 1);
  assert.ok(Math.abs(a.H_J_mol - (0.8 * b.H_J_mol + 0.2 * hs(360))) < 1e-6, `H ${a.H_J_mol}`);
  const vap = a.phases.find(p => p.type === "vapour");
  assert.equal(vap.composition[2], 0, "no solid in the vapour");
  // P-H gives the state back; a vapour fraction is reached at the fluid's temperature for VF / (1 - s)
  const ph = sys.flash({ z, P: 101.325, H: a.H_J_mol });
  assert.ok(Math.abs(ph.T - 360) < 1e-6 && Math.abs(ph.VF - a.VF) < 1e-8, `P-H ${ph.T} ${ph.VF}`);
  assert.ok(Math.abs(sys.flash({ z, P: 101.325, VF: 0.4 }).T - fluid.flash({ z: zf, P: 101.325, VF: 0.5 }).T) < 1e-9);
  // the solid alone: its heat capacity only
  const only = sys.flash({ z: [0, 0, 1], T: 400, P: 101.325 });
  assert.ok(Math.abs(only.H_J_mol - hs(400)) < 1e-6 && only.VF === 0);
  assert.ok(Math.abs(sys.flash({ z: [0, 0, 1], P: 101.325, H: hs(400) }).T - 400) < 1e-6);
  // refusals, with the reason
  assert.throws(() => sys.flash({ z, P: 101.325, VF: 0.9 }), /counts the inert solid too.*at most 0\.8000/);
  assert.throws(() => sys.flash({ z: [0, 0, 1], P: 101.325, VF: 0 }), /all inert solid/);
  assert.throws(() => sys.bubbleT(z, 101.325), /Catalyst is an inert solid: bubbleT does not take it/);
  assert.throws(() => sys.flash({ z: [0, 0, 1], T: 900, P: 101.325 }), /solid heat-capacity record covers 250-800 K/);
  assert.throws(() => createSystem({ components: ["water", "Catalyst"], userData: ud }), /inert solid.*CHEPTA\.system\(\)/);
});

test("in a flowsheet the solid leaves the drum with the liquid, and a separator filters it out", () => {
  const sys = system({ components: ["water", "ethanol", "user:catalyst"], model: "NRTL", userData: ud });
  const r = solveFlowsheet(sys, {
    blocks: [
      { id: "F1", type: "feed", spec: { flow_kmol_h: { water: 60, ethanol: 20, "user:catalyst": 20 }, T_K: 298.15, P_kPa: 101.325 } },
      { id: "E1", type: "heater", spec: { T_K: 350 } },
      { id: "V1", type: "flash", spec: { P_kPa: 101.325, VF: 0.3 } },
      { id: "X1", type: "separator", spec: { fractions: { water: [0.05, "rest"], ethanol: [0.05, "rest"], "user:catalyst": [1, "rest"] } } },
      { id: "C1", type: "heater", spec: { duty_kW: -5 } },
      { id: "P1", type: "product" }, { id: "P2", type: "product" }, { id: "P3", type: "product" },
    ],
    streams: [
      { id: "S1", from: "F1.out", to: "E1.in" }, { id: "S2", from: "E1.out", to: "V1.in" }, { id: "S3", from: "V1.vapour", to: "P1.in" },
      { id: "S4", from: "V1.liquid", to: "X1.in" }, { id: "S5", from: "X1.out", to: "C1.in" }, { id: "S6", from: "C1.out", to: "P2.in" },
      { id: "S7", from: "X1.out", to: "P3.in" },
    ],
  });
  const S = r.streams;
  assert.equal(S.S3.flow_kmol_h["user:catalyst"], 0, "no solid in the vapour");
  assert.ok(Math.abs(S.S4.flow_kmol_h["user:catalyst"] - 20) < 1e-9, "all the solid leaves with the liquid");
  assert.ok(S.S4.phases.some(p => p.type === "solid") && S.S4.VF === 0);
  assert.ok(Math.abs(S.S6.flow_kmol_h["user:catalyst"] - 20) < 1e-9 && S.S7.flow_kmol_h["user:catalyst"] === 0, "the filter takes it all");
  for (const id of ["water", "ethanol", "user:catalyst"]) {
    const out = ["S3", "S6", "S7"].reduce((a, k) => a + S[k].flow_kmol_h[id], 0);
    assert.ok(Math.abs(out - S.S1.flow_kmol_h[id]) < 1e-9, `${id} balance`);
  }
  const Q = Object.values(r.blocks).reduce((a, b) => a + (b.duty_kW || 0), 0);
  assert.ok(Math.abs(S.S3.H_kW + S.S6.H_kW + S.S7.H_kW - S.S1.H_kW - Q) < 1e-6, "energy balance");
});

test("an inert solid's data are checked", () => {
  const bad = [
    [{ components: { "user:x": { ...catalyst(), properties: {} } } }, /needs its solid heat capacity/],
    [{ components: { "user:x": { ...catalyst(), vapourPressure: { equation: "DIPPR101", coefficients: { A: 20 }, units: "Pa", Tmin_K: 300, Tmax_K: 400, source: src } } } }, /no vapour pressure/],
    [{ components: { "user:x": { ...catalyst(), properties: { solidHeatCapacity: cp(45), liquidDensity: { equation: "DIPPR100", coefficients: { A: 2000 }, units: "kg/m3", Tmin_K: 300, Tmax_K: 400, source: src } } } } }, /takes only a solid heat capacity/],
    [{ properties: { ethanol: { solidHeatCapacity: cp(45) } } }, /for an inert solid of your own/],
    [{ components: { "user:x": { ...catalyst(), Tc_K: 500, Pc_Pa: 4e6, omega: 0.3 } } }, /an inert solid has no critical constants/],
  ];
  for (const [d, re] of bad) assert.throws(() => checkUserData(d), re);
  assert.equal(pure("Catalyst", { userData: ud }).MW, 60.08, "pure() reads its constants");
});

test("a record switched off is kept, but the databank's is used; switched on, the user's again", () => {
  const rec = { equation: "DIPPR100", coefficients: { A: 52000, B: -40 }, units: "J/mol", Tmin_K: 290, Tmax_K: 360, source: src };
  const mine = { properties: { ethanol: { heatOfVaporization: rec } } };
  const T = 330, bank = pure("ethanol").property("heatOfVaporization", T);
  assert.equal(pure("ethanol", { userData: mine }).property("heatOfVaporization", T), 52000 - 40 * T);
  const off = setEntryUse(mine, "properties.ethanol.heatOfVaporization", false);
  assert.equal(off.properties.ethanol.heatOfVaporization.use, false);
  assert.equal(pure("ethanol", { userData: off }).property("heatOfVaporization", T), bank, "switched off: the databank's");
  assert.equal(userDataList(off)[0].used, false);
  const on = setEntryUse(off, "properties.ethanol.heatOfVaporization", true);
  assert.deepEqual(on, mine, "switched on again: as it was");
  assert.throws(() => setEntryUse({ components: { "user:catalyst": catalyst() } }, "components.user:catalyst", false), /cannot be switched off/);
  assert.throws(() => checkUserData({ properties: { ethanol: { heatOfVaporization: { ...rec, use: "no" } } } }), /use must be true or false/);
});
