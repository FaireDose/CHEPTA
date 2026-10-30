/**
 * Equipment sizing (proposal 0015, section 9, contract 4; roadmap E1): a layer above the blocks (src/units/), which
 * reads a block's result and returns its dimensions; cost (E2) reads these. Each function is
 *
 *   (unit result, options) → { dimensions, basis, source, notes }
 *
 * with `basis` the rule and its inputs (a fraction of flooding, a residence time) and `source` the open references of
 * the correlation. The column diameter is set by the largest required vapour-flow area of its stages,
 * A_j = V̇_j / (f · u_fl,j) (Part I, section 2), not by the stage with the lowest flooding velocity.
 *
 * Built in workstream W4: the drum and decanter sizes at milestone M1 (here), the column diameter at M2b (columnDiameter,
 * whose tray hydraulics stay with the column, src/units/columns/hydraulics.js), the membrane area at M3, which still
 * refuses. (The heater's area, proposal 0013, stays with the heater: src/units/heat-exchange.js.)
 *
 *   CHEPTA.sizeDrum(flashResult, { sys, orientation: "vertical", fraction: 0.85, residence_min: 2 })
 *   CHEPTA.sizeDecanter(flashResult, { sys, orientation: "horizontal", droplet_um: 150, ratio: 4 })
 *   CHEPTA.columnDiameter(columnResult, { sys, tray_spacing_m: 0.6, design_fraction: 0.8 })
 *
 * The phases are the flash block's outlets (runUnit or a flowsheet's block result) at the drum's T and P: the vapour's
 * density from the system's own vapour model, ρV = M P / (Z R T); a liquid's from the pure liquids' density records,
 * volumes adding up (as the kinetic reactors do, src/units/kinetic-reactors.js); a liquid's viscosity from the pure
 * liquids' records by the logarithmic mole-fraction rule ln μ = Σ x_i ln μ_i (the thermo library's preferred rule for
 * liquid mixtures, ViscosityLiquidMixture, MIXING_LOG_MOLAR = chemicals.utils.mixing_logarithmic; MIT). A record outside
 * its range refuses (OUT_OF_RANGE), and a property without a record refuses (MISSING_DATA).
 *
 * Vapour-liquid drum (sizeDrum). Sources, free to read on the universities' own sites:
 *  - M. Fermeglia, "Single stage thermal separation: flash", Separation Processes, University of Trieste (22 March 2021),
 *    slides 81-88: the permitted velocity v_perm = K √((ρL − ρV)/ρV) (slides 83-84); K from the fit
 *    K = exp(A + B ln F + C (ln F)² + D (ln F)³ + E (ln F)⁴), F = (W_L/W_V) √(ρV/ρL) the flow parameter (W mass
 *    flows), A = −1.877478, B = −0.814580, C = −0.187074, D = −0.014523, E = −0.001015 (slide 83, with its chart of K
 *    against F from 0.006 to about 5.5, the range kept here; values of F outside it refuse); D = √(4 V̇V / (π u))
 *    (slide 87); the heights h_v = 36 in + ½ d_feed (at least 48 in; "36 in is the room for demister"),
 *    h_f = 12 in + ½ d_feed, h_L = V_surge / (π D²/4), H = h_v + h_f + h_L with 3 < H/D < 5 (slide 87); "if H/D < 3 use
 *    a larger liquid surge volume", "if H/D > 5 use an horizontal drum" (slide 88); the nozzle velocities
 *    u_max = 100/√ρ_mix and u_min = 60/√ρ_mix ft/s, ρ_mix in lb/ft³ (slide 87); "use a security factor of 0.85 relative to
 *    the calculated velocity" (slide 88), the default `fraction`;
 *  - M. Bagajewicz, ChE 4253 Design I, University of Oklahoma: "Flash drum design" (2013) and "Flash and tray design
 *    examples" (2018): the same fit, with K in ft/s (the worked example: F = 0.2402, K = 0.2365, v_perm = 6.823 ft/s,
 *    test/sizing.test.js); h_v and h_f with the diameter of the feed line (where Fermeglia's slide 87 writes ½ D, the
 *    Oklahoma slides write "½ diameter of feedline", taken here); "or ~2 minutes residence time", "preferred when Vpool
 *    is not available": the default residence time. CHEPTA takes the feed line at the lower nozzle velocity u_min (the
 *    wider line, the taller drum), unless `feedLine_m` is given;
 *  - horizontal drums: A. K. Coker, "Computer program enhances guidelines for gas-liquid separator designs", Oil & Gas
 *    Journal (10 May 1993), free to read on ogj.com: "K_H for horizontal separators is generally set at 1.25 K_v"; "the
 *    separator-vapor area can be assumed to occupy only 15-25% of the total cross sectional area" (20 % taken, as in the
 *    article's calculation); "the minimum vapor space is equal to 20% of the diameter, or 12 in., whichever is greater";
 *    the procedure starts from L/D = 3, which CHEPTA takes as the shortest drum (a choice of this project). The length
 *    the drops need to fall out of the vapour is not checked: no open source opened in this step gives it.
 *
 * Decanter (sizeDecanter): S. D. Al-Bayati, "Liquid-liquid separators", Biochemical Engineering Department,
 * Al-Khwarizmi College of Engineering, University of Baghdad (lecture notes, free to read on uomus.edu.iq): the velocity
 * of the continuous phase through the interface u_c = L_c / A_i must not exceed the settling velocity of the dispersed
 * drops, by Stokes' law u_d = g d² (ρd − ρc) / (18 μc), "with an assumed droplet size of 150 μm"; "if the calculated
 * settling velocity is greater than 4 × 10⁻³ m/s, then a figure of 4 × 10⁻³ m/s is used"; a horizontal vessel's
 * interface width w = 2 (H_i D − H_i²)^½; "a value of 10 % of the decanter height" for the dispersion band, whose
 * residence time 0.1 H / u_d should be 2 to 5 min; "length to decanter diameter ratio of 3-5:1"; a hold-up time of 2 to
 * 10 min; the inlet velocity below 1 m/s; the heavy liquid's take-off H2 = H3 + (H1 − H3) ρ1/ρ2 (light overflow at
 * 90 % of the height, interface at half of it); worked examples 1 (vertical, H = 2D) and 2 (horizontal, L = 4D), the
 * defaults here. Which phase is dispersed is the user's (`dispersed`); by default the one with the smaller volume flow,
 * a choice of this project. The drop Reynolds number is reported; no open source opened in this step states the limit
 * of Stokes' law, so it is not checked.
 *
 * Units: SI inside (m, kg/s, m³/s, Pa s); the slides' inches and ft/s are converted by their definitions (1 in =
 * 0.0254 m, 1 ft = 0.3048 m, 1 lb = 0.45359237 kg). g = 9.80665 m/s² (standard gravity).
 */
import { fail, failRange } from "../util/errors.js";
import { pure, R } from "../thermo/pure.js";
import { columnHydraulics } from "../units/columns/hydraulics.js";

const IN = 0.0254, FT = 0.3048, LB_FT3 = 0.45359237 / FT ** 3, G = 9.80665;
/** Fermeglia (2021), slide 83; Bagajewicz (2013, 2018): K (ft/s) against ln F. */
export const K_DRUM_FIT = Object.freeze({ A: -1.877478, B: -0.814580, C: -0.187074, D: -0.014523, E: -0.001015, Fmin: 0.006, Fmax: 5.5 });
export const DRUM_DEFAULTS = Object.freeze({ orientation: "vertical", fraction: 0.85, residence_min: 2, horizontalK: 1.25, vapourAreaShare: 0.2, minLD: 3 });
export const DECANTER_DEFAULTS = Object.freeze({ droplet_um: 150, maxSettling_m_s: 4e-3, vertical_HD: 2, horizontal_LD: 4, interface: 0.5, band: 0.1, inlet_m_s: 1 });

export const DRUM_SOURCES = Object.freeze(["fermeglia-flash-2021", "ou-che4253-flash"]);
export const HORIZONTAL_SOURCES = Object.freeze(["coker-ogj-1993"]);
export const DECANTER_SOURCES = Object.freeze(["albayati-decanters"]);
const MU_RULE = "the thermo library's logarithmic mole-fraction rule for liquid mixtures (MIT)";

const num = (v, what, { min = -Infinity, max = Infinity, open = false } = {}) => {
  const x = Number(v);
  if (!Number.isFinite(x) || (open ? !(x > min) : x < min) || x > max) throw fail("BAD_INPUT", `${what} must be a number ${open ? "above" : "of at least"} ${min}${max < Infinity ? ` and at most ${max}` : ""} (got ${JSON.stringify(v)}).`);
  return x;
};
const opt = (o, k, d, what, lim) => (o[k] == null ? d : num(o[k], what, lim));
const known = (o, keys, who) => {
  if (o == null || typeof o !== "object" || Array.isArray(o)) throw fail("BAD_INPUT", `${who}: the options must be an object.`);
  const bad = Object.keys(o).filter(k => !keys.includes(k));
  if (bad.length) throw fail("BAD_INPUT", `${who}: unknown option${bad.length > 1 ? "s" : ""} ${bad.join(", ")}. Known: ${keys.join(", ")}.`);
};

/** K of a vertical drum (m/s, and ft/s as the fit gives it) at the flow parameter F; refuses outside the chart. */
export function kDrum(F) {
  const f = K_DRUM_FIT;
  if (!(F >= f.Fmin && F <= f.Fmax)) throw failRange("OUT_OF_RANGE", `Drum: the flow parameter (W_L/W_V)·√(ρV/ρL) = ${Number(F).toPrecision(3)} is outside ${f.Fmin}-${f.Fmax}, the range of the chart the K fit follows (Fermeglia 2021, slide 83); give your own K_m_s.`);
  const l = Math.log(F);
  const K_ft_s = Math.exp(f.A + f.B * l + f.C * l ** 2 + f.D * l ** 3 + f.E * l ** 4);
  return { K_ft_s, K_m_s: K_ft_s * FT };
}

/** The area of a circular segment of height h in a circle of diameter D (elementary geometry). */
export function segmentArea(D, h) {
  const r = D / 2, c = Math.min(Math.max((r - h) / r, -1), 1);
  return r * r * Math.acos(c) - (r - h) * Math.sqrt(Math.max(0, 2 * r * h - h * h));
}
/** The height of the segment that holds `share` of a circle's area (bisection). */
function segmentHeight(D, share) {
  const target = share * Math.PI * D * D / 4;
  let lo = 0, hi = D;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (segmentArea(D, m) < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/**
 * A vapour-liquid drum from its flows and densities: { WL_kg_s, WV_kg_s, rhoL, rhoV } and the options of sizeDrum.
 * Exported for the independent check (validation/python/reference_sizing.py).
 */
export function drumGeometry(inp, o = {}) {
  const who = "Drum";
  const WL = num(inp.WL_kg_s, `${who}: the liquid flow WL_kg_s`, { min: 0 }), WV = num(inp.WV_kg_s, `${who}: the vapour flow WV_kg_s`, { min: 0, open: true });
  const rhoL = num(inp.rhoL, `${who}: the liquid density`, { min: 0, open: true }), rhoV = num(inp.rhoV, `${who}: the vapour density`, { min: 0, open: true });
  if (!(rhoL > rhoV)) throw fail("BAD_INPUT", `${who}: the liquid (${rhoL.toPrecision(4)} kg/m³) must be denser than the vapour (${rhoV.toPrecision(4)} kg/m³).`);
  const orientation = o.orientation ?? DRUM_DEFAULTS.orientation;
  if (!["vertical", "horizontal"].includes(orientation)) throw fail("BAD_INPUT", `${who}: orientation is "vertical" or "horizontal" (got ${JSON.stringify(orientation)}).`);
  const fraction = opt(o, "fraction", DRUM_DEFAULTS.fraction, `${who}: fraction (of the permitted velocity)`, { min: 0, max: 1, open: true });
  if (o.residence_min != null && o.holdup_m3 != null) throw fail("BAD_INPUT", `${who}: give residence_min or holdup_m3, not both.`);
  const residence_s = 60 * opt(o, "residence_min", DRUM_DEFAULTS.residence_min, `${who}: residence_min`, { min: 0 });
  const notes = [];
  const QL = WL / rhoL, QV = WV / rhoV;
  const F = WL / WV * Math.sqrt(rhoV / rhoL);
  let K, Kv = null;
  if (o.K_m_s != null) K = num(o.K_m_s, `${who}: K_m_s`, { min: 0, open: true });
  else { Kv = kDrum(F); K = orientation === "horizontal" ? DRUM_DEFAULTS.horizontalK * Kv.K_m_s : Kv.K_m_s; }
  const u_perm = K * Math.sqrt((rhoL - rhoV) / rhoV), u = fraction * u_perm;
  const pool_m3 = o.holdup_m3 != null ? num(o.holdup_m3, `${who}: holdup_m3`, { min: 0 }) : QL * residence_s;
  const basis = { orientation, flowParameter: F, ...(Kv ? { K_vertical_m_s: Kv.K_m_s } : {}), K_m_s: K, K_given: o.K_m_s != null,
    u_permitted_m_s: u_perm, fraction, u_m_s: u, QV_m3_s: QV, QL_m3_s: QL, rhoL_kg_m3: rhoL, rhoV_kg_m3: rhoV,
    ...(o.holdup_m3 != null ? { holdup_m3: pool_m3 } : { residence_s }) };
  const AV = QV / u;
  if (orientation === "vertical") {
    const D = Math.sqrt(4 * AV / Math.PI), A = Math.PI * D * D / 4;
    // the feed line: the user's, or the wider of the nozzle rule (the lower velocity, 60/√ρ_mix ft/s)
    const rhoMix = (WL + WV) / (QL + QV), sq = Math.sqrt(rhoMix / LB_FT3);
    const uNoz = { max: 100 / sq * FT, min: 60 / sq * FT };
    const dFeed = o.feedLine_m != null ? num(o.feedLine_m, `${who}: feedLine_m`, { min: 0 }) : Math.sqrt(4 * (QL + QV) / (Math.PI * uNoz.min));
    const hv = Math.max(36 * IN + dFeed / 2, 48 * IN), hf = 12 * IN + dFeed / 2;
    let hL = pool_m3 / A, H = hv + hf + hL;
    if (H / D < 3) {
      hL = 3 * D - hv - hf; H = 3 * D;
      notes.push(`H/D was below 3, so the liquid pool is deepened to give H = 3 D (Fermeglia 2021, slide 88: "if H/D < 3 use a larger liquid surge volume"); it holds ${(hL * A).toPrecision(3)} m³.`);
    } else if (H / D > 5) notes.push(`H/D = ${(H / D).toFixed(1)} is above 5: a horizontal drum is recommended (Fermeglia 2021, slide 88).`);
    return { dimensions: { orientation, D_m: D, H_m: H, HD: H / D, hv_m: hv, hf_m: hf, hL_m: hL, area_m2: A, volume_m3: A * H, feedLine_m: dFeed },
      basis: { ...basis, rhoMix_kg_m3: rhoMix, nozzle_u_max_m_s: uNoz.max, nozzle_u_min_m_s: uNoz.min, feedLine_given: o.feedLine_m != null },
      source: DRUM_SOURCES.slice(), notes };
  }
  // horizontal (Coker 1993): the vapour takes 20 % of the cross-section, its space at least 20 % of D or 12 in
  const AT = AV / DRUM_DEFAULTS.vapourAreaShare, D = Math.sqrt(4 * AT / Math.PI);
  let hvap = segmentHeight(D, DRUM_DEFAULTS.vapourAreaShare);
  const hmin = Math.max(0.2 * D, 12 * IN);
  if (hvap < hmin) { hvap = hmin; notes.push(`The vapour space is raised to ${hmin.toPrecision(3)} m, the larger of 20 % of D and 12 in (Coker 1993).`); }
  if (hvap >= D) throw fail("BAD_INPUT", `${who}: a horizontal drum this small (D = ${D.toPrecision(3)} m) cannot have the minimum vapour space of 12 in (Coker 1993): use a vertical drum.`);
  const AL = AT - segmentArea(D, hvap);
  let L = pool_m3 / AL;
  if (L < DRUM_DEFAULTS.minLD * D) { L = DRUM_DEFAULTS.minLD * D; notes.push("The length is set to 3 D, the L/D that Coker's procedure starts from, taken by CHEPTA as the shortest drum; the liquid it holds is more than asked."); }
  notes.push("The length the drops need to fall out of the vapour is not checked (no open source for it yet).");
  return { dimensions: { orientation, D_m: D, L_m: L, LD: L / D, vapourSpace_m: hvap, area_m2: AT, volume_m3: AT * L },
    basis: { ...basis, vapourAreaShare: DRUM_DEFAULTS.vapourAreaShare, horizontalK: o.K_m_s != null ? null : DRUM_DEFAULTS.horizontalK },
    source: [...DRUM_SOURCES, ...HORIZONTAL_SOURCES], notes };
}

/**
 * A decanter from its two liquids: { light: { Q_m3_s, rho, mu }, heavy: { ... } } and the options of sizeDecanter.
 * Exported for the independent check (validation/python/reference_sizing.py).
 */
export function decanterGeometry({ light, heavy }, o = {}) {
  const who = "Decanter";
  for (const [k, p] of [["light", light], ["heavy", heavy]]) {
    num(p?.Q_m3_s, `${who}: the ${k} liquid's volume flow`, { min: 0, open: true });
    num(p?.rho, `${who}: the ${k} liquid's density`, { min: 0, open: true });
    num(p?.mu, `${who}: the ${k} liquid's viscosity`, { min: 0, open: true });
  }
  if (!(heavy.rho > light.rho)) throw fail("BAD_INPUT", `${who}: the two liquids have the same density (${light.rho.toPrecision(4)} kg/m³): they do not settle.`);
  const orientation = o.orientation ?? "vertical";
  if (!["vertical", "horizontal"].includes(orientation)) throw fail("BAD_INPUT", `${who}: orientation is "vertical" or "horizontal" (got ${JSON.stringify(orientation)}).`);
  const dispersed = o.dispersed ?? (light.Q_m3_s <= heavy.Q_m3_s ? "light" : "heavy");
  if (!["light", "heavy"].includes(dispersed)) throw fail("BAD_INPUT", `${who}: dispersed is "light" or "heavy" (got ${JSON.stringify(dispersed)}).`);
  const d = 1e-6 * opt(o, "droplet_um", DECANTER_DEFAULTS.droplet_um, `${who}: droplet_um`, { min: 0, open: true });
  const ratio = opt(o, "ratio", orientation === "vertical" ? DECANTER_DEFAULTS.vertical_HD : DECANTER_DEFAULTS.horizontal_LD, `${who}: ratio (H/D or L/D)`, { min: 0, open: true });
  const hi = opt(o, "interface", DECANTER_DEFAULTS.interface, `${who}: interface (its height over the diameter)`, { min: 0, max: 1, open: true });
  if (orientation === "horizontal" && !(hi < 1)) throw fail("BAD_INPUT", `${who}: the interface of a horizontal decanter must be below its top (interface < 1).`);
  const dp = dispersed === "light" ? light : heavy, cp = dispersed === "light" ? heavy : light;
  const drho = heavy.rho - light.rho, notes = [];
  const uStokes = G * d * d * drho / (18 * cp.mu);
  const ud = Math.min(uStokes, DECANTER_DEFAULTS.maxSettling_m_s);
  if (uStokes > ud) notes.push(`Stokes' law gives ${uStokes.toPrecision(3)} m/s; 4 × 10⁻³ m/s is used instead (Al-Bayati).`);
  const Ai = cp.Q_m3_s / ud;
  let D, H, L = null, volume;
  if (orientation === "vertical") { D = Math.sqrt(4 * Ai / Math.PI); H = ratio * D; volume = Math.PI * D * D / 4 * H; }
  else { D = Math.sqrt(Ai / (2 * ratio * Math.sqrt(hi - hi * hi))); L = ratio * D; H = D; volume = Math.PI * D * D / 4 * L; }
  const band = DECANTER_DEFAULTS.band * H, tBand = band / ud;
  if (tBand < 120) notes.push(`The drops stay ${(tBand / 60).toFixed(1)} min in the dispersion band (10 % of the height), below the 2 min recommended (Al-Bayati): a deeper band or a larger vessel.`);
  // the drops of the continuous phase that the dispersed phase can carry with it through the interface
  const uDispersed = dp.Q_m3_s / Ai, dEntrained = Math.sqrt(18 * dp.mu * uDispersed / (G * drho));
  const holdup_s = volume / (light.Q_m3_s + heavy.Q_m3_s);
  if (holdup_s < 120 || holdup_s > 600) notes.push(`The hold-up time, ${(holdup_s / 60).toFixed(1)} min, is outside the 2 to 10 min of a rough estimate (Al-Bayati).`);
  const H1 = 0.9 * H, H3 = hi * H, H2 = H3 + (H1 - H3) * light.rho / heavy.rho;
  const inlet = Math.sqrt(4 * (light.Q_m3_s + heavy.Q_m3_s) / (Math.PI * DECANTER_DEFAULTS.inlet_m_s));
  return {
    dimensions: { orientation, D_m: D, ...(L != null ? { L_m: L } : { H_m: H }), ratio, interfaceArea_m2: Ai, volume_m3: volume,
      band_m: band, lightOverflow_m: H1, interface_m: H3, heavyOverflow_m: H2, inlet_m: inlet },
    basis: { dispersed, droplet_m: d, settling_m_s: ud, settling_stokes_m_s: uStokes, reynolds: cp.rho * ud * d / cp.mu,
      continuousVelocity_m_s: cp.Q_m3_s / Ai, bandResidence_s: tBand, entrainedDrop_m: dEntrained, holdup_s, interface: hi,
      light: { ...light }, heavy: { ...heavy } },
    source: DECANTER_SOURCES.slice(), notes,
  };
}

// ---------------------------------------------------------------------------------------
// The phases of a flash block's result

/** A liquid's molar volume (m³/mol) and viscosity (Pa s) at T from the pure liquids' records; viscosity only if asked. */
function liquidProps(sys, x, T, who, viscosity) {
  let v = 0, mass = 0, lnMu = 0;
  x.forEach((xi, i) => {
    if (!(xi > 1e-12)) return;
    const c = pure(sys.ids[i], { userData: sys.userData });
    const get = (name, what) => {
      try { return c.property(name, T); } catch (e) { e.message = `${who}: the liquid's ${what} needs the ${what} of ${c.name}: ${e.message}`; throw e; }
    };
    v += xi * c.MW / 1000 / get("liquidDensity", "density");
    mass += xi * c.MW / 1000;
    if (viscosity) lnMu += xi * Math.log(get("liquidViscosity", "viscosity"));
  });
  const s = x.reduce((a, xi) => a + (xi > 1e-12 ? xi : 0), 0);
  return { rho: mass / v, mu: viscosity ? Math.exp(lnMu / s) : null };
}

/** The liquid phases of a flash result's liquid outlets: [{ F_kmol_h, x }], refusing a slurry. */
function liquidPhases(r, who) {
  const outs = [r.outlets?.liquid, r.outlets?.liquid2].filter(s => s && s.F_kmol_h > 0);
  const ph = outs.flatMap(s => s.phases);
  if (ph.some(p => p.type === "solid")) throw fail("NOT_AVAILABLE", `${who}: the liquid carries an inert solid; a slurry is not sized.`);
  return ph.filter(p => p.type === "liquid" && p.F_kmol_h > 0).map(p => ({ F_kmol_h: p.F_kmol_h, x: p.composition }));
}

function flashOf(r, o, who) {
  if (!r || typeof r !== "object" || !r.outlets) throw fail("BAD_INPUT", `${who}: give a flash drum's result (runUnit("flash", ...) or a flowsheet's block).`);
  if (r.type != null && r.type !== "flash") throw fail("BAD_INPUT", `${who}: the block is a ${r.type}, not a flash drum.`);
  const sys = o.sys;
  if (!sys || typeof sys.phase !== "function") throw fail("BAD_INPUT", `${who}: options.sys, the property package of the block, is needed for the densities.`);
  const s = [r.outlets.vapour, r.outlets.liquid].find(x => x?.T_K != null);
  const T = r.state?.T_K ?? s?.T_K, P = r.state?.P_kPa ?? s?.P_kPa;
  if (!(T > 0) || !(P > 0)) throw fail("BAD_INPUT", `${who}: the result has no temperature and pressure.`);
  return { sys, T, P };
}

/**
 * A flash block's result of a solved flowsheet, with its outlet streams (a flowsheet's block result names no outlets):
 * the flowsheet document, its result (solveFlowsheet), and the block's id.
 */
export function flashBlockResult(doc, result, id) {
  const b = (doc?.blocks ?? []).find(x => x.id === id), r = result?.blocks?.[id];
  if (!b || b.type !== "flash") throw fail("BAD_INPUT", `No flash drum "${id}" in the flowsheet.`);
  if (!r) throw fail("BAD_INPUT", `The flash drum ${id} is not calculated.`);
  const outlets = {};
  for (const s of doc.streams ?? []) {
    const [from, port] = String(s.from ?? "").split(".");
    if (from === id && result.streams?.[s.id]) outlets[port] = result.streams[s.id];
  }
  return { ...r, type: "flash", outlets };
}

const DRUM_OPTIONS = ["sys", "orientation", "fraction", "residence_min", "holdup_m3", "feedLine_m", "K_m_s"];
const DECANTER_OPTIONS = ["sys", "orientation", "dispersed", "droplet_um", "ratio", "interface"];

/**
 * The size of a flash drum (vertical or horizontal) from its result: options { sys (required), orientation, fraction
 * (of the permitted vapour velocity, 0.85), residence_min (of the liquid, 2) or holdup_m3, feedLine_m, K_m_s (your own
 * K, which replaces the fit) }. A three-phase drum's two liquids are its pool together; sizeDecanter sizes their split.
 */
export function sizeDrum(unitResult, options = {}) {
  const who = "Drum";
  known(options, DRUM_OPTIONS, who);
  const { sys, T, P } = flashOf(unitResult, options, who);
  const v = unitResult.outlets.vapour;
  if (!v || !(v.F_kmol_h > 0)) throw fail("BAD_INPUT", `${who}: the drum has no vapour, so no vapour velocity sets its size; size its liquids with sizeDecanter.`);
  const y = v.phases.find(p => p.type === "vapour")?.composition ?? v.z;
  const Z = sys.phase("vapour", T, P, y).Z ?? 1;
  const rhoV = v.MW / 1000 * P * 1000 / (Z * R * T);
  const liq = liquidPhases(unitResult, who);
  let WL = 0, QL = 0;
  for (const p of liq) {
    const { rho } = liquidProps(sys, p.x, T, who, false);
    const W = p.F_kmol_h / 3.6 * p.x.reduce((a, xi, i) => a + xi * sys.MW[i], 0) / 1000;   // kg/s
    WL += W; QL += W / rho;
  }
  const WV = v.mass_kg_h / 3600;
  // with no liquid the pool is empty and F = 0; the chart then gives no K: refused by kDrum unless K_m_s is given
  const rhoL = QL > 0 ? WL / QL : NaN;
  if (!(QL > 0)) throw fail("BAD_INPUT", `${who}: the drum has no liquid; give a block with vapour and liquid (or your own K_m_s and a liquid).`);
  const { sys: _s, ...o } = options;
  const out = drumGeometry({ WL_kg_s: WL, WV_kg_s: WV, rhoL, rhoV }, o);
  out.basis = { ...out.basis, T_K: T, P_kPa: P, Z, liquids: liq.length };
  if (liq.length > 1) out.notes.push("The drum holds two liquids; their pool is sized together here, and their split by sizeDecanter.");
  return out;
}

/**
 * The size of a decanter (vertical or horizontal) for a flash drum's two liquids: options { sys (required),
 * orientation ("vertical"), dispersed ("light" or "heavy"; the smaller volume flow by default), droplet_um (150),
 * ratio (H/D vertical 2, L/D horizontal 4), interface (its height over the diameter, horizontal: 0.5) }.
 */
export function sizeDecanter(unitResult, options = {}) {
  const who = "Decanter";
  known(options, DECANTER_OPTIONS, who);
  const { sys, T, P } = flashOf(unitResult, options, who);
  const liq = liquidPhases(unitResult, who);
  if (liq.length !== 2) throw fail("BAD_INPUT", `${who}: the drum holds ${liq.length === 1 ? "one liquid" : "no liquid"}; a decanter needs two.`);
  const phases = liq.map(p => {
    const { rho, mu } = liquidProps(sys, p.x, T, who, true);
    const W = p.F_kmol_h / 3.6 * p.x.reduce((a, xi, i) => a + xi * sys.MW[i], 0) / 1000;
    return { Q_m3_s: W / rho, rho, mu, F_kmol_h: p.F_kmol_h, x: Object.fromEntries(sys.ids.map((id, i) => [id, p.x[i]])) };
  }).sort((a, b) => a.rho - b.rho);
  const [light, heavy] = phases.map(({ Q_m3_s, rho, mu }) => ({ Q_m3_s, rho, mu }));
  const { sys: _s, ...o } = options;
  const out = decanterGeometry({ light, heavy }, o);
  out.basis = { ...out.basis, T_K: T, P_kPa: P, viscosityRule: MU_RULE,
    compositions: { light: phases[0].x, heavy: phases[1].x } };
  if (unitResult.outlets?.vapour?.F_kmol_h > 0) out.notes.push("The drum also has a vapour: sizeDrum sizes it for the vapour velocity.");
  return out;
}

const notYet = (what, when) => () => { throw fail("NOT_AVAILABLE", `${what} is not built yet: it comes with milestone ${when} of proposal 0015.`); };

/**
 * The diameter of a rigorous column from its result (runUnit("column", ...) or a flowsheet's column block, with its
 * profile), or the check of a given diameter: options { sys (required), tray_spacing_m (0.6), design_fraction (0.8),
 * diameter_m, net_area_fraction (0.9), hole_area_ratio (0.1), hole_diameter_mm (5), foaming_factor (1), tray ("sieve") }.
 * Fair's method on every tray (src/units/columns/hydraulics.js, where the equations and their open source are
 * written); the diameter from the largest required vapour-flow area. → { dimensions, basis, stages, warnings, notes,
 * source }.
 */
export function columnDiameter(unitResult, options = {}) {
  if (options == null || typeof options !== "object" || Array.isArray(options)) throw fail("BAD_INPUT", "Column sizing: the options must be an object.");
  const { sys, ...o } = options;
  if (!unitResult || typeof unitResult !== "object" || !Array.isArray(unitResult.profile)) throw fail("BAD_INPUT", "Column sizing: give a rigorous column's result (runUnit(\"column\", ...) or a flowsheet's column block), with its profile.");
  if (unitResult.type != null && unitResult.type !== "column") throw fail("BAD_INPUT", `Column sizing: the block is a ${unitResult.type}, not a column.`);
  if (unitResult.state?.mode && unitResult.state.mode !== "rigorous") throw fail("BAD_INPUT", "Column sizing: the diameter needs every stage's flows, the rigorous column's profile; the shortcut gives only its ends and its feed.");
  if (!sys || typeof sys.phase !== "function") throw fail("BAD_INPUT", "Column sizing: options.sys, the property package of the column, is needed for the densities and the surface tension.");
  return columnHydraulics(sys, unitResult.profile, o);
}
export const membraneArea = notYet("The membrane area", "M3");
