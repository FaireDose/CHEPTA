# 2026-11-14-05: Column fixes from CHEPTA-Lab's requests on 0.6.2

CHEPTA-Lab closed two whole plants on chepta 0.6.2 (ethyl acetate, Piotrowski et al. 2021; methanol from CO2, Campos
et al. 2022) and filed column requests. The maintainer approved working on them on 2026-11-14, in Lab's priority order.
Evidence: CHEPTA-Lab `cases/ethyl-acetate-piotrowski-2021/README.md` ("Capability requests" sections,
`results-chepta-0.6.2/`, commit 072aea3) and, on branch `claude/lab-methanol-campos-run` (PR #22, commit 22ec102),
`cases/methanol-co2-campos-2022/CAPABILITY_REQUESTS.md`. The inputs that showed each fault are copied unchanged into
`validation/data/columns/lab-requests-0.6.2/` and run by `test/columns-lab-requests.test.js`.

## What was found and done

| Request | Cause found | Change |
|---|---|---|
| EA-12 = M3: a column's Newton stops at 12 iterations whatever `max_iterations` says | The cold starts' Newton gives up when the residual has not fallen a thousandfold in 12 iterations (`PATIENCE`), to hand over to the next start or to the continuation. `max_iterations` only lowered the attempts' limits (`min(50, cap)`), never raised them, and a given limit also turned the continuation off. On Lab's column 5 Newton sits on a plateau of the residual for 30-40 iterations and then converges quadratically (46-53 iterations), which the 12 cut off. | A given `max_iterations` is each attempt's budget: the attempt runs to it, without the early stop; the continuation runs with it too (each of its steps capped). Without `max_iterations`, before giving up, Newton is resumed from where each cold start stopped, to 100 iterations in all (`LONG_NEWTON`, this project's choice), without the early stop: a column that converged before converges exactly as before (the extra attempt runs only after every other has failed). |
| EA-13 = M2: a purity refused `OUT_OF_RANGE` although inside the range CHEPTA reports | The scan of the one free variable bracketed the value (solved columns on both sides of it), but the secant search inside the bracket could not solve its trial columns and gave up; the refusal then took the scan's range as proof that the value was out of range. "1" in "between 0.943249 and 1" was 0.9999999985 rounded. | The trial columns inside a bracket are reached from the nearer end by halfway steps, as in the scan. A value inside the range the solved columns reach is never `OUT_OF_RANGE`: it is `NO_CONVERGENCE`, naming the crossing ("it is crossed between ... and ..."), "not a statement that the specification cannot be met", with what may help. A reached fraction that would print as 1 is printed as "1 - 1.5e-09". |
| EA-9 = M1 (CO, N2): ppm of a light gas stop a column at the PR bubble point before any iteration | The start computes each stage's bubble temperature. With Peng-Robinson (k_ij = 0 for CO with methanol and water) the K-value of CO grows as the temperature falls, so Σ K x stays above 1 at every temperature for 10 ppm CO: the model has no bubble point for that liquid at 100 kPa. | For the start only, a stage's bubble point that is not found is taken without the components below 0.1 mol % of its liquid (`TRACE`); Newton then solves the column with them. Lab's methanol column now converges in 6 iterations with either condenser, CO, N2 and CO2 all leaving in the distillate. |
| EA-9 (acetic acid): 0.001-0.01 mass % acid stops column 11 near the paper's product flow | Not a scaling problem of the trace: the residuals are scaled by the total feed, and rescaling the trace's Jacobian columns or equilibrating the rows changed nothing (tried, not kept). Column 11 converges only through the continuation, also without acid; with acid, the continuation stops at 91 % because the two-liquid region grows down the column one stage at a time as the volatilities come back (stages 1-4, then 5, then 6), and Newton stalls each time a stage crosses the edge of the two-liquid region: the whole-liquid K-values of `two-liquids.js` have a kink there. | **Not fixed.** It needs a change to the two-liquid stage formulation (a smooth crossing of the binodal, or a three-phase stage with both liquids as variables). That is a model change: a proposal first (AGENTS.md). |
| EA-8 message: the column advises turning on two liquids although `phases` is `"VLL"` | The hint tested the one-liquid stability of the last iterate whatever the phases. | With `"VLL"` the hint says that two liquids are allowed and which stages held two on the last iterate. |
| (found on the way) column 5 at a reflux of 70,000 kg/h: "Three-phase flash ... did not converge" | The column had converged; the P-H flash that builds its product stream failed on a trial temperature. | An absorber's or stripper's product whose P-H flash fails is flashed at its stage temperature and kept only if its enthalpy flow agrees with the column's within 1e-6 (`byEnthalpy`, column.js). |
| (found on the way) the closed ethyl acetate plant: "Liquid-liquid split at 343.83 K ... did not converge" | Broyden's accelerated guess of a tear stream sat next to a plait point, where its T-P flash failed. | That tear takes the computed stream for the iteration (a step of direct substitution), and the guess vector follows it (flowsheet.js, five lines; the other worker's specifications are not touched). |
| M4: the minimum-approach exchanger refuses counterflow and calls it "crossflow" | The duty was searched on 10 zones and checked on the default 20, which found a tighter internal pinch (a condensing hot side against a boiling cold side). | When the check misses, the search is repeated on the full zones. The refusal names the arrangement used, and its advice fits it. Lab's HE5 is now solved with the default zones: 114,535 kW at 2.000 K (Lab's 10-zone workaround: 114,966 kW). |
| M5: a condenser with a vapour and a liquid distillate | — | Not built (a feature). It changes the column's degrees of freedom and its products, so it needs a proposal (proposal 0015, Part II, the end configurations). |

## Lab's question: was the 12-iteration cap the cause of column 5's non-convergence in the plant?

**For column 5 alone, yes.** All twelve `iso-scds5-*` inputs (the paper's vapour 6 and CHEPTA's round-2 vapour 6,
refluxes 45,000 to 70,000 kg/h) and the two diagnostic runs (`rerun-diag-scds5-round2-inlets-VLL`, `u62-scds5-VLL`)
converge now with the default settings; four of them failed on 0.6.2 (45,000 and 70,000 with the paper's vapour,
45,000 and 55,000 with CHEPTA's), in 10 to 53 iterations. Three needed more than 12 iterations from their start (17,
20 and 53), one (70,000) the product-flash fix. With `max_iterations: 100` on 0.6.2's inputs, the 12-iteration
stop was the whole story for the 45,000 and 55,000 cases.

**In the closed plant, it was the cause of the early stop, not of the loop's non-convergence.** Three of Lab's closed
runs, rerun with this branch (Lab's input files unchanged):

| Run | 0.6.2 | This branch |
|---|---|---|
| plant62-R-bottoms-warm-col5iter100 (column 5 `max_iterations` 100) | column 5 stops the loop at iteration 2 | column 5 converges at every iteration up to 38; the loop's relative change stays between 1.3e-3 and 1.5e-3 with jumps up to 0.62 (Broyden); at iteration 39 column 5 fails on a tear guess far from the answer (material residual 405 mol/s) |
| plant62-R-bottoms-warm (defaults) | column 5 stops the loop at iteration 4 | 30 iterations, the same plateau near 1.5e-3; column 11 fails at iteration 31 |
| plant62-W-dist (defaults) | column 5 stops the loop at iteration 3 | iteration 7: the conversion reactor runs short of acid (a balance question of the loop, not a column) |

So the column now carries the loop; what stops it is the recycle loop itself: Broyden plateaus near 1e-3 and its jumps
send a column a guess it cannot solve. That is Lab's note under round 2 ("the recycle loop plateaus near 2e-4") and
its request 14; it belongs to the flowsheet solver, where another worker is building design specifications, and is not
changed here.

## Rules kept

- No validation data or existing test changed. The new inputs are Lab's files, unchanged; no number is fitted to them.
- Every column that converged before converges by the same path (the new attempts run only after the old ones failed),
  so no result of an existing test changes.
- The numbers chosen here (`LONG_NEWTON` = 100, `TRACE` = 0.1 mol % for the start's bubble points) are this project's
  choices, stated where they are defined.
