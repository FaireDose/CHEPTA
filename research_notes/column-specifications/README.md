# Column specifications: what simulators offer, and what CHEPTA has

A quick survey (2026-11-26), for proposal 0029, at the maintainer's request: "have a quick research on more
possibilities as what we can put as specs inside the column ... together with reboiler and condenser, side streams and
everything else so we have a full package". Written by a coding agent; only what was opened in this session is cited.
No numbers are taken from any source here: this note is about which specifications exist and how they are solved.

## Sources opened (2026-11-26)

| Id | Source | Licence / why open | What was read |
|---|---|---|---|
| CSB | H. A. Kooijman and R. Taylor, *The ChemSep Book*, 2nd ed., 2006, http://www.chemsep.org/downloads/docs/book2.pdf | public domain (stated by the authors) | section 13.2.1 (side streams as ratios r to the interstage flow, p. 192), 13.2.4 "Special Stages" (the list of condenser and reboiler specifications, p. 195), 13.4 (the Jacobian with pumparounds and "non-standard specifications", pp. 213-214), the note on pumparounds in section 13.4 (pp. 215-216: "no special methods are employed"), 13.5 (continuation and purity specifications, p. 224) |
| DWN | DWSIM, `DWSIM.UnitOperations/UnitOperations/RigorousColumnSolvers/NewtonRaphson.vb`, branch `windows`, https://github.com/DanWBR/dwsim | GPL-3.0 | the block "handle user specs": every condenser and reboiler specification written as an equation of the Naphtali-Sandholm system; the subcooling of the total condenser (`_subcoolingDeltaT`, K-values at T - dT) |
| DWB | DWSIM, `.../RigorousColumnSolvers/BubblePoint.vb`, same branch | GPL-3.0 | `specC_OK` / `specR_OK`: in the bubble-point (Wang-Henke) solver the component fraction, component flows, recovery and temperature specifications are met by an outer iteration around the inner solver; flows, ratios and duties directly |
| DWR | DWSIM, `.../UnitOperations/RigorousColumn.vb`, same branch | GPL-3.0 | `Enum SpecType` (line 715): Heat_Duty, Product_Molar_Flow_Rate, Component_Molar_Flow_Rate, Product_Mass_Flow_Rate, Component_Mass_Flow_Rate, Component_Fraction, Component_Recovery, Stream_Ratio, Temperature, Feed_Recovery; `Enum condtype` (line 2410): Total_Condenser, Partial_Condenser, Full_Reflux; `TotalCondenserSubcoolingDeltaT` (line 838); side draws as fixed rates (`LiquidSideDraws`, `VaporSideDraws`, lines 537-571) |
| IDC | IDAES-PSE, `idaes/models_extra/column_models/condenser.py` and `reboiler.py`, branch `main`, https://github.com/IDAES/idaes-pse | BSD 3-clause | `CondenserType` totalCondenser / partialCondenser; `TemperatureSpec` atBubblePoint / customTemperature (a partial condenser refuses atBubblePoint); `reflux_ratio`; the reboiler's optional `boilup_ratio` constraint. IDAES is equation-oriented: every specification is one more equation of the one system (no outer loop) |
| COCO | COCO / COFE, https://www.cocosimulator.org | free to read | its column is the ChemSep unit operation (read for proposal 0026, 2026-11-18): the same specifications as CSB |
| AP | Aspen Plus RadFrac, HYSYS | **not opened**: AspenTech's documentation is not openly posted by AspenTech; a university copy of the Aspen Plus input language guide found by search returned an HTML page, not the PDF. What RadFrac and HYSYS offer is therefore not stated here | — |
| NQ | NeqSim, distillation column documentation, https://equinor.github.io/neqsim/wiki/distillation_column | Apache-2.0 | already cited in `src/units/columns/engine.js` for the solver; not re-read for this note |

## What the open simulators offer, by place

"MESH" = written as an equation of the column's own Newton system (in place of the energy balance of the end it frees,
or as one more row); "outer" = met by an iteration around column solves.

### The condenser

| Specification | ChemSep (CSB) | DWSIM Newton (DWN) | DWSIM bubble point (DWB) | IDAES (IDC) |
|---|---|---|---|---|
| reflux ratio (L1 / D) | yes ("a reflux/reboil ratio or rate") | `Stream_Ratio`, MESH | direct | `reflux_ratio`, one equation |
| reflux flow | yes ("or rate") | — (only as a ratio) | — | — |
| distillate flow (molar, mass) | yes | `Product_Molar_Flow_Rate`, `Product_Mass_Flow_Rate`, MESH | direct | as a fixed outlet flow |
| distillate as a fraction of the feed | — | `Feed_Recovery`, MESH | — | — |
| condenser temperature | yes ("the temperature of the condenser or reboiler") | `Temperature`, MESH (ln(T1 / value)) | outer | `customTemperature` (partial condenser) |
| subcooling of a total condenser | not in the list read | an input, not a specification: the condenser's K-values at T1 - dT (`TotalCondenserSubcoolingDeltaT`) | same | — |
| duty | yes | `Heat_Duty`: the energy balance kept with Q given | direct | a fixed heat duty |
| purity of the distillate (mole, mass) | yes ("the mole fraction of a given component in either the distillate or bottoms") | `Component_Fraction`, MESH (ln(x / value)) | outer | an equation on the outlet |
| component flow in the distillate | yes | `Component_Molar_Flow_Rate`, `Component_Mass_Flow_Rate`, MESH | outer | an equation on the outlet |
| recovery of a component in the distillate | (as a component flow) | `Component_Recovery`, MESH | outer | an equation on the outlet |
| vapour distillate with a liquid distillate | as side streams of stage 1 (V1 and U1) | `Partial_Condenser`: the vapour flow an input | same | partialCondenser, temperature given |
| vapour fraction / vapour share of the distillate | (V1 / (V1 + U1) is a ratio of two flows) | — | — | — |
| decanter | not read for this note | not in the files read | — | — |

### The reboiler

| Specification | ChemSep | DWSIM Newton | DWSIM bubble point | IDAES |
|---|---|---|---|---|
| boil-up ratio (V_N / B) | yes | `Stream_Ratio`, MESH | outer (`specR_OK` false for Stream_Ratio) | `boilup_ratio`, one equation |
| bottoms flow | yes | `Product_Molar_Flow_Rate`, MESH | direct | a fixed outlet flow |
| reboiler temperature | yes | `Temperature`, MESH | outer | a fixed temperature |
| duty | yes | `Heat_Duty` | direct | a fixed heat duty |
| purity, component flow, recovery of the bottoms | yes | MESH, as on the condenser | outer | an equation on the outlet |
| vapour fraction of the reboiler's outlet (a kettle that returns part of the liquid) | — | — | — | — |

### Side streams and stage heat

| Item | ChemSep | DWSIM | IDAES |
|---|---|---|---|
| liquid or vapour side draw of given rate | yes (U_j, W_j; the ratio r to the interstage flow in the equations, CSB 13.2.1) | yes, fixed rates | — (tray models with side outlets in the tray column) |
| side draw as a fraction of the interstage flow | the equations use r; not read whether the user can give r directly | — | — |
| purity or recovery of a side draw | "non-standard specifications that are not on the variables of the condenser and reboiler" exist (CSB p. 213); they and pumparounds put entries outside the block-tridiagonal band, so ChemSep solves the linear systems with a sparse elimination (NSPIV) | — | — |
| pumparounds | yes; "no special methods are employed", large pumparound flows may need user estimates or stepping the flow up from old results (CSB pp. 215-216) | not found in the files read | — |
| side heaters and coolers (a duty on a stage) | yes (Heaters/Coolers tab, CSB chapter 1, p. 15) | yes (Q_j inputs) | — |

### The whole column

| Specification | Who offers it |
|---|---|
| a stage temperature (not the condenser's or the reboiler's) | ChemSep's non-standard specifications (CSB p. 213); not in DWSIM's condenser/reboiler slots |
| a ratio of two flows (any streams) | DWSIM's `Stream_Ratio` is the end's own L/D or V/B only |
| a ratio of two components in one product | not found in the open sources read |
| Q / F (a duty per feed) | not found in the open sources read |
| a property of a product (a density, a boiling point) | not found in the open sources read |

### MESH or outer loop

- **ChemSep** writes every specification as an equation of its Newton system (Naphtali-Sandholm, "2c+3 formulation")
  and solves the linear systems with a sparse solver so that a specification on any stage, a side stream or a
  pumparound can be written (CSB pp. 213-214). It warns that its continuation "cannot, without modification, handle
  problems in which a product stream purity is specified" (CSB 13.5, p. 224).
- **DWSIM's Newton solver** writes one specification per end, as a function of that end's own variables, so the
  Jacobian stays block-tridiagonal; its bubble-point solver meets the composition and temperature specifications by an
  outer iteration (DWB).
- **IDAES** is equation-oriented: every specification is one more equation of the one model, and the degrees of
  freedom must be zero before it solves.

## What CHEPTA has today (base branch: proposals 0026 and 0028)

Read: `src/units/columns/column.js`, `engine.js`, `specifications.js`, `two-liquids.js`.

| Specification | Place | CHEPTA today | How |
|---|---|---|---|
| reflux ratio | condenser | yes | MESH (on the condenser's row) |
| reflux flow | condenser | **none** | — |
| distillate flow | condenser | yes (`distillate_kmol_h`) | MESH |
| condenser duty | condenser | yes | MESH (energy balance kept) |
| condenser temperature | condenser | vapour + liquid condenser only (`condenser_T_K`) | MESH (one more row of stage 1); a total or partial condenser: as a design specification `stage_temperature` on stage 1, outer loop |
| subcooling of a total condenser | condenser | **none** (the reflux and distillate leave at the bubble point) | — |
| vapour share of the distillate, vapour distillate flow | condenser | vapour + liquid condenser (`vapour_share`, `vapour_distillate_kmol_h`) | MESH |
| decanter (which liquid refluxes) | condenser | yes (`reflux_liquid`) | MESH |
| decanter's distillate purity | condenser | outer loop (tried in MESH and not kept, decision 2026-11-18-07) | outer |
| purity, recovery, component flow of the distillate / vapour distillate | condenser | yes | MESH where a restart profile exists (proposal 0028), outer loop cold |
| boil-up ratio | reboiler | yes | MESH |
| bottoms flow | reboiler | yes (`bottoms_kmol_h`) | MESH |
| reboiler duty | reboiler | yes | MESH |
| reboiler temperature | reboiler | as `stage_temperature` on the last stage | outer |
| purity, recovery, component flow of the bottoms | reboiler | yes | MESH with a profile (proposal 0028), decanter column's bottoms purity MESH always; outer cold |
| reboiler vapour fraction | reboiler | **none** | — |
| side draw of given rate | side stream | yes | MESH (its own stage) |
| side draw whose rate is found (for a purity, a recovery, a component flow) | side stream | yes | outer (the rate is an outer variable) |
| purity, recovery, component flow of a side draw of given rate | side stream | yes | MESH with a profile (the row reads the draw's stage; the band widens) |
| side draw as a fraction of the interstage flow | side stream | **none** | — |
| pumparound | side stream | **none** | — |
| side heater or cooler (a stage duty) | stage | absorbers and strippers only (`stage_duties_kW`); refused on a distillation column | MESH (the stage's energy balance) |
| stage temperature | any stage | yes (`stage_temperature`) | outer |
| ratio of two flows, ratio of two components, Q/F, property specs | column | **none** | — |
| Murphree efficiency | stage | **none** (equilibrium stages) | — |

## The table asked for: specification x place x CHEPTA today x what others do

| Specification | Place | CHEPTA today | ChemSep | DWSIM | IDAES |
|---|---|---|---|---|---|
| reflux ratio | condenser | inside MESH | MESH | MESH | equation |
| reflux flow | condenser | none | MESH | — | — |
| distillate flow | condenser | inside MESH | MESH | MESH | equation |
| condenser temperature (total, partial) | condenser | outer loop (stage_temperature) | MESH | MESH (Newton), outer (BP) | equation |
| condenser temperature (vapour + liquid) | condenser | inside MESH; cold start fixed by step 1 of 0029 | MESH (V1, U1 side streams) | input V (not T) | equation |
| subcooling | condenser | none | not read | input (K at T - dT) | — |
| vapour share / vapour flow | condenser | inside MESH (vapour + liquid) | MESH (ratio, flow) | input flow | — |
| duty | condenser, reboiler | inside MESH | MESH | MESH | equation |
| purity / component flow / recovery | condenser, reboiler | inside MESH with a profile, outer cold | MESH | MESH (Newton), outer (BP) | equation |
| boil-up ratio | reboiler | inside MESH | MESH | MESH (Newton), outer (BP) | equation |
| bottoms flow | reboiler | inside MESH | MESH | MESH | equation |
| reboiler temperature | reboiler | outer loop (stage_temperature) | MESH | MESH | equation |
| reboiler vapour fraction | reboiler | none | — | — | — |
| side draw rate | side stream | inside MESH (given); outer (found) | MESH | input | — |
| side draw ratio to the interstage flow | side stream | none | in the equations (r) | — | — |
| side draw purity / recovery | side stream | inside MESH with a profile (rate given); outer (rate found) | MESH (non-standard, sparse solver) | — | — |
| pumparound | side stream | none | MESH (no special start) | — | — |
| side heater / cooler | stage | absorbers and strippers only | MESH (stage duty) | MESH (stage duty) | — |
| stage temperature | any stage | outer loop | MESH (non-standard) | — | — |
| ratio of two flows / two components, Q/F, property | column | none | (non-standard; not read in detail) | — | — |

## What follows for CHEPTA (taken up in proposal 0029)

1. Every specification that fixes a variable of the end it frees (a temperature, a flow, a ratio, a duty) can go
   among the MESH equations at once and cold, as DWSIM's Newton solver does: it does not need the outer loop.
2. Composition specifications (purity, recovery, component flow) cannot be held by CHEPTA's continuation in the
   volatilities (CSB 13.5); they stay as proposal 0028 has them: in MESH from a profile, the outer loop cold.
3. Specifications on another stage than an end (a stage temperature, a side draw's purity) widen the band of the Newton
   matrix; the band solver handles a band up to the distance between the two stages (proposal 0028). A pumparound
   couples two distant stages in the material balances themselves, so it needs the same wider band for every step.
4. The cold start of a condenser given by its temperature: the continuation's first column, without separation, has
   no top vapour that is partly condensed at that temperature. A column at a vapour share first, then the
   temperature (CHEPTA-Lab M6; proposal 0029, step 1).
