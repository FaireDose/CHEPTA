/**
 * The user's own data (proposal 0012): property records, components, pair parameter sets and Modified UNIFAC 2.0
 * groups that a person adds to a project, all with the tier "user". It is an overlay, passed per call
 * (system({ userData }), pure(id, { userData }), listComponents({ userData })), never written into the databank and
 * never kept globally, so two workbenches on one page cannot see each other's data.
 *
 * Format (the `user_data` of a project file, format 3):
 *
 *   {
 *     "properties": { "<component>": { "<property>": record, "vapourPressure": record, "fusion": { Tm_K, Hfus_J_mol } } },
 *     "components": { "user:<name>": { name, MW, formula?, cas?, class?: "nonvolatile", why?, Tc_K?, Pc_Pa?, omega?,
 *                                      aliases?, vapourPressure?: record, properties?: { ... }, fusion?, groups?,
 *                                      source } },
 *     "pairs":      { "<component>+<component>": { NRTL?: { a_ij?, a_ji?, b_ij, b_ji, alpha? }, UNIQUAC?: { ... },
 *                                                   PR?: { kij }, SRK?: { kij }, valid?: { T_K, P_kPa }, source } },
 *     "groups":     { "<component>": { subgroups: { "<subgroup id>": count }, source } }
 *   }
 *
 * A record is a correlation in the format of components.json: { equation, coefficients: { A..E }, units, Tmin_K,
 * Tmax_K, Tc_K? (DIPPR106), points?: [[T_K, value], ...], source }, in the units the databank stores (RECORD_UNITS).
 * A vapour pressure is DIPPR101 in Pa, the only form the phase-equilibrium code evaluates (psat.js). Every item needs
 * a source: { name: "own measurement, lab book 12" }. Components are named by anything findComponent accepts; the
 * user's own components by their "user:" id or name.
 *
 * checkUserData() checks all of it and returns the overlay the engine reads, or throws BAD_INPUT naming the problem.
 */
import componentData from "../data/components.json" with { type: "json" };
import modUnifacData from "../data/mod-unifac-2.json" with { type: "json" };
import { CORRELATION_EQUATIONS } from "./correlations.js";
import { vapourPressure } from "./psat.js";
import { findComponent, USER_PREFIX } from "./components.js";
import { brent } from "../util/solve.js";
import { fail } from "../util/errors.js";

/** The units a record of each property is stored in (the same as PROPERTIES[name].recordUnits in pure.js). */
export const RECORD_UNITS = {
  liquidDensity: "kg/m3", idealGasHeatCapacity: "J/mol/K", liquidHeatCapacity: "J/mol/K", heatOfVaporization: "J/mol",
  liquidViscosity: "Pa s", vapourViscosity: "Pa s", liquidThermalConductivity: "W/m/K", vapourThermalConductivity: "W/m/K",
  surfaceTension: "N/m", vapourPressure: "Pa",
};
const PAIR_PARAMS = { NRTL: ["a_ij", "a_ji", "b_ij", "b_ji", "alpha"], UNIQUAC: ["a_ij", "a_ji", "b_ij", "b_ji"], PR: ["kij"], SRK: ["kij"] };
const CHECKED = Symbol("checked user data");

const isObj = v => v != null && typeof v === "object" && !Array.isArray(v);
const bad = msg => fail("BAD_INPUT", `user data: ${msg}`);
const num = (v, what) => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw bad(`${what} must be a number (got ${JSON.stringify(v)}).`);
  return v;
};

/** { name, ... } of an item: the person's own words for where the numbers come from. */
function sourceOf(s, what) {
  if (typeof s === "string" && s.trim()) s = { name: s };
  if (!isObj(s) || typeof s.name !== "string" || !s.name.trim()) {
    throw bad(`${what} needs a source, e.g. source: { name: "own measurement, lab book 12" }, so that every result can say where its numbers come from.`);
  }
  const out = { name: s.name.trim() };
  for (const [k, v] of Object.entries(s)) if (k !== "name" && (typeof v === "string" || typeof v === "number")) out[k] = v;
  return out;
}

function range(r, what) {
  const lo = num(r.Tmin_K, `${what}: Tmin_K`), hi = num(r.Tmax_K, `${what}: Tmax_K`);
  if (!(lo > 0 && hi > lo)) throw bad(`${what}: the range must be positive with Tmin_K < Tmax_K (got ${lo}-${hi} K).`);
  return [lo, hi];
}

/** A property record, checked; in the format components.json uses. */
function propertyRecord(r, name, what) {
  if (!isObj(r)) throw bad(`${what} must be a record { equation, coefficients, units, Tmin_K, Tmax_K, source }.`);
  if (!RECORD_UNITS[name]) throw bad(`${what}: unknown property "${name}". Known: ${Object.keys(RECORD_UNITS).join(", ")}.`);
  if (!CORRELATION_EQUATIONS.includes(r.equation)) throw bad(`${what}: unknown equation "${r.equation}". Use one of ${CORRELATION_EQUATIONS.join(", ")}.`);
  if (r.units !== RECORD_UNITS[name]) {
    throw bad(`${what}: give it in ${RECORD_UNITS[name]}, the units the databank stores (got ${JSON.stringify(r.units)}); the My data panel converts other units.`);
  }
  if (!isObj(r.coefficients)) throw bad(`${what}: coefficients must be an object { A, B, C, D, E } (missing ones are 0).`);
  const coefficients = {};
  for (const [k, v] of Object.entries(r.coefficients)) {
    if (!"ABCDE".includes(k) || k.length !== 1) throw bad(`${what}: unknown coefficient "${k}"; the equations use A, B, C, D, E.`);
    coefficients[k] = num(v, `${what}: coefficient ${k}`);
  }
  const [Tmin_K, Tmax_K] = range(r, what);
  const out = { equation: r.equation, coefficients, units: r.units, Tmin_K, Tmax_K, tier: "user", source: sourceOf(r.source, what) };
  if (r.equation === "DIPPR106") out.Tc_K = num(r.Tc_K, `${what}: Tc_K (DIPPR106 needs it)`);
  if (r.points != null) {
    if (!Array.isArray(r.points) || r.points.some(p => !Array.isArray(p) || p.length !== 2)) throw bad(`${what}: points must be a list of [T_K, value].`);
    out.points = r.points.map(([T, y], k) => [num(T, `${what}: points[${k}] T`), num(y, `${what}: points[${k}] value`)]);
  }
  return out;
}

/** A vapour-pressure record, checked, in the top-level format of components.json (what psat.js evaluates). */
function vapourPressureRecord(r, what) {
  if (!isObj(r)) throw bad(`${what} must be a record { equation: "DIPPR101", coefficients, units: "Pa", Tmin_K, Tmax_K, source }.`);
  if (r.equation !== "DIPPR101") throw bad(`${what}: a vapour pressure must be DIPPR101, ln(P/Pa) = A + B/T + C ln T + D T^E (got ${JSON.stringify(r.equation)}).`);
  const rec = propertyRecord(r, "vapourPressure", what);
  const c = rec.coefficients;
  const vp = { equation: "DIPPR101", A: c.A ?? 0, B: c.B ?? 0, C: c.C ?? 0, D: c.D ?? 0, E: c.E ?? 0, Tmin_K: rec.Tmin_K, Tmax_K: rec.Tmax_K, tier: "user", source: rec.source };
  for (const T of [vp.Tmin_K, (vp.Tmin_K + vp.Tmax_K) / 2, vp.Tmax_K]) {
    const p = vapourPressure(vp, T);
    if (!(p > 0 && Number.isFinite(p))) throw bad(`${what}: the record gives ${p} Pa at ${T} K; check the coefficients.`);
  }
  if (rec.points) vp.points = rec.points;
  return vp;
}

function fusionRecord(f, what) {
  if (!isObj(f)) throw bad(`${what} must be { Tm_K, Hfus_J_mol, source }.`);
  const Tm_K = num(f.Tm_K, `${what}: Tm_K`), Hfus_J_mol = num(f.Hfus_J_mol, `${what}: Hfus_J_mol`);
  if (!(Tm_K > 0 && Hfus_J_mol > 0)) throw bad(`${what}: Tm_K and Hfus_J_mol must be positive.`);
  return { Tm_K, Hfus_J_mol, tier: "user", source: sourceOf(f.source, what) };
}

/** Modified UNIFAC 2.0 groups, checked against the method's subgroups; in the format of components.json. */
function groupsRecord(g, what) {
  if (!isObj(g) || !isObj(g.subgroups)) throw bad(`${what} must be { subgroups: { "<subgroup id>": count }, source }.`);
  const groups = {};
  for (const [id, n] of Object.entries(g.subgroups)) {
    if (!modUnifacData.subgroups[id]) throw bad(`${what}: "${id}" is not a Modified UNIFAC 2.0 subgroup id.`);
    if (!Number.isInteger(n) || n < 1) throw bad(`${what}: the count of subgroup ${id} (${modUnifacData.subgroups[id].name}) must be a whole number of at least 1 (got ${JSON.stringify(n)}).`);
    groups[id] = n;
  }
  if (!Object.keys(groups).length) throw bad(`${what}: give at least one subgroup.`);
  const source = sourceOf(g.source, what);
  const names = Object.entries(groups).map(([id, n]) => `${n} ${modUnifacData.subgroups[id].name}`).join(", ");
  return { groups, tier: "user", source: `Modified UNIFAC 2.0 subgroups (${names}): your own assignment (${source.name})`, userSource: source };
}

function propertiesOf(props, what, comp) {
  if (!isObj(props)) throw bad(`${what} must be an object { property: record }.`);
  const out = {};
  for (const [name, r] of Object.entries(props)) {
    const w = `${what}.${name}`;
    if (name === "vapourPressure") {
      if (comp?.class === "nonvolatile") throw bad(`${w}: ${comp.name} is nonvolatile in CHEPTA, so it has no vapour pressure.`);
      out.vapourPressure = vapourPressureRecord(r, w);
    } else if (name === "fusion") out.fusion = fusionRecord(r, w);
    else out[name] = propertyRecord(r, name, w);
  }
  return out;
}

/** The normal boiling point of a vapour-pressure record, where it reaches 101.325 kPa within its range; else null. */
function boilingPoint(vp) {
  const f = T => vapourPressure(vp, T) - 101325;
  return f(vp.Tmin_K) < 0 && f(vp.Tmax_K) > 0 ? brent(f, vp.Tmin_K, vp.Tmax_K) : null;
}

function userComponent(id, c) {
  const what = `components["${id}"]`;
  if (!String(id).startsWith(USER_PREFIX) || id.length <= USER_PREFIX.length) {
    throw bad(`${what}: the id of your own component must start with "${USER_PREFIX}" (for example "${USER_PREFIX}my-oligomer"), so that it never collides with a databank component.`);
  }
  if (!isObj(c)) throw bad(`${what} must be an object { name, MW, ..., source }.`);
  if (typeof c.name !== "string" || !c.name.trim()) throw bad(`${what} needs a name.`);
  const MW = num(c.MW, `${what}: MW (g/mol)`);
  if (!(MW > 0)) throw bad(`${what}: MW must be positive.`);
  const source = sourceOf(c.source, what);
  if (c.class != null && c.class !== "nonvolatile") throw bad(`${what}: class can only be "nonvolatile" (or left out for a component that evaporates).`);
  const nonvolatile = c.class === "nonvolatile";
  const out = {
    name: c.name.trim(), formula: c.formula ?? null, cas: typeof c.cas === "string" && c.cas.trim() ? c.cas.trim() : null, MW, aliases: (c.aliases ?? []).map(a => String(a).toLowerCase()),
    tier: "user", source, constants_source: `Your own data: ${source.name}`,
    Tc_K: null, Pc_Pa: null, omega: null, Tb_K: null,
    properties: {},
  };
  const crit = ["Tc_K", "Pc_Pa", "omega"].filter(k => c[k] != null);
  if (crit.length && crit.length < 3) throw bad(`${what}: give Tc_K, Pc_Pa and omega together, or none of them.`);
  if (crit.length) {
    if (nonvolatile) throw bad(`${what}: a nonvolatile component has no critical constants.`);
    out.Tc_K = num(c.Tc_K, `${what}: Tc_K`); out.Pc_Pa = num(c.Pc_Pa, `${what}: Pc_Pa`); out.omega = num(c.omega, `${what}: omega`);
  } else {
    out.critical = { available: false, searched: ["your own data (no critical constants given)"] };
  }
  const props = c.properties != null ? propertiesOf(c.properties, `${what}.properties`, { ...out, class: c.class }) : {};
  const vpIn = c.vapourPressure ?? null;
  if (nonvolatile) {
    if (vpIn || props.vapourPressure) throw bad(`${what}: a nonvolatile component has no vapour pressure.`);
    out.class = "nonvolatile";
    out.nonvolatile = { why: typeof c.why === "string" && c.why.trim() ? c.why.trim() : "your own data: it does not evaporate", source: "your own data" };
    out.Tb_note = "nonvolatile (your own data)";
  } else {
    const vp = vpIn ? vapourPressureRecord(vpIn, `${what}.vapourPressure`) : props.vapourPressure;
    if (!vp) throw bad(`${what}: a component that evaporates needs a vapour-pressure record (DIPPR101, Pa); otherwise give class: "nonvolatile".`);
    out.vapourPressure = vp;
    out.Tb_K = boilingPoint(vp);
    if (out.Tb_K == null) out.Tb_note = `the vapour-pressure record (${vp.Tmin_K}-${vp.Tmax_K} K) does not reach 101.325 kPa`;
  }
  const { vapourPressure: _vp, fusion, ...rest } = props;
  out.properties = rest;
  if (fusion) out.fusion = fusion;
  if (c.fusion != null) out.fusion = fusionRecord(c.fusion, `${what}.fusion`);
  if (c.groups != null) out.modUnifac = groupsRecord(c.groups, `${what}.groups`);
  else out.modUnifac = { note: "no Modified UNIFAC 2.0 groups: give them in your own data (groups)" };
  return out;
}

function pairSets(key, p, ud) {
  const what = `pairs["${key}"]`;
  const parts = String(key).split("+").map(s => s.trim()).filter(Boolean);
  if (parts.length !== 2) throw bad(`${what}: write the pair as "component+component", e.g. "water+lactic-acid".`);
  let i, j;
  try { [i, j] = parts.map(k => findComponent(k, ud)); } catch (e) { throw bad(`${what}: ${e.message}`); }
  if (i === j) throw bad(`${what} names the same component twice.`);
  if (!isObj(p)) throw bad(`${what} must be an object { NRTL: { ... }, source }.`);
  const source = sourceOf(p.source, what);
  let valid = null;
  if (p.valid != null) {
    if (!isObj(p.valid)) throw bad(`${what}: valid must be { T_K: [low, high], P_kPa: [low, high] }.`);
    valid = {};
    for (const k of ["T_K", "P_kPa"]) if (p.valid[k] != null) {
      const v = p.valid[k];
      if (!Array.isArray(v) || v.length !== 2 || !(num(v[0], `${what}: valid.${k}`) > 0 && num(v[1], `${what}: valid.${k}`) >= v[0])) {
        throw bad(`${what}: valid.${k} must be [low, high], positive.`);
      }
      valid[k] = [v[0], v[1]];
    }
  }
  const sets = [];
  for (const [model, given] of Object.entries(p)) {
    if (model === "source" || model === "valid") continue;
    if (!PAIR_PARAMS[model]) throw bad(`${what}: unknown model "${model}". Use ${Object.keys(PAIR_PARAMS).join(", ")}.`);
    if (!isObj(given)) throw bad(`${what}.${model} must be an object of parameters (${PAIR_PARAMS[model].join(", ")}).`);
    for (const k of Object.keys(given)) if (!PAIR_PARAMS[model].includes(k)) throw bad(`${what}.${model}: unknown parameter "${k}". Use ${PAIR_PARAMS[model].join(", ")}.`);
    let params;
    if (model === "PR" || model === "SRK") {
      const k = num(given.kij, `${what}.${model}.kij`);
      if (Math.abs(k) >= 1) throw bad(`${what}.${model}: k_ij = ${k} is outside -1 < k_ij < 1.`);
      params = { kij: k };
    } else {
      if (given.b_ij == null || given.b_ji == null) throw bad(`${what}.${model} needs b_ij and b_ji (K); a_ij and a_ji are optional (0).`);
      params = { a_ij: num(given.a_ij ?? 0, `${what}.${model}.a_ij`), a_ji: num(given.a_ji ?? 0, `${what}.${model}.a_ji`),
        b_ij: num(given.b_ij, `${what}.${model}.b_ij`), b_ji: num(given.b_ji, `${what}.${model}.b_ji`) };
      if (model === "NRTL") {
        params.alpha = num(given.alpha ?? 0.3, `${what}.NRTL.alpha`);
        if (!(params.alpha > 0 && params.alpha < 1)) throw bad(`${what}.NRTL: alpha must be between 0 and 1 (got ${params.alpha}).`);
      }
    }
    sets.push({ model, i, j, set: "user", default: true, tier: "user", source_ids: [], source: `Your own data: ${source.name}`,
      userSource: source, valid, T_range_K: valid?.T_K ?? null, params, origin: "user-data" });
  }
  if (!sets.length) throw bad(`${what}: give parameters for at least one model (${Object.keys(PAIR_PARAMS).join(", ")}).`);
  return sets;
}

/**
 * Check the user's own data and return the overlay the engine reads (frozen). Null or undefined gives null; an
 * overlay already checked is returned as it is.
 * @param {object} userData  the `user_data` of a project (format in the file header)
 * @returns {object|null}
 */
export function checkUserData(userData) {
  if (userData == null) return null;
  if (userData[CHECKED]) return userData;
  if (!isObj(userData)) throw bad("must be an object { properties, components, pairs, groups }.");
  const known = ["properties", "components", "pairs", "groups"];
  for (const k of Object.keys(userData)) if (!known.includes(k)) throw bad(`unknown key "${k}". Known: ${known.join(", ")}.`);
  for (const k of known) if (userData[k] != null && !isObj(userData[k])) throw bad(`${k} must be an object.`);

  // the user's own components first: the other parts may name them
  const ud = { components: {}, properties: {}, pairs: [], groups: {} };
  const names = new Map();
  for (const [id, c] of Object.entries(userData.components ?? {})) {
    const rec = userComponent(id, c);
    if (rec.cas) {
      const bank = Object.entries(componentData.components).find(([, d]) => d.cas === rec.cas);
      if (bank) throw bad(`components["${id}"]: ${rec.cas} is the CAS number of ${bank[1].name}, which is in the databank; add your records to it with properties["${bank[0]}"] instead of a component of your own.`);
    }
    for (const n of [rec.name, ...rec.aliases].map(s => s.toLowerCase())) {
      let clash = null;
      try { clash = findComponent(n); } catch { /* not a databank name: fine */ }
      if (clash) throw bad(`components["${id}"]: "${n}" is already the name of a databank component (${componentData.components[clash].name}); give your component another name.`);
      if (names.has(n)) throw bad(`components["${id}"]: "${n}" is also the name of ${names.get(n)}.`);
      names.set(n, id);
    }
    ud.components[id] = rec;
  }
  for (const [key, props] of Object.entries(userData.properties ?? {})) {
    let id;
    try { id = findComponent(key, ud); } catch (e) { throw bad(`properties["${key}"]: ${e.message}`); }
    if (id.startsWith(USER_PREFIX)) throw bad(`properties["${key}"]: give the records of your own component in its own entry (components["${id}"].properties).`);
    if (id === "water") {
      throw bad(`properties["${key}"]: water is calculated from IAPWS-IF97, the international standard, so records of your own are not used for it.`);
    }
    const c = componentData.components[id];
    if (ud.properties[id]) throw bad(`properties: ${c.name} is given twice ("${key}").`);
    ud.properties[id] = propertiesOf(props, `properties["${key}"]`, c);
  }
  for (const [key, g] of Object.entries(userData.groups ?? {})) {
    let id;
    try { id = findComponent(key, ud); } catch (e) { throw bad(`groups["${key}"]: ${e.message}`); }
    if (id.startsWith(USER_PREFIX)) throw bad(`groups["${key}"]: give the groups of your own component in its own entry (components["${id}"].groups).`);
    if (ud.groups[id]) throw bad(`groups: ${componentData.components[id].name} is given twice ("${key}").`);
    ud.groups[id] = groupsRecord(g, `groups["${key}"]`);
  }
  const seen = new Set();
  for (const [key, p] of Object.entries(userData.pairs ?? {})) {
    for (const s of pairSets(key, p, ud)) {
      const k = `${s.model}|${[s.i, s.j].sort().join("|")}`;
      if (seen.has(k)) throw bad(`pairs: ${s.model} parameters for ${key} are given twice.`);
      seen.add(k);
      ud.pairs.push(s);
    }
  }
  Object.defineProperty(ud, CHECKED, { value: true });
  return Object.freeze(ud);
}

/**
 * What of the user's own data a system of these components uses, for the results' notes and the Sources panel:
 * [{ component, what, source }].
 * @param {string[]} ids
 * @param {object|null} ud  a checked overlay
 * @param {object[]} pairs  the system's info.pairs
 */
export function userDataUsed(ids, ud, pairs = []) {
  if (!ud) return [];
  const out = [];
  for (const id of ids) {
    if (ud.components[id]) { out.push({ component: id, what: "component", source: ud.components[id].source.name }); continue; }
    for (const [name, r] of Object.entries(ud.properties[id] ?? {})) out.push({ component: id, what: name, source: r.source.name });
    if (ud.groups[id]) out.push({ component: id, what: "Modified UNIFAC 2.0 groups", source: ud.groups[id].userSource.name });
  }
  for (const p of pairs) if (p.tier === "user") out.push({ pair: p.pair, what: "pair parameters", source: p.source.replace(/^Your own data: /, "") });
  return out;
}
