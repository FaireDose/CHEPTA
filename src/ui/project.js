/**
 * Project files of the workbench: save the work as a small JSON document and open it again.
 *
 * A project holds what the person set, not what was calculated: the model, the conditions,
 * the units, the inputs of every workspace, the flash specification and feed, the parameter
 * sets chosen per pair and the view that was open. Opening it rebuilds the workbench from
 * these and calculates everything again with the library that opens it. A project may also
 * carry `results`, the stream table of the flash as it was at save time, so the mass balance
 * can be read without CHEPTA (it is a record and is never read back into a calculation).
 *
 * Format 6 (the "fugacity_project" key is the format version): format 5 with the flowsheet's Column block (proposal
 * 0015, milestone M1; written only when the flowsheet has a column), and the Column workspace's own document ("column",
 * a flowsheet with one column; M2b). Format 5: format 4 with the Charts workspace's fluid charts
 * (`workbench.chart`: the chart, isobars, isotherms, compression, components and feed; proposal 0013, step 7). Format 4
 * is format 3 with the flowsheet's energy streams, its heat exchanger, valve, pump, compressor and expander blocks,
 * and the Heat exchanger workspace (`workbench.hx`) of proposal 0013. Format 3 is format 2 with "user_data"; format 1
 * is format 2 without "flowsheet". A project is written in the lowest format that holds it (6 only with a column, 5 only
 * with the fluid charts, 4 only with the other features of proposal 0013, 3 only with user data, else 2), so older versions still
 * open it:
 *
 *   {
 *     "fugacity_project": 1,
 *     "saved_with": "chepta 0.3.0",
 *     "saved_at": "2026-10-06T12:00:00.000Z",
 *     "title": "Ethanol, water",                 // optional
 *     "workbench": {
 *       "view": "flash", "diagram": "txy",        // open view; the diagram Phase equilibrium remembers
 *       "model": "NRTL", "eos": "PR", "vapour": "ideal",
 *       "P_kPa": 101.325, "T_K": null,
 *       "units": { "T": "C", "P": "kPa", "basis": "mass", "viscosity": "mPa s" }, "basis": "mole",
 *       "inputs": { "txy": [...], "ternary": [...], "azeotropes": [...], "pxy": [...], "envelope": [...],
 *                   "flash": [...], "henry": { "gas", "solvent" }, "properties": [...] },
 *       "z": { "pxy": null, "envelope": null },
 *       "flash": { "spec", "T_K", "P_kPa", "VF", "Q_J_mol", "feedT_K", "feedP_kPa", "duty", "z", "flow", "flowUnit" },
 *       "sets": { "ethanol+water": "chemsep" }, "prefer": null,
 *       "henryT_K", "henryP_kPa", "compareGases", "sleT_K", "solidUnit", "property", "steamP_kPa",
 *       "background", "residueCurves", "isotherms", "grid", "panels", "ribbon"
 *     },
 *     "flowsheet": { "components", "thermo", "blocks", "streams", "solver" },   // optional; src/flowsheet/document.js
 *     "column": { ...the same },   // optional, format 6: the Column workspace (column-workspace.js)
 *     "results": { "flash": { "columns", "rows", "summary", "model", "spec", "sources" } },  // optional
 *     "user_data": { "properties", "components", "pairs", "groups" }   // optional; format 3 (src/thermo/user-data.js)
 *   }
 *
 * SI units throughout (K, kPa, J/mol), as in the engine; `units` is only how the workbench
 * shows them. Reading checks the format and every value with the same checks as
 * CHEPTA.app's configuration, and throws an error that names the problem.
 *
 * A view helper (layer 6): no thermodynamics here.
 */
import { initialState, applyPatch, VIEWS, userOverlay, CHART_DEFAULTS } from "./app-logic.js";
import { normalizeFlowsheet, flowsheetDocStatus } from "../flowsheet/document.js";
import { checkUserData } from "../thermo/user-data.js";

/** The newest format this library writes; it reads this one and every older one. Format 3 adds the user's own data
 *  (proposal 0012) and is written only when there is some; format 2 adds the flowsheet (proposal 0006, step 4); a
 *  format 1 file is a format 2 file without it. */
export const PROJECT_FORMAT = 6;
/** The flowsheet block types that need format 4 (proposal 0013). */
const FORMAT_4_BLOCKS = ["hx", "valve", "pump", "compressor", "expander"];
/** The flowsheet block types that need format 6 (proposal 0015). */
const FORMAT_6_BLOCKS = ["column"];
const hasBlock = (fs, types) => !!fs?.blocks?.some(b => types.includes(b?.type));

/** The keys of `workbench`, in the order they are written. */
const KEYS = ["view", "diagram", "model", "eos", "vapour", "P_kPa", "T_K", "units", "basis", "inputs", "z", "flash", "sets", "prefer",
  "henryT_K", "henryP_kPa", "compareGases", "sleT_K", "solidUnit", "property", "steamP_kPa", "background", "residueCurves", "isotherms", "grid", "panels", "ribbon", "hx", "chart"];

const copy = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

/**
 * The project document of a workbench state.
 * @param {object} state      the workbench state (app-logic.js)
 * @param {object} [opts]
 * @param {string} [opts.version]   library version, recorded in `saved_with`
 * @param {object} [opts.results]   records to keep with the project (e.g. { flash: stream table })
 * @param {Date}   [opts.now]
 */
export function projectOf(state, { version = "", results, now = new Date() } = {}) {
  const w = {};
  for (const k of KEYS) w[k] = copy(state[k]);
  // the Heat exchanger workspace: kept only when it was used (format 4), with its components (so the inputs of
  // format 3 stay as they were)
  if (w.hx == null) delete w.hx; else w.hx = { ...w.hx, components: copy(state.inputs.hx ?? []) };
  const { steam, hx, charts, ...inputs } = w.inputs;   // steam takes no inputs (always water); the exchanger keeps its own
  w.inputs = inputs;
  // the fluid charts (format 5): kept only when they were used, with their components and feed (so the inputs and the
  // compositions of format 4 stay as they were)
  const { charts: zc, ...zs } = w.z ?? {};
  w.z = zs;
  const chartUsed = state.view === "charts" || (state.chart != null && JSON.stringify(state.chart) !== JSON.stringify(CHART_DEFAULTS));
  if (chartUsed) w.chart = { ...copy(state.chart), components: copy(state.inputs.charts ?? []), z: copy(zc ?? null) };
  else delete w.chart;
  const fs = state.flowsheet;
  const flowsheet = fs && (fs.components?.length || fs.blocks?.length) ? normalizeFlowsheet(fs, userOverlay(state)) : null;
  const needs4 = w.hx != null || !!flowsheet?.energyStreams || !!flowsheet?.blocks.some(b => FORMAT_4_BLOCKS.includes(b.type));
  const needs6 = hasBlock(flowsheet, FORMAT_6_BLOCKS) || hasBlock(state.reactor, FORMAT_6_BLOCKS)
    || !!state.column?.components?.length;
  const doc = { fugacity_project: needs6 ? 6 : w.chart ? 5 : needs4 ? 4 : state.userData ? 3 : 2, saved_with: `chepta ${version}`.trim(), saved_at: now.toISOString() };
  if (state.title) doc.title = String(state.title);
  doc.workbench = w;
  if (flowsheet) doc.flowsheet = flowsheet;
  // the Reactor workspace's own document, when it has been used
  if (state.reactor?.components?.length) doc.reactor = normalizeFlowsheet(state.reactor, userOverlay(state));
  // the Column workspace's own document (format 6), when it has been used
  if (state.column?.components?.length) doc.column = normalizeFlowsheet(state.column, userOverlay(state));
  if (state.sharedReactions?.length) doc.shared_reactions = copy(state.sharedReactions);
  if (results && Object.keys(results).length) doc.results = copy(results);
  if (state.userData) doc.user_data = copy(state.userData);
  return doc;
}

/** Text of a project file (JSON, two-space indented). */
export const projectText = doc => JSON.stringify(doc, null, 2) + "\n";

/**
 * A file name for a project, ending in ".chepta.json": the name the person gave the project
 * (kept as typed, without characters that file systems refuse), else "chepta-" and the
 * components.
 */
export function projectFileName(state) {
  const named = String(state.title ?? "").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\.(chepta|fugacity)\.json$|\.json$/i, "").replace(/\s+/g, " ").replace(/^[\s.-]+|[\s.-]+$/g, "").slice(0, 80);
  if (named) return `${named}.chepta.json`;
  const base = state.components?.length ? state.components.join("-") : "workbench";
  const slug = base.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "workbench";
  return `chepta-${slug}.chepta.json`;
}

/**
 * Parse a project: a document, or its JSON text (a byte-order mark is allowed). Throws an
 * error naming the problem when it is not a CHEPTA project or a value is wrong.
 * @returns {object} the document, checked
 */
export function readProject(input) {
  let doc = input;
  if (typeof input === "string") {
    try { doc = JSON.parse(input.replace(/^﻿/, "")); } catch (e) { throw new Error(`This is not a CHEPTA project: the file is not valid JSON (${e.message}).`); }
  }
  if (doc == null || typeof doc !== "object" || Array.isArray(doc)) throw new Error("This is not a CHEPTA project: expected a JSON object.");
  if (!("fugacity_project" in doc)) {
    if ("fugacity_package" in doc) throw new Error("This is a contribution package (data for the project), not a workbench project; check it with CHEPTA.checkPackage().");
    throw new Error('This is not a CHEPTA project: the "fugacity_project" key is missing.');
  }
  const f = doc.fugacity_project;
  if (!Number.isInteger(f) || f < 1) throw new Error(`fugacity_project must be a format number such as ${PROJECT_FORMAT} (got ${JSON.stringify(f)}).`);
  if (f > PROJECT_FORMAT) throw new Error(`This project uses format ${f}, saved with ${doc.saved_with || "a newer CHEPTA"}; this library reads formats 1 to ${PROJECT_FORMAT}. Open it with a newer version of CHEPTA.`);
  const w = doc.workbench;
  if (w == null || typeof w !== "object" || Array.isArray(w)) throw new Error('The project has no "workbench" object.');
  const unknown = Object.keys(w).filter(k => !KEYS.includes(k));
  if (unknown.length) throw new Error(`workbench: unknown key${unknown.length > 1 ? "s" : ""} ${unknown.map(k => `"${k}"`).join(", ")}. Known: ${KEYS.join(", ")}.`);
  if (doc.results != null && (typeof doc.results !== "object" || Array.isArray(doc.results))) throw new Error("results must be an object.");
  if (w.hx != null && f < 4) throw new Error(`workbench.hx needs format 4 (this file says format ${f}).`);
  if (w.chart != null && f < 5) throw new Error(`workbench.chart needs format 5 (this file says format ${f}).`);
  if ((hasBlock(doc.flowsheet, FORMAT_6_BLOCKS) || hasBlock(doc.reactor, FORMAT_6_BLOCKS)) && f < 6) throw new Error(`The flowsheet's column block needs format 6 (this file says format ${f}).`);
  if (doc.column != null && f < 6) throw new Error(`The Column workspace needs format 6 (this file says format ${f}).`);
  if (doc.flowsheet?.energyStreams != null && f < 4) throw new Error(`flowsheet.energyStreams needs format 4 (this file says format ${f}).`);
  if (doc.user_data != null) {
    if (f < 3) throw new Error(`user_data needs format 3 (this file says format ${f}).`);
    checkUserData(doc.user_data);   // throws "user data: ..." naming the problem
  }
  return doc;
}

/**
 * The workbench state of a project, built with the same checks as CHEPTA.app's
 * configuration: an unknown model, unit, view or component throws, naming it (a project
 * saved with a newer databank may name components this version does not hold).
 */
export function stateFromProject(input) {
  const doc = readProject(input);
  const w = doc.workbench;
  const cfg = { components: [] };
  for (const k of ["model", "eos", "vapour", "P_kPa", "T_K", "units", "basis", "background", "panels", "ribbon", "residueCurves",
    "isotherms", "grid", "property", "henryP_kPa", "henryT_K", "compareGases", "sleT_K", "solidUnit", "steamP_kPa", "sets", "prefer"]) {
    if (w[k] !== undefined && w[k] !== null) cfg[k] = w[k];
  }
  if (w.T_K === null) delete cfg.T_K;
  if (w.flash != null) {
    if (typeof w.flash !== "object" || Array.isArray(w.flash)) throw new Error("workbench.flash must be an object.");
    const { z, ...rest } = w.flash;
    cfg.flash = rest;
  }
  if (w.hx != null) {
    if (typeof w.hx !== "object" || Array.isArray(w.hx)) throw new Error("workbench.hx must be an object.");
    const { components, ...rest } = w.hx;
    cfg.hx = rest;
  }
  if (w.chart != null) {
    if (typeof w.chart !== "object" || Array.isArray(w.chart)) throw new Error("workbench.chart must be an object.");
    const { components, z, ...rest } = w.chart;
    cfg.chart = rest;
  }
  if (doc.title) cfg.title = String(doc.title);
  if (doc.flowsheet != null) cfg.flowsheet = doc.flowsheet;
  if (doc.reactor != null) cfg.reactor = doc.reactor;
  if (doc.column != null) cfg.column = doc.column;
  if (doc.shared_reactions != null) cfg.sharedReactions = doc.shared_reactions;
  if (doc.user_data != null) cfg.userData = doc.user_data;
  let s = initialState(cfg);
  if (w.inputs != null) {
    if (typeof w.inputs !== "object" || Array.isArray(w.inputs)) throw new Error("workbench.inputs must be an object such as { txy: [\"ethanol\", \"water\"] }.");
    const { steam, ...inputs } = w.inputs;
    s = applyPatch(s, { inputs });
  }
  // the Heat exchanger's components: saved with the workspace (format 4); else seeded as a new workbench seeds them,
  // like the flash's
  s = applyPatch(s, { inputs: { hx: Array.isArray(w.hx?.components) ? w.hx.components : s.inputs.flash } });
  // compositions after the inputs (new inputs reset them)
  if (w.flash?.z != null) s = applyPatch(s, { flash: { z: w.flash.z } });
  // the fluid charts' components: saved with the charts (format 5); else seeded as a new workbench seeds them, from the
  // list the phase envelope takes
  s = applyPatch(s, { inputs: { charts: Array.isArray(w.chart?.components) ? w.chart.components : (s.inputs.envelope ?? []).slice(0, 6) } });
  for (const v of ["pxy", "envelope"]) {
    const z = w.z?.[v];
    if (z != null) s = applyPatch(s, { view: v, z });
  }
  if (w.chart?.z != null) s = applyPatch(s, { view: "charts", z: w.chart.z });
  const check = (v, key) => {
    if (v != null && !VIEWS[v]) throw new Error(`workbench.${key}: unknown view "${v}". Known: ${Object.keys(VIEWS).join(", ")}.`);
  };
  check(w.diagram, "diagram"); check(w.view, "view");
  if (w.diagram && VIEWS[w.diagram].workspace === "equilibrium") s = applyPatch(s, { view: w.diagram });
  s = applyPatch(s, { view: w.view ?? s.view, utility: null });
  return s;
}

/**
 * Check a project without opening it: every problem found, as text, and the flowsheet's
 * status (structure and degrees of freedom). Never throws; for files written by hand or by
 * an AI assistant before they are opened.
 * @returns {{ok:boolean, problems:string[], flowsheet:object|null}}
 */
export function checkProject(input) {
  const problems = [];
  let doc = null, flowsheet = null;
  try { doc = readProject(input); } catch (e) { return { ok: false, problems: [e.message], flowsheet: null }; }
  try { stateFromProject(doc); } catch (e) { problems.push(e.message); }
  if (doc.flowsheet != null) {
    try {
      flowsheet = flowsheetDocStatus(doc.flowsheet, checkUserData(doc.user_data));
      if (flowsheet.setup === false) problems.push(`flowsheet: ${flowsheet.message}`);
      problems.push(...flowsheet.structure.map(p => `flowsheet: ${p.message}`));
      problems.push(...Object.values(flowsheet.blocks).filter(b => !b.ok).map(b => `flowsheet: ${b.message}`));
    } catch (e) { problems.push(`flowsheet: ${e.message}`); }
  }
  return { ok: !problems.length, problems, flowsheet };
}
