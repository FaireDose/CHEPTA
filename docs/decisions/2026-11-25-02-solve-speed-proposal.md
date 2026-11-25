# 2026-11-25-02: proposal 0027, faster flowsheet and design-specification runs

## The question (CHEPTA-Lab's priority 1 for release 0.6.3, relayed by the coordinating session on 2026-11-20)

Lab's ethyl acetate plant (Piotrowski and Kubica 2021) with one design specification took 108 minutes for 8 solves on
main 415da41; the 99.90 % ester specification ran out of time after 3 hours without saying where (Lab's request 18).
Target: that design-specification run under 10 minutes.

## What was found (measured 2026-11-20)

- One pass of the plant's recycle loop takes 67-74 s; 99.7 % of it is the three rigorous columns (SCDS15 47-52 s,
  SCDS11 16-17 s, SCDS5 3 s). 74 % of all the time is the columns' cold start (bubble points with a second-liquid test
  on every stage).
- Every pass and every design-specification evaluation starts every column cold: the flowsheet's column never passes a
  start to the stage solver. At an ethanol feed of 6,506 kg/h one solve takes 14 passes and 1,023 s.
- A local prototype that restarts each column from its own last answer: the same 14 passes, 435 s, the same answer
  (largest stream difference 1.8e-7 of its flow). What remains is SCDS15's purity search, which on some passes still
  needs its cold search (Newton from the last answer stalls on that column).
- The two-liquid stage retried every split from a stage's old K-values before its stability test; forgetting them when
  that fails halves a VLL column's time with the same answer (SCDS15: 51 s to 22 s, products equal to 1e-11). With both
  changes Lab's design-specification run took 966 s (16 min) instead of 108 min, the same F1 within its tolerance.
- SCDS15 on "VL" would be faster but a second liquid forms on its stage 1 at F1 = 6,503.5 kg/h: "VLL" is needed.

## Proposed (proposals/0027-solve-speed.md)

(a) each rigorous column restarted from its last answer in the next loop pass and design-specification evaluation, with
the cold path of today as the fallback, `solver.columnRestart` "previous" (default) or "cold", following Aspen Plus
("use any available previous results as an initial guess", reinitialize per block) and DWSIM
(`AutoUpdateInitialEstimates`); (b) `result.timing` per block, pass and evaluation; (c) `solver.timeLimit_s`, stopping
with `OUT_OF_TIME` that names the block, the pass, the design-specification evaluation, its varied value and the best
point (request 18); (e1) the old K-values forgotten after a failed split; (d) simultaneous tears and specifications
and (e2) cheaper properties in the columns only later, (e2) next to reach 10 minutes.

## Waiting for the maintainer

The seven open questions of the proposal, each with a recommendation: (1) restart on by default; (2) no profiles in the
project file (later an explicit start profile if needed); (3) `solver.timeLimit_s` beside `limits.time_ms`; (4) the best
point in `error.details.best`, no partial answer; (5) timing in every result, outside `reproduction`; (6) (e1) in the
same build; (7) the 10 minutes: (e2) as its own proposal next (the last factor of about 1.6), not (d).
