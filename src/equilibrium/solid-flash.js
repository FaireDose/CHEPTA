/**
 * Solids in equilibrium in every stream (proposal 0015, Part I, section 5; roadmap A5): a component named in the
 * system's `solids` forms a pure solid where the liquid is saturated in it, and the solid dissolves where the liquid
 * can take it. The flash of the system becomes a solid-liquid-vapour flash, so every block that sets an outlet state
 * through it (mixer, heater, valve, flash drum, pump, the component separator's outlets) dissolves or crystallizes it:
 * adding water or heating redissolves it, cooling or a pressure letdown (which cools by evaporation) crystallizes it.
 *
 * One solid-forming component for now. With c the moles of solid per mole of feed, the fluid (z − c e_s)/(1 − c) is
 * flashed by the system's own flash; the solid is in equilibrium when the fluid's liquid is saturated,
 *
 *   r(c) = ln x_s,liquid − ln x_sat(T, the liquid's solvent) = 0,      or c = 0 where r(0) ≤ 0 (no solid)
 *
 * with x_sat from src/equilibrium/sle.js: a measured solubility curve in the liquid's solvent, else the melting-point
 * equation with the activity model. r falls as c rises (less solute dissolved; at given enthalpy the heat released by
 * crystallizing raises T and x_sat), so c is found by Brent's method on [0, z_s].
 *   - T-P: the fluid's T-P flash at each c.
 *   - P-H: at each c the fluid's P-H flash at the fluid's share of the enthalpy, (H − c h_solid(T)) / (1 − c), the
 *     solid's enthalpy at the fluid's temperature found by successive substitution (it changes little with T).
 *   - P-VF, T-VF: the vapour fraction counts every mole, the solid's too; the fluid's is VF / (1 − c).
 * The solid's enthalpy: h_solid(T) = h_liquid,pure(T) − dH, dH the enthalpy of fusion (the equation's route) or the
 * curve's apparent enthalpy of solution (src/thermo/solubility-curve.js), as solidHeat in sle.js says; the result's
 * notes name which. Without any other liquid component (a stream of the crystals alone), the solute is all solid.
 * Outside a curve's measured temperatures the flash refuses (OUT_OF_RANGE), as the curve does.
 *
 * Not available: a P-S flash with a solid (its entropy is not modelled; compressors and expanders take fluids only),
 * two solid-forming components at once.
 */
import { brent } from "../util/solve.js";
import { fail } from "../util/errors.js";
import { solidHeat } from "./sle.js";

const fmt = v => +Number(v).toPrecision(4);

/**
 * Wrap a system's flash with the solid of component i.
 * @param {object} sys       an activity-model system with its fluid flash in sys.flash
 * @param {number} i         the solid-forming component
 * @returns {(spec:object, opts?:object) => object}  the new flash
 */
export function solidFlash(sys, i, fluidFlash) {
  const n = sys.n, name = sys.names[i];
  const unit = (() => { const e = new Array(n).fill(0); e[i] = 1; return e; })();
  const others = k => k !== i;

  /** The solid's molar enthalpy at T, P, and the heat that separates it from the liquid solute. */
  const hSolid = (T, P, w) => {
    const heat = solidHeat(sys, i, T, w ? { solvent: w } : {});
    return { h: sys.enthalpy("liquid", T, P, unit) - heat.dH_J_mol, heat };
  };
  /** The liquid of a fluid flash result (the first one), or null. */
  const liquidOf = fl => fl.phases.find(p => p.type === "liquid" && p.fraction > 0) ?? null;
  /** ln x_s − ln x_sat of the fluid's liquid at T; −Infinity without solute or liquid. */
  const residual = (fl, T) => {
    const L = liquidOf(fl);
    if (!L || !(L.composition[i] > 0)) return -Infinity;
    const so = L.composition.reduce((a, v, k) => a + (others(k) ? v : 0), 0);
    if (!(so > 1e-300)) return Infinity;   // the solute alone: it is solid
    const w = L.composition.filter((_, k) => others(k)).map(v => v / so);
    const xs = sys.solidSolubility(i, T, n > 2 ? { solvent: w } : {}).xSolute;
    return Math.log(L.composition[i]) - Math.log(xs);
  };
  const fluidZ = (z, c) => z.map((v, k) => (k === i ? v - c : v) / (1 - c));

  return function flash(spec = {}, opts) {
    const z = spec.z;
    if (!Array.isArray(z) || !(z[i] > 0)) return fluidFlash(spec, opts);
    const has = k => spec[k] !== undefined && spec[k] !== null;
    if (has("S")) throw fail("NOT_AVAILABLE", `flash: ${name} may form a solid here, and a P-S flash with a solid is not built (its entropy is not modelled); compressors and expanders take fluids only.`);
    const kind = has("H") ? "PH" : has("VF") ? (has("P") ? "PVF" : "TVF") : "TP";
    const zs = z[i];
    const otherShare = 1 - zs;
    // the crystals alone (no other component): all solid, at T and P
    if (!(otherShare > 1e-14)) {
      if (kind !== "TP" && kind !== "PH") throw fail("BAD_INPUT", `flash: the feed is solid ${name} alone; a vapour fraction cannot be specified. Give the temperature or the enthalpy.`);
      const P = spec.P;
      const at = T => hSolid(T, P, null);
      let T = spec.T;
      if (kind === "PH") T = brent(t => at(t).h - spec.H, 200, 900, { xtol: 1e-9 });
      const s = at(T);
      return { spec: kind, T, P, VF: 0, H_J_mol: s.h, phases: [{ type: "solid", equilibrium: true, fraction: 1, composition: unit.slice(), h_J_mol: s.h }],
        iterations: 0, warnings: [], sources: [], notes: [`${name} alone is solid; its enthalpy is the liquid's minus ${s.heat.kind === "fusion" ? "the enthalpy of fusion" : "the curve's enthalpy of solution"}.`] };
    }

    // the fluid state at c moles of solid per mole of feed, and its saturation residual
    let lastT = spec.T ?? 350;
    const state = c => {
      const zf = fluidZ(z, c);
      let fl;
      if (kind === "TP") fl = fluidFlash({ z: zf, T: spec.T, P: spec.P }, opts);
      else if (kind === "PVF" || kind === "TVF") {
        const VF = spec.VF / (1 - c);
        if (VF > 1 + 1e-12) throw fail("BAD_INPUT", `flash: the vapour fraction counts the solid ${name} too, so it is at most ${fmt(1 - c)} here (got ${spec.VF}).`);
        fl = fluidFlash({ z: zf, ...(kind === "PVF" ? { P: spec.P } : { T: spec.T }), VF: Math.min(1, VF) }, opts);
      } else {
        // P-H: the solid's enthalpy at the fluid's temperature, by successive substitution
        let T = lastT;
        for (let it = 0; it < 60; it++) {
          const hs = c > 0 ? hSolid(T, spec.P, null).h : 0;
          fl = fluidFlash({ z: zf, P: spec.P, H: (spec.H - c * hs) / (1 - c) }, opts);
          if (Math.abs(fl.T - T) < 1e-10) break;
          T = fl.T;
        }
        lastT = fl.T;
      }
      return { fl, r: residual(fl, fl.T) };
    };
    const s0 = state(0);
    let c = 0, st = s0;
    if (s0.r > 0) {
      // bracket: c from 0 to where the dissolved solute is a thousandth of saturation (r = ln 1e-3 there, about):
      // never a trace of 1e-12, whose flash near a pure solvent's boiling point the fluid flash cannot do
      // (a fluid flash that still cannot be done there is tried with more dissolved, up to half of saturation)
      // the dissolved solute at the end is measured against the liquid's own solvent (the liquid can be a small share
      // of the stream, as after a letdown that boils most of it): from half of saturation down to a millionth
      const L0 = liquidOf(s0.fl);
      const sat = Math.exp(-s0.r) * L0.composition[i];   // x_sat at the c = 0 state
      const solvent0 = L0.fraction * (1 - L0.composition[i]);
      let hi = 0, shi = null, err = null, ok = null;
      for (const f of [0.5, 0.1, 1e-2, 1e-3, 1e-6]) {
        const h = zs - f * sat * solvent0;
        if (!(h > 0)) continue;
        try { const sh = state(h); ok = [h, sh]; if (sh.r < 0) { hi = h; shi = sh; break; } } catch (e) { err = e; }
      }
      if (!shi) {
        if (!ok) throw err ?? fail("NO_CONVERGENCE", `flash: no state with ${name} crystallized could be calculated.`);
        [hi, shi] = ok;   // saturated even with a millionth of the solvent's saturation dissolved: all but a trace is solid
      }
      if (shi.r > 0) c = hi, st = shi;
      else {
        c = brent(x => state(x).r, 0, hi, { xtol: 1e-15 * Math.max(zs, 1e-30) + 1e-18, ftol: 1e-12 });
        st = state(c);
      }
    }
    const fl = st.fl;
    const T = fl.T, P = fl.P;
    const phases = fl.phases.map(p => ({ ...p, fraction: p.fraction * (1 - c) }));
    const notes = [];
    let H = fl.H_J_mol * (1 - c);
    if (c > 0) {
      const L = liquidOf(fl);
      const so = L ? L.composition.reduce((a, v, k) => a + (others(k) ? v : 0), 0) : 0;
      const w = L && so > 0 ? L.composition.filter((_, k) => others(k)).map(v => v / so) : null;
      const s = hSolid(T, P, n > 2 ? w : null);
      phases.push({ type: "solid", equilibrium: true, fraction: c, composition: unit.slice(), h_J_mol: s.h });
      H += c * s.h;
      notes.push(`Solid ${name} in equilibrium (${fmt(100 * c / zs)} % of it); its enthalpy is the liquid's minus ${s.heat.source}.`);
    }
    if (kind === "PH") H = spec.H;
    const VF = phases.filter(p => p.type === "vapour").reduce((a, p) => a + p.fraction, 0);
    return { ...fl, spec: kind, T, P, VF, H_J_mol: H, phases, notes: [...(fl.notes ?? []), ...notes], solid: { component: sys.ids[i], fraction: c } };
  };
}
