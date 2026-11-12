/**
 * The Extraction block (proposal 0015, Part I, sections 1 and 4; milestone M3, step 8; workstream W2): liquid-liquid
 * extraction in a countercurrent cascade of equilibrium stages, the column engine's liquid-liquid cascade
 * (solveCascade({ phases: "LL" }), src/units/columns/extraction.js).
 *
 * Ports: the feed ("feed") enters stage 1 and the solvent ("solvent") stage N; the raffinate (what is left of the feed)
 * leaves stage N and the extract (the solvent with what it took up) stage 1. Each stage is a liquid-liquid equilibrium
 * stage at the block's temperature.
 *
 * What you give: the number of stages, and optionally the temperature T_K of the stages (default: the feed's), the
 * outlets' pressure P_kPa (default: the feed's) and the block's own liquid method `method` ({ model, sets, prefer }, as
 * a flowsheet's thermo). Without `method`, the block uses the flowsheet's model, and for a ternary whose three pairs have
 * a set fitted jointly to its liquid-liquid tie lines (named "fitted-lle-...", validation/python/fit_ternary_lle.py)
 * those sets (the maintainer, 2026-11-04: the joint sets are the Extraction block's default for that ternary; elsewhere
 * the defaults stay); `method.sets` of the person's own replaces it. The equilibrium needs only the liquid's activity
 * coefficients, so the vapour model (the acids' chemical theory included) does not enter.
 *
 * The outlets are calculated with that same liquid method at the stages' temperature, so that they are the liquids of
 * the last and first stages. Where the flowsheet's own method would split an outlet into two liquids (its parameter sets
 * do not follow the ternary's tie lines), the block warns (METHOD_SPLIT): a block after it that uses the flowsheet's
 * method may refuse that stream. The duty is the heat that keeps the stages at their temperature,
 * H_out - H_in, the outlets' enthalpies in the block's method and the inlets' as they arrive.
 *
 * Results: the extract and the raffinate; per stage the two liquids' flows and compositions and the distribution
 * coefficients K_i = y_i / x_i; the recovery of every component into the extract; the solvent-to-feed ratio.
 *
 * Units: K, kPa, kmol/h (the engine: mol/s).
 */
import { fail } from "../util/errors.js";
import { stream } from "../stream/stream.js";
import { system } from "../system.js";
import { library } from "../thermo/library.js";
import { liquidTangentPlane } from "../equilibrium/stability.js";
import { solveCascade } from "./columns/engine.js";
import { MAX_LL_STAGES } from "./columns/extraction.js";
import { registerUnit } from "./units.js";

const SPEC_KEYS = ["stages", "T_K", "adiabatic", "P_kPa", "method"];
/** The largest vapour fraction of an inlet the block takes in (condensed into the stages, with a warning); this project's choice. */
export const MAX_INLET_VF = 0.1;
const METHOD_KEYS = ["model", "sets", "prefer"];
const ACTIVITY = ["NRTL", "UNIQUAC", "MOD-UNIFAC-2"];
/** The prefix of the sets fitted jointly to a ternary's tie lines (validation/python/fit_ternary_lle.py). */
export const JOINT_PREFIX = "fitted-lle-";

const has = (o, k) => o && o[k] !== undefined && o[k] !== null;
const fmt = v => +Number(v).toPrecision(4);
const KMOL_H = 1000 / 3600;   // mol/s per kmol/h

function checkSpec(spec) {
  const out = {};
  const N = Number(spec.stages);
  if (!has(spec, "stages") || !(Number.isInteger(N) && N >= 1 && N <= MAX_LL_STAGES)) throw fail("BAD_INPUT", `Extraction: give the number of equilibrium stages, a whole number from 1 to ${MAX_LL_STAGES} (got ${JSON.stringify(spec.stages)}).`);
  out.N = N;
  if (has(spec, "T_K")) {
    const T = Number(spec.T_K);
    if (!(T > 0)) throw fail("BAD_INPUT", `Extraction: T_K must be a positive temperature in K (got ${JSON.stringify(spec.T_K)}).`);
    out.T = T;
  }
  if (has(spec, "adiabatic")) {
    if (typeof spec.adiabatic !== "boolean") throw fail("BAD_INPUT", `Extraction: adiabatic must be true or false (got ${JSON.stringify(spec.adiabatic)}).`);
    if (spec.adiabatic && has(spec, "T_K")) throw fail("BAD_INPUT", "Extraction: adiabatic: true finds the stage temperature from the energy balance; leave out T_K (or leave out adiabatic for an isothermal block).");
    out.adiabatic = spec.adiabatic;
  }
  if (has(spec, "P_kPa")) {
    const P = Number(spec.P_kPa);
    if (!(P > 0)) throw fail("BAD_INPUT", `Extraction: P_kPa must be a positive pressure in kPa (got ${JSON.stringify(spec.P_kPa)}).`);
    out.P = P;
  }
  if (has(spec, "method")) {
    const m = spec.method;
    if (!m || typeof m !== "object" || Array.isArray(m)) throw fail("BAD_INPUT", `Extraction: method must be an object such as { model: "NRTL" } (got ${JSON.stringify(m)}).`);
    const bad = Object.keys(m).filter(k => !METHOD_KEYS.includes(k));
    if (bad.length) throw fail("BAD_INPUT", `Extraction: method: unknown key${bad.length > 1 ? "s" : ""} ${bad.join(", ")}. Known: ${METHOD_KEYS.join(", ")} (the vapour model does not enter a liquid-liquid stage).`);
    if (m.model != null && !ACTIVITY.includes(String(m.model).toUpperCase())) throw fail("BAD_INPUT", `Extraction: method.model must be an activity model that describes two liquids: ${ACTIVITY.join(", ")} (got ${JSON.stringify(m.model)}).`);
    out.method = m;
  }
  return out;
}

function dof(spec) {
  const out = { needed: 1, given: 0, missing: [], extra: [] };
  if (has(spec, "stages")) out.given++; else out.missing.push("the number of stages");
  return out;
}

/**
 * The jointly fitted sets ("fitted-lle-...") of every ternary among the components whose three pairs all have one of
 * the same name for this model: { "a+b": name, ... }.
 */
export function jointSets(ids, model) {
  const out = {};
  const named = (a, b) => { try { return library.sets(a, b, model).map(s => s.set).filter(s => s && s.startsWith(JOINT_PREFIX)); } catch { return []; } };
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) for (let c = b + 1; c < ids.length; c++) {
    const [i, j, k] = [ids[a], ids[b], ids[c]];
    const ij = named(i, j), ik = named(i, k), jk = named(j, k);
    const common = ij.filter(s => ik.includes(s) && jk.includes(s));
    if (common.length) for (const [p, q] of [[i, j], [i, k], [j, k]]) out[`${p}+${q}`] ??= common[0];
  }
  return out;
}

/** The block's liquid method: its own, or the flowsheet's model with the joint sets of a ternary that has them. */
function liquidSystem(sys, s) {
  const model = String(s.method?.model ?? sys.model).toUpperCase();
  if (!ACTIVITY.includes(model)) throw fail("BAD_INPUT", `Extraction: two liquids need an activity model (${ACTIVITY.join(", ")}); the flowsheet uses ${sys.model}. Give the block its own method, e.g. method: { model: "NRTL" }.`);
  const joint = s.method?.sets ? {} : jointSets(sys.ids, model);
  const sets = s.method?.sets ?? (Object.keys(joint).length ? joint : null);
  try {
    const own = system({ components: sys.ids, model, ...(sets ? { sets } : {}), ...(s.method?.prefer ? { prefer: s.method.prefer } : {}),
      ...(sys.userData ? { userData: sys.userData } : {}) });
    return { own, model, sets, joint: Object.keys(joint).length ? joint : null };
  } catch (e) {
    throw fail(e.code ?? "BAD_INPUT", `Extraction: its liquid method (${model}): ${e.message}`);
  }
}

/**
 * The one temperature at which the outlets' enthalpy equals the inlets' (secant method from the mixed inlets' mean
 * temperature); g(T) = { rr, f } with f the enthalpy imbalance in kW.
 */
function solveAdiabatic(g, T0, Hin) {
  const tol = 1e-6 * Math.max(Math.abs(Hin), 1);
  let a = { T: T0, ...g(T0) }, b = { T: T0 + 1, ...g(T0 + 1) }, it = 0;
  while (Math.abs(b.f) > tol && it < 40) {
    if (b.f === a.f) throw fail("NO_CONVERGENCE", `Extraction: the adiabatic temperature did not converge (the enthalpy balance does not change with temperature near ${fmt(b.T)} K).`);
    let Tn = b.T - b.f * (b.T - a.T) / (b.f - a.f);
    Tn = Math.min(Math.max(Tn, b.T - 50), b.T + 50);
    if (!(Tn > 150)) throw fail("NO_CONVERGENCE", `Extraction: the adiabatic temperature left the range of the model (${fmt(Tn)} K).`);
    a = b; b = { T: Tn, ...g(Tn) }; it++;
  }
  if (Math.abs(b.f) > tol) throw fail("NO_CONVERGENCE", `Extraction: the adiabatic temperature did not converge in 40 secant steps (last ${fmt(b.T)} K, imbalance ${fmt(b.f)} kW).`);
  return { T: b.T, rr: b.rr, iterations: it, residual_kW: b.f };
}

function solve({ sys, inlets, spec }) {
  const feed = inlets.feed[0], solvent = inlets.solvent[0];
  if (!(feed.F_kmol_h > 0)) throw fail("BAD_INPUT", "Extraction: the feed has no flow.");
  if (!(solvent.F_kmol_h > 0)) throw fail("BAD_INPUT", "Extraction: the solvent has no flow.");
  const warnings = [];
  for (const [s, name] of [[feed, "feed"], [solvent, "solvent"]]) {
    if (s.VF != null && s.VF > 1e-9) {
      if (s.VF > MAX_INLET_VF) throw fail("BAD_INPUT", `Extraction: the ${name} is partly vapour (${fmt(100 * s.VF)} % vapour; vapour fraction ${fmt(s.VF)} at ${fmt(s.T_K)} K and ${fmt(s.P_kPa)} kPa); the stages hold two liquids and no vapour, and the block takes at most ${MAX_INLET_VF} (a little vapour, condensed). Cool it, raise its pressure, or flash it first.`);
      warnings.push({ code: "FEED_VAPOUR", message: `The ${name} carries vapour (vapour fraction ${fmt(s.VF)} at ${fmt(s.T_K)} K and ${fmt(s.P_kPa)} kPa). The block mixes all of it into its first liquid stage as liquid: the vapour condenses, nothing leaves as vapour, and its enthalpy (the heat of condensation) is in the energy balance (${spec.adiabatic ? "the stage temperature" : "the duty"}).`,
        remedy: "Flash the stream first and send only its liquid to the block if the vapour should leave separately." });
    }
  }
  const P = spec.P ?? feed.P_kPa, N = spec.N;
  const { own, model, sets, joint } = liquidSystem(sys, spec);
  const run = Tc => solveCascade({ sys: own, phases: "LL", stages: N, T_K: Tc, names: sys.names,
    feeds: [{ stage: 1, flows: feed.flows.map(v => v * KMOL_H) }, { stage: N, flows: solvent.flows.map(v => v * KMOL_H) }] });
  const outH = (Tc, r) => { const f = fl => stream(own, { flow_kmol_h: fl.map(v => v / KMOL_H), T_K: Tc, P_kPa: P }).H_kW ?? 0; return f(r.products.down) + f(r.products.up); };
  let T, r, adia = null;
  if (spec.adiabatic) {
    // the inlets' enthalpy in the block's own method, at their own T and P (so that method differences do not leak in)
    const Hin = [feed, solvent].reduce((a, s) => a + (stream(own, { flow_kmol_h: s.flows, T_K: s.T_K, P_kPa: s.P_kPa }).H_kW ?? 0), 0);
    const g = Tc => { const rr = run(Tc); return { rr, f: outH(Tc, rr) - Hin }; };
    adia = solveAdiabatic(g, (feed.F_kmol_h * feed.T_K + solvent.F_kmol_h * solvent.T_K) / (feed.F_kmol_h + solvent.F_kmol_h), Hin);
    T = adia.T; r = adia.rr;
  } else { T = spec.T ?? feed.T_K; r = run(T); }
  const toKmol = fl => fl.map(v => v / KMOL_H);
  const rafFlows = toKmol(r.products.down), extFlows = toKmol(r.products.up);
  let raffinate, extract;
  try {
    raffinate = stream(own, { flow_kmol_h: rafFlows, T_K: T, P_kPa: P });
    extract = stream(own, { flow_kmol_h: extFlows, T_K: T, P_kPa: P });
  } catch (e) {
    throw fail(e.code ?? "BAD_INPUT", `Extraction: an outlet at ${fmt(T)} K and ${fmt(P)} kPa: ${e.message}`);
  }
  if (sys.gammas) {
    for (const [o, name] of [[raffinate, "raffinate"], [extract, "extract"]]) {
      const st = liquidTangentPlane(sys, o.z, T);
      if (!st.stable) warnings.push({ code: "METHOD_SPLIT", message: `With the flowsheet's own parameter sets the ${name} would split into two liquids at ${fmt(T)} K; the block's liquid method (${sets ? "the sets " + [...new Set(Object.values(sets))].join(", ") : model}) keeps it one liquid. A block after it that uses the flowsheet's method may refuse it.`,
        remedy: `Choose the same sets in the flowsheet's thermo (sets: ${JSON.stringify(sets ?? {})}), or give this block the flowsheet's sets as its method.` });
    }
  }
  // an outlet or stage liquid above its bubble point at the block's pressure is boiling: a liquid-liquid extractor cannot
  // be calculated there (fail loudly: the stages hold no vapour)
  const boiling = [];
  const bub = (x, label) => { let Tb = null; try { Tb = own.bubbleT(x, P).T; } catch { /* the outlet's own flash decides below */ } if (Tb != null && !(T < Tb - 1e-6)) boiling.push({ label, Tb }); };
  r.stages.forEach(st => { bub(st.down.x, st.stage === N ? "the raffinate (stage " + N + ")" : `the raffinate liquid of stage ${st.stage}`); bub(st.up.x, st.stage === 1 ? "the extract (stage 1)" : `the extract liquid of stage ${st.stage}`); });
  for (const [o, name] of [[raffinate, "raffinate"], [extract, "extract"]]) if (o.VF != null && o.VF > 1e-9 && !boiling.some(b => b.label.includes(name))) boiling.push({ label: `the ${name}`, Tb: null });
  if (boiling.length) {
    const b = boiling[0];
    throw fail("OUT_OF_RANGE", `Extraction: at ${fmt(T)} K and ${fmt(P)} kPa ${b.label} is at or above its bubble point${b.Tb != null ? ` (${fmt(b.Tb)} K)` : ""}: the liquid boils, and the stages hold two liquids and no vapour${boiling.length > 1 ? ` (${boiling.length} liquids in all)` : ""}. Raise the pressure P_kPa${spec.adiabatic ? "" : " or lower the temperature T_K"}, or use a solvent that boils higher.`,
      { T_K: T, P_kPa: P, boiling: boiling.map(x => ({ liquid: x.label, bubble_T_K: x.Tb })) });
  }
  const profile = r.stages.map(st => ({
    stage: st.stage, T_K: st.T_K,
    raffinate_kmol_h: toKmol(st.down.flows), extract_kmol_h: toKmol(st.up.flows),
    x_raffinate: st.down.x.slice(), x_extract: st.up.x.slice(),
    K: st.up.x.map((y, i) => (st.down.x[i] > 0 ? y / st.down.x[i] : null)),
  }));
  const recoveries = Object.fromEntries(sys.ids.map((id, i) => {
    const fin = feed.flows[i] + solvent.flows[i];
    return [id, fin > 0 ? extFlows[i] / fin : null];
  }));
  const notes = [
    `Countercurrent liquid-liquid extraction: ${N} equilibrium stage${N > 1 ? "s" : ""} at ${fmt(T)} K; the feed enters stage 1 and the solvent stage ${N}; the raffinate leaves stage ${N} and the extract stage 1. MESH without a vapour (equal activities in the two liquids on every stage), solved by Newton's method from a sum-rates start.`,
    `Liquid method: ${model}${sets ? ` with the sets ${[...new Set(Object.values(sets))].join(", ")}${joint && !spec.method?.sets ? " (fitted jointly to this ternary's liquid-liquid tie lines: the block's default for it)" : ""}` : " with the default sets"}. The vapour model does not enter.`,
    spec.adiabatic
      ? `Adiabatic overall, one temperature for all stages: ${fmt(T)} K, found so that the outlets' enthalpy equals the inlets' (${adia.iterations} secant steps, residual ${fmt(adia.residual_kW)} kW). It is not a stage-by-stage energy balance: every stage is held at this one temperature; the duty is zero.`
      : "Isothermal: every stage and both outlets at the block's temperature; the duty is the heat that keeps them there.",
  ];
  return {
    outlets: { extract, raffinate },
    duty_kW: spec.adiabatic ? 0 : (extract.H_kW ?? 0) + (raffinate.H_kW ?? 0) - (feed.H_kW ?? 0) - (solvent.H_kW ?? 0),
    notes, warnings, profile,
    state: { stages: N, T_K: T, adiabatic: !!spec.adiabatic, P_kPa: P, solvent_to_feed: solvent.F_kmol_h / feed.F_kmol_h,
      solvent_to_feed_mass: solvent.mass_kg_h != null && feed.mass_kg_h ? solvent.mass_kg_h / feed.mass_kg_h : null,
      recoveries, model, sets: sets ?? null, iterations: r.iterations, residuals: r.residuals },
  };
}

registerUnit({
  type: "extraction", label: "Extraction", duty: true,
  inlets: [{ port: "feed", label: "feed" }, { port: "solvent", label: "solvent" }],
  outlets: [{ port: "extract" }, { port: "raffinate" }],
  specKeys: SPEC_KEYS,
  checkSpec, dof, solve,
});
