#!/usr/bin/env node
/**
 * Peng-Robinson and SRK k_ij fitted to the isothermal P-x(-y) tables of the open literature in
 * validation/data/eos/ (kind "isothermal-pxy", each file with its source block; the tables were
 * checked against the source pages, see each file's "transcription").
 *
 * The objective, as in validation/python/eos_fit_kij.py: the sum over the data points of
 * ln(P_bubble,calc / P_exp)^2 at the measured T and liquid composition, a point where the
 * equation of state finds no bubble pressure counting as a residual of 1. One constant k_ij per
 * pair and model, searched on a grid of 0.005 from -0.30 to 0.60, then refined by golden section.
 * The bubble pressures come from the engine (src/equilibrium/phi-phi.js); the independent Python
 * implementation (validation/python/reference_eos.py) recomputes a sample of points at the fitted
 * k_ij (validation/python/eos_check_literature.py), so the fit does not rest on the engine alone.
 *
 * A k_ij is kept (tier "fitted") only within GATE: an AAD of 5 % in P and a bubble pressure at
 * every data point. Otherwise the script says why and the pair keeps no k_ij. With --write the
 * kept entries go to validation/data/eos/literature_fits.json, which validation/python/eos_fit_kij.py
 * merges into src/data/kij.json (python validation/python/eos_fit_kij.py --literature-only --write);
 * then run validation/python/make_sources.py.
 *
 * Usage: node validation/fit_kij_literature.mjs [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { system } from "../src/index.js";

const ROOT = new URL("../", import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, ROOT), "utf8"));
export const GATE = { P_pct: 5.0 };

export const FITS = [
  { pair: ["ethane", "n-decane"], files: ["goni2024_ethane_n-decane.json"], cite: "Goni (2024)" },
  { pair: ["ethane", "n-undecane"], files: ["goni2024_ethane_n-undecane.json"], cite: "Goni (2024)" },
  { pair: ["ethane", "n-dodecane"], files: ["goni2024_ethane_n-dodecane.json"], cite: "Goni (2024)" },
  { pair: ["propane", "n-decane"], files: ["goni2024_propane_n-decane.json"], cite: "Goni (2024)" },
  { pair: ["propane", "n-undecane"], files: ["goni2024_propane_n-undecane.json"], cite: "Goni (2024)" },
  { pair: ["propane", "n-dodecane"], files: ["goni2024_propane_n-dodecane.json"], cite: "Goni (2024)" },
  { pair: ["argon", "hydrogen-sulfide"], files: ["gonzalez2017_argon_hydrogen-sulfide.json"], cite: "González Pérez (2017)" },
  { pair: ["ethylene", "propylene"], files: ["bae1981_ethylene_propylene.json"], cite: "Bae et al. (1981)" },
  { pair: ["ethylene", "1-butene"], files: ["bae1981_ethylene_1-butene.json"], cite: "Bae et al. (1981)" },
  { pair: ["carbon-dioxide", "n-decane"], files: ["inomata1986_carbon-dioxide_n-decane.json"], cite: "Inomata et al. (1986)" },
  { pair: ["ammonia", "benzene"], files: ["noda1975_ammonia_benzene.json"], cite: "Noda et al. (1975)" },
  { pair: ["sulfur-dioxide", "isooctane"], files: ["nitta1976_sulfur-dioxide_isooctane.json"], cite: "Nitta et al. (1976)" },
  { pair: ["hydrogen", "n-decane"], files: ["sebastian1980_hydrogen_n-decane.json", "sokolov1977_hydrogen_n-decane.json"],
    cite: "Sebastian et al. (1980) and Sokolov and Polyakov (1977), both as compiled by Young (1981)" },
];

/** Binary rows with a measured liquid composition, without the rows the file lists under "excluded": [{ T, x, P, y }]. */
export function points(file) {
  const d = read(`validation/data/eos/${file}`);
  const c = Object.fromEntries(d.columns.map((k, n) => [k, n]));
  const skip = new Set((d.excluded ?? []).map(e => e.row));
  return { components: d.components, pts: d.rows.flatMap((r, n) => skip.has(n) || r[c.x_1] == null || !(r[c.x_1] > 0 && r[c.x_1] < 1) ? []
    : [{ T: r[c.T_K], x: r[c.x_1], P: r[c.P_kPa], y: r[c.y_1] }]) };
}

/** Bubble pressures and vapour compositions at k: [{ P, y } | null]. */
export function bubbles(pair, model, k, pts) {
  const s = system({ components: pair, model, kij: [[0, k], [k, 0]] });
  return pts.map(p => { try { const b = s.bubbleP([p.x, 1 - p.x], p.T); return { P: b.P, y: b.y[0] }; } catch { return null; } });
}

const objective = (pair, model, pts) => k => bubbles(pair, model, k, pts)
  .reduce((a, b, n) => a + (b ? Math.log(b.P / pts[n].P) ** 2 : 1), 0);

function minimize(f) {
  let best = -0.3, fb = Infinity;
  for (let k = -0.3; k <= 0.6 + 1e-9; k += 0.005) { const v = f(k); if (v < fb) { fb = v; best = k; } }
  let a = best - 0.005, b = best + 0.005;
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  while (b - a > 1e-5) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return Math.round(((a + b) / 2) * 1e4) / 1e4;
}

const fmt = v => `${v >= 0 ? "" : "-"}${Math.abs(v).toFixed(1)}`;

export function fitAll() {
  const out = [];
  for (const fit of FITS) {
    const sets = fit.files.map(points);
    for (const s of sets) if (s.components.join() !== fit.pair.join()) throw new Error(`${fit.files}: components ${s.components}, pair ${fit.pair}`);
    const pts = sets.flatMap(s => s.pts);
    for (const model of ["PR", "SRK"]) {
      const k = minimize(objective(fit.pair, model, pts));
      const b = bubbles(fit.pair, model, k, pts);
      const missing = b.filter(v => !v).length;
      const dev = b.flatMap((v, n) => v ? [100 * (v.P / pts[n].P - 1)] : []);
      const dy = b.flatMap((v, n) => v && pts[n].y != null ? [Math.abs(v.y - pts[n].y)] : []);
      const aad = dev.reduce((a, v) => a + Math.abs(v), 0) / dev.length;
      const Ts = [...new Set(pts.map(p => p.T))].sort((a, c) => a - c);
      const q = `AAD ${aad.toFixed(2)} % in P (deviations ${fmt(Math.min(...dev))} to ${fmt(Math.max(...dev))} %)`
        + (dy.length ? `, ${(dy.reduce((a, v) => a + v, 0) / dy.length).toFixed(4)} in y (max ${Math.max(...dy).toFixed(4)}, ${dy.length} points)` : "");
      const ok = !missing && aad <= GATE.P_pct;
      console.log(`${model} ${fit.pair.join("-")}: k_ij = ${k.toFixed(4)}, ${q}, ${pts.length} points${missing ? `, ${missing} without a bubble pressure` : ""}${ok ? "" : "  NOT WRITTEN (outside GATE)"}`);
      for (const [n, v] of b.entries()) if (!v) console.log(`   no bubble pressure: T = ${pts[n].T} K, x = ${pts[n].x}, P_exp = ${pts[n].P} kPa`);
      out.push({ fit, model, k, ok, q, pts, Ts });
    }
  }
  return out;
}

function main() {
  const res = fitAll();
  if (!process.argv.includes("--write")) return;
  const entries = [];
  for (const { fit, model, k, ok, q, pts, Ts } of res) {
    if (!ok) continue;
    const [i, j] = fit.pair;
    const P = pts.map(p => p.P), X = pts.map(p => p.x);
    entries.push({
      model, i, j, kij: k, tier: "fitted",
      source: {
        fit: `Fitted for CHEPTA with validation/fit_kij_literature.mjs to the ${pts.length} bubble pressures of ${fit.cite} at ${Ts.length} temperatures, ${Ts[0]}-${Ts[Ts.length - 1]} K: ${q}`,
        data: fit.files.map(f => `validation/data/eos/${f}`),
        conditions: `T = ${Ts[0]}-${Ts[Ts.length - 1]} K, P = ${+Math.min(...P).toPrecision(4)}-${+Math.max(...P).toPrecision(4)} kPa, x_1 = ${Math.min(...X)}-${Math.max(...X)}`,
        T_range_K: [Ts[0], Ts[Ts.length - 1]],
      },
    });
  }
  const rejected = res.filter(r => !r.ok).map(r => ({ model: r.model, pair: r.fit.pair, kij: r.k, why: r.q }));
  writeFileSync(new URL("validation/data/eos/literature_fits.json", ROOT), JSON.stringify({
    _about: "Written by validation/fit_kij_literature.mjs --write: the k_ij within its GATE (merged into src/data/kij.json by validation/python/eos_fit_kij.py) and, for the record, the fits outside it.",
    gate: GATE, entries, rejected }, null, 1) + "\n");
  console.log(`wrote validation/data/eos/literature_fits.json: ${entries.length} entries, ${rejected.length} not kept`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
