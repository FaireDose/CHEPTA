// Modified UNIFAC 2.0 (src/thermo/activity/mod-unifac.js; parameters src/data/mod-unifac-2.json, from the CC BY 4.0
// files of Hayer, Hasse and Jirasek 2025; group assignments in src/data/components.json, from
// validation/python/mod_unifac_2.py).
//  1. the engine against an independent implementation: the thermo library's modified UNIFAC (Dortmund) with the same
//     tables and groups (validation/data/unifac/mod-unifac-2-fixtures.json);
//  2. the parameter file against the arXiv files it was written from;
//  3. the predicted tier, and the refusal, with the reason, of a component without groups;
//  4. how far the predictions are from open measured data: the isobaric T-x-y sets the NRTL and UNIQUAC pairs were
//     fitted to (validation/data/). The bounds below are the deviations found when the model was added (reported,
//     not a target): a predictive method is expected to be less accurate than a fit to the same data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system } from "../src/index.js";
import { modUnifac } from "../src/thermo/activity/mod-unifac.js";

const load = p => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const tables = load("../src/data/mod-unifac-2.json");
const comps = load("../src/data/components.json").components;
const fixtures = load("../validation/data/unifac/mod-unifac-2-fixtures.json");

test("Modified UNIFAC 2.0 reproduces the thermo library's ln gamma to 1e-9", () => {
  assert.ok(fixtures.values.length >= 20);
  for (const f of fixtures.values) {
    const g = modUnifac({ groups: f.components.map(id => comps[id].modUnifac.groups), tables })(f.x, f.T_K);
    g.forEach((v, i) => assert.ok(Math.abs(Math.log(v) - f.lnGamma[i]) < 1e-9,
      `${f.components.join(" + ")} at ${f.T_K} K, x ${f.x}: ln gamma ${Math.log(v)} vs ${f.lnGamma[i]}`));
  }
});

test("the parameter file is the arXiv files: R, Q and the a and b tables", () => {
  const csv = name => readFileSync(new URL(`../validation/data/unifac/mod-unifac-2.0/${name}`, import.meta.url), "utf8")
    .trim().split(/\r?\n/).map(l => l.split(";"));
  const size = csv("Size_Parameters_modUNIFAC20.csv").slice(1);
  assert.equal(Object.keys(tables.subgroups).length, size.length);
  for (const [id, name, main, , R, Q] of size) {
    assert.deepEqual(tables.subgroups[id], { name, main: Number(main), R: Number(R), Q: Number(Q) }, `subgroup ${id}`);
  }
  for (const [file, key] of [["a_Parameters_modUNIFAC20.csv", "a"], ["b_Parameters_modUNIFAC20.csv", "b"]]) {
    const rows = csv(file);
    const cols = rows[0].slice(1).map(Number);
    assert.deepEqual(cols, tables.main);
    assert.equal(tables.main.length, 63);
    for (const r of rows.slice(1)) {
      const i = tables.main.indexOf(Number(r[0]));
      r.slice(1).forEach((v, j) => assert.equal(tables[key][i][j], Number(v), `${key}[${r[0]}][${cols[j]}]`));
    }
  }
});

test("every pair is labelled predicted, with the source; a component without groups is refused with the reason", () => {
  const s = system({ components: ["ethanol", "water", "ethyl acetate"], model: "MOD-UNIFAC-2" });
  assert.equal(s.info.pairs.length, 3);
  for (const p of s.info.pairs) {
    assert.equal(p.tier, "predicted");
    assert.match(p.source, /Modified UNIFAC 2\.0 .*Hayer/);
    assert.equal(p.sources[0].license, "CC BY 4.0");
  }
  // gases have no Modified UNIFAC 2.0 subgroups; a component whose groups were not checked says so too
  assert.throws(() => system({ components: ["methane", "n-hexane"], model: "MOD-UNIFAC-2" }), /Methane has no vapour-pressure record|Methane has no Modified UNIFAC 2\.0 groups/);
  assert.throws(() => system({ components: ["cyrene", "water"], model: "MOD-UNIFAC-2" }), /Cyrene has no Modified UNIFAC 2\.0 groups \(no DDBST assignment/);
  // every group assignment states its source; every component either has groups or says why not
  for (const [id, c] of Object.entries(comps)) {
    assert.ok(c.modUnifac, `${id}: modUnifac`);
    if (c.modUnifac.groups) assert.match(c.modUnifac.source, /Modified UNIFAC 2\.0 subgroups/);
    else assert.equal(c.modUnifac.available, false, id);
  }
});

test("water + gamma-valerolactone: the known deviation of Modified UNIFAC 2.0 from measured bubble temperatures", () => {
  // Havasi et al. 2016 (ThermoML Archive), bubble temperatures stated within 2.1 K; the prediction is too low and
  // predicts a liquid split, as src/data/known-issues.json says (reported, not a target)
  const d = load("../validation/data/water_gvl_tx_havasi2016.json");
  const s = system({ components: ["water", "gvl"], model: "MOD-UNIFAC-2" });
  const bounds = { 101.325: [-3.5, -2.5], 50.6: [-7.8, -6.8], 10.1: [-7.4, -6.4] };
  for (const st of d.sets) {
    const dev = st.rows.filter(r => r[0] > 0 && r[0] < 1).map(([x, T]) => s.bubbleT([x, 1 - x], st.P_kPa).T - T);
    const mean = dev.reduce((a, b) => a + b, 0) / dev.length;
    const [lo, hi] = bounds[st.P_kPa];
    assert.ok(mean > lo && mean < hi, `${st.P_kPa} kPa: mean deviation ${mean.toFixed(2)} K`);
  }
  assert.equal(s.isLiquidStable([0.6, 0.4], 330), false);
  const issue = load("../src/data/known-issues.json").issues.find(k => k.model === "MOD-UNIFAC-2" && k.components.includes("gvl"));
  assert.match(issue.message, /3\.0 K at 101\.3 kPa, 7\.3 K at 50\.6 kPa and 6\.9 K at 10\.1 kPa/);
});

const TXY = [
  // file, bounds found when the model was added: mean |dT| (K), mean |dy|
  ["ethanol_water_101kPa.json", 1.1, 0.019],
  ["acetone_chloroform_101kPa.json", 0.4, 0.006],
  ["acetone_methanol_101kPa.json", 0.5, 0.008],
  ["chloroform_methanol_101kPa.json", 0.6, 0.013],
  ["ethyl-acetate_ethanol_101kPa.json", 0.3, 0.008],
  ["ethanol_ethylene-glycol_101kPa.json", 0.6, 0.002],
];
for (const [file, maxT, maxY] of TXY) {
  test(`${file}: Modified UNIFAC 2.0 predicts the measured T-x-y within ${maxT} K and ${maxY} in y (mean)`, () => {
    const d = load(`../validation/data/${file}`);
    const col = Object.fromEntries(d.columns.map((c, k) => [c, k]));
    const pts = d.rows.map(r => ({ x: r[col.x_1], T: r[col.T_K], y: r[col.y_1] })).filter(p => p.x > 0 && p.x < 1);
    const s = system({ components: d.components, model: "MOD-UNIFAC-2" });
    const dev = pts.map(p => { const b = s.bubbleT([p.x, 1 - p.x], d.P_kPa); return [Math.abs(b.T - p.T), Math.abs(b.y[0] - p.y)]; });
    const aadT = dev.reduce((a, v) => a + v[0], 0) / dev.length, aadY = dev.reduce((a, v) => a + v[1], 0) / dev.length;
    assert.ok(aadT < maxT, `AAD ${aadT.toFixed(3)} K`);
    assert.ok(aadY < maxY, `AAD ${aadY.toFixed(4)} in y`);
  });
}
