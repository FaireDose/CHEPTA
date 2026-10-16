// The user's own data in files (proposal 0012, step 2): project format 3 with "user_data", the separate My data file,
// merging with the choice on conflicts, and the contribution-package draft. The checks:
//  - a project with user data saves as format 3 and opens with the same data and the same results; without user data
//    it stays format 2, and formats 1 and 2 still open;
//  - a My data file saves and opens unchanged, also from a project file;
//  - merging takes new entries, keeps equal ones once, and keeps the project's entry on a conflict unless the person
//    chooses the incoming one;
//  - the package draft has the person's numbers and lists what is missing before it can be submitted.
// Methods (docs/METHOD_SELECTION.md): the ideal solution with a nonvolatile solute in water, where the point is the
// files (the same data must give the same numbers), not the model.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CHEPTA from "../src/index.js";
import { initialState, applyPatch, userOverlay } from "../src/ui/app-logic.js";
import { projectOf, projectText, readProject, stateFromProject, checkProject } from "../src/ui/project.js";
import { userDataDoc, userDataText, userDataFileName, readUserDataFile, mergeUserData, userDataPackage, userDataKeys } from "../src/ui/user-data-file.js";

const { runFlowsheet, checkUserData } = CHEPTA;
const src = name => ({ name });
// made-up records: the tests check the files, not the numbers
const density = (A, name = "own measurement, lab book 12") => ({
  equation: "DIPPR100", coefficients: { A, B: -0.8 }, units: "kg/m3", Tmin_K: 290, Tmax_K: 360, points: [[290, A - 232], [360, A - 288]], source: src(name) });
const oligomer = cp => ({ name: "PLA oligomer", MW: 306.27, class: "nonvolatile",
  properties: { liquidHeatCapacity: { equation: "DIPPR100", coefficients: { A: cp }, units: "J/mol/K", Tmin_K: 280, Tmax_K: 420, source: src("own estimate") } },
  source: src("own estimate") });
const mine = () => ({
  properties: { "lactic acid": { liquidDensity: density(1450) } },
  components: { "user:pla-oligomer": oligomer(600) },
});
const flowsheet = {
  components: ["water", "user:pla-oligomer"], thermo: { model: "ideal" },
  blocks: [
    { id: "F1", type: "feed", spec: { flow_kmol_h: { water: 9, "user:pla-oligomer": 1 }, T_K: 300, P_kPa: 101.325 } },
    { id: "H1", type: "heater", spec: { T_K: 350 } },
    { id: "P1", type: "product" },
  ],
  streams: [{ id: "S1", from: "F1.out", to: "H1.in" }, { id: "S2", from: "H1.out", to: "P1.in" }],
};

test("a project with user data saves as format 3 and opens with the same data and results", () => {
  let s = initialState({ components: ["water", "lactic-acid"], userData: mine() });
  s = applyPatch(s, { flowsheet });
  const doc = projectOf(s, { version: "9.9.9" });
  assert.equal(doc.fugacity_project, 3);
  assert.deepEqual(doc.user_data, JSON.parse(JSON.stringify(s.userData)));
  const back = stateFromProject(projectText(doc));
  assert.deepEqual(back.userData, s.userData);
  assert.deepEqual(back.flowsheet, s.flowsheet);
  // the project calculates the same from the file alone
  const a = runFlowsheet(s.flowsheet, userOverlay(s)), b = runFlowsheet(readProject(projectText(doc)));
  assert.equal(b.blocks.H1.duty_kW, a.blocks.H1.duty_kW);
  assert.ok(Math.abs(a.blocks.H1.duty_kW - (a.streams.S2.H_kW - a.streams.S1.H_kW)) < 1e-9);
  assert.deepEqual(checkProject(doc).problems, []);
  // without the user data the flowsheet cannot be read: the project and its numbers stay together
  assert.throws(() => runFlowsheet(s.flowsheet), /Unknown component "user:pla-oligomer"/);
  // removing the data writes format 2 again
  const none = applyPatch(s, { userData: null, flowsheet: { components: [], blocks: [], streams: [] } });
  assert.equal(none.userData, null);
  assert.equal(projectOf(none).fugacity_project, 2);
  assert.ok(!("user_data" in projectOf(none)));
  // a component the flowsheet uses cannot be taken away from the data (step 3: the My data panel removes entries)
  assert.throws(() => applyPatch(s, { userData: { properties: {}, pairs: {} } }), /The flowsheet uses user:pla-oligomer/);
  // empty parts are not kept
  assert.equal(applyPatch(none, { userData: { properties: {}, pairs: {} } }).userData, null);
});

test("older formats open; wrong user data in a project is refused with the reason", () => {
  const s = initialState({ components: ["ethanol", "water"] });
  const v2 = projectOf(s);
  assert.equal(v2.fugacity_project, 2);
  const v1 = { ...v2, fugacity_project: 1 };
  for (const doc of [v1, v2]) assert.equal(stateFromProject(doc).userData, null);
  const bad = [
    [{ ...v2, fugacity_project: 2, user_data: mine() }, /user_data needs format 3/],
    [{ ...v2, fugacity_project: 3, user_data: { propertie: {} } }, /user data: unknown key "propertie"/],
    [{ ...v2, fugacity_project: 3, user_data: { properties: { "lactic acid": { liquidDensity: { ...density(1450), units: "g/cm3" } } } } }, /give it in kg\/m3/],
    [{ ...v2, fugacity_project: 3, user_data: { components: { "user:x": { ...oligomer(600), source: undefined } } } }, /needs a source/],
  ];
  for (const [doc, re] of bad) {
    assert.throws(() => readProject(doc), re);
    assert.match(checkProject(doc).problems[0], re);
  }
});

test("a My data file saves and opens unchanged, also from a project", () => {
  const doc = userDataDoc(mine(), { title: "Our lab data", version: "9.9.9", now: new Date("2026-10-16T12:00:00Z") });
  assert.equal(doc.chepta_user_data, 1);
  assert.equal(doc.saved_at, "2026-10-16T12:00:00.000Z");
  const back = readUserDataFile("﻿" + userDataText(doc));
  assert.equal(back.title, "Our lab data");
  assert.deepEqual(back.user_data, mine());
  assert.equal(userDataFileName("Our lab data"), "Our lab data.chepta-data.json");
  assert.equal(userDataFileName("a/b: c?"), "a-b- c.chepta-data.json");
  assert.equal(userDataFileName(""), "my-data.chepta-data.json");
  // a project's own data opens as a library
  const p = projectOf(initialState({ components: ["water"], userData: mine() }));
  assert.deepEqual(readUserDataFile(projectText(p)).user_data, mine());
  const bad = [
    ["{", /not valid JSON/],
    [JSON.stringify({ user_data: {} }), /"chepta_user_data" key is missing/],
    [JSON.stringify({ chepta_user_data: 2, user_data: {} }), /format 2.*reads format 1/],
    [JSON.stringify({ chepta_user_data: 1 }), /no "user_data"/],
    [JSON.stringify({ fugacity_package: 1 }), /contribution package/],
    [projectText(projectOf(initialState({ components: ["water"] }))), /holds no data of your own/],
    [JSON.stringify({ chepta_user_data: 1, user_data: { properties: { water: { liquidDensity: density(1000) } } } }), /IAPWS-IF97/],
  ];
  for (const [text, re] of bad) assert.throws(() => readUserDataFile(text), re, text.slice(0, 60));
  assert.throws(() => userDataDoc({ groups: { fdca: { subgroups: { 9999: 1 }, source: src("x") } } }), /not a Modified UNIFAC 2.0 subgroup id/);
});

test("merging takes new entries, keeps equal ones once, and asks on a conflict", () => {
  const current = mine();
  const incoming = {
    // the same record under another name of the component: equal, kept once
    properties: { "lactic-acid": { liquidDensity: density(1450), surfaceTension: {
      equation: "DIPPR100", coefficients: { A: 0.07, B: -1e-4 }, units: "N/m", Tmin_K: 290, Tmax_K: 360, source: src("supplier data sheet") } } },
    // the same component with other numbers: a conflict
    components: { "user:pla-oligomer": oligomer(650) },
    pairs: { "water+lactic acid": { NRTL: { b_ij: 100, b_ji: -50 }, source: src("fit to our pilot data") } },
  };
  const r = mergeUserData(current, incoming);
  assert.deepEqual(r.added.sort(), ["pairs.lactic-acid+water", "properties.lactic-acid.surfaceTension"]);
  assert.deepEqual(r.same, ["properties.lactic-acid.liquidDensity"]);
  assert.equal(r.conflicts.length, 1);
  const c = r.conflicts[0];
  assert.equal(c.key, "components.user:pla-oligomer");
  assert.equal(c.kept, "current");
  assert.match(c.what, /PLA oligomer/);
  assert.equal(c.current.properties.liquidHeatCapacity.coefficients.A, 600);
  assert.equal(c.incoming.properties.liquidHeatCapacity.coefficients.A, 650);
  // nothing replaced silently: the project's numbers are kept until the person chooses
  assert.equal(r.userData.components["user:pla-oligomer"].properties.liquidHeatCapacity.coefficients.A, 600);
  const chosen = mergeUserData(current, incoming, { "components.user:pla-oligomer": "incoming" });
  assert.equal(chosen.userData.components["user:pla-oligomer"].properties.liquidHeatCapacity.coefficients.A, 650);
  assert.equal(chosen.conflicts[0].kept, "incoming");
  // the result is checked user data, keyed by component id, and works in a system
  const ud = checkUserData(chosen.userData);
  assert.deepEqual(Object.keys(chosen.userData.properties), ["lactic-acid"]);
  assert.equal(CHEPTA.system({ components: ["water", "lactic acid"], model: "NRTL", userData: ud }).info.pairs[0].tier, "user");
  // merging the result again changes nothing
  const again = mergeUserData(chosen.userData, incoming, { "components.user:pla-oligomer": "incoming" });
  assert.deepEqual(again.userData, chosen.userData);
  assert.deepEqual(again.added, []);
  // into an empty project, and nothing into nothing
  assert.deepEqual(mergeUserData(null, current).userData, mergeUserData(current, null).userData);
  assert.equal(mergeUserData(null, null).userData, null);
  // two components with the same name under different ids: refused, naming it
  assert.throws(() => mergeUserData(current, { components: { "user:other": oligomer(600) } }), /"pla oligomer" is also the name of user:pla-oligomer/);
  assert.throws(() => mergeUserData(current, incoming, { x: "both" }), /must be "current" or "incoming"/);
  assert.deepEqual(userDataKeys(current).sort(), ["components.user:pla-oligomer", "properties.lactic-acid.liquidDensity"]);
});

test("a contribution-package draft has the person's numbers and lists what is missing", () => {
  const full = {
    properties: { "lactic acid": { liquidDensity: { ...density(1450), source: {
      name: "own measurement", citation: "A. Author, Open J. Chem. Data 1 (2026) 1", open_copy: "https://example.org/paper", access: "CC BY 4.0", tables: "Table 2" } } } },
  };
  const ok = userDataPackage(full, "properties.lactic-acid.liquidDensity");
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.package.type, "component");
  assert.deepEqual(ok.package.components, [{ name: "Lactic acid", cas: "50-21-5" }]);
  assert.equal(ok.package.component_entry.properties.liquidDensity.coefficients.A, 1450);
  assert.ok(!("tier" in ok.package.component_entry.properties.liquidDensity), "the reviewer gives the tier");
  assert.deepEqual(CHEPTA.checkPackage(ok.package).errors, []);

  // a source line alone: the open copy and the access are missing
  const draft = userDataPackage(mine(), "properties.lactic-acid.liquidDensity");
  assert.equal(draft.package.source.citation, "own measurement, lab book 12");
  assert.ok(draft.problems.some(p => /open_copy/.test(p)) && draft.problems.some(p => /access/.test(p)), draft.problems.join(" | "));
  // the user's own component: its entry, and its CAS number is missing
  const comp = userDataPackage(mine(), "components.user:pla-oligomer");
  assert.equal(comp.package.component_entry.id, "pla-oligomer");
  assert.equal(comp.package.component_entry.class, "nonvolatile");
  assert.ok(comp.problems.some(p => /CAS number/.test(p)));
  // vapour-pressure points become a data block in kPa
  // (123-45-5: a well-formed CAS number that no databank component has; one that a databank component has is refused)
  assert.throws(() => checkUserData({ components: { "user:x": { name: "X", MW: 100, class: "nonvolatile", cas: "50-21-5", source: src("own") } } }), /50-21-5 is the CAS number of Lactic acid/);
  const vp = { components: { "user:x": { name: "X", MW: 100, cas: "123-45-5",
    vapourPressure: { equation: "DIPPR101", coefficients: { A: 20, B: -5000 }, units: "Pa", Tmin_K: 300, Tmax_K: 400, points: [[300, 3000], [350, 30000]], source: src("own") },
    source: src("own") } } };
  const d = userDataPackage(vp, "components.user:x").package.data[0];
  assert.deepEqual([d.kind, d.columns, d.rows], ["pure-vapour-pressure", ["T_K", "Psat_kPa"], [[300, 3], [350, 30]]]);
  // pair parameters: the measured mixture data are asked for instead (AGENTS.md rule 5)
  const pair = userDataPackage({ pairs: { "water+ethanol": { NRTL: { b_ij: 1, b_ji: 2 }, source: src("own fit") } } }, "pairs.ethanol+water");
  assert.equal(pair.package.type, "pair-data");
  assert.ok(pair.problems.some(p => /AGENTS\.md rule 5/.test(p)));
  assert.throws(() => userDataPackage(mine(), "groups.fdca"), /no entry "groups.fdca"/);
});
