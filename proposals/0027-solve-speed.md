# 0027: Faster flowsheet and design-specification runs: columns restarted from their last answer, timing, a time limit

- **Status:** Accepted (the maintainer, 2026-11-25: "for 267, i agree with all": the seven recommended answers);
  step 2 (a, b, c and e1) to build; see docs/decisions/2026-11-25-02-solve-speed-proposal.md
- **Author(s):** drafted by a coding agent for CHEPTA-Lab's priority 1 for release 0.6.3 (speed) and its request 18
  (an `OUT_OF_TIME` in a design specification must say where it was)
- **Discussion:** the pull request that adds this file
- **Roadmap item:** A8, the flowsheet solver (recycles and design specifications; [proposal 0022](0022-design-specification.md))

## Problem

CHEPTA-Lab's ethyl acetate plant (Piotrowski and Kubica 2021, Processes 9, 1425, CC BY 4.0; Lab's case
`cases/ethyl-acetate-piotrowski-2021`, run on CHEPTA main 415da41) is one flowsheet with five recycles and three
rigorous columns. With one design specification (the ethanol feed varied to hold 0.04 % ethanol in the product) it took
**108 minutes for 8 solves**; the 99.90 % ester specification **ran out of time after 3 hours**, and the message did not
say in which solve or at which value of the varied input (Lab's request 18). An engineer cannot work like that. The
target for 0.6.3: this design-specification run under 10 minutes.

### Where the time goes (measured 2026-11-20, one thread, this container)

One solve of Lab's settled plant (`new-plant-ds-ethanol0.0004` without its design specification), timed per block and
profiled with Node's CPU profiler:

| What | Time |
|---|---|
| one pass through the recycle loop (24 blocks) | 67-74 s |
| column SCDS15 (18 stages, VLL, on a bottoms purity of 99.99 % water): its purity search, 10 column solves, 29 Newton iterations | 47-52 s |
| column SCDS11 (35 stages, VLL, two liquids on 32 stages): the bubble-point start fails after 4 iterations (12 s), the continuation solves it (4 s) | 16-17 s |
| column SCDS5 (8-stage absorber, VLL) | 2.5-3.4 s |
| the other 21 blocks together | 0.2 s |

Inside the columns: **74 % of all the time is the columns' cold start** (the bubble-point start of Wang and Henke, in
which every stage's bubble point is found with a test for a second liquid and a liquid-liquid split); 48 % of the time
is spent in UNIQUAC's activity coefficients, called by those splits. The Newton iterations themselves are 17 %.

**Every pass and every design-specification evaluation starts every column cold.** The flowsheet's column block never
passes a start to the stage solver (`src/units/columns/column.js`, the `solveCascade` call), although the stage solver
accepts one (`opts.start`, used today only inside one column's own specification search). The design specification
warm-starts the tear streams only (`src/flowsheet/design-specs.js`, `warmGuesses`). So each pass repeats the same 70 s
of starts: at an ethanol feed of 6,506 kg/h one solve takes **14 passes and 1,023 s** (17 minutes), of which about
950 s are column starts that end where the column was the pass before.

## Proposal

### (a) Each column restarted from its own last answer

1. **What is kept.** After a rigorous column converges in a flowsheet, its profile (every stage's component flows of
   liquid and vapour, temperature, and the reflux split of a vapour + liquid condenser) and, for a column on design
   specifications, the free variables found (the distillate flow, the reflux or boil-up ratio, a side-draw rate) are
   kept with the block's id, for the rest of the run.
2. **When it is used.** The next time the same block is calculated in the same run (the next pass of its recycle loop,
   the Jacobian passes of the recycle solver, the next evaluation of a design specification), the stage solver starts
   from that profile. A profile that does not fit (another number of stages, another set of components) is ignored.
3. **Falling back.** Newton's method from the last answer, stopped early when it is not converging (the residual not
   down tenfold in 4 iterations), as the column's own specification search already does for its trial columns. If it
   fails, the column is solved **exactly as today** (the same cold starts, continuation and last attempts, in the same
   order). A column on design specifications starts its search from the last answer's free variables (the distillate
   flow found then, not the estimate from the material balance), its first column from the last answer's profile; its
   trial columns are started as today (from their neighbour, else cold), and if that search fails the search of today
   runs. A column that converged before therefore still converges, by the same path at worst.
4. **Design specifications.** The kept profiles carry over from one evaluation to the next, like the tear streams.
   When an evaluation fails from the warm start and is retried from the document's own start (as today), the kept
   profiles are dropped too, so that retry is the cold solve of today.
5. **A switch.** `solver.columnRestart`: `"previous"` (the default) or `"cold"` (every column started cold each time,
   as in 0.6.2). The column's `state.solver.start` already says "previous solution" when it was used, and
   `state.solver.tried` lists each attempt with its time.
6. **The project file.** The kept profiles are not written to the project file or the request (see the open
   questions): an answer stays a function of the document alone, and a file stays small.

**What other simulators do** (read 2026-11-20):

- Aspen Plus: "By default, iterative calculations in Aspen Plus use any available previous results as an initial
  guess"; reinitialization is requested when "a block has multiple solutions and you can obtain the one you want only
  by starting from your own initial estimate" or "a block or flowsheet fails to converge for no apparent reason, after
  one or more successful passes"; it can be set globally (Setup, "Use Results from Previous Convergence Pass") or per
  block (Block Options). Aspen Plus 10 User Guide, volume 1, chapter 5, "Reinitializing Calculations", pp. 5-11 and
  5-12 (AspenTech 2000; a copy on a course page of the University of Maryland,
  https://terpconnect.umd.edu/~nsw/chbe446/AspenPlusV10UserGuide1.pdf). CHEPTA's default and switch follow this.
- DWSIM: its rigorous column has `AutoUpdateInitialEstimates` (default off): after a converged solve the stage
  temperatures, liquid and vapour flows and compositions become the column's initial estimates for the next solve, and
  the last solution is kept (`LastSolution`); the column's results (stage temperatures, liquid and vapour flows) are
  written into the flowsheet file with it (`SaveData`). DWSIM source,
  `DWSIM.UnitOperations/UnitOperations/RigorousColumn.vb` (GPL v3), commit 1abf72d, lines 1954, 2159-2195 and
  4987-5034.
  CHEPTA keeps them for the run only (open question 2).

### (b) Timing in the result

`result.timing` (seconds, wall clock): the whole solve; per block, the number of calculations and their total; per
recycle loop, each pass with its time and its slowest block; per design-specification evaluation, the varied
values, the passes, the time and the outcome. A column's `state.solver.tried` already gives each start's time. The
timing is not part of the answer: it changes from run to run and machine to machine, so it is left out of
`reproduction` and of every comparison of results.

### (c) A time limit with progress: `solver.timeLimit_s`

- The flowsheet solver checks the clock between blocks, and the column between its Newton iterations and attempts.
  When `solver.timeLimit_s` has passed it stops with `OUT_OF_TIME` and says **where the time went** (the timing of (b)
  so far) and **where it was**: the block it was calculating, the loop's pass and its last changes (as today), and in
  a design specification the evaluation's number, the varied value(s), the bracket so far and the best point (the
  varied value and the target reached closest to the value asked). This is Lab's request 18.
- No partial answer is returned (proposal 0022, section 3): the best point is in `error.details.best`, so that it can
  be given as the next run's `vary.guess`.
- The design-specification solver also sends its progress reports (as the recycle loop does since request 14), so that
  the request's own `limits.time_ms`, which ends the worker from outside, says the same in its `OUT_OF_TIME` message.

### (d) and (e): only if (a)-(c) are not enough

- (d) Tear streams and design specifications solved together (one Broyden or Newton iteration on both, as Aspen
  Plus's simultaneous convergence of tears and specifications): saves the inner convergence of every evaluation, but
  changes the solver's structure, which the maintainer decided on 2026-11-13 (an outer loop). Not proposed now.
- (e1) The two-liquid stage forgets a stage's old K-values when a split from them fails (above): no change of model
  or answer, a factor of about 2 on VLL columns; proposed for step 2 with (a)-(c).
- (e2) Cheaper properties inside the columns, later, each with its own tests: a stability result kept per stage while
  its composition and temperature barely move; UNIQUAC's activity coefficients evaluated once per composition and
  temperature where the same values are asked several times; the pure-liquid enthalpy of water from IAPWS-IF97 kept per
  temperature. These touch the thermodynamics (`src/thermo/`), where another change is under way: a proposal of their
  own.

## What (a) does on Lab's plant (a local prototype, not part of this pull request)

Built and run on 415da41 to check the design before proposing it:

| Run | 0.6.2 path (cold columns) | Columns restarted |
|---|---|---|
| one solve at F1 = 6,506 kg/h from the settled tear streams | 14 passes, 1,023 s | 14 passes, 435 s |
| product ester (mass fraction) | 0.99498 | 0.99498 |
| largest difference in any stream, relative to its flow | | 1.8e-7 (tear tolerance 1e-5) |
| SCDS5 per pass after the first | 2.2-3.0 s | 0.1-0.3 s |
| SCDS11 per pass after the first | 16-20 s | 0.2-0.6 s |
| SCDS15 per pass after the first | 47-79 s | 0.7-95 s |

SCDS15 is what remains: on some passes Newton from a nearby answer stalls on this column (the residual falls by less
than 1 % in 4 iterations), so trial columns of its purity search fall back to the cold start, which costs as much as
today. A variant that kept the trial columns to restarts only, and ran today's whole search where that failed, was
slower (558 s): it fell back more often.

SCDS15 holds one liquid on every stage at this point but is given `phases: "VLL"`, so every property call looks for a
second liquid on every stage. With `phases: "VL"` for SCDS15 the same solve takes 96 s, but the design specification
then stops at F1 = 6,503.5 kg/h, where a second liquid forms on SCDS15's stage 1: "VLL" is needed over Lab's range, so
it is the two-liquid stage that must get cheaper.

**(e1), found while profiling: a failed split is not retried from its old K-values.** The two-liquid stage
(`src/units/columns/two-liquids.js`, `splitOf`) keeps each stage's last liquid-liquid split and starts the next
split of that stage from it. Once a stage (or the bubble-point search, which shares one key for every stage) has split
once, every later call first runs a full successive substitution from those K-values, even where the liquid is now
one liquid, and only then the stability test. Forgetting the old K-values when that substitution fails changes no
answer (the stability test decides, as before) and halves the time: SCDS15 alone 51 s to 22 s cold, the same 6
iterations, products equal to 1e-11 kmol/h.

| Lab's run, the same machine | Time | Answer |
|---|---|---|
| main 415da41, as Lab ran it (`new-plant-ds-ethanol0.0004`, 8 solves) | 108 min (6,498 s) | F1 6,506.2314 kg/h, ethanol 0.040088 %, ester 99.473 % |
| one solve at F1 6,506, cold columns (today) | 1,023 s, 14 passes | ester 99.498 % |
| the same, (a) | 435 s | the same, 1.8e-7 |
| the same, (a) and (e1) | 213 s | the same, 1.8e-7 |
| the whole design-specification run, (a) and (e1) (7 solves) | **966 s (16 min)** | F1 6,506.2318 kg/h, ethanol 0.040020 %, ester 99.474 %; largest stream difference from Lab's answer 2.2e-4 of its flow (both within the specification's 1e-5) |

So (a) and (e1) give a factor of about 6.7 on Lab's run: 16 minutes, not yet 10. What remains is the cold bubble-point
start of SCDS15's trial columns when Newton from a nearby answer stalls: 59 % of SCDS15's time is the stability test
of stages that hold one liquid, 47 % (self time) UNIQUAC's activity coefficients, 15 % pure-liquid enthalpies of water
through IAPWS-IF97. Those are (e2), below.

## Engineering basis

No new equations: the same MESH equations, the same tolerances and the same convergence tests. A restarted column is
accepted only when every group of residuals is within the column's tolerance, as a cold-started one. The one thing a
restart can change is which solution is found where a column has several steady states; Aspen Plus documents the same
(reinitialize when a block has several solutions). The tests:

- every existing test passes unchanged (AGENTS.md rule 6); the flowsheet suite's numbers stay within their tolerances;
- a new test: a recycle loop with a rigorous column gives the same streams with `columnRestart` "previous" and "cold"
  (within the tear tolerance), and the second pass's column reports "previous solution";
- a design specification around a column on a purity: the same answer both ways, fewer column iterations restarted;
- a time limit hit inside a design specification: `OUT_OF_TIME` naming the evaluation, the varied value and the best
  point; a time limit hit inside a column: naming the block;
- Lab's plant (opt-in, as Lab's other plant tests): `new-plant-ds-ethanol0.0004` before and after, the timing compared
  and the answer equal within the specification's tolerance.

## Effect on existing work

- Results of existing flowsheets: the same within the tear and column tolerances (the prototype: 1.8e-7 of a stream's
  flow). A flowsheet whose column has two steady states could land on the other one; `columnRestart: "cold"` gives
  0.6.2's path back.
- New optional keys `solver.columnRestart` and `solver.timeLimit_s`; a new `timing` block in the result; nothing
  removed. Old documents and project files work unchanged (no new project format is needed: the keys live in
  `solver`, which the project file already carries).
- Inside: `runUnit` passes a block its own last answer (a `restart` object) and a block may return one; only the
  rigorous column uses it for now.

## Alternatives considered

- **Restart the column only inside a design specification**, not in the recycle passes: the passes are where most of
  the time is (14 passes per solve), so no.
- **Keep the column's last answer in the project file** (DWSIM keeps its estimates with the column): makes a run
  depend on what ran before it, and a file large (35 stages x 4 components x 3 numbers per column). Proposed instead as a
  possible later step: an explicit start profile a person gives to a column, like a tear stream's guess (open
  question 2).
- **A faster cold start** (fewer bubble-point sweeps): helps the first pass only.
- **(d) and (e)** above: later, if needed.

## Open questions for the maintainer (with the recommendation; all seven accepted on 2026-11-25)

1. **Default on?** Recommended: yes, `columnRestart: "previous"` by default (as Aspen Plus), with `"cold"` to get
   0.6.2's path.
2. **Saved profiles in the project file?** Recommended: no, not automatically. Later, if Lab needs it: an explicit
   `start` profile on a column block, given by the person (from a previous result), as tear-stream guesses are given.
3. **Time limit: where?** Recommended: `solver.timeLimit_s` in the flowsheet's `solver` (the engine stops itself, with
   the details above), beside the request's `limits.time_ms` (the worker ended from outside), both reporting the same
   progress.
4. **The best point on `OUT_OF_TIME`:** recommended: in `error.details.best` (the varied values and the target reached),
   no partial answer, as proposal 0022 decided.
5. **Timing in every result?** Recommended: yes, always (it costs nothing), outside `reproduction`.
6. **(e1) in step 2?** Recommended: yes (no answer changes; a factor of about 2 on VLL columns).
7. **The 10-minute target:** (a) and (e1) reach 16 minutes on Lab's run. Recommended: build (a)-(c) and (e1) now (step
   2), then (e2) as its own proposal, not (d).

## Steps

1. This proposal (the pull request that adds this file).
2. One pull request with (a), (b), (c) and (e1): the engine (`src/flowsheet/flowsheet.js`, `design-specs.js`,
   `src/units/units.js`, `src/units/columns/`), the request schema, the tests above, the benchmark on Lab's plant in the
   decision file, and the workbench showing the timing in the results.
3. (e2) as its own proposal, to reach the 10 minutes.
