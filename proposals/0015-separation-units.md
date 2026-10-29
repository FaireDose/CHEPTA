# 0015: Separation units: columns, extraction, evaporators, crystallizers, membranes and solids handling, with the liquid-liquid thermodynamics they need

- **Status:** Draft (revised 2026-10-29 with the maintainer's comments)
- **Author(s):** CHEPTA maintainers (drafted with an AI assistant)
- **Discussion:** this pull request
- **Roadmap item:** core track A5 (streams) and A6 (unit operation interface); release v0.3 "Liquid-liquid and
  vapour-liquid-liquid equilibria"; v0.5 "Distillation"; v0.6 "Further units towards models of all the common unit
  operations"; data track D6 (liquid-liquid data); cost track E1 (sizing)

## Problem

The flowsheet has 18 blocks: feed, product, mixer, splitter, component separator, flash drum, heater/cooler, heat
exchanger, valve, pump, compressor, expander and six reactors. The flash drum already separates three phases: it has a
vapour, a liquid and a second-liquid outlet, so it is CHEPTA's decanter. The units that do most of the separating in a
chemical plant are missing:

| Unit | What it does | Used for |
|---|---|---|
| Distillation column | vapour and liquid in counter-current over many stages, condenser and reboiler | most separations of liquids |
| Absorber, stripper | the same without condenser or reboiler: a gas washed by a liquid, or a liquid stripped by a gas | gas cleaning, solvent recovery |
| Liquid-liquid extraction | two liquids in counter-current over many stages | acetic acid from water, aromatics from oils, bio-based acids from broths |
| Evaporator | a solution concentrated by boiling off the solvent, in one effect or several | sugars, salts, acids |
| Crystallizer | a solid formed by cooling or evaporation, in equilibrium with its mother liquor | purification of solids (the green acids, sugars) |
| Membrane | gas permeation or pervaporation through a membrane | hydrogen and CO₂ recovery, drying of ethanol |
| Solid-liquid separation, dryer | the crystals separated from the mother liquor, then dried | after every crystallizer |

They need three things CHEPTA does not have yet:

1. **Units with stages (A6):** the stage-by-stage results (a column profile, like the plug-flow reactor's profile along
   the tube), specifications at the ends of a column (reflux ratio, a product's purity), warnings when a stage floods,
   weeps or runs dry, and a solid that can form or dissolve (A5).
2. **Sizing:** the flash drum gives no size today; a column's flooding cannot be checked without a diameter.
3. **Liquid-liquid thermodynamics** that can be trusted for extraction and decanting: parameters fitted to measured
   liquid-liquid data (today almost every pair is fitted to vapour-liquid data, which often predicts the split of two
   liquids poorly), views that show the split, and the choice of such a model for the columns that need it.

## What open simulators and course notes do (read 2026-10-29)

A short review of open documentation, to follow established practice:

- **NeqSim** (Equinor; its column documentation, https://equinor.github.io/neqsim/wiki/distillation_column; licence of
  the code to be checked): several column solvers behind one column block: inside-out, sequential substitution,
  sum-rates "native for absorbers and reboiler-only strippers", and Naphtali-Sandholm, which starts from an inside-out
  solution and then corrects all MESH variables together by Newton's method; an `AUTO` mode that tries the candidates.
  Product specifications (purity, recovery, product flow) are reached in steps ("homotopy"); reflux and duty
  specifications are not. Side draws and pumparounds are handled by an outer loop around the column solver. The column
  is "solved" only when the MESH residual norm is below its tolerance.
- **DWSIM** (GPL-3.0; read 2026-10-28): the same family of solvers behind one rigorous column (Wang-Henke bubble point,
  Burningham-Otto sum-rates, Naphtali-Sandholm, a tridiagonal solver) and a separate shortcut column
  (Fenske-Underwood-Gilliland).
- **Membranes:** Aziaba, Jordan, Haddadi and Harasek, Membranes 12 (2022) 1186, doi:10.3390/membranes12121186,
  CC BY 4.0: an open gas-permeation and pervaporation model for DWSIM by the solution-diffusion model. The flux of each
  component is its permeance times its partial-pressure difference across the membrane; co-current and counter-current
  flow over a number of well-mixed cells; the user gives the permeances, the permeate pressure and the membrane
  (fibres, diameter, length); checked against gas-permeation data within 0.84 % (CO₂, O₂, N₂).
- **Column hydraulics:** M. Fermeglia, "Staged column design", Separation Processes, University of Trieste (2021; course
  slides, free to read): flooding at high vapour flow, weeping at low vapour flow; the flooding velocity by Fair's
  method, u_fl = K_fl K1 K2 K3 K4 ((ρL − ρV)/ρV)^½, with K_fl from Fair's chart against the flow parameter
  (L/V)(ρV/ρL)^½ and the tray spacing; the check "must be done at least at the feed, top and bottom trays"; the
  diameter set by the tray with the lowest flooding velocity; the operating vapour velocity "typically 0.65 to 0.90" of
  flooding (slide 50).
- Vendor documentation seen in a web search, not opened: a three-phase (vapour-liquid-liquid) calculation is costly, so
  simulators apply it only where it is needed; some offer a "free water" option.

## Proposal

### 1. One Column block, many configurations

One engine (`src/units/columns/`) and one **Column** block in the palette, as the reactors have one button. The block's
configuration chooses what it is:

| Configuration | Condenser | Reboiler | Second phase on the stages |
|---|---|---|---|
| Distillation | total, partial, or a decanter (two liquids, one refluxed) | yes | vapour |
| Absorber | none | none | vapour (a gas inlet at the bottom) |
| Stripper | none | none, or a reboiler | vapour |
| Extraction | none | none | the second liquid plays the vapour's part |

- **Two methods**, as the equilibrium reactor has the Gibbs mode: **Shortcut** (Fenske, Underwood, Gilliland; for a
  light and a heavy key) and **Rigorous** (MESH on equilibrium stages). The shortcut's result can start the rigorous
  column.
- **The solver** follows the practice above: a robust start (bubble-point for distillation, sum-rates for absorbers and
  strippers), then Newton's method on all MESH equations together (Naphtali-Sandholm). The column counts as solved only
  when every stage's balances close (residual below a tolerance stated in the result). In a recycle, a column starts
  from its last solution.
- **Specifications**, named and counted (degrees of freedom): two of reflux ratio, boil-up ratio, distillate or bottoms
  flow, condenser or reboiler duty, or a product's purity or recovery. A purity or recovery is reached in steps from a
  flow or reflux specification, as NeqSim does; one that cannot be met (a purity above an azeotrope) is refused with
  the reason.
- **Outlets by phase only where they are new:** the flash drum already has them. The column gets them where it needs
  them: the decanter on the condenser (the refluxed liquid and the other one), and side draws of a chosen phase.
- **The profile:** per stage T, P, the flows of each phase, the compositions, the duty; shown as the plug-flow reactor's
  profile is (a chart under the flowsheet, a double click on the block), and in the Excel export as a table.

### 2. Warnings: dry stages, flooding, weeping

- **Dry stage** (always on, no geometry needed): a stage whose liquid or vapour flow falls to a small fraction of the
  column's traffic is reported ("stage 12 runs dry: the liquid flow is 0.1 % of the reflux"). The usual cause: too low
  a reflux, or a feed that is all vapour.
- **Flooding and weeping** (when the column has a geometry: diameter and tray spacing): the flooding velocity by Fair's
  method on every stage, a warning above a chosen fraction of flooding (the slides give 0.65 to 0.90 as the usual operating range), and a weeping warning at low
  vapour flow. With no diameter given, the column is **sized**: the diameter for the chosen fraction of flooding, set by
  the stage with the lowest flooding velocity. Fair's chart is a graph: its curves need an open fitted form, or are read
  off the graph (and said to be read off a graph), in that step. Packed columns later.

### 3. Thermodynamics for a column: its own method where needed

- **A column may use its own property method** (for example NRTL with liquid-liquid parameters) instead of the
  flowsheet's. A stream entering it is recalculated with the column's method at the same T and P; the enthalpy
  reference (each ideal gas at 298.15 K) is the same for every method, so the energy balance holds; the difference in
  the inlet's enthalpy between the two methods is reported.
- **"Look for two liquids on the stages"**: off by default, because it costs a three-phase calculation on every stage;
  on for azeotropic and extractive distillation, where a stage really holds two liquids (ethanol, water and a third
  component; butanol and water). Only activity models (NRTL, UNIQUAC) can do it, as the flash drum does today.

### 4. The other blocks

In one **Separator** button, so the palette stays short. What each one calculates, and what is only a balance:

| Block | The model behind it | What you give | What you get |
|---|---|---|---|
| Flash drum and decanter (exists) | the two- or three-phase flash | T and P, or a duty | the phases; **new: the size** (below) |
| Evaporator | per effect a heater and a flash; several effects in series, each heated by the vapour of the one before | the effects' pressures, and the product concentration or the steam | the duties, the steam economy, the boiling-point rise caused by nonvolatile components |
| Crystallizer | the solubility of `src/equilibrium/sle.js`: the solid in equilibrium with its mother liquor (eutectic systems) | cooling: T; evaporative: the solvent evaporated | the yield, the solid and the mother liquor, the duty |
| Membrane | solution-diffusion: each component's flux is its permeance times its partial-pressure difference; co- or counter-current cells (Aziaba et al. 2022) | the permeances, the permeate pressure, and the area, or a target (stage cut or recovery) | the permeate and retentate; **or the area for the target** (the sizing) |
| Solid-liquid separator (filter or centrifuge) | a balance: the solid leaves with the liquid its cake keeps; a wash displaces part of that liquid | solid recovery, liquid in the cake (kg per kg of solid), wash ratio and efficiency | the cake and the filtrate. A real filtration model (cake resistance, filter area) is later, with an open source |
| Dryer | a balance and the heat of evaporation: the liquid of the wet solid is evaporated, by a gas or by contact heat | the moisture of the dry solid, the gas or the duty | the dry solid, the vapour, the duty. Drying times need drying curves: later |

The solid-liquid separator and the dryer are honest balance models with a better icon than the component separator:
they are worth having because they ask for the numbers an engineer has (cake moisture, wash ratio) and keep the solid's
energy balance, not because they model filtration or drying. They could also wait (see "Making it leaner").

**Sizing of the drums** (cost track E1, done here because the geometry is needed for the warnings anyway): a vertical
or horizontal vapour-liquid drum by the allowed vapour velocity (the Souders-Brown form, the same capacity-factor idea as
Fair's method) and a liquid hold-up time; a decanter by the settling of drops of one liquid in the other and a
residence time. The constants come from an open source found in that step.

### 5. Streams (A5)

- **A solid in equilibrium:** a pure crystal of a component, formed where the liquid is saturated. Its enthalpy is the
  liquid's minus the enthalpy of fusion, the approximation the solubility already uses; where an open solid heat
  capacity is measured, it is used and the record says so. Today's inert solid stays as it is.
- The two liquids of a stream are named by density (light, heavy) where a block sends them to separate outlets, so a
  decanter's outlets do not swap when the compositions change.

### 6. Liquid-liquid thermodynamics

What exists: the two-liquid and the vapour-liquid-liquid flash for NRTL and UNIQUAC (proposal 0001, step 5), the
stability test, Modified UNIFAC 2.0 as the predicted tier, and liquid-liquid data for water with ethyl acetate and with
cyclohexane, and ethylene glycol with cyclohexane.

Added:

1. **Liquid-liquid data and fits** (proposal 0007, step 1, which this proposal takes over): measured mutual
   solubilities and ternary tie lines for the extraction and decanting systems of the benchmarks, from the ThermoML
   Archive and open articles; NRTL fitted to the liquid-liquid and vapour-liquid data of a pair together, kept as a set
   the user can choose next to the vapour-liquid fit.
2. **Views** (proposal 0007, step 3): the binary split against temperature, the ternary diagram with the binodal curve
   and tie lines, the distribution coefficient and selectivity, and a solvent-screening table.
3. **The method guide** (docs/METHOD_SELECTION.md): a section for two liquids and for the columns' own method (section 3).
4. **Equations of state with two liquids (CPA)**: not in this proposal (see "Making it leaner"); it stays an item of
   DECISIONS.md, "Engineering", item 7.

## Engineering basis

- The column equations: MESH, and the methods of Fenske, Underwood and Gilliland (shortcut), Wang and Henke (bubble
  point), Burningham and Otto (sum-rates) and Naphtali and Sandholm (Newton). Their original articles are paywalled and
  not used for numbers; the methods are documented openly by DWSIM's source and NeqSim's documentation (above). DWSIM is
  GPL and CHEPTA MIT: CHEPTA's code is written anew from the equations, and each file cites the open description it
  follows.
- Hydraulics: Fair's method as given in the Trieste course slides; an open fitted form of Fair's chart, or values read
  off the chart and said so.
- Membranes: Aziaba et al. 2022 (CC BY 4.0) for the model; its gas-permeation case as a test.
- **Validation**, for every block, against an **independent** calculation and, where open, a published example:
  - an independent Python MESH solver (`validation/python/`, scipy, the same thermodynamics as `reference_model.py`):
    flows within 1e-6 relative, every stage's balances closed to 1e-8;
  - checks with exact answers: the Kremser equation for an absorber with constant K and flows; McCabe-Thiele for a
    binary with constant molar overflow; the shortcut's minimum reflux against the rigorous column at many stages; an
    evaporator against the same chain of flashes; a crystallizer's yield against the solubility curve; a membrane with
    one well-mixed cell against the hand calculation;
  - published worked examples from open textbooks, theses and articles (Aziaba et al.'s gas-permeation case), and the
    benchmark processes of docs/BENCHMARKS.md (ethanol dehydration by extractive distillation, ethyl acetate with a
    decanter, methanol with gas cleaning) as flowsheet tests;
  - liquid-liquid fits against their data within the targets the maintainer sets.

## Effect on existing work

- New blocks only; the 18 blocks, flowsheet files and project files keep working. The flash drum gains an optional size.
- The stream gains a solid phase that can form and dissolve; streams without one are unchanged.
- The component separator stays.
- Proposal 0007's steps 1 and 3 move here; its step 5 (gases in other solvents) stays there.

## Alternatives considered

- **Separate blocks for distillation, absorber, stripper and extraction:** four interfaces for one engine; one block
  with a configuration is less code and one place to learn.
- **Inside-out alone** (Boston and Sullivan; Russell): fast, but with one liquid only and harder with very non-ideal
  liquids. Kept as a possible faster start later; Newton (Naphtali-Sandholm) is the solver that closes the balances.
- **The whole flowsheet as one equation system** (equation-oriented): a change of the flowsheet solver (A8); out of
  scope.
- **Two liquids with the plain Peng-Robinson or SRK:** declined on 2026-10-09.

## Making it leaner

Suggested, for the maintainer to choose:

1. **One Column block** (section 1) instead of four, and the shortcut as its mode: done in this draft.
2. **No separate decanter:** the flash drum is the decanter; it only gains its size. Done in this draft.
3. **CPA out of this proposal:** it stays a list item until a component really needs it. Done in this draft.
4. **Postpone the solid-liquid separator and the dryer:** they are balances (section 4); the component separator
   already does the separation. They could come with a real filtration model later.
5. **The evaporator as a template, not a block:** a chain of heater and flash blocks the user places, with a note
   on steam economy; one block less.
6. **Reuse what exists:** the plug-flow reactor's profile chart for the column profile; the reactor's "one button,
   many types" palette; the flash's three-phase calculation for the decanter condenser and the extraction stages.
7. **Sizing with the units, not later:** the drum's size and the column's diameter come with each block (they are
   needed for the warnings), so the cost track E1 starts from blocks that already have their geometry.

## Steps

Each a pull request with its tests.

1. **Liquid-liquid thermodynamics:** data and joint fits for the extraction and decanting pairs; the liquid-liquid
   views; the method guide's section. Tests: the fits against their data; the views' numbers against the engine.
2. **The Column block, shortcut mode**, and a **Column workspace** in the Unit models with the McCabe-Thiele diagram for
   binaries. Tests: against an independent Python calculation and an open worked example.
3. **The Column block, rigorous mode** (distillation): the MESH engine, its profile, the dry-stage warning, its own
   property method and "look for two liquids". Tests: the Python MESH reference; McCabe-Thiele and shortcut checks; a
   benchmark column.
4. **Absorber, stripper**, columns with nonvolatile components (proposal 0009, step 5). Tests: Kremser; the Python
   reference.
5. **Extraction** configuration and an **Extraction** view (ternary with the stages stepped off). Tests: the Python
   reference with two liquids.
6. **Sizing and hydraulics:** the flash drum's and decanter's size, the column's diameter, flooding and weeping
   warnings. Tests: against the worked examples of the open source used.
7. **Membrane** (gas permeation, pervaporation), with the area for a target. Tests: Aziaba et al.'s gas-permeation case;
   one cell by hand.
8. **Crystallizer** with the solid in equilibrium; the evaporator (block or template); the solid-liquid separator and
   the dryer if kept. Tests: the yield against the solubility curve; the balances.
9. **Column specifications** (purity, recovery), side draws, and the benchmark flowsheets (ethanol dehydration, ethyl
   acetate). Tests: the specifications met; the flowsheet suite.

## Questions for the maintainer

1. The order of the steps: liquid-liquid first (as above), or the distillation column first?
2. The fit targets for liquid-liquid data: for example within 0.01 in mole fraction of each phase, or the data's stated
   uncertainty where it is larger?
3. The solid's enthalpy: the liquid's minus the enthalpy of fusion, until open solid heat capacities are added?
4. Which of "Making it leaner" 4 and 5 (postpone the solid-liquid separator and dryer; the evaporator as a template)?
5. The flooding warning: at which fraction of flooding (the usual operating range is 0.65 to 0.90 of flooding; for
   example a warning above 0.90)?
