# Documentation

Where to find what. Pages marked *generated* are written by a script and must not be edited
by hand; the script is named at the top of each.

## Start here

| Page | What it is |
|---|---|
| [../README.md](../README.md) | What CHEPTA is, how to use it, licences |
| [DECISIONS.md](DECISIONS.md) | What is pending, and the standing rules; the decisions of each pull request are in [decisions/](decisions/), one file each, by date |
| [../ROADMAP.md](../ROADMAP.md) | Where the project is going: tracks and releases |
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | The layers (data, property package, equilibrium, stream, blocks, flowsheet, interface) |
| [../proposals/README.md](../proposals/README.md) | Design proposals and their status |
| [../AGENTS.md](../AGENTS.md), [../CONTRIBUTING.md](../CONTRIBUTING.md) | Rules for contributors and their AI assistants; how to start |

## Models, by topic

| Page | Covers |
|---|---|
| [models/thermodynamics.md](models/thermodynamics.md) | Activity models (NRTL, UNIQUAC), Peng–Robinson and SRK, the gamma-phi vapour, pure-component correlations, mixture enthalpy, IAPWS steam, Henry's law, the Library of parameter sets |
| [models/equilibrium.md](models/equilibrium.md) | Bubble and dew points, flash (vapour-liquid, two liquids, three phases), stability tests, diagrams, azeotropes, residue curves, solid-liquid equilibrium |
| [models/flowsheet.md](models/flowsheet.md) | Streams, blocks, the flowsheet document and the recycle solver |
| [models/heat-exchangers.md](models/heat-exchangers.md) | Heat-exchanger pre-sizing (zones, arrangements, U, utilities, wall thickness), valves and pumps |
| [models/tools.md](models/tools.md) | The tool interface: the command line `chepta`, the local MCP server `chepta-mcp` (how to add it to Claude Code and Claude Desktop), the worker that stops a calculation, and the first assistant test |
| [models/reactions.md](models/reactions.md) | Reactions: the description and its checks (element balance), heats of reaction and K(T) from formation data, the rate laws (power law, LHHW, Michaelis–Menten, Monod and the other growth laws) |
| [models/columns.md](models/columns.md) | The Column block: the shortcut mode (Fenske, Underwood, Gilliland), its specification, where it holds and what it refuses; and the rigorous mode (MESH on every stage, Newton's method; M2a): the equations, the solver, the checks, the benchmarks |
| [models/columns-benchmarks.md](models/columns-benchmarks.md) | The column cases (constant relative volatility, ethanol + water, missing data, dry stages, infeasible specifications) and their independent references (MESH, Fenske-Underwood-Gilliland), ahead of the column engine |
| [METHOD_SELECTION.md](METHOD_SELECTION.md) | Which property method for which mixture and conditions |

## Data and how good it is

| Page | Covers |
|---|---|
| [DATA_RULES.md](DATA_RULES.md) | **How data are taken, fitted and checked: the rules for people and AI assistants** |
| [DATA_WANTED.md](DATA_WANTED.md) *(generated)* | Pairs with and without parameters |
| [PAIR_SCAN.md](PAIR_SCAN.md) *(generated)* | Every pair: the method it needs, its parameters, the open vapour-liquid data in the NIST TRC ThermoML Archive, the pairs fitted from it |
| [PURE_DATA.md](PURE_DATA.md) *(generated)* | Pure-component records: source and fit quality |
| [PURE_DATA_MEASURED.md](PURE_DATA_MEASURED.md) *(generated)* | Components fitted only to measured data |
| [missing-properties/TO_DOWNLOAD.md](missing-properties/TO_DOWNLOAD.md) | The documents to download by hand (free, but their servers refuse scripts): link, what to look for, what it unlocks |
| [MISSING_PROPERTIES_2026-10-28-2.md](missing-properties/MISSING_PROPERTIES_2026-10-28-2.md) | In the folder [missing-properties/](missing-properties/): pure-component properties still missing on 2026-10-28, after the full-text search for biphenyl, p-terphenyl and cumene hydroperoxide (the latest list; one dated file per update, the earlier ones kept: [2026-10-21](missing-properties/MISSING_PROPERTIES_2026-10-21.md), [2026-10-22](missing-properties/MISSING_PROPERTIES_2026-10-22.md), [2026-10-22-2](missing-properties/MISSING_PROPERTIES_2026-10-22-2.md), [2026-10-22-3](missing-properties/MISSING_PROPERTIES_2026-10-22-3.md), [2026-10-25](missing-properties/MISSING_PROPERTIES_2026-10-25.md), [2026-10-25-2](missing-properties/MISSING_PROPERTIES_2026-10-25-2.md), [2026-10-27](missing-properties/MISSING_PROPERTIES_2026-10-27.md), [2026-10-28](missing-properties/MISSING_PROPERTIES_2026-10-28.md)), and a recommendation for values the maintainer adds |
| [SLE_CHECKS.md](SLE_CHECKS.md) *(generated)* | Ideal solid solubility against measured data |
| [SLE_FITS.md](SLE_FITS.md) *(generated)* | NRTL fitted to solid solubilities |
| [BENCHMARKS.md](BENCHMARKS.md) | Benchmark processes and the pairs they need (proposal 0004) |
| [../src/data/LICENSES.md](../src/data/LICENSES.md) | The licence of every data source |

## Checks of the solvers

| Page | Covers |
|---|---|
| [FLOWSHEET_TESTS.md](FLOWSHEET_TESTS.md) *(generated)* | The flowsheet suite: the Cavett problem, generated recycle flowsheets, metamorphic tests |
| [EXCEL_CONCEPT_CHECK.md](EXCEL_CONCEPT_CHECK.md) *(generated)* | The Excel concept-model export recalculated in LibreOffice |

## Formats

| Page | Covers |
|---|---|
| [schema/project-6.json](schema/project-6.json) | JSON schema of project files (formats 2 to 6: the flowsheet, user data, energy streams and the blocks of proposal 0013, the fluid charts, the Column block); [project-5.json](schema/project-5.json), [project-4.json](schema/project-4.json) for the older formats |
| [schema/project-2.json](schema/project-2.json) | JSON schema of project files of format 2 (with the flowsheet) |
| [../ai/README.md](../ai/README.md) | Instructions and skills for AI assistants; contribution packages |
