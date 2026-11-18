# 2026-11-18-02: The plant's material balance on its own tolerance

Question 3 of decision [2026-11-14-08](2026-11-14-08-recycle-safeguards.md): the whole flowsheet's component balance
was held to 1000 times the recycle tolerance, relative to the feed (`balanceTol` in `src/flowsheet/flowsheet.js`). At
CHEPTA-Lab's recycle tolerance of 1e-5 that is 1 % of the feed (12.5 kmol/h for Lab's ethyl acetate plant), so a plant
0.42 kmol/h of ester out of balance per pass (column 11 takes more ester than is formed) passed as converged.
AGENTS.md: "Fail loudly ... never return a silently wrong answer."

## What other simulators do (read 2026-11-18)

- **COCO / COFE**, help page "Flowsheet Options" (https://www.cocosimulator.org/index_help.php?page=COFE/solveoptions.htm):
  two separate settings. "Mass balance relative tolerance: This relative tolerance will be used to determine whether
  mass balances, component balances, mol fraction summations, etc, are accurate." and "Recycle relative tolerance: This
  relative tolerance will be used to determine whether recycles are converged during the solution of a flowsheet." The
  unit-operation page (COFE/units.htm): "COCO will by default perform a mass-balance check on a unit operation after it
  calculates"; it can be turned off per unit. The pages give neither the default values, nor what the balance is
  relative to, nor what happens when a check fails. The flowsheet report lists "Overall balances (if flowsheet is
  solved)".
- **DWSIM**, source code (github.com/DanWBR/dwsim, commit 1abf72d, 2026-07-17; GPL): `FlowsheetBase.UpdateMassAndEnergyBalance`
  (DWSIM.FlowsheetBase/FlowsheetBase.vb) sums the mass flows of the streams that enter the flowsheet and subtracts those
  that leave it, into `Results.ResidualMassBalance` (kg/s), after every solution (FlowsheetSolver.vb). It is reported, not
  checked: no limit, no warning, no refusal. Its recycle tolerances are absolute (Recycle.vb, `ConvergenceParameters`:
  mass flow 0.01 kg/s, temperature 0.1 K, pressure 0.1 Pa by default).

So the practice found is COFE's: a balance tolerance of its own, beside the recycle tolerance and not derived from it.
Neither source says how far beyond it a flowsheet is refused or warned about; that part, and the value, are this
project's.

## What was changed

- **`solver.balanceTolerance`** (default `BALANCE_TOLERANCE` = 1e-4, between 0 and 0.1): after the loops converge, each
  component's |feeds + generated - products| must be within it times the total fresh feed (kmol/h), whatever the
  recycle tolerance. The scale is the fresh feed, not the recycle flows, so a large recycle does not widen it.
- Beyond it: in the **strict mode** (`solver.strictRanges: true`, the Settings switch "range mode") the answer is
  refused (`NO_CONVERGENCE`, details `balance`, `balanceTolerance`, `limit_kmol_h`, `feed_kmol_h`); in the **lenient
  mode** (the default) the answer is returned with a warning in `result.balance.warnings` (code `BALANCE`), in the request
  path's `qualifications.warnings`, and in the Flowsheet's Warnings, opened. The message names each component, which way
  and by how much ("Ethyl acetate out exceeds in by 0.422 kmol/h"), says "Check the specifications first" (a product
  given by its flow above what the feeds and reactions supply, a feed in excess with no way out), that the recycle
  tolerance let the loop stop there, and that a tighter `solver.tolerance` closes the balance once the specifications
  are right; the warning adds "This answer is not a steady state of the plant."
- The old check (1000 times the recycle tolerance, at least 1e-6) stays as it was, a refusal in both modes: beyond it
  the loop has not converged at all.
- `result.balance` carries `balanceTolerance` and `limit_kmol_h`; the request's `checks` carry `balance_tolerance` and
  `balance_limit_kmol_h`.
- Each block's own balance was already held to 1e-9 (relative), independent of the recycle tolerance
  (`src/units/units.js`, "does not close its material balance"): unchanged.

**Why 1e-4.** At the default recycle tolerance (1e-8) the old check is already 1e-5 of the feed, stricter than 1e-4, so
the new check acts only when the recycle tolerance is above 1e-7: every answer at the default settings is unchanged.
It is a hundred times the old floor (1e-6) and 1/34 of Lab's imbalance (0.42 in about 1250 kmol/h, 3.4e-4), and in kmol/h it
is 0.1 kmol/h per 1000 kmol/h of feed, the order of DWSIM's absolute recycle tolerance (0.01 kg/s = 36 kg/h). It is a
choice, not a published value; COFE's default is not on its help page.

**Why the range-mode switch.** The task asked to follow the existing pattern of `src/util/ranges.js`: the strict mode
refuses what the lenient mode answers with a warning. The balance is not a record's range, so this widens what the
switch means ("refuse what is not backed"); a separate switch is the alternative (question 2).

## Tests

- `test/flowsheet-balance.test.js` (new): a feed of 10 kmol/h, a mixer and a splitter whose product is given at 10.4
  kmol/h, the rest recycled (5000 kmol/h guessed). At a recycle tolerance of 1e-4 the loop stops after one pass (a
  change of 4e-5), 0.2 kmol/h of each component out of balance (4 % of the feed), which the old check (1 kmol/h)
  passed. Now: a warning naming both components and amounts and "Check the specifications first"; with the product at
  9.6 kmol/h the other direction ("in exceeds out"); refused in the strict mode; the request path carries the warning
  and the limit, and refuses in the strict mode; a balanced loop at the same loose tolerance gets no warning; a given
  `balanceTolerance` of 0.05 lets the 4 % through; invalid values are refused.
- The whole suite, with a probe printing every balance warning or strict refusal (removed after the run): only the new
  test's plant triggered it. The flowsheet suite (Cavett, the generated cases, Broyden, Wegstein and direct
  substitution), the flowsheet, design-specification and safeguard tests give the same answers with no new warning.
- Lab's three plants (`validation/data/flowsheets/lab-plant-0.6.2/`) stay opt-in (`CHEPTA_SLOW_TESTS=1`); they were not
  rerun here. They do not converge at their tolerance of 1e-8 (decision 2026-11-14-08), so the new check does not reach
  them; at Lab's own 1e-5 a state like the one recorded there (0.42 kmol/h of ester) is now warned about, refused in the
  strict mode.
- `npm test`: 1747 tests, 1743 pass, 0 fail, 3 skipped (the slow plant runs), 1 todo (with the test of answer 4).

Seen in passing: the same small plant at the default tolerance (1e-8) was refused by Broyden with "the recycle grows
without bound ... material accumulates in the loop", although the loop drains; the refusal was right, the words fit
only one direction. Changed after the maintainer's answer 4 (below).

## Questions for the maintainer

1. **The value 1e-4 of the fresh feed.** Recommendation: keep it (it changes nothing at the default recycle tolerance
   and catches Lab's 3.4e-4).
2. **One switch or two.** Recommendation: keep the range-mode switch (strict refuses, lenient warns), and say so in its
   hint in Settings; a separate "strict balance" switch only if someone wants the range lenient and the balance strict.
3. **The scale: the total fresh feed or each component's own flow.** COFE says "component balances" without saying
   relative to what. Against the total feed, a trace component may be far off in its own terms and pass (0.1 kmol/h of
   a component fed at 0.2 kmol/h, in a plant of 1000 kmol/h). Recommendation: the total feed for now (simple, as asked);
   a per-component scale (its own feed plus what is formed, with a floor) as a follow-up if a case needs it.
4. **The words of the "grows without bound" refusal** when the loop drains (above). Recommendation: a small follow-up that
   says "drains" or "accumulates" from the sign of the net change the safeguards already compute.

## The maintainer's answers (2026-11-18, through the coordinator)

The maintainer agreed with the four recommendations:

1. **The value:** 1e-4 of the fresh feed, kept.
2. **One switch:** the range mode decides the balance too. Its hint in Settings now says so: "The same choice holds for
   a flowsheet that does not balance within 1e-4 of its feed (solver.balanceTolerance): refused, or solved with a
   warning that names the components." (`src/ui/app.js`).
3. **The scale:** the total fresh feed now; a scale per component only when a case needs it.
4. **The words of the "grows without bound" refusal:** done in this pull request. The refusal sums the change of the
   tear streams in the pass that crossed the growth limit (the same net change as rule 5 of decision 2026-11-14-08):
   a loss reads "the loop drains: in this pass the tear streams together lost 0.4 kmol/h, so its products take more
   than its feeds and reactions supply (a product or outlet given by its flow above what is fed or formed has no steady
   state); check the specifications first"; a gain keeps "material accumulates in the loop". The net change is in the
   refusal's `details.netChangePass_kmol_h`. Tested in `test/flowsheet-balance.test.js` on the same plant with its
   product at 10.4 (drains) and 9.6 kmol/h (accumulates), at the default tolerance.
