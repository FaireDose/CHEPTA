/**
 * Temperature correlations for pure-component properties, in the DIPPR equation forms.
 *
 * The equation forms (not any coefficients) are those documented openly in:
 * - ChemSep book and pure-component database documentation, "Temperature correlations"
 *   (Kooijman & Taylor; http://www.chemsep.org/, Artistic License 2.0), equations 100-107.
 * - The open-source `chemicals` library (MIT), module chemicals.dippr, which implements
 *   EQ100, EQ101, EQ102, EQ104, EQ105, EQ106 and EQ107 with the same symbols.
 *
 * A record looks like
 *   { equation: "DIPPR105", coefficients: { A, B, C, D }, units: "kg/m3",
 *     Tmin_K, Tmax_K, tier, source: { ... } }
 * Coefficients that are not given are 0. DIPPR106 also needs `Tc_K` in the record.
 * The value is returned in the record's `units`; pure.js converts to engine units.
 */
import { fail, failRange } from "../util/errors.js";
import { strictRanges, noteExtrapolation } from "../util/ranges.js";

const EQUATIONS = {
  // Y = A + B T + C T^2 + D T^3 + E T^4
  DIPPR100: (T, c) => c.A + T * (c.B + T * (c.C + T * (c.D + T * c.E))),
  // Y = exp(A + B/T + C ln T + D T^E)
  DIPPR101: (T, c) => Math.exp(c.A + c.B / T + c.C * Math.log(T) + c.D * Math.pow(T, c.E)),
  // Y = A T^B / (1 + C/T + D/T^2)
  DIPPR102: (T, c) => c.A * Math.pow(T, c.B) / (1 + c.C / T + c.D / (T * T)),
  // Y = A + B/T + C/T^3 + D/T^8 + E/T^9
  DIPPR104: (T, c) => c.A + c.B / T + c.C / T ** 3 + c.D / T ** 8 + c.E / T ** 9,
  // Y = A / B^(1 + (1 - T/C)^D)
  // (1 - T/C) is clamped at 0 within rounding of C: a record may end at T = C, and its end point computed in floating
  // point can exceed C by 1e-16 relative, where the power of a negative number would give NaN
  DIPPR105: (T, c) => c.A / Math.pow(c.B, 1 + Math.pow(T > c.C && T - c.C <= 1e-9 * c.C ? 0 : 1 - T / c.C, c.D)),
  // Y = A (1 - Tr)^(B + C Tr + D Tr^2 + E Tr^3),  Tr = T/Tc
  DIPPR106: (T, c, Tc) => {
    const r = T / Tc;
    return c.A * Math.pow(1 - r, c.B + r * (c.C + r * (c.D + r * c.E)));
  },
  // Y = A + B [(C/T)/sinh(C/T)]^2 + D [(E/T)/cosh(E/T)]^2   (Aly-Lee)
  DIPPR107: (T, c) => {
    const s = (c.C / T) / Math.sinh(c.C / T);
    const h = (c.E / T) / Math.cosh(c.E / T);
    return c.A + c.B * s * s + c.D * h * h;
  },
};

export const CORRELATION_EQUATIONS = Object.keys(EQUATIONS);

/**
 * How a record of each kind is continued outside its range (the maintainer, 2026-11-13;
 * docs/decisions/2026-11-13-03-extrapolation-policy.md), by the units it is stored in:
 * - "Pa" (vapour pressure): the record's own equation where it stays finite and rises with T between the record's end
 *   and T; else ln P linear in 1/T from the end, through its value and slope there (Clausius-Clapeyron);
 * - "Pa s" (liquid viscosity): ln mu linear in 1/T from the end (value and slope; Arrhenius); a vapour viscosity
 *   (opts.kind "vapourViscosity") linear from the end, as thermo does;
 * - "kg/m3", "J/mol", "N/m" (liquid density, heat of vaporization, surface tension): a DIPPR105 or DIPPR106 record is
 *   its own equation (it is built to reach the critical point); any other form linear from the end;
 * - an ideal-gas heat capacity in the Aly-Lee form (DIPPR107): its own equation, whose form follows the vibrational
 *   heat capacity of the molecule and stays bounded (on the equilibria of test/equilibrium-reactor.test.js it agrees
 *   with Cantera's NASA polynomials at 550 K for ethylene, whose record ends at 450 K, where a linear continuation
 *   does not, by 3e-4 in a mole fraction; a refinement of the maintainer's "linear" for this one form);
 * - every other unit (heat capacities, thermal conductivities): linear from the end (value and slope).
 * The forms follow the default extrapolations of the open thermo library (version 0.6.1, MIT licence,
 * github.com/CalebBell/thermo; the `extrapolation` argument of each class, read in its source on 2026-11-13):
 * VaporPressure "AntoineAB|DIPPR101_ABC" (ln P linear in 1/T), HeatCapacityLiquid and HeatCapacityGas "linear",
 * ViscosityLiquid "Arrhenius" (ln mu linear in 1/T), ViscosityGas, ThermalConductivityLiquid and
 * ThermalConductivityGas "linear", EnthalpyVaporization "Watson" and SurfaceTension "DIPPR106_AB" (forms that go to
 * zero at the critical point, as a DIPPR106 record does itself).
 */
const CONTINUATION = {
  Pa: "vapour-pressure",
  "Pa s": "ln-inverse-T",
  "kg/m3": "equation-to-critical",
  "J/mol": "equation-to-critical",
  "N/m": "equation-to-critical",
};

/** The continuation of a record ("vapour-pressure", "ln-inverse-T", "equation-to-critical" or "linear"). */
export function continuationOf(rec, kind) {
  if (kind === "vapourViscosity") return "linear";
  if (kind === "idealGasHeatCapacity" && rec.equation === "DIPPR107") return "aly-lee";
  const k = CONTINUATION[rec.units] ?? "linear";
  if (k === "equation-to-critical" && rec.equation !== "DIPPR105" && rec.equation !== "DIPPR106") return "linear";
  return k;
}

const HOW = {
  "vapour-pressure-equation": "the record's own equation is evaluated beyond its range (it stays finite and rises with temperature there)",
  "vapour-pressure": "ln P is continued linearly in 1/T from the record's end, through its value and slope there (Clausius-Clapeyron)",
  "ln-inverse-T": "ln of the value is continued linearly in 1/T from the record's end, through its value and slope there",
  "equation-to-critical": "the record's own equation is evaluated beyond its range (a DIPPR form that holds up to the critical point)",
  "aly-lee": "the record's own equation is evaluated beyond its range (the Aly-Lee form, which follows the molecule's vibrational heat capacity)",
  linear: "the value is continued linearly from the record's end, through its value and slope there",
};

/**
 * The record continued outside its range at T: { y, how }. Throws OUT_OF_RANGE when the continuation is not finite or
 * not positive (every property stored in these records is positive).
 */
function continued(rec, f, c, T, side, propertyKind, Tc = null) {
  const end = side === "below" ? rec.Tmin_K : rec.Tmax_K;
  const width = Math.abs(rec.Tmax_K - rec.Tmin_K);
  // the slope at the end: one-sided over a step of 0.01 K inside the record (its derivative there, within 1e-4)
  const h = Math.min(0.01, Math.max(width / 100, 1e-4)) * (side === "below" ? 1 : -1);
  const at = t => f(t, c, rec.Tc_K);
  const kind = continuationOf(rec, propertyKind);
  let y, how;
  if (kind === "vapour-pressure") {
    const raw = at(T);
    // the equation, where it stays finite and rising from the end to T (8 checks of the slope on the way)
    let ok = Number.isFinite(raw) && raw > 0;
    for (let k = 0; ok && k <= 8; k++) {
      const t = end + (T - end) * k / 8, d = 1e-3 * t;
      const a = Math.log(at(t - d)), b = Math.log(at(t + d));
      if (!(Number.isFinite(a) && Number.isFinite(b) && b > a)) ok = false;
    }
    if (ok) { y = raw; how = HOW["vapour-pressure-equation"]; } else if (Tc > 0 && T >= Tc) {
      // above the critical temperature the curve is not continued by Clausius-Clapeyron: no saturation exists there
      throw failRange("OUT_OF_RANGE", `The vapour-pressure record (${rec.Tmin_K}-${rec.Tmax_K} K) has no finite, rising value at ${T.toFixed(2)} K, above the critical temperature (${+Tc.toFixed(2)} K), and is not continued there.`);
    } else {
      const y0 = at(end), s = (Math.log(at(end + h)) - Math.log(y0)) / (1 / (end + h) - 1 / end);
      y = Math.exp(Math.log(y0) + s * (1 / T - 1 / end)); how = HOW["vapour-pressure"];
    }
  } else if (kind === "ln-inverse-T") {
    const y0 = at(end), s = (Math.log(at(end + h)) - Math.log(y0)) / (1 / (end + h) - 1 / end);
    y = Math.exp(Math.log(y0) + s * (1 / T - 1 / end)); how = HOW["ln-inverse-T"];
  } else if (kind === "equation-to-critical" || kind === "aly-lee") {
    y = at(T); how = HOW[kind];
  } else {
    const y0 = at(end), s = (at(end + h) - y0) / h;
    y = y0 + s * (T - end); how = HOW.linear;
  }
  const Tcr = rec.equation === "DIPPR106" ? rec.Tc_K : rec.equation === "DIPPR105" ? c.C : null;
  if (kind === "equation-to-critical" && Tcr > 0 && T >= Tcr) {
    throw failRange("OUT_OF_RANGE", `At ${T.toFixed(2)} K, at or above the critical temperature of its record (${rec.equation}, ${+Tcr.toFixed(2)} K), this saturation property has no value (the record covers ${rec.Tmin_K}-${rec.Tmax_K} K).`);
  }
  if (!(Number.isFinite(y) && y > 0)) {
    throw failRange("OUT_OF_RANGE", `The record (${rec.equation}, ${rec.Tmin_K}-${rec.Tmax_K} K) continued to ${T.toFixed(2)} K gives ${Number.isFinite(y) ? `a value of ${y.toPrecision(4)} ${rec.units ?? ""}, not physical` : "no finite value"}: ${how}, and the result cannot be used.`);
  }
  return { y, how };
}

/**
 * Evaluate a correlation record at temperature T (K).
 * Outside [Tmin_K, Tmax_K] (the maintainer, 2026-11-13): continued in a physically safe form (continuationOf), with a
 * note (src/util/ranges.js) naming opts.component and opts.property; in the strict mode (strictRanges) it throws, as
 * before. opts.extrapolate: true evaluates the equation itself beyond the range, without a note (the integral of an
 * ideal-gas heat capacity, whose range is checked where the enthalpy is used).
 * @param {object} rec
 * @param {number} T  K
 * @param {{extrapolate?: boolean, component?: string, property?: string, kind?: string, Tc_K?: number}} [opts]  Tc_K:
 *        the component's critical temperature, above which a vapour pressure is not continued by Clausius-Clapeyron
 * @returns {number}  value in rec.units
 */
export function evaluate(rec, T, opts = {}) {
  const f = EQUATIONS[rec.equation];
  if (!f) throw fail("MISSING_DATA", `Unknown correlation "${rec.equation}". Known: ${CORRELATION_EQUATIONS.join(", ")}.`);
  if (!(T > 0)) throw failRange("BAD_INPUT", `Temperature must be positive (got ${T} K).`);
  const c = { A: 0, B: 0, C: 0, D: 0, E: 0, ...rec.coefficients };
  if (rec.equation === "DIPPR106" && !(rec.Tc_K > 0)) throw fail("MISSING_DATA", "DIPPR106 needs Tc_K in the record.");
  const side = rec.Tmin_K != null && T < rec.Tmin_K - 1e-9 ? "below" : rec.Tmax_K != null && T > rec.Tmax_K + 1e-9 ? "above" : null;
  if (side && !opts.extrapolate) {
    if (strictRanges()) throw failRange("OUT_OF_RANGE", `${opts.component ? `${opts.component}: ` : ""}T = ${T.toFixed(2)} K is outside the range of this correlation (${rec.Tmin_K}-${rec.Tmax_K} K${opts.property ? `, ${opts.property.toLowerCase()}` : ""}).`);
    if (!(Number.isFinite(rec.Tmin_K) && Number.isFinite(rec.Tmax_K))) throw failRange("OUT_OF_RANGE", `T = ${T.toFixed(2)} K is outside the range of this correlation (${rec.Tmin_K}-${rec.Tmax_K} K).`);
    const { y, how } = continued(rec, f, c, T, side, opts.kind, opts.Tc_K);
    noteExtrapolation({ component: opts.component ?? null, property: opts.property ?? `Correlation ${rec.equation}`, lo: rec.Tmin_K, hi: rec.Tmax_K, value: T, how, kind: opts.kind });
    return y;
  }
  const y = f(T, c, rec.Tc_K);
  if (!Number.isFinite(y)) throw failRange("OUT_OF_RANGE", `Correlation ${rec.equation} gave a non-finite value at ${T} K.`);
  return y;
}
