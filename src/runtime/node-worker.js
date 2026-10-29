/**
 * Requests in a Node worker thread (proposal 0015, section 9, contract 7; W9), for the command line (bin/chepta.mjs)
 * and the MCP server (bin/chepta-mcp.mjs): limits.time_ms and cancellation end the worker (src/runtime/worker.js).
 *
 *   const { id, result, cancel } = startNodeRun(request);   // result: a Promise of the dispatcher's result
 *   await runInNodeWorker(request);                         // the same, without the handle
 *
 * Starting a worker loads the library (a few hundred milliseconds), so one idle worker is kept for the next request;
 * a worker that was ended (out of time, cancelled) is never reused. Not in the browser bundle: Node only.
 */
import { Worker } from "node:worker_threads";
import { superviseRun } from "./worker.js";

const MAIN = new URL("./node-worker-main.js", import.meta.url);
let idle = null;

function connect(onResult, onFailure) {
  const w = idle ?? new Worker(MAIN);
  idle = null;
  w.ref();
  let done = false;
  const onMessage = r => { done = true; release(); onResult(r); };
  const onError = e => { if (!done) { done = true; detach(); onFailure(e); } };
  const onExit = code => onError(new Error(`the worker stopped (exit code ${code})`));
  const detach = () => { w.off("message", onMessage); w.off("error", onError); w.off("exit", onExit); };
  const release = () => {
    detach();
    if (idle) { w.terminate(); return; }
    w.unref();
    idle = w;
  };
  w.on("message", onMessage);
  w.on("error", onError);
  w.on("exit", onExit);
  return {
    post: request => w.postMessage(request),
    terminate: () => { done = true; detach(); if (idle === w) idle = null; w.terminate(); },
  };
}

/** Start a request in a worker thread: { id, result: Promise, cancel(reason?) }. */
export const startNodeRun = request => superviseRun(request, connect);

/** Run a request in a worker thread; resolves to the result (never rejects). */
export const runInNodeWorker = request => startNodeRun(request).result;

/** End the idle worker (a process that wants to exit at once). */
export function closeNodeWorkers() {
  if (idle) { idle.terminate(); idle = null; }
}
