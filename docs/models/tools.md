# The tool interface: command line, MCP server and worker

How programs and AI assistants call CHEPTA's calculations ([proposal 0015](../../proposals/0015-separation-units.md),
section 9, contracts 6 and 7; roadmap G1 and A9; milestone M1). Written against **contracts v1**
([ARCHITECTURE.md](../../ARCHITECTURE.md), "The request path and the contracts of proposal 0015").

Every way in goes through the same dispatcher, `run(request) → result` (`src/api/dispatcher.js`), so the workbench, a
chat page, the command line and an assistant get the same numbers for the same input:

```js
{ "capability": "solve_flowsheet", "input": { "project": { ... } }, "limits": { "time_ms": 60000 } }
// → { chepta_result: 1, capability, outcome, value?, error?, checks?, qualifications?, reproduction, run }
```

The capabilities, their input schemas and the outcomes are listed in ARCHITECTURE.md; `chepta capabilities` prints
them. Only the outcome `ok` carries numbers. `missing_data` means a property or parameter is not in CHEPTA: supply it
(My data), never guess it. A converged result is not a result validated against data.

**The authoring contract** (proposal 0015, W8). A flowsheet is checked before anything is calculated, and a key CHEPTA
does not read is refused rather than ignored:

- an unknown key of the flowsheet's `thermo` (it takes `model`, `vapour`, `sets`, `prefer`, `solids`, `mixing` and `missingPairs`; an assistant's
  `thermo.method` is one) gives `invalid_input` (BAD_INPUT) with the key, the known keys and `where`
  `[{ field: "flowsheet.thermo.method" }]`;
- an unknown key of a block's `spec` gives `invalid_input` with the block's known keys and `where`
  `[{ block: "H1", message }]`. Each block type's keys are its `specKeys` (src/units/units.js and the reactor and
  column files); `design` on a heater or heat exchanger is the workbench's memory of a rated block's design;
- a pair without parameters of an activity model is estimated from Modified UNIFAC 2.0 (decision 2026-11-13-05): the
  result is `ok`, the pair is in `qualifications.pairs` (set `estimated-mod-unifac-2`, tier predicted) and in
  `qualifications.estimated_pairs` with its warning, and in `value.extrapolations` (kind `estimatedPair`). With
  `options.strictRanges` (or the flowsheet's `solver.strictRanges`) it gives `missing_data` (MISSING_DATA) with
  `details.missing_pairs`, as before 2026-11-13; the message names the remedies: add the pair's parameters, with their
  source, as the user's own data (My data; `user_data.pairs` in the project or the request), or choose another method.
  A light gas with a missing pair (no Modified UNIFAC 2.0 groups) gives `missing_data` in both modes. The flowsheet's
  `thermo.missingPairs` (`"estimate"`, `"ideal"` or `"refuse"`; decision 2026-11-14-06) chooses for itself, in either
  mode: `"ideal"` takes the pair as ideal (listed in `qualifications.missing_pairs`), `"estimate"` estimates it even
  in the strict mode;
- the strict range mode (`options.strictRanges` or the flowsheet's `solver.strictRanges`; decision 2026-11-14-06)
  refuses an answer that would carry an extrapolation: `invalid_input` (OUT_OF_RANGE), the message naming every record
  outside its range, `details.extrapolations` and `where` the blocks. The searches that lead to an answer may pass
  outside a record's range in either mode; what counts is the answer's states. Every solved flowsheet says which mode
  it ran in (`value.rangeMode`: `"lenient"` or `"strict"`), and the single-block requests (`solve_column`,
  `solve_membrane`, `solve_extraction`, `solve_evaporator`, `solve_crystallizer`, `size_drum`) carry the flowsheet's
  `extrapolations` and `rangeMode` in their value;

## The command line

Node.js 22 or newer. From a clone of the repository (`npm install` once):

```
node bin/chepta.mjs run examples/heater-flash.chepta.json      # solve a project's flowsheet
node bin/chepta.mjs capabilities                               # what can be calculated
node bin/chepta.mjs request request.json                       # any request; "-" reads standard input
```

From the npm package, once a release carries it: `npx -p chepta chepta run project.chepta.json` (the package's
command is `chepta`).

Options: `--time-ms N` (stop after N milliseconds; default 60000), `--compact` (one line), `--help`, `--version`. The
result JSON is printed on standard output. Ctrl+C cancels the run (outcome `cancelled`).

| Exit code | Outcome |
|---|---|
| 0 | `ok` |
| 2 | `invalid_input` (the request is wrong, or outside a record's range; `error.where` names the fields or blocks) |
| 3 | `missing_data` |
| 4 | `unsupported` (not built yet, or the method cannot represent the state) |
| 5 | `not_converged` |
| 6 | `cancelled` |
| 7 | `out_of_time` (`limits.time_ms` passed; the calculation was stopped) |
| 8 | `error` (a bug in CHEPTA: please report it with the request) |
| 1 | the command line itself: an unknown command or option, a file that cannot be read or is not JSON (message on standard error) |

### A short run summary (`--summary`)

A full flowsheet result can be very long: one saved CHEPTA-Lab result is 379,266 bytes (about 100,000 tokens when an
agent reads it). Its summary is 17,222 bytes (13,963 with `--compact`). **Agents should use `--summary` by default**,
and open the full file only to accept a result or to diagnose a failure (decision
[2026-11-27-02](../decisions/2026-11-27-02-cli-run-summary.md)).

```
node bin/chepta.mjs request request.json --summary                 # full result to request.result.json; summary on stdout
node bin/chepta.mjs run project.chepta.json --summary --out full.json
node bin/chepta.mjs summary saved-result.json [--input request.json]   # the summary of a result saved earlier
```

- With `--summary`, the full result is written to `--out FILE`, or by default next to the input as
  `<input>.result.json` (from standard input: `chepta-<input hash>.result.json`). The file is byte for byte what the
  command prints without `--summary` (`--compact` too). Only the summary goes to standard output. The exit code is the
  outcome's, as without it. Without `--summary` nothing changes.
- `chepta summary RESULT.json` makes the same summary from a saved result (exit code 0 when the summary is made).
  `--input FILE` names the input file in it. The engine's commit is known only when the run itself was made from a
  clone, so a summary of a saved result has `commit: null`.
- The summary changes no result: it only reads one (`src/api/summary.js`, `summarizeResult(result, options)`).

What the summary holds (`chepta_summary: 1`):

| Key | What |
|---|---|
| `which` | engine version (`library`), `commit` and `local_changes` when the CLI runs from a clone, capability, `input_hash`, `databank_hash`, method, components, run id, `input_file`, `full_result_file` |
| `outcome`, `status`, `elapsed_ms`, `limits` | how the run ended and how long it took |
| `timing` | `run.timing` totals, the 3 slowest blocks, each loop's passes and time, the design-specification evaluations |
| `error` | for a failure: code, message, where, and from its details the reason, the design specification, loop and tears, the bracket, the best or nearest point, the values at the bounds, `last_residual` and `iterations` of a loop; `left_out` names the details only in the full file |
| `design_specs` | each one: varied block, key, value, start and bounds; target asked and reached, residual, tolerance; met, method, solves, bracket |
| `loops` | each recycle loop: tears, iterations, `last_change`, tolerance |
| `balance` | the external balance: material (largest imbalance, kmol/h), energy (kW), the tolerance and limit, and the balance warnings |
| `columns` | each column's `converged`, iterations and specifications (asked, achieved, met) |
| `qualifications` | the result's qualifications in full, verbatim: parameter sets, missing and estimated pairs, every flowsheet- and block-level warning (with code and remedy) and note, two liquids, block methods |
| `range_warnings` | the range mode; the flowsheet-level range warnings verbatim; the per-stream warnings as their count, the number of distinct messages, and each distinct message once with the streams it applies to |
| `other_warnings` | any other warning found anywhere in the result (a loop's, a failure's details), verbatim, with its JSON path |
| `left_out` | JSON paths to what is only in the full file: streams, blocks (states, profiles), energy streams, per-block checks, column residuals, the timing |

A value the result does not hold stays missing (`null`, or the key is absent), never 0. The keys keep the engine's
units (`T_K`, `duty_kW`, `flow_kmol_h`). No warning is dropped or shortened: `test/cli-summary.test.js` checks that
every warning of the full result is in the summary, verbatim or in the de-duplicated list.

## The MCP server

`bin/chepta-mcp.mjs` is a local [Model Context Protocol](https://modelcontextprotocol.io) server: the assistant's
program (the "host") starts it on your computer and talks to it over standard input and output. Nothing is sent to
a server at a public address, and nothing is written: every tool is read-only.

**Protocol revisions (pinned).** Written against the specification as published on 2026-10-29:

- **2026-07-28** (the current revision): each request carries its version in `params._meta`;
  `server/discover`; results carry `resultType: "complete"`; an unsupported version is error -32022 listing the
  supported ones.
- **2025-11-25** and **2025-06-18**, through the `initialize` handshake, for hosts that still open with it (a
  "dual-era" server in the specification's terms).

A new revision is added by a pull request that reads its specification and extends `src/api/mcp.js` and
`test/mcp.test.js`.

**No SDK.** The server is about 200 lines of JavaScript without dependencies (`src/api/mcp.js`, `bin/chepta-mcp.mjs`).
The official SDK, `@modelcontextprotocol/sdk`, would bring a schema library and an HTTP stack that a stdio server does
not use, and CHEPTA has no runtime dependency today. Standard output carries only MCP messages; notes go to standard
error.

**Tools.** One per capability that is available; the ones listed as unsupported (`solve_column` until milestone M1's
shortcut) are not offered (the `capabilities` tool lists them, with where they are planned). Today:
`capabilities`, `find_component`, `component_info`, `check_project`, `flowsheet_status`, `solve_flowsheet`, `size_drum` (a flash drum's size, docs/models/sizing.md), `solve_column`, `solve_membrane` (the Membrane block, docs/models/membrane.md), `solve_extraction` (the Extraction block, docs/models/extraction.md), `solve_evaporator` (the Evaporator block, docs/models/evaporator.md), `solve_crystallizer` (the Crystallizer block, docs/models/crystallizer.md). A tool's
input schema is the capability's (a subset of JSON Schema 2020-12); its arguments are the request's `input`. Each
tool is marked read-only.

**Results.** The dispatcher's whole result is the tool's structured content; the text has a short summary (for
`solve_flowsheet`: the streams' flows, temperatures, pressures and vapour fractions, the balances, each pair's
parameter set and tier, the warnings, the number of notes) and the same JSON as text, for hosts that read only text.
An outcome other than `ok` is a tool execution error (`isError: true`) whose text is the dispatcher's message and its
`where`. An unknown tool is a protocol error (-32602).

**Time and cancellation.** Each call runs in a Node worker thread with a time limit of 60 s (`--time-ms N` to change
it); a call that the host cancels (`notifications/cancelled`) ends its worker, and nothing more is sent for it.

### Adding it to Claude Code

Until a release carries the server, from a clone of the repository (Node.js 22 or newer, `npm install` once):

```
claude mcp add --scope user chepta -- node /full/path/to/CHEPTA/bin/chepta-mcp.mjs
```

`--scope user` makes it available in every folder; without it, it is registered only for the folder where the
command was typed, and a `claude` started in another folder does not see it. `claude mcp list` should show
`chepta: ... Connected`. Then start a new `claude` session and type `/mcp`: `chepta` should be listed as connected, with
eight tools. On Windows, write the path with forward slashes: `"C:/Users/you/CHEPTA/bin/chepta-mcp.mjs"`.
`claude mcp add --scope project ...` writes the server into the folder's `.mcp.json` instead, to share it with
others who use the folder (Claude Code asks each of them to approve it once). `claude mcp remove chepta` removes it.

Once a release carries it, the clone is not needed:

```
claude mcp add --scope user chepta -- npx -y -p chepta@VERSION chepta-mcp
```

### Adding it to Claude Desktop

Settings, Developer, Edit Config opens `claude_desktop_config.json`; add the server and restart Claude Desktop:

```json
{
  "mcpServers": {
    "chepta": { "command": "node", "args": ["/full/path/to/CHEPTA/bin/chepta-mcp.mjs"] }
  }
}
```

(after a release: `"command": "npx", "args": ["-y", "-p", "chepta@VERSION", "chepta-mcp"]`). On Windows the path is
written with double backslashes.

## The worker (execution envelope)

A calculation runs in a separate thread, so that a time limit or a cancel can stop it: a timer cannot interrupt a loop
on the same thread, but the thread that waits can end the worker (`src/runtime/worker.js`).

- **Command line and MCP server:** a Node worker thread (`src/runtime/node-worker.js`). One idle worker is kept for
  the next request; a worker that was ended is never reused.
- **Browser and chat pages:** a Web Worker (`src/runtime/browser-worker.js`), made from the page's own copy of the
  library, since a chat artifact cannot load a second file: the script that defined `CHEPTA` is loaded again in the
  worker, by its address or, when it is written into the page, from its text. Where that cannot be done (no workers,
  a page whose security rules forbid them, the ES module build, Node), the request runs on the page's thread as
  before, and the result says so: `run.worker` is false and `run.note` gives the reason.
- **The workbench** solves its flowsheet in the worker: "Solving in the background… Stop" is shown meanwhile; a
  change to the flowsheet stops the older calculation, and its result, if it comes, is discarded (`resultGate`).

```js
const r = await CHEPTA.runAsync(request);                // in a worker where the page allows one
const { result, cancel, worker } = CHEPTA.startRun(request);
CHEPTA.workerStatus();                                   // { worker: true } or { worker: false, note }
CHEPTA.run(request);                                     // unchanged: synchronous, on the caller's thread
```

A run that the worker does not finish has the outcome `out_of_time` (error code `OUT_OF_TIME`), `cancelled`
(`CANCELLED`) or, when the worker itself failed, `error` (`WORKER_FAILED`); these codes belong to the runtime, not to
the engine.
An `out_of_time` result says where the flowsheet's recycle loops were when it was stopped (decision 2026-11-14-06,
CHEPTA-Lab EA-14): `error.details.progress` is the engine's last report, `{ kind: "flowsheet", loops: [{ blocks, tears,
iterations, residual, tolerance, converged, maxIterations, method, recent }] }` (`recent`: the last five residuals),
and the message says the same in words. The worker sends a report after every iteration of a loop
(src/util/progress.js).

## How it is tested

- `test/cli.test.js`: the command line on the saved example gives results identical to the library's (every number;
  only the run's id and times differ); notes survive; a missing-data request stays `missing_data` with no value; the
  exit codes, the time limit and the command line's own errors.
- `test/cli-summary.test.js`: `--summary` and `chepta summary` on a successful flowsheet with a design specification,
  failed ones (a loop's and a design specification's `NO_CONVERGENCE`, `OUT_OF_TIME`) and ones with many warnings;
  every warning of the full result is in the summary; the full file is byte for byte the result printed without
  `--summary`; a missing value stays missing.
- `test/mcp.test.js`: the server spawned as a host would: `initialize`, `tools/list`, `tools/call` (2025-11-25) and the
  same with per-request `_meta` and `server/discover` (2026-07-28); the same numbers as the library and the command
  line; missing data a tool error with no value; invalid input naming its field; version errors; the host's
  cancellation; a block's warnings (Unit v2) in the structured result and the summary.
- `test/worker.test.js`: the Node worker's result equals the dispatcher's; an endless loop in a worker is stopped by
  the time limit; a cancelled run's late result is discarded; the browser entry falls back in Node and says so.
- In Chromium (Playwright): the example in the workbench solved through the Web Worker (bundle inlined in the page,
  and loaded by address), saved and reopened with the same stream table; a 1 ms limit gives `out_of_time`, a cancel
  `cancelled`; a page whose security rules forbid workers solves on the page's thread and says so.

## The first assistant test

Proposal 0015, section 10: an assistant, through the MCP server in one host (Claude Code), changes a heater
specification in an existing project, checks the changed project, runs it and explains the difference.

**Procedure** (about five minutes), in a terminal **on your own computer**, with Claude Code installed there. Not in a
cloud session on claude.ai/code: there `/mcp` is not available, and a server added during a session is not loaded
into that session's conversation.


1. In a terminal, in a clone of the repository: `npm install`, then
   `claude mcp add --scope user chepta -- node "$PWD/bin/chepta-mcp.mjs"` (typed in the clone, so that `$PWD` is its
   folder), and `claude mcp list` shows `chepta: ... Connected`.
2. Start `claude` in the clone (a new session: a server added while a session runs is not in it) and type `/mcp`
   alone, without a name: `chepta` is listed as connected, with eight tools. Without `/mcp`, `claude mcp get chepta`
   in the terminal says "Connected".
3. Ask:

   > Use the chepta MCP server. In examples/heater-flash.chepta.json, propose a change of the heater E1's outlet
   > temperature from 355 K to 360 K. Do not edit the file: show the change as a proposal. Check the changed project
   > with check_project, then solve the original and the changed project with solve_flowsheet, and explain the
   > difference in the flash drum V1's products (flows, compositions, temperature, duty). Say which method and
   > parameter set CHEPTA used and any warnings or notes it reported.

4. Then ask, for the missing-data case:

   > Use the chepta MCP server. Benzene and glycerol with NRTL: a feed of 50 kmol/h of each at 300 K and 101.325 kPa
   > is heated to 350 K and goes to a flash drum at 101.325 kPa with no heat added. Build the flowsheet, solve it,
   > and give me the drum's vapour and liquid flows and compositions.

   (A result that needs the missing pair. The first version of this prompt sent the feed straight to a product,
   whose outlet is just the feed: a weak test, the maintainer, 2026-10-29.)

5. Compare with the command line: save the proposed project as `changed.chepta.json` and run
   `node bin/chepta.mjs run changed.chepta.json`.

**It passes when:**

- the numbers the assistant gives are those of the tool's result, and the command line gives the same for the saved
  input (identical: the same code on the same input; `test/cli.test.js` and `test/mcp.test.js` check it for the
  example);
- the benzene + glycerol case is reported with its warning that the NRTL pair was estimated from Modified UNIFAC 2.0
  (predicted, not data; two liquids predicted from an estimate), never as measured (before 2026-11-13 it was refused
  as missing data; with `solver.strictRanges` it still is);
- the method (NRTL, ideal-gas vapour), the parameter set (ethanol + water, `fitted-kamihama2012`, tier fitted) and any
  warnings or notes reach the answer;
- the change is shown as a proposal, and `examples/heater-flash.chepta.json` is unchanged until you apply it.

The result of the run made in this pull request is in
[docs/decisions/2026-10-29-03-cli-mcp-worker.md](../decisions/2026-10-29-03-cli-mcp-worker.md).
