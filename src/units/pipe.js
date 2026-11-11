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
 *
 * Gas-liquid flow (proposal 0020, the two-phase step): where a node of the pipe is vapour and liquid (a two-phase inlet,
 * a liquid that flashes, a gas that condenses), the phases and their compositions are the system's flash at that node
 * (the P-H flash of the energy balance), each phase's density and viscosity as above, and
 *  - the frictional gradient is Lockhart and Martinelli's (1949), in Chisholm's (1967) form, as written in A. Filip,
 *    F. Baltaretu, R.-M. Damian, "Comparison of two-phase pressure drop models for condensing flows in horizontal
 *    tubes", Mathematical Modelling in Civil Engineering 10(4) (2014) 19-27, doi:10.2478/mmce-2014-0019 (open access,
 *    CC BY-NC-ND 3.0), eqs. (10)-(17), pp. 21-22:
 *      (dp/dz) = phi_L^2 (dp/dz)_L,  phi_L^2 = 1 + C/X + 1/X^2,  X^2 = (dp/dz)_L / (dp/dz)_G,
 *      Re_L = G (1 - x) D / mu_L,  Re_G = G x D / mu_G   (x the vapour's mass fraction, the quality),
 *      C = 5 (Re_L < 1500, Re_G < 1500), 10 (Re_L > 1500, Re_G < 1500), 12 (Re_L < 1500, Re_G > 1500), 20 (both > 1500);
 *    the same C, "viscous" or "turbulent" for the liquid and the gas flowing alone, in Table 1 (p. 20) of M. W.
 *    Wambsganss, J. A. Jendrzejczyk, D. M. France, "Two-phase flow and pressure drop in flow passages of compact heat
 *    exchangers", Argonne National Laboratory, ANL/CP-74646 (1992), with eq. (4), p. 13 (a report of the U.S. government,
 *    OSTI 10119434, https://www.osti.gov/servlets/purl/10119434): they "provide approximations of the two-component,
 *    two-phase, circular-tube data of Lockhart and Martinelli". (dp/dz)_L and (dp/dz)_G, each phase flowing alone in the pipe,
 *    are the Darcy gradients f G_k^2 / (2 rho_k D) with this block's own friction factor (64/Re, Churchill, Colebrook
 *    with the wall's roughness; Filip et al. take a smooth tube), as DWSIM does (LockhartMartinelli.vb, read on
 *    2026-11-10). It is computed as (dp/dz)_L + C sqrt((dp/dz)_L (dp/dz)_G) + (dp/dz)_G, the same number, which
 *    tends to the single-phase gradient as x goes to 0 or 1; over a segment, the mean of its two ends' gradients;
 *  - the elevation and acceleration terms of eq. (9.9) take the homogeneous (no-slip) mixture, whose density is
 *    rho_H = 1 / (x/rho_G + (1 - x)/rho_L) (Filip et al., eqs. (5)-(6), p. 21; DWSIM's Lockhart-Martinelli takes the
 *    no-slip holdup for the elevation as well): the liquid holdup is then 1 - alpha with
 *    alpha = (x/rho_G) / (x/rho_G + (1 - x)/rho_L);
 *  - what it is good for: Lockhart and Martinelli correlated "isothermal two-phase, two-component flow" in horizontal
 *    pipes (the title of their paper, as cited by Filip et al., ref. 3). C. E. Brennen, Fundamentals of Multiphase
 *    Flow, Cambridge University Press (2005), section 8.3.1, p. 210 (the author's free copy on CaltechAUTHORS,
 *    https://authors.library.caltech.edu/records/n710r-5mn62): "the scatter in the data is significant (about a factor
 *    of 3 in phi_G) and ... the Lockhart-Martinelli prediction often yields an overestimate of the friction"; "the
 *    Lockhart-Martinelli correlations work best under conditions that do not imply large velocity differences", the
 *    turbulent-turbulent case (p. 211). A phase change along the pipe is treated by the same correlation at each node's
 *    quality (Martinelli and Nelson's extension for it, Brennen section 8.3.2, is not used), with a note. With an
 *    elevation change the no-slip holdup underestimates the liquid in the pipe (in Lockhart and Martinelli's picture
 *    the gas moves faster than the liquid, Brennen fig. 8.11), so the static head of uphill flow is low: a warning
 *    (TWO_PHASE_ELEVATION); Beggs and Brill, for inclined pipes, is a later step.
 * Refused, with the reason (NOT_AVAILABLE): a solid-bearing stream; two liquid phases, or vapour with two liquids; in
 * gas-liquid flow, fittings (no open two-phase loss coefficients found), the person's own friction factor or viscosity
 * (one value cannot stand for both phases). A gas that reaches the isothermal choking limit (rho u^2 = P, where eq. 9.9
 * is singular) is refused too; two-phase critical flow is not modelled (a segment that does not converge is refused).
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

/** Chisholm's C by the regimes of the liquid and the gas flowing alone ("v" viscous, "t" turbulent; liquid first):
 * Filip et al. (2014), eq. (17), p. 22; Wambsganss et al., ANL/CP-74646 (1992), Table 1, p. 20 (see the header). */
export const CHISHOLM_C = Object.freeze({ vv: 5, tv: 10, vt: 12, tt: 20 });
/** The Reynolds number that divides "viscous" from "turbulent" for Chisholm's C: Filip et al. (2014), eq. (17). */
export const RE_CHISHOLM = 1500;
export const TWO_PHASE_METHOD = "Lockhart-Martinelli (1949), Chisholm's (1967) C";

/**
 * The frictional pressure gradient of gas-liquid flow by Lockhart and Martinelli in Chisholm's form (see the header):
 * G the total mass flux (kg/(m² s)), D (m), relRough = eps/D, x the quality (the vapour's mass fraction, 0 < x < 1), the
 * phases' densities (kg/m³) and viscosities (Pa s). → { gradient_Pa_m, X, C, regimes ("tt", "vt", ...), phi_L2,
 * Re_L, Re_G, f_L, f_G, dpdz_L, dpdz_G (Pa/m, each phase alone), transition (a phase alone in 2000-3500) }
 */
export function lockhartMartinelli({ G, D, relRough = 0, x, rhoL, rhoG, muL, muG }) {
  if (!(x > 0 && x < 1)) throw fail("BAD_INPUT", `Pipe: the quality of a gas-liquid flow must lie between 0 and 1 (got ${x}).`);
  const GL = G * (1 - x), GG = G * x;
  const Re_L = GL * D / muL, Re_G = GG * D / muG;
  const fl = frictionFactor(Re_L, relRough), fg = frictionFactor(Re_G, relRough);
  const dpdz_L = fl.f * GL * GL / (2 * rhoL * D), dpdz_G = fg.f * GG * GG / (2 * rhoG * D);
  const regimes = (Re_L > RE_CHISHOLM ? "t" : "v") + (Re_G > RE_CHISHOLM ? "t" : "v");
  const C = CHISHOLM_C[regimes];
  const gradient_Pa_m = dpdz_L + C * Math.sqrt(dpdz_L * dpdz_G) + dpdz_G;   // = phi_L^2 (dp/dz)_L
  return { gradient_Pa_m, X: Math.sqrt(dpdz_L / dpdz_G), C, regimes, phi_L2: gradient_Pa_m / dpdz_L, Re_L, Re_G, f_L: fl.f, f_G: fg.f,
    dpdz_L, dpdz_G, transition: fl.regime === "transition" || fg.regime === "transition" };
}

/** The homogeneous (no-slip) density of a gas-liquid mixture of quality x, and its liquid holdup: Filip et al. (2014),
 * eqs. (5)-(6) (see the header). */
export function homogeneous(x, rhoL, rhoG) {
  const vG = x / rhoG, vL = (1 - x) / rhoL;
  return { rho: 1 / (vG + vL), holdup_L: vL / (vG + vL) };
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
  const tpSeen = { regimes: new Set(), transition: false };
  // a node's frictional gradient (Pa/m) and what the profile shows of it: gas-liquid by Lockhart-Martinelli, else one phase
  const gradientAt = s => {
    if (s.tp) {
      const lm = lockhartMartinelli({ G, D, relRough: roughness / D, ...s.tp });
      return { g: lm.gradient_Pa_m, Re: null, f: null, regime: `two-phase (${lm.regimes})`,
        tp: { quality: s.tp.x, holdup_L: s.tp.holdup_L, X: lm.X, C: lm.C, phi_L2: lm.phi_L2, Re_L: lm.Re_L, Re_G: lm.Re_G, f_L: lm.f_L, f_G: lm.f_G }, lm };
    }
    const Re = G * D / s.mu, fr = frictionFactor(Re, roughness / D);
    return { g: fr.f * G * G / (2 * s.rho * D), Re, f: fr.f, regime: fr.regime };
  };
  // a segment with a gas-liquid end: the mean of its ends' frictional gradients; elevation and acceleration with the
  // homogeneous density (see the header)
  const twoPhaseDrops = (a, b, i) => {
    if (K > 0 || LD > 0) throw fail("NOT_AVAILABLE", `${who}: the flow is gas-liquid ${i === 0 && a.tp ? "at the inlet" : `in segment ${i + 1} of ${segments}`}, and the pipe has fittings: no open source of two-phase loss coefficients for fittings was found, so they are not modelled in gas-liquid flow. Remove the fittings (or give their length as pipe), or keep the fluid one phase.`);
    if (friction_factor != null) throw fail("NOT_AVAILABLE", `${who}: your own friction factor stands for one fluid; in gas-liquid flow (${i === 0 && a.tp ? "at the inlet" : `segment ${i + 1} of ${segments}`}) each phase flowing alone has its own (Lockhart-Martinelli). Leave friction_factor empty and give the wall roughness.`);
    const ga = gradientAt(a), gb = gradientAt(b);
    const rho = (a.rho + b.rho) / 2;
    const parts = { friction: dx * (ga.g + gb.g) / 2, fittings: 0, elevation: rho * G_STANDARD * dz / segments, acceleration: G * G * (1 / b.rho - 1 / a.rho) };
    const dP = (parts.friction + parts.elevation + parts.acceleration) / 1000;
    return { P: a.P_kPa - dP, b, parts, ga, gb, twoPhase: true };
  };
  const tpNode = (s, x, g) => ({ ...node(s, x, g.Re, g.f, g.regime), ...(g.tp ? { two_phase: g.tp } : {}) });
  let a = start;
  for (let i = 0; i < segments; i++) {
    // the segment's drops at the outlet guess P (kPa): → { P (the balance's outlet pressure), b, parts }
    const drops = P => {
      if (!(P > 0)) throw fail("BAD_INPUT", `${who}: the pressure falls to zero within the pipe (segment ${i + 1} of ${segments}, at ${+(i * dx).toPrecision(4)} m): the pressure drop exceeds the inlet pressure; widen or shorten the pipe, or lower the flow.`);
      const b = end(P, a, dx, i);
      if (a.tp || b.tp) return twoPhaseDrops(a, b, i);
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
    if (Math.abs(res1) > 1e-10 * a.P_kPa + 1e-12 && (a.tp || r1.b?.tp)) {
      // gas-liquid: the properties change steeply (a phase boundary inside the segment, flashing near critical flow).
      // Look for the root by its sign: r(P) < 0 just below the inlet pressure; the first P below it where r >= 0
      // brackets it. None: no outlet pressure balances the segment, the momentum balance's singularity (critical flow).
      const res = P => { try { return drops(P).P - P; } catch (e) { if (e.code === "BAD_INPUT" || e.code === "NOT_AVAILABLE") throw e; return NaN; } };
      let hi = a.P_kPa, lo = null, firstTp = a.tp ? a.P_kPa : null;
      for (let k = 1; k < 200 && lo == null; k++) {
        const P = a.P_kPa * (1 - k / 200);
        const rk = res(P);
        if (firstTp == null) { try { if (end(P, a, dx, i).tp) firstTp = P; } catch { /* the residual says why */ } }
        if (rk >= 0) lo = P; else if (rk < 0) hi = P;
      }
      if (lo == null) {
        // G^2 (-dv/dP) along the pipe's own path, where the segment is first gas-liquid: 1 is the singularity of eq. (9.9)
        const Pc = firstTp ?? a.P_kPa;
        const b1 = end(Pc * (1 - 1e-4), a, dx, i), b2 = end(Pc * (1 - 2e-4), a, dx, i);
        const crit = G * G * (1 / b2.rho - 1 / b1.rho) / (Pc * 1e-4 * 1000);
        throw fail("NOT_AVAILABLE", `${who}: the gas-liquid flow reaches its critical (choked) flow in segment ${i + 1} of ${segments} (from ${+(i * dx).toPrecision(4)} m, at ${+a.P_kPa.toPrecision(5)} kPa${a.tp ? "" : ", where the fluid starts to boil or condense"}): no outlet pressure balances the segment's momentum (the mass flux squared times the fall of the mixture's specific volume with pressure is ${+crit.toPrecision(3)} at ${+Pc.toPrecision(5)} kPa; at 1 the momentum balance is singular). Choked flow is not modelled. Widen or shorten the pipe, lower the flow, or raise the inlet pressure.`);
      }
      P1 = brent(res, lo, hi, { xtol: 1e-12 * a.P_kPa });
      r1 = drops(P1); res1 = r1.P - P1;
    }
    if (Math.abs(res1) > 1e-10 * a.P_kPa + 1e-12) {
      throw fail("NO_CONVERGENCE", `${who}: the pressure of segment ${i + 1} of ${segments} did not converge (the balance misses by ${Math.abs(res1).toPrecision(3)} kPa)${a.phase === "vapour" ? "; the gas may be near choking: widen or shorten the pipe, or lower the flow" : a.tp || r1.b?.tp ? "; the gas-liquid flow may be near its critical (choked) flow, which is not modelled: widen or shorten the pipe, lower the flow, or raise the inlet pressure" : "; try more segments"}.`);
    }
    const b = r1.b;
    if (r1.twoPhase) {
      for (const g of [r1.ga, r1.gb]) if (g.lm) { tpSeen.regimes.add(g.lm.regimes); tpSeen.transition ||= g.lm.transition; } else regimes.add(g.regime);
    }
    if (i === 0) nodes.push(r1.twoPhase ? tpNode(a, 0, r1.ga) : node(a, 0, r1.Re, r1.fr.f, r1.fr.regime));
    // the isothermal choking limit of eq. (9.9): -dP (1 - rho u^2 / P) = ..., singular at rho u^2 = P
    if (G * G / b.rho >= b.P_kPa * 1000) {
      throw fail("NOT_AVAILABLE", `${who}: the gas reaches the choking limit at ${+((i + 1) * dx).toPrecision(4)} m (rho u² = P, ${+(G / b.rho).toPrecision(4)} m/s): choked flow is not modelled. Widen or shorten the pipe, or lower the flow.`);
    }
    for (const k of Object.keys(split)) split[k] += r1.parts[k] / 1000;
    if (r1.twoPhase) nodes.push(tpNode(b, (i + 1) * dx, r1.gb));
    else { regimes.add(r1.fr.regime); nodes.push(node(b, (i + 1) * dx, r1.Re, r1.fr.f, r1.fr.regime)); }
    a = b;
  }
  if (tpSeen.regimes.size) regimes.add("two-phase");
  return { nodes, split, last: a, regimes: [...regimes], G_kg_m2s: G, A_m2: A,
    twoPhase: tpSeen.regimes.size ? { regimes: [...tpSeen.regimes], transition: tpSeen.transition } : null };
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

/** The density (kg/m³) and viscosity (Pa s) of one fluid phase of composition x at T, P (see the header). */
function phaseProps(sys, type, x, T, P_kPa, viscosity) {
  if (type === "vapour") {
    const Z = sys.phase("vapour", T, P_kPa, x).Z ?? 1;
    const M = x.reduce((a, xi, i) => a + xi * sys.MW[i], 0);
    return { rho: M / 1000 * P_kPa * 1000 / (Z * R * T), mu: viscosity ?? gasViscosity(sys, x, T, "Pipe"), Z };
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

/** The fluid phases of a stream (fraction above 1e-12). */
const fluidPhases = s => s.phases.filter(p => p.fraction > 1e-12);

/** What flows: "vapour", "liquid" or "vapour-liquid" (one vapour and one liquid phase), or a refusal (see the header). */
function flowKind(s, where) {
  const at = where === "inlet" ? "the inlet" : `the stream ${where}`;
  if (s.phases.some(p => p.type === "solid")) {
    throw fail("NOT_AVAILABLE", `Pipe: ${at} carries a solid; slurry flow is not modelled (one fluid phase, or gas and liquid, only).`);
  }
  const fl = fluidPhases(s);
  if (fl.length === 1) return fl[0].type;
  const nV = fl.filter(p => p.type === "vapour").length, nL = fl.filter(p => p.type === "liquid").length;
  if (nV === 1 && nL === 1) return "vapour-liquid";
  const kind = nV === 0 ? "two liquids" : `vapour and ${nL} liquids`;
  throw fail("NOT_AVAILABLE", `Pipe: ${at} is ${kind}; the Pipe block models one fluid phase, or gas and liquid (Lockhart-Martinelli), not two liquid phases. ${where === "inlet"
    ? "Separate the liquids first (a decanter), or move the pipe to where the stream is one liquid."
    : "The liquid splits into two inside the pipe: change the inlet temperature or pressure so that it stays one liquid."}`);
}

/** A node's fluid: density and viscosity of one phase, or the gas-liquid properties (quality, both phases, no-slip density). */
function nodeProps(sys, s, kind, viscosity) {
  const T = s.T_K, P = s.P_kPa;
  if (kind !== "vapour-liquid") return phaseProps(sys, kind, fluidPhases(s)[0].composition, T, P, viscosity);
  if (viscosity != null) throw fail("NOT_AVAILABLE", `Pipe: the flow is gas-liquid at ${+P.toPrecision(6)} kPa, ${+T.toPrecision(6)} K: your own viscosity stands for one fluid, and Lockhart-Martinelli needs each phase's own. Leave viscosity_Pa_s empty.`);
  const V = s.phases.find(p => p.type === "vapour"), L = s.phases.find(p => p.type === "liquid");
  const M = comp => comp.reduce((a, xi, i) => a + xi * sys.MW[i], 0);
  const mV = V.fraction * M(V.composition), mL = L.fraction * M(L.composition);
  const x = mV / (mV + mL);
  const gas = phaseProps(sys, "vapour", V.composition, T, P, null), liq = phaseProps(sys, "liquid", L.composition, T, P, null);
  const hm = homogeneous(x, liq.rho, gas.rho);
  return { rho: hm.rho, mu: null, tp: { x, rhoL: liq.rho, rhoG: gas.rho, muL: liq.mu, muG: gas.mu, holdup_L: hm.holdup_L } };
}

function solve({ sys, inlets, spec: c }) {
  const s = inlets.in[0];
  if (!(s.F_kmol_h > 0)) {
    const out = stream(sys, { flow_kmol_h: s.flows, T_K: s.T_K ?? 298.15, P_kPa: s.P_kPa ?? 101.325 });
    return { outlets: { out }, duty_kW: 0, notes: ["The pipe has no flow: nothing is calculated."], state: { dP_kPa: 0 } };
  }
  const type = flowKind(s, "inlet");
  const kinds = new Set([type]);
  const mass_kg_s = s.mass_kg_h / 3600;
  const flows = s.flows;
  const T0 = s.T_K, H0 = s.H_kW;
  const st = (x, where) => { kinds.add(flowKind(x, where)); return x; };
  // the state of a node; its stream was checked, with the place, by st() or at the inlet
  const state = (x, Q_kW = 0) => { const kind = flowKind(x, "in the pipe"); return { stream: x, P_kPa: x.P_kPa, T_K: x.T_K, H_kW: x.H_kW, Q_kW, phase: kind, ...nodeProps(sys, x, kind, c.viscosity) }; };
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
    // the heat lost over the segment, Q: the outlet is the P-H flash at H_a - Q, and Q = lost(T of that flash); solved
    // for Q (monotonic, also across a boiling or condensing point, where T stays at the saturation temperature)
    const Tph = Q => stream(sys, { flow_kmol_h: flows, P_kPa: P, H_kW: a.H_kW - Q }).T_K;
    const q = Q => Q - lost(Tph(Q));
    let Qb = UA * d1, qb = q(Qb);
    const q0 = q(0);
    for (let k = 0; k < 6 && q0 * qb > 0; k++) { Qb *= 2; qb = q(Qb); }   // the pressure's own effect on T outweighs the heat over this segment
    const Q = q0 === 0 ? 0 : brent(q, 0, Qb, { xtol: 1e-12 * Math.abs(Qb) + 1e-15 });
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
  const tp = p.twoPhase;
  const single = [...kinds].filter(k => k !== "vapour-liquid");
  if (p.regimes.includes("transition")) warnings.push({ code: "FLOW_TRANSITION", message: `The Reynolds number lies between ${RE_LAMINAR} and ${RE_TURBULENT} in part of the pipe (transition between laminar and turbulent flow): the friction factor there (Churchill 1977) is uncertain.` });
  if ((c.fittings.K > 0 || c.fittings.LD > 0) && p.regimes.includes("laminar")) warnings.push({ code: "FITTINGS_LAMINAR", message: "The flow is laminar in part of the pipe: the fittings' K and Leq/D values are for turbulent flow, so their loss there is approximate." });
  if (c.friction_factor != null) notes.push(`The friction factor is your own (Darcy f = ${c.friction_factor}), not from the Reynolds number and the roughness.`);
  if (c.viscosity != null) notes.push(`The viscosity is your own (${c.viscosity} Pa s), not from the components' records.`);
  else if (single.includes("vapour")) notes.push("The gas viscosity is the low-pressure value (Wilke's rule on the pure vapours' records); at high pressure a gas is more viscous, which changes the friction factor little in turbulent flow.");
  if (single.includes("liquid") || tp) notes.push("The liquid's density is from the pure liquids' records (their volumes add up), without the effect of pressure.");
  if (tp) {
    const where = type === "vapour-liquid" ? (kinds.size > 1 ? "from the inlet, then one phase" : "along the whole pipe")
      : `from ${+(p.nodes.find(n => n.two_phase)?.x_m ?? 0).toPrecision(4)} m (the ${type} ${type === "liquid" ? "boils" : "condenses"} in the pipe)`;
    notes.push(`Gas-liquid flow ${where}: the friction by ${TWO_PHASE_METHOD}, C = ${tp.regimes.map(r => `${CHISHOLM_C[r]} (${r})`).join(", ")}, with the wall's roughness for each phase alone; the elevation and acceleration with the homogeneous (no-slip) mixture density. The method was correlated for isothermal two-component flow in horizontal pipes; its data scatter by about a factor of 3 in the two-phase multiplier and it often overestimates the friction, working best when both phases alone are turbulent (Brennen 2005, section 8.3.1, pp. 210-211). The gas viscosity is the low-pressure value.`);
    if (tp.regimes.some(r => r !== "tt")) warnings.push({ code: "TWO_PHASE_VISCOUS", message: `In part of the pipe the liquid or the gas flowing alone is viscous (Re below ${RE_CHISHOLM}: C = ${tp.regimes.filter(r => r !== "tt").map(r => `${CHISHOLM_C[r]}, ${r}`).join("; ")}): Lockhart-Martinelli is least reliable there (large velocity differences between the phases; Brennen 2005, p. 211).` });
    if (tp.transition) warnings.push({ code: "FLOW_TRANSITION", message: `The liquid or the gas flowing alone has a Reynolds number between ${RE_LAMINAR} and ${RE_TURBULENT} in part of the gas-liquid flow: its friction factor there (Churchill 1977) is uncertain.` });
    if (c.dz !== 0) warnings.push({ code: "TWO_PHASE_ELEVATION", message: `The pipe ${c.dz > 0 ? "rises" : "falls"} ${Math.abs(c.dz)} m in gas-liquid flow: the static head uses the no-slip liquid holdup, which underestimates the liquid in the pipe (the gas moves faster), so the elevation term of uphill flow is low, possibly by much. Lockhart-Martinelli is a horizontal-pipe method; a method for inclined pipes (Beggs-Brill) is a later step of proposal 0020.` });
    if (kinds.size > 1) notes.push("The quality changes along the pipe (the fluid boils or condenses): the correlation is used at each node's quality; Martinelli and Nelson's treatment of a phase change (Brennen 2005, section 8.3.2) is not used.");
  }
  const dP = s.P_kPa - out.P_kPa;
  const phaseOf = [...kinds].length === 1 ? type : [...kinds].join(" and ");
  return {
    outlets: { out }, duty_kW: duty, notes, warnings,
    profile: p.nodes,
    state: {
      phase: phaseOf, heat: c.heat, P_in_kPa: s.P_kPa, P_out_kPa: out.P_kPa, T_in_K: T0, T_out_K: out.T_K,
      dP_kPa: dP, dP_friction_kPa: p.split.friction, dP_fittings_kPa: p.split.fittings, dP_elevation_kPa: p.split.elevation,
      dP_acceleration_kPa: p.split.acceleration,
      velocity_in_m_s: first.velocity_m_s, velocity_out_m_s: last.velocity_m_s,
      Re_in: first.Re, Re_out: last.Re, friction_factor_in: first.friction_factor, friction_factor_out: last.friction_factor,
      regime: p.regimes.length === 1 ? p.regimes[0] : p.regimes.join(" and "),
      rho_in_kg_m3: first.rho_kg_m3, rho_out_kg_m3: last.rho_kg_m3, mass_flux_kg_m2s: p.G_kg_m2s,
      heat_kW: duty, length_m: c.L, diameter_m: c.D, roughness_m: c.roughness, elevation_m: c.dz, segments: c.segments,
      fittings: { K: c.fittings.K, L_D: c.fittings.LD, list: c.fittings.list },
      ...(tp ? { two_phase: { method: TWO_PHASE_METHOD, chisholm: tp.regimes.map(r => ({ regimes: r, C: CHISHOLM_C[r] })),
        quality_in: first.two_phase?.quality ?? (type === "vapour" ? 1 : 0), quality_out: last.two_phase?.quality ?? (out.VF > 0.5 ? 1 : 0),
        holdup_L_in: first.two_phase?.holdup_L ?? null, holdup_L_out: last.two_phase?.holdup_L ?? null,
        X_in: first.two_phase?.X ?? null, X_out: last.two_phase?.X ?? null, phi_L2_in: first.two_phase?.phi_L2 ?? null, phi_L2_out: last.two_phase?.phi_L2 ?? null } } : {}),
    },
  };
}

registerUnit({
  type: "pipe", label: "Pipe", duty: true,
  inlets: [{ port: "in" }], outlets: [{ port: "out" }],
  specKeys: SPEC_KEYS,
  checkSpec, dof, solve,
});
