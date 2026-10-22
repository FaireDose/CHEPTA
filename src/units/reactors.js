/**
 * Reactors (proposal 0010, step 3; layer 4): the conversion reactor and the yield reactor, registered as blocks of
 * src/units/units.js. Both take the flowsheet's reactions (src/reactions/reaction.js) and return, besides the outlet
 * and the duty, `reaction`: the generation of every component, the heat of the reactions, the extents and the
 * conversions. runUnit checks in + generation = out, the element (or mass) balance, and the energy balance
 *   duty = H_out - H_in + Σ_r ξ_r ΔrH_ref,r,
 * with ΔrH_ref the heat of reaction on the basis of the stream enthalpies (reaction.js, reactionHeat: from the
 * components' formation data, or from the heat of reaction the user gives with its source). The extents are in kmol/h,
 * so the heat in kW is ξ ΔrH / 3600.
 *
 * Conversion reactor ("conversion-reactor"):
 *   { reactions: [{ reaction: "R1", key: "carbon-dioxide", conversion: 0.5 }, ...], order: "parallel" | "series",
 *     T_K | duty_kW | VF, P_kPa | dP_kPa }
 *   Each reaction converts the given fraction of its key reactant: in parallel (the default) of the key's inlet flow,
 *   ξ_r = X_r F_key,in / (-ν_key,r), so the conversions of reactions sharing a key add up (at most 1); in series of what
 *   the reactions before it left, ξ_r = X_r F_key / (-ν_key,r), F_key after the earlier ones. A reaction that would
 *   need more of a co-reactant than there is is refused, naming it. The outlet is the mixture at the outlet's T (or
 *   duty, or vapour fraction) and P, flashed: it may leave as two phases, for a flash drum after it to split.
 *
 * Yield reactor ("yield-reactor"), for reactions known only by their products (fermentation, pyrolysis, a black box
 * from a paper):
 *   { key: "glucose", conversion: 1, basis: "mass" | "mole", yields: { ethanol: 0.48, "carbon-dioxide": 0.46, ... },
 *     closure: "water", heatOfReaction: { dH_J_mol, phase, source }, T_K | duty_kW | VF, P_kPa | dP_kPa }
 *   The yields are the amounts formed per unit of the key converted (kg per kg, or mol per mol); a negative yield is a
 *   co-reactant consumed. They must close the mass (per kg of key converted, the yields add up to 1 on the mass basis),
 *   within 1e-6; `closure` names the component that takes what the others leave (it must not come out negative). The
 *   element balance is reported, not enforced: a lumped product ("biomass", an unidentified residue) often has no exact
 *   formula, so the person sees by how much each element is off. The heat of reaction comes from the formation data
 *   of every component that changes, or from `heatOfReaction`: ΔrH per mol of key converted at 298.15 K with every
 *   species in the standard state of `phase` (the ideal gas, or the pure liquids), with its source.
 *
 * Rawlings and Ekerdt, Chemical Reactor Analysis and Design Fundamentals, 2nd ed., 6th printing (full text free to read
 * from the authors, https://sites.engineering.ucsb.edu/~jbraw/chemreacfun/), chapter 2: the extent of reaction and the
 * production rates R_j = Σ_i ν_ij r_i (eqn 2.10 there, with the extents in place of the rates for a reactor at a given
 * conversion); chapter 6 for the energy balance of a reactor with the heat of reaction.
 * Units: K, kPa, kmol/h, kW.
 */
import { fail } from "../util/errors.js";
import { stream } from "../stream/stream.js";
import { findComponent } from "../thermo/components.js";
import { reactionHeat, formationReference, standardStateShift } from "../reactions/reaction.js";
import { registerUnit, componentAtoms } from "./units.js";

const has = (spec, k) => spec?.[k] !== undefined && spec?.[k] !== null && spec?.[k] !== "";
const num = (v, what, { min = -Infinity, max = Infinity } = {}) => {
  const x = Number(v);
  if (!Number.isFinite(x) || x < min || x > max) {
    throw fail("BAD_INPUT", `${what} must be a number${min > -Infinity && max < Infinity ? ` from ${min} to ${max}` : min > -Infinity ? ` of at least ${min}` : ""} (got ${JSON.stringify(v)}).`);
  }
  return x;
};
const THERMAL = ["T_K", "duty_kW", "VF"];

/** The outlet conditions of a reactor: one of T_K, duty_kW and VF, at P_kPa or the inlet pressure minus dP_kPa. */
function outletConditions(spec, who) {
  const given = THERMAL.filter(k => has(spec, k));
  if (given.length !== 1) throw fail("BAD_INPUT", `${who}: give one of the outlet temperature T_K, the duty duty_kW or the outlet vapour fraction VF (got ${given.join(", ") || "none"}).`);
  if (has(spec, "P_kPa") && has(spec, "dP_kPa")) throw fail("BAD_INPUT", `${who}: give the outlet pressure P_kPa or the pressure drop dP_kPa, not both.`);
  const c = {};
  if (has(spec, "T_K")) c.T_K = num(spec.T_K, `${who}: T_K`, { min: 1e-9 });
  if (has(spec, "duty_kW")) c.duty_kW = num(spec.duty_kW, `${who}: duty_kW`);
  if (has(spec, "VF")) c.VF = num(spec.VF, `${who}: VF`, { min: 0, max: 1 });
  if (has(spec, "P_kPa")) c.P_kPa = num(spec.P_kPa, `${who}: P_kPa`, { min: 1e-9 });
  c.dP_kPa = has(spec, "dP_kPa") ? num(spec.dP_kPa, `${who}: dP_kPa`, { min: 0 }) : 0;
  return c;
}

/** The inlets mixed (flows and enthalpy flows added, at the lowest inlet pressure). */
function inletOf(sys, list) {
  const flows = new Array(sys.n).fill(0);
  let H = 0;
  for (const s of list) { s.flows.forEach((v, i) => { flows[i] += v; }); H += s.H_kW ?? 0; }
  const flowing = list.filter(s => s.F_kmol_h > 0);
  const P = Math.min(...(flowing.length ? flowing : list).map(s => s.P_kPa));
  return { flows, H_kW: H, P_kPa: P, T_K: (flowing[0] ?? list[0]).T_K };
}

/** The outlet stream and the duty: H_in + duty = H_out + heat (the heat of the reactions, kW). */
function outletAndDuty(sys, inlet, flows, heat_kW, c, who) {
  const P = c.P_kPa ?? inlet.P_kPa - c.dP_kPa;
  if (!(P > 0)) throw fail("BAD_INPUT", `${who}: the pressure drop (${c.dP_kPa} kPa) is larger than the inlet pressure (${inlet.P_kPa} kPa).`);
  const F = flows.reduce((a, v) => a + v, 0);
  let out;
  if (!(F > 0)) out = stream(sys, { flow_kmol_h: flows, T_K: c.T_K ?? inlet.T_K ?? 298.15, P_kPa: P });   // nothing comes in yet (a recycle at its start)
  else if (c.duty_kW != null) out = stream(sys, { flow_kmol_h: flows, P_kPa: P, H_kW: inlet.H_kW + c.duty_kW - heat_kW });
  else if (c.T_K != null) out = stream(sys, { flow_kmol_h: flows, T_K: c.T_K, P_kPa: P });
  else out = stream(sys, { flow_kmol_h: flows, VF: c.VF, P_kPa: P });
  const duty = c.duty_kW != null && F > 0 ? c.duty_kW : (out.H_kW ?? 0) - inlet.H_kW + heat_kW;
  return { out, duty };
}

/** A component of the system, by any of its names, as its index; BAD_INPUT naming the system otherwise. */
function indexOf(sys, key, who) {
  let id;
  try { id = findComponent(key, sys.userData); } catch (e) { throw fail("BAD_INPUT", `${who}: ${e.message}`); }
  const i = sys.ids.indexOf(id);
  if (i < 0) throw fail("BAD_INPUT", `${who}: ${key} is not a component of this simulation (${sys.names.join(", ")}). Add it to the components first.`);
  return i;
}

/** A flow below zero beyond rounding: the reaction needs more of a component than there is. */
function checkAvailable(sys, flows, fin, who, what) {
  const F = fin.reduce((a, v) => a + v, 0);
  flows.forEach((v, i) => {
    if (v < -1e-12 * Math.max(F, 1e-30)) {
      throw fail("BAD_INPUT", `${who}: ${what} needs ${(fin[i] - v).toPrecision(6)} kmol/h of ${sys.names[i]}, but only ${fin[i].toPrecision(6)} kmol/h come in. Lower the conversion, or feed more ${sys.names[i]}.`);
    }
  });
  return flows.map(v => Math.max(0, v));
}

// ---------------------------------------------------------------------------------------------------------------
// Conversion reactor

function checkConversion(spec, { sys, reactions = [] }) {
  const who = "Conversion reactor";
  const list = spec.reactions;
  if (!Array.isArray(list) || !list.length) throw fail("BAD_INPUT", `${who}: give the reactions, each with its key reactant and conversion: { reactions: [{ reaction: "R1", key: "carbon-dioxide", conversion: 0.5 }] }. The reactions themselves are written in the flowsheet's reactions list.`);
  const order = spec.order ?? "parallel";
  if (!["parallel", "series"].includes(order)) throw fail("BAD_INPUT", `${who}: order must be "parallel" or "series" (got ${JSON.stringify(spec.order)}).`);
  const byId = new Map(reactions.map(r => [r.id, r]));
  const steps = list.map((e, k) => {
    const where = `${who}, reaction ${k + 1}`;
    if (!e || typeof e !== "object") throw fail("BAD_INPUT", `${where}: give { reaction, key, conversion }.`);
    const r = byId.get(e.reaction);
    if (!r) throw fail("BAD_INPUT", `${where}: no reaction "${e.reaction}" in the flowsheet's reactions (${[...byId.keys()].join(", ") || "none written yet"}).`);
    const nu = sys.ids.map(id => r.stoichiometry[id] ?? 0);
    for (const id of Object.keys(r.stoichiometry)) if (!sys.ids.includes(id)) throw fail("BAD_INPUT", `${where} (${r.name}): ${id} is in the reaction but not a component of this simulation (${sys.names.join(", ")}).`);
    if (!has(e, "key")) throw fail("BAD_INPUT", `${where} (${r.name}): name its key reactant, whose conversion is given.`);
    const key = indexOf(sys, e.key, where);
    if (!(nu[key] < 0)) throw fail("BAD_INPUT", `${where} (${r.name}): the key ${sys.names[key]} must be a reactant of the reaction (a negative coefficient).`);
    if (!has(e, "conversion")) throw fail("BAD_INPUT", `${where} (${r.name}): give the conversion of ${sys.names[key]} (from 0 to 1).`);
    return { reaction: r, nu, key, conversion: num(e.conversion, `${where} (${r.name}): conversion`, { min: 0, max: 1 }) };
  });
  if (order === "parallel") {
    const total = new Map();
    for (const st of steps) total.set(st.key, (total.get(st.key) ?? 0) + st.conversion);
    for (const [key, X] of total) {
      if (X > 1 + 1e-12) throw fail("BAD_INPUT", `${who}: in parallel the conversions of ${sys.names[key]} add up to ${+X.toPrecision(6)}; they can convert at most all of it (1). Lower them, or put the reactions in series (each then converts what the ones before it left).`);
    }
  }
  return { steps, order, ...outletConditions(spec, who) };
}

registerUnit({
  type: "conversion-reactor", label: "Conversion reactor", duty: true, dutySpec: true, reactive: "elements",
  inlets: [{ port: "in", min: 1, max: Infinity }], outlets: [{ port: "out" }],
  checkSpec: checkConversion,
  dof(spec) {
    const list = Array.isArray(spec?.reactions) ? spec.reactions : [];
    const missing = [], extra = [];
    if (!list.length) missing.push("the reactions, each with its key reactant and conversion");
    list.forEach((e, k) => {
      if (!has(e, "reaction")) missing.push(`reaction ${k + 1}: which reaction`);
      if (!has(e, "key")) missing.push(`reaction ${k + 1}: its key reactant`);
      if (!has(e, "conversion")) missing.push(`reaction ${k + 1}: its conversion`);
    });
    const thermal = THERMAL.filter(k => has(spec, k));
    if (!thermal.length) missing.push("the outlet temperature T_K, the duty duty_kW or the outlet vapour fraction VF");
    if (thermal.length > 1) extra.push(`give one of T_K, duty_kW or VF (now ${thermal.join(", ")})`);
    if (has(spec, "P_kPa") && has(spec, "dP_kPa")) extra.push("P_kPa and dP_kPa: give one");
    const conv = list.filter(e => has(e, "conversion")).length;
    return { needed: Math.max(1, list.length) + 1, given: conv + Math.min(1, thermal.length) + Math.max(0, thermal.length - 1), missing, extra };
  },
  solve({ sys, inlets, spec, reactions }) {
    const who = "Conversion reactor";
    const inlet = inletOf(sys, inlets.in);
    const fin = inlet.flows;
    let flows = fin.slice();
    const extents = {}, conversions = {}, notes = [], heats = {};
    let heat_kW = 0;
    for (const st of spec.steps) {
      const base = spec.order === "series" ? flows[st.key] : fin[st.key];
      const xi = st.conversion * base / -st.nu[st.key];
      flows = flows.map((v, i) => v + st.nu[i] * xi);
      flows = checkAvailable(sys, flows, fin, who, `${st.reaction.name} at a conversion of ${st.conversion} of ${sys.names[st.key]}`);
      const h = reactionHeat(st.reaction, { userData: sys.userData });
      extents[st.reaction.id] = (extents[st.reaction.id] ?? 0) + xi;
      conversions[st.reaction.id] = { key: sys.ids[st.key], conversion: st.conversion };
      heats[st.reaction.id] = { dH_J_mol: h.dH_J_mol, from: h.from };
      heat_kW += xi * h.dH_J_mol / 3600;
      for (const n of h.notes) if (!notes.includes(n)) notes.push(n);
    }
    const generation = flows.map((v, i) => v - fin[i]);
    const { out, duty } = outletAndDuty(sys, inlet, flows, heat_kW, spec, who);
    const keyConversion = Object.fromEntries([...new Set(spec.steps.map(st => st.key))].map(k => [sys.ids[k], fin[k] > 0 ? -generation[k] / fin[k] : 0]));
    return { outlets: { out }, duty_kW: duty, notes,
      reaction: { generation, heat_kW, extents_kmol_h: extents, conversions, keyConversion, heats, order: spec.order } };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Yield reactor

function checkYield(spec, { sys }) {
  const who = "Yield reactor";
  if (!has(spec, "key")) throw fail("BAD_INPUT", `${who}: name the key reactant (the yields are per unit of it converted).`);
  const key = indexOf(sys, spec.key, who);
  if (!has(spec, "conversion")) throw fail("BAD_INPUT", `${who}: give the conversion of ${sys.names[key]} (from 0 to 1).`);
  const conversion = num(spec.conversion, `${who}: conversion`, { min: 0, max: 1 });
  const basis = spec.basis ?? "mass";
  if (!["mass", "mole"].includes(basis)) throw fail("BAD_INPUT", `${who}: basis must be "mass" (kg per kg of ${sys.names[key]} converted) or "mole" (mol per mol) (got ${JSON.stringify(spec.basis)}).`);
  const y = spec.yields;
  if (!y || typeof y !== "object" || Array.isArray(y) || !Object.keys(y).length) {
    throw fail("BAD_INPUT", `${who}: give the yields per unit of ${sys.names[key]} converted, e.g. { yields: { ethanol: 0.48, "carbon-dioxide": 0.46 } } (negative for a co-reactant consumed).`);
  }
  // mol of each component formed per mol of key converted
  const dn = new Array(sys.n).fill(0);
  dn[key] = -1;
  const given = new Set();
  for (const [k, v] of Object.entries(y)) {
    const i = indexOf(sys, k, `${who}, yields`);
    if (i === key) throw fail("BAD_INPUT", `${who}: the key ${sys.names[key]} is consumed by the conversion; leave it out of the yields.`);
    if (given.has(i)) throw fail("BAD_INPUT", `${who}: ${sys.names[i]} is given twice in the yields.`);
    given.add(i);
    const yi = num(v, `${who}: the yield of ${sys.names[i]}`);
    dn[i] = basis === "mass" ? yi * sys.MW[key] / sys.MW[i] : yi;
  }
  let closure = null;
  const massOff = () => dn.reduce((a, v, i) => a + v * sys.MW[i], 0) / sys.MW[key];   // kg per kg of key converted
  if (has(spec, "closure")) {
    closure = indexOf(sys, spec.closure, `${who}, closure`);
    if (closure === key) throw fail("BAD_INPUT", `${who}: the closure must be a product, not the key ${sys.names[key]}.`);
    if (given.has(closure)) throw fail("BAD_INPUT", `${who}: the closure ${sys.names[closure]} takes what the other yields leave; leave it out of the yields.`);
    const rest = -massOff();   // kg per kg of key still to place
    if (rest < -1e-9) throw fail("BAD_INPUT", `${who}: the yields add up to ${(1 - rest).toPrecision(6)} kg per kg of ${sys.names[key]} converted, more than there is; the closure ${sys.names[closure]} would come out negative.`);
    dn[closure] = Math.max(0, rest) * sys.MW[key] / sys.MW[closure];
  } else {
    const off = massOff();
    if (Math.abs(off) > 1e-6) {
      throw fail("BAD_INPUT", `${who}: the yields do not close the mass: they make ${(1 + off).toPrecision(6)} kg per kg of ${sys.names[key]} converted (it must be 1). Correct them, or name a closure component that takes the rest (closure: "...").`);
    }
    // within 1e-6 (rounded yields): the products are scaled to close the mass exactly
    const made = dn.reduce((a, v, i) => a + (v > 0 ? v * sys.MW[i] : 0), 0), used = -dn.reduce((a, v, i) => a + (v < 0 ? v * sys.MW[i] : 0), 0);
    if (made > 0) dn.forEach((v, i) => { if (v > 0) dn[i] = v * used / made; });
  }
  let heatOfReaction = null;
  if (spec.heatOfReaction != null) {
    const h = spec.heatOfReaction;
    if (!h || typeof h !== "object" || Array.isArray(h)) throw fail("BAD_INPUT", `${who}: heatOfReaction must be { dH_J_mol, phase: "vapour" | "liquid", source }: per mol of ${sys.names[key]} converted, at 298.15 K.`);
    num(h.dH_J_mol, `${who}: heatOfReaction.dH_J_mol`);
    const phase = { vapour: "vapour", gas: "vapour", vapor: "vapour", liquid: "liquid" }[String(h.phase ?? "").toLowerCase()];
    if (!phase) throw fail("BAD_INPUT", `${who}: heatOfReaction.phase must be "vapour" (every species as the ideal gas) or "liquid" (as the pure liquids).`);
    if (typeof h.source !== "string" || !h.source.trim()) throw fail("BAD_INPUT", `${who}: heatOfReaction needs its "source".`);
    heatOfReaction = { dH_J_mol: h.dH_J_mol, phase, source: h.source };
  }
  return { key, conversion, basis, dn, closure, heatOfReaction, ...outletConditions(spec, who) };
}

/** The elements of the yields per mol of key converted: { element: net mol } (0 for a balanced set). */
function yieldElements(sys, dn) {
  const net = {}, scale = {};
  dn.forEach((v, i) => {
    if (v === 0) return;
    const atoms = componentAtoms(sys, i);
    if (!atoms) throw fail("MISSING_DATA", `Yield reactor: ${sys.names[i]} has no formula CHEPTA can read, so its element balance cannot be stated.`);
    for (const [el, k] of Object.entries(atoms)) { net[el] = (net[el] ?? 0) + v * k; scale[el] = (scale[el] ?? 0) + Math.abs(v * k); }
  });
  return Object.fromEntries(Object.entries(net).filter(([el, d]) => Math.abs(d) > 1e-6 * scale[el]));
}

registerUnit({
  type: "yield-reactor", label: "Yield reactor", duty: true, dutySpec: true, reactive: "mass",
  inlets: [{ port: "in", min: 1, max: Infinity }], outlets: [{ port: "out" }],
  checkSpec: checkYield,
  dof(spec) {
    const missing = [], extra = [];
    if (!has(spec, "key")) missing.push("the key reactant");
    if (!has(spec, "conversion")) missing.push("the conversion of the key reactant");
    const y = spec?.yields;
    const yields = y && typeof y === "object" && !Array.isArray(y) && Object.keys(y).length;
    if (!yields) missing.push("the yields per unit of the key converted");
    const thermal = THERMAL.filter(k => has(spec, k));
    if (!thermal.length) missing.push("the outlet temperature T_K, the duty duty_kW or the outlet vapour fraction VF");
    if (thermal.length > 1) extra.push(`give one of T_K, duty_kW or VF (now ${thermal.join(", ")})`);
    if (has(spec, "P_kPa") && has(spec, "dP_kPa")) extra.push("P_kPa and dP_kPa: give one");
    return { needed: 3, given: (has(spec, "conversion") ? 1 : 0) + (yields ? 1 : 0) + Math.min(1, thermal.length) + Math.max(0, thermal.length - 1), missing, extra };
  },
  solve({ sys, inlets, spec }) {
    const who = "Yield reactor";
    const inlet = inletOf(sys, inlets.in);
    const fin = inlet.flows;
    const converted = spec.conversion * fin[spec.key];   // kmol/h of key
    const generation = spec.dn.map(v => v * converted);
    const flows = checkAvailable(sys, fin.map((v, i) => v + generation[i]), fin, who, `the yields at a conversion of ${spec.conversion} of ${sys.names[spec.key]}`);
    const notes = [];
    const off = yieldElements(sys, spec.dn);
    if (Object.keys(off).length) {
      notes.push(`The yields do not balance the elements: ${Object.entries(off).map(([el, d]) => `${el} ${d > 0 ? "+" : ""}${+d.toPrecision(4)}`).join(", ")} mol per mol of ${sys.names[spec.key]} converted (positive: more in the products). The mass closes; a lumped product without an exact formula usually explains it.`);
    }
    // the heat of reaction, per mol of key converted, on the basis of the stream enthalpies
    let dH, from;
    try {
      dH = 0;
      spec.dn.forEach((v, i) => { if (v !== 0) dH += v * formationReference(sys.ids[i], { userData: sys.userData }).Hf_J_mol; });
      from = "formation data";
    } catch (e) {
      if (!spec.heatOfReaction) {
        e.message = `${who}: ${e.message} Or give the heat of reaction with its source: heatOfReaction: { dH_J_mol, phase, source } (per mol of ${sys.names[spec.key]} converted, at 298.15 K).`;
        throw e;
      }
      let shift = 0;
      spec.dn.forEach((v, i) => { if (v !== 0) shift += v * standardStateShift(sys.ids[i], spec.heatOfReaction.phase, sys.userData); });
      dH = spec.heatOfReaction.dH_J_mol - shift;
      from = `the heat of reaction given (${spec.heatOfReaction.dH_J_mol} J/mol of ${sys.names[spec.key]} at 298.15 K, ${spec.heatOfReaction.phase === "vapour" ? "ideal gases" : "pure liquids"}; ${spec.heatOfReaction.source})`;
      notes.push(`No heat of reaction from formation data (${e.message}); the given heat of reaction is used.`);
    }
    const heat_kW = converted * dH / 3600;
    const { out, duty } = outletAndDuty(sys, inlet, flows, heat_kW, spec, who);
    return { outlets: { out }, duty_kW: duty, notes,
      reaction: { generation, heat_kW, converted_kmol_h: { [sys.ids[spec.key]]: converted }, keyConversion: { [sys.ids[spec.key]]: spec.conversion },
        heat: { dH_J_mol: dH, per: `mol of ${sys.names[spec.key]} converted`, from }, elementImbalance: off,
        ...(spec.closure != null ? { closure: { [sys.ids[spec.closure]]: spec.dn[spec.closure] } } : {}) } };
  },
});
