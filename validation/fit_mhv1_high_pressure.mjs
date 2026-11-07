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
 * uses; one outside it is recorded only, unless the maintainer decided to write it with a fit-quality known issue
 * (WARNED; the maintainer, 2026-11-07).
 *
 * Also (the maintainer, 2026-11-07, on #214):
 *   - CO2 + water once more with NRTL's alpha fitted as a fifth parameter (variant "alpha"), written only if it beats
 *     the k_ij = a + b / T of validation/data/eos/high_pressure_fits.json in P and in gas solubility;
 *   - the gas + water pairs of the CO2-to-methanol separator: CH4 + water to its ThermoML articles as above; H2 + water
 *     and CO + water, for which the ThermoML Archive has no liquid + gas set (validation/data/vle/archive_index.json),
 *     to the Henry's law constants of IAPWS G7-04 (an official guideline, the first source of AGENTS.md rule 1;
 *     src/data/henry.json): H at the solvent's saturation pressure is lim f_gas / x_gas = phi_gas,L(x -> 0) P_sat,water,
 *     fitted at 278.15-398.15 K every 10 K (within G7-04's range and the window), the gas's tau_12 = 0 and
 *     tau_21 = a_21 + b_21 / T (at infinite dilution ln gamma_gas = tau_21 + tau_12 G_12, so two parameters), held to
 *     the same gate as an AAD in H.
 *
 * Usage: node validation/fit_mhv1_high_pressure.mjs [--write] [--only gas+solvent] [--model SRK|PR]
 *        node validation/fit_mhv1_high_pressure.mjs --from-results --write   (src/data/mhv1.json from mhv1_fits.json)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { system } from "../src/index.js";
import { GATE } from "./fit_kij_literature.mjs";
import { WINDOW, PAIRS as KIJ_PAIRS, articles, fitted, lnP, errors } from "./fit_kij_high_pressure.mjs";
import { henry } from "../src/thermo/henry.js";

const ROOT = new URL("../", import.meta.url);
export const ALPHA = 0.3;
/** The pairs fitted to ThermoML P-x data: those of the k_ij fits, and CH4 + water for the separator (2026-11-07). */
export const PAIRS = [...KIJ_PAIRS, ["methane", "water"]];
/** Fitted to the IAPWS G7-04 Henry's law constants (no ThermoML liquid + gas set). */
export const HENRY_PAIRS = [["hydrogen", "water"], ["carbon-monoxide", "water"]];
const D07 = "the maintainer, 2026-11-07 (docs/decisions/2026-11-06-02-mhv1.md)";
/** Written outside GATE with a fit-quality known issue. */
// CH4 + water is held, not written: its nine ThermoML articles disagree (Campos et al. 2010 +33 % and Kim et al. 2008
// -43 % in P against NRTL parameters fitted to IAPWS G7-04, the other seven within about 15 %), so the pooling rule of
// docs/DATA_RULES.md section 3 holds the pair for the maintainer's choice; CH4 is not in the separator's mixture.
export const WARNED = { "hydrogen+methanol": D07, "carbon-dioxide+methanol": D07, "methane+methanol": D07, "hydrogen+water": D07, "carbon-monoxide+water": D07 };
/** The pair tried once more with alpha fitted, written only if it beats k_ij = a + b / T. */
export const ALPHA_TRY = ["carbon-dioxide", "water"];

const mhv1 = (pair, model, [a12, a21, b12, b21], alpha = ALPHA) => system({ components: pair, model,
  mixing: { rule: "MHV1", nrtl: { a: [[0, a12], [a21, 0]], b: [[0, b12], [b21, 0]], alpha: [[0, alpha], [alpha, 0]] } } });

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

export function fitPair(pair, model, { freeAlpha = false, start = null } = {}) {
  const arts = articles(...pair);
  const pts = arts.flatMap(a => a.rows.filter(fitted).map(r => ({ ...r, w: 1 / a.rows.filter(fitted).length })));
  const toParams = p => [p[0], p[1], 100 * p[2], 100 * p[3]];
  const alphaOf = p => (freeAlpha ? p[4] : ALPHA);
  const obj = p => {
    if (freeAlpha && !(p[4] > 0.05 && p[4] < 1)) return 1e9;   // alpha kept between 0.05 and 1
    let s;
    try { s = mhv1(pair, model, toParams(p), alphaOf(p)); } catch { return 1e9; }
    return pts.reduce((acc, r) => { const v = lnP(s, r); return acc + r.w * (v == null ? 1 : v * v); }, 0);
  };
  // two starts (tau = 0, and a small positive tau of the gas in the liquid), the better kept; with alpha free, one
  // start from the fit with alpha = 0.3
  const starts = freeAlpha ? [[start.a_ij, start.a_ji, start.b_ij / 100, start.b_ji / 100, ALPHA]] : [[0, 0, 0, 0], [0, 0, 3, 0]];
  const runs = starts.map(x0 => { const p = nelderMead(obj, x0, freeAlpha ? [0.5, 0.5, 1, 1, 0.1] : [0.5, 0.5, 1, 1], freeAlpha ? 600 : 400); return { p, f: obj(p) }; });
  const best = runs.sort((u, v) => u.f - v.f)[0];
  const q = toParams(best.p);
  const params = { a_ij: round(q[0], 4), a_ji: round(q[1], 4), b_ij: round(q[2], 2), b_ji: round(q[3], 2), alpha: round(alphaOf(best.p), 4) };
  const s = mhv1(pair, model, [params.a_ij, params.a_ji, params.b_ij, params.b_ji], params.alpha);
  const e = errors(pair, model, { system: s }, arts);
  const all = pts.map(p => ({ T: p.T, P: p.P ?? p.p1 }));
  const range = { T_K: [Math.min(...all.map(p => p.T)), Math.max(...all.map(p => p.T))], P_kPa: [Math.min(...all.map(p => p.P)), Math.max(...all.map(p => p.P))] };
  const ok = e.pooled.no_bubble_pressure === 0 && e.pooled.P_pct.aad <= GATE.P_pct;
  const p = e.pooled;
  console.log(`${model} + gE (MHV1) ${pair.join("-")}${freeAlpha ? " (alpha fitted)" : ""}: NRTL a = ${params.a_ij}, ${params.a_ji}, b = ${params.b_ij}, ${params.b_ji} K, alpha = ${params.alpha}; ${pts.length} points of `
    + `${arts.filter(a => a.rows.some(fitted)).length} articles; P AAD ${p.P_pct.aad} % (max ${p.P_pct.max}), x AAD ${p.x_pct.aad} % (max ${p.x_pct.max})`
    + `${p.y ? `, y AAD ${p.y.aad} (max ${p.y.max})` : ""}${p.no_bubble_pressure ? `, ${p.no_bubble_pressure} without a bubble pressure` : ""}${ok ? "  within GATE" : "  outside GATE"}`);
  const warned = !ok && !freeAlpha && WARNED[pair.join("+")] ? WARNED[pair.join("+")] : null;
  return { model, pair, ...(freeAlpha ? { variant: "alpha" } : {}), NRTL: params, points: pts.length, articles: arts.filter(a => a.rows.some(fitted)).length, range, ok,
    ...(warned ? { warned } : {}), errors: e, files: arts.filter(a => a.rows.some(fitted)).map(a => a.file) };
}

/** H (kPa) of the gas (component 0) in water (component 1) from the rule: phi_gas,L at x -> 0 and water's saturation pressure. */
export function henryOf(s, T) {
  const P = s.eos.psat(1, T);
  return Math.exp(s.state(T, P, [1e-9, 1 - 1e-9], "liquid").lnPhi[0]) * P;
}

export const HENRY_T = Array.from({ length: 13 }, (_, k) => 278.15 + 10 * k);

/** H2 or CO + water to the IAPWS G7-04 Henry's law constants (tau_12 = 0, tau_21 = a_21 + b_21 / T). */
export function fitHenry(pair, model) {
  const ref = HENRY_T.map(T => ({ T, H: henry(pair[0], "water", T) }));
  const sysOf = p => mhv1(pair, model, [0, p[0], 0, 100 * p[1]]);
  const dev = s => ref.map(r => Math.log(henryOf(s, r.T) / r.H));
  const obj = p => { let s; try { s = sysOf(p); return dev(s).reduce((a, v) => a + v * v, 0); } catch { return 1e9; } };
  const best = [[0, 0], [2, 0], [0, 5]].map(x0 => nelderMead(obj, x0, [0.5, 1], 400)).map(p => ({ p, f: obj(p) })).sort((u, v) => u.f - v.f)[0].p;
  const params = { a_ij: 0, a_ji: round(best[0], 4), b_ij: 0, b_ji: round(100 * best[1], 2), alpha: ALPHA };
  const d = dev(mhv1(pair, model, [0, params.a_ji, 0, params.b_ji])).map(v => 100 * (Math.exp(v) - 1));
  const aad = round(d.reduce((a, v) => a + Math.abs(v), 0) / d.length, 1), max = round(Math.max(...d.map(Math.abs)), 1);
  const ok = aad <= GATE.P_pct;
  const warned = !ok && WARNED[pair.join("+")] ? WARNED[pair.join("+")] : null;
  console.log(`${model} + gE (MHV1) ${pair.join("-")} (IAPWS G7-04 Henry's constants): NRTL a_21 = ${params.a_ji}, b_21 = ${params.b_ji} K; H AAD ${aad} % (max ${max}) at ${ref.length} temperatures${ok ? "  within GATE" : "  outside GATE"}`);
  return { model, pair, variant: "henry", NRTL: params, points: ref.length, range: { T_K: [HENRY_T[0], HENRY_T.at(-1)] }, ok, ...(warned ? { warned } : {}),
    errors: { henry_pct: { aad, max, deviations: d.map(v => round(v, 2)) } }, files: [] };
}

/** Does an alpha-fitted CO2 + water fit beat the k_ij = a + b / T of high_pressure_fits.json (P and solubility, not more points without a bubble pressure)? */
function beatsKijT(r) {
  const hp = JSON.parse(readFileSync(new URL("validation/data/eos/high_pressure_fits.json", ROOT), "utf8"));
  const t = hp.temperature_study.find(q => q.model === r.model && q.pair.join() === r.pair.join());
  const a = r.errors.pooled, b = t.errors;
  return { beats: a.P_pct.aad < b.P_pct.aad && a.x_pct.aad <= b.x_pct.aad && a.no_bubble_pressure <= b.no_bubble_pressure,
    against: { P_pct: b.P_pct.aad, x_pct: b.x_pct.aad, no_bubble_pressure: b.no_bubble_pressure } };
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

const SOURCES = JSON.parse(readFileSync(new URL("src/data/sources.json", ROOT), "utf8")).sources;
/** The sources of src/data/sources.json that list a data file (make_sources.py registers each ThermoML file). */
const sourceIds = files => Object.entries(SOURCES).filter(([, v]) => (v.files ?? []).some(f => files.some(d => f.endsWith(d)))).map(([k]) => k);

/** Is a result written to src/data/mhv1.json, the parameters the model uses? */
export const written = r => r.ok || Boolean(r.warned) || (r.variant === "alpha" && r.beats_kij_T?.beats);

const overGate = r => (r.variant === "henry" ? r.errors.henry_pct.aad : r.errors.pooled.P_pct.aad) - GATE.P_pct;
const warnText = r => (r.variant === "henry"
  ? `AAD ${r.errors.henry_pct.aad} % in the Henry's law constant against IAPWS G7-04 (max ${r.errors.henry_pct.max} %)`
  : `AAD ${r.errors.pooled.P_pct.aad} % in P (max ${r.errors.pooled.P_pct.max} %), ${r.errors.pooled.x_pct.aad} % in the gas solubility`
    + (r.errors.pooled.no_bubble_pressure ? `, ${r.errors.pooled.no_bubble_pressure} of ${r.points} points without a bubble pressure` : ""))
  + `, ${round(overGate(r), 1)} points over the gate of ${GATE.P_pct} %`;

function entry(r) {
  if (r.variant === "henry") {
    return {
      model: r.model, i: r.pair[0], j: r.pair[1], NRTL: r.NRTL, tier: "fitted", source_ids: ["iapws-g7-04"],
      source: {
        fit: `Fitted for CHEPTA with validation/fit_mhv1_high_pressure.mjs inside the MHV1 rule of ${r.model} to the Henry's law constants of IAPWS G7-04 (src/data/henry.json; `
          + `no ThermoML liquid + gas set exists for this pair) at ${r.points} temperatures, ${r.range.T_K[0]}-${r.range.T_K[1]} K: AAD ${r.errors.henry_pct.aad} % in H (max ${r.errors.henry_pct.max} %); tau_12 = 0`,
        data: ["src/data/henry.json"],
        conditions: `T = ${r.range.T_K[0]}-${r.range.T_K[1]} K, at infinite dilution`,
        T_range_K: r.range.T_K,
      },
      ...(r.ok ? {} : { quality_warning: `${warnText(r)}; written by the decision of ${r.warned}` }),
    };
  }
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
    ...(r.ok ? {} : { quality_warning: `${warnText(r)}; written by the decision of ${r.warned ?? `the maintainer, 2026-11-07: alpha fitted, better than k_ij = a + b / T (${JSON.stringify(r.beats_kij_T?.against)})`}` }),
  };
}

function main() {
  const arg = k => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
  const only = arg("--only"), models = arg("--model") ? [arg("--model")] : ["SRK", "PR"];
  const fromResults = process.argv.includes("--from-results");   // rewrite src/data/mhv1.json from mhv1_fits.json, no fit
  const part = arg("--part");   // "tpx", "henry" or "alpha": only that part
  const out = new URL("validation/data/eos/mhv1_fits.json", ROOT);
  let prev = { results: [] };
  try { prev = JSON.parse(readFileSync(out, "utf8")); } catch { /* first run */ }
  const want = p => !only || p.join("+") === only;
  const res = fromResults ? [] : [
    ...(!part || part === "tpx" ? PAIRS.filter(want).flatMap(pair => models.map(m => fitPair(pair, m))) : []),
    ...(!part || part === "henry" ? HENRY_PAIRS.filter(want).flatMap(pair => models.map(m => fitHenry(pair, m))) : []),
  ];
  if (!fromResults && (!part || part === "alpha") && want(ALPHA_TRY)) {
    for (const m of models) {
      const base = [...res, ...prev.results].find(r => r.model === m && r.pair.join() === ALPHA_TRY.join() && !r.variant);
      const r = fitPair(ALPHA_TRY, m, { freeAlpha: true, start: base.NRTL });
      r.beats_kij_T = beatsKijT(r);
      console.log(`   against k_ij = a + b / T (${JSON.stringify(r.beats_kij_T.against)}): ${r.beats_kij_T.beats ? "better: written" : "not better: not written"}`);
      res.push(r);
    }
  }
  if (!process.argv.includes("--write")) return;
  const key = r => `${r.model}|${r.pair.join("+")}|${r.variant ?? ""}`;
  const merged = [...prev.results.filter(r => !res.some(n => key(n) === key(r))), ...res];
  // the maintainer's decisions apply to results recorded before them too
  for (const r of merged) if (!r.ok && r.variant !== "alpha") { if (WARNED[r.pair.join("+")]) r.warned = WARNED[r.pair.join("+")]; else delete r.warned; }
  writeFileSync(out, JSON.stringify({
    _about: "Written by validation/fit_mhv1_high_pressure.mjs --write: NRTL parameters fitted inside the MHV1 rule of SRK and PR, with their errors (the measures of high_pressure_fits.json). Within GATE they are written to src/data/mhv1.json.",
    gate: GATE, window: WINDOW, alpha: ALPHA, results: merged,
  }, null, 1) + "\n");
  const dataFile = new URL("src/data/mhv1.json", ROOT);
  const data = JSON.parse(readFileSync(dataFile, "utf8"));
  // one set per pair and model: the alpha variant where it is written, else the base fit
  const chosen = merged.filter(written).filter(r => r.variant === "alpha" || !merged.some(q => q !== r && q.variant === "alpha" && written(q) && q.model === r.model && q.pair.join() === r.pair.join()));
  data.pairs = chosen.map(entry);
  writeFileSync(dataFile, JSON.stringify(data, null, 1) + "\n");
  // the fit-quality known issues of the sets written outside the gate, replaced on every run
  const KI = new URL("src/data/known-issues.json", ROOT);
  const known = JSON.parse(readFileSync(KI, "utf8"));
  known.issues = known.issues.filter(k => !(k.kind === "fit-quality" && k.mixing === "MHV1")).concat(chosen.filter(r => !r.ok).map(r => ({
    components: r.pair, model: r.model, mixing: "MHV1", kind: "fit-quality",
    message: `These NRTL parameters inside the MHV1 rule of ${r.model} are fitted to open data but follow them less closely than the gate: ${warnText(r)}. Use with care.`,
    reference: r.variant === "henry" ? "src/data/henry.json" : r.files.map(f => `validation/data/eos/${f}`).join(", "),
    source_ids: r.variant === "henry" ? ["iapws-g7-04"] : sourceIds(r.files),
  })));
  writeFileSync(KI, JSON.stringify(known, null, 2) + "\n");
  console.log(`wrote validation/data/eos/mhv1_fits.json (${merged.length} fits) and src/data/mhv1.json (${data.pairs.length} sets, ${chosen.filter(r => !r.ok).length} with a fit-quality warning)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
