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
 * One phase (`phases: 1`, the default): the whole mixture is taken to be in the reaction's phase; the reactor flashes its
 * outlet afterwards and says when the outlet is not in that phase. Vapour and liquid (`phases: 2`, a reactive flash,
 * the maintainer 2026-10-28): at each set of extents the mixture is flashed at T and P (src/equilibrium/flash.js), and
 * the fugacities come from the phases found, the same in both at phase equilibrium. Chemical and phase equilibrium then
 * hold together; each reaction keeps its own standard state (vapour or liquid), so vapour and liquid reactions can be
 * mixed. The Jacobian's non-ideal part (which then holds the phase split) is taken by differences, as below.
 *
 * Gibbs mode (gibbsReactions): the species that may appear are given, not the reactions. Their element matrix A
 * (elements x species) is reduced to row echelon form, and each species that is not a pivot gives one reaction that
 * forms it from the pivot species: a basis of the null space of A, so every reaction among the species is a
 * combination of them. With such a complete set, the equilibrium of the listed reactions is the minimum of the Gibbs
 * energy with the elements balanced (Rawlings and Ekerdt, section 3.5.2, p. 92: the two approaches agree).
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
import { reactionProperties, checkReaction, P_STANDARD_KPA } from "../reactions/reaction.js";
import { componentRecord } from "../thermo/components.js";
import { parseFormula } from "../thermo/formula.js";
import { flash } from "./flash.js";

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

/**
 * The activities' logarithms of the mixture n at T and P, in the standard state of each phase that a reaction uses:
 * { vapour: ln(f/P°), liquid: ln(f/f_pure) }. One phase: the whole mixture in the reaction's phase. Two: the mixture
 * flashed, the fugacities of the phase found (the reaction's own when it is there).
 */
function lnActivities(sys, used, n, T, P, pureLnF, two) {
  const N = n.reduce((a, v) => a + v, 0);
  const z = n.map(v => Math.max(v, 0) / N);
  let lnf;
  if (two) {
    const fl = flash(sys, { z, T, P });
    const ph = fl.phases.find(q => q.type === used[0]) ?? fl.phases[0];
    lnf = sys.phase(ph.type, T, P, ph.composition).lnFugacity;
  }
  const out = {};
  for (const phase of used) {
    const f = lnf ?? sys.phase(phase, T, P, z).lnFugacity;
    out[phase] = phase === "vapour" ? f.map(v => v - Math.log(P_STANDARD_KPA)) : f.map((v, i) => v - pureLnF[i]);
  }
  return out;
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
 * @param {object[]} o.reactions  checked reactions (src/reactions/reaction.js), all of one phase with `phases` 1
 * @param {number[]} o.feed       amounts of the system's components (kmol/h)
 * @param {number} o.T_K
 * @param {number} o.P_kPa
 * @param {object[]} [o.approach] per reaction: null, { dT_K } or { fraction }
 * @param {number[]} [o.guess]    extents to start from (a previous solution)
 * @param {1|2} [o.phases]        1: the whole mixture in the reactions' phase; 2: vapour and liquid (a reactive flash)
 * @returns {{extents:number[], flows:number[], lnK:number[], residual:number, iterations:number, constants:object[], notes:string[], warnings:string[]}}
 */
export function reactionEquilibrium(sys, { reactions, feed, T_K, P_kPa, approach = [], guess = null, phases: nPhases = 1 }) {
  if (!reactions?.length) throw fail("BAD_INPUT", "Equilibrium: give at least one reaction.");
  const two = nPhases === 2;
  const used = [...new Set(reactions.map(r => r.phase))];
  if (used.length > 1 && !two) throw fail("BAD_INPUT", `Equilibrium: the reactions of one reactor must be in one phase (${reactions.map(r => `${r.name}: ${r.phase}`).join(", ")}), or the reactor must take vapour and liquid together.`);
  const phase = used[0];
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
  const pureLnF = used.includes("liquid") ? pureLiquidLnF(sys, T_K, P_kPa, active) : null;
  const rPhase = reactions.map(r => r.phase);
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
      // a seed takes at most half of what the reaction uses up (a species another reaction has just seeded)
      const room = s => Math.min(SEED * F0, ...nu[r].map((v, j) => (Math.sign(v) === s && v ? 0.5 * n[j] / Math.abs(v) : Infinity)));
      if (noProduct && !noReactant) { x[r] += room(-1); changed = true; }
      else if (noReactant && !noProduct) { x[r] -= room(1); changed = true; }
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
    const la = lnActivities(sys, used, n, T_K, P_kPa, pureLnF, two);
    return idx.map(r => nu[r].reduce((s, v, j) => s + (v ? v * la[rPhase[r]][j] : 0), 0) - lnK[r]);
  };
  // the non-ideal part of ln a (ln a minus ln x), for its derivative, per phase of the standard states
  const nonIdeal = xx => {
    const n = amounts(xx), N = n.reduce((a, v) => a + v, 0);
    const la = lnActivities(sys, used, n, T_K, P_kPa, pureLnF, two);
    return Object.fromEntries(used.map(ph => [ph, la[ph].map((v, j) => (active[j] ? v - Math.log(n[j] / N) : 0))]));
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
      const diff = (a, b, w) => Object.fromEntries(used.map(ph => [ph, a[ph].map((v, j) => (v - b[ph][j]) / w)]));
      if (ok(np) && ok(nm)) return diff(nonIdeal(xp), nonIdeal(xm), 2 * h);
      return ok(np) ? diff(nonIdeal(xp), c0, h) : diff(c0, nonIdeal(xm), h);
    });
    const dN = idx.map(s => nu[s].reduce((a, v) => a + v, 0));
    idx.forEach((r, a) => idx.forEach((s, b) => {
      let v = 0;
      for (let j = 0; j < nC; j++) {
        if (!nu[r][j]) continue;
        v += nu[r][j] * ((nu[s][j] / n[j]) - dN[b] / N + dC[b][rPhase[r]][j]);
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
  return { extents: x, equilibriumExtents: xEq, flows: amounts(x).map(v => Math.max(v, 0)), lnK, constants: K, residual: idx.length ? norm(g) : 0, iterations: it, phase, phases: two ? 2 : 1, notes, warnings };
}

/**
 * The reactions of a Gibbs reactor: a complete set of independent reactions among the given species (see the file
 * header), each with K from the formation data, in the given phase's standard state.
 * @param {object} sys
 * @param {string[]} species  component ids of the system that may react (the others pass through)
 * @param {"vapour"|"liquid"} phase
 * @returns {object[]} checked reactions, ids G1, G2, ...
 */
export function gibbsReactions(sys, species, phase = "vapour") {
  const ud = sys.userData;
  const atoms = species.map(id => {
    const rec = componentRecord(id, ud);
    let a = null;
    try { a = parseFormula(rec.formula ?? ""); } catch { /* below */ }
    if (!a || !Object.keys(a).length) throw fail("BAD_INPUT", `Gibbs reactor: ${rec.name} has no formula CHEPTA can read, so its elements cannot be balanced; leave it out of the species that react.`);
    return a;
  });
  const elements = [...new Set(atoms.flatMap(a => Object.keys(a)))].sort();
  const A = elements.map(e => atoms.map(a => a[e] ?? 0));
  // reduced row echelon form of A, with partial pivoting
  const m = A.length, nS = species.length, pivots = [];
  let row = 0;
  for (let c = 0; c < nS && row < m; c++) {
    let p = row;
    for (let r = row + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) continue;
    [A[row], A[p]] = [A[p], A[row]];
    const d = A[row][c];
    for (let k = 0; k < nS; k++) A[row][k] /= d;
    for (let r = 0; r < m; r++) {
      if (r === row || !A[r][c]) continue;
      const f = A[r][c];
      for (let k = 0; k < nS; k++) A[r][k] -= f * A[row][k];
    }
    pivots.push(c); row++;
  }
  const free = [...Array(nS).keys()].filter(c => !pivots.includes(c));
  if (!free.length) throw fail("BAD_INPUT", `Gibbs reactor: the species ${species.map(id => componentRecord(id, ud).name).join(", ")} cannot react with one another (each is the only one with its combination of elements). Add the products that can form.`);
  return free.map((f, k) => {
    const v = new Array(nS).fill(0);
    v[f] = 1;
    pivots.forEach((c, r) => { v[c] = -A[r][f]; });
    // the smallest whole multiple, when there is one up to 60
    let mult = 1;
    for (let q = 1; q <= 60; q++) if (v.every(a => Math.abs(a * q - Math.round(a * q)) < 1e-9)) { mult = q; break; }
    const st = {};
    v.forEach((a, i) => { const c = Math.abs(a * mult - Math.round(a * mult)) < 1e-9 ? Math.round(a * mult) : a * mult; if (c) st[species[i]] = c; });
    const name = equationText(st, ud);
    try { return checkReaction({ id: `G${k + 1}`, name, stoichiometry: st, phase, reversible: true }, { userData: ud }); }
    catch (e) { e.message = `Gibbs reactor: ${e.message}`; throw e; }
  });
}

/** "CO + 3 H2 ⇌ CH3OH" from a stoichiometry, with the components' names. */
function equationText(st, ud) {
  const side = s => Object.entries(st).filter(([, v]) => Math.sign(v) === s)
    .map(([id, v]) => `${Math.abs(v) === 1 ? "" : `${+Math.abs(v).toPrecision(6)} `}${componentRecord(id, ud).name}`).join(" + ");
  return `${side(-1)} ⇌ ${side(1)}`;
}
