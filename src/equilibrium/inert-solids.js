/**
 * Inert solids (the maintainer, 2026-10-16: "allowed to have an inert solid for the moment"; the component separator
 * serves as a filter). An inert solid neither evaporates, dissolves nor melts: it takes no part in the phase
 * equilibrium and passes through every unit as a phase of its own, a "solid" phase next to the vapour and the liquids.
 *
 * The flash of a feed with inert solids:
 *   - the fluid part (the other components, renormalized) is flashed by the fluid system as it would be alone;
 *   - the solid part carries the enthalpy h_s(T) = integral of cp_s from 298.15 K to T (its reference state is the
 *     solid at 298.15 K; enough for energy balances without reactions, as for nonvolatile components);
 *   - the vapour fraction counts every mole, the solid's too, so it stays below the fluid share of the feed;
 *   - at a given enthalpy (P-H), T is found from the total enthalpy (fluid and solid) by Brent's method, and the fluid
 *     state at that T by the fluid system's P-H flash, so that a fluid whose two-phase region is one temperature (a pure
 *     liquid boiling) is described exactly.
 * Records cover their measured temperatures only: outside the solid heat capacity's range the flash refuses, naming it.
 *
 * Only flash() is available for systems with inert solids; bubble and dew points and the diagrams refuse with the
 * reason (a solid has no place in them).
 */
import { brent } from "../util/solve.js";
import { evaluate } from "../thermo/correlations.js";
import { fail, failRange } from "../util/errors.js";
import { checkComposition, checkPressure, checkTemperature } from "../util/inputs.js";

const T0 = 298.15;
const EDGE_K = 1e-3;   // as in enthalpy.js: a temperature this close outside the record takes the record's end
// 8-point Gauss-Legendre nodes and weights on [-1, 1]
const GX = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498, 0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
const GW = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620, 0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

/** h(T) - h(T0) of a solid from its heat-capacity record (J/mol), composite Gauss-Legendre on <= 25 K pieces. */
export function solidEnthalpy(rec, name, T) {
  if (T < rec.Tmin_K - EDGE_K || T > rec.Tmax_K + EDGE_K || T0 < rec.Tmin_K - EDGE_K || T0 > rec.Tmax_K + EDGE_K) {
    const lo = Math.min(T, T0), hi = Math.max(T, T0);
    throw failRange("OUT_OF_RANGE", `${name}: its solid heat-capacity record covers ${rec.Tmin_K}-${rec.Tmax_K} K, so its enthalpy cannot be calculated from 298.15 K to ${T.toFixed(1)} K (the record must cover ${lo.toFixed(1)}-${hi.toFixed(1)} K).`);
  }
  const at = t => evaluate(rec, Math.min(Math.max(t, rec.Tmin_K), rec.Tmax_K));
  const m = Math.max(1, Math.ceil(Math.abs(T - T0) / 25)), w = (T - T0) / m;
  let s = 0;
  for (let k = 0; k < m; k++) {
    const mid = T0 + (k + 0.5) * w, r = w / 2;
    for (let q = 0; q < 8; q++) s += GW[q] * r * at(mid + r * GX[q]);
  }
  return s;
}

/**
 * A system with inert solids: flash() as described above, the other methods refuse.
 * @param {object} o
 * @param {string[]} o.ids, o.names  every component, in order
 * @param {number[]} o.MW
 * @param {boolean[]} o.solid        which are inert solids
 * @param {object[]} o.cp            the solid heat-capacity record of each solid (null for the others)
 * @param {object|null} o.fluid      the system of the other components (null when every component is a solid)
 * @param {object} o.base            model, vapour, kind, userData, info of the fluid system
 */
export function withInertSolids({ ids, names, MW, solid, cp, fluid, base }) {
  const n = ids.length;
  const fluidIdx = ids.map((_, i) => i).filter(i => !solid[i]);
  const solidNames = names.filter((_, i) => solid[i]);
  /** Enthalpy of the solids per mole of feed (J/mol) at T. */
  const hSolid = (z, T) => z.reduce((a, zi, i) => a + (solid[i] && zi > 0 ? zi * solidEnthalpy(cp[i], names[i], T) : 0), 0);
  const expand = comp => { const out = new Array(n).fill(0); fluidIdx.forEach((i, k) => { out[i] = comp[k]; }); return out; };

  function flash(spec = {}) {
    if (!spec || typeof spec !== "object") throw fail("BAD_INPUT", "flash needs a specification such as { z, T, P }.");
    const z = checkComposition(spec.z, n, "Feed composition");
    const has = k => spec[k] !== undefined && spec[k] !== null;
    if (has("S")) throw fail("NOT_AVAILABLE", `flash: a feed with an inert solid (${solidNames.join(", ")}) has no P-S flash yet (the solid's entropy is not modelled); compressors and expanders take fluids only.`);
    const keys = ["T", "P", "H", "VF"].filter(has).sort().join("");
    const KIND = { PT: "TP", HP: "PH", PVF: "PVF", TVF: "TVF" }[keys];
    if (!KIND) throw fail("BAD_INPUT", `flash: give the feed z and two of T, P, H, VF as { z, T, P }, { z, P, H }, { z, P, VF } or { z, T, VF } (got ${keys || "none"}).`);
    const s = z.reduce((a, zi, i) => a + (solid[i] ? zi : 0), 0);
    const f = 1 - s;
    const zf = f > 1e-12 ? fluidIdx.map(i => z[i] / f) : null;
    const solidPhase = T => (s > 0 ? [{ type: "solid", fraction: s, composition: z.map((zi, i) => (solid[i] ? zi / s : 0)), h_J_mol: hSolid(z, T) / s }] : []);
    const result = (fl, T, P, H) => ({
      spec: KIND, T, P, VF: fl ? fl.VF * f : 0, H_J_mol: H,
      phases: [...(fl ? fl.phases.map(p => ({ ...p, fraction: p.fraction * f, composition: expand(p.composition) })) : []), ...solidPhase(T)],
      iterations: fl?.iterations ?? 0, warnings: fl?.warnings ?? [], sources: fl?.sources ?? [],
      ...(fl?.incipient ? { incipient: { ...fl.incipient, composition: expand(fl.incipient.composition) } } : {}),
    });
    if (KIND === "PVF" || KIND === "TVF") {
      if (!zf) throw fail("BAD_INPUT", `flash: the feed is all inert solid (${solidNames.join(", ")}): nothing evaporates, so a vapour fraction cannot be specified. Give the temperature or the enthalpy.`);
      const VF = Number(spec.VF);
      if (!(VF >= 0 && VF <= f + 1e-12)) throw fail("BAD_INPUT", `flash: the vapour fraction counts the inert solid too (${solidNames.join(", ")}, ${(s * 100).toPrecision(3)} % of the feed), so it can be at most ${f.toPrecision(4)} (got ${spec.VF}).`);
      const fl = fluid.flash({ z: zf, ...(KIND === "PVF" ? { P: spec.P } : { T: spec.T }), VF: Math.min(1, VF / f) });
      return result(fl, fl.T, fl.P, f * fl.H_J_mol + hSolid(z, fl.T));
    }
    const P = checkPressure(spec.P);
    if (KIND === "TP") {
      const T = checkTemperature(spec.T);
      const fl = zf ? fluid.flash({ z: zf, T, P }) : null;
      return result(fl, T, P, (fl ? f * fl.H_J_mol : 0) + hSolid(z, T));
    }
    // P-H: the temperature of the total enthalpy, then the fluid's own P-H flash at the fluid's share of it
    const H = Number(spec.H);
    if (!Number.isFinite(H)) throw fail("BAD_INPUT", `flash: H must be a number of J/mol (got ${JSON.stringify(spec.H)}).`);
    const total = T => (zf ? f * fluid.flash({ z: zf, T, P }).H_J_mol : 0) + hSolid(z, T) - H;
    const lo = Math.max(30, ...ids.map((_, i) => (solid[i] && z[i] > 0 ? cp[i].Tmin_K : 30)));
    const hi = Math.min(2000, ...ids.map((_, i) => (solid[i] && z[i] > 0 ? cp[i].Tmax_K : 2000)));
    // step out from 300 K (as flash.js does): where a record's range ends between two steps, step back towards the
    // last good point, and refuse with the record's own message only at the edge of its range
    let a = Math.min(Math.max(300, lo), hi), fa = total(a), step = 5, b = a, fb = fa;
    for (let k = 0; k < 120 && fa * fb > 0; k++) {
      const dir = fa < 0 ? 1 : -1;
      b = dir > 0 ? Math.min(a + step, hi) : Math.max(a - step, lo);
      try { fb = total(b); } catch (e) {
        if (!(e && e.code === "OUT_OF_RANGE") || step < 1e-6) throw e;
        step /= 2; fb = fa; continue;
      }
      if (fa * fb > 0) {
        if (b === hi || b === lo) {
          throw failRange("OUT_OF_RANGE", `flash: the enthalpy ${H.toFixed(1)} J/mol is not reached between ${lo} and ${hi} K, the range of the solid heat capacity of ${solidNames.join(", ")}.`);
        }
        a = b; fa = fb; step *= 1.5;
      }
    }
    const T = fa === 0 ? a : fb === 0 ? b : brent(total, Math.min(a, b), Math.max(a, b), { xtol: 1e-9 });
    if (!zf) return result(null, T, P, H);
    const fl = fluid.flash({ z: zf, P, H: (H - hSolid(z, T)) / f });
    return result(fl, fl.T, P, H);
  }

  const refuse = what => () => { throw fail("NOT_AVAILABLE", `${solidNames.join(", ")} ${solidNames.length > 1 ? "are inert solids" : "is an inert solid"}: ${what} does not take ${solidNames.length > 1 ? "them" : "it"} (an inert solid has no part in the phase equilibrium). Use it in a flowsheet, or a flash.`); };
  const sys = {
    ...base, ids, names, n, MW, solid, nonvolatile: solid.map((x, i) => x || Boolean(fluid?.nonvolatile?.[fluidIdx.indexOf(i)])),
    fluid, flash,
  };
  for (const m of ["bubbleT", "bubbleP", "dewT", "dewP", "boilingPoints", "isLiquidStable", "txy", "pxy", "ternaryGrid", "residueCurve", "azeotropes",
    "findAzeotrope", "solidSolubility", "solubilityCurve", "liquidusT", "sleDiagram", "equilibrium", "phase", "gammas", "psat"]) sys[m] = refuse(m);
  return sys;
}
