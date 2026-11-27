/**
 * A short summary of a request's result (release 0.6.3; decision 2026-11-27-02, docs/models/tools.md, "A short run
 * summary"). One saved flowsheet result can be about 100,000 tokens when an agent reads it; the summary keeps what
 * the next person needs, and points (JSON paths) to what it leaves out. It changes no result: it only reads one.
 *
 *   summarizeResult(result, { inputFile, resultFile, commit }) → a JSON-ready object (chepta_summary: 1)
 *
 * What it keeps: which run (engine version, commit when known, capability, input hash, the files); the outcome, the
 * elapsed time and the three slowest blocks; for a failure the error's code, message, where, reason and best point or
 * last residual; each design specification; each recycle loop's convergence; the external balance; the qualifications
 * VERBATIM (warnings, notes, parameter sets, estimated pairs, two liquids); the flowsheet-level range warnings
 * verbatim; the per-stream range warnings as their count and a de-duplicated list of distinct messages with the
 * streams each applies to; every other warning found anywhere in the result, verbatim, with where it was found.
 * A value the result does not hold stays missing (null), never 0. The keys keep the engine's units (T_K, duty_kW).
 */

export const SUMMARY_FORMAT = 1;

const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
/** The value, or null when the result does not hold it (never 0 for a missing number). */
const opt = v => (v === undefined ? null : v);
const path = (p, k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? `${p}.${k}` : `${p}[${JSON.stringify(k)}]`);

/**
 * Every warning in a value, with where it was found: a string under a key that names a warning (warning, warnings,
 * quality_warning, ...), each string of such an array, or the message of each object in it (the object kept whole:
 * its code and remedy are part of its meaning).
 */
export function collectWarnings(v, p = "$", out = []) {
  if (Array.isArray(v)) { v.forEach((x, i) => collectWarnings(x, `${p}[${i}]`, out)); return out; }
  if (!isObj(v)) return out;
  for (const [k, x] of Object.entries(v)) {
    const at = path(p, k);
    if (/warn/i.test(k)) {
      const items = Array.isArray(x) ? x.map((y, i) => [y, `${at}[${i}]`]) : [[x, at]];
      for (const [y, ap] of items) {
        if (typeof y === "string") out.push({ warning: y, message: y, at: ap });
        else if (isObj(y) && typeof y.message === "string") out.push({ warning: y, message: y.message, at: ap });
        else collectWarnings(y, ap, out);
      }
    } else collectWarnings(x, at, out);
  }
  return out;
}

/** The three slowest blocks of a run's timing, and its totals; null without a timing. */
function timingSummary(t) {
  if (!isObj(t)) return null;
  const blocks = Object.entries(t.blocks ?? {}).sort((a, b) => (b[1]?.s ?? 0) - (a[1]?.s ?? 0));
  return {
    total_s: opt(t.total_s),
    blocks_calculated: blocks.length,
    block_calls: blocks.reduce((a, [, b]) => a + (b?.calls ?? 0), 0),
    slowest_blocks: blocks.slice(0, 3).map(([block, b]) => ({ block, s: opt(b?.s), calls: opt(b?.calls) })),
    loops: (t.loops ?? []).map(l => ({ tears: opt(l.tears), passes: (l.passes ?? []).length,
      s: (l.passes ?? []).reduce((a, q) => a + (q.s ?? 0), 0) })),
    ...(t.designSpecs ? { design_spec_evaluations: (t.designSpecs.evaluations ?? []).length } : {}),
    ...(has(t, "columnRestart") ? { columnRestart: t.columnRestart } : {}),
    ...(has(t, "timeLimit_s") ? { timeLimit_s: t.timeLimit_s } : {}),
  };
}

/** A failure's error: code, message, where, and the details that say why (the full details stay in the file). */
function errorSummary(e) {
  if (!isObj(e)) return null;
  const d = isObj(e.details) ? e.details : {};
  const keep = ["reason", "designSpec", "loop", "tears", "at", "residual", "solves", "bracket", "best", "nearest", "at_bounds", "pinned",
    "where", "cause", "netChange_kmol_h", "balance", "strictRanges"];
  const details = Object.fromEntries(keep.filter(k => has(d, k)).map(k => [k, d[k]]));
  if (Array.isArray(d.history) && d.history.length) { details.last_residual = d.history[d.history.length - 1]; details.iterations = d.history.length; }
  if (Array.isArray(d.trail)) details.solves_finished = d.trail.length;
  if (Array.isArray(d.safeguards)) details.safeguards = d.safeguards.length;
  return { code: opt(e.code), message: opt(e.message), where: opt(e.where), ...(Object.keys(details).length ? { details } : {}),
    left_out: Object.keys(d).filter(k => !keep.includes(k)).map(k => `$.error.details.${k}`) };
}

/** Each design specification: varied, value, bounds, target asked and reached, residual, tolerance, met, solves. */
function designSpecsSummary(value, checks) {
  const specs = Array.isArray(value?.designSpecs) ? value.designSpecs : null;
  const byId = new Map((checks?.design_specs ?? []).map(d => [d.id, d]));
  if (!specs && !byId.size) return null;
  return (specs ?? [...byId.values()]).map(d => {
    const c = byId.get(d.id) ?? {}, t = d.target ?? {};
    return {
      id: d.id, varied: opt(d.varied ?? c.varied),
      target: { ...Object.fromEntries(["stream", "block", "quantity", "component", "ratio_of", "unit"].filter(k => has(t, k)).map(k => [k, t[k]])),
        asked: opt(t.asked ?? c.asked), reached: opt(t.reached ?? c.reached), residual: opt(t.residual ?? c.residual),
        tolerance: opt(t.tolerance ?? c.tolerance), tolerance_default: opt(t.tolerance_default ?? c.tolerance_default), absolute: opt(t.absolute ?? c.absolute) },
      met: opt(d.met ?? c.met), method: opt(d.method ?? c.method), solves: opt(d.solves ?? c.solves), ...(d.bracket ? { bracket: d.bracket } : {}),
    };
  });
}

/** The per-stream warnings, de-duplicated: each distinct message once, with the streams it applies to. */
function streamWarnings(streams) {
  const distinct = new Map();
  let count = 0;
  for (const [id, s] of Object.entries(isObj(streams) ? streams : {})) {
    for (const w of collectWarnings(s, path("$.value.streams", id))) {
      count++;
      const key = JSON.stringify(w.warning);
      if (!distinct.has(key)) distinct.set(key, { warning: w.warning, streams: [] });
      const e = distinct.get(key);
      if (!e.streams.includes(id)) e.streams.push(id);
    }
  }
  return { count, distinct: distinct.size, messages: [...distinct.values()] };
}

/**
 * The summary of a result. options: inputFile (the request or project file), resultFile (where the full result is),
 * commit (the engine's git commit, when known), dirty (true when that clone had local changes; null when not known).
 */
export function summarizeResult(result, { inputFile = null, resultFile = null, commit = null, dirty = null } = {}) {
  const r = isObj(result) ? result : {};
  const value = isObj(r.value) ? r.value : null, checks = isObj(r.checks) ? r.checks : null;
  const rep = isObj(r.reproduction) ? r.reproduction : {}, runRec = isObj(r.run) ? r.run : {};
  const s = {
    chepta_summary: SUMMARY_FORMAT,
    note: "A summary of the full result: open the full result file (full_result_file) to accept a result or to diagnose a failure. Every warning and qualification is kept verbatim; left_out lists what is only in the full file.",
    which: {
      engine: { library: opt(rep.library), commit: opt(commit), local_changes: opt(dirty) },
      capability: opt(r.capability), input_hash: opt(rep.input_hash ?? runRec.input_hash), databank_hash: opt(rep.databank_hash),
      user_data_hash: opt(rep.user_data_hash), method: opt(rep.method), components: opt(value?.components), run_id: opt(runRec.id),
      input_file: opt(inputFile), full_result_file: opt(resultFile),
    },
    outcome: opt(r.outcome), status: opt(runRec.status), elapsed_ms: opt(runRec.elapsed_ms), limits: opt(runRec.limits),
    timing: timingSummary(runRec.timing),
  };
  if (r.error !== undefined) s.error = errorSummary(r.error);
  const ds = designSpecsSummary(value, checks);
  if (ds) s.design_specs = ds;
  if (Array.isArray(checks?.loops) || Array.isArray(value?.loops)) {
    const vl = value?.loops ?? [];
    s.loops = (checks?.loops ?? vl).map((l, i) => ({ tears: opt(l.tears), iterations: opt(l.iterations), last_change: opt(l.residual), tolerance: opt(l.tolerance),
      ...(vl[i]?.safeguards ? { safeguards: vl[i].safeguards.length } : {}) }));
  }
  if (checks && (has(checks, "material_kmol_h") || has(checks, "energy_kW"))) {
    s.balance = { material_kmol_h: opt(checks.material_kmol_h), energy_kW: opt(checks.energy_kW), balance_tolerance: opt(checks.balance_tolerance),
      balance_limit_kmol_h: opt(checks.balance_limit_kmol_h), warnings: opt(value?.balance?.warnings ?? null) };
  }
  if (isObj(checks?.columns)) {
    s.columns = Object.fromEntries(Object.entries(checks.columns).map(([id, c]) => [id, { converged: opt(c.converged), iterations: opt(c.iterations),
      ...(Array.isArray(c.specifications) ? { specifications: c.specifications.map(q => ({ label: opt(q.label), asked: opt(q.asked), achieved: opt(q.achieved), unit: opt(q.unit), met: opt(q.met) })) } : {}) }]));
  }
  // the qualifications in full, verbatim: the flowsheet- and block-level warnings, notes, sets and estimated pairs
  if (r.qualifications !== undefined) s.qualifications = r.qualifications;
  // range warnings: the flowsheet-level ones verbatim; the per-stream ones counted and de-duplicated
  if (value && (Array.isArray(value.extrapolations) || isObj(value.streams))) {
    s.range_warnings = {
      ...(has(value, "rangeMode") ? { rangeMode: value.rangeMode } : {}),
      flowsheet: (value.extrapolations ?? []).map(e => (typeof e?.message === "string" ? e.message : e)),
      ...(isObj(value.streams) ? { streams: streamWarnings(value.streams) } : {}),
    };
  }
  // every other warning, wherever it is (a block's, a loop's, a design specification's), once each, with where
  const known = new Set(collectWarnings(r.qualifications ?? {}).map(w => w.message));
  const others = new Map();
  const rest = { ...r, qualifications: undefined, value: value ? { ...value, streams: undefined } : r.value };
  for (const w of collectWarnings(rest)) {
    if (known.has(w.message)) continue;
    const key = JSON.stringify(w.warning);
    if (!others.has(key)) others.set(key, { warning: w.warning, at: [] });
    others.get(key).at.push(w.at);
  }
  if (others.size) s.other_warnings = [...others.values()];
  s.left_out = leftOut(r, value, checks);
  return s;
}

/** Pointers (JSON paths) to what the summary leaves out, with how many entries each holds. */
function leftOut(r, value, checks) {
  const out = {};
  const size = v => (Array.isArray(v) ? v.length : isObj(v) ? Object.keys(v).length : null);
  if (value) {
    for (const [k, v] of Object.entries(value)) {
      if (["designSpecs", "rangeMode", "components"].includes(k)) continue;
      out[`$.value.${k}`] = k === "extrapolations" ? `${size(v)} records used outside their range (their messages are in range_warnings.flowsheet)`
        : k === "streams" ? `${size(v)} streams (flows, compositions, states, sources; their warnings are in range_warnings.streams)`
        : k === "blocks" ? `${size(v)} blocks (duties, states, profiles, specs, notes)`
        : size(v) != null ? `${size(v)} entries` : "a value";
    }
  } else if (r.value !== undefined) out["$.value"] = "the value";
  if (has(checks, "blocks")) out["$.checks.blocks"] = `${size(checks.blocks)} blocks (each block's own material and energy balance)`;
  if (has(checks, "columns")) out["$.checks.columns"] = `${size(checks.columns)} columns (residuals and tolerances by group; converged and iterations are in columns)`;
  if (isObj(r.reproduction) && r.reproduction.parameter_sets) out["$.reproduction.parameter_sets"] = `${size(r.reproduction.parameter_sets)} sets (also in qualifications.pairs)`;
  if (isObj(r.run?.timing)) out["$.run.timing"] = "the time per block, recycle pass and design-specification evaluation";
  return out;
}
