# Architecture

This document describes how CHEPTA is built and how it is meant to grow from
phase equilibria to full flowsheets. It is the reference for every contribution,
human or AI: new work should fit these layers and interfaces, or change this
document first.

## Goals

1. **Runs where people already are.** A page, an AI chat artifact, or a course website
   loads one script and calculates in the viewer's browser. No server, no install.
2. **Every number can be traced.** Each parameter carries its source, its quality tier
   and its license. Every model is checked against data or an independent calculation.
3. **Easy to extend without breaking.** Contributors add chemicals, models and unit
   operations through fixed interfaces, without touching the rest.
4. **Readable by engineers.** Flowsheets are plain JSON files that an engineer can check
   and an AI assistant can write.

## Layers

Each layer uses only the layer below it, through a documented interface. Someone
adding a heat exchanger never touches the thermodynamics; someone adding
Peng–Robinson does not break the flash drum.

| # | Layer | Job | Code | Status |
|---|---|---|---|---|
| 0 | Data | Pure-component constants, binary parameters, UNIFAC groups, each with source, tier and license | `src/data/` | 92 components with constants and property correlations (16 of v0.2, 33 of proposal 0004, 43 of proposal 0008: batch 1 (11 extraction solvents), batch 2 (14 for gas treating, acids, esters and reaction work), batch 3 (13 petrochemicals, fuels and nitrogen compounds), batch 4 (3 solids) and 2 fitted to measured data), 90 of them with a melting temperature and enthalpy of fusion; 54 activity-model parameter sets; 42 k_ij (PR, SRK); Henry constants for 6 gases in water |
| 1 | Property package | Activity coefficients, fugacities, K-values, enthalpy, density at any T, P, composition | `src/thermo/`, `src/reactions/` | NRTL, UNIQUAC, ideal; acid dimerization; Peng–Robinson and SRK; pure-component properties and enthalpy (`pure()`); IAPWS-IF97 and IAPWS transport for water; Henry's law; vapour model choice (ideal gas, PR, SRK) for activity models; mixture enthalpy, excess enthalpy and `phase()` for every model; reactions (proposal 0010, step 2): the description with its element balance, ΔrH°, ΔrG° and K(T) from formation data, the rate laws |
| 2 | Equilibrium | Bubble and dew points, flash, azeotropes, phase stability, residue curves | `src/equilibrium/` | Bubble and dew T/P for every model, azeotropes, spinodal check, residue curves; tangent-plane stability test for PR/SRK; chemical equilibrium of listed reactions in one phase, gas or liquid (proposal 0010, step 4), or with vapour and liquid together (a reactive flash), and of every reaction among given species (the Gibbs reactor, step 6); the stiff ODE integrator in `src/util/ode.js`; flash (T-P, P-H, P-VF, T-VF) with heat duty, with two liquids and vapour + two liquids for NRTL and UNIQUAC; errors with codes. **Two liquids with PR/SRK missing** |
| 3 | Stream | T, P, component flows, phase split, enthalpy flow | `src/stream/` | `stream()`: a flash of component flows (kmol/h or kg/h) at T-P, P-H (enthalpy flow), P-VF or T-VF, with phase flows and enthalpy flow in kW (proposal 0006, step 1) |
| 4 | Unit operations | Inlet streams + specifications → outlet streams + duties | `src/units/` | `registerUnit`, `runUnit` with port, specification and balance checks; feed, mixer, splitter, component separator, flash drum, heater/cooler, product (proposal 0006, step 2); conversion and yield reactors, with the generation of every component, the element (or mass) balance and the heat of reaction in the energy balance (proposal 0010, step 3); the equilibrium reactor, with an approach to equilibrium and the outlet temperature or the duty (step 4), one phase or two, listed reactions or Gibbs; the CSTR and the plug-flow reactor with the reactions' rate laws or the user's own formula (`src/units/kinetic-reactors.js`, `src/reactions/expression.js`; steps 5 and 9), with the profiles along the tube; the Column block (`src/units/columns/`; proposal 0015) in shortcut mode (Fenske, Underwood, Gilliland; M1), with its minimal profile, and in rigorous mode (M2a): the column engine `solveCascade` (contract 3), MESH on every stage solved by Newton's method (Naphtali-Sandholm) for vapour and one liquid, with the phase-stability refusal, the dry-stage warning and the profile of every stage; and (M2b) two liquids on the stages (`phases: "VLL"`, `src/units/columns/two-liquids.js`, activity models), a decanter on the condenser, and the column's own property method with the P-H boundary at its streams |
| 5 | Flowsheet | Connects units, orders the calculation, converges recycles | `src/flowsheet/` | `solveFlowsheet`: structure checks, loops (Tarjan), tear streams (chosen or marked), direct substitution then bounded Wegstein, overall balances; checked against an equation-oriented Python solution (proposal 0006, step 3). File format: step 4 |
| 6 | Interface | Workbench (the Flowsheet workspace solves through the request path, `src/api/`), diagrams, flowsheet drawing, stream tables, controls | `src/ui/` | Workbench (`app`): File (projects: files, this browser, the host page's `storage`, automatic copy of the open work), then the sections Properties & Equilibria (phase equilibrium, steam, gas solubility, properties), Unit models (flash; reaction and distillation shown as not yet available) and Flowsheet; task workspaces (phase equilibrium, flash, gas solubility, properties, steam), per-workspace inputs and Library, Sources and Settings panels; one model choice for every diagram (activity model with a vapour model, or PR/SRK); T-x-y, P-x-y, ternary, azeotrope and envelope views in mole fraction or wt %; flash stream table with CSV export; Flowsheet workspace (setup of components, method and reactions, block palette with the conversion, equilibrium and yield reactors, canvas with drag to connect, automatic products, degrees of freedom per block, energy streams, stream table with CSV; proposal 0006 step 5); property explorer; Henry and steam views |
| 7 | Design studio | Cost engineering (sizing, capital and operating cost, cost of product) and agent-run studies that compare process routes from the literature; every result reproducible and sourced | `src/design/` | Not started; roadmap tracks E and G |

Units inside the engine: temperature in K, pressure in kPa, amounts in mol or kmol,
energy in J or kW. The interface converts for display (°C, for example).

## Layer 0: data

### Records

- **Component** (`components.json`): name, formula, CAS number, aliases, molar mass,
  critical constants, normal boiling point, vapour-pressure equation with validity
  range, UNIQUAC r and q; later ideal-gas heat capacity, heat of vaporization, liquid
  density and UNIFAC groups.
- **Binary pair** (`binaries.json`): model, the two components, parameters
  (`tau_ij = a_ij + b_ij/T` for NRTL, `tau_ij = exp(a_ij + b_ij/T)` for UNIQUAC), `source`
  and `tier`.

### Quality tiers

With 100 chemicals there are 4,950 pairs, and no open databank covers them all
(ChemSep, the largest open set, has 329 NRTL pairs). So each pair is labelled, and
the interface shows the label next to every result:

| Tier | Meaning |
|---|---|
| `fitted` | Regressed for CHEPTA from cited experimental data (`validation/python/fit_parameters.py`) |
| `standard` | Computed from an official standard (IAPWS for water) |
| `databank` | Taken from an openly licensed parameter set (ChemSep, Artistic License 2.0) |
| `predicted` | Group contribution (modified UNIFAC, Dortmund) where no fitted or databank pair exists. **Planned for v0.2** |
| `supplier` | A single pure-component constant (melting point, boiling point, density) as the average of the values printed by at least three chemical suppliers, only where no open measured value exists ([docs/DATA_RULES.md](docs/DATA_RULES.md#supplier-data-last-resort)) |
| `user` | Supplied in the page's own setup, for example from a paper being discussed |

The engine uses the best available tier for each pair and never silently falls back
to ideal behaviour.

### Licenses

Every data source is listed in [`src/data/LICENSES.md`](src/data/LICENSES.md). Some
tables in open libraries originally come from handbooks; each table is checked before
it is copied.

### Data packs (planned for v0.2)

AI chat artifacts cannot download data files, but they can load scripts. So as the
databank grows, data ships as **data packs**: small script files that register
themselves with the core.

```html
<script src="https://cdn.jsdelivr.net/npm/chepta@0.2.0/dist/chepta.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chepta@0.2.0/dist/data/solvents.js"></script>
```

Each pack calls `CHEPTA.registerData({ components, pairs, groups })`. The core stays
small, and a page loads only the chemicals it needs. The core bundle includes a small
default set (the current ten components).

## Layer 1: property package

One interface for every model, so layers above never know which model is in use:

```js
const pkg = CHEPTA.propertyPackage({ components: [...], liquid: "NRTL", vapour: "ideal" });
pkg.gammas(x, T)            // activity coefficients
pkg.kValues(T, P, x, y)     // y_i / x_i
pkg.enthalpy("liquid", T, P, x)   // J/mol, planned for v0.2
pkg.enthalpy("vapour", T, P, y)
```

Today this role is played by `createSystem` in `src/thermo/system.js`. v0.2 renames and
extends it; `createSystem` stays as an alias.

## Layer 2: equilibrium

Algorithms take a property package and never look inside it:

- Bubble T and P (done), dew T and P (v0.2)
- PT flash with Rachford–Rice, then PH and PQ flash (v0.3)
- Phase stability: tangent-plane tests for activity models and PR/SRK; the flash finds two liquids for NRTL and UNIQUAC (v0.3), for PR/SRK later
- Azeotrope search (done), residue curves (done)
- Chemical equilibrium of listed reactions, in the vapour or in the liquid (proposal 0010, step 4)

## Layer 3: stream

```js
const sys = CHEPTA.system({ components: ["water", "ethanol"], model: "NRTL" });
const s = CHEPTA.stream(sys, { flow_kmol_h: { water: 60, ethanol: 40 }, T_K: 355, P_kPa: 101.325 });
// { T_K, P_kPa, flow_kmol_h: { water, ethanol }, F_kmol_h, mass_kg_h, z, VF,
//   phases: [{ type, fraction, composition, F_kmol_h, flow_kmol_h, h_J_mol }],
//   h_J_mol, H_kW, MW, warnings, sources }
CHEPTA.stream(sys, { flow_kmol_h, P_kPa: 101.325, H_kW: s.H_kW });   // P-H: gives back T
```

A stream is always created by a flash, so its phase split and enthalpy are consistent
with the property package. The enthalpy flow has the flash's reference (each component as
an ideal gas at 298.15 K). A stream without flow carries T and P only (`src/stream/stream.js`,
proposal 0006).

## Layer 4: unit operations

Every unit has the same shape, so contributors can add units independently
(`src/units/units.js`):

```js
CHEPTA.registerUnit({
  type: "heater", label: "Heater / cooler",
  inlets: [{ port: "in" }],
  outlets: [{ port: "out" }],                 // { port, min, max }: several streams on one port when max > 1
  specKeys: ["T_K", "duty_kW", "P_kPa"],      // any other key of its spec is refused (BAD_INPUT naming it)
  checkSpec(spec, { sys, outletCount }) { /* normalize, or throw BAD_INPUT naming the problem */ },
  solve({ sys, inlets, spec, outletCount }) {
    // material and energy balances + equilibrium (streams from CHEPTA.stream)
    return { outlets: { out }, duty_kW, notes };
  }
});
CHEPTA.runUnit("heater", { sys, inlets: { in: s }, spec: { T_K: 350 } });
// { outlets, duty_kW, balance: { material, energy_kW }, notes }
```

Rules for a unit: it closes its material balance to 1e-9 relative, reports its energy
balance, validates its specs with clear messages, and ships with a test against a
published example or an independent calculation.

First units: feed, mixer, splitter, component separator, flash drum, heater/cooler, product (proposal 0006); pump and valve next.
Then shortcut and rigorous distillation (v0.5), then reactors (conversion and yield: proposal 0010, step 3; equilibrium:
step 4; then CSTR, plug flow, Gibbs) with a common description of reactions, heat exchangers and compressors
(v0.6), growing towards models of all the common unit operations.

## Layer 5: flowsheet

### File format

A flowsheet is part of a project file (format 2, `src/ui/project.js`; schema
`docs/schema/project-2.json`). An engineer can read it, GitHub shows exactly what changed,
and an AI assistant can write it, check it with `CHEPTA.checkProject(doc)` and solve it with
`CHEPTA.runFlowsheet(doc)`:

```json
{
  "fugacity_project": 2,
  "workbench": {},
  "flowsheet": {
    "components": ["ethanol", "water"],
    "thermo": { "model": "NRTL", "vapour": "ideal" },
    "blocks": [
      { "id": "F1", "type": "feed", "x": 40, "y": 120,
        "spec": { "flow_kmol_h": { "ethanol": 30, "water": 70 }, "T_K": 300, "P_kPa": 101.325 } },
      { "id": "E1", "type": "heater", "x": 160, "y": 120, "spec": { "VF": 0.4 }, "energy": "Q1" },
      { "id": "V1", "type": "flash", "x": 280, "y": 120, "spec": { "P_kPa": 101.325, "duty_kW": 0 } },
      { "id": "P1", "type": "product", "x": 400, "y": 60 },
      { "id": "P2", "type": "product", "x": 400, "y": 180 }
    ],
    "streams": [
      { "id": "S1", "from": "F1.out", "to": "E1.in" },
      { "id": "S2", "from": "E1.out", "to": "V1.in" },
      { "id": "S3", "from": "V1.vapour", "to": "P1.in" },
      { "id": "S4", "from": "V1.liquid", "to": "P2.in" }
    ]
  }
}
```

The `fugacity_project` field states the format version. Older files keep working: a newer
engine reads every older format version (format 1 has no flowsheet).

**Degrees of freedom.** Before solving, every block's specifications are counted
(`specStatus`, `flowsheetStatus`): what it needs, what is given, what is missing or too much.
A flowsheet is solved only at zero degrees of freedom with every connection in place; the
message names each block that is not ready.

**Energy streams.** Every block with a duty (heater/cooler, flash drum, component separator)
has an energy stream, `Q-<block>` or the name in `energy`, in kW (positive: heat in).

### Solver

Sequential modular, as in most commercial simulators: order the units, choose tear
streams to break recycles, and converge them with Broyden's quasi-Newton method (the
default), Wegstein acceleration or direct substitution (`solver: { method, tolerance,
maxIterations }` per flowsheet; see [docs/models/flowsheet.md](docs/models/flowsheet.md))
(`CHEPTA.solveFlowsheet(sys, { blocks, streams, solver })`, `src/flowsheet/flowsheet.js`; a
loop that does not converge throws NO_CONVERGENCE naming the loop and its tear streams). Design
specifications ("adjust the reflux until the distillate purity is 99 %") are an outer
loop. An equation-oriented mode can come later.

## Layer 6: interface

- `CHEPTA.mount(element, config)` puts a view into a page. Views so far: T-x-y and
  ternary. Planned: P-x-y, McCabe–Thiele, flowsheet drawing, stream tables.
- Views only call the layers below; they never contain thermodynamics.
- Heavy calculations (large ternary grids, columns) move to a background worker so
  the page stays responsive. Artifacts allow workers created from the page's own code.

## The request path and the contracts of proposal 0015 (contracts v1, milestone M0)

Contracts written down before the separation units are built ([proposal 0015](proposals/0015-separation-units.md),
section 9), so that several people or agents can work on them at the same time. After M0, a contract changes only by
a pull request that gives it a new version and says so here.

| # | Contract | Where | State at M0 |
|---|---|---|---|
| 1 | **Stream v2**: phase types `vapour`, `liquid` (`light` or `heavy` when there are two) and `solid` (equilibrium or inert); the solid's enthalpy rule; a stream without them unchanged | `src/stream/` | written down; built with the first block that needs it (W3, W1) |
| 2 | **Unit v2**: a block may return `profile`, `warnings` (`{ code, message, stage?, remedy? }`, codes `DRY_STAGE`, `FLOODING`, `WEEPING`, and `VOLATILITY_VARIES` from the shortcut column), `sizing` and `method`; `runUnit` passes them on and refuses an unknown warning code | `src/units/units.js` | built |
| 3 | **Column engine**: `solveCascade({ sys, stages, feeds, draws, specs, ends, phases, start })`, residuals by group, a phase it cannot represent refused | `src/units/columns/engine.js` | built: "VL" (M2a) and "VLL" with a decanter (M2b); "LL" and side draws refuse (`NOT_AVAILABLE`) until M3, M4; the shortcut column (M1) is `src/units/columns/shortcut.js`, outside the cascade engine |
| 4 | **Sizing**: `sizeDrum`, `sizeDecanter`, `columnDiameter`, `membraneArea`, each `(unit result, options) → { dimensions, basis, source }` | `src/sizing/sizing.js` | the drum and decanter sizes built (M1; [docs/models/sizing.md](docs/models/sizing.md)), also the capability `size_drum`; the column diameter (M2b; its tray hydraulics in `src/units/columns/hydraulics.js`, the Column block's `sizing` option); the membrane area refuses until M3 |
| 5 | **Project format 6**: the new blocks, with the upgrade from format 5 | `src/ui/project.js` | built (M1): format 6 is written only with a Column block (`docs/schema/project-6.json`); older files open as before |
| 6 | **The request path**: `CHEPTA.run(request) → result` | `src/api/`, `bin/` | built for the existing blocks (below); the command line `chepta` and the local MCP server `chepta-mcp` (M1; [docs/models/tools.md](docs/models/tools.md)) |
| 7 | **The execution envelope**: run id, input hash, limits, status, cancellation, late results discarded | `src/runtime/` | built: `CHEPTA.run` on the caller's thread as before; the worker (M1): a Node worker thread for the command line and the MCP server, a Web Worker for the workbench's flowsheet and `CHEPTA.runAsync` / `startRun`, falling back to the page's thread where a page allows no worker, and saying so |

**The request path** (`src/api/dispatcher.js`). One dispatcher over the existing functions, for the workbench (the
Flowsheet workspace solves through it), chat pages, and, from milestone M1, the command line and the local MCP server
(`chepta-mcp`):

```js
CHEPTA.run({ capability: "solve_flowsheet", input: { project }, limits: { time_ms: 60000 } })
// { chepta_result: 1, capability, outcome, value, checks, qualifications, reproduction, run }
CHEPTA.capabilities()   // name, summary, status ("available" or "unsupported"), readOnly, input schema, planned
```

- **Capabilities at M0:** `capabilities`, `find_component`, `component_info`, `check_project`, `flowsheet_status`,
  `solve_flowsheet`; `solve_column` is listed as unsupported, with where it is planned. **M1:** `solve_column` (the shortcut column, W2) and `size_drum` (a flash
  block's drum and decanter sizes, W4).
- **outcome:** `ok`, `invalid_input` (BAD_INPUT, OUT_OF_RANGE), `missing_data`, `unsupported` (NOT_AVAILABLE,
  PHASE_SPLIT), `not_converged`, `cancelled`, `out_of_time` (from the worker, M1), `error` (a bug in CHEPTA). An error
  carries `code`, `message` and `where` (the fields or blocks it concerns).
- **checks:** the residuals by group (material, energy, each block, each loop's tear residual and tolerance);
  **qualifications:** the parameter set and tier of each pair, the pairs without parameters, the blocks' notes and
  warnings; **reproduction:** the library version, the method, the parameter sets, and the hashes of the input, the
  records used and the user's data (64-bit FNV-1a of the canonical JSON, `src/api/hash.js`). A converged result is not
  a result validated against data.
- **Command line, MCP server and worker (M1):** `npx chepta run project.json`, `chepta capabilities`, `chepta request
  request.json` (an exit code per outcome); `chepta-mcp`, a local MCP server over standard streams (revision 2026-07-28,
  and 2025-11-25 / 2025-06-18 through `initialize`), whose tools are the available capabilities; each run in a worker,
  so that `limits.time_ms` gives `out_of_time` and a cancel gives `cancelled` (runtime error codes `OUT_OF_TIME`,
  `CANCELLED`, `WORKER_FAILED`). How to use them and how they are tested: [docs/models/tools.md](docs/models/tools.md).
- A flowsheet's block results carry a block's Unit v2 `profile`, `warnings` and `method` when it returns them, so they
  reach the request path's qualifications.
- A request is plain JSON; the property package is built inside the capability from the components, the method and
  the user's data. Each capability has an input schema (`src/api/schema.js`, a subset of JSON Schema): it checks the
  form; the engine still checks the physics.

## Versions and compatibility

- Semantic versioning: `0.x` releases may change interfaces; from `1.0` on, breaking
  changes need a major version.
- Pages load an exact version from the CDN, so a new release never changes an existing
  artifact.
- The flowsheet file carries its format version (see above).

## Quality and review

Anyone can propose a change; nothing reaches a release without an independent check.
Contributions arrive through a form or a pull request ([CONTRIBUTING.md](CONTRIBUTING.md));
every pull request runs the full test suite (the engine against the independent Python
model and all validation data); a reviewer who did not write the change checks the
sources, the fit quality and the tests, and changes to `src/data/` and `validation/` need
a data reviewer. Roles and decisions: [GOVERNANCE.md](GOVERNANCE.md); protections:
[SECURITY.md](SECURITY.md).

## Next steps

The design work ahead is laid out as the **core track** in
[ROADMAP.md](ROADMAP.md) (steps A1–A12). Each step is settled by a proposal before it is
built; the first, the property package interface, is
[proposal 0001](proposals/0001-property-package.md).
