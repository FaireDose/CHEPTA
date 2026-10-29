# 0015: Separation units, and the program that builds them across the roadmap's tracks

- **Status:** Draft (revised 2026-10-29 with the maintainer's comments; Part II added the same day)
- **Author(s):** CHEPTA maintainers (drafted with an AI assistant)
- **Discussion:** this pull request
- **Roadmap item:** releases v0.5 "Distillation" and v0.6 "Further units"; core track A3, A5 to A11; bridges B1, B2,
  B4; assistants C2 to C4, C6; data D1, D2, D6, D7; cost E1 to E3; agents G1 (Part II, section 7)

**Part I** (sections 1 to 6) describes the separation units: columns, extraction, evaporators, crystallizers, membranes,
solids handling, sizing, and the liquid-liquid thermodynamics they need. **Part II** (sections 7 to 13) is the program
that builds them: what each roadmap track contributes, the roles of a team, the contracts fixed first, nine
workstreams that can run in parallel, the milestones to v0.5 and v0.6, and the risks.

# Part I: the units

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

# Part II: the program across the roadmap's tracks

Part I describes the units. Part II answers the maintainer's request of 2026-10-29: "think like a full software
engineering team where you would have more agents to work independently on different tasks". It takes from every track
of [ROADMAP.md](../ROADMAP.md) what the separation units need or make possible now, and organizes the work so that
several people or AI agents can work at the same time without editing the same files or waiting for each other.

## 7. What each track contributes

The rest of the roadmap was read item by item. An item is in the program when a separation unit needs it, or when it
costs little more now that the units are built. The others stay where they are.

| Track | In this program | Why now | Left out, for later |
|---|---|---|---|
| **A, core** | A5 streams (a solid that forms; light and heavy liquids); A6 unit interface v2 (stages, profiles, warnings, sizing, a block's own method); A7 file format (the new blocks in project format 6, with the upgrade from format 5); A8 solver (design specifications as a block, the column's warm start in recycles); A9 budgets (the "50-stage column under 5 s" of A9, measured in CI); A10 the authoring contract for the new blocks; A11 views (column and extraction views, profile charts); A3 the tier behind each result | every new block depends on A5 and A6; A7, A8, A10 and A11 must grow with them or the new blocks cannot be saved, solved, written by assistants or seen | A2 data packs; A12 the stability policy for 1.0 |
| **B, bridges** | B1 export: SVG and PNG of every chart, the column profile in the Excel workbook; B2 share by link (the workbench state in the address); B4 project files (format 6) | the profiles and the new views are the first results people will want in reports | B3 ThermoML file import; B5 notebooks; B6 CAPE-OPEN |
| **C, assistants** | C2 ChatGPT canvas, C3 Gemini canvas, C4 other assistants: the column examples run in each, and the results are written down; C6 the instructions in `ai/` kept in step with the new blocks | a flowsheet with a column is the test an assistant will be asked for first | C5 the package check page |
| **D, data** | D6 liquid-liquid data (extraction, decanting); D7 ternary data for the ternary views; D2 the missing pairs of the benchmark separations; D1 the water + ethylene glycol pair (an absorber case: glycol dehydration) | the columns are only as good as the pairs on their stages | D3 one format for all data files; D8 beyond the worked examples |
| **E, cost** | E1 sizing (drums, decanters, column diameter and height, membrane area, the exchangers already done); E2 purchased and installed cost from open correlations; E3 utilities (steam from the IAPWS tables, cooling water, electricity) | the sizes are computed for the warnings anyway (Part I, section 2); cost is one step more | E4 the economics of a flowsheet, E5 environmental indicators, E6 the cost view |
| **G, agents** | G1 the tool interface: every new block callable as JSON in, JSON out, with error messages that say what to fix | an agent that designs routes needs the separation units first | G2 to G6 (literature to route, route comparison, design studies) |

The project's own rules stay as they are: open sources only, every number cited and checked by a person, tests
against independent calculations, one decision file per pull request.

## 8. Roles

A team of five roles, each of which can be a person or an AI agent. One person may hold several.

| Role | Does | Decides |
|---|---|---|
| **Architect** | writes and keeps the contracts (section 9); reviews every pull request that touches them; keeps ARCHITECTURE.md | how layers talk to each other; refuses a change that breaks a contract without a new version |
| **Project manager** | keeps the plan (sections 10 and 11) and its state in DECISIONS.md; hands each workstream its next task; keeps at most one open pull request per workstream; tells the maintainer what waits for a decision | the order of the tasks within the milestones the maintainer accepted |
| **Simulator expert** | chooses the methods (solvers, correlations, the method guide); finds the open sources; writes the independent Python references and the worked examples | whether a result is physically right; which method a test uses |
| **Software engineers** (one per workstream) | implement the tasks of their workstream with their tests, in their own files | how the code inside their files is written |
| **Maintainer** | accepts the proposal and its milestones; answers the questions; checks the numbers against the sources (AGENTS.md rule 4); merges | everything that is the project's choice |

Assistants never review or approve their own work (AGENTS.md).

## 9. Contracts first (milestone M0)

Independent work needs fixed interfaces. Before the workstreams start, one small pull request (the architect's) writes
the contracts down, with stubs and tests that fail until each workstream fills them:

1. **Stream v2** (`src/stream/`): the phase types `vapour`, `liquid` (with `light` or `heavy` when there are two) and
   `solid` (equilibrium or inert); the solid's enthalpy rule; backward compatible (a stream without these is unchanged).
2. **Unit v2** (`src/units/units.js`): what a block may return besides its outlets: `profile` (a list of stages or
   points, the same shape as the plug-flow reactor's), `warnings` (each with a code, the stage and the remedy: `DRY_STAGE`,
   `FLOODING`, `WEEPING`), `sizing` (the dimensions it computed and their basis), and `method` (the block's own property
   method, when it has one). Existing blocks keep working unchanged.
3. **Column engine API** (`src/units/columns/engine.js`): `solveCascade({ sys, stages, feeds, draws, specs, ends,
   phases: "VL" | "LL" | "VLL", start })` → `{ stages: [...], converged, residual, iterations, warnings }`; one engine for
   every column configuration (Part I, section 1).
4. **Sizing API** (`src/sizing/`, a new layer above `src/units/`): `sizeDrum`, `sizeDecanter`, `columnDiameter`,
   `membraneArea`, each `(unit result, options) → { dimensions, basis, source }`; cost (E2) reads these.
5. **Project format 6** (`docs/schema/project-6.json`) and its upgrade from format 5, for the new blocks.
6. **The tool interface** (G1): the JSON form of each new block, as `runUnit` already takes it, documented in `ai/`.

After M0, a contract changes only by a pull request of the architect, with a version and the change in ARCHITECTURE.md.

## 10. Workstreams

Each workstream owns its files, so their pull requests never edit the same lines. Shared files (`src/index.js`,
`src/ui/app.js`, the palette, DECISIONS.md, ROADMAP.md) are changed only by the integration task of a milestone (W9), or
by one line each in a fixed place (an import, a registry entry).

| Workstream | Owns | Tasks, in order | Needs | Roadmap items |
|---|---|---|---|---|
| **W1 Liquid-liquid thermodynamics** | `validation/data/lle/`, `validation/python/` LLE fits, `src/equilibrium/lle*.js`, docs/METHOD_SELECTION.md (its LLE section) | data search and joint NRTL fits (extraction, decanting pairs and triples); the method guide's section; the tier of each pair shown with the result (A3) | M0 | D6, D7, D2, A3, v0.3 |
| **W2 Column engine** | `src/units/columns/`, `validation/python/reference_mesh.py`, `test/columns*.test.js` | shortcut; rigorous distillation; dry-stage warning; the block's own method and "two liquids on the stages"; absorber and stripper; extraction; purity and recovery specifications; side draws | M0; W1 for extraction | A6, A8 (inside the column), v0.5 |
| **W3 Other units** | `src/units/evaporator.js`, `crystallizer.js`, `membrane.js`, `solids.js`, their tests | evaporator (block or template); membrane; crystallizer with the solid in equilibrium; solid-liquid separator and dryer if kept | M0 (stream v2) | A5, A6, v0.6 |
| **W4 Sizing and cost** | `src/sizing/`, `src/cost/`, `validation/data/cost/`, their tests | drum and decanter size; column diameter, flooding and weeping (Fair); membrane area; then the open cost correlations (E2) and the utilities (E3) | M0; W2 for the column's traffic | E1, E2, E3 |
| **W5 Views** | `src/ui/column-*.js`, `src/ui/extraction-*.js`, `src/ui/lle-*.js`, the Column workspace | the Column workspace with McCabe-Thiele; the column profile under the flowsheet; the binary and ternary liquid-liquid views; the extraction view; warnings shown on the block | M0; the engine results of W1, W2 | A11, v0.5 |
| **W6 Bridges** | `src/ui/export-*.js`, `src/ui/share-*.js`, `src/ui/project.js` (format 6) | SVG and PNG export of every chart; the profile in the Excel workbook; share by link; project format 6 and its upgrade | M0 | B1, B2, B4, A7 |
| **W7 Data and benchmarks** | `validation/data/` (pairs), `test/benchmark-*.test.js`, docs/BENCHMARKS.md | the pairs of the benchmark separations; the benchmark flowsheets with columns (ethanol dehydration by extractive distillation, ethyl acetate with a decanter, methanol with gas cleaning, glycol dehydration); worked examples from open sources | W1, W2 | D2, D1, D5 (gaps) |
| **W8 Assistants and agents** | `ai/`, `src/flowsheet/document.js` (the schema checks), the tool interface docs | the authoring contract and error messages for the new blocks; the JSON tool interface; the column examples run in ChatGPT and Gemini canvases and other assistants, results recorded | M0; each block as it lands | A10, G1, C2, C3, C4, C6 |
| **W9 Quality and release** | CI, `test/performance*.test.js`, the flowsheet suite, the engineering report, release notes | performance budgets in CI (50-stage column under 5 s, A9); new cases in the flowsheet suite; the integration task of each milestone; the release | every workstream | A9, release v0.5, v0.6 |

## 11. Milestones and the critical path

```
M0 contracts ──► M1 ──► M2 ──► M3 ──► M4
                 W1 LLE data and fits ─────────┐
                 W2 shortcut ─► rigorous ─► absorber, stripper ─► extraction ─► specs, side draws
                 W3 membrane, evaporator ─► crystallizer, solids
                 W4 drum size ─► column hydraulics ─► cost (E2), utilities (E3)
                 W5 Column workspace ─► profiles ─► LLE and extraction views
                 W6 exports, share link, format 6
                 W7 pairs ─► benchmark flowsheets
                 W8 tool interface ─► assistants
                 W9 budgets in CI ─► flowsheet suite ─► release
```

| Milestone | Done when | Release |
|---|---|---|
| **M0 Contracts** | section 9 merged, with failing stubs | – |
| **M1 Shortcut and liquid-liquid** | the shortcut column and the Column workspace with McCabe-Thiele; liquid-liquid fits for the first systems and their views; the drum's size; SVG and PNG export; budgets in CI | – |
| **M2 Distillation** | the rigorous column with its profile, dry-stage and flooding warnings, its own method and two liquids on the stages; the column in the Excel export, format 6 and the tool interface; a benchmark column | **v0.5** |
| **M3 The other separations** | absorber, stripper, extraction and its view; membrane with its area; evaporator; crystallizer; the benchmark flowsheets; share by link | **v0.6** (with the reactors) |
| **M4 Specifications and cost** | purity and recovery specifications, side draws; cost correlations (E2) and utilities (E3) for every sized unit; the column examples recorded in other assistants | the start of v0.7 |

The critical path is M0, then W2 (the column engine): the views, sizing, benchmarks and the tool interface of a column
all wait for it. W1, W3, W6 and W8 start at once after M0 and do not wait for W2.

## 12. How the work is run

- **One task, one pull request, one decision file**, as now; a pull request stays within its workstream's files, except
  the one-line registrations.
- **Definition of done** for a task: the tests pass and compare with an independent calculation or open data; the
  balances close; failures are loud and say what to change; the numbers have sources, and the person is asked to check
  them; docs/models/ explains the method; the project file saves and opens the new state; the time budget holds.
- **The state of the plan** is kept in DECISIONS.md (an open item per workstream: done, next, waiting for) and in the
  roadmap's statuses, updated by the integration task of each milestone.
- **What may run in parallel:** at most one open pull request per workstream, and at most four at a time for the
  maintainer to review; a workstream whose task waits for a decision works on its next independent task.
- **Agents' briefs:** each workstream's agent gets this proposal, the contracts, its row of section 10 and its next task;
  its pull request says which contract version it was written against.
- **Integration** (W9), at the end of each milestone: the palette and workspace entries, the shared registrations, the
  roadmap and DECISIONS updates, a check in the browser, and the release notes.

## 13. Risks

| Risk | Effect | What reduces it |
|---|---|---|
| The rigorous column does not converge for non-ideal liquids | M2 slips; every workstream that needs columns waits | a robust start before Newton; the shortcut's result as the start; the Python reference from the first task; the hard cases (azeotropic, extractive) tested early |
| Liquid-liquid data are missing for a benchmark system | an extraction or decanting case cannot be checked | the data search first (W1, step 1); Modified UNIFAC 2.0 as a stated prediction; the system replaced in the benchmark only with the maintainer's agreement |
| No open source for Fair's chart or for cost correlations | flooding warnings or cost are delayed | the dry-stage warning needs no geometry; cost (M4) is the last milestone; supplier and textbook sources are searched by the rules |
| Contracts change during the work | workstreams rewrite their code | contracts fixed in M0 and versioned; changes only by the architect |
| Too many pull requests at once for one maintainer | review becomes the bottleneck | at most four open; the integration task bundles the small shared changes |
| The bundle grows past the budgets of A9 | pages load slowly in chat artifacts | the budgets in CI from M1; data packs (A2) are the answer if it happens, as a proposal of their own |

## Steps

The steps of Part I, each a pull request with its tests, placed in the workstreams and milestones of Part II:

| Step | Workstream | Milestone |
|---|---|---|
| 0. The contracts (section 9) | architect | M0 |
| 1. Liquid-liquid data, joint fits, views, the method guide's section | W1, W5 | M1 |
| 2. The Column block, shortcut mode; the Column workspace with McCabe-Thiele | W2, W5 | M1 |
| 3. The rigorous column (distillation): profile, dry-stage warning, its own method, two liquids on the stages | W2, W5 | M2 |
| 4. Absorber and stripper; columns with nonvolatile components (proposal 0009, step 5) | W2 | M3 |
| 5. Extraction and its view | W2, W5 | M3 |
| 6. Sizing and hydraulics: drums, decanters, column diameter, flooding and weeping | W4 | M1 (drums), M2 (columns) |
| 7. Membrane, with the area for a target | W3, W4 | M3 |
| 8. Crystallizer; evaporator; solid-liquid separator and dryer if kept | W3 | M3 |
| 9. Purity and recovery specifications, side draws; the benchmark flowsheets | W2, W7 | M3, M4 |
| 10. Cost correlations (E2) and utilities (E3) | W4 | M4 |
| 11. Exports, share by link, format 6; the tool interface; other assistants | W6, W8 | M1 to M4 |

## Questions for the maintainer

1. The order of the steps: liquid-liquid first (as above), or the distillation column first?
2. The fit targets for liquid-liquid data: for example within 0.01 in mole fraction of each phase, or the data's stated
   uncertainty where it is larger?
3. The solid's enthalpy: the liquid's minus the enthalpy of fusion, until open solid heat capacities are added?
4. Which of "Making it leaner" 4 and 5 (postpone the solid-liquid separator and dryer; the evaporator as a template)?
5. The flooding warning: at which fraction of flooding (the usual operating range is 0.65 to 0.90 of flooding; for
   example a warning above 0.90)?
6. Part II: the tracks taken in (section 7), and the milestones and releases (section 11)?
7. How many workstreams at once: all nine after M0, or three or four (for example W1, W2, W4, W9 first), so the
   reviews stay manageable?
8. Should the agents of the workstreams run as separate sessions, each with its own branch and pull request, with
   this session as project manager and architect?
