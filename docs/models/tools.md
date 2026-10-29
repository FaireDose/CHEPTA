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
`capabilities`, `find_component`, `component_info`, `check_project`, `flowsheet_status`, `solve_flowsheet`. A tool's
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
claude mcp add chepta -- node /full/path/to/CHEPTA/bin/chepta-mcp.mjs
```

Then start `claude` in the folder of your project and type `/mcp`: `chepta` should be listed as connected, with six
tools. `claude mcp add --scope project ...` writes the server into the folder's `.mcp.json` instead, to share it with
others who use the folder (Claude Code asks each of them to approve it once). `claude mcp remove chepta` removes it.

Once a release carries it, the clone is not needed:

```
claude mcp add chepta -- npx -y -p chepta@VERSION chepta-mcp
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

## How it is tested

- `test/cli.test.js`: the command line on the saved example gives results identical to the library's (every number;
  only the run's id and times differ); notes survive; a missing-data request stays `missing_data` with no value; the
  exit codes, the time limit and the command line's own errors.
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
   `claude mcp add chepta -- node "$PWD/bin/chepta-mcp.mjs"`.
2. Start `claude` in the clone (a new session: a server added while a session runs is not in it) and type `/mcp`
   alone, without a name: `chepta` is listed as connected, with six tools. Without `/mcp`, `claude mcp get chepta`
   in the terminal says "Connected".
3. Ask:

   > Use the chepta MCP server. In examples/heater-flash.chepta.json, propose a change of the heater E1's outlet
   > temperature from 355 K to 360 K. Do not edit the file: show the change as a proposal. Check the changed project
   > with check_project, then solve the original and the changed project with solve_flowsheet, and explain the
   > difference in the flash drum V1's products (flows, compositions, temperature, duty). Say which method and
   > parameter set CHEPTA used and any warnings or notes it reported.

4. Then ask, for the missing-data case:

   > Use the chepta MCP server. Solve this flowsheet with solve_flowsheet and give me the outlet composition:
   > components benzene and glycerol, NRTL; a feed F1 of 50 kmol/h benzene and 50 kmol/h glycerol at 300 K and
   > 101.325 kPa, going straight to a product P1 (stream S1 from F1.out to P1.in).

5. Compare with the command line: save the proposed project as `changed.chepta.json` and run
   `node bin/chepta.mjs run changed.chepta.json`.

**It passes when:**

- the numbers the assistant gives are those of the tool's result, and the command line gives the same for the saved
  input (identical: the same code on the same input; `test/cli.test.js` and `test/mcp.test.js` check it for the
  example);
- the benzene + glycerol case is reported as missing data (no NRTL pair), with no composition or value invented;
- the method (NRTL, ideal-gas vapour), the parameter set (ethanol + water, `fitted-kamihama2012`, tier fitted) and any
  warnings or notes reach the answer;
- the change is shown as a proposal, and `examples/heater-flash.chepta.json` is unchanged until you apply it.

The result of the run made in this pull request is in
[docs/decisions/2026-10-29-03-cli-mcp-worker.md](../decisions/2026-10-29-03-cli-mcp-worker.md).
