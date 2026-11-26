/**
 * Nitrogen inside the MHV1 rule (docs/decisions/2026-11-25-01-nitrogen-mhv1.md): N2 + water fitted to the ThermoML
 * Archive's articles, N2 + methanol to the four sets of IUPAC Solubility Data Series Vol. 10 (the Archive has none),
 * so that PR + gE (MHV1) runs CHEPTA-Lab's methanol separator (Campos et al. 2022), which holds N2.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system } from "../src/index.js";
import { articles, errors } from "../validation/fit_kij_high_pressure.mjs";
import { henryCheck } from "../validation/fit_mhv1_high_pressure.mjs";
import { coverage } from "../validation/pair_coverage.mjs";

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const mhv1 = load("src/data/mhv1.json");
const set = (model, j) => mhv1.pairs.find(p => p.model === model && p.i === "nitrogen" && p.j === j);
const sysOf = (model, j) => system({ components: ["nitrogen", j], model, mixing: "MHV1" });

test("the SDS Vol. 10 transcription: 4 sets of nitrogen + methanol, 31 rows, as on the page images", () => {
  const arts = articles("nitrogen", "methanol");
  assert.deepEqual(arts.map(a => a.rows.length), [1, 5, 4, 21]);
  const k = arts.find(a => a.file.includes("krichevskii1947"));
  // p 446 of the volume: 298.15 K, 99.1 bar, x = 0.0229; 343.15 K, 284 bar, x = 0.0687
  assert.ok(k.rows.some(r => r.T === 298.15 && r.P === 9910 && r.x === 0.0229));
  assert.ok(k.rows.some(r => r.T === 343.15 && r.P === 28400 && r.x === 0.0687));
  // the 1 atm sets: x at a nitrogen partial pressure of 101.325 kPa
  for (const a of arts.filter(q => !q.file.includes("krichevskii"))) assert.ok(a.rows.every(r => r.p1 === 101.325 && r.P == null && r.x > 2.6e-4 && r.x < 2.9e-4), a.file);
});

for (const model of ["PR", "SRK"]) {
  test(`${model} + gE (MHV1) nitrogen + methanol: within the 5 % gate, and closer to the data than ${model} with ChemSep's k_ij`, () => {
    const p = set(model, "methanol");
    assert.ok(p && !p.quality_warning && p.tier === "fitted", JSON.stringify(p));
    const arts = articles("nitrogen", "methanol");
    const e = errors(["nitrogen", "methanol"], model, { system: sysOf(model, "methanol") }, arts).pooled;
    assert.ok(e.P_pct.aad <= 5 && e.no_bubble_pressure === 0, JSON.stringify(e));
    const kij = load("src/data/kij.json").pairs.find(q => q.model === model && q.i === "nitrogen" && q.j === "methanol").kij;
    const d = errors(["nitrogen", "methanol"], model, kij, arts).pooled;
    assert.ok(d.P_pct.aad > 3 * e.P_pct.aad && d.x_pct.aad > 3 * e.x_pct.aad, `databank k_ij ${kij}: ${JSON.stringify(d)}`);
  });

  test(`${model} + gE (MHV1) nitrogen + water: written with a fit-quality warning; Chapoy et al. (2004) alone within the gate`, () => {
    const p = set(model, "water");
    assert.ok(p && p.quality_warning && /the maintainer, 2026-11-26/.test(p.quality_warning), JSON.stringify(p));
    const s = sysOf(model, "water");
    const e = errors(["nitrogen", "water"], model, { system: s }, articles("nitrogen", "water"));
    assert.ok(e.pooled.P_pct.aad > 5 && e.pooled.P_pct.aad < 6, JSON.stringify(e.pooled));
    const chapoy = e.articles.find(a => a.cite.startsWith("Chapoy"));
    assert.ok(chapoy.P_pct.aad < 5, JSON.stringify(chapoy));
    // the vapour's water content (Mohammadi et al. 2005, not fitted) within 0.002 in y
    assert.ok(e.pooled.y.aad < 0.002, JSON.stringify(e.pooled.y));
    // against IAPWS G7-04 (a check, not fitted), over the data's temperatures (to 363 K): PR within 9.0 %, SRK within
    // 12.4 % (at 358 K) on 2026-11-25; above them the rule's H drifts (+14 to +42 % at 373-398 K), stated in the decision
    const h = henryCheck(["nitrogen", "water"], s);
    h.T_K.forEach((T, k) => { if (T <= 363.15) assert.ok(Math.abs(h.deviations[k]) < (model === "PR" ? 9.5 : 13), `${T} K: ${h.deviations[k]} %`); });
  });
}

test("CHEPTA-Lab's separator with nitrogen (stream 23, 30 degC, 6925 kPa): PR + gE (MHV1) runs; SRK + gE (MHV1) still refuses CO2 + water", () => {
  const ids = ["hydrogen", "carbon-monoxide", "carbon-dioxide", "methanol", "water", "nitrogen"];
  const zp = [59.631, 1.776, 18.136, 7.485, 7.273, 5.698];
  const z = zp.map(v => v / zp.reduce((a, b) => a + b, 0));
  const liq = s => s.flash({ T: 303.15, P: 6925, z }).phases.find(q => q.type === "liquid").composition;
  const mh = liq(system({ components: ids, model: "PR", mixing: "MHV1" }));
  const pr = liq(system({ components: ids, model: "PR" }));
  assert.ok(mh[2] > 0.022 && mh[2] < 0.026, `CO2 ${mh[2]}`);   // 2.376 mol % on 2026-11-25; PR (k_ij) 3.414
  assert.ok(mh[0] > 4 * pr[0], `H2 ${mh[0]} vs ${pr[0]}`);      // 0.418 against 0.091 mol %
  assert.ok(mh[5] > 4 * pr[5], `N2 ${mh[5]} vs ${pr[5]}`);      // 0.100 against 0.016 mol %
  assert.throws(() => system({ components: ids, model: "SRK", mixing: "MHV1" }), /Carbon dioxide \+ Water/);
});

test("pair coverage (validation/pair_coverage.mjs): every gas + liquid pair of the separator has a PR + gE (MHV1) set", () => {
  const rows = coverage(["carbon-dioxide", "hydrogen", "carbon-monoxide", "nitrogen", "methanol", "water"]);
  assert.equal(rows.length, 8);
  for (const r of rows) assert.match(r["PR + gE (MHV1)"], /^fitted in the rule/, r.pair);
  assert.match(rows.find(r => r.pair === "carbon-dioxide + water")["SRK + gE (MHV1)"], /REFUSED/);
  assert.match(rows.find(r => r.pair === "nitrogen + water")["PR k_ij"], /none/);
});
