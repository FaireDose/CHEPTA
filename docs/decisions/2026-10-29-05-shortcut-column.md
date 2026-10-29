# 2026-10-29-05: Proposal 0015, M1, step 2 (W2): the Column block, shortcut mode

The maintainer, 2026-10-29: start W2's first task, the Column block in shortcut mode, delivered end to end. Written
against contracts v1 (ARCHITECTURE.md, "The request path and the contracts of proposal 0015"), on W7's cases
(docs/decisions/2026-10-29-04-column-cases.md).

## What was done

- **The shortcut** (`src/units/columns/shortcut.js`): Fenske, Underwood, Gilliland in Eduljee's form, the feed stage
  by Fenske's ratio; the equations as DWSIM's open source code documents them (`dwsim-shortcut-column`), the same forms
  as W7's `reference_fug.py`. It agrees with the fixture to 1e-9 relative on A1 and A2 (W7's tolerance).
- **The Column block** (`src/units/columns/column.js`, type `column`): keys, recoveries, reflux ratio or reflux over the
  minimum, total or partial condenser, pressure. Relative volatilities from the flowsheet's method at the feed's
  bubble point; q from the feed's enthalpy; saturated products; condenser and reboiler duties (DWSIM's forms); the
  minimal profile (condenser, feed stage, reboiler). Modes: shortcut built, rigorous planned (refused by the column
  engine, which still refuses until M2a).
- **Refusals and warnings** (W7's E cases): below the minimum reflux (E1), a boil-up of zero or less (E2), purity
  specifications and the rigorous mode unsupported (E3 before M4), missing pair (C1), an azeotrope or pinch between the
  keys at the top or the bottom (refused, naming the azeotrope), a non-key between the keys (not built), and a new
  warning code `VOLATILITY_VARIES` when the keys' relative volatility changes by more than 20 % along the column.
- **End to end:** the block in the palette (the "Distillation" lock of the toolbar now names the rigorous column),
  its form, its panel and its table under the drawing; project format 6 (written only with a column;
  `docs/schema/project-6.json`; formats 1 to 5 still open, and a column in a file that says an older format is
  refused); `solve_column` available through `CHEPTA.run`, the command line and the MCP server (a feed, the column and
  two products, solved as a flowsheet).
- `test/columns-shortcut.test.js`; W8's tests that expected `solve_column` to be unsupported now check its rigorous
  mode instead (test/api.test.js, mcp.test.js, cli.test.js); test/project.test.js expects format 6 (and format 7 as
  the too-new one); test/flowsheet.test.js and units.test.js took "column" as their example of an unknown block type
  and now take a made-up one. The column landing makes those expectations wrong; they test the same paths.
- **Browser check** (Playwright, Chromium): a feed, a column and two products solve; the column's table shows under
  the drawing and its numbers in the panel; saved as format 6 and reopened with the same table; the palette's Column
  button places a column with two product streams; no page errors.

## Choices made here, for the maintainer to confirm or change

- **The relative volatilities at the feed's bubble point**, held constant (DWSIM takes the K-values at the feed's
  conditions). The keys' values at the top and the bottom are computed only to check the method.
- **The 20 % warning threshold** for a changing relative volatility: this project's choice, not a published rule
  (benzene + toluene at 1 atm varies by 15 % and is not warned; ethanol + water by a factor of 2 and is).
- **One energy stream:** the flowsheet allows one energy stream per block, so the column's is the reboiler's duty
  minus the condenser's; the two duties are shown apart in the block's panel, its table and the result. Two drawn
  energy streams (condenser and reboiler) need a change of the flowsheet's energy streams, left for the rigorous
  column.
- **The whole stages:** N rounded up; the feed stage so that the stages from it to the reboiler are N_S rounded.
- **Not done:** a non-key between the keys (Underwood's several roots), feeds with nonvolatile components or inert
  solids (proposal 0015, step 7), the Excel export of the column (not required yet), the McCabe-Thiele view (W5).
- **W7's cases:** nothing found wrong. A3, B1 and D1 are rigorous cases (M2a); E2's state cannot be reached by the
  shortcut (Underwood's minimum keeps the boil-up positive), so its guard is tested on E2's numbers directly.

## To check

The equation forms in `src/units/columns/shortcut.js` against DWSIM's `ShortcutColumn.vb` (linked in its header). No
number was transcribed from a source in this task.
