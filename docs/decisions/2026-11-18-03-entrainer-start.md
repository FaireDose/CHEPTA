# 2026-11-18-03: Proposal 0025, step 1: the entrainer start of a column with a decanter

Follows docs/decisions/2026-11-18-01-vll-columns-rigorous.md, whose question 2 the maintainer answered on 2026-11-18:
proposal 0025 accepted, step 1 (the entrainer start) first, then step 2 (continuation past turning points). The
maintainer (2026-11-18, through the coordinator): "i am a bit concerned that you invent things that are not done in
simulators". Branch `claude/build-0025-step1`, from `claude/vll-columns-rigorous` (PR #256).

## What was built

`src/units/columns/engine.js`, `entrainerStart`: a start for a column with a decanter, tried **only** where every
bubble-point start's condensate holds one liquid (so no Newton attempt was made before). Every column that converged
before keeps its path and its answer: its starts are unchanged and run first.

The start is an initial profile given at a few stages, the stages between interpolated linearly, as the open sources
build the initial profile of a heterogeneous azeotropic column for a simulator:

- N. Bekiaris, *Multiple Steady States in Distillation*, PhD thesis, California Institute of Technology, 1995,
  section 4.4.5 "Simulation", pp. 194-202 (free to read: CaltechTHESIS / CDS technical report 95-016,
  https://resolver.caltech.edu/CaltechCDSTR:1995.016; read 2026-11-18). For Aspen Plus, the initial profiles of a
  heterogeneous azeotropic column are built from the singular points the profile visits (the azeotrope at the top), with
  the distillate and the bottoms "selected so that the material balances are (approximately) satisfied", and "linear
  interpolation between the two end compositions of each section", which "Aspen Plus performs ... automatically, so we
  typically have to specify the composition of only three to six trays".
- The ChemSep Book (H. A. Kooijman, R. Taylor, 2nd ed., 2006, public domain), section 13.4.10 "User Initialization",
  p. 217: profiles given at a few stages, linear interpolation between them, missing flows at constant molar overflow.

What the engine gives at those stages (the model's own numbers, nothing fitted):

1. the top vapour: the minimum-boiling azeotrope at the end of the distillation line from the combined feed (x -> the
   vapour of x at its bubble point, repeated; for water + ethanol + cyclohexane the model's ternary heteroazeotrope,
   0.1566, 0.3235, 0.5199 at 335.44 K, as test/columns-heteroazeotropic.test.js finds it). It must be heterogeneous,
   else the start is not built and says why;
2. the decanter: that condensate's two liquids at its bubble point, the reflux the chosen one; the start's reflux ratio
   is their ratio (the lever rule of the tie line, 1.316 here; at the solutions 1.39 to 1.43, as in decision
   2026-11-18-01);
3. the bottoms by the material balance with the distillate flow of the specification;
4. the vapours linear from the azeotrope to the feed's bubble vapour (the feed stage) and on to the bottoms' bubble
   vapour (the reboiler); each stage's liquid from the component balance at constant molar overflow (the operating
   lines), so that the start meets the material balances; temperatures and vapours at the liquids' bubble points
   (with two liquids, the vapour in equilibrium with both).

Choices of this project, stated: the interpolation is in the vapour (with the liquids from the balances) rather than in
the liquid. Both were tried: interpolating the liquids (azeotrope, feed, bottoms) also converges F6 but in 41 Newton
iterations against 10, and to the other steady state (below). The sections of Bekiaris' full construction (a section at
each singular point of the distillation line through the bottoms: here the ethanol corner, the ethanol + cyclohexane
azeotrope, the ternary azeotrope) were tried too: no case converged that the simpler start did not, so it was not
kept. The start is not built for side draws or a feed into the decanter (a bypassed second liquid).

## Validated

Two new cases, `validation/data/columns/vll/F6-ethanol-dehydration-entrainer-20-stages.json` and
`F7-ethanol-dehydration-entrainer-30-stages.json` (NRTL default sets, as F4; 101.325 kPa; 100 mol/s of saturated
liquid, 12 % water, 3 % cyclohexane; the organic liquid refluxed). The independent reference on ChemSep's three-phase
stage (`validation/python/reference_mesh_vll.py --entrainer`, started from the engine's profile perturbed; fixture
`validation/fixtures/columns-vll-entrainer.json`) converges to the same columns; the engine is within F1's tolerances
on every stage, liquid, product and duty (`test/columns-entrainer-start.test.js`, 7 tests).

| Case | Before | Now | The column |
|---|---|---|---|
| F6: 20 stages, feed on 5, B = 61 mol/s | every start refused | 10 Newton iterations | R = 1.392; two liquids on stages 5-10; bottoms 3.12 % water, 0.41 % cyclohexane |
| F7: 30 stages, feed on 10, B = 66 mol/s | every start refused | 12 iterations | R = 1.399; one liquid on every stage; bottoms 4.94 % water, 0.87 % cyclohexane |
| F4's column with 5 % cyclohexane (10 % water, B = 80) | every start refused | 9 iterations | bottoms 7.5 % water, 3.6 % cyclohexane |
| F4's column with 1 % or 2 % cyclohexane (B = 80) | every start refused | not converged (the residual stops falling) | |
| F4's column with 10 % cyclohexane (B = 80) | bubble-point starts run and fail | unchanged: not converged (the entrainer start is not tried, see question 1) | from the entrainer start by hand: 8 iterations |
| The dry-ethanol column, 30 and 40 stages, feed on 10, 1.17 % cyclohexane, B = 66.0 | every start refused | **no solution exists** (below) | |
| The same at B = 67.0 (near-dry bottoms possible), 20, 30 and 40 stages | every start refused | not converged | |

F6 is the specification of decision 2026-11-18-01, point 4, where two steady states had been found by hand. The
entrainer start reaches the one with two liquids on the stages (bottoms 3.1 % water, 0.4 % cyclohexane), the one the
continuation had reached; interpolating the liquids instead reaches the other (3.9 % water, no cyclohexane, one liquid
on every stage). Multiple steady states of these columns are documented in open sources: Bekiaris 1995 (chapters 3 and
4: ethanol + water + benzene; with Aspen Plus, section 4.4.5, "the solution simulators calculate ... depends on the
simulator-generated or user-supplied initial column profile"), and The ChemSep Book, section 1.6.5 (ethanol + water +
benzene after Prokopakis and Seider 1983: "There are no less than three solutions for this set of specifications").
The engine returns the one its start reaches; it does not search for the others (step 2's tests are to hold both).

## Found: the "dry-ethanol" specification of decision 2026-11-18-01 has no solution

At B = 66.0 mol/s (D = 34) with 12 % water and 1.17 % cyclohexane the column with this decanter has no steady state.
The decanter is at its reflux's bubble point with two liquids, a three-phase state, so the distillate is an aqueous
liquid on the model's curve of three-phase aqueous liquids at 101.325 kPa. The bottoms cannot be negative, so the
distillate must carry at most the feed's 12 mol/s of water and 1.17 mol/s of cyclohexane: x_water <= 0.3529 and
x_cyclohexane <= 0.0344 together. Along the curve the aqueous liquid's cyclohexane rises as its water falls, and where
its water is 0.3529 or less its cyclohexane is above 0.037 (the test traces the curve and checks every point). The
smallest bottoms flow with a solution is about 66.8 mol/s (D = 33.2 on the curve where cyclohexane : water = 1.17 : 12,
bottoms dry), which is why 66.8 looked "just beyond" and 66.0 was taken for consistent on 2026-11-18. So point 5 of
proposal 0025 (Newton stops at 64-71 iterations) was a column that does not exist, not a solver failure. At B = 67.0,
where a nearly dry bottoms is possible, the entrainer start does not converge either (20, 30 and 40 stages): the
dehydration column itself still needs step 2.

## What step 1 does not do

- Columns whose bubble-point starts hold two liquids but fail (F4 with 10 % cyclohexane): the entrainer start is not
  tried (proposal 0025, step 1: "where every bubble-point start's condensate holds one liquid"). Question 1.
- The near-dry dehydration column (B = 67, 1.17 % cyclohexane): not converged. Step 2 (arc-length continuation, or a
  bottoms purity among the MESH equations) is needed for it.
- Choosing among steady states.

## Questions for the maintainer (recommendations)

1. Also try the entrainer start where every other attempt has failed (as the very last attempt, so no converged column
   changes path)? It converges F4's column with 10 % cyclohexane in 8 iterations, which fails today. **Recommended:
   yes**, a small change after this pull request.
2. Step 2: needed for the dehydration column (B = 67 with 1.17 % cyclohexane does not converge from any start). Build
   it, with the bottoms purity as a specification among the MESH equations first (as DWSIM does; it gives a parameter
   that does not turn at the dry end), arc-length continuation only if that is not enough? **Recommended: yes.**
3. The dehydration validation case: take B from the decanter's feasibility (about 66.8 mol/s at 1.17 % cyclohexane and
   12 % water), or specify the bottoms purity instead of B? **Recommended: a bottoms purity** (water 0.1 mol %), with
   step 2; a product flow is a poor specification at the dry end.

## The maintainer's answers

All three as recommended (2026-11-18): docs/decisions/2026-11-18-04-entrainer-start-last.md.

## Rules kept

- No validation data or existing test changed; new cases and fixtures only.
- `npm test`: 1773 tests, 1772 pass, 0 fail, 1 todo (the UNIQUAC ternary azeotrope test, as before); 7 of them new
  (`test/columns-entrainer-start.test.js`). Checked by logging: no existing test reaches the entrainer start (only the
  new file), so every existing column keeps its path; Lab's columns 5 and 11 are among them.
