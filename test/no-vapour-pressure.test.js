// Liquids without an open vapour pressure (the maintainer, 2026-10-20): the components held in proposal 0009 for want
// of an open liquid vapour pressure are in the databank with a "no open data" marker (vapourPressure_missing). Activity
// coefficients, liquid-liquid and solid-liquid equilibria work without it; what needs a vapour pressure (bubble and
// dew points, flashes, vapour-liquid diagrams) refuses with the sources searched; the user's own vapour pressure (My
// data, proposal 0012) replaces the marker. Group-contribution predictions (SIMPOL.1) were not accepted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, pure, listComponents, checkUserData } from "../src/index.js";
import { atomBalance } from "../src/thermo/formula.js";

const comps = JSON.parse(readFileSync(new URL("../src/data/components.json", import.meta.url))).components;
const NO_VP = ["solketal", "angelica-lactone", "lactide", "isosorbide", "levoglucosan", "dimethyl-fdca", "bhmf",
  "levoglucosenone", "emf"];

test("the components without an open vapour pressure are liquids for the activity models, with the sources searched", () => {
  const listed = listComponents().filter(c => c.noVapourPressure).map(c => c.id).sort();
  assert.deepEqual(listed, [...NO_VP].sort());
  for (const id of NO_VP) {
    const c = comps[id], d = listComponents().find(x => x.id === id);
    assert.equal(c.vapourPressure, undefined, id);
    assert.equal(d.activity, true, `${id}: chosen with the activity models, not as a gas`);
    assert.ok(c.vapourPressure_missing.searched.length >= 4, `${id}: sources searched`);
    assert.match(c.vapourPressure_missing.note, /My data/, id);
    assert.equal(c.Tb_K, null, id);
    assert.equal(c.class, undefined, `${id} is not nonvolatile: that would make every distillation with it wrong`);
  }
  // glycerol carbonate was held too, but the ThermoML Archive has its liquid vapour pressures ("glycerine carbonate")
  assert.equal(comps["glycerol-carbonate"].vapourPressure.tier, "fitted");
});

test("activity coefficients work, and what needs a vapour pressure refuses with the reason", () => {
  const s = system({ components: ["solketal", "water"], model: "MOD-UNIFAC-2" });
  const g = s.gammas([0.3, 0.7], 300);
  assert.ok(g.every(Number.isFinite) && g.every(v => v > 0));
  for (const call of [() => s.bubbleT([0.3, 0.7], 101.325), () => s.flash({ z: [0.3, 0.7], T: 360, P: 101.325 })]) {
    assert.throws(call, /No open data for the vapour pressure of Solketal \(searched: .*\)\. Add your own vapour pressure for it in My data/);
  }
  assert.throws(() => pure("solketal").psat(300), /No open data for the vapour pressure of Solketal/);
  // the liquid's own properties are still given, taken as a liquid, without an enthalpy
  const L = pure("solketal").props(298.15, 101.325);
  assert.equal(L.phase, "liquid");
  assert.ok(Number.isFinite(L.rho_kg_m3));
  assert.equal(L.h_J_mol, null);
});

test("solid-liquid equilibrium needs no vapour pressure (lactide in water, Modified UNIFAC 2.0)", () => {
  const s = system({ components: ["lactide", "water"], model: "MOD-UNIFAC-2" });
  const r = s.solidSolubility("lactide", 330);
  assert.ok(r.xSolute > 0 && r.xSolute < 1, JSON.stringify(r));
});

test("the user's own vapour pressure replaces the marker (here a made-up record, for the test only)", () => {
  const ud = checkUserData({ properties: { solketal: { vapourPressure: {
    equation: "DIPPR101", coefficients: { A: 60, B: -9000, C: -5, D: 0, E: 0 }, units: "Pa", Tmin_K: 280, Tmax_K: 480,
    source: { name: "made-up record for this test" } } } } });
  const p = pure("solketal", { userData: ud });
  const T = 350, expect = Math.exp(60 - 9000 / T - 5 * Math.log(T)) / 1000;
  assert.ok(Math.abs(p.psat(T) / expect - 1) < 1e-12);
  const s = system({ components: ["solketal", "water"], model: "MOD-UNIFAC-2", userData: ud });
  assert.ok(Number.isFinite(s.bubbleT([0.3, 0.7], 101.325).T));
  // the databank is unchanged
  assert.throws(() => pure("solketal").psat(T), /No open data for the vapour pressure/);
});

test("the atom balance allows one H over per ring subgroup, as DDBST counts substituted ring carbons", () => {
  // isosorbide: DDBST's two THF subgroups each count a substituted ring carbon: two H above C6H10O4
  const iso = atomBalance(comps.isosorbide.modUnifac.groups, comps.isosorbide.formula);
  assert.equal(iso.ok, false);
  assert.equal(iso.oneHOver, true);
  assert.match(iso.text, /2 H over/);
  // a third H is not explained by the rings
  assert.equal(atomBalance({ 27: 2, 79: 2, 81: 2, 3: 1 }, "C7H10O4").oneHOver, false);
  // with no ring subgroup, one H over is still allowed (as before), two are not
  assert.equal(atomBalance({ 1: 2 }, "C2H5").oneHOver, true);
  assert.equal(atomBalance({ 1: 2 }, "C2H4").oneHOver, false);
});

test("the user's own melting data make solid solubility work (isosorbide has none open; made-up values, for the test only)", () => {
  assert.throws(() => system({ components: ["isosorbide", "water"], model: "MOD-UNIFAC-2" }).solidSolubility("isosorbide", 320),
    /no melting temperature and enthalpy of fusion .*My data, Add a property, Melting data/);
  const ud = checkUserData({ properties: { isosorbide: { fusion: { Tm_K: 335, Hfus_J_mol: 25000, source: { name: "made-up values for this test" } } } } });
  const r = system({ components: ["isosorbide", "water"], model: "MOD-UNIFAC-2", userData: ud }).solidSolubility("isosorbide", 320);
  assert.ok(r.xSolute > 0 && r.xSolute < 1, JSON.stringify(r));
});
