/**
 * The shortcut column (proposal 0015, Part I, section 1; milestone M1): the method of Fenske, Underwood and Gilliland
 * for a light and a heavy key, at constant relative volatility and constant molar overflow.
 *
 * The equations, as the open source code of DWSIM documents them (DWSIM, GPL-3.0, file
 * DWSIM.UnitOperations/UnitOperations/ShortcutColumn.vb, branch "windows",
 * https://github.com/DanWBR/dwsim/blob/windows/DWSIM.UnitOperations/UnitOperations/ShortcutColumn.vb, read
 * 2026-10-29). The original articles (Fenske 1932, Underwood 1948, Gilliland 1940, Eduljee 1975) are paywalled and not
 * used. Written anew from the equations (not translated from DWSIM's code), and checked against the independent
 * reference validation/python/reference_fug.py (test/columns-shortcut.test.js):
 *
 *   Fenske, minimum stages at total reflux (DWSIM: "Nmin calculation (Fenske)"):
 *       N_min = ln[(d_LK / b_LK) (b_HK / d_HK)] / ln(alpha_LK / alpha_HK)
 *   Fenske, the distribution of a non-key i (DWSIM: "calculate nonkeys distribution"):
 *       d_i / b_i = (d_HK / b_HK) (alpha_i / alpha_HK)^N_min
 *   Underwood, minimum reflux (DWSIM: "calculate minimum reflux by Underwood's method", rminfunc), the root theta
 *   between alpha_HK and alpha_LK:
 *       sum_i alpha_i z_i / (alpha_i - theta) = 1 - q,      R_min = sum_i alpha_i x_D,i / (alpha_i - theta) - 1
 *   Gilliland's correlation in Eduljee's form (DWSIM: "actual number of stages by Gilliland's method"):
 *       X = (R - R_min) / (R + 1),   Y = 0.75 (1 - X^0.5668),   N = (Y + N_min) / (1 - Y)
 *   The feed stage (DWSIM: "optimum feed stage by Fenske's method"):
 *       N_min,S = ln[(z_LK / z_HK) (x_B,HK / x_B,LK)] / ln(alpha_LK / alpha_HK),   N_S = N_min,S N / N_min
 *   The feed's liquid fraction (DWSIM: q = 1 + (H_bub - H) / (H_dew - H_bub), the same as):
 *       q = (H_dew - H_F) / (H_dew - H_bub)     (saturated vapour and liquid of the feed's composition at the column's P)
 *   The duties (DWSIM: "temperatures and heat duties"): total condenser Q_C = (L + D)(h_V,sat - h_L,sat) of the
 *   distillate's composition; partial condenser Q_C = L (h_V,sat - h_L,sat); reboiler from the energy balance,
 *   Q_R = D h_D + B h_B + Q_C - F h_F.
 *   The section flows by constant molar overflow: L = R D, V = (R + 1) D above the feed; L' = L + q F,
 *   V' = V - (1 - q) F below it.
 *
 * Conventions (validation/data/columns/README.md): alpha relative to the heavy key; N and N_min count equilibrium
 * stages, the partial reboiler included, a total condenser not (a partial condenser is an equilibrium stage). Stages
 * are numbered from the top, 1 the condenser.
 *
 * Where it holds, and where it refuses (fail loudly):
 *  - the relative volatilities are taken at the feed's bubble point (DWSIM takes the K-values at the feed's
 *    conditions); the method assumes they are constant. The keys' relative volatility is also evaluated at the top
 *    (the distillate's bubble point) and the bottom (the bottoms' bubble point): where it falls to 1 or below, the keys
 *    form an azeotrope (or a pinch) inside the column and no column reaches the recoveries: refused (BAD_INPUT); where
 *    it changes by more than VOLATILITY_TOLERANCE between the top, the feed and the bottom, a VOLATILITY_VARIES
 *    warning says by how much (the 20 % is this project's choice, not a published rule);
 *  - a reflux ratio at or below Underwood's minimum: refused, naming R_min (Gilliland's X would be zero or negative);
 *  - a boil-up of zero or less (V' <= 0): refused, naming the specifications to change;
 *  - a non-key whose volatility lies between the keys: Underwood then needs several roots, not built: refused
 *    (NOT_AVAILABLE; choose adjacent keys);
 *  - recoveries that give N_min <= 0 (the light key is not enriched in the distillate): refused.
 *
 * Units: whatever unit the flows come in (the block uses kmol/h); T in K, P in kPa.
 */
import { fail } from "../../util/errors.js";

/** The relative change of the keys' volatility, between the top, the feed and the bottom, above which the column warns. */
export const VOLATILITY_TOLERANCE = 0.2;

const sum = v => v.reduce((a, b) => a + b, 0);
const fmt = v => +Number(v).toPrecision(6);

/**
 * Underwood's root between alpha_HK and alpha_LK of sum alpha_i z_i / (alpha_i - theta) = 1 - q, by bisection to
 * rounding (the function rises monotonically between two adjacent poles). Components with z_i = 0 do not enter.
 */
export function underwoodTheta(alpha, z, q, aLK, aHK) {
  const f = t => sum(alpha.map((a, i) => (z[i] > 0 ? a * z[i] / (a - t) : 0))) - (1 - q);
  let lo = aHK, hi = aLK;
  for (let k = 0; k < 400; k++) {
    const mid = 0.5 * (lo + hi);
    if (mid <= lo || mid >= hi) break;
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  // the end of the interval with the smaller residual
  return Math.abs(f(lo)) <= Math.abs(f(hi)) ? lo : hi;
}

/**
 * The shortcut column on numbers alone: relative volatilities `alpha`, feed `F` of composition `z` and liquid
 * fraction `q`, the keys `lk` and `hk` (indices), the recoveries `recoveryLK` (of the light key's feed, into the
 * distillate) and `recoveryHK` (of the heavy key's feed, into the bottoms), and `R` or `refluxOverMinimum`.
 * Names in messages: `names` (optional). Throws BAD_INPUT or NOT_AVAILABLE, saying why (see the file header).
 */
export function fug({ alpha, z, F, q, lk, hk, recoveryLK, recoveryHK, R = null, refluxOverMinimum = null, names = null }) {
  const n = z.length, name = i => names?.[i] ?? `component ${i + 1}`;
  const aLK = alpha[lk], aHK = alpha[hk];
  if (!(aLK > aHK)) throw fail("BAD_INPUT", `Column: the light key (${name(lk)}) must be more volatile than the heavy key (${name(hk)}) at the feed; their relative volatility is ${fmt(aLK / aHK)}.`);
  if (!(recoveryLK > 0 && recoveryLK < 1 && recoveryHK > 0 && recoveryHK < 1)) throw fail("BAD_INPUT", "Column: each key's recovery must be between 0 and 1 (a recovery of 1 needs infinitely many stages).");
  const mid = alpha.map((a, i) => i).filter(i => i !== lk && i !== hk && z[i] > 0 && alpha[i] > aHK && alpha[i] < aLK);
  if (mid.length) {
    throw fail("NOT_AVAILABLE", `Column: ${mid.map(name).join(", ")} ${mid.length > 1 ? "are" : "is"} between the keys in volatility; the shortcut with a component distributed between the keys (Underwood's several roots) is not built. Choose adjacent keys (${name(lk)} and ${name(hk)} are not).`);
  }
  const f = z.map(v => F * v);
  const d = new Array(n).fill(0), b = new Array(n).fill(0);
  d[lk] = recoveryLK * f[lk]; b[lk] = f[lk] - d[lk];
  b[hk] = recoveryHK * f[hk]; d[hk] = f[hk] - b[hk];
  const Nmin = Math.log((d[lk] / b[lk]) * (b[hk] / d[hk])) / Math.log(aLK / aHK);
  if (!(Nmin > 0)) throw fail("BAD_INPUT", `Column: these recoveries do not separate the keys (Fenske's minimum number of stages is ${fmt(Nmin)}): the recoveries of the light key in the distillate and of the heavy key in the bottoms must add up to more than 1.`);
  for (let i = 0; i < n; i++) {
    if (i === lk || i === hk) continue;
    const r = (d[hk] / b[hk]) * (alpha[i] / aHK) ** Nmin;   // d_i / b_i by Fenske
    if (r === Infinity) { d[i] = f[i]; b[i] = 0; } else { d[i] = f[i] * r / (1 + r); b[i] = f[i] / (1 + r); }
  }
  const D = sum(d), B = sum(b);
  const xD = d.map(v => v / D), xB = b.map(v => v / B);
  const theta = underwoodTheta(alpha, z, q, aLK, aHK);
  const Rmin = sum(alpha.map((a, i) => (xD[i] > 0 ? a * xD[i] / (a - theta) : 0))) - 1;
  const Ruse = R ?? refluxOverMinimum * Rmin;
  if (!(Ruse > Rmin)) {
    throw fail("BAD_INPUT", `Column: the reflux ratio ${fmt(Ruse)} is at or below the minimum reflux ratio ${fmt(Rmin)} (Underwood): no number of stages reaches the specified recoveries. Raise the reflux ratio above ${fmt(Rmin)}, or ask for lower recoveries.`,
      { R: Ruse, R_min: Rmin });
  }
  const X = (Ruse - Rmin) / (Ruse + 1);
  const Y = 0.75 * (1 - X ** 0.5668);
  const N = (Y + Nmin) / (1 - Y);
  const NminS = Math.log((z[lk] / z[hk]) * (xB[hk] / xB[lk])) / Math.log(aLK / aHK);
  const NS = NminS * N / Nmin;
  return { D, B, d, b, x_D: xD, x_B: xB, N_min: Nmin, theta, R_min: Rmin, R: Ruse, gilliland_X: X, gilliland_Y: Y, N,
    N_min_stripping: NminS, N_below_feed: NS };
}

/**
 * The boil-up below the feed by constant molar overflow, V' = (R + 1) D - (1 - q) F; refused when it is zero or
 * negative (no column has these specifications: validation/data/columns/E2-negative-boilup.json).
 */
export function boilup({ R, D, F, q }) {
  const V = (R + 1) * D, Vs = V - (1 - q) * F;
  if (!(Vs > 0)) {
    throw fail("BAD_INPUT", `Column: the boil-up below the feed would be ${fmt(Vs)} (the vapour above the feed, ${fmt(V)}, is less than the feed's own vapour, ${fmt((1 - q) * F)}): no column has these specifications. Take a larger distillate or a larger reflux ratio (or a feed with less vapour).`,
      { V, V_below_feed: Vs });
  }
  return { L: R * D, V, L_below_feed: R * D + q * F, V_below_feed: Vs };
}

/** Whole stages from Gilliland's N: { stages (numbered from the top, a total condenser counted), feed_stage }. */
export function wholeStages(N, NS, totalCondenser) {
  const equilibrium = Math.ceil(N - 1e-9);
  const stages = equilibrium + (totalCondenser ? 1 : 0);
  const feed = Math.min(stages - 1, Math.max(2, stages - Math.round(NS) + 1));
  return { equilibrium_stages: equilibrium, stages, feed_stage: feed };
}
