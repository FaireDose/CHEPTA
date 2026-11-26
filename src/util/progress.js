/**
 * Progress of a long calculation, for the thread that waits on it (decision 2026-11-14-06, CHEPTA-Lab EA-14).
 *
 * A request that runs in a worker (src/runtime/worker.js) can be stopped by its time limit; the worker is then ended
 * and its own state is lost. So the engine reports where it is while it runs: the flowsheet's recycle loops, after
 * every iteration, their blocks, tear streams, iterations and last residual. The worker passes each report to the
 * thread that waits, which keeps the last one and puts it in the "out_of_time" result.
 *
 * Without a sink (a calculation on the caller's own thread) a report costs one test and is dropped.
 */
import { fail } from "./errors.js";

let sink = null;

/** Send every later report to fn (the worker's entry); null stops. Returns the previous sink. */
export function setProgressSink(fn) {
  const before = sink;
  sink = typeof fn === "function" ? fn : null;
  return before;
}

/** Report the progress of the calculation now running (a small JSON-safe object). Never throws. The context set by
 *  setProgressContext (a design specification's evaluation) goes with every report. */
export function reportProgress(p) {
  if (!sink) return;
  try { sink(context ? { ...p, ...context } : p); } catch { /* a progress report never stops a calculation */ }
}

let context = null;
/** What every later report also carries (e.g. { designSpec: { solve, at, bracket, best } }); null clears. */
export function setProgressContext(c) { context = c && typeof c === "object" ? c : null; }

/** True when someone listens (so a caller can skip building a report). */
export const progressWanted = () => sink !== null;

/**
 * A calculation's own time limit (solver.timeLimit_s; proposal 0027, (c)). The engine checks it between blocks and
 * between a column's Newton iterations; once the limit has passed it stays passed (a check that a block's own error
 * handling swallowed is made again at the next one, and the flowsheet turns the block's failure into OUT_OF_TIME).
 */
let deadline = null, expired = false;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
/** Run fn with a time limit of limit_s seconds (null: none); limits nest, the earlier deadline holds. */
export function withTimeLimit(limit_s, fn) {
  const before = { deadline, expired };
  if (limit_s != null) { const d = now() + 1000 * limit_s; deadline = deadline == null ? d : Math.min(deadline, d); }
  try { return fn(); } finally { deadline = before.deadline; expired = before.expired; }
}
/** True once the time limit has passed. */
export function timeUp() {
  if (deadline == null) return false;
  if (!expired && now() > deadline) expired = true;
  return expired;
}
/** Throw OUT_OF_TIME once the time limit has passed (the flowsheet replaces the message with where it was). */
export function checkTime() {
  if (timeUp()) throw fail("OUT_OF_TIME", "The time limit (solver.timeLimit_s) has passed.");
}
