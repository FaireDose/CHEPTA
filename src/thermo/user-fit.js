/**
 * Fitting the user's own points (proposal 0012, step 3): a table of measured values of a property, turned into a
 * record in the format of components.json, with the fit's deviations shown before it is saved.
 *
 * The forms are the repository's (src/thermo/correlations.js), fitted by linear least squares as
 * validation/python/fit_properties.py and measured_components.py do:
 *   - DIPPR100, y = A + B T + C T^2 + D T^3 + E T^4, on relative deviations (each row divided by y): density, heat
 *     capacities, enthalpy of vaporization, thermal conductivity, surface tension;
 *   - DIPPR101, ln y = A + B/T + C ln T + D T^E with E fixed, on ln y: vapour pressure and viscosities.
 * The least-squares problem is solved by Householder QR on columns scaled to unit maximum (T^k as (T/Tmax)^k), so it is
 * well conditioned; validation/python/reference_user_fit.py solves the same problems with numpy (lstsq) and the test
 * compares the coefficients to 1e-9 relative.
 *
 * Unit conversions are definitions (1 cal = 4.184 J, 1 mmHg = 101325/760 Pa, 1 atm = 101325 Pa), not data. Inputs
 * per mass (J/g/K, J/g) need the molar mass.
 */
import { evaluate } from "./correlations.js";
import { RECORD_UNITS } from "./user-data.js";
import { fail } from "../util/errors.js";

/** The equation each property is fitted with. */
export const FIT_EQUATION = {
  liquidDensity: "DIPPR100", liquidHeatCapacity: "DIPPR100", idealGasHeatCapacity: "DIPPR100", heatOfVaporization: "DIPPR100",
  liquidThermalConductivity: "DIPPR100", vapourThermalConductivity: "DIPPR100", surfaceTension: "DIPPR100",
  liquidViscosity: "DIPPR101", vapourViscosity: "DIPPR101", vapourPressure: "DIPPR101",
};

/** The units a value may be typed in, per property: factor to the record's units, or a function of the molar mass. */
export const INPUT_UNITS = {
  liquidDensity: { "kg/m3": 1, "g/cm3": 1000, "g/mL": 1000, "kg/L": 1000 },
  liquidHeatCapacity: { "J/mol/K": 1, "kJ/kmol/K": 1, "kJ/mol/K": 1000, "cal/mol/K": 4.184, "J/g/K": MW => MW, "kJ/kg/K": MW => MW },
  idealGasHeatCapacity: { "J/mol/K": 1, "kJ/kmol/K": 1, "kJ/mol/K": 1000, "cal/mol/K": 4.184, "J/g/K": MW => MW, "kJ/kg/K": MW => MW },
  heatOfVaporization: { "J/mol": 1, "kJ/mol": 1000, "kJ/kmol": 1, "cal/mol": 4.184, "kcal/mol": 4184, "J/g": MW => MW, "kJ/kg": MW => MW },
  liquidViscosity: { "Pa s": 1, "mPa s": 1e-3, cP: 1e-3, "uPa s": 1e-6 },
  vapourViscosity: { "Pa s": 1, "mPa s": 1e-3, cP: 1e-3, "uPa s": 1e-6 },
  liquidThermalConductivity: { "W/m/K": 1, "mW/m/K": 1e-3 },
  vapourThermalConductivity: { "W/m/K": 1, "mW/m/K": 1e-3 },
  surfaceTension: { "N/m": 1, "mN/m": 1e-3, "dyn/cm": 1e-3 },
  vapourPressure: { Pa: 1, kPa: 1e3, MPa: 1e6, bar: 1e5, mbar: 100, atm: 101325, mmHg: 101325 / 760, Torr: 101325 / 760 },
};
/** Temperature units a table may be typed in. */
export const T_UNITS = { K: T => T, "°C": T => T + 273.15, "°F": T => (T - 32) * 5 / 9 + 273.15 };

/** A value typed in `unit` as the record's units. */
export function toRecordUnits(property, unit, value, MW = null) {
  const u = INPUT_UNITS[property]?.[unit];
  if (u == null) throw fail("BAD_INPUT", `Unknown unit "${unit}" for ${property}. Use ${Object.keys(INPUT_UNITS[property] ?? {}).join(", ")}.`);
  if (typeof u === "function") {
    if (!(MW > 0)) throw fail("BAD_INPUT", `${unit} is per mass: the molar mass is needed to convert it to ${RECORD_UNITS[property]}.`);
    return value * u(MW);
  }
  return value * u;
}

/**
 * Rows of numbers from text pasted from a spreadsheet or typed: tab, semicolon, comma or space separated. With tabs or
 * semicolons a decimal comma is read as a point (European spreadsheets). Lines that are not all numbers before the
 * first row of numbers are the header; blank lines are skipped. Throws on a line that is not numbers after that.
 * @returns {{header:string[]|null, rows:number[][]}}
 */
export function parseTable(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  let header = null;
  const rows = [];
  lines.forEach((line, k) => {
    let cells;
    if (/[\t;]/.test(line)) cells = line.split(/[\t;]/).map(c => c.trim().replace(",", "."));
    else if (/\s/.test(line.replace(/,\s+/g, ","))) cells = line.split(/\s+/).map(c => c.replace(/,$/, "").replace(",", "."));
    else cells = line.split(",");
    cells = cells.filter(c => c !== "");
    const nums = cells.map(c => Number(c));
    if (nums.length && nums.every(Number.isFinite)) { rows.push(nums); return; }
    if (!rows.length) { header = cells; return; }
    throw fail("BAD_INPUT", `Line ${k + 1} ("${line}") is not a row of numbers.`);
  });
  return { header, rows };
}

// least squares min |M x - b| by Householder QR (M: m x n, m >= n), columns scaled to unit maximum
function lstsq(M, b) {
  const m = M.length, n = M[0].length;
  const s = Array.from({ length: n }, (_, j) => Math.max(...M.map(r => Math.abs(r[j]))) || 1);
  const A = M.map(r => r.map((v, j) => v / s[j]));
  const y = b.slice();
  for (let j = 0; j < n; j++) {
    let norm = 0;
    for (let i = j; i < m; i++) norm += A[i][j] ** 2;
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    const alpha = A[j][j] > 0 ? -norm : norm;
    const v = new Array(m).fill(0);
    for (let i = j; i < m; i++) v[i] = A[i][j];
    v[j] -= alpha;
    const vv = v.reduce((t, x) => t + x * x, 0);
    if (vv === 0) continue;
    for (let c = j; c < n; c++) {
      let d = 0;
      for (let i = j; i < m; i++) d += v[i] * A[i][c];
      const f = 2 * d / vv;
      for (let i = j; i < m; i++) A[i][c] -= f * v[i];
    }
    let d = 0;
    for (let i = j; i < m; i++) d += v[i] * y[i];
    const f = 2 * d / vv;
    for (let i = j; i < m; i++) y[i] -= f * v[i];
  }
  const x = new Array(n).fill(0);
  for (let j = n - 1; j >= 0; j--) {
    let t = y[j];
    for (let c = j + 1; c < n; c++) t -= A[j][c] * x[c];
    if (Math.abs(A[j][j]) < 1e-12 * Math.abs(A[0][0])) throw fail("BAD_INPUT", "The points do not fix this many coefficients (two points at the same temperature, or too few points); use fewer terms.");
    x[j] = t / A[j][j];
  }
  return x.map((v, j) => v / s[j]);
}

/**
 * Fit points with one form and number of terms.
 * @param {number[][]} points  [[T_K, value in the record's units], ...]
 * @param {{equation:"DIPPR100"|"DIPPR101", terms:number, E?:number}} form
 *        DIPPR100: terms 1-5 (A; A, B; ... A-E). DIPPR101: terms 1-4 (A; A, B; A, B, C; A, B, C, D with exponent E, default 1)
 * @returns {{equation:string, coefficients:object, Tmin_K:number, Tmax_K:number, deviations:number[], maxDev:number, terms:number}}
 *          deviations: (fit - value) / value of every point
 */
export function fitPoints(points, { equation, terms, E = 1 }) {
  if (!Array.isArray(points) || points.length < 1) throw fail("BAD_INPUT", "Give at least one point.");
  const T = points.map(p => p[0]), y = points.map(p => p[1]);
  if (T.some(t => !(t > 0))) throw fail("BAD_INPUT", "Every temperature must be positive (in K).");
  const max = equation === "DIPPR100" ? 5 : 4;
  if (!(Number.isInteger(terms) && terms >= 1 && terms <= max)) throw fail("BAD_INPUT", `${equation}: terms must be 1 to ${max}.`);
  if (terms > points.length) throw fail("BAD_INPUT", `${terms} coefficients need at least ${terms} points (got ${points.length}).`);
  const Tmax = Math.max(...T);
  let coefficients;
  if (equation === "DIPPR100") {
    // relative deviations: (sum_k c_k T^k) / y - 1, columns (T/Tmax)^k / y
    const M = T.map((t, i) => Array.from({ length: terms }, (_, k) => (t / Tmax) ** k / y[i]));
    const x = lstsq(M, y.map(() => 1));
    coefficients = Object.fromEntries(x.map((v, k) => ["ABCDE"[k], v / Tmax ** k]));
  } else if (equation === "DIPPR101") {
    if (y.some(v => !(v > 0))) throw fail("BAD_INPUT", "DIPPR101 is fitted to ln y: every value must be positive.");
    if (terms === 4 && !(E > 0)) throw fail("BAD_INPUT", "DIPPR101: the exponent E must be positive.");
    const col = [t => 1, t => 1 / t, t => Math.log(t), t => (t / Tmax) ** E];
    const M = T.map(t => col.slice(0, terms).map(f => f(t)));
    const x = lstsq(M, y.map(Math.log));
    coefficients = { A: x[0], ...(terms > 1 ? { B: x[1] } : {}), ...(terms > 2 ? { C: x[2] } : {}), ...(terms > 3 ? { D: x[3] / Tmax ** E, E } : {}) };
  } else throw fail("BAD_INPUT", `Fitting ${equation} is not available; use DIPPR100 or DIPPR101.`);
  const rec = { equation, coefficients, Tmin_K: Math.min(...T), Tmax_K: Tmax };
  const deviations = points.map(([t, v]) => evaluate(rec, t) / v - 1);
  return { ...rec, deviations, maxDev: Math.max(...deviations.map(Math.abs)), terms };
}

/**
 * The fit a property's points get by default: its equation (FIT_EQUATION), with the fewest terms whose largest
 * deviation is within `target` (0.5 % by default), else the one with the smallest largest deviation. DIPPR101 tries
 * 1-3 terms (A + B/T + C ln T); its fourth term needs a chosen exponent.
 */
export function autoFit(property, points, { target = 0.005 } = {}) {
  const equation = FIT_EQUATION[property];
  if (!equation) throw fail("BAD_INPUT", `Unknown property "${property}". Known: ${Object.keys(FIT_EQUATION).join(", ")}.`);
  let best = null;
  for (let terms = 1; terms <= Math.min(points.length, equation === "DIPPR100" ? 5 : 3); terms++) {
    let f;
    try { f = fitPoints(points, { equation, terms }); } catch { continue; }
    if (!best || f.maxDev < best.maxDev - 1e-12) best = f;
    if (f.maxDev <= target) return f;
  }
  if (!best) throw fail("BAD_INPUT", "These points cannot be fitted.");
  return best;
}

/**
 * A user-data record from a fit, with its points and a source line that states the fit.
 * @param {string} property
 * @param {object} fit        from fitPoints or autoFit
 * @param {number[][]} points the points it was fitted to (record units)
 * @param {object|string} source  the person's source line
 */
export function recordFromFit(property, fit, points, source) {
  const s = typeof source === "string" ? { name: source } : { ...source };
  s.fit = `${fit.equation}, ${fit.terms} coefficient${fit.terms > 1 ? "s" : ""} fitted to ${points.length} point${points.length > 1 ? "s" : ""}; maximum deviation ${(100 * fit.maxDev).toPrecision(2)} %`;
  return {
    equation: fit.equation, coefficients: { ...fit.coefficients }, units: RECORD_UNITS[property], Tmin_K: fit.Tmin_K, Tmax_K: fit.Tmax_K,
    points: points.map(p => [p[0], p[1]]), source: s,
  };
}
