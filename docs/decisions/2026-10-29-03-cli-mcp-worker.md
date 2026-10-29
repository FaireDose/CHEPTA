# 2026-10-29-03: Proposal 0015, milestone M1, W8 with W9: the command line, the MCP server and the worker

Started by the maintainer on 2026-10-29, after M0 (docs/decisions/2026-10-29-02-m0-contracts.md). Written against
contracts v1 (ARCHITECTURE.md, "The request path and the contracts of proposal 0015"). Proposal 0015, answer 9:
Claude Code is the first MCP host.

## What was built

- **The command line** `bin/chepta.mjs` (`chepta` in package.json's `bin`): `run project.json`, `capabilities`,
  `request request.json`; the result JSON on standard output; exit code 0 for `ok`, 2 to 8 for the other outcomes,
  1 for the command line's own errors (docs/models/tools.md lists them).
- **The local MCP server** `bin/chepta-mcp.mjs` (`chepta-mcp`) with its protocol in `src/api/mcp.js`: one read-only
  tool per available capability (six today; `solve_column` is not offered while it is unsupported); the input schema
  is the capability's; the result is the dispatcher's result as structured content, with a short summary and the same
  JSON as text; any outcome other than `ok` is a tool execution error with the message and `where`.
- **Protocol revision, pinned:** the MCP specification read on 2026-10-29 (modelcontextprotocol.io): the current
  revision **2026-07-28** (per-request `_meta`, `server/discover`), and **2025-11-25 / 2025-06-18** through
  `initialize` for hosts that still open with it. **No SDK**: about 200 lines without dependencies, since the SDK would
  bring a schema library and an HTTP stack a stdio server does not use, and CHEPTA has no runtime dependency.
- **The worker** (`src/runtime/worker.js`, `node-worker.js`, `browser-worker.js`): a Node worker thread for the command
  line and the MCP server; a Web Worker for the workbench's flowsheet and the new `CHEPTA.runAsync` / `startRun` /
  `workerStatus`, made from the page's own script (by its address, or its text when it is written into the page, as in
  chat artifacts and the preview); where a page allows no worker, the page's thread, and the result says so
  (`run.worker: false`, `run.note`). `limits.time_ms` gives `out_of_time`, a cancel `cancelled`, a late result is
  discarded. `CHEPTA.run` is unchanged (synchronous).
- **The workbench** solves the flowsheet in the worker, shows "Solving in the background… Stop", and stops the older
  calculation when the flowsheet changes (`src/ui/flowsheet-view.js`).
- **One engine fix:** the flowsheet solver dropped a block's Unit v2 `profile`, `warnings` and `method`
  (`src/flowsheet/flowsheet.js`), so the request path's `qualifications.warnings` could never be filled; they now
  reach the result. No existing block returns them, so no existing result changes.
- docs/models/tools.md: the command line, the MCP server (how to add it to Claude Code and Claude Desktop), the
  worker, the tests and the first assistant test; the ai/ instructions and the skill say how an assistant with the
  tools uses them.

## How it was checked

- `npm test`: all tests pass, with the new `test/cli.test.js`, `test/mcp.test.js` and `test/worker.test.js`: the
  example project gives **identical** results through the library, the command line and the MCP server (every number;
  only the run's id and times differ); a missing-data request stays `missing_data` with no value through every path;
  notes and the reproduction block survive; a block's warnings reach the MCP result and summary; an endless loop in a
  worker is stopped by the time limit; cancellation and the late result; `initialize` / `tools/list` / `tools/call`,
  and the same with per-request `_meta` and `server/discover`.
- In Chromium (Playwright): the example in the workbench solved through the Web Worker, with the bundle written into
  the page (as in a chat artifact) and loaded by its address; the stream table shows the drum at 81.85 °C; saved and
  reopened, the same stream table; `runAsync` with a 1 ms limit gives `out_of_time`, a cancel `cancelled`; a page whose
  security rules forbid workers solves on the page's thread and says so. No page errors.

## The first assistant test, run in this session

Claude Code 2.1.312, in this cloud container, with the server added by `claude mcp add` (procedure and pass criteria
in docs/models/tools.md).

1. **Heater change** (355 K → 360 K): the assistant read the file, showed the change as a diff "not applied", ran
   `check_project` (no problems) and `solve_flowsheet` on both versions, and explained the difference: the drum's
   vapour fraction from 0.479 to 0.921, vapour 47.90 → 92.13 kmol/h with y(ethanol) 0.5642 → 0.4269, liquid
   52.10 → 7.87 kmol/h with x(ethanol) 0.2490 → 0.0851, heater duty 678.1 → 1181.2 kW; the method (NRTL, ideal-gas
   vapour), the pair's set `fitted-kamihama2012` (tier fitted) with its source as the result gives it, "no warnings
   or notes", the hashes, and "converged model results, not validated against data". The changed project run through
   the command line gives the same result as the MCP call, identical (input hash 26665ef0a3041fac). The file was not
   changed. **Passes.**
2. **Missing data** (benzene + glycerol, NRTL): the tool answered `missing_data`; the assistant said it could not
   give a composition and invented no value, and offered the user's own parameters as the way forward. **Passes.**
   Two findings for W8's next step (the authoring contract), not fixed here:
   - its flowsheet carried `thermo: { method: "NRTL" }` and feed keys `T`, `P`, `flows`: the unknown `thermo` key is
     ignored without a word (the wrong spec keys are reported as missing specifications, which is right but does not
     name the unknown keys);
   - the engine's missing-pair message says "Pass allowMissingPairs: true ... or add parameters to
     data/binaries.json", remedies that a request cannot use; the assistant passed the first on as an option.

## To check

- Run the first assistant test on your computer, as docs/models/tools.md says, and tell whether it passes for you.
- Whether the exit codes and the summary text read well before other assistants use them.
- Nothing numerical is new: every number comes from the existing flowsheet engine.
