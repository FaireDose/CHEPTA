/**
 * The entry of CHEPTA's Node worker thread (src/runtime/node-worker.js): each message is a request, answered with the
 * dispatcher's result. The worker is ended from outside when a run is out of time or cancelled.
 */
import { parentPort } from "node:worker_threads";
import { run } from "../api/dispatcher.js";

parentPort.on("message", request => parentPort.postMessage(run(request)));
