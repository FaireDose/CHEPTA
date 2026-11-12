# 2026-11-12-01: the shell's contract (proposal 0021, step 1)

## What was asked

Step 1 of proposal 0021 (accepted 2026-11-11; docs/decisions/2026-11-11-04-interface-reorganization.md, answers 3 and
8): the workbench gives the method, the data summary, the units, the missing inputs and the sources of the current
calculation as functions, tested without a DOM; `app-next.js` uses them instead of reading the status bar; the Method
button is the one choice in every workspace, Charts included; arrow keys in the menus. The classic layout stays the
default and unchanged.

## What is in the pull request

| What | Where |
|---|---|
| The contract: `methodOf`, `dataOf`, `unitsOf`, `missingOf` (with `isBlank`), `sourcesOf`, `statusOf`, `shellContext` | `src/ui/shell-contract.js` (new, DOM-free) |
| The classic status bar fills its cells from the same functions (same text as before); `blank()` of the Inputs panel is `isBlank` | `src/ui/app.js` |
| `app()` gives the shell a non-enumerable `shell` property: `context()`, `sources()`, `showSources()`, `openMethod()`, `subscribe(fn)`. The public value stays `{ state, update, save, load }` | `src/ui/app.js` |
| The new layout reads only the contract: no status-bar text, no `.fa-need` lookup, no pressing of the workbench's buttons; it follows the workbench through `subscribe` instead of watching its status bar | `src/ui/app-next.js` |
| The Method button in every workspace: the full choice (Phase eq., Flash, Exchanger, Pipe), the liquid model (solids), the equation of state with MHV1 (Charts: new; its toolbar list is hidden in the new layout), the workspace's own Method page (Flowsheet, Column, Reactor), the streams' own methods (a process exchanger: opens Inputs), or nothing to choose (steam tables, Henry's law, Properties) | `methodOf().choice`, `METHOD_ACTION` in `app-next.js`; `equationPicker` in `model-picker.js` |
| Arrow keys in the menus: Down/Up (round), Home, End; Down on a closed menu's button opens it on its current item; Tab closes it | `menuMove` in `app-next.js` |
| Tests | `test/shell-contract.test.js` (8 tests); `test/app.test.js` and `test/app-next.test.js` unchanged |
| Screenshots, both layouts, 375 and 1280 px, light and dark | `docs/ui-review/2026-11-12-0021-shell-contract/` |

What the functions are named for: step 2 (canvas tabs) takes the Data tab from `sourcesOf` and the state from
`statusOf`; step 3 (numbered steps) takes what is missing from `missingOf`. No engine code, number or parameter changed.

## Behaviour that changed in the new layout (not in the classic one)

1. **Charts**: the Method button opens the equation list (PR, SRK, PR + gE (MHV1), SRK + gE (MHV1)); before, it did
   nothing and the list was in the toolbar.
2. **Flowsheet, Column, Reactor**: the Method button opens the Method page through the workbench's own state (no
   button is pressed), and the Inputs panel is shown if it was closed.
3. **An empty Flowsheet, Column or Reactor** opens on the Inputs pane on a phone (its first step is the components);
   before, the prototype opened them on the drawing.
4. **The Inputs dot and the opening pane** follow `missingOf`: a workspace with nothing chosen yet also opens on
   Inputs (before, only one with a problem did).
5. **The Data button** shows the pairs and the rule of the sets; where a calculation has no pairs (steam, exchanger,
   pipe) it says "Sources used here", as before.

## What the maintainer must look at

1. The screenshots: 01 (Charts, the Method button holds the equations), 02 and 04 (the method choice, wide and on a
   phone), 03 (the Data menu moved with the arrow keys), 05 (an empty column opens on Inputs), 06 (the flowsheet's
   Method button opens its page), 07 and 08 (the classic layout, unchanged).
2. Optionally, try it: `npm run build`, then `examples/app-next.html` (and `?layout=classic`).

No number, parameter or source changed, so there is nothing to compare with a source.

## What the maintainer is asked to decide

| # | Decision | Recommendation |
|---|---|---|
| 1 | `api.shell` stays hidden (not enumerable, not documented) until the new layout is the default (step 4), or is documented now for pages that build their own shell? | Hidden until step 4: its names may still change with steps 2 and 3. |
| 2 | The Flowsheet, the Column and the Reactor: the Method button opens their Method page (with the method advice, the solid in equilibrium, the recycle solver), or a pop-up list like the other workspaces? | Their page: it holds more than the lists, and the person sees the advice. |
| 3 | An empty Flowsheet on a phone opens on Inputs (components first), not on the drawing? | Yes: nothing can be placed before the components are chosen. |

## What the maintainer decided (2026-11-12, relayed by the coordinating session)

All three as recommended:

1. `api.shell` stays hidden (not enumerable, not documented) until the new layout is the default (step 4).
2. The Flowsheet, the Column and the Reactor: the Method button opens their own Method page.
3. An empty Flowsheet on a phone opens on the Inputs pane (components first).
