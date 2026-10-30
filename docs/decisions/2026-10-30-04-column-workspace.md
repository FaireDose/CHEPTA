# 2026-10-30-04: Proposal 0015, step 4 (W5, W6; milestone M2b): the Column workspace, McCabe-Thiele, the column in Excel

The maintainer asked (2026-10-29) for the Column workspace under Unit models, McCabe-Thiele for binaries, the column in
the flowsheet's Excel export, and SVG and PNG of the column charts. No decision of the maintainer's is recorded yet:
this file lists what was built and what to decide.

## What was built

- **The Column workspace** (`src/ui/column-workspace.js`), under Unit models after the Reactor, replacing the locked
  "Distillation" entry. As the Reactor workspace: a flowsheet of its own (a feed, one column, distillate and bottoms),
  edited with the Flowsheet's panels and solved through the request path in the worker, with the Stop button. Ribbon:
  components, method, Shortcut / Rigorous (switching to rigorous starts from the shortcut's stages, feed stage, reflux
  and distillate, as the block's panel does), feed and column. Empty, it offers an example (benzene + toluene,
  Peng–Robinson, as W7's case B2). Canvas: McCabe-Thiele (two components), the rigorous column's temperature, flows
  and compositions by stage, the column's table, the Excel download of the profile and the construction. Saved in
  project format 6 (`column`), only once used.
- **McCabe-Thiele** (`src/ui/column-mccabe.js`): the construction of The ChemSep Book, 2nd ed., section 1.3.3 (public
  domain; already a source of W7's case B2), with the equilibrium curve from the column's own method (the bubble point
  of each liquid at the column's pressure), the q-line from the feed's enthalpy, the operating lines from the solved
  column's x_D, x_B and reflux, the stages stepped off (at the column's own feed stage for a rigorous column, and at the
  best one), the minimum reflux at the q-line pinch or at a tangent pinch (ethanol + water), and the stages at total
  reflux. The rigorous column's own liquid and vapour between stages are drawn as crosses, so the difference from
  constant molar overflow shows.
- **The check** (`test/column-workspace.test.js`), benzene + toluene with Peng–Robinson: against the shortcut,
  R_min 1.1624 against Underwood's 1.1624 (tolerance 1 %), N_min 6.81 against Fenske's 6.65 (5 %), N 13.89 against
  Gilliland's 14.45 (one stage); against the rigorous column at 10, 12, 14 and 16 stages (feed in the middle, R = 2,
  D = 50 kmol/h), 8.75, 10.61, 12.47 and 14.31 equilibrium stages against 9, 11, 13 and 15 (tolerance one stage: constant
  molar overflow and the fractional last step). The tolerances are this project's choice.
- **The column in the flowsheet's Excel workbook** (`src/ui/column-excel.js`, called from `flowsheet-excel.js`): one
  sheet per column, its inputs as given, its results each with its source (Fenske, Underwood, Gilliland, the energy
  balance, the solver), the largest residuals and their tolerances, and every stage (T, P, L, V, duty, x, y); values in
  grey italics (a column is not an Excel formula). The Inputs sheet points to it.
- **SVG and PNG** of each column chart (`src/ui/export-image.js`): the chart with its colours resolved, on the page's
  background, the PNG at twice its size. Small enough to add to the other charts later (B1).
- One line in `app-styles.js`: a button inside the canvas keeps its icon's size (the canvas sizes every svg to its width).

## Screenshots

`docs/ui-review/2026-10-30-column/`: empty, shortcut with McCabe-Thiele, rigorous with McCabe-Thiele, rigorous
compositions; at 375 and 1280 px, light and dark. No sideways scroll of the page at either width; no page errors.

## For the maintainer

- Check the McCabe-Thiele construction against The ChemSep Book, section 1.3.3 (pp. 26-31, eqs. 1.8 to 1.17).
- Decide the tolerances of the check (1 % in R_min, 5 % in N_min, one stage in N).
- Whether SVG and PNG go on every other chart next (B1), and whether W10 reviews the screenshots now.
- Not waited for: W2's two liquids on the stages and the column's own method, W4's hydraulics. Their results will show
  in the workspace's Results panel (the block's own) when they land; the charts may need a second liquid then.
