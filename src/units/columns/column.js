/**
 * The Column block (proposal 0015, Part I, section 1; milestone M1): one block for distillation, with the modes
 *
 *   "shortcut"   Fenske, Underwood and Gilliland for a light and a heavy key (src/units/columns/shortcut.js, where the
 *                equations, their open source and where the method holds are written);
 *   "rigorous"   MESH on equilibrium stages (milestone M2a): the column engine (src/units/columns/engine.js, where the
 *                equations, the solver, its open sources and its checks are written), with the flowsheet's method or
 *                its own (milestone M2b), and optionally two liquids on the stages and a decanter.
 *
 * The configurations (proposal 0015, Part I, section 1): "distillation" (the default), and "absorber" and "stripper"
 * (milestone M3, step 7): no condenser; no reboiler, or a stripper's reboiler. Extraction is the Extraction block
 * (src/units/extraction.js), on the same engine (solveCascade, phases "LL"). The specification:
 *
 *   { mode: "shortcut",                                   // default
 *     light_key: "benzene", heavy_key: "toluene",         // component ids or names
 *     recovery_light_key_in_distillate: 0.99,            // of the light key's feed
 *     recovery_heavy_key_in_bottoms: 0.99,               // of the heavy key's feed
 *     reflux_ratio: 2.5  |  reflux_over_minimum: 1.3,     // one of them
 *     condenser: "total" | "partial",                     // default total (a partial condenser: vapour distillate)
 *     P_kPa: 101.325 }                                    // default the feed's pressure; no pressure drop
 *
 * The rigorous mode's specification:
 *
 *   { mode: "rigorous",
 *     stages: 20,                                         // equilibrium stages and the condenser, numbered from the top
 *                                                         // (1 the condenser, N the partial reboiler, both counted)
 *     feed_stage: 10,                                     // or one stage per inlet: [8, 14]
 *     condenser: "total" | "partial",                     // default total
 *     P_kPa: 101.325,                                     // default the (first) feed's pressure; no pressure drop
 *     two of: reflux_ratio, boilup_ratio, distillate_kmol_h, bottoms_kmol_h, condenser_duty_kW, reboiler_duty_kW,
 *     and the design specifications (milestone M4; ./specifications.js), each in place of one of those:
 *     specifications: [
 *       { kind: "purity", product: "distillate" | "bottoms" | "side_draw", component: "ethanol", value: 0.95,
 *         basis: "mole" | "mass" },                       // default mole; draw: 2 names the second side draw
 *       { kind: "recovery", product, component, value: 0.99 },          // the share of the component's feed
 *       { kind: "component_flow", product, component, flow_kmol_h: 40 | flow_kg_h: 1800 },
 *       { kind: "stage_temperature", stage: 12, T_K: 360 } ],
 *     distillate_purity: { component, value, basis }, bottoms_purity: { ... },   // short forms of a purity
 *     side_draws: [{ stage: 8, phase: "liquid" | "vapour", flow_kmol_h: 10 }],   // (M4) from a stage between the
 *                                                         // condenser and the reboiler; one outlet stream each on
 *                                                         // the port "side", in this order; without flow_kmol_h
 *                                                         // the flow is found, for one more specification
 *     max_iterations: 50,                                 // optional: a limit on the Newton iterations (none: the
 *                                                         // solver's own limits, and the continuation if needed)
 *     phases: "VL" | "VLL",                               // optional (M2b): "VLL" looks for two liquids on the stages
 *                                                         // (activity models only), off by default
 *     condenser: "decanter", reflux_liquid: "light",      // (M2b, with "VLL") the condensate splits; one liquid (light
 *                                                         // or heavy, by density) is the reflux, the other the
 *                                                         // distillate; then one specification, not the reflux ratio
 *                                                         // or the condenser duty
 *     method: { model, vapour, sets, prefer },            // optional (M2b): the column's own property method
 *     sizing: { tray_spacing_m: 0.6, design_fraction: 0.8 } }  // optional: the diameter by Fair's method, or with
 *                                                         // diameter_m a given column checked; the fraction of flooding
 *                                                         // of every tray, FLOODING and WEEPING (./hydraulics.js)
 *
 * An absorber or a stripper (rigorous only; the shortcut is for distillation):
 *
 *   { configuration: "absorber" | "stripper",
 *     stages: 8,                                          // equilibrium stages, numbered from the top (no condenser)
 *     feed_stage: [1, 8],                                 // one per inlet; default: one feed on stage 1, or two on
 *                                                         // stages 1 (the liquid) and N (the gas)
 *     reboiler: "none" | "partial",                       // a stripper's; default none (a stripping gas fed below)
 *     with a reboiler one of boilup_ratio, bottoms_kmol_h, reboiler_duty_kW, distillate_kmol_h (the gas leaving the top),
 *     stage_duties_kW: [{ stage: 4, duty_kW: -100 }],      // optional: heat added to a stage (negative: removed, an
 *                                                         // intercooler); adiabatic otherwise
 *     P_kPa, method, sizing, max_iterations as the rigorous column }
 *
 *   The outlets keep the port ids "distillate" (the gas leaving the top) and "bottoms" (the liquid leaving the
 *   bottom), so project files keep working; the workbench names them "gas out" and "liquid out" (the maintainer,
 *   2026-11-04). A gas dissolving in a liquid needs a method that describes its solubility (docs/METHOD_SELECTION.md,
 *   step 2; proposal 0017): in an activity model with water the gases with a Henry's law constant dissolve by
 *   Henry's law; any other component above its critical temperature is refused; an equation of state with a light gas
 *   and a polar component needs a k_ij for each such pair (a warning about its range), and sour water and amines are
 *   refused until electrolytes (gasSolubilityCheck).
 *
 * The column's own method (proposal 0015, Part I, section 3): the P-H boundary at every stream that enters or leaves
 * the column keeps the component flows, the pressure and the enthalpy flow, and finds the temperature by a P-H flash in
 * the receiving method (the change is reported in state.boundary); a state the receiving method cannot represent is
 * refused with the reason. The flowsheet's energy balance then closes, since the enthalpy flows are kept.
 *
 * The keys of the other mode are kept (so that a person can switch back) and not used. Several feeds: the rigorous mode
 * only; each enters its stage as one stream. Outlets as the shortcut's; `profile` holds every stage (T, P, L, V, x, y,
 * duty), `state` the products, the duties, the residuals by group, their tolerances and the iterations.
 *
 * Design specifications (milestone M4): the solver finds the reflux ratio, the distillate flow or the boil-up ratio
 * that were left open (state.adjusted) so that each specification is met; state.design_specifications lists each with
 * the value asked, the value reached and their difference. A specification no column can meet is refused with the
 * reason and what would make it feasible (an azeotrope, too few stages, a reflux below the minimum: ./specifications.js).
 * The shortcut takes the recoveries of its two keys, not purities.
 *
 * Outlets: distillate (saturated liquid of a total condenser, saturated vapour of a partial one) and bottoms
 * (saturated liquid), both at P. The block's duty (its energy stream) is the reboiler's duty minus the condenser's,
 * so the flowsheet's energy balance closes; the two duties are given apart in `state` (condenser_kW, reboiler_kW) and
 * in the profile. The result's `state` holds the shortcut's numbers (N_min, R_min, N, the feed stage, the relative
 * volatilities); `profile` is the minimal table: the condenser, the feed stage and the reboiler.
 * Units: K, kPa, kmol/h, kW.
 */
import { fail } from "../../util/errors.js";
import { stream } from "../../stream/stream.js";
import { system } from "../../system.js";
import { findComponent, componentRecord } from "../../thermo/components.js";
import { EOS_GASES, isPolar } from "../../thermo/method-advice.js";
import { HENRY_GASES } from "../../thermo/henry.js";
import { anyBubbleT } from "../../equilibrium/bubble-any.js";
import { refuseNotUsableLiquid, kijText } from "../../thermo/eos/system.js";
import { registerUnit } from "../units.js";
import { solveCascade } from "./engine.js";
import { fug, boilup, wholeStages, VOLATILITY_TOLERANCE } from "./shortcut.js";
import { hydraulicsOptions, columnHydraulics } from "./hydraulics.js";

/** The column's modes: built, and planned. */
/** The column's configurations (proposal 0015, Part I, section 1); extraction comes later. */
export const COLUMN_CONFIGURATIONS = Object.freeze([
  { configuration: "distillation", status: "available", summary: "a condenser and a reboiler; shortcut or rigorous" },
  { configuration: "absorber", status: "available", summary: "a gas washed by a liquid: no condenser, no reboiler; rigorous" },
  { configuration: "stripper", status: "available", summary: "a liquid stripped by a gas, or by its own boil-up with a reboiler; no condenser; rigorous" },
]);
export const COLUMN_MODES = Object.freeze([
  { mode: "shortcut", status: "available", summary: "Fenske, Underwood and Gilliland, for a light and a heavy key" },
  { mode: "rigorous", status: "available", summary: "MESH on equilibrium stages, solved by Newton's method on all equations (Naphtali-Sandholm)" },
]);

const SPEC_KEYS = ["mode", "light_key", "heavy_key", "recovery_light_key_in_distillate", "recovery_heavy_key_in_bottoms", "reflux_ratio",
  "reflux_over_minimum", "condenser", "P_kPa", "distillate_purity", "bottoms_purity",
  "stages", "feed_stage", "max_iterations", "boilup_ratio", "distillate_kmol_h", "bottoms_kmol_h", "condenser_duty_kW", "reboiler_duty_kW", "sizing",
  "phases", "reflux_liquid", "method", "configuration", "reboiler", "stage_duties_kW", "specifications", "side_draws"];
/** The specifications of a reboiled stripper (one of them). */
const STRIPPER_SPECS = ["boilup_ratio", "bottoms_kmol_h", "reboiler_duty_kW", "distillate_kmol_h"];
/** The keys of a column's own property method (milestone M2b), as a flowsheet's thermo: model, vapour, sets, prefer. */
const METHOD_KEYS = ["model", "vapour", "sets", "prefer", "mixing"];
/** The rigorous mode's specifications (two of them), and the engine's names for them. */
const RIGOROUS_SPECS = { reflux_ratio: "reflux_ratio", boilup_ratio: "boilup_ratio", distillate_kmol_h: "distillate_rate",
  bottoms_kmol_h: "bottoms_rate", condenser_duty_kW: "condenser_duty", reboiler_duty_kW: "reboiler_duty" };
const KMOL_H = 1000 / 3600;   // mol/s per kmol/h
const PURITY = ["distillate_purity", "bottoms_purity"];
/** The design specifications of the rigorous column (milestone M4), and the keys each may hold. */
const DESIGN_KINDS = { purity: ["product", "draw", "component", "value", "basis"], recovery: ["product", "draw", "component", "value"],
  component_flow: ["product", "draw", "component", "flow_kmol_h", "flow_kg_h"], stage_temperature: ["stage", "T_K"] };
const M4 = ["specifications", "side_draws", ...PURITY];
const has = (spec, k) => spec?.[k] !== undefined && spec?.[k] !== null && spec?.[k] !== "";
const fmt = v => +Number(v).toPrecision(4);

function keyIndex(sys, v, what) {
  if (!has({ v }, "v")) throw fail("BAD_INPUT", `Column: give the ${what} (a component of the flowsheet).`);
  let id;
  try { id = findComponent(String(v), sys.userData); } catch (e) { throw fail("BAD_INPUT", `Column: ${what}: ${e.message}`); }
  const i = sys.ids.indexOf(id);
  if (i < 0) throw fail("BAD_INPUT", `Column: the ${what} ${v} is not a component of this flowsheet (${sys.ids.join(", ")}).`);
  return i;
}

function fraction(v, what) {
  const x = Number(v);
  if (!Number.isFinite(x) || !(x > 0 && x < 1)) throw fail("BAD_INPUT", `Column: ${what} must be a fraction between 0 and 1, both excluded (got ${JSON.stringify(v)}).`);
  return x;
}

/** The design specifications of a rigorous column, as the engine takes them (mol/s, kg/s, K), and as given (`shown`). */
function designSpecs(spec, sys) {
  const list = [];
  for (const k of PURITY) {
    if (!has(spec, k)) continue;
    const v = spec[k];
    if (!v || typeof v !== "object" || Array.isArray(v)) throw fail("BAD_INPUT", `Column: ${k}: name the component, as in { component: "${sys.ids[0]}", value: 0.95 } (a mole fraction; basis: "mass" for a mass fraction); got ${JSON.stringify(v)}.`);
    list.push({ kind: "purity", product: k.split("_")[0], ...v });
  }
  if (has(spec, "specifications")) {
    if (!Array.isArray(spec.specifications)) throw fail("BAD_INPUT", `Column: specifications must be a list such as [{ kind: "purity", product: "distillate", component: "${sys.ids[0]}", value: 0.95 }] (got ${JSON.stringify(spec.specifications)}).`);
    list.push(...spec.specifications);
  }
  return list.map((d, k) => {
    const what = `specifications[${k}]`;
    if (!d || typeof d !== "object" || !DESIGN_KINDS[d.kind]) throw fail("BAD_INPUT", `Column: ${what}: kind must be one of ${Object.keys(DESIGN_KINDS).join(", ")} (got ${JSON.stringify(d?.kind)}).`);
    const bad = Object.keys(d).filter(key => key !== "kind" && !DESIGN_KINDS[d.kind].includes(key));
    if (bad.length) throw fail("BAD_INPUT", `Column: ${what} (${d.kind}): unknown key${bad.length > 1 ? "s" : ""} ${bad.join(", ")}. Known: ${DESIGN_KINDS[d.kind].join(", ")}.`);
    if (d.kind === "stage_temperature") {
      const T = Number(d.T_K);
      if (!(Number.isFinite(T) && T > 0)) throw fail("BAD_INPUT", `Column: ${what} (stage_temperature): give T_K, the stage's temperature in K (got ${JSON.stringify(d.T_K)}).`);
      return { engine: { kind: d.kind, stage: d.stage, value: T }, shown: { kind: d.kind, stage: d.stage }, unit: "K", scale: 1 };
    }
    if (!["distillate", "bottoms", "side_draw"].includes(d.product)) throw fail("BAD_INPUT", `Column: ${what} (${d.kind}): product must be "distillate", "bottoms" or "side_draw" (got ${JSON.stringify(d.product)}).`);
    const i = keyIndex(sys, d.component, `component of ${what}`);
    const where = { product: d.product, ...(d.product === "side_draw" ? { draw: d.draw ?? 1 } : {}) };
    const shown = { kind: d.kind, ...where, component: sys.ids[i] };
    if (d.kind === "component_flow") {
      if (has(d, "flow_kmol_h") === has(d, "flow_kg_h")) throw fail("BAD_INPUT", `Column: ${what} (component_flow): give flow_kmol_h or flow_kg_h, one of them.`);
      const mass = has(d, "flow_kg_h"), v = Number(mass ? d.flow_kg_h : d.flow_kmol_h);
      if (!(Number.isFinite(v) && v > 0)) throw fail("BAD_INPUT", `Column: ${what} (component_flow): the flow must be a positive number (got ${JSON.stringify(mass ? d.flow_kg_h : d.flow_kmol_h)}).`);
      // the engine's units: mol/s, or kg/s on the mass basis
      return { engine: { kind: d.kind, ...where, component: i, basis: mass ? "mass" : "mole", value: mass ? v / 3600 : v * KMOL_H }, shown: { ...shown, basis: mass ? "mass" : "mole" }, unit: mass ? "kg/h" : "kmol/h", scale: mass ? 3600 : 1 / KMOL_H };
    }
    const v = Number(d.value);
    if (!Number.isFinite(v)) throw fail("BAD_INPUT", `Column: ${what} (${d.kind}): value must be a fraction between 0 and 1 (got ${JSON.stringify(d.value)}).`);
    const basis = d.kind === "purity" ? d.basis ?? "mole" : null;
    return { engine: { kind: d.kind, ...where, component: i, ...(basis ? { basis } : {}), value: v }, shown: { ...shown, ...(basis ? { basis } : {}) }, unit: basis ? `${basis} fraction` : "fraction of the feed", scale: 1 };
  });
}

/** The side draws of a rigorous column: { stage, phase, flow_kmol_h } each (without a flow: found by the solver). */
function sideDraws(spec, N) {
  if (!has(spec, "side_draws")) return [];
  if (!Array.isArray(spec.side_draws)) throw fail("BAD_INPUT", `Column: side_draws must be a list such as [{ stage: 8, phase: "liquid", flow_kmol_h: 10 }] (got ${JSON.stringify(spec.side_draws)}).`);
  return spec.side_draws.map((d, k) => {
    const what = `side_draws[${k}]`;
    if (!d || typeof d !== "object") throw fail("BAD_INPUT", `Column: ${what} must be an object such as { stage: 8, phase: "liquid", flow_kmol_h: 10 }.`);
    const bad = Object.keys(d).filter(key => !["stage", "phase", "flow_kmol_h"].includes(key));
    if (bad.length) throw fail("BAD_INPUT", `Column: ${what}: unknown key${bad.length > 1 ? "s" : ""} ${bad.join(", ")}. Known: stage, phase, flow_kmol_h.`);
    const st = Number(d.stage), phase = d.phase ?? "liquid";
    if (!(Number.isInteger(st) && st >= 2 && st <= N - 1)) throw fail("BAD_INPUT", `Column: ${what}: stage must be a whole number from 2 to ${N - 1}, between the condenser (1) and the reboiler (${N}) (got ${JSON.stringify(d.stage)}).`);
    if (!["liquid", "vapour"].includes(phase)) throw fail("BAD_INPUT", `Column: ${what}: phase must be "liquid" or "vapour" (got ${JSON.stringify(d.phase)}).`);
    if (!has(d, "flow_kmol_h")) return { stage: st, phase };
    const v = Number(d.flow_kmol_h);
    if (!(Number.isFinite(v) && v > 0)) throw fail("BAD_INPUT", `Column: ${what}: flow_kmol_h must be a positive number, or left out to be found for one more specification (got ${JSON.stringify(d.flow_kmol_h)}).`);
    return { stage: st, phase, rate: v * KMOL_H };
  });
}

function checkSpec(spec, { sys }) {
  // an unknown key is refused by runUnit and specStatus (specKeys)
  const configuration = spec.configuration ?? "distillation";
  if (!COLUMN_CONFIGURATIONS.some(c => c.configuration === configuration)) throw fail("BAD_INPUT", `Column: configuration "${configuration}" is not one of ${COLUMN_CONFIGURATIONS.map(c => c.configuration).join(", ")}.`);
  if (configuration !== "distillation") return checkSeparator(spec, configuration, sys);
  for (const k of ["reboiler", "stage_duties_kW"]) if (has(spec, k)) throw fail("BAD_INPUT", `Column: ${k} is an absorber's or a stripper's (configuration "absorber" or "stripper"); a distillation column has a reboiler, and its duties are its specifications.`);
  const mode = spec.mode ?? "shortcut";
  if (!COLUMN_MODES.some(m => m.mode === mode)) throw fail("BAD_INPUT", `Column: mode "${mode}" is not one of ${COLUMN_MODES.map(m => m.mode).join(", ")}.`);
  if (mode === "rigorous") return checkRigorous(spec, sys);
  // the shortcut takes the recoveries of its keys; purities, other design specifications and side draws are the
  // rigorous column's
  const m4 = M4.filter(k => has(spec, k));
  if (m4.length) throw fail("BAD_INPUT", `Column: ${m4.join(", ")}: the shortcut column (Fenske, Underwood, Gilliland) takes the recoveries of its two keys (recovery_light_key_in_distillate, recovery_heavy_key_in_bottoms); purities, the other design specifications and side draws are the rigorous column's (mode: "rigorous").`);
  const condenser = spec.condenser ?? "total";
  if (!["total", "partial"].includes(condenser)) throw fail("BAD_INPUT", `Column: condenser must be "total" or "partial" (got ${JSON.stringify(condenser)}).`);
  const lk = keyIndex(sys, spec.light_key, "light key"), hk = keyIndex(sys, spec.heavy_key, "heavy key");
  if (lk === hk) throw fail("BAD_INPUT", "Column: the light and the heavy key must be two different components.");
  if (has(spec, "reflux_ratio") === has(spec, "reflux_over_minimum")) throw fail("BAD_INPUT", "Column: give the reflux ratio (reflux_ratio) or the reflux as a multiple of the minimum (reflux_over_minimum), one of them.");
  const out = { mode, condenser, lk, hk, sizingIgnored: has(spec, "sizing"),
    recoveryLK: fraction(spec.recovery_light_key_in_distillate, "the light key's recovery in the distillate"),
    recoveryHK: fraction(spec.recovery_heavy_key_in_bottoms, "the heavy key's recovery in the bottoms") };
  if (has(spec, "reflux_ratio")) {
    out.R = Number(spec.reflux_ratio);
    if (!(Number.isFinite(out.R) && out.R > 0)) throw fail("BAD_INPUT", `Column: reflux_ratio must be a positive number (got ${JSON.stringify(spec.reflux_ratio)}).`);
  } else {
    out.refluxOverMinimum = Number(spec.reflux_over_minimum);
    if (!(Number.isFinite(out.refluxOverMinimum) && out.refluxOverMinimum > 1)) throw fail("BAD_INPUT", `Column: reflux_over_minimum must be a number above 1 (got ${JSON.stringify(spec.reflux_over_minimum)}).`);
  }
  if (has(spec, "P_kPa")) {
    out.P = Number(spec.P_kPa);
    if (!(Number.isFinite(out.P) && out.P > 0)) throw fail("BAD_INPUT", `Column: P_kPa must be a positive number (got ${JSON.stringify(spec.P_kPa)}).`);
  }
  return out;
}

function checkRigorous(spec, sys) {
  const N = Number(spec.stages);
  if (!(Number.isInteger(N) && N >= 3)) throw fail("BAD_INPUT", `Column: stages must be a whole number of 3 or more, the condenser and the reboiler counted (got ${JSON.stringify(spec.stages)}).`);
  const fsList = Array.isArray(spec.feed_stage) ? spec.feed_stage : [spec.feed_stage];
  const feedStages = fsList.map(v => {
    const k = Number(v);
    if (!(Number.isInteger(k) && k >= 2 && k <= N - 1)) throw fail("BAD_INPUT", `Column: feed_stage must be a whole number from 2 to ${N - 1}, between the condenser (1) and the reboiler (${N}) (got ${JSON.stringify(v)}).`);
    return k;
  });
  const condenser = spec.condenser ?? "total";
  if (!["total", "partial", "decanter"].includes(condenser)) throw fail("BAD_INPUT", `Column: condenser must be "total", "partial" or "decanter" (got ${JSON.stringify(condenser)}).`);
  const phases = spec.phases ?? "VL";
  // "LL" is refused when solved (not built yet, the outcome "unsupported"), as a purity is
  if (phases === "LL") return { mode: "rigorous", extraction: true };
  if (!["VL", "VLL"].includes(phases)) throw fail("BAD_INPUT", `Column: phases must be "VL" (vapour and one liquid, the default) or "VLL" (look for two liquids on the stages) (got ${JSON.stringify(spec.phases)}).`);
  const decanter = condenser === "decanter";
  if (decanter && phases !== "VLL") throw fail("BAD_INPUT", "Column: a decanter on the condenser separates two liquids; turn on \"look for two liquids on the stages\" (phases: \"VLL\").");
  const refluxLiquid = spec.reflux_liquid ?? "light";
  if (!["light", "heavy"].includes(refluxLiquid)) throw fail("BAD_INPUT", `Column: reflux_liquid must be "light" or "heavy" (got ${JSON.stringify(spec.reflux_liquid)}).`);
  if (has(spec, "reflux_liquid") && !decanter) throw fail("BAD_INPUT", "Column: reflux_liquid is the decanter's: give it with condenser: \"decanter\".");
  const given = Object.keys(RIGOROUS_SPECS).filter(k => has(spec, k));
  const design = designSpecs(spec, sys), draws = sideDraws(spec, N), open = draws.filter(d => d.rate == null).length;
  const need = (decanter ? 1 : 2) + open;
  if (given.length + design.length !== need) {
    const got = [...given, ...design.map(d => d.engine.kind)];
    const more = ` A design specification (specifications: ${Object.keys(DESIGN_KINDS).join(", ")}) counts as one${open ? `; ${open} side draw${open > 1 ? "s" : ""} without a flow add${open > 1 ? "" : "s"} ${open} (give the flow, or one specification more)` : ""}.`;
    throw fail("BAD_INPUT", (decanter
      ? `Column: with a decanter the reflux is the whole ${refluxLiquid} liquid, so the column needs ${need === 1 ? "one specification" : `${need} specifications`}, from boilup_ratio, distillate_kmol_h, bottoms_kmol_h, reboiler_duty_kW; ${got.length ? `got ${got.join(", ")}` : "none given"}.`
      : `Column: the rigorous column needs ${need === 2 ? "two" : need} specifications, from ${Object.keys(RIGOROUS_SPECS).join(", ")}; ${got.length ? `got ${got.join(", ")}` : "none given"}.`) + more);
  }
  const specs = given.map(k => {
    const v = Number(spec[k]);
    if (!(Number.isFinite(v) && v > 0)) throw fail("BAD_INPUT", `Column: ${k} must be a positive number (got ${JSON.stringify(spec[k])}).`);
    return { key: k, kind: RIGOROUS_SPECS[k], value: k.endsWith("_kmol_h") ? v * KMOL_H : k.endsWith("_kW") ? v * 1000 : v };
  });
  const out = { mode: "rigorous", N, feedStages, condenser, phases, refluxLiquid, specs, design, draws, method: has(spec, "method") ? checkMethod(spec.method) : null };
  if (has(spec, "sizing")) out.sizing = hydraulicsOptions(spec.sizing);
  if (has(spec, "max_iterations")) {
    out.maxIterations = Number(spec.max_iterations);
    if (!(Number.isInteger(out.maxIterations) && out.maxIterations >= 1)) throw fail("BAD_INPUT", `Column: max_iterations must be a whole number of 1 or more (got ${JSON.stringify(spec.max_iterations)}).`);
  }
  if (has(spec, "P_kPa")) {
    out.P = Number(spec.P_kPa);
    if (!(Number.isFinite(out.P) && out.P > 0)) throw fail("BAD_INPUT", `Column: P_kPa must be a positive number (got ${JSON.stringify(spec.P_kPa)}).`);
  }
  return out;
}

/** An absorber or a stripper (milestone M3): the rigorous engine without a condenser; see the file header. */
function checkSeparator(spec, configuration, sys) {
  const what = configuration === "absorber" ? "An absorber" : "A stripper";
  if ((spec.mode ?? "rigorous") !== "rigorous") throw fail("BAD_INPUT", `Column: ${what.toLowerCase()} is solved stage by stage (mode "rigorous"); the shortcut (Fenske, Underwood, Gilliland) is for distillation with a light and a heavy key.`);
  // refused when solved (not built, the outcome "unsupported"), as two liquids on an absorber's stages are
  if (has(spec, "side_draws")) return { mode: "rigorous", configuration, sideDraws: true };
  const N = Number(spec.stages);
  if (!(Number.isInteger(N) && N >= 2)) throw fail("BAD_INPUT", `Column: stages must be a whole number of 2 or more, the equilibrium stages of the ${configuration} (got ${JSON.stringify(spec.stages)}).`);
  if (has(spec, "condenser") && spec.condenser !== "none") throw fail("BAD_INPUT", `Column: ${what.toLowerCase()} has no condenser (got condenser ${JSON.stringify(spec.condenser)}); for a condenser choose the configuration "distillation".`);
  const reboiler = spec.reboiler ?? "none";
  if (!["none", "partial"].includes(reboiler)) throw fail("BAD_INPUT", `Column: reboiler must be "none" or "partial" (got ${JSON.stringify(spec.reboiler)}).`);
  if (configuration === "absorber" && reboiler !== "none") throw fail("BAD_INPUT", "Column: an absorber has no reboiler; a column with a reboiler and no condenser is a reboiled stripper (configuration \"stripper\").");
  const phases = spec.phases ?? "VL";
  // two liquids on an absorber's stages: refused when solved (not built yet, the outcome "unsupported"), as "LL" is
  if (phases === "VLL" || phases === "LL") return { mode: "rigorous", configuration, twoLiquids: phases };
  if (phases !== "VL") throw fail("BAD_INPUT", `Column: ${what.toLowerCase()} holds a vapour and one liquid (phases "VL"); phases ${JSON.stringify(phases)} is not one of VL, VLL.`);
  for (const k of ["reflux_liquid", "reflux_ratio", "condenser_duty_kW"]) if (has(spec, k)) throw fail("BAD_INPUT", `Column: ${k} needs a condenser, and ${what.toLowerCase()} has none.`);
  // the feed stages: one per inlet, 1 to N; the defaults put a liquid on the top and a gas on the bottom
  const fsList = !has(spec, "feed_stage") ? null : Array.isArray(spec.feed_stage) ? spec.feed_stage : [spec.feed_stage];
  const feedStages = fsList?.map(v => {
    const k = Number(v);
    const last = reboiler === "partial" ? N - 1 : N;
    if (!(Number.isInteger(k) && k >= 1 && k <= last)) throw fail("BAD_INPUT", `Column: feed_stage must be a whole number from 1 (the top) to ${last} (${reboiler === "partial" ? "above the reboiler" : "the bottom"}) (got ${JSON.stringify(v)}).`);
    return k;
  }) ?? null;
  const given = STRIPPER_SPECS.filter(k => has(spec, k)).concat(["reflux_ratio", "condenser_duty_kW"].filter(k => has(spec, k)));
  const need = reboiler === "partial" ? 1 : 0;
  const design = designSpecs(spec, sys);
  if (design.length && !need) throw fail("BAD_INPUT", `Column: ${what.toLowerCase()} without a reboiler has no degree of freedom for a design specification (${design.map(d => d.engine.kind).join(", ")}): what leaves it follows from its feeds, its stages and its stage duties. Change the solvent or gas flow, or the stages; a reboiled stripper takes one specification.`);
  if (given.length + design.length !== need) {
    throw fail("BAD_INPUT", need
      ? `Column: a reboiled stripper takes one specification, from ${STRIPPER_SPECS.join(", ")}, or a design specification (specifications); ${given.length + design.length ? `got ${[...given, ...design.map(d => d.engine.kind)].join(", ")}` : "none given"}.`
      : `Column: ${what.toLowerCase()} without a reboiler takes no specification: what leaves it follows from its feeds, its stages and its stage duties (got ${given.join(", ")}).`);
  }
  const specs = given.map(k => {
    const v = Number(spec[k]);
    if (!(Number.isFinite(v) && v > 0)) throw fail("BAD_INPUT", `Column: ${k} must be a positive number (got ${JSON.stringify(spec[k])}).`);
    return { key: k, kind: RIGOROUS_SPECS[k], value: k.endsWith("_kmol_h") ? v * KMOL_H : k.endsWith("_kW") ? v * 1000 : v };
  });
  const duties = [];
  if (has(spec, "stage_duties_kW")) {
    if (!Array.isArray(spec.stage_duties_kW)) throw fail("BAD_INPUT", `Column: stage_duties_kW must be a list such as [{ stage: 4, duty_kW: -100 }] (got ${JSON.stringify(spec.stage_duties_kW)}).`);
    spec.stage_duties_kW.forEach((d, k) => {
      const st = Number(d?.stage), q = Number(d?.duty_kW);
      const last = reboiler === "partial" ? N - 1 : N;
      if (!(Number.isInteger(st) && st >= 1 && st <= last)) throw fail("BAD_INPUT", `Column: stage_duties_kW[${k}]: stage must be a whole number from 1 to ${last}${reboiler === "partial" ? " (the reboiler's duty follows from its specification)" : ""} (got ${JSON.stringify(d?.stage)}).`);
      if (!Number.isFinite(q)) throw fail("BAD_INPUT", `Column: stage_duties_kW[${k}]: duty_kW must be a number, heat added to the stage (negative: removed) (got ${JSON.stringify(d?.duty_kW)}).`);
      duties.push({ stage: st, Q_W: q * 1000 });
    });
  }
  const out = { mode: "rigorous", configuration, N, feedStages, condenser: "none", reboiler, phases: "VL", specs, duties, design, draws: [],
    method: has(spec, "method") ? checkMethod(spec.method) : null };
  if (has(spec, "sizing")) out.sizing = hydraulicsOptions(spec.sizing);
  if (has(spec, "max_iterations")) {
    out.maxIterations = Number(spec.max_iterations);
    if (!(Number.isInteger(out.maxIterations) && out.maxIterations >= 1)) throw fail("BAD_INPUT", `Column: max_iterations must be a whole number of 1 or more (got ${JSON.stringify(spec.max_iterations)}).`);
  }
  if (has(spec, "P_kPa")) {
    out.P = Number(spec.P_kPa);
    if (!(Number.isFinite(out.P) && out.P > 0)) throw fail("BAD_INPUT", `Column: P_kPa must be a positive number (got ${JSON.stringify(spec.P_kPa)}).`);
  }
  return out;
}

/** Amines that absorb acid gases by reaction (gas treating): an electrolyte model's work (milestone M5). */
const AMINES = new Set(["mea", "dea", "mdea"]);

/**
 * Can the method describe a gas dissolving in the liquid of an absorber or a stripper (docs/METHOD_SELECTION.md,
 * step 2; proposal 0017; the maintainer, 2026-11-04)? Returns the warnings to give, or throws NOT_AVAILABLE with the
 * reason. T_K: the highest temperature in the column (its feeds before solving, its stages after).
 *  - An activity model (or the ideal solution): a gas with a Henry's law constant in water is a Henry component of the
 *    system (f = H x); any other component above its critical temperature would take its solubility from a vapour
 *    pressure extrapolated beyond the critical point: refused.
 *  - Peng-Robinson or SRK with a light gas and a polar component: allowed where every such gas-polar pair has a k_ij
 *    (fitted or databank), with a warning about its range, as the DWSIM Property Packages Guide advises ("Sour gas
 *    (with H2S, CO2): PR with kij ... Set binary interaction parameters"; "Peng-Robinson ... performs poorly for
 *    water/alcohol mixtures"; https://dwsim.org/tutorials/en/reference/property-packages-guide.html, read 2026-11-04);
 *    refused without one. Sour water (ammonia with hydrogen sulfide or carbon dioxide in water) and amines are refused
 *    in every case: they react in the liquid ("Sour Water ... Specialized for gas treating", the same guide), which
 *    needs an electrolyte model (milestone M5).
 */
function gasSolubilityCheck(csys, T_K, what) {
  const eos = csys.kind === "eos";
  const comps = csys.ids.map(id => componentRecord(id, csys.userData));
  const nonvol = i => csys.nonvolatile?.[i];
  const above = csys.ids.map((id, i) => (!nonvol(i) && !csys.henry?.[i] && Number.isFinite(comps[i]?.Tc_K) && comps[i].Tc_K < T_K ? i : -1)).filter(i => i >= 0);
  const names = list => list.map(i => csys.names[i]).join(", ");
  const has = id => csys.ids.includes(id);
  const reacting = csys.ids.filter(id => AMINES.has(id));
  if (has("water") && has("ammonia") && (has("hydrogen-sulfide") || has("carbon-dioxide"))) reacting.push("sour water");
  if (reacting.length) {
    throw fail("NOT_AVAILABLE", `Column: ${what}: ${reacting.includes("sour water") ? "ammonia with hydrogen sulfide or carbon dioxide in water (sour water)" : csys.names.filter((_, i) => AMINES.has(csys.ids[i])).join(", ")} absorbs acid gases by reaction in the liquid (ions), which needs an electrolyte model ("Sour Water ... Specialized for gas treating", DWSIM Property Packages Guide). CHEPTA's electrolyte models come with milestone M5 of the methods track; until then such a column is refused.`);
  }
  // a gas with a Henry's law constant in water, with water and another liquid: not a Henry component (proposal 0017)
  const mixed = !eos && has("water") && csys.ids.map((id, i) => i).filter(i => HENRY_GASES.includes(csys.ids[i]) && !csys.henry?.[i]);
  if (mixed?.length) {
    const others = csys.ids.map((id, i) => i).filter(i => csys.ids[i] !== "water" && !HENRY_GASES.includes(csys.ids[i]));
    throw fail("NOT_AVAILABLE", `Column: ${what}: ${names(mixed)} dissolve${mixed.length > 1 ? "" : "s"} by Henry's law in water alone (proposal 0017); with ${names(others)} in the liquid the solvent is not water alone, and CHEPTA has no Henry's law constants for a mixed or other solvent. Use water alone as the solvent, or Peng-Robinson or SRK where the gas and the liquid's components have their k_ij.`);
  }
  if (!eos && above.length) {
    throw fail("NOT_AVAILABLE", `Column: ${what}: ${above.map(i => `${csys.names[i]} (critical temperature ${fmt(comps[i].Tc_K)} K)`).join(", ")} ${above.length > 1 ? "are" : "is"} above ${above.length > 1 ? "their" : "its"} critical temperature at ${fmt(T_K)} K, so ${csys.model === "ideal" ? "the ideal solution (Raoult's law)" : csys.model} would take ${above.length > 1 ? "their" : "its"} solubility from a vapour pressure extrapolated beyond the critical point. CHEPTA has Henry's law constants only for ${HENRY_GASES.length} gases in water (proposal 0017), and ${above.length > 1 ? "these are" : "this is"} not one of them in this mixture. For hydrocarbons and light gases without polar components, use Peng-Robinson or SRK.`);
  }
  const warnings = [];
  // a pair whose k_ij is marked not usable (CO2 + water, src/data/kij.json): every column has a liquid holding it
  if (eos) refuseNotUsableLiquid(csys, csys.ids.map(() => 1), `Column: ${what}`);
  if (eos) {
    const gas = csys.ids.map((id, i) => (EOS_GASES.has(id) || above.includes(i) ? i : -1)).filter(i => i >= 0);
    const polar = csys.ids.map((id, i) => (isPolar(id, comps[i]?.formula) ? i : -1)).filter(i => i >= 0);
    const pairOf = (i, j) => (csys.info?.pairs ?? []).find(p => p.pair?.includes(csys.names[i]) && p.pair?.includes(csys.names[j]) && Number.isFinite(p.kij) && p.tier !== "none");   // "none": no k_ij in the databank, 0 used
    const missing = [], found = [];
    for (const i of gas) for (const j of polar) { const p = pairOf(i, j); if (p) found.push({ i, j, p }); else missing.push([i, j]); }
    if (missing.length) {
      throw fail("NOT_AVAILABLE", `Column: ${what}: ${csys.model} with ${missing.map(([i, j]) => `${csys.names[i]} + ${csys.names[j]}`).join(", ")}, a light gas and a polar liquid without a k_ij: the classical mixing rule then gives the gas's solubility without any fit to data. Add the pair's k_ij as your own data (My data), or, for a gas in water, use an activity model, where ${HENRY_GASES.length} gases dissolve by Henry's law (proposal 0017).`);
    }
    if (found.length) {
      warnings.push({ code: "METHOD_RANGE", message: `${csys.model} with ${names([...new Set(gas)])} dissolving in ${names([...new Set(polar)])}: the gas's solubility rests on the k_ij of ${found.map(({ i, j, p }) => `${csys.names[i]} + ${csys.names[j]} (${kijText(p)}${p.T_range_K ? `, fitted at ${p.T_range_K[0]}-${p.T_range_K[1]} K` : ""})`).join(", ")}, and an equation of state with the classical mixing rule describes a polar liquid poorly (DWSIM Property Packages Guide: "performs poorly for water/alcohol mixtures"). Check the result against measured solubilities; for a gas in water an activity model with Henry's law is the alternative (proposal 0017).`,
        remedy: "Compare with the activity model, where the gas dissolves by Henry's law in water." });
    }
  }
  return warnings;
}

/** A column's own property method: { model, vapour?, sets?, prefer? }, as a flowsheet's thermo. */
function checkMethod(m) {
  if (!m || typeof m !== "object" || Array.isArray(m)) throw fail("BAD_INPUT", `Column: method must be an object such as { model: "NRTL", vapour: "ideal" } (got ${JSON.stringify(m)}).`);
  const bad = Object.keys(m).filter(k => !METHOD_KEYS.includes(k));
  if (bad.length) throw fail("BAD_INPUT", `Column: method: unknown key${bad.length > 1 ? "s" : ""} ${bad.join(", ")}. Known: ${METHOD_KEYS.join(", ")}.`);
  if (typeof m.model !== "string" || !m.model) throw fail("BAD_INPUT", "Column: method needs a model (NRTL, UNIQUAC, WILSON, MOD-UNIFAC-2, ideal, PR or SRK).");
  if (m.mixing != null) {
    if (String(m.mixing).toUpperCase() !== "MHV1") throw fail("BAD_INPUT", `Column: method.mixing "${m.mixing}" is not a mixing rule of CHEPTA. Use "MHV1" (PR or SRK + gE (MHV1)), or leave it out.`);
    if (!["PR", "SRK"].includes(String(m.model).toUpperCase())) throw fail("BAD_INPUT", `Column: method.mixing "MHV1" goes with model "PR" or "SRK"; model "${m.model}" has none.`);
    return { ...m, mixing: "MHV1" };
  }
  return { ...m };
}

/** The design specifications a spec carries, by name (for the count of the degrees of freedom). */
const designKeys = spec => [...PURITY.filter(k => has(spec, k)), ...(Array.isArray(spec.specifications) ? spec.specifications.map(d => `specifications: ${d?.kind}`) : [])];

/** The degrees of freedom of the shortcut: the two keys, their two recoveries and the reflux (the condenser and the
 *  pressure have defaults). A purity counts in place of its recovery, so that it reaches the solver and is refused
 *  there as not built yet; so does the rigorous mode. */
function dof(spec) {
  // an unknown configuration is refused by checkSpec, with the known ones
  if (has(spec, "configuration") && !COLUMN_CONFIGURATIONS.some(c => c.configuration === spec.configuration)) return { needed: 0, given: 0, missing: [], extra: [] };
  if (["absorber", "stripper"].includes(spec.configuration)) {
    // the stages; with a reboiler one specification (the feed stages have defaults)
    const k = spec.reboiler === "partial" ? 1 : 0;
    const out = { needed: 1 + k, given: has(spec, "stages") ? 1 : 0, missing: has(spec, "stages") ? [] : ["the number of stages"], extra: [] };
    const g = [...STRIPPER_SPECS.filter(key => has(spec, key)), ...designKeys(spec)];
    out.given += Math.min(g.length, k);
    if (g.length < k) out.missing.push("one specification (boil-up ratio, bottoms or top gas flow, reboiler duty)");
    if (g.length > k) out.extra.push(`${g.join(", ")}: ${k ? "give one" : "a column without a reboiler takes none"}`);
    return out;
  }
  if (spec.mode === "rigorous") {
    const out = { needed: 4, given: 0, missing: [], extra: [] };
    for (const [k, what] of [["stages", "the number of stages"], ["feed_stage", "the feed stage"]]) {
      if (has(spec, k)) out.given += 1; else out.missing.push(what);
    }
    // a decanter returns one liquid entirely: one specification fewer
    // a side draw without a flow: its flow is found, for one more specification
    const open = Array.isArray(spec.side_draws) ? spec.side_draws.filter(d => d && !has(d, "flow_kmol_h")).length : 0;
    const k = (spec.condenser === "decanter" ? 1 : 2) + open;
    out.needed = 2 + k;
    const g = [...Object.keys(RIGOROUS_SPECS).filter(key => has(spec, key)), ...designKeys(spec)];
    out.given += Math.min(g.length, k);
    if (g.length < k) out.missing.push(`${k - g.length === 2 ? "two specifications" : k === 1 ? "one specification" : k - g.length === 1 ? "one more specification" : `${k - g.length} more specifications`} (${spec.condenser === "decanter" ? "boil-up ratio, distillate or bottoms flow, reboiler duty" : "reflux ratio, boil-up ratio, distillate or bottoms flow, condenser or reboiler duty"}, or a design specification: purity, recovery, component flow, stage temperature)`);
    if (g.length > k) out.extra.push(`${g.join(", ")}: give ${k === 1 ? "one (the decanter fixes the reflux)" : k === 2 ? "two" : k}`);
    return out;
  }
  if ((spec.mode ?? "shortcut") !== "shortcut") return { needed: 0, given: 0, missing: [], extra: [] };
  const rows = [
    [["light_key"], "the light key"], [["heavy_key"], "the heavy key"],
    [["recovery_light_key_in_distillate"], "the light key's recovery in the distillate"],
    [["recovery_heavy_key_in_bottoms"], "the heavy key's recovery in the bottoms"],
    [["reflux_ratio", "reflux_over_minimum"], "the reflux ratio or the reflux over the minimum"],
  ];
  const out = { needed: rows.length, given: 0, missing: [], extra: [] };
  // purities, design specifications and side draws are the rigorous column's: said first, whatever else is missing
  const m4 = M4.filter(k => has(spec, k));
  if (m4.length) return { needed: rows.length, given: rows.length + m4.length, missing: [], extra: [`${m4.join(", ")}: the shortcut takes the recoveries of its two keys; purities, the other design specifications and side draws are the rigorous column's (mode "rigorous")`] };
  for (const [keys, what] of rows) {
    const g = keys.filter(k => has(spec, k));
    out.given += g.length;
    if (!g.length) out.missing.push(what);
    if (g.length > 1) out.extra.push(`${g.join(" and ")}: give one`);
  }
  return out;
}

/** K-values at the bubble point of x at P: { T, K } (K_i = y_i / x_i; a component absent from x has none). */
function bubbleK(sys, x, P) {
  const r = anyBubbleT(sys, x, P);
  return { T: r.T, K: x.map((v, i) => (v > 0 ? r.y[i] / v : null)) };
}

function solveShortcut(sys, feed, s) {
  const names = sys.names;
  if (Array.isArray(sys.solid) && sys.solid.some(Boolean)) throw fail("NOT_AVAILABLE", "Column: a flowsheet with inert solids cannot be distilled by the shortcut column yet.");
  if (!(feed.F_kmol_h > 0)) throw fail("BAD_INPUT", "Column: the feed has no flow.");
  const F = feed.F_kmol_h, z = feed.z, P = s.P ?? feed.P_kPa;
  const { lk, hk } = s;
  if (!(z[lk] > 0)) throw fail("BAD_INPUT", `Column: the light key ${names[lk]} is not in the feed.`);
  if (!(z[hk] > 0)) throw fail("BAD_INPUT", `Column: the heavy key ${names[hk]} is not in the feed.`);
  // the feed's liquid fraction q from its enthalpy, between its saturated liquid and vapour at the column's pressure
  const sat = VF => stream(sys, { flow_kmol_h: feed.flows, P_kPa: P, VF });
  const hL = sat(0), hV = sat(1);
  const q = (hV.H_kW - feed.H_kW) / (hV.H_kW - hL.H_kW);
  // relative volatilities at the feed's bubble point (constant through the column, the method's assumption)
  const atFeed = bubbleK(sys, z, P);
  const alpha = atFeed.K.map(k => (k == null ? 1 : k / atFeed.K[hk]));
  const r = fug({ alpha, z, F, q, lk, hk, recoveryLK: s.recoveryLK, recoveryHK: s.recoveryHK, R: s.R ?? null,
    refluxOverMinimum: s.refluxOverMinimum ?? null, names });
  const fl = boilup({ R: r.R, D: r.D, F, q });
  // the keys' relative volatility at the top and the bottom: a reversal is an azeotrope (or a pinch) between the keys
  const top = bubbleK(sys, r.x_D, P), bottom = bubbleK(sys, r.x_B, P);
  const aKeys = { top: top.K[lk] / top.K[hk], feed: alpha[lk], bottom: bottom.K[lk] / bottom.K[hk] };
  for (const [where, a] of [["top", aKeys.top], ["bottom", aKeys.bottom]]) {
    if (!(a > 1)) {
      throw fail("BAD_INPUT", `Column: at the ${where} of the column (${where === "top" ? "the distillate" : "the bottoms"} at its bubble point, ${fmt(where === "top" ? top.T : bottom.T)} K) ${names[lk]} is no longer more volatile than ${names[hk]} (relative volatility ${fmt(a)}): the keys form an azeotrope or a pinch between the feed and the ${where === "top" ? "distillate" : "bottoms"}, so no column reaches these recoveries. Ask for a lower ${where === "top" ? "recovery of the light key" : "recovery of the heavy key"}, or another pressure or separation (an entrainer).`,
        { relative_volatility: aKeys });
    }
  }
  const warnings = [];
  const spread = Math.max(aKeys.top, aKeys.feed, aKeys.bottom) / Math.min(aKeys.top, aKeys.feed, aKeys.bottom) - 1;
  if (spread > VOLATILITY_TOLERANCE) {
    warnings.push({ code: "VOLATILITY_VARIES", message: `The relative volatility of ${names[lk]} to ${names[hk]} changes along the column: ${fmt(aKeys.top)} at the top, ${fmt(aKeys.feed)} at the feed, ${fmt(aKeys.bottom)} at the bottom. The shortcut takes the feed's value as constant, so its stages and minimum reflux are only an estimate here.`,
      remedy: "Use the shortcut's numbers as a first estimate; the rigorous column (milestone M2a) gives the stages." });
  }
  // the products, saturated at P: a total condenser gives a liquid, a partial one a vapour
  const total = s.condenser === "total";
  const distillate = stream(sys, { flow_kmol_h: r.d, P_kPa: P, VF: total ? 0 : 1 });
  const bottoms = stream(sys, { flow_kmol_h: r.b, P_kPa: P, VF: 0 });
  // the condenser: the top vapour (the distillate's composition) condensed to the reflux (and to the distillate)
  const condensed = total ? r.R + 1 : r.R;
  const Qc = stream(sys, { flow_kmol_h: r.d.map(v => v * condensed), P_kPa: P, VF: 1 }).H_kW - stream(sys, { flow_kmol_h: r.d.map(v => v * condensed), P_kPa: P, VF: 0 }).H_kW;
  const Qr = distillate.H_kW + bottoms.H_kW + Qc - feed.H_kW;
  const st = wholeStages(r.N, r.N_below_feed, total);
  const notes = [
    `Shortcut column (Fenske, Underwood, Gilliland in Eduljee's form): constant relative volatility (taken at the feed's bubble point, ${fmt(atFeed.T)} K) and constant molar overflow are assumed, and there must be no azeotrope between the keys. Gilliland's correlation is a fit to columns: its number of stages is an estimate.`,
    `${fmt(r.N)} equilibrium stages (the reboiler included${total ? ", the total condenser not" : ", the partial condenser included"}) at a reflux ratio of ${fmt(r.R)} (${fmt(r.R / r.R_min)} times the minimum, ${fmt(r.R_min)}); at total reflux ${fmt(r.N_min)}. Whole stages: ${st.stages} numbered from the top (1 the condenser), the feed on stage ${st.feed_stage}.`,
  ];
  if (Qr < 0) notes.push(`The reboiler's duty is negative (${fmt(Qr)} kW): the feed brings more heat than the column needs; cool the feed.`);
  const x = arr => Object.fromEntries(sys.ids.map((id, i) => [id, arr[i]]));
  const profile = [
    { stage: 1, name: "condenser", T_K: distillate.T_K, P_kPa: P, L_kmol_h: fl.L, V_kmol_h: total ? 0 : r.D, duty_kW: -Qc, x: x(r.x_D), alpha_keys: aKeys.top },
    { stage: st.feed_stage, name: "feed", T_K: atFeed.T, P_kPa: P, L_kmol_h: fl.L_below_feed, V_kmol_h: fl.V, duty_kW: 0, x: null, alpha_keys: aKeys.feed },
    { stage: st.stages, name: "reboiler", T_K: bottoms.T_K, P_kPa: P, L_kmol_h: r.B, V_kmol_h: fl.V_below_feed, duty_kW: Qr, x: x(r.x_B), alpha_keys: aKeys.bottom },
  ];
  const state = {
    mode: "shortcut", P_kPa: P, condenser: s.condenser, light_key: sys.ids[lk], heavy_key: sys.ids[hk], q,
    alpha: x(alpha), alpha_keys: aKeys, N_min: r.N_min, theta: r.theta, R_min: r.R_min, R: r.R, reflux_over_minimum: r.R / r.R_min,
    gilliland_X: r.gilliland_X, gilliland_Y: r.gilliland_Y, N: r.N, N_below_feed: r.N_below_feed, N_min_stripping: r.N_min_stripping,
    ...st, D_kmol_h: r.D, B_kmol_h: r.B, boilup_ratio: fl.V_below_feed / r.B, condenser_kW: Qc, reboiler_kW: Qr,
    T_distillate_K: distillate.T_K, T_bottoms_K: bottoms.T_K,
  };
  return { outlets: { distillate, bottoms }, duty_kW: Qr - Qc, notes, warnings, profile, state };
}

/**
 * A column's own property method (milestone M2b): a system of the flowsheet's components with the method's model,
 * vapour, parameter sets and preferences, and the flowsheet's user data.
 */
function methodSystem(sys, m) {
  const eos = ["PR", "SRK"].includes(String(m.model).toUpperCase());
  try {
    return system({ components: sys.ids, model: m.model, ...(eos || m.vapour == null ? {} : { vapour: m.vapour }), ...(m.mixing ? { mixing: m.mixing } : {}), ...(m.sets ? { sets: m.sets } : {}),
      ...(m.prefer ? { prefer: m.prefer } : {}), ...(sys.userData ? { userData: sys.userData } : {}) });
  } catch (e) {
    throw fail(e.code ?? "BAD_INPUT", `Column: its own property method (${m.model}): ${e.message}`);
  }
}
const methodName = m => `${m.model}${m.mixing ? " + gE (MHV1)" : ""}${m.vapour && !["PR", "SRK"].includes(String(m.model).toUpperCase()) ? ` with ${m.vapour === "ideal" ? "an ideal-gas" : `a ${m.vapour}`} vapour` : ""}`;

/**
 * The P-H boundary between two property methods (proposal 0015, Part I, section 3): the stream keeps its component
 * flows, its pressure and its enthalpy flow, and its temperature is found by a P-H flash in the receiving method. A
 * shared enthalpy reference does not make two methods agree at the same T and P (their departure and excess enthalpies
 * differ), so recalculating at the same T would create or lose energy. A state the receiving method cannot represent
 * (no P-H solution, a phase it cannot have) is refused with the reason.
 */
function crossBoundary(to, flows, P, H_kW, what, toName) {
  try {
    return stream(to, { flow_kmol_h: flows, P_kPa: P, H_kW });
  } catch (e) {
    throw fail(e.code ?? "NO_CONVERGENCE", `Column: ${what} cannot cross into ${toName} with its enthalpy kept (${fmt(H_kW)} kW at ${fmt(P)} kPa): ${e.message} The receiving method cannot represent this state; choose another method for the column, or change the stream.`,
      { stream: what });
  }
}

/** The rigorous column (milestones M2a and M2b): the column engine with the flowsheet's method or its own; see the
 *  file header. */
function solveRigorous(sys, feeds, s, sideOutlets = 0) {
  const nDraws = (s.draws ?? []).length;
  if (nDraws !== sideOutlets) {
    throw fail("BAD_INPUT", nDraws > sideOutlets
      ? `Column: ${nDraws} side draw${nDraws > 1 ? "s" : ""} and ${sideOutlets} stream${sideOutlets === 1 ? "" : "s"} on the side outlet: connect one stream to the outlet "side" for each side draw, in the order of side_draws (end it with a Product block if it leaves the flowsheet).`
      : `Column: ${sideOutlets} stream${sideOutlets > 1 ? "s" : ""} on the side outlet and ${nDraws} side draw${nDraws === 1 ? "" : "s"}: give one entry of side_draws ({ stage, phase, flow_kmol_h }) for each stream, or remove the stream.`);
  }
  const separator = s.configuration === "absorber" || s.configuration === "stripper";
  if (separator && !s.feedStages) {
    // the defaults: one feed on the top stage; two, the first on the top and the second on the bottom
    if (feeds.length > 2) throw fail("BAD_INPUT", `Column: ${feeds.length} feeds; give one feed stage per feed (feed_stage), 1 the top.`);
    s = { ...s, feedStages: feeds.length === 1 ? [1] : [1, s.reboiler === "partial" ? s.N - 1 : s.N] };
  }
  if (feeds.length !== s.feedStages.length) {
    throw fail("BAD_INPUT", `Column: ${feeds.length} feed${feeds.length > 1 ? "s" : ""} and ${s.feedStages.length} feed stage${s.feedStages.length > 1 ? "s" : ""}; give one feed stage per feed (feed_stage: [${feeds.map((_, k) => s.feedStages[k] ?? "?").join(", ")}]).`);
  }
  if (feeds.some(f => !(f.F_kmol_h >= 0))) throw fail("BAD_INPUT", "Column: a feed has no flow.");
  const P = s.P ?? feeds[0].P_kPa;
  // the column's own method, with the P-H boundary at every stream that enters and leaves it
  const own = s.method ? methodSystem(sys, s.method) : null;
  const csys = own ?? sys;
  const boundary = [];
  if (own) {
    feeds.forEach((f, k) => {
      const name = feeds.length > 1 ? `feed ${k + 1}` : "the feed";
      const c = crossBoundary(own, f.flows, f.P_kPa, f.H_kW, name, `the column's method (${methodName(s.method)})`);
      boundary.push({ stream: name, into: "column", P_kPa: f.P_kPa, H_kW: f.H_kW, T_before_K: f.T_K, T_after_K: c.T_K, dT_K: c.T_K - f.T_K, VF_before: f.VF, VF_after: c.VF });
    });
  }
  const what = s.configuration === "absorber" ? "the absorber" : "the stripper";
  const methodWarnings = separator ? gasSolubilityCheck(csys, Math.max(...feeds.map(f => f.T_K)), `${what}'s feeds`) : [];
  const r = solveCascade({ sys: csys, P_kPa: P, stages: s.N, ends: { condenser: s.condenser, reflux_liquid: s.refluxLiquid, ...(separator ? { reboiler: s.reboiler } : {}) }, phases: s.phases,
    feeds: feeds.map((f, k) => ({ stage: s.feedStages[k], flows: f.flows.map(v => v * KMOL_H), H_W: f.H_kW * 1000,
      // an absorber's start takes each feed's liquid fraction and temperature
      ...(separator ? { q: 1 - (Number.isFinite(f.VF) ? f.VF : 0), T_K: f.T_K } : {}) })),
    ...(separator ? { duties: s.duties } : {}), ...(nDraws ? { draws: s.draws } : {}),
    specs: [...s.specs.map(({ kind, value }) => ({ kind, value })), ...(s.design ?? []).map(d => d.engine)], maxIterations: s.maxIterations });
  if (separator) gasSolubilityCheck(csys, Math.max(...r.stages.map(st => st.T_K)), `${what}'s stages`);   // warnings given once, above
  const total = s.condenser === "total" || s.condenser === "decanter", N = s.N;
  const kmol = v => v / KMOL_H;
  const d = r.products.distillate.flows.map(kmol), b = r.products.bottoms.flows.map(kmol);
  let distillate, bottoms;
  // the side draws leave as the stage's liquid at its bubble point, or its vapour at its dew point
  const side = r.products.draws.map((q, k) => {
    const flows = q.flows.map(kmol), name = `side draw ${k + 1}`;
    if (!own) return stream(sys, { flow_kmol_h: flows, P_kPa: P, VF: q.phase === "liquid" ? 0 : 1 });
    const st = crossBoundary(sys, flows, P, q.H_W / 1000, name, `the flowsheet's method (${sys.model})`);
    boundary.push({ stream: name, into: "flowsheet", P_kPa: P, H_kW: st.H_kW, T_before_K: q.T_K, T_after_K: st.T_K, dT_K: st.T_K - q.T_K, VF_after: st.VF });
    return st;
  });
  if (own) {
    // the products leave with the column's enthalpies; in the flowsheet's method their temperatures follow by P-H
    const flowsheetName = `the flowsheet's method (${sys.model})`;
    distillate = crossBoundary(sys, d, P, r.products.distillate.H_W / 1000, "the distillate", flowsheetName);
    bottoms = crossBoundary(sys, b, P, r.products.bottoms.H_W / 1000, "the bottoms", flowsheetName);
    for (const [name, st, T] of [["the distillate", distillate, r.products.distillate.T_K], ["the bottoms", bottoms, r.products.bottoms.T_K]]) {
      boundary.push({ stream: name, into: "flowsheet", P_kPa: P, H_kW: st.H_kW, T_before_K: T, T_after_K: st.T_K, dT_K: st.T_K - T, VF_after: st.VF });
    }
  } else {
    if (separator) {
      // an absorber's or stripper's products by their enthalpy flows (a P-H flash lands on the stage's temperature):
      // the top gas may have no bubble point at all (a gas of nitrogen and carbon dioxide), so not by VF
      distillate = stream(sys, { flow_kmol_h: d, P_kPa: P, H_kW: r.products.distillate.H_W / 1000 });
      bottoms = stream(sys, { flow_kmol_h: b, P_kPa: P, H_kW: r.products.bottoms.H_W / 1000 });
    } else {
      distillate = stream(sys, { flow_kmol_h: d, P_kPa: P, VF: total ? 0 : 1 });
      bottoms = stream(sys, { flow_kmol_h: b, P_kPa: P, VF: 0 });
    }
  }
  const Qc = r.duties.condenser_W / 1000, Qr = r.duties.reboiler_W / 1000;
  const byId = arr => Object.fromEntries(sys.ids.map((id, i) => [id, arr[i]]));
  const D = kmol(sum(r.products.distillate.flows)), B = kmol(sum(r.products.bottoms.flows));
  const liquid = q => (q ? { x: byId(q.x), L_kmol_h: kmol(q.flow), ...(q.rho != null ? { rho_kg_m3: q.rho } : {}) } : null);
  const profile = r.stages.map(st => ({ stage: st.stage, name: st.name, T_K: st.T_K, P_kPa: st.P_kPa, L_kmol_h: kmol(st.L_mol_s),
    V_kmol_h: kmol(st.V_mol_s), duty_kW: st.duty_W / 1000, x: byId(st.x), y: st.y ? byId(st.y) : null,
    ...(st.U_mol_s ? { side_liquid_kmol_h: kmol(st.U_mol_s) } : {}), ...(st.W_mol_s ? { side_vapour_kmol_h: kmol(st.W_mol_s) } : {}),
    ...(s.phases === "VLL" ? { liquids: st.liquids ? { light: liquid(st.liquids.light), heavy: liquid(st.liquids.heavy), named_by: st.liquids.named, ...(st.liquids.reflux ? { reflux: st.liquids.reflux } : {}) } : null } : {}) }));
  // the design specifications as given (kmol/h, kg/h), with the value reached; the variables found for them
  const designRows = (r.specifications ?? []).map((q, k) => { const d = s.design[k]; return { ...d.shown, asked: q.asked * d.scale, achieved: q.achieved * d.scale, error: q.error * d.scale, unit: d.unit, scaled_residual: q.scaled_residual, met: q.met,
    label: q.label }; });
  const adjusted = Object.fromEntries((r.adjusted ?? []).map(a => (a.variable === "distillate_rate" ? ["distillate_kmol_h", kmol(a.value)] : a.variable === "draw_rate" ? [`side_draw_${a.draw}_kmol_h`, kmol(a.value)] : [a.variable, a.value])));
  const m4State = { ...(nDraws ? { side_draws: r.products.draws.map(q => ({ stage: q.stage, phase: q.phase, flow_kmol_h: kmol(q.rate), T_K: q.T_K })) } : {}),
    ...(r.specifications ? { design_specifications: designRows, adjusted } : {}) };
  const R = r.stages[0].L_mol_s / sum(r.products.distillate.flows), boil = r.stages[N - 1].V_mol_s / sum(r.products.bottoms.flows);
  const Qstages = sum((s.duties ?? []).map(d => d.Q_W)) / 1000;
  const condenserWord = s.condenser === "decanter" ? `decanter (the ${s.refluxLiquid} liquid refluxed, the other the distillate)` : `${s.condenser} condenser`;
  const twoLiquidStages = r.stages.filter(st => st.liquids).map(st => st.stage);
  const notes = [
    separator ? `Rigorous ${s.configuration}: ${N} equilibrium stages numbered from the top, ${s.reboiler === "partial" ? `${N} the reboiler, ` : ""}no condenser; feed${s.feedStages.length > 1 ? "s" : ""} on stage${s.feedStages.length > 1 ? "s" : ""} ${s.feedStages.join(", ")}, at ${fmt(P)} kPa without pressure drop; ${(s.duties ?? []).length ? `heat added on stage${s.duties.length > 1 ? "s" : ""} ${s.duties.map(d => `${d.stage} (${fmt(d.Q_W / 1000)} kW)`).join(", ")}, the other stages adiabatic` : s.reboiler === "partial" ? "the stages above the reboiler adiabatic" : "every stage adiabatic"}. The gas leaving the top leaves by the outlet "gas out" (port id "distillate"), the liquid leaving the bottom by "liquid out" (port id "bottoms"). The MESH equations of every stage were solved together by Newton's method (Naphtali-Sandholm), started by the ${r.solver.start}, in ${r.iterations} iterations; every group of residuals is within its tolerance (state.residuals). Converged is not validated against data: the result is as good as the method and its parameters.` :
    `Rigorous column: ${N} stages (1 the ${condenserWord}, ${N} the reboiler), feed${s.feedStages.length > 1 ? "s" : ""} on stage${s.feedStages.length > 1 ? "s" : ""} ${s.feedStages.join(", ")}, at ${fmt(P)} kPa without pressure drop. The MESH equations of every stage were solved together by Newton's method (Naphtali-Sandholm), started by the ${r.solver.start}, in ${r.iterations} iterations; every group of residuals is within its tolerance (state.residuals). Converged is not validated against data: the result is as good as the method and its parameters.`,
    ...(s.phases === "VLL" ? [twoLiquidStages.length
      ? `Two liquids on stage${twoLiquidStages.length > 1 ? "s" : ""} ${twoLiquidStages.join(", ")} (looked for on every stage: the tangent-plane test of each stage's liquid, then the liquid-liquid split at its temperature); both liquids of a stage leave it together${s.condenser === "decanter" ? ", except in the decanter, where they are separated" : ""}. They are named light and heavy by density.`
      : "Two liquids were looked for on every stage (phases VLL); every stage holds one liquid."] : []),
    ...(nDraws ? [`Side draw${nDraws > 1 ? "s" : ""}: ${r.products.draws.map((q, k) => `${k + 1}: ${fmt(kmol(q.rate))} kmol/h of the ${q.phase} of stage ${q.stage} (${fmt(q.T_K)} K)`).join("; ")}. A side draw has the composition of its stage's ${nDraws > 1 ? "liquid or vapour" : r.products.draws[0].phase}${s.phases === "VLL" ? " (both liquids of a stage with two, in their proportion)" : ""}; the liquid and vapour flows of the profile are those that go on to the next stage.`] : []),
    ...(r.specifications ? [`Design specifications: ${designRows.map(q => `${q.label}: asked ${fmt6(q.asked)}, reached ${fmt6(q.achieved)} ${q.unit}`).join("; ")}. Found for them: ${Object.entries(adjusted).map(([k, v]) => `${k} ${fmt6(v)}`).join(", ")}, by an outer loop around the stage solver (${r.solver.specifications.column_solves} columns solved); each specification is met within a scaled tolerance of ${r.solver.specifications.tolerance} (state.design_specifications).`] : []),
    ...(own ? [`The column uses its own property method, ${methodName(s.method)}, while the flowsheet uses ${sys.info?.method ?? sys.model}. At each stream that enters or leaves the column the component flows, the pressure and the enthalpy flow are kept and the temperature is found by a P-H flash in the receiving method (state.boundary): ${boundary.map(q => `${q.stream} ${q.dT_K >= 0 ? "+" : ""}${fmt(q.dT_K)} K`).join(", ")}.`] : []),
    ...r.notes,
  ];
  if (!own && (Math.abs(distillate.T_K - r.stages[0].T_K) > 0.01 || Math.abs(bottoms.T_K - r.stages[N - 1].T_K) > 0.01)) {
    notes.push(`The products' temperatures from the flash (${fmt(distillate.T_K)} and ${fmt(bottoms.T_K)} K) differ from the stages' (${fmt(r.stages[0].T_K)} and ${fmt(r.stages[N - 1].T_K)} K).`);
  }
  const state = separator ? {
    mode: "rigorous", configuration: s.configuration, P_kPa: P, condenser: "none", reboiler: s.reboiler, phases: s.phases, stages: N, feed_stages: s.feedStages,
    specifications: Object.fromEntries(s.specs.map(x => [x.key, x.key.endsWith("_kmol_h") ? kmol(x.value) : x.key.endsWith("_kW") ? x.value / 1000 : x.value])),
    stage_duties_kW: (s.duties ?? []).map(q => ({ stage: q.stage, duty_kW: q.Q_W / 1000 })),
    ...m4State,
    top_gas_kmol_h: D, bottom_liquid_kmol_h: B, ...(s.reboiler === "partial" ? { boilup_ratio: boil, reboiler_kW: Qr } : {}),
    T_top_K: r.stages[0].T_K, T_bottom_K: r.stages[N - 1].T_K,
    ...(own ? { method: { ...s.method }, boundary } : {}),
    converged: r.converged, iterations: r.iterations, residuals: r.residuals, tolerances: r.tolerances, solver: r.solver,
  } : {
    mode: "rigorous", P_kPa: P, condenser: s.condenser, phases: s.phases, ...(s.condenser === "decanter" ? { reflux_liquid: s.refluxLiquid } : {}),
    stages: N, feed_stages: s.feedStages,
    specifications: Object.fromEntries(s.specs.map(x => [x.key, x.key.endsWith("_kmol_h") ? kmol(x.value) : x.key.endsWith("_kW") ? x.value / 1000 : x.value])),
    ...m4State,
    reflux_ratio: R, boilup_ratio: boil, D_kmol_h: D, B_kmol_h: B, condenser_kW: Qc, reboiler_kW: Qr,
    T_distillate_K: r.stages[0].T_K, T_bottoms_K: r.stages[N - 1].T_K,
    ...(s.phases === "VLL" ? { two_liquid_stages: twoLiquidStages } : {}),
    ...(own ? { method: { ...s.method }, boundary } : {}),
    converged: r.converged, iterations: r.iterations, residuals: r.residuals, tolerances: r.tolerances, solver: r.solver,
  };
  const warnings = [...methodWarnings, ...r.warnings];
  let sizing;
  if (s.sizing) {
    sizing = columnHydraulics(csys, profile, s.sizing);   // the column's densities, in its own method when it has one
    warnings.push(...sizing.warnings);   // its notes stay in sizing.notes
  }
  return { outlets: { distillate, bottoms, ...(nDraws ? { side } : {}) }, duty_kW: Qr - Qc + Qstages, notes, warnings, profile, state, ...(sizing ? { sizing } : {}),
    ...(own ? { method: { ...s.method, flowsheet_model: sys.info?.method ?? sys.model, boundary: "P-H: component flows, pressure and enthalpy flow kept; the temperature found by a P-H flash in the receiving method" } } : {}) };
}
const sum = v => v.reduce((a, c) => a + c, 0);
const fmt6 = v => +Number(v).toPrecision(6);

registerUnit({
  type: "column", label: "Column", duty: true,
  inlets: [{ port: "in", label: "feed", min: 1, max: Infinity }],
  // the side draws of the rigorous column (milestone M4): one stream each on the port "side", in the order of side_draws
  outlets: [{ port: "distillate" }, { port: "bottoms" }, { port: "side", label: "side draw", min: 0, max: Infinity, optional: true }],
  modes: COLUMN_MODES,
  specKeys: SPEC_KEYS,
  checkSpec,
  dof,
  solve({ sys, inlets, spec, outletCount }) {
    if (spec.sideDraws) throw fail("NOT_AVAILABLE", `Column: side draws are built for distillation (a condenser and a reboiler); ${spec.configuration === "absorber" ? "an absorber" : "a stripper"} with a side draw is not built.`);
    if (spec.twoLiquids) throw fail("NOT_AVAILABLE", `Column: ${spec.configuration === "absorber" ? "an absorber" : "a stripper"} holds a vapour and one liquid (phases "VL"); two liquids on its stages (phases "${spec.twoLiquids}") are not built yet.`);
    if (spec.extraction) throw fail("BAD_INPUT", "Column: two liquids without a vapour (phases \"LL\") are an extraction: use the Extraction block (type \"extraction\", under the Separator button; capability solve_extraction). The Column block solves \"VL\" and \"VLL\".");
    if (spec.mode === "rigorous") return solveRigorous(sys, inlets.in, spec, outletCount ?? 0);
    if (outletCount) throw fail("BAD_INPUT", "Column: a stream is connected to the side outlet, but side draws are the rigorous column's (mode: \"rigorous\", side_draws); the shortcut has a distillate and a bottoms only.");
    if (inlets.in.length > 1) throw fail("BAD_INPUT", "Column: the shortcut column takes one feed; mix the feeds first, or use the rigorous mode, which takes several.");
    const r = solveShortcut(sys, inlets.in[0], spec);
    if (spec.sizingIgnored) r.notes.push("The column's sizing (diameter, flooding, weeping) needs every stage's flows: it is done in the rigorous mode, not by the shortcut.");
    return r;
  },
});
