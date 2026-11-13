# 2026-11-13-08: Flowsheet mode and Calculations mode in the new layout (proposal 0021, section 1)

## What was asked

The maintainer (2026-11-13, testing the preview at /next.html): "When I press Flowsheet I have also the models in the
left and also below Flowsheet, which is very confusing." In the Flowsheet the rail listed the calculations (Flash,
Exchanger, Pipe, Reactor, Column) while the toolbar listed the flowsheet's blocks of the same names: one name, two
meanings. The maintainer gave freedom to solve it.

And, during the work: "settings is twice at units and settings take one out because it is confusing, there is no
difference". The context row's Units button and the top bar's Settings button opened the same Settings drawer.

## What was done (the new layout only; `layout: "next"`)

| What | Where |
|---|---|
| A switch **[Flowsheet \| Calculations]** first in the top bar, at every width (icons only on a phone): two buttons with `aria-pressed` in a group named "Mode"; Left and Right (and Home, End) move between them, Enter and Space press; the pressed half keeps the focus when the bar is redrawn | `src/ui/app-next.js` (`MODES`, `modeOf`, `navigation`, `modeTarget`, `switchMove`) |
| **Flowsheet mode**: no rail and no menu of calculations; the canvas takes the rail's width | `navigation()` |
| **Calculations mode**: the rail when wide, the Calculation menu otherwise, as before; the switch brings back the last calculation used, Phase equilibrium at first | `modeTarget()` |
| The rail's and the menu's heading "Units" is now **"Unit calculations"** | `calculations()` |
| The flowsheet toolbar's group "Blocks" is named **"Place a block"** in the new layout; the classic toolbar keeps "Blocks" | `src/ui/flowsheet-view.js` (`blocksLabel`), `src/ui/app.js` (internal key `flowsheetMode`, set by app-next.js only, like `canvasTabs`) |
| The **Settings button is taken out**; the Units button (which shows the units in use) opens the Settings; its name for a screen reader is "Units °C, kPa, mol frac: the Settings" | `TOOLS`, `SETTINGS_BUTTON` |
| Tests: every workspace has one place in one mode; no rail in Flowsheet mode; the rail in Calculations mode (the menu when narrow); the last calculation; the keys; the Settings reached once | `test/app-next.test.js` (5 tests added, 1 changed: the tools are three buttons now, the reason is in the test) |
| Screenshots, both modes, 375, 820 and 1280 px, light and dark (Calculations: ethanol + water T-x-y; Flowsheet: `examples/flowsheet-recycle.chepta.json`) | `docs/ui-review/2026-11-13-flowsheet-mode/` |
| Proposal 0021 section 1, the testers' checklist (Task 4, one line) | those files |

Not changed: the state, `applyPatch`, the project format, the classic layout, and `CHEPTA.app`'s public interface;
`update({ workspace: "flowsheet" })` opens the flowsheet and so Flowsheet mode. Which mode is shown is not saved in a
project (it follows the workspace). No engine code, number or parameter changed.

Where this differs from the coordinator's design: two toggle buttons (`aria-pressed`) rather than `role="tablist"`,
because the switch changes the whole workbench, not a panel beside it (no tab panel to point to), and the workbench's
other segmented controls use `aria-pressed` too; the arrows only move the focus, so passing over a mode never changes
the workspace. On a phone, the Calculation menu's button drops its icon, to leave its name the room the second half of
the switch takes.

## Checks (UI_GUIDE.md section 7)

Measured in Chromium on the 12 screenshots: no sideways scroll of the page at 375, 820 and 1280 px in either mode or
theme; in Flowsheet mode the rail and the Calculation menu are not shown and "Place a block" is; in Calculations mode
the rail shows its 9 buttons at 1280 px and the menu at 375 and 820 px; Calculations, pressed from the keyboard
(Right, then Enter) in Flowsheet mode, opens the T-x-y used before and keeps the focus on the switch; no script
errors. `npm run build`, `npm test`.

## What the maintainer is asked to decide

| # | Decision | Recommendation |
|---|---|---|
| 1 | From the Flowsheet, one press on Calculations returns to the last calculation, and a second press (rail or menu) chooses another. Or should Calculations open a menu of all nine at once? | As built: the last calculation in one press, which is the usual way back from the flowsheet; the rail is then one press away. |
| 2 | The Settings without a button of their own: the Units button opens them. Its label stays "Units °C, kPa, mol frac". Or name it "Settings" and show the units in it ("Settings: °C, kPa, mol frac")? | Keep "Units": it says what most people open the Settings for; its tooltip and its name for a screen reader say it opens the Settings. |
| 3 | The flowsheet toolbar's "Place a block" also in the classic layout? | No: the classic layout keeps "Blocks", unchanged, until it is removed (step 7); it has no rail of calculations beside the flowsheet. |
