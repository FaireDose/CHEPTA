# 2026-11-14-08: The recycle solver's safeguards, and why Lab's closed plant plateaus

CHEPTA-Lab's closed ethyl acetate plant (Piotrowski et al. 2021; Lab's request 14) stalls in the recycle loop: with the
column fixes of decision [2026-11-14-05](2026-11-14-05-column-fixes-lab-062.md) column 5 converges at every loop
iteration, but Broyden's relative change sits between 1.3e-3 and 1.5e-3 for 30-38 iterations with jumps up to 0.62,
and then a block fails on a jumped tear guess. The maintainer agreed (2026-11-14) to treat it as a flowsheet-solver
task. Inputs: Lab's three request files of that decision, copied unchanged into
`validation/data/flowsheets/lab-plant-0.6.2/` (Lab commit 783776e).

## What was found

**The plateau is a slow mode of the plant, not noise of the blocks.** The loop's passes are deterministic (the same
input gives the same change to every digit, run twice), and the blocks converge to 1e-10, so the inner solves are not
noisy at the level of the plateau. Summing the change g(x) - x of each component over the five tear streams gives what
the loops gain or lose per pass. On plant62-R-bottoms-warm (main, iterations 3-30), whatever the state of the loop
(tear ethanol between 23 and 380 kmol/h during Broyden's jumps):

| Component | Net change of the tear streams per pass |
|---|---|
| ethyl acetate | -0.407 to -0.423 kmol/h |
| ethanol | about +0.24 kmol/h (between the jumps) |

The feeds explain both numbers. Ethanol 6,511 kg/h = 141.335 kmol/h, acetic acid 8,472 kg/h = 141.078 kmol/h (CHEPTA's
molar masses), so at most 141.078 kmol/h of ester is formed and 0.257 kmol/h of ethanol is in excess. Column 11 is
specified by its bottoms, the product, at 141.5 kmol/h, and at R/D 3 its bottoms are nearly pure ester in every state
the loop visits: the product takes about 141.5 kmol/h of ester, 0.42 more than is formed, so the loops lose ester at
that rate, and the excess ethanol has no way out, so they gain it. The steady state needs at least 0.422 kmol/h of
non-ester in the product (the paper's product, 99.90 % with 0.07 % water and 0.02 % ethanol, carries about 0.53), which
column 11 gives only when enough ethanol and water have built up in the loops to break through into its bottoms. Until
then the change of the tear streams hardly depends on them: F'(x) is nearly singular along that inventory, direct
substitution creeps (about 0.24 kmol/h of ethanol per pass), and Broyden's model, correctly, asks for a very large step
along it. The steps overshoot because the breakthrough is strongly nonlinear: those are the jumps (0.06, 0.11, 0.29,
0.62), each followed by a fall back to the plateau, until one lands where a block cannot solve (column 11 given a feed
below its bottoms flow, column 5 with a material residual of 405 mol/s, column 11's continuation).

**plant62-W-dist's "reactor short of acid" is a jump, not the plant's balance.** The message is about ethanol: at
iteration 7 the conversion reactor "needs 159.536 kmol/h of Ethanol, but only 141.333 kmol/h come in", which is exactly
the fresh ethanol: Broyden's previous step (a change of 2.5e-2, from 4.1e-4) had put the ethanol of both recycles to the
reactor (S7, S21) at zero, where the flows are clipped. This plant specifies column 11 by its distillate (230.4 kmol/h),
so the product takes what is left and the balance above does not bind; it has no ester drain. Its own plateau (4e-4) is
the same kind of slow mode, weaker.

## What other simulators do (read 2026-11-18)

The maintainer (2026-11-18): "i am a bit concerned that you invented things that are not done in simulators. please
check. if it does not converge it means we need to look at the specs better maybe". Read, open sources only
(docs/METHOD_SELECTION.md, "When in doubt"):

- **COCO / COFE**, help page "Flowsheet Options" (https://www.cocosimulator.org/index_help.php?page=COFE/solveoptions.htm):
  Wegstein first, then Newton: "Max. successive Wegstein steps: Determines how many Wegstein steps are attempted before
  switching to Newton"; "Max. successive Newton steps: Determines how many Newton steps are attempted when the Wegstein
  solution method is detected to diverge". The Newton options: "Full: Full Newton; determines Jacobian at each
  iteration and performs line search for global convergence"; "Broyden: Broyden's method; determines Jacobian at first
  iteration and when required"; "Lazy: Lazy Newton method; determines Jacobian at first iteration" (not updated for a
  number of steps, or when a step fails or is inaccurate); all three perform a line search. The gradients come from
  relative perturbations: "Relative Newton flow perturbation: The relative perturbation of component flows in the
  Newton algorithm to determine gradients." The page does not say what happens when a unit operation fails.
- **DWSIM**, source code (github.com/DanWBR/dwsim, commit 1abf72d, 2026-07-17; GPL): the Recycle block offers Wegstein
  (`AccelFreq` 4, `Qmin` -20, `Qmax` 0, `AccelDelay` 2), Dominant Eigenvalue and Global Broyden, and a `SmoothingFactor`
  (default 1). Global Broyden (`FlowsheetSolver.vb`, `MathEx.Broyden.broydn` from `DWSIM.Math/Broyden.vb`) starts from
  the identity and takes `0.3 * old + 0.7 * new` of each step; no Jacobian, no line search. A unit that throws is
  marked "error calculating" and its error collected; with `SolverBreakOnException` (default `False`,
  `DWSIM.GlobalSettings/Settings.vb`) the solution stops at once, otherwise it goes on. Each loop shows "Recycle loop
  #n, average recycle error: x %".

| Rule of this branch | COFE | DWSIM | Kept? |
|---|---|---|---|
| A Jacobian by perturbation of the tear flows when Broyden stalls | yes ("Jacobian at first iteration and when required") | no | kept (rule 4) |
| A step that makes the change much worse is shortened (rejection) | yes, a line search in every Newton option | a fixed 0.7 of every Broyden step | kept (rule 2); the threshold of 10 is this project's |
| A block that fails on a guess: go back and retry a shorter step | not documented | no: records the error and goes on, or stops | **removed** (the maintainer, 2026-11-18: stop at once, name it) |
| A steady gain or loss of a component named, as a warning | no | no ("average recycle error" only) | kept as a warning only, by the maintainer's choice (2026-11-18); it changes no number |

## What was changed (src/flowsheet/flowsheet.js)

Cited in the code: Broyden 1965; scipy.optimize's nonlin_solve (BSD), whose broyden1 shortens its steps by an Armijo
line search after Kelley 1995 (Kelley's book could not be opened, its server answered 503); COFE's and DWSIM's
practice above.

1. **A block that fails inside the loop stops it at once** (the maintainer, 2026-11-18, of the two options offered:
   "Stop at once, name it"). The refusal names the block, the iteration, and, when the block was given an accelerated
   guess, the method and how far the guess was beyond the last pass's result, with "Check the specifications and the
   start values of the loop first; direct substitution, which never extrapolates, shows whether the guess was the
   cause". A pass of the Jacobian (rule 4) that fails stops the loop the same way. A first version of this branch
   retried such a guess with a shorter step; it was removed: no simulator read documents it, and it hid column
   failures that point to the specifications.
2. **Broyden rejects a pass whose change is more than ten times the last accepted one**: its secant information still
   updates the approximation, and the next guess is made again from the accepted pass, its extrapolation limited to a
   quarter of the rejected one's, down to direct substitution after four rejections in a row.
3. **The limit on the extrapolation starts unlimited** and doubles after every accepted pass that lowers the change, so
   a loop that converges without the safeguards takes exactly the same steps as before. After a direct-substitution
   step (limit 0) the next accepted pass sets it to 1e-3.
4. **On a stall** (the change has not halved in 8 accepted passes) Broyden's approximation is replaced by the inverse
   of a forward-difference Jacobian at the current point (one pass per tear variable, counted as iterations; step 1e-7
   of the tear's flow); a singular Jacobian restarts it at -I. The step is small because the plant's loop is smooth and
   strongly amplifying: one pass from tear values perturbed by 1e-9 and 1e-7 (relative) changed the result by 1.4e-8 and
   1.4e-6 (S21), linear to two digits, a gain of about 30.
5. **An early warning when material accumulates or drains** (the maintainer, 2026-11-18: "Warn early, keep
   iterating"). When the net change of a component summed over the tear streams keeps one sign for 30 accepted passes,
   above 1e-5 of the feed and never below 95 % of its value at the start of the run, the loop warns at once: a progress
   report (the thread waiting on a long run sees it) and `loops[].warnings` / the refusal's `details.warnings`. The
   message names the component and the rate and points to the specifications (a product given by its flow, a feed in
   excess of what reacts, a component with no way out). The window was set on the flowsheet suite: with 10 passes and
   80 % it warned on Cavett (Wegstein and direct substitution) and G05 (direct substitution), slow loops that do converge
   (propane builds up in Cavett); over 30 passes their net change falls to at most 0.32 of its start, while Lab's plant
   holds 0.42 kmol/h of ester for 200 passes. A refusal (a block that fails, or too many iterations) also names the
   components whose net change was nearly steady for at least 10 accepted passes, with "look at the specifications
   first", and gives every component's net change in `details.netChange_kmol_h`.

Every action is listed in `loops[].safeguards`. Tolerances and the convergence test are unchanged.

Tried and not kept: scaling Broyden's variables by each tear's total flow (the Cavett problem then stalled at a change
of 0.27); a restart at -I instead of the Jacobian (on the test grid, with a stall window of 15, 25 of 36 cases converged
within 200 iterations, mean 127; with the Jacobian and a window of 8, 36 of 36, mean 31); rejection against the best
change so far instead of the last accepted one (mean 38); a floor of 10 % of the current flow instead of zero for a
falling flow (27 of 36 against 25); the retry after a block's failure (rule 1).

## Tests

- `test/flowsheet-suite.test.js`, `test/flowsheet.test.js`: unchanged and passing. On every case of the flowsheet suite
  (Cavett and 16 generated, with Broyden, Wegstein and direct substitution, 500 iterations allowed) the answer and the
  number of iterations are those of main to 1e-9 kmol/h; no safeguard acts and no warning is given. Wegstein on G07 still oscillates, as
  the suite records.
- `test/flowsheet-safeguards.test.js` (new): a hard two-tear loop (recycles of 99 and 99.5 %, splits sharp in the
  composition). On the 18 variants of the grid (sharpness 8/20/40, recycle 99/99.5 %, guesses 0.3/1/3 times) main's
  Broyden ran away on 17 (flows over 10^6 times the feed, "the recycle grows without bound", or a block handed 2e9
  kmol/h); this branch converges all 18 at 1e-8 (20-53 iterations, Jacobian passes included). The test takes three of
  them: each from guesses three times apart to the same answer (1e-5 kmol/h), a fixed point (one pass from it changes
  the tears by less than the tolerance), the flowsheet balanced. Also: a block that refuses an inlet lacking a
  component stops the loop at iteration 4 with its name, "on an accelerated guess" and what to check; a failure on the
  direct-substitution step stops it too; a loop short of iterations is refused; a component with no way out is warned
  about at pass 30, in a progress report at that pass and in the refusal; a loop that converges without them gets no
  safeguard and no warning.
- Lab's three plants: present and checked; run only with `CHEPTA_SLOW_TESTS=1` (20-60 minutes each). Results below.
- `npm test`: 1741 tests, 1737 pass, 0 fail, 3 skipped (the slow plant runs), 1 todo (as on main).

## Lab's closed plant with this branch

Runs of Lab's files (unchanged; 200 iterations as Lab set them; default tolerance 1e-8), one pass 10-60 s.

**With the final version (2026-11-18: stop at once, the early warning):**

| Run | main (decision 05) | This branch |
|---|---|---|
| plant62-R-bottoms-warm-col5iter100 | column 5 fails at iteration 39 (405 mol/s), after about an hour on the 1.5e-3 plateau | stops at iteration 35, after 5.6 minutes: "Column SCDS5: the rigorous column did not converge ... (on an accelerated guess, broyden, 52 % of the tear flows beyond the last pass's result ...). In the last accepted pass the tear streams together gained 0.242 kmol/h of Ethanol (nearly steady for 12 accepted passes in a row), ... lost 0.422 kmol/h of Ethyl acetate (nearly steady for 12 accepted passes in a row): ... look at the specifications first." The 52 % step is the Newton step after the Jacobian at iteration 31, along the drain |
| plant62-W-dist | the reactor short of ethanol at iteration 7 | the jump that zeroed the ethanol is rejected (iteration 6); stops at iteration 13, after 9 minutes: column SCDS11 fails on a guess 1.6 % beyond the last pass (the change was 3.6e-4) |

plant62-R-bottoms-warm (defaults) follows the same course as col5iter100 to iteration 34 (the runs differ only in
column 5's attempts); it was not rerun to its end.

**With the first version (2026-11-14, the retry after a block's failure, since removed)**, which kept the loop going
to see where it leads: plant62-R-bottoms-warm-col5iter100 ran all 200 iterations (column 5's failure at 39 and the
extraction's at 91 retried) and its change fell to 1.5e-6; restarted from its last tear streams it never went below
7.1e-7 in 200 more (four Jacobians; Newton steps along the slow direction grew the change to 1e-4 and were rejected).
plant62-W-dist stayed at 4.0-4.6e-4 for 50 passes, gaining 0.19-0.20 kmol/h of ethanol per pass. Neither converged.

**The closed plant does not converge, and the reason is its specification, not the solver.** The state at a change of
1.5e-6 is not near a steady state: column 11's distillate recycle S15 has grown to 507,648 kmol/h (about 400 times the
plant's feed; 288 kmol/h at the start), so a relative change of 1.5e-6 is still 0.75 kmol/h of S15. In that pass the
tear streams together lose 0.422 kmol/h of ester, 0.192 of water and 0.110 of ethanol, exactly what the plant balance
misses (feeds plus reaction minus products: ester -0.422, water -0.192, ethanol -0.110 kmol/h). The product 16 is 141.5
kmol/h of ester at 99.9998 mass % (0.0004 kmol/h of acid), more ester than is formed: the solver finds no state in which
column 11's bottoms, at 141.5 kmol/h and R/D 3, carry the 0.42 kmol/h of water and ethanol the balance needs, and it
moves the loop toward ever larger recycles (the "solution at infinity" of a drain). W-dist (column 11 on its distillate)
has no ester drain, but it gains 0.19-0.20 kmol/h of ethanol per pass for 50 passes: the 0.257 kmol/h of excess ethanol
in the feeds leaves only in part (S25, the purge, and the product), so ethanol accumulates in the loops, slowly, until
it breaks through somewhere.

**Product purity against the paper's 99.90 %:** no converged answer, so no purity is claimed. For the record only, the
state of the best pass (read with a tolerance of 1e-5 to get its streams, not an answer): product 16 at 99.9998 mass %
ester, a state whose balance is off by 0.42 kmol/h of ester. The balance bound for R-bottoms: with 141.078 kmol/h of
ester formed and 141.5 kmol/h of product, the product holds at least 0.422 kmol/h of something else: 99.94 % if all
water, 99.88 % if it takes the excess ethanol too. The paper's 99.90 % is inside that bound. Lab's own settled plant
(column 11 on its distillate, tolerance 1e-5) gave 99.11 %; Lab's round 4 found the purity set by the ethanol balance.

The safeguards did what they were built for: no jump stopped either plant, and Broyden's plateau is gone (the change
moves). What is left is a loop whose specification makes it accumulate or drain, which no convergence method can
close; the refusal now says so (rule 5).

## Questions for the maintainer

1. **Lab's plant specification.** Column 11's product fixed at 141.5 kmol/h and the ethanol feed fixed at 0.257 kmol/h
   above the acid make a loop that drains ester and gains ethanol. Recommendation: Lab specifies the ethanol feed by a
   design specification (proposal 0022, merged in #250; Lab's request 15) on the product's ethanol or purity, and
   column 11 by its distillate or a purity, not its bottoms flow; this branch's refusal names the accumulating
   components, so Lab sees it at once.
2. **A refusal of a recycle that grows to hundreds of times the feed** (S15 at 400 times; the growth limit is 10^6).
   Recommendation: keep 10^6 (a large recycle can be real) and rely on the net-change message; or lower it to 10^3 with
   the maintainer's agreement.
3. **The overall balance check is loosened with the tolerance** (1000 x tolerance): at Lab's 1e-5 a plant 0.42 kmol/h
   of ester out of balance passes (the limit is 12.5 kmol/h). Recommendation: a separate absolute check on each
   component's balance against what the reactors form (here 0.42 against 141 kmol/h) in a follow-up; not changed here.
4. **The safeguards' numbers** (reject at 10 times, a stall of 8 passes, 4 rejections, a quarter, a Jacobian step of
   1e-7, 1e-3 after direct substitution; the warning's 30 passes, 95 % and 1e-5 of the feed; 10 passes for a refusal)
   are this project's choices, set on a test loop and the flowsheet suite; COFE's own values are not published on its
   help page. Recommendation: keep them, stated in the code.
5. **Slow tests**: Lab's plants take 20-60 minutes per run, so they run only with `CHEPTA_SLOW_TESTS=1`.
   Recommendation: keep them opt-in; a nightly run is a separate decision.

## The maintainer's answers (2026-11-18)

The maintainer: "so we need to give early messages if the columns are not converging. i am a bit concerned that you
invented things that are not done in simulators. please check. if it does not converge it means we need to look at the
specs better maybe". The check is the section "What other simulators do" above. Asked two questions, the maintainer
chose:

1. A column (or any block) that fails inside a recycle loop: **"Stop at once, name it"**. The retry with a shorter step
   was removed; the refusal names the block, the iteration, whether it was given an accelerated guess, and what to
   check first.
2. Material that keeps accumulating or draining: **"Warn early, keep iterating"**. The warning after 30 nearly steady
   passes (rule 5), and the same evidence in any refusal.

### Answers to questions 1-5 (the maintainer, 2026-11-18, through the coordinator)

All five recommendations accepted:

1. **Lab's plant specification:** Lab sets the ethanol feed with a design specification (proposal 0022; Lab's request
   15) and specifies column 11 by its distillate or a purity, not its bottoms flow.
2. **The growth limit** stays at 10^6 times the feed; the accumulation message (rule 5) does the warning.
3. **An absolute per-component balance check:** a follow-up, built in PR #257 on this branch.
4. **The safeguards' numbers** are kept as stated in the code.
5. **Lab's plant tests** stay opt-in (`CHEPTA_SLOW_TESTS=1`).

Nothing is left open in this decision.

