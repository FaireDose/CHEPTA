// The user's own data in the workbench (proposal 0012, step 3): the My data panel saves through applyPatch({ userData }),
// and every view takes the data from the state. The checks (the panel's DOM was checked in a browser; the repository has
// no DOM tests):
//  - a component of the user's own can be chosen in the inputs of a view, and the systems of the views get the data;
//  - removing it takes it out of the inputs (and is refused while a flowsheet uses it);
//  - the entries can be put, listed and removed (putUserData, userDataList, removeUserDataEntry);
//  - the Excel export of a flowsheet with a component of the user's own.
// Methods (docs/METHOD_SELECTION.md): the ideal solution with a nonvolatile solute in water, where the point is the
// plumbing (the same data must reach every calculation), not the model. The numbers of the user data are made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initialState, applyPatch, userOverlay, setsFor, pxyTemperature } from "../src/ui/app-logic.js";
import { checkInputs } from "../src/ui/workspaces.js";
import { putUserData, removeUserDataEntry, userDataList } from "../src/ui/user-data-file.js";
import { flowsheetSheets } from "../src/ui/flowsheet-excel.js";
import { system, runFlowsheet, pure } from "../src/index.js";

const src = { name: "test: made-up numbers" };
const oligomer = { name: "PLA oligomer", MW: 306.27, class: "nonvolatile",
  properties: { liquidHeatCapacity: { equation: "DIPPR100", coefficients: { A: 600 }, units: "J/mol/K", Tmin_K: 280, Tmax_K: 420, source: src } }, source: src };
// a volatile one: a copy of ethanol's vapour pressure and heat capacities under another name
const ethanol = pure("ethanol");
const vp = JSON.parse(readFileSync(new URL("../src/data/components.json", import.meta.url))).components.ethanol.vapourPressure;
const myEthanol = { name: "My solvent", MW: ethanol.MW, source: src,
  vapourPressure: { equation: "DIPPR101", coefficients: { A: vp.A, B: vp.B, C: vp.C, D: vp.D, E: vp.E }, units: "Pa", Tmin_K: vp.Tmin_K, Tmax_K: vp.Tmax_K, source: src },
  properties: Object.fromEntries(["liquidHeatCapacity", "heatOfVaporization", "idealGasHeatCapacity"].map(k => [k, { ...JSON.parse(JSON.stringify(ethanol.record(k))), source: src }])) };

test("a component of the user's own is chosen like any other, and the views' systems get the data", () => {
  let s = initialState({ components: ["water", "ethanol"], model: "ideal" });
  assert.equal(setsFor(s, "ideal").userData, undefined, "no user data: the systems are the databank's");
  s = applyPatch(s, { userData: { components: { "user:pla-oligomer": oligomer, "user:my-solvent": myEthanol } } });
  s = applyPatch(s, { workspace: "flash", inputs: { flash: ["water", "PLA oligomer"] }, flash: { spec: "TP", T_K: 360, P_kPa: 101.325 } });
  assert.deepEqual(s.inputs.flash, ["water", "user:pla-oligomer"]);
  assert.ok(checkInputs("flash", s.inputs.flash, s.model, userOverlay(s)).ok);
  assert.deepEqual(s.components, ["water", "user:pla-oligomer"]);
  const opts = setsFor(s, s.model);
  assert.equal(opts.userData, userOverlay(s));
  // above water's boiling point: part of the water evaporates, the oligomer stays in the liquid
  const f = system({ components: s.components, model: s.model, ...opts }).flash({ z: [0.9, 0.1], T: 380, P: 101.325 });
  assert.ok(f.VF > 0 && f.VF < 0.9, `VF ${f.VF}`);
  // the T-x-y inputs take the volatile one, and the P-x-y temperature comes from its vapour-pressure record
  s = applyPatch(s, { view: "txy", inputs: { txy: ["water", "My solvent"] } });
  assert.deepEqual(s.components, ["water", "user:my-solvent"]);
  const b = system({ components: s.components, model: "ideal", ...setsFor(s, "ideal") }).bubbleT([0.5, 0.5], 101.325).T;
  assert.equal(b, system({ components: ["water", "ethanol"], model: "ideal" }).bubbleT([0.5, 0.5], 101.325).T, "a copy of ethanol boils like ethanol");
  s = applyPatch(s, { view: "pxy", inputs: { pxy: ["water", "My solvent"] } });
  assert.ok(pxyTemperature(s) > 273 && pxyTemperature(s) < 400);
  // without the data the component is unknown: it never leaks into another workbench
  assert.throws(() => applyPatch(initialState({ components: ["water"] }), { inputs: { flash: ["water", "PLA oligomer"] } }), /Unknown component "PLA oligomer"/);
});

test("removing the user's component takes it out of the inputs; refused while the flowsheet uses it", () => {
  let s = initialState({ components: ["water"], model: "ideal", userData: { components: { "user:pla-oligomer": oligomer } } });
  s = applyPatch(s, { inputs: { flash: ["water", "user:pla-oligomer"], properties: ["user:pla-oligomer"] } });
  const gone = applyPatch(s, { userData: null });
  assert.deepEqual(gone.inputs.flash, ["water"]);
  assert.deepEqual(gone.inputs.properties, [null]);
  const fs = { components: ["water", "user:pla-oligomer"], thermo: { model: "ideal" }, blocks: [], streams: [] };
  const withFs = applyPatch(s, { flowsheet: fs });
  assert.throws(() => applyPatch(withFs, { userData: null }), /The flowsheet uses user:pla-oligomer; take it out of the flowsheet/);
});

test("entries are put (replacing the same entry), listed and removed", () => {
  const rec = A => ({ equation: "DIPPR100", coefficients: { A, B: -0.8 }, units: "kg/m3", Tmin_K: 290, Tmax_K: 360, source: src });
  let ud = putUserData(null, { properties: { "lactic acid": { liquidDensity: rec(1450) } } });
  ud = putUserData(ud, { properties: { "lactic-acid": { liquidDensity: rec(1460) } }, components: { "user:pla-oligomer": oligomer } });
  assert.equal(ud.properties["lactic-acid"].liquidDensity.coefficients.A, 1460, "saved again: replaced");
  const list = userDataList(ud);
  assert.deepEqual(list.map(e => e.key).sort(), ["components.user:pla-oligomer", "properties.lactic-acid.liquidDensity"]);
  assert.equal(list.find(e => e.part === "components").source, src.name);
  ud = removeUserDataEntry(ud, "properties.lactic-acid.liquidDensity");
  assert.deepEqual(Object.keys(ud), ["components"]);
  assert.equal(removeUserDataEntry(ud, "components.user:pla-oligomer"), null);
  assert.throws(() => removeUserDataEntry(ud, "groups.fdca"), /no entry "groups.fdca"/);
  // a pair that names the user's component keeps it from being removed alone
  const withPair = putUserData(ud, { pairs: { "water+PLA oligomer": { NRTL: { b_ij: 100, b_ji: 50 }, source: src } } });
  assert.throws(() => removeUserDataEntry(withPair, "components.user:pla-oligomer"), /Unknown component/);
});

test("the Excel export of a flowsheet with a component of the user's own", () => {
  const ud = { components: { "user:pla-oligomer": oligomer } };
  const s = initialState({ userData: ud });
  const fs = {
    components: ["water", "user:pla-oligomer"], thermo: { model: "ideal" },
    blocks: [
      { id: "F1", type: "feed", spec: { flow_kmol_h: { water: 9, "user:pla-oligomer": 1 }, T_K: 300, P_kPa: 101.325 } },
      { id: "V1", type: "flash", spec: { P_kPa: 101.325, VF: 0.5 } },
      { id: "X1", type: "separator", spec: { fractions: { water: [1, "rest"], "PLA oligomer": [0, "rest"] } } },
      { id: "P1", type: "product" }, { id: "P2", type: "product" }, { id: "P3", type: "product" },
    ],
    streams: [{ id: "S1", from: "F1.out", to: "V1.in" }, { id: "S2", from: "V1.vapour", to: "P1.in" }, { id: "S3", from: "V1.liquid", to: "X1.in" },
      { id: "S4", from: "X1.out", to: "P2.in" }, { id: "S5", from: "X1.out", to: "P3.in" }],
  };
  const res = runFlowsheet(fs, userOverlay(s));
  const { sheets } = flowsheetSheets(fs, res, { concept: true, userData: userOverlay(s) });
  const inputs = sheets.find(x => x.name === "Inputs").rows.flat().map(c => (c && typeof c === "object" ? c.v : c));
  assert.ok(inputs.includes("PLA oligomer") && inputs.includes(306.27), "the component's name and molar mass are in the workbook");
  assert.throws(() => flowsheetSheets(fs, res, { concept: true }), /Unknown component|not in this project's own data/);
});
