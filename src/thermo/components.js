/**
 * Component lookup (layer 1): the components of src/data/components.json by id, name, alias,
 * formula or CAS number. Kept apart from system.js so that the library (library.js) and the
 * systems can both use it.
 *
 * The user's own data (proposal 0012, src/thermo/user-data.js) is an overlay: every function here takes it as an
 * optional argument, already checked by checkUserData(), and never stores it. Without it the databank alone is used.
 */
import componentData from "../data/components.json" with { type: "json" };
import { fail } from "../util/errors.js";

/** Ids of the user's own components start with this, so that they never collide with a databank id. */
export const USER_PREFIX = "user:";

// a user-data argument is a checked overlay (an object with `components`); anything else (e.g. the index Array.map
// passes as its second argument) is no user data
const overlay = ud => (ud && typeof ud === "object" && !Array.isArray(ud) && ud.components ? ud : null);

/**
 * The record of a component, in the format of components.json: the databank's, with the user's property records,
 * vapour pressure, melting data and Modified UNIFAC 2.0 groups put over it; or the user's own component.
 * @param {string} id
 * @param {object} [userData]  a checked overlay (checkUserData)
 */
export function componentRecord(id, userData = null) {
  const ud = overlay(userData);
  if (String(id).startsWith(USER_PREFIX)) {
    const c = ud?.components[id];
    if (!c) throw fail("BAD_INPUT", `Unknown component "${id}": it is not in this project's own data.`);
    return c;
  }
  const c = componentData.components[id];
  const props = ud?.properties[id], groups = ud?.groups[id];
  if (!props && !groups) return c;
  const out = { ...c };
  if (props) {
    const { vapourPressure, fusion, ...rest } = props;
    out.properties = { ...(c.properties || {}), ...rest };
    if (vapourPressure) out.vapourPressure = vapourPressure;
    if (fusion) out.fusion = fusion;
  }
  if (groups) out.modUnifac = groups;
  out.userRecords = [...Object.keys(props || {}), ...(groups ? ["modUnifac"] : [])];
  return out;
}

const describe = (id, c) => ({
  id, name: c.name, formula: c.formula, cas: c.cas, aliases: c.aliases ?? [],
  activity: Boolean((c.vapourPressure && (c.uniquac || c.Tb_K > 298.15 || c.tier === "user")) || c.class === "nonvolatile"),
  uniquac: Boolean(c.uniquac), modUnifac: Boolean(c.modUnifac?.groups),
  // melting temperature and enthalpy of fusion (solid-liquid equilibrium)
  fusion: Boolean(c.fusion && c.fusion.available !== false),
  ...(c.tier === "user" ? { user: true } : {}),
});

/**
 * All components in the databank, as { id, name, formula, cas, aliases, activity, uniquac }, and with
 * opts.userData the user's own components after them (`user: true`).
 * `activity` is true when the component can be used with activity-coefficient models: a liquid at
 * 25 degC (normal boiling point above 298.15 K) with a vapour-pressure record; light gases are
 * described by equations of state. `uniquac` is true when it also has UNIQUAC r and q: without them
 * NRTL and the ideal solution still work, UNIQUAC does not (src/thermo/system.js says so). Components
 * from ChemSep have r and q; those built from measured data alone have none until an open source
 * gives them (roadmap A3).
 * `aliases` are other names it is known by (lower case), for searching.
 * @param {{userData?: object}} [opts]  userData: a checked overlay (checkUserData)
 */
export function listComponents(opts = {}) {
  const ud = overlay(opts?.userData);
  const ids = [...Object.keys(componentData.components), ...Object.keys(ud?.components ?? {})];
  return ids.map(id => describe(id, componentRecord(id, ud)));
}

const norm = s => String(s).trim().toLowerCase().replace(/[\s_]+/g, " ");

/**
 * Find a component by id, name, alias or CAS number (case-insensitive); with userData the user's own components are
 * searched first.
 * @param {string} key
 * @param {object} [userData]  a checked overlay (checkUserData)
 * @returns {string} component id
 */
export function findComponent(key, userData = null) {
  const ud = overlay(userData);
  const k = norm(key);
  const all = [...Object.entries(ud?.components ?? {}), ...Object.entries(componentData.components)];
  for (const [id, c] of all) {
    const names = [id, c.name, c.cas, c.formula, ...(c.aliases || [])].filter(v => v != null).map(norm);
    if (names.includes(k) || names.includes(k.replace(/ /g, "-"))) return id;
  }
  const known = listComponents({ userData: ud }).map(c => c.name).join(", ");
  throw fail("BAD_INPUT", `Unknown component "${key}". Available: ${known}.`);
}
