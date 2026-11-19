# 0025: Heterogeneous azeotropic columns: an entrainer start and continuation past turning points

- **Status:** Accepted (the maintainer, 2026-11-18: step 1, the entrainer start, first; then step 2). Step 1 built
  2026-11-18 (docs/decisions/2026-11-18-03-entrainer-start.md); step 2 built 2026-11-18 as the bottoms purity among
  the MESH equations, arc-length continuation not built (docs/decisions/2026-11-18-07-purity-in-mesh.md)
- **Author(s):** coding agent for the maintainer (2026-11-18)
- **Discussion:** the pull request of branch `claude/vll-columns-rigorous`; docs/decisions/2026-11-18-01-vll-columns-rigorous.md
- **Roadmap item:** proposal 0024 (two liquids in columns), the follow-up of its question 2

## Problem

The maintainer (2026-11-18): "i want the columns to calculate rigously LLV also . Like in ASpen they do with RadFrac.
Check how that is done maybe the solution is simpler". The stage model already is RadFrac's (docs/decisions/
2026-11-17-01-two-liquid-columns.md), and on 2026-11-18 the three-phase flash was fixed near the ternary
heteroazeotrope of water + ethanol + cyclohexane (all 11 tie lines of Gomis et al. 2005 now solve). The classic
entrainer column still does not converge from the engine's own starts: ethanol dehydration with cyclohexane, a
decanter at the top, the organic liquid refluxed, the top near the heteroazeotrope, dry ethanol at the bottom.

What was found on 2026-11-18 (NRTL, default sets, 101.325 kPa, 100 mol/s of saturated liquid feed, the bottoms flow
specified; scripts in the decision file):

1. **The cold start cannot see the entrainer.** With a makeup of about 1 mol % of cyclohexane the bubble-point start's
   condensate holds one liquid at every start reflux, so the decanter has nothing to split and every start is refused.
2. **The reflux is fixed by the decanter, not chosen.** With only the organic liquid refluxed and the decanter at the
   condensate's bubble point, the reflux ratio is the lever rule of the top vapour's tie line: about 1.39 on every
   converged column (top vapour near the model's ternary azeotrope, water 0.157, ethanol 0.324, cyclohexane 0.520).
3. **Dry ethanol needs the feed to match the aqueous liquid.** The aqueous distillate must carry all the water and all
   the makeup: the feed's cyclohexane-to-water ratio must be the aqueous liquid's near the azeotrope (0.037 : 0.356 in
   the model), so about 1.2 mol % of cyclohexane with 12 mol % of water, and D close to 34 mol/s. A specification away
   from that has no solution with dry bottoms.
4. **Turning points and two steady states.** By continuation from F4's column (20 stages, feed on 5) in the feed and
   the bottoms flow, every path ends where the cyclohexane in the bottoms goes to zero: the step in B shrinks without
   bound (B = 57.5 mol/s with 3 mol % of makeup, 61.2 with 2.6 %), the sign of a turning point. At the same
   specification (12 % water, 3 % cyclohexane, B = 61 mol/s) the engine reaches two different columns: by the
   continuation, bottoms with 3.1 % water and 0.4 % cyclohexane and two liquids on the stages; from a start built at the
   heteroazeotrope, bottoms with 3.9 % water, no cyclohexane and one liquid on every stage. Multiple steady states of
   heterogeneous azeotropic columns are a known feature of these columns; the source is to be cited from an open copy
   in step 1 (not opened on 2026-11-18, so not cited here).
5. At the consistent dry-ethanol specification (30 and 40 stages, feed on 10, 12 % water, 1.17 % cyclohexane,
   B = 66.0 mol/s) Newton from the heteroazeotrope start stops ("the residual stopped falling", 64-71 iterations).

So the engine's equations are right (the stage is RadFrac's, checked against ChemSep's three-phase stage), but its
solution path cannot reach the dehydration column: the start does not hold the entrainer, and a product flow is a bad
parameter near a turning point.

## Proposal

Two additions to the column solver (src/units/columns/engine.js), both a start or a path, not a new solver:

1. **An entrainer start for a decanter.** Where every bubble-point start's condensate holds one liquid, a start built
   at the minimum-boiling heterogeneous azeotrope reachable from the feed (the residue curve's end, as
   test/columns-heteroazeotropic.test.js finds it): the decanter's liquids on its tie line, the reflux by the lever
   rule, the rectifying stages from the azeotrope to the feed and the stripping stages from the feed to the bottom
   product of the mass balance, temperatures at the bubble points (the three-phase flash), flows at constant molar
   overflow. Tried on 2026-11-18 by hand: it converges where the bubble-point starts are refused (point 4 above).
2. **Continuation that passes turning points**: pseudo-arc-length continuation (Keller) in the specification, the
   column's own Newton Jacobian bordered by the arc-length equation, from a column that converges (the entrainer start,
   or F4-like feeds with more entrainer) to the one asked for. With a purity specification on the bottoms (the
   cyclohexane or water in it) written among the MESH equations in place of the reboiler's energy balance, as DWSIM
   does (specifications.js, header), the dehydration column has a well-conditioned parameter near the turning point;
   that is the alternative to arc-length if it suffices.

Not proposed: RadFrac's inside-out algorithm (Boston and Shah 1979; The ChemSep Book, 2nd ed., section 13.7.1). Its
outer loop was tried on 2026-11-18 inside the Newton solver and not kept (decision 2026-11-17-01); an inside-out
solver is a new solver, and the problem found here (start and turning points) is not one it removes by itself:
three-phase RadFrac still asks for initial estimates and a "key component" of the second liquid.

## Engineering basis

- Stage model: unchanged (ChemSep's three-phase stage, eqs. 13.35-13.44; checked within 1e-10 K on F3, F4, F5).
- Arc-length continuation: H. B. Keller's pseudo-arc-length method, open description to be cited from an open text in
  step 2 (for example a free book or lecture notes; none opened on 2026-11-18).
- Step 1's sources (opened 2026-11-18; docs/decisions/2026-11-18-03-entrainer-start.md): the initial profile of a
  heterogeneous azeotropic column for a simulator, N. Bekiaris, Multiple Steady States in Distillation, PhD thesis,
  Caltech, 1995, section 4.4.5 (free to read, https://resolver.caltech.edu/CaltechCDSTR:1995.016), and The ChemSep Book,
  2nd ed., section 13.4.10; multiple steady states, Bekiaris 1995, chapters 3 and 4, and The ChemSep Book, section 1.6.5.
- Validation: validation/python/reference_mesh_vll.py --three-phase on each converged column (its own Newton from the
  engine's profile, perturbed), as for F4; both steady states of point 4 checked there; the decanter's liquids on the
  model's tie line (as F4's test does). A published worked example: the ProSim example "Heterogeneous azeotropic
  distillation" (free to read, all rights reserved; Mod. UNIFAC Dortmund, a flowsheet with a second column and
  recycles) is a qualitative comparison only (dry ethanol at the bottom, the top near the ternary azeotrope); no open
  column profile with measured data is known (proposal 0024's search, 2026-11-14).

## Effect on existing work

Both run only where every start fails today, so every column that converges now keeps its path and answer (the rule
of decision 2026-11-17-01 for the weighted continuation).

## Alternatives considered

- A user-side continuation (a flowsheet of design steps): works by hand (point 4) but is not "the column converges".
- Refluxing part of the aqueous liquid, or an entrainer recycle feed at the top (ProSim's flowsheet): removes the
  reflux bound of point 2, but is a different column; a decanter option to reflux a share of the other liquid could be
  a small addition (a question for the maintainer).

## Steps

1. The entrainer start, with the 30-stage dehydration column as the validated case against the three-phase
   reference; the open source on multiple steady states cited.
2. Arc-length continuation (or the purity specification among the MESH equations), with both steady states of
   point 4 as tests.
