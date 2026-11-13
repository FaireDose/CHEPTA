# 2026-11-13-01: numbered steps for the Flash, the Heat exchanger and the Pipe (proposal 0021, step 3)

## What was asked

Step 3 of proposal 0021 (accepted 2026-11-11; docs/decisions/2026-11-11-04-interface-reorganization.md): the Flash,
the Heat exchanger and the Pipe are set up in numbered steps (1. Components, 2. Feed, 3. the unit), as the Column, the
Reactor and the Flowsheet are; the steps are sections of the Inputs panel, each folded when complete, not pages that
replace each other; the heat exchanger's empty band (the review's finding 9) goes with it. The new layout only
(`CHEPTA.app(el, { layout: "next" })`); the classic layout unchanged.

Also in this pull request, from the step-2 review (docs/decisions/2026-11-12-04-ui-0021-canvas-tabs.md):

- (a) an opened warning of the two-step list repeated its line as the first sentence of its text (screenshot 13 of
  docs/ui-review/2026-11-12-0021-canvas-tabs/): the sentence is now shown once;
- (b) the maintainer's answer 4: the context row's Data button opens the canvas's Data tab instead of the Sources
  panel (the Data tab keeps its button to the Sources panel).

Not in scope: the rows of the stream tables (a later pull request).

## What is in the pull request

| What | Where |
|---|---|
| The steps of each workspace, which Inputs sections each gathers (by the section's title), whether it is complete, optional or still needs something, and the one line a folded step shows; whether a step is open (DOM-free); the steps built around the existing sections (DOM) | `src/ui/unit-steps.js` (new) |
| The workbench gathers its Inputs sections into the steps when the new layout asks (`unitSteps`, an internal key like `canvasTabs`; the classic layout never sets it); it keeps, per workspace, which step the person opened or folded and which one they work in (not saved in a project) | `src/ui/app.js` |
| (a) `openHead(head, text)`: what an opened warning shows, so its first sentence is read once; used by `twoStepWarning` | `src/ui/canvas-tabs.js` |
| (b) The Data button opens the Data tab (and the Results pane on a phone, where the canvas is); the shell asks for the steps and adds their styles | `src/ui/app-next.js` |
| Tests | `test/unit-steps.test.js` (8 tests, new); `test/canvas-tabs.test.js` (one test added for `openHead`); the others unchanged |
| Screenshots, both layouts, 375 and 1280 px, light and dark | `docs/ui-review/2026-11-13-0021-numbered-steps/` |

The steps:

| Workspace | 1 | 2 | 3 | 4 (optional, folded from the start) |
|---|---|---|---|---|
| Flash | Components | Feed (composition and flow; the feed state) | Flash (the specification) | – |
| Heat exchanger, utility | Components | Process stream | Exchanger (outlet or area, utility, U, arrangement) | Wall thickness |
| Heat exchanger, process | Hot stream (its components, method and state) | Cold stream | Exchanger (specification or area, U, arrangement) | Wall thickness |
| Pipe | Components | Inlet | Pipe (pipe, fittings, heat) | Options (segments, your own friction factor and viscosity) |

How a step behaves:

- **Closed**, it shows its number (a green tick when complete), its title and one line of what it holds, in the
  display units: "Ethanol, Water"; "100 kmol/h; equimolar"; "P 101.325 kPa, VF 0.5"; "100 m; 50 mm; no fittings;
  adiabatic"; "allowable stress not given".
- **Open** while it needs something (a problem of its inputs: the components, or a process exchanger's stream), and
  while the person works in it (the last step they focused), so it never folds under their hands. A complete or
  optional step starts folded. The person's own choice (pressing the heading) holds until the step's state changes.
- The heading is a button with `aria-expanded` and `aria-controls`; a screen reader hears "1. Components, complete",
  "2 problems", "optional". Its sections keep their own titles one level down (Process outlet, Utility, ...); a step of
  one section does not repeat its title.
- The parameter sets of the pairs stay after the steps, as they were.
- Before the components are chosen, the Flash shows step 1 only (its feed and specification sections are built only
  when the components are complete, as in the classic layout); the Heat exchanger and the Pipe show every step.

The empty band (finding 9): in the new layout the exchanger's table is on the Table tab (step 2) and its Inputs
panel, folded, ends about 440 px down, the parameter sets included (about 1700 px before); at 1280 px the page is 900 px high (no scroll) against
2003 px in the classic layout. The classic layout keeps its band (it is unchanged by this pull request; question 3).

(a): `openHead` finds the first sentence of the text that holds the line ("The liquid is predicted to split into two
liquid phases in the…" opens as "... in the hatched region", the text then "Results there assume ..."); where the
line is a label before the text's start ("Known deviation (NRTL): ...", "Not calculated: ..."), the opened line keeps
the label only and the text is whole; anything else stays as it was.

No engine code, number or parameter changed.

## Checks (UI_GUIDE.md section 7)

- 375 and 1280 px, light and dark: no sideways scroll of the page in any of the 16 screenshots. The Results of a
  complete calculation start at 169 px from the top at 1280 px, and at 163-170 px at 375 px (proposal's check: within
  700 px).
- The classic layout: screenshots 13-16 (Heat exchanger at 1280 px light and 375 px light, Flash at 375 px dark, Pipe
  at 1280 px dark) of this branch and of the base (f39e6e9, main with step 2) were compared pixel by pixel: identical,
  with the status bar's timing ("Ready, 9 ms") written as "Ready" in both.
- An empty state (08: a flash without components: step 1 open) and warnings (09, 10: the ternary ethanol + water +
  ethyl acetate, both warnings opened) are shown.
- `npm run build`, `npm test` (1651 tests on main with #237: 1650 pass, 1 todo, 0 failures).

## What the maintainer must look at

1. The screenshots in docs/ui-review/2026-11-13-0021-numbered-steps/: 01-02 (Flash, folded steps, wide and on a
   phone), 03-05 (Heat exchanger: folded, the Exchanger step open, a process exchanger on a phone), 06-07 (Pipe), 08
   (an empty flash), 09-10 (warnings opened: each sentence once), 11-12 (the Data button opens the Data tab), 13-16 (the
   classic layout, unchanged).
2. Optionally, try it: `npm run build`, then `examples/app-next.html?start=hx` (or `start=flash`, `start=pipe`).

No number, parameter or source changed, so there is nothing to compare with a source.

## What the maintainer is asked to decide

| # | Decision | Recommendation |
|---|---|---|
| 1 | On a wide screen, complete steps are folded too (one line each), as the proposal says, or all steps open there and folded only on a phone? | Folded everywhere: the exchanger's panel is 440 px instead of 1700 px, the line says what each step holds, and one press opens it. |
| 2 | The grouping: the exchanger's outlet, utility, U and arrangement in one step "Exchanger" (and the pipe's pipe, fittings and heat in one "Pipe"), with the wall thickness and the pipe's options as an optional fourth step; or one step per section (up to seven)? | One step for the unit, as the proposal's "1. Components, 2. Feed, 3. the unit"; the sections keep their titles inside it. |
| 3 | The classic layout's empty band of the exchanger (finding 9): fixed there too, in a small pull request of its own, or left until the classic layout is removed (step 7)? | Fixed in a small pull request of its own: the classic layout stays for two released versions after step 4. |
| 4 | An opened warning whose line is a label ("Known deviation (NRTL)") keeps the label only, its text whole; one whose line is its first sentence shows that sentence whole in the line and the rest below. Or always the line as a title and the whole text below, the first sentence repeated? | As built: each sentence once. |

## Decided (the maintainer, 2026-11-13, relayed by the coordinating session)

All four as recommended:

1. Complete steps are folded on a wide screen too, one line each.
2. One step for the unit (the exchanger's outlet or area, utility, U and arrangement; the pipe's pipe, fittings and
   heat), with its sections inside; the wall thickness and the pipe's options stay an optional fourth step.
3. The classic layout's empty band of the exchanger is fixed in a small pull request of its own (an open item in
   DECISIONS.md).
4. An opened warning reads each sentence once, as built.
