# 2026-11-17-01: Two liquids in columns, built (proposal 0024)

Proposal 0024 (PR #253; the maintainer's answers in docs/decisions/2026-11-14-07-two-liquids-in-columns.md) built on
branch `claude/build-0024-two-liquid-columns`. The release rule (the maintainer): 0.6.3 only once this is solved
completely. What is solved and what is not is stated plainly below.

## What was built

| Part | Built | Where |
|---|---|---|
| (a) feed check | Every column feed is flashed at its own T and P in the column's method; a second liquid above `feed_second_liquid_limit` (default 0.01 of the column's feed in mol, changeable per column) gives the warning `FEED_TWO_LIQUIDS` ("put a decanter before the column", with the mol and mass shares). The column is still calculated. | `src/units/columns/column.js` (`feedSecondLiquid`), `src/units/units.js` (the warning code) |
| (b) `feed_second_liquid` | `"stages"` (default, today's behaviour), `"top"`, `"bottom"`: the user's choice, no default by volatility. Top: mixed into the distillate (P-H flash); with a decanter, the decanter's feed, split there. Bottom: mixed into the bottoms. Refused above the limit, naming a decanter, `"stages"`, top and bottom. The notes say the duties leave the bypassed liquid out. | `column.js`; `engine.js` (`condenserFeed`, the decanter's feed) |
| (c) smooth two-liquid stage | `two_liquid_stage: "smooth"` (default `"split"`): the smoothed complementarity of the proposal, solved stage by stage for each (x, T) (the stage-local unknowns eliminated, so the engine keeps 2c + 1 variables per stage and a block-tridiagonal Jacobian); eps lowered 1e-3, 1e-4, 1e-5; the check after convergence (one-liquid stages stable by the tangent-plane test) in `solver.two_liquid_stage`. **Not the default** (below). | `src/units/columns/two-liquids.js`, `engine.js` |
| Column 11's real obstacle | As the column's very last attempt (no `max_iterations` given), the continuation in the relative volatilities is tried again with the mean of ln K weighted by the stage's liquid (`CONTINUATION_MEANS`). | `engine.js` |
| Validated case and reference | F4 (water + ethanol + cyclohexane, 20 stages, decanter) and F5 (Lab's column 11 without acid), `validation/data/columns/vll/`; Gomis et al. 2005 from the ThermoML Archive, `validation/data/lle/water_ethanol_cyclohexane_vlle_gomis2005.json`; ChemSep's full three-phase stage (The ChemSep Book, eqs. 13.35-13.44) in `validation/python/reference_mesh_vll.py --three-phase`, fixture `validation/fixtures/columns-vll-three-phase.json` | tests below |

## Lab's column 11 with acetic acid: converges

All seven of Lab's column-11 inputs (copied unchanged into `validation/data/columns/lab-requests-0.6.2/`) converge,
with either stage formulation:

| Input | 0.6.2 | Now, `"split"` (default) | Now, `"smooth"` |
|---|---|---|---|
| no acid, product 141.5 kmol/h | ok | ok (10 s) | ok (12 s) |
| 0.001 / 0.005 / 0.01 mass % acid, 141.5 kmol/h | `NO_CONVERGENCE` | ok (100-105 s) | ok (142-150 s) |
| 0.01 %, 139 kmol/h | ok | ok (20 s) | ok (4 s) |
| 0.01 %, 140 and 141 kmol/h | `NO_CONVERGENCE` | ok (75-100 s) | ok (113-146 s) |

At the paper's 141.5 kmol/h with 0.01 % acid: all of the acid leaves in the product, 0.022 mass % (as Lab found at
139 kmol/h; the paper prints 0.01 %), two liquids on stages 1 to 30.

**The cause was not the kink at the binodal.** Started from the no-acid solution, today's stage solves the acid column
in 21 Newton iterations. The continuation's start replaces every ln K by the plain mean over the components, in which
a trace of acid (0.0145 mol %) weighs as much as ethyl acetate: the whole path changes with the acid, whatever its
amount, and passes where Newton stalls (at 90.92 %). With the mean weighted by the liquid, the path is that of the
column without the acid. It runs as the very last attempt, after every other has failed (a first version ran it right
after the plain continuation: Lab's column 5 then converged by it instead of by the resumed Newton, which changed the
path that test EA-12 checks; moved last), so every column that converged before converges by the same path. The time: the failed plain path takes about 85 s first; trying the weighted mean first would halve
the time but change the path of every column that needs the continuation (a question below).

## Why (c) is not the default

The maintainer's rule (2026-11-14, answer 4): the default once every existing two-liquid column test gives its answer,
the validated case passes and column 11 converges with acid. The last two hold. The first does not: the whole test
suite run with `"smooth"` as the default (1749 tests) fails, beyond the tests of this branch that check the default's
own path:

- Lab's column 5 (`iso-scds5-r2-reflux55000`, test EA-12 in `test/columns-lab-requests.test.js`): converges with
  `"split"`, **does not converge** with `"smooth"`;
- Lab's column 5 at a reflux of 70,000 kg/h (`iso-scds5-paper-reflux70000`): a three-phase flash fails at 346.01 K;
- the 1-butanol + water decanter with a bypassed second liquid (`test/columns-feed-second-liquid.test.js`): does not
  converge.

Every comparison with an independent reference passes with both formulations (F1, F2, F3, the W2 cases, F4, F5 within
F1's tolerances). So `"smooth"` stays behind the option; `"split"` stays the default.

## The final eps (answer 5)

1e-5: the largest at which every test of `test/columns-vll.test.js` passes (with a final 1e-4, five fail; with 1e-3,
eight). The ladder starts at 1e-3: from 1e-2 Lab's column 11 at 139 kmol/h did not converge (near the plait points of
ethyl acetate + water + ethanol the smoothed equations have no root when eps is large). Where the smoothed equations
have no root, a stage takes their limit eps -> 0 (one liquid if stable, else the split): stated in the code.

## The validated case: what it shows, and what it does not

- F4's column (20 stages, the cyclohexane-rich liquid refluxed, bottoms 80 mol/s) has two liquids on stages 5 to 19;
  the engine (both formulations) matches ChemSep's three-phase stage within F1's tolerances; the decanter's liquids lie
  on the model's tie line at its temperature; the top vapour lies on the model's three-phase vapour line.
- The model's ternary heterogeneous azeotrope at 101.3 kPa (the NRTL pairs fitted to binary data only): 335.43 K,
  water 0.157, ethanol 0.324, cyclohexane 0.520 (mole fractions); measured (Gomis et al. 2005, abstract): 335.6 K,
  0.188, 0.292, 0.520. Deviation -0.17 K, water -0.031, ethanol +0.032.
- Against the 11 measured VLLE tie lines: the model's bubble temperatures within 0.51 K, its vapour within 0.021 in
  mole fraction (9 lines). **The three-phase flash fails** on the two lines nearest the azeotrope (335.54 K: "the
  K-values did not converge"). Reported in the test, not hidden.
- **Not shown:** a column "at high reflux whose top vapour reaches the azeotrope" (the proposal's wording). F4's top
  pinches on the vapour line, not at the azeotrope; a total-condenser column at R = 20-30 did not converge (the stage's
  liquid-liquid split fails near 335.5 K, "near a plait point").
- No open measured column profile exists (the proposal's search, 2026-11-14), so F4 is a model check, not a validation
  against a column.

## Questions for the maintainer (recommendations)

1. Release 0.6.3 now? Lab's column 11 converges with acid (all seven inputs), with the default stage. **Recommended:
   yes**; (c) stays an option, as answer 4 requires.
2. The smooth stage: keep it as an option (`two_liquid_stage: "smooth"`), not the default, until Lab's column 5 and the
   flash failure near 346 K are fixed. **Recommended: yes**, and a follow-up worker on the three-phase flash's
   non-convergence (it also stops Gomis's two tie lines and the high-reflux F4 variant).
3. The continuation: try the liquid-weighted mean earlier (column 11 in about 20 s instead of 100 s: the plain path's
   85 s saved), which changes the path of columns that needed the plain one (Lab's column 5)? **Recommended: not now**; first rerun Lab's four plants with the weighted
   mean first, and switch if nothing else changes.
4. The F4 case "top vapour at the azeotrope" is not shown. **Recommended:** accept F4 as built (the three-phase reference,
   the azeotrope and tie lines against Gomis) and leave the high-reflux column to the flash follow-up of question 2.

## Rules kept

- No existing test or validation file changed; `npm test`: 1749 tests, 1748 pass, 0 fail (the UNIQUAC ternary azeotrope
  test is reported as before, not a failure).
- The new numbers (1 mol %, eps 1e-3 to 1e-5, the liquid-weighted mean) are this project's choices, stated where defined.
- Gomis et al. 2005 read from the ThermoML Archive record on 2026-11-17 (the record's set 1 and the abstract on its
  page); a person checks the transcription against the record (AGENTS.md rule 4).
