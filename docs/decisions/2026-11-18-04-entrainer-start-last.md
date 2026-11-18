# 2026-11-18-04: The maintainer's answers on the entrainer start; the start also as the very last attempt

Follows docs/decisions/2026-11-18-03-entrainer-start.md (proposal 0025, step 1). Its pull request (#258) was merged into
its base branch `claude/vll-columns-rigorous` after that branch had been merged into main, so step 1 was not on main.
This pull request carries step 1 again, rebased onto main, with the answers below. It replaces #258.

## The maintainer's answers (2026-11-18, through the coordinator; all three as recommended)

1. **The entrainer start also as the very last attempt**, after every other attempt of a column with a decanter has
   failed (bubble-point starts, continuations, resumed Newton). Built here.
2. **Step 2**: first a bottoms purity specification among the MESH equations (as DWSIM does); arc-length continuation
   only if that is not enough. Not built in this pull request.
3. **The dehydration validation case is specified by the bottoms purity**, not by the bottoms flow B (step 2).

## What was built

`src/units/columns/engine.js`: the entrainer start (`tryEntrainer`) is tried at most once per column: as before, where
every bubble-point start's condensate holds one liquid; else after the last continuation (the mean weighted by the
liquid), when every other attempt has failed. Not in a step of a continuation, not in a trial column of the
specifications' outer loop (quick) as the last attempt, not with a feed into the decanter. Because it comes after
everything else, a column that converged before keeps its path and its answer: every earlier attempt is unchanged and
runs first.

**Validated.** New case `validation/data/columns/vll/F8-ethanol-water-cyclohexane-decanter-10-percent.json`: F4's column
(20 stages, feed on 5, B = 80 mol/s) with 10 % water and 10 % cyclohexane. Before: its five bubble-point starts hold two
liquids and run, Newton fails from each, both continuations stop, the resumed Newton fails: not converged. Now: the
entrainer start, tried last, converges in 8 Newton iterations (about 70 s in all, most of it the earlier attempts),
bottoms 6.8 % water, 10.3 % cyclohexane, one liquid on every stage. The independent three-phase reference
(`reference_mesh_vll.py --entrainer`) converges to the same column; the engine is within F1's tolerances on every
stage, liquid, product and duty (`test/columns-entrainer-start.test.js`).

**No converged column changes.** Every existing test passes unchanged, and logging which tests reach the entrainer
start (as for decision 2026-11-18-03) shows that only test/columns-entrainer-start.test.js does: no other test's column,
converged or refused, reaches it (Lab's columns 5 and 11 among them).

## Rules kept

- No validation data or existing test changed; one new case and the fixture of the --entrainer reference extended.
- `npm test`: 1775 tests, 1774 pass, 0 fail, 1 todo (the UNIQUAC ternary azeotrope test, as before); 9 in
  test/columns-entrainer-start.test.js (2 new for F8).
