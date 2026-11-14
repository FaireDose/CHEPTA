/**
 * Design specifications of a flowsheet (proposal 0022, steps 1 and 2; roadmap A8): vary one number of a block's
 * specification, within bounds, until a quantity of a stream or block reaches a value.
 *
 *   "designSpecs": [{
 *     "id": "DS1",
 *     "vary":   { "block": "F2", "key": "flow_kmol_h", "component": "water", "min": 0, "max": 500, "guess": 20 },
 *     "target": { "stream": "S7", "quantity": "component_flow_kmol_h", "component": "water", "value": 100 },
 *     "tolerance": 1e-6
 *   }]
 *
 * Solved as an outer loop around the sequential solver (src/flowsheet/flowsheet.js; the maintainer, 2026-11-13: the
 * outer loop, not inside the recycle loop): every evaluation is a whole flowsheet solve with its recycles converged, its
 * tear streams started from the previous solve's converged values (a warm start; retried once from the document's own
 * start when the warm start fails).
 *
 * One specification: the residual r(x) = target(x) - value is bracketed (the guess, a step of 1 % of max - min, then
 * doubling steps towards the side where |r| falls, at most `bracket` solves; then the bounds themselves, which also give
 * the message when there is no sign change), then Brent's method inside the bracket: inverse quadratic interpolation and
 * secant steps, bisection when they would leave the bracket (R. P. Brent, Algorithms for Minimization without
 * Derivatives, Prentice-Hall 1973, chapter 4; the same algorithm as scipy.optimize.brentq, BSD). It never leaves the
 * bracket, so never the bounds. At most `solve` solves.
 *
 * Several specifications: Broyden's method (Math. Comp. 19 (1965) 577) on the residuals scaled by their values, the
 * variables scaled to their bounds, started with a finite-difference Jacobian (one solve per specification, a step of
 * 1 % of each range) and kept inside the bounds by projection; a step that does not lower the residual is halved up to
 * three times, then the Jacobian is recomputed by finite differences once; at most `solve` iterations.
 *
 * Every failure throws (proposal 0022, section 3): BAD_INPUT for a malformed or conflicting specification, before
 * anything is solved; NO_CONVERGENCE with `reason` "unreachable" (no sign change between the bounds: the target at the
 * guess and at both bounds), "limit", "discontinuous", "undefined" (the target has no value there: a stream with no
 * flow), "no_effect", "singular" or "stalled"; an inner solve's own error keeps its code, with the specification and the
 * value where it happened. No partial answer is returned.
 *
 * Limits (proposal 0022, open question 2): solver.designSpecIterations, a number (the `solve` limit) or
 * { bracket: 8, solve: 50 }. Tolerance (open question 3, changed by the maintainer on 2026-11-14): relative to the value
 * asked (absolute for a mole or mass fraction and a vapour fraction, and where the value asked is 0); by default 1e-6, or
 * 100 times the recycle tolerance (solver.tolerance) where that is looser; any tolerance the person gives is used, with a
 * warning when it is tighter than 100 times the recycle tolerance.
 * Units: K, kPa, kmol/h, kg/h, kW.
 */
import { fail } from "../util/errors.js";
import { findComponent } from "../thermo/components.js";
import { molarMasses } from "../stream/stream.js";

export const DESIGN_SPEC_DEFAULTS = Object.freeze({ tolerance: 1e-6, bracket: 8, solve: 50 });
/** How much tighter than a specification the recycles must be converged (the maintainer, 2026-11-13). */
export const DESIGN_SPEC_TOLERANCE_RATIO = 100;

/** What may be varied, by block type and spec key: "flows" (a feed's component or total flow), "list" (one entry of a
 *  splitter's list), "number". Others are added when they are needed, each with a test (proposal 0022, section 1). */
export const VARIABLES = Object.freeze({
  feed: { flow_kmol_h: "flows", flow_kg_h: "flows", T_K: "number", P_kPa: "number" },
  splitter: { fractions: "list", flow_kmol_h: "list", flow_kg_h: "list" },
  heater: { T_K: "number", duty_kW: "number" },
  flash: { T_K: "number", P_kPa: "number", duty_kW: "number" },
});
/** The quantities a target may name. */
export const STREAM_QUANTITIES = ["flow_kmol_h", "flow_kg_h", "component_flow_kmol_h", "component_flow_kg_h", "mole_fraction", "mass_fraction", "T_K", "VF"];
export const BLOCK_QUANTITIES = ["duty_kW"];
const WITH_COMPONENT = new Set(["component_flow_kmol_h", "component_flow_kg_h", "mole_fraction", "mass_fraction"]);
const ABSOLUTE = new Set(["mole_fraction", "mass_fraction", "VF"]);
const SPEC_KEYS = ["id", "vary", "target", "tolerance", "label"];
const VARY_KEYS = ["block", "key", "component", "index", "min", "max", "guess"];
const TARGET_KEYS = ["stream", "block", "quantity", "component", "value", "ratio_of"];
const UNIT = { flow_kmol_h: "kmol/h", flow_kg_h: "kg/h", component_flow_kmol_h: "kmol/h", component_flow_kg_h: "kg/h", T_K: "K", P_kPa: "kPa", duty_kW: "kW", fractions: "" };

const fmt = v => (Number.isFinite(v) ? String(+v.toPrecision(6)) : "no value");
const isNum = v => typeof v === "number" && Number.isFinite(v);

/**
 * The limits of the outer loop from the flowsheet's solver settings.
 * @returns {{bracket:number, solve:number}}
 */
export function designSpecLimits(solver = {}) {
  const v = solver?.designSpecIterations;
  const out = { bracket: DESIGN_SPEC_DEFAULTS.bracket, solve: DESIGN_SPEC_DEFAULTS.solve };
  if (v == null) return out;
  const pos = (n, what) => {
    if (!(Number.isInteger(n) && n >= 1)) throw fail("BAD_INPUT", `solver.designSpecIterations${what} must be a positive whole number (got ${JSON.stringify(n)}).`);
    return n;
  };
  if (typeof v === "number") { out.solve = pos(v, ""); return out; }
  if (typeof v !== "object" || Array.isArray(v)) throw fail("BAD_INPUT", "solver.designSpecIterations must be a number (the limit on Brent's or Broyden's solves) or { bracket, solve }.");
  const bad = Object.keys(v).filter(k => !["bracket", "solve"].includes(k));
  if (bad.length) throw fail("BAD_INPUT", `solver.designSpecIterations: unknown key ${bad.map(k => `"${k}"`).join(", ")}. Known: bracket, solve.`);
  if (v.bracket != null) out.bracket = pos(v.bracket, ".bracket");
  if (v.solve != null) out.solve = pos(v.solve, ".solve");
  if (out.bracket < 2) throw fail("BAD_INPUT", "solver.designSpecIterations.bracket must be at least 2 (the guess and one step).");
  return out;
}

/** The shape of the designSpecs list (keys, types), without the flowsheet: for normalizeFlowsheet. Returns a copy. */
export function designSpecsShape(list) {
  if (!Array.isArray(list)) throw fail("BAD_INPUT", "flowsheet.designSpecs must be a list of design specifications.", { where: [{ field: "flowsheet.designSpecs" }] });
  return list.map((d, i) => {
    const at = `flowsheet.designSpecs[${i}]`;
    if (!d || typeof d !== "object" || Array.isArray(d)) throw fail("BAD_INPUT", `${at} must be an object with vary and target.`, { where: [{ field: at }] });
    const keysOk = (o, keys, where) => {
      const bad = Object.keys(o).filter(k => !keys.includes(k));
      if (bad.length) throw fail("BAD_INPUT", `${where}: unknown key${bad.length > 1 ? "s" : ""} ${bad.map(k => `"${k}"`).join(", ")}. Known: ${keys.join(", ")}.`, { where: [{ field: where }] });
    };
    keysOk(d, SPEC_KEYS, at);
    for (const k of ["vary", "target"]) {
      if (!d[k] || typeof d[k] !== "object" || Array.isArray(d[k])) throw fail("BAD_INPUT", `${at}${d.id ? ` (${d.id})` : ""}: give ${k} as an object.`, { where: [{ field: `${at}.${k}` }] });
    }
    keysOk(d.vary, VARY_KEYS, `${at}.vary`);
    keysOk(d.target, TARGET_KEYS, `${at}.target`);
    if (d.target.ratio_of != null) {
      if (typeof d.target.ratio_of !== "object" || Array.isArray(d.target.ratio_of)) throw fail("BAD_INPUT", `${at}.target.ratio_of must be an object such as { stream, quantity, component }.`);
      keysOk(d.target.ratio_of, TARGET_KEYS.filter(k => k !== "value" && k !== "ratio_of"), `${at}.target.ratio_of`);
    }
    return JSON.parse(JSON.stringify(d));
  });
}

/** A component of a target or a varied feed flow, as the system's index. */
function componentIndex(sys, name, where) {
  if (typeof name !== "string" || !name) throw fail("BAD_INPUT", `${where}: give the component.`);
  let id;
  try { id = findComponent(name, sys.userData); } catch (e) { throw fail("BAD_INPUT", `${where}: ${e.message}`); }
  const i = sys.ids.indexOf(id);
  if (i < 0) throw fail("BAD_INPUT", `${where}: ${name} is not a component of this flowsheet (${sys.names.join(", ")}).`);
  return i;
}

/** One quantity of a target (or of its ratio_of), checked against the flowsheet. */
function checkQuantity(sys, t, blocks, streamIds, where) {
  const hasS = t.stream != null, hasB = t.block != null;
  if (hasS === hasB) throw fail("BAD_INPUT", `${where}: give either stream or block (one of them).`, { where: [{ field: where }] });
  const q = t.quantity;
  if (hasS) {
    if (!streamIds.has(t.stream)) throw fail("BAD_INPUT", `${where}: ${JSON.stringify(t.stream)} is not a material stream of the flowsheet.`, { where: [{ field: `${where}.stream` }] });
    if (!STREAM_QUANTITIES.includes(q)) throw fail("BAD_INPUT", `${where}: the quantity of a stream is one of ${STREAM_QUANTITIES.join(", ")} (got ${JSON.stringify(q)}).`, { where: [{ field: `${where}.quantity` }] });
  } else {
    const b = blocks.get(t.block);
    if (!b) throw fail("BAD_INPUT", `${where}: ${JSON.stringify(t.block)} is not a block of the flowsheet.`, { where: [{ field: `${where}.block` }] });
    if (!BLOCK_QUANTITIES.includes(q)) throw fail("BAD_INPUT", `${where}: the quantity of a block is one of ${BLOCK_QUANTITIES.join(", ")} (got ${JSON.stringify(q)}).`, { where: [{ field: `${where}.quantity` }] });
    if (!b.unit.duty) throw fail("BAD_INPUT", `${where}: ${b.unit.label} ${b.id} has no duty.`, { where: [{ field: `${where}.block` }] });
  }
  const out = { ...(hasS ? { stream: t.stream } : { block: t.block }), quantity: q };
  if (WITH_COMPONENT.has(q)) { out.i = componentIndex(sys, t.component, `${where}.component`); out.component = sys.ids[out.i]; }
  else if (t.component != null) throw fail("BAD_INPUT", `${where}: ${q} takes no component.`, { where: [{ field: `${where}.component` }] });
  return out;
}

/** "the water flow of S7", "the mole fraction of ethanol in S3", "the duty of E1" */
function describeQuantity(sys, t) {
  const comp = t.i != null ? sys.names[t.i] : "";
  const where = t.stream ?? t.block;
  switch (t.quantity) {
    case "flow_kmol_h": case "flow_kg_h": return `the total flow of ${where}`;
    case "component_flow_kmol_h": case "component_flow_kg_h": return `the flow of ${comp} in ${where}`;
    case "mole_fraction": return `the mole fraction of ${comp} in ${where}`;
    case "mass_fraction": return `the mass fraction of ${comp} in ${where}`;
    case "T_K": return `the temperature of ${where}`;
    case "VF": return `the vapour fraction of ${where}`;
    case "duty_kW": return `the duty of ${where}`;
    default: return `${t.quantity} of ${where}`;
  }
}

/**
 * Check the design specifications against the flowsheet (its blocks and streams) and the system, before anything is
 * solved. Throws BAD_INPUT naming the field (proposal 0022, section 3).
 * @param {object} sys
 * @param {object} fs          the flowsheet ({ blocks, streams, energyStreams, solver, designSpecs })
 * @param {object} inspected   inspectFlowsheet(fs) (its blocks and energy streams)
 * @param {number} [defaultRecycleTolerance]  the recycle tolerance when solver.tolerance is not given
 * @returns {object[]} the checked specifications
 */
export function checkDesignSpecs(sys, fs, inspected, defaultRecycleTolerance = 1e-8) {
  const list = designSpecsShape(fs.designSpecs ?? []);
  const blocks = inspected.blocks;
  const streamIds = new Set((fs.streams ?? []).map(s => s?.id));
  const recycleTol = Number(fs.solver?.tolerance ?? defaultRecycleTolerance);
  const ids = new Set(), varied = [];
  const MW = molarMasses(sys);
  return list.map((d, k) => {
    const at = `flowsheet.designSpecs[${k}]`;
    const id = d.id ?? `DS${k + 1}`;
    if (typeof id !== "string" || !id) throw fail("BAD_INPUT", `${at}: id must be a name such as "DS1".`, { where: [{ field: `${at}.id` }] });
    if (ids.has(id)) throw fail("BAD_INPUT", `Two design specifications are called ${id}.`, { where: [{ field: `${at}.id` }] });
    ids.add(id);
    const name = `Design specification ${id}`;
    // the varied input
    const v = d.vary;
    const b = blocks.get(v.block);
    if (!b) throw fail("BAD_INPUT", `${name}: vary.block ${JSON.stringify(v.block)} is not a block of the flowsheet.`, { where: [{ field: `${at}.vary.block` }] });
    const kinds = VARIABLES[b.type];
    const kind = kinds?.[v.key];
    if (!kind) {
      const can = kinds ? Object.keys(kinds).join(", ") : "none yet";
      throw fail("BAD_INPUT", `${name}: ${b.unit.label} ${b.id}'s ${JSON.stringify(v.key)} cannot be varied by a design specification (${b.unit.label}: ${can}). Variables that may be varied: ${Object.entries(VARIABLES).map(([t, ks]) => `${t} ${Object.keys(ks).join(", ")}`).join("; ")}.`, { where: [{ field: `${at}.vary.key` }] });
    }
    if (!isNum(v.min) || !isNum(v.max)) throw fail("BAD_INPUT", `${name}: give vary.min and vary.max, the bounds of ${b.id} ${v.key} (a design specification without bounds is refused: the bounds are what lets the solver bracket the answer and say when there is none).`, { where: [{ field: `${at}.vary.min` }, { field: `${at}.vary.max` }] });
    if (!(v.min < v.max)) throw fail("BAD_INPUT", `${name}: vary.min (${v.min}) must be below vary.max (${v.max}).`, { where: [{ field: `${at}.vary.min` }] });
    if (v.guess != null && !isNum(v.guess)) throw fail("BAD_INPUT", `${name}: vary.guess must be a number.`, { where: [{ field: `${at}.vary.guess` }] });
    const spec = b.spec ?? {};
    const vr = { block: b.id, type: b.type, key: v.key, kind, min: v.min, max: v.max, label: "", unit: UNIT[v.key] ?? "" };
    let current;
    if (kind === "flows") {
      const other = v.key === "flow_kmol_h" ? "flow_kg_h" : "flow_kmol_h";
      if (spec[v.key] == null) throw fail("BAD_INPUT", `${name}: Feed ${b.id} ${spec[other] != null ? `gives ${other}; vary ${other}` : `gives no ${v.key}`}.`, { where: [{ field: `${at}.vary.key` }] });
      const fl = spec[v.key];
      if (v.component != null) {
        vr.i = componentIndex(sys, v.component, `${name}: vary.component`);
        vr.component = sys.ids[vr.i];
        if (Array.isArray(fl)) current = Number(fl[vr.i]);
        else { const key = Object.keys(fl).find(c => { try { return findComponent(c, sys.userData) === vr.component; } catch { return false; } }); current = key == null ? 0 : Number(fl[key]); }
        vr.label = `the flow of ${sys.names[vr.i]} in ${b.id}`;
      } else {
        const vals = Array.isArray(fl) ? fl : Object.values(fl);
        current = vals.reduce((a, x) => a + Number(x), 0);
        if (!(current > 0)) throw fail("BAD_INPUT", `${name}: Feed ${b.id} has no flow, so its total flow cannot be scaled (the composition comes from its flows); give it a flow first.`, { where: [{ field: `${at}.vary` }] });
        vr.label = `the total flow of ${b.id}`;
      }
      if (v.min < 0) throw fail("BAD_INPUT", `${name}: vary.min of a flow cannot be negative (got ${v.min}).`, { where: [{ field: `${at}.vary.min` }] });
    } else if (kind === "list") {
      const list2 = spec[v.key];
      if (list2 == null) throw fail("BAD_INPUT", `${name}: Splitter ${b.id} gives no ${v.key}${["fractions", "flow_kmol_h", "flow_kg_h"].filter(x => spec[x] != null).map(x => ` (it gives ${x})`).join("")}.`, { where: [{ field: `${at}.vary.key` }] });
      const arr = Array.isArray(list2) ? list2 : [list2];
      if (!(Number.isInteger(v.index) && v.index >= 0 && v.index < arr.length)) throw fail("BAD_INPUT", `${name}: vary.index must be the position of the outlet in Splitter ${b.id}'s ${v.key}, from 0 to ${arr.length - 1} (got ${JSON.stringify(v.index)}).`, { where: [{ field: `${at}.vary.index` }] });
      if (arr[v.index] === "rest") throw fail("BAD_INPUT", `${name}: outlet ${v.index} of Splitter ${b.id} takes the "rest"; vary another outlet's ${v.key}.`, { where: [{ field: `${at}.vary.index` }] });
      vr.index = v.index; current = Number(arr[v.index]);
      vr.label = `${v.key === "fractions" ? "the fraction" : "the flow"} of outlet ${v.index} of ${b.id}`;
      if (v.min < 0) throw fail("BAD_INPUT", `${name}: vary.min cannot be negative (got ${v.min}).`, { where: [{ field: `${at}.vary.min` }] });
      if (v.key === "fractions" && v.max > 1) throw fail("BAD_INPUT", `${name}: vary.max of a fraction cannot be above 1 (got ${v.max}).`, { where: [{ field: `${at}.vary.max` }] });
    } else {
      if (v.component != null || v.index != null) throw fail("BAD_INPUT", `${name}: ${v.key} takes no component or index.`, { where: [{ field: `${at}.vary` }] });
      if (v.key === "duty_kW" && b.qin) throw fail("BAD_INPUT", `${name}: the duty of ${b.unit.label} ${b.id} comes from the energy stream ${b.qin.id}, so it cannot also be varied.`, { where: [{ field: `${at}.vary.key` }] });
      if ((v.key === "T_K" || v.key === "P_kPa") && v.min <= 0) throw fail("BAD_INPUT", `${name}: vary.min of ${v.key} must be above 0 (got ${v.min}).`, { where: [{ field: `${at}.vary.min` }] });
      current = spec[v.key] == null || spec[v.key] === "" ? undefined : Number(spec[v.key]);
      if (current === undefined && v.guess == null) throw fail("BAD_INPUT", `${name}: ${b.unit.label} ${b.id} gives no ${v.key}; give it in the block's specification or as vary.guess (the value the solver starts from).`, { where: [{ field: `${at}.vary.guess` }] });
      vr.label = `${b.id} ${v.key === "T_K" ? "temperature" : v.key === "P_kPa" ? "pressure" : "duty"}`;
    }
    vr.given = current;
    vr.start = v.guess ?? current;
    if (!isNum(vr.start)) throw fail("BAD_INPUT", `${name}: the start value of ${vr.label} is not a number; give vary.guess.`, { where: [{ field: `${at}.vary.guess` }] });
    if (vr.start < v.min || vr.start > v.max) throw fail("BAD_INPUT", `${name}: the start value of ${vr.label} (${fmt(vr.start)}${vr.unit ? ` ${vr.unit}` : ""}${v.guess != null ? ", the guess" : ", the value in the block's specification"}) is outside the bounds ${v.min} to ${v.max}${v.guess == null ? "; give vary.guess" : ""}.`, { where: [{ field: `${at}.vary.guess` }] });
    // two specifications on one input
    for (const o of varied) {
      if (o.block !== vr.block || o.key !== vr.key) continue;
      const same = vr.kind === "flows" ? (o.i == null || vr.i == null || o.i === vr.i) : vr.kind === "list" ? o.index === vr.index : true;
      if (same) throw fail("BAD_INPUT", `Design specifications ${o.id} and ${id} both vary ${vr.label}; a varied input belongs to one specification.`, { where: [{ field: `${at}.vary` }] });
    }
    vr.id = id;
    varied.push(vr);
    // the target
    const t = d.target;
    const tg = checkQuantity(sys, t, blocks, streamIds, `${name}: target`);
    if (!isNum(t.value)) throw fail("BAD_INPUT", `${name}: target.value must be a number (the value ${describeQuantity(sys, tg)} must reach).`, { where: [{ field: `${at}.target.value` }] });
    tg.value = t.value;
    if (t.ratio_of != null) tg.ratio_of = checkQuantity(sys, t.ratio_of, blocks, streamIds, `${name}: target.ratio_of`);
    else if ((tg.quantity === "mole_fraction" || tg.quantity === "mass_fraction" || tg.quantity === "VF") && (t.value < 0 || t.value > 1)) {
      throw fail("BAD_INPUT", `${name}: ${describeQuantity(sys, tg)} is between 0 and 1 (target.value ${t.value}).`, { where: [{ field: `${at}.target.value` }] });
    }
    tg.label = tg.ratio_of ? `${describeQuantity(sys, tg)} over ${describeQuantity(sys, tg.ratio_of)}` : describeQuantity(sys, tg);
    tg.unit = tg.ratio_of ? "" : (UNIT[tg.quantity] ?? "");
    // the tolerance (the maintainer, 2026-11-14: "should have a tolerance as default but I should be able to change it"):
    // by default 1e-6, or 100 times the recycle tolerance where that is looser; a tolerance given by the person is used as
    // given, and one tighter than 100 times the recycle tolerance carries a warning (the target may not be met more
    // tightly than the recycles are converged), not a refusal
    const floor = DESIGN_SPEC_TOLERANCE_RATIO * recycleTol;
    const tol = d.tolerance ?? Math.max(DESIGN_SPEC_DEFAULTS.tolerance, floor);
    if (!(isNum(tol) && tol > 0 && tol < 0.1)) throw fail("BAD_INPUT", `${name}: tolerance must be between 0 and 0.1 (got ${JSON.stringify(d.tolerance)}).`, { where: [{ field: `${at}.tolerance` }] });
    const warnings = [];
    if (tol < floor * (1 - 1e-12)) {
      warnings.push(`${name}: its tolerance ${tol} is tighter than ${DESIGN_SPEC_TOLERANCE_RATIO} times the recycle tolerance (solver.tolerance ${recycleTol}); the recycles' own convergence noise may then be as large as the tolerance, so the solver may stop at the limit or close the bracket on noise. If it does, loosen the tolerance to ${+floor.toPrecision(6)} or tighten solver.tolerance to ${+(tol / DESIGN_SPEC_TOLERANCE_RATIO).toPrecision(6)}.`);
    }
    const absolute = (ABSOLUTE.has(tg.quantity) && !tg.ratio_of) || t.value === 0;
    return { id, vary: vr, target: tg, tolerance: tol, toleranceGiven: d.tolerance != null, warnings, absolute, tolAbs: absolute ? tol : tol * Math.abs(t.value), MW, name };
  });
}

/** Set the varied input of `ds` to x in a copy of the block's spec. */
function setVaried(spec, vr, x, sys) {
  const s = JSON.parse(JSON.stringify(spec ?? {}));
  if (vr.kind === "number") { s[vr.key] = x; return s; }
  if (vr.kind === "list") { const arr = Array.isArray(s[vr.key]) ? s[vr.key] : [s[vr.key]]; arr[vr.index] = x; s[vr.key] = arr; return s; }
  // a feed's flows
  const fl = s[vr.key];
  if (vr.i != null) {
    if (Array.isArray(fl)) fl[vr.i] = x;
    else {
      const key = Object.keys(fl).find(c => { try { return findComponent(c, sys.userData) === vr.component; } catch { return false; } });
      fl[key ?? vr.component] = x;
    }
    return s;
  }
  const total = (Array.isArray(fl) ? fl : Object.values(fl)).reduce((a, v) => a + Number(v), 0);
  const f = x / total;
  s[vr.key] = Array.isArray(fl) ? fl.map(v => Number(v) * f) : Object.fromEntries(Object.entries(fl).map(([c, v]) => [c, Number(v) * f]));
  return s;
}

/** The value of a target's quantity in a solved flowsheet (NaN where it has none: a fraction of a stream with no flow). */
function quantityOf(t, result, MW) {
  if (t.block != null) { const d = result.blocks[t.block]?.duty_kW; return Number.isFinite(d) ? d : NaN; }
  const s = result.streams[t.stream];
  if (!s) return NaN;
  switch (t.quantity) {
    case "flow_kmol_h": return s.F_kmol_h;
    case "flow_kg_h": return s.mass_kg_h;
    case "component_flow_kmol_h": return s.flows[t.i];
    case "component_flow_kg_h": return s.flows[t.i] * MW[t.i];
    case "mole_fraction": return s.F_kmol_h > 0 ? s.flows[t.i] / s.F_kmol_h : NaN;
    case "mass_fraction": return s.mass_kg_h > 0 ? s.flows[t.i] * MW[t.i] / s.mass_kg_h : NaN;
    case "T_K": return Number.isFinite(s.T_K) ? s.T_K : NaN;
    case "VF": return s.F_kmol_h > 0 && Number.isFinite(s.VF) ? s.VF : NaN;
    default: return NaN;
  }
}
const targetOf = (t, result, MW) => (t.ratio_of ? quantityOf(t, result, MW) / quantityOf(t.ratio_of, result, MW) : quantityOf(t, result, MW));

/** The start values of the tear streams for the next solve: every stream at its converged value (a guess is used only
 *  where the stream is torn). */
function warmGuesses(fs, result) {
  const streams = (fs.streams ?? []).map(s => {
    const v = result.streams[s.id];
    return v ? { ...s, guess: { flow_kmol_h: v.flows.slice(), T_K: v.T_K, P_kPa: v.P_kPa } } : s;
  });
  const energyStreams = fs.energyStreams?.map(q => {
    const e = result.energy?.[q.id];
    return q.from && e && Number.isFinite(e.duty_kW) ? { ...q, guess: { duty_kW: e.duty_kW } } : q;
  });
  return { streams, ...(energyStreams ? { energyStreams } : {}) };
}

/** The flowsheet with every varied input at its start value (for the degrees of freedom: a varied input left out of
 *  its block's specification, given only as a guess, counts as given). */
export function withStartValues(sys, fs, specs) {
  const blocks = (fs.blocks ?? []).map(b => {
    const mine = specs.filter(d => d.vary.block === b.id);
    if (!mine.length) return b;
    let spec = b.spec ?? {};
    for (const d of mine) if (d.vary.given === undefined) spec = setVaried(spec, d.vary, d.vary.start, sys);
    return { ...b, spec };
  });
  return { ...fs, blocks };
}

/**
 * Solve a flowsheet with design specifications.
 * @param {object} sys
 * @param {object} fs          the flowsheet with designSpecs
 * @param {Function} solveInner  (sys, fs) → result of the sequential solver, without design specifications
 * @param {object} inspected   inspectFlowsheet(fs)
 */
export function solveDesignSpecs(sys, fs, solveInner, inspected, defaultRecycleTolerance = 1e-8) {
  const specs = checkDesignSpecs(sys, fs, inspected, defaultRecycleTolerance);
  const limits = designSpecLimits(fs.solver);
  const { designSpecs, ...plain } = fs;
  const base = withStartValues(sys, plain, specs);
  const MW = specs[0].MW;
  let warm = null, solves = 0;
  const trail = [];   // every solve: x and reached
  const describeX = xs => specs.map((d, k) => `${d.vary.label} = ${fmt(xs[k])}${d.vary.unit ? ` ${d.vary.unit}` : ""}`).join(", ");

  /** One whole-flowsheet solve with the varied inputs at xs. */
  const evaluate = (xs, context = "") => {
    const blocks = base.blocks.map(b => {
      let spec = b.spec;
      specs.forEach((d, k) => { if (d.vary.block === b.id) spec = setVaried(spec, d.vary, xs[k], sys); });
      return spec === b.spec ? b : { ...b, spec };
    });
    const doc = { ...base, blocks };
    let result;
    solves++;
    try {
      result = solveInner(sys, warm ? { ...doc, ...warmGuesses(doc, warm) } : doc);
    } catch (e) {
      // a warm start far from the answer can fail where the document's own start does not: try that once
      let again = null;
      if (warm) { try { solves++; result = solveInner(sys, doc); } catch (e2) { again = e2; } }
      if (!warm || again) {
        const err = again ?? e;
        const msg = `${specs.map(d => d.id).join(", ")}: the flowsheet could not be solved at ${describeX(xs)} (solve ${solves}${context}): ${err.message}`;
        err.message = msg;
        err.details = { ...(err.details ?? {}), designSpecs: specs.map(d => d.id), at: Object.fromEntries(specs.map((d, k) => [d.id, xs[k]])), solves, trail: trail.slice() };
        throw err;
      }
    }
    warm = result;
    const reached = specs.map(d => targetOf(d.target, result, MW));
    const r = reached.map((v, k) => v - specs[k].target.value);
    const point = { x: xs.slice(), reached, r, result };
    trail.push({ x: xs.slice(), reached: reached.slice() });
    return point;
  };
  const undefinedAt = (p, d, k) => fail("NO_CONVERGENCE",
    `${d.name}: ${d.target.label} has no value at ${describeX(p.x)} (a stream with no flow has no composition or vapour fraction). Narrow the bounds of ${d.vary.label} to where the stream flows, or target a flow.`,
    { reason: "undefined", designSpec: d.id, at: p.x[k], solves, trail });
  const met = p => p.r.every((v, k) => Math.abs(v) <= specs[k].tolAbs);

  const out = specs.length === 1 ? solveOne(specs[0], evaluate, limits, undefinedAt, () => solves, trail)
    : solveMany(specs, evaluate, limits, undefinedAt, met, () => solves, trail);
  // the answer: the last solve, with the varied values written into the blocks' specifications
  const result = out.point.result;
  for (const d of specs) {
    const b = result.blocks[d.vary.block];
    const docBlock = base.blocks.find(x => x.id === d.vary.block);
    let spec = docBlock.spec;
    specs.forEach((d2, k) => { if (d2.vary.block === d.vary.block) spec = setVaried(spec, d2.vary, out.point.x[k], sys); });
    if (b) b.spec = spec;
  }
  result.designSpecs = specs.map((d, k) => ({
    id: d.id,
    varied: { block: d.vary.block, key: d.vary.key, ...(d.vary.component ? { component: d.vary.component } : {}), ...(d.vary.index != null ? { index: d.vary.index } : {}),
      value: out.point.x[k], start: d.vary.start, min: d.vary.min, max: d.vary.max, unit: d.vary.unit },
    target: { ...(d.target.stream != null ? { stream: d.target.stream } : { block: d.target.block }), quantity: d.target.quantity,
      ...(d.target.component ? { component: d.target.component } : {}),
      ...(d.target.ratio_of ? { ratio_of: { ...(d.target.ratio_of.stream != null ? { stream: d.target.ratio_of.stream } : { block: d.target.ratio_of.block }), quantity: d.target.ratio_of.quantity, ...(d.target.ratio_of.component ? { component: d.target.ratio_of.component } : {}) } } : {}),
      asked: d.target.value, reached: out.point.reached[k], residual: out.point.r[k], tolerance: d.tolerance, tolerance_default: !d.toleranceGiven, absolute: d.absolute, unit: d.target.unit },
    ...(d.warnings.length ? { warnings: d.warnings.slice() } : {}),
    met: Math.abs(out.point.r[k]) <= d.tolAbs,
    method: out.method, solves: solvesOf(), ...(out.bracket ? { bracket: out.bracket } : {}), ...(out.iterations != null ? { iterations: out.iterations } : {}),
  }));
  return result;
  function solvesOf() { return solves; }
}

/** One specification: bracket, then Brent. */
function solveOne(d, evaluate, limits, undefinedAt, solves, trail) {
  const vr = d.vary, lo = vr.min, hi = vr.max;
  const f = (x, ctx) => evaluate([x], ctx);
  const pts = [];
  const add = p => { if (!Number.isFinite(p.r[0])) throw undefinedAt(p, d, 0); pts.push(p); return p; };
  const ok = p => Math.abs(p.r[0]) <= d.tolAbs;
  const done = (p, bracket = null) => ({ point: p, method: "brent", bracket });
  const p0 = add(f(vr.start, ", the start value"));
  if (ok(p0)) return done(p0);
  const h = 0.01 * (hi - lo);
  const x1 = vr.start + h <= hi ? vr.start + h : vr.start - h;
  const p1 = add(f(x1, ", bracketing"));
  if (ok(p1)) return done(p1);
  /** adjacent evaluated points of opposite sign, the one with the smaller |r| first */
  const signChange = () => {
    const s = pts.slice().sort((a, b) => a.x[0] - b.x[0]);
    let best = null;
    for (let i = 0; i + 1 < s.length; i++) {
      if (Math.sign(s[i].r[0]) * Math.sign(s[i + 1].r[0]) < 0) {
        const w = Math.min(Math.abs(s[i].r[0]), Math.abs(s[i + 1].r[0]));
        if (!best || w < best.w) best = { a: s[i], b: s[i + 1], w };
      }
    }
    return best;
  };
  let br = signChange();
  // step towards the side where |r| falls, doubling, up to the bounds
  let best = Math.abs(p1.r[0]) < Math.abs(p0.r[0]) ? p1 : p0;
  let dir = Math.sign(x1 - vr.start) * (best === p1 ? 1 : -1);
  let step = 2 * h, flipped = false;
  while (!br && pts.length < limits.bracket) {
    const xn = Math.min(hi, Math.max(lo, best.x[0] + dir * step));
    if (pts.some(p => p.x[0] === xn)) {   // at a bound already evaluated: try the other side once
      if (flipped) break;
      flipped = true; dir = -dir; best = p0; step = 2 * h; continue;
    }
    const pn = add(f(xn, ", bracketing"));
    if (ok(pn)) return done(pn);
    br = signChange();
    if (br) break;
    if (Math.abs(pn.r[0]) < Math.abs(best.r[0])) best = pn;
    else if (!flipped) { flipped = true; dir = -dir; best = p0; step = 2 * h; continue; }
    step *= 2;
  }
  // the bounds themselves: where the bracketing did not reach them (they also give the message when the target is out of reach)
  if (!br) {
    for (const xb of [lo, hi]) {
      if (pts.some(p => p.x[0] === xb)) continue;
      const pb = add(f(xb, ", at a bound"));
      if (ok(pb)) return done(pb);
    }
    br = signChange();
  }
  if (!br) {
    const at = x => pts.find(p => p.x[0] === x);
    const u = d.target.unit ? ` ${d.target.unit}` : "", vu = vr.unit ? ` ${vr.unit}` : "";
    const side = Math.sign(at(lo).r[0]) > 0 ? "above" : "below";
    throw fail("NO_CONVERGENCE",
      `${d.name}: ${d.target.label} is ${fmt(at(lo).reached[0])}${u} at ${vr.label} = ${fmt(lo)}${vu}, ${fmt(p0.reached[0])}${u} at the start value ${fmt(vr.start)}${vu} and ${fmt(at(hi).reached[0])}${u} at ${fmt(hi)}${vu}; ${fmt(d.target.value)}${u} is not reachable with ${vr.label} between ${fmt(lo)} and ${fmt(hi)}${vu} (the target stays ${side} it at every value tried). Widen the bounds if the block allows it, vary another input, or ask for a value the flowsheet can reach.`,
      { reason: "unreachable", designSpec: d.id, at_bounds: { min: { x: lo, reached: at(lo).reached[0] }, start: { x: vr.start, reached: p0.reached[0] }, max: { x: hi, reached: at(hi).reached[0] } }, solves: solves(), trail });
  }
  // Brent's method (Brent 1973, chapter 4; as scipy.optimize.brentq)
  let a = br.a.x[0], fa = br.a.r[0], b = br.b.x[0], fb = br.b.r[0], pb = br.b;
  if (Math.abs(fa) < Math.abs(fb)) { [a, b] = [b, a]; [fa, fb] = [fb, fa]; pb = br.a; }
  const bracketStart = [Math.min(a, b), Math.max(a, b)];
  let c = a, fc = fa, dstep = b - a, e = dstep;
  const xtol = 1e-12 * (hi - lo), EPS = 2.220446049250313e-16;
  for (let it = 0; it < limits.solve; it++) {
    if (Math.sign(fb) * Math.sign(fc) > 0) { c = a; fc = fa; dstep = e = b - a; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const tol1 = 2 * EPS * Math.abs(b) + 0.5 * xtol;
    const m = 0.5 * (c - b);
    if (Math.abs(fb) <= d.tolAbs) return done(pb, bracketStart);
    if (Math.abs(m) <= tol1) {
      throw fail("NO_CONVERGENCE",
        `${d.name}: the bracket closed at ${vr.label} = ${fmt(b)}${vr.unit ? ` ${vr.unit}` : ""} with ${d.target.label} still ${fmt(fb + d.target.value)} against ${fmt(d.target.value)} (the target jumps across the value asked there: a phase appears or vanishes, or the recycles are not converged tightly enough). Tighten solver.tolerance or ask for a value away from the jump.`,
        { reason: "discontinuous", designSpec: d.id, at: b, residual: fb, solves: solves(), trail });
    }
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p, q;
      if (a === c) { p = 2 * m * s; q = 1 - s; }   // secant
      else { const qq = fa / fc, r = fb / fc; p = s * (2 * m * qq * (qq - r) - (b - a) * (r - 1)); q = (qq - 1) * (r - 1) * (s - 1); }   // inverse quadratic
      if (p > 0) q = -q; else p = -p;
      if (2 * p < Math.min(3 * m * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = dstep; dstep = p / q; }
      else { dstep = m; e = m; }   // bisection
    } else { dstep = m; e = m; }
    a = b; fa = fb;
    b += Math.abs(dstep) > tol1 ? dstep : (m > 0 ? tol1 : -tol1);
    pb = f(b, `, Brent iteration ${it + 1}`);
    if (!Number.isFinite(pb.r[0])) throw undefinedAt(pb, d, 0);
    fb = pb.r[0];
  }
  if (Math.abs(fb) <= d.tolAbs) return done(pb, bracketStart);
  throw fail("NO_CONVERGENCE",
    `${d.name}: not met in ${limits.solve} solves of Brent's method: the answer lies between ${vr.label} = ${fmt(Math.min(b, c))} and ${fmt(Math.max(b, c))}${vr.unit ? ` ${vr.unit}` : ""}, where ${d.target.label} is ${fmt(fb + d.target.value)} against ${fmt(d.target.value)}. Raise solver.designSpecIterations, or loosen the tolerance (${d.tolerance}).`,
    { reason: "limit", designSpec: d.id, bracket: [Math.min(b, c), Math.max(b, c)], residual: fb, solves: solves(), trail });
}

/** Solve A x = b by Gaussian elimination with partial pivoting; null when singular. */
function linsolve(A, bv) {
  const n = bv.length, M = A.map((row, i) => [...row, bv[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    if (!(Math.abs(M[p][k]) > 1e-14)) return null;
    [M[k], M[p]] = [M[p], M[k]];
    for (let i = k + 1; i < n; i++) { const c = M[i][k] / M[k][k]; for (let j = k; j <= n; j++) M[i][j] -= c * M[k][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
  return x;
}

/** Several specifications: Broyden's method with bounds (proposal 0022, step 2). */
function solveMany(specs, evaluate, limits, undefinedAt, met, solves, trail) {
  const n = specs.length;
  const lo = specs.map(d => d.vary.min), hi = specs.map(d => d.vary.max), span = specs.map((d, k) => hi[k] - lo[k]);
  const scale = specs.map(d => (d.absolute ? 1 : Math.abs(d.target.value)));
  const toX = u => u.map((v, k) => lo[k] + Math.min(1, Math.max(0, v)) * span[k]);
  const fOf = p => {
    p.r.forEach((v, k) => { if (!Number.isFinite(v)) throw undefinedAt(p, specs[k], k); });
    return p.r.map((v, k) => v / scale[k]);
  };
  const norm = f => Math.sqrt(f.reduce((a, v) => a + v * v, 0));
  const done = (p, it) => ({ point: p, method: "broyden", iterations: it });
  let u = specs.map((d, k) => (d.vary.start - lo[k]) / span[k]);
  let p = evaluate(toX(u), ", the start values");
  let f = fOf(p);
  if (met(p)) return done(p, 0);
  /** the Jacobian by finite differences at u (one solve per specification) */
  const jacobian = () => {
    const J = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      const h = u[j] + 0.01 <= 1 ? 0.01 : -0.01;
      const uj = u.slice(); uj[j] += h;
      const pj = evaluate(toX(uj), `, the Jacobian (${specs[j].id})`);
      const fj = fOf(pj);
      for (let i = 0; i < n; i++) J[i][j] = (fj[i] - f[i]) / h;
      if (J.every(row => Math.abs(row[j]) < 1e-12)) {
        throw fail("NO_CONVERGENCE", `${specs[j].name}: varying ${specs[j].vary.label} changes none of the targets (${specs.map(d => d.target.label).join("; ")}). Vary another input.`,
          { reason: "no_effect", designSpec: specs[j].id, solves: solves(), trail });
      }
    }
    // the last finite-difference solve left the warm start there; the next step starts from u anyway
    return J;
  };
  let J = jacobian(), fresh = true;
  for (let it = 1; it <= limits.solve; it++) {
    const du0 = linsolve(J, f.map(v => -v));
    if (!du0 || !du0.every(Number.isFinite)) {
      throw fail("NO_CONVERGENCE", `${specs.map(d => d.id).join(", ")}: the targets do not respond independently to the varied inputs (${specs.map(d => d.vary.label).join("; ")}): two of them move the targets in the same proportion. Vary inputs that act on different targets.`,
        { reason: "singular", solves: solves(), trail });
    }
    // at most half of each range per step
    const big = Math.max(...du0.map(Math.abs));
    const du = big > 0.5 ? du0.map(v => v * 0.5 / big) : du0;
    let lambda = 1, accepted = null;
    for (let half = 0; half < 4; half++) {
      const un = u.map((v, k) => Math.min(1, Math.max(0, v + lambda * du[k])));
      if (un.every((v, k) => v === u[k])) break;
      const pn = evaluate(toX(un), `, Broyden iteration ${it}`);
      const fn = fOf(pn);
      if (met(pn)) return done(pn, it);
      if (norm(fn) < norm(f)) { accepted = { un, pn, fn }; break; }
      lambda /= 2;
    }
    if (!accepted) {
      if (!fresh) { J = jacobian(); fresh = true; continue; }
      const atBound = specs.filter((d, k) => (u[k] <= 0 && du[k] < 0) || (u[k] >= 1 && du[k] > 0));
      const where = specs.map((d, k) => `${d.target.label} ${fmt(p.reached[k])} against ${fmt(d.target.value)}`).join("; ");
      throw fail("NO_CONVERGENCE",
        atBound.length
          ? `${atBound.map(d => d.id).join(", ")}: the targets need ${atBound.map(d => `${d.vary.label} beyond ${fmt(u[specs.indexOf(d)] <= 0 ? d.vary.min : d.vary.max)}${d.vary.unit ? ` ${d.vary.unit}` : ""}`).join(" and ")}, outside the bounds (now ${where}). Widen the bounds or ask for values the flowsheet can reach.`
          : `${specs.map(d => d.id).join(", ")}: Broyden's method stalled at ${specs.map((d, k) => `${d.vary.label} = ${fmt(toX(u)[k])}`).join(", ")} (${where}). The targets may not be reachable together; try other start values (vary.guess) or meet them one at a time.`,
        { reason: atBound.length ? "unreachable" : "stalled", solves: solves(), trail });
    }
    // Broyden's update of the Jacobian with the step taken
    const s = accepted.un.map((v, k) => v - u[k]), y = accepted.fn.map((v, k) => v - f[k]);
    const ss = s.reduce((a, v) => a + v * v, 0);
    if (ss > 0) {
      const Js = J.map(row => row.reduce((a, v, j) => a + v * s[j], 0));
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) J[i][j] += (y[i] - Js[i]) * s[j] / ss;
    }
    fresh = false;
    u = accepted.un; p = accepted.pn; f = accepted.fn;
  }
  throw fail("NO_CONVERGENCE",
    `${specs.map(d => d.id).join(", ")}: not met in ${limits.solve} Broyden iterations (${specs.map((d, k) => `${d.target.label} ${fmt(p.reached[k])} against ${fmt(d.target.value)}`).join("; ")}). Raise solver.designSpecIterations, give start values (vary.guess) closer to the answer, or loosen the tolerances.`,
    { reason: "limit", solves: solves(), trail });
}
