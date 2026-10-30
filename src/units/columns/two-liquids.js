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
 * source. A third liquid is refused (as by the flash). Only activity models (NRTL, UNIQUAC, Modified UNIFAC 2.0)
 * without the dimerizing acids' chemical theory can do it, as the flash drum.
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

/** The models that can hold two liquids on a stage. */
export function canHoldTwoLiquids(sys) {
  return sys.kind !== "eos" && typeof sys.gammas === "function" && typeof sys.lnKValues === "function";
}

/**
 * Wrap the engine's adapter `th` (cascadeThermo of an activity system `sys`) for two liquids on the stages. The
 * functions take an optional stage index j, used only to start each stage's liquid-liquid split from its last one.
 */
export function twoLiquidThermo(th, sys) {
  if (!canHoldTwoLiquids(sys)) {
    throw fail("NOT_AVAILABLE", `Column: two liquids on the stages (phases "VLL") need an activity model (NRTL, UNIQUAC, Modified UNIFAC 2.0) without the dimerizing acids' chemical theory, as the flash drum does; ${sys.kind === "eos" ? `${sys.model} is an equation of state` : "this system has none"}. Choose such a method for the column (its own property method), or phases "VL".`);
  }
  const lastK = new Map();     // stage -> the K-values of its last split
  const memo = new Map();      // stage -> { x, T, s }: lnK and hL ask for the same split one after the other
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  /** The liquids of a whole liquid x at T: null (one liquid) or { beta, x1, x2 } (beta: the fraction of x2). */
  function split(x, T, j = -1) {
    const m = memo.get(j);
    if (m && m.T === T && same(m.x, x)) return m.s;
    const s = splitOf(x, T, j);
    memo.set(j, { x: x.slice(), T, s });
    return s;
  }
  function splitOf(x, T, j) {
    if (sys.n < 2) return null;
    const ok = r => r && r.beta > 0 && r.beta < 1;
    const K0 = lastK.get(j);
    if (K0) {
      let r = null;
      try { r = splitLL(sys, x, T, K0); } catch { r = newtonLL(sys, x, T, K0); }
      if (ok(r)) { lastK.set(j, r.K); return { beta: r.beta, x1: r.x1, x2: r.x2 }; }
    }
    const st = liquidTangentPlane(sys, x, T);
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

  const lnK = (x, y, T, j) => {
    const s = split(x, T, j);
    if (!s) return th.lnK(x, y, T);
    return th.lnK(s.x1, y, T).map((v, i) => v + Math.log(s.x1[i] / x[i]));
  };
  const hL = (x, T, j) => {
    const s = split(x, T, j);
    return s ? (1 - s.beta) * th.hL(s.x1, T) + s.beta * th.hL(s.x2, T) : th.hL(x, T);
  };
  // the bubble temperature of a whole liquid that may split: sum_i K_i x_i = 1 with the whole liquid's K-values
  const bubbleT = x => {
    const T0 = th.bubbleT(x);
    if (!split(x, T0, -2)) return T0;
    const f = T => sum(lnK(x, x, T, -2).map((v, i) => Math.exp(v) * x[i])) - 1;
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
    if (!s || s.beta < TRACE || s.beta > 1 - TRACE) return null;
    const a = { x: s.x1, flow: (1 - s.beta) * L, rho: density(s.x1, T) }, b = { x: s.x2, flow: s.beta * L, rho: density(s.x2, T) };
    const byRho = a.rho != null && b.rho != null;
    const [light, heavy] = byRho ? (a.rho <= b.rho ? [a, b] : [b, a]) : [a, b];
    const rich = v => sys.names[v.indexOf(Math.max(...v))];
    return { light, heavy, named: byRho ? "density" : "richest component", labels: [`${rich(light.x)}-rich`, `${rich(heavy.x)}-rich`] };
  }

  /** A third liquid: each of a stage's two liquids tested for a split of its own. */
  function third(x, T, j) {
    const s = split(x, T, j);
    if (!s) return null;
    for (const v of [s.x1, s.x2]) {
      const st = liquidTangentPlane(sys, v, T);
      if (!st.stable) return { x: v, trial: st.trial };
    }
    return null;
  }

  return { ...th, base: th, lnK, hL, bubbleT, split, liquids, third, density, twoLiquids: true };
}
