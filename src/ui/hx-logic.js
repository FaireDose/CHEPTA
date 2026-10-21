/**
 * Heat exchanger workspace of the workbench (proposal 0013, step 2): the DOM-free part. The settings kept in the
 * state (`state.hx`, null until the person changes one), the request sent to the engine (src/units/heat-exchange.js),
 * and the tables of the result for the exports. No thermodynamics here: hxCalc builds the streams with
 * CHEPTA.stream and calls exchangerArea and wallThickness.
 *
 * Two modes: "utility" (one process stream of the workspace's components and model, against steam, water or a fluid
 * of the person's own, or electric heating) and "two" (two process streams that never mix: each has its own
 * components, at most HX_STREAM_MAX, and its own method; until they are chosen, the workspace's). U from a service (Table 2.2 of Lienhard
 * and Lienhard), from film coefficients and a wall, or the person's own. Units inside: K, kPa, kmol/h, kW, m².
 */
import { stream } from "../stream/stream.js";
import { exchangerArea, exchangerApproach, wallThickness, HEAT_TRANSFER, ARRANGEMENTS } from "../units/heat-exchange.js";

// components and model null: the workspace's (two-stream mode sets them per stream)
const side = (T_K, P_kPa) => ({ flow: 100, z: null, T_K, P_kPa, dP_kPa: 0, components: null, model: null, vapour: null });
/** The most components of one stream in two-stream mode. */
export const HX_STREAM_MAX = 3;

/** The settings of a new Heat exchanger workspace. */
export const HX_DEFAULTS = Object.freeze({
  mode: "utility",
  // utility mode: the process stream, its outlet (T or VF) and the utility
  process: { ...side(298.15, 101.325), out: "T", T_out_K: 333.15, VF_out: 1 },
  utility: { kind: "steam", P_kPa: 300, T_in_K: 303.15, T_out_K: 313.15, T_K: 423.15, cp_J_kgK: 2000, water_P_kPa: 101.325 },
  // two-stream mode: both streams and one specification
  hot: side(393.15, 300), cold: side(298.15, 101.325), spec: { kind: "T_hot_out_K", value: 333.15 },
  // U: "service" (Table 2.2), "film" (Tables 1.1, 2.3 and A.1) or "value"
  U: { source: "service", service: "steam-water-oil", pick: "low", value: 500,
    film: { hot: { hId: "cond-steam", h: null, RfId: "steam-clean", Rf: null }, cold: { hId: "forced-organic-tube", h: null, RfId: "industrial-liquids", Rf: null },
      wall: { material: "stainless-316", k_W_mK: null, t_mm: 2 } } },
  arrangement: "counterflow", shells: 1, zones: 20,
  // the wall thickness for a pressure (Lamé); the allowable stress is the person's (null until given)
  wall: { P_kPa: 1000, D_in_mm: 20, S_MPa: null, E: 1, c_mm: 0 },
});

export const UTILITY_KINDS = [
  ["steam", "Steam (condensing)"], ["water", "Cooling or heating water"], ["fluid-T", "A fluid of your own at a constant temperature"],
  ["fluid", "A fluid of your own, inlet and outlet"], ["electric", "Electric heating"],
];
export const TWO_SPECS = [["T_hot_out_K", "Hot outlet T"], ["T_cold_out_K", "Cold outlet T"], ["duty_kW", "Duty"], ["dTmin_K", "Minimum ΔT"]];
/** The two modes, as the ribbon names them. */
export const HX_MODES = [["utility", "Utility exchanger", "A process stream heated or cooled by a utility"],
  ["two", "Process exchanger", "Heat recovery between two process streams"]];

/** A stream's components, method and vapour in two-stream mode: its own, else the workspace's (ids, model, vapour). */
export function hxStreamSetup(hx, key, { ids = [], model = "NRTL", vapour = "ideal" } = {}) {
  const s = (hx ?? HX_DEFAULTS)[key] ?? {};
  return { ids: (s.components ?? ids).slice(0, HX_STREAM_MAX), model: s.model ?? model, vapour: s.vapour ?? vapour };
}

const isObj = v => v && typeof v === "object" && !Array.isArray(v);
/** Merge `patch` into `prev` (deeply for objects; arrays and null replace). */
function merge(prev, patch) {
  if (!isObj(patch)) return patch;
  const out = { ...prev };
  for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) && isObj(prev?.[k]) ? merge(prev[k], v) : v;
  return out;
}

/** The settings with a patch merged in, checked (an unknown mode, arrangement or utility throws, naming it). */
export function normalizeHx(patch, prev = HX_DEFAULTS) {
  const s = merge(prev ?? HX_DEFAULTS, patch ?? {});
  if (!["utility", "two"].includes(s.mode)) throw new Error(`hx.mode must be "utility" or "two" (got ${JSON.stringify(s.mode)}).`);
  if (!ARRANGEMENTS.includes(s.arrangement)) throw new Error(`hx.arrangement "${s.arrangement}" is not one of ${ARRANGEMENTS.join(", ")}.`);
  if (!UTILITY_KINDS.some(([k]) => k === s.utility.kind)) throw new Error(`hx.utility.kind "${s.utility.kind}" is not one of ${UTILITY_KINDS.map(k => k[0]).join(", ")}.`);
  if (!["service", "film", "value"].includes(s.U.source)) throw new Error(`hx.U.source must be service, film or value (got ${JSON.stringify(s.U.source)}).`);
  if (!TWO_SPECS.some(([k]) => k === s.spec.kind)) throw new Error(`hx.spec.kind "${s.spec.kind}" is not one of ${TWO_SPECS.map(k => k[0]).join(", ")}.`);
  if (!HEAT_TRANSFER.services.rows.some(r => r.id === s.U.service)) throw new Error(`hx.U.service "${s.U.service}" is not a row of Table 2.2.`);
  if (!(Number.isInteger(s.shells) && s.shells >= 1 && s.shells <= 10)) throw new Error(`hx.shells must be a whole number from 1 to 10 (got ${s.shells}).`);
  if (!(Number.isInteger(s.zones) && s.zones >= 2 && s.zones <= 200)) throw new Error(`hx.zones must be a whole number from 2 to 200 (got ${s.zones}).`);
  for (const k of ["hot", "cold"]) {
    const c = s[k].components;
    if (c != null && !(Array.isArray(c) && c.length <= HX_STREAM_MAX)) throw new Error(`hx.${k}.components must be a list of at most ${HX_STREAM_MAX} components.`);
  }
  return s;
}

/** A stream's mole fractions for n components (null or a wrong length: equimolar), normalized. */
export function streamZ(z, n) {
  if (!Array.isArray(z) || z.length !== n || !(z.reduce((a, v) => a + v, 0) > 0)) return new Array(n).fill(1 / n);
  const sum = z.reduce((a, v) => a + v, 0);
  return z.map(v => v / sum);
}

/** The U request of the engine (overallU) from the settings. */
export function uRequest(U) {
  if (U.source === "value") return { value: U.value };
  if (U.source === "service") return { service: U.service, pick: U.pick };
  const f = U.film, sideOf = o => ({ ...(o.h != null ? { h: o.h } : { hId: o.hId }), ...(o.Rf != null ? { Rf: o.Rf } : o.RfId ? { RfId: o.RfId } : {}) });
  return { film: { hot: sideOf(f.hot), cold: sideOf(f.cold), wall: { ...(f.wall.k_W_mK != null ? { k_W_mK: f.wall.k_W_mK } : { material: f.wall.material }), t_mm: f.wall.t_mm } } };
}

/** The utility request of the engine from the settings ("fluid-T" is the constant-temperature fluid). */
export function utilityRequest(u) {
  if (u.kind === "steam") return { kind: "steam", P_kPa: u.P_kPa };
  if (u.kind === "water") return { kind: "water", T_in_K: u.T_in_K, T_out_K: u.T_out_K, P_kPa: u.water_P_kPa };
  if (u.kind === "fluid-T") return { kind: "fluid", T_K: u.T_K };
  if (u.kind === "fluid") return { kind: "fluid", T_in_K: u.T_in_K, T_out_K: u.T_out_K, cp_J_kgK: u.cp_J_kgK };
  return { kind: "electric" };
}

/**
 * Size the exchanger of the settings with the system `sys` (the workspace's components and model), or in two-stream
 * mode with each stream's own system (`systems.hot`, `systems.cold`; sys when not given): { result, wall, process?,
 * electric? }; throws the engine's error (named) when a stream, the utility or the arrangement does not fit.
 */
export function hxCalc(sys, hx, systems = {}) {
  const mk = (s, sy = sys) => stream(sy, { flow_kmol_h: streamZ(s.z, sy.n).map(v => v * s.flow), T_K: s.T_K, P_kPa: s.P_kPa });
  const common = { U: uRequest(hx.U), arrangement: hx.arrangement, shells: hx.shells, zones: hx.zones };
  let result = null, electric = null, process = null;
  if (hx.mode === "utility") {
    const p = hx.process;
    process = mk(p);
    const out = p.out === "VF" ? { VF_out: p.VF_out } : { T_out_K: p.T_out_K };
    const outlet = stream(sys, { flow_kmol_h: process.flows, P_kPa: p.P_kPa - (p.dP_kPa ?? 0), ...(p.out === "VF" ? { VF: p.VF_out } : { T_K: p.T_out_K }) });
    const heat = outlet.H_kW > process.H_kW;
    if (hx.utility.kind === "electric") {
      if (!heat) throw new Error("Electric heating cannot cool; choose water or a fluid of your own.");
      electric = { power_kW: outlet.H_kW - process.H_kW, outlet };
    } else {
      const proc = { stream: process, dP_kPa: p.dP_kPa, ...out };
      const util = { utility: utilityRequest(hx.utility) };
      result = exchangerArea(sys, { ...common, ...(heat ? { hot: util, cold: proc } : { hot: proc, cold: util }) });
    }
  } else {
    const sh = systems.hot ?? sys, sc = systems.cold ?? sys;
    const hot = mk(hx.hot, sh), cold = mk(hx.cold, sc);
    if (!(hot.T_K > cold.T_K)) throw new Error("The hot stream must enter hotter than the cold stream; swap them.");
    const k = hx.spec.kind, v = hx.spec.value;
    const sides = { hot: { stream: hot, sys: sh, dP_kPa: hx.hot.dP_kPa, ...(k === "T_hot_out_K" ? { T_out_K: v } : {}) },
      cold: { stream: cold, sys: sc, dP_kPa: hx.cold.dP_kPa, ...(k === "T_cold_out_K" ? { T_out_K: v } : {}) } };
    // the minimum approach: the engine's own search (as the flowsheet block "hx")
    if (k === "dTmin_K") result = exchangerApproach(sys, { ...common, ...sides, dTmin_K: v });
    else result = exchangerArea(sys, { ...common, ...sides, ...(k === "duty_kW" ? { duty_kW: v } : {}) });
  }
  let wall = null;
  if (hx.wall.S_MPa != null) wall = wallThickness(hx.wall);
  return { result, electric, process, wall };
}

/** The zones and the summary as tables for the Excel and CSV exports (temperatures in the display unit). */
export function hxTables(r, { tFmt, tUnit }) {
  return [{
    name: "Zones", title: `Temperature-heat curves in ${r.zones.length} zones (${r.arrangement})`,
    columns: [{ label: "Heat from the hot inlet", unit: "kW" }, { label: "Hot side", unit: tUnit }, { label: "Cold side", unit: tUnit },
      { label: "ΔT", unit: "K" }, { label: "Zone UA", unit: "W/K" }, { label: "Zone area", unit: "m²" }],
    rows: [...r.zones.map(z => [z.q0_kW, tFmt(z.Th0_K), tFmt(z.Tc0_K), z.Th0_K - z.Tc0_K, z.UA_W_K, z.area_m2]),
      [r.duty_kW, tFmt(r.zones.at(-1).Th1_K), tFmt(r.zones.at(-1).Tc1_K), r.zones.at(-1).Th1_K - r.zones.at(-1).Tc1_K, null, null]],
  }];
}
