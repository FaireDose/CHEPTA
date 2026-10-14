/**
 * Components without measured critical constants (proposal 0009, "Engineering basis"): some platform molecules have
 * open measured vapour pressures and liquid properties but no measured Tc and Pc. They are not given estimated
 * constants. Instead:
 *   - activity models (NRTL, UNIQUAC, Modified UNIFAC 2.0, ideal solution) with an ideal-gas vapour use them: those
 *     need only the vapour pressure and the liquid properties;
 *   - Peng-Robinson and SRK, for both phases or for the vapour of an activity model, need Tc, Pc and the acentric
 *     factor, and refuse such a component with the reason;
 *   - the pure-component vapour is an ideal gas (no residual properties), and no critical point bounds the liquid:
 *     the property records' own ranges do.
 * Such a component has Tc_K, Pc_Pa and omega null in components.json and a `critical` marker
 * ({ available: false, searched: [...] }) with the sources searched.
 */
import { fail } from "../util/errors.js";

/** True when the component record has Tc, Pc and the acentric factor. */
export const hasCritical = c => Number.isFinite(c?.Tc_K) && Number.isFinite(c?.Pc_Pa) && Number.isFinite(c?.omega);

/** The critical temperature, or Infinity without one (comparisons "T below Tc" then leave the bound to the records). */
export const criticalT = c => (Number.isFinite(c?.Tc_K) ? c.Tc_K : Infinity);

/** The sentence that says why a component has no critical constants. */
export function noCriticalReason(c) {
  if (c?.class === "nonvolatile") return `${c.name} is nonvolatile in CHEPTA (it stays in the liquid): it has no vapour pressure and no critical constants`;
  const s = c?.critical?.searched;
  return `${c.name} has no measured critical constants in the open sources${s?.length ? ` (searched: ${s.join("; ")})` : ""}`;
}

/** Throws NOT_AVAILABLE when one of the components has no critical constants; `what` names the model that needs them. */
export function requireCritical(comps, what) {
  const missing = comps.filter(c => !hasCritical(c));
  if (!missing.length) return;
  throw fail("NOT_AVAILABLE", `${missing.map(noCriticalReason).join(". ")}, so ${what} cannot be used: it needs Tc, Pc and ` +
    "the acentric factor. Use an activity model (NRTL, UNIQUAC, Mod. UNIFAC 2.0 or ideal solution) with an ideal-gas vapour.");
}
