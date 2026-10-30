/**
 * The column engine (proposal 0015, Part I, section 1, and section 9, contract 3): one engine for every column
 * configuration (distillation, absorber, stripper, extraction). Milestone M2a builds the vapour-liquid cascade with a
 * condenser (total or partial) and a partial reboiler; milestone M2b adds two liquids on the stages (phases "VLL",
 * src/units/columns/two-liquids.js) and a decanter on the condenser; the other configurations ("LL", side draws) refuse
 * with NOT_AVAILABLE until their milestone.
 *
 *   solveCascade({ sys | thermo, stages, feeds, draws, specs, ends: { condenser, reflux_liquid }, phases: "VL" | "VLL",
 *                  P_kPa, start })
 *   → { stages: [...], converged, residuals: { material, equilibrium, summation, energy, specifications },
 *       tolerances, iterations, warnings, products, duties, solver }
 *
 * Units inside the engine: SI (mol/s, K, kPa, J/mol, W).
 *
 * The equations: MESH on equilibrium stages, numbered from the top (1 the condenser, N the partial reboiler, both
 * counted; the conventions of validation/data/columns/README.md), written in the variables of Naphtali and Sandholm:
 * per stage j the component flows of the liquid l_ij and of the vapour v_ij leaving it, and its temperature T_j
 * (L_j = sum_i l_ij, V_j = sum_i v_ij, x = l / L, y = v / V), as the open source code of DWSIM documents them
 * (DWSIM, GPL-3.0, DWSIM.UnitOperations/UnitOperations/RigorousColumnSolvers/NewtonRaphson.vb, class
 * NaphtaliSandholmMethod, branch "windows", https://github.com/DanWBR/dwsim, read 2026-10-29):
 *
 *   M_ij = l_ij + v_ij - l_i,j-1 - v_i,j+1 - f_ij = 0                       (material, one per component)
 *   E_ij = K_ij l_ij V_j / L_j - v_ij = 0                                   (equilibrium, K_ij = K_i(x_j, y_j, T_j, P))
 *   H_j  = L_j-1 h_L,j-1 + V_j+1 h_V,j+1 + H_F,j - L_j h_L,j - V_j h_V,j = 0   (energy; Q_j = 0 inside the column)
 *
 * The summations are met by the definitions of x and y. A total condenser (stage 1) is not an equilibrium stage: its
 * "vapour" variables hold the liquid distillate d_i, and its E equations say that the reflux and the distillate have one
 * composition, l_i D - d_i L = 0 for all components but the last, and that the liquid is at its bubble point,
 * sum_i K_i x_i - 1 = 0 (DWSIM writes the same two conditions for its total condenser). The energy balances of the
 * condenser and of the reboiler are replaced by the two specifications; their duties follow from those balances. A
 * specification of a duty keeps that balance, with the duty given.
 * A decanter (condenser "decanter", phases "VLL"; milestone M2b) is a total condenser whose liquid splits into two: its
 * "liquid" variables hold the reflux (one of the two liquids, returned entirely) and its "vapour" variables the other
 * liquid, the distillate. Its E equations say that both liquids are in equilibrium with one vapour,
 * K_i(x_reflux) x_reflux,i - K_i(x_distillate) x_distillate,i = 0 (equal activities), and its energy row that the reflux
 * is at its bubble point, sum_i K_i x_i - 1 = 0; the condenser's energy balance gives its duty, and the column takes one
 * specification, on the bottom or a product flow. With two liquids on the stages, each stage's whole liquid takes the
 * place of the one liquid, its K-values and enthalpy from the stage's liquid-liquid split (two-liquids.js). Each
 * specification is written on the stage whose
 * variables it holds, so that the Jacobian stays block-tridiagonal; a product flow is written on the other end where
 * needed, as B = F - D (true at every solution, since the material balances then close).
 *
 * The solver, as NeqSim's column documentation describes its Naphtali-Sandholm solver ("a finite-difference
 * block-tridiagonal Jacobian from neighboring tray couplings", "a guarded Newton line search with flow and temperature
 * trust limits", started from a robust first solution; https://equinor.github.io/neqsim/wiki/distillation_column, read
 * 2026-10-29), written anew here, not translated:
 *  1. the start: constant molar overflow from the specifications and the feeds' liquid fractions, then the bubble-point
 *     method of Wang and Henke as DWSIM's BubblePoint.vb documents it (same repository and date): the component
 *     balances as one tridiagonal system per component at fixed K, each stage's temperature at its bubble point, and
 *     the vapour flows from the energy balances, alpha_j V_j + beta_j V_j+1 = gamma_j, repeated a few times. Only a
 *     first guess: a previous solution of the same column (`start`) replaces it when given;
 *  2. Newton's method on all N (2C + 1) equations together: the Jacobian by central differences, stage by stage (a
 *     stage's K-values and enthalpies depend on its own variables only), solved by Gaussian elimination with partial
 *     pivoting inside the band; the step taken in the logarithms of the component flows (a trace flow can fall by
 *     orders of magnitude without turning negative; at most a factor e^5 per step), limited to 20 K on any stage, and
 *     halved until the scaled residual falls;
 *     Newton gives up when its residual has not fallen a thousandfold in PATIENCE iterations;
 *  3. if Newton fails from the start, by continuation: the column is solved
 *     with every component's ln K replaced by their mean (no separation, an easy column), and the differences are
 *     brought back in steps, each solve started from the previous one (this project's choice of a continuation method;
 *     NeqSim reaches its product specifications in steps too). Long columns with very pure products need it: their
 *     equations are nearly singular, and a small residual can hide a large distance from the solution. A solver that does not converge says so
 *     (NO_CONVERGENCE) with what it tried and its residuals by group: it is not a statement that the column has no
 *     solution.
 * The column counts as solved only when every group of residuals meets its tolerance (TOLERANCES, stated in the
 * result): proposal 0015's "every stage's balances closed".
 *
 * After it converges:
 *  - the phase-stability check: with phases "VL" the liquid of every stage is tested for a split into two liquids
 *    (Michelsen's tangent-plane test of src/equilibrium/stability.js for activity models, src/equilibrium/eos-stability.js
 *    for an equation of state). A stage where a second liquid would form is refused (PHASE_SPLIT), never returned as a
 *    metastable one-liquid answer (contract 3). With phases "VLL" each of a stage's two liquids is tested for a third,
 *    which is refused (as by the flash); a decanter whose two liquids came out the same is refused;
 *  - the dry-stage warning (DRY_STAGE): a stage between the condenser and the reboiler whose liquid falls below
 *    DRY_FRACTION (1 %) of the column's largest vapour flow (this project's choice, no open source found; W7's case D1
 *    holds for any threshold between 0.001 and 2/3), or a stage below the condenser whose vapour falls below 1/TURNDOWN
 *    of the column's largest vapour flow (the bubble-cap turndown of 5 in the open source cited at TURNDOWN). The
 *    hydraulic checks with the trays' geometry (flooding, weeping) come with milestone M2b.
 *
 * The thermodynamics reach the engine as an adapter (`thermo`), built from the flowsheet's system by cascadeThermo(sys)
 * or written directly for a model system (test/columns-rigorous.test.js): { n, names, lnK(x, y, T, j?), hL(x, T, j?),
 * hV(y, T), bubbleT(x), stable?(x, T), warnings?(T) }, at the column's pressure (j, the stage, is only a hint for the
 * two-liquid adapter's starts). The column's own property method (milestone M2b) is the block's: it passes that
 * method's system, and the P-H boundary at its streams (src/units/columns/column.js).
 */
import { fail } from "../../util/errors.js";
import { anyBubbleT } from "../../equilibrium/bubble-any.js";
import { liquidTangentPlane } from "../../equilibrium/stability.js";
import { tpdStability } from "../../equilibrium/eos-stability.js";
import { twoLiquidThermo } from "./two-liquids.js";

export const CASCADE_PHASES = Object.freeze(["VL", "LL", "VLL"]);
/** The specifications of milestone M2a, and those that come later (M4). */
export const CASCADE_SPECS = Object.freeze(["reflux_ratio", "boilup_ratio", "distillate_rate", "bottoms_rate", "condenser_duty", "reboiler_duty"]);
const LATER_SPECS = ["distillate_purity", "bottoms_purity", "recovery"];
/** The dry-stage threshold of the liquid: below this fraction of the column's largest vapour flow (this project's
 *  choice: no open source gives one for equilibrium stages without the trays' geometry). */
export const DRY_FRACTION = 0.01;
/** The vapour's: the largest turndown ratio of the open source, 5 for bubble-cap trays (sieve 2, valve 4; M. Fermeglia,
 *  "Staged column design", Separation Processes, University of Trieste, 2021, slide 54, free to read: the ratio of the
 *  largest vapour flow, at flooding, to the smallest, at excessive weeping). A stage below 1/5 of the column's largest
 *  vapour flow is outside even that range if the column has one diameter. */
export const TURNDOWN = 5;
/** The start reflux ratios a column with a decanter tries in turn (this project's choice; the decanter's reflux is not a
 *  specification, only the start needs a value). */
const DECANTER_START_REFLUX = [1, 3, 0.5, 2, 5];
/** J/mol: the energy residuals are divided by F times this, as W7's reference does. */
export const H_SCALE = 1e4;
/** The largest change of the logarithm of a component flow in one Newton step (a factor of e^5, about 150). */
const LN_STEP = 5;
/** Newton gives up when its scaled residual has not fallen a thousandfold in this many iterations. */
const PATIENCE = 12;
/**
 * The tolerances a solution must meet, by group: material in mol/s relative to the total feed, energy in W relative to
 * the total feed times H_SCALE, equilibrium and summation in mole fraction, specifications relative to their value
 * (W7's cases: "every stage's balances closed to 1e-8"; these are tighter).
 */
export const TOLERANCES = Object.freeze({ material: 1e-10, energy: 1e-10, equilibrium: 1e-10, summation: 1e-10, specifications: 1e-10 });

const sum = v => v.reduce((a, b) => a + b, 0);
const fmt = v => +Number(v).toPrecision(4);

/**
 * The thermodynamic adapter of a flowsheet's system at pressure P (kPa): K-values from sys.lnKValues (activity models,
 * with their vapour model) or from the fugacity coefficients of an equation of state; enthalpies from sys.enthalpy;
 * bubble temperatures from the bubble-point solvers; the liquid's stability against a second liquid.
 */
export function cascadeThermo(sys, P) {
  if (Array.isArray(sys.solid) && sys.solid.some(Boolean)) throw fail("NOT_AVAILABLE", "Column: a flowsheet with inert solids cannot be distilled by the rigorous column yet.");
  if (sys.nonvolatile?.some(Boolean)) {
    throw fail("NOT_AVAILABLE", `Column: ${sys.names.filter((_, i) => sys.nonvolatile[i]).join(", ")} is nonvolatile; columns with nonvolatile components come with step 7 of proposal 0015 (milestone M3).`);
  }
  const eos = sys.kind === "eos";
  if (!eos && !sys.lnKValues) throw fail("NOT_AVAILABLE", "Column: the rigorous column does not handle the chemical theory of dimerizing acids in the vapour yet; build the system with association: false, or use the shortcut column.");
  const lnK = eos
    ? (x, y, T) => { const a = sys.lnPhi(T, P, x, "liquid"), b = sys.lnPhi(T, P, y, "vapour"); return a.map((v, i) => v - b[i]); }
    : (x, y, T) => sys.lnKValues(x, y, T, P);
  return {
    n: sys.n, names: sys.names, P_kPa: P, lnK,
    hL: (x, T) => sys.enthalpy("liquid", T, P, x),
    hV: (y, T) => sys.enthalpy("vapour", T, P, y),
    bubbleT: x => anyBubbleT(sys, x, P).T,
    stable(x, T) {
      if (sys.n < 2) return { stable: true };
      if (eos) { const s = tpdStability(sys.eos, T, P, x, "liquid"); return { stable: s.stable || s.trialRoot === "vapour", trial: s.trial }; }
      const s = liquidTangentPlane(sys, x, T);
      return { stable: s.stable, trial: s.trial };
    },
    warnings: T => (sys.warnings ? sys.warnings(T, P) : []),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Linear algebra: Gaussian elimination with partial pivoting inside a band (kl below, ku above the diagonal; the
// pivoting widens the upper band to kl + ku). Storage: row r holds columns r - kl .. r + kl + ku.

function bandMatrix(n, kl, ku) {
  const w = 2 * kl + ku + 1;
  return { n, kl, ku, w, a: new Float64Array(n * w) };
}
const bandAt = (B, r, c) => r * B.w + (c - r + B.kl);

function bandSolve(B, b) {
  const { n, kl, ku, a } = B, x = Float64Array.from(b);
  const span = kl + ku;
  for (let k = 0; k < n; k++) {
    const rmax = Math.min(n - 1, k + kl);
    let p = k, best = Math.abs(a[bandAt(B, k, k)]);
    for (let r = k + 1; r <= rmax; r++) { const v = Math.abs(a[bandAt(B, r, k)]); if (v > best) { best = v; p = r; } }
    if (!(best > 0)) return null;
    const cmax = Math.min(n - 1, k + span);
    if (p !== k) {
      for (let c = k; c <= cmax; c++) { const i = bandAt(B, k, c), j = bandAt(B, p, c); const t = a[i]; a[i] = a[j]; a[j] = t; }
      const t = x[k]; x[k] = x[p]; x[p] = t;
    }
    const piv = a[bandAt(B, k, k)];
    for (let r = k + 1; r <= rmax; r++) {
      const ir = bandAt(B, r, k), f = a[ir] / piv;
      if (f === 0) continue;
      a[ir] = 0;
      for (let c = k + 1; c <= cmax; c++) a[bandAt(B, r, c)] -= f * a[bandAt(B, k, c)];
      x[r] -= f * x[k];
    }
  }
  for (let k = n - 1; k >= 0; k--) {
    let s = x[k];
    const cmax = Math.min(n - 1, k + kl + ku);
    for (let c = k + 1; c <= cmax; c++) s -= a[bandAt(B, k, c)] * x[c];
    x[k] = s / a[bandAt(B, k, k)];
  }
  return x.every(Number.isFinite) ? x : null;
}

/** A tridiagonal system: sub a, diagonal b, super c, right-hand side d; with partial pivoting (Thomas' algorithm
 *  without pivoting loses the trace components of a long column, whose matrix is not diagonally dominant). */
function tridiagonal(a, b, c, d) {
  const n = b.length, B = bandMatrix(n, 1, 1);
  for (let j = 0; j < n; j++) {
    B.a[bandAt(B, j, j)] = b[j];
    if (j > 0) B.a[bandAt(B, j, j - 1)] = a[j];
    if (j < n - 1) B.a[bandAt(B, j, j + 1)] = c[j];
  }
  return bandSolve(B, d) ?? d.map(() => NaN);
}

// ---------------------------------------------------------------------------------------------------------------
// The input

function checkInput({ stages, feeds, draws, specs, ends, phases }, n) {
  if (phases !== "VL" && phases !== "VLL") {
    if (CASCADE_PHASES.includes(phases)) throw fail("NOT_AVAILABLE", `Column: phases "${phases}" (two liquids without a vapour: extraction) come with milestone M3 of proposal 0015; the column solves vapour and one liquid ("VL") or vapour and up to two liquids ("VLL").`);
    throw fail("BAD_INPUT", `Column: phases must be one of ${CASCADE_PHASES.join(", ")} (got ${JSON.stringify(phases)}).`);
  }
  if (draws?.length) throw fail("NOT_AVAILABLE", "Column: side draws come with milestone M4 of proposal 0015.");
  const N = Number(stages);
  if (!(Number.isInteger(N) && N >= 3)) throw fail("BAD_INPUT", `Column: the number of stages must be a whole number of 3 or more, the condenser and the reboiler included (got ${JSON.stringify(stages)}).`);
  const condenser = ends?.condenser ?? "total";
  if (!["total", "partial", "decanter"].includes(condenser)) throw fail("BAD_INPUT", `Column: condenser must be "total", "partial" or "decanter" (got ${JSON.stringify(condenser)}).`);
  const decanter = condenser === "decanter";
  if (decanter && phases !== "VLL") throw fail("BAD_INPUT", "Column: a decanter on the condenser separates two liquids; turn on \"look for two liquids on the stages\" (phases \"VLL\", activity models).");
  const refluxLiquid = ends?.reflux_liquid ?? "light";
  if (decanter && !["light", "heavy"].includes(refluxLiquid)) throw fail("BAD_INPUT", `Column: reflux_liquid must be "light" or "heavy", the liquid of the decanter that returns to the column (got ${JSON.stringify(refluxLiquid)}).`);
  if ((ends?.reboiler ?? "partial") !== "partial") throw fail("NOT_AVAILABLE", "Column: only a partial reboiler is built (milestone M2a); a stripper without a reboiler comes with milestone M3.");
  if (!Array.isArray(feeds) || !feeds.length) throw fail("BAD_INPUT", "Column: give at least one feed.");
  const fs = feeds.map((f, k) => {
    const s = Number(f.stage);
    if (!(Number.isInteger(s) && s >= 2 && s <= N - 1)) throw fail("BAD_INPUT", `Column: feed ${k + 1} enters stage ${JSON.stringify(f.stage)}; a feed enters a stage between the condenser (1) and the reboiler (${N}), so 2 to ${N - 1}.`);
    if (!Array.isArray(f.flows) || f.flows.length !== n || f.flows.some(v => !(v >= 0))) throw fail("BAD_INPUT", `Column: feed ${k + 1} needs ${n} component flows, none negative.`);
    if (!Number.isFinite(f.H_W)) throw fail("BAD_INPUT", `Column: feed ${k + 1} needs its enthalpy flow H_W.`);
    return { stage: s - 1, flows: f.flows.map(Number), H_W: f.H_W, q: f.q };
  });
  const F = sum(fs.map(f => sum(f.flows)));
  if (!(F > 0)) throw fail("BAD_INPUT", "Column: the feeds have no flow.");
  // a decanter returns one liquid entirely: that fixes the reflux, and one specification is left
  const need = decanter ? 1 : 2;
  if (!Array.isArray(specs) || specs.length !== need) {
    throw fail("BAD_INPUT", decanter
      ? `Column: with a decanter the reflux is the whole ${refluxLiquid} liquid, so the column takes one specification, from boilup_ratio, reboiler_duty, distillate_rate, bottoms_rate; got ${Array.isArray(specs) ? specs.length : 0}.`
      : `Column: give two specifications (the column's degrees of freedom), from ${CASCADE_SPECS.join(", ")}; got ${Array.isArray(specs) ? specs.length : 0}.`);
  }
  if (decanter && ["reflux_ratio", "condenser_duty"].includes(specs[0]?.kind)) throw fail("BAD_INPUT", `Column: with a decanter the reflux is the whole ${refluxLiquid} liquid, so ${specs[0].kind} cannot be given; give boilup_ratio, reboiler_duty, distillate_rate or bottoms_rate.`);
  const later = specs.filter(s => LATER_SPECS.includes(s?.kind));
  if (later.length) throw fail("NOT_AVAILABLE", `Column: ${later.map(s => s.kind).join(", ")}: purity and recovery specifications come with milestone M4 of proposal 0015; give flows, ratios or duties.`);
  const bad = specs.filter(s => !CASCADE_SPECS.includes(s?.kind));
  if (bad.length) throw fail("BAD_INPUT", `Column: unknown specification ${bad.map(s => JSON.stringify(s?.kind)).join(", ")}. Known: ${CASCADE_SPECS.join(", ")}.`);
  if (specs.length === 2 && specs[0].kind === specs[1].kind) throw fail("BAD_INPUT", `Column: ${specs[0].kind} is given twice; give two different specifications.`);
  const kinds = specs.map(s => s.kind);
  if (kinds.includes("distillate_rate") && kinds.includes("bottoms_rate")) throw fail("BAD_INPUT", "Column: the distillate and the bottoms flows are not independent (they add up to the feed); give one of them with a ratio or a duty.");
  if (kinds.includes("condenser_duty") && kinds.includes("reboiler_duty")) throw fail("BAD_INPUT", "Column: the two duties fix the products only through the small difference of their enthalpies; give one duty with a flow or a ratio.");
  const out = specs.map(s => {
    const v = Number(s.value);
    if (!Number.isFinite(v)) throw fail("BAD_INPUT", `Column: ${s.kind} needs a number (got ${JSON.stringify(s.value)}).`);
    if (["reflux_ratio", "boilup_ratio", "condenser_duty", "reboiler_duty"].includes(s.kind) && !(v > 0)) throw fail("BAD_INPUT", `Column: ${s.kind} must be above zero (got ${v}).`);
    if (["distillate_rate", "bottoms_rate"].includes(s.kind) && !(v > 0 && v < F)) throw fail("BAD_INPUT", `Column: ${s.kind} must be between 0 and the total feed, ${fmt(F)} (got ${v}).`);
    return { kind: s.kind, value: v };
  });
  // each specification on the end whose variables it holds; a product flow fills the other end
  const TOP = ["reflux_ratio", "condenser_duty"], BOTTOM = ["boilup_ratio", "reboiler_duty"];
  const top = out.filter(s => TOP.includes(s.kind)), bottom = out.filter(s => BOTTOM.includes(s.kind));
  if (top.length > 1 || bottom.length > 1) {
    const [a, b] = top.length > 1 ? top : bottom;
    throw fail("BAD_INPUT", `Column: ${a.kind} and ${b.kind} both fix the ${top.length > 1 ? "top" : "bottom"} of the column; give one of them with a product flow or a specification of the other end.`);
  }
  const flow = out.filter(s => !TOP.includes(s.kind) && !BOTTOM.includes(s.kind));
  const slot = decanter ? [{ kind: "decanter" }, bottom[0] ?? flow.shift()] : [top[0] ?? flow.shift(), bottom[0] ?? flow.shift()];
  return { N, condenser, decanter, refluxLiquid, feeds: fs, F, specs: out, slot };
}

// ---------------------------------------------------------------------------------------------------------------
// The engine

/** Solve a vapour-liquid cascade; see the file header. */
export function solveCascade(opts = {}) {
  if (!opts.thermo && !opts.sys) throw fail("BAD_INPUT", "Column: give the property system (sys) and the pressure (P_kPa), or a thermodynamic adapter (thermo).");
  if (!opts.thermo && !(opts.P_kPa > 0)) throw fail("BAD_INPUT", `Column: P_kPa must be a positive number (got ${JSON.stringify(opts.P_kPa)}).`);
  let th = opts.thermo ?? cascadeThermo(opts.sys, opts.P_kPa);
  const n = th.n;
  const phases = opts.phases ?? "VL";
  const inp = checkInput({ ...opts, phases }, n);
  if (phases === "VLL" && !th.twoLiquids) {
    if (!opts.sys) throw fail("BAD_INPUT", "Column: two liquids on the stages need the property system (sys), or an adapter made by twoLiquidThermo.");
    th = twoLiquidThermo(th, opts.sys);
  }
  const { N, F, feeds, slot } = inp;
  // a decanter is a total condenser (no vapour leaves) whose liquid splits: stage 1's l holds the reflux liquid, its v
  // the distillate liquid, both at the reflux's bubble point and of equal activities
  const total = inp.condenser !== "partial", decanter = inp.decanter;
  const m = 2 * n + 1, nv = N * m;
  const fJ = Array.from({ length: N }, () => new Array(n).fill(0)), HF = new Array(N).fill(0);
  for (const f of feeds) { f.flows.forEach((v, i) => { fJ[f.stage][i] += v; }); HF[f.stage] += f.H_W; }
  const Ftot = F;
  const scaleE = F * H_SCALE;

  // ---- one stage's properties from its variables
  function props(j, u) {
    const o = j * m, l = [], v = [];
    for (let i = 0; i < n; i++) { l.push(u[o + i]); v.push(u[o + n + i]); }
    const T = u[o + 2 * n];
    const L = sum(l), V = sum(v);
    const x = l.map(a => Math.max(a, 0) / L);
    let y, K, xd = null, Kr = null, Kd = null, hD = null;
    if (j === 0 && total) {
      // the bubble vapour of the condenser's liquid (K may depend on y with a non-ideal vapour)
      y = x.slice();
      for (let k = 0; k < 50; k++) {
        K = th.lnK(x, y, T, j).map(Math.exp);
        const w = x.map((xi, i) => K[i] * xi), s = sum(w), yn = w.map(a => a / s);
        const ch = Math.max(...yn.map((a, i) => Math.abs(a - y[i])));
        y = yn;
        if (ch < 1e-14) break;
      }
      if (decanter) {
        // the two liquids of the decanter, each with its own (one-liquid) K-values at the same vapour
        xd = v.map(a => Math.max(a, 0) / V);
        Kr = th.base.lnK(x, y, T).map(Math.exp); Kd = th.base.lnK(xd, y, T).map(Math.exp);
        hD = th.base.hL(xd, T);
      }
    } else {
      y = v.map(a => Math.max(a, 0) / V);
      K = th.lnK(x, y, T, j).map(Math.exp);
    }
    const hL = th.hL(x, T, j), hV = j === 0 && total ? null : th.hV(y, T);
    if (!(Number.isFinite(hL) && (hV === null || Number.isFinite(hV)) && K.every(Number.isFinite))) throw fail("NO_CONVERGENCE", "Column: a property is not finite at a trial point.");
    if (decanter && j === 0 && !(Number.isFinite(hD) && Kd.every(Number.isFinite))) throw fail("NO_CONVERGENCE", "Column: a property is not finite at a trial point.");
    return { l, v, T, L, V, x, y, K, hL, hV, xd, Kr, Kd, hD };
  }

  // ---- the residuals of stage j (scaled), from the properties of j - 1, j, j + 1
  function specResidual(s, p, end) {
    const D = p.V, B = p.L;   // stage 1: V holds the distillate; stage N: L is the bottoms
    switch (s.kind) {
      case "reflux_ratio": return (p.L - s.value * D) / F;
      case "boilup_ratio": return (p.V - s.value * B) / F;
      case "distillate_rate": return end === 0 ? (D - s.value) / F : (B - (Ftot - s.value)) / F;
      case "bottoms_rate": return end === 0 ? (D - (Ftot - s.value)) / F : (B - s.value) / F;
      default: return null;   // the duties: in the energy balance
    }
  }
  function energyIn(j, pa, p, pb) {
    let e = HF[j];
    if (pa) e += pa.L * pa.hL;
    if (pb) e += pb.V * pb.hV;
    e -= j === 0 && decanter ? p.L * p.hL + p.V * p.hD : j === 0 && total ? (p.L + p.V) * p.hL : p.L * p.hL + p.V * p.hV;
    return e;   // W: in - out, before any duty
  }
  function stageResidual(j, pa, p, pb, out, at) {
    for (let i = 0; i < n; i++) {
      out[at + i] = (p.l[i] + p.v[i] - (pa ? pa.l[i] : 0) - (pb ? pb.v[i] : 0) - fJ[j][i]) / F;
    }
    if (j === 0 && decanter) {
      // the reflux and the distillate in equilibrium with one vapour (equal activities), the reflux at its bubble point
      for (let i = 0; i < n; i++) out[at + n + i] = p.Kr[i] * p.x[i] - p.Kd[i] * p.xd[i];
      out[at + 2 * n] = sum(p.K.map((k, i) => k * p.x[i])) - 1;
      return;
    }
    if (j === 0 && total) {
      for (let i = 0; i < n - 1; i++) out[at + n + i] = (p.l[i] * p.V - p.v[i] * p.L) / (p.L + p.V) / F;
      out[at + 2 * n - 1] = sum(p.K.map((k, i) => k * p.x[i])) - 1;
    } else {
      for (let i = 0; i < n; i++) out[at + n + i] = (p.K[i] * p.x[i] * p.V - p.v[i]) / F;
    }
    const end = j === 0 ? 0 : j === N - 1 ? 1 : null;
    let h;
    if (end === null) h = energyIn(j, pa, p, pb) / scaleE;
    else {
      const s = slot[end];
      if (s.kind === "condenser_duty") h = (energyIn(j, pa, p, pb) - s.value) / scaleE;
      else if (s.kind === "reboiler_duty") h = (energyIn(j, pa, p, pb) + s.value) / scaleE;
      else h = specResidual(s, p, end);
    }
    out[at + 2 * n] = h;
  }
  const residualOf = P => {
    const r = new Float64Array(nv);
    for (let j = 0; j < N; j++) stageResidual(j, P[j - 1], P[j], P[j + 1], r, j * m);
    return r;
  };
  const allProps = u => Array.from({ length: N }, (_, j) => props(j, u));
  const norm = r => Math.sqrt(r.reduce((a, b) => a + b * b, 0));

  // central differences (forward where a flow would turn negative): near a pinch the Jacobian is nearly singular, and
  // the error of forward differences (about 1e-8) is enough to turn the Newton step away from the solution
  function jacobian(u, P) {
    const B = bandMatrix(nv, 2 * m - 1, 2 * m - 1), tp = new Float64Array(m), tm = new Float64Array(m);
    for (let j = 0; j < N; j++) {
      const o = j * m;
      for (let k = 0; k < m; k++) {
        const uk = u[o + k], isT = k === 2 * n;
        const h = isT ? 1e-4 * Math.max(1, Math.abs(uk)) / 300 : 1e-5 * Math.abs(uk) + 1e-13 * F;
        const back = isT || uk - h > 0;
        const w = u.slice(); w[o + k] = uk + h;
        const pp = props(j, w), up = w[o + k];
        let pm = null, um = uk;
        if (back) { w[o + k] = uk - h; pm = props(j, w); um = w[o + k]; }
        for (let jj = Math.max(0, j - 1); jj <= Math.min(N - 1, j + 1); jj++) {
          const at = q => [jj - 1 === j ? q : P[jj - 1], jj === j ? q : P[jj], jj + 1 === j ? q : P[jj + 1]];
          stageResidual(jj, ...at(pp), tp, 0);
          if (pm) stageResidual(jj, ...at(pm), tm, 0);
          else for (let e = 0; e < m; e++) tm[e] = P.res[jj * m + e];
          for (let e = 0; e < m; e++) B.a[bandAt(B, jj * m + e, o + k)] = (tp[e] - tm[e]) / (up - um);
        }
      }
    }
    return B;
  }

  // ---- residuals by group, unscaled, for the result and the convergence test
  function groups(P) {
    const g = { material: 0, equilibrium: 0, summation: 0, energy: 0, specifications: 0 }, tmp = new Float64Array(m);
    const stageRes = [];
    for (let j = 0; j < N; j++) {
      const p = P[j], pa = P[j - 1], pb = P[j + 1];
      stageResidual(j, pa, p, pb, tmp, 0);
      const mat = Math.max(...Array.from(tmp.slice(0, n), Math.abs)) * F;
      let eq, su;
      if (j === 0 && decanter) {
        eq = Math.max(...p.x.map((xi, i) => Math.abs(p.Kr[i] * xi - p.Kd[i] * p.xd[i])));
        su = Math.abs(sum(p.K.map((k, i) => k * p.x[i])) - 1);
      } else if (j === 0 && total) {
        eq = Math.max(0, ...p.l.slice(0, n - 1).map((li, i) => Math.abs(li / p.L - p.v[i] / p.V)));
        su = Math.abs(sum(p.K.map((k, i) => k * p.x[i])) - 1);
      } else {
        eq = Math.max(...p.K.map((k, i) => Math.abs(p.v[i] / p.V - k * p.x[i])));
        su = Math.max(Math.abs(sum(p.x) - 1), Math.abs(sum(p.y) - 1));
      }
      const end = j === 0 ? 0 : j === N - 1 ? 1 : null;
      const s = end === null ? null : slot[end];
      const en = end === null || s.kind.endsWith("_duty") ? Math.abs(tmp[2 * n]) * scaleE : 0;
      if (s && !s.kind.endsWith("_duty") && s.kind !== "decanter") g.specifications = Math.max(g.specifications, Math.abs(tmp[2 * n]) * F / Math.max(Math.abs(s.value) * (s.kind.endsWith("_ratio") ? (end === 0 ? p.V : p.L) : 1), 1e-300));
      if (s?.kind.endsWith("_duty")) g.specifications = Math.max(g.specifications, Math.abs(tmp[2 * n]) * scaleE / s.value);
      g.material = Math.max(g.material, mat); g.equilibrium = Math.max(g.equilibrium, eq);
      g.summation = Math.max(g.summation, su); g.energy = Math.max(g.energy, en);
      stageRes.push({ material_mol_s: mat, equilibrium: eq, summation: su, energy_W: en });
    }
    return { g, stageRes };
  }
  const limits = { material: TOLERANCES.material * F, energy: TOLERANCES.energy * scaleE, equilibrium: TOLERANCES.equilibrium,
    summation: TOLERANCES.summation, specifications: TOLERANCES.specifications };
  const meets = g => Object.keys(limits).every(k => g[k] <= limits[k]);

  // ---- Newton's method with a guarded step
  function newton(u0, { dTmax, maxIt, patient = false }) {
    let u = Float64Array.from(u0), P = allProps(u);
    P.res = residualOf(P);
    let nr = norm(P.res), it = 0, stalls = 0;
    const n0 = nr;
    for (; it <= maxIt; it++) {
      if (meets(groups(P).g)) return { u, P, iterations: it, converged: true };
      if (it === maxIt) break;
      // Newton converges fast near a solution: no thousandfold fall in PATIENCE iterations means it is far from one
      if (patient && it === PATIENCE && nr > 1e-3 * n0) return { u, P, iterations: it, converged: false, why: `the residual fell only from ${fmt(n0)} to ${fmt(nr)} in ${PATIENCE} iterations` };
      const J = jacobian(u, P);
      // the step in the logarithms of the component flows (and in T): a trace flow can fall by orders of magnitude
      // and never turns negative; the columns of the Jacobian are scaled by the flows, d r / d ln u = u d r / d u
      for (let c = 0; c < nv; c++) {
        if (c % m === 2 * n) continue;
        for (let r = Math.max(0, c - J.ku); r <= Math.min(nv - 1, c + J.kl); r++) J.a[bandAt(J, r, c)] *= u[c];
      }
      const du = bandSolve(J, P.res.map(v => -v));
      if (!du) return { u, P, iterations: it, converged: false, why: "the Jacobian is singular" };
      let lam = 1;
      for (let j = 0; j < N; j++) { const dT = Math.abs(du[j * m + 2 * n]); if (dT * lam > dTmax) lam = dTmax / dT; }
      let best = null;
      for (let h = 0; h < 12; h++, lam /= 2) {
        const w = Float64Array.from(u);
        for (let k = 0; k < nv; k++) {
          const isT = k % m === 2 * n;
          w[k] = isT ? u[k] + lam * du[k] : u[k] * Math.exp(Math.max(-LN_STEP, Math.min(LN_STEP, lam * du[k])));
        }
        let Pw, nw;
        try { Pw = allProps(w); Pw.res = residualOf(Pw); nw = norm(Pw.res); } catch { nw = Infinity; }
        if (!(nw < Infinity)) continue;
        if (!best || nw < best.nw) best = { w, Pw, nw };
        if (nw < nr) break;
      }
      if (!best) return { u, P, iterations: it, converged: false, why: "every trial step left the range of the property records" };
      if (!(best.nw < nr)) { stalls += 1; if (stalls > 4) return { u, P, iterations: it, converged: false, why: "the residual stopped falling" }; } else stalls = 0;
      u = best.w; P = best.Pw; nr = best.nw;
    }
    return { u, P, iterations: it, converged: false, why: maxIt === cap ? `it stopped at its iteration limit (maxIterations = ${cap})` : `${maxIt} iterations were not enough` };
  }

  // ---- the start; maxIterations (optional) caps the Newton iterations of every attempt, and a column that reaches it
  // is not converged (W7's case E4)
  const cap = opts.maxIterations == null ? Infinity : Number(opts.maxIterations);
  if (!(cap >= 1 && Number.isInteger(cap) || cap === Infinity)) throw fail("BAD_INPUT", `Column: maxIterations must be a whole number of 1 or more (got ${JSON.stringify(opts.maxIterations)}).`);
  const tried = [], clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  let t0 = clock();
  const took = () => { const t = clock(), d = t - t0; t0 = t; return `${Math.round(d)} ms`; };
  let result = null;
  const startU = opts.start && Array.isArray(opts.start.stages) && opts.start.stages.length === N && opts.start.stages.every(s => s.l?.length === n && s.v?.length === n)
    ? Float64Array.from(opts.start.stages.flatMap(s => [...s.l.map(a => a * 1), ...s.v, s.T_K])) : null;
  if (startU) {
    const r = newton(startU, { dTmax: 20, maxIt: Math.min(40, cap) });
    tried.push(`Newton from the previous solution (${r.iterations} iterations, ${took()}${r.converged ? "" : `: ${r.why}`})`);
    if (r.converged) result = { ...r, start: "previous solution" };
  }
  let cold = null;
  if (!result && !(opts.homotopy && startU)) {
    // a decanter fixes no reflux ratio for the start: a few start values are tried in turn (only the start: the
    // reflux is the whole refluxed liquid at the solution)
    const R0s = decanter ? (opts.startReflux ? [opts.startReflux] : DECANTER_START_REFLUX) : [null];
    for (const R0 of R0s) {
      const a = { dTmax: 20, maxIt: 50, patient: true };
      const c = bubblePointStart(th, inp, fJ, HF, { R0 });
      cold = { ...c, last: cold?.last };
      if (c.noSplit) { tried.push(`the bubble-point start with a start reflux ratio of ${R0}: its condensate holds one liquid, so it was not used (${took()})`); continue; }
      const r = newton(c.u, { ...a, maxIt: Math.min(a.maxIt, cap) });
      tried.push(`Newton from the bubble-point start${R0 != null ? ` (a start reflux ratio of ${R0})` : ""}, steps of at most ${a.dTmax} K (${r.iterations} iterations, ${took()}${r.converged ? "" : `: ${r.why}`})`);
      if (r.converged) { result = { ...r, start: `bubble-point method (Wang-Henke)${R0 != null ? ` with a start reflux ratio of ${R0}` : ""}` }; break; }
      cold.last = r;
    }
  }
  if (!result && !opts.homotopy && cap === Infinity) {
    // continuation: a column whose components all have the same volatility (ln K_i replaced by its mean over the
    // components) is solved first, and the differences are brought back in steps, each solve started from the last.
    // Long columns with very pure products need it: their equations are nearly singular, and Newton from the
    // bubble-point start does not reach the solution
    let t = 0, dt = 0.25, prev = null, steps = 0;
    while (t < 1 && dt >= 1 / 256 && steps < 60) {
      const tn = Math.min(1, t + (prev ? dt : 0)), steps0 = steps++;
      const toward = f => (x, y, T, j) => { const a = f(x, y, T, j), mean = sum(a) / a.length; return a.map(v => tn * v + (1 - tn) * mean); };
      const blend = tn === 1 ? th : { ...th, lnK: toward(th.lnK), ...(th.base ? { base: { ...th.base, lnK: toward(th.base.lnK) } } : {}) };
      try {
        const r = solveCascade({ ...opts, thermo: blend, start: prev, homotopy: tn < 1 ? "step" : "last" });
        prev = r; t = tn; dt = Math.min(0.5, dt * 1.5);
        if (tn === 1) return { ...r, solver: { ...r.solver, start: `continuation in the relative volatilities (${steps0 + 1} steps)`, tried: [...tried, `continuation in the relative volatilities: solved in ${steps0 + 1} steps, ${took()}`] } };
      } catch (e) {
        if (e?.code !== "NO_CONVERGENCE") throw e;
        if (!prev) break;
        dt /= 2;
      }
    }
    tried.push(`continuation in the relative volatilities (stopped at ${fmt(t * 100)} % of the way, after ${steps} steps, ${took()})`);
  }
  if (!result) {
    const last = cold?.last;
    const { g } = last ? groups(last.P) : { g: null };
    let hint = cold?.boilupWarning ? ` ${cold.boilupWarning}` : "";
    if (last && th.stable) {
      const split = last.P.map((p, j) => j).filter(j => { try { return !th.stable(last.P[j].x, last.P[j].T).stable; } catch { return false; } });
      if (split.length) hint += ` On the last iterate the liquid of stage${split.length > 1 ? "s" : ""} ${split.map(j => j + 1).join(", ")} would split into two liquids: the column may hold two liquids there, which phases "VL" (one liquid) does not represent; turn on "look for two liquids on the stages" (phases "VLL", activity models).`;
    }
    throw fail("NO_CONVERGENCE", `Column: the rigorous column did not converge. Tried: ${tried.join("; ")}.${g ? ` Last residuals: material ${fmt(g.material)} mol/s, equilibrium ${fmt(g.equilibrium)}, energy ${fmt(g.energy)} W, specifications ${fmt(g.specifications)}.` : ""}${hint} This does not show that the column has no solution: ${cap < Infinity ? "raise the iteration limit, or " : ""}try other specifications (a larger reflux, another product flow), more stages, or another feed stage.`,
      { tried, residuals: g, tolerances: { ...limits, units: { material: "mol/s", energy: "W", equilibrium: "mole fraction", summation: "mole fraction", specifications: "relative" } } });
  }

  // ---- the solution
  const P = result.P;
  const { g, stageRes } = groups(P);
  const Qc = energyIn(0, null, P[0], P[1]);           // heat removed by the condenser, W
  const Qr = -energyIn(N - 1, P[N - 2], P[N - 1], null); // heat added by the reboiler, W
  let decanterLiquids = null;
  if (decanter && opts.homotopy !== "step") {
    const p = P[0], gap = Math.max(...p.x.map((v, i) => Math.abs(v - p.xd[i])));
    if (gap < 1e-6) {
      throw fail("NO_CONVERGENCE", `Column: the decanter's two liquids came out the same (${th.names.map((nm, i) => `${nm} ${fmt(p.x[i])}`).join(", ")}): the condensate holds one liquid here, so the decanter has nothing to separate. Use a total condenser, or other specifications (a condensate inside the two-liquid region).`);
    }
    const rr = th.density(p.x, p.T), rd = th.density(p.xd, p.T);
    const refluxIs = rr != null && rd != null ? (rr <= rd ? "light" : "heavy") : inp.refluxLiquid;
    if (refluxIs !== inp.refluxLiquid) {
      throw fail("NO_CONVERGENCE", `Column: the solver reached the decanter's other branch: the refluxed liquid (${fmt(rr)} kg/m3) is the ${refluxIs} one, not the ${inp.refluxLiquid} one asked for. Try other specifications.`);
    }
    const one = (x, flow, rho) => ({ x, flow, rho });
    decanterLiquids = { [inp.refluxLiquid]: one(p.x, p.L, rr), [inp.refluxLiquid === "light" ? "heavy" : "light"]: one(p.xd, p.V, rd), named: rr != null && rd != null ? "density" : "as asked", reflux: inp.refluxLiquid };
  }
  // the phase-stability check: a second liquid on a stage is refused, never returned as a metastable answer
  if (th.twoLiquids && opts.homotopy !== "step") {
    // two liquids are represented; a third is not (as by the flash)
    const third = [];
    for (let j = 0; j < N; j++) {
      const s = th.third(P[j].x, P[j].T, j);
      if (s) third.push({ stage: j + 1, T_K: P[j].T, x: s.x, trial: s.trial });
    }
    if (third.length) {
      const w = third[0];
      throw fail("PHASE_SPLIT", `Column: a third liquid would form on stage${third.length > 1 ? "s" : ""} ${third.map(s => s.stage).join(", ")} (stage ${w.stage} at ${fmt(w.T_K)} K: its liquid ${th.names.map((nm, i) => `${nm} ${fmt(w.x[i])}`).join(", ")} splits again). The column holds a vapour and at most two liquids on each stage, as the flash drum does, so it does not return this answer.`,
        { stages: third });
    }
  } else if (th.stable && opts.homotopy !== "step") {
    const split = [];
    for (let j = 0; j < N; j++) {
      const s = th.stable(P[j].x, P[j].T);
      if (s && !s.stable) split.push({ stage: j + 1, T_K: P[j].T, x: P[j].x, trial: s.trial });
    }
    if (split.length) {
      const w = split[0];
      throw fail("PHASE_SPLIT", `Column: a second liquid would form on stage${split.length > 1 ? "s" : ""} ${split.map(s => s.stage).join(", ")} (stage ${w.stage} at ${fmt(w.T_K)} K: its liquid ${th.names.map((nm, i) => `${nm} ${fmt(w.x[i])}`).join(", ")} splits off a liquid ${w.trial ? th.names.map((nm, i) => `${nm} ${fmt(w.trial[i])}`).join(", ") : ""}). With phases "VL" the column holds one liquid on each stage, so it does not return this answer. Turn on "look for two liquids on the stages" (phases "VLL", activity models only), or change the feed or the specifications, or separate the liquids first (a decanter: the flash drum).`,
        { stages: split });
    }
  }
  const warnings = [];
  const Vmax = Math.max(...P.map((p, j) => (j === 0 && total ? 0 : p.V)));
  const dryL = P.map((p, j) => j).filter(j => j > 0 && j < N - 1 && P[j].L < DRY_FRACTION * Vmax).map(j => j + 1);
  const dryV = P.map((p, j) => j).filter(j => j > 0 && P[j].V < Vmax / TURNDOWN).map(j => j + 1);
  if (dryL.length) {
    warnings.push({ code: "DRY_STAGE", stage: dryL[0], stages: dryL, message: `Stage${dryL.length > 1 ? "s" : ""} ${dryL.join(", ")} run${dryL.length > 1 ? "" : "s"} dry: the liquid leaving ${dryL.length > 1 ? "them is" : "it is"} ${fmt(Math.min(...dryL.map(k => P[k - 1].L)) / Vmax * 100)} % of the column's largest vapour flow (below ${DRY_FRACTION * 100} %). The usual cause: too low a reflux, or a feed that is all vapour.`,
      remedy: "Raise the reflux ratio (or the condenser duty), or feed the column with more liquid." });
  }
  if (dryV.length) {
    warnings.push({ code: "DRY_STAGE", stage: dryV[0], stages: dryV, phase: "vapour", message: `Stage${dryV.length > 1 ? "s" : ""} ${dryV.join(", ")} carr${dryV.length > 1 ? "y" : "ies"} little vapour: ${fmt(Math.min(...dryV.map(k => P[k - 1].V)) / Vmax * 100)} % of the column's largest vapour flow, below 1/${TURNDOWN}, the turndown of bubble-cap trays (sieve trays 1/2, valve trays 1/4; Fermeglia 2021, slide 54). With one diameter for the whole column, ${dryV.length > 1 ? "these trays" : "this tray"} would weep. The usual cause: too low a boil-up, or a cold feed.`,
      remedy: "Raise the boil-up (the reboiler duty), preheat the feed, or give this section a smaller diameter; the check with the trays' geometry comes with milestone M2b." });
  }
  const notes = [...new Set(P.flatMap(p => (th.warnings ? th.warnings(p.T) : [])))];
  const stages = P.map((p, j) => ({
    stage: j + 1, name: j === 0 ? "condenser" : j === N - 1 ? "reboiler" : feeds.some(f => f.stage === j) ? "feed" : "stage",
    T_K: p.T, P_kPa: th.P_kPa, L_mol_s: p.L, V_mol_s: j === 0 && total ? 0 : p.V, x: p.x, y: j === 0 && total ? null : p.y,
    K: j === 0 && total ? null : p.K, duty_W: j === 0 ? -Qc : j === N - 1 ? Qr : 0, l: p.l, v: p.v, residuals: stageRes[j],
    ...(th.liquids ? { liquids: j === 0 && decanter ? decanterLiquids : th.liquids(p.x, p.T, p.L, j) } : {}),
    ...(j === 0 && decanter ? { x_distillate: p.xd } : {}),
  }));
  return {
    converged: true, iterations: result.iterations, stages,
    residuals: g, tolerances: { ...limits, units: { material: "mol/s", energy: "W", equilibrium: "mole fraction", summation: "mole fraction", specifications: "relative" } },
    warnings, notes, phases,
    products: { distillate: { flows: P[0].v.slice(), T_K: P[0].T, phase: total ? "liquid" : "vapour", H_W: P[0].V * (decanter ? P[0].hD : total ? P[0].hL : P[0].hV) },
      bottoms: { flows: P[N - 1].l.slice(), T_K: P[N - 1].T, phase: "liquid", H_W: P[N - 1].L * P[N - 1].hL } },
    duties: { condenser_W: Qc, reboiler_W: Qr },
    solver: { method: "Naphtali-Sandholm (Newton on all MESH equations)", start: result.start, tried },
  };
}

/**
 * The start (see the file header): constant molar overflow, then the bubble-point method of Wang and Henke. Returns the
 * variables u, and a note when constant molar overflow gives no boil-up.
 */
function bubblePointStart(th, inp, fJ, HF, { sweeps = 30, dTstop = 1e-3, R0 = null } = {}) {
  const { N, F, feeds, specs } = inp, n = th.n, total = inp.condenser !== "partial";
  const z = fJ.reduce((a, f) => a.map((v, i) => v + f[i]), new Array(n).fill(0)).map(v => v / F);
  // the feeds' liquid fractions and a latent heat, at the bubble and dew points of the whole feed
  const Tb = th.bubbleT(z);
  const Kb = th.lnK(z, z, Tb).map(Math.exp);
  const yb = z.map((zi, i) => Kb[i] * zi), sb = sum(yb);
  const lambda = Math.max(th.hV(yb.map(a => a / sb), Tb) - th.hL(z, Tb), 1000);
  const q = feeds.map(f => {
    if (Number.isFinite(f.q)) return f.q;
    const Ff = sum(f.flows), zf = f.flows.map(v => v / Ff), Tf = th.bubbleT(zf);
    return 1 - (f.H_W / Ff - th.hL(zf, Tf)) / lambda;
  });
  const vapourFed = sum(feeds.map((f, k) => (1 - Math.min(1, Math.max(0, q[k]))) * sum(f.flows)));
  const get = k => specs.find(s => s.kind === k)?.value;
  let D = get("distillate_rate") ?? (get("bottoms_rate") != null ? F - get("bottoms_rate") : null);
  let R = get("reflux_ratio") ?? null;
  const top = Vt => (total ? Vt / D - 1 : Vt / D - 1);
  if (D == null) {
    if (R != null && get("boilup_ratio") != null) { const r = get("boilup_ratio"); D = (r * F + vapourFed) / (R + 1 + r); }
    else if (R != null && get("reboiler_duty") != null) D = (get("reboiler_duty") / lambda + vapourFed) / (R + 1);
    else if (get("condenser_duty") != null && get("boilup_ratio") != null) {
      const Vt = get("condenser_duty") / lambda, B = Math.max(Vt - vapourFed, 0.01 * F) / get("boilup_ratio"); D = F - B;
    }
  }
  D = Math.min(Math.max(D ?? 0.5 * F, 0.01 * F), 0.99 * F);
  const B = F - D;
  if (R == null) {
    if (get("condenser_duty") != null) R = get("condenser_duty") / lambda / D - (total ? 1 : 0);
    else if (get("reboiler_duty") != null) R = top(get("reboiler_duty") / lambda + vapourFed);
    else if (get("boilup_ratio") != null) R = top(get("boilup_ratio") * B + vapourFed);
  }
  let boilupWarning = null;
  const Vb = (R + 1) * D - vapourFed;
  if (!(Vb > 0)) boilupWarning = `By constant molar overflow the boil-up would be ${fmt(Vb)} mol/s (the vapour above the feed, ${fmt((R + 1) * D)}, is less than the feed's own vapour, ${fmt(vapourFed)}): these specifications may have no column. Take a larger distillate or a larger reflux ratio (or a feed with less vapour).`;
  R = Math.max(R ?? R0 ?? 1, 0.05);
  // flows by constant molar overflow (feeds enter their stage as one stream)
  const L = new Array(N), V = new Array(N);
  let S = 0, Lc = R * D;
  for (let j = 0; j < N; j++) {
    feeds.forEach((f, k) => { if (f.stage === j) { Lc += q[k] * sum(f.flows); } });
    if (j === 0) { L[0] = R * D; V[0] = D; continue; }
    V[j] = L[j - 1] + D - S;
    feeds.forEach(f => { if (f.stage === j) S += sum(f.flows); });
    L[j] = j === N - 1 ? B : Lc;
  }
  for (let j = 1; j < N; j++) V[j] = Math.max(V[j], 0.01 * F);
  for (let j = 1; j < N - 1; j++) L[j] = Math.max(L[j], 0.01 * F);
  // compositions and temperatures by the bubble-point method, the vapour flows by the energy balances
  let x = Array.from({ length: N }, () => z.slice()), T = new Array(N).fill(Tb), y = x.map(r => r.slice());
  if (th.twoLiquids) {
    // two liquids: the compositions start on a straight line between estimates of the products (the distillate takes
    // the most volatile components first, by their K at the feed's bubble point), so that the stages below a decanter
    // start between its reflux and the bottoms; from the feed's composition everywhere the start lands on a
    // solution with two liquids on every stage
    const d = new Array(n).fill(0);
    let left = D;
    for (const i of Kb.map((k, i) => i).sort((a, b) => Kb[b] - Kb[a])) { d[i] = left > 0 ? Math.min(0.97 * F * z[i], left) : 0; left -= d[i]; }
    const dd = d.map(v => Math.max(v, 1e-6 * F)), bb = z.map((zi, i) => Math.max(F * zi - d[i], 1e-6 * F));
    const xD = dd.map(v => v / sum(dd)), xB = bb.map(v => v / sum(bb));
    x = x.map((_, j) => xD.map((a, i) => a + (xB[i] - a) * j / (N - 1)));
    T = x.map(v => th.bubbleT(v));
    y = x.map(r => r.slice());
  }
  const Kof = j => th.lnK(x[j], y[j], T[j]).map(Math.exp);
  let K = x.map((_, j) => Kof(j));
  const sweep = () => {
    for (let s = 0; s < sweeps; s++) {
      const xn = Array.from({ length: N }, () => new Array(n));
      for (let i = 0; i < n; i++) {
        const a = [], b = [], c = [], d = [];
        for (let j = 0; j < N; j++) {
          const Kj = j === 0 && total ? 1 : K[j][i];
          a.push(j > 0 ? L[j - 1] : 0);
          b.push(-(L[j] + V[j] * Kj));
          c.push(j < N - 1 ? V[j + 1] * K[j + 1][i] : 0);
          d.push(-fJ[j][i]);
        }
        tridiagonal(a, b, c, d).forEach((v, j) => { xn[j][i] = Number.isFinite(v) ? Math.max(v, 1e-30) : x[j][i]; });
      }
      let dT = 0;
      for (let j = 0; j < N; j++) {
        const s0 = sum(xn[j]); x[j] = xn[j].map(v => v / s0);
        const Tn = th.bubbleT(x[j]);
        dT = Math.max(dT, Math.abs(Tn - T[j])); T[j] = Tn;
        for (let k = 0; k < 5; k++) { const Kj = th.lnK(x[j], y[j], T[j]).map(Math.exp); const w = x[j].map((v, i) => v * Kj[i]), sw = sum(w); y[j] = w.map(v => v / sw); K[j] = Kj; }
      }
      if (dT < dTstop) break;
    }
  };
  sweep();
  const Lsum = new Array(N).fill(0);   // feeds up to and including stage j
  feeds.forEach(f => { for (let j = f.stage; j < N; j++) Lsum[j] += sum(f.flows); });
  for (let pass = 0; pass < 8; pass++) {
    const hL = x.map((v, j) => th.hL(v, T[j])), hV = y.map((v, j) => th.hV(v, T[j]));
    const Vn = V.slice(), Ln = L.slice();
    Vn[1] = L[0] + D;
    let ok = true;
    for (let j = 1; j < N - 1; j++) {
      // stage j: L_j-1 h_L,j-1 + V_j+1 h_V,j+1 + H_F,j = L_j h_L,j + V_j h_V,j, with L_j = V_j+1 + S_j - D
      const Lprev = j === 1 ? L[0] : Vn[j] + Lsum[j - 1] - D;
      const num = Vn[j] * hV[j] + (Lsum[j] - D) * hL[j] - Lprev * hL[j - 1] - HF[j];
      const den = hV[j + 1] - hL[j];
      Vn[j + 1] = num / den;
      Ln[j] = Vn[j + 1] + Lsum[j] - D;
      if (!(Vn[j + 1] > 0 && Ln[j] > 0)) { ok = false; break; }
    }
    if (!ok) break;
    const ch = Math.max(...Vn.map((v, j) => Math.abs(v - V[j]) / F));
    for (let j = 1; j < N; j++) V[j] = Vn[j];
    for (let j = 1; j < N - 1; j++) L[j] = Ln[j];
    sweep();
    if (ch < 1e-6) break;
  }
  const u = new Float64Array(N * (2 * n + 1));
  for (let j = 0; j < N; j++) {
    const o = j * (2 * n + 1);
    for (let i = 0; i < n; i++) {
      u[o + i] = Math.max(L[j] * x[j][i], 1e-30 * F);
      u[o + n + i] = Math.max((j === 0 && total ? D * x[0][i] : V[j] * y[j][i]), 1e-30 * F);
    }
    u[o + 2 * n] = T[j];
  }
  if (inp.decanter) {
    // the condensate split at its bubble point: the chosen liquid is the reflux, the other the distillate
    const liq = th.liquids(x[0], T[0], L[0] + D, 0);
    if (!liq) { boilupWarning = `${boilupWarning ? `${boilupWarning} ` : ""}At the start the condensate holds one liquid, so the decanter would have nothing to separate.`; return { u, boilupWarning, noSplit: true }; }
    else {
      const r = liq[inp.refluxLiquid], d = liq[inp.refluxLiquid === "light" ? "heavy" : "light"];
      for (let i = 0; i < n; i++) { u[i] = Math.max(r.flow * r.x[i], 1e-30 * F); u[n + i] = Math.max(d.flow * d.x[i], 1e-30 * F); }
    }
  }
  return { u, boilupWarning };
}
