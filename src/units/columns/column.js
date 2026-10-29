/**
 * The Column block (proposal 0015, Part I, section 1; milestone M1): one block for distillation, with the modes
 *
 *   "shortcut"   Fenske, Underwood and Gilliland for a light and a heavy key (src/units/columns/shortcut.js, where the
 *                equations, their open source and where the method holds are written);
 *   "rigorous"   MESH on equilibrium stages: planned (milestone M2a); refused until then by the column engine
 *                (src/units/columns/engine.js, NOT_AVAILABLE).
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
import { findComponent } from "../../thermo/components.js";
import { anyBubbleT } from "../../equilibrium/bubble-any.js";
import { registerUnit } from "../units.js";
import { solveCascade } from "./engine.js";
import { fug, boilup, wholeStages, VOLATILITY_TOLERANCE } from "./shortcut.js";

/** The column's modes: built, and planned. */
export const COLUMN_MODES = Object.freeze([
  { mode: "shortcut", status: "available", summary: "Fenske, Underwood and Gilliland, for a light and a heavy key" },
  { mode: "rigorous", status: "planned", summary: "MESH on equilibrium stages (proposal 0015, milestone M2a)" },
]);

const SPEC_KEYS = ["mode", "light_key", "heavy_key", "recovery_light_key_in_distillate", "recovery_heavy_key_in_bottoms", "reflux_ratio",
  "reflux_over_minimum", "condenser", "P_kPa", "distillate_purity", "bottoms_purity"];
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
  // refused when solved (NOT_AVAILABLE, the outcome "unsupported"), not here: the specification is not wrong, the
  // calculation is not built yet
  if (mode !== "shortcut") return { mode };
  if (PURITY.some(k => has(spec, k))) return { mode, purity: true };
  const condenser = spec.condenser ?? "total";
  if (!["total", "partial"].includes(condenser)) throw fail("BAD_INPUT", `Column: condenser must be "total" or "partial" (got ${JSON.stringify(condenser)}).`);
  const lk = keyIndex(sys, spec.light_key, "light key"), hk = keyIndex(sys, spec.heavy_key, "heavy key");
  if (lk === hk) throw fail("BAD_INPUT", "Column: the light and the heavy key must be two different components.");
  if (has(spec, "reflux_ratio") === has(spec, "reflux_over_minimum")) throw fail("BAD_INPUT", "Column: give the reflux ratio (reflux_ratio) or the reflux as a multiple of the minimum (reflux_over_minimum), one of them.");
  const out = { mode, condenser, lk, hk,
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

/** The degrees of freedom of the shortcut: the two keys, their two recoveries and the reflux (the condenser and the
 *  pressure have defaults). A purity counts in place of its recovery, so that it reaches the solver and is refused
 *  there as not built yet; so does the rigorous mode. */
function dof(spec) {
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

registerUnit({
  type: "column", label: "Column", duty: true,
  inlets: [{ port: "in", label: "feed" }],
  outlets: [{ port: "distillate" }, { port: "bottoms" }],
  modes: COLUMN_MODES,
  specKeys: SPEC_KEYS,
  checkSpec,
  dof,
  solve({ sys, inlets, spec }) {
    if (spec.mode === "rigorous") return solveCascade();
    if (spec.purity) throw fail("NOT_AVAILABLE", "Column: purity specifications come with milestone M4 of proposal 0015; give the recoveries of the keys instead.");
    return solveShortcut(sys, inlets.in[0], spec);
  },
});
