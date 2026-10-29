// The worker of the execution envelope (src/runtime/; proposal 0015, contract 7, milestone M1, W9): a request in a Node
// worker thread gives the dispatcher's result; limits.time_ms stops a calculation in progress (an endless loop here,
// which a timer on the same thread could never interrupt); a cancelled run's late result is discarded; and in Node,
// where there is no Web Worker, the browser entry falls back to the caller's thread and says so. The flowsheet is the
// ethanol + water example (NRTL, ideal-gas vapour; docs/METHOD_SELECTION.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { run } from "../src/api/dispatcher.js";
import { superviseRun } from "../src/runtime/worker.js";
import { startNodeRun, runInNodeWorker, closeNodeWorkers } from "../src/runtime/node-worker.js";
import { startRun, runAsync, workerStatus } from "../src/runtime/browser-worker.js";

const project = JSON.parse(readFileSync(new URL("../examples/heater-flash.chepta.json", import.meta.url), "utf8"));
const solve = { capability: "solve_flowsheet", input: { project } };
const same = r => { const { run: _run, ...rest } = JSON.parse(JSON.stringify(r)); return rest; };
const sleep = ms => new Promise(res => setTimeout(res, ms));

test("Node worker: the same result as the dispatcher on this thread; the worker is reused", async () => {
  const a = await runInNodeWorker(solve);
  assert.equal(a.outcome, "ok");
  assert.deepEqual(same(a), same(run(solve)));
  const b = await runInNodeWorker(solve);
  assert.deepEqual(same(b), same(a));
  const bad = await runInNodeWorker({ capability: "solve_flowsheet", input: {}, limits: { time_ms: -1 } });
  assert.equal(bad.outcome, "invalid_input");
  closeNodeWorkers();
});

test("time limit: an endless loop in a worker is stopped, and the outcome is out_of_time", async () => {
  let exited = false;
  const t0 = Date.now();
  const h = superviseRun({ capability: "solve_flowsheet", input: {}, limits: { time_ms: 200 } }, (onResult, onFailure) => {
    const w = new Worker("require('node:worker_threads').parentPort.on('message', () => { for (;;) {} });", { eval: true });
    w.on("message", onResult);
    w.on("error", onFailure);
    w.on("exit", () => { exited = true; });
    return { post: m => w.postMessage(m), terminate: () => w.terminate() };
  });
  const r = await h.result;
  assert.equal(r.outcome, "out_of_time");
  assert.equal(r.error.code, "OUT_OF_TIME");
  assert.equal(r.run.status, "failed");
  assert.equal(r.run.limits.time_ms, 200);
  assert.ok(Date.now() - t0 < 5000);
  await sleep(100);
  assert.ok(exited, "the worker was ended");
  // the real worker: a limit shorter than the calculation
  const late = await runInNodeWorker({ ...solve, limits: { time_ms: 1 } });
  assert.equal(late.outcome, "out_of_time");
  assert.equal(late.value, undefined);
  // and the next request starts a new worker
  assert.equal((await runInNodeWorker(solve)).outcome, "ok");
  closeNodeWorkers();
});

test("cancel: the outcome is cancelled, and the result that would have come is discarded", async () => {
  const h = startNodeRun(solve);
  h.cancel("stopped by the test");
  const r = await h.result;
  assert.equal(r.outcome, "cancelled");
  assert.equal(r.error.message, "stopped by the test");
  assert.equal(r.run.status, "cancelled");
  assert.equal(r.value, undefined);
  await sleep(300);
  assert.equal((await h.result).outcome, "cancelled", "a late result never replaces the cancellation");
  h.cancel();   // a second cancel changes nothing
  assert.equal((await h.result).outcome, "cancelled");
  closeNodeWorkers();
});

test("browser entry in Node: no Web Worker, so the caller's thread, and the result says so", async () => {
  assert.equal(workerStatus().worker, false);
  const h = startRun(solve);
  assert.equal(h.worker, false);
  const r = await h.result;
  assert.equal(r.outcome, "ok");
  assert.equal(r.run.worker, false);
  assert.match(r.run.note, /page's thread: this page has no Web Workers/);
  assert.deepEqual(same(await runAsync(solve)), same(run(solve)));
});
