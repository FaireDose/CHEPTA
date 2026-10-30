// The Column workspace (proposal 0015, Part II, step 4; milestone M2b): McCabe-Thiele's construction checked against the
// shortcut and the rigorous column of the same separation, the workspace's document saved in format 6, and the column's
// sheet in the flowsheet's Excel workbook. DOM-free (src/ui/column-mccabe.js, column-workspace.js, column-excel.js).
// Methods (docs/METHOD_SELECTION.md): benzene + toluene with Peng-Robinson for both phases (nonpolar hydrocarbons, rules 2
// and 6, as W7's case B2); ethanol + water with NRTL (a polar pair with an azeotrope, rule 1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runFlowsheet } from "../src/index.js";
import { flowsheetSystem } from "../src/flowsheet/document.js";
import { columnBinary, equilibriumCurve, mccabeThiele } from "../src/ui/column-mccabe.js";
import { columnDocument, columnExample, switchMode, columnExport } from "../src/ui/column-workspace.js";
import { flowsheetSheets } from "../src/ui/flowsheet-excel.js";
import { initialState, applyPatch } from "../src/ui/app-logic.js";
import { projectOf, stateFromProject, readProject } from "../src/ui/project.js";
import { SECTIONS, WORKSPACES } from "../src/ui/workspaces.js";

/** The workspace's example with another column spec (and, optionally, components, feed and method). */
function doc(spec, { components = ["benzene", "toluene"], flows = { benzene: 50, toluene: 50 }, model = "PR" } = {}) {
  const fs = columnExample();
  return { ...fs, components, thermo: { model },
    blocks: fs.blocks.map(b => (b.type === "feed" ? { ...b, spec: { ...b.spec, flow_kmol_h: flows } } : b.type === "column" ? { ...b, spec } : b)) };
}
function construct(fs, opts = {}) {
  const res = runFlowsheet(fs), sys = flowsheetSystem(fs), inp = columnBinary(sys, fs, res, "C1");
  assert.ok(inp.ok, inp.why);
  const curve = equilibriumCurve(sys, inp.i, inp.P_kPa);
  return { res, inp, mt: mccabeThiele({ sys, ...inp, curve, ...opts }) };
}
const SHORTCUT = { mode: "shortcut", light_key: "benzene", heavy_key: "toluene", recovery_light_key_in_distillate: 0.95,
  recovery_heavy_key_in_bottoms: 0.95, reflux_over_minimum: 1.3, condenser: "total" };

test("McCabe-Thiele against the shortcut (benzene + toluene): the same minimum reflux, minimum stages and stages within the stated tolerances", () => {
  const { res, mt } = construct(doc(SHORTCUT));
  const st = res.blocks.C1.state;
  // Underwood's R_min with a saturated-liquid feed is the q-line's pinch on a constant-alpha curve: within 1 %
  assert.equal(mt.pinch.kind, "feed");
  assert.ok(Math.abs(mt.pinch.R_min / st.R_min - 1) < 0.01, `R_min ${mt.pinch.R_min} against Underwood's ${st.R_min}`);
  // Fenske takes alpha at the feed's bubble point; the curve's alpha changes by 15 % from top to bottom: within 5 %
  assert.ok(Math.abs(mt.total / st.N_min - 1) < 0.05, `N_min ${mt.total} against Fenske's ${st.N_min}`);
  // Gilliland's correlation is an estimate: within one stage
  assert.ok(Math.abs(mt.stages - st.N) < 1, `N ${mt.stages} against Gilliland's ${st.N}`);
});

test("McCabe-Thiele against the rigorous column (benzene + toluene): the same columns step off to their equilibrium stages within one stage", () => {
  for (const [N, f] of [[10, 5], [12, 6], [14, 7], [16, 8]]) {
    const { res, inp, mt } = construct(doc({ mode: "rigorous", stages: N, feed_stage: f, reflux_ratio: 2, distillate_kmol_h: 50 }), { feedStage: f });
    assert.equal(res.blocks.C1.state.converged, true);
    // a total condenser is not an equilibrium stage: N − 1 (the reboiler included); the tolerance, one stage, covers
    // constant molar overflow (the rigorous column's flows change by a few percent) and the fractional last step
    assert.ok(Math.abs(mt.stages - (N - 1)) < 1, `${N} stages: McCabe-Thiele ${mt.stages}`);
    assert.equal(mt.feedStep + 1, f, "the stripping line from the column's feed stage");
    assert.equal(inp.R, res.blocks.C1.state.reflux_ratio);
  }
});

test("ethanol + water: the minimum reflux is a tangent pinch; a reflux below it and products across the azeotrope are refused", () => {
  const fs = doc({ mode: "rigorous", stages: 20, feed_stage: 14, reflux_ratio: 3, distillate_kmol_h: 11 },
    { components: ["ethanol", "water"], flows: { ethanol: 10, water: 90 }, model: "NRTL" });
  const { inp, mt } = construct(fs);
  assert.equal(mt.pinch.kind, "tangent");
  assert.ok(mt.pinch.x > inp.z, "the tangent touches the curve above the feed");
  const sys = flowsheetSystem(fs), curve = equilibriumCurve(sys, inp.i, inp.P_kPa);
  assert.throws(() => mccabeThiele({ sys, ...inp, curve, R: mt.pinch.R_min * 0.9 }), /at or below the minimum/);
  assert.throws(() => mccabeThiele({ sys, ...inp, curve, xD: 0.95 }), /azeotrope/);
});

test("the workspace's document: a feed, the column and its products; switching to rigorous starts from the shortcut's numbers", () => {
  const fs = columnDocument(null);
  assert.deepEqual(fs.blocks.map(b => b.type).sort(), ["column", "feed", "product", "product"]);
  const res = runFlowsheet(columnExample());
  const rig = switchMode(SHORTCUT, "rigorous", res.blocks.C1);
  assert.equal(rig.stages, res.blocks.C1.state.stages);
  assert.equal(rig.feed_stage, res.blocks.C1.state.feed_stage);
  assert.equal(rig.reflux_ratio, +res.blocks.C1.state.R.toPrecision(3));
  assert.ok(Math.abs(rig.distillate_kmol_h - 50) < 1e-9);
  assert.ok(runFlowsheet(doc(rig)).blocks.C1.state.converged);
  assert.ok(WORKSPACES.some(w => w.id === "column"));
  assert.ok(!SECTIONS.find(s => s.id === "units").locked?.length, "the Column workspace is no longer locked");
});

test("saved in format 6 only once used, reopened as it was; a file that says an older format is refused", () => {
  const s0 = initialState({ components: [] });
  assert.equal(projectOf(s0).column, undefined);
  const s1 = applyPatch(s0, { column: columnExample() });
  const d = projectOf(s1, { version: "test" });
  assert.equal(d.fugacity_project, 6);
  const back = stateFromProject(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(back.column.blocks.find(b => b.type === "column").spec, SHORTCUT);
  assert.throws(() => readProject({ ...d, fugacity_project: 5 }), /format 6/);
});

test("the column's sheet in the flowsheet's Excel workbook: its inputs, results with their sources, and every stage", () => {
  const fs = doc({ mode: "rigorous", stages: 12, feed_stage: 6, reflux_ratio: 2, distillate_kmol_h: 50 });
  const res = runFlowsheet(fs);
  const { sheets } = flowsheetSheets(fs, res, { version: "test" });
  const sh = sheets.find(s => s.name === "Column C1");
  assert.ok(sh, "a sheet per column");
  assert.ok(sh.rows.some(r => r[0] === "Reflux ratio" && r[1] === 2), "the inputs as given");
  assert.ok(sh.rows.some(r => r[0] === "Reboiler duty" && Math.abs(r[1].v - res.blocks.C1.state.reboiler_kW) < 1e-9 && /energy balance/.test(r[3])), "results with their source");
  const stageRows = sh.rows.filter(r => Number.isInteger(r[0]));
  assert.equal(stageRows.length, 12);
  assert.ok(Math.abs(stageRows[5][2].v - res.blocks.C1.profile[5].T_K) < 1e-12);
  assert.equal(stageRows[0][2].s, "value", "grey italics: calculated by CHEPTA");
  assert.ok(sheets.find(s => s.name === "Inputs").rows.some(r => /Column C1/.test(r[0]?.v ?? "")));
  // the workspace's own download: the profile, the equilibrium curve and the steps
  const sys = flowsheetSystem(fs), inp = columnBinary(sys, fs, res, "C1"), curve = equilibriumCurve(sys, inp.i, inp.P_kPa);
  const exp = columnExport({ fs, r: res.blocks.C1, mt: mccabeThiele({ sys, ...inp, curve }), curve, ud: null });
  assert.deepEqual(exp.tables.map(t => t.name), ["Profile", "Equilibrium curve", "McCabe-Thiele stages"]);
  assert.equal(exp.tables[0].rows.length, 12);
});
