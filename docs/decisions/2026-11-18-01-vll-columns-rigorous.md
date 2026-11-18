# 2026-11-18-01: Two-liquid columns, rigorous: the three-phase flash fixed, the entrainer column held, "smooth" still an option

The maintainer (2026-11-18, verbatim): "we do not release now. i want the columns to calculate rigously LLV also . Like
in ASpen they do with RadFrac. Check how that is done maybe the solution is simpler". Follows
docs/decisions/2026-11-17-01-two-liquid-columns.md (branch `claude/build-0024-two-liquid-columns`, PR #255), which left
three failures: (1) the three-phase flash near the ternary heteroazeotrope of water + ethanol + cyclohexane, (2) the
high-reflux entrainer column with a decanter, (3) "smooth" as the default (Lab's column 5). Branch
`claude/vll-columns-rigorous`.

## (a) The three-phase flash near the heteroazeotrope: fixed

**The cause.** The flash at VF = 0 searches T, and the T-P flashes on the way (below the bubble point: two liquids)
failed at some temperatures and not others (331.17 K and 333 K failed, 330, 331, 332, 334 K did not). The feed's
tangent-plane test returns its deepest trial phase, nearly pure water (0.937 water), far from the real aqueous liquid
(0.385 water, 0.585 ethanol) near the plait point; the liquid-liquid split by successive substitution started there
falls back to the one-liquid (trivial) solution; then the three-phase iteration, started with a vapour that should not
exist, did not converge. Not the stability test and not near-critical tie lines as such: the start of the split.

**The fix** (src/equilibrium/flash.js, `splitLL`): where substitution falls back to one liquid or does not converge,
the split minimizes the Gibbs energy (Michelsen 1982, part II: second-order minimization in the mole numbers of one
liquid, Newton with a finite-difference Hessian, Levenberg shift and an Armijo line search) from the second liquid the
start implies. Started where that liquid lowers the Gibbs energy, the iteration only goes downhill and cannot reach the
trivial solution. Only where substitution fails, so every split that converged before keeps its path.

**Also fixed on the way** (found in (c)): at the bubble point of two liquids the vapour's fraction is zero, and the
three-phase substitution jittered at round-off for 500 steps (Lab's column 5, a product flashed at 346.01 K). At the
end of the iteration, where it failed: Newton on the three-phase equations from the last step (newtonThree, however
small a fraction is); if it fails, a phase whose fraction is below 1e-6 while ln K changes by less than 1e-8 is taken
as absent and the other two are solved as two phases. The thresholds are this project's choice. And: a cold start of a
column whose own bubble point fails is now recorded and the next start tried, instead of ending the column with the
bare bubble-point error (src/units/columns/engine.js).

**Validated.**
- All 11 measured tie lines of Gomis et al. (2005; NIST TRC ThermoML Archive) give a bubble point (two failed before).
  Against the measured values: the bubble temperatures within 0.51 K (unchanged), the vapour within 0.021 on the first
  nine lines (unchanged) and 0.024 on all 11 (the two lines nearest the azeotrope: -0.105 and -0.109 K, vapour water
  -0.023 and -0.024). The model's deviation, stated, not fitted.
- Independent reference: `validation/python/reference_three_phase.py --gomis` (the Gibbs minimum by scipy SLSQP,
  polished by the equal-fugacity equations; no shared code), fixture `validation/fixtures/three_phase_gomis.json`: the
  engine's 11 bubble points within 1e-6 K, their liquids and vapour within 1e-6; four T-P flashes of the line nearest
  the azeotrope (325, 331.17, 333, 335 K) within 1e-8 (`test/three-phase-gomis.test.js`, 15 tests).
- The boundary case: `test/three-phase-boundary.test.js` (the 346.01 K flash against its definition: the two liquids
  below the bubble point, their bubble pressure P; Lab's column 5 at 70,000 kg/h with the smooth stage converges).
- **Changed test** (AGENTS.md rule 6 allows a test that a fixed limit makes wrong; said in the test):
  `test/columns-heteroazeotropic.test.js` asserted that the two tie lines nearest the azeotrope fail
  (`[[335.54, "NO_CONVERGENCE"], ...]`); it now asserts that none fails, keeps the old bounds on the nine lines, and
  states the new one on all 11.

## (b) The classic entrainer column: not done; proposal 0025

Ethanol dehydration with cyclohexane, decanter, organic liquid refluxed, top near the heteroazeotrope. With the fixed
flash it still does not converge from the engine's starts. What was found (NRTL default sets, 101.325 kPa, 100 mol/s
saturated liquid, bottoms flow specified; scratch scripts, not committed):

- With about 1 mol % of cyclohexane makeup every bubble-point start's condensate holds one liquid, so every start is
  refused: the start cannot see the entrainer.
- With only the organic liquid refluxed the reflux ratio is the decanter's lever rule, about 1.39 on every converged
  column: it is not a free variable.
- Dry bottoms need the feed's cyclohexane-to-water ratio to equal the aqueous liquid's near the azeotrope (0.037 :
  0.356 in the model): about 1.2 % cyclohexane with 12 % water, D near 34 mol/s. My first specification (B = 66.8)
  was just beyond it.
- Continuation from F4's column (20 stages) in the feed and B reaches columns with 0.16 mol/s of cyclohexane in the
  bottoms (water 5.6 %), then every path ends at a turning point where the bottoms' cyclohexane goes to zero
  (B = 57.5 with 3 % makeup; 61.2 with 2.6 %).
- **Two steady states at one specification** (12 % water, 3 % cyclohexane, B = 61 mol/s, 20 stages): by continuation,
  bottoms 3.1 % water and 0.4 % cyclohexane, two liquids on the stages; from a start built at the model's ternary
  azeotrope (32 Newton iterations), bottoms 3.9 % water, no cyclohexane, one liquid on every stage.
- At the consistent dry-ethanol specification (30 and 40 stages, feed on 10, B = 66.0) Newton from the azeotrope start
  stops (64-71 iterations, "the residual stopped falling").

So the stage equations are RadFrac's and right; the solution path is what fails: a start without the entrainer, and a
product flow as the parameter near turning points. RadFrac's inside-out algorithm would not remove either by itself
(three-phase RadFrac still asks for estimates and a key component of the second liquid). As the task required, no new
solver was built: **proposal 0025** (`proposals/0025-heteroazeotropic-columns.md`) proposes an entrainer start for a
decanter and continuation that passes turning points (pseudo-arc-length, or a bottoms purity among the MESH
equations).

Worked example searched (2026-11-18): the ProSim example "Heterogeneous azeotropic distillation" (free to read, "Tous
droits réservés"; Mod. UNIFAC Dortmund, two columns and recycles, 45 + 25 stages) gives dry ethanol (99.9999 mass %)
at the bottom of the azeotropic column with an entrainer recycle about equal to the feed: a qualitative comparison
only, a different model and flowsheet. Also listed by the search, not used: a 2024 Tanzania J. Eng. Technol. article
(Aspen Plus, NRTL-RK, CC BY-ND), course exercises on Scribd (licence not checked), the NTNU distillation 2002
proceedings. No open column profile with measured data (as proposal 0024's search of 2026-11-14).

## (c) "smooth" as the default: still no

| Check (after the fixes of (a)) | "split" (default) | "smooth" |
|---|---|---|
| Lab's column 5, reflux 55,000 kg/h | ok (17 s) | **not converged** (the first smoothing step from the cold start) |
| Lab's column 5, reflux 70,000 kg/h | ok (2 s) | ok (5 s; failed before the flash fix) |
| Lab's column 11, 7 inputs | ok (all) | see the table below |
| The whole suite with "smooth" as the default (1764 tests) | 0 fail | 3 fail: EA-12 (column 5 at 55,000), the 1-butanol + water decanter with a bypassed second liquid (`test/columns-feed-second-liquid.test.js`), and column 11 at 141.5 kmol/h with acid, which converges but by another path than the test names |

Lab's column 11 with "smooth" (all seven inputs, after the fixes; times with other runs in parallel, so slower than
alone): no acid, 141.5 kmol/h, ok (16 s); 0.001 and 0.005 mass % acid, 141.5, ok (209, 215 s); 0.01 %, 139, ok (5 s);
140, ok (159 s); 141, ok (213 s); 141.5, ok (205 s). All converge.

The maintainer's rule (2026-11-14, answer 4): the default only once everything passes. It does not: "split" stays the
default, "smooth" an option.

## Questions for the maintainer (recommendations)

1. Accept the flash fixes of (a) as they are (Gibbs minimization where substitution fails; the boundary rule with
   1e-6 and 1e-8)? **Recommended: yes.**
2. Proposal 0025 (the entrainer start, then continuation past turning points) for the dehydration column, instead of
   an inside-out solver? **Recommended: yes, step 1 first** (the start is small; the arc-length step decides whether
   the dry-ethanol column converges).
3. A decanter option to reflux a share of the other liquid (or an entrainer recycle feed), which removes the reflux
   bound of 1.39? **Recommended: ask CHEPTA-Lab whether its flowsheets need it before building.**
4. "smooth": keep it an option. **Recommended: yes**; it now passes column 5 at 70,000 kg/h but not at 55,000, nor
   the 1-butanol + water bypass.

## The maintainer's answers (2026-11-18, through the coordinator)

All four recommendations agreed:

1. The flash fixes of (a) are accepted as they are.
2. Proposal 0025 is accepted instead of an inside-out solver: step 1 (the entrainer start) first, then step 2
   (continuation past turning points). Step 1 goes to a new worker.
3. The decanter option to reflux a share of the other liquid: CHEPTA-Lab is asked first whether its flowsheets need it;
   not built until then.
4. "smooth" stays an option; "split" stays the default.

## Rules kept

- No validation data changed; one test changed, because the limit it asserted is fixed (above).
- `npm test`: 1766 tests, 1765 pass, 0 fail, 1 todo (the UNIQUAC ternary azeotrope test, as before).
- The Gomis rows were not re-transcribed (the file of 2026-11-17 is used as it is).
