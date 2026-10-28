# 0015: Separation units: columns, extraction, decanters, evaporators, crystallizers and solids handling, with the liquid-liquid thermodynamics they need

- **Status:** Draft
- **Author(s):** CHEPTA maintainers (drafted with an AI assistant)
- **Discussion:** this pull request
- **Roadmap item:** core track A5 (streams) and A6 (unit operation interface); release v0.3 "Liquid-liquid and
  vapour-liquid-liquid equilibria"; v0.5 "Distillation"; v0.6 "Further units towards models of all the common unit
  operations"; data track D6 (liquid-liquid data)

## Problem

The flowsheet has 18 blocks: feed, product, mixer, splitter, component separator, flash drum, heater/cooler, heat
exchanger, valve, pump, compressor, expander and six reactors. The units that do most of the separating in a chemical
plant are missing:

| Unit | What it does | Used for |
|---|---|---|
| Distillation column | vapour and liquid in counter-current over many stages, condenser and reboiler | most separations of liquids |
| Absorber, stripper | the same without condenser or reboiler: a gas washed by a liquid, or a liquid stripped by a gas | gas cleaning, solvent recovery |
| Liquid-liquid extraction | two liquids in counter-current over many stages | acetic acid from water, aromatics from oils, bio-based acids from broths |
| Decanter (three-phase drum) | vapour, light liquid and heavy liquid leave separately | azeotropic distillation, water removal |
| Evaporator | a solution concentrated by boiling off the solvent, in one effect or several | sugars, salts, acids |
| Crystallizer | a solid formed by cooling or evaporation, in equilibrium with its mother liquor | purification of solids (the green acids, sugars) |
| Filter, centrifuge | solid and liquid separated, with the liquid the cake keeps and its wash | after every crystallizer |
| Dryer | the liquid of a wet solid evaporated | the last step of a solid product |

They need three things CHEPTA does not have yet:

1. **Streams (A5)** with a solid that forms or dissolves (today a solid is "inert": it never dissolves or crystallizes),
   and outlets chosen by phase (light and heavy liquid).
2. **Units (A6)** with many stages: the stage-by-stage results (a column profile, like the plug-flow reactor's profile
   along the tube), specifications at the ends of a column (reflux ratio, a product's purity), and initial estimates.
3. **Liquid-liquid thermodynamics** that can be trusted for extraction and decanting: parameters fitted to measured
   liquid-liquid data (today almost every pair is fitted to vapour-liquid data, which often predicts the split of two
   liquids poorly), views that show the split (binodal curves, tie lines), and, later, two liquids with equations of
   state.

## Proposal

### 1. Streams (A5)

The stream already carries a list of phases: vapour, liquid, a second liquid (from the two-liquid flash of NRTL and
UNIQUAC, proposal 0001 step 5) and an inert solid (2026-10-16). Added:

- **A solid in equilibrium:** a pure crystal of a component, formed where the liquid is saturated (the solubility of
  `src/equilibrium/sle.js`, eutectic systems: no solid solutions). Its enthalpy is the liquid's minus the enthalpy of
  fusion, the same approximation the solubility already uses (the heat capacities of the solid and the liquid taken
  equal); where an open solid heat capacity is measured, it is used and the record says so.
- **Outlets by phase:** a block may send each phase to its own port: vapour, light liquid, heavy liquid (by density),
  solid. The two liquids are named by density, not by order of calculation, so a decanter's outlets do not swap when
  the compositions change.
- Units stay SI inside the engine and are converted only at the interface (Settings; done 2026-10-28).

### 2. Units with stages (A6)

- **One engine for every stage cascade** (`src/units/columns/`): the MESH equations (material balance, equilibrium,
  summation, enthalpy balance on every stage) solved together by Newton's method, started from a cheap estimate
  (bubble-point method for distillation, sum-rates for absorbers). Distillation, absorption, stripping and extraction
  are the same engine with different ends: an extraction column is a cascade where the second liquid plays the
  vapour's part.
- **The result has a profile:** per stage T, P, the flows of each phase, the compositions, the duty. Shown as the
  plug-flow reactor's profile is shown (a chart under the flowsheet, a double click on the block), and in the Excel
  export as a table.
- **Specifications** are named and counted (degrees of freedom, as for every block): for a distillation column, two of
  reflux ratio, boil-up ratio, distillate or bottoms flow, condenser or reboiler duty, or a product's purity or
  recovery. A purity or a recovery is solved inside the block (an outer loop on the column), with a message that says
  which specification cannot be met and why (a purity above the azeotrope, for example).
- **Failure is loud:** a column that does not converge says at which stage and which equation, and what to change.

### 3. The blocks

In the palette, as for the reactors, one **Column** button (distillation, shortcut, absorber, stripper, extraction) and
one **Separator** button (decanter, evaporator, crystallizer, filter or centrifuge, dryer), so the palette stays short.

| Block | Model | Specifications |
|---|---|---|
| Shortcut column | Fenske (minimum stages), Underwood (minimum reflux), Gilliland (stages at a reflux) for a light and a heavy key | key recoveries, reflux as a multiple of the minimum, pressure |
| Distillation column | MESH, equilibrium stages; total or partial condenser; reboiler; several feeds; side draws later | stages, feed stages, pressure, two specifications (above) |
| Absorber, stripper | MESH without condenser and reboiler | stages, pressure, the two inlets |
| Extraction column | MESH with two liquids, isothermal or adiabatic | stages, feed and solvent inlets, pressure |
| Decanter | vapour-liquid-liquid flash with three outlets | T and P, or a duty |
| Evaporator | per effect a heater and a flash; several effects in series, each heated by the vapour of the one before | the effects' pressures, the product concentration or the steam |
| Crystallizer | cooling or evaporative; the solid in equilibrium with its mother liquor (section 1) | T (cooling) or the solvent evaporated, P |
| Filter, centrifuge | the solid separated with the liquid the cake keeps; a wash | solid recovery, liquid in the cake (kg per kg of solid), wash ratio |
| Dryer | the liquid of a wet solid evaporated into a gas, or by contact heat | the moisture of the dry solid, the gas or the duty |

Not in this proposal: rate-based columns, column hydraulics (tray and packing sizing belongs to the cost track, E1),
batch distillation, reactive distillation, membranes, adsorption, crystal size distributions and crystallization
kinetics.

### 4. Liquid-liquid thermodynamics

What exists: the two-liquid and the vapour-liquid-liquid flash for NRTL and UNIQUAC (proposal 0001, step 5), the
stability test, Modified UNIFAC 2.0 as the predicted tier, and liquid-liquid data for water with ethyl acetate and with
cyclohexane, and ethylene glycol with cyclohexane.

Added, in this order:

1. **Liquid-liquid data and fits** (proposal 0007, step 1, which this proposal takes over): measured mutual
   solubilities and ternary tie lines for the extraction and decanting systems of the benchmarks, from the ThermoML
   Archive and open articles, by docs/DATA_RULES.md; NRTL fitted to the liquid-liquid and the vapour-liquid data of a
   pair together. A pair fitted so keeps its vapour-liquid fit as an alternative, and the user chooses (as for the
   ChemSep sets). The fit targets are for the maintainer to set (section "Questions").
2. **Views** (proposal 0007, step 3): the binary split against temperature, the ternary diagram with the binodal curve
   and tie lines, the distribution coefficient and the selectivity, and a solvent-screening table.
3. **The method guide** (docs/METHOD_SELECTION.md) gets a section for two liquids: NRTL or UNIQUAC with
   liquid-liquid parameters; Modified UNIFAC 2.0 only as a prediction, checked against the liquid-liquid data where
   they exist, with its deviation stated.
4. **Equations of state with two liquids**, last and low priority (DECISIONS.md, "Engineering", item 7): by the
   decision of 2026-10-09 only with CPA or a method like it, never the plain cubic. This is also the real fix of the
   P-H flash failure found in the reactors (2026-10-28) and the way to two liquids in reactors.

## Engineering basis

- **The column equations:** the MESH equations and their solution by Newton's method (Naphtali and Sandholm), by the
  bubble-point method (Wang and Henke) and by the sum-rates method (Burningham and Otto), and the shortcut method of
  Fenske, Underwood and Gilliland. The original articles are paywalled; they are not used for numbers. The methods are
  implemented openly in DWSIM (GPL-3.0; read on 2026-10-28: `DWSIM.UnitOperations/UnitOperations/RigorousColumnSolvers/`
  `NewtonRaphson.vb` (class `NaphtaliSandholmMethod`), `BubblePoint.vb` (`WangHenkeMethod`), `SumRates.vb`
  (`BurninghamOttoMethod`), `Tomich.vb` (the tridiagonal solver), and `ShortcutColumn.vb` (Fenske-Underwood-Gilliland)).
  DWSIM's code is GPL, CHEPTA's MIT: CHEPTA's code is written anew from the equations, and each file cites the open
  description it follows (an open textbook or thesis found in the step's pull request, or DWSIM's source as an openly
  documented implementation).
- **Equations of state with two liquids:** CPA as implemented in thermopack (Apache-2.0, already cited in
  `src/data/LICENSES.md`); to be read in that step.
- **Validation**, for every block, against an **independent** calculation and, where open, a published example:
  - an independent Python MESH solver (`validation/python/`, scipy, the same thermodynamics as `reference_model.py`):
    flows within 1e-6 relative, every stage's balances closed to 1e-8;
  - checks with exact answers: the Kremser equation for an absorber with constant K and flows; McCabe-Thiele for a
    binary with constant molar overflow against the rigorous column at the same assumptions; the shortcut's minimum
    reflux against the rigorous column at many stages; an evaporator against the same chain of flashes; a crystallizer's
    yield against the solubility curve; a decanter against the three-phase flash;
  - published worked examples from open textbooks and theses (searched in each step), and the benchmark processes of
    docs/BENCHMARKS.md (ethanol dehydration by extractive distillation, ethyl acetate with a decanter, methanol with
    gas cleaning) as flowsheet tests;
  - liquid-liquid fits against their data within the targets the maintainer sets.

## Effect on existing work

- New blocks only; the existing 18 blocks, flowsheet files and project files keep working.
- The stream gains a solid phase that can form and dissolve; streams without one are unchanged.
- The component separator stays (it is the simple filter of today); the filter block adds the cake's liquid and the
  wash.
- Proposal 0007's steps 1 and 3 (liquid-liquid data and views) move here; its step 5 (gases in other solvents) stays
  there.
- The Excel export shows a column as a profile table (values, not formulas).

## Alternatives considered

- **Inside-out methods** (Boston and Sullivan; Russell): fast, the usual choice of commercial simulators, but more
  code and harder with two liquids. Newton's method on all MESH equations is slower but robust for non-ideal liquids,
  and the same engine serves extraction. Inside-out can come later as a faster solver for long hydrocarbon columns.
- **One block per column type with its own solver:** more code, more bugs; one engine is tested once.
- **The whole flowsheet as one equation system** (equation-oriented): a change of the flowsheet solver (A8), not of the
  units; out of scope.
- **Two liquids with the plain Peng-Robinson or SRK:** declined on 2026-10-09; CPA instead.

## Steps

Each a pull request with its tests.

1. **Liquid-liquid thermodynamics:** data and joint fits for the extraction and decanting pairs and triples; the
   binary and ternary liquid-liquid views; the method guide's section. Tests: the fits against their data; the views'
   numbers against the engine.
2. **Streams and stages (A5, A6):** outlets by phase, the profile result, named specifications; the **decanter** as the
   first block that uses them. Tests: against the three-phase flash; balances.
3. **Shortcut column** and a **Column workspace** in the Unit models with the McCabe-Thiele diagram for binaries. Tests:
   against an independent Python calculation and an open worked example.
4. **Distillation column (MESH)** with its profile, in the flowsheet and the Column workspace. Tests: the Python MESH
   reference; McCabe-Thiele and shortcut checks; a benchmark column.
5. **Absorber and stripper**; columns with nonvolatile components (proposal 0009, step 5). Tests: Kremser; the Python
   reference.
6. **Extraction column** and an **Extraction** view (ternary with the stages stepped off). Tests: the Python reference
   with two liquids; an open worked example.
7. **Evaporator**, one effect or several. Tests: against the chain of flashes; steam economy.
8. **Crystallizer, filter or centrifuge, dryer**, with the solid in equilibrium. Tests: the crystallizer's yield against
   the solubility curve; the balances with the cake's liquid and the wash.
9. **Column specifications** (purity, recovery), side draws, and the benchmark flowsheets (ethanol dehydration, ethyl
   acetate). Tests: the specifications met; the flowsheet suite.
10. **Two liquids with an equation of state (CPA)**, then two liquids in the reactors and the P-H flash fix. Low
    priority (DECISIONS.md, "Engineering", item 7).

## Questions for the maintainer

1. The order of the steps: liquid-liquid first (as above), or the distillation column first?
2. The fit targets for liquid-liquid data: for example within 0.01 in mole fraction of each phase, or the data's stated
   uncertainty where it is larger?
3. The solid's enthalpy: the liquid's minus the enthalpy of fusion (the solubility's approximation), until open solid
   heat capacities are added?
4. CPA for two liquids with an equation of state (step 10): keep it in this proposal, or a proposal of its own later?
5. Anything to add to the list of units (for example a tank, a cyclone, membranes)?
