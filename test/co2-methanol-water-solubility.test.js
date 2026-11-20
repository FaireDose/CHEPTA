// CO2 (and H2) dissolved in methanol + water at high pressure: CHEPTA's methods against measured open data
// (CHEPTA-Lab, case methanol-co2-campos-2022; docs/decisions/2026-11-20-01-co2-methanol-water.md).
//
// Data (NIST TRC ThermoML Archive, validation/python/hp_ternary_solubility.py, validation/data/eos/multicomponent/):
//   Xia et al., J. Chem. Eng. Data 49 (2004) 1756, doi 10.1021/je049803i: CO2 + methanol + water, 313.75-395 K;
//   Bezanehtak et al., J. Chem. Eng. Data 49 (2004) 430, doi 10.1021/je0301491: CO2 + H2 + methanol, 278-298 K;
//   Xie et al., J. Chem. Eng. Data 50 (2005) 780, doi 10.1021/je0498614: CO2 + H2 + methanol, 313.2 K.
// Methods: PR and SRK with the k_ij of src/data/kij.json, PR + gE (MHV1) (docs/METHOD_SELECTION.md, "Polar mixtures
// above 10 bar"). The PR k_ij runs on purpose too: its deviation is a known issue, and this test says when it is gone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import comps from "../src/data/components.json" with { type: "json" };
import known from "../src/data/known-issues.json" with { type: "json" };
import { xiaCheck, h2Check, labFlash, METHODS } from "../validation/co2_methanol_check.mjs";

const DIR = new URL("../validation/data/eos/multicomponent/", import.meta.url);
const load = f => JSON.parse(readFileSync(new URL(f, DIR), "utf8"));
const XIA = "thermoml_carbon-dioxide_methanol_water_10-1021-je049803i.json";
const BEZ = "thermoml_carbon-dioxide_hydrogen_methanol_10-1021-je0301491.json";
const XIE = "thermoml_carbon-dioxide_hydrogen_methanol_10-1021-je0498614.json";
const method = label => METHODS.find(m => m.label === label);
const at313 = r => r.T_K < 320;

test("the ternary data files: their source, their rows, and x from the molality", () => {
  for (const [f, n] of [[XIA, 221], [BEZ, 142], [XIE, 16]]) {
    const d = load(f);
    assert.equal(d.rows.length, n, f);
    for (const k of ["citation", "doi", "open_copy", "access", "tables"]) assert.ok(d.source[k], `${f}: source.${k}`);
  }
  // x_1 = m / (m + 1000 / M_s), M_s = s M_MeOH + (1 - s) M_W, recomputed here
  const d = load(XIA), c = Object.fromEntries(d.columns.map((k, i) => [k, i]));
  const Mm = comps.components.methanol.MW, Mw = comps.components.water.MW;
  for (const r of d.rows) {
    const s = r[c.s_methanol_CO2_free], m = r[c.m_1_mol_kg];
    const x1 = m / (m + 1000 / (s * Mm + (1 - s) * Mw));
    assert.ok(Math.abs(x1 - r[c.x_1]) < 1e-6 && Math.abs(s * (1 - x1) - r[c.x_2]) < 1e-6, JSON.stringify(r));
  }
});

test("the measured data bound the separator's liquid: no 1:1 methanol + water liquid of Xia et al. holds 18.5 % CO2", () => {
  // the paper's stream 24 (18.5 mol % CO2) against the measured liquids of the same solvent: even at a total pressure
  // of 7072 kPa of nearly pure CO2 gas (313.75 K), the liquid holds 10.8 %
  const d = load(XIA), c = Object.fromEntries(d.columns.map((k, i) => [k, i]));
  const half = d.rows.filter(r => r[c.s_methanol_CO2_free] === 0.4999 && r[c.T_K] === 313.75);
  assert.equal(half.length, 8);
  const top = half.reduce((a, r) => (r[c.P_kPa] > a[c.P_kPa] ? r : a));
  assert.equal(top[c.P_kPa], 7072);
  assert.ok(top[c.x_1] < 0.11, `${top[c.x_1]}`);
  // and with H2 in the gas like the separator's (Bezanehtak et al., pure methanol, 298 K, 4-7 MPa, y_CO2 at most
  // 0.3): x_CO2 at most 0.116
  const b = load(BEZ), cb = Object.fromEntries(b.columns.map((k, i) => [k, i]));
  const near = b.rows.filter(r => r[cb.T_K] === 298 && r[cb.P_kPa] >= 4000 && r[cb.P_kPa] <= 7000 && r[cb.y_1] <= 0.3);
  assert.equal(near.length, 3);
  for (const r of near) assert.ok(r[cb.x_1] < 0.12, JSON.stringify(r));
});

test("PR + gE (MHV1) follows the measured CO2 solubility in methanol + water at 313.75 K", () => {
  const r = xiaCheck(method("PR + gE (MHV1)"), at313);
  const half = r.series["313.75 K, s = 0.4999"];
  // the separator's solvent (1:1): 9.2 % AAD in x_CO2, 8.4 % in P on 2026-11-20
  assert.ok(half.x_CO2.AAD_pct < 12, JSON.stringify(half.x_CO2));
  assert.ok(half.P.AAD_pct < 12, JSON.stringify(half.P));
  assert.equal(half.missing, 0);
  // all eight solvents at 313.75 K: within 35 % in x_CO2 for each (the worst, s = 0.25: +30 %)
  for (const [k, s] of Object.entries(r.series)) assert.ok(s.x_CO2.AAD_pct < 35, `${k}: ${JSON.stringify(s.x_CO2)}`);
});

test("PR + gE (MHV1) follows the measured CO2 + H2 + methanol liquids", () => {
  const b = h2Check(method("PR + gE (MHV1)"), BEZ);
  assert.equal(b.missing, 0);
  assert.ok(b.P.AAD_pct < 15, JSON.stringify(b.P)); // 12.0 % on 2026-11-20
  assert.ok(b.y_CO2.AAD < 0.04, JSON.stringify(b.y_CO2)); // 0.030
  const x = h2Check(method("PR + gE (MHV1)"), XIE);
  assert.ok(x.P.AAD_pct < 15 && x.missing <= 1, JSON.stringify(x)); // 10.4 %, 1 of 16 without a bubble pressure
});

test("the known issue of PR and SRK with k_ij in methanol + water still holds (remove it when a fix resolves it)", () => {
  for (const label of ["PR (k_ij)", "SRK (k_ij)"]) {
    const m = method(label);
    const issue = known.issues.find(k => k.kind === "predicted-deviation" && k.model === m.model && k.components.join() === "carbon-dioxide,methanol,water");
    assert.ok(issue, `${label}: known issue`);
    const half = xiaCheck(m, r => at313(r) && r.s_methanol_CO2_free === 0.4999).series["313.75 K, s = 0.4999"];
    assert.ok(half.x_CO2.bias_pct > 50, `${label}: ${JSON.stringify(half.x_CO2)}`);
    assert.ok(issue.message.includes(`${half.x_CO2.bias_pct > 0 ? "+" : ""}${half.x_CO2.bias_pct} %`), issue.message);
    const h2 = known.issues.find(k => k.kind === "predicted-deviation" && k.model === m.model && k.components.join() === "carbon-dioxide,hydrogen,methanol");
    assert.ok(h2 && h2Check(m, BEZ).P.bias_pct > 50, `${label}: H2 known issue`);
  }
});

test("CHEPTA-Lab's separator (stream 23, 30 degC, 6925 kPa): CO2 in the liquid by each method", () => {
  // PR with k_ij: Lab's 3.414 mol % (COMPARISON.md, main 415da41), reproduced
  const pr = labFlash(method("PR (k_ij)"));
  assert.ok(Math.abs(pr.liquid_mol_pct[2] - 3.414) < 0.002, JSON.stringify(pr));
  // PR + gE (MHV1) refuses nitrogen + methanol (no open set); without nitrogen it gives about 2.6 %
  assert.match(labFlash(method("PR + gE (MHV1)")).refused, /Methanol \+ Nitrogen/);
  const mh = labFlash(method("PR + gE (MHV1)"), true);
  assert.ok(mh.liquid_mol_pct[2] > 2 && mh.liquid_mol_pct[2] < 3, JSON.stringify(mh));
  // and its H2 in the liquid is 4-5 times PR's, which has no H2 + methanol k_ij
  assert.ok(mh.liquid_mol_pct[0] > 4 * labFlash(method("PR (k_ij)"), true).liquid_mol_pct[0]);
});
