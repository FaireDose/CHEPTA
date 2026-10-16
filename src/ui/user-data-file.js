/**
 * The user's own data as a file of its own (proposal 0012, section 3a): a personal or company library of numbers that
 * can be saved, opened into another project, and merged with what a project already holds; and the draft of a
 * contribution package (AGENTS.md) made from one of its entries, for the Data form.
 *
 * File format 1:
 *
 *   {
 *     "chepta_user_data": 1,
 *     "saved_with": "chepta 0.4.0",
 *     "saved_at": "2026-10-16T12:00:00.000Z",
 *     "title": "Our lab data",                                     // optional
 *     "user_data": { "properties", "components", "pairs", "groups" } // src/thermo/user-data.js
 *   }
 *
 * A project keeps its own copy of the data it was calculated with (its "user_data", format 3), so it never depends on
 * a library file. Opening a library adds its entries to the project; an entry that the project already holds with
 * other numbers is a conflict, kept as it is in the project until the person chooses the incoming one (nothing is
 * replaced silently).
 *
 * A view helper (layer 6): no thermodynamics here.
 */
import { checkUserData } from "../thermo/user-data.js";
import { findComponent, componentRecord, USER_PREFIX } from "../thermo/components.js";
import { checkPackage } from "../contrib/package-check.js";
import componentData from "../data/components.json" with { type: "json" };

/** The format version of a My data file this library writes and reads. */
export const USER_DATA_FORMAT = 1;
const PARTS = ["properties", "components", "pairs", "groups"];

const copy = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
const isObj = v => v != null && typeof v === "object" && !Array.isArray(v);
/** JSON with the keys of every object sorted: equal for equal data whatever the order it was typed in. */
const canonical = v => JSON.stringify(v, (k, x) => (isObj(x) ? Object.fromEntries(Object.keys(x).sort().map(q => [q, x[q]])) : x));

/**
 * The My data file of user data (checked first: wrong data throws, naming the problem).
 * @param {object|null} userData  as entered (the `user_data` of a project)
 * @param {{title?:string, version?:string, now?:Date}} [opts]
 */
export function userDataDoc(userData, { title, version = "", now = new Date() } = {}) {
  checkUserData(userData ?? {});
  const doc = { chepta_user_data: USER_DATA_FORMAT, saved_with: `chepta ${version}`.trim(), saved_at: now.toISOString() };
  if (title) doc.title = String(title);
  doc.user_data = copy(userData ?? {});
  return doc;
}

/** Text of a My data file (JSON, two-space indented). */
export const userDataText = doc => JSON.stringify(doc, null, 2) + "\n";

/** A file name for a My data file, ending in ".chepta-data.json": the title as typed (without characters that file
 *  systems refuse), else "my-data". */
export function userDataFileName(title) {
  const named = String(title ?? "").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\.chepta-data\.json$|\.json$/i, "").replace(/\s+/g, " ").replace(/^[\s.-]+|[\s.-]+$/g, "").slice(0, 80);
  return `${named || "my-data"}.chepta-data.json`;
}

/**
 * Read a My data file: a document or its JSON text (a byte-order mark is allowed). A project file with user data
 * (format 3) is read too, so that the data of one project can be opened into another. Throws an error naming the
 * problem.
 * @returns {{title:string|null, user_data:object}}  user_data as written in the file, checked
 */
export function readUserDataFile(input) {
  let doc = input;
  if (typeof input === "string") {
    try { doc = JSON.parse(input.replace(/^﻿/, "")); } catch (e) { throw new Error(`This is not a CHEPTA data file: the file is not valid JSON (${e.message}).`); }
  }
  if (!isObj(doc)) throw new Error("This is not a CHEPTA data file: expected a JSON object.");
  if ("fugacity_project" in doc) {
    if (doc.user_data == null) throw new Error("This project holds no data of your own (no \"user_data\"); there is nothing to open from it.");
    checkUserData(doc.user_data);
    return { title: doc.title ?? null, user_data: copy(doc.user_data) };
  }
  if (!("chepta_user_data" in doc)) {
    if ("fugacity_package" in doc) throw new Error("This is a contribution package (data for the shared databank), not a My data file.");
    throw new Error('This is not a CHEPTA data file: the "chepta_user_data" key is missing.');
  }
  const f = doc.chepta_user_data;
  if (!Number.isInteger(f) || f < 1) throw new Error(`chepta_user_data must be a format number such as ${USER_DATA_FORMAT} (got ${JSON.stringify(f)}).`);
  if (f > USER_DATA_FORMAT) throw new Error(`This data file uses format ${f}, saved with ${doc.saved_with || "a newer CHEPTA"}; this library reads format ${USER_DATA_FORMAT}. Open it with a newer version of CHEPTA.`);
  if (!isObj(doc.user_data)) throw new Error('The data file has no "user_data" object.');
  checkUserData(doc.user_data);
  return { title: doc.title ?? null, user_data: copy(doc.user_data) };
}

/**
 * The entries of user data by a key that does not depend on how a component was named: "properties.<id>.<property>",
 * "components.<id>", "pairs.<id>+<id>" (ids in alphabetical order) and "groups.<id>".
 * @returns {Map<string, {part:string, path:string[], value:any}>}
 */
function entries(raw, context = null) {
  // context: user data whose components `raw` may name (the project's, for entries being added to it)
  const ud = checkUserData(context?.components ? { ...(raw ?? {}), components: { ...context.components, ...(raw?.components ?? {}) } } : raw ?? {});
  const out = new Map();
  const id = (k, where) => {
    try { return findComponent(k, ud); } catch (e) { throw new Error(`user data: ${where}: ${e.message}`); }
  };
  for (const [k, props] of Object.entries(raw?.properties ?? {})) {
    const c = id(k, `properties["${k}"]`);
    for (const [name, rec] of Object.entries(props)) out.set(`properties.${c}.${name}`, { part: "properties", path: [c, name], value: rec });
  }
  for (const [k, c] of Object.entries(raw?.components ?? {})) out.set(`components.${k}`, { part: "components", path: [k], value: c });
  for (const [k, p] of Object.entries(raw?.pairs ?? {})) {
    const ids = k.split("+").map(s => id(s.trim(), `pairs["${k}"]`)).sort();
    out.set(`pairs.${ids.join("+")}`, { part: "pairs", path: [ids.join("+")], value: p });
  }
  for (const [k, g] of Object.entries(raw?.groups ?? {})) {
    const c = id(k, `groups["${k}"]`);
    out.set(`groups.${c}`, { part: "groups", path: [c], value: g });
  }
  return out;
}

/** A short description of an entry key, for the conflict list: "Lactic acid, liquidDensity". */
function describe(key, merged) {
  const [part, ...rest] = key.split(".");
  const name = id => {
    if (id.startsWith(USER_PREFIX)) return merged.components?.[id]?.name ?? id;
    return componentData.components[id]?.name ?? id;
  };
  if (part === "properties") return `${name(rest[0])}, ${rest.slice(1).join(".")}`;
  if (part === "pairs") return `${rest.join(".").split("+").map(name).join(" + ")}, pair parameters`;
  if (part === "groups") return `${name(rest[0])}, Modified UNIFAC 2.0 groups`;
  return `${name(rest.join("."))} (your own component)`;
}

/**
 * Add the entries of `incoming` (a My data file being opened) to `current` (the project's). An entry only in one of
 * them is taken; an entry in both with the same numbers is kept once; an entry in both with other numbers is a
 * conflict: the current one is kept unless choose[key] is "incoming".
 *
 * Property records merge one property at a time; a component, a pair (all its models and its source together) and a
 * component's groups are one entry each. Keys are written as component ids.
 *
 * @param {object|null} current   user data as entered
 * @param {object|null} incoming  user data as entered
 * @param {Object<string,"current"|"incoming">} [choose]  per conflict key
 * @returns {{userData:object|null, added:string[], same:string[],
 *            conflicts:{key:string, what:string, current:any, incoming:any, kept:"current"|"incoming"}[]}}
 *          userData: the result, checked (null when empty)
 */
export function mergeUserData(current, incoming, choose = {}) {
  const a = entries(current), b = entries(incoming, current);
  for (const [k, v] of Object.entries(choose ?? {})) {
    if (v !== "current" && v !== "incoming") throw new Error(`choose["${k}"] must be "current" or "incoming" (got ${JSON.stringify(v)}).`);
  }
  const added = [], same = [], conflicts = [];
  const result = new Map(a);
  for (const [key, e] of b) {
    if (!a.has(key)) { result.set(key, e); added.push(key); continue; }
    if (canonical(a.get(key).value) === canonical(e.value)) { same.push(key); continue; }
    const kept = choose?.[key] === "incoming" ? "incoming" : "current";
    if (kept === "incoming") result.set(key, e);
    conflicts.push({ key, current: copy(a.get(key).value), incoming: copy(e.value), kept });
  }
  const merged = fromEntries(result);   // checked: e.g. two components of the same name under different ids are refused
  for (const c of conflicts) c.what = describe(c.key, merged ?? {});
  return { userData: merged, added, same, conflicts };
}

/** User data from entries (keys as component ids), checked; null when empty. */
function fromEntries(map) {
  const out = {};
  for (const { part, path, value } of map.values()) {
    out[part] ??= {};
    if (part === "properties") (out.properties[path[0]] ??= {})[path[1]] = copy(value);
    else out[part][path[0]] = copy(value);
  }
  const ud = PARTS.some(p => out[p]) ? Object.fromEntries(PARTS.filter(p => out[p]).map(p => [p, out[p]])) : null;
  if (ud) checkUserData(ud);
  return ud;
}

/**
 * User data without one entry (a key of userDataKeys); null when nothing is left. Throws when another entry needs it
 * (a pair or the groups of a component of the user's own that is being removed), naming it.
 */
export function removeUserDataEntry(userData, key) {
  const e = entries(userData);
  if (!e.has(key)) throw new Error(`user data has no entry "${key}".`);
  e.delete(key);
  return fromEntries(e);
}

/**
 * Put entries into user data, replacing those with the same key (the person saves them on purpose); keys as component
 * ids. The result is checked.
 */
export function putUserData(userData, piece) {
  const choose = Object.fromEntries([...entries(piece, userData).keys()].map(k => [k, "incoming"]));
  return mergeUserData(userData, piece, choose).userData;
}

/** The entries of user data for a list: [{ key, what, component, source, value }], by component. */
export function userDataList(userData) {
  const ud = userData ?? {};
  const out = [];
  for (const [key, e] of entries(ud)) {
    const value = e.value;
    const src = typeof value.source === "string" ? value.source : value.source?.name ?? "";
    out.push({ key, part: e.part, component: e.part === "pairs" ? null : e.path[0], what: describe(key, ud), source: src, fit: value.source?.fit ?? null, value: copy(value) });
  }
  return out;
}

/** The entry keys of user data (as mergeUserData names them), for choosing what to export. */
export const userDataKeys = userData => [...entries(userData).keys()];

// a record as a contribution carries it: the person's numbers and source, without the workbench's own fields
function cleanRecord(r) {
  const { tier, userSource, ...rest } = r;
  return rest;
}

/**
 * The draft of a contribution package (AGENTS.md, "Contribution package format") for one entry of the user's data, to
 * submit with the Data form after the person has checked every number against its source. The entry's source may
 * carry the package's fields (citation, doi, open_copy, access, tables); what is still missing is listed in
 * `problems`, and a package with problems is not ready to submit.
 *
 * Pair parameters cannot be contributed as such (AGENTS.md rule 5: the repository fits its own parameters to cited
 * data): their draft asks for the measured mixture data instead.
 *
 * @param {object} userData  as entered
 * @param {string} key       an entry key (userDataKeys), e.g. "properties.lactic-acid.liquidDensity"
 * @param {{prepared_with?:string}} [opts]
 * @returns {{package:object, problems:string[], warnings:string[]}}
 */
export function userDataPackage(userData, key, { prepared_with = "CHEPTA (My data export)" } = {}) {
  const ud = checkUserData(userData ?? {});
  const e = entries(userData).get(key);
  if (!e) throw new Error(`user data has no entry "${key}". Entries: ${userDataKeys(userData).join(", ") || "none"}.`);
  const problems = [];
  const sourceOf = s => {
    const src = typeof s === "string" ? { name: s } : (s ?? {});
    const out = { citation: src.citation ?? src.name ?? "" };
    for (const k of ["doi", "open_copy", "access", "tables"]) out[k] = src[k] ?? "";
    return out;
  };
  const compOf = id => {
    const c = componentRecord(id, ud);
    const raw = id.startsWith(USER_PREFIX) ? userData.components[id] : null;
    return { name: c.name, cas: raw?.cas ?? c.cas ?? "" };
  };
  const pkg = { fugacity_package: 1, type: "component", summary: "", prepared_with, components: [], source: {}, data: [] };
  const vpData = (vp, name) => {
    if (!vp?.points?.length) return;
    pkg.data.push({ kind: "pure-vapour-pressure", columns: ["T_K", "Psat_kPa"], rows: vp.points.map(([T, p]) => [T, p / 1000]),
      notes: `${name}: the points of the vapour-pressure record, converted from Pa to kPa.` });
  };

  if (e.part === "properties") {
    const [id, prop] = e.path;
    const c = componentRecord(id);
    const rec = ud.properties[id][prop];
    pkg.summary = `${c.name}: ${prop}`;
    pkg.components = [compOf(id)];
    pkg.source = sourceOf(e.value.source);
    pkg.component_entry = { id, name: c.name, cas: c.cas,
      ...(prop === "vapourPressure" ? { vapourPressure: cleanRecord(rec) } : prop === "fusion" ? { fusion: cleanRecord(rec) } : { properties: { [prop]: cleanRecord(rec) } }) };
    if (prop === "vapourPressure") vpData(rec, c.name);
  } else if (e.part === "components") {
    const [id] = e.path;
    const c = ud.components[id];
    pkg.summary = `New component: ${c.name}`;
    pkg.components = [compOf(id)];
    pkg.source = sourceOf(e.value.source);
    const entry = { id: id.slice(USER_PREFIX.length), name: c.name, formula: c.formula, cas: pkg.components[0].cas || null, MW: c.MW };
    if (c.class) entry.class = c.class;
    if (c.Tc_K != null) Object.assign(entry, { Tc_K: c.Tc_K, Pc_Pa: c.Pc_Pa, omega: c.omega });
    if (c.vapourPressure) entry.vapourPressure = cleanRecord(c.vapourPressure);
    if (Object.keys(c.properties).length) entry.properties = Object.fromEntries(Object.entries(c.properties).map(([k, r]) => [k, cleanRecord(r)]));
    if (c.fusion) entry.fusion = cleanRecord(c.fusion);
    if (c.modUnifac?.groups) entry.modUnifac = { groups: c.modUnifac.groups };
    pkg.component_entry = entry;
    vpData(c.vapourPressure, c.name);
  } else if (e.part === "groups") {
    const [id] = e.path;
    const c = componentRecord(id);
    pkg.summary = `${c.name}: Modified UNIFAC 2.0 groups`;
    pkg.components = [compOf(id)];
    pkg.source = sourceOf(e.value.source);
    pkg.component_entry = { id, name: c.name, cas: c.cas, modUnifac: { groups: ud.groups[id].groups } };
  } else {
    const ids = e.path[0].split("+");
    pkg.type = "pair-data";
    pkg.summary = `${ids.map(i => componentRecord(i, ud).name).join(" + ")}: mixture data`;
    pkg.components = ids.map(compOf);
    pkg.source = sourceOf(e.value.source);
    pkg.user_parameters = copy(e.value);
    problems.push("Pair parameters are not contributed as such: the repository fits its own parameters to cited measured data (AGENTS.md rule 5). Add the measured mixture data the parameters were fitted to (\"data\": isobaric T-x-y, isothermal P-x-y, ...), from an open source.");
  }
  pkg.notes = "Exported from the person's own data in CHEPTA (tier \"user\"). Before submitting, compare every number with the source (AGENTS.md rule 4).";
  for (const k of Object.keys(pkg.source)) if (pkg.source[k] === "") delete pkg.source[k];
  if (!pkg.data.length) delete pkg.data;
  const { errors, warnings } = checkPackage(pkg, componentData.components);
  problems.push(...errors);
  return { package: pkg, problems, warnings };
}
