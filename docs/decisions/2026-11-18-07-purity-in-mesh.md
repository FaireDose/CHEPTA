# 2026-11-18-07: Proposal 0025, step 2: the bottoms purity among the MESH equations; no arc-length continuation

Follows docs/decisions/2026-11-18-04-entrainer-start-last.md, whose answers 2 and 3 the maintainer gave on 2026-11-18:
step 2 first as a bottoms purity specification among the MESH equations, as DWSIM does; arc-length continuation only if
that is not enough; the dehydration case specified by the bottoms purity instead of the bottoms flow. The maintainer
(2026-11-18): "i am a bit concerned that you invent things that are not done in simulators". Branch
`claude/build-0025-step2`. (Decision -06 is taken by proposal 0026's engine, #261.)

## How purities were solved before, and which path each takes now

Before: every design specification (purity, recovery, component flow, stage temperature) went through the outer loop
of `src/units/columns/specifications.js` (decision 2026-11-11-01): Newton's method, then a scan and a secant search, on
the engine's own free variables, each trial a whole column at a fixed reflux and product flow (EA-13/M2 of decision
2026-11-14-05 made its refusals honest). With a decanter the free variable is the distillate flow, the parameter that
decision 2026-11-18-01 found poor near the dry end; for the entrainer columns the outer loop refused even the easy case
(F9 below): its first trial column, at D = 50 mol/s, did not converge, so it stopped there.

Now (`specifications.js`, header "Which path each specification takes"):

| Specification | Path |
|---|---|
| a column with a decanter and one bottoms purity (mole or mass basis), no side draw | **among the MESH equations** (new); if that does not converge, the outer loop as before, its `tried` starting with this attempt |
| every other: any column without a decanter, a distillate purity with a decanter, a recovery, a component flow, a stage temperature, two specifications, side draws | the outer loop, unchanged |

No existing test reaches the new path (checked by logging every call during `npm test`: only the new test file does),
so every existing column keeps its path and answer.

## What was built

`src/units/columns/engine.js`: a specification kind `bottoms_fraction` (MESH_SPECS, set only by specifications.js) whose
row is written on the reboiler's row in place of its energy balance:

    ln(x_B,i / value) = 0        (x_B,i the bottoms' mole fraction; on the mass basis its mass fraction)

That is DWSIM's form: its Naphtali-Sandholm solver writes a component-fraction specification of the reboiler as
`spfval2 = Log(xc(ns)(spci2) / spval2)` in place of the reboiler's energy row `H(ns)` (DWSIM, GPL-3.0,
DWSIM.UnitOperations/UnitOperations/RigorousColumnSolvers/NewtonRaphson.vb, block "handle user specs", branch
"windows", https://github.com/DanWBR/dwsim, read 2026-11-18). Two differences, stated: DWSIM divides the row by the
specified value (a scaling; CHEPTA tests each row against its own tolerance, so it is not needed), and DWSIM's reboiler
fraction reads the condenser's basis (`_specs("C").SpecUnit`), a slip not copied. The ChemSep Book (H. A. Kooijman and
R. Taylor, 2nd ed., 2006, public domain, http://www.chemsep.org/downloads/docs/book2.pdf, section 13.2.4 "Special
Stages", p. 195, read 2026-11-18) lists among the specification equations that the condenser and the reboiler add "the
mole fraction of a given component in either the distillate or bottoms product stream". The row uses the reboiler's
own variables, so the Jacobian stays block-tridiagonal; nothing else in the Newton system changed (the condenser rows,
where proposal 0026 works, are untouched).

The start: the purity fixes no product flow, so the bubble-point starts take the outer loop's estimate of the
distillate, and the entrainer start of step 1 takes the distillate from the specified component's balance between the
decanter's distillate liquid and the bottoms asked for ("selected so that the material balances are (approximately)
satisfied", Bekiaris 1995, section 4.4.5, as for step 1). The order of the starts is step 1's.

Tried and not kept:
- a distillate purity with a decanter, among the MESH equations by the overall balance: asked for F9's own distillate
  water (0.2589) it converged to another column, 3.2 mol/s apart in the bottoms. The decanter's distillate is a liquid
  of a three-phase state and hardly moves along a column's branch, so its purity hardly fixes the column. It stays on
  the outer loop;
- moving the entrainer start's top vapour off the azeotrope until the decanter closes the balance (for 1.17 %
  cyclohexane): no case converged that did not before.

## Validated

New cases (validation/data/columns/vll/), each against the independent reference on ChemSep's three-phase stage with
its own purity row (`validation/python/reference_mesh_vll.py --purity`, written from the definition; fixture
`validation/fixtures/columns-vll-purity.json`; started from the engine's profile, perturbed; 5 Newton steps each, scaled
residual below 1e-14). The engine is within F1's tolerances on every stage, liquid, product and duty
(`test/columns-purity-mesh.test.js`, 11 tests). NRTL with the default sets, 101.325 kPa, 100 mol/s saturated liquid,
the organic liquid refluxed.

| Case | Specification | Engine | The column |
|---|---|---|---|
| F9 (F6's: 20 stages, feed on 5, 12 % water, 3 % cyclohexane) | 3 mol % water in the bottoms | 17 iterations (outer loop before: refused) | B = 60.69 mol/s, bottoms 0.38 % cyclohexane, two liquids on stages 5-10 (F6's steady state) |
| F10 (F7's: 30 stages, feed on 10) | 2 mass % water | 11 iterations (outer loop before: refused) | B = 66.14, bottoms 4.996 mol % water, one liquid on every stage (F7's) |
| **F11: the dehydration column, 30 stages, feed on 10, 12 % water, 3.3 % cyclohexane** | **0.1 mol % water** | 12 iterations, about 25 s | B = 54.00, bottoms 99.76 % ethanol, 0.137 % cyclohexane; two liquids on stages 10-11 |
| **F12: the same, 40 stages** | **0.1 mol % water** | 14 iterations | B = 54.02, bottoms 0.144 % cyclohexane; two liquids on stages 10-21 |

Why 0.1 mol % (not mass %): the column's balances, the decanter's lever rule and the feed are molar, and the value
recommended in decision 2026-11-18-03 (question 3) was 0.1 mol %; it is about 0.04 mass %. The mass basis works too
(F10).

## What converges and what does not (scratch runs, not committed; the engine's own starts)

Converges, besides the cases above: 30 and 40 stages with 3.5 % cyclohexane and 0.1 mol % water (B = 54.04, bottoms
0.52 % cyclohexane, 12-13 iterations); F10's column stepped from 5 % down to 1.6 mol % water, each column started from
the last.

Does not converge (each attempt 20-150 s, then the outer loop's first trial fails too):
- the near-dry column with **1.17 % cyclohexane** (12 % water), 0.1 mol % water in the bottoms: 20 stages (feed on 5
  and on 10), 30 and 40 stages (feed on 10); nor 0.1 mass %, nor milder purities (1, 8, 9.5, 10 mol %);
- with 3.25 % cyclohexane at 20 and 30 stages, and with 3.3 % or 3.5 % at 20 stages (feed on 5 or 10);
- **F4's column with 1 % and 2 % cyclohexane** (10 % water, 20 stages, feed on 5): with B = 80 unchanged (not
  converged, as decision 2026-11-18-03); with a bottoms purity of 0.1, 2 and 8 mol % (1 %) or 0.1, 2 and 6 mol % (2 %):
  not converged.

## Why the 1.17 % column does not converge, and why arc-length continuation is not built

On every branch the engine reaches, the decanter's distillate liquid stays at nearly one composition (about water
0.257-0.260, cyclohexane 0.070-0.072 on F10's column, within 0.003 while the bottoms' water goes from 3 % to 1.6 %), so
the distillate takes cyclohexane and water in a ratio of about 0.27. The bottoms can be dry only if the feed brings at
least that ratio (12 % water: 3.25 % cyclohexane). With less, the cyclohexane runs out of the bottoms first:

- F10's column (3 % cyclohexane, ratio 0.25), the bottoms' water lowered step by step: the bottoms' cyclohexane falls in
  a straight line (0.579, 0.242, 0.067, 0.033, 0.0006 mol/s at 5, 3, 2, 1.8, 1.6 % water) and reaches zero at about
  1.60 %; below, no column of that branch (tested in test/columns-purity-mesh.test.js);
- the feed's cyclohexane lowered at 5 % water in the bottoms: the branch ends near 2.5 % cyclohexane in the same way;
- with 3.3 % (ratio 0.275) the near-dry column converges at once (F11, F12); with 3.25 % (at the limit) it does not.

The purity does not turn along these branches: it falls monotonically to the end, where a component's flow in the
bottoms reaches zero. The "turning points" of decision 2026-11-18-01 (the steps in B shrinking without bound where the
bottoms' cyclohexane goes to zero) are this same end. Pseudo-arc-length continuation passes a turning point, where the
parameter reverses along a branch; it does not pass the end of a branch at a physical bound (a flow of zero; with the
engine's logarithmic flows, an asymptote). So it would not carry these branches to dry bottoms with 1.17 %
cyclohexane, and it was not built. Parametric continuation in a specification (The ChemSep Book, section 13.5.4,
p. 223, and 13.5.6: "parametric continuation was invoked to solve any problems that involved non-standard
specifications") is what the step-by-step runs above did by hand; it reaches the same end.

Whether a column with 1.17 % cyclohexane and dry bottoms exists on another branch (a distillate with more water and less
cyclohexane, from a top vapour away from the azeotrope) is not shown either way: no start found one. In the open
literature's flowsheets the entrainer is recycled at about the feed's flow (the ProSim example, decision 2026-11-18-01),
not fed at 1 %: the makeup is small, the entrainer in the column is not.

## Questions for the maintainer (recommendations)

1. Accept the bottoms purity among the MESH equations for columns with a decanter, with the outer loop kept for every
   other specification? **Recommended: yes.** It is DWSIM's row, and it converges the entrainer columns the outer loop
   refused (F9, F10) and the near-dry column (F11, F12).
2. Arc-length continuation: not built, because the columns it was meant to reach end at a component's flow of zero,
   not at a turning point. **Recommended: do not build it now.**
3. The dehydration validation case: F11 (30 stages, 12 % water, 3.3 % cyclohexane, 0.1 mol % water in the bottoms)
   instead of the 1.17 % specification, which has no column on the branches found? **Recommended: yes.**
4. For a small makeup (1-2 % cyclohexane, as F4 with 1 % and 2 %): the entrainer recycle that real flowsheets use (a
   second feed of organic liquid at the top, or the decanter option of decision 2026-11-18-01, question 3).
   **Recommended: ask CHEPTA-Lab first, as already decided for the decanter option.**
5. A distillate purity with a decanter stays on the outer loop (it hardly fixes the column). **Recommended: yes.**

## Rules kept

- No validation data or existing test changed; four new cases, a new fixture and its starts, a new test file.
- `npm test`: 1802 tests, 1798 pass, 0 fail, 3 skipped, 1 todo (the UNIQUAC ternary azeotrope test, as before); 11 in
  test/columns-purity-mesh.test.js. Lab's columns 5 and 11 (test/columns-lab-requests.test.js,
  test/columns-lab-column11.test.js) pass unchanged.
