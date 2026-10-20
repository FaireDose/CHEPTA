/**
 * Heat-exchanger pre-sizing (layer 4; proposal 0013, step 1): Q = U A ΔT along the real temperature-heat curves of
 * both sides, with the arrangement's correction, the overall coefficient U from one of three sources, utilities, and
 * the minimum wall thickness for a pressure.
 *
 *   CHEPTA.exchangerArea(sys, {
 *     hot:  { stream, T_out_K: 320 },                         // a process stream and its outlet (or VF_out)
 *     cold: { utility: { kind: "water", T_in_K: 303.15, T_out_K: 313.15 } },
 *     U: { service: "steam-water-oil" },                      // or { value: 850 } or { film: {...} } (overallU)
 *     arrangement: "counterflow",                            // "cocurrent", "shell-and-tube" (shells), "crossflow-unmixed"
 *   }) → { duty_kW, area_m2, UA_kW_K, dT_min_K, dT_mean_K, zones, hot, cold, outlets, notes }
 *
 * Equations and data: J. H. Lienhard V and J. H. Lienhard IV, A Heat Transfer Textbook, 6th ed., version 6.00 (2024),
 * free from https://ahtt.mit.edu/ (src/data/heat-transfer.json):
 *  - zones: the duty is split into equal heat steps; each side's temperature at each step comes from a P-H flash of
 *    that side (the flash of every stream, src/stream/stream.js) or from the utility; each zone has the LMTD of
 *    eqn. 3.13, paired counterflow or cocurrent, and the zones' UA add up. With constant heat capacities they give
 *    back the single LMTD (test/heat-exchange.test.js);
 *  - multipass and crossflow: the LMTD correction F (eqn. 3.14) from the effectiveness-NTU relation of the
 *    arrangement (Table 3.1, eqns. 3.20-3.21), F = NTU_counterflow / NTU_arrangement, with ε and R = Cmin/Cmax of the
 *    terminal temperatures (constant heat capacities between the inlets and outlets, the basis of Table 3.1), applied
 *    to the counterflow UA of the zones. One F for the whole exchanger, not one per zone: split into small zones,
 *    every zone looks feasible and the temperature cross of a multipass exchanger would be hidden. With a side that
 *    changes phase the terminal F is an approximation (stated in the result); one side at constant temperature gives
 *    R = 0 and F = 1;
 *  - a temperature cross (ΔT <= 0 at any zone boundary) or a zone that the arrangement cannot reach (ε above its
 *    limit) is an error that names where, never an area;
 *  - U: a service's typical range (Table 2.2; the low end by default, the larger area), or film coefficients
 *    (Table 1.1), fouling resistances (Table 2.3; the high end by default) and a plane wall of a metal (Table A.1,
 *    k interpolated linearly in temperature, refused outside the table), 1/U = 1/h_hot + Rf_hot + t/k + Rf_cold +
 *    1/h_cold (eqn. 2.36 for fouling), or the user's own value.
 * Wall thickness: G. Lamé, Leçons sur la théorie mathématique de l'élasticité des corps solides (1852), § 80,
 * eqns. (22)-(23), pp. 190-191 (public domain; https://archive.org/details/leonssurlathori05lamgoog): the hoop stress
 * of a thick cylinder is largest at the inner wall, A = P (R² + R'²) / (R'² - R²) with no outer pressure, so the
 * least outer radius is R' = R √((A + P) / (A - P)); A is the allowable stress times the joint efficiency, both the
 * user's (no open table of allowable stresses: proposal 0013, section 4); a corrosion allowance is added.
 * Utilities: saturated steam and water from IAPWS-IF97 (src/thermo/iapws/steam.js).
 * Units: K, kPa, kW, m², W/(m² K); the interface converts.
 */
import data from "../data/heat-transfer.json" with { type: "json" };
import { fail } from "../util/errors.js";
import { stream } from "../stream/stream.js";
import { steam, steamSat } from "../thermo/iapws/steam.js";

/** The data of src/data/heat-transfer.json (Lienhard and Lienhard): services, film coefficients, fouling, metals. */
export const HEAT_TRANSFER = data;
export const ARRANGEMENTS = ["counterflow", "cocurrent", "shell-and-tube", "crossflow-unmixed"];
const SOURCE = "Lienhard and Lienhard, A Heat Transfer Textbook, 6th ed. (2024)";

const finite = (v, what, { positive = false, min = -Infinity } = {}) => {
  const x = Number(v);
  if (!Number.isFinite(x) || (positive && !(x > 0)) || x < min) throw fail("BAD_INPUT", `${what} must be ${positive ? "a positive number" : "a number"} (got ${JSON.stringify(v)}).`);
  return x;
};
const row = (table, id, what) => {
  const r = data[table].rows.find(x => x.id === id);
  if (!r) throw fail("BAD_INPUT", `Unknown ${what} "${id}". Known: ${data[table].rows.map(x => x.id).join(", ")}.`);
  return r;
};
/** A value from a [low, high] range: "low", "high", "mid" or a number of the person's within it. */
function fromRange([lo, hi], pick, what) {
  if (typeof pick === "number") {
    if ((lo != null && pick < lo) || (hi != null && pick > hi)) throw fail("BAD_INPUT", `${what}: ${pick} is outside the range ${lo ?? "…"}-${hi ?? "…"}.`);
    return pick;
  }
  if (pick === "low") return lo ?? hi;
  if (pick === "high") return hi ?? lo;
  if (pick === "mid") return lo != null && hi != null ? (lo + hi) / 2 : lo ?? hi;
  throw fail("BAD_INPUT", `${what}: pick "low", "high", "mid" or a number (got ${JSON.stringify(pick)}).`);
}

/** U of a service row (Table 2.2): the low end by default (the larger, safer area). */
export function serviceU(id, pick = "low") {
  const r = row("services", id, "service");
  return { U_W_m2K: fromRange(r.U, pick, r.label), range: r.U, bound: r.bound ?? null, label: r.label, source: `${SOURCE}, Table 2.2` };
}

/** Fouling resistance of a fluid (Table 2.3): the high end by default (the larger, safer area). */
export function foulingRf(id, pick = "high") {
  const r = row("fouling", id, "fouling row");
  return { Rf_m2K_W: fromRange(r.Rf, pick, r.label), range: r.Rf, bound: r.bound ?? null, label: r.label, source: `${SOURCE}, Table 2.3` };
}

/** A film coefficient (Table 1.1). */
export function filmH(id) {
  const r = row("film", id, "film coefficient");
  return { h_W_m2K: r.h, label: `${r.group}: ${r.label}`, source: `${SOURCE}, Table 1.1` };
}

/** The thermal conductivity of a wall metal at T (Table A.1, linear between the printed temperatures, with the 20 °C value). */
export function metalConductivity(id, T_K) {
  const r = row("metals", id, "metal");
  const pts = [...r.k.map(([t, k]) => [t, k]), [20, r.k20]].sort((a, b) => a[0] - b[0]);
  const t = finite(T_K, "Wall temperature T_K", { positive: true }) - 273.15;
  const lo = pts[0][0], hi = pts[pts.length - 1][0];
  if (t < lo - 1e-9 || t > hi + 1e-9) {
    throw fail("OUT_OF_RANGE", `${r.label}: thermal conductivity is tabulated from ${lo} to ${hi} °C (Table A.1); the wall is at ${+t.toFixed(1)} °C. Give your own conductivity, or choose another material.`);
  }
  let k = pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) { const [t0, k0] = pts[i - 1], [t1, k1] = pts[i]; k = k0 + (k1 - k0) * (t - t0) / (t1 - t0); break; }
  }
  const marks = r.k.filter(p => p[2]).map(p => `${p[1]}${p[2]} at ${p[0]} °C`);
  return { k_W_mK: k, label: r.label, range_C: [lo, hi], note: [r.note, marks.length ? `Printed with a mark (a little above "+" or below "-"): ${marks.join(", ")}.` : ""].filter(Boolean).join(" "),
    source: `${SOURCE}, Table A.1` };
}

/**
 * The overall heat transfer coefficient, W/(m² K), with how it was made:
 *  - { value }: the person's own;
 *  - { service, pick }: Table 2.2 (pick "low" by default);
 *  - { film: { hot: { h | hId, Rf | RfId, RfPick }, cold: {...}, wall: { material | k_W_mK, t_mm } } } with T_wall_K
 *    (needed for a material): 1/U = 1/h_hot + Rf_hot + t/k + Rf_cold + 1/h_cold, a plane wall.
 */
export function overallU(spec, { T_wall_K = null } = {}) {
  if (typeof spec === "number") spec = { value: spec };
  if (!spec || typeof spec !== "object") throw fail("BAD_INPUT", "U: give { value }, { service } or { film } (see overallU).");
  if (spec.value != null) {
    const U = finite(spec.value, "U", { positive: true });
    return { U_W_m2K: U, how: "your own value", parts: [] };
  }
  if (spec.service != null) {
    const s = serviceU(spec.service, spec.pick ?? "low");
    return { U_W_m2K: s.U_W_m2K, how: `${s.label}: ${s.range[0] ?? "…"}-${s.range[1] ?? "…"} W/(m² K)${s.bound ? ` (${s.bound})` : ""}, ${spec.pick && spec.pick !== "low" ? `${spec.pick} taken` : "the low end taken (the larger area)"}; ${s.source}`, parts: [] };
  }
  if (spec.film) {
    const parts = [];
    const side = (o, which) => {
      if (!o) throw fail("BAD_INPUT", `U from film coefficients: give the ${which} side ({ h } or { hId }).`);
      const h = o.h != null ? finite(o.h, `h of the ${which} side`, { positive: true }) : filmH(o.hId).h_W_m2K;
      parts.push({ what: `${which} film`, R_m2K_W: 1 / h, from: o.h != null ? "your own" : filmH(o.hId).label });
      if (o.Rf != null || o.RfId != null) {
        const Rf = o.Rf != null ? finite(o.Rf, `fouling resistance of the ${which} side`, { min: 0 }) : foulingRf(o.RfId, o.RfPick ?? "high").Rf_m2K_W;
        parts.push({ what: `${which} fouling`, R_m2K_W: Rf, from: o.Rf != null ? "your own" : foulingRf(o.RfId).label });
      }
    };
    side(spec.film.hot, "hot");
    side(spec.film.cold, "cold");
    const w = spec.film.wall;
    if (w) {
      const t = finite(w.t_mm, "wall thickness t_mm", { min: 0 }) / 1000;
      let k, from;
      if (w.k_W_mK != null) { k = finite(w.k_W_mK, "wall conductivity", { positive: true }); from = "your own"; }
      else {
        if (T_wall_K == null) throw fail("BAD_INPUT", "U from film coefficients: the wall temperature is needed for a material's conductivity.");
        const m = metalConductivity(w.material, T_wall_K); k = m.k_W_mK; from = `${m.label}, k = ${+k.toFixed(3)} W/(m K) at ${+(T_wall_K - 273.15).toFixed(1)} °C`;
      }
      parts.push({ what: "wall", R_m2K_W: t / k, from });
    }
    const sum = parts.reduce((a, p) => a + p.R_m2K_W, 0);
    return { U_W_m2K: 1 / sum, how: "from film coefficients, fouling and the wall (1/U = sum of the resistances; Lienhard and Lienhard, eqn. 2.36)", parts };
  }
  throw fail("BAD_INPUT", "U: give { value }, { service } or { film }.");
}

/**
 * Minimum wall thickness of a tube or shell under internal pressure (Lamé 1852, § 80): P_kPa the design pressure
 * difference (inside minus outside), D_in_mm the inside diameter, S_MPa the allowable stress (the person's), E the
 * weld joint efficiency (1 for a seamless tube), c_mm a corrosion allowance.
 */
export function wallThickness({ P_kPa, D_in_mm, S_MPa, E = 1, c_mm = 0 } = {}) {
  const P = finite(P_kPa, "Design pressure P_kPa", { min: 0 }) / 1000;   // MPa
  const R = finite(D_in_mm, "Inside diameter D_in_mm", { positive: true }) / 2;
  const S = finite(S_MPa, "Allowable stress S_MPa", { positive: true });
  const e = finite(E, "Joint efficiency E", { positive: true });
  if (e > 1) throw fail("BAD_INPUT", `Joint efficiency E must be at most 1 (got ${E}).`);
  const c = finite(c_mm, "Corrosion allowance c_mm", { min: 0 });
  const A = S * e;
  if (!(P < A)) throw fail("BAD_INPUT", `The pressure (${+(P * 1000).toFixed(1)} kPa) is not below the allowable stress times the joint efficiency (${+(A * 1000).toFixed(1)} kPa): no wall thickness holds it (Lamé 1852, § 80, eqn. 23).`);
  const Ro = R * Math.sqrt((A + P) / (A - P));
  const t = Ro - R;
  return { t_mm: t + c, t_pressure_mm: t, c_mm: c, thin_wall_mm: P * R / A,
    method: "Lamé (1852), § 80, eqns. (22)-(23): thick-walled cylinder, hoop stress at the inner wall equal to S E; plus the corrosion allowance" };
}

// ---------------------------------------------------------------------------------------
// Effectiveness-NTU (Lienhard and Lienhard, eqns. 3.20-3.21 and Table 3.1): NTU from ε and R = Cmin/Cmax

const coth = x => 1 / Math.tanh(x);
/** ε of an arrangement for NTU and R. */
export function effectiveness(arr, NTU, R, shells = 1) {
  if (R < 1e-12) return 1 - Math.exp(-NTU);
  switch (arr) {
    case "counterflow": return Math.abs(1 - R) < 1e-12 ? NTU / (1 + NTU) : (1 - Math.exp(-(1 - R) * NTU)) / (1 - R * Math.exp(-(1 - R) * NTU));
    case "cocurrent": return (1 - Math.exp(-(1 + R) * NTU)) / (1 + R);
    case "shell-and-tube": {
      const s = Math.sqrt(1 + R * R), n = NTU / shells, G = n * s;
      const ep = 2 / ((1 + R) + s * coth(G / 2));
      if (shells === 1) return ep;
      if (Math.abs(1 - R) < 1e-12) return shells * ep / (1 + (shells - 1) * ep);
      const X = Math.pow((1 - ep * R) / (1 - ep), shells);
      return (X - 1) / (X - R);
    }
    case "crossflow-unmixed":
      if (R > 0.3 && NTU > 1) return (1 + 0.44 * (1 - R)) * (1 - Math.pow(0.92 + Math.pow(Math.PI * Math.pow(R, 0.15) * NTU, 1.25), -0.4));
      return 1 - Math.exp((Math.exp(-Math.pow(R, 1.15) * NTU) - 1) / Math.pow(R, 1.15));
    default: throw fail("BAD_INPUT", `Unknown arrangement "${arr}". Known: ${ARRANGEMENTS.join(", ")}.`);
  }
}

/** NTU for ε and R, or null when the arrangement cannot reach ε (the reason is given by the caller). */
export function ntuFor(arr, eps, R, shells = 1) {
  if (!(eps > 0)) return 0;
  if (!(eps < 1)) return null;
  if (R < 1e-12) return -Math.log(1 - eps);
  if (arr === "counterflow") {
    if (Math.abs(1 - R) < 1e-12) return eps / (1 - eps);
    if (eps * R >= 1) return null;
    return Math.log((1 - eps * R) / (1 - eps)) / (1 - R);
  }
  if (arr === "cocurrent") {
    const x = 1 - eps * (1 + R);
    return x > 0 ? -Math.log(x) / (1 + R) : null;
  }
  if (arr === "shell-and-tube") {
    // ε of one shell from the whole (Table 3.1, N shells), then the one-shell, two-tube-pass relation inverted
    let ep;
    if (shells === 1) ep = eps;
    else if (Math.abs(1 - R) < 1e-12) ep = eps / (shells - (shells - 1) * eps);
    else { const X = Math.pow((1 - eps * R) / (1 - eps), 1 / shells); ep = (X - 1) / (X - R); }
    const s = Math.sqrt(1 + R * R), y = (2 / ep - (1 + R)) / s;
    if (!(y > 1)) return null;
    return shells * Math.log((y + 1) / (y - 1)) / s;   // G/2 = arccoth(y), NTU per shell = G / s
  }
  if (arr === "crossflow-unmixed") {
    // the correlations of Table 3.1 are approximate (≃) and not inverted in closed form: bisection on NTU
    let lo = 0, hi = 60;
    if (effectiveness(arr, hi, R) < eps) return null;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (effectiveness(arr, m, R) < eps) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  throw fail("BAD_INPUT", `Unknown arrangement "${arr}". Known: ${ARRANGEMENTS.join(", ")}.`);
}

// ---------------------------------------------------------------------------------------
// The two sides: a process stream (P-H flashes), or a utility

const fmtK = T => `${+(T - 273.15).toFixed(2)} °C`;

/** Water at P: the temperature where its enthalpy is h (kJ/kg), between T0 and T1 (IF97, bisection). */
function waterT(h, P, T0, T1) {
  let lo = Math.min(T0, T1), hi = Math.max(T0, T1);
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (steam(m, P).h_kJ_kg < h) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** A process side: its inlet, its outlet for a heat Q (kW, > 0 out of the hot side, into the cold), and its curve. */
function processSide(sys, s, role) {
  const st = s.stream;
  if (!st || !Array.isArray(st.flows)) throw fail("BAD_INPUT", `The ${role} side: give a stream (CHEPTA.stream) or a utility.`);
  if (!(st.F_kmol_h > 0)) throw fail("BAD_INPUT", `The ${role} side has no flow.`);
  const dP = s.dP_kPa == null ? 0 : finite(s.dP_kPa, `${role} side: dP_kPa`, { min: 0 });
  if (!(st.P_kPa - dP > 0)) throw fail("BAD_INPUT", `The ${role} side: the pressure drop (${dP} kPa) is larger than its inlet pressure (${st.P_kPa} kPa).`);
  const sign = role === "hot" ? -1 : 1;
  const at = (q, Q) => stream(sys, { flow_kmol_h: st.flows, P_kPa: st.P_kPa - dP * (Q > 0 ? q / Q : 0), H_kW: st.H_kW + sign * q });
  /** The heat of this side's outlet specification, or null when it has none. */
  const ownQ = () => {
    const has = k => s[k] != null;
    const given = ["T_out_K", "VF_out"].filter(has);
    if (given.length > 1) throw fail("BAD_INPUT", `The ${role} side: give T_out_K or VF_out, not both.`);
    if (!given.length) return null;
    const out = stream(sys, { flow_kmol_h: st.flows, P_kPa: st.P_kPa - dP, ...(has("T_out_K") ? { T_K: finite(s.T_out_K, `${role} side: T_out_K`, { positive: true }) } : { VF: finite(s.VF_out, `${role} side: VF_out`, { min: 0 }) }) });
    const q = sign * (out.H_kW - st.H_kW);
    if (!(q > 0)) throw fail("BAD_INPUT", `The ${role} side's outlet (${fmtK(out.T_K)}${out.VF != null ? `, vapour fraction ${+out.VF.toFixed(4)}` : ""}) would ${role === "hot" ? "take heat in" : "give heat out"}: the ${role} stream must ${role === "hot" ? "cool down" : "heat up"}.`);
    return q;
  };
  return { kind: "process", st, at, ownQ, T_in: st.T_K, P_in: st.P_kPa, dP };
}

/** A utility side: { kind: "steam", P_kPa } (condensing, hot only), { kind: "water", T_in_K, T_out_K, P_kPa },
 *  { kind: "fluid", T_K } (constant temperature) or { kind: "fluid", T_in_K, T_out_K, cp_J_kgK }. */
function utilitySide(u, role) {
  const kind = u.kind;
  if (kind === "steam") {
    if (role !== "hot") throw fail("BAD_INPUT", "Steam heats: for cooling choose water or a fluid of your own.");
    const P = finite(u.P_kPa, "Steam pressure P_kPa", { positive: true });
    const sat = steamSat({ P_kPa: P });
    return { kind, T: () => sat.T_K, T_in: sat.T_K, P_in: P, flow: Q => Q / sat.hfg_kJ_kg * 3600,
      describe: Q => `saturated steam at ${P} kPa condensing at ${fmtK(sat.T_K)}: ${+(Q / sat.hfg_kJ_kg * 3600).toPrecision(5)} kg/h (latent heat ${+sat.hfg_kJ_kg.toFixed(1)} kJ/kg, IAPWS-IF97)` };
  }
  if (kind === "water") {
    const P = u.P_kPa == null ? 101.325 : finite(u.P_kPa, "Water pressure P_kPa", { positive: true });
    const Ti = finite(u.T_in_K, "Water inlet T_in_K", { positive: true }), To = finite(u.T_out_K, "Water outlet T_out_K", { positive: true });
    if (role === "cold" ? !(To > Ti) : !(To < Ti)) throw fail("BAD_INPUT", `${role === "cold" ? "Cooling" : "Heating"} water must ${role === "cold" ? "warm up" : "cool down"}: inlet ${fmtK(Ti)}, outlet ${fmtK(To)}.`);
    const Tb = steamSat({ P_kPa: P }).T_K;
    if (Math.max(Ti, To) >= Tb) throw fail("BAD_INPUT", `Water at ${P} kPa boils at ${fmtK(Tb)}; its temperatures (${fmtK(Ti)} to ${fmtK(To)}) must stay below that: raise its pressure.`);
    const hi = steam(Ti, P).h_kJ_kg, ho = steam(To, P).h_kJ_kg, dh = Math.abs(ho - hi);
    return { kind, T_in: Ti, P_in: P,
      // the water's temperature after it has exchanged q of Q: linear in enthalpy
      T: (q, Q) => waterT(hi + Math.sign(ho - hi) * dh * (Q > 0 ? q / Q : 0), P, Ti, To),
      flow: Q => Q / dh * 3600,
      describe: Q => `water at ${P} kPa from ${fmtK(Ti)} to ${fmtK(To)}: ${+(Q / dh * 3600).toPrecision(5)} kg/h (IAPWS-IF97)` };
  }
  if (kind === "fluid") {
    if (u.T_K != null) {
      const T = finite(u.T_K, "Utility T_K", { positive: true });
      return { kind, T: () => T, T_in: T, P_in: null, flow: () => null, describe: () => `a fluid of your own at a constant ${fmtK(T)}` };
    }
    const Ti = finite(u.T_in_K, "Utility T_in_K", { positive: true }), To = finite(u.T_out_K, "Utility T_out_K", { positive: true });
    const cp = finite(u.cp_J_kgK, "Utility heat capacity cp_J_kgK", { positive: true });
    if (role === "cold" ? !(To > Ti) : !(To < Ti)) throw fail("BAD_INPUT", `The utility on the ${role} side must ${role === "cold" ? "warm up" : "cool down"}: inlet ${fmtK(Ti)}, outlet ${fmtK(To)}.`);
    const dT = Math.abs(To - Ti);
    return { kind, T_in: Ti, P_in: null, T: (q, Q) => Ti + (To - Ti) * (Q > 0 ? q / Q : 0), flow: Q => Q * 1000 / (cp * dT) * 3600,
      describe: Q => `a fluid of your own from ${fmtK(Ti)} to ${fmtK(To)}, cp ${cp} J/(kg K): ${+(Q * 1000 / (cp * dT) * 3600).toPrecision(5)} kg/h` };
  }
  throw fail("BAD_INPUT", `Unknown utility "${kind}". Known: steam, water, fluid (electric heating needs no exchanger).`);
}

// ---------------------------------------------------------------------------------------

/**
 * Pre-size an exchanger: the duty, the temperature-heat curves of both sides by zones, and with U the area.
 * @param {object} sys   the system of the process streams (any side may be a utility instead)
 * @param {object} o
 * @param {object} o.hot, o.cold   { stream, T_out_K | VF_out, dP_kPa } or { utility }
 * @param {number} [o.duty_kW]     the heat exchanged (> 0), instead of an outlet specification
 * @param {number|object} [o.U]    see overallU; without it, no area
 * @param {string} [o.arrangement="counterflow"]  with `shells` for "shell-and-tube" (one shell pass, two tube passes each)
 * @param {number} [o.zones=20]
 */
export function exchangerArea(sys, o = {}) {
  const arr = o.arrangement ?? "counterflow";
  if (!ARRANGEMENTS.includes(arr)) throw fail("BAD_INPUT", `Unknown arrangement "${arr}". Known: ${ARRANGEMENTS.join(", ")}.`);
  const shells = o.shells == null ? 1 : finite(o.shells, "shells", { positive: true });
  if (!Number.isInteger(shells) || shells > 10) throw fail("BAD_INPUT", `shells must be a whole number from 1 to 10 (got ${o.shells}).`);
  const N = o.zones == null ? 20 : finite(o.zones, "zones", { positive: true });
  if (!Number.isInteger(N) || N > 500) throw fail("BAD_INPUT", `zones must be a whole number from 1 to 500 (got ${o.zones}).`);
  const make = (s, role) => {
    if (!s || typeof s !== "object") throw fail("BAD_INPUT", `Give the ${role} side: a process stream or a utility.`);
    return s.utility ? utilitySide(s.utility, role) : processSide(sys, s, role);
  };
  const H = make(o.hot, "hot"), C = make(o.cold, "cold");
  if (H.kind !== "process" && C.kind !== "process" && o.duty_kW == null) throw fail("BAD_INPUT", "With a utility on both sides, give the duty.");
  // the heat: given, or from the one process side with an outlet specification
  const own = [H, C].map(s => (s.kind === "process" ? s.ownQ() : null));
  let Q;
  if (o.duty_kW != null) {
    if (own.some(q => q != null)) throw fail("BAD_INPUT", "Give the duty or an outlet of a process stream, not both.");
    Q = finite(o.duty_kW, "duty_kW", { positive: true });
  } else {
    const given = own.filter(q => q != null);
    if (given.length !== 1) throw fail("BAD_INPUT", given.length ? "Give the outlet of one process stream only: the other follows from the energy balance." : "Give the outlet of a process stream (T_out_K or VF_out) or the duty.");
    Q = given[0];
  }
  // the curves: temperature (and vapour fraction) of each side at each zone boundary, by heat exchanged
  const curve = s => Array.from({ length: N + 1 }, (_, k) => {
    const q = Q * k / N;
    if (s.kind === "process") { const st = s.at(q, Q); return { T: st.T_K, VF: st.VF, P: st.P_kPa, st }; }
    return { T: s.T(q, Q), VF: null, P: s.P_in };
  });
  const hc = curve(H), cc = curve(C);
  // pair the two sides along the exchanger: counterflow (and multipass, crossflow, which are corrected from it):
  // the hot side at k meets the cold side that has still to take Q - q; cocurrent: both from their inlets
  const co = arr === "cocurrent";
  const pts = hc.map((p, k) => ({ q: Q * k / N, Th: p.T, Tc: cc[co ? k : N - k].T, hVF: p.VF, cVF: cc[co ? k : N - k].VF }));
  for (const p of pts) {
    if (!(p.Th - p.Tc > 1e-6)) {
      throw fail("BAD_INPUT", `Temperature cross: where ${+p.q.toPrecision(4)} kW of ${+Q.toPrecision(4)} kW has left the hot side, the hot side is at ${fmtK(p.Th)} and the cold side at ${fmtK(p.Tc)}${co ? " (cocurrent)" : ""}. Heat cannot flow there: lower the duty, change an outlet${co ? ", or use counterflow" : ""}.`, { at: p });
    }
  }
  let U = null, how = null, parts = [];
  if (o.U != null) {
    const Twall = (hc.reduce((a, p) => a + p.T, 0) / hc.length + cc.reduce((a, p) => a + p.T, 0) / cc.length) / 2;
    const u = overallU(o.U, { T_wall_K: Twall });
    U = u.U_W_m2K; how = u.how; parts = u.parts;
  }
  // the arrangement's correction, from the terminal temperatures
  let F = 1, linear = true;
  if (!co && arr !== "counterflow") {
    const ThI = hc[0].T, ThO = hc[N].T, TcI = cc[0].T, TcO = cc[N].T;
    const dTh = ThI - ThO, dTc = TcO - TcI, big = Math.max(dTh, dTc), small = Math.min(dTh, dTc);
    const R = big > 0 ? Math.max(0, small) / big : 0;
    const eps = big / (ThI - TcI);
    const nArr = ntuFor(arr, eps, R, shells), nCf = ntuFor("counterflow", eps, R);
    if (nArr == null) {
      throw fail("BAD_INPUT", `A ${arr === "shell-and-tube" ? `${shells === 1 ? "one-shell" : `${shells}-shell`} exchanger (two tube passes per shell)` : "crossflow exchanger"} cannot reach these temperatures (hot ${fmtK(ThI)} to ${fmtK(ThO)}, cold ${fmtK(TcI)} to ${fmtK(TcO)}): its effectiveness would be ${eps.toFixed(3)}, above what the arrangement can give. ${arr === "shell-and-tube" ? "Put more shells in series, or use counterflow." : "Use counterflow."}`);
    }
    F = nArr > 0 ? nCf / nArr : 1;
    // a side whose temperature does not follow its heat in a straight line (it changes phase): the terminal F is an approximation
    const bend = c => c.some((p, k) => Math.abs(p.T - (c[0].T + (c[N].T - c[0].T) * k / N)) > 0.02 * Math.max(1e-9, Math.abs(c[N].T - c[0].T)));
    linear = !(bend(hc) || bend(cc));
  }
  const zones = [];
  let A = 0, UA = 0;
  for (let k = 0; k < N; k++) {
    const a = pts[k], b = pts[k + 1], dQ = (b.q - a.q) * 1000;   // W
    const d1 = a.Th - a.Tc, d2 = b.Th - b.Tc;
    const lm = Math.abs(d1 - d2) < 1e-9 * Math.max(d1, d2) ? (d1 + d2) / 2 : (d1 - d2) / Math.log(d1 / d2);
    const ua = dQ / lm / F;   // W/K
    UA += ua;
    const dA = U ? ua / U : null;
    if (dA != null) A += dA;
    zones.push({ q0_kW: a.q, q1_kW: b.q, Th0_K: a.Th, Th1_K: b.Th, Tc0_K: a.Tc, Tc1_K: b.Tc, dT_lm_K: lm, UA_W_K: ua, area_m2: dA, hotVF: b.hVF, coldVF: b.cVF });
  }
  const Fmin = F;
  const dTmin = Math.min(...pts.map(p => p.Th - p.Tc));
  const at = pts.find(p => p.Th - p.Tc === dTmin);
  const side = (s, c, role) => s.kind === "process"
    ? { kind: "process", T_in_K: c[0].T, T_out_K: c[N].T, P_in_kPa: c[0].P, P_out_kPa: c[N].P, VF_out: c[N].VF, flow_kg_h: s.st.mass_kg_h }
    : { kind: s.kind, T_in_K: c[0].T, T_out_K: c[N].T, P_kPa: s.P_in, flow_kg_h: s.flow(Q), describe: s.describe(Q) };
  const notes = [];
  if (arr === "shell-and-tube" || arr === "crossflow-unmixed") {
    notes.push(`LMTD correction F = ${F.toFixed(3)} for the ${arr === "shell-and-tube" ? `${shells}-shell exchanger` : "crossflow exchanger"}, from the terminal temperatures${linear ? "" : "; a side changes phase, so its temperature is not linear in its heat and F from the terminal temperatures is an approximation"}${F < 0.75 ? ". F is below 0.75: the arrangement is far from counterflow; more shells in series would help" : ""}.`);
  }
  if (U != null && parts.length) notes.push(`U = ${U.toPrecision(4)} W/(m² K): ${parts.map(p => `${p.what} ${p.R_m2K_W.toExponential(3)} m² K/W (${p.from})`).join("; ")}.`);
  return {
    duty_kW: Q, arrangement: arr, shells: arr === "shell-and-tube" ? shells : null,
    U_W_m2K: U, U_how: how, U_parts: parts,
    area_m2: U ? A : null, UA_kW_K: UA / 1000, dT_mean_K: Q * 1000 / UA, dT_min_K: dTmin,
    pinch: { q_kW: at.q, Th_K: at.Th, Tc_K: at.Tc }, F, F_min: Fmin,
    zones, hot: side(H, hc, "hot"), cold: side(C, cc, "cold"),
    outlets: { hot: H.kind === "process" ? hc[N].st : null, cold: C.kind === "process" ? cc[N].st : null },
    notes,
  };
}
