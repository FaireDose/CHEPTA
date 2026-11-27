# 0029: The full set of column specifications (condenser, reboiler, side streams, the whole column)

- **Status:** Accepted (the maintainer, 2026-11-26: "all steps in one go"; the other recommendations as proposed); built, see docs/decisions/2026-11-26-09-column-spec-package.md
- **Author(s):** Claude (coding agent), for the maintainer
- **Discussion:** the maintainer, 2026-11-26: "About the condenser, before that have a quick research on more
  possibilities as what we can put as specs inside the column and here I mean to take it together with reboiler and
  condenser, side streams and everything else so we have a full package; in fact make this also part of M6 and start
  it." The research: [research_notes/column-specifications/](../research_notes/column-specifications/README.md).
  Decision file: docs/decisions/2026-11-26-09-column-spec-package.md.
- **Roadmap item:** the rigorous column (milestone M4, design specifications); CHEPTA-Lab's request M6

## Problem

A column in CHEPTA takes its two specifications (one with a decanter) from a short list: reflux ratio, boil-up ratio,
distillate or bottoms flow, condenser or reboiler duty; the vapour + liquid condenser one more (its temperature, its
vapour flow or its vapour share); and, as design specifications, purity, recovery, component flow and stage
temperature. Proposal 0028 put purity, recovery and component flow among the MESH equations when a restart profile
exists; the cold first call and the stage temperature use the outer loop of trial columns.

What is missing or slow, by place (the table in the research note):

- **Condenser:** no reflux flow; no subcooling; the temperature of a total or partial condenser only as an outer-loop
  stage temperature; and (M6) the vapour + liquid condenser given by its temperature did not converge cold on Lab's
  plant feed, while the same column given by its vapour share did.
- **Reboiler:** its temperature only as an outer-loop stage temperature.
- **Side streams:** a draw only as a rate (not as a share of the stage's liquid or vapour); a draw whose rate is found
  for a purity only by the outer loop; no pumparound; no side heater or cooler on a distillation column
  (`stage_duties_kW` is refused there, it is the absorber's and the stripper's).
- **The whole column:** a stage temperature only by the outer loop; no ratio of two components in a product, no ratio
  of two flows.

Who is affected: everyone who builds a column the way the open simulators let them (ChemSep, DWSIM: the research note),
and CHEPTA-Lab's plants, whose columns sit inside recycles, where every outer loop multiplies the time.

## Proposal

One package, built in steps, each its own pull request with its tests. The rule throughout is 0028's: a specification
goes among the MESH equations where that is sound, in place of the energy balance of the end it frees, or as one more
row of a stage; the outer loop stays for the cold first call where the continuation cannot hold the specification, and
as the fallback when the MESH form does not converge.

Which specifications are sound cold: those that fix a variable of the stage they are written on (a temperature, a
flow, a ratio, a duty) do not fight the continuation in the volatilities (its first column has no separation, but it
has temperatures and flows). Those that fix a composition (purity, recovery, component flow, a ratio of two
components) cannot be held by it (The ChemSep Book, 2nd ed., section 13.5, p. 224): MESH from a profile, outer loop cold.

| Step | What | Keys (proposed) | Where solved |
|---|---|---|---|
| 1 (built) | **M6**: the vapour + liquid condenser given by its temperature reached from a column at a vapour share; the start's bubble point of an equation of state taken without its liquid-stability test (a start value only); the message names the share | none new | MESH; the new path last |
| 2 | **Condenser**: reflux flow; the temperature of a partial condenser; the temperature of a total condenser; subcooling of a total condenser; the distillate as a share of the feed | `reflux_kmol_h`, `condenser_T_K` (partial, total), `subcooling_K`, `distillate_to_feed` | reflux flow, partial condenser's T, distillate share: MESH cold. Total condenser's T (its bubble point: a composition): MESH from a profile, outer loop cold. Subcooling: no new row (the reflux and distillate enthalpies at T_b - dT, as DWSIM) |
| 3 | **Reboiler**: its temperature | `reboiler_T_K` | MESH cold (the reboiler is an equilibrium stage; the temperature is its own variable) |
| 4 | **Side streams**: a draw as a share of the stage's liquid or vapour; side heaters and coolers on a distillation column; a draw whose rate is found for its own purity, recovery or component flow among the MESH equations (the rate one more variable of its stage, the specification its row: the band does not widen) | `side_draws[k].share`, `stage_duties_kW` on a distillation column | MESH cold (share, duties); MESH from a profile (a draw found for its purity) |
| 5 | **The whole column**: a stage temperature among the MESH equations, in place of the energy balance of an end it frees (the band widens to that stage, as 0028's side-draw rows); a ratio of two components in a product; a ratio of two flows of the column (reflux to feed, a draw to the distillate) | `stage_temperature` (unchanged key), new design specifications `component_ratio`, `flow_ratio` | stage temperature: MESH from a profile, outer cold (its stage's T moves far in the continuation); component ratio: as a purity; flow ratio: MESH cold |
| 6 | **Pumparounds**: a liquid drawn from stage j at a given rate, cooled by a duty or to a temperature, returned to stage k above it | `pumparounds: [{ from, to, flow_kmol_h, duty_kW \| return_T_K }]` | MESH: the two stages coupled in the material and energy balances (the band widens to j - k + 1 stages for every step). Cold: the column without it, then the rate brought up in steps, each from the last (ChemSep's own advice, The ChemSep Book, pp. 215-216) |
| 7 | **The workbench and the documents**: every new key in the Column form, the flowsheet document format, the design specifications' list of numbers they may vary (`variableColumnKeys`), and the docs | — | — |

Left out, by proposal: property specifications of a product (a density, a boiling point) and Q/F: none of the open
sources read documents them (research note), so their equations would be this project's invention. They can be met
today by a flowsheet design specification (proposal 0022).

### Example (step 2)

CHEPTA-Lab's methanol column with a partial condenser at 53 C and a reflux flow:

```json
{ "mode": "rigorous", "stages": 30, "feed_stage": 24, "P_kPa": 100, "condenser": "partial",
  "condenser_T_K": 326.15, "reflux_kmol_h": 9097 }
```

Stage 1 then carries the row (T_1 - 326.15) / 100 = 0 in place of its energy balance and the reflux row
(L_1 - 9097 / 3.6) / F = 0 in place of the reboiler's, both functions of stage 1's own variables (the reflux flow
written on the other end as DWSIM writes a product flow there; the band is unchanged). A total condenser with
`subcooling_K: 5` leaves its reflux and distillate at the bubble temperature less 5 K: their enthalpies at that
temperature in the condenser's energy balance and in the stage below's, the outlets at that temperature.

## Engineering basis

- The ChemSep Book (H. A. Kooijman and R. Taylor, 2nd ed., 2006, public domain, http://www.chemsep.org/downloads/docs/book2.pdf):
  section 13.2.1 (side streams as ratios to the interstage flow, p. 192), 13.2.4 (the condenser and reboiler
  specifications: product flows, a mole fraction, a component flow, a reflux or reboil ratio or rate, the temperature,
  a duty; p. 195), 13.4 (pumparounds and "non-standard specifications that are not on the variables of the condenser
  and reboiler" put entries outside the block-tridiagonal band; ChemSep solves with a sparse elimination;
  pp. 213-214), the pumparound advice (pp. 215-216), 13.5 (a continuation cannot hold a purity, p. 224).
- DWSIM (GPL-3.0, https://github.com/DanWBR/dwsim, branch `windows`, read 2026-11-26): `RigorousColumn.vb` (the
  specification types, the condenser types, `TotalCondenserSubcoolingDeltaT`, fixed side draws);
  `RigorousColumnSolvers/NewtonRaphson.vb` (each end's specification an equation of the Newton system: Temperature
  `ln(T / value)`, Stream_Ratio `ln(L / LSS / value)`, Feed_Recovery `ln(D / (value F))`, the component specifications;
  the subcooled total condenser's K-values at T - dT); `BubblePoint.vb` (the composition and temperature
  specifications by an outer iteration in the bubble-point solver).
- IDAES-PSE (BSD 3-clause, https://github.com/IDAES/idaes-pse, `idaes/models_extra/column_models/condenser.py`,
  `reboiler.py`, read 2026-11-26): the partial condenser at a temperature given, the reflux ratio and the boil-up ratio
  as equations of an equation-oriented model.
- Validation, for every step: the independent Python reference (`validation/python/reference_mesh.py` and its family)
  gets each new row, written from the definitions above, not from the engine; fixtures of columns with each new
  specification, solved by the reference; the engine's answer within the reference's tolerances; where the same column
  can be given two ways (a reflux flow and the reflux ratio it gives; a reboiler temperature and the boil-up it gives;
  a draw's share and its rate), both give the same column. Step 1's check: case H4 below.

### Step 1 as built (M6)

- `src/units/columns/engine.js`, `viaShare`: after every earlier attempt has failed, for the vapour + liquid condenser
  given by its temperature, the same column is solved at a vapour share s0 (from a flash of the bubble-point start's
  top vapour at the given temperature, within 0.1 % to 99.9 %), with all of the solver's attempts; then the
  condenser's temperature is given in place of the share, from that column's temperature to the one asked for, in one
  step or, where Newton fails from the last column, in halved steps (at most 24 solves, a step down to 1/64 of the way).
  Last, so every column that converged before keeps its path. Why the continuation fails here: its first column has no
  separation, so its top vapour is not partly condensed at 326.15 K, and the temperature row has no solution there
  (it stopped at 0 % of the way).
- `startBubbleT`: with an equation of state, a stage liquid of the start whose bubble point the liquid-stability test
  refuses (PHASE_SPLIT) is taken at that bubble point without the test, as a start value only. The answer's stability
  test of every stage is unchanged. (With PR + MHV1 the first sweeps of the start put a CO2-rich liquid on the
  condenser, at 185 K, where MHV1 predicts two liquids; every column with MHV1 stopped there before Newton.)
- The message of a vapour + liquid condenser that fails: "a large vapour share" only where the last iterate's share is
  above one half, and then with its value; given by its temperature, the advice to give the share or the vapour flow.
- Validation: case H4 (validation/data/columns/vapour-liquid/H4-methanol-a6feed-pr-condenser-temperature.json), Lab's
  column with its plant's feed, solved by `reference_mesh_condenser.py` from the engine's profile (perturbed): the
  engine within 1e-5 K and 1e-6 relative in the flows; and the reference's column at the vapour share of that answer
  is at 326.15 K (the same column). `test/columns-condenser-temperature.test.js`.

## Effect on existing work

No input or output format changes in step 1; the other steps add keys and keep every existing one. Every test kept
unchanged (AGENTS.md rule 6). The new attempts come after the existing ones, so a column that converged before keeps
its path and its answer.

## Alternatives considered

- For M6, the condenser temperature among the MESH equations from a restart profile only: it already is a MESH row; the
  failure was the cold start, so a profile does not help the first call (and Lab's plant failed on its first pass).
- For M6, a secant search on the vapour share for the temperature (an outer loop): several columns where one column at
  the share and one Newton solve at the temperature suffice here.
- For M6, solving at the share first for every temperature-given condenser: faster on Lab's column (about 4 s instead
  of 7 s), but it changes the path of columns that converged before.
- Writing every specification among the MESH equations cold, as ChemSep does: CHEPTA's continuation cannot hold a
  composition (above); the outer loop stays for those cold.
- A sparse solver for the pumparounds and distant rows, as ChemSep's: the band solver already widens to the furthest
  coupled stage (0028); a pumparound across 10 stages makes the band 10 blocks wide, which is still small for 30-80
  stages.

## Steps

As in the table: (1) M6, built in the pull request of this proposal; (2) condenser; (3) reboiler; (4) side streams;
(5) the whole column; (6) pumparounds; (7) workbench and documents. Each with its reference rows, fixtures and tests,
and CHEPTA-Lab's runs before and after where Lab has a case.
