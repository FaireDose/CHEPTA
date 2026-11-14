/**
 * Flowsheet solver (layer 5; proposal 0006, step 3; roadmap A8).
 *
 *   CHEPTA.solveFlowsheet(sys, {
 *     blocks:  [{ id: "F1", type: "feed", spec: { ... } }, { id: "M1", type: "mixer" }, ...],
 *     streams: [{ id: "S1", from: "F1.out", to: "M1.in" }, ..., { id: "S5", from: "SP1.out", to: "M1.in", tear: true }],
 *     energyStreams: [{ id: "Q1", to: "E1", duty_kW: 500 }, { id: "Q2", from: "E2", to: "E3" }],   // optional
 *     solver:  { maxIterations: 50, tolerance: 1e-8, strictRanges: false }
 *   })
 *   → { streams: { S1: stream, ... }, blocks: { M1: { duty_kW, balance, notes }, ... },
 *       order, loops: [{ blocks, tears, iterations }], balance: { material_kmol_h, energy_kW } }
 *
 * Sequential modular:
 *  1. Blocks are nodes and streams are edges. Strongly connected components (Tarjan's
 *     depth-first search) are the loops; the components are calculated in topological order.
 *  2. In a loop, the tear streams are those marked `tear: true`, else the smallest set of the
 *     loop's streams whose removal leaves no cycle (searched by increasing size), the tear
 *     selection of pyomo.network (3-clause BSD; module foqus_graph, after FOQUS).
 *  3. The loop is converged on the tear streams' component flows x, with g(x) the flows after
 *     one pass through the loop:
 *     - "broyden" (default): Broyden's quasi-Newton method on F(x) = g(x) - x, all tear flows
 *       together, first step direct substitution (scipy.optimize.broyden1, BSD; below);
 *     - "wegstein": two steps of direct substitution, then Wegstein per flow as implemented in
 *       pyomo.network (SequentialDecomposition.solve_tear_wegstein):
 *       s = (g(x) - g(x_prev)) / (x - x_prev),  q = s / (s - 1) bounded to [-5, 0],
 *       x_new = q x + (1 - q) g(x);
 *     - "direct": x_new = g(x).
 *     On the flowsheet suite (docs/FLOWSHEET_TESTS.md) Broyden converged every case within the
 *     default 50 iterations (the Cavett problem in 37); Wegstein needed 170 for Cavett and
 *     oscillated without end on one case that direct substitution solves.
 *     The accelerated tear stream is flashed at the temperature and pressure just calculated
 *     for it (extrapolating the enthalpy flow as well can push the temperature out of range).
 *     The start of a tear stream is its `guess` ({ flow_kmol_h, T_K, P_kPa }), else no flow.
 *     Converged when every component flow and the temperature of every tear stream change by
 *     less than `tolerance` (relative to the tear stream's total flow and to its
 *     temperature).
 *     Safeguards (decision 2026-11-14-07; below, before the iteration): a block that fails on an accelerated guess
 *     sends the iteration back to the last accepted pass with a shorter step; Broyden rejects a pass ten times worse
 *     than the last accepted one, and replaces its approximation by a finite-difference Jacobian when the change
 *     stalls. A loop that converges without them takes the same steps as before; what they did is in loops[].safeguards.
 *  4. A loop that does not converge throws NO_CONVERGENCE naming the loop, the tear streams,
 *     the remaining change and what usually helps; no numbers are returned.
 *  5. Energy streams (proposal 0013, section 6): an energy feed (no `from`, a given duty_kW) or the heat one block
 *     gives up (`from`, a block with a duty: heater, flash drum, separator) into a block whose duty can be given
 *     (`to`: heater, flash drum). The block it goes into takes its duty from the stream, so it needs one specification
 *     fewer (a heater with an energy stream calculates its outlet temperature). Q = -duty of the block it comes from
 *     = duty of the block it goes into, so the flowsheet's energy balance is unchanged. A block has at most one energy
 *     stream. Energy streams are edges of the graph like material streams: they set the calculation order, and a
 *     loop closed by an energy stream is torn on its duty (one number), as a recycle is torn on its flows.
 *  6. Reactors (proposal 0010, step 3; src/units/reactors.js): the flowsheet's `reactions` (checked by
 *     src/reactions/reaction.js) reach every block. The whole flowsheet's balance per component is then
 *     feeds + what the reactors generate = products, and its energy balance counts the heats of the reactions
 *     (H_feeds + duties = H_products + Σ heat_kW): the streams' enthalpies keep their reference states, and the
 *     reactions' heats carry the enthalpies of formation.
 *  7. A splitter given by flow (flow_kmol_h / flow_kg_h; src/units/units.js) inside a loop: while the loop iterates its blocks
 *     are calculated with `iterating`, so an inlet short of the asked flow (an empty tear stream at the start) is shared
 *     instead of refused; a loop that converges with the splitter still short is refused (BAD_INPUT, naming it).
 *  8. Design specifications (proposal 0022; src/flowsheet/design-specs.js): `designSpecs` vary one number of a block's
 *     specification within bounds to meet a stream's or block's quantity, as an outer loop of whole solves around this
 *     solver (bracket + Brent for one, Broyden with bounds for several), the tear streams warm-started from the previous
 *     solve. The answer lists them (result.designSpecs) and writes the varied value into the block's result (`spec`).
 * References: https://pyomo.readthedocs.io/en/6.9.3/_modules/pyomo/network/foqus_graph.html and
 * https://pyomo.readthedocs.io/en/6.4.0/_modules/pyomo/network/decomposition.html (open source,
 * 3-clause BSD); Tarjan, SIAM Journal on Computing 1(2), 1972 (as cited there).
 * Units: K, kPa, kmol/h, kW.
 */
import { fail, failRange } from "../util/errors.js";
import { withRangePolicy, collectExtrapolations, mergeExtrapolations, strictRanges } from "../util/ranges.js";
import { stream } from "../stream/stream.js";
import { reportProgress, progressWanted } from "../util/progress.js";
import { runUnit, unitType, specStatus } from "../units/units.js";
import "../units/reactors.js";   // registers the conversion and yield reactors
import "../units/kinetic-reactors.js";
import "../units/columns/column.js";
import "../units/membrane.js";   // the Membrane block (proposal 0015, M3)   // the Column block (proposal 0015, M1: shortcut mode)
import "../units/extraction.js";   // the Extraction block (proposal 0015, M3, step 8)
import "../units/pipe.js";   // the Pipe block (proposal 0020)
import "../units/evaporator.js";   // the Evaporator block (proposal 0015, M3, step 10)
import "../units/crystallizer.js";   // the Crystallizer block (proposal 0015, M3, step 10)
import { checkReactions } from "../reactions/reaction.js";
import { solveDesignSpecs, checkDesignSpecs, withStartValues } from "./design-specs.js";

/** Solver settings: `method` "broyden" (quasi-Newton on all tear flows together; the default since the
 *  flowsheet suite: it converged every case, mostly fastest), "wegstein" (direct substitution for two
 *  steps, then bounded Wegstein per flow; oscillated on one case of the suite) or "direct" (direct
 *  substitution only: slowest, never overshoots). */
export const SOLVER_DEFAULTS = Object.freeze({ method: "broyden", maxIterations: 50, tolerance: 1e-8, accelMin: -5, accelMax: 0 });
export const SOLVER_METHODS = ["wegstein", "broyden", "direct"];
const GROWTH_LIMIT = 1e6;     // a tear stream above this many times the total feed: the loop accumulates
// the whole flowsheet's component balance, relative to the total feed: at least 1e-6, and 1000 times the
// tear tolerance (a converged recycle leaves an imbalance of about the tolerance times the recycle flow)
const balanceTol = tolerance => Math.max(1e-6, 1e3 * tolerance);

/** The inverse of a square matrix by Gauss-Jordan elimination with partial pivoting; null when it is singular or not
 *  finite. */
function inverse(A) {
  const m = A.length, M = A.map((row, i) => [...row, ...Array.from({ length: m }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (!(Math.abs(M[p][c]) > 1e-14)) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * m; j++) M[c][j] /= d;
    for (let r = 0; r < m; r++) {
      if (r === c || M[r][c] === 0) continue;
      const f = M[r][c];
      for (let j = 0; j < 2 * m; j++) M[r][j] -= f * M[c][j];
    }
  }
  const inv = M.map(row => row.slice(m));
  return inv.every(row => row.every(Number.isFinite)) ? inv : null;
}

/** "B1.out" → { block: "B1", port: "out" } */
function endpoint(text, what, sid) {
  const m = /^([^.\s]+)\.([a-z0-9]+)$/i.exec(String(text ?? ""));
  if (!m) throw fail("BAD_INPUT", `Stream ${sid}: ${what} must be written "BLOCK.port", e.g. "V1.vapour" (got ${JSON.stringify(text)}).`);
  return { block: m[1], port: m[2] };
}

/**
 * The flowsheet's structure with every problem found, without stopping at the first:
 * { blocks: Map, edges, problems: [{ where, message }] }. A problem names its block or stream
 * (`where`); blocks of unknown types are left out of `blocks`.
 */
export function inspectFlowsheet(fs) {
  const problems = [];
  const add = (where, message) => problems.push({ where, message });
  const byId = new Map(), edges = [];
  if (!fs || typeof fs !== "object") { add(null, "The flowsheet must be an object with blocks and streams."); return { blocks: byId, edges, problems }; }
  const blocks = Array.isArray(fs.blocks) ? fs.blocks : [];
  const streams = Array.isArray(fs.streams) ? fs.streams : [];
  if (!blocks.length) add(null, "The flowsheet has no blocks.");
  const known = new Set();
  for (const b of blocks) {
    if (!b || typeof b.id !== "string" || !b.id) { add(null, "Every block needs an id such as \"V1\"."); continue; }
    if (known.has(b.id)) { add(b.id, `Two blocks are called ${b.id}.`); continue; }
    known.add(b.id);
    let u;
    try { u = unitType(b.type); } catch (e) { add(b.id, `${b.id}: ${e.message}`); continue; }
    byId.set(b.id, { id: b.id, type: b.type, unit: u, spec: b.spec ?? {}, energy: b.energy ?? null, ins: {}, outs: {} });
  }
  const sids = new Set();
  for (const s of streams) {
    if (!s || typeof s.id !== "string" || !s.id) { add(null, "Every stream needs an id such as \"S1\"."); continue; }
    if (sids.has(s.id)) { add(s.id, `Two streams are called ${s.id}.`); continue; }
    sids.add(s.id);
    let from, to;
    try { from = endpoint(s.from, "from", s.id); to = endpoint(s.to, "to", s.id); } catch (e) { add(s.id, e.message); continue; }
    const a = byId.get(from.block), b = byId.get(to.block);
    if (!a && !known.has(from.block)) { add(s.id, `Stream ${s.id} comes from ${from.block}, which is not a block of the flowsheet.`); continue; }
    if (!b && !known.has(to.block)) { add(s.id, `Stream ${s.id} goes to ${to.block}, which is not a block of the flowsheet.`); continue; }
    if (!a || !b) continue;   // a block of unknown type: already reported
    if (!a.unit.outlets.some(p => p.port === from.port)) { add(s.id, `Stream ${s.id}: ${a.unit.label} ${a.id} has no outlet "${from.port}"; its outlets: ${a.unit.outlets.map(p => p.port).join(", ") || "none"}.`); continue; }
    if (!b.unit.inlets.some(p => p.port === to.port)) { add(s.id, `Stream ${s.id}: ${b.unit.label} ${b.id} has no inlet "${to.port}"; its inlets: ${b.unit.inlets.map(p => p.port).join(", ") || "none"}.`); continue; }
    (a.outs[from.port] ??= []).push(s.id);
    (b.ins[to.port] ??= []).push(s.id);
    edges.push({ id: s.id, from: a.id, fromPort: from.port, to: b.id, toPort: to.port, tear: !!s.tear, guess: s.guess ?? null });
  }
  // energy streams (proposal 0013): an energy feed or a block's heat into a block whose duty can be given
  const energyEdges = [];
  const qList = Array.isArray(fs.energyStreams) ? fs.energyStreams : fs.energyStreams == null ? [] : (add(null, "energyStreams must be a list."), []);
  const qIds = new Set();
  for (const q of qList) {
    if (!q || typeof q.id !== "string" || !q.id) { add(null, "Every energy stream needs an id such as \"Q1\"."); continue; }
    if (qIds.has(q.id) || sids.has(q.id)) { add(q.id, `Two streams are called ${q.id}.`); continue; }
    qIds.add(q.id);
    const to = byId.get(q.to), from = q.from == null ? null : byId.get(q.from);
    if (q.to == null) { add(q.id, `Energy ${q.from == null ? "feed" : "stream"} ${q.id} is not connected: connect it to a heater or a flash drum.`); continue; }
    if (!to) { add(q.id, `Energy stream ${q.id} goes to ${q.to}, which is not a block of the flowsheet.`); continue; }
    if (!to.unit.dutySpec) { add(q.id, `Energy stream ${q.id}: ${to.unit.label} ${to.id} takes no energy stream (a heater or a flash drum does).`); continue; }
    if (q.from != null && !from) { add(q.id, `Energy stream ${q.id} comes from ${q.from}, which is not a block of the flowsheet.`); continue; }
    if (from && from.unit.energy !== "heat") { add(q.id, `Energy stream ${q.id}: ${from.unit.label} ${from.id} gives up no heat (a heater, flash drum or separator does).`); continue; }
    if (from && from.id === to.id) { add(q.id, `Energy stream ${q.id} cannot go back into the block it comes from.`); continue; }
    if (from && q.duty_kW != null) { add(q.id, `Energy stream ${q.id}: its duty comes from ${from.id}; leave out duty_kW (or remove "from" to make it an energy feed).`); continue; }
    if (!from && !Number.isFinite(Number(q.duty_kW))) { add(q.id, `Energy feed ${q.id}: give its duty_kW (+ heat into ${to.id}, - heat out).`); continue; }
    if (to.qin) { add(q.id, `${to.unit.label} ${to.id} has two energy streams in (${to.qin.id}, ${q.id}); it takes one.`); continue; }
    if (from && (from.qout || from.qin)) { add(q.id, `${from.unit.label} ${from.id} already has an energy stream (${(from.qout ?? from.qin).id}); a block has one.`); continue; }
    if (to.qout) { add(q.id, `${to.unit.label} ${to.id} already sends its heat out by ${to.qout.id}; a block has one energy stream.`); continue; }
    const e = { id: q.id, from: from?.id ?? null, to: to.id, energy: true, duty_kW: from ? null : Number(q.duty_kW), tear: !!q.tear, guess: q.guess ?? null, label: q.label ?? null };
    to.qin = e; if (from) from.qout = e;
    energyEdges.push(e);
  }
  const energyIds = new Set(qIds);
  for (const b of byId.values()) {
    for (const p of b.unit.inlets) {
      const n = (b.ins[p.port] ?? []).length;
      if (n < p.min) add(b.id, `${b.unit.label} ${b.id}: connect ${p.min === 1 ? "a stream" : `at least ${p.min} streams`} to its ${p.label} inlet.`);
      if (n > p.max) add(b.id, `${b.unit.label} ${b.id}: its ${p.label} inlet takes ${p.max === 1 ? "one stream" : `at most ${p.max}`} (${n} connected).`);
    }
    for (const p of b.unit.outlets) {
      const n = (b.outs[p.port] ?? []).length;
      if (!p.optional && n < p.min) add(b.id, `${b.unit.label} ${b.id}: connect ${p.min === 1 ? "a stream" : `at least ${p.min} streams`} to its ${p.label} outlet${p.min === 1 ? " (end it with a Product block if it leaves the flowsheet)" : ""}.`);
      if (n > p.max) add(b.id, `${b.unit.label} ${b.id}: its ${p.label} outlet takes one stream (${n} connected); use a Splitter to divide it.`);
    }
    if (b.unit.duty && !b.qin && !b.qout) {
      const q = energyName(b);
      if (sids.has(q) || energyIds.has(q)) add(b.id, `${b.unit.label} ${b.id}: its energy stream ${q} has the name of another stream.`);
      energyIds.add(q);
    } else if (b.energy && !b.unit.duty) add(b.id, `${b.unit.label} ${b.id} has no duty, so it cannot have an energy stream (${b.energy}).`);
  }
  return { blocks: byId, edges, energyEdges, problems };
}

/** The name of a block's energy stream: the one connected to it, else given as `energy`, else "Q-" (a pump's power:
 *  "W-") and the block id. */
const energyName = b => (b.qin ?? b.qout)?.id || b.energy || `${b.unit.energy === "work" ? "W" : "Q"}-${b.id}`;

/** The flowsheet's reactions, checked (src/reactions/reaction.js) and with every component among the system's. */
function reactionsOf(sys, fs) {
  const list = fs?.reactions ?? [];
  if (!list.length) return [];
  const checked = list.every(r => r && r.balance) ? list : checkReactions(list, { userData: sys.userData });
  for (const r of checked) {
    const out = Object.keys(r.stoichiometry).filter(id => !sys.ids.includes(id));
    if (out.length) throw fail("BAD_INPUT", `Reaction ${r.name}: ${out.join(", ")} ${out.length > 1 ? "are" : "is"} not among the components of the flowsheet (${sys.names.join(", ")}).`);
  }
  return checked;
}

/** A block's specification with the duty an energy stream brings in (a placeholder for the count; the value at solve). */
const withEnergy = (b, duty = 0) => (b.qin ? { ...(b.spec ?? {}), duty_kW: duty } : b.spec);

/**
 * Check the flowsheet's structure and return it with its connections resolved: every block
 * of a known type with a unique id, every stream from an existing outlet port to an
 * existing inlet port, every required port connected. Throws the first problem
 * (inspectFlowsheet lists them all).
 */
export function checkFlowsheet(fs) {
  const r = inspectFlowsheet(fs);
  if (r.problems.length) throw fail("BAD_INPUT", r.problems[0].message, { problems: r.problems });
  return { blocks: r.blocks, edges: r.edges, energyEdges: r.energyEdges };
}

/**
 * Is the flowsheet ready to solve? Its structure, and the degrees of freedom of every block
 * (units.js specStatus): what each needs, what is given, what is missing or too much.
 * @returns {{ready:boolean, needed:number, given:number, structure:object[], blocks:Object<string,object>, message:string}}
 */
export function flowsheetStatus(sys, fs) {
  // design specifications (proposal 0022, section 4): each frees its varied input and fixes its target, so the degrees
  // of freedom are counted with the varied inputs at their start values; a malformed one is a problem of the structure
  let designSpecs = null, dsProblem = null, warnings = [];
  if (Array.isArray(fs?.designSpecs) ? fs.designSpecs.length : fs?.designSpecs != null) {
    try {
      const specs = checkDesignSpecs(sys, fs, inspectFlowsheet(fs), SOLVER_DEFAULTS.tolerance);
      fs = withStartValues(sys, fs, specs);
      designSpecs = specs.map(d => ({ id: d.id, varied: d.vary.label, target: d.target.label, asked: d.target.value, start: d.vary.start, min: d.vary.min, max: d.vary.max, tolerance: d.tolerance }));
      for (const d of specs) {
        for (const w of d.warnings) warnings.push({ designSpec: d.id, message: w });
        if (d.vary.given !== undefined && Number.isFinite(d.vary.given) && d.vary.given !== d.vary.start) {
          warnings.push({ designSpec: d.id, message: `${d.name}: ${d.vary.label} is given as ${+d.vary.given.toPrecision(6)} in ${d.vary.block}'s specification and guessed at ${+d.vary.start.toPrecision(6)}; the guess is the start, the value given is not used.` });
        }
      }
    } catch (e) {
      if (e?.code !== "BAD_INPUT") throw e;
      dsProblem = { where: "designSpecs", message: e.message };
    }
  }
  const { blocks, problems } = inspectFlowsheet(fs);
  if (dsProblem) problems.push(dsProblem);
  const reactions = reactionsOf(sys, fs);
  const out = {};
  let needed = 0, given = 0;
  for (const b of blocks.values()) {
    const multi = b.unit.outlets.find(p => p.max > 1);
    const outletCount = multi ? Math.max((b.outs[multi.port] ?? []).length, multi.min) : undefined;
    let st = specStatus(b.type, withEnergy(b), { sys, outletCount, reactions });
    // an energy stream in counts as the block's duty: say so in its own words
    if (b.qin && b.spec && b.spec.duty_kW != null && b.spec.duty_kW !== "") {
      st = { ...st, ok: false, status: "extra", message: `${b.unit.label}: its duty comes from the energy stream ${b.qin.id}; leave out duty_kW.` };
    } else if (b.qin && st.message) st = { ...st, message: st.message.replace(/duty_kW/g, `the energy stream ${b.qin.id}`) };
    // name the block in the message: "Flash drum V1: ..."
    out[b.id] = st.message ? { ...st, message: st.message.startsWith(`${b.unit.label}:`) ? `${b.unit.label} ${b.id}:${st.message.slice(b.unit.label.length + 1)}` : `${b.unit.label} ${b.id}: ${st.message}` } : st;
    needed += st.needed ?? 0; given += st.given ?? 0;
  }
  const bad = Object.entries(out).filter(([, st]) => !st.ok);
  const ready = !problems.length && !bad.length;
  const missing = Object.values(out).reduce((a, st) => a + (st.status === "missing" ? Math.max(1, (st.needed ?? 0) - (st.given ?? 0)) : 0), 0);
  const extra = Object.values(out).reduce((a, st) => a + (st.status === "extra" ? Math.max(1, (st.given ?? 0) - (st.needed ?? 0)) : 0), 0);
  const message = ready
    ? `Degrees of freedom: 0 (${given} specification${given === 1 ? "" : "s"} for ${needed} needed). Ready to solve.`
    : [problems.length ? `${problems.length} connection problem${problems.length === 1 ? "" : "s"}` : "",
      missing ? `${missing} specification${missing === 1 ? "" : "s"} missing` : "",
      extra ? `${extra} too many` : "",
      bad.some(([, st]) => st.status === "invalid") ? "a value to correct" : ""].filter(Boolean).join(", ") + ".";
  const dsNote = designSpecs?.length ? ` ${designSpecs.length} design specification${designSpecs.length === 1 ? "" : "s"} (${designSpecs.map(d => d.id).join(", ")}): each varies one input and fixes one target, so the count is unchanged.` : "";
  return { ready, needed, given, dof: needed - given, structure: problems, blocks: out, message: message[0].toUpperCase() + message.slice(1) + (ready ? dsNote : ""),
    ...(designSpecs ? { designSpecs } : {}), ...(warnings.length ? { warnings } : {}) };
}

/** Strongly connected components of a directed graph (Tarjan), in reverse topological order. */
function tarjan(nodes, next) {
  let index = 0;
  const idx = new Map(), low = new Map(), on = new Set(), st = [], out = [];
  const visit = v => {
    idx.set(v, index); low.set(v, index); index++; st.push(v); on.add(v);
    for (const w of next(v)) {
      if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do { w = st.pop(); on.delete(w); comp.push(w); } while (w !== v);
      out.push(comp);
    }
  };
  for (const v of nodes) if (!idx.has(v)) visit(v);
  return out;
}

/** Is the graph of these nodes and edges free of cycles? (Kahn's algorithm) */
function acyclic(nodes, edges) {
  const indeg = new Map(nodes.map(n => [n, 0]));
  for (const e of edges) indeg.set(e.to, indeg.get(e.to) + 1);
  const q = nodes.filter(n => indeg.get(n) === 0);
  let seen = 0;
  while (q.length) {
    const n = q.shift(); seen++;
    for (const e of edges) if (e.from === n) { indeg.set(e.to, indeg.get(e.to) - 1); if (indeg.get(e.to) === 0) q.push(e.to); }
  }
  return seen === nodes.length;
}

/** Topological order of the nodes after removing the edges in `cut`. */
function order(nodes, edges) {
  const indeg = new Map(nodes.map(n => [n, 0]));
  for (const e of edges) indeg.set(e.to, indeg.get(e.to) + 1);
  const q = nodes.filter(n => indeg.get(n) === 0), out = [];
  while (q.length) {
    const n = q.shift(); out.push(n);
    for (const e of edges) if (e.from === n) { indeg.set(e.to, indeg.get(e.to) - 1); if (indeg.get(e.to) === 0) q.push(e.to); }
  }
  return out;
}

/** The smallest set of edges whose removal breaks every cycle of the loop. */
function chooseTears(nodes, edges) {
  // energy streams first: a duty is one number to converge, a material stream several
  edges = [...edges.filter(e => e.energy), ...edges.filter(e => !e.energy)];
  const marked = edges.filter(e => e.tear);
  if (marked.length) {
    const rest = edges.filter(e => !e.tear);
    if (!acyclic(nodes, rest)) throw fail("BAD_INPUT", `The streams marked as tear streams (${marked.map(e => e.id).join(", ")}) do not break every cycle of the loop ${nodes.join(", ")}; mark another stream or none (the solver then chooses).`);
    return marked;
  }
  const m = edges.length;
  const pick = (start, k, chosen) => {
    if (chosen.length === k) {
      const cut = new Set(chosen);
      return acyclic(nodes, edges.filter((_, i) => !cut.has(i))) ? chosen.slice() : null;
    }
    for (let i = start; i < m; i++) { chosen.push(i); const r = pick(i + 1, k, chosen); chosen.pop(); if (r) return r; }
    return null;
  };
  for (let k = 1; k <= Math.min(m, 4); k++) {
    const r = pick(0, k, []);
    if (r) return r.map(i => edges[i]);
  }
  throw fail("BAD_INPUT", `The loop ${nodes.join(", ")} needs more than four tear streams; mark the tear streams yourself.`);
}

/**
 * Solve a flowsheet with a property package.
 * @param {object} sys  the system (components and method) every stream uses
 * @param {object} fs   { blocks, streams, solver }
 */
export function solveFlowsheet(sys, fs) {
  // solver.strictRanges (the maintainer, 2026-11-13; src/util/ranges.js): true refuses outside a record's range, as
  // before; false or absent (the default) continues the record with a warning, gathered in result.extrapolations
  const strict = fs?.solver?.strictRanges;
  if (strict !== undefined && typeof strict !== "boolean") throw fail("BAD_INPUT", `solver.strictRanges must be true or false (got ${JSON.stringify(strict)}).`);
  // design specifications (proposal 0022): an outer loop of whole solves around the sequential solver
  const ds = fs?.designSpecs;
  if (ds != null && !(Array.isArray(ds) && ds.length === 0)) {
    return withRangePolicy({ strictRanges: strict }, () => solveDesignSpecs(sys, fs, solveCore, inspectFlowsheet(fs), SOLVER_DEFAULTS.tolerance));
  }
  return withRangePolicy({ strictRanges: strict }, () => solveCore(sys, fs));
}

/**
 * The records a block used outside their range: those of the phase equilibrium and enthalpies at the temperatures of
 * its outlets and stages (the answer's states, not the searches that led to them: sys.extrapolations), and the others
 * it used (densities, viscosities, charts, solubility curves) as they were noted while it was calculated.
 */
const FINAL_STATE_KINDS = new Set(["vapourPressure", "liquidHeatCapacity", "idealGasHeatCapacity", "heatOfVaporization", "henry", "iapws"]);
function blockExtrapolations(sys, r, noted) {
  const temps = new Set();
  for (const got of Object.values(r.outlets ?? {})) for (const st of (Array.isArray(got) ? got : [got])) if (st && Number.isFinite(st.T_K) && st.F_kmol_h > 0) temps.add(st.T_K);
  if (Array.isArray(r.profile)) for (const p of r.profile) if (Number.isFinite(p?.T_K)) temps.add(p.T_K);
  // only the components the block's outlets carry: a record of a component absent from them is not used in its
  // answer (decision 2026-11-14-06); a pair, when both are present
  const present = new Set();
  for (const got of Object.values(r.outlets ?? {})) {
    for (const st of (Array.isArray(got) ? got : [got])) (st?.flows ?? []).forEach((f, i) => { if (f > 0 && sys.names?.[i]) present.add(sys.names[i]); });
  }
  const used = n => !present.size || n.component == null || present.has(n.component)
    || (n.kind === "pairSet" || n.kind === "estimatedPair" ? n.component.split(" + ").every(c => present.has(c)) : !sys.names?.includes(n.component));
  const atStates = typeof sys.extrapolations === "function" ? [...temps].flatMap(T => sys.extrapolations(T)).filter(used) : [];
  return [...atStates, ...(r.extrapolations ?? []), ...noted.filter(n => !FINAL_STATE_KINDS.has(n.kind))];
}

function solveCore(sys, fs) {
  if (!sys || typeof sys.flash !== "function") throw fail("BAD_INPUT", "solveFlowsheet: the first argument must be a system, e.g. CHEPTA.system({ components, model }).");
  const opt = { ...SOLVER_DEFAULTS, ...(fs?.solver ?? {}) };
  if (!(Number.isInteger(opt.maxIterations) && opt.maxIterations >= 1)) throw fail("BAD_INPUT", `solver.maxIterations must be a positive whole number (got ${opt.maxIterations}).`);
  if (!(opt.tolerance > 0 && opt.tolerance < 0.1)) throw fail("BAD_INPUT", `solver.tolerance must be between 0 and 0.1 (got ${opt.tolerance}).`);
  if (!SOLVER_METHODS.includes(opt.method)) throw fail("BAD_INPUT", `solver.method "${opt.method}" is not one of ${SOLVER_METHODS.join(", ")}.`);
  const status = flowsheetStatus(sys, fs);
  if (!status.ready) {
    const lines = [...status.structure.map(p => p.message), ...Object.values(status.blocks).filter(b => !b.ok).map(b => b.message)];
    throw fail("BAD_INPUT", `The flowsheet is not ready to solve: ${status.message} ${lines.join(" ")}`, { status });
  }
  const { blocks, edges, energyEdges } = checkFlowsheet(fs);
  const reactions = reactionsOf(sys, fs);
  const nodes = [...blocks.keys()];
  const values = new Map();   // stream id → stream
  const qvals = new Map();    // energy stream id → duty, kW
  const results = {};
  const outEdges = id => edges.filter(e => e.from === id);
  // the graph: material streams and the energy streams between blocks (an energy feed has no `from`)
  const graph = [...edges, ...energyEdges.filter(e => e.from)];
  const outGraph = id => graph.filter(e => e.from === id);
  for (const e of energyEdges) if (!e.from) qvals.set(e.id, e.duty_kW);

  /** Calculate one block from the streams known now, and store its outlet streams. */
  const calc = (id, iterating = false) => {
    const b = blocks.get(id);
    const inlets = {};
    for (const [port, sids] of Object.entries(b.ins)) inlets[port] = sids.map(s => values.get(s));
    const multi = b.unit.outlets.find(p => p.max > 1);
    const outletCount = multi ? (b.outs[multi.port] ?? []).length : b.unit.outlets.filter(p => !p.optional || (b.outs[p.port] ?? []).length).length;
    let r;
    let noted = [];
    try {
      const got = collectExtrapolations(() => runUnit(b.type, { sys, inlets, spec: b.qin ? withEnergy(b, qvals.get(b.qin.id)) : b.spec, outletCount, reactions, iterating }));
      r = got.value; noted = got.extrapolations;
    } catch (e) {
      e.message = `${b.unit.label} ${b.id}: ${e.message.replace(new RegExp(`^${b.unit.label}: `), "")}`;
      throw e;
    }
    for (const [port, sids] of Object.entries(b.outs)) {
      const got = r.outlets[port];
      const list = Array.isArray(got) ? got : [got];
      sids.forEach((sid, k) => values.set(sid, Object.freeze({ ...list[k], id: sid })));
    }
    if (b.qout) qvals.set(b.qout.id, -r.duty_kW);   // the heat this block gives up
    results[id] = { type: b.type, duty_kW: r.duty_kW, balance: r.balance, notes: r.notes, ...(r.state ? { state: r.state } : {}), ...(r.sizing ? { sizing: r.sizing } : {}),
      ...(r.reaction ? { reaction: r.reaction } : {}),
      // Unit v2 (proposal 0015, contract 2): a block's profile, warnings and method reach the result (and the request path's qualifications)
      ...(r.profile ? { profile: r.profile } : {}), ...(r.warnings ? { warnings: r.warnings } : {}), ...(r.method ? { method: r.method } : {}) };
    // the last calculation of a block is its answer: its extrapolations replace those of earlier iterations
    blockNotes.set(id, blockExtrapolations(sys, r, noted));
  };
  const blockNotes = new Map();

  /** Total flow of the feed streams calculated so far (kmol/h). */
  const feedTotal = () => nodes.filter(id => blocks.get(id).type === "feed")
    .flatMap(id => outEdges(id).map(e => values.get(e.id))).reduce((a, s) => a + (s?.F_kmol_h ?? 0), 0);
  const comps = tarjan(nodes, id => outGraph(id).map(e => e.to)).reverse();   // topological order
  const inLoop = new Set(comps.flatMap(c => { const set = new Set(c); return graph.filter(e => set.has(e.from) && set.has(e.to)).map(e => e.id); }));
  const stray = [...edges, ...energyEdges].filter(e => e.tear && !inLoop.has(e.id));
  if (stray.length) throw fail("BAD_INPUT", `${stray.map(e => e.id).join(", ")} ${stray.length > 1 ? "are" : "is"} marked as a tear stream but ${stray.length > 1 ? "are" : "is"} not part of a recycle loop.`);
  const loops = [];
  for (const comp of comps) {
    const set = new Set(comp);
    const inner = graph.filter(e => set.has(e.from) && set.has(e.to));
    if (!inner.length) { calc(comp[0]); continue; }
    const tears = chooseTears(comp, inner);
    const tearIds = new Set(tears.map(e => e.id));
    const seq = order(comp, inner.filter(e => !tearIds.has(e.id)));
    // start: the guess, else no flow (at the guess's or 298.15 K and the lowest known pressure); an energy stream: its
    // guessed duty, else none
    for (const e of tears) {
      const g = e.guess ?? {};
      if (e.energy) { qvals.set(e.id, Number.isFinite(Number(g.duty_kW)) ? Number(g.duty_kW) : 0); continue; }
      values.set(e.id, Object.freeze({ ...stream(sys, { flow_kmol_h: g.flow_kmol_h ?? new Array(sys.n).fill(0), T_K: g.T_K ?? 298.15, P_kPa: g.P_kPa ?? 101.325 }), id: e.id }));
    }
    // a tear's value: a material stream's component flows, an energy stream's duty
    const tearValue = e => (e.energy ? { duty_kW: qvals.get(e.id) } : values.get(e.id));
    const vec = (s, e) => (e?.energy ? [s.duty_kW] : s.flows.slice());
    let x = tears.map(e => vec(tearValue(e), e));
    let xPrev = null, gPrev = null, it = 0, err = Infinity;
    const history = [];
    const safeguards = [];   // what the safeguards below did: { iteration, action, reason }
    const stop = (why, extra = {}) => fail("NO_CONVERGENCE",
      `The loop through ${seq.join(", ")} did not converge${why}. What usually helps: a purge or a smaller recycle fraction (a recycle with no way out keeps growing), a guess for the tear stream${tears.length > 1 ? "s" : ""} (${tears.map(e => e.id).join(", ")}) close to the answer, another tear stream, another convergence method, or more iterations.`,
      { loop: comp, tears: tears.map(e => e.id), history, ...(safeguards.length ? { safeguards } : {}), ...extra });
    const sizes = x.map(v => v.length);   // material tears: n flows each; energy tears: one duty
    const isFlow = tears.flatMap((e, k) => new Array(sizes[k]).fill(!e.energy));
    const unflat = f => { let at = 0; return sizes.map(n => { const part = f.slice(at, at + n); at += n; return part; }); };
    const total = v => v.reduce((a, b) => a + b, 0);
    /** The size of each tear variable, as the convergence test measures it: the tear's total flow (a flow), or its
     *  duty (at least 1e-6 kW), the larger of two points. */
    const sizeOf = (xa, xb) => tears.flatMap((e, k) => (e.energy ? [Math.max(Math.abs(xa[k][0]), Math.abs(xb[k][0]), 1e-6)]
      : new Array(sizes[k]).fill(Math.max(total(xa[k]), total(xb[k])) || Math.max(feedTotal(), 1e-12))));
    /**
     * Broyden's "good" method on F(x) = g(x) - x over all tear flows at once: x+ = x - H F, with the
     * inverse-Jacobian update H+ = H + (dx - H df) (dx' H) / (dx' H df), H started at -I so the first
     * step is direct substitution (as scipy.optimize.broyden1, BSD; Broyden, Math. Comp. 19 (1965) 577).
     * Unlike Wegstein's per-flow slopes it learns how the tears act on each other. The change may grow
     * for a few steps (the method is not monotone; resetting H when it does was tried and made the
     * flowsheet suite slower, the Cavett problem divergent): H is reset only after a non-finite step, and replaced on a
     * stall (safeguard 4 below). Scaling the flows by each tear's total flow was tried (2026-11-14) and not kept: the
     * Cavett problem stalled at a change of 0.27.
     */
    let H = null, bPrev = null;   // inverse Jacobian of F, the last accepted point { x, F }
    const broydenUpdate = (xf, F) => {
      const m = xf.length;
      if (!H) H = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? -1 : 0)));
      else if (bPrev) {
        const dx = xf.map((v, i) => v - bPrev.x[i]), df = F.map((v, i) => v - bPrev.F[i]);
        const Hdf = H.map(row => row.reduce((a, h, j) => a + h * df[j], 0));
        const dxH = dx.map((_, j) => dx.reduce((a, d, i) => a + d * H[i][j], 0));
        const den = dx.reduce((a, d, i) => a + d * Hdf[i], 0);
        if (Math.abs(den) > 1e-300 && Number.isFinite(den)) {
          for (let i = 0; i < m; i++) { const c = (dx[i] - Hdf[i]) / den; for (let j = 0; j < m; j++) H[i][j] += c * dxH[j]; }
        }
      }
      return { x: xf, F };
    };
    /** Broyden's next point from an accepted point { x, F }; null when not finite. */
    const broydenFrom = pt => {
      const out = pt.x.map((v, i) => v - H[i].reduce((a, h, j) => a + h * pt.F[j], 0));
      return out.every(Number.isFinite) ? out : null;
    };
    /**
     * Safeguards (decision 2026-11-14-07; CHEPTA-Lab's closed ethyl acetate plant, request 14). An accelerated guess
     * (Broyden, Wegstein) extrapolates beyond the point that direct substitution would give, g(x), and the blocks must
     * solve the loop at that guess. A loop whose gain is close to one (a large recycle, or an inventory that leaves
     * only slowly) has a nearly singular F'(x): Broyden's steps then grow large and land where a block cannot solve
     * (Lab's plant: jumps of up to 0.62 of a tear's flow, a column handed 405 mol/s of material imbalance, a reactor
     * fed no ethanol). The rules globalize the quasi-Newton step by shortening it, as scipy.optimize's nonlin_solve
     * does for broyden1 with its default Armijo line search (BSD; scipy 1.14.1, scipy/optimize/_nonlin.py, which cites
     * Kelley, Iterative Methods for Linear and Nonlinear Equations, SIAM 1995, for the method). A pass of the loop is
     * too costly for a line search on each step, so the step is shortened only when a block fails or the change grows
     * tenfold, and a finite-difference Jacobian replaces Broyden's approximation on a stall (Broyden's method needs a
     * fair approximation to start from):
     *  1. a block that fails on an accelerated guess does not stop the loop: the iteration goes back to the last
     *     accepted pass and tries the same guess with its extrapolation beyond that pass's result shortened to a
     *     quarter (SHRINK), down to the direct-substitution step itself after MAX_RETRIES tries; only a failure on
     *     the direct-substitution step stops the loop, with the block's error (fail loudly);
     *  2. Broyden: a pass whose change is more than REJECT times that of the last accepted pass is not accepted: its
     *     secant information still updates H, and the next guess is made again from the accepted pass, its
     *     extrapolation limited to a quarter of the rejected one's;
     *  3. the limit on the extrapolation (relative to each tear's flow, as the convergence test measures it) starts
     *     unlimited, so that a loop that converges without these rules takes exactly the same steps as before (the
     *     flowsheet suite does: docs/FLOWSHEET_TESTS.md), and doubles after every accepted pass that lowers the
     *     change; after a direct-substitution step (limit 0) the next accepted pass sets it to LIMIT_RESTART;
     *  4. Broyden: when the change has not halved in STALL accepted passes, H is replaced by the inverse of the
     *     Jacobian of F at the current point by forward differences (one pass per tear variable, each counted as an
     *     iteration; step FD_STEP of the tear's flow); if a pass fails or the Jacobian is singular, H restarts at -I.
     * Every action is listed in the loop's `safeguards`. The numbers are this project's choices, set on a hard
     * two-tear test loop (test/flowsheet-safeguards.test.js), not a published standard.
     */
    const REJECT = 10, STALL = 8, MAX_RETRIES = 4, SHRINK = 4, FD_STEP = 1e-7, LIMIT_RESTART = 1e-3;
    let good = null;          // the last accepted pass: { x, g, after, err, pt }
    let limit = Infinity;     // the largest extrapolation beyond g, relative to the tears' size
    let retries = 0;          // consecutive failed or rejected trials since the last accepted pass
    let best = Infinity, bestAt = 0;
    /** The limit after an accepted pass: doubled when the change fell; from direct substitution (0) back to LIMIT_RESTART,
     *  so that a loop sent back to direct substitution does not stay there. */
    const grown = (lim, fell) => (lim === 0 ? LIMIT_RESTART : fell ? 2 * lim : lim);
    /** The extrapolation of a guess beyond the accepted pass's result, relative to the tears' size. */
    const beyond = (xf, ok) => {
      const gf = ok.g.flat(), sz = sizeOf(ok.x, ok.g);
      return Math.max(0, ...xf.map((v, i) => Math.abs(v - gf[i]) / sz[i]));
    };
    /** A guess limited to `lim` beyond the accepted pass's result (scaled along its direction), flows non-negative. */
    const limited = (xf, ok, lim) => {
      const gf = ok.g.flat(), m = beyond(xf, ok);
      const f = m > lim ? lim / m : 1;
      return xf.map((v, i) => { const w = gf[i] + f * (v - gf[i]); return isFlow[i] ? Math.max(0, w) : w; });
    };
    /** Set the tear streams to the guess xs (per tear); `base` the streams whose T and P the material tears take. */
    const setTears = (xs, base, isG) => {
      tears.forEach((e, k) => {
        if (e.energy) { qvals.set(e.id, xs[k][0]); return; }
        const s = base[k];
        const flows = xs[k].slice(0, sys.n).map(v => Math.max(0, v));
        const F = flows.reduce((a, v) => a + v, 0);
        let next = s;
        if (!isG && F > 0) {
          // the accelerated guess may sit where the phase split does not converge (a liquid-liquid split next to a
          // plait point; CHEPTA-Lab's ethyl acetate plant, 2026-11-14): that tear then takes the computed stream, a
          // step of direct substitution, and the guess vector follows it
          try { next = stream(sys, { flow_kmol_h: flows, T_K: s.T_K, P_kPa: s.P_kPa }); } catch (err2) {
            if (err2?.code !== "NO_CONVERGENCE") throw err2;
            xs[k] = vec(s, e);
          }
        }
        values.set(e.id, Object.freeze({ ...next, id: e.id }));
      });
      return xs;
    };
    /** After a failed or rejected trial `tried`: the next guess `candidate` from the accepted pass, its extrapolation
     *  limited to a quarter of the trial's (direct substitution after MAX_RETRIES trials in a row). */
    const retry = (tried, candidate, action, reason) => {
      retries++;
      const m = beyond(tried, good);
      limit = retries >= MAX_RETRIES || !(m > 0) ? 0 : Math.min(limit, m / SHRINK);
      safeguards.push({ iteration: it + 1, action: limit === 0 ? `${action}; direct substitution` : action, reason, limit });
      const next = limited(candidate, good, limit);
      x = setTears(unflat(next), good.after, limit === 0);
    };
    /** The Jacobian of F = g(x) - x at the accepted point x (tear streams `base`), by forward differences, one pass per
     *  tear variable; null when a pass fails. */
    const jacobianAt = (x0, base, F0) => {
      const xf = x0.flat(), sz = sizeOf(x0, x0), m = xf.length;
      const cols = [];
      try {
        for (let j = 0; j < m; j++) {
          const h = FD_STEP * sz[j];
          const xs = xf.slice(); xs[j] += h;
          setTears(unflat(xs), base, false);
          for (const id of seq) calc(id, true);
          const gj = tears.map(tearValue).map((st, k) => vec(st, tears[k])).flat();
          if (progressWanted()) {
            reportProgress({ kind: "flowsheet", loops: [...loops.map(l => ({ ...l, converged: true })),
              { blocks: seq.slice(), tears: tears.map(e => e.id), iterations: it + 1 + j, residual: err, tolerance: opt.tolerance, converged: false,
                maxIterations: opt.maxIterations, method: opt.method, recent: history.slice(-5), jacobian: { pass: j + 1, of: m } }] });
          }
          cols.push(gj.map((v, i) => (v - xs[i] - F0[i]) / h));
        }
      } catch (e) {
        if (!e?.code) throw e;
        return null;
      }
      return Array.from({ length: m }, (_, i) => cols.map(c => c[i]));
    };
    for (; it < opt.maxIterations; it++) {
      const before = tears.map(tearValue);
      try { for (const id of seq) calc(id, true); } catch (e) {
        if (it === 0) {
          // the first pass is a plain calculation: its error is the block's own, but its inlets are those of
          // the start values of the tear streams (no flow, unless guessed), not of the converged loop
          if (!tears.every(t => t.guess)) {
            e.message += ` (This happened in the first pass through the loop ${seq.join(", ")}, with the tear stream${tears.length > 1 ? "s" : ""} ${tears.map(t => t.id).join(", ")} at ${tears.length > 1 ? "their" : "its"} start value${tears.length > 1 ? "s" : ""}: no flow unless a guess is given. A guess close to the answer may avoid this state.)`;
          }
          throw e;
        }
        // a state the property method cannot handle (two liquids with an equation of state) is not a
        // convergence problem: keep its code, with the loop as context
        if (e && e.code === "PHASE_SPLIT") {
          e.message = `In the loop through ${seq.join(", ")}, at iteration ${it + 1}: ${e.message}`;
          throw e;
        }
        // safeguard 1: a block failed on an accelerated guess; go back to the last accepted pass, a shorter step
        const fromGuess = good && e?.code && beyond(x.flat(), good) > 0;
        if (!fromGuess) throw stop(`: at iteration ${it + 1}, ${e.message}`, { cause: e.message });
        history.push(null);   // a pass that a block could not finish
        retry(x.flat(), x.flat(), "a block failed: shorter step", e.message);
        continue;
      }
      const after = tears.map(tearValue);
      const g = after.map((s, k) => vec(s, tears[k]));
      // the change of the tear streams: flows relative to the total flow, T relative to T; a duty relative to itself
      // (at least 1e-6 kW, so that a duty near zero does not count as a large change)
      err = Math.max(...after.map((s, k) => {
        if (tears[k].energy) return Math.abs(s.duty_kW - before[k].duty_kW) / Math.max(Math.abs(s.duty_kW), Math.abs(before[k].duty_kW), 1e-6);
        const Fs = Math.max(s.F_kmol_h, before[k].F_kmol_h);
        const dF = Fs > 0 ? Math.max(...s.flows.map((v, i) => Math.abs(v - before[k].flows[i]))) / Fs : 0;
        const dT = s.T_K != null && before[k].T_K != null && Fs > 0 ? Math.abs(s.T_K - before[k].T_K) / s.T_K : 0;
        return Math.max(dF, dT);
      }));
      history.push(err);
      // where the loops are, for a run stopped by its time limit (src/util/progress.js; CHEPTA-Lab EA-14)
      if (progressWanted()) {
        reportProgress({ kind: "flowsheet", loops: [...loops.map(l => ({ ...l, converged: true })),
          { blocks: seq.slice(), tears: tears.map(e => e.id), iterations: it + 1, residual: err, tolerance: opt.tolerance, converged: false,
            maxIterations: opt.maxIterations, method: opt.method, recent: history.slice(-5), ...(safeguards.length ? { safeguards: safeguards.slice(-3) } : {}) }] });
      }
      // a loop without a way out for some component accumulates it: its flows grow without bound, and a
      // method that extrapolates (Broyden) can reach flows so large that the relative change looks converged
      const Ffeed = feedTotal();
      const big = after.find((s, k) => !tears[k].energy && !(s.F_kmol_h <= GROWTH_LIMIT * Math.max(Ffeed, 1e-12)));
      if (big) throw stop(`: the recycle grows without bound (tear stream ${tears[after.indexOf(big)].id} carries more than ${GROWTH_LIMIT.toExponential(0)} times the feed): material accumulates in the loop`);
      if (err < opt.tolerance) { it++; break; }
      const xf = x.flat(), F = g.flat().map((v, i) => v - xf[i]);
      if (opt.method === "broyden") {
        const pt = broydenUpdate(xf, F);
        // safeguard 2: a pass much worse than the accepted one is not accepted (its secant information is kept)
        if (good && err > REJECT * good.err && beyond(xf, good) > 0 && retries < MAX_RETRIES) {
          const from = broydenFrom(good.pt);
          retry(xf, from ?? good.g.flat(), "rejected", `the change grew from ${good.err.toExponential(2)} to ${err.toExponential(2)}`);
          continue;
        }
        limit = grown(limit, good && err < good.err);
        retries = 0;
        good = { x, g, after, err, pt };
        bPrev = pt;
        // safeguard 4: on a stall, H from a finite-difference Jacobian here (or -I)
        if (err < best / 2) { best = err; bestAt = it; }
        else if (it - bestAt >= STALL) {
          const why = `the change has not halved in ${STALL} iterations (best ${best.toExponential(2)})`;
          H = null; bPrev = null; best = err; bestAt = it;
          bPrev = broydenUpdate(xf, F);
          good.pt = bPrev;
          const J = it + xf.length < opt.maxIterations ? jacobianAt(x, before, F) : null;
          let action = "restart";
          if (J) {
            it += xf.length; bestAt = it;
            const Hj = inverse(J);
            if (Hj) { H = Hj; action = `Jacobian (${xf.length} passes)`; }
          }
          safeguards.push({ iteration: it + 1, action, reason: why });
        }
        let next = broydenFrom(bPrev);
        if (!next) { H = null; bPrev = null; next = g.flat(); }
        const xs = limit === Infinity ? next.map((v, i) => (isFlow[i] ? Math.max(0, v) : v)) : limited(next, good, limit);
        xPrev = x; gPrev = g;
        x = setTears(unflat(xs), after, xs.every((v, i) => v === good.g.flat()[i]));
        continue;
      }
      // direct substitution and Wegstein: next tear values; direct substitution for two steps, then bounded Wegstein
      limit = grown(limit, good && err < good.err);
      retries = 0;
      good = { x, g, after, err };
      let xNew = g;
      if (opt.method === "wegstein" && it >= 2 && xPrev) {
        xNew = g.map((gk, k) => gk.map((gi, i) => {
          const dx = x[k][i] - xPrev[k][i];
          const s = dx !== 0 ? (gi - gPrev[k][i]) / dx : 0;
          let q = s !== 1 ? s / (s - 1) : opt.accelMin;
          q = Math.min(opt.accelMax, Math.max(opt.accelMin, q));
          return q * x[k][i] + (1 - q) * gi;
        }));
        if (limit !== Infinity) xNew = unflat(limited(xNew.flat(), good, limit));
      }
      xPrev = x; gPrev = g;
      x = setTears(xNew, after, xNew === g);
    }
    if (!(err < opt.tolerance)) {
      throw stop(` in ${opt.maxIterations} iterations: the tear stream${tears.length > 1 ? "s" : ""} still change${tears.length > 1 ? "" : "s"} by ${err.toExponential(2)} (relative) per iteration; the tolerance is ${opt.tolerance}`);
    }
    // a splitter by flow whose inlet was short of the asked flow is allowed while the loop iterates, not in its answer
    const short = seq.filter(id => results[id]?.state?.limited);
    if (short.length) {
      const id = short[0], st = results[id].state, asked = st.asked.filter(v => v !== "rest").reduce((a, v) => a + v, 0);
      throw fail("BAD_INPUT", `${blocks.get(id).unit.label} ${id}: in the converged loop through ${seq.join(", ")} its outlets asked take ${+asked.toPrecision(6)} ${st.by}, more than its inlet's ${+st.inlet.toPrecision(6)} ${st.by}; lower the asked flow or give fractions.`,
        { block: id, asked, available: st.inlet, unit: st.by, loop: comp });
    }
    loops.push({ blocks: seq, tears: tears.map(e => e.id), iterations: it, residual: err, tolerance: opt.tolerance, ...(safeguards.length ? { safeguards } : {}) });
  }

  // overall balances: feeds in, products out
  const feeds = nodes.filter(id => blocks.get(id).type === "feed").flatMap(id => outEdges(id).map(e => values.get(e.id)));
  const products = nodes.filter(id => blocks.get(id).type === "product").flatMap(id => (blocks.get(id).ins.in ?? []).map(s => values.get(s)));
  const sum = list => list.reduce((acc, s) => acc.map((v, i) => v + s.flows[i]), new Array(sys.n).fill(0));
  // what the reactors generate (kmol/h per component) and the heat of their reactions (kW)
  const reactive = Object.values(results).filter(r => r.reaction);
  const gen = reactive.reduce((acc, r) => acc.map((v, i) => v + r.reaction.generation[i]), new Array(sys.n).fill(0));
  const fin = sum(feeds).map((v, i) => v + gen[i]), fout = sum(products);
  // the whole flowsheet must balance: a converged loop that does not is not converged (fail loudly)
  const Fin = sum(feeds).reduce((a, v) => a + v, 0);
  const off = sys.ids.map((id, i) => [id, fin[i] - fout[i]]).filter(([, d]) => !(Math.abs(d) <= balanceTol(opt.tolerance) * Math.max(Fin, 1e-12)));
  if (off.length && products.length) {
    throw fail("NO_CONVERGENCE", `The flowsheet does not balance: ${off.map(([id, d]) => `${sys.names[sys.ids.indexOf(id)]} ${d > 0 ? "in" : "out"} exceeds ${d > 0 ? "out" : "in"} by ${Math.abs(d).toPrecision(3)} kmol/h`).join(", ")}. A recycle without a way out for a component, or a loop that has not really converged; a purge or another convergence method usually helps.`, { balance: Object.fromEntries(off) });
  }
  const duties = Object.values(results).reduce((a, r) => a + (r.duty_kW ?? 0), 0);
  const H = list => list.reduce((a, s) => a + (s.H_kW ?? 0), 0);
  // energy streams: the ones given (an energy feed into a block, or a block's heat into another), then one per block with
  // a duty and no energy stream (heater, drum, separator; a pump's power), in kW (+ into the block, - out of it)
  const energy = Object.fromEntries([
    ...energyEdges.map(e => [e.id, { id: e.id, block: e.to, from: e.from, to: e.to, kind: "heat", duty_kW: results[e.to]?.duty_kW ?? qvals.get(e.id) ?? 0,
      internal: !!e.from, ...(e.label ? { label: e.label } : {}) }]),
    ...[...blocks.values()].filter(b => b.unit.duty && !b.qin && !b.qout)
      .map(b => [energyName(b), { id: energyName(b), block: b.id, kind: b.unit.energy, duty_kW: results[b.id]?.duty_kW ?? 0 }]),
  ]);
  // every record used outside its range, once per component, property and side, at the farthest distance reached,
  // with the blocks where it was (the maintainer, 2026-11-13; src/util/ranges.js)
  const extrapolations = mergeExtrapolations([...blockNotes].map(([where, notes]) => ({ where, notes })));
  // the strict range mode refuses an answer that would carry an extrapolation (decision 2026-11-14-06, CHEPTA-Lab EA-10).
  // The notes are those of the answer's states: the searches that led to it may pass outside a record's range in
  // either mode. A pair with no stored set is decided when the system is built (refused in the strict mode unless
  // thermo.missingPairs says otherwise), so an estimated pair here was asked for and is not refused again.
  const strict = strictRanges();
  const outside = strict ? extrapolations.filter(e => e.kind !== "estimatedPair") : [];
  if (outside.length) {
    throw failRange("OUT_OF_RANGE", `The strict range mode (strictRanges) refuses this answer: it uses ${outside.length === 1 ? "a record" : `${outside.length} records`} outside ${outside.length === 1 ? "its range" : "their ranges"}. ${outside.map(e => e.message).join(" ")} Without the strict mode the flowsheet is solved and these are warnings.`,
      { strictRanges: true, extrapolations: outside, where: [...new Set(outside.flatMap(e => e.where ?? []))].map(block => ({ block, message: outside.filter(e => e.where?.includes(block)).map(e => e.short ?? e.message).join("; ") })) });
  }
  return {
    components: sys.ids.slice(),
    // the range policy this answer was calculated with (decision 2026-11-14-06): "strict" refuses outside a record's
    // range, "lenient" (the default) continues the record with a warning (extrapolations)
    rangeMode: strict ? "strict" : "lenient",
    extrapolations,
    streams: Object.fromEntries(edges.map(e => [e.id, values.get(e.id)])),
    energy,
    blocks: results,
    order: comps.map(c => (c.length === 1 && !edges.some(e => e.from === c[0] && e.to === c[0]) ? c[0] : c)),
    loops,
    balance: {
      material_kmol_h: Object.fromEntries(sys.ids.map((id, i) => [id, fin[i] - fout[i]])),
      energy_kW: H(feeds) + duties - H(products) - reactive.reduce((a, r) => a + r.reaction.heat_kW, 0),
      ...(reactive.length ? { generation_kmol_h: Object.fromEntries(sys.ids.map((id, i) => [id, gen[i]])),
        reaction_kW: reactive.reduce((a, r) => a + r.reaction.heat_kW, 0) } : {}),
    },
  };
}
