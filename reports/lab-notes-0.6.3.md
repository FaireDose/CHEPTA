# CHEPTA 0.6.3 for CHEPTA-Lab

Release 0.6.3 is on npm. Commit v0.6.3 = b6598a5, main as of 2026-11-27. Pin `chepta@0.6.3`.

**Do not re-run the 0.6.2 tests to compare.** The maintainer says it is not needed. The comparisons are already done
and recorded: Lab PR #25, plus the CHEPTA decision files named below. Run only the new cases, and the plant cases where
the advice below changes the input.

The syntax of every input is in `docs/models/columns.md`, `docs/models/flowsheet.md`, `docs/models/tools.md` and
`ai/skills/chepta/SKILL.md` at v0.6.3. Each item below names its decision file in `docs/decisions/`.

## What Lab can now do

| # | Feature | Example (Lab's own case where there is one) | Decision |
|---|---|---|---|
| 1 | **Faster plant runs.** Columns restart from their last profile (`solver.columnRestart`, default `"previous"`; `"cold"` is 0.6.2's path). Purities and recoveries are solved inside the column's MESH equations. Second-liquid tests are cheaper. The design-spec search is faster. | Ethyl acetate plant, design spec "0.04 % ethanol in S16 by varying F1": 108 min and 8 solves on 415da41, now **249 s and 3 solves**. The answer is F1 = 6,506.34 kg/h, ethanol 0.04086 %. A fixed-feed re-run at a recycle tolerance of 1e-7 agrees to 1.8e-6. | 2026-11-25-03, 2026-11-26-01 |
| 2 | **Time limit and timing.** `solver.timeLimit_s` stops a run and reports where it was and the best point so far (`error.details.best`). Every result has `run.timing`: time per block and design-spec evaluations. | The same case's timing: SCDS15 99 s, SCDS11 119 s, SCDS5 23 s. | 2026-11-25-03 |
| 3 | **Short run summary.** `node bin/chepta.mjs request FILE --summary` writes the full result to `FILE.result.json` and prints a summary that keeps every warning verbatim. `chepta summary RESULT.json` summarises a saved result. **Agents should read the summary first.** | The ethyl acetate result goes from 379 KB to 17 KB (14 KB with `--compact`), with all 35 warnings kept. | 2026-11-27-02 |
| 4 | **Design specifications** (`designSpecs`: vary a block's number to hit a stream target, with bounds; Brent's or Broyden's method). Clear failures: `unreachable` (with the nearest value), `limit`, `undefined`, `discontinuous`. | The ethanol design spec above. | 2026-11-14-04 |
| 5 | **A design spec can vary a column's number:** `distillate_kmol_h`, `reflux_ratio`, `boilup_ratio`, `reboiler_duty_kW`, `condenser_T_K`, `vapour_distillate_kmol_h` (Lab request 16). | Column 11's distillate varied in [235, 260] kmol/h for 99.90 % ester in S16. **Not reachable**: the best is 99.19 % at 260 kmol/h alone, and 99.79 % with F1 varied too. The answer says so with the nearest point. | 2026-11-26-08 |
| 6 | **The full column specification package** (proposal 0029). Condenser: `reflux_kmol_h`, `distillate_to_feed`, `subcooling_K`. Reboiler: `reboiler_T_K`. Side draws by share, or with their rate found. `stage_duties_kW`. Stage temperature, `component_ratio`, `flow_ratio`. `pumparounds`. Also in the workbench form and project format 12. | Column 15 fixed by a stage temperature or by a ratio of two flows, instead of a purity that every column exceeds. | 2026-11-26-09 |
| 7 | **Vapour + liquid condenser** (`condenser: "vapour_liquid"`), fixed by its temperature, its vapour flow or its vapour share. `product: "vapour_distillate"` in design specs. Also in the workbench. | A methanol column with light gases leaving as vapour from the condenser. | 2026-11-18-05/06, 2026-11-19-01 |
| 8 | **Two liquids in columns.** A warning when a feed holds more than 1 mol % of a second liquid (`FEED_TWO_LIQUIDS`, "put a decanter"). `feed_second_liquid: "stages" \| "top" \| "bottom"`. A rigorous three-phase stage (`two_liquid_stage: "split"`, or `"smooth"`). Entrainer start for columns with a decanter. A bottoms purity among the MESH equations. | Column 11 with acetic acid; the water + ethanol + cyclohexane entrainer column with a decanter. | 2026-11-14-07, 2026-11-17-01, 2026-11-18-01/03/04/07 |
| 9 | **Minimum approach along the whole exchanger**: an exchanger given by `dTmin_K` now holds it everywhere along the exchanger, not only at the zone boundaries. The result's `dT_min_K` is the true smallest difference; `dT_min_zones_K` keeps the boundary value, with a note where the two differ. | HE5 of the methanol plant at 2 K now solves **without `zones: 10`**. | 2026-11-25-04 |
| 10 | **PR + gE (MHV1) with nitrogen:** `thermo: { model: "PR", mixing: "MHV1" }`. It now has N2 + water and N2 + methanol sets. SRK + MHV1 is still refused for CO2 + water. | Lab's separator FLASH3 (30 °C, 69.25 bar) with N2 runs: 2.38 % CO2, 0.42 % H2 in the liquid. | 2026-11-25-01 |
| 11 | **Strict range mode refuses** (`solver.strictRanges` / `options.strictRanges`), also inside recycle loops (request 17). `missingPairs` are reported in flowsheets. | The heater feed at 15 °C, ethanol + water + ester + acetic acid (UNIQUAC): now `missing_data` instead of `ok` with six extrapolations. | 2026-11-14-06, 2026-11-20-03 |
| 12 | **Recycle and balance.** Plateau safeguards. The plant's material balance has its own tolerance (`solver.balanceTolerance`), no longer 1 % of the feed. In design-spec solves a recycle is accepted from its second pass. | The ethyl acetate plant that plateaued at relative change 1.3e-3 now converges; a 0.42 kmol/h ester imbalance is no longer passed. | 2026-11-14-08, 2026-11-18-02 |
| 13 | **Column fixes from Lab's 0.6.2 and 415da41 requests**: 8, 13/M2, 14, 17, 19, and the purity that every column exceeds (request 19) now gets the right advice. | Column 15 alone, 18 stages, R 2, 99.99 % water asked in the bottoms. | 2026-11-14-05, 2026-11-20-03 |
| 14 | **CO2 below its triple point** no longer gets a liquid "normal boiling point". | CO2's report no longer shows the false −88 °C. | 2026-11-13-07 |

## The CO2 answer (methanol separator, Campos et al. 2022)

**The paper's 18.5 mol % CO2 in the separator liquid (stream 24) is not physical.** Measured data put it at about
2-3 mol %. PR with k_ij gives 3.4 %, which is too high. PR + gE (MHV1), which follows the measured data, gives
**2.4 %** with N2 present.

- Xia et al. 2004, CO2 in 1:1 methanol + water at 313.75 K, 221 points: under 7 MPa of nearly pure CO2 the liquid
  holds only 10.8 % CO2. In the separator, CO2's partial pressure is only about 1.4 MPa.
  doi:10.1021/je049803i, open data at https://trc.nist.gov/ThermoML/10.1021/je049803i.html
- Bezanehtak et al. 2004, CO2 + H2 + methanol, 142 points: under 70-73 % H2 gases at 4-7 MPa, x_CO2 = 0.066-0.115.
  doi:10.1021/je0301491, https://trc.nist.gov/ThermoML/10.1021/je0301491.html
- Xie et al. 2005: doi:10.1021/je0498614, https://trc.nist.gov/ThermoML/10.1021/je0498614.html
- The paper's liquid has more CO2 than its own feed (18.5 % against 17.9 %), which gives a K value below 1. The data
  give K ≥ 2.3.

How the methods do against those data:

| Method | 1:1 solvent | All 221 points of Xia 2004 | Bezanehtak 2004 | Separator x_CO2 |
|---|---|---|---|---|
| PR (k_ij) | +77 % | 32 % | P +132 % | 3.41 % |
| PR + gE (MHV1) | +9 % | 7.9 % | 12 % | **2.38 %** |
| The paper (NRTL, its own parameters) | | | | 18.5 % |

Details: decisions 2026-11-20-01 and 2026-11-25-01, section 5.

## Advice for Lab's cases

1. **Do not tune toward the paper's CO2 recycle.** The paper's 18.5 % makes its CO2 recycle 86 % smaller than a
   physical one. Compare the paper's other numbers and report this difference with the sources above.
2. **Move the methanol separator, and the methanol cases, to PR + gE (MHV1)**: `thermo: { model: "PR", mixing: "MHV1" }`.
   Known limit: the *closed* methanol plant on PR + MHV1 still stops before the column. It stops at MIXER1 with
   "PR: no physical root at 84.2 K" and at CP3 with PHASE_SPLIT at 300 K and 7000 kPa. This is CHEPTA's first 0.6.4
   item. Report what you see; do not work around it.
3. **Respecify column 15 by what matters.** Do not ask for a purity that every column exceeds (99.99 % water in the
   bottoms). Use a stage temperature, a component or flow ratio, a recovery, or the reboiler temperature (feature 6).
4. **HE5: drop the `zones: 10` workaround.** `dTmin_K: 2` now holds along the whole exchanger (feature 9).
5. **Ethyl acetate, 99.90 % ester:** not reachable by column 11's distillate. Report the nearest values (99.19 %, and
   99.79 % with F1 varied too). Do not widen the bounds to force it.
6. Use `--summary` for every run and keep the full result file.

## Known limits in 0.6.3 (CHEPTA works on these in 0.6.4)

- PR + MHV1 closed methanol plant: stops at MIXER1 and CP3 (see advice 2).
- `plant-vl-boilup` still fails.
- SRK + MHV1 is refused for CO2 + water (no set that meets the gate).
- The N2 + water MHV1 set carries a fit-quality warning (5.4 % in P against a 5 % gate). The maintainer has not yet
  done the rule-4 check of its copied rows.
