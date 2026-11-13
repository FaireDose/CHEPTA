/**
 * Missing pairs estimated from Modified UNIFAC 2.0 (decision 2026-11-13-05; the maintainer, 2026-11-13: "our software
 * does not allow calculations because we are too strict with the data").
 *
 * A pair with no stored NRTL, UNIQUAC or Wilson set gets the model's two energy parameters b_ij, b_ji (K) regressed to
 * the activity coefficients that Modified UNIFAC 2.0 predicts for the binary. The estimate is computed when a system is
 * built (and cached for the process), never written to the data files, and always labelled tier "predicted".
 *
 * The scheme (this project's choice):
 *   - temperatures: the two components' normal boiling points and their mean (the range where the binary boils at
 *     about 1 atm), clamped to 250-550 K and widened to at least 30 K; 298.15-373.15 K where a component has no
 *     normal boiling point;
 *   - compositions: x_1 = 0.001, 0.05, 0.1, 0.2, ..., 0.9, 0.95, 0.999 (the ends stand for infinite dilution);
 *   - the residuals ln gamma_i(model) - ln gamma_i(Mod. UNIFAC 2.0), both components, all points, equal weights;
 *   - least squares by Levenberg-Marquardt from several starting points, the best kept;
 *   - only b_ij and b_ji: a_ij = a_ji = 0, NRTL alpha = 0.3 (the value CHEPTA uses for a set without its own alpha),
 *     Wilson Lambda_ij = exp(b_ij / T) (no molar-volume ratio), UNIQUAC tau_ij = exp(b_ij / T) with the components'
 *     r and q.
 *
 * What another simulator does (docs/METHOD_SELECTION.md, "When in doubt"): DWSIM (GPL-3.0; source opened at commit
 * 1abf72d, 2026-07-17) estimates a missing NRTL or UNIQUAC pair by default (PropertyPackage.vb,
 * AutoEstimateMissingNRTLUNIQUACParameters = True): PropertyPackages/NRTL.vb, EstimateMissingInteractionParameters,
 * regresses A12, A21 (alpha 0.2) to original-UNIFAC activity coefficients at 298.15 K and x_1 = 0.25, 0.5, 0.75 (IPOPT,
 * starts from -2000 to 2000), and gives a pair with a component boiling below 200 K near-zero parameters. CHEPTA uses
 * Modified UNIFAC 2.0 (open, newer, temperature-dependent), more compositions and the boiling range. Aspen Plus is said
 * to offer the same with UNIFAC, but its documentation is not open and was not read, so nothing is claimed about it.
 *
 * Equations of the models: nrtl.js, uniquac.js, wilson.js; Modified UNIFAC 2.0: mod-unifac.js (Hayer, Hasse and
 * Jirasek 2025, CC BY 4.0, parameters unchanged).
 */
import { nrtl } from "./nrtl.js";
import { uniquac } from "./uniquac.js";
import { wilson } from "./wilson.js";
import { modUnifac } from "./mod-unifac.js";

/** The set name of an estimated pair. */
export const ESTIMATED_SET = "estimated-mod-unifac-2";
/** The NRTL non-randomness of an estimated pair. */
export const ESTIMATE_ALPHA = 0.3;
/** Liquid mole fractions of the first component used in the regression. */
export const ESTIMATE_X = [0.001, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.999];

const cache = new Map();

/** The regression temperatures (K) for two components with normal boiling points Tb (null when unknown). */
export function estimateTemperatures(Tb1, Tb2) {
  const tbs = [Tb1, Tb2].filter(t => Number.isFinite(t));
  let lo = tbs.length === 2 ? Math.min(...tbs) : 298.15;
  let hi = tbs.length === 2 ? Math.max(...tbs) : 373.15;
  if (tbs.length === 1) { lo = Math.min(298.15, tbs[0]); hi = Math.max(373.15, tbs[0]); }
  lo = Math.min(Math.max(lo, 250), 550); hi = Math.min(Math.max(hi, 250), 550);
  if (hi - lo < 30) { const m = Math.min(Math.max((lo + hi) / 2, 265), 535); lo = m - 15; hi = m + 15; }
  const r = v => Math.round(v * 100) / 100;
  return [r(lo), r((lo + hi) / 2), r(hi)];
}

/** The binary activity-coefficient function of a model with b_ij, b_ji (a = 0). */
export function binaryModel(model, b12, b21, rq = null) {
  const a = [[0, 0], [0, 0]], b = [[0, b12], [b21, 0]];
  if (model === "NRTL") return nrtl({ a, b, alpha: [[0, ESTIMATE_ALPHA], [ESTIMATE_ALPHA, 0]] });
  if (model === "WILSON") return wilson({ a, b });
  if (model === "UNIQUAC") return uniquac({ a, b, r: rq.map(c => c.r), q: rq.map(c => c.q), qp: rq.map(c => c.qp ?? c.q) });
  throw new Error(`estimate-pairs: no estimate for model ${model}`);
}

/** Solve the 2x2 system (A + lambda diag(A)) d = g. */
function solve2(A, g, lambda) {
  const a = A[0][0] * (1 + lambda) + 1e-12, d = A[1][1] * (1 + lambda) + 1e-12, bb = A[0][1];
  const det = a * d - bb * bb;
  return [(d * g[0] - bb * g[1]) / det, (a * g[1] - bb * g[0]) / det];
}

/** Levenberg-Marquardt on two parameters; residuals(p) returns a list (non-finite residuals count as large). */
function levenbergMarquardt(residuals, p0) {
  const sse = r => r.reduce((s, v) => s + (Number.isFinite(v) ? v * v : 1e6), 0);
  let p = p0.slice(), r = residuals(p), f = sse(r), lambda = 1e-3;
  for (let it = 0; it < 200; it++) {
    const J = [0, 1].map(k => {
      const h = 1e-4 * Math.max(1, Math.abs(p[k]));
      const q = p.slice(); q[k] += h;
      const rq = residuals(q);
      return rq.map((v, m) => (v - r[m]) / h);
    });
    const A = [[0, 0], [0, 0]], g = [0, 0];
    for (let m = 0; m < r.length; m++) {
      if (!Number.isFinite(r[m])) continue;
      for (let i = 0; i < 2; i++) { g[i] -= J[i][m] * r[m]; for (let j = 0; j < 2; j++) A[i][j] += J[i][m] * J[j][m]; }
    }
    let improved = false;
    for (let tries = 0; tries < 20; tries++) {
      const d = solve2(A, g, lambda);
      const q = [p[0] + d[0], p[1] + d[1]];
      if (q.some(v => !Number.isFinite(v) || Math.abs(v) > 20000)) { lambda *= 10; continue; }
      const rq = residuals(q), fq = sse(rq);
      if (fq < f) {
        const step = Math.hypot(d[0], d[1]);
        p = q; r = rq; const df = f - fq; f = fq; lambda = Math.max(lambda / 10, 1e-9); improved = true;
        if (step < 1e-6 * (1 + Math.hypot(p[0], p[1])) || df < 1e-14 * (1 + f)) return { p, sse: f };
        break;
      }
      lambda *= 10;
    }
    if (!improved) break;
  }
  return { p, sse: f };
}

/**
 * Does a binary activity-coefficient function predict two liquids at T? g_mix / RT = sum x ln(x gamma) not convex in
 * x somewhere (the spinodal region, inside the two-liquid region); returns [from, to] of x_1 there, or null.
 */
export function binarySplit(g, T) {
  const gm = x => { const gg = g([x, 1 - x], T); return x * Math.log(x * gg[0]) + (1 - x) * Math.log((1 - x) * gg[1]); };
  const h = 0.0025, bad = [];
  for (let k = 1; k < 400; k++) {
    const x = k / 400;
    if (gm(x + h) - 2 * gm(x) + gm(x - h) < 0) bad.push(x);
  }
  return bad.length ? [bad[0], bad[bad.length - 1]] : null;
}

/**
 * Estimate a missing pair.
 * @param {"NRTL"|"UNIQUAC"|"WILSON"} model
 * @param {[object, object]} comps  the two component records (modUnifac.groups, uniquac, Tb_K, name)
 * @param {object} tables  the Modified UNIFAC 2.0 tables (src/data/mod-unifac-2.json)
 * @returns {{b_ij:number, b_ji:number, alpha?:number, T_K:number[], x:number[], rms_ln_gamma:number, max_ln_gamma:number,
 *           two_liquids:null|{T_K:number, x_from:number, x_to:number, by:string}}}
 */
export function estimatePair(model, comps, tables) {
  const T = estimateTemperatures(comps[0].Tb_K, comps[1].Tb_K);
  const rq = model === "UNIQUAC" ? comps.map(c => c.uniquac) : null;
  const key = JSON.stringify([model, T, comps.map(c => c.modUnifac.groups), rq]);
  if (cache.has(key)) return structuredClone(cache.get(key));
  const ref = modUnifac({ groups: comps.map(c => c.modUnifac.groups), tables });
  const pts = [];
  for (const t of T) for (const x of ESTIMATE_X) {
    const g = ref([x, 1 - x], t);
    pts.push({ x, T: t, ln: g.map(Math.log) });
  }
  const residuals = p => {
    const g = binaryModel(model, p[0], p[1], rq);
    const out = [];
    for (const q of pts) { const gg = g([q.x, 1 - q.x], q.T); out.push(Math.log(gg[0]) - q.ln[0], Math.log(gg[1]) - q.ln[1]); }
    return out;
  };
  // starting points: ideal, and the four signs of a moderate interaction
  const starts = [[0, 0], [300, 300], [-300, 600], [600, -300], [-200, -200], [1000, 1000]];
  let best = null;
  for (const s of starts) {
    const r = levenbergMarquardt(residuals, s);
    if (!best || r.sse < best.sse) best = r;
  }
  const res = residuals(best.p);
  const rms = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / res.length);
  const max = res.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  // two liquids: the estimate's (NRTL, UNIQUAC), or Modified UNIFAC 2.0's own where the model is Wilson, which cannot
  // give them
  let split = null;
  const g = binaryModel(model, best.p[0], best.p[1], rq);
  for (const t of T) {
    const s = model === "WILSON" ? binarySplit(ref, t) : binarySplit(g, t);
    if (s) { split = { T_K: t, x_from: +s[0].toFixed(3), x_to: +s[1].toFixed(3), by: model === "WILSON" ? "Mod. UNIFAC 2.0" : "estimate" }; break; }
  }
  const out = { b_ij: +best.p[0].toPrecision(8), b_ji: +best.p[1].toPrecision(8), ...(model === "NRTL" ? { alpha: ESTIMATE_ALPHA } : {}),
    T_K: T, x: ESTIMATE_X.slice(), rms_ln_gamma: +rms.toPrecision(3), max_ln_gamma: +max.toPrecision(3), two_liquids: split };
  cache.set(key, out);
  return structuredClone(out);
}
