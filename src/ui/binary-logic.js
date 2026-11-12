/**
 * What the binary diagrams draw beside their bubble and dew curves (proposal 0021, answer 7): the measured
 * vapour-liquid points of the pair, and the x-y, activity-coefficient and relative-volatility curves.
 *
 * Every model value comes from the system's own bubble point (`sys.bubbleT` at a pressure, `sys.bubbleP` at a
 * temperature), with the method and the parameter sets in use; the relative volatility is the ratio of the K-values
 * of those results, (y1/x1) / (y2/x2), nothing else is calculated here. Every measured value is a row of a data file
 * (src/thermo/measured.js). DOM-free (test/binary-diagrams.test.js).
 */
import { measuredVle } from "../thermo/measured.js";

/** The plots of a binary diagram: the phase diagram itself (T-x-y or P-x-y), then the three read from the same curve. */
export const BINARY_PLOTS = [
  { id: "phase", label: null },
  { id: "xy", label: "x-y", title: "Vapour against liquid composition, with the diagonal y = x" },
  { id: "gamma", label: "γ", title: "Activity coefficients of both components against the liquid composition" },
  { id: "alpha", label: "α", title: "Relative volatility of the first component to the second against the liquid composition" },
];
export const checkBinaryPlot = v => (BINARY_PLOTS.some(p => p.id === v) ? v : "phase");

/** A set is drawn on a T-x-y when its pressure is within this fraction of the diagram's (101.0 and 101.33 kPa on a
 *  diagram at 101.325 kPa: 0.5 % in pressure moves a boiling temperature by about 0.15 K). */
export const P_MATCH = 0.005;
/** A point is drawn on a P-x-y when its temperature is within this of the diagram's (docs/DATA_RULES.md, section 5:
 *  a set whose temperature drifts by 0.5 K or less is one isotherm). */
export const T_MATCH_K = 0.5;
/** The relative volatility at the two ends is read this close to the pure components, where y/x is still a number. */
export const END_X = 1e-6;

const engineError = e => !!(e && e.code);

/**
 * The curve of a binary system at a pressure (`{ P_kPa }`: bubble temperatures) or a temperature (`{ T_K }`: bubble
 * pressures), at n liquid compositions evenly spaced in mole fraction.
 * @returns {{points:({x:number, y:number, T:number, P:number, gamma:number[]|null, alpha:number|null}|null)[],
 *   missed:number, error:Error|null}}  x and y of the first component; gamma [γ1, γ2] with an activity model, null with
 *   an equation of state; alpha = (y1/x1)/(y2/x2), at the ends read at END_X from the pure component; a point the
 *   engine found no bubble point for is null (`missed` of them, `error` the first reason).
 */
export function binaryCurve(sys, at, n = 101) {
  const isobaric = at.P_kPa != null;
  const solve = x => (isobaric ? sys.bubbleT([x, 1 - x], at.P_kPa) : sys.bubbleP([x, 1 - x], at.T_K));
  const alphaOf = (x, y) => (y / x) / ((1 - y) / (1 - x));
  const points = [];
  let missed = 0, error = null;
  for (let k = 0; k < n; k++) {
    const x = k / (n - 1);
    try {
      const r = solve(x);
      let alpha;
      if (k === 0 || k === n - 1) { const xe = k === 0 ? END_X : 1 - END_X; alpha = alphaOf(xe, solve(xe).y[0]); } else alpha = alphaOf(x, r.y[0]);
      points.push({ x, y: r.y[0], T: isobaric ? r.T : at.T_K, P: isobaric ? at.P_kPa : r.P, gamma: r.gamma ? [r.gamma[0], r.gamma[1]] : null, alpha: Number.isFinite(alpha) ? alpha : null });
    } catch (e) {
      if (!engineError(e)) throw e;
      missed++; error ??= e; points.push(null);
    }
  }
  return { points, missed, error };
}

/**
 * The curves of a plot from the points of binaryCurve: [{ key, points: [{ x, y } | null] }], x the liquid mole
 * fraction of the first component, y the plotted quantity as the engine gave it.
 *  - "xy": y1 against x1 (the diagonal is drawn by the view);
 *  - "gamma": γ1 and γ2 (empty with an equation of state, which has no activity coefficients);
 *  - "alpha": α12.
 */
export function plotCurves(plot, points) {
  const pick = f => points.map(p => { const v = p ? f(p) : null; return v == null || !Number.isFinite(v) ? null : { x: p.x, y: v }; });
  if (plot === "xy") return [{ key: "y", points: pick(p => p.y) }];
  if (plot === "gamma") return points.some(p => p?.gamma) ? [{ key: "gamma1", points: pick(p => p.gamma?.[0]) }, { key: "gamma2", points: pick(p => p.gamma?.[1]) }] : [];
  if (plot === "alpha") return [{ key: "alpha", points: pick(p => p.alpha) }];
  throw new Error(`Unknown plot "${plot}". Known: xy, gamma, alpha.`);
}

const base = file => file.split("/").pop();
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A sentence of a source text from `from` on: up to the full stop that ends it (not one inside a number). */
const sentence = (text, from) => { const m = /^(.*?)\.(?=\s+[A-Z(]|\s*$)/s.exec(text.slice(from)); return (m ? m[1] : text.slice(from)).trim(); };

/**
 * What the parameter set in use did with a data file, read from the set's own record (its `source` text, which names
 * the file it was fitted to and the files it was compared with; validation/python/fit_parameters.py writes it):
 *  - "fitted": the set was fitted to this file; `record` is the fit's stated deviation ("AAD 0.12 K in T, ...");
 *  - "check": the fit compared its result with this file and did not fit it; `record` is that comparison;
 *  - "unused": the set's record does not name the file.
 * A set that was not fitted by CHEPTA (a databank set, a prediction, no parameters) names no file: every set of the
 * pair is then "unused", and the view says the model was not fitted to it.
 */
export function setRole(file, sourceText) {
  const text = String(sourceText ?? ""), name = base(file);
  if (!text.includes(name)) return { role: "unused", record: null };
  const check = new RegExp(`Check against (?:validation/data/)?(?:[a-z]+/)?${escapeRe(name)}:\\s*`).exec(text);
  if (check) return { role: "check", record: sentence(text, check.index + check[0].length) };
  const own = text.indexOf("Check against") < 0 ? text : text.slice(0, text.indexOf("Check against"));
  const aad = own.lastIndexOf("AAD ");
  return { role: "fitted", record: aad < 0 ? null : sentence(own, aad) };
}

const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

/**
 * The model's deviation from measured points, each at its own measured condition: at a point's pressure the bubble
 * temperature (`isobaric`), or at its temperature the bubble pressure, of its liquid composition.
 * @returns {{n:number, failed:number, dT_K:number|null, dP_percent:number|null, dy:number|null, ny:number}}
 *   mean absolute deviations: of T in K or of P in % of the measured pressure, and of y (over the `ny` points that
 *   have one); `n` points with a liquid composition compared, `failed` where the engine found no bubble point.
 */
export function modelDeviation(sys, points, isobaric) {
  const dT = [], dP = [], dy = [];
  let failed = 0;
  for (const p of points) {
    if (p.x == null) continue;
    try {
      const r = isobaric ? sys.bubbleT([p.x, 1 - p.x], p.P) : sys.bubbleP([p.x, 1 - p.x], p.T);
      if (isobaric) dT.push(Math.abs(r.T - p.T)); else dP.push(100 * Math.abs(r.P - p.P) / p.P);
      if (p.y != null) dy.push(Math.abs(r.y[0] - p.y));
    } catch (e) { if (!engineError(e)) throw e; failed++; }
  }
  return { n: isobaric ? dT.length : dP.length, failed, dT_K: mean(dT), dP_percent: mean(dP), dy: mean(dy), ny: dy.length };
}

const round = (v, d) => +v.toFixed(d);
const span = (vals, d, unit) => { const lo = Math.min(...vals), hi = Math.max(...vals); return round(lo, d) === round(hi, d) ? `${round(lo, d)} ${unit}` : `${round(lo, d)} to ${round(hi, d)} ${unit}`; };

/**
 * The measured sets of the pair `ids` for a diagram at a pressure (`{ P_kPa }`, a T-x-y: the isobaric sets within
 * P_MATCH of it and the points of the T-P-x sets at that pressure) or at a temperature (`{ T_K }`, a P-x-y: the
 * points within T_MATCH_K of it).
 * @param {string[]} ids        the two components, in the diagram's order
 * @param {{P_kPa?:number, T_K?:number}} at
 * @param {string|null} sourceText  the `source` of the parameter set in use (setRole), null when the model has none
 * @returns {{drawn:object[], elsewhere:object[], total:number}}
 *   drawn: [{ file, kind, source, role, record, points, of, condition }] with the points at the diagram's condition
 *   (`of`: how many the set has in all); elsewhere: the sets with no point here, each with `condition` (text) and
 *   `go` (the patch that draws it: { view, P_kPa } or { view, T_K }; null for scattered T-P-x points);
 *   total: the sets of the pair. Nothing is drawn for a pair without data: drawn and elsewhere are empty.
 */
export function measuredFor(ids, at, sourceText = null) {
  const isobaric = at.P_kPa != null;
  const sets = measuredVle(ids[0], ids[1]);
  const drawn = [], elsewhere = [];
  for (const s of sets) {
    const fixedP = s.kind.startsWith("isobaric"), fixedT = s.kind.startsWith("isothermal");
    const here = isobaric
      ? (fixedT ? [] : s.points.filter(p => Math.abs(p.P - at.P_kPa) <= P_MATCH * at.P_kPa))
      : (fixedP ? [] : s.points.filter(p => Math.abs(p.T - at.T_K) <= T_MATCH_K));
    const Ts = s.points.map(p => p.T), Ps = s.points.map(p => p.P);
    const info = { file: s.file, kind: s.kind, source: s.source, ...setRole(s.file, sourceText), of: s.points.length };
    if (here.length) {
      drawn.push({ ...info, points: here, condition: isobaric ? span(here.map(p => p.P), 2, "kPa") : span(here.map(p => p.T), 2, "K") });
    } else if (fixedP) {
      elsewhere.push({ ...info, condition: `${span(Ps, 2, "kPa")}, ${span(Ts, 1, "K")}`, go: { view: "txy", P_kPa: s.P_kPa ?? Ps[0] } });
    } else if (fixedT) {
      // the isotherms of the set (a file may hold several): one entry each
      const iso = [];
      for (const p of s.points) { const g = iso.find(q => Math.abs(q.T - p.T) <= T_MATCH_K); if (g) g.n++; else iso.push({ T: p.T, n: 1 }); }
      for (const g of iso) elsewhere.push({ ...info, of: g.n, condition: `${round(g.T, 2)} K, ${span(Ps, 1, "kPa")}`, go: { view: "pxy", T_K: g.T } });
    } else {
      elsewhere.push({ ...info, condition: `${span(Ts, 1, "K")}, ${span(Ps, 1, "kPa")} (single points)`, go: null });
    }
  }
  return { drawn, elsewhere, total: sets.length };
}

/** What a role means, in the words of the legend; `fittedModel`: the parameter set in use was fitted by CHEPTA. */
export function roleText(role, fittedModel) {
  if (!fittedModel) return "comparison: the parameters in use were not fitted to it";
  return role === "fitted" ? "fitted: the parameters in use were fitted to this set"
    : role === "check" ? "compared, not fitted: a fit takes one set (the data rules choose it: isobaric T-x-y near 101.3 kPa that passes the consistency test first); this one was compared with the result"
      : "not used by the parameter set in use: its record does not name this set";
}
