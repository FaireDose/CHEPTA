/**
 * Is the property method the one recommended for these components and conditions?
 * The rules of docs/METHOD_SELECTION.md: the decision trees of E. Carlson and the heuristics that
 * follow them, as given in the Northwestern University Chemical Process Design Open Textbook, page
 * "Property package" (https://processdesign.mccormick.northwestern.edu/index.php/Property_package,
 * free to read):
 *   - nonpolar real components (hydrocarbons, light gases): Peng-Robinson or SRK, any pressure;
 *   - polar non-electrolytes below 10 bar: an activity model (NRTL, UNIQUAC); above 10 bar PSRK or
 *     a cubic equation with Wong-Sandler / MHV2 mixing rules (not in CHEPTA yet).
 * The advice is a note on the results, never a refusal: a person may have reasons to compare
 * methods, and a test may use another method on purpose.
 */

// light gases handled with cubic equations of state in gas processing (the Cavett problem, Rosen 2005,
// uses Peng-Robinson with them); every other component with O, N, S, P or a halogen is counted as polar
export const EOS_GASES = new Set(["nitrogen", "carbon-dioxide", "hydrogen-sulfide", "carbon-monoxide", "oxygen", "argon",
  "hydrogen", "nitrous-oxide", "sulfur-dioxide", "ammonia"]);
const POLAR_ELEMENTS = new Set(["O", "N", "S", "P", "F", "Cl", "Br", "I"]);
const P_MAX_ACTIVITY_KPA = 1000;   // 10 bar

/** Polar for the choice of method: a heteroatom in the formula, except the light gases above. */
export function isPolar(id, formula) {
  if (EOS_GASES.has(id)) return false;
  return (String(formula ?? "").match(/[A-Z][a-z]?/g) ?? []).some(e => POLAR_ELEMENTS.has(e));
}

const REF = "docs/METHOD_SELECTION.md";

/**
 * Notes on the method for a system, independent of the conditions.
 * @param {{ids:string[], names:string[], formulas:string[], model:string, eos:boolean}} s
 * @returns {string[]}
 */
export function methodAdvice({ ids, names, formulas, model, eos }) {
  const polar = ids.map((id, i) => (isPolar(id, formulas[i]) ? names[i] : null)).filter(Boolean);
  const gases = ids.map((id, i) => (EOS_GASES.has(id) ? names[i] : null)).filter(Boolean);
  if (eos && polar.length && gases.length) {
    // light gases with polar components (methanol from syngas, hydrogenations): the equation of state is the method for
    // the gas-phase reactor and the high-pressure loop, which no activity model can describe; the polar liquid alone
    // (its distillation) is what an activity model would do better
    return [`${model} is the method here: ${gases.join(", ")} ${gases.length === 1 ? "is a light gas" : "are light gases"}, which only an equation of state describes (gas-phase reactors and high-pressure loops are simulated so). For a liquid of the polar components alone (${polar.join(", ")}) below about 10 bar, such as their distillation, an activity model (NRTL or UNIQUAC) would be more accurate (${REF}).`];
  }
  if (eos && polar.length && ids.length > 1) {
    return [`${model} for a mixture with polar components (${polar.join(", ")}) is not the recommended method for their liquid: below about 10 bar an activity model (NRTL or UNIQUAC) describes it better; above 10 bar PSRK or a cubic equation with Wong-Sandler or MHV2 mixing rules, which CHEPTA does not have yet (${REF}).`];
  }
  return [];
}

/** Notes on the method at a pressure (kPa): an activity model above about 10 bar. */
export function pressureAdvice({ model, eos }, P) {
  if (!eos && model !== "ideal" && P > P_MAX_ACTIVITY_KPA) {
    return [`${model} at ${P.toPrecision(4)} kPa: above about 10 bar an activity model is outside its recommended range for polar mixtures; PSRK or a cubic equation with Wong-Sandler or MHV2 mixing rules would be the choice (not in CHEPTA yet; ${REF}).`];
  }
  return [];
}
