/**
 * The execution envelope of a calculation (proposal 0015, section 9, contract 7): every run has an id, the hash of its
 * input, its limits and its status, and a run that was cancelled, or overtaken by a newer revision of the same input,
 * has its result discarded.
 *
 * Statuses: "running", "done", "failed", "cancelled". In M0 a run is synchronous, on the caller's thread: cancelling it
 * before it starts stops it, and `time_ms` is recorded with the elapsed time but cannot stop a calculation in progress
 * (a timer cannot interrupt a loop on the same thread). The worker of milestone M1 (W9) stops a run by ending its
 * worker, a Web Worker in the browser and a Node worker thread for the command line and the MCP server, and turns an
 * exceeded `time_ms` into the outcome "out_of_time".
 */
import { fail } from "../util/errors.js";

export const RUN_STATUSES = Object.freeze(["running", "done", "failed", "cancelled"]);
/** The default limits: 60 s of calculation. */
export const LIMIT_DEFAULTS = Object.freeze({ time_ms: 60000 });

let counter = 0;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Check the limits of a request: { time_ms } (a positive number); unknown keys are refused. */
export function checkLimits(limits) {
  if (limits == null) return { ...LIMIT_DEFAULTS };
  if (typeof limits !== "object" || Array.isArray(limits)) throw fail("BAD_INPUT", "limits must be an object such as { \"time_ms\": 60000 }.");
  const bad = Object.keys(limits).filter(k => !(k in LIMIT_DEFAULTS));
  if (bad.length) throw fail("BAD_INPUT", `limits: unknown key ${bad.map(k => `"${k}"`).join(", ")}. Known: ${Object.keys(LIMIT_DEFAULTS).join(", ")}.`);
  const out = { ...LIMIT_DEFAULTS, ...limits };
  if (!(Number.isFinite(out.time_ms) && out.time_ms > 0)) throw fail("BAD_INPUT", `limits.time_ms must be a positive number of milliseconds (got ${JSON.stringify(limits.time_ms)}).`);
  return out;
}

/** A new run of an input (by its hash), with its limits. */
export function newRun(inputHash, limits = null) {
  counter += 1;
  return { id: `run-${Date.now().toString(36)}-${counter}`, input_hash: inputHash, limits: checkLimits(limits), status: "running", started: now() };
}

/** End a run: "done", "failed" or "cancelled"; a run already cancelled stays cancelled. Returns its public record. */
export function endRun(run, status) {
  if (!RUN_STATUSES.includes(status) || status === "running") throw new Error(`Internal: a run cannot end as "${status}".`);
  if (run.status === "running") run.status = status;
  run.elapsed_ms = now() - run.started;
  return runRecord(run);
}

/** Cancel a run: its result, when it comes, is discarded. */
export function cancelRun(run) {
  if (run.status === "running") run.status = "cancelled";
}

/** What a result says about its run: id, input hash, limits, status and elapsed time. */
export const runRecord = run => ({ id: run.id, input_hash: run.input_hash, limits: { ...run.limits }, status: run.status,
  ...(run.elapsed_ms != null ? { elapsed_ms: run.elapsed_ms } : {}) });

/**
 * A gate for results that arrive late: begin(key) starts a run for the current revision of an input (the project the
 * user is editing); accept(run) is true only for the latest run begun and not cancelled, so the result of an older
 * revision is never shown.
 */
export function resultGate() {
  let latest = null;
  return {
    begin(inputHash, limits = null) { if (latest) cancelRun(latest); latest = newRun(inputHash, limits); return latest; },
    accept(run) { return run === latest && run.status !== "cancelled"; },
  };
}
