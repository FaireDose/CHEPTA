#!/usr/bin/env node
/**
 * CHEPTA's command line (proposal 0015, section 9, contract 6; roadmap G1; milestone M1, W8). Every command is a
 * request to the dispatcher (src/api/dispatcher.js), run in a Node worker thread (src/runtime/node-worker.js) so that
 * the time limit can stop it; the result JSON is printed on standard output. Documented in docs/models/tools.md.
 *
 *   npx chepta run project.chepta.json      solve a project's flowsheet (capability solve_flowsheet)
 *   npx chepta capabilities                 what CHEPTA can calculate through this interface
 *   npx chepta request request.json         any request: { "capability": ..., "input": { ... }, "limits": { ... } }
 *   npx chepta summary result.json          a short summary of a saved result (src/api/summary.js)
 *   (a file name "-" reads standard input)
 *
 * Options: --time-ms N (limits.time_ms; default 60000), --compact (one line of JSON), --summary (run or request: write
 * the full result, unchanged, to a file and print only its short summary), --out FILE (with --summary: that file;
 * default next to the input, <input>.result.json), --input FILE (summary: the input file to name), --help, --version.
 * Exit code: the outcome, below; Ctrl+C cancels the run (outcome "cancelled").
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { summarizeResult } from "../src/api/summary.js";
import { startNodeRun, closeNodeWorkers } from "../src/runtime/node-worker.js";
import pkg from "../package.json" with { type: "json" };

/** The exit code of each outcome; 1 is the command line's own error (arguments, a file that cannot be read). */
export const EXIT_CODES = Object.freeze({ ok: 0, invalid_input: 2, missing_data: 3, unsupported: 4, not_converged: 5, cancelled: 6, out_of_time: 7, error: 8 });

const HELP = `CHEPTA ${pkg.version}: the command line of the open-source process simulator.

Usage:
  chepta run <project.chepta.json>   solve the project's flowsheet
  chepta capabilities                list the capabilities
  chepta request <request.json>      run any request { "capability", "input", "limits" }
  chepta summary <result.json>       a short summary of a saved result
  ("-" as the file reads standard input)

Options:
  --time-ms N   stop the calculation after N milliseconds (default 60000)
  --compact     print the result on one line
  --summary     (run, request) write the full result, unchanged, to a file and
                print only a short summary of it; open the full file to accept
                a result or to diagnose a failure
  --out FILE    with --summary: the file of the full result
                (default: next to the input, <input>.result.json)
  --input FILE  (summary) the input file the result came from, to name it
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
const opts = { compact: false, timeMs: null, summary: false, out: null, input: null };
const valueOf = (a, i) => (a.includes("=") ? a.slice(a.indexOf("=") + 1) : args[i]);
const rest = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--help" || a === "-h") { process.stdout.write(HELP); process.exit(0); }
  else if (a === "--version" || a === "-v") { process.stdout.write(`${pkg.version}\n`); process.exit(0); }
  else if (a === "--compact") opts.compact = true;
  else if (a === "--summary") opts.summary = true;
  else if (a === "--out" || a.startsWith("--out=") || a === "--input" || a.startsWith("--input=")) {
    const v = valueOf(a, a.includes("=") ? i : ++i);
    if (!v) usage(`${a.split("=")[0]} needs a file name.`);
    opts[a.startsWith("--out") ? "out" : "input"] = v;
  }
  else if (a === "--time-ms" || a.startsWith("--time-ms=")) {
    const v = a.includes("=") ? a.split("=")[1] : args[++i];
    opts.timeMs = Number(v);
    if (!(Number.isFinite(opts.timeMs) && opts.timeMs > 0)) usage(`--time-ms needs a positive number of milliseconds (got ${JSON.stringify(v)}).`);
  } else if (a.startsWith("--")) usage(`unknown option ${a}.`);
  else rest.push(a);
}

const [command, file, ...extra] = rest;
if (extra.length) usage(`unexpected argument ${extra[0]}.`);
const format = r => `${JSON.stringify(r, null, opts.compact ? 0 : 2)}\n`;
/** The engine's git commit and whether its tracked files have local changes, when it runs from a clone; null
 *  otherwise (never guessed). */
function engineCommit() {
  const git = a => execFileSync("git", a, { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  try {
    const commit = git(["rev-parse", "HEAD"]).trim() || null;
    let dirty = null;
    try { dirty = git(["status", "--porcelain", "--untracked-files=no"]).trim() !== ""; } catch { /* not known */ }
    return { commit, dirty };
  } catch { return { commit: null, dirty: null }; }
}
if ((opts.out || opts.summary) && !["run", "request"].includes(command)) usage("--summary and --out go with run or request.");
if (opts.out && !opts.summary) usage("--out goes with --summary: chepta request request.json --summary --out full.json");
if (opts.input && command !== "summary") usage("--input goes with summary: chepta summary result.json --input request.json");
if (command === "summary") {
  if (!file) usage("summary needs a result file: chepta summary result.json");
  const saved = readJson(file);
  if (!saved || typeof saved !== "object" || saved.chepta_result === undefined) usage(`${file} is not a CHEPTA result (it has no "chepta_result").`);
  process.stdout.write(format(summarizeResult(saved, { inputFile: opts.input, resultFile: file === "-" ? null : file })));
  process.exit(0);
}

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
if (opts.summary) {
  // the full result, byte for byte what the command prints without --summary, to its file; the summary on stdout
  const out = opts.out ?? (file === "-" ? `chepta-${result.reproduction?.input_hash ?? "result"}.result.json` : `${file.replace(/\.json$/i, "")}.result.json`);
  if (out === file) usage(`--out ${out} is the input file; give another file for the full result.`);
  try { writeFileSync(out, format(result)); } catch (e) { usage(`cannot write ${out}: ${e.message}`); }
  process.stdout.write(format(summarizeResult(result, { inputFile: file === "-" ? null : file, resultFile: out, ...engineCommit() })));
} else process.stdout.write(format(result));
process.exitCode = EXIT_CODES[result.outcome] ?? EXIT_CODES.error;
