/**
 * Requests in a Web Worker (proposal 0015, section 9, contract 7; W9), for the workbench and chat pages:
 *
 *   const { id, result, cancel, worker } = CHEPTA.startRun(request);   // result: a Promise of the result
 *   const r = await CHEPTA.runAsync(request);
 *
 * The browser bundle is one script that also runs inside chat artifacts, which cannot load a second file. So the worker
 * is made from the page's own code: the script that defined CHEPTA (document.currentScript while it runs) is loaded
 * again inside the worker, by its address (importScripts) or, for a script written into the page, from its text (a
 * Blob). Where that cannot be done (no Worker, a page whose rules forbid Blob or script workers, the ES module build,
 * Node), the request runs on the page's thread as CHEPTA.run does, and the result says so: run.worker is false and
 * run.note gives the reason; limits.time_ms and cancel() then cannot stop a calculation already running.
 *
 * A worker is started for each request and ended when the result arrives, so a stopped calculation never leaves one
 * behind (starting it costs the time to read the bundle, a fraction of a second).
 */
import { run } from "../api/dispatcher.js";
import { superviseRun } from "./worker.js";

// the script that is defining CHEPTA, read while it runs (afterwards document.currentScript is another script or null)
const SELF = (() => {
  try {
    const s = typeof document !== "undefined" ? document.currentScript : null;
    if (!s) return null;
    if (s.src) return { src: s.src };
    return s.textContent && s.textContent.includes("CHEPTA") ? { text: s.textContent } : null;
  } catch { return null; }
})();

// inside the worker: answer each request with the dispatcher's result
const WORKER_MAIN = "self.onmessage=function(e){self.postMessage(CHEPTA.run(e.data));};";

let source = null, unavailable = null;

/** The address of the worker's code, made once; null (with the reason in `unavailable`) when there can be none. */
function workerUrl() {
  if (source || unavailable) return source;
  if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) unavailable = "this page has no Web Workers";
  else if (!SELF) unavailable = "the code of CHEPTA could not be found for a worker (it was not loaded as the browser script dist/chepta.js)";
  else {
    const body = SELF.src ? `importScripts(${JSON.stringify(SELF.src)});\n${WORKER_MAIN}` : `${SELF.text}\n;${WORKER_MAIN}`;
    try { source = URL.createObjectURL(new Blob([body], { type: "text/javascript" })); } catch (e) { unavailable = `a worker could not be made (${e?.message ?? e})`; }
  }
  return source;
}

/** Whether requests run in a worker on this page, and why not when they do not. */
export function workerStatus() {
  const url = workerUrl();
  return url ? { worker: true } : { worker: false, note: `Calculated on the page's thread: ${unavailable}; a time limit or a cancel cannot stop a calculation already running.` };
}

function connect(onResult, onFailure) {
  const w = new Worker(workerUrl());
  w.onmessage = e => { w.terminate(); onResult(e.data); };
  // a worker that cannot load its script (a page's security rules) fails here: the caller falls back
  w.onerror = e => { e.preventDefault?.(); w.terminate(); onFailure(new Error(e.message || "the worker could not start")); };
  return { post: request => w.postMessage(request), terminate: () => w.terminate() };
}

/** The same thread: the dispatcher, with the reason the worker was not used. */
function onThisThread(request, note) {
  const r = run(request);
  if (r.run) r.run = { ...r.run, worker: false, note };
  return { id: r.run?.id ?? null, worker: false, result: Promise.resolve(r), cancel() {} };
}

/** Start a request in a Web Worker, or on the page's thread when there can be none: { id, worker, result, cancel }. */
export function startRun(request) {
  const st = workerStatus();
  if (!st.worker) return onThisThread(request, st.note);
  const h = superviseRun(request, connect);
  // a worker that failed to start (a Content Security Policy that forbids blob: workers, for example): run here, once
  // for this page, and say so
  const result = h.result.then(r => {
    if (r.error?.code === "WORKER_FAILED") {
      unavailable = "a worker could not start on this page (its security rules may forbid workers)";
      source = null;
      return onThisThread(request, workerStatus().note).result;
    }
    if (r.run) r.run = { ...r.run, worker: true };
    return r;
  });
  return { id: h.id, worker: true, result, cancel: h.cancel };
}

/** Run a request in a Web Worker (or on the page's thread when there can be none); resolves to the result. */
export const runAsync = request => startRun(request).result;
