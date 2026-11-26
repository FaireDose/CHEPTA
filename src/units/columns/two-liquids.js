/**
 * Two liquids on the stages of a column (proposal 0015, Part I, section 3, "look for two liquids on the stages";
 * milestone M2b): the thermodynamic adapter of the column engine (engine.js) for phases "VLL".
 *
 * A stage holds a vapour and one or two liquids. Both liquids leave the stage together (to the stage below, or as the
 * product of the reboiler or the total condenser), so the stage's MESH equations are those of one liquid written for
 * the stage's whole liquid (its component flows l_ij, composition x): the material balances are unchanged, and
 *
 *   - which liquids exist on the stage is decided at its temperature by Michelsen's tangent-plane test of the whole
 *     liquid (src/equilibrium/stability.js, liquidTangentPlane); where it would split, the two liquids x', x'' and the
 *     fraction beta of the second come from the liquid-liquid flash at T (src/equilibrium/flash.js, splitLL: successive
 *     substitution on K_i = gamma_i(x') / gamma_i(x''), with the Rachford-Rice equation), so that
 *     x = (1 - beta) x' + beta x'';
 *   - the vapour is in equilibrium with both liquids (they have equal fugacities), so y_i = K_i(x', y, T) x'_i, and the
 *     engine's equilibrium equation y = K x holds with the whole liquid's K-values K_i = K_i(x', y, T) x'_i / x_i;
 *   - the liquid's molar enthalpy is (1 - beta) h_L(x', T) + beta h_L(x'', T);
 *   - the bubble temperature of a liquid that splits is where sum_i K_i(x', T) x'_i = 1, the split taken at each trial T.
 *
 * Where a stage holds one liquid these are the one-liquid equations exactly. This is the usual way to write a
 * three-phase stage when its two liquids are not separated (both phases leave by the same downcomer): the
 * "effective K-value" of the whole liquid; written here from the phase-equilibrium conditions, not taken from a
 * source. A third liquid is refused (as by the flash). Only activity models (NRTL, UNIQUAC, Modified UNIFAC 2.0) can do
 * it, as the flash drum; with a dimerizing acid's chemical theory too (decision 2026-11-12-02): the stage's K-values
 * K_i(x', y, T) are then sys.lnKAssociation's (the apparent vapour y of monomers and dimers; engine.js, cascadeThermo),
 * and the liquid-liquid split does not involve the vapour.
 *
 * The two liquids are named by density (proposal 0015, section 5): "light" and "heavy", from the components' liquid
 * densities at T mixed ideally (the volumes add); without a density record, by the component each is richest in.
 */
import { fail } from "../../util/errors.js";
import { brent } from "../../util/solve.js";
import { liquidTangentPlane } from "../../equilibrium/stability.js";
import { splitLL, rachfordRice } from "../../equilibrium/flash.js";
import { pure } from "../../thermo/pure.js";

const sum = v => v.reduce((a, b) => a + b, 0);
/** Below this fraction (of the whole liquid) a second liquid is taken as absent at the solution. */
const TRACE = 1e-9;
/**
 * The smooth stage's smoothing parameters (proposal 0024, (c)), largest first: the column is solved with the first,
 * then with each next one from the last solution. The last is the final value, 1e-5: the largest at which every
 * two-liquid column test gives its answer within its tolerance (1e-4 fails five tests of columns-vll.test.js; the
 * maintainer, 2026-11-14, answer 5: never loosened to make a column converge). The first, 1e-3: from 1e-2, CHEPTA-Lab's
 * column 11 at a product of 139 kmol/h did not converge (2026-11-17); the smoothing is then too wide near the plait
 * points of ethyl acetate + water + ethanol, where the smoothed equations have no root.
 */
/** The two-liquid stage formulations: "split" (the yes/no tangent-plane test and split of each stage) and "smooth". */
export const TWO_LIQUID_STAGES = Object.freeze(["split", "smooth"]);
export const SMOOTH_EPS = Object.freeze([1e-3, 1e-4, 1e-5]);
/**
 * The reuse of a clearly stable verdict (proposal 0028, item 2; docs/decisions/2026-11-26-01-column-specs-in-mesh.md):
 * where a stage's last full tangent-plane test found its liquid stable with every nontrivial stationary point at a
 * distance tm of at least TM_MARGIN (or none at all), a liquid within REUSE_LN_X in every ln x_i and REUSE_T_K in T of
 * that test (the perturbed points of the stage's Jacobian, 1e-5 relative in the flows and about 1e-4 K) is taken as
 * stable without a new test. Moving ln x by 1e-4 moves tm by about as much (tm = 1 - sum W, W_i = exp(d_i - ln gamma_i),
 * d_i = ln x_i + ln gamma_i(x)), a hundredth of the margin. This project's choice of the three numbers. The verdict is
 * never reused at a column's answer: the engine repeats the full test on every stage there (setReuse(false)).
 */
export const TM_MARGIN = 0.01, REUSE_LN_X = 1e-4, REUSE_T_K = 0.01;

/**
 * The liquid-liquid split at T by Newton's method on ln K_i = ln gamma_i(x') - ln gamma_i(x'') (K_i = x''_i / x'_i,
 * the phases from the Rachford-Rice equation), with a Jacobian by forward differences and the step halved until the
 * residual falls: near a plait point, where successive substitution converges slowly to the trivial solution. Returns
 * { beta, x1, x2, K } or null.
 */
export function newtonLL(sys, z, T, K0) {
  const n = z.length;
  const res = u => {
    const K = u.map(Math.exp), beta = rachfordRice(z, K);
    if (!Number.isFinite(beta)) return null;
    const x1 = z.map((v, i) => v / (1 + beta * (K[i] - 1))), x2 = x1.map((v, i) => v * K[i]);
    const s1 = sum(x1), s2 = sum(x2);
    const g1 = sys.gammas(x1.map(v => v / s1), T), g2 = sys.gammas(x2.map(v => v / s2), T);
    return { F: u.map((v, i) => v - Math.log(g1[i] / g2[i])), beta, x1: x1.map(v => v / s1), x2: x2.map(v => v / s2), K };
  };
  const nrm = F => Math.sqrt(sum(F.map(v => v * v)));
  let u = K0.map(Math.log), r = res(u);
  if (!r) return null;
  for (let it = 0; it < 60; it++) {
    const f0 = nrm(r.F);
    if (f0 < 1e-13) break;
    const J = [];
    for (let k = 0; k < n; k++) {
      const h = 1e-7 * Math.max(1, Math.abs(u[k])), w = u.slice(); w[k] += h;
      const rk = res(w);
      if (!rk) return null;
      J.push(rk.F.map((v, i) => (v - r.F[i]) / h));   // column k
    }
    // solve J du = -F (J[k][i] = dF_i / du_k), Gaussian elimination with partial pivoting
    const A = Array.from({ length: n }, (_, i) => [...J.map(col => col[i]), -r.F[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let q = c + 1; q < n; q++) if (Math.abs(A[q][c]) > Math.abs(A[p][c])) p = q;
      [A[c], A[p]] = [A[p], A[c]];
      if (!(Math.abs(A[c][c]) > 0)) return null;
      for (let q = c + 1; q < n; q++) { const f = A[q][c] / A[c][c]; for (let k = c; k <= n; k++) A[q][k] -= f * A[c][k]; }
    }
    const du = new Array(n);
    for (let c = n - 1; c >= 0; c--) { let s = A[c][n]; for (let k = c + 1; k < n; k++) s -= A[c][k] * du[k]; du[c] = s / A[c][c]; }
    let lam = 1, next = null;
    for (let h = 0; h < 30; h++, lam /= 2) {
      const w = u.map((v, i) => v + lam * du[i]), rw = res(w);
      if (rw && nrm(rw.F) < f0) { next = { w, rw }; break; }
    }
    if (!next) return null;
    u = next.w; r = next.rw;
  }
  if (!(nrm(r.F) < 1e-10) || Math.max(...u.map(Math.abs)) < 1e-4) return null;
  return { beta: r.beta, x1: r.x1, x2: r.x2, K: r.K };
}

// ---------------------------------------------------------------------------------------------------------------
// The smooth two-liquid stage (proposal 0024, part (c); two_liquid_stage: "smooth")
//
// On stage j, for its whole liquid x at T, the stage-local unknowns W_i (a trial second liquid, w = W / sum W), beta
// (the second liquid's fraction of the whole liquid) and s (the tangent-plane distance at a stationary point) solve
//
//   x' = (x - beta w) / (1 - beta)                                               (the first liquid)
//   ln W_i + ln gamma_i(w, T) - ln x'_i - ln gamma_i(x', T) = 0                  (c equations)
//   sum_i W_i + s - 1 = 0                                                        (Michelsen's tm = 1 - sum W)
//   0 <= beta  perp  s >= 0, smoothed: beta + s - sqrt((beta - s)^2 + eps^2) = 0, i.e. 4 beta s = eps^2 (beta, s > 0)
//
// (Dabadghao et al., AIChE J. 2023, doi:10.1002/aic.18029, section 2.4, the smoothing of a complementarity; its
// transfer to the second liquid with the tangent-plane distance as the slack is proposal 0024's.) The smoothed
// complementarity is written as ln beta + ln s = ln(eps^2 / 4), its exact equivalent for beta + s > 0, which keeps a
// small beta or s to full relative precision; the unknowns are ln W, ln beta, ln s. On a stage inside the two-liquid
// region s ~ eps^2 / (4 beta) is small and (x', w) are the two liquids; outside it beta ~ eps^2 / (4 tm) is small and W
// is the nontrivial stationary point of the tangent-plane test of x. The trivial solution w = x' needs s = 0, which
// the smoothed equations exclude. These c + 2 equations are local to the stage, so they are solved for each (x, T) by
// Newton's method here, and the engine's variables stay l, v, T (the stage-local unknowns eliminated, which keeps the
// Jacobian block-tridiagonal); the stage's K-values and enthalpy are those of the yes/no adapter with this beta, x', w.

/** The nontrivial stationary point of the tangent-plane distance of x at T with the smallest tm (Michelsen 1982; the
 *  starts of liquidTangentPlane), or null where every start returns to x. */
export function stationaryPoint(sys, x, T, present) {
  const n = x.length, gz = sys.gammas(x, T);
  const d = x.map((v, i) => (present[i] ? Math.log(v) + Math.log(gz[i]) : 0));
  let best = null;
  for (let k = 0; k < n; k++) if (present[k]) {
    for (const big of [0.98, 0.999]) {
      let W = x.map((v, i) => (!present[i] ? 0 : i === k ? big : (1 - big) * v)), ok = false;
      for (let it = 0; it < 400; it++) {
        const S = sum(W), w = W.map(v => v / S);
        const g = sys.gammas(w.map(v => Math.max(v, 1e-300)), T);
        const Wn = w.map((_, i) => (present[i] ? Math.exp(d[i] - Math.log(g[i])) : 0));
        let ch = 0;
        for (let i = 0; i < n; i++) if (present[i]) ch = Math.max(ch, Math.abs(Math.log(Wn[i] / Math.max(W[i], 1e-300))));
        W = Wn;
        if (!W.every(Number.isFinite)) break;
        if (ch < 1e-11) { ok = true; break; }
      }
      if (!ok) continue;
      const S = sum(W), w = W.map(v => v / S);
      let dist = 0;
      for (let i = 0; i < n; i++) if (present[i]) dist += Math.log(w[i] / x[i]) ** 2;
      if (dist < 1e-4) continue;   // back to x: trivial
      const tm = 1 - S;
      if (!best || tm < best.tm) best = { W, tm };
    }
  }
  return best;
}

/** Newton's method on the smooth stage equations from the start a0 = [ln W (present components), ln beta, ln s];
 *  returns { a, beta, s, x1, x2 } or null. */
export function smoothNewton(sys, x, T, eps, present, a0) {
  const idx = present.map((p, i) => (p ? i : -1)).filter(i => i >= 0), c = idx.length, n = x.length;
  const lnE = Math.log(eps * eps / 4);
  const res = a => {
    const W = new Array(n).fill(0);
    idx.forEach((i, k) => { W[i] = Math.exp(a[k]); });
    const beta = Math.exp(a[c]), s = Math.exp(a[c + 1]), S = sum(W);
    if (!(beta < 1)) return null;
    const w = W.map(v => v / S), xp = x.map((v, i) => (present[i] ? (v - beta * w[i]) / (1 - beta) : 0));
    if (idx.some(i => !(xp[i] > 0))) return null;
    const gw = sys.gammas(w, T), gx = sys.gammas(xp, T);
    const F = idx.map((i, k) => a[k] + Math.log(gw[i]) - Math.log(xp[i]) - Math.log(gx[i]));
    F.push(S + s - 1, a[c] + a[c + 1] - lnE);
    return F.every(Number.isFinite) ? { F, beta, s, w, xp } : null;
  };
  const nrm = F => Math.max(...F.map(Math.abs));
  let a = a0.slice(), r = res(a);
  if (!r) return null;
  for (let it = 0; it < 60; it++) {
    const f0 = nrm(r.F);
    if (f0 < 1e-13) break;
    const m = c + 2, J = [];
    for (let k = 0; k < m; k++) {
      const h = 1e-7, ap = a.slice(), am = a.slice(); ap[k] += h; am[k] -= h;
      const rp = res(ap), rm = res(am);
      if (rp && rm) J.push(rp.F.map((v, e) => (v - rm.F[e]) / (2 * h)));
      else if (rp) J.push(rp.F.map((v, e) => (v - r.F[e]) / h));
      else if (rm) J.push(r.F.map((v, e) => (v - rm.F[e]) / h));
      else return null;
    }
    const A = Array.from({ length: m }, (_, e) => [...J.map(col => col[e]), -r.F[e]]);
    for (let q = 0; q < m; q++) {
      let p = q;
      for (let t = q + 1; t < m; t++) if (Math.abs(A[t][q]) > Math.abs(A[p][q])) p = t;
      [A[q], A[p]] = [A[p], A[q]];
      if (!(Math.abs(A[q][q]) > 0)) return null;
      for (let t = q + 1; t < m; t++) { const f = A[t][q] / A[q][q]; for (let k = q; k <= m; k++) A[t][k] -= f * A[q][k]; }
    }
    const da = new Array(m);
    for (let q = m - 1; q >= 0; q--) { let s = A[q][m]; for (let k = q + 1; k < m; k++) s -= A[q][k] * da[k]; da[q] = s / A[q][q]; }
    let lam = Math.min(1, 2 / Math.max(...da.map(Math.abs))), next = null;
    for (let h = 0; h < 40; h++, lam /= 2) {
      const an = a.map((v, k) => v + lam * da[k]), rn = res(an);
      if (rn && nrm(rn.F) < f0) { next = { an, rn }; break; }
    }
    if (!next) { if (f0 < 1e-11) break; return null; }
    a = next.an; r = next.rn;
  }
  if (!(nrm(r.F) < 1e-11)) return null;
  let dist = 0;
  for (const i of idx) dist += Math.log(r.w[i] / r.xp[i]) ** 2;
  if (dist < 1e-8) return null;   // the trivial solution (w = x')
  return { a, beta: r.beta, s: r.s, x1: r.xp, x2: r.w };
}

/** The models that can hold two liquids on a stage. */
export function canHoldTwoLiquids(sys) {
  return sys.kind !== "eos" && sys.model !== "WILSON" && typeof sys.gammas === "function"
    && (typeof sys.lnKValues === "function" || typeof sys.lnKAssociation === "function");
}

/**
 * Wrap the engine's adapter `th` (cascadeThermo of an activity system `sys`) for two liquids on the stages. The
 * functions take an optional stage index j, used only to start each stage's liquid-liquid split from its last one.
 */
export function twoLiquidThermo(th, sys, opts = {}) {
  if (sys.model === "WILSON") {
    throw fail("NOT_AVAILABLE", 'Column: two liquids on the stages (phases "VLL") cannot be looked for with Wilson: the Wilson equation cannot predict two liquids (proposal 0016). Choose NRTL, UNIQUAC or Modified UNIFAC 2.0 for the column (its own property method), or phases "VL".');
  }
  if (!canHoldTwoLiquids(sys)) {
    throw fail("NOT_AVAILABLE", `Column: two liquids on the stages (phases "VLL") need an activity model (NRTL, UNIQUAC, Modified UNIFAC 2.0), as the flash drum does; ${sys.kind === "eos" ? `${sys.model} is an equation of state` : "this system has none"}. Choose such a method for the column (its own property method), or phases "VL".`);
  }
  const lastK = new Map();     // stage -> the K-values of its last split
  const memo = new Map();      // stage -> { x, T, s }: lnK and hL ask for the same split one after the other
  // stage -> { x, T, s }: the last split computed in full (not by a reused verdict), so that the base point of a
  // Jacobian survives its perturbed points (proposal 0028, item 2)
  const memoBase = new Map();
  // stage -> { x, T }: the last full stability test that found the liquid clearly stable (TM_MARGIN), and whether a
  // verdict may be reused
  const clearlyStable = new Map();
  // (opts.reuse false: never, for a comparison; the engine's stableReuse option)
  let reuse = opts.reuse !== false, reused = 0, tests = 0;
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  // the smooth stage (proposal 0024, (c)): the smoothing parameter of the moment (the engine lowers it in steps)
  const smooth = !!opts.smooth;
  let eps = smooth ? (opts.eps ?? SMOOTH_EPS[0]) : null;
  const lastS = new Map();     // stage -> { key, a }: the last solution of its smooth equations
  const setEps = e => { eps = e; memo.clear(); memoBase.clear(); };
  // (turned off: every memo and verdict dropped, so that each stage is tested in full; turned on again: the memos kept)
  const setReuse = on => { reuse = !!on; if (!reuse) { memo.clear(); memoBase.clear(); clearlyStable.clear(); } };

  /** The liquids of a whole liquid x at T: null (one liquid) or { beta, x1, x2 } (beta: the fraction of x2). */
  function split(x, T, j = -1) {
    const m = memo.get(j);
    if (m && m.T === T && same(m.x, x)) return m.s;
    const b = memoBase.get(j);
    if (b && b.T === T && same(b.x, x)) { memo.set(j, b); return b.s; }
    full = true;
    const s = smooth ? smoothOf(x, T, j) : splitOf(x, T, j);
    const e = { x: x.slice(), T, s };
    memo.set(j, e);
    if (full) memoBase.set(j, e);
    return s;
  }
  let full = true;   // (set false by splitOf where it reused a verdict)
  /** A liquid near the stage's last clearly stable full test (see TM_MARGIN). */
  const nearStable = (x, T, j) => {
    const a = reuse && !smooth ? clearlyStable.get(j) : null;
    if (!a || Math.abs(a.T - T) > REUSE_T_K) return false;
    for (let i = 0; i < x.length; i++) {
      if ((x[i] > 0) !== (a.x[i] > 0)) return false;
      if (x[i] > 0 && Math.abs(Math.log(x[i] / a.x[i])) > REUSE_LN_X) return false;
    }
    return true;
  };
  function splitOf(x, T, j) {
    if (sys.n < 2) return null;
    const ok = r => r && r.beta > 0 && r.beta < 1;
    const K0 = lastK.get(j);
    if (K0) {
      let r = null;
      try { r = splitLL(sys, x, T, K0); } catch { r = newtonLL(sys, x, T, K0); }
      if (ok(r)) { lastK.set(j, r.K); return { beta: r.beta, x1: r.x1, x2: r.x2 }; }
      // a liquid that no longer splits from the old K-values: forget them, so that the next call goes to the stability
      // test at once (proposal 0027, (e1): the bubble-point search shares one key for every stage, so a single split
      // made every later bubble point run a full failed substitution first; the stability test decides as before)
      lastK.delete(j);
    }
    if (nearStable(x, T, j)) { reused += 1; full = false; return null; }
    tests += 1;
    const st = liquidTangentPlane(sys, x, T);
    if (st.stable && !(st.tmMin < TM_MARGIN)) clearlyStable.set(j, { x: x.slice(), T });
    else clearlyStable.delete(j);
    if (st.stable || !st.trial) return null;
    // the trial phase is the second liquid's start: K_i = x''_i / x'_i
    let r = null;
    const Kt = x.map((v, i) => Math.max(st.trial[i], 1e-300) / v);
    try { r = splitLL(sys, x, T, Kt); } catch { r = null; }
    // near a plait point successive substitution falls back to one liquid: Newton's method from the trial phase
    // (from the trial phase, the neighbouring stages' last splits, then a liquid rich in each component in turn)
    if (!ok(r)) {
      const starts = [Kt, lastK.get(j - 1), lastK.get(j + 1), ...lastK.values(),
        ...x.map((_, k) => x.map((v, i) => (i === k ? 0.98 : 0.02 * v) / v))].filter(Boolean);
      for (const K of starts) { r = newtonLL(sys, x, T, K); if (ok(r)) break; }
    }
    if (!ok(r)) {
      throw fail("NO_CONVERGENCE", `Column: the liquid of ${j >= 0 ? `stage ${j + 1}` : "a stage"} at ${T.toFixed(2)} K is not stable as one liquid, but its liquid-liquid split did not converge (near a plait point?).`);
    }
    lastK.set(j, r.K);
    return { beta: r.beta, x1: r.x1, x2: r.x2 };
  }

  /** The smooth stage's beta, x', w (smoothed: beta > 0 on every stage that has a nontrivial stationary point; null
   *  where the tangent-plane test of x has none, a stage far from any second liquid). */
  function smoothOf(x, T, j) {
    const present = x.map(v => v > 1e-300);
    if (present.filter(Boolean).length < 2) return null;
    const key = present.join();
    const out = r => { lastS.set(j, { key, a: r.a }); return { beta: r.beta, x1: r.x1, x2: r.x2, s: r.s, eps }; };
    // warm starts: this stage's last solution, then its neighbours'
    for (const k of [j, j - 1, j + 1]) {
      const w = lastS.get(k);
      if (!w || w.key !== key) continue;
      const r = smoothNewton(sys, x, T, eps, present, w.a);
      if (r) return out(r);
    }
    const idx = present.map((p, i) => (p ? i : -1)).filter(i => i >= 0);
    const lnE = Math.log(eps * eps / 4);
    const st = liquidTangentPlane(sys, x, T);
    const starts = [];
    if (!st.stable && st.trial) {
      // a liquid that splits: the start is its split (the yes/no adapter's), with s from the smoothing
      const s = splitOf(x, T, j);
      if (s) starts.push([...idx.map(i => Math.log(s.x2[i])), Math.log(s.beta), lnE - Math.log(s.beta)]);
    }
    const sp = stationaryPoint(sys, x, T, present);
    if (sp) {
      const tm = Math.max(sp.tm, eps / 2);
      starts.push([...idx.map(i => Math.log(sp.W[i])), lnE - Math.log(tm), Math.log(tm)]);
    }
    for (const a0 of starts) {
      const r = smoothNewton(sys, x, T, eps, present, a0);
      if (r) return out(r);
    }
    // no root of the smoothed equations near this state (near a plait point, where the second liquid's stationary
    // point exists only close to the binodal and the smoothing moves x' off it): the exact complementarity, the limit
    // eps -> 0: one liquid (beta = 0) where the liquid is stable, else its split with s = 0 (the yes/no adapter's)
    lastS.delete(j);
    if (st.stable) return null;
    const e = splitOf(x, T, j);
    return e ? { beta: e.beta, x1: e.x1, x2: e.x2, s: 0, eps, exact: true } : null;
  }

  const lnK = (x, y, T, j) => {
    const s = split(x, T, j);
    if (!s) return th.lnK(x, y, T);
    return th.lnK(s.x1, y, T).map((v, i) => v + Math.log(s.x1[i] / x[i]));
  };
  const hL = (x, T, j) => {
    const s = split(x, T, j);
    return s ? (1 - s.beta) * th.hL(s.x1, T) + s.beta * th.hL(s.x2, T) : th.hL(x, T);
  };
  // the bubble temperature of a whole liquid that may split: sum_i K_i x_i = 1 with the whole liquid's K-values. With a
  // dimerizing acid the K-values depend on the vapour y (its dimers), so y is iterated to y = K x / sum K x at each T
  // (successive substitution; the same incipient vapour as the flash's bubble point)
  const assoc = typeof sys.lnKValues !== "function";
  const sumKx = (x, T) => {
    let y = x, s = 0;
    for (let k = 0; k < (assoc ? 50 : 1); k++) {
      const Kx = lnK(x, y, T, -2).map((v, i) => Math.exp(v) * x[i]);
      s = sum(Kx);
      const yn = Kx.map(v => v / s);
      const d = Math.max(...yn.map((v, i) => Math.abs(v - y[i])));
      y = yn;
      if (d < 1e-12) break;
    }
    return s;
  };
  const bubbleT = x => {
    const T0 = th.bubbleT(x);
    if (!split(x, T0, -2)) return T0;
    const f = T => sumKx(x, T) - 1;
    let lo = T0, flo = f(lo), hi = T0, fhi = flo;
    for (let k = 0; k < 40 && flo > 0; k++) { hi = lo; fhi = flo; lo -= 2; flo = f(lo); }
    for (let k = 0; k < 40 && fhi < 0; k++) { lo = hi; flo = fhi; hi += 2; fhi = f(hi); }
    if (!(flo <= 0 && fhi >= 0)) return T0;
    return brent(f, lo, hi, { xtol: 1e-10 });
  };

  /** The densities (kg/m3) of the two liquids at T, or null without records; for naming them light and heavy. */
  const records = sys.ids.map(id => { try { return pure(id, { userData: sys.userData }); } catch { return null; } });
  function density(x, T) {
    let mass = 0, vol = 0;
    for (let i = 0; i < x.length; i++) {
      const p = records[i];
      let rho;
      try { rho = p?.property("liquidDensity", T); } catch { rho = null; }
      if (!(rho > 0)) return null;
      mass += x[i] * sys.MW[i]; vol += x[i] * sys.MW[i] / rho;
    }
    return mass / vol;
  }

  /** The stage's liquids for the profile: [] for one liquid, else the light and the heavy one with their flows. */
  function liquids(x, T, L, j) {
    const s = split(x, T, j);
    if (!s || s.beta < TRACE || s.beta > 1 - TRACE || (s.eps && !(s.beta > s.s))) return null;
    const a = { x: s.x1, flow: (1 - s.beta) * L, rho: density(s.x1, T) }, b = { x: s.x2, flow: s.beta * L, rho: density(s.x2, T) };
    const byRho = a.rho != null && b.rho != null;
    const [light, heavy] = byRho ? (a.rho <= b.rho ? [a, b] : [b, a]) : [a, b];
    const rich = v => sys.names[v.indexOf(Math.max(...v))];
    return { light, heavy, named: byRho ? "density" : "richest component", labels: [`${rich(light.x)}-rich`, `${rich(heavy.x)}-rich`] };
  }

  /** A third liquid: each of a stage's two liquids tested for a split of its own. */
  function third(x, T, j) {
    const s = split(x, T, j);
    if (!s || s.beta < TRACE || s.beta > 1 - TRACE || (s.eps && !(s.beta > s.s))) return null;
    for (const v of [s.x1, s.x2]) {
      const st = liquidTangentPlane(sys, v, T);
      if (!st.stable) return { x: v, trial: st.trial };
    }
    return null;
  }

  return { ...th, base: th, lnK, hL, bubbleT, split, liquids, third, density, twoLiquids: true,
    setReuse, reuseCounts: () => ({ reused, tests }), reuses: () => reuse,
    ...(smooth ? { smooth: true, setEps, eps: () => eps } : {}) };
}
