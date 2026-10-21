/**
 * Property charts of a fluid or a mixture with an equation of state (proposal 0013, step 7): the data of a
 * pressure-enthalpy, temperature-entropy or enthalpy-entropy (Mollier) chart, with the two-phase dome, lines of constant
 * pressure, temperature and vapour fraction, and a compression or expansion drawn on it.
 *
 *   CHEPTA.propertyChart(sys, z, { P_kPa: [100, 1000, 5000], T_K: [250, 300], VF: [0.25, 0.5, 0.75],
 *     compression: { T_K: 300, P_kPa: 2000, P_out_kPa: 6000, efficiency: 0.75 } })
 *
 * Every point is a flash of the feed z (src/equilibrium/flash.js) with its enthalpy and entropy (src/thermo/enthalpy.js:
 * reference the ideal gas of each component at 298.15 K and 101.325 kPa), so a chart shows exactly what the flowsheet
 * calculates. The dome is, for one component, its saturated liquid and vapour from the equation's own vapour pressure
 * (sys.psatEos) up to the critical point; for a mixture, the feed at its bubble and dew points along the phase envelope
 * (src/equilibrium/envelope.js), whose two branches meet at the mixture critical point. A pure fluid's isobars and
 * isotherms are flat inside the dome (the saturated ends are added), a mixture's cross it as its flashes give. The
 * compression is the inlet, the isentropic outlet (P-S flash) and the outlet at the isentropic efficiency (P-H flash);
 * the path between inlet and outlet is not calculated (it depends on the machine), so it is drawn as a straight line.
 * Water and steam keep their own chart from IAPWS-IF97 (the Charts workspace).
 *
 * Units: K, kPa, J/mol, J/(mol K). Points that a flash cannot reach (outside a record's range, or a solver that fails)
 * are left out and counted in `notes`.
 */
import { fail } from "../util/errors.js";
import { flash } from "./flash.js";
import { phaseEnvelope } from "./envelope.js";
import { componentRecord } from "../thermo/components.js";

const pointOf = r => ({ T_K: r.T, P_kPa: r.P, h_J_mol: r.H_J_mol, s_J_molK: r.S_J_molK, VF: r.VF });
const state = (sys, ph, T, P, z, VF) => {
  const st = sys.phase(ph, T, P, z, { entropy: true });
  return { T_K: T, P_kPa: P, h_J_mol: st.h_J_mol, s_J_molK: st.s_J_molK, VF };
};
const logspace = (a, b, n) => Array.from({ length: n }, (_, k) => a * (b / a) ** (k / (n - 1)));
const linspace = (a, b, n) => Array.from({ length: n }, (_, k) => a + (b - a) * k / (n - 1));

/**
 * The chart data. opts: P_kPa (isobars), T_K (isotherms), VF (lines of constant vapour fraction, 0 < VF < 1),
 * Tmin_K and Tmax_K (the temperature range of the isobars), Pmin_kPa and Pmax_kPa (the pressure range of the isotherms),
 * points (per line, default 48), compression { T_K, P_kPa, P_out_kPa, efficiency } (optional).
 * @returns {{dome:{liquid:object[], vapour:object[], critical:object|null}, isobars:{P_kPa:number, points:object[]}[],
 *   isotherms:{T_K:number, points:object[]}[], quality:{VF:number, points:object[]}[], compression:object|null, notes:string[]}}
 */
export function propertyChart(sys, z, opts = {}) {
  if (sys?.kind !== "eos") throw fail("BAD_INPUT", "Property charts need an equation of state (Peng–Robinson or SRK), which describes the gas and the liquid up to the critical point; water and steam have their own chart (IAPWS-IF97).");
  const n = sys.n;
  if (!Array.isArray(z) || z.length !== n || z.some(v => !(v >= 0)) || !(z.reduce((a, v) => a + v, 0) > 0)) throw fail("BAD_INPUT", `Give ${n} mole fractions, none negative, with a positive sum.`);
  const sz = z.reduce((a, v) => a + v, 0);
  z = z.map(v => v / sz);
  const N = opts.points ?? 48;
  const notes = [];
  let missed = 0;
  const tryPoint = fn => { try { return fn(); } catch (e) { if (e && e.code) { missed++; return null; } throw e; } };
  const fl = spec => flash(sys, { z, ...spec }, { entropy: true });

  // ---- the dome
  const liquid = [], vapour = [];
  let critical = null;
  if (n === 1) {
    const c = sys.eos.comps[0], Tc = c.Tc_K;
    // from 0.55 Tc, or the melting point where that is higher (carbon dioxide: its triple point, 216.6 K); denser
    // towards the critical point, which the last point approaches to within 0.05 %
    const fus = componentRecord(sys.ids[0], sys.userData)?.fusion;
    const lo = Math.max(0.55, fus && fus.available !== false && fus.Tm_K < 0.95 * Tc ? fus.Tm_K / Tc : 0);
    if (lo > 0.55) notes.push(`The dome starts at the melting point, ${+fus.Tm_K.toFixed(2)} K: below it the liquid freezes.`);
    for (const f of linspace(0, 1, N)) {
      const T = Tc * (lo + (0.9995 - lo) * (1 - (1 - f) ** 2));
      const P = tryPoint(() => sys.psatEos(T)[0]);
      if (P == null) continue;
      const L = tryPoint(() => state(sys, "liquid", T, P, z, 0)), V = tryPoint(() => state(sys, "vapour", T, P, z, 1));
      if (L && V) { liquid.push(L); vapour.push(V); }
    }
    if (liquid.length) {
      const a = liquid.at(-1), b = vapour.at(-1);
      critical = { T_K: Tc, P_kPa: c.Pc_Pa / 1000, h_J_mol: (a.h_J_mol + b.h_J_mol) / 2, s_J_molK: (a.s_J_molK + b.s_J_molK) / 2 };
    }
  } else {
    const env = phaseEnvelope(sys, z);
    if (!env.complete) notes.push(...env.notes);
    for (const p of env.points) {
      const st = tryPoint(() => state(sys, p.branch === "dew" ? "vapour" : "liquid", p.T_K, p.P_kPa, z, p.branch === "dew" ? 1 : 0));
      if (st) (p.branch === "dew" ? vapour : liquid).push(st);
    }
    if (env.critical) {
      const st = tryPoint(() => state(sys, "liquid", env.critical.T_K, env.critical.P_kPa, z, null));
      critical = st ? { ...st, VF: undefined } : { T_K: env.critical.T_K, P_kPa: env.critical.P_kPa, h_J_mol: null, s_J_molK: null };
    }
  }
  const domeT = [...liquid, ...vapour].map(p => p.T_K);
  const domeP = [...liquid, ...vapour].map(p => p.P_kPa);
  const Tc = n === 1 ? sys.eos.comps[0].Tc_K : critical?.T_K ?? Math.max(...sys.eos.comps.map(c => c.Tc_K));
  const Tmin = opts.Tmin_K ?? (domeT.length ? Math.min(...domeT) : 0.6 * Tc);
  const Tmax = opts.Tmax_K ?? Math.max(1.6 * Tc, (domeT.length ? Math.max(...domeT) : Tc) + 150);
  const Pc = n === 1 ? sys.eos.comps[0].Pc_Pa / 1000 : Math.max(...(domeP.length ? domeP : [1000]));

  // ---- isobars: T from Tmin to Tmax; a pure fluid's saturated ends (and a mixture's bubble and dew points) added
  const isobars = (opts.P_kPa ?? []).map(P => {
    const pts = linspace(Tmin, Tmax, N).map(T => tryPoint(() => pointOf(fl({ T, P })))).filter(Boolean);
    if (n === 1) {
      if (P < Pc) {
        const r0 = tryPoint(() => fl({ P, VF: 0 })), r1 = tryPoint(() => fl({ P, VF: 1 }));
        if (r0 && r1) pts.push(state(sys, "liquid", r0.T, P, z, 0), state(sys, "vapour", r1.T, P, z, 1));
      }
    } else {
      for (const VF of [0, 1]) { const r = tryPoint(() => fl({ P, VF })); if (r) pts.push(pointOf(r)); }
    }
    return { P_kPa: P, points: order(pts) };
  });

  // ---- isotherms: P from Pmin to Pmax (log); a pure fluid's saturated ends added below Tc
  const Ps = opts.P_kPa?.length ? opts.P_kPa : [Pc];
  const Pmin = opts.Pmin_kPa ?? Math.min(...Ps) / 2, Pmax = opts.Pmax_kPa ?? Math.max(...Ps) * 2;
  const isotherms = (opts.T_K ?? []).map(T => {
    const pts = logspace(Pmin, Pmax, N).map(P => tryPoint(() => pointOf(fl({ T, P })))).filter(Boolean);
    if (n === 1 && T < Tc) {
      const P = tryPoint(() => sys.psatEos(T)[0]);
      if (P != null) {
        const L = tryPoint(() => state(sys, "liquid", T, P, z, 0)), V = tryPoint(() => state(sys, "vapour", T, P, z, 1));
        if (L && V) pts.push(L, V);
      }
    }
    return { T_K: T, points: order(pts) };
  });

  // ---- lines of constant vapour fraction inside the dome: a pure fluid's by the lever rule on its dome, a mixture's
  // by P-VF flashes along the dome's pressures
  const quality = (opts.VF ?? []).filter(v => v > 0 && v < 1).map(VF => {
    let pts;
    if (n === 1) {
      pts = liquid.map((L, k) => { const V = vapour[k]; return { T_K: L.T_K, P_kPa: L.P_kPa, VF, h_J_mol: L.h_J_mol + VF * (V.h_J_mol - L.h_J_mol), s_J_molK: L.s_J_molK + VF * (V.s_J_molK - L.s_J_molK) }; });
    } else {
      const lo = Math.min(...domeP), hi = critical?.P_kPa ?? Math.max(...domeP);
      pts = logspace(lo, hi * 0.98, Math.ceil(N / 2)).map(P => tryPoint(() => pointOf(fl({ P, VF })))).filter(Boolean);
    }
    return { VF, points: pts };
  });

  // ---- a compression or expansion: inlet, isentropic outlet, outlet at the efficiency
  let compression = null;
  if (opts.compression) {
    const c = opts.compression;
    const eta = c.efficiency ?? 1;
    if (!(eta > 0 && eta <= 1)) throw fail("BAD_INPUT", `compression: the isentropic efficiency is a fraction, above 0 and at most 1 (got ${c.efficiency}).`);
    const a = fl({ T: c.T_K, P: c.P_kPa });
    const iso = fl({ P: c.P_out_kPa, S: a.S_J_molK });
    const ws = iso.H_J_mol - a.H_J_mol;
    const up = c.P_out_kPa >= c.P_kPa;
    const w = up ? ws / eta : eta * ws;
    const out = fl({ P: c.P_out_kPa, H: a.H_J_mol + w });
    compression = { inlet: pointOf(a), isentropic: pointOf(iso), outlet: pointOf(out), efficiency: eta, w_s_J_mol: ws, w_J_mol: w, kind: up ? "compression" : "expansion" };
  }
  if (missed) notes.push(`${missed} point${missed > 1 ? "s" : ""} could not be calculated (outside a record's range, or a flash that did not converge) and ${missed > 1 ? "are" : "is"} left out.`);
  return { dome: { liquid, vapour, critical }, isobars, isotherms, quality, compression, notes };
}

/** A line's points in the order of the chart: by entropy (rising), which every isobar and isotherm follows. */
function order(pts) {
  return pts.sort((a, b) => a.s_J_molK - b.s_J_molK);
}
