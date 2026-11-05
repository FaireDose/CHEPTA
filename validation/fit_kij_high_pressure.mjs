#!/usr/bin/env node
/**
 * Peng-Robinson and SRK k_ij of gases in polar liquids at high pressure, fitted to the open data of the NIST TRC
 * ThermoML Archive (the maintainer, 2026-11-04: "if the PSRK and MHV2 are not open then we do not use them, PR and SRK
 * should be ok for now"; proposal 0018 postponed). The pairs are those of a CO2-to-methanol high-pressure separator:
 * CO2 + methanol, CO2 + water, H2 + methanol, CO + methanol, CH4 + methanol.
 *
 * Data: validation/data/eos/thermoml_<gas>_<solvent>_<doi>.json, one file per article, written by
 * validation/python/hp_gas_solubility.py from the archive records (values as stored; mass fractions and molalities
 * converted to mole fractions).
 *
 * The fit, as in validation/fit_kij_literature.mjs (whose GATE it uses): one constant k_ij per pair and model,
 * minimizing the sum of squared ln(P_calc / P_exp) of the bubble points at the measured T and liquid x, a point
 * without a bubble pressure counting as a residual of 1. Two differences, both stated in the record:
 *   - every article has the same total weight (each point 1 / n_article), so a long series does not decide the
 *     k_ij alone (the pooling rule of docs/DATA_RULES.md section 3, with the weights of its point 1);
 *   - where the record gives the partial pressure of the gas (p_1_kPa) and not the total pressure, the residual is
 *     ln(y_1 P / p_1) of the bubble point.
 * The fit takes the points with T <= WINDOW.T_K and P <= WINDOW.P_kPa; the others are counted and named.
 *
 * Then, at the fitted k_ij and at the databank k_ij of src/data/kij.json where there is one, for every point:
 *   - the error in P (or p_1) of the bubble point at the measured T and x;
 *   - the gas solubility: the liquid mole fraction of the gas at the measured T and P (the binary two-phase state is
 *     fixed by T and P), against the measured x, as a relative error;
 *   - the vapour mole fraction at the measured T and P, against the measured y where the record has one.
 * Mean and maximum per article and per pair go to validation/data/eos/high_pressure_fits.json. A k_ij within GATE
 * (AAD in P, every point with a bubble pressure) is an entry there, which validation/python/eos_fit_kij.py merges
 * into src/data/kij.json; a k_ij outside it is listed under "rejected" with its errors and is not used.
 *
 * Usage: node validation/fit_kij_high_pressure.mjs [--write] [--only gas+solvent]
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { system } from "../src/index.js";
import { GATE } from "./fit_kij_literature.mjs";

const ROOT = new URL("../", import.meta.url);
const DIR = new URL("validation/data/eos/", ROOT);
const read = p => JSON.parse(readFileSync(new URL(p, ROOT), "utf8"));

/** The range of the fit: the methanol synthesis loop and its separator (5-10 MPa, up to about 530 K in the reactor,
 *  near 300-330 K in the separator) and absorbers at low temperature, with a margin; above it the archive holds
 *  geological CO2 + water data to 120 MPa and 573 K, which a single constant k_ij would be fitted to at the cost of
 *  the range CHEPTA-Lab needs. */
export const WINDOW = { T_K: 400, P_kPa: 20000 };

export const PAIRS = [
  ["carbon-dioxide", "methanol"], ["carbon-dioxide", "water"], ["hydrogen", "methanol"], ["carbon-monoxide", "methanol"], ["methane", "methanol"],
];

const kij = read("src/data/kij.json");

/** The articles of a pair: [{ file, cite, rows: [{ T, P, p1, x, y }] }]. */
export function articles(gas, solv) {
  return readdirSync(DIR).filter(f => f.startsWith(`thermoml_${gas}_${solv}_`)).sort().map(file => {
    const d = JSON.parse(readFileSync(new URL(file, DIR), "utf8"));
    if (d.components.join() !== [gas, solv].join()) throw new Error(`${file}: components ${d.components}`);
    const c = Object.fromEntries(d.columns.map((k, n) => [k, n]));
    const au = d.source.citation.split(",")[0].split(" ").pop();
    const yr = d.source.citation.match(/\((\d{4})\)/)?.[1];
    return { file, cite: `${au}${d.source.citation.split(",").length > 2 ? " et al." : ""} (${yr})`,
      rows: d.rows.map(r => ({ T: r[c.T_K], P: r[c.P_kPa], p1: r[c.p_1_kPa], x: r[c.x_1], y: r[c.y_1] })) };
  });
}

const inWindow = r => r.T <= WINDOW.T_K && (r.P ?? r.p1) <= WINDOW.P_kPa;
const fitted = r => r.x != null && r.x > 0 && r.x < 1 && inWindow(r);

const sys = (pair, model, k) => system({ components: pair, model, kij: [[0, k], [k, 0]] });

/** ln of calculated over measured pressure (total, or partial of the gas) of the bubble point at T and x; null if none. */
function lnP(s, r) {
  try {
    const b = s.bubbleP([r.x, 1 - r.x], r.T);
    return r.P != null ? Math.log(b.P / r.P) : Math.log(b.y[0] * b.P / r.p1);
  } catch { return null; }
}

/** The two-phase state at the measured T and P (or partial pressure): the liquid x of the gas whose bubble pressure
 *  is the measured one, by bisection on ln x, and the vapour y there; null where the equation of state has none. */
function atTP(s, r, x0) {
  const g = lx => { try { const b = s.bubbleP([Math.exp(lx), 1 - Math.exp(lx)], r.T); return { v: r.P != null ? Math.log(b.P / r.P) : Math.log(b.y[0] * b.P / r.p1), y: b.y[0] }; } catch { return null; } };
  let a = Math.log(x0), fa = g(a);
  if (!fa) return null;
  let b = a, fb = fa;
  const step = fa.v > 0 ? -0.4 : 0.4;
  for (let n = 0; n < 40 && fb && fb.v * fa.v > 0; n++) {
    a = b; fa = fb; b = Math.min(b + step, Math.log(0.999)); fb = g(b);
    if (b >= Math.log(0.999) && fb && fb.v * fa.v > 0) return null;
  }
  if (!fb) {   // past the mixture critical point: shrink the step back toward the last state with a bubble point
    let lo = a, hi = b;
    for (let n = 0; n < 30; n++) { const m = (lo + hi) / 2, fm = g(m); if (fm) { lo = m; if (fm.v * fa.v <= 0) { b = m; fb = fm; break; } } else hi = m; }
    if (!fb || fb.v * fa.v > 0) return null;
  }
  for (let n = 0; n < 50 && Math.abs(b - a) > 1e-7; n++) {
    const m = (a + b) / 2, fm = g(m);
    if (!fm) return null;
    if (fm.v * fa.v <= 0) { b = m; fb = fm; } else { a = m; fa = fm; }
  }
  return { x: Math.exp((a + b) / 2), y: fb.y };
}

function minimize(f, lo = -0.5, hi = 0.5) {
  let best = lo, fb = Infinity;
  for (let k = lo; k <= hi + 1e-9; k += 0.02) { const v = f(k); if (v < fb) { fb = v; best = k; } }
  let a = best - 0.02, b = best + 0.02;
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  while (b - a > 1e-5) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return Math.round(((a + b) / 2) * 1e4) / 1e4;
}

const mean = a => a.length ? a.reduce((p, v) => p + v, 0) / a.length : null;
const maxAbs = a => a.length ? Math.max(...a.map(Math.abs)) : null;
const r1 = v => v == null ? null : Math.round(v * 10) / 10;
const r4 = v => v == null ? null : Math.round(v * 1e4) / 1e4;

/** Errors of the pair's articles at k: per article and pooled, in the fit window. */
function errors(pair, model, k, arts) {
  const s = sys(pair, model, k);
  const per = arts.map(a => {
    const dP = [], dx = [], dy = [];
    let noBubble = 0, noState = 0;
    for (const r of a.rows.filter(inWindow)) {
      if (r.x != null && r.x > 0 && r.x < 1) {
        const v = lnP(s, r);
        if (v == null) noBubble++; else dP.push(100 * (Math.exp(v) - 1));
      }
      const st = atTP(s, r, r.x ?? 0.01);
      if (!st) { noState++; continue; }
      if (r.x != null && r.x > 0 && r.x < 1) dx.push(100 * (st.x / r.x - 1));
      if (r.y != null) dy.push(st.y - r.y);
    }
    return { file: a.file, cite: a.cite, points: a.rows.filter(fitted).length, dP, dx, dy, noBubble, noState };
  });
  const sum = list => ({
    P_pct: { aad: r1(mean(list.flatMap(p => p.dP).map(Math.abs))), bias: r1(mean(list.flatMap(p => p.dP))), max: r1(maxAbs(list.flatMap(p => p.dP))) },
    x_pct: { aad: r1(mean(list.flatMap(p => p.dx).map(Math.abs))), bias: r1(mean(list.flatMap(p => p.dx))), max: r1(maxAbs(list.flatMap(p => p.dx))) },
    y: list.some(p => p.dy.length) ? { aad: r4(mean(list.flatMap(p => p.dy).map(Math.abs))), max: r4(maxAbs(list.flatMap(p => p.dy))), points: list.flatMap(p => p.dy).length } : null,
    no_bubble_pressure: list.reduce((a, p) => a + p.noBubble, 0), no_two_phase_state: list.reduce((a, p) => a + p.noState, 0),
  });
  return { pooled: sum(per), articles: per.map(p => ({ file: p.file, cite: p.cite, points: p.points, ...sum([p]) })) };
}

export function fitPair(pair) {
  const arts = articles(...pair);
  const pts = arts.flatMap(a => a.rows.filter(fitted).map(r => ({ ...r, w: 1 / a.rows.filter(fitted).length })));
  const outside = arts.flatMap(a => a.rows.filter(r => r.x != null && r.x > 0 && r.x < 1 && !inWindow(r)));
  const yOnly = arts.flatMap(a => a.rows.filter(r => r.x == null));
  const all = pts.map(p => ({ T: p.T, P: p.P ?? p.p1 }));
  const range = { T_K: [Math.min(...all.map(p => p.T)), Math.max(...all.map(p => p.T))], P_kPa: [Math.min(...all.map(p => p.P)), Math.max(...all.map(p => p.P))] };
  const out = [];
  for (const model of ["PR", "SRK"]) {
    const obj = k => { const s = sys(pair, model, k); return pts.reduce((a, p) => { const v = lnP(s, p); return a + p.w * (v == null ? 1 : v * v); }, 0); };
    const k = minimize(obj);
    // each article's own k_ij: where articles at the same temperatures need different k_ij, the data disagree; where
    // the k_ij drifts with the temperature of the articles, a constant k_ij is the limit
    const own = arts.filter(a => a.rows.some(fitted)).map(a => {
      const p = a.rows.filter(fitted);
      const ka = minimize(kk => { const s = sys(pair, model, kk); return p.reduce((acc, r) => { const v = lnP(s, r); return acc + (v == null ? 1 : v * v); }, 0); });
      return { file: a.file, kij: ka, T_K: [Math.min(...p.map(r => r.T)), Math.max(...p.map(r => r.T))] };
    });
    const e = errors(pair, model, k, arts);
    const db = kij.pairs.find(p => p.model === model && new Set([p.i, p.j]).has(pair[0]) && new Set([p.i, p.j]).has(pair[1]));
    const dbk = db ? (db.tier === "databank" ? db.kij : db.replaced?.kij) : null;
    const ok = e.pooled.no_bubble_pressure === 0 && e.pooled.P_pct.aad <= GATE.P_pct;
    out.push({ model, pair, kij: k, ok, range, points: pts.length, articles: arts.filter(a => a.rows.some(fitted)).length, outside_window: outside.length,
      vapour_only_rows: yOnly.length, errors: e, own_kij: own,
      databank: dbk == null ? null : { kij: dbk, errors: errors(pair, model, dbk, arts).pooled } });
    const q = e.pooled;
    console.log(`${model} ${pair.join("-")}: k_ij = ${k.toFixed(4)}, ${pts.length} points of ${out.at(-1).articles} articles, T ${range.T_K.join("-")} K, P ${range.P_kPa.join("-")} kPa; `
      + `P AAD ${q.P_pct.aad} % (max ${q.P_pct.max}), x AAD ${q.x_pct.aad} % (max ${q.x_pct.max})${q.y ? `, y AAD ${q.y.aad} (max ${q.y.max}, ${q.y.points})` : ""}`
      + `${q.no_bubble_pressure ? `, ${q.no_bubble_pressure} without a bubble pressure` : ""}${ok ? "" : "  NOT WRITTEN (outside GATE)"}`
      + (dbk != null ? `\n   databank k_ij = ${dbk}: P AAD ${out.at(-1).databank.errors.P_pct.aad} %, x AAD ${out.at(-1).databank.errors.x_pct.aad} %` : ""));
    for (const o of own) console.log(`   own k_ij ${o.kij.toFixed(3)}  T ${o.T_K.join("-")} K  ${o.file}`);
  }
  return out;
}

function entry(r) {
  const [i, j] = r.pair;
  const q = r.errors.pooled;
  const files = r.errors.articles.filter(a => a.points).map(a => a);
  return {
    model: r.model, i, j, kij: r.kij, tier: "fitted",
    source: {
      fit: `Fitted for CHEPTA with validation/fit_kij_high_pressure.mjs to the ${r.points} bubble pressures of ${r.articles} article${r.articles > 1 ? "s" : ""} of the NIST TRC ThermoML Archive (each article the same total weight), `
        + `${r.range.T_K[0]}-${r.range.T_K[1]} K, ${r.range.P_kPa[0]}-${r.range.P_kPa[1]} kPa: AAD ${q.P_pct.aad} % in P (max ${q.P_pct.max} %), `
        + `gas solubility at the measured T and P AAD ${q.x_pct.aad} % (max ${q.x_pct.max} %)${q.y ? `, ${q.y.aad} in y (max ${q.y.max}, ${q.y.points} points)` : ""}`,
      data: files.map(a => `validation/data/eos/${a.file}`),
      conditions: `T = ${r.range.T_K[0]}-${r.range.T_K[1]} K, P = ${r.range.P_kPa[0]}-${r.range.P_kPa[1]} kPa`,
      T_range_K: r.range.T_K,
    },
  };
}

function main() {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const res = PAIRS.filter(p => !only || p.join("+") === only).flatMap(fitPair);
  if (!process.argv.includes("--write")) return;
  writeFileSync(new URL("high_pressure_fits.json", DIR), JSON.stringify({
    _about: "Written by validation/fit_kij_high_pressure.mjs --write: the k_ij within its GATE (merged into src/data/kij.json by validation/python/eos_fit_kij.py) "
      + "and the fits outside it, with their errors at the fitted and the databank k_ij. P_pct: bubble pressure at the measured T and x, (calc / exp - 1) in %; "
      + "x_pct: liquid mole fraction of the gas at the measured T and P, (calc / exp - 1) in %; y: vapour mole fraction of the gas at the measured T and P, calc - exp.",
    gate: GATE, window: WINDOW,
    entries: res.filter(r => r.ok).map(entry),
    results: res,
  }, null, 1) + "\n");
  console.log(`wrote validation/data/eos/high_pressure_fits.json: ${res.filter(r => r.ok).length} entries, ${res.filter(r => !r.ok).length} not kept`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
