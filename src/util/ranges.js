/**
 * Records used outside their range: calculate and warn, or refuse (the maintainer, 2026-11-13;
 * docs/decisions/2026-11-13-03-extrapolation-policy.md).
 *
 * "Strict data, lenient use": a record (a temperature correlation, a pair set, a Henry constant, a solubility curve, a
 * chart) keeps the range it was fitted or read over; outside it the engine continues the record in a physically safe
 * form and says so, in a warning that names the component, the property, the record's range, how far outside and how
 * it was continued ("This is an extrapolation, not data."). What still refuses: physically impossible states, a value
 * that the continuation makes non-physical (negative, non-finite), a property with no record at all, and solvers that
 * do not converge.
 *
 * The strict mode (`strictRanges: true`) restores the refusals of before 2026-11-13 for anyone who wants them. It is a
 * setting of the whole calculation, held here while a calculation runs (`withRangePolicy`); the default is lenient.
 *
 * Notes: the place that continues a record calls `noteExtrapolation`; a caller that wants them (a flowsheet block, a
 * unit, a property table) wraps its calculation in `collectExtrapolations`. A note is kept once per component,
 * property and side, at the farthest distance reached.
 */
import { failRange } from "./errors.js";

let strict = false;

/** True when records refuse outside their range (the strict mode), false when they are continued with a warning. */
export const strictRanges = () => strict;

/**
 * Run fn with a range policy: { strictRanges: true } refuses outside a record's range, false (the default) continues
 * with a warning. Without the option the policy in force is kept (a nested calculation inherits it).
 */
export function withRangePolicy(opts, fn) {
  if (opts?.strictRanges === undefined) return fn();
  const before = strict;
  strict = !!opts.strictRanges;
  try { return fn(); } finally { strict = before; }
}

/** Set the policy for every later calculation (the command line, a notebook); returns the previous one. */
export function setStrictRanges(on) {
  const before = strict;
  strict = !!on;
  return before;
}

const collectors = [];

/** "Vapour pressure" → "vapour pressure" after a component's name; "IAPWS-IF97 ...", "Henry's law ..." stay. */
const COMMON = /^(Vapour|Liquid|Ideal-gas|Heat|Solid|Surface|Thermal|Viscosity|Solubility|Density|Correlation)\b/;
const lowerFirst = t => (COMMON.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
const fmtT = T => String(+Number(T).toFixed(2));

/**
 * The text of a note: what was continued, where, how far and how.
 * @param {{component?:string, property:string, Tmin_K?:number, Tmax_K?:number, T_K:number, how:string,
 *          unit?:string, value?:number, lo?:number, hi?:number}} n
 */
export function extrapolationMessage(n) {
  const unit = n.unit ?? "K";
  const lo = n.lo ?? n.Tmin_K, hi = n.hi ?? n.Tmax_K, at = n.value ?? n.T_K;
  const side = at < lo ? "below" : "above";
  const d = side === "below" ? lo - at : at - hi;
  const f = unit === "K" ? fmtT : v => String(+Number(v).toPrecision(4));
  const who = n.component ? `${n.component}: ` : "";
  const what = n.component ? lowerFirst(n.property) : n.property;
  const u = unit ? ` ${unit}` : "";
  return `${who}${what} at ${f(at)}${u} is ${f(d)}${u} ${side} its range (${f(lo)}-${f(hi)}${u}): ${n.how}. This is an extrapolation, not data.`;
}

/**
 * Record that a record was used outside its range. Fields: component (name, or null), property (its label), lo / hi
 * (the record's range), value (where it was used), unit ("K" by default), how (the continuation, a phrase). In the
 * strict mode it throws instead (OUT_OF_RANGE), with the same text and `strict` named.
 */
export function noteExtrapolation(n) {
  const lo = n.lo ?? n.Tmin_K, hi = n.hi ?? n.Tmax_K, at = n.value ?? n.T_K;
  if (strict) {
    const u = (n.unit ?? "K") ? ` ${n.unit ?? "K"}` : "";
    throw failRange("OUT_OF_RANGE", `${n.component ? `${n.component}: ` : ""}${n.component ? lowerFirst(n.property) : n.property}: ${fmtT(at)}${u} is outside its range (${fmtT(lo)}-${fmtT(hi)}${u}); the strict range mode (strictRanges) refuses to extrapolate.`,
      { component: n.component ?? null, property: n.property, range: [lo, hi], at });
  }
  if (!collectors.length) return;
  const side = at < lo ? "below" : "above";
  const distance = side === "below" ? lo - at : at - hi;
  const note = { component: n.component ?? null, property: n.property, unit: n.unit ?? "K", range: [lo, hi], at, side, distance, how: n.how,
    ...(n.kind ? { kind: n.kind } : {}) };
  for (const c of collectors) {
    const key = `${note.component}|${note.property}|${side}`;
    const had = c.get(key);
    if (!had || distance > had.distance) c.set(key, note);
  }
}

/**
 * Run fn and gather the notes of the records it used outside their range.
 * @returns {{value:any, extrapolations:object[]}}  each note with its `message`
 */
export function collectExtrapolations(fn) {
  const c = new Map();
  collectors.push(c);
  try {
    const value = fn();
    return { value, extrapolations: [...c.values()].map(withMessage) };
  } finally {
    collectors.splice(collectors.lastIndexOf(c), 1);
  }
}

/** Run fn without recording notes (a search that probes far states; its answer is checked where it is used). */
export function quietly(fn) {
  const saved = collectors.splice(0, collectors.length);
  try { return fn(); } finally { collectors.push(...saved); }
}

const withMessage = n => ({ ...n, message: extrapolationMessage({ ...n, lo: n.range[0], hi: n.range[1], value: n.at }) });

/**
 * Merge notes from several places (blocks of a flowsheet, stages of a column): one per component, property and side,
 * at the farthest distance, with the places where it happened.
 * @param {Array<{where:string, notes:object[]}>} groups
 * @returns {object[]}  { component, property, range, at, side, distance, how, where: string[], message, short }
 */
export function mergeExtrapolations(groups) {
  const m = new Map();
  for (const { where, notes } of groups) {
    for (const n of notes ?? []) {
      const key = `${n.component}|${n.property}|${n.side}`;
      const had = m.get(key);
      if (!had) m.set(key, { ...n, where: where != null ? [where] : [] });
      else {
        if (where != null && !had.where.includes(where)) had.where.push(where);
        if (n.distance > had.distance) Object.assign(had, { ...n, where: had.where });
      }
    }
  }
  return [...m.values()].map(n => {
    const full = extrapolationMessage({ ...n, lo: n.range[0], hi: n.range[1], value: n.at });
    const places = n.where.length ? ` Where: ${n.where.join(", ")}.` : "";
    return { ...n, message: `${full}${places}`,
      short: `${n.component ? `${n.component}: ` : ""}${n.component ? lowerFirst(n.property) : n.property} extrapolated ${(n.unit ?? "K") === "K" ? fmtT(n.distance) : Number(n.distance).toPrecision(3)}${(n.unit ?? "K") ? ` ${n.unit ?? "K"}` : ""} ${n.side} its range` };
  });
}
