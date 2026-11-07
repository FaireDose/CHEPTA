#!/usr/bin/env node
/**
 * NRTL parameters fitted inside the MHV1 mixing rule ("SRK/PR + gE (MHV1)", src/thermo/eos/mhv1.js; proposal 0018,
 * reopened by the maintainer on 2026-11-06) to the same open high-pressure data of the NIST TRC ThermoML Archive as the
 * k_ij of validation/fit_kij_high_pressure.mjs, with the same objective, weights, window and gate, so the errors compare
 * one to one:
 *   - the sum of squared ln(P_calc / P_exp) of the bubble points at the measured T and x (ln(y_1 P / p_1) where the
 *     record gives the gas's partial pressure), each article the same total weight, a point without a bubble pressure
 *     counting as 1;
 *   - the fit window (T <= 400 K, P <= 20 MPa) and GATE (AAD 5 % in P, every point with a bubble pressure).
 * The NRTL parameters: tau_12 = a_12 + b_12 / T and tau_21 = a_21 + b_21 / T (four parameters), alpha = 0.3 (this
 * project's choice, the default of NRTL in CHEPTA), fitted by Nelder-Mead from tau = 0.
 *
 * Results (the parameters and the errors in P, gas solubility and y, pooled and per article) go to
 * validation/data/eos/mhv1_fits.json. A fit within GATE is written to src/data/mhv1.json, the parameters the model
 * uses; one outside it is recorded only.
 *
 * Usage: node validation/fit_mhv1_high_pressure.mjs [--write] [--only gas+solvent] [--model SRK|PR]
 *        node validation/fit_mhv1_high_pressure.mjs --from-results --write   (src/data/mhv1.json from mhv1_fits.json)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { system } from "../src/index.js";
import { GATE } from "./fit_kij_literature.mjs";
import { WINDOW, PAIRS, articles, fitted, lnP, errors } from "./fit_kij_high_pressure.mjs";

const ROOT = new URL("../", import.meta.url);
export const ALPHA = 0.3;

const mhv1 = (pair, model, [a12, a21, b12, b21]) => system({ components: pair, model,
  mixing: { rule: "MHV1", nrtl: { a: [[0, a12], [a21, 0]], b: [[0, b12], [b21, 0]], alpha: [[0, ALPHA], [ALPHA, 0]] } } });

/** Nelder-Mead on p = [a12, a21, b12 / 100 K, b21 / 100 K]. */
function nelderMead(f, x0, step, maxIt = 400) {
  const n = x0.length;
  let S = [x0, ...x0.map((_, i) => x0.map((v, j) => v + (i === j ? step[j] : 0)))];
  let F = S.map(f);
  for (let it = 0; it < maxIt; it++) {
    const o = S.map((_, i) => i).sort((i, j) => F[i] - F[j]); S = o.map(i => S[i]); F = o.map(i => F[i]);
    if (Math.abs(F[n] - F[0]) < 1e-9 * (1 + Math.abs(F[0]))) break;
    const c = x0.map((_, j) => S.slice(0, n).reduce((a, s) => a + s[j], 0) / n);
    const at = t => c.map((v, j) => v + t * (S[n][j] - v));
    const r = at(-1), fr = f(r);
    if (fr < F[0]) { const e = at(-2), fe = f(e); [S[n], F[n]] = fe < fr ? [e, fe] : [r, fr]; }
    else if (fr < F[n - 1]) { S[n] = r; F[n] = fr; }
    else {
      const k = at(fr < F[n] ? -0.5 : 0.5), fk = f(k);
      if (fk < Math.min(fr, F[n])) { S[n] = k; F[n] = fk; }
      else for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); F[i] = f(S[i]); }
    }
  }
  return S[0];
}

export function fitPair(pair, model) {
  const arts = articles(...pair);
  const pts = arts.flatMap(a => a.rows.filter(fitted).map(r => ({ ...r, w: 1 / a.rows.filter(fitted).length })));
  const toParams = p => [p[0], p[1], 100 * p[2], 100 * p[3]];
  const obj = p => {
    let s;
    try { s = mhv1(pair, model, toParams(p)); } catch { return 1e9; }
    return pts.reduce((acc, r) => { const v = lnP(s, r); return acc + r.w * (v == null ? 1 : v * v); }, 0);
  };
  // two starts (tau = 0, and a small positive tau of the gas in the liquid), the better kept
  const runs = [[0, 0, 0, 0], [0, 0, 3, 0]].map(x0 => { const p = nelderMead(obj, x0, [0.5, 0.5, 1, 1]); return { p, f: obj(p) }; });
  const best = runs.sort((u, v) => u.f - v.f)[0];
  const q = toParams(best.p);
  const params = { a_ij: round(q[0], 4), a_ji: round(q[1], 4), b_ij: round(q[2], 2), b_ji: round(q[3], 2), alpha: ALPHA };
  const s = mhv1(pair, model, [params.a_ij, params.a_ji, params.b_ij, params.b_ji]);
  const e = errors(pair, model, { system: s }, arts);
  const all = pts.map(p => ({ T: p.T, P: p.P ?? p.p1 }));
  const range = { T_K: [Math.min(...all.map(p => p.T)), Math.max(...all.map(p => p.T))], P_kPa: [Math.min(...all.map(p => p.P)), Math.max(...all.map(p => p.P))] };
  const ok = e.pooled.no_bubble_pressure === 0 && e.pooled.P_pct.aad <= GATE.P_pct;
  const p = e.pooled;
  console.log(`${model} + gE (MHV1) ${pair.join("-")}: NRTL a = ${params.a_ij}, ${params.a_ji}, b = ${params.b_ij}, ${params.b_ji} K; ${pts.length} points of `
    + `${arts.filter(a => a.rows.some(fitted)).length} articles; P AAD ${p.P_pct.aad} % (max ${p.P_pct.max}), x AAD ${p.x_pct.aad} % (max ${p.x_pct.max})`
    + `${p.y ? `, y AAD ${p.y.aad} (max ${p.y.max})` : ""}${p.no_bubble_pressure ? `, ${p.no_bubble_pressure} without a bubble pressure` : ""}${ok ? "  within GATE" : "  outside GATE"}`);
  return { model, pair, NRTL: params, points: pts.length, articles: arts.filter(a => a.rows.some(fitted)).length, range, ok, errors: e,
    files: arts.filter(a => a.rows.some(fitted)).map(a => a.file) };
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

const SOURCES = JSON.parse(readFileSync(new URL("src/data/sources.json", ROOT), "utf8")).sources;
/** The sources of src/data/sources.json that list a data file (make_sources.py registers each ThermoML file). */
const sourceIds = files => Object.entries(SOURCES).filter(([, v]) => (v.files ?? []).some(f => files.some(d => f.endsWith(d)))).map(([k]) => k);

function entry(r) {
  const q = r.errors.pooled;
  return {
    model: r.model, i: r.pair[0], j: r.pair[1], NRTL: r.NRTL, tier: "fitted", source_ids: sourceIds(r.files),
    source: {
      fit: `Fitted for CHEPTA with validation/fit_mhv1_high_pressure.mjs inside the MHV1 rule of ${r.model} to the ${r.points} bubble pressures of ${r.articles} article${r.articles > 1 ? "s" : ""} `
        + `of the NIST TRC ThermoML Archive (each article the same total weight), ${r.range.T_K[0]}-${r.range.T_K[1]} K, ${r.range.P_kPa[0]}-${r.range.P_kPa[1]} kPa: `
        + `AAD ${q.P_pct.aad} % in P (max ${q.P_pct.max} %), gas solubility at the measured T and P AAD ${q.x_pct.aad} % (max ${q.x_pct.max} %)${q.y ? `, ${q.y.aad} in y (max ${q.y.max}, ${q.y.points} points)` : ""}`,
      data: r.files.map(f => `validation/data/eos/${f}`),
      conditions: `T = ${r.range.T_K[0]}-${r.range.T_K[1]} K, P = ${r.range.P_kPa[0]}-${r.range.P_kPa[1]} kPa`,
      T_range_K: r.range.T_K,
    },
  };
}

function main() {
  const arg = k => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
  const only = arg("--only"), models = arg("--model") ? [arg("--model")] : ["SRK", "PR"];
  const fromResults = process.argv.includes("--from-results");   // rewrite src/data/mhv1.json from mhv1_fits.json, no fit
  const res = fromResults ? [] : PAIRS.filter(p => !only || p.join("+") === only).flatMap(pair => models.map(m => fitPair(pair, m)));
  if (!process.argv.includes("--write")) return;
  const out = new URL("validation/data/eos/mhv1_fits.json", ROOT);
  let prev = { results: [] };
  try { prev = JSON.parse(readFileSync(out, "utf8")); } catch { /* first run */ }
  const key = r => `${r.model}|${r.pair.join("+")}`;
  const merged = [...prev.results.filter(r => !res.some(n => key(n) === key(r))), ...res];
  writeFileSync(out, JSON.stringify({
    _about: "Written by validation/fit_mhv1_high_pressure.mjs --write: NRTL parameters fitted inside the MHV1 rule of SRK and PR, with their errors (the measures of high_pressure_fits.json). Within GATE they are written to src/data/mhv1.json.",
    gate: GATE, window: WINDOW, alpha: ALPHA, results: merged,
  }, null, 1) + "\n");
  const dataFile = new URL("src/data/mhv1.json", ROOT);
  const data = JSON.parse(readFileSync(dataFile, "utf8"));
  data.pairs = merged.filter(r => r.ok).map(entry);
  writeFileSync(dataFile, JSON.stringify(data, null, 1) + "\n");
  console.log(`wrote validation/data/eos/mhv1_fits.json (${merged.length} fits) and src/data/mhv1.json (${data.pairs.length} within GATE)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
