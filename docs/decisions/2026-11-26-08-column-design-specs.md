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
- the refusals (a number not given, a key the mode does not use, a side draw with a free flow, bounds out of range).

## Lab's two inputs (CHEPTA-Lab main 415da41, unchanged, `--time-ms 3500000`)

- **Distillate alone, for 99.90 % ester**: `not_converged`, reason "unreachable", after 4 solves in 228 s. The ester
  mass fraction in stream 16 is 99.082 % at 235 kmol/h, 99.109 % at 240 and 99.190 % at 260: "the nearest it came is
  0.991896, at 260 kmol/h". A plain solve with the distillate fixed at 260 kmol/h (175 s, from the document's own
  start) gives the same product: 12,531 kg/h, 99.19 % ester, 0.73 % water, 0.078 % ethanol. F1 stays at the request's
  6,511 kg/h, so the ethanol is above Lab's 0.04 %.
- **Distillate and F1 together**: `not_converged`, Broyden's method "stalled", after 14 solves in 320 s. It stops near
  235 kmol/h and 6,507 kg/h (99.36 % ester, 0.047 % ethanol). The highest ester of any solve was 99.64 % (240 kmol/h,
  6,504.75 kg/h, with 0.028 % ethanol). With the 1 % step (before item 4) it stalled after 7 solves in 78 s, having
  gone to 6,515 kg/h.

CHEPTA finds what Lab's hand scan found: 99.90 % ester cannot be reached by column 11's distillate in [235, 260] kmol/h.
The water stays in the product. Nothing was tuned toward the target.

## Questions for the maintainer (recommendations first)

1. **The two-specification message when one target alone is out of reach.** Broyden's method says "stalled ... may not
   be reachable together". Recommended: keep it for 0.6.3. Later, when Broyden's method stalls with an input at a bound,
   it could solve each specification alone (at more solves) to name the one out of reach.
2. **The first step tied to the recycle tolerance** (item 4, this project's choice, using the same ratio of 100 as the
   tolerance warning). Recommended: keep it. The alternative is a warning that the step is inside the recycles' noise.
3. **The recycles' false convergence** behind item 4: a recycle that changes slowly per pass is accepted as converged
   after a small change of a feed. Recommended: a separate item for the recycle solver (not built here).
