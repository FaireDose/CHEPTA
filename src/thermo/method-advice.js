/**
 * Is the property method the one recommended for these components and conditions?
 * The rules of docs/METHOD_SELECTION.md: the decision trees of E. Carlson and the heuristics that
 * follow them, as given in the Northwestern University Chemical Process Design Open Textbook, page
 * "Property package" (https://processdesign.mccormick.northwestern.edu/index.php/Property_package,
 * free to read):
 *   - nonpolar real components (hydrocarbons, light gases): Peng-Robinson or SRK, any pressure;
 *   - polar non-electrolytes below 10 bar: an activity model (NRTL, UNIQUAC); above 10 bar PSRK or
 *     a cubic equation with Wong-Sandler / MHV2 mixing rules. CHEPTA's rule of that kind is MHV1 in the PSRK form
 *     ("PR + gE (MHV1)", "SRK + gE (MHV1)", proposal 0018); EoS/gE rules are a k_ij(T, z) (Privat and Jaubert, Fluid
 *     Phase Equilib. 567 (2023) 113697, open access, eqs. 25-27). Above 10 bar, a light gas with a polar liquid gets
 *     MHV1 recommended only where the engine would run it (mhv1Advice: the caller asks the engine, gEMatrices).
 * The advice is a note on the results, never a refusal: a person may have reasons to compare
 * methods, and a test may use another method on purpose.
 */

// light gases handled with cubic equations of state in gas processing (the Cavett problem, Rosen 2005,
// uses Peng-Robinson with them); every other component with O, N, S, P or a halogen is counted as polar
export const EOS_GASES = new Set(["nitrogen", "carbon-dioxide", "hydrogen-sulfide", "carbon-monoxide", "oxygen", "argon",
  "hydrogen", "nitrous-oxide", "sulfur-dioxide", "ammonia"]);
const POLAR_ELEMENTS = new Set(["O", "N", "S", "P", "F", "Cl", "Br", "I"]);
export const P_MAX_ACTIVITY_KPA = 1000;   // 10 bar (rule 4 of docs/METHOD_SELECTION.md)
/** The light gases above and methane: the gases of the MHV1 rule's refusal (eos/system.js) and of its fits. */
export const RULE_GASES = new Set([...EOS_GASES, "methane"]);

/** Polar for the choice of method: a heteroatom in the formula, except the light gases above. */
export function isPolar(id, formula) {
  if (EOS_GASES.has(id)) return false;
  return (String(formula ?? "").match(/[A-Z][a-z]?/g) ?? []).some(e => POLAR_ELEMENTS.has(e));
}

const REF = "docs/METHOD_SELECTION.md";

/**
 * Notes on the method for a system, independent of the conditions.
 * @param {{ids:string[], names:string[], formulas:string[], model:string, eos:boolean, mixing?:string}} s
 * @returns {string[]}
 */
export function methodAdvice({ ids, names, formulas, model, eos, mixing }) {
  const method = mixing ? `${model} + gE (${mixing})` : model;
  const polar = ids.map((id, i) => (isPolar(id, formulas[i]) ? names[i] : null)).filter(Boolean);
  const gases = ids.map((id, i) => (EOS_GASES.has(id) ? names[i] : null)).filter(Boolean);
  if (eos && polar.length && gases.length) {
    // light gases with polar components (methanol from syngas, hydrogenations): the equation of state is the method for
    // the gas-phase reactor and the high-pressure loop, which no activity model can describe; the polar liquid alone
    // (its distillation) is what an activity model would do better
    return [`${method} is the method here: ${gases.join(", ")} ${gases.length === 1 ? "is a light gas" : "are light gases"}, which only an equation of state describes (gas-phase reactors and high-pressure loops are simulated so). For a liquid of the polar components alone (${polar.join(", ")}) below about 10 bar, such as their distillation, an activity model (NRTL or UNIQUAC) would be more accurate (${REF}).`];
  }
  if (eos && polar.length && ids.length > 1) {
    if (mixing) return [`${method} for a mixture with polar components (${polar.join(", ")}): below about 10 bar an activity model (NRTL or UNIQUAC) describes their liquid better; above 10 bar a cubic equation with a gE mixing rule, such as this one, is the recommended kind (${REF}).`];
    return [`${model} for a mixture with polar components (${polar.join(", ")}) is not the recommended method for their liquid: below about 10 bar an activity model (NRTL or UNIQUAC) describes it better; above 10 bar a cubic equation with a gE mixing rule (PSRK, Wong-Sandler, MHV2), in CHEPTA "PR + gE (MHV1)" or "SRK + gE (MHV1)" (mixing: "MHV1"), which takes the pairs' NRTL sets into the equation of state (${REF}).`];
  }
  return [];
}

/** The pairs of a light gas (or methane) with a polar component, as [gas, polar] names. */
export function gasPolarPairs(ids, names, formulas) {
  const out = [];
  for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) {
    if (i !== j && RULE_GASES.has(ids[i]) && isPolar(ids[j], formulas[j])) out.push([names[i], names[j]]);
  }
  return out;
}

const mhv1Name = m => `${m} + gE (MHV1)`;
const sameNames = (a, b) => a.length === 2 && ((a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]));

/** Where each gas + polar pair's NRTL set in the rule comes from, in a few words. */
function pairSources(gp, avail) {
  return gp.map(([g, l]) => {
    const p = avail.pairs.find(q => sameNames(q.pair, [g, l]));
    const from = !p ? "no set" : p.set === "mhv1-fitted" ? `fitted inside the rule${p.quality_warning ? ", with a fit-quality warning" : ""}`
      : p.tier === "none" ? "no set (g^E = 0)" : `the databank's NRTL set${p.tier ? ` (tier ${p.tier})` : ""}, fitted at low pressure`;
    return `${g} + ${l}: ${from}`;
  }).join("; ");
}

/**
 * Above about 10 bar, the MHV1 rule for a light gas with a polar liquid (rule 4 of docs/METHOD_SELECTION.md), recommended
 * only where the engine would run it. avail: { PR, SRK }, each { ok: true, pairs } (the pairs gEMatrices gives) or
 * { ok: false, reason } (the engine's refusal), from the caller (eos/system.js mhv1Availability).
 * @param {{model:string, eos:boolean, mixing?:string|null, gasPolar:string[][], avail:()=>object}} s
 * @param {number} P kPa
 */
export function mhv1Advice({ model, eos, mixing, gasPolar, avail }, P) {
  if (!(P > P_MAX_ACTIVITY_KPA) || mixing || !gasPolar.length) return [];
  const a = avail();
  const order = eos ? [model, model === "PR" ? "SRK" : "PR"] : ["PR", "SRK"];
  const ok = order.filter(m => a[m]?.ok);
  const pairsText = gasPolar.map(p => p.join(" + ")).join(", ");
  // the first sentence is the warning's one-line title in the interface (src/ui/warning.js summaryOf), so it says the advice
  const why = `${eos ? model : modelName(model)} at ${P.toPrecision(4)} kPa, a light gas with a polar liquid (${pairsText}): above about 10 bar the method guide recommends a cubic equation with a gE mixing rule (rule 4 of ${REF}).`;
  if (!ok.length) {
    return [`Above 10 bar the gE rule (MHV1) would suit, but it has no set here. ${why} CHEPTA's rule of that kind would be refused: ${order.map(m => a[m]?.reason).filter(Boolean)[0] ?? "no NRTL set for the pair"} So ${eos ? `${model} with its k_ij` : "this method"} stays the one that runs; the rule needs an NRTL set for each such pair (docs/DATA_WANTED.md).`];
  }
  const best = ok[0];
  const refusedOwn = eos && best !== model ? ` ${a[model].reason}` : "";
  return [`Above 10 bar, ${mhv1Name(best)} is recommended here. ${why} In CHEPTA that is "${mhv1Name(best)}" (model "${best}", mixing: "MHV1"), which has NRTL parameters for these pairs: ${pairSources(gasPolar, a[best])}.${refusedOwn} This calculation uses ${eos ? `${model} with k_ij` : modelName(model)}.`];
}

const modelName = m => (m === "MOD-UNIFAC-2" ? "Mod. UNIFAC 2.0" : m === "WILSON" ? "Wilson" : m);

/** Notes on the method at a pressure (kPa): an activity model above about 10 bar. */
export function pressureAdvice({ model, eos, gasPolar = [] }, P) {
  if (!eos && model !== "ideal" && P > P_MAX_ACTIVITY_KPA) {
    // with a light gas and a polar liquid, mhv1Advice says whether CHEPTA's gE rule would run, so it is not named here
    const chepta = gasPolar.length ? "" : `; in CHEPTA "PR + gE (MHV1)" and "SRK + gE (MHV1)", proposal 0018`;
    return [`${modelName(model)} at ${P.toPrecision(4)} kPa: above about 10 bar an activity model is outside its recommended range for polar mixtures; a cubic equation with a gE mixing rule would be the choice (PSRK, Wong-Sandler, MHV2${chepta}; ${REF}).`];
  }
  return [];
}
