/**
 * Kinetic reactors (proposal 0010, step 5; layer 4): the continuous stirred-tank reactor ("cstr") and the plug-flow
 * reactor ("pfr"), registered as blocks of src/units/units.js. Their reactions carry rate laws
 * (src/reactions/kinetics.js: the built-in forms and the user's own formula). Each reaction's rate is evaluated in its
 * own phase (vapour or liquid), from the phase's composition, molar volume and fugacities:
 *   C_j = x_j / v (mol/m3), p_j = x_j P, f_j from the property package, a_j = f_j / P° (vapour) or f_j / f_j,pure
 *   (liquid; γ_j x_j for an activity model), v = Z R T / P for a vapour and Σ x_j M_j / ρ_j for a liquid (the pure
 *   liquids' density records, volumes adding up).
 * `phases: 1` (the default) takes the whole mixture as the reaction's phase; `phases: 2` flashes it at T and P and uses
 * the phase found (none: no rate in that phase).
 *
 * CSTR: { reactions, V_m3 | W_kg, T_K | duty_kW, P_kPa | dP_kPa, phases, liquidFraction }
 *   ξ_r = 3.6 S_r r_r(outlet), S_r the volume of the reaction's phase (V, or with two phases V times the liquid
 *   fraction given, or one minus it) or the catalyst mass W for a rate per kg of catalyst; ξ in kmol/h, r in
 *   mol/(m3 s) or mol/(kg s), 3.6 = 3600 s/h / 1000 mol/kmol. Solved by Newton's method in the extents (differences
 *   for the Jacobian), with a continuation in the size (from 1 % of it) when the direct solution fails. The duty given:
 *   the outlet temperature where the energy balance closes (bracketing, then regula falsi, as the equilibrium reactor);
 *   a CSTR can have several steady states, and this finds the one nearest the inlet temperature.
 *   Rawlings and Ekerdt, Chemical Reactor Analysis and Design Fundamentals, 2nd ed., 6th printing (full text free to
 *   read from the authors, https://sites.engineering.ucsb.edu/~jbraw/chemreacfun/), section 4.3 (the CSTR balance at
 *   steady state, Q_f c_jf - Q c_j + R_j V_R = 0, eqn 4.36) and section 6.3.1 (p. 288, steady-state multiplicity).
 *
 * PFR: { reactions, L_m, D_m, tubes, T_K | duty_kW | coolant: { U_W_m2K, T_K }, pressureDrop, bed_kg_m3, phases }
 *   along the tube (z, m; total cross-section A = tubes π D²/4):
 *     dξ_r/dz = 3.6 A w_r r_r,  w_r = the share of the volume flow in the reaction's phase (no slip between the
 *       phases; 1 with one phase), or the bed density for a rate per kg of catalyst;
 *     d(H + Σ ξ_r ΔrH_r)/dz = q, q = Q/L (a duty spread evenly; 0 adiabatic) or U π D tubes (T_c - T) (a coolant);
 *       H the stream enthalpy (kW), so T follows from a P-H flash at each point; T_K given: isothermal;
 *     dP/dz = 0, -ΔP/L (pressureDrop: { dP_kPa }), or the Ergun equation for a packed bed
 *       (pressureDrop: { particle_m, voidage, viscosity_Pa_s }): -(1-ε) u / (D_p ε³) [150 (1-ε) μ / D_p + 1.75 ρ u],
 *       u = Q / A, a gas only; μ given, or the gas mixture's from the pure vapours' low-pressure viscosity records by
 *       Wilke's rule, μ = Σ y_i μ_i / Σ_j y_j φ_ij, φ_ij = (1 + (μ_i/μ_j)^½ (M_j/M_i)^¼)² / (8 (1 + M_i/M_j))^½ (Wilke,
 *       J. Chem. Phys. 18 (1950) 517, as documented in the open chemicals library, chemicals.viscosity.Wilke, MIT).
 *       Rawlings and Ekerdt section 4.6 (p. 144, the PFR balance), section 6.5 (p. 315, its
 *       energy balance) and eqn 7.69 (p. 398, Ergun, written there per volume as dP/dV).
 *   Integrated by the stiff, error-controlled method of src/util/ode.js; the profile (T, P, flows, vapour fraction,
 *   rates, conversion) is kept at each accepted step.
 * Units: K, kPa, kmol/h, kW, m, m3, kg.
 */
import { fail } from "../util/errors.js";
import { stream } from "../stream/stream.js";
import { pure } from "../thermo/pure.js";
import { reactionHeat, P_STANDARD_KPA } from "../reactions/reaction.js";
import { reactionRate, BASIS_KEY } from "../reactions/kinetics.js";
import { flash } from "../equilibrium/flash.js";
import { integrateStiff } from "../util/ode.js";
import { registerUnit } from "./units.js";
import { has, num, inletOf, bracket } from "./reactors.js";

const R = 8.314462618;

// ---------------------------------------------------------------------------------------------------------------
// The state of a reaction's phase

/** ln f of each pure liquid at T and P (the liquid standard state of the activities). */
function pureLiquidLnF(sys, T, P) {
  return sys.ids.map((_, i) => {
    try { return sys.phase("liquid", T, P, sys.ids.map((__, k) => (k === i ? 1 : 0))).lnFugacity[i]; } catch { return NaN; }
  });
}

/** A gas mixture's viscosity (Pa s) at low pressure: Wilke's rule on the pure vapours' records. */
export function gasViscosity(sys, y, T, who = "Ergun") {
  const mu = sys.ids.map((id, i) => {
    if (!(y[i] > 0)) return 0;
    try { return pure(id, { userData: sys.userData }).property("vapourViscosity", T); } catch (e) {
      e.message = `${who}: the gas viscosity needs the vapour viscosity of ${id} (${e.message}); or give the mixture's viscosity_Pa_s.`; throw e;
    }
  });
  return wilke(y, mu, sys.MW);
}

/** Wilke's rule: the viscosity of a gas mixture from its components' (y mole fractions, mu Pa s, M g/mol). */
export const wilke = (y, mu, M) => y.reduce((s, yi, i) => (yi > 0 ? s + yi * mu[i] / y.reduce((d, yj, j) =>
  (yj > 0 ? d + yj * (1 + Math.sqrt(mu[i] / mu[j]) * (M[j] / M[i]) ** 0.25) ** 2 / Math.sqrt(8 * (1 + M[i] / M[j])) : d), 0) : s), 0);

/** Molar volume (m3/mol) of a liquid of composition x: the pure liquids' volumes added. */
function liquidVolume(sys, x, T) {
  let v = 0;
  x.forEach((xi, i) => {
    if (!(xi > 0)) return;
    const c = pure(sys.ids[i], { userData: sys.userData });
    let rho;
    try { rho = c.property("liquidDensity", T); } catch (e) { e.message = `The liquid's concentrations need the liquid density of ${c.name}: ${e.message}`; throw e; }
    v += xi * c.MW / 1000 / rho;
  });
  return v;
}

/**
 * The phases of the mixture n (kmol/h) at T and P: for each phase present, its flow (kmol/h), composition, volume flow
 * (m3/s) and the values a rate reads ({C, x, p, f, a} by component id).
 */
export function phaseStates(sys, n, T, P, used, two) {
  const N = n.reduce((a, v) => a + v, 0);
  const z = n.map(v => Math.max(v, 0) / N);
  const list = two ? flash(sys, { z, T, P }).phases.map(p => ({ type: p.type, F: p.fraction * N, x: p.composition }))
    : [{ type: used[0], F: N, x: z }];
  let pureL = null;
  const out = {};
  let Qtot = 0;
  for (const p of list) {
    if (out[p.type]) continue;   // a second liquid: the first is the reaction's
    const ph = sys.phase(p.type, T, P, p.x);
    const v = p.type === "vapour" ? (ph.Z ?? 1) * R * T / (P * 1000) : liquidVolume(sys, p.x, T);
    const Q = p.F * 1000 / 3600 * v;
    Qtot += Q;
    let a;
    if (p.type === "vapour") a = ph.lnFugacity.map(lf => Math.exp(lf) / P_STANDARD_KPA);
    else { pureL ??= pureLiquidLnF(sys, T, P); a = ph.lnFugacity.map((lf, i) => Math.exp(lf - pureL[i])); }
    const by = arr => Object.fromEntries(sys.ids.map((id, i) => [id, arr[i]]));
    out[p.type] = { F: p.F, x: p.x, v, Q, bases: { C: by(p.x.map(xi => xi / v)), x: by(p.x), p: by(p.x.map(xi => xi * P)), f: by(ph.lnFugacity.map(Math.exp)), a: by(a) } };
  }
  return { phases: out, Qtot };
}

/** The rate of each reaction (mol/(m3 s) or mol/(kg s)) in its phase; 0 where the phase is absent. */
function rates(sys, reactions, st, T, P, warnings) {
  return reactions.map(rx => {
    const ph = st.phases[rx.phase];
    if (!ph) return 0;
    const res = reactionRate(rx, { T_K: T, P_kPa: P, bases: ph.bases }, { userData: sys.userData });
    for (const w of res.warnings) if (!warnings.includes(w)) warnings.push(w);
    return res.r;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Specifications

function checkReactions(spec, reactions, sys, who) {
  const list = spec.reactions;
  if (!Array.isArray(list) || !list.length) throw fail("BAD_INPUT", `${who}: give its reactions: { reactions: [{ reaction: "R1" }] }; each needs a rate law (its kinetics, on the Reactions page).`);
  const byId = new Map(reactions.map(r => [r.id, r]));
  const seen = new Set();
  return list.map((e, k) => {
    const id = typeof e === "string" ? e : e?.reaction;
    const r = byId.get(id);
    if (!r) throw fail("BAD_INPUT", `${who}, reaction ${k + 1}: no reaction "${id}" in the flowsheet's reactions (${[...byId.keys()].join(", ") || "none written yet"}).`);
    if (seen.has(id)) throw fail("BAD_INPUT", `${who}: ${r.name} is listed twice.`);
    seen.add(id);
    if (!r.rate) throw fail("MISSING_DATA", `${who}: ${r.name} has no rate law. Give its kinetics on the Reactions page (a form and its constants, or your own formula).`);
    for (const c of Object.keys(r.stoichiometry)) if (!sys.ids.includes(c)) throw fail("BAD_INPUT", `${who} (${r.name}): ${c} is in the reaction but not a component of this simulation (${sys.names.join(", ")}).`);
    return r;
  });
}

function checkCommon(spec, reactions, sys, who) {
  const rx = checkReactions(spec, reactions, sys, who);
  const phases = spec.phases == null ? 1 : Number(spec.phases);
  if (phases !== 1 && phases !== 2) throw fail("BAD_INPUT", `${who}: "phases" is 1 (the whole mixture in the reactions' phase) or 2 (vapour and liquid, each reaction in its own).`);
  const used = [...new Set(rx.map(r => r.phase))];
  if (used.length > 1 && phases === 1) throw fail("BAD_INPUT", `${who}: its reactions are in the vapour and in the liquid (${rx.map(r => `${r.name}: ${r.phase}`).join(", ")}); choose vapour and liquid (phases: 2).`);
  if (has(spec, "P_kPa") && has(spec, "dP_kPa")) throw fail("BAD_INPUT", `${who}: give the pressure P_kPa or the pressure drop dP_kPa, not both.`);
  return { reactions: rx, used, phases, catalyst: rx.some(r => r.rate.per === "catalyst-mass"), volume: rx.some(r => r.rate.per !== "catalyst-mass") };
}

function checkCstr(spec, { sys, reactions = [] }) {
  const who = "CSTR";
  const c = checkCommon(spec, reactions, sys, who);
  const thermal = ["T_K", "duty_kW"].filter(k => has(spec, k));
  if (thermal.length !== 1) throw fail("BAD_INPUT", `${who}: give the temperature T_K or the duty duty_kW (0: adiabatic), one of them.`);
  if (has(spec, "VF")) throw fail("BAD_INPUT", `${who}: a vapour fraction is not a specification of a CSTR; give its temperature or duty.`);
  const out = { ...c };
  if (c.volume) out.V_m3 = num(spec.V_m3, `${who}: the volume V_m3`, { min: 1e-12 });
  if (c.catalyst) out.W_kg = num(spec.W_kg, `${who}: the catalyst mass W_kg (a rate is per kg of catalyst)`, { min: 1e-12 });
  if (c.phases === 2 && c.volume) out.liquidFraction = num(spec.liquidFraction, `${who}: liquidFraction, the share of the volume taken by the liquid (vapour and liquid)`, { min: 0, max: 1 });
  if (has(spec, "T_K")) out.T_K = num(spec.T_K, `${who}: T_K`, { min: 1e-9 }); else out.duty_kW = num(spec.duty_kW, `${who}: duty_kW`);
  if (has(spec, "P_kPa")) out.P_kPa = num(spec.P_kPa, `${who}: P_kPa`, { min: 1e-9 });
  out.dP_kPa = has(spec, "dP_kPa") ? num(spec.dP_kPa, `${who}: dP_kPa`, { min: 0 }) : 0;
  return out;
}

function checkPfr(spec, { sys, reactions = [] }) {
  const who = "Plug-flow reactor";
  const c = checkCommon(spec, reactions, sys, who);
  const out = { ...c, L_m: num(spec.L_m, `${who}: the length L_m`, { min: 1e-9 }), D_m: num(spec.D_m, `${who}: the tube's inner diameter D_m`, { min: 1e-9 }),
    tubes: spec.tubes == null ? 1 : num(spec.tubes, `${who}: the number of tubes`, { min: 1 }) };
  if (c.catalyst) out.bed_kg_m3 = num(spec.bed_kg_m3, `${who}: the bed density bed_kg_m3 (kg of catalyst per m3 of tube; a rate is per kg of catalyst)`, { min: 1e-9 });
  const thermal = ["T_K", "duty_kW", "coolant"].filter(k => has(spec, k));
  if (thermal.length !== 1) throw fail("BAD_INPUT", `${who}: give the temperature T_K (isothermal), the duty duty_kW (spread along the tube; 0: adiabatic) or a coolant { U_W_m2K, T_K }, one of them.`);
  if (has(spec, "T_K")) out.T_K = num(spec.T_K, `${who}: T_K`, { min: 1e-9 });
  else if (has(spec, "duty_kW")) out.duty_kW = num(spec.duty_kW, `${who}: duty_kW`);
  else out.coolant = { U_W_m2K: num(spec.coolant.U_W_m2K, `${who}: the coolant's U_W_m2K`, { min: 0 }), T_K: num(spec.coolant.T_K, `${who}: the coolant's T_K`, { min: 1e-9 }) };
  const d = spec.pressureDrop;
  if (d == null || d === "none" || (typeof d === "object" && !Object.keys(d).length)) out.pressureDrop = null;
  else if (has(d, "dP_kPa")) out.pressureDrop = { dP_kPa: num(d.dP_kPa, `${who}: the pressure drop dP_kPa`, { min: 0 }) };
  else if (has(d, "particle_m")) {
    out.pressureDrop = { particle_m: num(d.particle_m, `${who}: Ergun: the particle diameter particle_m`, { min: 1e-9 }),
      voidage: num(d.voidage, `${who}: Ergun: the bed voidage (0 to 1)`, { min: 1e-6, max: 0.999999 }),
      viscosity_Pa_s: has(d, "viscosity_Pa_s") && d.viscosity_Pa_s !== "" ? num(d.viscosity_Pa_s, `${who}: Ergun: the gas viscosity viscosity_Pa_s`, { min: 1e-12 }) : null };
  } else throw fail("BAD_INPUT", `${who}: pressureDrop is { dP_kPa } (spread along the tube) or { particle_m, voidage, viscosity_Pa_s } (Ergun, a packed bed).`);
  if (has(spec, "P_kPa")) out.P_kPa = num(spec.P_kPa, `${who}: the inlet pressure P_kPa`, { min: 1e-9 });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Shared

const conversions = (sys, fin, flows) => Object.fromEntries(sys.ids.map((id, i) => [id, fin[i] > 0 && flows[i] < fin[i] ? (fin[i] - flows[i]) / fin[i] : null]).filter(([, v]) => v != null));
const temperatureSolve = (f, x0, who, duty) => {
  const br = bracket(f, x0, 150, 2500);
  if (!br) throw fail("NO_CONVERGENCE", `${who}: no temperature from 150 to 2500 K meets the duty of ${duty} kW. Check the duty's sign (heat added is positive), or give the temperature.`);
  let [a, b, fa, fb] = br, side = 0;
  for (let k = 0; k < 100 && b - a > 1e-7; k++) {
    const c = (a * fb - b * fa) / (fb - fa), fc = f(c);
    if (Math.sign(fc) === Math.sign(fa)) { a = c; fa = fc; if (side === -1) fb /= 2; side = -1; } else { b = c; fb = fc; if (side === 1) fa /= 2; side = 1; }
    if (Math.abs(fc) < 1e-9) { a = b = c; break; }
  }
  return (a + b) / 2;
};
function reactionResult(sys, reactions, heats, fin, flows, extents, r, extra = {}) {
  return { generation: flows.map((v, i) => v - fin[i]), heat_kW: extents.reduce((s, x, k) => s + x * heats[k].dH_J_mol / 3600, 0),
    extents_kmol_h: Object.fromEntries(reactions.map((rx, k) => [rx.id, extents[k]])), keyConversion: conversions(sys, fin, flows),
    heats: Object.fromEntries(reactions.map((rx, k) => [rx.id, { dH_J_mol: heats[k].dH_J_mol, from: heats[k].from }])),
    rates: Object.fromEntries(reactions.map((rx, k) => [rx.id, { r: r[k], units: rx.rate.units }])), ...extra };
}
function noFlow(sys, inlet, spec, reactions, heats, P) {
  const out = stream(sys, { flow_kmol_h: inlet.flows, T_K: spec.T_K ?? inlet.T_K ?? 298.15, P_kPa: P });
  return { outlets: { out }, duty_kW: spec.duty_kW ?? 0, notes: [], reaction: reactionResult(sys, reactions, heats, inlet.flows, inlet.flows, reactions.map(() => 0), reactions.map(() => 0)) };
}

// ---------------------------------------------------------------------------------------------------------------
// CSTR

/** Newton's method for G(ξ) = 0, keeping the flows at or above zero; null when it does not converge. */
function newton(G, x0, amounts, F0) {
  let x = x0.slice(), g = G(x);
  if (!g) return null;
  const norm = v => Math.max(...v.map(Math.abs));
  const tol = 1e-10 * F0;
  for (let it = 0; it < 100 && norm(g) > tol; it++) {
    const m = x.length, J = Array.from({ length: m }, () => new Array(m).fill(0));
    for (let k = 0; k < m; k++) {
      const h = 1e-7 * Math.max(Math.abs(x[k]), 1e-6 * F0);
      const xp = x.slice(); xp[k] += h;
      let gp = G(xp);
      let s = h;
      if (!gp) { xp[k] = x[k] - h; gp = G(xp); s = -h; }
      if (!gp) return null;
      for (let i = 0; i < m; i++) J[i][k] = (gp[i] - g[i]) / s;
    }
    const step = solveSmall(J, g.map(v => -v));
    if (!step) return null;
    let t = 1, ok = false;
    for (let k = 0; k < 40; k++) {
      const xn = x.map((v, i) => v + t * step[i]);
      if (amounts(xn).every(v => v >= -1e-14 * F0)) {
        const gn = G(xn);
        if (gn && norm(gn) < norm(g)) { x = xn; g = gn; ok = true; break; }
      }
      t /= 2;
    }
    if (!ok) return null;
  }
  return norm(g) <= 1e-8 * F0 ? x : null;
}
function solveSmall(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (!(Math.abs(M[p][c]) > 1e-300)) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x.every(Number.isFinite) ? x : null;
}

registerUnit({
  type: "cstr", label: "CSTR", duty: true, dutySpec: true, reactive: "elements",
  // VF is refused by its check with its reason
  specKeys: ["reactions", "phases", "T_K", "duty_kW", "VF", "P_kPa", "dP_kPa", "V_m3", "W_kg", "liquidFraction"],
  inlets: [{ port: "in", min: 1, max: Infinity }], outlets: [{ port: "out" }],
  checkSpec: checkCstr,
  dof(spec) {
    const missing = [], extra = [];
    const list = Array.isArray(spec?.reactions) ? spec.reactions : [];
    if (!list.length) missing.push("the reactions (with their kinetics)");
    if (!has(spec, "V_m3") && !has(spec, "W_kg")) missing.push("the volume V_m3 (or the catalyst mass W_kg)");
    const thermal = ["T_K", "duty_kW"].filter(k => has(spec, k));
    if (!thermal.length) missing.push("the temperature T_K or the duty duty_kW");
    if (thermal.length > 1) extra.push("give T_K or duty_kW, not both");
    if (Number(spec?.phases) === 2 && has(spec, "V_m3") && !has(spec, "liquidFraction")) missing.push("the liquid's share of the volume, liquidFraction");
    return { needed: 3, given: (list.length ? 1 : 0) + (has(spec, "V_m3") || has(spec, "W_kg") ? 1 : 0) + thermal.length, missing, extra };
  },
  solve({ sys, inlets, spec }) {
    const who = "CSTR";
    const inlet = inletOf(sys, inlets.in), fin = inlet.flows;
    const P = spec.P_kPa ?? inlet.P_kPa - spec.dP_kPa;
    if (!(P > 0)) throw fail("BAD_INPUT", `${who}: the pressure drop (${spec.dP_kPa} kPa) is larger than the inlet pressure (${inlet.P_kPa} kPa).`);
    const rx = spec.reactions, heats = rx.map(r => reactionHeat(r, { userData: sys.userData }));
    const F0 = fin.reduce((a, v) => a + v, 0);
    if (!(F0 > 0)) return noFlow(sys, inlet, spec, rx, heats, P);
    const nu = rx.map(r => sys.ids.map(id => r.stoichiometry[id] ?? 0));
    const amounts = x => fin.map((v, j) => v + nu.reduce((s, row, r) => s + row[j] * x[r], 0));
    const warnings = [];
    const size = r => (r.rate.per === "catalyst-mass" ? spec.W_kg : spec.V_m3 * (spec.phases === 2 ? (r.phase === "liquid" ? spec.liquidFraction : 1 - spec.liquidFraction) : 1));
    let guess = rx.map(() => 0);
    const at = T => {
      let sol = null;
      for (const scale of [1, null]) {
        if (scale) {
          const G = x => { const n = amounts(x); if (n.some(v => v < -1e-14 * F0)) return null; const st = phaseStates(sys, n.map(v => Math.max(v, 0)), T, P, spec.used, spec.phases === 2);
            const rr = rates(sys, rx, st, T, P, warnings); return x.map((v, k) => v - 3.6 * size(rx[k]) * rr[k]); };
          sol = newton(G, guess, amounts, F0);
        } else {
          // continuation in the size, from 1 % of it
          let x = rx.map(() => 0);
          for (const s of [0.01, 0.03, 0.1, 0.3, 0.6, 1]) {
            const G = xx => { const n = amounts(xx); if (n.some(v => v < -1e-14 * F0)) return null; const st = phaseStates(sys, n.map(v => Math.max(v, 0)), T, P, spec.used, spec.phases === 2);
              const rr = rates(sys, rx, st, T, P, warnings); return xx.map((v, k) => v - 3.6 * s * size(rx[k]) * rr[k]); };
            x = newton(G, x, amounts, F0);
            if (!x) break;
          }
          sol = x;
        }
        if (sol) break;
      }
      if (!sol) throw fail("NO_CONVERGENCE", `${who} at ${T.toFixed(2)} K: the balance ξ = V r did not converge for ${rx.map(r => r.name).join(", ")}. Check the rate constants and their units (mol/(m3 s) per m3, or per kg of catalyst), and that the reactants are fed.`);
      guess = sol;
      const flows = amounts(sol).map(v => Math.max(v, 0));
      const st = phaseStates(sys, flows, T, P, spec.used, spec.phases === 2);
      return { x: sol, flows, st, r: rates(sys, rx, st, T, P, warnings), heat_kW: sol.reduce((s, x, k) => s + x * heats[k].dH_J_mol / 3600, 0) };
    };
    let T = spec.T_K;
    if (T == null) T = temperatureSolve(t => { const s = at(t); return stream(sys, { flow_kmol_h: s.flows, T_K: t, P_kPa: P }).H_kW + s.heat_kW - inlet.H_kW - spec.duty_kW; }, inlet.T_K, who, spec.duty_kW);
    const s = at(T);
    const out = stream(sys, { flow_kmol_h: s.flows, T_K: T, P_kPa: P });
    const duty = spec.duty_kW ?? out.H_kW - inlet.H_kW + s.heat_kW;
    const notes = [...warnings];
    for (const h of heats) for (const n of h.notes) if (!notes.includes(n)) notes.push(n);
    if (spec.duty_kW != null) notes.push("A CSTR with a given duty can have more than one steady state; this is the one found from the inlet temperature (Rawlings and Ekerdt, section 6.3.1).");
    const tau = spec.V_m3 && s.st.Qtot > 0 ? spec.V_m3 / s.st.Qtot : null;
    return { outlets: { out }, duty_kW: duty, notes,
      reaction: reactionResult(sys, rx, heats, fin, s.flows, s.x, s.r, { kinetic: { kind: "cstr", T_K: T, P_kPa: P, V_m3: spec.V_m3 ?? null, W_kg: spec.W_kg ?? null,
        residence_s: tau, Q_m3_h: s.st.Qtot * 3600, phases: spec.phases } }) };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// PFR

registerUnit({
  type: "pfr", label: "Plug-flow reactor", duty: true, dutySpec: true, reactive: "elements",
  specKeys: ["reactions", "phases", "L_m", "D_m", "tubes", "bed_kg_m3", "T_K", "duty_kW", "coolant", "pressureDrop", "P_kPa", "dP_kPa"],
  inlets: [{ port: "in", min: 1, max: Infinity }], outlets: [{ port: "out" }],
  checkSpec: checkPfr,
  dof(spec) {
    const missing = [], extra = [];
    const list = Array.isArray(spec?.reactions) ? spec.reactions : [];
    if (!list.length) missing.push("the reactions (with their kinetics)");
    if (!has(spec, "L_m")) missing.push("the length L_m");
    if (!has(spec, "D_m")) missing.push("the tube diameter D_m");
    const thermal = ["T_K", "duty_kW", "coolant"].filter(k => has(spec, k));
    if (!thermal.length) missing.push("the temperature T_K, the duty duty_kW or a coolant");
    if (thermal.length > 1) extra.push("give one of T_K, duty_kW and coolant");
    return { needed: 4, given: (list.length ? 1 : 0) + (has(spec, "L_m") ? 1 : 0) + (has(spec, "D_m") ? 1 : 0) + thermal.length, missing, extra };
  },
  solve({ sys, inlets, spec }) {
    const who = "Plug-flow reactor";
    const inlet = inletOf(sys, inlets.in), fin = inlet.flows;
    const P0 = spec.P_kPa ?? inlet.P_kPa;
    const rx = spec.reactions, heats = rx.map(r => reactionHeat(r, { userData: sys.userData }));
    const F0 = fin.reduce((a, v) => a + v, 0);
    if (!(F0 > 0)) return noFlow(sys, inlet, spec, rx, heats, P0);
    const nR = rx.length, nu = rx.map(r => sys.ids.map(id => r.stoichiometry[id] ?? 0));
    const amounts = x => fin.map((v, j) => v + nu.reduce((s, row, r) => s + row[j] * x[r], 0));
    const A = spec.tubes * Math.PI * spec.D_m ** 2 / 4, perim = spec.tubes * Math.PI * spec.D_m, L = spec.L_m;
    const iso = spec.T_K != null, ergun = spec.pressureDrop?.particle_m != null;
    const dH = heats.map(h => h.dH_J_mol / 3600);
    // the state vector: the extents, then H + Σ ξ ΔrH (kW, when not isothermal), then P (kPa, with Ergun)
    const iH = nR, iP = nR + (iso ? 0 : 1);
    const H0 = iso ? null : inlet.H_kW;
    let lastT = inlet.T_K;
    const warnings = [];
    const point = y => {
      const x = y.slice(0, nR), n = amounts(x);
      if (n.some(v => v < -1e-12 * F0)) throw fail("BAD_INPUT", "a flow below zero.");
      const flows = n.map(v => Math.max(v, 0));
      const P = ergun ? y[iP] : P0;
      if (!(P > 0)) throw fail("BAD_INPUT", "the pressure fell to zero.");
      let T, VF = null;
      if (iso) T = spec.T_K;
      else {
        const H = y[iH] - x.reduce((s, v, k) => s + v * dH[k], 0);
        if (spec.phases === 2) {
          const st = stream(sys, { flow_kmol_h: flows, P_kPa: P, H_kW: H });
          T = st.T_K; VF = st.VF;
        } else {
          // one phase: T where the reaction phase's enthalpy is H (Newton from the last point's T), no flash
          const F = flows.reduce((a, v) => a + v, 0), z = flows.map(v => v / F), ph = spec.used[0];
          const hk = t => sys.phase(ph, t, P, z).h_J_mol * F / 3600;
          T = lastT;
          for (let k = 0; k < 50; k++) {
            const g = hk(T) - H, d = (hk(T + 0.01) - hk(T - 0.01)) / 0.02;
            const step = g / d;
            T -= Math.max(-50, Math.min(50, step));
            if (!(T > 1)) throw fail("BAD_INPUT", "the temperature fell below 1 K.");
            if (Math.abs(step) < 1e-9 * T) break;
          }
        }
      }
      const ps = phaseStates(sys, flows, T, P, spec.used, spec.phases === 2);
      const r = rates(sys, rx, ps, T, P, warnings);
      return { x, flows, T, P, VF, ps, r };
    };
    const accept = pt => { lastT = pt.T; return pt;
    };
    const share = (pt, r) => (r.rate.per === "catalyst-mass" ? spec.bed_kg_m3 : spec.phases === 2 ? (pt.ps.phases[r.phase]?.Q ?? 0) / pt.ps.Qtot : 1);
    const q = pt => (spec.duty_kW != null ? spec.duty_kW / L : spec.coolant ? spec.coolant.U_W_m2K * perim * (spec.coolant.T_K - pt.T) / 1000 : 0);
    const dPdz = pt => {
      if (!spec.pressureDrop) return 0;
      if (!ergun) return -spec.pressureDrop.dP_kPa / L;
      const v = pt.ps.phases.vapour;
      if (!v || pt.ps.phases.liquid) throw fail("BAD_INPUT", `${who}: the Ergun pressure drop is for a gas; the mixture at ${pt.T.toFixed(2)} K and ${pt.P.toFixed(3)} kPa is ${v ? "partly liquid" : "liquid"}.`);
      const { particle_m: dp, voidage: e } = spec.pressureDrop;
      const mu = spec.pressureDrop.viscosity_Pa_s ?? gasViscosity(sys, v.x, pt.T, who);
      const u = pt.ps.Qtot / A, rho = v.x.reduce((s, xi, i) => s + xi * sys.MW[i], 0) / 1000 / v.v;
      return -(1 - e) * u / (dp * e ** 3) * (150 * (1 - e) * mu / dp + 1.75 * rho * u) / 1000;
    };
    const F = y => {
      const pt = point(y);
      const d = rx.map((r, k) => 3.6 * A * share(pt, r) * pt.r[k]);
      if (!iso) d.push(q(pt));
      if (ergun) d.push(dPdz(pt));
      return d;
    };
    const y0 = [...rx.map(() => 0), ...(iso ? [] : [H0]), ...(ergun ? [P0] : [])];
    const atol = [...rx.map(() => 1e-9 * F0), ...(iso ? [] : [1e-6 * Math.max(1, Math.abs(H0))]), ...(ergun ? [1e-6 * P0] : [])];
    const profile = [];
    const keep = (z, y) => {
      const pt = accept(point(y));
      const vf = pt.VF ?? (spec.phases === 2 ? (pt.ps.phases.vapour?.F ?? 0) / pt.flows.reduce((a, b) => a + b, 0) : null);
      profile.push({ z_m: z, V_m3: z * A, T_K: pt.T, P_kPa: pt.P, VF: vf, flows_kmol_h: pt.flows, rates: pt.r, Q_m3_h: pt.ps.Qtot * 3600 });
    };
    let res;
    try { res = integrateStiff(F, y0, 0, L, { rtol: 1e-6, atol, h0: L / 200, maxSteps: 4000, onStep: keep }); }
    catch (e) {
      const last = profile.at(-1);
      if (last && last.P_kPa < 0.02 * P0) throw fail("NO_CONVERGENCE", `${who}: the pressure falls to zero at z = ${last.z_m.toPrecision(4)} m of ${L} m: the pressure drop of the bed is larger than the inlet pressure (${P0} kPa). Use larger particles, a wider or shorter tube, or more tubes.`);
      throw fail("NO_CONVERGENCE", `${who}: the integration along the tube stopped${last ? ` at z = ${last.z_m.toPrecision(4)} m (T ${last.T_K.toFixed(2)} K, P ${last.P_kPa.toPrecision(5)} kPa)` : ""}: ${e.message} Check the rate constants and their units, the pressure drop, or a reactant running out.`);
    }
    const end = point(res.y);
    const out = stream(sys, { flow_kmol_h: end.flows, T_K: end.T, P_kPa: end.P });
    const heat_kW = end.x.reduce((s, v, k) => s + v * dH[k], 0);
    const duty = spec.duty_kW ?? out.H_kW - inlet.H_kW + heat_kW;
    const notes = [...warnings];
    for (const h of heats) for (const n of h.notes) if (!notes.includes(n)) notes.push(n);
    if (spec.phases === 2) notes.push("Vapour and liquid flow together without slip: each phase's share of the tube is its share of the volume flow.");
    return { outlets: { out }, duty_kW: duty, notes,
      reaction: reactionResult(sys, rx, heats, fin, end.flows, end.x, end.r, { kinetic: { kind: "pfr", L_m: L, D_m: spec.D_m, tubes: spec.tubes, V_m3: A * L, phases: spec.phases,
        steps: res.steps, profile } }) };
  },
});
