# 2026-11-27-02: A short run summary from the command line

Branch `claude/cli-run-summary`, for release 0.6.3.

## What the maintainer decided (2026-11-27, through the coordinator)

An outside review found that one saved CHEPTA-Lab result is about 100,000 tokens when an agent reads it. A hand-made
summary of the same run was about 600 tokens and kept what the next person needs. The maintainer agreed: agents get a
summary first, and open the full result only when they need it. It changes no engine result.

## What was built

- `node bin/chepta.mjs run|request FILE --summary [--out FULL.json]`: the full result goes to `--out`, or next to the
  input as `<input>.result.json`; only a JSON summary goes to standard output. The file is byte for byte what the
  command prints without `--summary`. The exit code is the outcome's. Without `--summary` nothing changes.
- `node bin/chepta.mjs summary RESULT.json [--input FILE]`: the same summary from a saved result, so Lab can summarise
  its old runs.
- `src/api/summary.js` (`summarizeResult`): reads a result, writes nothing. What it keeps: docs/models/tools.md, "A
  short run summary". In short: which run, outcome and time, the three slowest blocks, the error with its reason and
  best point or last residual, design specifications, loops, the external balance, the qualifications in full
  (warnings, notes, sets), the flowsheet-level range warnings verbatim, the per-stream warnings counted and
  de-duplicated with their streams, any other warning with its JSON path, and JSON paths to what is left out.
- A missing value stays `null` or absent, never 0. The engine's unit-carrying key names are kept.
- Tests: `test/cli-summary.test.js` (a successful flowsheet, three failures, two cases with many warnings, the
  byte-for-byte check). No existing test or validation data changed.

## Measured

CHEPTA-Lab `cases/ethyl-acetate-piotrowski-2021/results-chepta-main-415da41/new-plant-ds-ethanol0.0004.output.json`
(Lab commit 8b8b64f): 379,266 bytes. Its summary: 17,222 bytes (13,963 with `--compact`), about 22 times smaller. All
35 warnings of the full result are in it. Of the summary, the block notes are 4,633 bytes and the range warnings
5,192 bytes: both are kept in full by the rule "every warning and qualification verbatim".

## Open

- Whether the block notes (method descriptions, for example "Rigorous column: 18 stages ...") should stay in the
  summary in full or move to `left_out`. Some notes carry a qualification (a parameter set used outside its data
  range), so they are kept for now.
