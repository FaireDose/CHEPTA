# 2026-11-25-03: proposal 0027 built: columns restarted, timing, a time limit, the two-liquid stage's old K-values

## What was decided before (docs/decisions/2026-11-25-02-solve-speed-proposal.md)

The maintainer accepted the seven recommended answers of proposal 0027 (2026-11-25, "for 267, i agree with all"):
restarts on by default (`solver.columnRestart` "previous", "cold" for 0.6.2's path); no profiles in the project file;
`solver.timeLimit_s` with progress (Lab's request 18); no partial answer, the best point in `error.details.best`; timing in
every result; (e1) in the same build; (e2) as its own proposal afterwards.

## What was built

- **(a) Columns restarted** (`src/flowsheet/flowsheet.js`, `src/units/units.js`, `src/units/columns/column.js`,
  `engine.js`, `specifications.js`). After a rigorous column converges in a flowsheet, its stages' flows and
  temperatures (and the free variables its design specifications found) are kept with the block's id for the run; the
  next calculation of that block (the next loop pass, the Jacobian passes, the next design-specification solve) starts
  Newton from them, stopped early (the residual not down tenfold in 4 iterations), then the column's cold path,
  unchanged. A column on design specifications first searches from the last answer's free variables; where that
  search fails, its whole search runs as without a restart. In a design specification the kept answers carry over
  from solve to solve, and are dropped for the retry from the document's own start. `solver.columnRestart: "cold"`
  gives 0.6.2's path. The kept answer is not part of the result (not enumerable).
- **(e1)** `src/units/columns/two-liquids.js`, `splitOf`: a liquid that no longer splits from a stage's old K-values
  forgets them, so the next call goes to the stability test at once. No answer changes (the stability test decides as
  before).
- **(b) Timing**: per block (calculations, seconds), per pass of each loop (seconds, slowest block, Jacobian passes) and
  per design-specification solve (the varied value, the passes, the seconds, the outcome). `result.timing` from the
  library (not enumerable, so an answer compared or saved stays the same; three existing tests compare two runs'
  answers for identity), `run.timing` in a request's result (beside `elapsed_ms`; outside `value` and
  `reproduction`); the workbench's flowsheet summary shows "Solve time" with the slowest blocks.
- **(c) `solver.timeLimit_s`**: checked before every block, between a column's Newton iterations and before each trial
  column of its specification search; once passed it stays passed, and a block that fails after that point is reported
  as `OUT_OF_TIME` (a column's own error handling may catch a check). The message names the block, the loop and its
  iteration with the last change, and in a design specification the solve, the varied value, the bracket and the best
  point so far, then where the time went (the three slowest blocks). `error.details`: `timing`, `where`, `at`,
  `bracket`, `best`, `trail`. No partial answer. `OUT_OF_TIME` is a runtime code (`RUNTIME_CODES`, beside the engine's
  `ERROR_CODES`, which a test pins); the request's outcome is "out_of_time".
- **Request 18 for `limits.time_ms`**: the design-specification solver sets a progress context (solve, varied value,
  bracket, best point) that goes with every progress report, and the worker's `OUT_OF_TIME` message says it
  (`progressText`).

## Tests

`test/solve-speed.test.js` (8 tests): the same streams with "previous" and "cold" (within 1e-6 of each stream's flow at
a recycle tolerance of 1e-9), a column on a purity restarted with fewer column solves and the same answer, the timing
per block and pass and per design-specification solve, the design specification's answer the same both ways, the time
limit in a design specification and in a loop, the checks of the two keys, the worker's text. No existing test was
changed; `npm test` passes.

## Benchmark on CHEPTA-Lab's ethyl acetate plant (same container, `node bin/chepta.mjs request`)

Main dd31c2e with this build, one process each, two runs side by side on 4 cores; Lab's numbers from
`results-chepta-main-415da41` (between 415da41 and dd31c2e only src/data/LICENSES.md, known-issues.json and sources.json changed: no engine code). Simulated values throughout.

| Run | Main (Lab's run) | This build | Answer |
|---|---|---|---|
| `new-plant-ds-ethanol0.0004` (the ethanol feed varied for 0.04 % ethanol in the product) | 108 min (6,498 s), 8 solves | **14.9 min (894 s)**, 7 solves | F1 6,506.2314 (main) and 6,506.2318 kg/h (here), ethanol 0.040088 and 0.040020 %, both within the target's 1e-5; ester 99.473 and 99.474 mass %; largest stream difference 2.2e-4 of its flow |
| `plant62-R-bottoms-col5-14stages` (Lab's request 8: column 5 with 14 stages) | `NO_CONVERGENCE` in SCDS5 at loop iteration 5, 327 s | **converged**, 46 iterations (3 safeguard actions), 624 s, last change 8.1e-11 (tolerance 1e-8), no balance warning | product 16: 99.931 mass % ester, 0.056 % water; wastewater 25: 99.949 % water |

Where the time of the design-specification run went (`run.timing`): SCDS15 726 s, SCDS11 108 s, SCDS5 48 s, the other
21 blocks 12 s, over 115 calculations of each block; the 7 solves took 37, 1, 60, 84, 201, 274 and 238 s (1, 1, 7,
7, 12, 14 and 13 passes). So 81 % of the time is SCDS15 (18 stages, VLL, on a bottoms purity), whose specification
search still falls back to its cold search on some passes: that is (e2). In the 14-stage run, SCDS5 took 358 s and
SCDS11 222 s of the 624 s.

**Not reached: the 10 minutes.** 14.9 minutes, from 108; (e2) next (the maintainer's answer 7).

## Open

- (e2), cheaper properties inside the columns, as its own proposal (the maintainer's answer 7).
