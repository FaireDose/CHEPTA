/**
 * Blocks (unit operations; layer 4; proposal 0006, step 2; roadmap A6).
 *
 * Every block type is registered with the same shape (ARCHITECTURE.md, layer 4):
 *
 *   registerUnit({
 *     type: "heater", label: "Heater / cooler", duty: true,   // duty: the block has an energy stream
 *     inlets:  [{ port: "in" }],                       // { port, min?, max? }: several streams on
 *     outlets: [{ port: "out" }],                      //   one port when max > 1
 *     checkSpec(spec, ctx) → spec,                     // normalized, or a BAD_INPUT error naming the problem
 *     solve({ sys, inlets, spec, outletCount }) → { outlets: { port: stream | stream[] }, duty_kW, notes }
 *   })
 *
 * and is calculated with runUnit(type, { sys, inlets, spec, outletCount }), which checks the
 * ports and the specification, runs the block, and checks its balances:
 *  - material: every component's flow in = flow out to 1e-9 relative (a failure is a bug in
 *    the block and throws);
 *  - energy: the enthalpy flows in + duty = out, reported (`balance.energy_kW` is the
 *    difference, zero to rounding for the blocks here).
 *
 * The first blocks: feed, mixer, splitter, separator (component splitter), flash (drum),
 * heater (heater / cooler), product. They are steady-state material and energy balances
 * around the flash and the stream of layers 2 and 3; nothing here is a correlation.
 *
 * Proposal 0013 adds (steps 3-5):
 *  - the heater's optional `sizing` ({ utility, U, arrangement, shells, zones }): the area and the utility's
 *    consumption by the zone method of src/units/heat-exchange.js; it is not a specification (it changes no outlet);
 *  - "hx", a heat exchanger between two process streams (inlets and outlets hot and cold), adiabatic overall: one
 *    specification, an outlet temperature or vapour fraction of either side, the duty, or the minimum approach dTmin_K;
 *  - "valve": an adiabatic pressure drop (a P-H flash at the inlet enthalpy);
 *  - "pump": a liquid to a higher pressure, power = V dP / efficiency, V the inlet's volume flow from the liquid-density
 *    records of its components (ideal mixing: the molar volumes add up); the outlet from the energy balance,
 *    H_out = H_in + power. The efficiency defaults to 0.75, the low end of the "target pump efficiencies ... in the
 *    range from 75 to 85 percent" of R. Evans, R. E. Sneed and J. H. Hunt, Pumping plant performance, N.C. Cooperative
 *    Extension AG-452-6 (1996, revised 2024), https://content.ces.ncsu.edu/pumping-plant-performance (free to read);
 *    the U.S. Department of Energy's Improving Pumping System Performance: A Sourcebook for Industry, 2nd ed. (2006),
 *    https://www.energy.gov/sites/prod/files/2014/05/f16/pump.pdf (a public-domain work of the U.S. government), p. 7:
 *    "Efficiencies range widely, from 35% to more than 90%". The person's own efficiency replaces it.
 *  - "compressor" and "expander" (proposal 0013, step 6): a gas to a higher or lower pressure along the isentropic path,
 *    then the efficiency: the isentropic outlet is the P-S flash at the inlet's entropy (src/equilibrium/flash.js, the
 *    entropy of src/thermo/enthalpy.js), w_s = h_s - h_in, and the real work w = w_s / eta (compressor) or eta w_s
 *    (expander, negative: power out); outlet from the enthalpy balance, H_out = H_in + power. Outlet: the pressure P_kPa,
 *    the change dP_kPa or the pressure ratio `ratio` (outlet over inlet). The efficiencies default to typical values of
 *    the U.S. National Energy Technology Laboratory's Quality Guidelines for Energy System Studies: Process Modeling
 *    Design Parameters, NETL-PUB-22478 (June 2019),
 *    https://netl.doe.gov/projects/files/QualityGuidelinesforEnergySystemStudiesProcessModelingDesignParameters_062819.pdf
 *    (a work of the U.S. government, public domain): compressor 0.75, the lower of its single-stage syngas recycle
 *    compressors' isentropic efficiencies (84 %, Exhibit 4-8, p. 23; 75 %, Exhibit 5-7, p. 47); expander 0.80, its
 *    boiler feed water pump turbine's isentropic efficiency (Exhibit 4-3, p. 17; its steam turbines: 85-93.5 %). Both
 *    take a gas: an inlet with liquid is refused. The person's own efficiency replaces them.
 * A block's `energy` kind is "heat" (a duty) or "work" (a pump's, compressor's or expander's power); `dutySpec`: its duty can be given, so an
 * energy stream can go into it (src/flowsheet/flowsheet.js).
 * Units: K, kPa, kmol/h, kW.
 */
import { fail } from "../util/errors.js";
import { stream, componentFlows, scaleStream, phaseStream, phasesStream } from "../stream/stream.js";
import { findComponent } from "../thermo/components.js";
import { pure } from "../thermo/pure.js";
import { exchangerArea, exchangerApproach, ARRANGEMENTS } from "./heat-exchange.js";

const UNITS = new Map();

/** Register a block type (see the file header). Replacing a type needs { replace: true }. */
export function registerUnit(def, { replace = false } = {}) {
  if (!def || typeof def.type !== "string" || !/^[a-z][a-z0-9-]*$/.test(def.type)) throw fail("BAD_INPUT", "registerUnit: type must be a lower-case name such as \"heater\".");
  if (UNITS.has(def.type) && !replace) throw fail("BAD_INPUT", `registerUnit: "${def.type}" is already registered.`);
  if (typeof def.solve !== "function") throw fail("BAD_INPUT", `registerUnit: "${def.type}" needs a solve function.`);
  const ports = list => (list ?? []).map(p => ({ port: p.port, min: p.min ?? 1, max: p.max ?? 1, optional: !!p.optional, label: p.label ?? p.port }));
  UNITS.set(def.type, Object.freeze({ ...def, label: def.label ?? def.type, inlets: ports(def.inlets), outlets: ports(def.outlets),
    energy: def.energy ?? (def.duty ? "heat" : null), dutySpec: !!def.dutySpec }));
}

/** A registered block type, or a BAD_INPUT error listing the known ones. */
export function unitType(type) {
  const u = UNITS.get(type);
  if (!u) throw fail("BAD_INPUT", `Unknown block type "${type}". Known: ${[...UNITS.keys()].join(", ")}.`);
  return u;
}

/** The registered block types, in registration order. */
export const unitTypes = () => [...UNITS.values()];

const num = (v, what, { min = -Infinity, positive = false } = {}) => {
  const x = Number(v);
  if (!Number.isFinite(x) || (positive && !(x > 0)) || x < min) {
    throw fail("BAD_INPUT", `${what} must be ${positive ? "a positive number" : min > -Infinity ? `a number of at least ${min}` : "a number"} (got ${JSON.stringify(v)}).`);
  }
  return x;
};
const asList = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

/**
 * Split fractions over n outlets: numbers between 0 and 1, at most one "rest" (what the
 * others leave), adding up to 1 within 1e-9.
 */
export function splitFractions(fr, n, what) {
  if (!Array.isArray(fr)) throw fail("BAD_INPUT", `${what}: give one fraction per outlet as a list, e.g. [0.8, "rest"].`);
  if (fr.length !== n) throw fail("BAD_INPUT", `${what}: ${fr.length} fraction${fr.length === 1 ? "" : "s"} for ${n} outlets.`);
  const rest = fr.map((v, i) => (v === "rest" ? i : -1)).filter(i => i >= 0);
  if (rest.length > 1) throw fail("BAD_INPUT", `${what}: only one outlet can take "rest".`);
  const vals = fr.map((v, i) => (v === "rest" ? 0 : num(v, `${what}, outlet ${i + 1}`, { min: 0 })));
  vals.forEach((v, i) => { if (v > 1) throw fail("BAD_INPUT", `${what}, outlet ${i + 1}: a fraction cannot be above 1 (got ${v}).`); });
  const sum = vals.reduce((a, v) => a + v, 0);
  if (rest.length) {
    if (sum > 1 + 1e-9) throw fail("BAD_INPUT", `${what}: the fractions add up to ${+sum.toPrecision(6)} before "rest"; they must leave something (at most 1).`);
    vals[rest[0]] = Math.max(0, 1 - sum);
  } else if (Math.abs(sum - 1) > 1e-9) {
    throw fail("BAD_INPUT", `${what}: the fractions add up to ${+sum.toPrecision(6)}; they must add up to 1 (or give one outlet "rest").`);
  }
  return vals;
}

/** The conditions of a flash specification: two of T_K, P_kPa, VF and (with an inlet) duty_kW. */
function flashConditions(spec, what, { duty = true } = {}) {
  const has = k => spec[k] !== undefined && spec[k] !== null;
  const keys = ["T_K", "P_kPa", "VF", ...(duty ? ["duty_kW"] : [])].filter(has);
  const kind = keys.slice().sort().join("+");
  const KINDS = ["P_kPa+T_K", "P_kPa+VF", "T_K+VF", ...(duty ? ["P_kPa+duty_kW"] : [])];
  if (!KINDS.includes(kind)) {
    throw fail("BAD_INPUT", `${what}: give ${duty ? "T_K and P_kPa, P_kPa and duty_kW, P_kPa and VF, or T_K and VF" : "T_K and P_kPa, P_kPa and VF, or T_K and VF"} (got ${keys.join(", ") || "none"}).`);
  }
  const out = {};
  if (has("T_K")) out.T_K = num(spec.T_K, `${what}: T_K`, { positive: true });
  if (has("P_kPa")) out.P_kPa = num(spec.P_kPa, `${what}: P_kPa`, { positive: true });
  if (has("VF")) { out.VF = num(spec.VF, `${what}: VF`, { min: 0 }); if (out.VF > 1) throw fail("BAD_INPUT", `${what}: VF must be between 0 and 1 (got ${spec.VF}).`); }
  if (has("duty_kW")) out.duty_kW = num(spec.duty_kW, `${what}: duty_kW`);
  return out;
}

/** The outlet stream of a block that brings `flows` with enthalpy flow H_in to the given conditions. */
function outletAt(sys, flows, H_in_kW, c, id) {
  const spec = { id, flow_kmol_h: flows };
  if (c.duty_kW != null) return stream(sys, { ...spec, P_kPa: c.P_kPa, H_kW: H_in_kW + c.duty_kW });
  return stream(sys, { ...spec, ...c });
}

const sumFlows = (sys, list) => list.reduce((acc, s) => acc.map((v, i) => v + s.flows[i]), new Array(sys.n).fill(0));
const sumH = list => list.reduce((a, s) => a + (s.H_kW ?? 0), 0);

/**
 * Several inlet streams as one: flows added, adiabatic (the enthalpy flows added, a P-H flash),
 * at P_kPa or the lowest pressure of the inlets that carry flow (an empty recycle at its start
 * does not count). One inlet is returned as it is. Used by the mixer and by every block that
 * takes several inlets (they mix them first, as desktop simulators do).
 */
function mixed(sys, ins, P_kPa = null) {
  const notes = [];
  if (ins.length === 1 && P_kPa == null) return { stream: ins[0], notes };
  const flows = sumFlows(sys, ins);
  const flowing = ins.filter(s => s.F_kmol_h > 0);
  const Ps = (flowing.length ? flowing : ins).map(s => s.P_kPa).filter(p => p != null);
  const P = P_kPa ?? Math.min(...Ps);
  if (P_kPa != null && Ps.some(p => p < P_kPa)) notes.push(`The outlet pressure (${P_kPa} kPa) is above an inlet pressure (${Math.min(...Ps)} kPa): a real mixer needs a pump or compressor on that inlet.`);
  const F = flows.reduce((a, v) => a + v, 0);
  // without flow: the first inlet's temperature
  const out = F > 0 ? stream(sys, { flow_kmol_h: flows, P_kPa: P, H_kW: sumH(ins) })
    : stream(sys, { flow_kmol_h: flows, T_K: ins.find(s => s.T_K != null)?.T_K ?? 298.15, P_kPa: P });
  return { stream: out, notes };
}

// ---------------------------------------------------------------------------------------
// The first blocks

registerUnit({
  type: "feed", label: "Feed", inlets: [], outlets: [{ port: "out" }],
  checkSpec(spec, { sys }) {
    if (spec.flow_kmol_h == null && spec.flow_kg_h == null) throw fail("BAD_INPUT", "Feed: give the flows, flow_kmol_h or flow_kg_h, e.g. { water: 60, ethanol: 40 }.");
    if (spec.flow_kmol_h != null && spec.flow_kg_h != null) throw fail("BAD_INPUT", "Feed: give flow_kmol_h or flow_kg_h, not both.");
    const flows = spec.flow_kg_h != null ? componentFlows(sys, spec.flow_kg_h, "kg/h") : componentFlows(sys, spec.flow_kmol_h);
    return { flows, ...flashConditions(spec, "Feed", { duty: false }) };
  },
  solve({ sys, spec }) {
    const { flows, ...c } = spec;
    return { outlets: { out: stream(sys, { flow_kmol_h: flows, ...c }) }, duty_kW: 0 };
  },
});

registerUnit({
  type: "mixer", label: "Mixer", inlets: [{ port: "in", min: 1, max: Infinity }], outlets: [{ port: "out" }],
  checkSpec(spec) {
    return spec.P_kPa == null ? {} : { P_kPa: num(spec.P_kPa, "Mixer: P_kPa", { positive: true }) };
  },
  solve({ sys, inlets, spec }) {
    const { stream: out, notes } = mixed(sys, inlets.in, spec.P_kPa);
    return { outlets: { out }, duty_kW: 0, notes };
  },
});

registerUnit({
  type: "splitter", label: "Splitter", inlets: [{ port: "in", min: 1, max: Infinity }], outlets: [{ port: "out", min: 2, max: Infinity }],
  checkSpec(spec, { outletCount }) {
    return { fractions: splitFractions(asList(spec.fractions), outletCount, "Splitter: fractions") };
  },
  solve({ sys, inlets, spec }) {
    const s = mixed(sys, inlets.in).stream;   // several inlets: mixed first
    return { outlets: { out: spec.fractions.map(f => scaleStream(s, f)) }, duty_kW: 0 };
  },
});

registerUnit({
  type: "separator", label: "Component separator", duty: true, inlets: [{ port: "in", min: 1, max: Infinity }], outlets: [{ port: "out", min: 2, max: Infinity }],
  checkSpec(spec, { sys, outletCount }) {
    const fr = spec.fractions;
    if (!fr || typeof fr !== "object" || Array.isArray(fr)) throw fail("BAD_INPUT", "Component separator: give the split fractions per component, e.g. { fractions: { ethanol: [0.95, \"rest\"], water: [0.02, \"rest\"] } }.");
    const byId = new Map();
    for (const [key, v] of Object.entries(fr)) {
      let id;
      try { id = findComponent(key, sys.userData); } catch (e) { throw fail("BAD_INPUT", `Component separator: ${e.message}`); }
      const i = sys.ids.indexOf(id);
      if (i < 0) throw fail("BAD_INPUT", `Component separator: ${key} is not a component of this system (${sys.ids.join(", ")}).`);
      byId.set(sys.ids[i], splitFractions(asList(v), outletCount, `Component separator: fractions of ${sys.names[i]}`));
    }
    const missing = sys.ids.filter(id => !byId.has(id));
    if (missing.length) throw fail("BAD_INPUT", `Component separator: give split fractions for every component; missing: ${missing.map(id => sys.names[sys.ids.indexOf(id)]).join(", ")}.`);
    const conds = asList(spec.outlets);
    if (conds.length && conds.length !== outletCount) throw fail("BAD_INPUT", `Component separator: ${conds.length} outlet conditions for ${outletCount} outlets.`);
    return {
      fractions: sys.ids.map(id => byId.get(id)),   // [component][outlet]
      outlets: conds.map((c, k) => (c == null ? null : flashConditions(c, `Component separator, outlet ${k + 1}`, { duty: false }))),
    };
  },
  solve({ sys, inlets, spec, outletCount }) {
    const s = mixed(sys, inlets.in).stream;   // several inlets: mixed first
    const outs = [];
    for (let k = 0; k < outletCount; k++) {
      const flows = s.flows.map((v, i) => v * spec.fractions[i][k]);
      const c = spec.outlets[k] ?? { T_K: s.T_K, P_kPa: s.P_kPa };   // default: the inlet's T and P
      outs.push(stream(sys, { flow_kmol_h: flows, ...c }));
    }
    // the duty that closes the energy balance of the black-box separation
    return { outlets: { out: outs }, duty_kW: sumH(outs) - (s.H_kW ?? 0) };
  },
});

registerUnit({
  type: "flash", label: "Flash drum", duty: true, dutySpec: true, inlets: [{ port: "in", min: 1, max: Infinity }],
  outlets: [{ port: "vapour" }, { port: "liquid" }, { port: "liquid2", optional: true, label: "second liquid" }],
  checkSpec(spec) { return flashConditions(spec, "Flash drum"); },
  solve({ sys, inlets, spec, outletCount }) {
    const ins = inlets.in;
    const all = outletAt(sys, sumFlows(sys, ins), sumH(ins), spec);
    const notes = [];
    const liquids = all.phases.filter(p => p.type === "liquid").length;
    if (liquids > 1 && outletCount < 3) notes.push("The drum holds two liquids; connect the liquid2 outlet to take the second one apart (now both leave by liquid).");
    const outlets = { vapour: phaseStream(all, "vapour") };
    // an inert solid (src/equilibrium/inert-solids.js) leaves with the liquid, as a slurry; a separator after the
    // drum can take it out (a filter)
    const solid = all.phases.some(p => p.type === "solid") ? [["solid", 0]] : null;
    if (solid) {
      if (liquids > 1 && outletCount < 3) {
        outlets.liquid = phasesStream(all, [["liquid", 0], ["liquid", 1], ...solid]);
      } else {
        outlets.liquid = phasesStream(all, [["liquid", 0], ...solid]);
        if (outletCount >= 3) outlets.liquid2 = phaseStream(all, "liquid", 1);
      }
      if (liquids > 0 || all.phases.some(p => p.type === "vapour")) notes.push("The inert solid leaves with the liquid outlet.");
    } else if (liquids > 1 && outletCount < 3) {
      const l1 = phaseStream(all, "liquid", 0), l2 = phaseStream(all, "liquid", 1);
      outlets.liquid = stream(sys, { flow_kmol_h: l1.flows.map((v, i) => v + l2.flows[i]), T_K: all.T_K, P_kPa: all.P_kPa });
    } else {
      outlets.liquid = phaseStream(all, "liquid", 0);
      if (outletCount >= 3) outlets.liquid2 = phaseStream(all, "liquid", 1);
    }
    const out = Object.values(outlets);
    return { outlets, duty_kW: sumH(out) - sumH(ins), notes, state: { T_K: all.T_K, P_kPa: all.P_kPa, VF: all.VF } };
  },
});

registerUnit({
  type: "heater", label: "Heater / cooler", duty: true, dutySpec: true, inlets: [{ port: "in", min: 1, max: Infinity }], outlets: [{ port: "out" }],
  checkSpec(spec) {
    // the outlet: T_K, duty_kW or VF, at P_kPa or the inlet pressure minus dP_kPa; or T_K and VF
    const has = k => spec[k] !== undefined && spec[k] !== null;
    const given = ["T_K", "duty_kW", "VF"].filter(has);
    const TVF = given.length === 2 && has("T_K") && has("VF");
    if (!(given.length === 1 || TVF)) throw fail("BAD_INPUT", `Heater: give the outlet temperature T_K, the duty duty_kW or the vapour fraction VF (or T_K and VF together) (got ${given.join(", ") || "none"}).`);
    if (has("P_kPa") && has("dP_kPa")) throw fail("BAD_INPUT", "Heater: give the outlet pressure P_kPa or the pressure drop dP_kPa, not both.");
    if (TVF && (has("P_kPa") || has("dP_kPa"))) throw fail("BAD_INPUT", "Heater: T_K and VF fix the outlet pressure; leave out P_kPa and dP_kPa.");
    const c = {};
    if (has("T_K")) c.T_K = num(spec.T_K, "Heater: T_K", { positive: true });
    if (has("duty_kW")) c.duty_kW = num(spec.duty_kW, "Heater: duty_kW");
    if (has("VF")) { c.VF = num(spec.VF, "Heater: VF", { min: 0 }); if (c.VF > 1) throw fail("BAD_INPUT", `Heater: VF must be between 0 and 1 (got ${spec.VF}).`); }
    if (has("P_kPa")) c.P_kPa = num(spec.P_kPa, "Heater: P_kPa", { positive: true });
    return { ...c, dP_kPa: has("dP_kPa") ? num(spec.dP_kPa, "Heater: dP_kPa", { min: 0 }) : 0, sizing: checkSizing(spec.sizing, "Heater") };
  },
  solve({ sys, inlets, spec }) {
    const s = mixed(sys, inlets.in).stream;   // several inlets: mixed first
    const { dP_kPa, sizing, ...c } = spec;
    if (c.P_kPa == null && !(c.T_K != null && c.VF != null)) c.P_kPa = s.P_kPa - dP_kPa;   // T and VF fix P themselves
    if (c.P_kPa != null && !(c.P_kPa > 0)) throw fail("BAD_INPUT", `Heater: the pressure drop (${dP_kPa} kPa) is larger than the inlet pressure (${s.P_kPa} kPa).`);
    const out = outletAt(sys, s.flows, s.H_kW ?? 0, c);
    const duty = (out.H_kW ?? 0) - (s.H_kW ?? 0);
    return { outlets: { out }, duty_kW: duty, ...(sizing ? { sizing: sizeHeater(sys, s, out, duty, sizing) } : {}) };
  },
});

registerUnit({
  type: "product", label: "Product", inlets: [{ port: "in" }], outlets: [],
  checkSpec() { return {}; },
  solve() { return { outlets: {}, duty_kW: 0 }; },
});

/**
 * The heater's optional sizing: { utility: { kind: "steam" | "water" | "fluid" | "electric", ... }, U, arrangement,
 * shells, zones } (src/units/heat-exchange.js). Checked here, used after the outlet is known.
 */
function checkSizing(z, who) {
  if (z == null) return null;
  if (typeof z !== "object" || Array.isArray(z)) throw fail("BAD_INPUT", `${who}: sizing must be an object such as { utility: { kind: "steam", P_kPa: 500 }, U: { service: "steam-water-oil" } }.`);
  const known = ["utility", "U", "arrangement", "shells", "zones"];
  const bad = Object.keys(z).filter(k => !known.includes(k));
  if (bad.length) throw fail("BAD_INPUT", `${who}: sizing: unknown key${bad.length > 1 ? "s" : ""} ${bad.join(", ")}. Known: ${known.join(", ")}.`);
  if (!z.utility || typeof z.utility !== "object") throw fail("BAD_INPUT", `${who}: sizing needs a utility, e.g. { kind: "steam", P_kPa: 500 }, { kind: "water", T_in_K, T_out_K } or { kind: "electric" }.`);
  if (!["steam", "water", "fluid", "electric"].includes(z.utility.kind)) throw fail("BAD_INPUT", `${who}: sizing: unknown utility "${z.utility.kind}". Known: steam, water, fluid, electric.`);
  if (z.arrangement != null && !ARRANGEMENTS.includes(z.arrangement)) throw fail("BAD_INPUT", `${who}: sizing: unknown arrangement "${z.arrangement}". Known: ${ARRANGEMENTS.join(", ")}.`);
  return JSON.parse(JSON.stringify(z));
}

/** The area and utility of a heater (or cooler) from its inlet, outlet and duty. */
function sizeHeater(sys, inlet, out, duty, z) {
  if (Math.abs(duty) < 1e-9) return { note: "No duty: nothing to size." };
  if (z.utility.kind === "electric") {
    if (duty < 0) throw fail("BAD_INPUT", "Heater: electric heating cannot cool; choose water or a fluid of your own.");
    return { utility: { kind: "electric", power_kW: duty }, area_m2: null, note: "Electric heating: the power is the duty; no heat-transfer area." };
  }
  const proc = { stream: inlet, dP_kPa: Math.max(0, inlet.P_kPa - out.P_kPa) };
  const hx = exchangerArea(sys, {
    duty_kW: Math.abs(duty), U: z.U ?? undefined, arrangement: z.arrangement, shells: z.shells, zones: z.zones,
    ...(duty > 0 ? { hot: { utility: z.utility }, cold: proc } : { hot: proc, cold: { utility: z.utility } }),
  });
  return summary(hx);
}

/** What a block reports of a sizing (exchangerArea without its streams). */
const summary = hx => ({
  duty_kW: hx.duty_kW, area_m2: hx.area_m2, U_W_m2K: hx.U_W_m2K, U_how: hx.U_how, UA_kW_K: hx.UA_kW_K, dT_mean_K: hx.dT_mean_K,
  dT_min_K: hx.dT_min_K, pinch: hx.pinch, F: hx.F, arrangement: hx.arrangement, shells: hx.shells, zones: hx.zones, hot: hx.hot, cold: hx.cold, notes: hx.notes,
  ...(hx.hot.kind !== "process" ? { utility: hx.hot } : hx.cold.kind !== "process" ? { utility: hx.cold } : {}),
});

// ---------------------------------------------------------------------------------------
// Proposal 0013: heat exchanger (two streams), valve, pump

const HX_SPECS = ["T_hot_out_K", "T_cold_out_K", "VF_hot_out", "VF_cold_out", "duty_kW", "dTmin_K"];

registerUnit({
  type: "hx", label: "Heat exchanger", inlets: [{ port: "hot", label: "hot" }, { port: "cold", label: "cold" }],
  outlets: [{ port: "hot", label: "hot" }, { port: "cold", label: "cold" }],
  checkSpec(spec) {
    const has = k => spec[k] !== undefined && spec[k] !== null;
    const given = HX_SPECS.filter(has);
    if (given.length !== 1) throw fail("BAD_INPUT", `Heat exchanger: give one of the hot outlet T_hot_out_K, the cold outlet T_cold_out_K, a vapour fraction VF_hot_out or VF_cold_out, the duty duty_kW, or the minimum approach dTmin_K (got ${given.join(", ") || "none"}).`);
    const c = { kind: given[0] };
    const k = given[0];
    if (k.startsWith("VF")) { c.value = num(spec[k], `Heat exchanger: ${k}`, { min: 0 }); if (c.value > 1) throw fail("BAD_INPUT", `Heat exchanger: ${k} must be between 0 and 1 (got ${spec[k]}).`); }
    else c.value = num(spec[k], `Heat exchanger: ${k}`, { positive: true });
    for (const d of ["dP_hot_kPa", "dP_cold_kPa"]) c[d] = has(d) ? num(spec[d], `Heat exchanger: ${d}`, { min: 0 }) : 0;
    c.sizing = spec.U != null || spec.arrangement != null ? { U: spec.U, arrangement: spec.arrangement, shells: spec.shells, zones: spec.zones } : { zones: spec.zones };
    if (c.sizing.arrangement != null && !ARRANGEMENTS.includes(c.sizing.arrangement)) throw fail("BAD_INPUT", `Heat exchanger: unknown arrangement "${c.sizing.arrangement}". Known: ${ARRANGEMENTS.join(", ")}.`);
    return c;
  },
  solve({ sys, inlets, spec }) {
    const hot = inlets.hot[0], cold = inlets.cold[0];
    // a side without flow (an empty recycle at its start): nothing is exchanged, the streams pass at their outlet pressures
    if (!(hot.F_kmol_h > 0) || !(cold.F_kmol_h > 0)) {
      const pass = (s, dP) => (s.F_kmol_h > 0 ? stream(sys, { flow_kmol_h: s.flows, P_kPa: s.P_kPa - dP, H_kW: s.H_kW }) : stream(sys, { flow_kmol_h: s.flows, T_K: s.T_K ?? 298.15, P_kPa: (s.P_kPa ?? 101.325) - dP }));
      return { outlets: { hot: pass(hot, spec.dP_hot_kPa), cold: pass(cold, spec.dP_cold_kPa) }, duty_kW: 0,
        notes: [`The ${!(hot.F_kmol_h > 0) ? "hot" : "cold"} side has no flow: nothing is exchanged.`], state: { duty_kW: 0 } };
    }
    const base = q => ({
      ...spec.sizing, ...(q != null ? { duty_kW: q } : {}),
      hot: { stream: hot, dP_kPa: spec.dP_hot_kPa, ...(spec.kind === "T_hot_out_K" ? { T_out_K: spec.value } : spec.kind === "VF_hot_out" ? { VF_out: spec.value } : {}) },
      cold: { stream: cold, dP_kPa: spec.dP_cold_kPa, ...(spec.kind === "T_cold_out_K" ? { T_out_K: spec.value } : spec.kind === "VF_cold_out" ? { VF_out: spec.value } : {}) },
    });
    if (!(hot.T_K > cold.T_K)) throw fail("BAD_INPUT", `Heat exchanger: the hot inlet (${+(hot.T_K - 273.15).toFixed(2)} °C) must be hotter than the cold inlet (${+(cold.T_K - 273.15).toFixed(2)} °C); swap the streams.`);
    let hx;
    if (spec.kind === "duty_kW") hx = exchangerArea(sys, base(spec.value));
    else if (spec.kind === "dTmin_K") hx = exchangerApproach(sys, { ...base(null), dTmin_K: spec.value });
    else hx = exchangerArea(sys, base(null));
    return { outlets: { hot: hx.outlets.hot, cold: hx.outlets.cold }, duty_kW: 0, sizing: summary(hx), state: { duty_kW: hx.duty_kW } };
  },
});

registerUnit({
  type: "valve", label: "Valve", inlets: [{ port: "in" }], outlets: [{ port: "out" }],
  checkSpec(spec) { return pressureSpec(spec, "Valve"); },
  solve({ sys, inlets, spec }) {
    const s = inlets.in[0];
    const P = spec.P_kPa ?? s.P_kPa - spec.dP_kPa;
    if (!(P > 0)) throw fail("BAD_INPUT", `Valve: the pressure drop (${spec.dP_kPa} kPa) is larger than the inlet pressure (${s.P_kPa} kPa).`);
    if (P > s.P_kPa + 1e-9) throw fail("BAD_INPUT", `Valve: the outlet pressure (${P} kPa) is above the inlet pressure (${s.P_kPa} kPa); a valve only lowers the pressure (a pump or compressor raises it).`);
    const out = s.F_kmol_h > 0 ? stream(sys, { flow_kmol_h: s.flows, P_kPa: P, H_kW: s.H_kW }) : stream(sys, { flow_kmol_h: s.flows, T_K: s.T_K, P_kPa: P });
    const notes = out.VF != null && s.VF != null && out.VF > s.VF + 1e-6 ? [`Part of the liquid flashes across the valve: vapour fraction ${+s.VF.toFixed(4)} to ${+out.VF.toFixed(4)}.`] : [];
    // an ideal gas keeps its temperature through a throttle (no Joule-Thomson effect): said when a vapour is throttled
    // with an activity model's ideal-gas vapour, as real gases cool (or warm)
    if (sys.kind !== "eos" && (sys.vapour ?? "ideal") === "ideal" && (s.VF ?? 0) > 1e-9) {
      notes.push("The vapour is an ideal gas in this method, so it does not cool across the valve (no Joule-Thomson effect); for a gas, choose Peng–Robinson or SRK, or a Peng–Robinson or SRK vapour.");
    }
    return { outlets: { out }, duty_kW: 0, notes };
  },
});

/** The pump's typical efficiency (see the file header): the low end of the NC State Extension's target range. */
export const PUMP_EFFICIENCY = 0.75;

registerUnit({
  type: "pump", label: "Pump", duty: true, energy: "work", inlets: [{ port: "in" }], outlets: [{ port: "out" }],
  checkSpec(spec) {
    const c = pressureSpec(spec, "Pump");
    const eta = spec.efficiency == null ? PUMP_EFFICIENCY : num(spec.efficiency, "Pump: efficiency", { positive: true });
    if (eta > 1) throw fail("BAD_INPUT", `Pump: the efficiency is a fraction, at most 1 (got ${spec.efficiency}); 75 % is 0.75.`);
    return { ...c, efficiency: eta, typical: spec.efficiency == null };
  },
  solve({ sys, inlets, spec }) {
    const s = inlets.in[0];
    const P = spec.P_kPa ?? s.P_kPa + spec.dP_kPa;
    if (!(P >= s.P_kPa)) throw fail("BAD_INPUT", `Pump: the outlet pressure (${P} kPa) is below the inlet pressure (${s.P_kPa} kPa); a pump raises the pressure (a valve lowers it).`);
    if (!(s.F_kmol_h > 0)) return { outlets: { out: stream(sys, { flow_kmol_h: s.flows, T_K: s.T_K, P_kPa: P }) }, duty_kW: 0, notes: ["No flow: no power."] };
    if (s.VF == null || s.VF > 1e-6 || s.phases.some(p => p.type === "vapour" && p.fraction > 1e-6)) {
      throw fail("BAD_INPUT", `Pump: a pump needs a liquid; its inlet has a vapour fraction of ${+(s.VF ?? 1).toFixed(4)}. Cool or condense it first, or use a compressor for a gas.`);
    }
    // volume flow of the liquid, m³/s: the molar volumes of the components add up (their liquid-density records)
    const T = s.T_K;
    let V = 0;
    s.components.forEach((id, i) => {
      const n = s.flows[i];
      if (!(n > 0)) return;
      const c = pure(id, { userData: sys.userData });
      let rho;
      try { rho = c.property("liquidDensity", T); } catch (e) { e.message = `Pump: the volume flow needs the liquid density of ${c.name}: ${e.message}`; throw e; }
      V += n * c.MW / rho / 3600;   // kmol/h × kg/kmol / (kg/m³) / (s/h)
    });
    const W = V * (P - s.P_kPa) / spec.efficiency;   // m³/s × kPa = kW
    const out = stream(sys, { flow_kmol_h: s.flows, P_kPa: P, H_kW: s.H_kW + W });
    const notes = [spec.typical ? `Efficiency ${spec.efficiency * 100} % (a typical value; give the pump's own). Volume flow ${+(V * 3600).toPrecision(5)} m³/h from the liquid densities.` : `Volume flow ${+(V * 3600).toPrecision(5)} m³/h from the liquid densities.`];
    return { outlets: { out }, duty_kW: W, notes, state: { power_kW: W, efficiency: spec.efficiency, volume_m3_h: V * 3600, dP_kPa: P - s.P_kPa } };
  },
});

/** Typical isentropic efficiencies of the compressor and the expander (see the file header, NETL 2019). */
export const COMPRESSOR_EFFICIENCY = 0.75;
export const EXPANDER_EFFICIENCY = 0.8;
const TURBO = { compressor: { label: "Compressor", up: true, eta: COMPRESSOR_EFFICIENCY }, expander: { label: "Expander", up: false, eta: EXPANDER_EFFICIENCY } };

for (const [type, t] of Object.entries(TURBO)) {
  registerUnit({
    type, label: t.label, duty: true, energy: "work", inlets: [{ port: "in" }], outlets: [{ port: "out" }],
    checkSpec(spec) {
      const has = k => spec[k] !== undefined && spec[k] !== null;
      const given = ["P_kPa", "dP_kPa", "ratio"].filter(has);
      if (given.length !== 1) throw fail("BAD_INPUT", `${t.label}: give one of the outlet pressure P_kPa, the pressure ${t.up ? "rise" : "drop"} dP_kPa or the pressure ratio (outlet over inlet) (got ${given.join(", ") || "none"}).`);
      const c = { [given[0]]: num(spec[given[0]], `${t.label}: ${given[0]}`, given[0] === "dP_kPa" ? { min: 0 } : { positive: true }) };
      if (c.ratio != null && (t.up ? c.ratio < 1 : c.ratio > 1)) throw fail("BAD_INPUT", `${t.label}: the pressure ratio is the outlet over the inlet pressure, so it is ${t.up ? "at least" : "at most"} 1 (got ${spec.ratio}).`);
      const eta = spec.efficiency == null ? t.eta : num(spec.efficiency, `${t.label}: efficiency`, { positive: true });
      if (eta > 1) throw fail("BAD_INPUT", `${t.label}: the efficiency is a fraction, at most 1 (got ${spec.efficiency}); 75 % is 0.75.`);
      return { ...c, efficiency: eta, typical: spec.efficiency == null };
    },
    solve({ sys, inlets, spec }) {
      const s = inlets.in[0];
      const P = spec.P_kPa ?? (spec.ratio != null ? s.P_kPa * spec.ratio : t.up ? s.P_kPa + spec.dP_kPa : s.P_kPa - spec.dP_kPa);
      if (!(P > 0)) throw fail("BAD_INPUT", `${t.label}: the pressure drop (${spec.dP_kPa} kPa) is larger than the inlet pressure (${s.P_kPa} kPa).`);
      if (t.up ? P < s.P_kPa - 1e-9 : P > s.P_kPa + 1e-9) {
        throw fail("BAD_INPUT", `${t.label}: the outlet pressure (${+P.toPrecision(6)} kPa) is ${t.up ? "below" : "above"} the inlet pressure (${s.P_kPa} kPa); ${t.up ? "a compressor raises the pressure (an expander or a valve lowers it)" : "an expander lowers the pressure (a compressor raises it)"}.`);
      }
      if (!(s.F_kmol_h > 0)) return { outlets: { out: stream(sys, { flow_kmol_h: s.flows, T_K: s.T_K, P_kPa: P }) }, duty_kW: 0, notes: ["No flow: no power."] };
      const liquid = s.phases.filter(p => p.type !== "vapour").reduce((a, p) => a + p.fraction, 0);
      if (liquid > 1e-6) {
        throw fail("BAD_INPUT", `${t.label}: ${t.up ? "a compressor" : "an expander"} takes a gas; its inlet is ${+(liquid * 100).toPrecision(3)} % liquid (vapour fraction ${+(s.VF ?? 0).toFixed(4)}). Heat it or separate the liquid first${t.up ? ", or use a pump for a liquid" : ""}.`);
      }
      // the inlet's molar entropy, from its phases (one vapour here)
      let s1 = 0;
      for (const p of s.phases) s1 += p.fraction * sys.phase(p.type, s.T_K, s.P_kPa, p.composition, { entropy: true }).s_J_molK;
      const iso = sys.flash({ z: s.z, P, S: s1 });
      const ws = iso.H_J_mol - s.h_J_mol;                       // J/mol
      const w = t.up ? ws / spec.efficiency : spec.efficiency * ws;
      const W = w * s.F_kmol_h / 3600;                          // kmol/h × J/mol = kW × 3600
      const out = stream(sys, { flow_kmol_h: s.flows, P_kPa: P, H_kW: s.H_kW + W });
      const notes = [];
      if (spec.typical) notes.push(`Isentropic efficiency ${spec.efficiency * 100} % (a typical value; give the machine's own).`);
      if (iso.VF < 1 - 1e-6) notes.push(`Liquid forms along the isentropic path (vapour fraction ${+iso.VF.toFixed(4)} at ${+(iso.T - 273.15).toFixed(2)} °C)${out.VF != null && out.VF < 1 - 1e-6 ? `, and at the outlet (vapour fraction ${+out.VF.toFixed(4)})` : ""}: a real machine may not take it.`);
      if (sys.kind !== "eos" && (sys.vapour ?? "ideal") === "ideal") notes.push("The vapour is an ideal gas in this method; for a gas at pressure, choose Peng–Robinson or SRK, or a Peng–Robinson or SRK vapour.");
      return {
        outlets: { out }, duty_kW: W, notes,
        state: { power_kW: W, efficiency: spec.efficiency, isentropic_T_K: iso.T, isentropic_VF: iso.VF, isentropic_power_kW: ws * s.F_kmol_h / 3600, ratio: P / s.P_kPa, dP_kPa: P - s.P_kPa },
      };
    },
  });
}

/** One of P_kPa (outlet) or dP_kPa (the change) for a valve or a pump. */
function pressureSpec(spec, who) {
  const has = k => spec[k] !== undefined && spec[k] !== null;
  if (has("P_kPa") === has("dP_kPa")) throw fail("BAD_INPUT", `${who}: give the outlet pressure P_kPa or the pressure ${who === "Valve" ? "drop" : "rise"} dP_kPa (one of them).`);
  return has("P_kPa") ? { P_kPa: num(spec.P_kPa, `${who}: P_kPa`, { positive: true }) } : { dP_kPa: num(spec.dP_kPa, `${who}: dP_kPa`, { min: 0 }) };
}



// ---------------------------------------------------------------------------------------
// Degrees of freedom: how many specifications each block needs, how many are given, and what
// is missing or too much. Optional values with a default (a mixer's outlet pressure, a heater's
// pressure drop, a separator's outlet conditions) are not counted: the default fills them.

const hasKey = (spec, k) => spec?.[k] !== undefined && spec?.[k] !== null && spec?.[k] !== "";
const listOf = keys => keys.length === 1 ? keys[0] : `${keys.slice(0, -1).join(", ")} or ${keys[keys.length - 1]}`;

/** Two of `keys` (a flash state); `what` names them for the person. */
function twoOf(spec, keys, what) {
  const given = keys.filter(k => hasKey(spec, k));
  return {
    needed: 2, given: Math.min(given.length, 2) + Math.max(0, given.length - 2),
    missing: given.length < 2 ? [`${2 - given.length === 2 ? "two" : "one more"} of ${listOf(keys)} (${what})`] : [],
    extra: given.length > 2 ? [`only two of ${listOf(keys)} can be given (now ${given.join(", ")})`] : [],
  };
}

/** Fractions over n outlets: one value per outlet ("rest" for one of them); n - 1 are independent. */
function fractionsDof(fr, n, what) {
  const list = Array.isArray(fr) ? fr : fr == null ? [] : [fr];
  const numbers = list.filter(v => v !== "rest" && v !== "" && v != null).length;
  if (list.length < n) {
    const k = n - list.length;
    return { needed: n - 1, given: Math.min(numbers, n - 1), extra: [],
      missing: [`${list.length ? `${k} more ` : ""}split fraction${n - (list.length ? list.length : 0) === 1 ? "" : "s"} for ${what} (one value per outlet, one may be "rest")`] };
  }
  if (list.length > n) return { needed: n - 1, given: numbers, missing: [], extra: [`${what}: ${list.length} fractions for ${n} outlets`] };
  // one per outlet: the sum to 1 (or "rest") fixes the last; the specification check tests the sum
  return { needed: n - 1, given: n - 1, missing: [], extra: [] };
}

const DOF = {
  feed(spec, { sys }) {
    const n = sys?.n ?? 0;
    const flows = hasKey(spec, "flow_kmol_h") || hasKey(spec, "flow_kg_h");
    const st = twoOf(spec, ["T_K", "P_kPa", "VF"], "the feed's state");
    return {
      needed: n + 2, given: (flows ? n : 0) + st.given,
      missing: [...(flows ? [] : [`the flows of the ${n} components (flow_kmol_h or flow_kg_h)`]), ...st.missing],
      extra: [...(hasKey(spec, "flow_kmol_h") && hasKey(spec, "flow_kg_h") ? ["flow_kmol_h and flow_kg_h: give one"] : []), ...st.extra],
    };
  },
  mixer: () => ({ needed: 0, given: 0, missing: [], extra: [] }),
  splitter: (spec, { outletCount }) => fractionsDof(spec?.fractions, outletCount, "the outlets"),
  separator(spec, { sys, outletCount }) {
    const fr = spec?.fractions && typeof spec.fractions === "object" && !Array.isArray(spec.fractions) ? spec.fractions : {};
    const out = { needed: 0, given: 0, missing: [], extra: [] };
    for (const [i, id] of (sys?.ids ?? []).entries()) {
      const key = Object.keys(fr).find(k => { try { return findComponent(k, sys.userData) === id; } catch { return false; } });
      const d = fractionsDof(key == null ? null : fr[key], outletCount, sys.names[i]);
      out.needed += d.needed; out.given += d.given; out.missing.push(...d.missing); out.extra.push(...d.extra);
    }
    return out;
  },
  flash: spec => twoOf(spec, ["T_K", "P_kPa", "VF", "duty_kW"], "the drum's conditions"),
  heater(spec) {
    const given = ["T_K", "duty_kW", "VF"].filter(k => hasKey(spec, k));
    const TVF = given.length === 2 && given.includes("T_K") && given.includes("VF");
    const extra = given.length > 1 && !TVF ? [`give one of T_K, duty_kW or VF (now ${given.join(", ")})`] : [];
    if (hasKey(spec, "P_kPa") && hasKey(spec, "dP_kPa")) extra.push("P_kPa and dP_kPa: give one");
    if (TVF && (hasKey(spec, "P_kPa") || hasKey(spec, "dP_kPa"))) extra.push("T_K and VF fix the pressure: leave out P_kPa and dP_kPa");
    return {
      needed: TVF ? 2 : 1, given: given.length + (extra.length && !TVF ? 0 : 0),
      missing: given.length ? [] : ["the outlet temperature T_K, the duty duty_kW or the vapour fraction VF"], extra,
    };
  },
  product: () => ({ needed: 0, given: 0, missing: [], extra: [] }),
  hx(spec) {
    const given = HX_SPECS.filter(k => hasKey(spec, k));
    return { needed: 1, given: Math.min(1, given.length) + Math.max(0, given.length - 1),
      missing: given.length ? [] : ["one of the hot or cold outlet temperature, a vapour fraction, the duty or the minimum approach dTmin_K"],
      extra: given.length > 1 ? [`give one of them (now ${given.join(", ")})`] : [] };
  },
  valve: spec => onePressure(spec, "drop"),
  pump: spec => onePressure(spec, "rise"),
  compressor: spec => turboPressure(spec, "rise"),
  expander: spec => turboPressure(spec, "drop"),
};

function turboPressure(spec, word) {
  const given = ["P_kPa", "dP_kPa", "ratio"].filter(k => hasKey(spec, k));
  return { needed: 1, given: given.length, missing: given.length ? [] : [`the outlet pressure P_kPa, the pressure ${word} dP_kPa or the pressure ratio`],
    extra: given.length > 1 ? [`give one of them (now ${given.join(", ")})`] : [] };
}

function onePressure(spec, word) {
  const P = hasKey(spec, "P_kPa"), dP = hasKey(spec, "dP_kPa");
  return { needed: 1, given: (P ? 1 : 0) + (dP ? 1 : 0), missing: P || dP ? [] : [`the outlet pressure P_kPa or the pressure ${word} dP_kPa`],
    extra: P && dP ? ["P_kPa and dP_kPa: give one"] : [] };
}

/**
 * The degrees of freedom of one block: { needed, given, missing, extra, ok, status, message }.
 * `status` is "ok" (fully specified and the values pass the block's checks), "missing" (under-
 * specified), "extra" (over-specified) or "invalid" (the count is right but a value is wrong;
 * `message` says which). Block types registered without a count are checked by their
 * specification check only.
 */
export function specStatus(type, spec = {}, { sys, outletCount } = {}) {
  const u = unitType(type);
  const multi = u.outlets.find(p => p.max > 1);
  const n = outletCount ?? (multi ? multi.min : u.outlets.filter(p => !p.optional).length);
  const d = (u.dof ?? DOF[type])?.(spec ?? {}, { sys, outletCount: n }) ?? { needed: null, given: null, missing: [], extra: [] };
  let status = d.missing.length ? "missing" : d.extra.length ? "extra" : "ok", message = "";
  if (status === "ok" && sys && u.checkSpec) {
    try { u.checkSpec(spec ?? {}, { sys, outletCount: n }); } catch (e) { status = "invalid"; message = e.message; }
  }
  if (status === "missing") message = `${u.label}: ${d.missing.length === 1 ? "missing" : `${d.missing.length} specifications missing`}: ${d.missing.join("; ")}.`;
  if (status === "extra") message = `${u.label}: too many specifications: ${d.extra.join("; ")}.`;
  return { ...d, ok: status === "ok", status, message };
}

// ---------------------------------------------------------------------------------------

/**
 * Calculate one block.
 * @param {string} type     a registered block type
 * @param {object} args
 * @param {object} args.sys          the property package (system)
 * @param {object} [args.inlets]     { port: stream | stream[] }
 * @param {object} [args.spec]       the block's specification
 * @param {number} [args.outletCount]  streams on the block's multi-stream outlet port (splitter,
 *   separator: default 2), or the number of outlet ports used (flash: 2, or 3 with liquid2)
 * @returns {{type:string, outlets:object, duty_kW:number, balance:{material:number, energy_kW:number},
 *   notes:string[], state?:object}}
 */
export function runUnit(type, { sys, inlets = {}, spec = {}, outletCount } = {}) {
  const u = unitType(type);
  if (!sys || typeof sys.flash !== "function") throw fail("BAD_INPUT", `${u.label}: a system (property package) is needed.`);
  if (spec == null || typeof spec !== "object" || Array.isArray(spec)) throw fail("BAD_INPUT", `${u.label}: the specification must be an object.`);
  const multiOut = u.outlets.find(p => p.max > 1);
  const n = outletCount ?? (multiOut ? multiOut.min : u.outlets.filter(p => !p.optional).length);
  if (multiOut && n < multiOut.min) throw fail("BAD_INPUT", `${u.label}: at least ${multiOut.min} outlets (got ${n}).`);
  // inlets: each port as a list of streams of this system
  for (const k of Object.keys(inlets)) if (!u.inlets.some(p => p.port === k)) throw fail("BAD_INPUT", `${u.label}: no inlet port "${k}". Ports: ${u.inlets.map(p => p.port).join(", ") || "none"}.`);
  const ins = {};
  for (const p of u.inlets) {
    const list = asList(inlets[p.port]);
    if (list.length < p.min) throw fail("BAD_INPUT", `${u.label}: the ${p.label} port needs ${p.min === 1 ? "a stream" : `at least ${p.min} streams`} (got ${list.length}).`);
    if (list.length > p.max) throw fail("BAD_INPUT", `${u.label}: the ${p.label} port takes ${p.max === 1 ? "one stream" : `at most ${p.max} streams`} (got ${list.length}).`);
    for (const s of list) {
      if (!s || !Array.isArray(s.flows) || s.flows.length !== sys.n || s.components.some((id, i) => id !== sys.ids[i])) {
        throw fail("BAD_INPUT", `${u.label}: an inlet stream${s?.id ? ` (${s.id})` : ""} does not belong to this system (${sys.ids.join(", ")}).`);
      }
    }
    ins[p.port] = list;
  }
  const s = u.checkSpec ? u.checkSpec(spec, { sys, outletCount: n }) : spec;
  const r = u.solve({ sys, inlets: ins, spec: s, outletCount: n });
  const outs = Object.values(r.outlets).flatMap(asList);
  const inList = Object.values(ins).flat();
  // material balance per component (a feed creates its flow; a product takes it out of the flowsheet)
  let material = 0;
  if (type !== "feed" && type !== "product") {
    const fin = sumFlows(sys, inList), fout = sumFlows(sys, outs);
    const scale = Math.max(1e-30, fin.reduce((a, v) => a + v, 0));
    material = Math.max(0, ...fin.map((v, i) => Math.abs(v - fout[i]) / scale));
    if (material > 1e-9) throw new Error(`Internal: ${u.label} does not close its material balance (relative error ${material.toExponential(2)}). Please report this.`);
  }
  const energy_kW = type === "feed" || type === "product" ? 0 : sumH(inList) + r.duty_kW - sumH(outs);
  return { type, outlets: r.outlets, duty_kW: r.duty_kW, balance: { material, energy_kW }, notes: r.notes ?? [], ...(r.state ? { state: r.state } : {}),
    ...(r.sizing ? { sizing: r.sizing } : {}) };
}
