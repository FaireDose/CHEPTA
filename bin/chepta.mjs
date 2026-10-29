#!/usr/bin/env node
/**
 * CHEPTA's command line (proposal 0015, section 9, contract 6; roadmap G1; milestone M1, W8). Every command is a
 * request to the dispatcher (src/api/dispatcher.js), run in a Node worker thread (src/runtime/node-worker.js) so that
 * the time limit can stop it; the result JSON is printed on standard output. Documented in docs/models/tools.md.
 *
 *   npx chepta run project.chepta.json      solve a project's flowsheet (capability solve_flowsheet)
 *   npx chepta capabilities                 what CHEPTA can calculate through this interface
 *   npx chepta request request.json         any request: { "capability": ..., "input": { ... }, "limits": { ... } }
 *   (a file name "-" reads standard input)
 *
 * Options: --time-ms N (limits.time_ms; default 60000), --compact (one line of JSON), --help, --version.
 * Exit code: the outcome, below; Ctrl+C cancels the run (outcome "cancelled").
 */
import { readFileSync } from "node:fs";
import { startNodeRun, closeNodeWorkers } from "../src/runtime/node-worker.js";
import pkg from "../package.json" with { type: "json" };

/** The exit code of each outcome; 1 is the command line's own error (arguments, a file that cannot be read). */
export const EXIT_CODES = Object.freeze({ ok: 0, invalid_input: 2, missing_data: 3, unsupported: 4, not_converged: 5, cancelled: 6, out_of_time: 7, error: 8 });

const HELP = `CHEPTA ${pkg.version}: the command line of the open-source process simulator.

Usage:
  chepta run <project.chepta.json>   solve the project's flowsheet
  chepta capabilities                list the capabilities
  chepta request <request.json>      run any request { "capability", "input", "limits" }
  ("-" as the file reads standard input)

Options:
  --time-ms N   stop the calculation after N milliseconds (default 60000)
  --compact     print the result on one line
  --help, --version

Exit codes: 0 ok, 2 invalid_input, 3 missing_data, 4 unsupported, 5 not_converged,
6 cancelled, 7 out_of_time, 8 error (a bug in CHEPTA), 1 the command line itself
(unknown command, a file that cannot be read or is not JSON).
`;

function usage(message) {
  process.stderr.write(`chepta: ${message}\nRun "chepta --help" for the usage.\n`);
  process.exit(1);
}

function readJson(file) {
  let text;
  try { text = readFileSync(file === "-" ? 0 : file, "utf8"); } catch (e) { usage(`cannot read ${file}: ${e.message}`); }
  try { return JSON.parse(text); } catch (e) { usage(`${file} is not JSON: ${e.message}`); }
}

const args = process.argv.slice(2);
const opts = { compact: false, timeMs: null };
const rest = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--help" || a === "-h") { process.stdout.write(HELP); process.exit(0); }
  else if (a === "--version" || a === "-v") { process.stdout.write(`${pkg.version}\n`); process.exit(0); }
  else if (a === "--compact") opts.compact = true;
  else if (a === "--time-ms" || a.startsWith("--time-ms=")) {
    const v = a.includes("=") ? a.split("=")[1] : args[++i];
    opts.timeMs = Number(v);
    if (!(Number.isFinite(opts.timeMs) && opts.timeMs > 0)) usage(`--time-ms needs a positive number of milliseconds (got ${JSON.stringify(v)}).`);
  } else if (a.startsWith("--")) usage(`unknown option ${a}.`);
  else rest.push(a);
}

const [command, file, ...extra] = rest;
if (extra.length) usage(`unexpected argument ${extra[0]}.`);
let request;
if (command === "run") {
  if (!file) usage("run needs a project file: chepta run project.chepta.json");
  request = { capability: "solve_flowsheet", input: { project: readJson(file) } };
} else if (command === "capabilities") {
  if (file) usage(`capabilities takes no file (got ${file}).`);
  request = { capability: "capabilities", input: {} };
} else if (command === "request") {
  if (!file) usage("request needs a request file: chepta request request.json");
  request = readJson(file);
  if (!request || typeof request !== "object" || Array.isArray(request)) usage(`${file} must hold one request object { "capability", "input", "limits" }.`);
} else if (!command) { process.stdout.write(HELP); process.exit(1); }
else usage(`unknown command "${command}".`);

if (opts.timeMs) request = { ...request, limits: { ...(request.limits ?? {}), time_ms: opts.timeMs } };

const h = startNodeRun(request);
process.once("SIGINT", () => h.cancel("Cancelled from the command line (Ctrl+C)."));
const result = await h.result;
closeNodeWorkers();
process.stdout.write(`${JSON.stringify(result, null, opts.compact ? 0 : 2)}\n`);
process.exitCode = EXIT_CODES[result.outcome] ?? EXIT_CODES.error;
