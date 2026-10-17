// The user's own data (proposal 0012, step 1: the engine overlay). The checks:
//  - an overlay that repeats the databank's own records and parameters gives exactly the databank's results, so the
//    overlay itself changes nothing;
//  - a user record replaces the databank's for that property only, and only where it is passed (no global state);
//  - the user's own components (volatile, nonvolatile, with critical constants) work in flashes, flowsheets and
//    equations of state, and agree with the databank component they copy;
//  - wrong data is refused with a message that names the problem.
// Methods (docs/METHOD_SELECTION.md): NRTL for ethanol + water at 1 atm; Modified UNIFAC 2.0 and the ideal solution
// for glycerol + water; Peng-Robinson for propane + n-butane. The ideal solution is used on purpose where the point is
// the overlay itself (a component compared with its own copy).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as CHEPTA from "../src/index.js";
import { RECORD_UNITS } from "../src/thermo/user-data.js";

const { system, pure, listComponents, findComponent, checkUserData, solveFlowsheet, library, PROPERTIES } = CHEPTA;
const comps = JSON.parse(readFileSync(new URL("../src/data/components.json", import.meta.url))).components;
const src = { name: "test: the databank's own numbers" };
const copy = v => JSON.parse(JSON.stringify(v));
// a databank record in the user-data format (a property record; a vapour pressure as DIPPR101 coefficients)
const asUser = rec => ({ ...copy(rec), source: src });
const vpAsUser = vp => ({ equation: vp.equation, coefficients: { A: vp.A, B: vp.B, C: vp.C, D: vp.D, E: vp.E }, units: "Pa",
  Tmin_K: vp.Tmin_K, Tmax_K: vp.Tmax_K, source: src });

test("the record units of user data are the units pure() stores", () => {
  for (const [name, p] of Object.entries(PROPERTIES)) assert.equal(RECORD_UNITS[name], p.recordUnits, name);
  assert.equal(RECORD_UNITS.vapourPressure, "Pa");
});

test("an overlay repeating the databank's records and parameters gives exactly the databank's results", () => {
  const e = comps.ethanol;
  const nrtl = library.sets("ethanol", "water", "NRTL").find(s => s.default);
  const ud = {
    properties: {
      ethanol: { vapourPressure: vpAsUser(e.vapourPressure),
        ...Object.fromEntries(["liquidHeatCapacity", "heatOfVaporization", "idealGasHeatCapacity", "liquidDensity"].map(k => [k, asUser(e.properties[k])])) },
    },
    pairs: { [`${nrtl.i}+${nrtl.j}`]: { NRTL: copy(nrtl.params), source: src } },
  };
  const a = system({ components: ["water", "ethanol"], model: "NRTL" });
  const b = system({ components: ["water", "ethanol"], model: "NRTL", userData: ud });
  assert.equal(b.info.pairs[0].tier, "user");
  assert.ok(b.info.userData.length >= 5, "the results list the user data used");
  const z = [0.6, 0.4];
  assert.equal(b.bubbleT(z, 101.325).T, a.bubbleT(z, 101.325).T);
  const fa = a.flash({ z, T: 355, P: 101.325 }), fb = b.flash({ z, T: 355, P: 101.325 });
  assert.equal(fb.VF, fa.VF);
  assert.equal(fb.H_J_mol, fa.H_J_mol);
  assert.equal(pure("ethanol", { userData: ud }).property("liquidDensity", 300), pure("ethanol").property("liquidDensity", 300));
});

test("a user record replaces the databank's for that property only, and only where it is passed", () => {
  // lactic acid has no open liquid density; a person's own (here: a made-up linear record)
  const ud = checkUserData({ properties: { "lactic acid": { liquidDensity: {
    equation: "DIPPR100", coefficients: { A: 1450, B: -0.8 }, units: "kg/m3", Tmin_K: 290, Tmax_K: 360,
    source: { name: "own measurement, lab book 12" } } } } });
  assert.throws(() => pure("lactic-acid").property("liquidDensity", 300), /No open data/);
  const p = pure("lactic-acid", { userData: ud });
  assert.equal(p.property("liquidDensity", 300), 1450 - 0.8 * 300);
  assert.equal(p.record("liquidDensity").tier, "user");
  assert.equal(p.record("liquidDensity").source.name, "own measurement, lab book 12");
  assert.equal(p.props(300, 101.325).rho_kg_m3, 1450 - 0.8 * 300);
  // the rest is the databank's
  assert.equal(p.property("liquidHeatCapacity", 300), pure("lactic-acid").property("liquidHeatCapacity", 300));
  // nothing leaked: the databank is unchanged after the calls above
  assert.throws(() => pure("lactic-acid").property("liquidDensity", 300), /No open data/);
  assert.throws(() => p.property("liquidDensity", 400), /outside the range/);
});

test("the user's own component copied from a databank component gives the same phase equilibrium and enthalpies", () => {
  const e = comps.ethanol;
  const ud = { components: { "user:my-ethanol": {
    name: "My ethanol", MW: e.MW, vapourPressure: vpAsUser(e.vapourPressure),
    properties: Object.fromEntries(["liquidHeatCapacity", "heatOfVaporization", "idealGasHeatCapacity"].map(k => [k, asUser(e.properties[k])])),
    source: src } } };
  const a = system({ components: ["water", "ethanol"], model: "ideal" });
  const b = system({ components: ["water", "My ethanol"], model: "ideal", userData: ud });
  assert.deepEqual(b.ids, ["water", "user:my-ethanol"]);
  const z = [0.7, 0.3];
  assert.equal(b.bubbleT(z, 101.325).T, a.bubbleT(z, 101.325).T);
  assert.ok(Math.abs(pure("My ethanol", { userData: ud }).Tb_K - pure("ethanol").Tb_K) < 0.05, "Tb from the vapour-pressure record");
  // the liquid enthalpy follows the same records; ethanol has critical constants and the copy does not, so only the
  // vapour's residual part (Peng-Robinson for ethanol, ideal gas for the copy) can differ: a few J/mol at 1 atm
  const ha = a.flash({ z, T: 330, P: 101.325 }).H_J_mol, hb = b.flash({ z, T: 330, P: 101.325 }).H_J_mol;
  assert.ok(Math.abs(ha - hb) < 30, `liquid enthalpy ${ha} vs ${hb} J/mol`);
  assert.ok(listComponents({ userData: ud }).some(c => c.id === "user:my-ethanol" && c.user && c.activity));
  assert.equal(findComponent("my ethanol", ud), "user:my-ethanol");
  assert.throws(() => findComponent("my ethanol"), /Unknown component/);
});

test("a nonvolatile component of the user's own in water: a flowsheet with its molar mass and energy balance", () => {
  const ud = { components: { "user:pla-oligomer": {
    name: "PLA oligomer", MW: 306.27, class: "nonvolatile", why: "an oligomer, it does not evaporate",
    properties: { liquidHeatCapacity: { equation: "DIPPR100", coefficients: { A: 400, B: 0.5 }, units: "J/mol/K", Tmin_K: 280, Tmax_K: 450, source: { name: "own estimate" } } },
    source: { name: "own estimate" } } } };
  const sys = system({ components: ["water", "user:pla-oligomer"], model: "ideal", userData: ud });
  const Tw = pure("water").Tb_K;
  assert.ok(sys.bubbleT([0.9, 0.1], 101.325).T > Tw);
  const r = solveFlowsheet(sys, {
    blocks: [
      { id: "F1", type: "feed", spec: { flow_kmol_h: { water: 90, "PLA oligomer": 10 }, T_K: 298.15, P_kPa: 101.325 } },
      { id: "E1", type: "heater", spec: { P_kPa: 101.325, T_K: 360 } },
      { id: "V1", type: "flash", spec: { P_kPa: 101.325, VF: 0.5 } },
      { id: "P1", type: "product" }, { id: "P2", type: "product" },
    ],
    streams: [
      { id: "S1", from: "F1.out", to: "E1.in" }, { id: "S2", from: "E1.out", to: "V1.in" },
      { id: "S3", from: "V1.vapour", to: "P1.in" }, { id: "S4", from: "V1.liquid", to: "P2.in" },
    ],
  });
  const S = r.streams;
  assert.ok(Math.abs(S.S1.mass_kg_h - (90 * pure("water").MW + 10 * 306.27)) < 1e-9);
  assert.ok(Math.abs(S.S4.mass_kg_h + S.S3.mass_kg_h - S.S1.mass_kg_h) < 1e-6, "mass balance with the user's molar mass");
  assert.ok(S.S3.flow_kmol_h["user:pla-oligomer"] < 1e-12, "it stays in the liquid");
  assert.ok(Math.abs(r.blocks.E1.duty_kW - (S.S2.H_kW - S.S1.H_kW)) < 1e-6);
  // the stream's own oligomer enthalpy is the integral of the user's cp from 298.15 K: (S2 - S1) per kmol of it includes
  // 400 (360 - 298.15) + 0.25 (360^2 - 298.15^2) J/mol; checked through pure()
  const p = pure("user:pla-oligomer", { userData: ud });
  assert.ok(Math.abs(p.props(360, 101.325).h_J_mol - (400 * (360 - 298.15) + 0.25 * (360 ** 2 - 298.15 ** 2))) < 1e-6);
});

test("user pair parameters are that pair's default; the databank's set can still be chosen by name", () => {
  const nrtl = library.sets("ethanol", "water", "NRTL").find(s => s.default);
  const ud = { pairs: { "ethanol+water": { NRTL: { b_ij: 100, b_ji: 200, alpha: 0.3 }, source: { name: "fit to our data" } } } };
  const s = system({ components: ["ethanol", "water"], model: "NRTL", userData: ud });
  assert.equal(s.info.pairs[0].tier, "user");
  assert.equal(s.info.pairs[0].source, "Your own data: fit to our data");
  assert.ok(s.info.pairs[0].alternatives.some(a => a.set === nrtl.set));
  const back = system({ components: ["ethanol", "water"], model: "NRTL", userData: ud, sets: { "ethanol+water": nrtl.set } });
  const plain = system({ components: ["ethanol", "water"], model: "NRTL" });
  assert.equal(back.bubbleT([0.3, 0.7], 101.325).T, plain.bubbleT([0.3, 0.7], 101.325).T);
  assert.notEqual(s.bubbleT([0.3, 0.7], 101.325).T, plain.bubbleT([0.3, 0.7], 101.325).T);
  // the page's library is unchanged
  assert.ok(!library.sets("ethanol", "water", "NRTL").some(x => x.tier === "user"));
});

test("Modified UNIFAC 2.0 groups of the user's own: the databank's own groups give identical results; a component without groups gets them", () => {
  const ud = { groups: { glycerol: { subgroups: copy(comps.glycerol.modUnifac.groups), source: { name: "the databank's groups" } } } };
  const a = system({ components: ["water", "glycerol"], model: "MOD-UNIFAC-2" });
  const b = system({ components: ["water", "glycerol"], model: "MOD-UNIFAC-2", userData: ud });
  assert.deepEqual(b.gammas([0.7, 0.3], 350), a.gammas([0.7, 0.3], 350));
  assert.ok(b.info.userData.some(u => u.what === "Modified UNIFAC 2.0 groups"));
  // maleic anhydride has no groups (the method cannot describe the anhydride): refused, then usable with the user's own
  // (made-up groups: the point is the path, not the chemistry; since step 5 they must pass the atom balance against
  // C4H2O3, so AC + CH2CO + COO, and the earlier unbalanced choice is refused)
  assert.throws(() => system({ components: ["water", "maleic-anhydride"], model: "MOD-UNIFAC-2" }), /no Modified UNIFAC 2\.0 groups/);
  assert.throws(() => checkUserData({ groups: { "maleic anhydride": { subgroups: { 6: 1, 22: 1 }, source: { name: "my assignment" } } } }), /atom balance does not close/);
  const m = system({ components: ["water", "maleic-anhydride"], model: "MOD-UNIFAC-2",
    userData: { groups: { "maleic anhydride": { subgroups: { 10: 1, 19: 1, 77: 1 }, source: { name: "my assignment" } } } } });
  assert.ok(m.gammas([0.5, 0.5], 330).every(g => g > 0));
});

test("an equation-of-state system with the user's own component copied from propane gives propane's results", () => {
  const p = comps.propane;
  const ud = { components: { "user:my-propane": { name: "My propane", MW: p.MW, Tc_K: p.Tc_K, Pc_Pa: p.Pc_Pa, omega: p.omega,
    vapourPressure: vpAsUser(p.vapourPressure),
    properties: { idealGasHeatCapacity: asUser(p.properties.idealGasHeatCapacity) }, source: src } } };
  const a = system({ components: ["propane", "n-butane"], model: "PR" });
  // the databank k_ij of propane + n-butane is not the user's component's: give the same k_ij as a user pair
  const kij = a.kij[0][1];
  const b = system({ components: ["My propane", "n-butane"], model: "PR",
    userData: { ...ud, pairs: { "My propane+n-butane": { PR: { kij }, source: src } } } });
  assert.equal(b.bubbleP([0.4, 0.6], 300).P, a.bubbleP([0.4, 0.6], 300).P);
});

test("wrong user data is refused with a message that names the problem", () => {
  const rec = { equation: "DIPPR100", coefficients: { A: 1000 }, units: "kg/m3", Tmin_K: 280, Tmax_K: 350, source: { name: "x" } };
  const cases = [
    [{ properties: { "lactic-acid": { liquidDensity: { ...rec, units: "g/cm3" } } } }, /give it in kg\/m3/],
    [{ properties: { "lactic-acid": { liquidDensity: { ...rec, source: undefined } } } }, /needs a source/],
    [{ properties: { "lactic-acid": { liquidDensity: { ...rec, Tmin_K: 400 } } } }, /Tmin_K < Tmax_K/],
    [{ properties: { "lactic-acid": { density: rec } } }, /unknown property "density"/],
    [{ properties: { "lactic-acid": { vapourPressure: { ...rec, units: "Pa" } } } }, /nonvolatile in CHEPTA/],
    [{ properties: { water: { liquidDensity: rec } } }, /IAPWS-IF97/],
    [{ properties: { "no such thing": { liquidDensity: rec } } }, /Unknown component/],
    [{ components: { "my-thing": { name: "Thing", MW: 100, class: "nonvolatile", source: { name: "x" } } } }, /must start with "user:"/],
    [{ components: { "user:x": { name: "Ethanol", MW: 46, class: "nonvolatile", source: { name: "x" } } } }, /already the name of a databank component/],
    [{ components: { "user:x": { name: "Thing", MW: 100, source: { name: "x" } } } }, /needs a vapour-pressure record/],
    [{ components: { "user:x": { name: "Thing", MW: 100, Tc_K: 500, source: { name: "x" }, class: "nonvolatile" } } }, /Tc_K, Pc_Pa and omega together/],
    [{ groups: { glycerol: { subgroups: { 9999: 1 }, source: { name: "x" } } } }, /not a Modified UNIFAC 2\.0 subgroup/],
    [{ groups: { glycerol: { subgroups: { 2: 1.5 }, source: { name: "x" } } } }, /whole number/],
    [{ pairs: { "ethanol+water": { NRTL: { b_ij: 1 }, source: { name: "x" } } } }, /needs b_ij and b_ji/],
    [{ pairs: { "ethanol+water": { NRTL: { b_ij: 1, b_ji: 1, alpha: 2 }, source: { name: "x" } } } }, /alpha must be between 0 and 1/],
    [{ pairs: { ethanol: { NRTL: { b_ij: 1, b_ji: 1 }, source: { name: "x" } } } }, /component\+component/],
    [{ somethingElse: {} }, /unknown key "somethingElse"/],
  ];
  for (const [ud, re] of cases) assert.throws(() => checkUserData(ud), e => e.code === "BAD_INPUT" && re.test(e.message), `${JSON.stringify(ud)} -> ${re}`);
});
