// Pair parameters and Modified UNIFAC 2.0 groups of one's own, side by side with the databank's (proposal 0012, step 5;
// src/ui/pairs-groups-logic.js, src/thermo/formula.js). The checks:
//  - the databank's sets are shown in the order the person chose (i, j), the same numbers the systems use;
//  - a databank set entered as one's own gives the same results, in either order (the proposal's test for pairs);
//  - the database's groups entered as one's own give identical activity coefficients, for every component with groups
//    (the proposal's test for groups), and groups must pass the atom balance (one H over allowed);
//  - the tables of subgroups and main-group interactions are the parameter file's.
// Methods (docs/METHOD_SELECTION.md): NRTL and UNIQUAC for ethanol + water at 1 atm; Modified UNIFAC 2.0 for the groups.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, checkUserData } from "../src/index.js";
import { pairColumns, pairEntry, withPairValues, groupColumns, groupRows, mainGroupInteractions, searchSubgroups } from "../src/ui/pairs-groups-logic.js";
import { parseFormula, atomBalance } from "../src/thermo/formula.js";
import { library } from "../src/thermo/library.js";

const comps = JSON.parse(readFileSync(new URL("../src/data/components.json", import.meta.url))).components;
const tables = JSON.parse(readFileSync(new URL("../src/data/mod-unifac-2.json", import.meta.url)));
const src = "test: the databank's own numbers";

test("the databank's sets are shown in the chosen order, with the numbers the systems use", () => {
  for (const [a, b] of [["ethanol", "water"], ["water", "ethanol"]]) {
    const cols = pairColumns(a, b, "NRTL");
    const sets = library.sets(a, b, "NRTL");
    assert.equal(cols.databank.length, sets.length);
    for (const d of cols.databank) {
      const s = sets.find(x => x.set === d.set);
      const same = s.i === a;
      assert.equal(d.values.b_ij, same ? s.params.b_ij : s.params.b_ji, `${a}+${b} ${d.set} b_ij`);
      assert.equal(d.values.a_ji, same ? s.params.a_ji : s.params.a_ij, `${a}+${b} ${d.set} a_ji`);
    }
  }
  assert.equal(pairColumns("ethanol", "water", "PR").databank[0].values.kij, library.sets("ethanol", "water", "PR")[0].params.kij);
  assert.equal(pairColumns("ethanol", "water", "NRTL").mine, null);
});

test("a databank set entered as one's own gives the same results, in either order", () => {
  const P = 101.325, x = [0.3, 0.7];
  for (const model of ["NRTL", "UNIQUAC"]) {
    for (const [a, b] of [["ethanol", "water"], ["water", "ethanol"]]) {
      const d = pairColumns(a, b, model).databank.find(s => s.default);
      const typed = Object.fromEntries(Object.entries(d.values).map(([k, v]) => [k, String(v)]));
      const ud = withPairValues(null, a, b, model, typed, src);
      const bank = system({ components: ["ethanol", "water"], model, sets: { "ethanol+water": d.set } });
      const mine = system({ components: ["ethanol", "water"], model, userData: ud });
      assert.equal(mine.info.pairs[0].tier, "user");
      assert.equal(mine.bubbleT(x, P).T, bank.bubbleT(x, P).T, `${model} entered as ${a}+${b}`);
      // read back: the column shows what was typed
      assert.deepEqual(pairColumns(a, b, model, ud).mine.values, Object.fromEntries(Object.entries(d.values).map(([k, v]) => [k, v])));
    }
  }
});

test("saving another model into a pair keeps the entry's order and its other models; empty fields are named", () => {
  let ud = withPairValues(null, "water", "ethanol", "NRTL", { b_ij: "600", b_ji: "-30", alpha: "0.3" }, src);
  ud = withPairValues(ud, "ethanol", "water", "UNIQUAC", { b_ij: "10", b_ji: "-200" }, src);
  assert.deepEqual(Object.keys(ud.pairs), ["water+ethanol"]);
  assert.deepEqual(ud.pairs["water+ethanol"].NRTL, { a_ij: 0, a_ji: 0, b_ij: 600, b_ji: -30, alpha: 0.3 });
  assert.deepEqual(ud.pairs["water+ethanol"].UNIQUAC, { a_ij: 0, a_ji: 0, b_ij: -200, b_ji: 10 }, "written in the entry's order (water first)");
  assert.deepEqual(pairColumns("ethanol", "water", "UNIQUAC", ud).mine.values, { a_ij: 0, a_ji: 0, b_ij: 10, b_ji: -200 });
  checkUserData(ud);
  assert.throws(() => pairEntry("ethanol", "water", "NRTL", { b_ij: "1" }, src), /b_ji: give a number/);
  assert.throws(() => pairEntry("ethanol", "water", "NRTL", { b_ij: "x", b_ji: "1" }, src), /b_ij: give a number \(got "x"\)/);
});

test("the database's groups entered as one's own give identical activity coefficients, for every component with groups", () => {
  const ids = Object.keys(comps).filter(id => comps[id].modUnifac?.groups && id !== "water" && comps[id].class !== "solid");
  assert.ok(ids.length > 100);
  for (const id of ids) {
    const cols = groupColumns(id);
    assert.deepEqual(cols.database.groups, comps[id].modUnifac.groups);
    const ud = { groups: { [id]: { subgroups: { ...cols.database.groups }, source: { name: src } } } };
    const a = system({ components: ["water", id], model: "MOD-UNIFAC-2" });
    const b = system({ components: ["water", id], model: "MOD-UNIFAC-2", userData: ud });
    assert.deepEqual(b.gammas([0.6, 0.4], 330), a.gammas([0.6, 0.4], 330), id);
  }
});

test("groups must pass the atom balance; one H over is allowed; formulas with parentheses", () => {
  assert.deepEqual(parseFormula("C6H6O3"), { C: 6, H: 6, O: 3 });
  assert.deepEqual(parseFormula("CH3(CH2)2OH"), { C: 3, H: 8, O: 1 });
  assert.throws(() => parseFormula("C6(H"), /not closed/);
  assert.equal(atomBalance(comps.ethanol.modUnifac.groups, "C2H6O").ok, true);
  const hmf = atomBalance(comps.hmf.modUnifac.groups, comps.hmf.formula);
  assert.equal(hmf.ok, false); assert.equal(hmf.oneHOver, true);
  assert.match(atomBalance({ 1: 2 }, "C2H6O").text, /\+1 H|-1 O/);
  assert.throws(() => checkUserData({ groups: { ethanol: { subgroups: { 1: 2 }, source: { name: "x" } } } }), /atom balance does not close/);
  checkUserData({ groups: { hmf: { subgroups: { ...comps.hmf.modUnifac.groups }, source: { name: "x" } } } });   // one H over: accepted
  // a component of one's own: checked against its formula when it has one
  const own = g => ({ components: { "user:x": { name: "X", MW: 46.07, formula: "C2H6O", class: "nonvolatile", groups: { subgroups: g, source: { name: "x" } }, source: { name: "x" } } } });
  checkUserData(own({ 1: 1, 2: 1, 14: 1 }));
  assert.throws(() => checkUserData(own({ 1: 2 })), /atom balance does not close/);
});

test("the tables shown are the parameter file's", () => {
  const rows = groupRows(comps.ethanol.modUnifac.groups);
  for (const r of rows) assert.deepEqual([r.R, r.Q, r.main], [tables.subgroups[r.id].R, tables.subgroups[r.id].Q, tables.subgroups[r.id].main]);
  const inter = mainGroupInteractions({ 1: 1, 2: 1, 14: 1 });
  assert.equal(inter.length, 1);
  const i = tables.main.indexOf(1), j = tables.main.indexOf(5);
  assert.deepEqual([inter[0].a_nm, inter[0].b_nm, inter[0].a_mn, inter[0].b_mn], [tables.a[i][j], tables.b[i][j], tables.a[j][i], tables.b[j][i]]);
  assert.ok(searchSubgroups("OH").some(s => s.name === "OH (P)"));
  assert.equal(searchSubgroups("").length, Object.keys(tables.subgroups).length);
  assert.equal(groupColumns("maleic-anhydride").database.groups, null, "the method cannot describe the anhydride");
});
