/**
 * The request path (proposal 0015, section 9, contract 6; roadmap G1; proposal 0011, step 1): one dispatcher,
 * run(request) → result, over the existing functions, for the workbench, chat pages, the command line and the MCP
 * server alike. No second simulator: every capability calls the functions of the layers below.
 *
 *   run({ capability: "solve_flowsheet", input: { project }, limits: { time_ms: 60000 } })
 *   → { chepta_result: 1, capability, outcome, value?, error?, checks?, qualifications?, reproduction, run }
 *
 * A request is plain JSON: component ids or names, the property method, the parameter sets and the user's data, from
 * which a capability builds the property package (flowsheetSystem), as the project files do; runUnit, which takes a
 * live system, is not called with a request's objects directly.
 *
 * outcome:
 *   "ok"              the calculation or the lookup was done (value)
 *   "invalid_input"   the request is wrong, or outside a record's range (BAD_INPUT, OUT_OF_RANGE); error.where
 *                     names the fields or blocks
 *   "missing_data"    a property or parameter is not in the data (MISSING_DATA): supply it (My data), do not guess it
 *   "unsupported"     the capability, mode or state is not built yet, or the method cannot represent the state
 *                     (NOT_AVAILABLE, PHASE_SPLIT; a capability listed with status "unsupported")
 *   "not_converged"   a solver did not converge (NO_CONVERGENCE); this says nothing about whether the state exists
 *   "cancelled"       the run was cancelled before its result was accepted
 *   "out_of_time"     the run exceeded limits.time_ms (given by the worker of milestone M1; src/runtime/envelope.js)
 *   "error"           a bug in CHEPTA (an error without a code): please report it
 *
 * checks: the residuals by group (material, energy, the tear streams' change) and the tolerances. qualifications: the
 * method, each pair's parameter set and tier, the pairs without parameters, the notes and warnings of the blocks.
 * reproduction: the library version, the methods and parameter sets, and the hashes of the input, the records used
 * (databank) and the user's data (src/api/hash.js). A converged result is not a result validated against data.
 */
import pkg from "../../package.json" with { type: "json" };
import { isCheptaError, fail } from "../util/errors.js";
import { hash64 } from "./hash.js";
import { checkSchema } from "./schema.js";
import { newRun, endRun, checkLimits } from "../runtime/envelope.js";
import { findComponent, componentRecord } from "../thermo/components.js";
import { componentSources } from "../thermo/library.js";
import { checkUserData } from "../thermo/user-data.js";
import { flowsheetRun, flowsheetDocStatus, normalizeFlowsheet } from "../flowsheet/document.js";
import { checkProject, readProject } from "../ui/project.js";
import { sizeDrum, sizeDecanter, flashBlockResult } from "../sizing/sizing.js";

export const RESULT_FORMAT = 1;
export const OUTCOMES = Object.freeze(["ok", "invalid_input", "missing_data", "unsupported", "not_converged", "cancelled", "out_of_time", "error"]);
const OUTCOME_OF = { BAD_INPUT: "invalid_input", OUT_OF_RANGE: "invalid_input", MISSING_DATA: "missing_data",
  NOT_AVAILABLE: "unsupported", PHASE_SPLIT: "unsupported", NO_CONVERGENCE: "not_converged" };

const CAPS = new Map();

/**
 * Register a capability: { name, summary, status: "available" | "unsupported", readOnly, input (schema), planned
 * (for an unsupported one: where it is planned), run(input) → { value, checks?, qualifications?, reproduction? } }.
 */
export function registerCapability(def, { replace = false } = {}) {
  if (!def || !/^[a-z][a-z_]*$/.test(def.name ?? "")) throw new Error("Internal: a capability needs a name in snake_case.");
  if (CAPS.has(def.name) && !replace) throw new Error(`Internal: the capability "${def.name}" is registered already.`);
  if (!["available", "unsupported"].includes(def.status)) throw new Error(`Internal: capability ${def.name}: status must be "available" or "unsupported".`);
  if (def.status === "available" && typeof def.run !== "function") throw new Error(`Internal: capability ${def.name} has no run function.`);
  CAPS.set(def.name, Object.freeze({ readOnly: true, ...def }));
}

/** The capabilities, as an agent or a page reads them: name, summary, status, readOnly, input schema, planned. */
export const capabilities = () => [...CAPS.values()].map(c => ({ name: c.name, summary: c.summary, status: c.status, readOnly: c.readOnly,
  input: c.input, ...(c.planned ? { planned: c.planned } : {}) }));

/** Run a request; never throws (a bug in CHEPTA is the outcome "error"). */
export function run(request) {
  const reproduction = { library: pkg.version };
  let theRun = null, capability = request?.capability ?? null;
  const finish = (status, body) => {
    const runRec = theRun ? endRun(theRun, status) : null;
    const outcome = runRec?.status === "cancelled" ? "cancelled" : body.outcome;
    return { chepta_result: RESULT_FORMAT, capability, outcome, ...(outcome === "cancelled" ? {} : body.rest),
      reproduction: { ...reproduction, ...(body.reproduction ?? {}) }, ...(runRec ? { run: runRec } : {}) };
  };
  try {
    if (!request || typeof request !== "object" || Array.isArray(request)) throw fail("BAD_INPUT", "A request is an object such as { \"capability\": \"solve_flowsheet\", \"input\": { ... } }.");
    const bad = Object.keys(request).filter(k => !["capability", "input", "limits"].includes(k));
    if (bad.length) throw fail("BAD_INPUT", `request: unknown key ${bad.map(k => `"${k}"`).join(", ")}. Known: capability, input, limits.`, { where: bad.map(k => ({ field: `request.${k}` })) });
    const cap = CAPS.get(capability);
    if (!cap) throw fail("BAD_INPUT", `No capability "${capability}". Known: ${[...CAPS.keys()].join(", ")}.`, { where: [{ field: "request.capability" }] });
    const input = request.input ?? {};
    reproduction.input_hash = hash64({ capability, input });
    theRun = newRun(reproduction.input_hash, checkLimits(request.limits));
    if (cap.status === "unsupported") {
      return finish("failed", { outcome: "unsupported", rest: { error: { code: "NOT_AVAILABLE", message: `${cap.summary}: not available yet${cap.planned ? ` (${cap.planned})` : ""}.`, where: [] } } });
    }
    checkSchema(cap.input, input);
    const r = cap.run(input);
    return finish("done", { outcome: "ok", reproduction: r.reproduction,
      rest: { value: r.value, ...(r.checks ? { checks: r.checks } : {}), ...(r.qualifications ? { qualifications: r.qualifications } : {}) } });
  } catch (e) {
    if (!isCheptaError(e)) {
      return finish("failed", { outcome: "error", rest: { error: { code: null, message: `CHEPTA failed with an internal error: ${e?.message ?? e}. Please report it with the request.`, where: [] } } });
    }
    return finish("failed", { outcome: OUTCOME_OF[e.code] ?? "error", rest: { error: { code: e.code, message: e.message, where: whereOf(e), ...(e.details !== undefined ? { details: e.details } : {}) } } });
  }
}

/** The fields or blocks an error concerns: given by the schema check, or read from a flowsheet's status. */
function whereOf(e) {
  if (Array.isArray(e.details?.where)) return e.details.where;
  const st = e.details?.status;
  if (st) {
    return [...(st.structure ?? []).map(p => ({ ...(p.where ? { block: p.where } : {}), message: p.message })),
      ...Object.entries(st.blocks ?? {}).filter(([, b]) => !b.ok).map(([id, b]) => ({ block: id, message: b.message }))];
  }
  const m = /flowsheet\.(\w+)\[(\d+)\](?: \(([^)]+)\))?/.exec(e.message);
  if (m) return [{ field: `flowsheet.${m[1]}[${m[2]}]`, ...(m[3] ? { block: m[3] } : {}) }];
  return [];
}

// ---------------------------------------------------------------------------------------
// The capabilities of milestone M0: lookups, project checks and the flowsheet

const USER_DATA = { type: ["object", "null"], description: "the user's own data (proposal 0012), as in a project's user_data" };
const FLOWSHEET_INPUT = {
  type: "object", additionalProperties: false,
  properties: {
    project: { type: "object", description: "a CHEPTA project file (fugacity_project, flowsheet, user_data)" },
    flowsheet: { type: "object", description: "a flowsheet document (components, thermo, blocks, streams; src/flowsheet/document.js)" },
    user_data: USER_DATA,
  },
};

/** The flowsheet document and user's data of a request: exactly one of project and flowsheet. */
function flowsheetOf(input) {
  if ((input.project == null) === (input.flowsheet == null)) throw fail("BAD_INPUT", "Give either input.project or input.flowsheet (one of them).", { where: [{ field: "input.project" }, { field: "input.flowsheet" }] });
  if (input.project != null) {
    const doc = readProject(input.project);
    if (doc.flowsheet == null) throw fail("BAD_INPUT", "The project has no flowsheet.", { where: [{ field: "input.project.flowsheet" }] });
    return { flowsheet: doc.flowsheet, userData: checkUserData(input.user_data ?? doc.user_data ?? null) };
  }
  return { flowsheet: input.flowsheet, userData: checkUserData(input.user_data ?? null) };
}

/** The method and parameter sets of a system, and the hashes of the records it uses and of the user's data. */
function systemReproduction(sys, userData) {
  const info = sys.info ?? {};
  const fluid = sys.fluid ?? sys;
  return {
    method: { model: fluid.model ?? info.model ?? null, vapour: fluid.vapour ?? null },
    parameter_sets: (info.pairs ?? []).map(p => ({ pair: p.pair, set: p.set ?? null, tier: p.tier ?? null })),
    databank_hash: hash64({ components: sys.ids.map(id => componentRecord(id, userData)), pairs: info.pairs ?? [] }),
    user_data_hash: userData ? hash64(userData) : null,
  };
}

registerCapability({
  name: "capabilities", summary: "List what CHEPTA can calculate through this interface", status: "available",
  input: { type: "object", additionalProperties: false, properties: {} },
  run: () => ({ value: capabilities() }),
});

registerCapability({
  name: "find_component", summary: "Find a component by name, alias, formula or CAS number", status: "available",
  input: { type: "object", additionalProperties: false, required: ["query"],
    properties: { query: { type: "string", minLength: 1 }, user_data: USER_DATA } },
  run: ({ query, user_data }) => {
    const ud = checkUserData(user_data ?? null);
    const id = findComponent(query, ud);
    const r = componentRecord(id, ud);
    return { value: { id, name: r.name, formula: r.formula ?? null, cas: r.cas ?? null } };
  },
});

registerCapability({
  name: "component_info", summary: "A component's constants and property records, with their tiers and sources", status: "available",
  input: { type: "object", additionalProperties: false, required: ["component"],
    properties: { component: { type: "string", minLength: 1 }, user_data: USER_DATA } },
  run: ({ component, user_data }) => {
    const ud = checkUserData(user_data ?? null);
    const id = findComponent(component, ud);
    const r = componentRecord(id, ud);
    const properties = Object.entries(r.properties ?? {}).map(([key, p]) => (p?.available === false
      ? { key, available: false, ...(p.searched ? { searched: p.searched } : {}) }
      : { key, tier: p?.tier ?? null, Tmin_K: p?.Tmin_K ?? null, Tmax_K: p?.Tmax_K ?? null, source: p?.source ?? null }));
    let sources = [];
    try { sources = componentSources(id); } catch { /* a user's component: its sources are in its own record */ }
    return { value: { id, name: r.name, formula: r.formula ?? null, cas: r.cas ?? null, class: r.class ?? "volatile",
      MW: r.MW ?? null, Tc_K: r.Tc_K ?? null, Pc_Pa: r.Pc_Pa ?? null, omega: r.omega ?? null, Tb_K: r.Tb_K ?? null,
      ...(r.critical ? { critical: r.critical } : {}), ...(r.vapourPressure_missing ? { vapourPressure_missing: r.vapourPressure_missing } : {}),
      properties, sources }, reproduction: { databank_hash: hash64(r), user_data_hash: ud ? hash64(ud) : null } };
  },
});

registerCapability({
  name: "check_project", summary: "Check a project file without opening it: every problem, and the flowsheet's status", status: "available",
  input: { type: "object", additionalProperties: false, required: ["project"], properties: { project: { type: ["object", "string"] } } },
  run: ({ project }) => ({ value: checkProject(project) }),
});

registerCapability({
  name: "flowsheet_status", summary: "A flowsheet's structure and degrees of freedom, block by block (no calculation)", status: "available",
  input: FLOWSHEET_INPUT,
  run: input => {
    const { flowsheet, userData } = flowsheetOf(input);
    return { value: flowsheetDocStatus(flowsheet, userData) };
  },
});

/** A solved flowsheet as a request's result: the value, the checks, the qualifications and the reproduction. */
function solvedFlowsheet(flowsheet, userData) {
  normalizeFlowsheet(flowsheet, userData);
  const { sys, result } = flowsheetRun(flowsheet, userData);
  const blocks = Object.fromEntries(Object.entries(result.blocks).map(([id, b]) => [id, { material: b.balance?.material ?? null, energy_kW: b.balance?.energy_kW ?? null }]));
  const material = Object.values(result.balance.material_kmol_h).reduce((a, v) => Math.max(a, Math.abs(v)), 0);
  const notes = Object.entries(result.blocks).flatMap(([id, b]) => (b.notes ?? []).map(n => ({ block: id, note: n })));
  const warnings = Object.entries(result.blocks).flatMap(([id, b]) => (b.warnings ?? []).map(w => ({ block: id, ...w })));
  const info = sys.info ?? {};
  return {
    value: result,
    checks: {
      material_kmol_h: material, energy_kW: result.balance.energy_kW, blocks,
      loops: result.loops.map(l => ({ tears: l.tears, iterations: l.iterations, residual: l.residual ?? null, tolerance: l.tolerance ?? null })),
      // the rigorous columns: their residuals by group, the tolerances and the iterations (contract 3)
      ...(Object.values(result.blocks).some(b => b.state?.residuals) ? { columns: Object.fromEntries(Object.entries(result.blocks).filter(([, b]) => b.state?.residuals)
        .map(([id, b]) => [id, { residuals: b.state.residuals, tolerances: b.state.tolerances, iterations: b.state.iterations, converged: b.state.converged }])) } : {}),
    },
    qualifications: {
      pairs: (info.pairs ?? []).map(p => ({ pair: p.pair, set: p.set ?? null, tier: p.tier ?? null })),
      missing_pairs: info.missingPairs ?? [],
      notes, warnings,
      // blocks with their own property method (a column, milestone M2b), and the P-H boundary's temperature changes
      ...(Object.values(result.blocks).some(b => b.method) ? { block_methods: Object.fromEntries(Object.entries(result.blocks).filter(([, b]) => b.method)
        .map(([id, b]) => [id, { ...b.method, ...(b.state?.boundary ? { boundary_streams: b.state.boundary } : {}) }])) } : {}),
    },
    reproduction: { ...systemReproduction(sys, userData),
      ...(Object.values(result.blocks).some(b => b.method) ? { block_methods: Object.fromEntries(Object.entries(result.blocks).filter(([, b]) => b.method)
        .map(([id, b]) => [id, { model: b.method.model, vapour: b.method.vapour ?? null, sets: b.method.sets ?? null, prefer: b.method.prefer ?? null }])) } : {}) },
  };
}

registerCapability({
  name: "solve_flowsheet", summary: "Solve a flowsheet: every stream, block, duty and balance", status: "available",
  input: FLOWSHEET_INPUT,
  run: input => {
    const { flowsheet, userData } = flowsheetOf(input);
    return solvedFlowsheet(flowsheet, userData);
  },
});

// W4 (proposal 0015, milestone M1): the size of a flash drum of a solved flowsheet (src/sizing/sizing.js)
const SIZE_OPTIONS = { type: "object", description: "options of the size; see docs/models/sizing.md" };
registerCapability({
  name: "size_drum", summary: "Size a flash drum of a flowsheet: the vapour-liquid drum and, with two liquids, the decanter", status: "available",
  input: { ...FLOWSHEET_INPUT, required: ["block"], properties: { ...FLOWSHEET_INPUT.properties,
    block: { type: "string", minLength: 1, description: "the id of a flash drum block" },
    drum: { ...SIZE_OPTIONS, description: "sizeDrum options: orientation, fraction, residence_min or holdup_m3, feedLine_m, K_m_s" },
    decanter: { ...SIZE_OPTIONS, description: "sizeDecanter options: orientation, dispersed, droplet_um, ratio, interface" } } },
  run: input => {
    const { flowsheet, userData } = flowsheetOf(input);
    const d = normalizeFlowsheet(flowsheet, userData);
    const b = (d.blocks ?? []).find(x => x.id === input.block);
    if (!b) throw fail("BAD_INPUT", `No block "${input.block}" in the flowsheet.`, { where: [{ field: "input.block" }] });
    if (b.type !== "flash") throw fail("BAD_INPUT", `Block ${b.id} is a ${b.type}; only a flash drum is sized here.`, { where: [{ field: "input.block", block: b.id }] });
    const { sys, result } = flowsheetRun(flowsheet, userData);
    const r = flashBlockResult(d, result, b.id);
    const two = [r.outlets?.liquid, r.outlets?.liquid2].filter(Boolean).flatMap(s => s.phases).filter(p => p.type === "liquid" && p.F_kmol_h > 0).length === 2;
    const value = { block: b.id };
    if (r.outlets?.vapour?.F_kmol_h > 0) value.drum = sizeDrum(r, { ...(input.drum ?? {}), sys });
    if (two) value.decanter = sizeDecanter(r, { ...(input.decanter ?? {}), sys });
    if (!value.drum && !value.decanter) throw fail("BAD_INPUT", `Block ${b.id} holds one liquid and no vapour: there is nothing to separate, so no size.`, { where: [{ block: b.id }] });
    return { value, qualifications: { notes: [...(value.drum?.notes ?? []), ...(value.decanter?.notes ?? [])].map(n => ({ block: b.id, note: n })),
      sources: [...new Set([...(value.drum?.source ?? []), ...(value.decanter?.source ?? [])])] }, reproduction: systemReproduction(sys, userData) };
  },
});

// The column (proposal 0015, milestone M1: the shortcut mode; milestone M2a: the rigorous mode): a feed, the Column block
// and its two products, solved as a flowsheet (src/units/columns/column.js), so the numbers are the flowsheet's.
registerCapability({
  name: "solve_column", summary: "Solve a distillation column: the shortcut (Fenske, Underwood, Gilliland) for a light and a heavy key, or the rigorous column (MESH on every stage, Newton's method)", status: "available",
  input: { type: "object", additionalProperties: false, required: ["components", "feed", "column"],
    properties: {
      components: { type: "array", items: { type: "string", minLength: 1 }, description: "component ids or names" },
      thermo: { type: "object", description: "the property method, as a flowsheet's thermo: { model, vapour, sets }; default NRTL with an ideal-gas vapour" },
      feed: { type: "object", description: "the feed, as a Feed block's specification: flow_kmol_h (or flow_kg_h) and two of T_K, P_kPa, VF" },
      column: { type: "object", description: "the Column block's specification. mode \"shortcut\" (default): light_key, heavy_key, recovery_light_key_in_distillate, recovery_heavy_key_in_bottoms, reflux_ratio or reflux_over_minimum, condenser (\"total\" or \"partial\"), P_kPa. mode \"rigorous\": stages (the condenser and the reboiler counted, 1 the condenser), feed_stage, condenser (\"total\", \"partial\" or \"decanter\"), P_kPa, and two of reflux_ratio, boilup_ratio, distillate_kmol_h, bottoms_kmol_h, condenser_duty_kW, reboiler_duty_kW (one, not the reflux or the condenser duty, with a decanter); phases \"VL\" (default) or \"VLL\" (look for two liquids on the stages; activity models); reflux_liquid \"light\" or \"heavy\" (the decanter's refluxed liquid); method { model, vapour, sets, prefer }: the column's own property method, with the P-H boundary at its streams" },
      user_data: USER_DATA,
    } },
  run: input => {
    const flowsheet = { components: input.components, thermo: input.thermo ?? { model: "NRTL", vapour: "ideal" },
      blocks: [{ id: "F1", type: "feed", spec: input.feed }, { id: "C1", type: "column", spec: input.column },
        { id: "P1", type: "product" }, { id: "P2", type: "product" }],
      streams: [{ id: "FEED", from: "F1.out", to: "C1.in" }, { id: "DISTILLATE", from: "C1.distillate", to: "P1.in" }, { id: "BOTTOMS", from: "C1.bottoms", to: "P2.in" }] };
    const r = solvedFlowsheet(flowsheet, checkUserData(input.user_data ?? null));
    const c = r.value.blocks.C1;
    return { ...r, value: { feed: r.value.streams.FEED, distillate: r.value.streams.DISTILLATE, bottoms: r.value.streams.BOTTOMS,
      column: { ...c.state, duty_kW: c.duty_kW, notes: c.notes, warnings: c.warnings ?? [], profile: c.profile } } };
  },
});
