import { methodAdvice, pressureAdvice } from "./method-advice.js";
import { vapourPressure } from "./psat.js";
import { noVapourPressureMessage } from "./components.js";
import { nrtl } from "./activity/nrtl.js";
import { uniquac } from "./activity/uniquac.js";
import { modUnifac } from "./activity/mod-unifac.js";
import modUnifacTables from "../data/mod-unifac-2.json" with { type: "json" };
import { dimerK, monomerPressure } from "./vapour.js";
import { createEosSystem, EOS_MODELS } from "./eos/system.js";
import { listComponents, findComponent, componentRecord } from "./components.js";
import { checkUserData, userDataUsed } from "./user-data.js";
import { selection, choosePair, describePair, pairWarnings, sourceEntry } from "./library.js";
import { createCubicVapour } from "./gamma-phi-vapour.js";
import { activityPhaseMethods } from "./enthalpy.js";
import { fail, failRange } from "../util/errors.js";

export const MODELS = ["NRTL", "UNIQUAC", "MOD-UNIFAC-2", "ideal"];
/** Display names of the model keys that are not names themselves. */
const MODEL_NAMES = { "MOD-UNIFAC-2": "Mod. UNIFAC 2.0" };
/** A model key as people read it: "Mod. UNIFAC 2.0" for "MOD-UNIFAC-2"; other keys unchanged. */
export const modelName = m => MODEL_NAMES[m] ?? m;
/** Modified UNIFAC 2.0 (predicted from groups): the source every one of its pairs cites. */
export const MOD_UNIFAC_SOURCE = `Modified UNIFAC 2.0 (Hayer, Hasse and Jirasek, Ind. Eng. Chem. Res. 64 (2025) 10304; arXiv:2412.12962, CC BY 4.0): predicted from the functional groups, not fitted to data of the pair`;
export { EOS_MODELS, listComponents, findComponent };

/**
 * Build a thermodynamic system: components + liquid activity model + vapour model.
 *
 * @param {object} cfg
 * @param {string[]} cfg.components  names, ids, aliases or CAS numbers
 * @param {"NRTL"|"UNIQUAC"|"MOD-UNIFAC-2"|"ideal"} [cfg.model="NRTL"]  "MOD-UNIFAC-2": Modified UNIFAC 2.0,
 *        every pair predicted from the groups of the components (tier "predicted")
 * @param {boolean} [cfg.allowMissingPairs=false]  treat pairs without parameters as ideal
 * @param {boolean} [cfg.association=true]         use the chemical theory for dimerizing acids
 * @param {number[]|((T:number)=>number[])} [cfg.psat]  override pure vapour pressures (kPa),
 *        e.g. with the pure-component values measured alongside an isothermal data set
 * @param {Object<string,string>} [cfg.sets]  parameter set per pair, e.g. { "acetone+chloroform": "chemsep" }
 *        (pair in any order, any component name); see CHEPTA.library.sets()
 * @param {string[]} [cfg.prefer]  tiers in order of preference for every pair, e.g. ["fitted", "databank"];
 *        without sets or prefer each pair uses its default set
 * @param {"ideal"|"PR"|"SRK"} [cfg.vapour="ideal"]  vapour model of an activity-coefficient system:
 *        ideal gas, or a Peng-Robinson or SRK vapour with phi_sat and the Poynting correction
 *        (gamma-phi-vapour.js); its k_ij come from the databank (or cfg.kij)
 * @param {object} [cfg.userData]  the user's own data (proposal 0012, user-data.js): property records, components,
 *        pair sets and groups put over the databank for this system only; info.userData lists what it uses
 */
/** The vapour pressure (kPa) a nonvolatile component is given in an activity-model system: effectively zero. */
export const NV_PSAT_KPA = 1e-20;

export function createSystem(cfg) {
  const model = (cfg.model || "NRTL").toUpperCase() === "IDEAL" ? "ideal" : (cfg.model || "NRTL").toUpperCase();
  const isEos = EOS_MODELS.includes(model);
  if (!MODELS.includes(model) && !isEos) throw fail("BAD_INPUT", `Unknown model "${cfg.model}". Use one of: ${MODELS.join(", ")}, or an equation of state: ${EOS_MODELS.join(", ")}.`);
  const vapourModel = cfg.vapour == null ? (isEos ? model : "ideal") : String(cfg.vapour).toUpperCase() === "IDEAL" ? "ideal" : String(cfg.vapour).toUpperCase();
  if (vapourModel !== "ideal" && !EOS_MODELS.includes(vapourModel)) {
    throw fail("BAD_INPUT", `Unknown vapour model "${cfg.vapour}". Use "ideal", ${EOS_MODELS.map(m => `"${m}"`).join(" or ")}.`);
  }
  if (isEos && vapourModel !== model) {
    throw fail("BAD_INPUT", `Model "${model}" describes both phases; the vapour option is for activity-coefficient models (${MODELS.join(", ")}).`);
  }
  // one component is allowed with every model: a pure substance heated, compressed or boiled (its activity coefficient
  // is 1, so the activity models reduce to the pure component's vapour pressure and enthalpies)
  if (!Array.isArray(cfg.components) || cfg.components.length < 1) throw fail("BAD_INPUT", "Give at least one component.");
  const ud = checkUserData(cfg.userData);
  const ids = cfg.components.map(k => findComponent(k, ud));
  if (new Set(ids).size !== ids.length) throw fail("BAD_INPUT", "A component appears twice.");
  const solids = ids.map(id => componentRecord(id, ud)).filter(c => c.class === "solid");
  if (solids.length) throw fail("BAD_INPUT", `${solids.map(c => c.name).join(", ")}: an inert solid takes no part in the phase equilibrium; build the system with CHEPTA.system(), which passes inert solids through as a phase of their own.`);
  const sel = selection(cfg, ud); // checked for every model, so that a typo never passes silently
  if (isEos) return createEosSystem(ids, { ...cfg, model, userData: ud }, sel); // Peng-Robinson / SRK: see eos/system.js
  const comps = ids.map(id => componentRecord(id, ud));
  // nonvolatile components (proposal 0009, step 5): no vapour pressure; they stay in the liquid (NV_PSAT_KPA below)
  const nonvolatile = comps.map(c => c.class === "nonvolatile");
  for (const c of comps) {
    // a liquid without an open vapour pressure (vapourPressure_missing, 2026-10-20) is accepted: activity coefficients,
    // liquid-liquid and solid-liquid equilibria do not need it; psat() below refuses it with the reason
    if (!c.vapourPressure && !cfg.psat && c.class !== "nonvolatile" && !c.vapourPressure_missing) {
      throw fail("MISSING_DATA", `${c.name} has no vapour-pressure record, so it cannot be used with activity-coefficient models. Use an equation of state for gases.`);
    }
    if (model === "UNIQUAC" && !c.uniquac) throw fail("MISSING_DATA", `${c.name} has no UNIQUAC r and q.`);
    if (model === "MOD-UNIFAC-2" && !c.modUnifac?.groups) {
      throw fail("MISSING_DATA", `${c.name} has no Modified UNIFAC 2.0 groups${c.modUnifac?.note ? ` (${c.modUnifac.note.replace(/^no Modified UNIFAC 2\.0 groups: /, "")})` : ""}.`);
    }
  }
  const n = ids.length;
  const useAssoc = cfg.association !== false;

  // ---- interaction parameters
  const zeros = () => Array.from({ length: n }, () => new Array(n).fill(0));
  const a = zeros(), b = zeros(), alpha = zeros();
  const pairs = [], missing = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (model === "ideal") continue;
    if (model === "MOD-UNIFAC-2") {
      pairs.push({ pair: [comps[i].name, comps[j].name], source: MOD_UNIFAC_SOURCE, tier: "predicted", T_range_K: null,
        set: "mod-unifac-2.0", default: true, chosenBy: "model", source_ids: ["hayer2025-mod-unifac-2"],
        sources: [sourceEntry("hayer2025-mod-unifac-2")].filter(Boolean), valid: null, alternatives: [] });
      continue;
    }
    const choice = choosePair(model, ids[i], ids[j], sel, ud?.pairs ?? []);
    if (!choice) { missing.push([comps[i].name, comps[j].name]); continue; }
    const p = choice.chosen.params;
    const [aij, aji, bij, bji] = choice.flipped ? [p.a_ji, p.a_ij, p.b_ji, p.b_ij] : [p.a_ij, p.a_ji, p.b_ij, p.b_ji];
    a[i][j] = aij; a[j][i] = aji; b[i][j] = bij; b[j][i] = bji;
    alpha[i][j] = alpha[j][i] = p.alpha ?? 0.3;
    pairs.push(describePair(choice, [comps[i].name, comps[j].name]));
  }
  if (missing.length && !cfg.allowMissingPairs) {
    const list = missing.map(m => m.join(" + ")).join("; ");
    throw fail("MISSING_DATA", `No ${model} parameters for: ${list}. Pass allowMissingPairs: true to treat them as ideal, or add parameters to data/binaries.json.`);
  }
  // missing pairs: NRTL with zero tau is ideal; UNIQUAC with tau = 1 keeps only the combinatorial term
  let gammas;
  if (model === "NRTL") { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && !alpha[i][j]) alpha[i][j] = 0.3; gammas = nrtl({ a, b, alpha }); }
  else if (model === "MOD-UNIFAC-2") gammas = modUnifac({ groups: comps.map(c => c.modUnifac.groups), tables: modUnifacTables });
  else if (model === "UNIQUAC") gammas = uniquac({ a, b, r: comps.map(c => c.uniquac.r), q: comps.map(c => c.uniquac.q), qp: comps.map(c => c.uniquac.qp ?? c.uniquac.q) });
  else gammas = () => new Array(n).fill(1);

  const assoc = comps.map(c => (useAssoc && c.association && c.association.type === "dimer") ? c.association : null);
  if (vapourModel !== "ideal" && assoc.some(Boolean)) {
    throw fail("NOT_AVAILABLE", `${comps.filter((_, i) => assoc[i]).map(c => c.name).join(", ")} dimerizes in the vapour (chemical theory); combining it with a ${vapourModel} vapour is not available. Use vapour: "ideal".`);
  }
  const cubicVapour = vapourModel === "ideal" ? null : createCubicVapour(ids, comps, vapourModel, { ...cfg, userData: ud });

  /**
   * Vapour pressures, kPa. cfg.psat can override them (array in kPa, or a function of T). A nonvolatile component
   * has none: NV_PSAT_KPA, far below anything measurable, keeps its K-value finite for the flash (its mole fraction in
   * the vapour stays below 1e-20) while it stays, for every practical purpose, in the liquid.
   */
  const psat = cfg.psat
    ? (typeof cfg.psat === "function" ? cfg.psat : () => cfg.psat.slice())
    : T => comps.map((c, i) => {
      if (nonvolatile[i]) return NV_PSAT_KPA;
      if (!c.vapourPressure) throw fail("MISSING_DATA", noVapourPressureMessage(c));
      return vapourPressure(c.vapourPressure, T) / 1000;
    });

  /**
   * Partial pressures for a liquid x at T.
   * @returns {{P:number, y:number[], gamma:number[]}}  P in kPa, y as apparent (monomer + 2 x dimer) mole fractions
   */
  function equilibrium(x, T) {
    const ps = psat(T), g = gammas(x, T);
    if (cubicVapour) {
      const e = cubicVapour.equilibrium(x, T, g, ps);
      return { P: e.P, y: e.y, gamma: g, phi: e.phi, phiSat: e.phiSat, poynting: e.poynting };
    }
    const app = new Array(n);
    let Ptrue = 0;
    for (let i = 0; i < n; i++) {
      if (assoc[i]) {
        const K = dimerK(assoc[i], T);
        const pm = x[i] * g[i] * monomerPressure(ps[i], K);
        const pd = K * pm * pm;
        Ptrue += pm + pd;
        app[i] = pm + 2 * pd;
      } else {
        const p = x[i] * g[i] * ps[i];
        Ptrue += p; app[i] = p;
      }
    }
    const s = app.reduce((u, v) => u + v, 0);
    return { P: Ptrue, y: app.map(v => v / s), gamma: g };
  }

  const info = {
    components: comps.map((c, i) => ({ id: ids[i], name: c.name, formula: c.formula, Tb_K: c.Tb_K })),
    model, pairs, missingPairs: missing,
    vapour: cubicVapour ? cubicVapour.describe
      : assoc.some(Boolean) ? "chemical theory (dimerization) for " + comps.filter((_, i) => assoc[i]).map(c => c.name).join(", ") : "ideal gas",
    vapourModel,
    ...(cubicVapour ? { vapourPairs: cubicVapour.pairs } : {}),
    // is this the recommended method for these components? (method-advice.js, docs/METHOD_SELECTION.md)
    advice: methodAdvice({ ids, names: comps.map(c => c.name), formulas: comps.map(c => c.formula), model, eos: false }),
    // the user's own data this system uses (proposal 0012): [{ component or pair, what, source }]
    userData: userDataUsed(ids, ud, pairs),
  };

  /**
   * Warnings that apply to a calculation at T (K) and P (kPa): temperatures more than
   * RANGE_MARGIN_K (10 K) outside the data range of a set that carries one (temperature-dependent
   * fits), pressures outside a set's pressure range, and notes on the choice of sets.
   */
  function warnings(T, P) {
    const w = pairWarnings(pairs, T, P, p => `${model} parameters of ${p.pair.join(" + ")}${p.default ? "" : ` (set "${p.set}")`} come`);
    if (P != null && n > 1) w.push(...pressureAdvice({ model, eos: false }, P));
    return cubicVapour ? [...w, ...cubicVapour.warnings(T)] : w;
  }

  // enthalpies need the association enthalpy of a dimerizing acid whether or not the chemical
  // theory is switched on for the phase equilibrium (association: false), as pure() says
  const dimerizing = comps.map(c => !!(c.association && c.association.type === "dimer"));
  /**
   * ln K_i = ln(y_i / x_i) at equilibrium for liquid x and vapour y at T, P (the flash's
   * K-values): ln gamma_i P_i^sat / P, plus, with a cubic vapour, ln phi_i^sat + Poynting -
   * ln phi_i^V(y). Not defined with the acid chemical theory (the flash then uses the bubble
   * pressure of the liquid instead).
   */
  const lnKValues = assoc.some(Boolean) ? null : (x, y, T, P) => {
    const g = gammas(x, T), ps = psat(T);
    if (!cubicVapour) return g.map((gi, i) => Math.log(gi * ps[i] / P));
    const t = cubicVapour.pureTerms(T, ps), st = cubicVapour.vapourState(T, P, y);
    return g.map((gi, i) => {
      let ls = t.lnPhiSat[i], vl = t.vL[i];
      if (Number.isNaN(ls)) {
        if (x[i] > 1e-10) throw failRange("OUT_OF_RANGE", `${comps[i].name} is above its critical temperature (${comps[i].Tc_K} K) at ${T.toFixed(2)} K, so it has no saturated vapour; use model "${vapourModel}" for both phases.`);
        ls = 0; vl = 0;
      }
      return Math.log(gi * ps[i] / P) + ls + vl * (P - ps[i]) * 1000 / (8.314462618 * T) - st.lnPhi[i];
    });
  };

  const phaseMethods = activityPhaseMethods({ ids, comps, n, model, gammas, psat, cubicVapour, assoc: dimerizing, warnings, nonvolatile, userData: ud });
  // melting temperature and enthalpy of fusion (solid-liquid equilibrium, src/equilibrium/sle.js); null: no open data
  const fusion = comps.map(c => (c.fusion && c.fusion.available !== false
    ? { Tm_K: c.fusion.Tm_K, Hfus_J_mol: c.fusion.Hfus_J_mol, tier: c.fusion.tier, source: c.fusion.source } : null));
  return { ids, names: comps.map(c => c.name), n, model, vapour: vapourModel, gammas, psat, equilibrium, lnKValues, info, warnings, fusion,
    nonvolatile, MW: comps.map(c => c.MW), userData: ud, ...phaseMethods };
}
