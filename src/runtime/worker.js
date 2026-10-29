/**
 * The worker of the execution envelope (proposal 0015, section 9, contract 7; milestone M1, W9): a request runs in a
 * separate thread, a Web Worker in the browser (src/runtime/browser-worker.js) and a Node worker thread for the command
 * line and the MCP server (src/runtime/node-worker.js), so that a calculation can be stopped: a timer cannot interrupt
 * a loop on the same thread, but the thread that waits can end the worker.
 *
 *   superviseRun(request, connect) → { id, result: Promise<result>, cancel() }
 *
 * connect(onResult, onFailure) starts (or reuses) a worker, posts nothing yet, and returns { post(request),
 * terminate() }. The result promise always resolves (never rejects), to:
 *   - the dispatcher's result, as the worker returned it, when it arrives in time and the run was not cancelled;
 *   - outcome "out_of_time" when limits.time_ms passes first: the worker is ended;
 *   - outcome "cancelled" when cancel() comes first: the worker is ended, and a result that arrives later is discarded;
 *   - outcome "error" when the worker itself fails (it could not start, or it died).
 * Such a result carries an error { code, message, where } like the dispatcher's, with code OUT_OF_TIME, CANCELLED or
 * WORKER_FAILED (codes of the runtime, not of the engine: the engine's codes are in src/util/errors.js), and the run record of
 * src/runtime/envelope.js.
 */
import pkg from "../../package.json" with { type: "json" };
import { hash64 } from "../api/hash.js";
import { checkLimits, LIMIT_DEFAULTS, newRun, endRun } from "./envelope.js";

/** The result of a run that the worker did not finish (out of time, cancelled, or the worker failed). */
export function unfinishedResult(request, run, outcome, message) {
  const code = outcome === "out_of_time" ? "OUT_OF_TIME" : outcome === "cancelled" ? "CANCELLED" : "WORKER_FAILED";
  return { chepta_result: 1, capability: request?.capability ?? null, outcome,
    error: { code, message, where: [] },
    reproduction: { library: pkg.version, input_hash: run.input_hash }, run: endRun(run, outcome === "cancelled" ? "cancelled" : "failed") };
}

/** The input hash and limits of a request, as the dispatcher computes them (wrong limits: the worker says so). */
function runOf(request) {
  let limits;
  try { limits = checkLimits(request?.limits); } catch { limits = { ...LIMIT_DEFAULTS }; }
  let inputHash = null;
  try { inputHash = hash64({ capability: request?.capability ?? null, input: request?.input ?? {} }); } catch { /* not JSON: the worker says so */ }
  return newRun(inputHash, limits);
}

/** Run a request through a worker; see the top of this file. */
export function superviseRun(request, connect) {
  const run = runOf(request);
  let settle, timer = null, worker = null, finished = false;
  const result = new Promise(resolve => { settle = resolve; });
  const finish = (r, end) => {
    if (finished) return;
    finished = true;
    if (timer) clearTimeout(timer);
    if (end && worker) { try { worker.terminate(); } catch { /* already gone */ } }
    settle(r);
  };
  try {
    worker = connect(r => finish(r, false), e => finish(unfinishedResult(request, run, "error",
      `CHEPTA's worker failed: ${e?.message ?? e}. Please report it with the request.`), true));
    timer = setTimeout(() => finish(unfinishedResult(request, run, "out_of_time",
      `The calculation did not finish within limits.time_ms = ${run.limits.time_ms} ms, and was stopped. Give it more time (limits.time_ms), or make the problem smaller.`), true), run.limits.time_ms);
    worker.post(request);
  } catch (e) {
    finish(unfinishedResult(request, run, "error", `CHEPTA's worker could not start: ${e?.message ?? e}.`), true);
  }
  return {
    id: run.id,
    result,
    cancel(reason = "The calculation was cancelled.") { finish(unfinishedResult(request, run, "cancelled", reason), true); },
  };
}
