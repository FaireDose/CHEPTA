// The binary diagrams' additions (proposal 0021, answer 7): the measured vapour-liquid points on the T-x-y and the
// P-x-y, and the x-y, activity-coefficient and relative-volatility plots. DOM-free: what is drawn is checked where it
// is made (binary-logic.js, src/thermo/measured.js, diagram-tables.js); the drawing itself is checked by the
// screenshots of docs/ui-review/2026-11-11-0021-step1/.
//
// Method (docs/METHOD_SELECTION.md): ethanol + water and the other polar pairs at low pressure with NRTL and an
// ideal-gas vapour; methane + ethane with Peng-Robinson.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system } from "../src/system.js";
import { measuredVle, measuredVleCounts } from "../src/thermo/measured.js";
import { binaryCurve, plotCurves, measuredFor, setRole, modelDeviation, roleText, checkBinaryPlot, END_X, P_MATCH, T_MATCH_K } from "../src/ui/binary-logic.js";
import { binaryTables, measuredTables } from "../src/ui/diagram-tables.js";
import { tableCsv } from "../src/ui/diagram-export.js";
import { initialState, applyPatch } from "../src/ui/app-logic.js";
import { vlePoints } from "../scripts/vle-points.mjs";

const file = name => JSON.parse(readFileSync(new URL(`../validation/data/${name}`, import.meta.url), "utf8"));
const shipped = JSON.parse(readFileSync(new URL("../src/data/vle-points.json", import.meta.url), "utf8"));
const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}`);

test("the shipped measured points are what the data files give (scripts/vle-points.mjs)", () => {
  assert.deepEqual(shipped, vlePoints().doc, "run node scripts/vle-points.mjs after changing validation/data");
  const c = measuredVleCounts();
  assert.equal(c.sets, shipped.sets.length);
  assert.ok(c.pairs > 300 && c.points > 8000, `${c.pairs} pairs, ${c.points} points`);
});

test("every row of every shipped set is a row of its data file, unchanged", () => {
  for (const set of shipped.sets) {
    const d = file(set.file);
    assert.deepEqual(set.components, d.components, set.file);
    assert.equal(set.rows.length, d.rows.length, set.file);
    const at = set.columns.map(c => d.columns.indexOf(c));
    assert.ok(at.every(i => i >= 0), set.file);
    set.rows.forEach((r, k) => assert.deepEqual(r, at.map(i => d.rows[k][i]), `${set.file}, row ${k + 1}`));
    if (set.P_kPa != null) assert.equal(set.P_kPa, d.P_kPa, set.file);
  }
});

test("the measured points of a pair equal the data file's rows, with its source and table", () => {
  const d = file("ethanol_water_101kPa.json");
  const [set, ...more] = measuredVle("ethanol", "water");
  assert.equal(more.length, 0);
  assert.equal(set.file, "ethanol_water_101kPa.json");
  assert.equal(set.kind, "isobaric-txy");
  const ix = d.columns.indexOf("x_1"), iT = d.columns.indexOf("T_K"), iy = d.columns.indexOf("y_1");
  assert.deepEqual(set.points, d.rows.map(r => ({ T: r[iT], P: d.P_kPa, x: r[ix], y: r[iy] })));
  assert.equal(set.source.doi, d.source.doi);
  assert.equal(set.source.tables, d.source.tables);
  assert.match(set.source.citation, /Kamihama.*J\. Chem\. Eng\. Data 57 \(2012\) 339/);
  // asked for in the other order: the same rows, as fractions of water
  const flipped = measuredVle("water", "ethanol")[0];
  flipped.points.forEach((p, k) => { close(p.x, 1 - d.rows[k][ix], 1e-12, "x"); close(p.y, 1 - d.rows[k][iy], 1e-12, "y"); assert.equal(p.T, d.rows[k][iT]); });
  // an isothermal set keeps the temperature and pressure of each row
  const b = file("vle/1-butanol_benzene_10-1016-j-jct-2005-07-004_313.15K.json");
  const iso = measuredVle("1-butanol", "benzene").find(s => s.file.endsWith("313.15K.json"));
  assert.deepEqual(iso.points, b.rows.map(r => ({ T: r[0], P: r[2], x: r[1], y: null })));
});

test("a pair without a data file has no measured set, and nothing is drawn for it", () => {
  assert.deepEqual(measuredVle("acetone", "water"), []);
  const m = measuredFor(["acetone", "water"], { P_kPa: 101.325 }, null);
  assert.deepEqual(m, { drawn: [], elsewhere: [], total: 0 });
  assert.deepEqual(measuredTables({ names: ["Acetone", "Water"], units: { T: "C", P: "kPa" }, sets: m.drawn }), []);
});

test("the plotted model curves are the engine's bubble points (T-x-y side: at a pressure)", () => {
  const sys = system({ components: ["ethanol", "water"], model: "NRTL" });
  const P = 101.325, n = 21;
  const { points, missed } = binaryCurve(sys, { P_kPa: P }, n);
  assert.equal(missed, 0);
  const xy = plotCurves("xy", points)[0].points, [g1, g2] = plotCurves("gamma", points).map(c => c.points), alpha = plotCurves("alpha", points)[0].points;
  for (let k = 0; k < n; k++) {
    const x = k / (n - 1), r = sys.bubbleT([x, 1 - x], P);
    assert.equal(points[k].x, x);
    assert.equal(points[k].T, r.T);
    assert.deepEqual(xy[k], { x, y: r.y[0] });
    assert.deepEqual(g1[k], { x, y: r.gamma[0] });
    assert.deepEqual(g2[k], { x, y: r.gamma[1] });
    const xe = k === 0 ? END_X : k === n - 1 ? 1 - END_X : x, ye = sys.bubbleT([xe, 1 - xe], P).y[0];
    close(alpha[k].y, (ye / xe) / ((1 - ye) / (1 - xe)), 1e-12, `alpha at x = ${x}`);
  }
  // the relative volatility crosses 1 at the azeotrope (ethanol + water: near x = 0.9 at 101.325 kPa)
  const fine = plotCurves("alpha", binaryCurve(sys, { P_kPa: P }, 101).points)[0].points;
  const cross = fine.findIndex((p, k) => k && (fine[k - 1].y - 1) * (p.y - 1) < 0);
  assert.ok(fine[cross].x > 0.85 && fine[cross].x < 0.95, `alpha = 1 near x = ${fine[cross].x}`);
});

test("the plotted model curves are the engine's bubble points (P-x-y side: at a temperature)", () => {
  const sys = system({ components: ["1-butanol", "benzene"], model: "NRTL" });
  const T = 313.15, n = 11;
  const { points } = binaryCurve(sys, { T_K: T }, n);
  const xy = plotCurves("xy", points)[0].points, g = plotCurves("gamma", points);
  for (let k = 0; k < n; k++) {
    const x = k / (n - 1), r = sys.bubbleP([x, 1 - x], T);
    assert.equal(points[k].P, r.P);
    assert.equal(points[k].T, T);
    assert.equal(xy[k].y, r.y[0]);
    assert.equal(g[0].points[k].y, r.gamma[0]);
    assert.equal(g[1].points[k].y, r.gamma[1]);
  }
});

test("an equation of state has x-y and relative-volatility curves, and no activity coefficients", () => {
  const sys = system({ components: ["methane", "ethane"], model: "PR" });
  const { points } = binaryCurve(sys, { T_K: 250 }, 11);
  const ok = points.filter(Boolean);
  assert.ok(ok.length >= 5);
  assert.deepEqual(plotCurves("gamma", points), []);
  const r = sys.bubbleP([0.3, 0.7], 250), p = points[3];
  assert.equal(p.y, r.y[0]);
  close(p.alpha, r.K[0] / r.K[1], 1e-9, "alpha against the K-values of the equation of state");
  assert.throws(() => plotCurves("other", points), /Unknown plot/);
});

test("what the parameter set did with a set is read from its record: fitted, compared, or not named", () => {
  const ids = ["water", "acetic-acid"];
  const sys = system({ components: ids, model: "NRTL" });
  const pair = sys.info.pairs[0];
  assert.equal(pair.tier, "fitted");
  const m = measuredFor(ids, { P_kPa: 101.325 }, pair.source);
  assert.equal(m.total, 2);
  const by = Object.fromEntries(m.drawn.map(d => [d.role, d]));
  assert.equal(by.fitted.file, "water_acetic-acid_101kPa_chang2005.json");
  assert.equal(by.check.file, "water_acetic-acid_101kPa_calvar2005.json");
  // the fit's own record of each, as fit_parameters.py wrote it into the set's source
  assert.ok(pair.source.includes(`${by.fitted.record}. Check against`), by.fitted.record);
  assert.ok(pair.source.includes(`Check against ${by.check.file}: ${by.check.record}.`), by.check.record);
  assert.match(by.check.record, /^AAD [\d.]+ K in T, [\d.]+ in y \(max [\d.]+ K, [\d.]+\)$/);
  // every point of both sets is drawn, as measured
  assert.equal(by.fitted.points.length, file(by.fitted.file).rows.length);
  assert.equal(by.check.points.length, file(by.check.file).rows.length);
  // a set that names no file (a databank set, a prediction): comparison only
  assert.deepEqual(setRole("ethanol_water_101kPa.json", "ChemSep NRTL parameters"), { role: "unused", record: null });
  assert.deepEqual(setRole("vle/a_b_101.3kPa.json", null), { role: "unused", record: null });
  assert.match(roleText("unused", false), /not fitted/);
  assert.match(roleText("check", true), /compared, not fitted/);
  assert.match(roleText("fitted", true), /^fitted/);
});

test("the model's deviation from a set is the engine's bubble point against each measured point", () => {
  const ids = ["ethanol", "water"];
  const sys = system({ components: ids, model: "NRTL" });
  const [d] = measuredFor(ids, { P_kPa: 101.325 }, sys.info.pairs[0].source).drawn;
  assert.equal(d.role, "fitted");
  const dev = modelDeviation(sys, d.points, true);
  let sT = 0, sy = 0;
  for (const p of d.points) { const r = sys.bubbleT([p.x, 1 - p.x], p.P); sT += Math.abs(r.T - p.T); sy += Math.abs(r.y[0] - p.y); }
  assert.equal(dev.n, d.points.length);
  close(dev.dT_K, sT / d.points.length, 1e-12, "mean |dT|");
  close(dev.dy, sy / d.points.length, 1e-12, "mean |dy|");
  // and it agrees with what the fit recorded for its own data ("AAD 0.12 K in T, 0.0037 in y")
  const [, aadT, aadY] = /AAD ([\d.]+) K in T, ([\d.]+) in y/.exec(d.record);
  close(dev.dT_K, +aadT, 0.006, "against the fit's record, T");
  close(dev.dy, +aadY, 0.00006, "against the fit's record, y");
});

test("sets at other conditions are listed with where to draw them, not drawn", () => {
  const ids = ["1-butanol", "benzene"];
  const at101 = measuredFor(ids, { P_kPa: 101.325 }, null);
  assert.equal(at101.drawn.length, 0);
  const iso = at101.elsewhere.find(e => e.go?.view === "pxy");
  assert.deepEqual(iso.go, { view: "pxy", T_K: 313.15 });
  const at313 = measuredFor(ids, { T_K: 313.15 }, null);
  assert.equal(at313.drawn.length, 1);
  assert.equal(at313.drawn[0].points.length, at313.drawn[0].of);
  assert.equal(measuredFor(ids, { T_K: 313.15 + T_MATCH_K + 0.01 }, null).drawn.length, 0);
  // a T-x-y draws the sets within P_MATCH of its pressure only (101.3 kPa on a diagram at 101.325; not at 95)
  assert.equal(measuredFor(["ethanol", "water"], { P_kPa: 101.325 }, null).drawn.length, 1);
  const off = measuredFor(["ethanol", "water"], { P_kPa: 101.3 * (1 + P_MATCH) + 0.1 }, null);
  assert.equal(off.drawn.length, 0);
  assert.deepEqual(off.elsewhere[0].go, { view: "txy", P_kPa: 101.3 });
});

test("the export tables of the plots and of the measured points", () => {
  const ids = ["ethanol", "water"];
  const sys = system({ components: ids, model: "NRTL" });
  const { points } = binaryCurve(sys, { P_kPa: 101.325 }, 11);
  const units = { T: "C", P: "kPa" };
  const [t] = binaryTables({ names: sys.names, MW: [46.07, 18.015], units, basis: "mole", points, isobaric: true });
  assert.deepEqual(t.columns.map(c => c.label), ["x Ethanol", "y Ethanol", "T bubble", "K Ethanol", "K Water", "α Ethanol/Water", "γ Ethanol", "γ Water"]);
  assert.equal(t.columns[2].unit, "°C");
  const p = points[5], row = t.rows[5];
  close(row[0], 0.5, 1e-12, "x"); assert.equal(row[1], p.y); close(row[2], p.T - 273.15, 1e-9, "T in °C");
  close(row[3], p.y / 0.5, 1e-12, "K1"); close(row[4], (1 - p.y) / 0.5, 1e-12, "K2"); assert.equal(row[5], p.alpha); assert.equal(row[6], p.gamma[0]);
  assert.equal(t.rows[0][3], null, "K of ethanol at x = 0 is not a number");
  const eos = binaryTables({ names: ["Methane", "Ethane"], MW: [16, 30], units, basis: "mass", points: binaryCurve(system({ components: ["methane", "ethane"], model: "PR" }), { T_K: 250 }, 5).points, isobaric: false, activity: false })[0];
  assert.deepEqual(eos.columns.map(c => c.label), ["x Methane", "w Methane", "y Methane", "w(y) Methane", "P bubble", "K Methane", "K Ethane", "α Methane/Ethane"]);
  const sets = measuredFor(ids, { P_kPa: 101.325 }, sys.info.pairs[0].source).drawn;
  const [mt] = measuredTables({ names: sys.names, units, sets });
  const d = file("ethanol_water_101kPa.json");
  assert.equal(mt.rows.length, d.rows.length);
  assert.deepEqual(mt.rows[0].slice(0, 2), [d.rows[0][0], d.rows[0][2]]);
  close(mt.rows[0][2], d.rows[0][1] - 273.15, 1e-9, "T");
  assert.equal(mt.rows[0][4], "fitted");
  assert.equal(mt.rows[0][7], "validation/data/ethanol_water_101kPa.json");
  const csv = tableCsv(mt).split("\r\n");
  assert.equal(csv[0].split(",")[0], "x Ethanol (mol/mol)");
  assert.equal(csv.length, d.rows.length + 2);
  assert.match(csv[1], /"N\. Kamihama, .*"/, "a field with a comma is quoted");
});

test("the workbench keeps which plot is shown and whether the measured points are drawn", () => {
  const s = initialState({ components: ["ethanol", "water"], start: "txy" });
  assert.equal(s.binaryPlot, "phase");
  assert.equal(s.measured, true);
  const a = applyPatch(s, { binaryPlot: "alpha", measured: false });
  assert.equal(a.binaryPlot, "alpha");
  assert.equal(a.measured, false);
  assert.equal(applyPatch(a, { binaryPlot: "nonsense" }).binaryPlot, "phase");
  assert.equal(initialState({ components: ["ethanol", "water"], binaryPlot: "xy", measured: false }).binaryPlot, "xy");
  assert.equal(checkBinaryPlot(undefined), "phase");
  // the button of a set measured elsewhere: the diagram there, with the points on
  const b = applyPatch(a, { view: "pxy", T_K: 313.15, measured: true });
  assert.equal(b.view, "pxy"); assert.equal(b.T_K, 313.15); assert.equal(b.measured, true);
});
