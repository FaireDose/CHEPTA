import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system } from "../src/index.js";
import { splitLL } from "../src/equilibrium/flash.js";

// Water + acetic acid + ethyl acetate, the jointly fitted sets "fitted-lle-roque2018" (validation/python/
// fit_ternary_lle.py; proposal 0015, Part I, section 6, item 1). Two kinds of check:
//  1. the engine's liquid-liquid split against the independent Python model (validation/fixtures/ternary_lle.json):
//     the same two liquids at every tie line's midpoint;
//  2. the model against the measured tie lines: Roque et al. (2018) were fitted (a guard of the fit quality, not an
//     independent validation), Toikka et al. (2014) were not (an independent check, whose ester-rich liquid is drier
//     in water than the binary data; see the data file). The limits are the fit's own deviations, rounded up.
const load = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const FIX = load("../validation/fixtures/ternary_lle.json");
const IDS = ["water", "acetic-acid", "ethyl-acetate"];
const SET = "fitted-lle-roque2018";
const sets = { "water+acetic-acid": SET, "water+ethyl-acetate": SET, "ethyl-acetate+acetic-acid": SET };
const make = model => system({ components: IDS, model, sets });

// the engine's two liquids at the midpoint of a tie line, ordered as the data (I richer in water)
function engineTie(s, T, a, b) {
  const z = a.map((v, i) => (v + b[i]) / 2);
  const ll = splitLL(s, z, T, a.map((v, i) => Math.max(b[i], 1e-4) / Math.max(v, 1e-4)));
  if (!ll) return null;
  return ll.x1[0] > ll.x2[0] ? [ll.x1, ll.x2] : [ll.x2, ll.x1];
}

test("the three pairs of the joint fit are fitted, non-default sets chosen together", () => {
  for (const model of ["NRTL", "UNIQUAC"]) {
    const s = make(model);
    assert.equal(s.info.pairs.length, 3, model);
    for (const p of s.info.pairs) assert.equal(p.tier, "fitted", `${model} ${p.i}+${p.j}`);
  }
});

test("the engine's liquid-liquid split equals the independent Python model's at every tie line", () => {
  assert.ok(FIX.cases.filter(c => c.x_I).length >= 40);
  for (const c of FIX.cases) {
    const s = make(c.model);
    const ll = splitLL(s, c.z, c.T_K, c.K0.slice());   // started as the Python model is
    if (c.x_I === null) { assert.equal(ll, null, `${c.model} ${c.file} ${c.T_K} K: Python finds one liquid`); continue; }
    assert.ok(ll, `${c.model} ${c.file} ${c.T_K} K: one liquid`);
    const [I, II] = ll.x1[0] > ll.x2[0] ? [ll.x1, ll.x2] : [ll.x2, ll.x1];
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(I[i] - c.x_I[i]) < 1e-6 && Math.abs(II[i] - c.x_II[i]) < 1e-6, `${c.model} ${c.T_K} K, ${IDS[i]}`);
    }
  }
});

// mean absolute deviation per mole fraction [water, acid, ester] in liquid I, then in liquid II; limits = the fit's
// deviations (fit_ternary_lle.py output), rounded up
const LIMITS = {
  "water_acetic-acid_ethyl-acetate_lle_roque2018.json": { NRTL: { acid: 0.008, all: 0.025 }, UNIQUAC: { acid: 0.011, all: 0.045 } },
  "water_acetic-acid_ethyl-acetate_lle_toikka2014.json": { NRTL: { acid: 0.010, all: 0.07 }, UNIQUAC: { acid: 0.010, all: 0.08 } },
};
for (const [file, limits] of Object.entries(LIMITS)) {
  test(`${file}: the jointly fitted sets follow the measured tie lines`, () => {
    const d = load(`../validation/data/lle/${file}`);
    assert.equal(d.kind, "ternary-lle");
    assert.deepEqual(d.components, IDS);
    assert.ok(d.source.citation && d.source.doi && d.source.open_copy && d.source.access && d.source.tables, "source block");
    for (const model of ["NRTL", "UNIQUAC"]) {
      const s = make(model), lim = limits[model];
      const sum = Array(6).fill(0);
      let n = 0;
      for (const r of d.rows) {
        const a = r.slice(1, 4), b = r.slice(4, 7);
        const o = engineTie(s, r[0], a, b);
        if (!o) continue;   // a tie line near the plait point the model puts in one liquid
        n++;
        [...o[0].map((v, i) => v - a[i]), ...o[1].map((v, i) => v - b[i])].forEach((v, k) => { sum[k] += Math.abs(v); });
      }
      assert.ok(n >= d.rows.length - 2, `${model}: ${d.rows.length - n} tie lines without a split`);
      const aad = sum.map(v => v / n);
      assert.ok(aad[1] < lim.acid && aad[4] < lim.acid, `${model}: acetic acid AAD ${aad[1].toFixed(4)} / ${aad[4].toFixed(4)}`);
      assert.ok(Math.max(...aad) < lim.all, `${model}: AAD ${aad.map(v => v.toFixed(4)).join(", ")}`);
    }
  });
}

test("the default sets (binary data alone) miss the measured tie lines: the reason for the joint fit", () => {
  const d = load("../validation/data/lle/water_acetic-acid_ethyl-acetate_lle_roque2018.json");
  const s = system({ components: IDS, model: "NRTL" });
  let worst = 0;
  for (const r of d.rows) {
    const o = engineTie(s, r[0], r.slice(1, 4), r.slice(4, 7));
    if (o) worst = Math.max(worst, ...o[1].map((v, i) => Math.abs(v - r[4 + i])));
  }
  assert.ok(worst > 0.1, `largest deviation ${worst.toFixed(3)}`);
});
