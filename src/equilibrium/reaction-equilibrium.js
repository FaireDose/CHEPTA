/**
 * Chemical equilibrium of listed reactions (proposal 0010, step 4; layer 2): the extents ξ_r at which every reaction
 * meets its equilibrium constant,
 *   g_r(ξ) = Σ_j ν_rj ln a_j(n(ξ)) - ln K_r(T_r) = 0,   n = n0 + νᵀ ξ,
 * with the activities from the property package in the reaction's phase (the standard states of
 * src/reactions/reaction.js):
 *   vapour reaction:  a_j = f_j / P°, f_j the fugacity in the vapour at T and P (the ideal gas, PR or SRK; for a
 *                     dimerizing acid its monomer's, as its formation record is the monomer's);
 *   liquid reaction:  a_j = f_j / f_j,pure, the fugacity in the liquid mixture over that of the pure liquid at the same
 *                     T and P, both from the same model: γ_j x_j for an activity model (the Poynting factor cancels),
 *                     φ_j x_j / φ_j,pure for an equation of state.
 * Rawlings and Ekerdt, Chemical Reactor Analysis and Design Fundamentals, 2nd ed., 6th printing (full text free to read
 * from the authors, https://sites.engineering.ucsb.edu/~jbraw/chemreacfun/), section 3.5.1 (p. 88): the equilibrium
 * condition of several reactions as algebraic equations in the extents, solved here by Newton's method; K = Π a_j^ν_j
 * with K = exp(-ΔG°/RT) (eqns 3.10 and 3.11, p. 66).
 *
 * The whole mixture is taken to be in the reaction's phase (one phase): the reactor flashes its outlet afterwards and
 * says when the outlet is not in that phase (a reactive flash, with both phases at chemical and phase equilibrium, is
 * not done here).
 *
 * Newton's method in the extents, with the Jacobian of the ideal part, ∂ ln x_j / ∂ n_k = δ_jk / n_j - 1 / N, exact,
 * and of the non-ideal part (ln φ_j, ln γ_j) by central differences. Every step keeps each species that takes part
 * above zero (at most 90 % of the way to zero), and is halved until the residual falls. A species that takes part and
 * is absent from the feed is first made present by a small extent (1e-8 of the feed) of a reaction that forms it; a
 * reaction none of whose species can be formed from the feed has no extent, and says so.
 *
 * An approach to equilibrium, per reaction: { dT_K } evaluates K at T + dT (a temperature approach), { fraction }
 * takes that fraction of the equilibrium extent.
 * Units: K, kPa, kmol/h (any consistent amount: only the ratios matter).
 */
import { fail } from "../util/errors.js";
import { reactionProperties, P_STANDARD_KPA } from "../reactions/reaction.js";

const MAX_ITER = 200;
const TOL = 1e-10;      // max |g_r| (ln units)
const SEED = 1e-8;      // a species absent from the feed is seeded at this fraction of the feed

/** ln K of each reaction at its own temperature, with what it comes from and the warnings. */
function constants(sys, reactions, T, approach) {
  return reactions.map((r, k) => {
    const Tr = T + (approach[k]?.dT_K ?? 0);
    const p = reactionProperties(r, Tr, { userData: sys.userData });
    if (p.lnK === null) {
      throw fail("MISSING_DATA", `${r.name}: no equilibrium constant at ${Tr.toFixed(2)} K (${p.notes.at(-1) ?? "no data"}). Give K as a correlation (equilibrium.lnK) with its source, or use a conversion reactor.`);
    }
    return { lnK: p.lnK, T_K: Tr, from: p.from, warnings: p.warnings, dH_J_mol: p.dH_J_mol };
  });
}

/** The activities' logarithms of the mixture n (all of it in one phase) at T and P. */
function lnActivities(sys, phase, n, T, P, pureLnF) {
  const N = n.reduce((a, v) => a + v, 0);
  const z = n.map(v => Math.max(v, 0) / N);
  const ph = sys.phase(phase, T, P, z);
  if (phase === "vapour") return ph.lnFugacity.map(v => v - Math.log(P_STANDARD_KPA));
  return ph.lnFugacity.map((v, i) => v - pureLnF[i]);
}

/** ln f of each pure liquid at T and P (the liquid standard state), for the components that take part. */
function pureLiquidLnF(sys, T, P, active) {
  return sys.ids.map((_, i) => {
    if (!active[i]) return 0;
    const e = sys.ids.map((__, k) => (k === i ? 1 : 0));
    return sys.phase("liquid", T, P, e).lnFugacity[i];
  });
}

/** Solve a small dense linear system A x = b (Gaussian elimination with partial pivoting); null if singular. */
function solveLinear(A, b) {
  const m = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (!(Math.abs(M[p][c]) > 1e-300)) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < m; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= m; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(m).fill(0);
  for (let r = m - 1; r >= 0; r--) {
    let s = M[r][m];
    for (let k = r + 1; k < m; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x.every(Number.isFinite) ? x : null;
}

/**
 * The equilibrium extents of the reactions at T and P.
 * @param {object} sys       the property package (createSystem)
 * @param {object} o
 * @param {object[]} o.reactions  checked reactions (src/reactions/reaction.js), all of one phase
 * @param {number[]} o.feed       amounts of the system's components (kmol/h)
 * @param {number} o.T_K
 * @param {number} o.P_kPa
 * @param {object[]} [o.approach] per reaction: null, { dT_K } or { fraction }
 * @param {number[]} [o.guess]    extents to start from (a previous solution)
 * @returns {{extents:number[], flows:number[], lnK:number[], residual:number, iterations:number, constants:object[], notes:string[], warnings:string[]}}
 */
export function reactionEquilibrium(sys, { reactions, feed, T_K, P_kPa, approach = [], guess = null }) {
  if (!reactions?.length) throw fail("BAD_INPUT", "Equilibrium: give at least one reaction.");
  const phases = [...new Set(reactions.map(r => r.phase))];
  if (phases.length > 1) throw fail("BAD_INPUT", `Equilibrium: the reactions of one reactor must be in one phase (${reactions.map(r => `${r.name}: ${r.phase}`).join(", ")}).`);
  const phase = phases[0];
  const nR = reactions.length, nC = sys.n;
  const nu = reactions.map(r => {
    for (const id of Object.keys(r.stoichiometry)) if (!sys.ids.includes(id)) throw fail("BAD_INPUT", `${r.name}: ${id} is in the reaction but not a component of this simulation (${sys.names.join(", ")}).`);
    return sys.ids.map(id => r.stoichiometry[id] ?? 0);
  });
  const active = sys.ids.map((_, j) => nu.some(row => row[j] !== 0));
  const F0 = feed.reduce((a, v) => a + Math.max(v, 0), 0);
  if (!(F0 > 0)) throw fail("BAD_INPUT", "Equilibrium: the feed has no flow.");
  const notes = [], warnings = [];
  const K = constants(sys, reactions, T_K, approach);
  for (const k of K) warnings.push(...k.warnings);
  const lnK = K.map(k => k.lnK);
  const pureLnF = phase === "liquid" ? pureLiquidLnF(sys, T_K, P_kPa, active) : null;
  const amounts = x => feed.map((v, j) => v + nu.reduce((s, row, r) => s + row[j] * x[r], 0));

  // the reactions that can run: seed the absent species they need, through the reactions that form them
  let x = guess && guess.length === nR ? guess.slice() : new Array(nR).fill(0);
  const free = new Array(nR).fill(true);
  for (let pass = 0; pass < nR + 1; pass++) {
    const n = amounts(x);
    let changed = false;
    for (let r = 0; r < nR; r++) {
      if (!free[r]) continue;
      const missing = s => nu[r].some((v, j) => Math.sign(v) === s && !(n[j] > 0));
      const noReactant = missing(-1), noProduct = missing(1);
      if (noProduct && !noReactant) { x[r] += SEED * F0; changed = true; }
      else if (noReactant && !noProduct) { x[r] -= SEED * F0; changed = true; }
    }
    if (!changed) break;
  }
  {
    const n = amounts(x);
    for (let r = 0; r < nR; r++) {
      const absent = nu[r].map((v, j) => (v !== 0 && !(n[j] > 0) ? sys.names[j] : null)).filter(Boolean);
      if (absent.length) {
        free[r] = false;
        notes.push(`${reactions[r].name}: ${absent.join(", ")} ${absent.length > 1 ? "are" : "is"} neither fed nor formed by the other reactions, so it does not run (extent 0).`);
      }
    }
    if (free.some((f, r) => !f && x[r] !== 0)) for (let r = 0; r < nR; r++) if (!free[r]) x[r] = 0;
  }
  const idx = [...Array(nR).keys()].filter(r => free[r]);
  const residual = xx => {
    const n = amounts(xx);
    if (n.some((v, j) => active[j] && !(v > 0))) return null;
    const la = lnActivities(sys, phase, n, T_K, P_kPa, pureLnF);
    return idx.map(r => nu[r].reduce((s, v, j) => s + (v ? v * la[j] : 0), 0) - lnK[r]);
  };
  // the non-ideal part of ln a (ln a minus ln x), for its derivative
  const nonIdeal = xx => {
    const n = amounts(xx), N = n.reduce((a, v) => a + v, 0);
    const la = lnActivities(sys, phase, n, T_K, P_kPa, pureLnF);
    return la.map((v, j) => (active[j] ? v - Math.log(n[j] / N) : 0));
  };

  let g = idx.length ? residual(x) : [];
  if (g === null) throw new Error("Internal: the equilibrium starting point is outside the feasible region. Please report this.");
  let it = 0;
  const norm = v => Math.max(0, ...v.map(Math.abs));
  while (idx.length && norm(g) > TOL && it < MAX_ITER) {
    it++;
    const n = amounts(x), N = n.reduce((a, v) => a + v, 0);
    // Jacobian: ideal part exact, non-ideal part by central differences in each extent
    const J = idx.map(() => new Array(idx.length).fill(0));
    const c0 = nonIdeal(x);
    const dC = idx.map(s => {
      const h = 1e-6 * Math.max(Math.abs(x[s]), 1e-6 * F0);
      const xp = x.slice(), xm = x.slice();
      xp[s] += h; xm[s] -= h;
      const np = amounts(xp), nm = amounts(xm);
      const ok = v => v.every((a, j) => !active[j] || a > 0);
      if (ok(np) && ok(nm)) { const a = nonIdeal(xp), b = nonIdeal(xm); return a.map((v, j) => (v - b[j]) / (2 * h)); }
      const a = ok(np) ? nonIdeal(xp) : c0, b = ok(np) ? c0 : nonIdeal(xm);
      return a.map((v, j) => (v - b[j]) / h);
    });
    const dN = idx.map(s => nu[s].reduce((a, v) => a + v, 0));
    idx.forEach((r, a) => idx.forEach((s, b) => {
      let v = 0;
      for (let j = 0; j < nC; j++) {
        if (!nu[r][j]) continue;
        v += nu[r][j] * ((nu[s][j] / n[j]) - dN[b] / N + dC[b][j]);
      }
      J[a][b] = v;
    }));
    const step = solveLinear(J, g.map(v => -v));
    if (!step) throw fail("NO_CONVERGENCE", `Equilibrium at ${T_K.toFixed(2)} K, ${P_kPa} kPa: the reactions ${idx.map(r => reactions[r].name).join(", ")} are not independent (one is a combination of the others). Remove one of them.`);
    // keep every species that takes part above zero
    let t = 1;
    const dn = sys.ids.map((_, j) => idx.reduce((s, r, a) => s + nu[r][j] * step[a], 0));
    for (let j = 0; j < nC; j++) if (active[j] && dn[j] < 0) t = Math.min(t, 0.9 * n[j] / -dn[j]);
    let accepted = false;
    for (let h = 0; h < 40; h++) {
      const xn = x.slice();
      idx.forEach((r, a) => { xn[r] += t * step[a]; });
      const gn = residual(xn);
      if (gn && (norm(gn) < norm(g) || norm(gn) < TOL)) { x = xn; g = gn; accepted = true; break; }
      t /= 2;
    }
    if (!accepted) break;
  }
  if (idx.length && !(norm(g) <= 1e-8)) {
    throw fail("NO_CONVERGENCE", `Equilibrium at ${T_K.toFixed(2)} K, ${P_kPa} kPa did not converge for ${idx.map(r => reactions[r].name).join(", ")} (largest residual in ln K: ${norm(g).toExponential(2)} after ${it} iterations). An equilibrium very far to one side (ln K ${lnK.map(v => v.toFixed(1)).join(", ")}) can need a conversion reactor instead; check also that the reactions are independent.`);
  }
  // an approach given as a fraction of the equilibrium extent
  const xEq = x.slice();
  approach.forEach((a, r) => { if (a?.fraction != null) x[r] = a.fraction * xEq[r]; });
  return { extents: x, equilibriumExtents: xEq, flows: amounts(x).map(v => Math.max(v, 0)), lnK, constants: K, residual: idx.length ? norm(g) : 0, iterations: it, phase, notes, warnings };
}
