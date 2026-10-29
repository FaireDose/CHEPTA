# 2026-10-29-08: Proposal 0015, M2a, step 3 (W2): the rigorous column, one liquid

The maintainer, 2026-10-29: start W2's next task, milestone M2a, the rigorous vapour-liquid column. Written against
contracts v1 (ARCHITECTURE.md, "The request path and the contracts of proposal 0015"), on W7's cases and reference
(docs/decisions/2026-10-29-04-column-cases.md). W7's complete M2a benchmark case was being prepared in parallel and was
not on main when this pull request was opened; it is run when it lands.

## What was done

- **The column engine** (`src/units/columns/engine.js`, `solveCascade`, contract 3): MESH on every stage, for vapour
  and one liquid, with a total or partial condenser, a partial reboiler, one or more feeds and the flowsheet's method
  (activity models with their vapour model, or an equation of state). The equations in the variables of Naphtali and
  Sandholm as DWSIM's open source code documents them (`NewtonRaphson.vb`, GPL-3.0); the solver as NeqSim's column
  documentation describes it: a bubble-point start (Wang-Henke, DWSIM's `BubblePoint.vb`), then Newton on all equations
  with a block-tridiagonal Jacobian; both read 2026-10-29, the code written anew. Added here: central differences,
  steps in the logarithms of the component flows, and a continuation in the relative volatilities when Newton fails
  (long columns with very pure products need it).
- **Results by contract 3:** the profile of every stage, the residuals by group with their tolerances, the iterations,
  what the solver tried; `checks.columns` through the request path.
- **Refusals and warnings:** a second liquid on a stage is refused (`PHASE_SPLIT`, "unsupported"; Michelsen's test on
  each stage after convergence), never returned; a solver that fails says what it tried (`NO_CONVERGENCE`,
  "not_converged") and does not call the separation impossible; `DRY_STAGE` below 1 % of the column's traffic (W7's
  D1: stages 2 to 5 exactly); purity and recovery, side draws, "LL" and "VLL", nonvolatile components: not built yet.
- **The Column block's rigorous mode** (`src/units/columns/column.js`): stages, feed stage (one per feed), condenser,
  pressure and two of reflux ratio, boil-up ratio, distillate or bottoms flow, condenser or reboiler duty. In the
  workbench: a Shortcut/Rigorous switch in the panel (switching takes the shortcut's stages, feed stage, reflux and
  distillate as a start), the results, the profile table under the drawing (one row per stage), solved in the worker
  with Stop; the "Rigorous column" lock of the toolbar is gone, and the Distillation workspace's lock now names the
  Column workspace (McCabe-Thiele, M2b). `solve_column` and `solve_flowsheet` through `CHEPTA.run`, the command line
  and the MCP server; project format 6 (`docs/schema/project-6.json` describes the rigorous keys).
- **Water's enthalpies faster** (`src/thermo/pure.js`): its liquid heat capacity, density and saturation enthalpies come
  from IF97 directly instead of through `steamSat`, which also computed the viscosity and the conductivity. The same
  numbers (test/steam.test.js, pure.test.js, enthalpy.test.js unchanged and passing); an aqueous column was several
  times slower without it.
- **Tests:** `test/columns-rigorous.test.js` (17 tests: A1, A3, D1 against the reference; A2's rigorous reflux at 101
  stages; B1 through `solve_column`; B1 with other pairs of specifications and with two feeds; a partial condenser with
  Peng-Robinson; C1; E2; butanol + water refused; the input guards; the warm start; save and reopen; the worker with
  its time limit and cancel; two performance budgets). Three earlier tests asked for the rigorous mode to be refused
  (test/api.test.js, cli.test.js, columns-shortcut.test.js); they now ask for a purity, which is still refused, through
  the same paths. test/api.test.js's contract test of the engine now expects "LL" and "VLL" to be refused.
- **Browser check** (Playwright, Chromium, the preview page): B1's flowsheet opened from a project file solves in the
  Web Worker (0.8 s); the 20-row profile shows under the drawing; no sideways scroll at 375 px (the table scrolls in its
  box); the reflux changed in the panel, saved (format 6) and reopened with the new profile; a 40-stage column stopped
  with the Stop button ("Stopped from the workbench"); no page errors.

## Choices made here, for the maintainer to confirm or change

- **The dry-stage threshold, 1 %** of the column's largest flow of the other phase (W7's D1 holds for any threshold
  between 0.1 % and 67 %).
- **The tolerances, 1e-10** by group (W7's cases ask for 1e-8 of the balances; the engine reaches 1e-10 in a few
  more iterations, which leaves room under the cases' 1e-6 against the reference).
- **The continuation in the relative volatilities**, after Newton from the bubble-point start gives up (no thousandfold
  fall of the residual in 12 iterations): this project's choice of a continuation method, not taken from a source.
- **Specifications per end:** a specification is written on the end whose variables it holds (the reflux ratio and the
  condenser duty on the top, the boil-up ratio and the reboiler duty on the bottom), so two of one end are refused with
  the reason; a product flow fills either end.
- **The products' state:** saturated at the column's pressure (a total condenser's distillate at its bubble point); a
  subcooled reflux is not built.
- **No pressure drop** along the column (as the shortcut and W7's cases).

## What the maintainer must check

- The equations and the solver's description against the two open sources (the engine's file header, docs/models/columns.md).
- That the agreement with W7's reference is as the tests state (A1, A3, D1 about 1e-11; B1 3e-12 in mole fraction).
- The refusals' wording in the workbench (a second liquid; not converged).
