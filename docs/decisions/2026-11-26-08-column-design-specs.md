# 2026-11-26-08: a design specification varies a column's numbers (CHEPTA-Lab's request 16)

For release 0.6.3 (the maintainer: all of Lab's points go in 0.6.3). Built on proposal 0028's branch (decision
2026-11-26-01), with proposal 0027's column restarts.

## What was asked

Lab's runs stopped at once with `BAD_INPUT`: "Column SCDS11's "distillate_kmol_h" cannot be varied by a design
specification (Column: none yet)". Lab wanted column 11's distillate varied in [235, 260] kmol/h for 99.90 mass % ethyl
acetate in the product (stream 16), alone and together with the ethanol feed F1 for 0.04 % ethanol.

## What was built

1. **A column's numbers can be varied** (`src/flowsheet/design-specs.js`; `variableColumnKeys` in
   `src/units/columns/column.js`). These are the numbers the column's mode and configuration use:
   - rigorous distillation: `reflux_ratio`, `boilup_ratio`, `distillate_kmol_h`, `bottoms_kmol_h`, `condenser_duty_kW`,
     `reboiler_duty_kW`;
   - with condenser "vapour_liquid", also `condenser_T_K`, `vapour_distillate_kmol_h` and `vapour_share`;
   - a side draw's flow (`key: "side_draws"`, `index`);
   - shortcut: `reflux_ratio`, `reflux_over_minimum` and the two key recoveries;
   - absorber or stripper: a stage duty (`stage_duties_kW`, `index`) and a reboiled stripper's own specification.

   The number must already be in the column's specification. Adding one would give the column one specification too
   many, so that is refused with the column's present specifications named. A key the column keeps but its mode does
   not use (the shortcut's keys in a rigorous column) is refused too. Each solve starts the column from its answer at
   the nearest solved point (0027's restart, kept per solve by 0028).
2. **Several specifications at once** work as before (Broyden's method). Tested on a column with its distillate flow
   and reflux ratio varied for two purities.
3. **A target out of reach** is said after the start, one step and the two bounds, with the nearest value reached
   (`details.nearest`). Before, the doubling steps came first. Two changes to the bracketing do this:
   - where the secant step's estimated root lies beyond a bound, that bound is solved next (before: a quarter of the
     range at most);
   - once the target has come closer all the way to a bound without crossing it, the other bound is solved at once
     (before: doubling steps back from the start).

   The message keeps its old wording and adds "the nearest it came is ..., at ...".
4. **The first step is at least 100 times the recycle tolerance**, relative to the input's value, and at most a quarter
   of the range. This covers both the bracketing step and the finite-difference step of Broyden's Jacobian. Before, the
   step was 1 % of the range. On Lab's plant (recycle tolerance 1e-5) that was 0.25 kg/h of a 6,511 kg/h ethanol feed.
   It moved the product's ethanol by 4e-10, where the converged solves give a slope of 8e-5 per kg/h (2e-5 expected),
   so Broyden's method went the wrong way. The step is still 1 % wherever the recycle tolerance is the default, 1e-8,
   and on every test of the suite.

5. **A design specification's solve accepts a slow recycle only once it has really converged** (`settled` in
   `src/flowsheet/flowsheet.js`; asked by the coordinator after checking #272). A solve starts from a solved point at a
   nearby input. A slow loop then changes by less than the tolerance in its first pass, so it was accepted, and the
   design specification read the old answer. Now, in a design specification's solves only, a pass below the tolerance
   counts from the second pass on, and only where the error left is below the tolerance too. The error left is
   estimated from the rate r of the last two passes: err r / (1 - r), the rest of a geometric series. Plain flowsheet
   solves are unchanged.

   A lighter rule (two passes, both below the tolerance) was tried on Lab's ethanol case and is not enough: the solve at
   6,506.229 kg/h was again accepted after 2 passes in 1 s, and Brent's method needed 7 solves.
6. **At Broyden's iteration limit, an input held at its bound is named** when the next step would push it further out
   (reason "unreachable", `details.pinned`). Before, the message only said to raise the limit.

## Tests

`test/design-specs-column.test.js` uses a methanol + water column (NRTL, ideal vapour). Each answer is compared with
the column's own design specification, a different algorithm (Newton's method with the specification among the
column's equations):

- the distillate flow varied for 2 mol % methanol in the bottoms: the same flow as the column's bottoms purity, within
  1e-4 kmol/h; a solve with the found flow fixed gives the same bottoms;
- a side draw's flow: the same flow as the column finds with the draw's flow left free;
- the distillate flow and the reflux ratio together: the same as the column's two purities;
- the same answer with the column restarted from its last answer or cold;
- a target out of reach: 4 solves (start, step, the two bounds), with the nearest value;
- a slow recycle (1 % purged, direct substitution, recycle tolerance 1e-5): no solve is accepted after one pass, and the
  answer is within 2e-5 of the target in a tight solve. Before item 5: one solve of one pass, 6 solves in all, 2.9e-5
  off;
- two specifications at Broyden's limit with the reflux ratio held at its bound: named, reason "unreachable";
- the refusals (a number not given, a key the mode does not use, a side draw with a free flow, bounds out of range).

## Lab's runs (CHEPTA-Lab main 415da41, inputs unchanged, `--time-ms 3500000`)

With items 1 to 6:

- **Ethanol feed alone, for 0.04 % ethanol** (new-plant-ds-ethanol0.0004, the coordinator's regression check): ok,
  3 solves, 242 s. F1 6,506.34 kg/h, ethanol 0.000409 (residual 8.6e-6, inside the 1e-5 tolerance). The solves ran 6,
  16 and 12 passes. For comparison, the coordinator's runs on the same machine: #271 ok in 4 solves and 208 s (F1
  6,506.22, ethanol 0.000399), and #272 before item 5 ok in 6 solves and 343 s (F1 6,506.11, residual -9.3e-6). The two
  answers lie on one curve: the slope of 8e-5 per kg/h carries 0.000399 at 6,506.22 to 0.000408 at 6,506.34. #271 is
  faster because some of its solves read loops that had not moved (a solve of 0.8 s), not because it is more exact.
- **Column 11's distillate alone, for 99.90 % ester**: "not reachable", 4 solves, 221 s (run beside the next one). The
  ester in stream 16 is 99.090 % at 235 kmol/h, 99.113 % at 240 and 99.190 % at 260: "the nearest it came is
  0.991897, at 260 kmol/h". A plain solve with the distillate fixed at 260 kmol/h (before item 5; 175 s, from the
  document's own start) gives the same product: 12,531 kg/h, 99.19 % ester, 0.73 % water, 0.078 % ethanol. F1 stays at
  the request's 6,511 kg/h, so the ethanol is above Lab's 0.04 %.
- **Distillate and F1 together**: not met, 27 solves, 1,350 s. It ended at Broyden's 20 iterations (before item 6, so
  with the plain limit message) at the distillate's upper bound, 260 kmol/h, and 6,504.07 kg/h: 99.79 % ester and
  0.023 % ethanol. Before item 5 it "stalled" after 14 solves and 320 s, at 99.36 % ester; those solves read loops that
  had not moved. Rerun with item 6 (alone): not met, 28 solves, 1,181 s, reason "unreachable": "with the distillate flow of
  SCDS11 held at its bound 260 kmol/h and the next step going beyond it", the same point and values.

CHEPTA finds what Lab's hand scan found: 99.90 % ester cannot be reached by column 11's distillate in [235, 260]
kmol/h, alone or with the ethanol feed. Together they come closer (99.79 % at the bound) than the distillate alone at
F1 = 6,511 kg/h (99.19 %), because less ethanol also lowers the water. Nothing was tuned toward the target.

## Questions for the maintainer (recommendations first)

1. **The two-specification message when one target alone is out of reach.** Broyden's method says "stalled ... may not
   be reachable together". Recommended: keep it for 0.6.3. Later, when Broyden's method stalls with an input at a bound,
   it could solve each specification alone (at more solves) to name the one out of reach.
2. **The first step tied to the recycle tolerance** (item 4, this project's choice, using the same ratio of 100 as the
   tolerance warning). Recommended: keep it. The alternative is a warning that the step is inside the recycles' noise.
3. **The convergence test of item 5 for every flowsheet**, not only in design specifications. A plain solve from a
   good guess can stop early the same way. Recommended: a separate change. Every flowsheet's pass count would change,
   with the suite's timings and Lab's results.
