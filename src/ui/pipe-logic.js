/**
 * Pipe workspace of the workbench (proposal 0020; the maintainer, 2026-11-07: "put it in the model tab so I can check a
 * pipe without doing a flowsheet"): the DOM-free part. The settings kept in the state (`state.pipe`, null until the
 * person changes one), the request sent to the engine (the Pipe block, src/units/pipe.js, through runUnit), the result
 * as rows for the Results panel, and the profile as a table for the exports. No thermodynamics here: pipeCalc builds
 * the inlet with CHEPTA.stream and calls runUnit("pipe").
 *
 * The defaults are the geometry of the open worked example the engine is tested on (J. M. Cimbala, ME 320 Lecture 21,
 * Penn State, 2015, pp. 3-4: 100 m of a 5.00 cm pipe, roughness 0.0050 cm as its solution takes it; test/pipe.test.js),
 * a feed of the workspace's components at 25 °C and 500 kPa, adiabatic, no fittings and no elevation.
 * Units inside: m, K, kPa, kmol/h or kg/h, kW.
 */
import { stream } from "../stream/stream.js";
import { runUnit } from "../units/units.js";
import { FITTINGS, HEAT_MODES } from "../units/pipe.js";

/** The settings of a new Pipe workspace. */
export const PIPE_DEFAULTS = Object.freeze({
  // the inlet: its flow (in kmol/h or kg/h), mole fractions (null: equimolar), temperature and pressure
  feed: { flow: 100, basis: "kmol/h", z: null, T_K: 298.15, P_kPa: 500 },
  length_m: 100, diameter_m: 0.05, roughness_m: 5e-5, elevation_m: 0,
  // { fitting (a key of FITTINGS) | K | L_D, count }
  fittings: [],
  heat: "adiabatic", U_W_m2K: 10, T_ambient_K: 283.15,
  segments: 20,
  // the person's own Darcy friction factor and viscosity (null: from Re and the roughness; from the records)
  friction_factor: null, viscosity_Pa_s: null,
});

/** The heat modes, as the Inputs panel names them. */
export const PIPE_HEAT = [["adiabatic", "Adiabatic"], ["isothermal", "Isothermal"], ["U", "Heat loss (U)"]];
/** The fittings the Inputs panel offers: DOE-HDBK-1012/3-92 Table 1, then a K or an Leq/D of the person's own. */
export const FITTING_CHOICES = [...Object.entries(FITTINGS).map(([k, [label, ld]]) => [k, `${label} (Leq/D ${ld})`]),
  ["K", "Your own loss coefficient K"], ["L_D", "Your own Leq/D"]];
/** Roughnesses printed in the worked example the engine is tested on (Cimbala, Lecture 21): smooth, and its solution's. */
export const ROUGHNESS_NOTE = "The wall roughness is yours (0 for a smooth pipe). The default, 0.05 mm, is the one of the worked example of Cimbala, ME 320 Lecture 21 (Penn State), that the Pipe block is tested on.";

const isObj = v => v && typeof v === "object" && !Array.isArray(v);
function merge(prev, patch) {
  if (!isObj(patch)) return patch;
  const out = { ...prev };
  for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) && isObj(prev?.[k]) ? merge(prev[k], v) : v;
  return out;
}
const pos = (v, what) => { if (!(Number.isFinite(v) && v > 0)) throw new Error(`pipe.${what} must be a positive number (got ${JSON.stringify(v)}).`); };
const opt = (v, what) => { if (v != null) pos(v, what); };

/** The settings with a patch merged in (arrays replace), checked: a wrong shape throws, naming it. */
export function normalizePipe(patch, prev = PIPE_DEFAULTS) {
  const s = merge(prev ?? PIPE_DEFAULTS, patch ?? {});
  pos(s.feed.flow, "feed.flow");
  if (!["kmol/h", "kg/h"].includes(s.feed.basis)) throw new Error(`pipe.feed.basis must be "kmol/h" or "kg/h" (got ${JSON.stringify(s.feed.basis)}).`);
  pos(s.feed.T_K, "feed.T_K"); pos(s.feed.P_kPa, "feed.P_kPa");
  if (s.feed.z != null && !Array.isArray(s.feed.z)) throw new Error("pipe.feed.z must be a list of mole fractions, or null.");
  pos(s.length_m, "length_m"); pos(s.diameter_m, "diameter_m");
  if (!(Number.isFinite(s.roughness_m) && s.roughness_m >= 0)) throw new Error(`pipe.roughness_m must be 0 or more (got ${JSON.stringify(s.roughness_m)}).`);
  if (!Number.isFinite(s.elevation_m)) throw new Error(`pipe.elevation_m must be a number (got ${JSON.stringify(s.elevation_m)}).`);
  if (!Array.isArray(s.fittings)) throw new Error("pipe.fittings must be a list.");
  for (const [i, f] of s.fittings.entries()) {
    if (!isObj(f)) throw new Error(`pipe.fittings[${i}] must be an object.`);
    if (f.fitting != null && !FITTINGS[f.fitting]) throw new Error(`pipe.fittings[${i}].fitting "${f.fitting}" is not one of ${Object.keys(FITTINGS).join(", ")}.`);
  }
  if (!HEAT_MODES.includes(s.heat)) throw new Error(`pipe.heat must be one of ${HEAT_MODES.join(", ")} (got ${JSON.stringify(s.heat)}).`);
  if (!(Number.isFinite(s.U_W_m2K) && s.U_W_m2K >= 0)) throw new Error(`pipe.U_W_m2K must be 0 or more (got ${JSON.stringify(s.U_W_m2K)}).`);
  pos(s.T_ambient_K, "T_ambient_K");
  if (!(Number.isInteger(s.segments) && s.segments >= 1 && s.segments <= 1000)) throw new Error(`pipe.segments must be a whole number from 1 to 1000 (got ${s.segments}).`);
  opt(s.friction_factor, "friction_factor"); opt(s.viscosity_Pa_s, "viscosity_Pa_s");
  return s;
}

/** The feed's mole fractions for n components (null or a wrong length: equimolar), normalized. */
export function pipeZ(z, n) {
  if (!Array.isArray(z) || z.length !== n || !(z.reduce((a, v) => a + v, 0) > 0)) return new Array(n).fill(1 / n);
  const sum = z.reduce((a, v) => a + v, 0);
  return z.map(v => v / sum);
}

/** The specification of the Pipe block (src/units/pipe.js) from the settings. */
export function pipeSpec(p) {
  const spec = { length_m: p.length_m, diameter_m: p.diameter_m, roughness_m: p.roughness_m, elevation_m: p.elevation_m,
    fittings: p.fittings.map(f => ({ ...f })), heat: p.heat, segments: p.segments };
  if (p.heat === "U") Object.assign(spec, { U_W_m2K: p.U_W_m2K, T_ambient_K: p.T_ambient_K });
  if (p.friction_factor != null) spec.friction_factor = p.friction_factor;
  if (p.viscosity_Pa_s != null) spec.viscosity_Pa_s = p.viscosity_Pa_s;
  return spec;
}

/** The inlet stream of the settings with the system `sys` (the workspace's components and model). */
export function pipeInlet(sys, p) {
  const z = pipeZ(p.feed.z, sys.n);
  // kg/h: the molar flow from the mean molar mass of the composition
  const F = p.feed.basis === "kg/h" ? p.feed.flow / z.reduce((a, zi, i) => a + zi * sys.MW[i], 0) : p.feed.flow;
  return stream(sys, { flow_kmol_h: z.map(v => v * F), T_K: p.feed.T_K, P_kPa: p.feed.P_kPa });
}

/**
 * Run the pipe of the settings with the system `sys`: { ok: true, inlet, result } or, when the engine refuses (a
 * two-phase inlet, a pressure that falls to zero, choking, a missing record), { ok: false, refused: { code, message } }.
 * A solver that does not converge, or any other failure, throws (an error, not a refusal).
 */
export function pipeCalc(sys, p) {
  let inlet;
  try { inlet = pipeInlet(sys, p); } catch (e) { if (e.code) return { ok: false, refused: { code: e.code, message: e.message } }; throw e; }
  try {
    const result = runUnit("pipe", { sys, inlets: { in: inlet }, spec: pipeSpec(p) });
    return { ok: true, inlet, result };
  } catch (e) {
    if (e.code === "NOT_AVAILABLE" || e.code === "BAD_INPUT" || e.code === "OUT_OF_RANGE" || e.code === "MISSING_DATA" || e.code === "PHASE_SPLIT") return { ok: false, inlet, refused: { code: e.code, message: e.message } };
    throw e;
  }
}

const REGIME = { laminar: "laminar", turbulent: "turbulent", transition: "transition" };
/** The regime in words ("turbulent", "laminar and transition"). */
export const regimeText = r => String(r).split(" and ").map(x => REGIME[x] ?? x).join(" and ");

/**
 * The pressure drop and its parts as rows [label, kPa, share of the total (or null)]: friction, fittings, elevation,
 * acceleration, then the total. A share is left out when the total is not positive (a pipe going down can gain pressure).
 */
export function pressureSplit(state) {
  const parts = [["Friction", state.dP_friction_kPa], ["Fittings", state.dP_fittings_kPa], ["Elevation", state.dP_elevation_kPa], ["Acceleration", state.dP_acceleration_kPa]];
  const total = state.dP_kPa;
  return [...parts.map(([k, v]) => [k, v, total > 0 ? v / total : null]), ["Total", total, total > 0 ? 1 : null]];
}

/** The profile along the pipe as a table for the Excel and CSV exports (temperatures in the display unit). */
export function pipeTables(result, { tFmt, tUnit, pFmt, pUnit }) {
  return [{
    name: "Profile", title: `Profile along the pipe in ${result.profile.length - 1} segments`,
    columns: [{ label: "Distance", unit: "m" }, { label: "Height", unit: "m" }, { label: "Pressure", unit: pUnit }, { label: "Temperature", unit: tUnit },
      { label: "Density", unit: "kg/m³" }, { label: "Velocity", unit: "m/s" }, { label: "Reynolds number", unit: "" }, { label: "Friction factor (Darcy)", unit: "" }],
    rows: result.profile.map(n => [n.x_m, n.z_m, pFmt(n.P_kPa), tFmt(n.T_K), n.rho_kg_m3, n.velocity_m_s, n.Re, n.friction_factor]),
  }];
}
