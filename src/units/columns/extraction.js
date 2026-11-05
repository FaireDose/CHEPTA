/**
 * The liquid-liquid cascade of the column engine (proposal 0015, Part I, section 1; milestone M3, step 8): phases "LL",
 * a countercurrent extraction, with N equilibrium stages and no vapour, solved by solveCascade({ phases: "LL" })
 * (engine.js; contract 3).
 *
 *   solveLiquidCascade({ sys | gammas, n, stages, feeds: [{ stage, flows }], T_K, start })
 *   → { stages: [{ stage, T_K, down: { flows, x, F }, up: { flows, x, F } }], products: { down, up }, converged,
 *       residuals: { material, equilibrium }, tolerances, iterations, solver }
 *
 * Units: mol/s and K (SI inside the engine).
 *
 * The stages are numbered 1 to N. Two liquids flow countercurrent: the first ("down") from stage 1 to N, where it leaves
 * (the raffinate of an extraction), the second ("up") from N to 1, where it leaves (the extract). A feed enters any
 * stage; an extraction's feed enters stage 1 and its solvent stage N. The variables of stage j are the component flows
 * of the two liquids leaving it, d_ij and u_ij (D_j = sum_i d_ij, U_j = sum_i u_ij, x = d / D, y = u / U), and the
 * equations those of the liquid-liquid stage in the variables of Naphtali and Sandholm (the vapour-liquid form of
 * engine.js, with the vapour replaced by the second liquid and its equilibrium written as equal activities):
 *
 *   M_ij = d_ij + u_ij - d_i,j-1 - u_i,j+1 - f_ij = 0                      (material, one per component)
 *   E_ij = ln(x_ij gamma_i(x_j, T_j)) - ln(y_ij gamma_i(y_j, T_j)) = 0       (equal activities in the two liquids)
 *
 * The stage temperatures are given (an isothermal cascade, or one temperature per stage), so there is no energy
 * balance among the equations: the duty that holds them is what the block reports from its outlets' enthalpies. The
 * pressure does not enter: the activity coefficients of NRTL, UNIQUAC and Modified UNIFAC 2.0 do not depend on it, and
 * the vapour model of the system (the acids' chemical theory included) is not used.
 *
 * The solver:
 *  1. the start: one liquid-liquid split of all the feeds mixed (src/equilibrium/flash.js, splitLL), started from the
 *     ratio of the last feed listed to the first (the solvent to the feed); the liquid nearer the first feed is the one
 *     that flows down and leaves at stage N; then the isothermal sum-rates
 *     method (Tsuboka and Katayama's idea, as in the bubble-point start of engine.js): at fixed distribution
 *     coefficients K_ij = y_ij / x_ij the component balances are one tridiagonal system per component,
 *     d_i,j-1 - (1 + S_ij) d_ij + S_i,j+1 d_i,j+1 = -f_ij with S_ij = K_ij U_j / D_j, the flows are their sums and the
 *     K_ij come again from the activity coefficients, repeated. A previous solution (`start`) replaces it when given;
 *  2. Newton's method on all 2 C N equations together, in the logarithms of the component flows (a trace flow can fall
 *     by orders of magnitude without turning negative; at most a factor e^5 per step); the Jacobian by central
 *     differences, stage by stage (the equations of stage j depend on stages j-1, j, j+1 only), the step halved until
 *     the residual falls.
 *
 * A solution where the two liquids of a stage have one composition (the trivial solution of the equal-activity
 * equations) is refused: on that stage the feeds mix to one liquid, and the cascade does not exist as specified
 * (too much solvent dissolves, or the solute's concentration is beyond the plait point).
 */
import { fail } from "../../util/errors.js";
import { splitLL } from "../../equilibrium/flash.js";
import { liquidTangentPlane } from "../../equilibrium/stability.js";

/** The tolerances a solution must meet: material relative to the total feed, equilibrium in ln(activity). */
export const LL_TOLERANCES = Object.freeze({ material: 1e-10, equilibrium: 1e-10 });
/** The largest number of stages (this project's choice: N C unknowns stay a few hundred). */
export const MAX_LL_STAGES = 100;
/** Two liquids closer than this in every mole fraction count as one (the trivial solution). */
const SAME = 1e-5;
const LN_STEP = 5;
const MAX_NEWTON = 60;
const SWEEPS = 40;

const sum = v => v.reduce((a, b) => a + b, 0);
const fmt = v => +Number(v).toPrecision(4);

/** The liquid-liquid cascade; see the file header. */
export function solveLiquidCascade(opts = {}) {
  const gammas = opts.gammas ?? (opts.sys && opts.sys.gammas ? (x, T) => opts.sys.gammas(x, T) : null);
  if (!gammas) throw fail("BAD_INPUT", "Extraction: two liquids need an activity model (NRTL, UNIQUAC, Modified UNIFAC 2.0); an equation of state cannot describe them in CHEPTA yet.");
  const n = opts.n ?? opts.sys?.n;
  const N = Number(opts.stages);
  if (!(Number.isInteger(N) && N >= 1 && N <= MAX_LL_STAGES)) throw fail("BAD_INPUT", `Extraction: the number of stages must be a whole number from 1 to ${MAX_LL_STAGES} (got ${JSON.stringify(opts.stages)}).`);
  const T = Array.isArray(opts.T_K) ? opts.T_K.map(Number) : new Array(N).fill(Number(opts.T_K));
  if (T.length !== N || T.some(t => !(t > 0))) throw fail("BAD_INPUT", `Extraction: give the temperature T_K, one number or one per stage (${N}), in K.`);
  if (!Array.isArray(opts.feeds) || !opts.feeds.length) throw fail("BAD_INPUT", "Extraction: give at least one feed.");
  const f = Array.from({ length: N }, () => new Array(n).fill(0));
  opts.feeds.forEach((fd, k) => {
    const s = Number(fd.stage);
    if (!(Number.isInteger(s) && s >= 1 && s <= N)) throw fail("BAD_INPUT", `Extraction: feed ${k + 1} enters stage ${JSON.stringify(fd.stage)}; the stages are 1 to ${N}.`);
    if (!Array.isArray(fd.flows) || fd.flows.length !== n || fd.flows.some(v => !(v >= 0))) throw fail("BAD_INPUT", `Extraction: feed ${k + 1} needs ${n} component flows, none negative.`);
    fd.flows.forEach((v, i) => { f[s - 1][i] += Number(v); });
  });
  const total = new Array(n).fill(0);
  for (const fj of f) fj.forEach((v, i) => { total[i] += v; });
  const F = sum(total);
  if (!(F > 0)) throw fail("BAD_INPUT", "Extraction: the feeds have no flow.");
  const act = total.map((v, i) => (v > 0 ? i : -1)).filter(i => i >= 0);   // the components present
  const c = act.length, m = 2 * c;
  const names = opts.names ?? Array.from({ length: n }, (_, i) => `component ${i + 1}`);

  // ---- the start
  let d, u;   // [stage][component] flows of the two liquids
  if (opts.start) ({ d, u } = { d: opts.start.down.map(r => r.slice()), u: opts.start.up.map(r => r.slice()) });
  else ({ d, u } = sumRates());

  function sumRates() {
    const z = total.map(v => v / F);
    // the first feed listed names the liquid that leaves at stage N (down; the raffinate), the last the other
    const norm1 = fl => { const a = fl.map(v => Number(v) + 1e-6 * F), t = sum(a); return a.map(v => v / t); };
    const fd = norm1(opts.feeds[0].flows), fu = norm1(opts.feeds[opts.feeds.length - 1].flows);
    const K0 = fu.map((v, i) => v / fd[i]);
    const Tm = sum(T) / N;
    // the start's K-values: the two ends' ratio, clipped (a component absent from one end would make it 0 or infinite
    // and lead the split to the trivial solution); then the second liquid of the tangent-plane test
    const tries = [K0.map(k => Math.min(Math.max(k, 1e-2), 1e2))];
    const st = liquidTangentPlane({ gammas, n }, z, Tm);
    if (!st.stable) tries.push(st.trial.map((v, i) => Math.max(v, 1e-12) / Math.max(z[i], 1e-12)));
    let ll = null;
    for (const K of tries) {
      try { ll = splitLL({ gammas }, z, Tm, K.slice()); } catch (e) { if (!(e && e.code === "NO_CONVERGENCE")) throw e; ll = null; }
      if (ll && Math.max(...ll.x1.map((v, i) => Math.abs(v - ll.x2[i]))) >= SAME) break;
    }
    // name the liquids: x1 is the one that leaves at stage N (down), nearer the stage-1 feed
    if (ll) {
      const dist = x => sum(x.map((v, i) => (v - fd[i]) ** 2));
      if (dist(ll.x2) < dist(ll.x1)) ll = { beta: 1 - ll.beta, x1: ll.x2, x2: ll.x1 };
    }
    if (!ll || Math.max(...ll.x1.map((v, i) => Math.abs(v - ll.x2[i]))) < SAME || !(ll.beta > 0 && ll.beta < 1)) {
      throw fail("BAD_INPUT", `Extraction: the feeds mixed together make one liquid at ${fmt(Tm)} K (no liquid-liquid split), so they cannot be extracted as given. Use less solvent, another solvent, or another temperature.`, { one_liquid: true, z, T_K: Tm });
    }
    const D0 = (1 - ll.beta) * F, U0 = ll.beta * F;
    let K = Array.from({ length: N }, () => ll.x2.map((v, i) => v / ll.x1[i]));
    let Dj = new Array(N).fill(D0), Uj = new Array(N).fill(U0);
    let dd, uu;
    for (let sweep = 0; sweep < SWEEPS; sweep++) {
      dd = Array.from({ length: N }, () => new Array(n).fill(0));
      uu = Array.from({ length: N }, () => new Array(n).fill(0));
      for (const i of act) {
        const S = K.map((Kj, j) => Kj[i] * Uj[j] / Dj[j]);
        const a = [], b = [], cc = [], rhs = [];
        for (let j = 0; j < N; j++) { a.push(1); b.push(-(1 + S[j])); cc.push(j < N - 1 ? S[j + 1] : 0); rhs.push(-f[j][i]); }
        const sol = thomas(a, b, cc, rhs);
        for (let j = 0; j < N; j++) { dd[j][i] = Math.max(sol[j], 1e-14 * F); uu[j][i] = Math.max(S[j] * sol[j], 1e-14 * F); }
      }
      Dj = dd.map(sum); Uj = uu.map(sum);
      K = dd.map((r, j) => {
        const x = r.map(v => v / Dj[j]), y = uu[j].map(v => v / Uj[j]);
        const gx = gammas(x, T[j]), gy = gammas(y, T[j]);
        return gx.map((g, i) => Math.min(Math.max(g / gy[i], 1e-12), 1e12));
      });
    }
    return { d: dd, u: uu };
  }

  // ---- the equations, in the logarithms of the flows of the components present
  const pack = (dd, uu) => { const v = new Float64Array(N * m); for (let j = 0; j < N; j++) act.forEach((i, k) => { v[j * m + k] = Math.log(Math.max(dd[j][i], 1e-300)); v[j * m + c + k] = Math.log(Math.max(uu[j][i], 1e-300)); }); return v; };
  const flowsOf = (v, j) => { const dd = new Array(n).fill(0), uu = new Array(n).fill(0); act.forEach((i, k) => { dd[i] = Math.exp(v[j * m + k]); uu[i] = Math.exp(v[j * m + c + k]); }); return [dd, uu]; };
  const lnAct = (fl, j) => { const S = sum(fl), x = fl.map(v => v / S), g = gammas(x, T[j]); return act.map(i => Math.log(x[i] * g[i])); };

  function stageRes(v, j, out, at) {
    const [dj, uj] = flowsOf(v, j);
    const dPrev = j > 0 ? flowsOf(v, j - 1)[0] : null, uNext = j < N - 1 ? flowsOf(v, j + 1)[1] : null;
    const ax = lnAct(dj, j), ay = lnAct(uj, j);
    act.forEach((i, k) => {
      out[at + k] = (dj[i] + uj[i] - (dPrev ? dPrev[i] : 0) - (uNext ? uNext[i] : 0) - f[j][i]) / F;
      out[at + c + k] = ax[k] - ay[k];
    });
  }
  function residual(v) { const r = new Float64Array(N * m); for (let j = 0; j < N; j++) stageRes(v, j, r, j * m); return r; }
  const norm = r => r.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
  function groups(r) {
    let mat = 0, eq = 0;
    for (let j = 0; j < N; j++) for (let k = 0; k < c; k++) { mat = Math.max(mat, Math.abs(r[j * m + k])); eq = Math.max(eq, Math.abs(r[j * m + c + k])); }
    return { material: mat, equilibrium: eq };
  }

  function jacobian(v) {
    const M = N * m, J = Array.from({ length: M }, () => new Float64Array(M));
    const tmp = new Float64Array(M), tmq = new Float64Array(M);
    for (let j = 0; j < N; j++) {
      for (let k = 0; k < m; k++) {
        const col = j * m + k, h = 1e-6;
        const vp = Float64Array.from(v); vp[col] += h;
        const vm = Float64Array.from(v); vm[col] -= h;
        for (let s = Math.max(0, j - 1); s <= Math.min(N - 1, j + 1); s++) {
          stageRes(vp, s, tmp, s * m); stageRes(vm, s, tmq, s * m);
          for (let q = 0; q < m; q++) J[s * m + q][col] = (tmp[s * m + q] - tmq[s * m + q]) / (2 * h);
        }
      }
    }
    return J;
  }

  let v = pack(d, u), r = residual(v), g = groups(r), it = 0;
  const ok = gg => gg.material < LL_TOLERANCES.material && gg.equilibrium < LL_TOLERANCES.equilibrium;
  while (!ok(g) && it < MAX_NEWTON) {
    it++;
    const dx = gauss(jacobian(v), Array.from(r, x => -x));
    if (!dx) break;
    const big = dx.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
    const scale = big > LN_STEP ? LN_STEP / big : 1;
    let lam = scale, accepted = false;
    const r0 = norm(r);
    for (let h = 0; h < 30; h++) {
      const vn = v.map((x, q) => x + lam * dx[q]), rn = residual(vn);
      if (rn.every(Number.isFinite) && norm(rn) < r0) { v = vn; r = rn; accepted = true; break; }
      lam /= 2;
    }
    if (!accepted) break;
    g = groups(r);
  }
  if (!ok(g)) {
    throw fail("NO_CONVERGENCE", `Extraction: the liquid-liquid cascade did not converge in ${it} Newton steps (residuals: material ${fmt(g.material)} of the feed, equilibrium ${fmt(g.equilibrium)} in ln activity). This does not show that the cascade has no solution: try fewer stages, another solvent flow, or a temperature further from the plait point.`,
      { residuals: g, tolerances: LL_TOLERANCES });
  }

  // ---- the result, and the trivial solution refused
  const stages = [];
  for (let j = 0; j < N; j++) {
    const [dj, uj] = flowsOf(v, j);
    const D = sum(dj), U = sum(uj), x = dj.map(q => q / D), y = uj.map(q => q / U);
    if (Math.max(...x.map((q, i) => Math.abs(q - y[i]))) < SAME) {
      throw fail("BAD_INPUT", `Extraction: on stage ${j + 1} the two liquids have one composition: there the streams mix to one liquid at ${fmt(T[j])} K, so the cascade does not exist as specified. Use less solvent or another solvent, or check the solute's concentration against the plait point (${names.filter((_, i) => total[i] > 0).join(", ")}).`, { one_liquid: true, stage: j + 1 });
    }
    stages.push({ stage: j + 1, T_K: T[j], down: { flows: dj, x, F: D }, up: { flows: uj, x: y, F: U } });
  }
  return {
    stages, converged: true, iterations: it,
    products: { down: stages[N - 1].down.flows.slice(), up: stages[0].up.flows.slice() },
    residuals: g, tolerances: LL_TOLERANCES,
    solver: { start: opts.start ? "the previous solution" : `one liquid-liquid split of the mixed feeds, then ${SWEEPS} sweeps of the isothermal sum-rates method`, newton: it },
  };
}

function thomas(a, b, c, d) {
  const n = b.length, cp = new Array(n), dp = new Array(n);
  cp[0] = c[0] / b[0]; dp[0] = d[0] / b[0];
  for (let i = 1; i < n; i++) { const w = b[i] - a[i] * cp[i - 1]; cp[i] = c[i] / w; dp[i] = (d[i] - a[i] * dp[i - 1]) / w; }
  const x = new Array(n); x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  return x;
}

/** Gaussian elimination with partial pivoting; null if singular. */
function gauss(A, b) {
  const n = b.length;
  const M = A.map((row, i) => { const r = Array.from(row); r.push(b[i]); return r; });
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    if (!(Math.abs(M[p][k]) > 1e-300)) return null;
    if (p !== k) [M[p], M[k]] = [M[k], M[p]];
    for (let i = k + 1; i < n; i++) {
      const fct = M[i][k] / M[k][k];
      if (fct === 0) continue;
      for (let q = k; q <= n; q++) M[i][q] -= fct * M[k][q];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let q = i + 1; q < n; q++) s -= M[i][q] * x[q];
    x[i] = s / M[i][i];
  }
  return x;
}
