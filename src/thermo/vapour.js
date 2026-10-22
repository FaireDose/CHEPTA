/**
 * Vapour-phase models.
 *
 * Components are ideal gases unless they carry an `association` record of type
 * "dimer". Those follow the chemical theory: the vapour holds monomers A and
 * dimers A2 in equilibrium, p_A2 = K p_A^2. Cross-dimers between different
 * acids are not modelled.
 */
import { fail } from "../util/errors.js";

const MMHG_PER_KPA = 7.50062;

/**
 * Dimerization constant in 1/kPa.
 * @param {object} assoc  component `association` record
 * @param {number} T      K
 */
export function dimerK(assoc, T) {
  const K = Math.pow(10, assoc.log10K.A + assoc.log10K.B / T); // 1/mmHg
  if (assoc.K_unit !== "1/mmHg") throw fail("MISSING_DATA", `Unsupported K unit ${assoc.K_unit}`);
  return K * MMHG_PER_KPA;
}

/**
 * Monomer partial pressure of a pure associating vapour at total pressure P.
 * P = p1 + K p1^2  ->  p1 = (-1 + sqrt(1 + 4 K P)) / (2 K)
 * @param {number} P  kPa
 * @param {number} K  1/kPa
 */
export function monomerPressure(P, K) {
  return (-1 + Math.sqrt(1 + 4 * K * P)) / (2 * K);
}

/**
 * Enthalpy of dimerization, J per mol of dimer formed (2 A -> A2, ideal gas), from the temperature dependence of the
 * dimerization constant, log10 K = A + B/T (van 't Hoff, d ln K / d(1/T) = -ΔH/R): ΔH = -R ln(10) B, the same at
 * every temperature. Rawlings and Ekerdt, Chemical Reactor Analysis and Design Fundamentals, 2nd ed., eqn 3.47, p. 78.
 * @param {object} assoc  component `association` record
 */
export function dimerEnthalpy(assoc) {
  return -8.314462618 * Math.LN10 * assoc.log10K.B;
}

/**
 * The dimers of a vapour mixture at T and P (chemical theory, ideal gas of monomers and dimers, no cross-dimers):
 * per mole of the apparent composition z (each dimer counted as two monomers), xi_i moles of dimer of acid i and
 * N = 1 - Σ xi_i moles of true species, from xi_i N = K_i P (z_i - 2 xi_i)^2. Solved by substitution on N, each
 * xi_i from its quadratic (the root in [0, z_i/2]).
 * @param {number[]} z    apparent mole fractions
 * @param {(number|null)[]} K  dimerization constants in 1/kPa, null for a component that does not dimerize
 * @param {number} P      kPa
 * @returns {{xi: number[], N: number}}
 */
export function dimerSplit(z, K, P) {
  const xi = z.map(() => 0);
  if (!K.some((k, i) => k && z[i] > 0)) return { xi, N: 1 };
  let N = 1;
  for (let it = 0; it < 200; it++) {
    let s = 0;
    for (let i = 0; i < z.length; i++) {
      if (!K[i] || !(z[i] > 0)) continue;
      const a = 4 * K[i] * P, b = a * z[i] + N, c = K[i] * P * z[i] * z[i];
      xi[i] = 2 * c / (b + Math.sqrt(Math.max(0, b * b - 4 * a * c)));
      s += xi[i];
    }
    const Nn = 1 - s;
    if (Math.abs(Nn - N) < 1e-15) return { xi, N: Nn };
    N = Nn;
  }
  throw fail("NO_CONVERGENCE", `Dimer equilibrium of the vapour did not converge at ${P} kPa.`);
}

/**
 * Enthalpy of a pure dimerizing vapour at T and P against its ideal-gas monomer, J per mol of acid (apparent):
 * the dimers formed, p_D / (p_M + 2 p_D), times the dimerization enthalpy.
 */
export function pureDimerEnthalpy(assoc, T, P) {
  const K = dimerK(assoc, T), pm = monomerPressure(P, K), pd = K * pm * pm;
  return pd / (pm + 2 * pd) * dimerEnthalpy(assoc);
}
