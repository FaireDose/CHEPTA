# 2026-11-13-08: Flowsheet mode and Calculations mode in the new layout (proposal 0021, section 1)

## What was asked

The maintainer (2026-11-13, testing the preview at /next.html): "When I press Flowsheet I have also the models in the
left and also below Flowsheet, which is very confusing." In the Flowsheet the rail listed the calculations (Flash,
Exchanger, Pipe, Reactor, Column) while the toolbar listed the flowsheet's blocks of the same names: one name, two
meanings. The maintainer gave freedom to solve it.

And, during the work: "settings is twice at units and settings take one out because it is confusing, there is no
difference". The context row's Units button and the top bar's Settings button opened the same Settings drawer.

And, relayed by the coordinator the same day: "there is a button with hide layers, but are there any background
layers or is this from another software?" The canvas corner's "Hide background layers" button was shown in every
workspace.

## What was done (the new layout only; `layout: "next"`)

| What | Where |
|---|---|
| A switch **[Flowsheet \| Calculations]** first in the top bar, at every width (icons only on a phone): two buttons with `aria-pressed` in a group named "Mode"; Left and Right (and Home, End) move between them, Enter and Space press; the pressed half keeps the focus when the bar is redrawn | `src/ui/app-next.js` (`MODES`, `modeOf`, `navigation`, `modeTarget`, `switchMove`) |
| **Flowsheet mode**: no rail and no menu of calculations; the canvas takes the rail's width | `navigation()` |
| **Calculations mode**: the rail when wide, the Calculation menu otherwise, as before; the switch brings back the last calculation used, Phase equilibrium at first | `modeTarget()` |
| The rail's and the menu's heading "Units" is now **"Unit calculations"** | `calculations()` |
| The flowsheet toolbar's group "Blocks" is named **"Place a block"** in the new layout; the classic toolbar keeps "Blocks" | `src/ui/flowsheet-view.js` (`blocksLabel`), `src/ui/app.js` (internal key `flowsheetMode`, set by app-next.js only, like `canvasTabs`) |
| The **Settings button is taken out**; the Units button (which shows the units in use) opens the Settings; its name for a screen reader is "Units °C, kPa, mol frac: the Settings" | `TOOLS`, `SETTINGS_BUTTON` |
| **The background switch** only where there is something to switch: the toolbar's "Display" group of Phase eq., Charts and Solubility, named **"Grid and shading"** (tooltip as before: "Show or hide the colour map, isotherms, grid lines and two-liquid shading"). The canvas corner's button and the Settings drawer's are hidden. The plain grid lines of the other workspaces' charts (Properties, Exchanger, Pipe, Column, Reactor) are always shown, even when the switch was turned off in a phase diagram | `BACKGROUND_WORKSPACES` in `src/ui/workspaces.js`; `HIDDEN_BACKGROUND_DOORS` and two CSS rules in `src/ui/app-next.js`; the label through the internal key `nextNames` of `src/ui/app.js` |
| Tests: every workspace has one place in one mode; no rail in Flowsheet mode; the rail in Calculations mode (the menu when narrow); the last calculation; the keys; the Settings reached once | `test/app-next.test.js` (6 tests added, 1 changed: the tools are three buttons now, the reason is in the test) |
| Screenshots, both modes, 375, 820 and 1280 px, light and dark (Calculations: ethanol + water T-x-y; Flowsheet: `examples/flowsheet-recycle.chepta.json`), 01-12; the background switch in the ternary map's toolbar (13), none in the Exchanger (14), and the classic layout unchanged (15) | `docs/ui-review/2026-11-13-flowsheet-mode/` |
| Proposal 0021 section 1, the testers' checklist (Task 4, one line) | those files |

Not changed: the state, `applyPatch`, the project format, the classic layout, and `CHEPTA.app`'s public interface;
`update({ workspace: "flowsheet" })` opens the flowsheet and so Flowsheet mode. Which mode is shown is not saved in a
project (it follows the workspace). No engine code, number or parameter changed.

Where this differs from the coordinator's design: two toggle buttons (`aria-pressed`) rather than `role="tablist"`,
because the switch changes the whole workbench, not a panel beside it (no tab panel to point to), and the workbench's
other segmented controls use `aria-pressed` too; the arrows only move the focus, so passing over a mode never changes
the workspace. On a phone, the Calculation menu's button drops its icon, to leave its name the room the second half of
the switch takes.

What the background layers are (measured in Chromium, ethanol + water, every workspace): Phase eq. (T-x-y, P-x-y,
ternary map, azeotropes, phase envelope), Charts and Solubility have a colour map, isotherms, two-liquid shading or grid
lines under the class "fug-bg-layer", and already had the switch in their toolbar. The charts of Properties, Exchanger,
Pipe (and Column and Reactor once calculated; the extraction block's ternary in the flowsheet) draw only grid lines
under that class (`plot.js`), and the corner button was the only switch there. The Flash and the flowsheet's drawing
have none. In the new layout, with the switch off: the layers hidden in the three workspaces, the grid lines shown in
the others; the corner button shown nowhere. The classic layout keeps its corner button, its toolbar's "Background" and
its Settings entry (screenshot 15): removing the corner button there would leave Properties, Exchanger and Pipe with
only the Settings to switch their grid lines, so it is not "trivially safe" (question 4).

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
| 4 | The classic layout's corner button "Hide background layers" (every workspace) and its Settings entry: the same fix there? | Leave the classic layout as it is until it is removed (step 7); a change there needs the grid lines of the other workspaces handled the same way, in a small pull request of its own if you want it sooner. |

## Decided (the maintainer, 2026-11-13, relayed by the coordinating session: "agree with all")

All four as recommended:

1. From the Flowsheet, Calculations returns to the last calculation in one press; the rail or the menu then chooses
   another.
2. The Units button keeps its label ("Units °C, kPa, mol frac") and opens the Settings; there is no Settings button.
3. The classic layout keeps "Blocks".
4. The background-switch fix is not applied to the classic layout now; it stays as it is until it is removed (step 7).
