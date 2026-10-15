/**
 * Component lookup (layer 1): the components of src/data/components.json by id, name, alias,
 * formula or CAS number. Kept apart from system.js so that the library (library.js) and the
 * systems can both use it.
 */
import componentData from "../data/components.json" with { type: "json" };
import { fail } from "../util/errors.js";

/**
 * All components in the databank, as { id, name, formula, cas, aliases, activity, uniquac }.
 * `activity` is true when the component can be used with activity-coefficient models: a liquid at
 * 25 degC (normal boiling point above 298.15 K) with a vapour-pressure record; light gases are
 * described by equations of state. `uniquac` is true when it also has UNIQUAC r and q: without them
 * NRTL and the ideal solution still work, UNIQUAC does not (src/thermo/system.js says so). Components
 * from ChemSep have r and q; those built from measured data alone have none until an open source
 * gives them (roadmap A3).
 * `aliases` are other names it is known by (lower case), for searching.
 */
export function listComponents() {
  return Object.entries(componentData.components).map(([id, c]) => ({
    id, name: c.name, formula: c.formula, cas: c.cas, aliases: c.aliases ?? [], activity: Boolean((c.vapourPressure && (c.uniquac || c.Tb_K > 298.15)) || c.class === "nonvolatile"), uniquac: Boolean(c.uniquac), modUnifac: Boolean(c.modUnifac?.groups),
    // melting temperature and enthalpy of fusion (solid-liquid equilibrium)
    fusion: Boolean(c.fusion && c.fusion.available !== false),
  }));
}

const norm = s => String(s).trim().toLowerCase().replace(/[\s_]+/g, " ");

/**
 * Find a component by id, name, alias or CAS number (case-insensitive).
 * @param {string} key
 * @returns {string} component id
 */
export function findComponent(key) {
  const k = norm(key);
  for (const [id, c] of Object.entries(componentData.components)) {
    const names = [id, c.name, c.cas, c.formula, ...(c.aliases || [])].map(norm);
    if (names.includes(k) || names.includes(k.replace(/ /g, "-"))) return id;
  }
  const known = listComponents().map(c => c.name).join(", ");
  throw fail("BAD_INPUT", `Unknown component "${key}". Available: ${known}.`);
}
