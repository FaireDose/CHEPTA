/**
 * The Column block (proposal 0015, Part I, section 1; milestone M1): one block for distillation, with the modes
 *
 *   "shortcut"   Fenske, Underwood and Gilliland for a light and a heavy key (src/units/columns/shortcut.js, where the
 *                equations, their open source and where the method holds are written);
 *   "rigorous"   MESH on equilibrium stages (milestone M2a): the column engine (src/units/columns/engine.js, where the
 *                equations, the solver, its open sources and its checks are written), with the flowsheet's method or
 *                its own (milestone M2b), and optionally two liquids on the stages and a decanter.
 *
 * Absorber, stripper and extraction come later as configurations of the same block (M3). The specification:
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
 * The column's own method (proposal 0015, Part I, section 3): the P-H boundary at every stream that enters or leaves
 * the column keeps the component flows, the pressure and the enthalpy flow, and finds the temperature by a P-H flash in
 * the receiving method (the change is reported in state.boundary); a state the receiving method cannot represent is
 * refused with the reason. The flowsheet's energy balance then closes, since the enthalpy flows are kept.
 *
 * The keys of the other mode are kept (so that a person can switch back) and not used. Several feeds: the rigorous mode
 * only; each enters its stage as one stream. Outlets as the shortcut's; `profile` holds every stage (T, P, L, V, x, y,
 * duty), `state` the products, the duties, the residuals by group, their tolerances and the iterations.
 *
 * Purity specifications (distillate_purity, bottoms_purity) come with milestone M4: refused until then (NOT_AVAILABLE).
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
import { findComponent } from "../../thermo/components.js";
import { anyBubbleT } from "../../equilibrium/bubble-any.js";
import { registerUnit } from "../units.js";
import { solveCascade } from "./engine.js";
import { fug, boilup, wholeStages, VOLATILITY_TOLERANCE } from "./shortcut.js";
import { hydraulicsOptions, columnHydraulics } from "./hydraulics.js";

/** The column's modes: built, and planned. */
export const COLUMN_MODES = Object.freeze([
  { mode: "shortcut", status: "available", summary: "Fenske, Underwood and Gilliland, for a light and a heavy key" },
  { mode: "rigorous", status: "available", summary: "MESH on equilibrium stages, solved by Newton's method on all equations (Naphtali-Sandholm)" },
]);

const SPEC_KEYS = ["mode", "light_key", "heavy_key", "recovery_light_key_in_distillate", "recovery_heavy_key_in_bottoms", "reflux_ratio",
  "reflux_over_minimum", "condenser", "P_kPa", "distillate_purity", "bottoms_purity",
  "stages", "feed_stage", "max_iterations", "boilup_ratio", "distillate_kmol_h", "bottoms_kmol_h", "condenser_duty_kW", "reboiler_duty_kW", "sizing",
  "phases", "reflux_liquid", "method"];
/** The keys of a column's own property method (milestone M2b), as a flowsheet's thermo: model, vapour, sets, prefer. */
const METHOD_KEYS = ["model", "vapour", "sets", "prefer"];
/** The rigorous mode's specifications (two of them), and the engine's names for them. */
const RIGOROUS_SPECS = { reflux_ratio: "reflux_ratio", boilup_ratio: "boilup_ratio", distillate_kmol_h: "distillate_rate",
  bottoms_kmol_h: "bottoms_rate", condenser_duty_kW: "condenser_duty", reboiler_duty_kW: "reboiler_duty" };
const KMOL_H = 1000 / 3600;   // mol/s per kmol/h
const PURITY = ["distillate_purity", "bottoms_purity"];
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

function checkSpec(spec, { sys }) {
  // an unknown key is refused by runUnit and specStatus (specKeys)
  const mode = spec.mode ?? "shortcut";
  if (!COLUMN_MODES.some(m => m.mode === mode)) throw fail("BAD_INPUT", `Column: mode "${mode}" is not one of ${COLUMN_MODES.map(m => m.mode).join(", ")}.`);
  if (mode === "rigorous") return checkRigorous(spec);
  // refused when solved (NOT_AVAILABLE, the outcome "unsupported"), not here: the specification is not wrong, the
  // calculation is not built yet
  if (PURITY.some(k => has(spec, k))) return { mode, purity: true };
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

function checkRigorous(spec) {
  // a purity reaches the solver, which refuses it as not built yet (M4)
  if (PURITY.some(k => has(spec, k))) return { mode: "rigorous", purity: true };
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
  const need = decanter ? 1 : 2;
  if (given.length !== need) {
    throw fail("BAD_INPUT", decanter
      ? `Column: with a decanter the reflux is the whole ${refluxLiquid} liquid, so the column needs one specification, from boilup_ratio, distillate_kmol_h, bottoms_kmol_h, reboiler_duty_kW; ${given.length ? `got ${given.join(", ")}` : "none given"}.`
      : `Column: the rigorous column needs two specifications, from ${Object.keys(RIGOROUS_SPECS).join(", ")}; ${given.length ? `got ${given.join(", ")}` : "none given"}.`);
  }
  const specs = given.map(k => {
    const v = Number(spec[k]);
    if (!(Number.isFinite(v) && v > 0)) throw fail("BAD_INPUT", `Column: ${k} must be a positive number (got ${JSON.stringify(spec[k])}).`);
    return { key: k, kind: RIGOROUS_SPECS[k], value: k.endsWith("_kmol_h") ? v * KMOL_H : k.endsWith("_kW") ? v * 1000 : v };
  });
  const out = { mode: "rigorous", N, feedStages, condenser, phases, refluxLiquid, specs, method: has(spec, "method") ? checkMethod(spec.method) : null };
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

/** A column's own property method: { model, vapour?, sets?, prefer? }, as a flowsheet's thermo. */
function checkMethod(m) {
  if (!m || typeof m !== "object" || Array.isArray(m)) throw fail("BAD_INPUT", `Column: method must be an object such as { model: "NRTL", vapour: "ideal" } (got ${JSON.stringify(m)}).`);
  const bad = Object.keys(m).filter(k => !METHOD_KEYS.includes(k));
  if (bad.length) throw fail("BAD_INPUT", `Column: method: unknown key${bad.length > 1 ? "s" : ""} ${bad.join(", ")}. Known: ${METHOD_KEYS.join(", ")}.`);
  if (typeof m.model !== "string" || !m.model) throw fail("BAD_INPUT", "Column: method needs a model (NRTL, UNIQUAC, MOD-UNIFAC-2, ideal, PR or SRK).");
  return { ...m };
}

/** The degrees of freedom of the shortcut: the two keys, their two recoveries and the reflux (the condenser and the
 *  pressure have defaults). A purity counts in place of its recovery, so that it reaches the solver and is refused
 *  there as not built yet; so does the rigorous mode. */
function dof(spec) {
  if (spec.mode === "rigorous") {
    const out = { needed: 4, given: 0, missing: [], extra: [] };
    for (const [k, what] of [["stages", "the number of stages"], ["feed_stage", "the feed stage"]]) {
      if (has(spec, k)) out.given += 1; else out.missing.push(what);
    }
    // a decanter returns one liquid entirely: one specification fewer
    const k = spec.condenser === "decanter" ? 1 : 2;
    out.needed = 2 + k;
    const g = [...Object.keys(RIGOROUS_SPECS), ...PURITY].filter(key => has(spec, key));
    out.given += Math.min(g.length, k);
    if (g.length < k) out.missing.push(`${k - g.length === 2 ? "two specifications" : k === 1 ? "one specification" : "one more specification"} (${k === 1 ? "boil-up ratio, distillate or bottoms flow, reboiler duty" : "reflux ratio, boil-up ratio, distillate or bottoms flow, condenser or reboiler duty"})`);
    if (g.length > k) out.extra.push(`${g.join(", ")}: give ${k === 1 ? "one (the decanter fixes the reflux)" : "two"}`);
    return out;
  }
  if ((spec.mode ?? "shortcut") !== "shortcut") return { needed: 0, given: 0, missing: [], extra: [] };
  const rows = [
    [["light_key"], "the light key"], [["heavy_key"], "the heavy key"],
    [["recovery_light_key_in_distillate", "distillate_purity"], "the light key's recovery in the distillate"],
    [["recovery_heavy_key_in_bottoms", "bottoms_purity"], "the heavy key's recovery in the bottoms"],
    [["reflux_ratio", "reflux_over_minimum"], "the reflux ratio or the reflux over the minimum"],
  ];
  const out = { needed: rows.length, given: 0, missing: [], extra: [] };
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
    return system({ components: sys.ids, model: m.model, ...(eos || m.vapour == null ? {} : { vapour: m.vapour }), ...(m.sets ? { sets: m.sets } : {}),
      ...(m.prefer ? { prefer: m.prefer } : {}), ...(sys.userData ? { userData: sys.userData } : {}) });
  } catch (e) {
    throw fail(e.code ?? "BAD_INPUT", `Column: its own property method (${m.model}): ${e.message}`);
  }
}
const methodName = m => `${m.model}${m.vapour && !["PR", "SRK"].includes(String(m.model).toUpperCase()) ? ` with ${m.vapour === "ideal" ? "an ideal-gas" : `a ${m.vapour}`} vapour` : ""}`;

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
function solveRigorous(sys, feeds, s) {
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
  const r = solveCascade({ sys: csys, P_kPa: P, stages: s.N, ends: { condenser: s.condenser, reflux_liquid: s.refluxLiquid }, phases: s.phases,
    feeds: feeds.map((f, k) => ({ stage: s.feedStages[k], flows: f.flows.map(v => v * KMOL_H), H_W: f.H_kW * 1000 })),
    specs: s.specs.map(({ kind, value }) => ({ kind, value })), maxIterations: s.maxIterations });
  const total = s.condenser !== "partial", N = s.N;
  const kmol = v => v / KMOL_H;
  const d = r.products.distillate.flows.map(kmol), b = r.products.bottoms.flows.map(kmol);
  let distillate, bottoms;
  if (own) {
    // the products leave with the column's enthalpies; in the flowsheet's method their temperatures follow by P-H
    const flowsheetName = `the flowsheet's method (${sys.model})`;
    distillate = crossBoundary(sys, d, P, r.products.distillate.H_W / 1000, "the distillate", flowsheetName);
    bottoms = crossBoundary(sys, b, P, r.products.bottoms.H_W / 1000, "the bottoms", flowsheetName);
    for (const [name, st, T] of [["the distillate", distillate, r.products.distillate.T_K], ["the bottoms", bottoms, r.products.bottoms.T_K]]) {
      boundary.push({ stream: name, into: "flowsheet", P_kPa: P, H_kW: st.H_kW, T_before_K: T, T_after_K: st.T_K, dT_K: st.T_K - T, VF_after: st.VF });
    }
  } else {
    distillate = stream(sys, { flow_kmol_h: d, P_kPa: P, VF: total ? 0 : 1 });
    bottoms = stream(sys, { flow_kmol_h: b, P_kPa: P, VF: 0 });
  }
  const Qc = r.duties.condenser_W / 1000, Qr = r.duties.reboiler_W / 1000;
  const byId = arr => Object.fromEntries(sys.ids.map((id, i) => [id, arr[i]]));
  const D = kmol(sum(r.products.distillate.flows)), B = kmol(sum(r.products.bottoms.flows));
  const liquid = q => (q ? { x: byId(q.x), L_kmol_h: kmol(q.flow), ...(q.rho != null ? { rho_kg_m3: q.rho } : {}) } : null);
  const profile = r.stages.map(st => ({ stage: st.stage, name: st.name, T_K: st.T_K, P_kPa: st.P_kPa, L_kmol_h: kmol(st.L_mol_s),
    V_kmol_h: kmol(st.V_mol_s), duty_kW: st.duty_W / 1000, x: byId(st.x), y: st.y ? byId(st.y) : null,
    ...(s.phases === "VLL" ? { liquids: st.liquids ? { light: liquid(st.liquids.light), heavy: liquid(st.liquids.heavy), named_by: st.liquids.named, ...(st.liquids.reflux ? { reflux: st.liquids.reflux } : {}) } : null } : {}) }));
  const R = r.stages[0].L_mol_s / sum(r.products.distillate.flows), boil = r.stages[N - 1].V_mol_s / sum(r.products.bottoms.flows);
  const condenserWord = s.condenser === "decanter" ? `decanter (the ${s.refluxLiquid} liquid refluxed, the other the distillate)` : `${s.condenser} condenser`;
  const twoLiquidStages = r.stages.filter(st => st.liquids).map(st => st.stage);
  const notes = [
    `Rigorous column: ${N} stages (1 the ${condenserWord}, ${N} the reboiler), feed${s.feedStages.length > 1 ? "s" : ""} on stage${s.feedStages.length > 1 ? "s" : ""} ${s.feedStages.join(", ")}, at ${fmt(P)} kPa without pressure drop. The MESH equations of every stage were solved together by Newton's method (Naphtali-Sandholm), started by the ${r.solver.start}, in ${r.iterations} iterations; every group of residuals is within its tolerance (state.residuals). Converged is not validated against data: the result is as good as the method and its parameters.`,
    ...(s.phases === "VLL" ? [twoLiquidStages.length
      ? `Two liquids on stage${twoLiquidStages.length > 1 ? "s" : ""} ${twoLiquidStages.join(", ")} (looked for on every stage: the tangent-plane test of each stage's liquid, then the liquid-liquid split at its temperature); both liquids of a stage leave it together${s.condenser === "decanter" ? ", except in the decanter, where they are separated" : ""}. They are named light and heavy by density.`
      : "Two liquids were looked for on every stage (phases VLL); every stage holds one liquid."] : []),
    ...(own ? [`The column uses its own property method, ${methodName(s.method)}, while the flowsheet uses ${sys.model}. At each stream that enters or leaves the column the component flows, the pressure and the enthalpy flow are kept and the temperature is found by a P-H flash in the receiving method (state.boundary): ${boundary.map(q => `${q.stream} ${q.dT_K >= 0 ? "+" : ""}${fmt(q.dT_K)} K`).join(", ")}.`] : []),
    ...r.notes,
  ];
  if (!own && (Math.abs(distillate.T_K - r.stages[0].T_K) > 0.01 || Math.abs(bottoms.T_K - r.stages[N - 1].T_K) > 0.01)) {
    notes.push(`The products' temperatures from the flash (${fmt(distillate.T_K)} and ${fmt(bottoms.T_K)} K) differ from the stages' (${fmt(r.stages[0].T_K)} and ${fmt(r.stages[N - 1].T_K)} K).`);
  }
  const state = {
    mode: "rigorous", P_kPa: P, condenser: s.condenser, phases: s.phases, ...(s.condenser === "decanter" ? { reflux_liquid: s.refluxLiquid } : {}),
    stages: N, feed_stages: s.feedStages,
    specifications: Object.fromEntries(s.specs.map(x => [x.key, x.key.endsWith("_kmol_h") ? kmol(x.value) : x.key.endsWith("_kW") ? x.value / 1000 : x.value])),
    reflux_ratio: R, boilup_ratio: boil, D_kmol_h: D, B_kmol_h: B, condenser_kW: Qc, reboiler_kW: Qr,
    T_distillate_K: r.stages[0].T_K, T_bottoms_K: r.stages[N - 1].T_K,
    ...(s.phases === "VLL" ? { two_liquid_stages: twoLiquidStages } : {}),
    ...(own ? { method: { ...s.method }, boundary } : {}),
    converged: r.converged, iterations: r.iterations, residuals: r.residuals, tolerances: r.tolerances, solver: r.solver,
  };
  const warnings = [...r.warnings];
  let sizing;
  if (s.sizing) {
    sizing = columnHydraulics(csys, profile, s.sizing);   // the column's densities, in its own method when it has one
    warnings.push(...sizing.warnings);   // its notes stay in sizing.notes
  }
  return { outlets: { distillate, bottoms }, duty_kW: Qr - Qc, notes, warnings, profile, state, ...(sizing ? { sizing } : {}),
    ...(own ? { method: { ...s.method, flowsheet_model: sys.model, boundary: "P-H: component flows, pressure and enthalpy flow kept; the temperature found by a P-H flash in the receiving method" } } : {}) };
}
const sum = v => v.reduce((a, c) => a + c, 0);

registerUnit({
  type: "column", label: "Column", duty: true,
  inlets: [{ port: "in", label: "feed", min: 1, max: Infinity }],
  outlets: [{ port: "distillate" }, { port: "bottoms" }],
  modes: COLUMN_MODES,
  specKeys: SPEC_KEYS,
  checkSpec,
  dof,
  solve({ sys, inlets, spec }) {
    if (spec.purity) throw fail("NOT_AVAILABLE", `Column: purity specifications come with milestone M4 of proposal 0015; give ${spec.mode === "rigorous" ? "flows, ratios or duties" : "the recoveries of the keys"} instead.`);
    if (spec.extraction) throw fail("NOT_AVAILABLE", "Column: phases \"LL\" (two liquids without a vapour: extraction) comes with milestone M3 of proposal 0015; the column solves \"VL\" and \"VLL\".");
    if (spec.mode === "rigorous") return solveRigorous(sys, inlets.in, spec);
    if (inlets.in.length > 1) throw fail("BAD_INPUT", "Column: the shortcut column takes one feed; mix the feeds first, or use the rigorous mode, which takes several.");
    const r = solveShortcut(sys, inlets.in[0], spec);
    if (spec.sizingIgnored) r.notes.push("The column's sizing (diameter, flooding, weeping) needs every stage's flows: it is done in the rigorous mode, not by the shortcut.");
    return r;
  },
});
