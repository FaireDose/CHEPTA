/**
 * The Crystallizer block (proposal 0015, Part I, section 4; milestone M3, step 10; workstream W3): a pure solid formed
 * from a solution, in equilibrium with its mother liquor, by cooling or by evaporating part of the solvent.
 *
 * The equilibrium is that of src/equilibrium/sle.js (a pure solid in a liquid, no solid solution; eutectic systems):
 *
 *   ln(x_s γ_s) = −(ΔH_fus / R T)(1 − T / T_m)        (ΔCp of fusion 0, as sle.js)
 *
 * at the crystallizer's temperature T, with γ from the system's activity model. Only the solute crystallizes, so the
 * other components keep their ratios in the mother liquor: the solubility is solved at that solvent composition
 * (solidSolubility with `solvent`). With n_o the flows of the other components in the liquid,
 *
 *   mother liquor: n_s,ML = x_s Σ n_o / (1 − x_s),   crystals: C = n_s,liquid − n_s,ML   (none when C ≤ 0)
 *
 * Cooling: give T_K (and the outlet pressure P_kPa, default the feed's); no vapour leaves. Evaporative: give the
 * solvent evaporated, evaporated_kg_h (the vapour's mass flow), and either T_K (the vapour leaves at the mother
 * liquor's bubble pressure there) or P_kPa (the temperature is the mother liquor's bubble temperature, found by
 * Brent's method). The vapour is the mother liquor's equilibrium vapour (its bubble point at T: y = K x); its
 * composition and the mother liquor are solved together by successive substitution. Nonvolatile components (proposal
 * 0009) stay in the liquid.
 *
 * Energy: the duty is H_out − H_in. The crystals' enthalpy is the pure liquid solute's at T minus the enthalpy of
 * fusion, h_solid(T) = h_L(T) − ΔH_fus: a labelled approximation (the maintainer, 2026-10-29, answer 3 of proposal
 * 0015), consistent with the solid-liquid model (ΔCp of fusion 0 means c_p,solid = c_p,liquid), or, where a measured solubility curve gives the solubility, the
 * liquid minus the curve's apparent enthalpy of solution (src/thermo/solubility-curve.js); valid where the
 * solute's liquid records reach T. The crystals leave as a stream with a solid phase in equilibrium
 * (src/stream/stream.js, crystalStream; contract 1, stream v2), which only a Product takes: no other block holds a
 * solid in equilibrium yet.
 *
 * Results: the yield (the crystals over the solute fed), the crystals (kmol/h, kg/h), the mother liquor's solubility
 * x_s and γ_s, T and P, the vapour, the duty. Refused, with the reason: T at or above the solute's melting temperature;
 * a solute without melting data (no open data, or give them in My data); an equation of state (no activity
 * coefficients for the solid); an evaporation larger than the solvent, or a feed that is not all liquid.
 *
 * Not modelled: hydrates and solvates (the solid is the pure solute), several solids at once (a eutectic mother liquor
 * that would deposit a second solid is warned of), crystal size and growth rates, the liquid the crystals carry (a
 * solid-liquid separator, postponed with the dryer by the maintainer on 2026-10-29).
 *
 * Units: K, kPa, kmol/h, kg/h, kW.
 */
import { fail } from "../util/errors.js";
import { brent } from "../util/solve.js";
import { stream, crystalStream, molarMasses } from "../stream/stream.js";
import { findComponent } from "../thermo/components.js";
import { registerUnit } from "./units.js";
import { solidHeat } from "../equilibrium/sle.js";
import { system as makeSystem } from "../system.js";

/** The NRTL sets fitted to measured solubilities (validation/python/fit_sle.py). */
export const SLE_SET = "fitted-sle-thermoml";
const auxCache = new WeakMap();
/**
 * The system the crystallizer takes the solubility from (the maintainer, 2026-11-05: the sets fitted to measured
 * solubilities are the default in the Crystallizer, and elsewhere only where the pair has no other set): the
 * flowsheet's own, unless a pair of the solute with another component has a solubility set that the flowsheet did not
 * choose; then the same method with those sets.
 */
function solubilitySystem(sys, i) {
  const byI = auxCache.get(sys) ?? new Map();
  if (byI.has(i)) return byI.get(i);
  const idOf = nm => sys.ids[sys.names.indexOf(nm)];
  const sets = {};
  let changed = false;
  for (const p of sys.info?.pairs ?? []) {
    if (!p?.set || !Array.isArray(p.pair)) continue;
    const [a, b] = p.pair.map(idOf);
    if (!a || !b) continue;
    sets[`${a}+${b}`] = p.set;
    if ((a === sys.ids[i] || b === sys.ids[i]) && p.set !== SLE_SET && p.alternatives?.some(x => x.set === SLE_SET)) { sets[`${a}+${b}`] = SLE_SET; changed = true; }
  }
  const aux = changed ? makeSystem({ components: sys.ids, model: sys.model, vapour: sys.vapour, sets, userData: sys.userData }) : sys;
  byI.set(i, aux); auxCache.set(sys, byI);
  return aux;
}

const SPEC_KEYS = ["solute", "T_K", "P_kPa", "evaporated_kg_h"];
const has = (spec, k) => spec?.[k] !== undefined && spec?.[k] !== null && spec?.[k] !== "";
const fmt = v => +Number(v).toPrecision(4);

const positive = (v, what) => {
  const x = Number(v);
  if (v === "" || v === null || typeof v === "boolean" || !(Number.isFinite(x) && x > 0)) throw fail("BAD_INPUT", `Crystallizer: ${what} must be a positive number (got ${JSON.stringify(v)}).`);
  return x;
};

function checkSpec(spec, { sys }) {
  if (!has(spec, "solute")) throw fail("BAD_INPUT", "Crystallizer: name the component that crystallizes, solute (e.g. \"succinic-acid\").");
  let id;
  try { id = findComponent(spec.solute, sys.userData); } catch (e) { throw fail("BAD_INPUT", `Crystallizer: solute: ${e.message}`); }
  const i = sys.ids.indexOf(id);
  if (i < 0) throw fail("BAD_INPUT", `Crystallizer: solute: ${spec.solute} is not a component of this system (${sys.ids.join(", ")}).`);
  if (sys.n < 2) throw fail("BAD_INPUT", "Crystallizer: a solution needs a solvent as well as the solute.");
  if (typeof sys.solidSolubility !== "function" || !sys.gammas) throw fail("BAD_INPUT", `Crystallizer: the solubility needs an activity model (NRTL, UNIQUAC, Wilson, Modified UNIFAC 2.0 or the ideal solution); the flowsheet uses ${sys.model}.`);
  const f = sys.fusion?.[i];
  if (!sys.solubility?.[i] && (!(f?.Tm_K > 0) || !(f?.Hfus_J_mol > 0))) throw fail("MISSING_DATA", `Crystallizer: ${sys.names[i]} has no melting temperature and enthalpy of fusion and no measured solubility curve (no open data in the open sources); add them as your own data (My data, Melting data or Solubility).`);
  const out = { i };
  if (has(spec, "T_K")) out.T_K = positive(spec.T_K, "T_K");
  if (has(spec, "P_kPa")) out.P_kPa = positive(spec.P_kPa, "P_kPa");
  if (has(spec, "evaporated_kg_h")) {
    out.evaporated_kg_h = Number(spec.evaporated_kg_h);
    if (!(Number.isFinite(out.evaporated_kg_h) && out.evaporated_kg_h >= 0)) throw fail("BAD_INPUT", `Crystallizer: evaporated_kg_h must be a number of at least 0 (got ${JSON.stringify(spec.evaporated_kg_h)}).`);
    if (out.evaporated_kg_h > 0 && (out.T_K != null) === (out.P_kPa != null)) throw fail("BAD_INPUT", "Crystallizer: an evaporative crystallizer takes the solvent evaporated, evaporated_kg_h, and one of T_K or P_kPa (the other is the mother liquor's bubble point).");
  }
  if (!(out.evaporated_kg_h > 0) && out.T_K == null) throw fail("BAD_INPUT", "Crystallizer: give the temperature T_K (cooling), or the solvent evaporated evaporated_kg_h with T_K or P_kPa (evaporative).");
  if (out.T_K != null && f?.Tm_K > 0 && !(out.T_K < f.Tm_K)) throw fail("OUT_OF_RANGE", `Crystallizer: ${sys.names[i]} melts at ${fmt(f.Tm_K)} K: at ${fmt(out.T_K)} K there is no solid.`);
  return out;
}

function dof(spec) {
  const out = { needed: 2, given: 0, missing: [], extra: [] };
  if (has(spec, "solute")) out.given++; else out.missing.push("the solute (the component that crystallizes)");
  const evap = Number(spec?.evaporated_kg_h) > 0;
  const tp = ["T_K", "P_kPa"].filter(k => has(spec, k));
  if (evap ? tp.length >= 1 : has(spec, "T_K")) out.given++;
  else out.missing.push(evap ? "T_K or P_kPa" : "the temperature T_K (or the solvent evaporated with T_K or P_kPa)");
  if (evap && tp.length > 1) out.extra.push("T_K, P_kPa: with evaporation give one");
  return out;
}

/**
 * The liquid saturated in solid i at T, from a liquid of flows L (kmol/h): the crystals and the mother liquor.
 * @returns {{ C:number, ml:number[], x:number, gamma:number, splits:boolean, undersaturated:boolean }}
 */
export function crystallize(sys, L, i, T) {
  const others = L.filter((_, k) => k !== i), so = others.reduce((a, v) => a + v, 0);
  if (!(so > 0)) throw fail("BAD_INPUT", `Crystallizer: the liquid holds no solvent: only ${sys.names[i]}.`);
  const r = solubilitySystem(sys, i).solidSolubility(i, T, sys.n > 2 ? { solvent: others.map(v => v / so) } : {});
  const sat = r.xSolute * so / (1 - r.xSolute);
  const C = Math.max(0, L[i] - sat);
  const ml = L.slice(); ml[i] = L[i] - C;
  return { C, ml, x: r.xSolute, gamma: r.gamma, splits: r.splits, route: r.route, undersaturated: !(L[i] > sat) };
}

/** Evaporate E kg/h of the mother liquor's equilibrium vapour at T, then crystallize: successive substitution on y. */
function evaporativeAt(sys, F, i, T, E, MW) {
  let y = null, out = null;
  const volatile = sys.ids.map((_, k) => !(sys.nonvolatile?.[k]));
  for (let it = 0; it < 200; it++) {
    const x0 = out ? out.ml : F;
    const b = sys.bubbleP(normalize(x0), T);
    const yn = b.y.map((v, k) => (volatile[k] ? v : 0));
    const s = yn.reduce((a, v) => a + v, 0);
    const ynn = yn.map(v => v / s);
    const done = y && Math.max(...ynn.map((v, k) => Math.abs(v - y[k]))) < 1e-13;
    y = ynn;
    const Mv = y.reduce((a, v, k) => a + v * MW[k], 0), V = E / Mv;
    const L = F.map((v, k) => v - V * y[k]);
    if (L.some((v, k) => v < -1e-12 * Math.max(1, F[k]))) {
      throw fail("OUT_OF_RANGE", `Crystallizer: ${fmt(E)} kg/h of vapour is more than the feed's solvent can give (${sys.names[L.findIndex(v => v < 0)]} would run out).`);
    }
    out = { ...crystallize(sys, L.map(v => Math.max(0, v)), i, T), V, y, P: b.P };
    if (done) return out;
  }
  throw fail("NO_CONVERGENCE", `Crystallizer: the vapour's composition did not settle in 200 substitutions at ${fmt(T)} K.`);
}

const normalize = v => { const s = v.reduce((a, b) => a + b, 0); return v.map(x => x / s); };

function solve({ sys, inlets, spec, outletCount }) {
  const ins = inlets.in;
  const flows = ins.reduce((a, s) => a.map((v, k) => v + s.flows[k]), new Array(sys.n).fill(0));
  const Hin = ins.reduce((a, s) => a + (s.H_kW ?? 0), 0);
  const F = flows.reduce((a, v) => a + v, 0);
  if (!(F > 0)) throw fail("BAD_INPUT", "Crystallizer: the feed has no flow.");
  const i = spec.i, name = sys.names[i], MW = molarMasses(sys);
  const { Tm_K = null, Hfus_J_mol = null } = sys.fusion?.[i] ?? {};
  const notes = [], warnings = [];
  const feedP = Math.min(...ins.filter(s => s.F_kmol_h > 0).map(s => s.P_kPa));
  let T, P, r, vapour = null;
  const E = spec.evaporated_kg_h ?? 0;
  if (E > 0 && outletCount != null && outletCount < 3) throw fail("BAD_INPUT", "Crystallizer: an evaporative crystallizer sends its vapour out of the vapour outlet: connect it (to a condenser or a product).");
  if (E > 0) {
    if (spec.T_K != null) { T = spec.T_K; r = evaporativeAt(sys, flows, i, T, E, MW); P = r.P; }
    else {
      P = spec.P_kPa;
      // the bubble temperature of the mother liquor at P: Brent's method on T, below the solute's melting temperature
      const g = t => evaporativeAt(sys, flows, i, t, E, MW).P - P;
      const hi = Tm_K ? Tm_K - 0.01 : Math.max(...sys.solubility[i].map(c => c.Tmax_K ?? c.points.at(-1)[0]));
      let lo = Math.max(150, hi - 300), a = null;
      const grid = 60;
      let prev = null;
      for (let k = 0; k <= grid; k++) {
        const t = lo + (hi - lo) * k / grid;
        let v; try { v = g(t); } catch (e) { if (e.code === "OUT_OF_RANGE" || e.code === "NO_SOLUTION") { prev = null; continue; } throw e; }
        if (prev && prev[1] < 0 && v >= 0) { a = [prev[0], t]; break; }
        prev = [t, v];
      }
      if (!a) throw fail("OUT_OF_RANGE", `Crystallizer: no temperature below ${name}'s melting point (${fmt(Tm_K)} K) where the mother liquor boils at ${fmt(P)} kPa after ${fmt(E)} kg/h is evaporated.`);
      T = brent(g, a[0], a[1], { xtol: 1e-9 });
      r = evaporativeAt(sys, flows, i, T, E, MW);
    }
    vapour = stream(sys, { flow_kmol_h: r.y.map(v => v * r.V), T_K: T, P_kPa: P });
    notes.push(`Evaporative: ${fmt(E)} kg/h of the mother liquor's equilibrium vapour leaves at ${fmt(T)} K and ${fmt(P)} kPa (its bubble point).`);
  } else {
    T = spec.T_K; P = spec.P_kPa ?? feedP;
    r = crystallize(sys, flows, i, T);
    if (spec.P_kPa == null) notes.push("Cooling: the outlets at the feed's pressure.");
  }
  // round-off: a solute flow of the mother liquor a hair below zero is zero
  const ml = r.ml.map(v => Math.max(0, v));
  const mother = E > 0 ? stream(sys, { flow_kmol_h: ml, T_K: T, VF: 0 }) : stream(sys, { flow_kmol_h: ml, T_K: T, P_kPa: P });
  if (!(E > 0) && mother.VF > 1e-9) throw fail("BAD_INPUT", `Crystallizer: at ${fmt(T)} K and ${fmt(P)} kPa the mother liquor would boil (vapour fraction ${fmt(mother.VF)}); raise the pressure, or give the solvent evaporated (an evaporative crystallizer).`);
  const Cflows = sys.ids.map((_, k) => (k === i ? r.C : 0));
  let crystals;
  const others = ml.filter((_, k) => k !== i), so = others.reduce((a, v) => a + v, 0);
  const heat = solidHeat(sys, i, T, sys.n > 2 ? { solvent: others.map(v => v / so) } : {});
  if (r.C > 0) {
    const unit = sys.ids.map((_, k) => (k === i ? 1 : 0));
    const hS = sys.enthalpy("liquid", T, P, unit) - heat.dH_J_mol;
    // a flowsheet that holds the solid everywhere (thermo.solids) makes the crystals by its own flash, the same rule
    crystals = sys.solids?.includes(sys.ids[i]) ? stream(sys, { flow_kmol_h: Cflows, T_K: T, P_kPa: P })
      : crystalStream(sys, { flow_kmol_h: Cflows, T_K: T, P_kPa: P, h_J_mol: hS });
  } else {
    crystals = stream(sys, { flow_kmol_h: Cflows, T_K: T, P_kPa: P });
    notes.push(`The liquid is not saturated in ${name} at ${fmt(T)} K (solubility x = ${fmt(r.x)}): nothing crystallizes.`);
  }
  if (r.splits) notes.push(`The ${sys.model} model can split the mother liquor into two liquids near this composition: a liquid-liquid check is needed.`);
  // another component with melting data that the mother liquor is saturated in: a eutectic, a second solid would form
  for (let k = 0; k < sys.n; k++) {
    if (k === i || !(sys.fusion?.[k]?.Tm_K > 0) || !(ml[k] > 0)) continue;
    let Tl = null;
    try { Tl = sys.liquidusT(k, normalize(ml)); } catch { Tl = null; }
    if (Tl != null && Tl > T) warnings.push({ code: "SECOND_SOLID", message: `The mother liquor is also saturated in ${sys.names[k]} (its crystals would appear below ${fmt(Tl)} K, above the crystallizer's ${fmt(T)} K): past a eutectic, a second solid forms, which this block does not model.`, remedy: "Raise the temperature, or evaporate less." });
  }
  notes.push(`The crystals are pure ${name}, in equilibrium with the mother liquor (solubility x = ${fmt(r.x)}, γ = ${fmt(r.gamma)}; ${r.route === "curve" ? "the measured solubility curve" : "ΔCp of fusion 0"}). Their enthalpy is the liquid ${name}'s at ${fmt(T)} K minus ${heat.source}, ${fmt(heat.dH_J_mol / 1000)} kJ/mol: a labelled approximation.${sys.solids?.includes(sys.ids[i]) ? "" : " Crystals go to a Product, unless the flowsheet names them in its solids (then every block keeps them)."}`);
  const outlets = { crystals, liquor: mother, vapour: vapour ?? stream(sys, { flow_kmol_h: new Array(sys.n).fill(0), T_K: T, P_kPa: P }) };
  const Hout = Object.values(outlets).reduce((a, s) => a + (s.H_kW ?? 0), 0);
  const fed = flows[i];
  return {
    outlets, duty_kW: Hout - Hin, notes, warnings,
    state: { solute: sys.ids[i], mode: E > 0 ? "evaporative" : "cooling", T_K: T, P_kPa: P, yield: fed > 0 ? r.C / fed : 0,
      crystals_kmol_h: r.C, crystals_kg_h: r.C * MW[i], solubility_x: r.x, gamma: r.gamma, evaporated_kg_h: E,
      Tm_K, Hfus_J_mol, route: r.route ?? "equation", h_solid_rule: heat.kind === "fusion" ? "h_liquid(T) - Hfus" : "h_liquid(T) - dH_solution(T)", dH_solid_J_mol: heat.dH_J_mol },
  };
}

registerUnit({
  type: "crystallizer", label: "Crystallizer", duty: true, crystals: true,
  inlets: [{ port: "in", min: 1, max: Infinity, label: "feed" }],
  outlets: [{ port: "crystals" }, { port: "liquor", label: "mother liquor" }, { port: "vapour", optional: true }],
  specKeys: SPEC_KEYS,
  checkSpec, dof, solve,
});
