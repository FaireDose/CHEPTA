# 2026-11-14-07: The recycle solver's safeguards, and why Lab's closed plant plateaus

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

## What was changed (src/flowsheet/flowsheet.js)

Safeguards on the accelerated tear guesses (cited in the code: Broyden 1965; scipy.optimize's nonlin_solve, BSD, whose
broyden1 shortens its steps by an Armijo line search after Kelley 1995; Kelley's book itself could not be opened in this
session, its server answered 503, so its sections are not cited):

1. **A block that fails on an accelerated guess no longer stops the loop.** The iteration goes back to the last accepted
   pass and retries the guess with its extrapolation beyond that pass's result shortened to a quarter, down to the
   direct-substitution step after four tries. Only a failure on the direct-substitution step stops the loop, with the
   block's message (fail loudly; tested).
2. **Broyden rejects a pass whose change is more than ten times the last accepted one**: its secant information still
   updates the approximation, and the next guess is made again from the accepted pass, its extrapolation limited to a
   quarter of the rejected one's.
3. **The limit on the extrapolation starts unlimited** and doubles after every accepted pass that lowers the change, so
   a loop that converges without the safeguards takes exactly the same steps as before.
4. **On a stall** (the change has not halved in 8 accepted passes) Broyden's approximation is replaced by the inverse
   of a forward-difference Jacobian at the current point (one pass per tear variable, counted as iterations; step 1e-5
   of the tear's flow); if a pass fails or the Jacobian is singular, it restarts at -I.

Every action is listed in `loops[].safeguards` (and in the refusal's `details.safeguards`, and the last three in the
progress reports, with the Jacobian's passes). Tolerances and the convergence test are unchanged.

Tried and not kept: scaling Broyden's variables by each tear's total flow (the Cavett problem then stalled at a change
of 0.27); a restart at -I instead of the Jacobian (on the test grid below, with a stall window of 15, 25 of 36 cases converged
within 200 iterations, mean 127; with the Jacobian and a window of 8, 36 of 36, mean 31); rejection against the best
change so far instead of the last accepted one (mean 38); before the Jacobian rule, a floor of 10 % of the current flow
instead of zero for a falling flow (27 of 36 against 25).

## Tests

- `test/flowsheet-suite.test.js`, `test/flowsheet.test.js`: unchanged and passing. On every case of the flowsheet suite
  (Cavett and 16 generated, with Broyden, Wegstein and direct substitution, 500 iterations allowed) the answer and the
  number of iterations are those of main to 1e-9 kmol/h, and no safeguard acts. Wegstein on G07 still oscillates, as
  the suite records.
- `test/flowsheet-safeguards.test.js` (new): a hard two-tear loop (recycles of 99 and 99.5 %, splits sharp in the
  composition, blocks that refuse an inlet lacking a component). Main stops on every variant with the block's error at
  iteration 4; now each converges at 1e-8, from guesses three times apart to the same answer (1e-5 kmol/h), its answer a
  fixed point (one pass from it changes the tears by less than the tolerance), the flowsheet balanced. Also: a failure
  on the direct-substitution step still stops the loop with the block's message; a loop short of iterations is refused;
  a loop where nothing fails gets no safeguard. On a grid of 36 variants (sharpness 8/20/40, recycle 99/99.5 %, two
  thresholds, three guesses) main converged none, this branch all 36 (mean 31 iterations, Jacobian passes included).
- Lab's three plants: present and checked; run only with `CHEPTA_SLOW_TESTS=1` (20-60 minutes each). Results below.
- `npm test`: 1740 tests, 1736 pass, 0 fail, 3 skipped (the slow plant runs), 1 known TODO as on main.

## Lab's closed plant with this branch

RESULTS

## Questions for the maintainer

QUESTIONS
