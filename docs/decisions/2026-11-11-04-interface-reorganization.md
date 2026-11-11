# 2026-11-11-04: a reorganization of the workbench (proposal 0021, with a prototype)

## What the maintainer asked and said (2026-11-11)

1. "A reorganization of the visual interface of the chepta simulator" (relayed by the coordinating session): a review
   of every screen, a look at other open simulators, a proposal and a working prototype beside the workbench.
2. On seeing the first prototype, directly to the worker session: "the idea with the right panels and droplist is very
   good but keep in mind that flowsheet is in fact encompasing all the other tabs so should deserve something on it's
   own. also try to propose when you see these interfaces few new additions on the models and tabs for graphs or other
   data that is important."

Both are in the proposal: the Flowsheet has its own button, first in the top bar, and a calculation can take its
components and method ("From the flowsheet"); the additions are the table of the proposal's section 4.

## What the maintainer decided (2026-11-11, answers to #226, relayed by the coordinating session)

All nine recommendations below are accepted:

1. **Proposal 0021 is accepted.**
2. The Flowsheet has its own button, with a rail (wide) or a menu (narrow) of the calculations; it is not the only
   frame.
3. The property method is chosen in one place, the Method button of the top bar, in every workspace.
4. On a phone, one pane at a time (Inputs, Results), Results first once the inputs are complete.
5. mol frac / wt % moves from the toolbar into Units.
6. Four supporting tools: Project, Data, Settings, Help.
7. The additions first: the measured VLE points on the T-x-y and P-x-y, the x-y, activity-coefficient and
   relative-volatility diagrams, the flowsheet's tabs and its examples to start from; then "Open in ..." between the
   flowsheet and the calculations. The case study needs a proposal of its own.
8. The new layout becomes the default only after steps 1-3 and a check by users; `layout: "classic"` keeps the old one
   for two released versions.
9. The prototype is merged into `main` behind the option.

## What is in the pull request

| What | Where |
|---|---|
| The review: 12 findings, presses and scroll distances for five tasks, COCO/COFE, DWSIM and ChemSep | [docs/ui-review/2026-11-11-reorganization.md](../ui-review/2026-11-11-reorganization.md), 16 screenshots in its folder |
| The proposal | [proposals/0021-interface-reorganization.md](../../proposals/0021-interface-reorganization.md), status Proposed |
| The prototype | `src/ui/app-next.js`; `CHEPTA.app(el, { layout: "next" })`; `examples/app-next.html` |
| Its test | `test/app-next.test.js`: every workspace and supporting tool has exactly one place |

Nothing replaces the workbench: without `layout: "next"` it is as it was (in `src/ui/app.js`, only the `layout` key
was added), its tests are unchanged, and UI_GUIDE.md is not edited (the proposal's section 5 lists the changes it
would need).

## What the maintainer must look at

1. **Try the prototype**: open the preview page attached to the pull request (it shows the workbench as it is) and
   press "Try the reorganized layout" in its yellow banner; the same link goes back. On a wide screen first, then
   narrow the window to a phone's width, or open it on a phone. (From a clone: `npm run build`, then
   `examples/app-next.html`.) Do the five tasks of the review: a T-x-y, a flash, a column, the recycle flowsheet
   (Project, open `examples/flowsheet-recycle.chepta.json`), the source of a parameter (the Data button).
2. **The before and after screenshots**, 01 to 06 of the review's folder, and 09 ("From the flowsheet").
3. **The table of additions** (proposal, section 4): which graphs and data tabs matter most.

No number, parameter or source changed, so there is nothing to compare with a source.

## What the maintainer was asked to decide (answered above)

| # | Decision | Recommendation |
|---|---|---|
| 1 | Accept proposal 0021 as the direction (the steps are then built one pull request at a time)? | Yes. The largest gain is on a phone and in a chat panel: the answer is on the first screen (about 200 px down) instead of 1400 to 2000 px down. |
| 2 | The flowsheet's place: its own button in the top bar, with the calculations in a rail (wide) or a menu (narrow)? Or the flowsheet as the only frame, every diagram a tool inside it (as COFE and DWSIM)? | The button and the rail. A student must still be able to draw one T-x-y without a flowsheet. |
| 3 | The method in one place, the Method button of the top bar, in every workspace (the toolbar's Model group, Charts' Equation list and the Method pages go)? | Yes; the Flowsheet, the Column and the Reactor keep their own method, shown and changed through the same button. |
| 4 | Narrow screens: one pane at a time (Inputs, Results), Results first once the inputs are complete, instead of one long page? | Yes. |
| 5 | mol frac / wt % leaves the toolbar and lives in Units (one press further)? | Yes, with the Units button showing the basis; say if it is switched often enough to keep a switch on the canvas. |
| 6 | Four supporting tools (Project, Data, Settings, Help) instead of seven? | Yes. |
| 7 | Which additions of section 4 first? | The measured points on the T-x-y and P-x-y (the Data tab); the x-y, activity-coefficient and relative-volatility diagrams; the flowsheet's tabs and its examples to start from; then "Open in ..." between the flowsheet and the calculations. The case study needs a proposal of its own. |
| 8 | When the new layout becomes the default (proposal, step 4): after steps 1 to 3 and a check by two or three users? And the old layout kept as `layout: "classic"` for two released versions? | Yes to both. |
| 9 | The prototype in `main` behind the option, or kept on the branch until the proposal is accepted? | In `main` behind the option: it changes nothing unless asked for, and people can try it from the published package. |

## Known limits of the prototype

Listed in the proposal ("What the prototype is and is not"): no canvas tabs yet; the Method button opens the
workspace's own Method page for the Flowsheet, the Column and the Reactor and does nothing in Charts; the shell reads
the method, data and units from the workbench's status bar (step 1 replaces that with functions); the menus have no
arrow-key movement; building a flowsheet by hand is not shortened.
