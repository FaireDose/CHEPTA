/**
 * The MHV1 mixing rule in its PSRK form ("SRK/PR + gE (MHV1)"; proposal 0018, reopened by the maintainer on 2026-11-06:
 * "yes reopen 0018"): the energy parameter of a cubic equation of state from an excess Gibbs energy model (NRTL), so a
 * polar liquid with dissolved gases is described by its activity coefficients at any pressure.
 *
 * Equations, as implemented and documented in the open-source thermo library (MIT; thermo.eos_mix.PSRKMixingRules,
 * thermo 0.6.1, https://thermo.readthedocs.io/thermo.eos_mix.html):
 *
 *   alpha = a / (b R T) = sum_i x_i a_i / (b_i R T) + (1 / A) (g^E / (R T) + sum_i x_i ln(b / b_i)),   b = sum_i x_i b_i
 *
 * thermo takes A = ln(u / (u + 1)) with u = 1.1, the PSRK value for SRK. The constant is the coefficient of alpha in
 * the residual Gibbs energy of the cubic at the reference volume v = u b. For the generic cubic it is
 *   A = -ln((u + d1) / (u + d2)) / (d1 - d2),
 * which for SRK (d1 = 1, d2 = 0) gives thermo's ln(1.1 / 2.1) = -0.64663. For Peng-Robinson the same expression is
 * used with its own d1 and d2 (CHEPTA's derivation, -0.57771; there is no PSRK constant for PR to take from a source).
 *
 * Partial molar quantity for the fugacity coefficients (by differentiation of n alpha):
 *   abar_i = d(n alpha)/dn_i = a_i / (b_i R T) + (1 / A) (ln gamma_i + ln(b / b_i) + b_i / b - 1)
 * which cubic.js receives as sum_j x_j a_ij = (a / 2) (abar_i / alpha + b_i / b), so that its
 *   ln phi_i = b_i/b (Z - 1) - ln(Z - B) - A/(B (d1 - d2)) (2 sum_j x_j a_ij / a - b_i/b) L
 * equals b_i/b (Z - 1) - ln(Z - B) - abar_i L / (d1 - d2).
 * Temperature derivatives (for enthalpies): with h(T) = g^E / R = T sum_i x_i ln gamma_i,
 *   a = b sum_i x_i a_i / b_i + (b R / A) (h + T sum_i x_i ln(b / b_i)),
 *   da/dT = b sum_i x_i a_i' / b_i + (b R / A) (h' + sum_i x_i ln(b / b_i)),
 *   d2a/dT2 = b sum_i x_i a_i'' / b_i + (b R / A) h'';
 * h' and h'' by central differences of the activity model (step 0.01 K).
 *
 * The independent checks: validation/python/reference_mhv1.py (CHEPTA's Python cubic with this rule, the fugacity
 * coefficients by numerical differentiation of n A_res, thermo's NRTL for g^E) and, for SRK, thermo's PSRK class with
 * the same NRTL parameters (test/eos-mhv1.test.js).
 */

const R = 8.314462618;
/** The reduced reference volume u = v / b of PSRK (thermo.eos_mix.PSRKMixingRules.u). */
export const MHV1_U = 1.1;
/** A for a cubic with constants d1, d2 at v = u b. */
export const mhv1A = (d1, d2, u = MHV1_U) => -Math.log((u + d1) / (u + d2)) / (d1 - d2);
const H_STEP = 0.01;

/**
 * The MHV1 mixing function for cubicEos: (T, x) -> { a, da, d2a, b, sumA }.
 * @param {object} ctx  { n, d1, d2, bi, sqrtA } from cubic.js
 * @param {(x:number[], T:number)=>number[]} gammas  the activity model's activity coefficients
 */
export function mhv1Mix(ctx, gammas) {
  const { n, d1, d2, bi, sqrtA } = ctx;
  const A = mhv1A(d1, d2);
  const h = (x, T) => { const g = gammas(x, T); let s = 0; for (let i = 0; i < n; i++) if (x[i] > 0) s += x[i] * Math.log(g[i]); return T * s; };
  return function mix(T, x) {
    const { s, s1, s2 } = sqrtA(T);
    let b = 0;
    for (let i = 0; i < n; i++) b += x[i] * bi[i];
    const RT = R * T;
    const gam = gammas(x, T);
    let pure = 0, dpure = 0, d2pure = 0, L = 0, gRT = 0;
    const ai = new Array(n);
    for (let i = 0; i < n; i++) {
      ai[i] = s[i] * s[i];
      if (!(x[i] > 0)) continue;
      pure += x[i] * ai[i] / bi[i];
      dpure += x[i] * 2 * s[i] * s1[i] / bi[i];
      d2pure += x[i] * 2 * (s1[i] * s1[i] + s[i] * s2[i]) / bi[i];
      L += x[i] * Math.log(b / bi[i]);
      gRT += x[i] * Math.log(gam[i]);
    }
    const hT = T * gRT;
    const hp = h(x, T + H_STEP), hm = h(x, T - H_STEP);
    const dh = (hp - hm) / (2 * H_STEP), d2h = (hp - 2 * hT + hm) / (H_STEP * H_STEP);
    const a = b * pure + (b * R / A) * (hT + T * L);
    const da = b * dpure + (b * R / A) * (dh + L);
    const d2a = b * d2pure + (b * R / A) * d2h;
    const alpha = a / (b * RT);
    const sumA = new Array(n);
    for (let i = 0; i < n; i++) {
      const abar = ai[i] / (bi[i] * RT) + (Math.log(gam[i]) + Math.log(b / bi[i]) + bi[i] / b - 1) / A;
      sumA[i] = (a / 2) * (abar / alpha + bi[i] / b);
    }
    return { a, da, d2a, b, sumA };
  };
}
