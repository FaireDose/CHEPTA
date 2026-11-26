/**
 * Design specifications of the rigorous column (proposal 0015, Part II, step 11; milestone M4): instead of a reflux
 * ratio, a boil-up ratio or a product flow, the user fixes what the column must deliver, and the solver finds the
 * ratios and flows that deliver it:
 *
 *   { kind: "purity", product: "distillate" | "bottoms" | "side_draw", draw?: 1, component, value, basis?: "mole" | "mass" }
 *   { kind: "distillate_purity" | "bottoms_purity", component, value, basis? }       (the same, the product in the name)
 *   { kind: "recovery", product, draw?, component, value }          the share of the component's feed that leaves in it
 *   { kind: "component_flow", product, draw?, component, value, basis? }             mol/s (basis "mass": kg/s)
 *   { kind: "stage_temperature", stage, value }                                      K
 *
 * `component` is an index (from 0) or a name. They stand in the engine's `specs` beside its own (reflux_ratio,
 * boilup_ratio, distillate_rate, bottoms_rate, condenser_duty, reboiler_duty); together they must number the column's
 * degrees of freedom (two; one with a decanter or for a reboiled stripper). A side draw given without a rate adds one
 * degree of freedom: its rate is found too, for one more specification.
 *
 * The method: an outer loop around the stage solver (engine.js, solveCascade). The free variables are the engine's own
 * specifications that the user left open, in this order: the reflux ratio, the distillate flow, the boil-up ratio
 * (and the rates of the side draws given without one). The outer loop is Newton's method on
 *
 *   g_k(p) = s_k(column solved with p) - s_k(asked)        one per design specification
 *
 * in the variables p = ln(ratio), logit(D / (F - side draws)), ln(draw rate / F), so that every trial point is a
 * column (a positive ratio, a distillate between nothing and everything); s is the logit of a purity or a recovery
 * (a purity of 0.999 and an impurity of 0.001 are then met to the same relative accuracy), the logarithm of a flow, a
 * temperature over 10 K. The Jacobian of the outer loop comes from the converged column itself: by the implicit function
 * theorem the stage solver's own Jacobian gives how every stage variable answers to a ratio, a product flow or a draw
 * rate (engine.js, `sensitivities`), so one outer step costs one column and one Jacobian more (finite differences
 * between two columns where that is not available: a duty). Every column is started from the last one solved, without
 * the continuation; a step is halved until the residual falls. With one free variable, a scan of its whole range followed by a bracketing secant search (the
 * Illinois variant of regula falsi) takes over when Newton's method fails: it either finds the solution or shows
 * that the range holds none.
 *
 * Why an outer loop, and not the specifications among the MESH equations (docs/decisions/2026-11-11-01-column-
 * specifications.md has the full argument):
 *  - DWSIM's Naphtali-Sandholm solver writes one specification in place of the condenser's energy balance and one in
 *    place of the reboiler's, each a function of that end's own variables (component fraction, component flow,
 *    component recovery, product flow, stream ratio, temperature, duty; DWSIM, GPL-3.0, DWSIM.UnitOperations/
 *    UnitOperations/RigorousColumnSolvers/NewtonRaphson.vb, the block "handle user specs", branch "windows",
 *    https://github.com/DanWBR/dwsim, read 2026-11-11). That keeps the Jacobian block-tridiagonal, but only for one
 *    specification per end, on that end's product. Two specifications on one product (a purity and a recovery), a
 *    stage temperature inside the column or a specification on a side draw couple distant stages; here they need
 *    nothing new.
 *  - This engine reaches long columns with very pure products by a continuation that first solves a column without
 *    any separation (engine.js, step 3). A purity cannot be met by such a column, so a purity among the equations
 *    would take the continuation away. The ChemSep Book says the same of its own continuation in the stage
 *    efficiency: "it cannot, without modification, handle problems in which a product stream purity is specified"
 *    (H. A. Kooijman and R. Taylor, 2nd edition, 2006, public domain, http://www.chemsep.org/downloads/docs/book2.pdf,
 *    section 13.5, "Continuation Methods for Difficult Problems", p. 224, read 2026-11-11).
 *  - A specification that no column can meet makes Newton's method on the whole system fail without saying why. The
 *    outer loop sees how each specification answers to the reflux and to the product flow, so it can say what the
 *    column reaches at most and what limits it.
 * The price: several column solutions for one answer (each started from the last, so a few Newton iterations each).
 *
 * Which path each specification takes (proposal 0025, step 2; the maintainer, 2026-11-18; docs/decisions/
 * 2026-11-18-07-purity-in-mesh.md):
 *  - a column with a decanter (one degree of freedom) and one purity of its bottoms, on the mole or the mass basis,
 *    with no side draw and no other specification: the purity among the MESH equations, as DWSIM writes a component
 *    fraction (the same file and block as above: its residual ln(x / value), the mass fraction on the mass basis, in
 *    place of the reboiler's energy balance; DWSIM's own reboiler fraction reads the condenser's basis, a slip not
 *    copied). engine.js MESH_SPECS; the Jacobian stays block-tridiagonal. A decanter's trial columns at a fixed
 *    distillate flow are the hard ones near the dry end (the
 *    entrainer columns of proposal 0025: decision 2026-11-18-01 found the product flow a poor parameter there), and the
 *    outer loop refused even the easy entrainer columns at its first trial column. If the MESH equations do not
 *    converge, the outer loop below is tried as before, its `tried` starting with that attempt;
 *  - a column that has a restart profile (a flowsheet's last answer of the block, a design specification's next solve,
 *    a `start` given; proposal 0028, item 1, the maintainer, 2026-11-26; docs/decisions/2026-11-26-01-column-specs-in-
 *    mesh.md), whose design specifications are all purities, recoveries or component flows of the distillate, the
 *    vapour distillate, the bottoms or a side draw of given rate, with any condenser: the specifications among the MESH
 *    equations, one Newton solve from the profile, each in place of the energy balance of the end it frees (engine.js,
 *    product_spec: ln(x / value), ln(p_i / (value f_i)), ln(p_i / value), the forms of DWSIM's NewtonRaphson.vb; The
 *    ChemSep Book, section 13.2.4). Where that does not converge, the paths below, their `tried` starting with this
 *    attempt. The cold first call (no profile) keeps the outer loop: the continuation that solves it cannot hold a
 *    purity (above);
 *  - every other design specification (every column without a decanter, a distillate purity with a decanter, two
 *    specifications, a recovery, a component flow, a stage temperature, side draws): the outer loop, unchanged. A
 *    distillate purity with a decanter was tried among the MESH equations too and not kept: the decanter's distillate
 *    is a liquid of a three-phase state and hardly moves along a column's branch, so its purity hardly fixes the
 *    column (asked for F9's own distillate water, it converged to another column, 3.2 mol/s apart in the bottoms).
 *
 * Fail loudly (AGENTS.md, "Rules for code"). Refused before anything is solved (BAD_INPUT): a purity or a recovery
 * outside 0 to 1, a component that is not in the feed, a component flow above its feed, purities of one product that
 * add up to more than 1, a purity that a given product flow cannot hold. Refused as outside what the column can do
 * (OUT_OF_RANGE), with the reason and what would make it feasible:
 *  - a binary azeotrope between the feed and the purity asked for (found by the method's own azeotrope search); a
 *    decanter is exempt, since it crosses the azeotrope by the liquid-liquid split;
 *  - with one free variable, a range that holds no solution: the message gives the largest and the smallest value the
 *    specification reaches and where (a fixed reflux below the minimum for a purity; too few stages);
 *  - with the reflux free, a specification still short at REFLUX_PROBE, a reflux ratio of 100 (near total reflux): the
 *    stages are too few, or an azeotrope is in the way (named when the method finds one near the product).
 * Anything else that fails is NO_CONVERGENCE, with the closest point reached: it is not a statement that the
 * specifications cannot be met. A result is returned only when every design specification is met within
 * SPEC_TOLERANCE; `specifications` lists each with the value asked, the value reached and the difference, and
 * `adjusted` the variables found.
 */
import { checkTime } from "../../util/progress.js";
import { fail } from "../../util/errors.js";
import { findAzeotrope, binaryAzeotropes } from "../../equilibrium/azeotrope.js";

/** The design specifications (milestone M4). */
export const DESIGN_SPECS = Object.freeze(["distillate_purity", "bottoms_purity", "purity", "recovery", "component_flow", "stage_temperature", "component_ratio", "flow_ratio"]);
const BASE = ["reflux_ratio", "boilup_ratio", "distillate_rate", "bottoms_rate", "condenser_duty", "reboiler_duty", "reflux_rate", "distillate_to_feed"];
/** The flows a ratio of two flows (flow_ratio) may name; a side draw as { flow: "side_draw", draw: 1 } (from 1). */
const FLOWS = ["reflux", "distillate", "vapour_distillate", "bottoms", "boilup", "feed", "side_draw"];
/** A design specification is met when its scaled residual (see the file header) is below this: for a purity x, about
 *  1e-6 x (1 - x); for a flow, a relative 1e-6; for a temperature, 1e-5 K. */
export const SPEC_TOLERANCE = 1e-6;
/** The reflux and boil-up ratios the outer loop may take (this project's choice: a column asked to run outside them
 *  is refused with the reason). */
export const RATIO_RANGE = Object.freeze([1e-3, 1e3]);
/** The reflux ratio taken as "near total reflux" when a failure is diagnosed. */
export const REFLUX_PROBE = 100;
const LOGIT_MAX = Math.log(0.9999 / 0.0001);
const MAX_OUTER = 30;

const sum = v => v.reduce((a, b) => a + b, 0);
const fmt = v => +Number(v).toPrecision(4);
const fmt6 = v => +Number(v).toPrecision(6);
/** A reached value for a message: a fraction just below 1 that would print as 1 is printed as 1 - its difference. */
const fmtReach = v => (v < 1 && fmt6(v) === 1 ? `1 - ${+(1 - v).toPrecision(2)}` : `${fmt6(v)}`);
const logit = a => { const c = Math.min(Math.max(a, 1e-300), 1 - 1e-16); return Math.log(c / (1 - c)); };

/** Does the column carry a design specification, or a side draw whose rate is to be found? */
export const hasDesign = opts => (Array.isArray(opts?.specs) && opts.specs.some(s => DESIGN_SPECS.includes(s?.kind)))
  || (Array.isArray(opts?.draws) && opts.draws.some(d => d && d.rate == null && d.share == null && !d.free));

function componentIndex(c, th, sys, what) {
  if (Number.isInteger(c) && c >= 0 && c < th.n) return c;
  if (typeof c === "string") {
    const k = c.trim().toLowerCase();
    const i = (sys?.ids ?? []).findIndex(id => String(id).toLowerCase() === k);
    if (i >= 0) return i;
    const j = th.names.findIndex(nm => String(nm).toLowerCase() === k);
    if (j >= 0) return j;
  }
  throw fail("BAD_INPUT", `Column: ${what}: give its component, one of ${th.names.join(", ")} (got ${JSON.stringify(c)}).`);
}

/** The design specifications, normalized and checked against the feed. */
function normalize(opts, th) {
  const n = th.n, names = th.names, N = Number(opts.stages);
  if (!Array.isArray(opts.feeds) || !opts.feeds.length || opts.feeds.some(f => !Array.isArray(f?.flows) || f.flows.length !== n || f.flows.some(v => !(v >= 0)))) {
    throw fail("BAD_INPUT", `Column: give at least one feed, each with ${n} component flows, none negative.`);
  }
  const feed = opts.feeds.reduce((a, f) => a.map((v, i) => v + Number(f.flows[i])), new Array(n).fill(0)), F = sum(feed);
  if (!(F > 0)) throw fail("BAD_INPUT", "Column: the feeds have no flow.");
  const draws = (opts.draws ?? []).map(d => ({ ...d, free: d?.rate == null && d?.share == null }));
  let MW = null;
  const molarMass = () => {
    MW = MW ?? opts.molarMass ?? opts.sys?.MW ?? th.MW ?? null;
    if (!Array.isArray(MW) || MW.length !== n || MW.some(v => !(v > 0))) throw fail("BAD_INPUT", "Column: a specification on the mass basis needs the components' molar masses (the property system, or molarMass in g/mol).");
    return MW;
  };
  const design = [], base = [];
  for (const [k, s] of (opts.specs ?? []).entries()) {
    if (!DESIGN_SPECS.includes(s?.kind)) { base.push(s); continue; }
    const what = `specification ${k + 1} (${s.kind})`;
    const value = Number(s.value);
    if (!Number.isFinite(value)) throw fail("BAD_INPUT", `Column: ${what} needs a number (got ${JSON.stringify(s.value)}).`);
    if (s.kind === "stage_temperature") {
      const st = Number(s.stage);
      if (!(Number.isInteger(st) && st >= 1 && st <= N)) throw fail("BAD_INPUT", `Column: ${what}: give its stage, 1 to ${N} (got ${JSON.stringify(s.stage)}).`);
      if (!(value > 0)) throw fail("BAD_INPUT", `Column: ${what}: the temperature must be above 0 K (got ${value}).`);
      design.push({ kind: s.kind, stage: st, value, unit: "K", label: `the temperature of stage ${st}` });
      continue;
    }
    if (s.kind === "flow_ratio") {
      // a ratio of two of the column's flows (proposal 0029, step 5)
      const term = (t, which) => {
        const f = typeof t === "string" ? { flow: t } : t;
        if (!f || !FLOWS.includes(f.flow)) throw fail("BAD_INPUT", `Column: ${what}: the ${which} is one of ${FLOWS.join(", ")} (a side draw as { flow: "side_draw", draw: 1 }); got ${JSON.stringify(t)}.`);
        if (f.flow === "vapour_distillate" && opts.ends?.condenser !== "vapour_liquid") throw fail("BAD_INPUT", `Column: ${what}: the vapour distillate is the vapour + liquid condenser's (condenser "vapour_liquid").`);
        if (f.flow === "side_draw") {
          const k = Number(f.draw ?? 1);
          if (!(Number.isInteger(k) && k >= 1 && k <= draws.length)) throw fail("BAD_INPUT", `Column: ${what}: the ${which}'s side draw must be the number of a side draw, ${draws.length ? `1 to ${draws.length}` : "and the column has none"} (got ${JSON.stringify(f.draw ?? 1)}).`);
          return { flow: "side_draw", draw: k };
        }
        return { flow: f.flow };
      };
      const num = term(s.numerator, "numerator"), den = term(s.denominator, "denominator");
      if (num.flow === den.flow && num.draw === den.draw) throw fail("BAD_INPUT", `Column: ${what}: the numerator and the denominator are the same flow.`);
      if (!(value > 0)) throw fail("BAD_INPUT", `Column: ${what}: a ratio of two flows must be above 0 (got ${value}).`);
      const nm = t => (t.flow === "side_draw" ? `side draw ${t.draw}` : `the ${t.flow === "boilup" ? "boil-up (the reboiler's vapour)" : t.flow.replace("_", " ")}`);
      design.push({ kind: "flow_ratio", num, den, value, unit: "", label: `the ratio of ${nm(num)} to ${nm(den)}` });
      continue;
    }
    const kind = s.kind.endsWith("_purity") ? "purity" : s.kind;
    const product = s.kind === "distillate_purity" ? "distillate" : s.kind === "bottoms_purity" ? "bottoms" : s.product;
    // the vapour + liquid condenser (proposal 0026): "distillate" is its liquid distillate, "vapour_distillate" its vapour
    const vlc = opts.ends?.condenser === "vapour_liquid";
    if (product === "vapour_distillate" && !vlc) throw fail("BAD_INPUT", `Column: ${what}: product "vapour_distillate" is the vapour + liquid condenser's (condenser "vapour_liquid").`);
    if (!["distillate", "bottoms", "side_draw", "vapour_distillate"].includes(product)) throw fail("BAD_INPUT", `Column: ${what}: product must be "distillate", "bottoms" or "side_draw"${vlc ? ', or "vapour_distillate"' : ""} (got ${JSON.stringify(s.product)}).`);
    let draw = null;
    if (product === "side_draw") {
      draw = Number(s.draw ?? 1);
      if (!(Number.isInteger(draw) && draw >= 1 && draw <= draws.length)) throw fail("BAD_INPUT", `Column: ${what}: draw must be the number of a side draw, ${draws.length ? `1 to ${draws.length}` : "and the column has none"} (got ${JSON.stringify(s.draw ?? 1)}).`);
    }
    const i = componentIndex(s.component, th, opts.sys, what);
    const basis = s.basis ?? "mole";
    if (!["mole", "mass"].includes(basis)) throw fail("BAD_INPUT", `Column: ${what}: basis must be "mole" or "mass" (got ${JSON.stringify(s.basis)}).`);
    if (basis === "mass" && kind !== "recovery") molarMass();
    const where = product === "side_draw" ? `side draw ${draw}` : product === "vapour_distillate" ? "the vapour distillate" : vlc && product === "distillate" ? "the liquid distillate" : `the ${product}`;
    if (!(feed[i] > 0)) throw fail("BAD_INPUT", `Column: ${what}: ${names[i]} is not in the feed, so nothing can be asked of it in ${where}.`);
    const d = { kind, product, draw, i, basis: kind === "recovery" ? null : basis, value };
    if (kind === "component_ratio") {
      // a ratio of two components' flows in one product (proposal 0029, step 5)
      const k = componentIndex(s.relative_to, th, opts.sys, `${what}: relative_to`);
      if (k === i) throw fail("BAD_INPUT", `Column: ${what}: the two components are the same (${names[i]}).`);
      if (!(feed[k] > 0)) throw fail("BAD_INPUT", `Column: ${what}: ${names[k]} is not in the feed.`);
      if (!(value > 0)) throw fail("BAD_INPUT", `Column: ${what}: a ratio of two components must be above 0 (got ${value}).`);
      d.k = k; d.unit = `${basis} ratio`; d.label = `the ${basis} ratio of ${names[i]} to ${names[k]} in ${where}`;
      design.push(d);
      continue;
    }
    if (kind === "purity") {
      if (!(value > 0 && value < 1)) throw fail("BAD_INPUT", `Column: ${what}: a purity is a ${basis} fraction between 0 and 1, both excluded (got ${value}). ${value >= 1 ? "A pure product needs infinitely many stages: ask for 0.999 or 0.9999." : ""}`.trim());
      d.unit = `${basis} fraction`; d.label = `the ${basis} fraction of ${names[i]} in ${where}`;
    } else if (kind === "recovery") {
      if (!(value > 0 && value < 1)) throw fail("BAD_INPUT", `Column: ${what}: a recovery is the share of ${names[i]}'s feed that leaves in ${where}, between 0 and 1, both excluded (got ${value}). ${value >= 1 ? "No column recovers all of a component, or more than was fed: ask for 0.99 or 0.999." : ""}`.trim());
      d.unit = "fraction of the feed"; d.label = `the recovery of ${names[i]} in ${where}`;
    } else {
      const fed = basis === "mass" ? feed[i] * MW[i] / 1000 : feed[i], u = basis === "mass" ? "kg/s" : "mol/s";
      if (!(value > 0 && value < fed)) throw fail("BAD_INPUT", `Column: ${what}: the flow of ${names[i]} in ${where} must be above 0 and below its feed, ${fmt(fed)} ${u} (got ${value}).`);
      d.unit = u; d.label = `the flow of ${names[i]} in ${where}`;
    }
    design.push(d);
  }
  return { design, base, draws, feed, F, MW, N };
}

/** What is refused before anything is solved: the arithmetic of the specifications. */
function checkArithmetic({ design, base, draws, feed, F }, th, opts = {}) {
  const names = th.names;
  const same = (a, b) => a.kind === b.kind && a.product === b.product && a.draw === b.draw && a.i === b.i && a.stage === b.stage;
  for (let a = 0; a < design.length; a++) for (let b = a + 1; b < design.length; b++) {
    if (same(design[a], design[b])) throw fail("BAD_INPUT", `Column: ${design[a].label} is specified twice; give two different specifications.`);
  }
  // purities of one product, on one basis, add up to at most 1
  for (const d of design.filter(q => q.kind === "purity")) {
    const group = design.filter(q => q.kind === "purity" && q.product === d.product && q.draw === d.draw && q.basis === d.basis);
    const total = sum(group.map(q => q.value));
    if (group.length > 1 && total >= 1) throw fail("BAD_INPUT", `Column: ${group.map(q => q.label).join(" and ")} add up to ${fmt(total)}: the fractions of one product add up to 1 at most. Lower one of them.`);
  }
  // a purity with a given product flow: the product cannot hold more of the component than was fed
  const fixedDraws = sum(draws.filter(d => !d.free).map(d => Number(d.rate) || 0));
  const get = k => { const s = base.find(q => q?.kind === k); return s ? Number(s.value) : null; };
  const allFixed = draws.every(d => !d.free);
  // (the vapour + liquid condenser: neither distillate's own flow is given, only their sum)
  const vlc = opts.ends?.condenser === "vapour_liquid";
  const rateOf = d => (vlc && d.product !== "bottoms" && d.product !== "side_draw" ? null : d.product === "distillate" ? get("distillate_rate") ?? (get("bottoms_rate") != null && allFixed ? F - fixedDraws - get("bottoms_rate") : null)
    : d.product === "bottoms" ? get("bottoms_rate") ?? (get("distillate_rate") != null && allFixed ? F - fixedDraws - get("distillate_rate") : null)
      : draws[d.draw - 1].free ? null : Number(draws[d.draw - 1].rate));
  for (const d of design) {
    if (d.kind !== "purity" || d.basis !== "mole") continue;
    const rate = rateOf(d);
    if (rate > 0 && d.value * rate > feed[d.i] * (1 + 1e-12)) {
      throw fail("BAD_INPUT", `Column: ${d.label} is asked to be ${d.value}, but ${d.product === "side_draw" ? `side draw ${d.draw}` : `the ${d.product}`} is ${fmt(rate)} mol/s and the feed brings only ${fmt(feed[d.i])} mol/s of ${names[d.i]}: the fraction is ${fmt(feed[d.i] / rate)} at most. Ask for a lower purity, or a smaller product flow (${fmt(feed[d.i] / d.value)} mol/s or less).`);
    }
  }
  // a purity and a recovery of one component in one product fix that product's flow
  for (const p of design.filter(q => q.kind === "purity" && q.basis === "mole")) {
    const r = design.find(q => q.kind === "recovery" && q.product === p.product && q.draw === p.draw && q.i === p.i);
    if (!r) continue;
    const rate = r.value * feed[p.i] / p.value;
    if (!(rate < F - fixedDraws)) throw fail("BAD_INPUT", `Column: ${p.label} of ${p.value} with ${r.label} of ${r.value} needs a product of ${fmt(rate)} mol/s, more than the feed${fixedDraws ? " less the side draws" : ""} (${fmt(F - fixedDraws)} mol/s). Ask for a higher purity or a lower recovery.`);
  }
}

/**
 * A binary azeotrope between the feed and a purity asked for: no column of one feed region crosses it. Only for two
 * components, a property system with an azeotrope search, and a column without a decanter.
 */
function checkAzeotrope({ design, feed, F, MW }, th, opts) {
  const sys = opts.sys, P = opts.P_kPa;
  if (!sys || th.n !== 2 || !(P > 0) || ["decanter", "vapour_liquid"].includes(opts.ends?.condenser ?? "total")) return;
  const wanted = design.filter(d => d.kind === "purity" && d.product !== "side_draw");
  if (!wanted.length) return;
  let az;
  try { az = binaryAzeotropes(sys, P, 200, { gaps: true }); } catch { return; }
  if (!az?.length) return;
  const names = th.names;
  // every feed's fraction of the first component: the test needs them all on one side of the azeotrope
  const zs = opts.feeds.map(f => f.flows[0] / sum(f.flows)).filter(Number.isFinite), z0 = feed[0] / F;
  for (const d of wanted) {
    // the asked fraction as the mole fraction of the first component
    let x = d.value;
    if (d.basis === "mass") { const a = d.value / MW[d.i], b = (1 - d.value) / MW[1 - d.i]; x = a / (a + b); }
    const x0 = d.i === 0 ? x : 1 - x;
    for (const a of az) {
      const between = (a.x - z0) * (a.x - x0) < 0;
      if (!between || !zs.every(z => (z - a.x) * (z0 - a.x) > 0)) continue;
      const azI = d.i === 0 ? a.x : 1 - a.x, zI = feed[d.i] / F;
      const limit = d.basis === "mass" ? (azI * MW[d.i]) / (azI * MW[d.i] + (1 - azI) * MW[1 - d.i]) : azI;
      throw fail("OUT_OF_RANGE", `Column: ${d.label} is asked to be ${d.value}, beyond the azeotrope of ${names[0]} + ${names[1]}: by this method the mixture has a ${a.type} azeotrope at ${fmt(a.x)} ${names[0]} (mole fraction), ${fmt(a.T)} K, at ${fmt(P)} kPa. The feed holds ${fmt(zI)} of ${names[d.i]}, on the other side of it, and distillation does not cross an azeotrope at any reflux or number of stages. What would make it feasible: a ${d.basis} fraction on the feed's side of the azeotrope (${limit > zI ? "below" : "above"} ${fmt(limit)}); another pressure, if the azeotrope moves with it; or an entrainer and a decanter (phases "VLL", condenser "decanter").`,
        { azeotrope: { x: [a.x, 1 - a.x], T_K: a.T, P_kPa: P, type: a.type }, asked: d.value, limit });
    }
  }
}

/** Solve a column with design specifications; `solve` is the stage solver (solveCascade), `th` its adapter. */
export function solveSpecified(opts, solve, th) {
  // a restart (the block's last answer in a flowsheet; proposal 0027, (a)): the search from the last answer's free
  // variables first; where it does not meet the specifications, the search exactly as without a restart
  if (Array.isArray(opts.startAdjusted) && !opts.restarted) {
    const t0 = Date.now();
    try { return solveSpecified({ ...opts, restarted: true }, solve, th); } catch (e) {
      if (e?.code !== "NO_CONVERGENCE") throw e;
      const note = `the search from the last answer: not met (${Date.now() - t0} ms), so the search as from a cold start`;
      const { start: _s, startAdjusted: _a, startEarly: _e, ...cold } = opts;
      const r = solveSpecified(cold, solve, th);
      return r.solver?.specifications ? { ...r, solver: { ...r.solver, specifications: { ...r.solver.specifications, tried: [note, ...r.solver.specifications.tried] } } } : r;
    }
  }
  const prob = normalize(opts, th);
  const { design, base, draws, feed, F, MW } = prob;
  if (!design.length && draws.every(d => !d.free)) return solve(opts);
  const names = th.names;
  const condenser = opts.ends?.condenser ?? "total", reboiler = opts.ends?.reboiler ?? "partial";
  const hasC = condenser !== "none", hasR = reboiler !== "none", decanter = condenser === "decanter";
  const need = (hasC && !decanter ? 1 : 0) + (hasR ? 1 : 0);
  const unknown = base.filter(s => !BASE.includes(s?.kind));
  if (unknown.length) throw fail("BAD_INPUT", `Column: unknown specification ${unknown.map(s => JSON.stringify(s?.kind)).join(", ")}. Known: ${[...BASE, ...DESIGN_SPECS].join(", ")}.`);
  const freeDraws = draws.map((d, k) => (d.free ? k : -1)).filter(k => k >= 0);
  if (freeDraws.length && !(hasC && hasR)) throw fail("NOT_AVAILABLE", "Column: side draws are built for a column with a condenser and a reboiler (distillation); an absorber or a stripper with a side draw is not built.");
  const given = base.length + design.length, wanted = need + freeDraws.length;
  if (given !== wanted) {
    const dofText = decanter ? "one (the decanter returns one liquid entirely, which fixes the reflux)" : !hasC && hasR ? "one (a reboiled stripper)" : !hasC ? "none (an absorber or a stripper without a reboiler: its products follow from its feeds and stages)" : "two";
    throw fail("BAD_INPUT", `Column: ${given} specification${given === 1 ? "" : "s"} given (${[...base, ...(opts.specs ?? []).filter(s => DESIGN_SPECS.includes(s?.kind))].map(s => s?.kind).join(", ") || "none"}), and the column takes ${wanted}: its degrees of freedom are ${dofText}${freeDraws.length ? `, and ${freeDraws.length} more for the side draw${freeDraws.length > 1 ? "s" : ""} given without a rate (${freeDraws.map(k => k + 1).join(", ")}): give ${freeDraws.length > 1 ? "their rates" : "its rate"}, or one specification more for each` : ""}. A design specification (${DESIGN_SPECS.join(", ")}) takes the place of a ratio, a product flow or a duty.`);
  }
  checkArithmetic(prob, th, opts);
  checkAzeotrope(prob, th, opts);

  // ---- a column with a decanter and one purity of its bottoms: the purity among the MESH equations
  // (proposal 0025, step 2; see the file header), the outer loop only if that fails
  let meshNote = null;
  const pd = design[0];
  if (decanter && hasR && design.length === 1 && !base.length && !draws.length && pd.kind === "purity" && pd.product === "bottoms") {
    const t0 = Date.now();
    try {
      const r = solve({ ...opts, specs: [{ kind: "bottoms_fraction", i: pd.i, value: pd.value, basis: pd.basis, ...(pd.basis === "mass" ? { MW } : {}), startD: (Array.isArray(opts.startAdjusted) ? opts.startAdjusted.find(q => q.variable === "distillate_rate")?.value : null) ?? estimateDistillate(prob, th, F) }] });
      const f = r.products.bottoms.flows;
      const a = pd.basis === "mass" ? f[pd.i] * MW[pd.i] / sum(f.map((v, k) => v * MW[k])) : f[pd.i] / sum(f);
      const g = logit(a) - logit(pd.value);
      if (Math.abs(g) <= SPEC_TOLERANCE) {
        const D = sum(r.products.distillate.flows);
        return {
          ...r,
          specifications: [{ kind: "purity", product: pd.product, component: pd.i, component_name: names[pd.i], basis: pd.basis, unit: pd.unit,
            asked: pd.value, achieved: a, error: a - pd.value, scaled_residual: g, met: true, label: pd.label }],
          adjusted: [{ variable: "distillate_rate", value: D, unit: "mol/s" }],
          residuals: { ...r.residuals, design_specifications: Math.abs(g) },
          tolerances: { ...r.tolerances, design_specifications: SPEC_TOLERANCE, units: { ...r.tolerances.units, design_specifications: "scaled (logit of a fraction, logarithm of a flow, K / 10)" } },
          solver: { ...r.solver, specifications: { method: `among the MESH equations: ln(x / ${pd.value}) = 0 for ${pd.label}, in place of the reboiler's energy balance (DWSIM's Naphtali-Sandholm solver; proposal 0025, step 2)`,
            column_solves: 1, column_iterations: r.iterations, tried: [`the purity among the MESH equations: converged (${r.iterations} iterations, ${Date.now() - t0} ms)`], tolerance: SPEC_TOLERANCE } },
        };
      }
      meshNote = `the purity among the MESH equations: converged, but ${pd.label} was met only to ${fmt(Math.abs(g))} (${Date.now() - t0} ms)`;
    } catch (e) {
      if (e?.code !== "NO_CONVERGENCE") throw e;
      meshNote = `the purity among the MESH equations: not converged (${Date.now() - t0} ms; ${e.message.replace(/^Column: /, "").slice(0, 600)})`;
    }
  }

  // ---- the free variables: the engine's own specifications that were left open
  const kinds = base.map(s => s.kind);
  const candidates = [
    hasC && !decanter && !kinds.includes("reflux_ratio") && !kinds.includes("condenser_duty") ? "reflux_ratio" : null,
    !kinds.includes("distillate_rate") && !kinds.includes("bottoms_rate") ? "distillate_rate" : null,
    hasR && !kinds.includes("boilup_ratio") && !kinds.includes("reboiler_duty") ? "boilup_ratio" : null,
  ].filter(Boolean).slice(0, need - base.length);
  const fixedDraws = sum(draws.filter(d => !d.free).map(d => Number(d.rate) || 0)), Dmax = F - fixedDraws;
  const ln = Math.log;
  const vars = [
    ...candidates.map(name => (name === "distillate_rate"
      ? { name, unit: "mol/s", lo: -LOGIT_MAX, hi: LOGIT_MAX, to: p => Dmax / (1 + Math.exp(-p)), from: v => logit(v / Dmax), grid: [0.01, 0.03, 0.06, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.94, 0.97, 0.99].map(f => f * Dmax),
        edge: { low: [3e-3, 1e-3, 3e-4, 1e-4, 1e-5, 1e-6].map(f => f * Dmax), high: [0.997, 0.999, 0.9997, 0.9999, 0.99999, 0.999999].map(f => f * Dmax),
          limit: [logit(1e-6) - 1e-9, logit(0.999999) + 1e-9] } }
      : { name, unit: "", lo: ln(RATIO_RANGE[0]), hi: ln(RATIO_RANGE[1]), to: Math.exp, from: ln, grid: [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 4, 8, 15, 30, 60, 120, 250],
        edge: { low: [0.01, 0.005, 0.002, 1.01e-3], high: [500, 990] } })),
    ...freeDraws.map(k => ({ name: "draw_rate", draw: k + 1, unit: "mol/s", lo: ln(1e-6), hi: ln(0.98), to: p => F * Math.exp(p), from: v => ln(v / F),
      grid: [0.001, 0.003, 0.01, 0.03, 0.06, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8].map(f => f * F) })),
  ];
  const m = vars.length;   // = design.length
  const varName = v => (v.name === "draw_rate" ? `the rate of side draw ${v.draw}` : v.name === "distillate_rate" ? "the distillate flow" : v.name === "reflux_ratio" ? "the reflux ratio" : "the boil-up ratio");
  const varText = (v, value) => `${varName(v)} ${fmt(value)}${v.unit ? ` ${v.unit}` : ""}`;

  // ---- a restart profile (a flowsheet's last answer of this block, a design specification's next solve, a start
  // given): the product specifications among the MESH equations first, one Newton solve from the profile (proposal
  // 0028, item 1; see the file header); where that does not converge, the outer loop below, its `tried` starting with
  // this attempt
  const profile = Array.isArray(opts.start?.stages) && opts.start.stages.length === prob.N;
  // (proposal 0029, step 5: also a stage temperature, a ratio of two components, a ratio of two flows; and step 4: side
  // draws whose rates are found, each rate one more variable of its own stage, its specification that stage's row)
  const product = d => ["purity", "recovery", "component_flow", "stage_temperature", "component_ratio", "flow_ratio"].includes(d.kind);
  if (profile && !opts.__probe && !meshNote && design.every(product)) {
    const t0 = Date.now();
    // (a flowsheet's restart carries the last answer's free variables; any other start is a profile given)
    const from = Array.isArray(opts.startAdjusted) ? "from the last answer's profile" : "from the start profile given";
    const term = t => (t.flow === "side_draw" ? { flow: "side_draw", draw: t.draw - 1 } : { flow: t.flow });
    const meshSpecs = design.map(d => (d.kind === "stage_temperature" ? { kind: "product_spec", target: "temperature", stage: d.stage - 1, value: d.value }
      : d.kind === "flow_ratio" ? { kind: "product_spec", target: "flow_ratio", numerator: term(d.num), denominator: term(d.den), value: d.value }
        : { kind: "product_spec", target: d.kind === "purity" ? "fraction" : d.kind, product: d.product,
          ...(d.product === "side_draw" ? { draw: d.draw - 1 } : {}), i: d.i, ...(d.k != null ? { k: d.k } : {}), value: d.value, basis: d.basis ?? "mole", ...(d.basis === "mass" ? { MW } : {}) }));
    // the found draws' rates start from the profile's draws from their stages (else a tenth of the feed)
    const st = opts.start.stages;
    const meshDraws = draws.map(d => { const { free, ...rest } = d;
      return free ? { ...rest, free: true, rate: Math.max((d.phase ?? "liquid") === "liquid" ? st[d.stage - 1].U_mol_s ?? 0 : st[d.stage - 1].W_mol_s ?? 0, 0) || 0.1 * F } : rest; });
    try {
      const { startEarly: _e, quick: _q, ...rest } = opts;
      const r = solve({ ...rest, specs: [...base, ...meshSpecs], ...(draws.length ? { draws: meshDraws } : {}) });
      const a = design.map(d => achievedIn(r, d, feed, MW)), g = design.map((d, k) => scaledOf(d, a[k]));
      if (g.every(v => Math.abs(v) <= SPEC_TOLERANCE)) {
        const adjusted = vars.map(v => ({ variable: v.name, ...(v.draw ? { draw: v.draw } : {}), value: v.name === "draw_rate" ? sum(r.products.draws[v.draw - 1].flows) : freeValueOf(r, v.name, condenser), ...(v.unit ? { unit: v.unit } : {}) }));
        return {
          ...r,
          specifications: design.map((d, k) => specEntry(d, a[k], g[k], names)),
          adjusted,
          residuals: { ...r.residuals, design_specifications: Math.max(...g.map(Math.abs)) },
          tolerances: { ...r.tolerances, design_specifications: SPEC_TOLERANCE, units: { ...r.tolerances.units, design_specifications: "scaled (logit of a fraction, logarithm of a flow, K / 10)" } },
          solver: { ...r.solver, specifications: { method: `among the MESH equations ${from}: ${design.map(d => d.label).join(" and ")} in place of the energy balance of the end${design.length > 1 ? "s" : ""} they free (The ChemSep Book, section 13.2.4; DWSIM's Naphtali-Sandholm solver; proposal 0028)`,
            column_solves: 1, column_iterations: r.iterations, tried: [`the specifications among the MESH equations ${from}: converged (${r.iterations} iterations, ${Date.now() - t0} ms)`], tolerance: SPEC_TOLERANCE } },
        };
      }
      meshNote = `the specifications among the MESH equations ${from}: converged, but met only to ${fmt(Math.max(...g.map(Math.abs)))} (${Date.now() - t0} ms)`;
    } catch (e) {
      if (e?.code !== "NO_CONVERGENCE" && e?.code !== "PHASE_SPLIT") throw e;
      meshNote = `the specifications among the MESH equations ${from}: not converged (${Date.now() - t0} ms; ${e.message.replace(/^Column: /, "").slice(0, 300)})`;
    }
  }

  // ---- one column for a set of free variables; a failure is a failed trial point, kept for the report
  let anySolved = false;
  let solves = 0, innerIterations = 0, warm = opts.start ?? null, firstError = null, lastError = null;
  const columnAt = values => {
    const specs = [...base, ...vars.map((v, k) => (v.name === "draw_rate" ? null : { kind: v.name, value: values[k] })).filter(Boolean)];
    const ds = draws.map((d, k) => { const { free, ...rest } = d; return free ? { ...rest, rate: values[vars.findIndex(v => v.draw === k + 1)] } : rest; });
    solves += 1;
    checkTime();   // a flowsheet's time limit (solver.timeLimit_s; proposal 0027)
    try {
      // after the first column, each is started from a solved neighbour, then from the bubble-point start; the
      // continuation is left to the first
      const r = solve({ ...opts, specs, draws: ds, start: warm, sensitivity: true, quick: !!warm && anySolved });
      anySolved = true;
      innerIterations += r.iterations ?? 0;
      return r;
    } catch (e) {
      if (!e?.code || ["NOT_AVAILABLE", "MISSING_DATA"].includes(e.code)) throw e;
      firstError = firstError ?? e; lastError = e;
      return null;
    }
  };
  const flowsOf = (r, d) => (d.product === "distillate" ? r.products.distillate.flows : d.product === "vapour_distillate" ? r.products.vapour_distillate.flows : d.product === "bottoms" ? r.products.bottoms.flows : r.products.draws[d.draw - 1].flows);
  const achieved = (r, d) => achievedIn(r, d, feed, MW);
  const scaled = scaledOf;
  // (a point is solved once: a second call with the same variables returns the first answer, a failure included)
  const seen = new Map();
  const point = (p, cold = false) => {
    const key = p.join(",");
    if (seen.has(key) && !(cold && seen.get(key) === null)) return seen.get(key);
    if (cold) warm = null;   // a column from the bubble-point start and the continuation, not from a neighbour
    const values = vars.map((v, k) => v.to(p[k])), r = columnAt(values);
    let q = null;
    if (r) { const a = design.map(d => achieved(r, d)), g = design.map((d, k) => scaled(d, a[k])); q = { p: p.slice(), values, r, a, g, norm: Math.hypot(...g) }; }
    seen.set(key, q);
    return q;
  };
  const met = q => q.g.every(v => Math.abs(v) <= SPEC_TOLERANCE);
  const clamp = p => p.map((v, k) => Math.min(vars[k].hi, Math.max(vars[k].lo, v)));

  // ---- the start: the distillate from the specifications' own material balance, a moderate reflux
  const startValues = R0 => vars.map(v => (v.name === "distillate_rate" ? estimateDistillate(prob, th, Dmax)
    : v.name === "draw_rate" ? 0.1 * F : v.name === "reflux_ratio" ? R0 : Math.max(R0, 1)));
  const tried = meshNote ? [meshNote] : [];
  let best = null;
  const keep = q => { if (q && (!best || q.norm < best.norm)) best = q; return q; };

  const limits = q => vars.map((v, k) => (q.p[k] >= v.hi - 1e-9 ? "upper" : q.p[k] <= v.lo + 1e-9 ? "lower" : null));
  const limitText = q => { const at = limits(q); return at.some(Boolean) ? vars.map((v, k) => (at[k] ? `${varName(v)} reached its ${at[k]} limit (${fmt(v.to(q.p[k]))})` : null)).filter(Boolean).join(" and ") : null; };
  // the stage variables as one vector (l, v, T per stage), and the specifications' residuals from it
  // (the vapour + liquid condenser: one more slot per stage, U1 / L1 on stage 1 and 1 elsewhere, as in the engine)
  const vlc = condenser === "vapour_liquid", nc = th.n, w = 2 * nc + 1 + (vlc ? 1 : 0);
  const vectorOf = r => Float64Array.from(r.stages.flatMap((st, j) => [...st.l, ...st.v, st.T_K, ...(vlc ? [j === 0 ? st.U_mol_s / st.L_mol_s : 1] : [])]));
  const residualsFrom = (u, values) => {
    const N = u.length / w, part = (j, o) => Array.from(u.subarray(j * w + o, j * w + o + nc));
    // (a draw by share: s / (1 - s) times its stage's liquid or vapour; proposal 0029, step 4)
    const rate = k => (draws[k].free ? values[vars.findIndex(v => v.draw === k + 1)] : draws[k].share != null
      ? draws[k].share / (1 - draws[k].share) * sum(part(Number(draws[k].stage) - 1, (draws[k].phase ?? "liquid") === "liquid" ? 0 : nc)) : Number(draws[k].rate));
    const flows = d => { if (d.product === "distillate") return vlc ? part(0, 0).map(a => a * u[2 * nc + 1]) : part(0, nc);
      if (d.product === "vapour_distillate") return part(0, nc); if (d.product === "bottoms") return part(N - 1, 0);
      const q = draws[d.draw - 1], f = part(Number(q.stage) - 1, (q.phase ?? "liquid") === "liquid" ? 0 : nc), t = sum(f); return f.map(a => a / t * rate(d.draw - 1)); };
    const total = (j, o) => sum(part(j, o));
    const flowFrom = t => (t.flow === "reflux" ? total(0, 0) : t.flow === "distillate" ? (vlc ? total(0, 0) * u[2 * nc + 1] + total(0, nc) : total(0, nc))
      : t.flow === "vapour_distillate" ? total(0, nc) : t.flow === "bottoms" ? total(N - 1, 0) : t.flow === "boilup" ? total(N - 1, nc) : t.flow === "feed" ? F
        : sum(flows({ product: "side_draw", draw: t.draw })));
    return design.map(d => {
      if (d.kind === "stage_temperature") return scaled(d, u[(d.stage - 1) * w + 2 * nc]);
      if (d.kind === "flow_ratio") return scaled(d, flowFrom(d.num) / flowFrom(d.den));
      const f = flows(d);
      if (d.kind === "component_ratio") return scaled(d, d.basis === "mass" ? f[d.i] * MW[d.i] / (f[d.k] * MW[d.k]) : f[d.i] / f[d.k]);
      const a = d.kind === "recovery" ? f[d.i] / feed[d.i] : d.kind === "component_flow" ? (d.basis === "mass" ? f[d.i] * MW[d.i] / 1000 : f[d.i])
        : d.basis === "mass" ? f[d.i] * MW[d.i] / sum(f.map((v, k) => v * MW[k])) : f[d.i] / sum(f);
      return scaled(d, a);
    });
  };
  /** The outer Jacobian dg/dp from the column's own sensitivities (see the file header); null where not available. */
  const exact = q => {
    if (typeof q.r.sensitivities !== "function") return null;
    let du;
    try { du = q.r.sensitivities(vars.map(v => (v.name === "draw_rate" ? { draw: v.draw - 1 } : { spec: v.name }))); } catch (e) { if (!e?.code) throw e; return null; }
    if (du.some(d => !d)) return null;
    const u = vectorOf(q.r), g0 = residualsFrom(u, q.values);
    const M = Array.from({ length: m }, () => new Array(m).fill(0));
    for (let k = 0; k < m; k++) {
      // a small step along the column's answer to variable k, then the chain rule to the outer variable p
      const eps = 1e-6 * Math.abs(q.values[k]), u1 = u.map((a, e) => a + eps * du[k][e]);
      const v1 = q.values.slice(); v1[k] += eps;
      const g1 = residualsFrom(u1, v1);
      const dvdp = vars[k].name === "distillate_rate" ? q.values[k] * (1 - q.values[k] / Dmax) : q.values[k];
      for (let e = 0; e < m; e++) M[e][k] = (g1[e] - g0[e]) / eps * dvdp;
    }
    return M.every(row => row.every(Number.isFinite)) ? M : null;
  };
  /** The same by finite differences between two columns. */
  const differences = q => {
    const M = Array.from({ length: m }, () => new Array(m).fill(0));
    for (let k = 0; k < m; k++) {
      let h = 1e-3, t = null;
      for (const sgn of [1, -1]) {
        const p = q.p.slice(); p[k] += sgn * h;
        if (p[k] > vars[k].hi || p[k] < vars[k].lo) continue;
        warm = q.r; t = point(p);
        if (t) { h *= sgn; break; }
      }
      if (!t) return null;
      for (let e = 0; e < m; e++) M[e][k] = (t.g[e] - q.g[e]) / h;
    }
    return M;
  };
  function newton(q0) {
    let q = q0, J = null, iterations = 0;
    const jacobian = () => exact(q) ?? differences(q);
    const history = [];
    for (; iterations < MAX_OUTER; iterations++) {
      if (met(q)) return { q, iterations, converged: true };
      // Newton's method converges fast near a solution: a residual that has not halved in six steps is far from one
      history.push(q.norm);
      if (history.length > 6 && q.norm > 0.5 * history[history.length - 7]) return { q, iterations, converged: false, atLimit: limits(q), why: limitText(q) ?? "the specifications' residual stopped falling" };
      J = jacobian();
      if (!J) { return { q, iterations, converged: false, why: "a column next to the last one could not be solved, so the specifications' slopes are not known" }; }
      let dp = linearSolve(J, q.g.map(v => -v));
      if (!dp) return { q, iterations, converged: false, why: "the specifications do not answer to the free variables here (a singular Jacobian): they may not be independent" };
      // at most a factor of e^1.5 in a ratio or a flow per step, and inside the variables' ranges
      const big = Math.max(...dp.map(Math.abs));
      if (big > 1.5) dp = dp.map(v => v * 1.5 / big);
      let next = null, lam = 1;
      for (let h = 0; h < 8; h++, lam /= 2) {
        const p = clamp(q.p.map((v, k) => v + lam * dp[k]));
        if (p.every((v, k) => v === q.p[k])) break;
        warm = q.r;
        const t = keep(point(p));
        if (t && t.norm < q.norm) { next = t; break; }
      }
      if (!next) {
        return { q, iterations, converged: false, atLimit: limits(q), why: limitText(q) ?? "no step lowered the specifications' residual" };
      }
      q = next;
    }
    return { q, iterations, converged: false, why: `${MAX_OUTER} outer iterations were not enough` };
  }

  /** One free variable: scan its range, then a bracketing secant search (Illinois) where the residual changes sign. */
  function scan(near) {
    const v = vars[0], pts = [];
    const order = v.grid.map(x => v.from(x)).filter(p => p >= v.lo && p <= v.hi).sort((a, b) => Math.abs(a - near) - Math.abs(b - near));
    // each column is started from the solved one nearest to it; where that fails, by way of the point halfway
    const solved = best ? [best] : [];
    const reach = (p, from, depth = 0) => {
      warm = from?.r ?? warm;
      const t = keep(point([p]));
      if (t || !from || depth >= 3) return t;
      const mid = reach((from.p[0] + p) / 2, from, depth + 1);
      return mid ? reach(p, mid, depth + 1) : null;
    };
    for (const p of order) {
      const nb = solved.slice().sort((a, b) => Math.abs(a.p[0] - p) - Math.abs(b.p[0] - p))[0];
      const t = reach(p, nb);
      if (t && !pts.includes(t)) { solved.push(t); pts.push(t); }
    }
    pts.sort((a, b) => a.p[0] - b.p[0]);
    const brackets = [], unsolved = [];
    for (let k = 0; k + 1 < pts.length; k++) if (pts[k].g[0] * pts[k + 1].g[0] <= 0) brackets.push([pts[k], pts[k + 1]]);
    // no sign change, and the column nearest to the value asked is the grid's first or last: the value may lie beyond
    // the grid, toward the variable's own limit (EA-19, 2026-11-20: a feed nearly free of organics, whose water purity
    // is met only below 1 % of the feed as distillate). Go on toward that limit, each column from the last one solved
    if (!brackets.length && pts.length >= 2 && v.edge) {
      const k = pts.reduce((a, q, e) => (Math.abs(q.g[0]) < Math.abs(pts[a].g[0]) ? e : a), 0);
      const side = k === 0 ? "low" : k === pts.length - 1 ? "high" : null;
      let last = pts[k], complete = true;
      for (const x of side ? v.edge[side] : []) {
        const p = v.from(x);
        // the edge may go beyond the range Newton's method takes (a distillate of 1e-4 to 0.9999 of the feed), to
        // the variable's own `limit` where it has one
        if (p < (v.edge.limit?.[0] ?? v.lo) || p > (v.edge.limit?.[1] ?? v.hi) || (side === "low" ? p >= last.p[0] : p <= last.p[0])) continue;
        // from the last column solved, else from the bubble-point start: a column with a trace of distillate is
        // often easier from nothing than from a neighbour (EA-19)
        const t = reach(p, last) ?? keep(point([p], true));
        if (!t) { complete = false; break; }
        if (!pts.includes(t)) pts.push(t);
        const crossed = t.g[0] * last.g[0] <= 0;
        if (crossed) brackets.push(side === "low" ? [t, last] : [last, t]);
        last = t;
        if (crossed) break;
      }
      edgeScan = side ? { side, complete } : null;
      pts.sort((a, b) => a.p[0] - b.p[0]);
    }
    if (!brackets.length && pts.length >= 3) {
      // no sign change on the grid: the specification may still pass its value between two grid points, at an
      // extremum. Close in on the point nearest to the value asked, by halving the intervals next to it
      let k = pts.reduce((a, q, e) => (Math.abs(q.g[0]) < Math.abs(pts[a].g[0]) ? e : a), 0);
      for (let round = 0; round < 4 && !brackets.length; round++) {
        const c = pts[k];
        for (const nb of [pts[k - 1], pts[k + 1]]) {
          if (!nb) continue;
          warm = c.r;
          const t = keep(point([(c.p[0] + nb.p[0]) / 2]));
          if (t && !pts.includes(t)) pts.push(t);
        }
        pts.sort((a, b) => a.p[0] - b.p[0]);
        for (let e = 0; e + 1 < pts.length; e++) if (pts[e].g[0] * pts[e + 1].g[0] <= 0) brackets.push([pts[e], pts[e + 1]]);
        k = pts.reduce((a, q, e) => (Math.abs(q.g[0]) < Math.abs(pts[a].g[0]) ? e : a), 0);
      }
    }
    brackets.sort((a, b) => Math.abs((a[0].p[0] + a[1].p[0]) / 2 - near) - Math.abs((b[0].p[0] + b[1].p[0]) / 2 - near));
    for (let [a, b] of brackets) {
      // the Illinois rule: an end kept twice in a row has its residual halved in the secant formula
      let fa = a.g[0], fb = b.g[0], kept = null;
      for (let it = 0; it < 60; it++) {
        if (met(a)) return { q: a, pts };
        if (met(b)) return { q: b, pts };
        const pa = a.p[0], pb = b.p[0];
        let pc = (pa * fb - pb * fa) / (fb - fa);
        if (!(pc > Math.min(pa, pb) && pc < Math.max(pa, pb))) pc = (pa + pb) / 2;
        // each trial column from the nearer end, by way of the points halfway where it fails (as in the scan): a
        // column the outer loop cannot reach inside a bracket must not end the search unseen (EA-13, 2026-11-14)
        const nearer = Math.abs(pc - pa) < Math.abs(pc - pb) ? a : b;
        // and, last, from the bubble-point start (EA-19, 2026-11-20: a column with a trace of distillate)
        let c = reach(pc, nearer);
        if (!c) { c = reach((pa + pb) / 2, nearer) ?? keep(point([pc], true)); if (!c) { unsolved.push([a, b]); break; } }
        if (c.g[0] * b.g[0] > 0) { b = c; fb = c.g[0]; if (kept === "a") fa /= 2; kept = "a"; }
        else { a = c; fa = c.g[0]; if (kept === "b") fb /= 2; kept = "b"; }
        if (Math.abs(a.p[0] - b.p[0]) < 1e-13) break;
      }
      if (met(a)) return { q: a, pts };
      if (met(b)) return { q: b, pts };
    }
    return { q: null, pts, unsolved };
  }

  let done = null, run = null, start = null, edgeScan = null;
  // a restart (src/flowsheet/flowsheet.js: the block's last answer in a recycle loop or a design specification's
  // evaluation): the outer loop first starts from the variables found then, with that column as the start
  const prevVals = Array.isArray(opts.startAdjusted) ? vars.map(v => opts.startAdjusted.find(a => a.variable === v.name && (a.draw ?? null) === (v.draw ?? null))?.value) : null;
  if (prevVals && prevVals.every(v => Number.isFinite(v) && v > 0)) {
    warm = opts.start ?? null;
    const q = keep(point(clamp(vars.map((v, k) => v.from(prevVals[k])))));
    if (q) {
      const rr = newton(q);
      tried.push(`Newton's method on the specifications from the last answer's ${vars.map((v, k) => varText(v, prevVals[k])).join(", ")} (${rr.iterations} iterations${rr.converged ? "" : `: ${rr.why}`})`);
      if (rr.converged) { done = rr.q; run = rr; start = q; }
    } else tried.push(`a first column with the last answer's ${vars.map((v, k) => varText(v, prevVals[k])).join(", ")}: not solved (${lastError?.code})`);
  }
  if (opts.restarted && !done) throw fail("NO_CONVERGENCE", "Column: the specifications were not met from the last answer.");
  for (const R0 of done ? [] : [3, 8, 1.2, 20]) {
    warm = opts.start ?? null;
    const values = startValues(R0);
    start = keep(point(clamp(vars.map((v, k) => v.from(values[k])))));
    if (!start) { tried.push(`a first column with ${vars.map((v, k) => varText(v, values[k])).join(", ")}: not solved (${lastError?.code})`); if (!vars.some(v => v.name.endsWith("_ratio"))) break; continue; }
    run = newton(start);
    tried.push(`Newton's method on the specifications from ${vars.map((v, k) => varText(v, values[k])).join(", ")} (${run.iterations} iterations${run.converged ? "" : `: ${run.why}`})`);
    if (run.converged) { done = run.q; break; }
    if (run.atLimit?.some(Boolean) || !vars.some(v => v.name.endsWith("_ratio"))) break;
  }
  if (!start && !best) {
    // no column at all at the start: the first refusal is the reason (a bad stage number, a phase split, no convergence)
    if (firstError?.code && firstError.code !== "NO_CONVERGENCE") throw firstError;
    throw fail("NO_CONVERGENCE", `Column: no column could be solved to start the search for the specifications (${design.map(d => `${d.label} = ${d.value}`).join("; ")}). Tried: ${tried.join("; ")}. The stage solver said: ${firstError?.message ?? "nothing"}`, { tried });
  }
  let scanned = null;
  if (!done && m === 1) {
    scanned = scan(best.p[0]);
    tried.push(`a scan of ${varName(vars[0])} from ${fmt(Math.min(vars[0].grid[0], scanned.pts[0]?.values[0] ?? Infinity))} to ${fmt(Math.max(vars[0].grid.at(-1), scanned.pts.at(-1)?.values[0] ?? -Infinity))} (${scanned.pts.length} columns solved)${scanned.q ? ", then a bracketing secant search" : scanned.unsolved?.length ? `: the specification is crossed between ${scanned.unsolved.map(([a, b]) => `${fmt(a.values[0])} and ${fmt(b.values[0])}`).join(", ")}, but the columns between could not be solved` : ": no value meets the specification"}`);
    if (scanned.q) done = scanned.q;
  }
  if (!done) throw refusal();

  // ---- the solution
  const r = done.r;
  const specifications = design.map((d, k) => ({
    kind: d.kind, ...(d.product ? { product: d.product } : {}), ...(d.draw ? { draw: d.draw } : {}), ...(d.stage ? { stage: d.stage } : {}),
    ...(d.i != null ? { component: d.i, component_name: names[d.i] } : {}), ...(d.basis ? { basis: d.basis } : {}), unit: d.unit,
    asked: d.value, achieved: done.a[k], error: done.a[k] - d.value, scaled_residual: done.g[k], met: true, label: d.label,
  }));
  const adjusted = vars.map((v, k) => ({ variable: v.name, ...(v.draw ? { draw: v.draw } : {}), value: done.values[k], ...(v.unit ? { unit: v.unit } : {}) }));
  const { sensitivities: _s, ...column } = r;
  return {
    ...column, specifications, adjusted,
    residuals: { ...r.residuals, design_specifications: Math.max(...done.g.map(Math.abs)) },
    tolerances: { ...r.tolerances, design_specifications: SPEC_TOLERANCE, units: { ...r.tolerances.units, design_specifications: "scaled (logit of a fraction, logarithm of a flow, K / 10)" } },
    solver: { ...r.solver, specifications: { method: "outer loop around the stage solver: Newton's method on the design specifications, its Jacobian from the converged column's own (implicit function theorem)" + (scanned?.q ? ", then a scan and a bracketing secant search" : ""),
      column_solves: solves, column_iterations: innerIterations, tried, tolerance: SPEC_TOLERANCE } },
  };

  // ---- the refusal: what was reached, and why no more
  function refusal() {
    const list = q => design.map((d, k) => `${d.label}: asked ${fmt6(d.value)}, reached ${fmt6(q.a[k])}`).join("; ");
    const at = q => vars.map((v, k) => varText(v, q.values[k])).join(", ");
    const details = { tried, specifications: design.map((d, k) => ({ label: d.label, asked: d.value, reached: best.a[k] })), at: Object.fromEntries(vars.map((v, k) => [v.name === "draw_rate" ? `draw_${v.draw}_rate` : v.name, best.values[k]])) };
    const fixedText = base.length ? ` with ${base.map(s => `${s.kind} ${fmt(s.value)}`).join(" and ")} given` : "";
    const azNote = product => azeotropeNear(product);
    if (m === 1 && scanned) {
      // the whole range of the one free variable was scanned: the specification's largest and smallest value
      const v = vars[0], d = design[0], pts = scanned.pts;
      if (pts.length >= 3) {
        const hi = pts.reduce((a, b) => (b.a[0] > a.a[0] ? b : a)), lo = pts.reduce((a, b) => (b.a[0] < a.a[0] ? b : a));
        if (d.value >= lo.a[0] && d.value <= hi.a[0]) {
          // the value lies inside the range the solved columns reach: the specification is not out of range, the
          // columns where it is met were not solved (EA-13, 2026-11-14: "cannot be 0.999 ... stays between 0.943249
          // and 1" was an OUT_OF_RANGE that contradicted itself)
          const crossed = (scanned.unsolved ?? []).map(([a, b]) => `between ${varText(v, a.values[0])} (${fmtReach(a.a[0])}) and ${fmt(b.values[0])}${v.unit ? ` ${v.unit}` : ""} (${fmtReach(b.a[0])})`);
          return fail("NO_CONVERGENCE", `Column: ${d.label} = ${fmt6(d.value)}${fixedText} lies inside the range the solved columns reach (${fmtReach(lo.a[0])} at ${fmt(lo.values[0])} to ${fmtReach(hi.a[0])} at ${fmt(hi.values[0])}${v.unit ? ` ${v.unit}` : ""}, ${pts.length} columns solved), but the stage solver did not converge on the columns where it is met${crossed.length ? ` (it is crossed ${crossed.join("; ")})` : ""}. This is not a statement that the specification cannot be met. Tried: ${tried.join("; ")}. The stage solver said: ${lastError?.message ?? "nothing"} What may help: a start nearer the answer (give ${varName(v).replace(/^the /, "")} near the crossing as a specification first and use that column's result as a start), more iterations (max_iterations), or a specification a little further inside the range.`,
            { ...details, range: { variable: v.name, lowest: { value: lo.a[0], at: lo.values[0] }, highest: { value: hi.a[0], at: hi.values[0] } }, crossed: (scanned.unsolved ?? []).map(([a, b]) => ({ from: a.values[0], to: b.values[0], reached: [a.a[0], b.a[0]] })) });
        }
        const short = d.value > hi.a[0] ? hi : lo;
        let why, cure;
        const what = d.kind === "purity" ? "purer" : d.kind === "stage_temperature" ? "hotter" : "higher";
        if (d.value < lo.a[0] && d.kind !== "stage_temperature") {
          // every column solved gives more than asked (EA-19, 2026-11-20: the advice was "the reflux is too low" for a
          // purity that every column exceeded). The specification is exceeded, not out of reach: the column separates
          // more than asked even at the end of the range, which in a plant usually means a feed nearly free of what
          // the specification limits
          const end = edgeScan && edgeScan.side === (lo === pts[0] ? "low" : lo === pts.at(-1) ? "high" : null);
          const edgeText = end ? (edgeScan.complete ? `, the end of the range the search takes` : ` (the columns beyond it could not be solved)`) : "";
          // a product cannot be made less pure than the feed by a column that sends the other components to the
          // other product: say so when the feed itself is already purer than asked
          let feedText = "";
          if (d.kind === "purity" && (d.product === "bottoms" || d.product === "distillate")) {
            const z = d.basis === "mass" ? feed[d.i] * MW[d.i] / sum(feed.map((f, k) => f * MW[k])) : feed[d.i] / F;
            if (z >= d.value) feedText = ` The column's feed itself is ${fmtReach(z)} ${names[d.i]} (${d.basis ?? "mole"} fraction), already purer than asked: a column that sends the other components ${d.product === "bottoms" ? "up" : "down"} cannot make its ${d.product} less pure than that.`;
          }
          why = `Every column solved is ${what} than asked; the least at ${varText(v, lo.values[0])}${edgeText}: the specification is exceeded, not out of reach.${feedText}`;
          cure = feedText ? `a purity above the feed's (within the range above), or a flow specification (distillate or bottoms flow) in place of this one; in a flowsheet, a feed this pure is the state of the loop, so check what feeds the column`
            : base.length
            ? `${d.kind === "purity" ? "a purer specification (above the range), " : "a specification within the range above, "}${base.map(q => q.kind).includes("reflux_ratio") ? "a smaller reflux_ratio, " : ""}fewer stages, or a flow specification (distillate or bottoms flow) in place of this one; in a flowsheet, check the column's feed: one nearly free of the other components makes any purity near 1 met by a trace of distillate`
            : "a specification within the range above, or other values of the specifications given with it";
        } else if (v.name === "distillate_rate" && base.some(s => s.kind === "reflux_ratio" || s.kind === "condenser_duty" || s.kind === "boilup_ratio" || s.kind === "reboiler_duty")) {
          const s = base[0];
          why = `With ${s.kind} fixed at ${fmt(s.value)}, no distillate flow gives it: the ${s.kind.replace("_", " ")} is too low for this specification on ${prob.N} stages (below the minimum reflux for it), or the stages are too few.`;
          cure = `a larger ${s.kind} (or leave it free: give the distillate or bottoms flow, or a second design specification, in its place), more stages, or a specification within the range above`;
        } else if (v.name.endsWith("_ratio")) {
          why = short.values[0] >= 0.5 * v.grid.at(-1)
            ? `Even at ${varText(v, short.values[0])}, close to total reflux, ${prob.N} stages do not reach it: the stages are too few, or an azeotrope or a pinch is in the way.`
            : `No ${v.name.replace("_", " ")} between ${fmt(v.grid[0])} and ${fmt(v.grid.at(-1))} gives it with the other specification as given.`;
          cure = "more stages, another feed stage, another value of the other specification, or a specification within the range above";
        } else {
          why = `No ${varName(v).replace(/^the /, "")} between ${fmt(pts[0].values[0])} and ${fmt(pts.at(-1).values[0])} ${v.unit} gives it.`;
          cure = "a specification within the range above, or other values of the specifications given with it";
        }
        const az = azNote(d.product);
        return fail("OUT_OF_RANGE", `Column: ${d.label} cannot be ${fmt6(d.value)} in this column${fixedText}: over the whole range of ${varName(v)} (${fmt(pts[0].values[0])} to ${fmt(pts.at(-1).values[0])}${v.unit ? ` ${v.unit}` : ""}, ${pts.length} columns solved) it stays between ${fmtReach(lo.a[0])} (at ${fmt(lo.values[0])}) and ${fmtReach(hi.a[0])} (at ${fmt(hi.values[0])}). ${why}${az} What would make it feasible: ${cure}.`,
          { ...details, range: { variable: v.name, lowest: { value: lo.a[0], at: lo.values[0] }, highest: { value: hi.a[0], at: hi.values[0] } } });
      }
    }
    if (m >= 2 && !opts.__probe && vars.some(v => v.name === "reflux_ratio")) {
      // near total reflux, with all the specifications but one met: does the one left reach its value?
      const shortOf = [];
      let feasible = true;
      const wanted = (opts.specs ?? []).filter(q => DESIGN_SPECS.includes(q?.kind));
      for (let k = 0; k < design.length; k++) {
        const d = design[k], rest = design.filter((_, e) => e !== k);
        const withRest = rest.length ? ` with ${rest.map(q => q.label).join(" and ")} met` : "";
        const at = R => {
          try { return { a: achieved(solveSpecified({ ...opts, specs: [...base, { kind: "reflux_ratio", value: R }, ...wanted.filter((_, e) => e !== k)], start: best?.r ?? null, __probe: true }, solve, th), d) }; }
          catch (e) { if (!e?.code) throw e; return { error: e }; }
        };
        const hi = at(REFLUX_PROBE);
        if (hi.error) {
          // the other specifications cannot be met even alone, near total reflux: their range says how far they get
          feasible = false;
          const rg = hi.error.details?.range, q = rest[0];
          if (hi.error.code === "OUT_OF_RANGE" && rg && rest.length === 1) {
            const reach = Math.abs(rg.highest.value - q.value) < Math.abs(rg.lowest.value - q.value) ? rg.highest.value : rg.lowest.value;
            const text = `${q.label}: asked ${fmt6(q.value)}, but at a reflux ratio of ${REFLUX_PROBE} it reaches ${fmt6(reach)} at most, whatever the distillate flow`;
            if (!shortOf.includes(text)) shortOf.push(text);
          }
          continue;
        }
        const lo = at(REFLUX_PROBE / 10);
        const within = lo.a != null && (d.value - lo.a) * (d.value - hi.a) <= 0;
        const approaching = lo.a == null || Math.abs(scaled(d, hi.a)) < Math.abs(scaled(d, lo.a));
        if (!within && approaching) shortOf.push(`${d.label}: asked ${fmt6(d.value)}, but at a reflux ratio of ${REFLUX_PROBE}${withRest} it reaches ${fmt6(hi.a)}${lo.a != null ? ` (${fmt6(lo.a)} at a reflux ratio of ${REFLUX_PROBE / 10})` : ""}`);
        if (!within) feasible = false;
      }
      if (shortOf.length) {
        const az = [...new Set(design.map(d => d.product).filter(Boolean))].map(azNote).join("");
        return fail("OUT_OF_RANGE", `Column: these specifications cannot be met together on ${prob.N} stages${fixedText}. ${shortOf.join("; ")}. More reflux hardly changes that (a reflux ratio of ${REFLUX_PROBE} is close to total reflux): the stages are too few for both, or an azeotrope or a pinch is in the way.${az} What would make it feasible: more stages, another feed stage, or less strict specifications (the values reached above are the limit for this column).`,
          { ...details, near_total_reflux: shortOf });
      }
      if (feasible) tried.push(`near total reflux (reflux ratios ${REFLUX_PROBE / 10} and ${REFLUX_PROBE}) each specification brackets its value, so the specifications look feasible`);
    }
    const limit = run?.atLimit?.some(Boolean) ? ` ${run.why[0].toUpperCase()}${run.why.slice(1)}: the specifications ask for a column outside the ratios and flows the solver takes (ratios ${RATIO_RANGE[0]} to ${RATIO_RANGE[1]}).` : "";
    return fail("NO_CONVERGENCE", `Column: the design specifications were not met. Closest: ${list(best)}, at ${at(best)}.${limit} Tried: ${tried.join("; ")}.${lastError ? ` The stage solver's last refusal at a trial point: ${lastError.message.slice(0, 400)}` : ""} This does not show that the specifications cannot be met: try other specifications of the same column (a purity with a product flow, or with a reflux ratio), more stages or another feed stage.`,
      details);
  }

  /** An azeotrope of the method near the product the closest column made (named in a refusal). */
  function azeotropeNear(product) {
    const sys = opts.sys, P = opts.P_kPa;
    if (!sys || !(P > 0) || !best || !["distillate", "bottoms"].includes(product) || decanter) return "";
    try {
      const f = best.r.products[product].flows, x = f.map(v => v / sum(f));
      const a = findAzeotrope(sys, x, P);
      if (!a) return "";
      if (Math.max(...a.x.map((v, i) => Math.abs(v - x[i]))) > 0.15) return "";
      return ` By this method the mixture has an azeotrope at ${names.map((nm, i) => `${nm} ${fmt(a.x[i])}`).join(", ")} (${fmt(a.T)} K at ${fmt(P)} kPa), near the ${product} reached (${names.map((nm, i) => `${nm} ${fmt(x[i])}`).join(", ")}): distillation does not cross an azeotrope.`;
    } catch { return ""; }
  }
}

/** A first distillate flow from the specifications' own material balance (only a start). */
function estimateDistillate({ design, feed, F }, th, Dmax) {
  let order = null;
  const beyond = (i, up) => {
    // the feed of the components more (up) or less volatile than i at the feed's bubble point
    try {
      if (!order) { const z = feed.map(v => v / F), T = th.bubbleT(z); order = th.lnK(z, z, T); }
      return sum(feed.filter((_, k) => k !== i && (up ? order[k] > order[i] : order[k] <= order[i])));
    } catch { return 0; }
  };
  const ends = d => d.product !== "side_draw";
  const pur = design.find(d => d.kind === "purity" && ends(d)), rec = design.find(d => d.kind === "recovery" && ends(d));
  const flow = design.find(d => d.kind === "component_flow" && ends(d) && d.basis === "mole");
  // the flow of the product a specification names, then the distillate
  let of = null, product = null;
  if (pur && rec && pur.i === rec.i && pur.product === rec.product) { of = rec.value * feed[pur.i] / pur.value; product = pur.product; }
  else if (pur && pur.value >= 0.5) { of = 0.97 * feed[pur.i] / pur.value; product = pur.product; }
  else if (rec) { of = rec.value * feed[rec.i] + beyond(rec.i, rec.product !== "bottoms"); product = rec.product; }
  else if (flow) { of = flow.value + beyond(flow.i, flow.product !== "bottoms"); product = flow.product; }
  let D = of == null ? 0.5 * Dmax : product !== "bottoms" ? of : Dmax - of;
  if (!(D > 0)) D = 0.5 * Dmax;
  return Math.min(Math.max(D, 0.03 * Dmax), 0.97 * Dmax);
}

/** Gaussian elimination with partial pivoting (a small dense system); null when singular. */
function linearSolve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (!(Math.abs(M[p][c]) > 1e-14)) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x.every(Number.isFinite) ? x : null;
}

/** A design specification's value in a solved column (proposal 0028: the MESH form's check, the outer loop's own). */
function achievedIn(r, d, feed, MW) {
  if (d.kind === "stage_temperature") return r.stages[d.stage - 1].T_K;
  if (d.kind === "flow_ratio") return flowInResult(r, d.num, feed) / flowInResult(r, d.den, feed);
  const f = d.product === "distillate" ? r.products.distillate.flows : d.product === "vapour_distillate" ? r.products.vapour_distillate.flows
    : d.product === "bottoms" ? r.products.bottoms.flows : r.products.draws[d.draw - 1].flows;
  if (d.kind === "component_ratio") return d.basis === "mass" ? f[d.i] * MW[d.i] / (f[d.k] * MW[d.k]) : f[d.i] / f[d.k];
  if (d.kind === "recovery") return f[d.i] / feed[d.i];
  if (d.kind === "component_flow") return d.basis === "mass" ? f[d.i] * MW[d.i] / 1000 : f[d.i];
  return d.basis === "mass" ? f[d.i] * MW[d.i] / sum(f.map((v, k) => v * MW[k])) : f[d.i] / sum(f);
}
/** The scaled residual of a design specification (see the file header). */
function scaledOf(d, a) {
  return d.kind === "stage_temperature" ? (a - d.value) / 10 : ["component_flow", "component_ratio", "flow_ratio"].includes(d.kind) ? Math.log(Math.max(a, 1e-300) / d.value) : logit(a) - logit(d.value);
}
/** A design specification as the result lists it. */
function specEntry(d, a, g, names) {
  const where = d.kind === "stage_temperature" ? { stage: d.stage } : d.kind === "flow_ratio" ? { numerator: d.num, denominator: d.den }
    : { product: d.product, ...(d.draw ? { draw: d.draw } : {}), component: d.i, component_name: names[d.i], ...(d.k != null ? { relative_to: d.k, relative_to_name: names[d.k] } : {}), ...(d.basis ? { basis: d.basis } : {}) };
  return { kind: d.kind, ...where, unit: d.unit, asked: d.value, achieved: a, error: a - d.value, scaled_residual: g, met: true, label: d.label };
}
/** One of the column's flows in a solved column (flow_ratio; proposal 0029, step 5), mol/s. */
function flowInResult(r, t, feed) {
  const N = r.stages.length, D = sum(r.products.distillate.flows) + (r.products.vapour_distillate ? sum(r.products.vapour_distillate.flows) : 0);
  switch (t.flow) {
    case "reflux": return r.stages[0].L_mol_s;
    case "distillate": return D;
    case "vapour_distillate": return sum(r.products.vapour_distillate.flows);
    case "bottoms": return sum(r.products.bottoms.flows);
    case "boilup": return r.stages[N - 1].V_mol_s;
    case "feed": return sum(feed);
    default: return sum(r.products.draws[t.draw - 1].flows);
  }
}
/** The free variable's value in a solved column, as the outer loop names it (proposal 0028: the MESH form's
 *  `adjusted`, which the next restart starts from): the reflux ratio (with the vapour + liquid condenser L1 / U1), the
 *  whole distillate flow, the boil-up ratio. */
function freeValueOf(r, name, condenser) {
  const top = r.stages[0], bot = r.stages[r.stages.length - 1], vl = condenser === "vapour_liquid";
  const D = sum(r.products.distillate.flows) + (vl ? sum(r.products.vapour_distillate.flows) : 0), B = sum(r.products.bottoms.flows);
  if (name === "reflux_ratio") return top.L_mol_s / (vl ? top.U_mol_s : D);
  if (name === "distillate_rate") return D;
  return bot.V_mol_s / B;
}
