# 2026-11-19-01: Proposal 0026, step 3 built (the vapour + liquid condenser in the workbench)

What was decided before: proposal 0026 accepted by the maintainer on 2026-11-18 with the seven recommended answers
(docs/decisions/2026-11-18-05-vapour-liquid-condenser-proposal.md); steps 1 and 2 (engine, API, validation) built and
merged, with the maintainer's three answers on #261 (docs/decisions/2026-11-18-06-vapour-liquid-condenser-build.md):
answer 3 there, "step 3 (the workbench) goes in a separate, next pull request". This pull request is that step, as the
proposal's "Workbench" and "API and project file" sections say. The engine's numbers do not change.

## What this pull request does

- **The column's form** (`src/ui/flowsheet-view.js`, rigorous mode only): the "Condenser" row has a fourth button,
  "Vapour + liquid". Chosen, a row "Condenser fixed by" with Temperature (the project's units) | Vapour flow | Vapour
  share, and one input below it, whose label gives the full name ("Vapour distillate flow", "Vapour share of the
  distillate"); then the column's two specifications as today. With this condenser the reflux ratio's unit reads
  "L / liquid distillate" and the distillate flow "Distillate flow (liquid + vapour)"; a design specification's "In" list
  has "Liquid distillate" and "Vapour distillate".
- **Choosing and leaving the condenser** (`setCondenser` in `src/ui/flowsheet-logic.js`): choosing it adds a Product on
  the outlet `vapour_distillate` (the column requires it); choosing another condenser, the shortcut or an absorber
  removes that stream and its Product, the condenser's own key and the design specifications written on the vapour
  distillate. When that stream goes to a unit it is not removed: the form shows the note "send it out of the flowsheet
  first", as for a side draw. The Column workspace's switch to the shortcut takes the total condenser
  (`leaveVapourLiquid`).
- **Switching "Condenser fixed by" after a solve** starts the new input from the solved column's value (its temperature,
  vapour flow or share), which gives the same column (H1 of the engine's tests); before a solve the new input is empty.
  This is a convenience of the form, not a default number.
- **The canvas:** the vapour distillate leaves at the right of the column, in its upper quarter; the outlets are
  labelled "liquid distillate" and "vapour distillate" on the canvas and in the stream table (`outletName`).
- **Results:** the results panel and the column's Excel sheet (`src/ui/column-excel.js`) give the reflux ratio over the
  liquid distillate (L/U), the reflux over the whole distillate (L/(U+V)), the liquid and vapour distillates, their sum,
  the vapour share and the condenser temperature; the inputs list the condenser's key. The Streams sheet has the vapour
  distillate as a stream from "COLUMN vapour_distillate". The profile's note names the condenser.
- **McCabe-Thiele** (Column workspace): not drawn for this condenser, saying why (two distillates of different
  compositions); not in the proposal, but the diagram would otherwise be drawn with the liquid distillate's line only.
- **Project files:** `PROJECT_FORMAT` 11 (`src/ui/project.js`), written only when a column has this condenser (or one
  of its keys, or a stream on its outlet); a file of an older format that holds one is refused, naming format 11; all
  other projects keep the lowest format that holds them and read unchanged. Schema `docs/schema/project-11.json` (the
  port pattern now allows "_"). Three lines of two existing tests that assert the newest format number were updated
  (10 to 11, and the "too new" file 11 to 12), as the format 10 change did with 9 (commit da71bc6; they count formats,
  they do not test a result): `test/project.test.js` (two) and `test/design-specs.test.js` (one).
- **Docs:** `docs/models/columns.md`, section "The vapour + liquid condenser": definitions (reflux ratio L1/U1,
  distillate_kmol_h = liquid + vapour), the outlets, the refusals, `feed_second_liquid: "top"` into the liquid
  distillate.
- **Tests:** `test/columns-vapour-liquid-workbench.test.js` (4 tests): the condenser switch and its stream, the outlet
  names, Lab's methanol column at 53 C from the workbench with its Excel sheet and a format-11 project solved again, and
  older projects unchanged.
- **Checked in Chromium** (the workbench with Lab's methanol column, condenser at 53 C, R = 2, B = 4581 kmol/h): the
  form shows the four condenser buttons and the "Condenser fixed by" row; the column solves (liquid distillate
  4532.7 kmol/h, vapour 298.29 kmol/h, share 0.06175, reflux over the whole distillate 1.877); switching to "Vapour
  share" fills 0.0617455; back to "Total" removes the vapour distillate's stream.

## Open, for the maintainer

1. The buttons of "Condenser fixed by" read "Vapour flow" and "Vapour share" (the proposal: "Vapour distillate flow",
   "Vapour share of the distillate"), because the longer names wrap to three lines in the Inputs panel; the input below
   carries the full name. Recommended: keep the short buttons.
2. McCabe-Thiele is refused for this condenser rather than drawn with the liquid distillate only. Recommended: keep the
   refusal until a case asks for the diagram.
3. Step 4 (the IDAES cross-check) is next, as the proposal says.
