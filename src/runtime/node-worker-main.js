/**
 * The entry of CHEPTA's Node worker thread (src/runtime/node-worker.js): each message is a request, answered with the
 * dispatcher's result, after any progress reports. The worker is ended from outside when a run is out of time or cancelled.
 */
import { parentPort } from "node:worker_threads";
import { run } from "../api/dispatcher.js";
import { setProgressSink } from "../util/progress.js";

// the engine's progress reports (src/util/progress.js) go to the waiting thread as { chepta_progress: 1, progress }
setProgressSink(p => parentPort.postMessage({ chepta_progress: 1, progress: p }));
parentPort.on("message", request => parentPort.postMessage(run(request)));
