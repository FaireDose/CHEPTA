/**
 * The Evaporator block (proposal 0015, Part I, section 4; milestone M3, step 10; workstream W3): a solution
 * concentrated by boiling off its solvent, in one effect or several in series (forward feed).
 *
 * Each effect is a heater and a flash, the same calculation as the Heater and Flash drum blocks (src/units/units.js):
 * the liquid of the effect before (the feed for the first) is brought, at the effect's pressure P_i, to the enthalpy
 * H_in + Q_i by a P-H flash (src/stream/stream.js); its vapour V_i and its liquid L_i leave. The first effect is heated
 * by saturated steam, Q_1 = m_steam (h'' - h'), the steam condensing to saturated liquid (IAPWS-IF97,
 * src/thermo/iapws/steam.js). Effect i + 1 is heated by the vapour of effect i, condensed totally at P_i:
 *
 *   Q_(i+1) = H(V_i) - H(C_i),   C_i the vapour V_i as a liquid at its bubble point at P_i (vapour fraction 0)
 *
 * (no heat losses, the condensate leaves saturated). This is the textbook model of a multiple-effect evaporator: the
 * enthalpy balance of each effect, the vapour of one effect the heating medium of the next (W. L. McCabe, J. C. Smith,
 * P. Harriott; as taught for example in M. Subramanian, Heat Transfer: Evaporation, lecture notes, SSN College of
 * Engineering, 2019, https://msubbu.in/ln/ht/HT-Lecture-17-Evaporation.pdf, free to read: "the latent heat of the
 * vapor product off of an effect is used to heat the following effect", slide 10, and the enthalpy balance
 * S λ_S = V λ_V + F c_p (T_1 - T_F) of its Example 1, slide 19). Here the enthalpies are the property method's, not a
 * constant heat capacity and latent heat, so the boiling-point rise and the heat of mixing are those of the method.
 *
 * What you give: the effects' pressures P_kPa (one per effect, falling), the steam (saturated, at steam_P_kPa or
 * steam_T_K), and either the steam flow steam_kg_h or the product's concentration, product_mass_fraction:
 * { component: mass fraction }. With the concentration, the steam is found by Brent's method on Q_1 (the product's
 * mass fraction rises with the steam). Optionally U_W_m2K (one value, or one per effect): the area of each effect,
 * A_i = Q_i / (U_i ΔT_i), ΔT_i the condensing temperature of its heating medium minus its boiling temperature.
 *
 * What you get: the outlets product (the liquid of the last effect), vapour (the vapour of the last effect, to the
 * condenser) and condensate (the condensed vapours of effects 1 .. N-1, mixed adiabatically at the pressure of the
 * first effect, P_1, so that the mixture stays liquid: one liquid stream for the balance, not a model of the condensate
 * system; no flow with one effect); the steam duty (the block's duty, Q_1), the steam flow, the
 * steam economy (water evaporated over steam, both in kg/h), and per effect its temperature, duty, vapour, the
 * driving temperature difference and the boiling-point rise: the boiling temperature of the effect's liquid minus the
 * bubble temperature of its own vapour condensed at P_i (for a vapour of one solvent, the solvent's boiling point at
 * P_i). With nonvolatile components (proposal 0009, class "nonvolatile") the vapour holds the solvent only and the
 * rise is caused by them.
 *
 * Refused, with the reason: pressures that do not fall from effect to effect; an effect whose heating medium
 * condenses at or below its boiling temperature (no driving force); a product concentration that the feed already
 * has, or that boiling cannot reach.
 *
 * Units: K, kPa, kmol/h, kW; steam in kg/h; U in W/(m² K), areas in m².
 */
import { fail } from "../util/errors.js";
import { brent } from "../util/solve.js";
import { stream, phaseStream, molarMasses } from "../stream/stream.js";
import { findComponent } from "../thermo/components.js";
import { steamSat } from "../thermo/iapws/steam.js";
import { registerUnit } from "./units.js";

export const MAX_EFFECTS = 10;
/**
 * The sugars and sugar alcohols whose water solutions Modified UNIFAC 2.0 does not describe (water's activity
 * coefficient above 1, and a liquid split of water + glucose near 55 % by mass; docs/models/evaporator.md). Until NRTL
 * pairs fitted to open data exist, their solutions take the ideal solution, with a note (the maintainer, 2026-11-05).
 */
export const SUGARS = Object.freeze(["glucose", "fructose", "xylose", "sorbitol", "xylitol", "erythritol", "sucrose"]);
const SPEC_KEYS = ["P_kPa", "steam_P_kPa", "steam_T_K", "steam_kg_h", "product_mass_fraction", "U_W_m2K"];
const has = (spec, k) => spec?.[k] !== undefined && spec?.[k] !== null && spec?.[k] !== "";
const fmt = v => +Number(v).toPrecision(4);
const KGH_PER_KW = 3600;   // kJ/kg per (kW per kg/h)

const positive = (v, what) => {
  const x = Number(v);
  if (v === "" || v === null || typeof v === "boolean" || !(Number.isFinite(x) && x > 0)) throw fail("BAD_INPUT", `Evaporator: ${what} must be a positive number (got ${JSON.stringify(v)}).`);
  return x;
};

function checkSpec(spec, { sys }) {
  if (!has(spec, "P_kPa")) throw fail("BAD_INPUT", "Evaporator: give the pressure of each effect, P_kPa: [first, second, ...] (kPa, falling), e.g. [50, 20] for two effects.");
  const P = (Array.isArray(spec.P_kPa) ? spec.P_kPa : [spec.P_kPa]).map((p, k) => positive(p, `the pressure of effect ${k + 1}`));
  if (P.length < 1 || P.length > MAX_EFFECTS) throw fail("BAD_INPUT", `Evaporator: from 1 to ${MAX_EFFECTS} effects (got ${P.length}).`);
  for (let k = 1; k < P.length; k++) {
    if (!(P[k] < P[k - 1])) throw fail("BAD_INPUT", `Evaporator: each effect must work below the pressure of the one before, so that its vapour can heat the next (effect ${k + 1}: ${fmt(P[k])} kPa, effect ${k}: ${fmt(P[k - 1])} kPa).`);
  }
  if (has(spec, "steam_P_kPa") === has(spec, "steam_T_K")) throw fail("BAD_INPUT", "Evaporator: give the heating steam (saturated) by its pressure steam_P_kPa or its temperature steam_T_K, one of them.");
  let sat;
  try {
    sat = has(spec, "steam_P_kPa") ? steamSat({ P_kPa: positive(spec.steam_P_kPa, "steam_P_kPa") }) : steamSat({ T_K: positive(spec.steam_T_K, "steam_T_K") });
  } catch (e) { throw fail("BAD_INPUT", `Evaporator: the steam: ${e.message}`); }
  if (!(sat.hfg_kJ_kg > 0)) throw fail("BAD_INPUT", "Evaporator: the steam is at or above the critical point of water: it has no latent heat.");
  const steam = { T_K: sat.T_K, P_kPa: sat.P_kPa, hfg_kJ_kg: sat.hfg_kJ_kg };
  const given = ["steam_kg_h", "product_mass_fraction"].filter(k => has(spec, k));
  if (given.length !== 1) throw fail("BAD_INPUT", `Evaporator: give one of the steam flow steam_kg_h or the product's concentration product_mass_fraction: { component: mass fraction } (got ${given.join(", ") || "none"}).`);
  const out = { P, steam };
  if (has(spec, "steam_kg_h")) out.steam_kg_h = positive(spec.steam_kg_h, "steam_kg_h");
  if (has(spec, "product_mass_fraction")) {
    const w = spec.product_mass_fraction;
    if (!w || typeof w !== "object" || Array.isArray(w) || Object.keys(w).length !== 1) throw fail("BAD_INPUT", "Evaporator: product_mass_fraction names one component and its mass fraction in the product, e.g. { glucose: 0.5 }.");
    const [key, v] = Object.entries(w)[0];
    let id;
    try { id = findComponent(key, sys.userData); } catch (e) { throw fail("BAD_INPUT", `Evaporator: product_mass_fraction: ${e.message}`); }
    const i = sys.ids.indexOf(id);
    if (i < 0) throw fail("BAD_INPUT", `Evaporator: product_mass_fraction: ${key} is not a component of this system (${sys.ids.join(", ")}).`);
    const t = Number(v);
    if (!(t > 0 && t < 1)) throw fail("BAD_INPUT", `Evaporator: the product's mass fraction of ${sys.names[i]} must be between 0 and 1 (got ${JSON.stringify(v)}).`);
    out.target = [i, t];
  }
  if (has(spec, "U_W_m2K")) {
    const U = (Array.isArray(spec.U_W_m2K) ? spec.U_W_m2K : [spec.U_W_m2K]).map((u, k) => positive(u, `U of effect ${k + 1}`));
    if (U.length !== 1 && U.length !== P.length) throw fail("BAD_INPUT", `Evaporator: U_W_m2K: one value, or one per effect (${P.length}; got ${U.length}).`);
    out.U = P.map((_, k) => U[U.length === 1 ? 0 : k]);
  }
  return out;
}

function dof(spec) {
  const out = { needed: 3, given: 0, missing: [], extra: [] };
  if (has(spec, "P_kPa")) out.given++; else out.missing.push("the pressure of each effect");
  const st = ["steam_P_kPa", "steam_T_K"].filter(k => has(spec, k));
  if (st.length) out.given++; else out.missing.push("the steam's pressure or temperature");
  if (st.length > 1) out.extra.push("steam_P_kPa, steam_T_K: give one");
  const g = ["steam_kg_h", "product_mass_fraction"].filter(k => has(spec, k));
  if (g.length) out.given++; else out.missing.push("the steam flow or the product's concentration");
  if (g.length > 1) out.extra.push("steam_kg_h, product_mass_fraction: give one");
  return out;
}

const massFraction = (s, MW, i) => {
  const m = s.flows.reduce((a, v, k) => a + v * MW[k], 0);
  return m > 0 ? s.flows[i] * MW[i] / m : 0;
};

/**
 * The effects in series for a steam duty Q1 (kW): each a P-H flash of the liquid of the one before, heated by the
 * condensing vapour of the one before.
 * @returns {{ effects: object[], product: object, vapour: object }}
 */
export function evaporatorEffects(sys, feed, P, Q1) {
  const effects = [];
  let liquid = feed, Q = Q1;
  for (let k = 0; k < P.length; k++) {
    if (!(liquid.F_kmol_h > 0)) throw fail("OUT_OF_RANGE", `Evaporator: no liquid is left to enter effect ${k + 1}: the effects before it boiled all of it away. Give less steam, or a lower concentration.`);
    const all = stream(sys, { flow_kmol_h: liquid.flows, P_kPa: P[k], H_kW: (liquid.H_kW ?? 0) + Q });
    const V = phaseStream(all, "vapour");
    const liquids = all.phases.filter(p => p.type === "liquid").length;
    const L = liquids > 1 ? stream(sys, { flow_kmol_h: all.flows.map((v, i) => v - V.flows[i]), T_K: all.T_K, P_kPa: P[k] }) : phaseStream(all, "liquid", 0);
    // the vapour condensed at the effect's pressure: the heating medium of the next effect, and the reference of the
    // boiling-point rise
    const C = V.F_kmol_h > 0 ? stream(sys, { flow_kmol_h: V.flows, P_kPa: P[k], VF: 0 }) : null;
    effects.push({ all, V, L, C, Q_kW: Q, liquids });
    Q = C ? (V.H_kW ?? 0) - (C.H_kW ?? 0) : 0;
    liquid = L;
  }
  return { effects, product: liquid, vapour: effects[effects.length - 1].V };
}

function solve({ sys, inlets, spec }) {
  const feed = inlets.in.length === 1 ? inlets.in[0]
    : stream(sys, { flow_kmol_h: inlets.in.reduce((a, s) => a.map((v, i) => v + s.flows[i]), new Array(sys.n).fill(0)), P_kPa: Math.min(...inlets.in.filter(s => s.F_kmol_h > 0).map(s => s.P_kPa)), H_kW: inlets.in.reduce((a, s) => a + (s.H_kW ?? 0), 0) });
  if (!(feed.F_kmol_h > 0)) throw fail("BAD_INPUT", "Evaporator: the feed has no flow.");
  const MW = molarMasses(sys);
  const { P, steam } = spec;
  const notes = [];
  let Q1, run;
  if (spec.steam_kg_h != null) {
    Q1 = spec.steam_kg_h * steam.hfg_kJ_kg / KGH_PER_KW;
    run = evaporatorEffects(sys, feed, P, Q1);
  } else {
    const [i, w] = spec.target;
    const wF = massFraction(feed, MW, i);
    if (!(w > wF)) throw fail("BAD_INPUT", `Evaporator: the feed already has a mass fraction of ${sys.names[i]} of ${fmt(wF)}; the product's (${w}) must be above it.`);
    // the water to evaporate if only the solvent leaves, times a latent heat of the order of water's: the first guess
    const evaporated = feed.mass_kg_h * (1 - wF / w);
    let hi = Math.max(1e-6, evaporated * 2500 / KGH_PER_KW / P.length);
    const f = q => massFraction(evaporatorEffects(sys, feed, P, q).product, MW, i) - w;
    let lo = 0, fhi;
    // a steam duty that boils the liquid away, or heats what is left beyond its records, counts as "too much"
    const tryAt = q => { try { return f(q); } catch (e) { if (e.code === "OUT_OF_RANGE") return Infinity; throw e; } };
    for (let k = 0; ; k++) {
      fhi = tryAt(hi);
      if (fhi > 0) break;
      if (k > 40) throw fail("OUT_OF_RANGE", `Evaporator: a product mass fraction of ${w} of ${sys.names[i]} is not reached: with ${fmt(hi * KGH_PER_KW / steam.hfg_kJ_kg)} kg/h of steam it is ${fmt(fhi + w)}. Something in the feed does not evaporate at these pressures.`);
      lo = hi; hi *= 2;
    }
    // Brent's method needs a finite end: the bracket is narrowed by bisection until the upper end has a liquid
    for (let k = 0; fhi === Infinity && k < 80; k++) {
      const m = (lo + hi) / 2, fm = tryAt(m);
      if (fm > 0) { hi = m; fhi = fm; } else lo = m;
    }
    if (fhi === Infinity) throw fail("NO_CONVERGENCE", `Evaporator: no steam flow found that gives a product mass fraction of ${w} of ${sys.names[i]}.`);
    Q1 = brent(f, lo, hi, { xtol: 1e-10 * Math.max(1, hi), ftol: 1e-12 });
    run = evaporatorEffects(sys, feed, P, Q1);
  }
  const { effects, product, vapour } = run;
  // the driving force of each effect: the heating medium's condensing temperature above the boiling temperature
  const profile = [];
  let Theat = steam.T_K, evaporated = 0;
  for (let k = 0; k < effects.length; k++) {
    const e = effects[k], T = e.all.T_K;
    const dT = Theat - T;
    if (!(dT > 0)) {
      throw fail("BAD_INPUT", k === 0
        ? `Evaporator: effect 1 boils at ${fmt(T)} K, not below the steam's condensing temperature (${fmt(Theat)} K): the steam cannot heat it. Lower the pressure of effect 1, or use steam at a higher pressure.`
        : `Evaporator: effect ${k + 1} boils at ${fmt(T)} K, not below the temperature at which the vapour of effect ${k} condenses (${fmt(Theat)} K): that vapour cannot heat it. Lower the pressure of effect ${k + 1}.`);
    }
    if (!(e.V.F_kmol_h > 0)) notes.push(`Effect ${k + 1} does not boil: its heat only warms the liquid${k + 1 < effects.length ? ", and nothing heats the next effect" : ""}.`);
    const vkg = e.V.mass_kg_h;
    evaporated += vkg;
    const A = spec.U ? e.Q_kW * 1000 / (spec.U[k] * dT) : null;
    profile.push({
      effect: k + 1, P_kPa: P[k], T_K: T, duty_kW: e.Q_kW, T_heating_K: Theat, dT_K: dT,
      BPR_K: e.C ? T - e.C.T_K : null, T_condensing_K: e.C ? e.C.T_K : null,
      vapour_kg_h: vkg, liquid_kg_h: e.L.mass_kg_h,
      liquid_mass_fractions: Object.fromEntries(sys.ids.map((id, i) => [id, massFraction(e.L, MW, i)])),
      ...(A != null ? { U_W_m2K: spec.U[k], A_m2: A } : {}),
    });
    if (e.liquids > 1) notes.push(`Effect ${k + 1}: the liquid splits into two phases; both leave together.`);
    if (e.C) Theat = e.C.T_K;
  }
  // the condensates of effects 1 .. N-1, mixed adiabatically at the first effect's pressure (the mixture of saturated
  // condensates stays liquid there; at a lower pressure it would partly flash)
  const N = effects.length;
  const cflows = new Array(sys.n).fill(0);
  let cH = 0;
  for (let k = 0; k < N - 1; k++) if (effects[k].C) { effects[k].C.flows.forEach((v, i) => { cflows[i] += v; }); cH += effects[k].C.H_kW ?? 0; }
  const Pc = P[0];
  const condensate = cflows.some(v => v > 0) ? stream(sys, { flow_kmol_h: cflows, P_kPa: Pc, H_kW: cH }) : stream(sys, { flow_kmol_h: cflows, T_K: effects[0].all.T_K, P_kPa: Pc });
  const steam_kg_h = Q1 * KGH_PER_KW / steam.hfg_kJ_kg;
  notes.unshift(
    `${N} effect${N > 1 ? "s" : ""} in forward feed; each a heater and a flash at its pressure, ${N > 1 ? "each after the first heated by the vapour of the one before, condensed totally at that effect's pressure; " : ""}no heat losses. The steam is saturated at ${fmt(steam.P_kPa)} kPa (${fmt(steam.T_K)} K) and leaves as saturated condensate (latent heat ${fmt(steam.hfg_kJ_kg)} kJ/kg, IAPWS-IF97).`,
    "The boiling-point rise of an effect: its boiling temperature minus the bubble temperature of its vapour condensed at its pressure (for a vapour of one solvent, the solvent's boiling point there).",
  );
  const sugars = sys.ids.filter(id => SUGARS.includes(id)).map(id => sys.names[sys.ids.indexOf(id)]);
  if (sugars.length) {
    const model = String(sys.model ?? "").toUpperCase();
    notes.push(model === "IDEAL"
      ? `${sugars.join(", ")}: the ideal solution (Raoult's law) gives the boiling-point rise without activity coefficients; real sugar solutions boil higher. CHEPTA has no fitted pairs of water with ${sugars.length > 1 ? "these sugars" : "this sugar"} yet.`
      : `${sugars.join(", ")} with ${sys.model}: Modified UNIFAC 2.0 does not describe sugar solutions (it gives water an activity coefficient above 1 and splits water + glucose into two liquids near 55 % by mass); use the ideal solution until fitted pairs exist.`);
  }
  if (N > 1) notes.push(`The condensates of effects 1 to ${N - 1} leave together, mixed at ${fmt(Pc)} kPa (the first effect's pressure, where they stay liquid; in a plant they are often flashed from chest to chest instead).`);
  if (spec.target) notes.push(`The steam for a product mass fraction of ${spec.target[1]} of ${sys.names[spec.target[0]]}: ${fmt(steam_kg_h)} kg/h.`);
  const economy = evaporated / steam_kg_h;
  const sizing = spec.U ? {
    dimensions: { A_m2: profile.map(p => p.A_m2), total_A_m2: profile.reduce((a, p) => a + p.A_m2, 0) },
    basis: "each effect's area from its duty, A = Q / (U ΔT), ΔT the heating medium's condensing temperature minus the effect's boiling temperature",
    source: "the heat-transfer rate equation Q = U A ΔT (M. Subramanian, Heat Transfer: Evaporation, SSN College of Engineering, 2019, slides 19 and 30)",
  } : null;
  return {
    outlets: { product, vapour, condensate },
    duty_kW: Q1,
    notes, profile,
    state: { effects: N, P_effects_kPa: P.slice(), steam_P_kPa: steam.P_kPa, steam_T_K: steam.T_K, steam_hfg_kJ_kg: steam.hfg_kJ_kg, steam_kg_h,
      evaporated_kg_h: evaporated, steam_economy: economy, T_effects_K: profile.map(p => p.T_K), BPR_K: profile.map(p => p.BPR_K),
      duties_kW: profile.map(p => p.duty_kW), ...(spec.target ? { target: { [sys.ids[spec.target[0]]]: spec.target[1] } } : {}) },
    ...(sizing ? { sizing } : {}),
  };
}

registerUnit({
  type: "evaporator", label: "Evaporator", duty: true,
  inlets: [{ port: "in", min: 1, max: Infinity, label: "feed" }],
  outlets: [{ port: "product" }, { port: "vapour" }, { port: "condensate" }],
  specKeys: SPEC_KEYS,
  checkSpec, dof, solve,
});
