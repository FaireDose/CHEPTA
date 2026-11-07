/**
 * The Pipe block (proposal 0020; layer 4): one fluid phase flowing through a straight pipe of given length, inner
 * diameter and wall roughness, with a change of elevation, fittings, and heat to or from the surroundings. It gives the
 * pressure drop split into friction, fittings, elevation and acceleration, the velocity, the Reynolds number, the
 * friction factor and the outlet temperature; the outlet is a P-H flash at H_in + heat (src/stream/stream.js).
 *
 *   runUnit("pipe", { sys, inlets: { in: s }, spec: { length_m: 100, diameter_m: 0.05, roughness_m: 5e-5,
 *     elevation_m: 0, fittings: [{ fitting: "elbow-90", count: 4 }, { K: 0.5 }], heat: "adiabatic" } })
 *
 * The equations, and where they are written (all free to read):
 *  - the momentum balance of a segment of length dx, inclination from the elevation change, as in G. Bar-Meir,
 *    Fundamentals of Compressible Fluid Mechanics, version 0.5.0 (2021), eq. (9.9), p. 239 (GNU Free Documentation
 *    License; https://zenodo.org/record/5523349), with its Fanning factor written as the Darcy factor f = 4 f_Fanning
 *    (its footnote 2, p. 238) and the static head added:
 *      -dP = f (dx/D) G^2 / (2 rho) + rho g dz + G^2 d(1/rho),   G = mdot / A (the mass flux, constant along the pipe);
 *    the last term is the acceleration of a gas whose density falls; for a liquid it is negligible but kept;
 *  - Darcy's equation for the friction and the fittings, h = f (L/D) v^2/2g and h = K v^2/2g, and the equivalent length
 *    of a fitting, K = f (Leq/D): U.S. Department of Energy, DOE Fundamentals Handbook: Thermodynamics, Heat Transfer,
 *    and Fluid Flow, Volume 3 of 3, DOE-HDBK-1012/3-92 (June 1992), module HT-03, eqs. (3-14) to (3-17), pp. 32-34 (a
 *    work of the U.S. government, public domain; https://archive.org/details/MManuals, file
 *    Thermo-HeatTransfer-FluidFlowVolIii.pdf). Its Table 1, "Typical Values of Leq/D" (p. 34), is FITTINGS below;
 *  - the flow regime: "if the Reynolds number is less than 2000, the flow is laminar. If it is greater than 3500, the
 *    flow is turbulent" (same handbook, p. 19); laminar, f = 64/Re (its Moody chart, Figure B-1, p. B-1);
 *  - turbulent: the Colebrook equation, 1/sqrt(f) = -2.0 log10((eps/D)/3.7 + 2.51/(Re sqrt(f))), solved exactly here
 *    (Newton's method on 1/sqrt(f), started from Haaland's approximation 1/sqrt(f) = -1.8 log10(6.9/Re +
 *    ((eps/D)/3.7)^1.11)): J. M. Cimbala, ME 320 Fluid Flow, Lecture 21, Penn State University (Spring 2015), p. 2,
 *    https://www.me.psu.edu/cimbala/me320web_Spring_2015/Lectures/NON_Annotated_Tablet_PC_Notes/ME320_Lecture_21.pdf
 *    (course notes, free to read on the university's site);
 *  - between 2000 and 3500 (transition) the Churchill (1977) equation, as DWSIM's pipe segment uses there (DWSIM,
 *    GPL-3.0, DWSIM.UnitOperations/FluidFlowCorrelations/FlowPackageBaseClass.vb, function FrictionFactor, branch
 *    "windows"): f = 8 [(8/Re)^12 + 1/(A + B)^1.5]^(1/12), A = (2.457 ln(1/((7/Re)^0.9 + 0.27 eps/D)))^16,
 *    B = (37530/Re)^16, with the warning FLOW_TRANSITION: there the friction factor is uncertain;
 *  - heat to the surroundings, Q = U A dT_lm over each segment, A = pi D dx the inner surface, as DWSIM's pipe segment
 *    does (Pipe.vb, "Q=UA\Delta T_{ml}"; DWSIM takes the outer surface: here U refers to the inner one);
 *  - g = 9.80665 m/s^2, the standard acceleration of gravity.
 * The fluid's properties at each node: a gas's density from the system's own vapour model, rho = M P / (Z R T), its
 * viscosity by Wilke's rule on the pure vapours' low-pressure records (src/units/kinetic-reactors.js); a liquid's density
 * from the pure liquids' density records (the volumes add up, as the pump does; the pressure effect neglected) and its
 * viscosity by the logarithmic mole-fraction rule (as src/sizing/sizing.js); viscosity_Pa_s, the person's own value,
 * replaces the records. Over each segment the properties are the mean of its two ends (as DWSIM, "a arithmetic mean of
 * inlet and outlet conditions"), and the outlet pressure of the segment is iterated until the balance closes.
 * Kinetic and potential energy are left out of the energy balance (100 m of elevation is 0.98 kJ/kg), so the enthalpy
 * flows close the balance with the heat alone.
 * Only one fluid phase: a two-phase or solid-bearing inlet, or a phase change inside the pipe, is refused with the
 * reason (NOT_AVAILABLE); two-phase methods are a later step of proposal 0020. A gas that reaches the isothermal choking
 * limit (rho u^2 = P, where eq. 9.9 is singular) is refused too.
 * Units: m, kPa, K, kW.
 */
import { fail } from "../util/errors.js";
import { brent } from "../util/solve.js";
import { stream } from "../stream/stream.js";
import { pure, R } from "../thermo/pure.js";
import { registerUnit } from "./units.js";
import { gasViscosity } from "./kinetic-reactors.js";

export const G_STANDARD = 9.80665;

/** DOE-HDBK-1012/3-92, module HT-03, Table 1 "Typical Values of Leq/D" (p. 34): key → [label, Leq/D]. */
export const FITTINGS = Object.freeze({
  "globe-valve": ["Globe valve, conventional", 400],
  "globe-valve-y": ["Globe valve, Y-pattern", 160],
  "gate-valve": ["Gate valve, fully open", 10],
  "gate-valve-75": ["Gate valve, 75 % open", 35],
  "gate-valve-50": ["Gate valve, 50 % open", 150],
  "gate-valve-25": ["Gate valve, 25 % open", 900],
  "tee-run": ["Standard tee, flow through run", 10],
  "tee-branch": ["Standard tee, flow through branch", 60],
  "elbow-90": ["90° standard elbow", 30],
  "elbow-45": ["45° standard elbow", 16],
  "return-bend": ["Return bend", 50],
});
export const FITTINGS_SOURCE = "U.S. DOE, DOE Fundamentals Handbook: Thermodynamics, Heat Transfer, and Fluid Flow, Vol. 3, DOE-HDBK-1012/3-92 (1992), module HT-03, Table 1, p. 34 (public domain)";

/** The flow regime limits of DOE-HDBK-1012/3-92, p. 19. */
export const RE_LAMINAR = 2000, RE_TURBULENT = 3500;
export const HEAT_MODES = ["adiabatic", "isothermal", "U"];
const SPEC_KEYS = ["length_m", "diameter_m", "roughness_m", "elevation_m", "fittings", "heat", "U_W_m2K", "T_ambient_K", "segments",
  "friction_factor", "viscosity_Pa_s"];
const SEGMENTS = 20;

/** Colebrook's equation solved for the Darcy friction factor (Newton on x = 1/sqrt(f), from Haaland's value). */
export function colebrook(Re, relRough) {
  let x = -1.8 * Math.log10(6.9 / Re + (relRough / 3.7) ** 1.11);
  for (let i = 0; i < 50; i++) {
    const a = relRough / 3.7 + 2.51 * x / Re;
    const g = x + 2 * Math.log10(a);
    const dg = 1 + 2 / (a * Math.LN10) * 2.51 / Re;
    const dx = g / dg;
    x -= dx;
    if (Math.abs(dx) < 1e-14 * Math.abs(x)) break;
  }
  return 1 / (x * x);
}

/** Churchill's (1977) equation for the Darcy friction factor, as DWSIM writes it (see the header). */
export function churchill(Re, relRough) {
  const A = (2.457 * Math.log(1 / ((7 / Re) ** 0.9 + 0.27 * relRough))) ** 16;
  const B = (37530 / Re) ** 16;
  return 8 * ((8 / Re) ** 12 + 1 / (A + B) ** 1.5) ** (1 / 12);
}

/** The Darcy friction factor and the regime at Re for relative roughness eps/D (see the header). */
export function frictionFactor(Re, relRough) {
  if (!(Re > 0)) throw fail("BAD_INPUT", `Pipe: the Reynolds number must be positive (got ${Re}).`);
  if (Re < RE_LAMINAR) return { f: 64 / Re, regime: "laminar" };
  if (Re > RE_TURBULENT) return { f: colebrook(Re, relRough), regime: "turbulent" };
  return { f: churchill(Re, relRough), regime: "transition" };
}

/**
 * The pressure profile of one fluid phase along a pipe, in `segments` segments (the core of the block, also used by the
 * tests with a fluid of their own):
 *   geometry { L, D, roughness, dz, K, LD } (m; K the sum of the fittings' loss coefficients, LD the sum of their Leq/D),
 *   mass_kg_s, start { P_kPa, T_K, rho, mu, ... }, end(P_kPa, a, dx_m, i) → the state at the end of segment i
 *   (the energy balance is the caller's), segments, friction_factor (a given Darcy factor, or null).
 * → { nodes, split: { friction, fittings, elevation, acceleration } (kPa), last, regimes }
 */
export function pipeProfile({ geometry, mass_kg_s, start, end, segments = SEGMENTS, friction_factor = null, who = "Pipe" }) {
  const { L, D, roughness = 0, dz = 0, K = 0, LD = 0 } = geometry;
  const A = Math.PI * D * D / 4, G = mass_kg_s / A, dx = L / segments;
  const split = { friction: 0, fittings: 0, elevation: 0, acceleration: 0 };
  const node = (s, x, Re, f, regime) => ({ x_m: x, z_m: dz * x / L, P_kPa: s.P_kPa, T_K: s.T_K, rho_kg_m3: s.rho, velocity_m_s: G / s.rho, Re, friction_factor: f, regime });
  const nodes = [];
  const regimes = new Set();
  let a = start;
  for (let i = 0; i < segments; i++) {
    // the segment's drops at the outlet guess P (kPa): → { P (the balance's outlet pressure), b, parts }
    const drops = P => {
      if (!(P > 0)) throw fail("BAD_INPUT", `${who}: the pressure falls to zero within the pipe (segment ${i + 1} of ${segments}, at ${+(i * dx).toPrecision(4)} m): the pressure drop exceeds the inlet pressure; widen or shorten the pipe, or lower the flow.`);
      const b = end(P, a, dx, i);
      const rho = (a.rho + b.rho) / 2, mu = (a.mu + b.mu) / 2;
      const Re = G * D / mu;
      const fr = friction_factor != null ? { f: friction_factor, regime: Re < RE_LAMINAR ? "laminar" : Re > RE_TURBULENT ? "turbulent" : "transition" } : frictionFactor(Re, roughness / D);
      const v2 = G * G / (2 * rho);   // Pa
      const parts = { friction: fr.f * dx / D * v2, fittings: (K + fr.f * LD) / segments * v2, elevation: rho * G_STANDARD * dz / segments,
        acceleration: G * G * (1 / b.rho - 1 / a.rho) };
      const dP = (parts.friction + parts.fittings + parts.elevation + parts.acceleration) / 1000;
      return { P: a.P_kPa - dP, b, parts, Re, fr };
    };
    // the outlet pressure: fixed-point steps, then the secant on r(P) = P_balance(P) - P
    let P0 = a.P_kPa, r0 = drops(P0), res0 = r0.P - P0;
    let P1 = r0.P, r1 = drops(P1), res1 = r1.P - P1;
    let it = 0;
    while (Math.abs(res1) > 1e-10 * a.P_kPa + 1e-12 && it++ < 60) {
      const P2 = Math.abs(res1 - res0) > 0 ? P1 - res1 * (P1 - P0) / (res1 - res0) : r1.P;
      P0 = P1; res0 = res1;
      P1 = P2 > 0 ? P2 : P1 / 2;
      r1 = drops(P1); res1 = r1.P - P1;
    }
    if (Math.abs(res1) > 1e-10 * a.P_kPa + 1e-12) {
      throw fail("NO_CONVERGENCE", `${who}: the pressure of segment ${i + 1} of ${segments} did not converge (the balance misses by ${Math.abs(res1).toPrecision(3)} kPa)${a.phase === "vapour" ? "; the gas may be near choking: widen or shorten the pipe, or lower the flow" : "; try more segments"}.`);
    }
    const b = r1.b;
    if (i === 0) nodes.push(node(a, 0, r1.Re, r1.fr.f, r1.fr.regime));
    // the isothermal choking limit of eq. (9.9): -dP (1 - rho u^2 / P) = ..., singular at rho u^2 = P
    if (G * G / b.rho >= b.P_kPa * 1000) {
      throw fail("NOT_AVAILABLE", `${who}: the gas reaches the choking limit at ${+((i + 1) * dx).toPrecision(4)} m (rho u² = P, ${+(G / b.rho).toPrecision(4)} m/s): choked flow is not modelled. Widen or shorten the pipe, or lower the flow.`);
    }
    for (const k of Object.keys(split)) split[k] += r1.parts[k] / 1000;
    regimes.add(r1.fr.regime);
    nodes.push(node(b, (i + 1) * dx, r1.Re, r1.fr.f, r1.fr.regime));
    a = b;
  }
  return { nodes, split, last: a, regimes: [...regimes], G_kg_m2s: G, A_m2: A };
}

const has = (spec, k) => spec[k] !== undefined && spec[k] !== null && spec[k] !== "";
const num = (v, what, { min = -Infinity, positive = false } = {}) => {
  const x = Number(v);
  if (v === "" || v === null || typeof v === "boolean" || !Number.isFinite(x) || (positive && !(x > 0)) || x < min) {
    throw fail("BAD_INPUT", `Pipe: ${what} must be ${positive ? "a positive number" : min > -Infinity ? `a number of at least ${min}` : "a number"} (got ${JSON.stringify(v)}).`);
  }
  return x;
};

function dof(spec) {
  const out = { needed: 3, given: 0, missing: [], extra: [] };
  if (has(spec, "length_m")) out.given++; else out.missing.push("the length length_m");
  if (has(spec, "diameter_m")) out.given++; else out.missing.push("the inner diameter diameter_m");
  if (has(spec, "roughness_m") || has(spec, "friction_factor")) out.given++; else out.missing.push("the wall roughness roughness_m (or your own friction_factor)");
  if ((spec.heat ?? "adiabatic") === "U") {
    out.needed += 2;
    if (has(spec, "U_W_m2K")) out.given++; else out.missing.push("the heat transfer coefficient U_W_m2K");
    if (has(spec, "T_ambient_K")) out.given++; else out.missing.push("the temperature of the surroundings T_ambient_K");
  }
  return out;
}

/** The fittings: a list of { fitting (a key of FITTINGS) | K | L_D, count } → { K, LD, list }. */
export function fittingsOf(list) {
  if (list == null) return { K: 0, LD: 0, list: [] };
  if (!Array.isArray(list)) throw fail("BAD_INPUT", "Pipe: fittings is a list, e.g. [{ fitting: \"elbow-90\", count: 4 }, { K: 0.5 }].");
  let K = 0, LD = 0;
  const out = list.map((e, i) => {
    const what = `fitting ${i + 1}`;
    if (!e || typeof e !== "object") throw fail("BAD_INPUT", `Pipe: ${what} must be { fitting, count }, { K, count } or { L_D, count }.`);
    const bad = Object.keys(e).filter(k => !["fitting", "K", "L_D", "count", "label"].includes(k));
    if (bad.length) throw fail("BAD_INPUT", `Pipe: ${what}: unknown key${bad.length > 1 ? "s" : ""} ${bad.map(k => `"${k}"`).join(", ")}. Known: fitting, K, L_D, count, label.`);
    const kinds = ["fitting", "K", "L_D"].filter(k => has(e, k));
    if (kinds.length !== 1) throw fail("BAD_INPUT", `Pipe: ${what}: give one of fitting (one of ${Object.keys(FITTINGS).join(", ")}), K (a loss coefficient) or L_D (an equivalent length over the diameter).`);
    const count = has(e, "count") ? num(e.count, `${what}: count`, { min: 1 }) : 1;
    if (!Number.isInteger(count)) throw fail("BAD_INPUT", `Pipe: ${what}: count must be a whole number (got ${e.count}).`);
    if (kinds[0] === "fitting") {
      const t = FITTINGS[e.fitting];
      if (!t) throw fail("BAD_INPUT", `Pipe: ${what}: unknown fitting "${e.fitting}". Known: ${Object.keys(FITTINGS).join(", ")}; or give K or L_D.`);
      LD += t[1] * count;
      return { fitting: e.fitting, label: t[0], L_D: t[1], count, source: FITTINGS_SOURCE };
    }
    if (kinds[0] === "K") { const k = num(e.K, `${what}: K`, { min: 0 }); K += k * count; return { K: k, count, ...(e.label ? { label: String(e.label) } : {}) }; }
    const ld = num(e.L_D, `${what}: L_D`, { min: 0 }); LD += ld * count;
    return { L_D: ld, count, ...(e.label ? { label: String(e.label) } : {}) };
  });
  return { K, LD, list: out };
}

function checkSpec(spec) {
  const d = dof(spec);
  if (d.missing.length) throw fail("BAD_INPUT", `Pipe: missing ${d.missing.join("; ")}.`);
  const heat = spec.heat ?? "adiabatic";
  if (!HEAT_MODES.includes(heat)) throw fail("BAD_INPUT", `Pipe: heat must be one of ${HEAT_MODES.join(", ")} (got ${JSON.stringify(spec.heat)}).`);
  if (heat !== "U" && (has(spec, "U_W_m2K") || has(spec, "T_ambient_K"))) throw fail("BAD_INPUT", `Pipe: U_W_m2K and T_ambient_K belong to heat "U" (the pipe is ${heat}).`);
  const segments = has(spec, "segments") ? num(spec.segments, "segments", { min: 1 }) : SEGMENTS;
  if (!Number.isInteger(segments) || segments > 1000) throw fail("BAD_INPUT", `Pipe: segments must be a whole number from 1 to 1000 (got ${spec.segments}).`);
  const c = {
    L: num(spec.length_m, "the length length_m", { positive: true }),
    D: num(spec.diameter_m, "the inner diameter diameter_m", { positive: true }),
    roughness: has(spec, "roughness_m") ? num(spec.roughness_m, "the roughness roughness_m", { min: 0 }) : 0,
    dz: has(spec, "elevation_m") ? num(spec.elevation_m, "the elevation change elevation_m") : 0,
    heat, segments,
    friction_factor: has(spec, "friction_factor") ? num(spec.friction_factor, "friction_factor (Darcy)", { positive: true }) : null,
    viscosity: has(spec, "viscosity_Pa_s") ? num(spec.viscosity_Pa_s, "viscosity_Pa_s", { positive: true }) : null,
    fittings: fittingsOf(spec.fittings),
  };
  if (Math.abs(c.dz) > c.L) throw fail("BAD_INPUT", `Pipe: the elevation change (${c.dz} m) cannot be larger than the length (${c.L} m).`);
  if (c.roughness >= c.D / 2) throw fail("BAD_INPUT", `Pipe: the roughness (${c.roughness} m) must be much smaller than the diameter (${c.D} m).`);
  if (heat === "U") {
    c.U = num(spec.U_W_m2K, "U_W_m2K", { min: 0 });
    c.Ta = num(spec.T_ambient_K, "T_ambient_K", { positive: true });
  }
  return c;
}

/** The density (kg/m³) and viscosity (Pa s) of a single-phase stream (see the header). */
function fluidProps(sys, s, viscosity) {
  const p = s.phases[0], x = p.composition, T = s.T_K;
  if (p.type === "vapour") {
    const Z = sys.phase("vapour", T, s.P_kPa, x).Z ?? 1;
    const M = x.reduce((a, xi, i) => a + xi * sys.MW[i], 0);
    return { rho: M / 1000 * s.P_kPa * 1000 / (Z * R * T), mu: viscosity ?? gasViscosity(sys, x, T, "Pipe"), Z };
  }
  let v = 0, mass = 0, lnMu = 0, sx = 0;
  x.forEach((xi, i) => {
    if (!(xi > 1e-12)) return;
    const c = pure(sys.ids[i], { userData: sys.userData });
    const get = (name, what) => { try { return c.property(name, T); } catch (e) { e.message = `Pipe: the liquid's ${what} needs the ${what} of ${c.name}: ${e.message}`; throw e; } };
    v += xi * c.MW / 1000 / get("liquidDensity", "density");
    mass += xi * c.MW / 1000;
    if (viscosity == null) lnMu += xi * Math.log(get("liquidViscosity", "viscosity"));
    sx += xi;
  });
  return { rho: mass / v, mu: viscosity ?? Math.exp(lnMu / sx) };
}

/** The phase of a stream, or a refusal: one fluid phase only. */
function onePhase(s, where) {
  if (s.phases.some(p => p.type === "solid")) {
    throw fail("NOT_AVAILABLE", `Pipe: the ${where} carries a solid; slurry flow is not modelled (single-phase flow only).`);
  }
  const fl = s.phases.filter(p => p.fraction > 1e-12);
  if (fl.length !== 1) {
    const kind = fl.every(p => p.type !== "vapour") ? "two liquids" : `vapour and liquid (vapour fraction ${+(s.VF ?? 0).toPrecision(4)})`;
    throw fail("NOT_AVAILABLE", `Pipe: the ${where} is two-phase (${kind}); the Pipe block is single-phase only. Two-phase pressure-drop methods (Lockhart-Martinelli, Beggs-Brill and others) are a later step of proposal 0020. Separate the phases first (a flash drum), or move the pipe to where the stream is one phase.`);
  }
  return fl[0].type;
}

function solve({ sys, inlets, spec: c }) {
  const s = inlets.in[0];
  if (!(s.F_kmol_h > 0)) {
    const out = stream(sys, { flow_kmol_h: s.flows, T_K: s.T_K ?? 298.15, P_kPa: s.P_kPa ?? 101.325 });
    return { outlets: { out }, duty_kW: 0, notes: ["The pipe has no flow: nothing is calculated."], state: { dP_kPa: 0 } };
  }
  const type = onePhase(s, "inlet");
  const mass_kg_s = s.mass_kg_h / 3600, F = s.F_kmol_h;
  const flows = s.flows, z = s.z;
  const T0 = s.T_K, H0 = s.H_kW;
  const st = (x, where) => { onePhase(x, where); if (x.phases.find(p => p.fraction > 1e-12).type !== type) throw fail("NOT_AVAILABLE", `Pipe: the ${type} becomes ${x.phases[0].type} ${where}; a phase change inside the pipe is not modelled (single-phase flow only).`); return x; };
  const state = (x, Q_kW = 0) => ({ stream: x, P_kPa: x.P_kPa, T_K: x.T_K, H_kW: x.H_kW, Q_kW, phase: type, ...fluidProps(sys, x, c.viscosity) });
  const hAt = (T, P) => sys.phase(type, T, P, z).h_J_mol * F / 3600;   // kW
  const where = (i, dx) => `at ${+((i + 1) * dx).toPrecision(4)} m along the pipe`;
  const end = (P, a, dx, i) => {
    if (c.heat === "isothermal") {
      const x = st(stream(sys, { flow_kmol_h: flows, T_K: T0, P_kPa: P }), where(i, dx));
      return state(x, a.Q_kW + (x.H_kW - a.H_kW));
    }
    if (c.heat === "adiabatic" || c.U === 0 || a.T_K === c.Ta) return state(st(stream(sys, { flow_kmol_h: flows, P_kPa: P, H_kW: a.H_kW }), where(i, dx)), a.Q_kW);
    // heat to the surroundings: Q (kW, lost) = U pi D dx dT_lm, with the segment's outlet temperature between its inlet's and the surroundings'
    const UA = c.U * Math.PI * c.D * dx / 1000, d1 = a.T_K - c.Ta;
    const lost = T => { const d2 = T - c.Ta; return UA * (Math.abs(d1 - d2) < 1e-9 * Math.abs(d1) || d1 * d2 <= 0 ? (d1 + d2) / 2 : (d1 - d2) / Math.log(d1 / d2)); };
    const g = T => hAt(T, P) - (a.H_kW - lost(T));
    const lo = Math.min(a.T_K, c.Ta), hi = Math.max(a.T_K, c.Ta);
    let T;
    const glo = g(lo + 1e-9 * lo), ghi = g(hi - 1e-9 * hi);
    if (glo * ghi < 0) T = brent(g, lo + 1e-9 * lo, hi - 1e-9 * hi, { xtol: 1e-10 });
    else T = brent(g, lo - 50, hi + 50, { xtol: 1e-10 });   // the pressure's own effect on h outweighs the heat over this segment
    const Q = lost(T);
    const x = st(stream(sys, { flow_kmol_h: flows, P_kPa: P, H_kW: a.H_kW - Q }), where(i, dx));
    return state(x, a.Q_kW - Q);
  };
  const p = pipeProfile({ geometry: { L: c.L, D: c.D, roughness: c.roughness, dz: c.dz, K: c.fittings.K, LD: c.fittings.LD }, mass_kg_s,
    start: state(s, 0), end, segments: c.segments, friction_factor: c.friction_factor });
  const duty = p.last.Q_kW;   // heat in (negative: lost to the surroundings)
  // the outlet: the P-H flash at the inlet's enthalpy plus the heat
  const out = st(stream(sys, { flow_kmol_h: flows, P_kPa: p.last.P_kPa, H_kW: H0 + duty }), "at the outlet");
  const first = p.nodes[0], last = p.nodes.at(-1);
  const warnings = [], notes = [];
  if (p.regimes.includes("transition")) warnings.push({ code: "FLOW_TRANSITION", message: `The Reynolds number lies between ${RE_LAMINAR} and ${RE_TURBULENT} in part of the pipe (transition between laminar and turbulent flow): the friction factor there (Churchill 1977) is uncertain.` });
  if ((c.fittings.K > 0 || c.fittings.LD > 0) && p.regimes.includes("laminar")) warnings.push({ code: "FITTINGS_LAMINAR", message: "The flow is laminar in part of the pipe: the fittings' K and Leq/D values are for turbulent flow, so their loss there is approximate." });
  if (c.friction_factor != null) notes.push(`The friction factor is your own (Darcy f = ${c.friction_factor}), not from the Reynolds number and the roughness.`);
  if (c.viscosity != null) notes.push(`The viscosity is your own (${c.viscosity} Pa s), not from the components' records.`);
  else if (type === "vapour") notes.push("The gas viscosity is the low-pressure value (Wilke's rule on the pure vapours' records); at high pressure a gas is more viscous, which changes the friction factor little in turbulent flow.");
  if (type === "liquid") notes.push("The liquid's density is from the pure liquids' records (their volumes add up), without the effect of pressure.");
  const dP = s.P_kPa - out.P_kPa;
  return {
    outlets: { out }, duty_kW: duty, notes, warnings,
    profile: p.nodes,
    state: {
      phase: type, heat: c.heat, P_in_kPa: s.P_kPa, P_out_kPa: out.P_kPa, T_in_K: T0, T_out_K: out.T_K,
      dP_kPa: dP, dP_friction_kPa: p.split.friction, dP_fittings_kPa: p.split.fittings, dP_elevation_kPa: p.split.elevation,
      dP_acceleration_kPa: p.split.acceleration,
      velocity_in_m_s: first.velocity_m_s, velocity_out_m_s: last.velocity_m_s,
      Re_in: first.Re, Re_out: last.Re, friction_factor_in: first.friction_factor, friction_factor_out: last.friction_factor,
      regime: p.regimes.length === 1 ? p.regimes[0] : p.regimes.join(" and "),
      rho_in_kg_m3: first.rho_kg_m3, rho_out_kg_m3: last.rho_kg_m3, mass_flux_kg_m2s: p.G_kg_m2s,
      heat_kW: duty, length_m: c.L, diameter_m: c.D, roughness_m: c.roughness, elevation_m: c.dz, segments: c.segments,
      fittings: { K: c.fittings.K, L_D: c.fittings.LD, list: c.fittings.list },
    },
  };
}

registerUnit({
  type: "pipe", label: "Pipe", duty: true,
  inlets: [{ port: "in" }], outlets: [{ port: "out" }],
  specKeys: SPEC_KEYS,
  checkSpec, dof, solve,
});
