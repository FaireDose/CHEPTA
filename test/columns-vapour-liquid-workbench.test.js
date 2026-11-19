/**
 * Proposal 0026, step 3: the workbench of the vapour + liquid condenser (condenser "vapour_liquid"; accepted by the
 * maintainer on 2026-11-18, docs/decisions/2026-11-18-05-vapour-liquid-condenser-proposal.md; the engine and API in
 * docs/decisions/2026-11-18-06-vapour-liquid-condenser-build.md). DOM-free, as the other workbench tests:
 *  - choosing the condenser adds the vapour distillate's Product stream, and leaving it removes the stream, the
 *    condenser's own specification and the design specifications written on the vapour distillate (setCondenser);
 *  - the outlets' names on the canvas and in the stream table; the column's Excel sheet with the two distillates and
 *    the two reflux ratios; McCabe-Thiele's diagram refused for two distillates;
 *  - project files: format 11 written only with this condenser, read back and solved; a format-10 file with the
 *    condenser refused, naming the format; older projects read unchanged.
 * The column is CHEPTA-Lab's methanol column (validation/data/columns/lab-requests-0.6.2/u-column-partial-pr.request.json,
 * unchanged; Peng-Robinson as Lab chose it for this CO2 + H2 + CO + methanol + water + N2 column at 100 kPa,
 * docs/METHOD_SELECTION.md rule 2: light gases present), with the paper's condenser at 53 C; its numbers are tested
 * against the independent reference in test/columns-vapour-liquid.test.js (H3), not here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runFlowsheet, flowsheetDocStatus } from "../src/index.js";
import { setCondenser, setSpec, streamsOf, endOf, CONDENSER_SPEC_KEYS } from "../src/ui/flowsheet-logic.js";
import { outletName } from "../src/ui/flowsheet-view.js";
import { columnSheet } from "../src/ui/column-excel.js";
import { flowsheetSheets } from "../src/ui/flowsheet-excel.js";
import { columnBinary } from "../src/ui/column-mccabe.js";
import { leaveVapourLiquid, columnExample } from "../src/ui/column-workspace.js";
import { projectOf, readProject, stateFromProject, PROJECT_FORMAT } from "../src/ui/project.js";
import { initialState } from "../src/ui/app-logic.js";

/** Lab's flowsheet, with positions for the canvas, as the workbench holds it (partial condenser, R = 2, B = 4581). */
function labFlowsheet() {
  const req = JSON.parse(readFileSync(new URL("../validation/data/columns/lab-requests-0.6.2/u-column-partial-pr.request.json", import.meta.url)));
  const fs = req.input.flowsheet;
  fs.blocks.forEach((b, k) => Object.assign(b, { x: 100 + 150 * k, y: 100 }));
  return fs;
}
const col = fs => fs.blocks.find(b => b.id === "COLUMN").spec;

test("choosing \"Vapour + liquid\" adds the vapour distillate's product; leaving it removes the stream, the condenser's specification and the design specifications on it", () => {
  const fs0 = labFlowsheet();
  let fs = setCondenser(fs0, "COLUMN", "vapour_liquid");
  assert.equal(col(fs).condenser, "vapour_liquid");
  const vs = streamsOf(fs, "COLUMN").vapour_distillate;
  assert.equal(vs.length, 1);
  assert.equal(endOf(fs, vs[0]).kind, "product");
  // the condenser's own specification is still to give: the column says so
  const st = flowsheetDocStatus(fs);
  assert.deepEqual(st.structure, [], "no connection problems");
  assert.match(JSON.stringify(st.blocks.COLUMN), /the condenser's specification/);
  // choosing it again does not add a second stream
  assert.equal(streamsOf(setCondenser(fs, "COLUMN", "vapour_liquid"), "COLUMN").vapour_distillate.length, 1);
  // given, with a design specification on the vapour distillate in place of the bottoms flow
  fs = setSpec(fs, "COLUMN", { condenser_T_K: 326.15, bottoms_kmol_h: null, specifications: [{ kind: "purity", product: "vapour_distillate", component: "carbon-dioxide", value: 0.4 }] });
  assert.ok(flowsheetDocStatus(fs).ready);
  // back to the partial condenser: the stream and its product go, with the temperature and the design specification
  for (const to of ["total", "partial"]) {
    const back = setCondenser(fs, "COLUMN", to);
    assert.equal(streamsOf(back, "COLUMN").vapour_distillate, undefined);
    assert.equal(back.blocks.length, fs0.blocks.length);
    assert.equal(col(back).condenser, to === "total" ? undefined : "partial");
    for (const k of CONDENSER_SPEC_KEYS) assert.equal(col(back)[k], undefined);
    assert.equal(col(back).specifications, undefined);
    assert.deepEqual(flowsheetDocStatus(back).structure, []);
  }
  // a vapour distillate sent to a unit is not removed silently
  const toUnit = { ...fs, blocks: [...fs.blocks, { id: "M1", type: "mixer", x: 0, y: 0 }],
    streams: fs.streams.map(s => (s.from === "COLUMN.vapour_distillate" ? { ...s, to: "M1.in" } : s)) };
  assert.throws(() => setCondenser(toUnit, "COLUMN", "total"), /vapour distillate of COLUMN .* goes to a unit; send it out of the flowsheet first/);
  // the shortcut has one distillate: the Column workspace's switch takes the total condenser
  const sc = leaveVapourLiquid(fs, "COLUMN", "shortcut");
  assert.equal(col(sc).condenser, undefined);
  assert.equal(streamsOf(sc, "COLUMN").vapour_distillate, undefined);
  assert.equal(leaveVapourLiquid(fs, "COLUMN", "rigorous"), fs);
});

test("the outlets are named by phase on the canvas and in the stream table; other columns keep their names", () => {
  const b = { type: "column", spec: { mode: "rigorous", condenser: "vapour_liquid" } };
  assert.equal(outletName(b, "distillate"), "liquid distillate");
  assert.equal(outletName(b, "vapour_distillate"), "vapour distillate");
  assert.equal(outletName(b, "bottoms"), null);
  assert.equal(outletName({ type: "column", spec: { mode: "rigorous" } }, "distillate"), null);
  assert.equal(outletName({ type: "column", spec: { configuration: "absorber" } }, "distillate"), "gas out");
});

test("Lab's methanol column with the condenser at 53 C from the workbench: solved; the Excel sheet has the two distillates and the two reflux ratios; a project of format 11 solves again", () => {
  let fs = setCondenser(labFlowsheet(), "COLUMN", "vapour_liquid", { condenser_T_K: 326.15 });
  const res = runFlowsheet(fs);
  const r = res.blocks.COLUMN, st = r.state;
  assert.equal(st.condenser, "vapour_liquid");
  const vid = streamsOf(fs, "COLUMN").vapour_distillate[0], lid = streamsOf(fs, "COLUMN").distillate[0];
  assert.ok(Math.abs(res.streams[vid].F_kmol_h - st.D_vapour_kmol_h) < 1e-9 * st.D_kmol_h);
  assert.ok(Math.abs(res.streams[lid].F_kmol_h - st.D_liquid_kmol_h) < 1e-9 * st.D_kmol_h);

  // the column's sheet: the inputs as given, and both distillates and both reflux ratios with their source
  const sh = columnSheet(fs.blocks.find(b => b.id === "COLUMN"), r, { comps: fs.components, nameOf: c => c, model: "PR" });
  const row = label => sh.rows.find(x => x[0] === label);
  assert.equal(row("Condenser")[1], "vapour_liquid");
  assert.equal(row("Condenser temperature")[1], 326.15);
  for (const [label, key] of [["Reflux ratio (over the liquid distillate)", "reflux_ratio"], ["Reflux over the whole distillate", "reflux_over_distillate"],
    ["Liquid distillate flow", "D_liquid_kmol_h"], ["Vapour distillate flow", "D_vapour_kmol_h"], ["Distillate flow (liquid + vapour)", "D_kmol_h"],
    ["Vapour share of the distillate", "vapour_share"], ["Bottoms flow", "B_kmol_h"], ["Condenser duty (removed)", "condenser_kW"]]) {
    const x = sh.rows.find(q => q[0] === label && q[1]?.s === "value");
    assert.ok(x, `${label} in the results`);
    assert.equal(x[1].v, st[key], label);
  }
  assert.ok(Math.abs(st.reflux_ratio - 2) < 1e-9);
  assert.ok(Math.abs(st.reflux_over_distillate - 2 * st.D_liquid_kmol_h / st.D_kmol_h) < 1e-9);
  // the whole workbook: the vapour distillate is a stream of the Streams sheet, from the column's outlet
  const { sheets } = flowsheetSheets(fs, res, { version: "test" });
  assert.ok(sheets.find(s => s.name === "Streams").rows[1].includes("COLUMN vapour_distillate"));
  assert.ok(sheets.find(s => s.name === "Column COLUMN"));
  // a total condenser's sheet is as before: one reflux ratio, one distillate
  const plain = { ...r, state: { ...st, condenser: "total" } };
  const sh2 = columnSheet({ id: "C", type: "column", spec: { mode: "rigorous", reflux_ratio: 2 } }, plain, { comps: fs.components, nameOf: c => c, model: "PR" });
  assert.ok(sh2.rows.some(q => q[0] === "Reflux ratio" && q[1]?.s === "value"));
  assert.ok(!sh2.rows.some(q => /Reflux over the whole distillate|Vapour distillate flow/.test(q[0])));

  // McCabe-Thiele (the Column workspace) is not drawn for two distillates; it says why
  const two = { ...fs, streams: fs.streams };
  const mt = columnBinary({ ids: ["methanol", "water"] }, two, res, "COLUMN");
  assert.equal(mt.ok, false);
  assert.match(mt.why, /two distillates/);

  // the project: format 11, read back to the same column, which solves to the same products
  const doc = projectOf(initialState({ components: [], flowsheet: fs }), { version: "test", now: new Date("2026-11-19T00:00:00Z") });
  assert.equal(PROJECT_FORMAT, 11);
  assert.equal(doc.fugacity_project, 11);
  const back = stateFromProject(readProject(JSON.parse(JSON.stringify(doc)))).flowsheet;
  assert.deepEqual(col(back), col(fs));
  assert.equal(streamsOf(back, "COLUMN").vapour_distillate.length, 1);
  const again = runFlowsheet(back);
  assert.ok(Math.abs(again.blocks.COLUMN.state.D_vapour_kmol_h - st.D_vapour_kmol_h) < 1e-6 * st.D_vapour_kmol_h);
  // a reader of format 10 does not know the condenser: the same file saying format 10 is refused, naming format 11
  assert.throws(() => readProject({ ...doc, fugacity_project: 10 }), /vapour \+ liquid condenser .* needs format 11 \(this file says format 10\)/);
  // a stream on the outlet alone (a hand-written file) also needs it
  const onlyStream = { ...doc, fugacity_project: 10, flowsheet: { ...doc.flowsheet, blocks: doc.flowsheet.blocks.map(b => (b.id === "COLUMN" ? { ...b, spec: { ...b.spec, condenser: "partial", condenser_T_K: undefined } } : b)) } };
  assert.throws(() => readProject(JSON.parse(JSON.stringify(onlyStream))), /needs format 11/);
});

test("older projects read unchanged: a column without this condenser is still written in its old format (6), and formats 6 and 10 read", () => {
  const fs = labFlowsheet();
  const doc = projectOf(initialState({ components: [], flowsheet: fs }), { version: "test", now: new Date("2026-11-19T00:00:00Z") });
  assert.equal(doc.fugacity_project, 6, "the lowest format that holds it, as before");
  assert.deepEqual(col(stateFromProject(readProject(JSON.parse(JSON.stringify(doc)))).flowsheet), col(fs));
  // a format-10 file (as written before this change) reads, and its column is the same
  const old10 = { ...JSON.parse(JSON.stringify(doc)), fugacity_project: 10, saved_with: "chepta 0.6.2" };
  assert.deepEqual(col(stateFromProject(readProject(old10)).flowsheet), col(fs));
  // the Column workspace's example (shortcut, total condenser) is format 6 too
  const ws = projectOf({ ...initialState({ components: [] }), column: columnExample() }, { version: "test" });
  assert.equal(ws.fugacity_project, 6);
});
