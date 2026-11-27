# 2026-11-26-09: the full set of column specifications (proposal 0029); step 1, CHEPTA-Lab M6

## What was asked

The maintainer (2026-11-26): "About the condenser, before that have a quick research on more possibilities as what we
can put as specs inside the column and here I mean to take it together with reboiler and condenser, side streams and
everything else so we have a full package; in fact make this also part of M6 and start it."

Three parts:

1. A quick survey of what the open simulators offer: research_notes/column-specifications/README.md.
2. Proposal 0029 (proposals/0029-full-column-specifications.md): the whole package in seven steps.
3. Step 1, Lab's M6, built now. The other steps wait for the maintainer's answers (below).

## The survey in short

- ChemSep (The ChemSep Book, public domain) writes every specification among its Newton equations. That covers product
  flows, a mole fraction, a component flow, a reflux or reboil ratio or rate, the condenser's or reboiler's temperature
  and duty, and non-standard specifications on any stage. For the rows outside the band it uses a sparse solver.
- DWSIM's Newton solver writes one specification per end, also inside the equations. Its bubble-point solver meets
  compositions and temperatures by an outer loop.
- IDAES puts every specification in its one equation-oriented model.
- Aspen Plus and HYSYS: no open documentation was found, so nothing is said about them.
- What CHEPTA lacks:
  - at the condenser: the reflux flow, subcooling, and the temperature of a total or partial condenser among the MESH
    equations;
  - at the reboiler: its temperature among the MESH equations;
  - on side streams: a draw as a share of the stage's flow, side heaters and coolers on a distillation column, and
    pumparounds;
  - for the whole column: a stage temperature among the MESH equations, and ratios of two components or of two flows.

## Step 1 as built (M6)

Lab's column: 30 stages, feed on stage 24, 100 kPa. The condenser is "vapour_liquid" at 326.15 K, with a reflux ratio
of 2 and bottoms of 4581 kmol/h, on PR. It is fed with Lab's converged plant's column feed (CO2 0.2425 %). On main at
415da41 it ended with `NO_CONVERGENCE`, and the continuation stopped at 0 %.

1. **The temperature reached from a vapour share.** This comes after every earlier attempt has failed
   (`src/units/columns/engine.js`, `viaShare`):
   - the same column is solved at a vapour share (from a flash of the start's top vapour at the given temperature:
     0.57 % here);
   - then the temperature is given in place of the share, from that column's temperature, in one step or in halved
     steps.
   
   On Lab's column it takes one step and gives 38.54 kmol/h of vapour at 326.15 K, in about 8 s. Lab's own runs with
   the vapour distillate's flow (38.56) or the vapour share gave 53.005 C. Columns that converged before keep their
   path: the new attempt is the last before the decanter's.
2. **The column's start with an equation of state.** A stage liquid of the start whose bubble point fails the
   liquid-stability test is now taken without the test. This is a start value only: the answer's own test of every
   stage is unchanged. With PR + MHV1, every column of this case stopped there before (a CO2-rich start liquid on the
   condenser at 185 K).
3. **The message.** "A large vapour share" now appears only where the last iterate's share is above one half, and
   says the share. For a condenser given by its temperature, the message suggests giving the share or the vapour flow
   instead.
4. **The checks.**
   - Case H4 in the independent reference, `validation/python/reference_mesh_condenser.py`, solved from the engine's
     profile (perturbed). The engine agrees within 1e-5 K and 1e-6 in the flows. The reference's column at that
     answer's vapour share is at 326.15 K.
   - The paper's feed (H3, CO2 1.285 %) keeps its old path.
   - Lab's request file is copied unchanged and runs with PR and with PR + MHV1.
   - Tests: `test/columns-condenser-temperature.test.js`.

## CHEPTA-Lab's runs on this branch (inputs unchanged)

| Run | main 415da41 (Lab) | this branch |
|---|---|---|
| the column alone, 53 C, a6 feed (PR) | NO_CONVERGENCE | ok, 7 s; 38.54 kmol/h of vapour |
| the column alone, 53 C, a6 feed (PR + MHV1, the thermo's mixing set to MHV1) | (not run) | ok, 20 s; 38.28 kmol/h of vapour, share 0.83 % |
| the column alone, the vapour share, a6 feed (PR + MHV1) | (not run) | ok, 8 s; 326.21 K |
| the column alone, paper's feed (PR + MHV1) | (not run) | ok, 7 s; 297.2 kmol/h of vapour |
| plant-vl (the paper's start) | NO_CONVERGENCE in the column | ok, 31 loop iterations, 384 s |
| plant-vl-warm | NO_CONVERGENCE | ok, 8 iterations, 68 s |
| plant-vl-warm-direct | NO_CONVERGENCE | ok, 7 iterations, 41 s |
| plant-vl-nobypass | NO_CONVERGENCE | ok, 431 s |
| plant-vl-purity | NO_CONVERGENCE | ok, 131 s |
| plant-vl-recovery | NO_CONVERGENCE | ok, 657 s |
| plant-vl-R2.1273 | NO_CONVERGENCE | ok, 374 s |
| plant-vl-boilup | NO_CONVERGENCE | NO_CONVERGENCE: on a Broyden guess the temperature steps reached 325.5 of 326.15 K and stopped (open) |
| plant-vl-he5-nozones | NO_CONVERGENCE (column) | step 1 alone: NO_CONVERGENCE in HE5, a temperature cross; with main's minimum approach along the exchanger (#270) merged: ok, 31 iterations, 530 s |
| plant-vl-share-warm (control) | ok | ok, 2 iterations, 13 s |
| plant-vl and plant-vl-share-warm with PR + MHV1 | (not run) | before #268: refused, methanol + nitrogen had no MHV1 set. With #268 merged: neither reaches the column. plant-vl (the paper's start) stops in mixer MIXER1 ("PR: no physical root at 84.2 K, 100 kPa"); plant-vl-share-warm in compressor CP3 (PHASE_SPLIT: the feed at 300 K and 7000 kPa may split into two liquids). Not column faults; for Lab's move of the plant to PR + MHV1 |

In every converged plant the condenser is at 53.0 C, with 38.5-38.6 kmol/h of vapour (a share of 0.84 %).

**After steps 2-7 (2026-11-27), the same inputs again:** the same results, within a few seconds of run time or a few
tens of seconds on the long plant runs: the column alone 7-12 s (38.536 kmol/h), with PR + MHV1 20 s (38.281), the
paper's feed 3 s; plant-vl 436 s, -warm 50 s, -warm-direct 47 s, -nobypass 553 s, -purity 160 s, -recovery 867 s,
-R2.1273 429 s, the control -share-warm 20 s, all at 53.0 C (53.005 for the control); plant-vl-boilup still not
converged. With main merged (#270), plant-vl-he5-nozones also converges: 9 of the 10.

## The maintainer's answers (2026-11-26)

"i want all steps in one go. in this way you can integrate better; i am ok with the other recommendations": steps
2-7 built in this pull request, with recommendations 2 to 7 as proposed (recommendation 1, one pull request per step,
replaced by one go). The questions were:

1. Order and scope of steps 2-7: all in one go (the maintainer).
2. Subcooling: a total condenser's `subcooling_K`, DWSIM's form; not on the decanter or the vapour + liquid condenser.
3. A total condenser's temperature: as a purity (MESH from a profile, the outer loop cold).
4. Pumparounds: in the package, by rate and a duty or a return temperature; cold, brought up in steps.
5. Property specifications and Q/F: left out.
6. The keys: `reflux_kmol_h`, `condenser_T_K` on total and partial condensers, `reboiler_T_K`, `subcooling_K`,
   `distillate_to_feed`, `side_draws[k].share`, `stage_duties_kW` on distillation columns, `component_ratio`,
   `flow_ratio`, `pumparounds`.
7. M6's path kept last.

## Steps 2-7 as built

| Step | What | Where solved |
|---|---|---|
| 2 condenser | `reflux_kmol_h` (engine `reflux_rate`, on the condenser's row); `distillate_to_feed` (a distillate flow of that share); `subcooling_K` (the condenser's liquid enthalpy at T1 - dT, the distillate stream at that temperature); `condenser_T_K` on a total or partial condenser (a stage temperature of stage 1) | reflux flow and share: MESH, cold included; the temperature: below |
| 3 reboiler | `reboiler_T_K` (a stage temperature of the last stage) | below |
| 4 side streams | a draw by `share` (U = s/(1-s) L in the stage's own equations); a draw whose rate is found, its rate one more variable of its stage and its specification that stage's extra row; `stage_duties_kW` on a distillation column | share: MESH, cold by fixed-rate passes first; found rate: MESH from a profile, the outer loop cold |
| 5 whole column | `stage_temperature` among the MESH equations from a profile (new); `component_ratio` and `flow_ratio` (new design specifications) | MESH from a profile, the outer loop cold |
| 6 pumparounds | `pumparounds: [{ from_stage, to_stage, flow_kmol_h, duty_kW \| return_T_K }]`: the stage it returns to reads the stage it draws from (the band widens); a return above its bubble point is refused | MESH; cold, the column without them, then their flows in steps (The ChemSep Book, pp. 215-216) |
| 7 workbench and documents | the Column form (the new specifications, the share of a draw, pumparounds, subcooling, side heaters), the results, the Excel sheet, project format 12 (`docs/schema/project-12.json`), `docs/models/columns.md` | - |

**One correction to the proposal.** It said a partial condenser's and the reboiler's temperatures would go among the
MESH equations cold. They cannot: a stage at its bubble or dew point and the column's pressure has a temperature that
fixes its composition, and the continuation's first column has none of the separation (the same reason as for a
purity; The ChemSep Book, section 13.5, p. 224). Tried on a model column: from a profile, temperature rows of stage 1
and of the last stage converge for moves of 0.3 K, and refuse for 1 K in 12 iterations (then the outer loop takes
over). So all three temperatures take a purity's path. Only the vapour + liquid condenser's temperature is different:
there the vapour share is free, and step 1 reaches it cold.

**The engine change underneath.** The rows that read a distant stage (proposal 0028: one end row reading one stage)
are now general: any stage's rows reading any stage, for a product specification on several stages (a ratio of two
flows), the product flow written on the other end where draws are functions of their stages (B = F - D - draws),
a found draw's specification on another product, and a pumparound's return stage. The band of the Newton matrix widens
to the furthest coupled stage. One more slot per stage holds the vapour + liquid condenser's ratio or a found draw's
rate, held at 1 elsewhere.

**One test changed, for the decision, not for a result:** `test/columns-vapour-liquid.test.js` asserted that
`condenser_T_K` on a partial condenser is refused as the vapour + liquid condenser's; it is now that condenser's
temperature, so the assertion expects the count of specifications instead. Two tests asserted `PROJECT_FORMAT` equal to
11; they now assert at least 11 (format 12 is new).

## What the person must check

No new data. The H4 case's feed is Lab's stream, copied from Lab's request file (unchanged). The survey's citations
are the files and pages named in the research note.
