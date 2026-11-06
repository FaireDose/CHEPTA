/**
 * Measured solubility curves (proposal 0015, Part I, section 5): the mole fraction x_sat(T) of a solid in its saturated
 * solution in one named solvent, from measured data, used by src/equilibrium/sle.js in place of the melting-point
 * equation, only inside the measured temperatures (refused outside them, OUT_OF_RANGE).
 *
 * A record (components.json "solubility", or the user's own in My data, tier "user"):
 *   { solvent, equation: "apelblat", A, B, C, Tmin_K, Tmax_K, source, tier }       ln x = A + B/T + C ln T
 *   { solvent, equation: "points", points: [[T_K, x], ...], source, tier }          ln x linear in 1/T between points
 *
 * The apparent enthalpy of solution is the van't Hoff slope of the curve, dH_sol = -R d ln x / d(1/T):
 * R (C T - B) for the Apelblat form, the slope of the segment for points. It closes the solid's energy balance
 * (h_solid = h_liquid - dH_sol, src/equilibrium/sle.js, solidHeat): an ideal-solution reading of the curve, which is
 * the measured route where no enthalpy of fusion is known.
 */
import { failRange, fail } from "../util/errors.js";

const R = 8.314462618;
export const CURVE_EQUATIONS = ["apelblat", "points"];

const fmt = v => +Number(v).toPrecision(5);

/** The temperature range of a curve. */
export function curveRange(rec) {
  if (rec.equation === "points") return [rec.points[0][0], rec.points[rec.points.length - 1][0]];
  return [rec.Tmin_K, rec.Tmax_K];
}

function inRange(rec, T, name) {
  const [lo, hi] = curveRange(rec);
  if (!(T >= lo - 1e-9 && T <= hi + 1e-9)) {
    throw failRange("OUT_OF_RANGE", `${name}: its measured solubility in ${rec.solvent} covers ${fmt(lo)}-${fmt(hi)} K (${rec.tier === "user" ? "your own curve" : "the curve's measured temperatures"}); at ${fmt(T)} K it is not known, and a curve is not extrapolated.`);
  }
}

function segment(rec, T) {
  const p = rec.points;
  let k = 0;
  while (k < p.length - 2 && T > p[k + 1][0]) k++;
  const [T0, x0] = p[k], [T1, x1] = p[k + 1];
  const slope = (Math.log(x1) - Math.log(x0)) / (1 / T1 - 1 / T0);   // d ln x / d(1/T)
  return { lnx: Math.log(x0) + slope * (1 / T - 1 / T0), slope };
}

/** x_sat at T (K), inside the curve's range. */
export function curveSolubility(rec, T, name = "the solid") {
  inRange(rec, T, name);
  if (rec.equation === "apelblat") return Math.exp(rec.A + rec.B / T + rec.C * Math.log(T));
  if (rec.equation === "points") return Math.exp(segment(rec, T).lnx);
  throw fail("BAD_INPUT", `${name}: unknown solubility-curve equation "${rec.equation}". Known: ${CURVE_EQUATIONS.join(", ")}.`);
}

/** The apparent enthalpy of solution (J/mol) at T, from the curve's van't Hoff slope. */
export function curveSolutionEnthalpy(rec, T, name = "the solid") {
  inRange(rec, T, name);
  if (rec.equation === "apelblat") return R * (rec.C * T - rec.B);
  return -R * segment(rec, T).slope;
}

/**
 * A curve record, checked (for My data): throws BAD_INPUT naming the problem.
 * @param {object} r
 * @param {(s:any, what:string)=>object} sourceOf  the user-data source check
 * @param {string} what
 */
export function checkCurve(r, sourceOf, what) {
  const isObj = v => v != null && typeof v === "object" && !Array.isArray(v);
  const bad = m => fail("BAD_INPUT", `user data: ${what}: ${m}`);
  if (!isObj(r)) throw bad("a solubility curve is { solvent, equation: \"points\", points: [[T_K, x], ...], source } or { solvent, equation: \"apelblat\", A, B, C, Tmin_K, Tmax_K, source }.");
  if (typeof r.solvent !== "string" || !r.solvent.trim()) throw bad("name the solvent the solubility was measured in (solvent).");
  const eq = r.equation ?? (r.points ? "points" : null);
  if (!CURVE_EQUATIONS.includes(eq)) throw bad(`equation must be one of ${CURVE_EQUATIONS.join(", ")} (got ${JSON.stringify(r.equation)}).`);
  const out = { solvent: r.solvent.trim(), equation: eq, tier: "user", source: sourceOf(r.source, what) };
  if (eq === "points") {
    if (!Array.isArray(r.points) || r.points.length < 2) throw bad("give at least two points [[T_K, x], ...].");
    const pts = r.points.map((p, k) => {
      if (!Array.isArray(p) || p.length !== 2 || !p.every(v => typeof v === "number" && Number.isFinite(v))) throw bad(`point ${k + 1} must be [T_K, x] (numbers).`);
      if (!(p[0] > 0) || !(p[1] > 0 && p[1] < 1)) throw bad(`point ${k + 1}: T must be positive and x between 0 and 1 (got ${JSON.stringify(p)}).`);
      return [p[0], p[1]];
    }).sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < pts.length; k++) if (!(pts[k][0] > pts[k - 1][0])) throw bad(`two points at ${pts[k][0]} K: give one value per temperature.`);
    out.points = pts;
  } else {
    for (const k of ["A", "B", "C", "Tmin_K", "Tmax_K"]) if (typeof r[k] !== "number" || !Number.isFinite(r[k])) throw bad(`${k} must be a number.`);
    if (!(r.Tmin_K > 0 && r.Tmax_K > r.Tmin_K)) throw bad("the range must be positive with Tmin_K < Tmax_K.");
    Object.assign(out, { A: r.A, B: r.B, C: r.C, Tmin_K: r.Tmin_K, Tmax_K: r.Tmax_K });
    const [lo, hi] = [curveSolubility(out, r.Tmin_K), curveSolubility(out, r.Tmax_K)];
    if (!(lo > 0 && lo < 1 && hi > 0 && hi < 1)) throw bad(`the curve gives x = ${fmt(lo)} and ${fmt(hi)} at the ends of its range; x must be between 0 and 1.`);
  }
  return out;
}
