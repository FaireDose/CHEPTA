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
let sink = null;

/** Send every later report to fn (the worker's entry); null stops. Returns the previous sink. */
export function setProgressSink(fn) {
  const before = sink;
  sink = typeof fn === "function" ? fn : null;
  return before;
}

/** Report the progress of the calculation now running (a small JSON-safe object). Never throws. */
export function reportProgress(p) {
  if (!sink) return;
  try { sink(p); } catch { /* a progress report never stops a calculation */ }
}

/** True when someone listens (so a caller can skip building a report). */
export const progressWanted = () => sink !== null;
