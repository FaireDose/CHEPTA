/**
 * Tray hydraulics of the rigorous column (proposal 0015, Part I section 2; milestone M2b, step 6, workstream W4):
 * Fair's flooding velocity on every tray, the diameter from the largest required vapour-flow area, and the actual
 * fraction of flooding of every tray, with the warnings FLOODING and WEEPING. The Column block calls it when its
 * specification has `sizing` (src/units/columns/column.js); `columnDiameter` (src/sizing/sizing.js, contract 4) calls
 * it on a column's result. It stays with the column, as the heater's area stays with the heater.
 *
 * Source: M. Fermeglia, "Staged column design", Separation Processes, University of Trieste (19 April 2021), free to
 * read on the university's course site (source fermeglia-staged-2021):
 *  - slide 36: the capacity factor K_n = u_n √(ρv/(ρl − ρv)), u_n the vapour velocity through the net area;
 *  - slide 37: Fair's chart of K_n,fl (m/s) against the flow parameter F_lv from 0.01 to 2, for tray spacings
 *    H = 0.15, 0.2, 0.3, 0.45, 0.6 and 0.9 m, "for non foaming systems with σ = 20 dyne/cm, hw < 0.15 H, Ah/Aa = 0.1,
 *    dh < 6 mm". No open fitted form of the chart with its tray spacing stated was found, so FAIR_CHART holds values
 *    READ OFF THIS CHART by pixel position (the chart's own image, 667 × 376 pixels, one pixel about 1 % in K), at 16
 *    flow parameters; between them K is interpolated linearly in ln K against ln F, and between two tray spacings
 *    linearly in ln K against ln H (a choice of this project). Outside the chart (F below 0.01 or above 1.8, H below
 *    0.15 or above 0.9 m) it refuses (OUT_OF_RANGE);
 *  - slide 38 (and 48): u_n,fl = K_n,fl K1 K2 K3 K4 √((ρl − ρv)/ρv); K1 = (σ/20)^0.2, σ in dyn/cm (mN/m);
 *    K2 = (10 Ah/Aa)^0.44 if Ah/Aa < 0.1, else 1; K3 = 0.9 for holes above 6 mm, else 1; K4 "an empirical factor related
 *    to foam formation" (the slides give no value: 1 by default, the chart's non-foaming systems; `foaming_factor`);
 *  - slides 44 and 46: the flow parameter F_lv = (W_L/W_V) √(ρV/ρL) with mass flows (slide 46, the worked example;
 *    the chart's caption writes L and G in kmol/h, slide 36 volumetric flows: both are the mass ratio only for equal
 *    molar masses, so the worked example's mass flows are taken); the net area A_net = η π D²/4, η "the fraction of the
 *    column cross sectional area available for vapor: 0.85-0.95" (slide 44), 0.90 in the worked example (slide 47), the
 *    default `net_area_fraction`; slide 28: A_n = A_t − A_d, so η = 1 − A_d/A_t, the downcomer's share;
 *  - slide 39: "Initially fix K5 = 0.8", K5 = u_n/u_n,fl the fraction of flooding (slide 48); slide 50: "typically 0.65
 *    to 0.90": the default `design_fraction` is 0.80, slide 39's value, within that range;
 *  - slide 39: H = 0.41 D as a first estimate; slides 45-47: "Plate spacing is 24 in": the default `tray_spacing_m` is
 *    0.6 m; slide 52: "typically 0.15 to 1 m";
 *  - slide 54 (Table 6.2): the turndown ratio, the largest vapour flow (flooding) over the smallest (excessive
 *    weeping): sieve trays 2, valve trays 4, bubble-cap trays 5. A tray whose vapour runs below 1/turndown of its
 *    flooding velocity weeps (WEEPING); sieve trays by default, the slides' perforated trays (`tray`).
 *
 * The diameter (Part I, section 2): each tray's required net area A_n,j = V̇_j / (f u_fl,j), its total area
 * A_t,j = A_n,j / η, and D = √(4 max_j A_t,j / π): the tray with the largest required area sets it, not the tray with
 * the lowest flooding velocity (slide 35 says "the tray having the lowest flooding velocity"; with the vapour flow
 * changing from tray to tray the two can differ, test/column-hydraulics.test.js). With `diameter_m` given, the column
 * is checked instead: u_n,j = V̇_j / (η π D²/4) and the fraction of flooding u_n,j/u_fl,j of every tray.
 *
 * The trays are the stages between the condenser and the reboiler; each takes the vapour and the liquid leaving it, at
 * its temperature and the column's pressure (this project's choice: the flows of the stage's own outlets). The
 * properties come from CHEPTA's records: ρV = M P/(Z R T) with the system's vapour model, ρL from the pure liquids'
 * densities with volumes adding up, σ of the liquid by Winterfeld, Scriven and Davis, σ = (Σ φ_i √σ_i)², φ_i the
 * volume fractions (the thermo library's first-ranked rule for liquid mixtures, SurfaceTensionMixture, computed by
 * chemicals.interface.Winterfeld_Scriven_Davis; MIT; the chemicals library states it for nonaqueous mixtures, 3-4 %).
 * Units: SI (m, kg/s, m³/s, N/m); the slides' dyn/cm is mN/m.
 */
import { fail, failRange } from "../../util/errors.js";
import { pure, R } from "../../thermo/pure.js";

/** Fair's chart, Fermeglia (2021) slide 37: K_n,fl in m/s READ OFF THE CHART by pixel position, per tray spacing H (m). */
export const FAIR_CHART = Object.freeze({
  F: [0.01, 0.02, 0.03, 0.04, 0.05, 0.07, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0, 1.4, 1.8],
  H_m: [0.15, 0.2, 0.3, 0.45, 0.6, 0.9],
  K_m_s: [
    [0.0458, 0.0445, 0.0443, 0.0436, 0.0432, 0.0424, 0.0410, 0.0379, 0.0350, 0.0311, 0.0282, 0.0259, 0.0225, 0.0192, 0.0158, 0.0133],
    [0.0534, 0.0514, 0.0507, 0.0503, 0.0496, 0.0485, 0.0474, 0.0429, 0.0397, 0.0349, 0.0314, 0.0289, 0.0248, 0.0210, 0.0171, 0.0141],
    [0.0680, 0.0654, 0.0639, 0.0632, 0.0623, 0.0611, 0.0590, 0.0530, 0.0486, 0.0423, 0.0381, 0.0349, 0.0296, 0.0245, 0.0191, 0.0154],
    [0.0903, 0.0857, 0.0845, 0.0824, 0.0812, 0.0797, 0.0767, 0.0686, 0.0625, 0.0538, 0.0480, 0.0437, 0.0367, 0.0296, 0.0225, 0.0177],
    [0.1122, 0.1069, 0.1044, 0.1024, 0.1006, 0.0980, 0.0939, 0.0841, 0.0758, 0.0653, 0.0581, 0.0525, 0.0436, 0.0351, 0.0265, 0.0198],
    [0.1557, 0.1484, 0.1435, 0.1407, 0.1387, 0.1341, 0.1268, 0.1134, 0.1032, 0.0887, 0.0782, 0.0704, 0.0576, 0.0454, 0.0328, 0.0238],
  ],
});
export const TURNDOWN_BY_TRAY = Object.freeze({ sieve: 2, valve: 4, "bubble-cap": 5 });
export const HYDRAULICS_DEFAULTS = Object.freeze({ tray_spacing_m: 0.6, design_fraction: 0.8, net_area_fraction: 0.9,
  hole_area_ratio: 0.1, hole_diameter_mm: 5, foaming_factor: 1, tray: "sieve" });
export const HYDRAULICS_SOURCES = Object.freeze(["fermeglia-staged-2021", "chemicals-surface-tension-mixture"]);
const OPTION_KEYS = ["tray_spacing_m", "design_fraction", "diameter_m", "net_area_fraction", "hole_area_ratio", "hole_diameter_mm", "foaming_factor", "tray"];
const fmt = v => +Number(v).toPrecision(3);
/** Stage numbers as ranges: [2, 3, 4, 7] → "2-4, 7". */
const ranges = list => list.reduce((a, k) => { const r = a[a.length - 1]; if (r && k === r[1] + 1) r[1] = k; else a.push([k, k]); return a; }, [])
  .map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(", ");

/** Linear interpolation of ys against xs (both ascending xs), x within xs. */
function lerp(xs, ys, x) {
  let k = 0;
  while (k < xs.length - 2 && x > xs[k + 1]) k++;
  const t = (x - xs[k]) / (xs[k + 1] - xs[k]);
  return ys[k] + t * (ys[k + 1] - ys[k]);
}

/** K_n,fl (m/s) of Fair's chart at the flow parameter F and the tray spacing H (m); refuses outside the chart. */
export function kFlood(F, H) {
  const c = FAIR_CHART, Fmax = c.F[c.F.length - 1], Hmax = c.H_m[c.H_m.length - 1];
  if (!(F >= c.F[0] && F <= Fmax)) throw failRange("OUT_OF_RANGE", `Column hydraulics: the flow parameter (W_L/W_V)·√(ρV/ρL) = ${fmt(F)} is outside ${c.F[0]}-${Fmax}, the part of Fair's chart read (Fermeglia 2021, slide 37).`);
  if (!(H >= c.H_m[0] && H <= Hmax)) throw failRange("OUT_OF_RANGE", `Column hydraulics: the tray spacing ${fmt(H)} m is outside ${c.H_m[0]}-${Hmax} m, the spacings of Fair's chart (Fermeglia 2021, slide 37).`);
  const lnF = Math.log(F), lnFs = c.F.map(Math.log);
  const lnK = c.K_m_s.map(row => lerp(lnFs, row.map(Math.log), lnF));
  return Math.exp(lerp(c.H_m.map(Math.log), lnK, Math.log(H)));
}

const num = (v, what, min, max, open) => {
  const x = Number(v);
  if (!Number.isFinite(x) || (open ? !(x > min) : x < min) || x > max) throw fail("BAD_INPUT", `Column sizing: ${what} must be a number ${open ? "above" : "of at least"} ${min}${max < Infinity ? ` and at most ${max}` : ""} (got ${JSON.stringify(v)}).`);
  return x;
};

/** The options of the column's sizing, checked, with their defaults: { tray_spacing_m, design_fraction, ... }. */
export function hydraulicsOptions(z) {
  if (z == null || typeof z !== "object" || Array.isArray(z)) throw fail("BAD_INPUT", "Column sizing: sizing must be an object such as { tray_spacing_m: 0.6, design_fraction: 0.8 }.");
  const bad = Object.keys(z).filter(k => !OPTION_KEYS.includes(k));
  if (bad.length) throw fail("BAD_INPUT", `Column sizing: unknown option${bad.length > 1 ? "s" : ""} ${bad.join(", ")}. Known: ${OPTION_KEYS.join(", ")}.`);
  const d = HYDRAULICS_DEFAULTS, g = (k, ...lim) => (z[k] == null || z[k] === "" ? d[k] : num(z[k], k, ...lim));
  const tray = z.tray ?? d.tray;
  if (!Object.hasOwn(TURNDOWN_BY_TRAY, tray)) throw fail("BAD_INPUT", `Column sizing: tray is one of ${Object.keys(TURNDOWN_BY_TRAY).join(", ")} (got ${JSON.stringify(tray)}).`);
  return {
    tray_spacing_m: g("tray_spacing_m", 0, Infinity, true),
    design_fraction: g("design_fraction", 0, 1, true),
    diameter_m: z.diameter_m == null || z.diameter_m === "" ? null : num(z.diameter_m, "diameter_m", 0, Infinity, true),
    net_area_fraction: g("net_area_fraction", 0, 1, true),
    hole_area_ratio: g("hole_area_ratio", 0, 1, true),
    hole_diameter_mm: g("hole_diameter_mm", 0, Infinity, true),
    foaming_factor: g("foaming_factor", 0, 1, true),
    tray,
  };
}

/**
 * Fair's method on given trays: trays [{ stage, WL_kg_s, WV_kg_s, rhoL, rhoV, sigma_N_m }] and the options of
 * hydraulicsOptions → { dimensions, basis, stages, warnings, notes, source }. Exported for the independent check
 * (validation/python/reference_hydraulics.py).
 */
export function trayHydraulics(trays, options = {}) {
  const o = hydraulicsOptions(options);
  if (!Array.isArray(trays) || !trays.length) throw fail("BAD_INPUT", "Column sizing: the column has no trays between its condenser and its reboiler.");
  const K2 = o.hole_area_ratio < 0.1 ? (10 * o.hole_area_ratio) ** 0.44 : 1, K3 = o.hole_diameter_mm > 6 ? 0.9 : 1, K4 = o.foaming_factor;
  const eta = o.net_area_fraction, f = o.design_fraction, turndown = TURNDOWN_BY_TRAY[o.tray];
  const rows = trays.map(t => {
    if (!(t.WV_kg_s > 0)) throw fail("BAD_INPUT", `Column sizing: stage ${t.stage} carries no vapour, so no vapour velocity sizes it.`);
    if (!(t.WL_kg_s > 0)) throw fail("BAD_INPUT", `Column sizing: stage ${t.stage} carries no liquid; Fair's chart starts at a flow parameter of 0.01.`);
    if (!(t.rhoL > t.rhoV && t.rhoV > 0)) throw fail("BAD_INPUT", `Column sizing: on stage ${t.stage} the liquid (${fmt(t.rhoL)} kg/m³) must be denser than the vapour (${fmt(t.rhoV)} kg/m³).`);
    const F = t.WL_kg_s / t.WV_kg_s * Math.sqrt(t.rhoV / t.rhoL);
    let Kchart;
    try { Kchart = kFlood(F, o.tray_spacing_m); } catch (e) { e.message = e.message.replace("Column hydraulics:", `Column sizing, stage ${t.stage}:`); throw e; }
    const K1 = (t.sigma_N_m * 1000 / 20) ** 0.2;
    const u_fl = Kchart * K1 * K2 * K3 * K4 * Math.sqrt((t.rhoL - t.rhoV) / t.rhoV);
    const QV = t.WV_kg_s / t.rhoV, An = QV / (f * u_fl);
    return { stage: t.stage, flowParameter: F, K_chart_m_s: Kchart, K1, u_flood_m_s: u_fl, QV_m3_s: QV, QL_m3_s: t.WL_kg_s / t.rhoL,
      rhoL_kg_m3: t.rhoL, rhoV_kg_m3: t.rhoV, sigma_N_m: t.sigma_N_m, netArea_required_m2: An, area_required_m2: An / eta };
  });
  const top = rows.reduce((a, r) => (r.area_required_m2 > a.area_required_m2 ? r : a));
  const slowest = rows.reduce((a, r) => (r.u_flood_m_s < a.u_flood_m_s ? r : a));
  const sized = o.diameter_m == null;
  const D = sized ? Math.sqrt(4 * top.area_required_m2 / Math.PI) : o.diameter_m;
  const At = Math.PI * D * D / 4, An = eta * At;
  for (const r of rows) { r.u_net_m_s = r.QV_m3_s / An; r.fraction_of_flooding = r.u_net_m_s / r.u_flood_m_s; }
  const notes = [], warnings = [];
  notes.push(sized
    ? `Column diameter ${fmt(D)} m, set by stage ${top.stage}, the largest required vapour-flow area at ${fmt(100 * f)} % of flooding${slowest.stage !== top.stage ? ` (stage ${slowest.stage} has the lowest flooding velocity, ${fmt(slowest.u_flood_m_s)} m/s, but carries less vapour)` : ""}; Fair's method (Fermeglia 2021, slides 37-38), K_n,fl read off its chart.`
    : `Given diameter ${fmt(D)} m checked: the fraction of flooding of every stage by Fair's method (Fermeglia 2021, slides 37-38, 48), K_n,fl read off its chart.`);
  const flood = rows.filter(r => r.fraction_of_flooding > f * (1 + 1e-9));
  if (flood.length) {
    const w = flood.reduce((a, r) => (r.fraction_of_flooding > a.fraction_of_flooding ? r : a));
    warnings.push({ code: "FLOODING", stage: w.stage, message: `Stage${flood.length > 1 ? "s" : ""} ${ranges(flood.map(r => r.stage))} run${flood.length > 1 ? "" : "s"} above the design fraction of flooding, ${fmt(100 * f)} % (diameter ${fmt(D)} m): the highest, stage ${w.stage}, at ${fmt(100 * w.fraction_of_flooding)} % of Fair's flooding velocity${w.fraction_of_flooding >= 1 ? "; at 100 % and more the trays flood" : ""}. Every stage's fraction: sizing.stages.`,
      remedy: "A larger diameter (or no diameter, to size it), a wider tray spacing, or less vapour (a lower reflux and boil-up)." });
  }
  const weep = rows.filter(r => r.fraction_of_flooding < 1 / turndown);
  if (weep.length) {
    const w = weep.reduce((a, r) => (r.fraction_of_flooding < a.fraction_of_flooding ? r : a));
    warnings.push({ code: "WEEPING", stage: w.stage, message: `Stage${weep.length > 1 ? "s" : ""} ${ranges(weep.map(r => r.stage))} run${weep.length > 1 ? "" : "s"} below 1/${turndown} of the flooding velocity, the turndown of ${o.tray} trays (Fermeglia 2021, slide 54): the lowest, stage ${w.stage}, at ${fmt(100 * w.fraction_of_flooding)} % (diameter ${fmt(D)} m); ${weep.length > 1 ? "these trays" : "this tray"} would weep. Every stage's fraction: sizing.stages.`,
      remedy: "A smaller diameter for this section (a column with two diameters, Fermeglia 2021, slide 35), valve or bubble-cap trays (turndown 4 and 5), or more vapour on these stages." });
  }
  if (o.foaming_factor === 1) notes.push("Non-foaming system assumed (K4 = 1, the chart's basis); give foaming_factor below 1 for a foaming one.");
  return {
    dimensions: { D_m: D, area_m2: At, netArea_m2: An, downcomerArea_m2: At - An, tray_spacing_m: o.tray_spacing_m },
    basis: { mode: sized ? "sized" : "checked", design_fraction: f, net_area_fraction: eta, tray: o.tray, turndown,
      K2, K3, K4, hole_area_ratio: o.hole_area_ratio, hole_diameter_mm: o.hole_diameter_mm,
      governing_stage: top.stage, lowest_flooding_velocity_stage: slowest.stage,
      max_fraction_of_flooding: Math.max(...rows.map(r => r.fraction_of_flooding)), chart: "Fair's chart read off Fermeglia (2021), slide 37" },
    stages: rows, warnings, notes, source: HYDRAULICS_SOURCES.slice(),
  };
}

/** The liquid's density (kg/m³) and surface tension (N/m) at T from the pure liquids' records (see the header). */
function liquidOf(sys, x, T, stage) {
  let v = 0, mass = 0;
  const parts = [];
  x.forEach((xi, i) => {
    if (!(xi > 1e-12)) return;
    const c = pure(sys.ids[i], { userData: sys.userData });
    const get = (name, what) => {
      try { return c.property(name, T); } catch (e) { e.message = `Column sizing, stage ${stage}: the liquid's ${what} needs the ${what} of ${c.name}: ${e.message}`; throw e; }
    };
    const vi = c.MW / 1000 / get("liquidDensity", "density");
    parts.push({ xv: xi * vi, sigma: get("surfaceTension", "surface tension") });
    v += xi * vi; mass += xi * c.MW / 1000;
  });
  const s = parts.reduce((a, p) => a + p.xv / v * Math.sqrt(p.sigma), 0);
  return { rho: mass / v, sigma: s * s };
}

/**
 * The trays of a rigorous column's profile (the Column block's `profile`: T_K, P_kPa, L_kmol_h, V_kmol_h, x, y by
 * component id), with their mass flows and properties, for trayHydraulics. The condenser (1) and the reboiler (N) are
 * not trays.
 */
export function profileTrays(sys, profile) {
  if (!Array.isArray(profile) || profile.length < 3 || profile.some(s => s.V_kmol_h == null || s.x == null)) {
    throw fail("BAD_INPUT", "Column sizing: the diameter needs every stage's flows and compositions, the rigorous column's profile (the shortcut gives only its ends and its feed).");
  }
  const vec = obj => sys.ids.map(id => Number(obj?.[id] ?? 0));
  return profile.slice(1, -1).map(s => {
    const T = s.T_K, P = s.P_kPa, x = vec(s.x), y = vec(s.y);
    const Mx = x.reduce((a, v, i) => a + v * sys.MW[i], 0), My = y.reduce((a, v, i) => a + v * sys.MW[i], 0);
    const Z = sys.phase("vapour", T, P, y).Z ?? 1;
    const rhoV = My / 1000 * P * 1000 / (Z * R * T);
    const { rho, sigma } = liquidOf(sys, x, T, s.stage);
    return { stage: s.stage, T_K: T, WL_kg_s: s.L_kmol_h / 3.6 * Mx / 1000, WV_kg_s: s.V_kmol_h / 3.6 * My / 1000, rhoL: rho, rhoV, sigma_N_m: sigma, Z };
  });
}

/** The hydraulics of a rigorous column's profile: profileTrays, then trayHydraulics; each stage keeps its T and Z. */
export function columnHydraulics(sys, profile, options = {}) {
  const trays = profileTrays(sys, profile);
  const out = trayHydraulics(trays, options);
  out.stages = out.stages.map((r, k) => ({ ...r, T_K: trays[k].T_K, Z: trays[k].Z }));
  return out;
}
