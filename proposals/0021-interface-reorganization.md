# 0021: A reorganization of the workbench: the flowsheet in front, one place for the method and the data, panes on a phone

- **Status:** Accepted (the maintainer, 2026-11-11: all nine answers of docs/decisions/2026-11-11-04-interface-reorganization.md); the prototype is merged behind `CHEPTA.app(el, { layout: "next" })`, beside the workbench, not in its place
- **Author(s):** a coding agent (Claude), for the maintainer
- **Discussion:** the pull request of this file
- **Roadmap item:** track C (views); it changes how every view is reached, and no model

The maintainer (2026-11-11): "a reorganization of the visual interface of the chepta simulator"; and, on seeing the
first prototype the same day: "the idea with the right panels and droplist is very good but keep in mind that
flowsheet is in fact encompasing all the other tabs so should deserve something on it's own. also try to propose ...
few new additions on the models and tabs for graphs or other data that is important".

The review behind this proposal, with the screenshots and the counts, is
[docs/ui-review/2026-11-11-reorganization.md](../docs/ui-review/2026-11-11-reorganization.md).

## Problem

The workbench grew one workspace at a time, from two (phase equilibrium, properties) to ten, and each addition was
put where there was room. Each screen follows [UI_GUIDE.md](../docs/UI_GUIDE.md); the trouble is between the screens.
The review found (its numbering):

1. **On a phone or in a chat panel the answer is far down the page** (finding 1). Everything is stacked; the bubble
   temperature of a T-x-y is 1422 px down, the balances of a flowsheet 2077 px down, on a screen of about 700 px.
   CHEPTA is "built for AI chat artifacts": the narrow panel is the main case, not the exception.
2. **The property method is chosen in four different ways** (finding 2), and the source of a number has four doors
   (finding 3). The method and the provenance of the data are what CHEPTA is about; they should be in one place.
3. **The flowsheet is one tab among three, though it holds all the others** (finding 5), and nothing connects it to
   them.
4. **Too much chrome**: two rows of navigation, seven supporting tools, a tall toolbar that mixes what to draw, how
   to calculate and settings (findings 4, 6, 8, 11, 12).
5. **The unit models set themselves up in two ways** (finding 7): one long Inputs column, or numbered pages.

Who is affected: students and engineers who check a phase diagram, a unit or a flowsheet, most of all in a chat page
or on a phone; and every contributor who adds a view and must guess where its method choice and its sources go.

## Proposal

### 1. The shell: what is where

```
 wide (1156 px and more)                                   narrow (under 720 px: a phone, a chat panel)

 logo [Flowsheet] | Method v | Data | Units |  Project Data Settings Help      logo [F] [Calculation v]  P D S H
 +------+----------------------------------------------+                       Method v | Data | Units  (scrolls)
 | rail | toolbar: what to draw, what to place         |                       [ Inputs ] [ Results ]
 |      +--------+----------------------+--------------+                       toolbar, one row (scrolls)
 | calc-| Inputs | canvas               | Results      |                       the chosen pane
 | ula- |        | tabs: Plot | Table | |              |
 | tions|        | Data | Warnings      |              |
 +------+--------+----------------------+--------------+
 | state                                               |
```

- **The Flowsheet has its own button**, first in the top bar at every width. It is the frame that holds the others:
  its blocks are the unit models, its method is the property method.
- **The other nine workspaces are "calculations"** beside it, every one a press away: a rail at the left when the
  workbench is wide (Phase eq., Charts, Solubility, Properties; Flash, Exchanger, Pipe, Reactor, Column), one menu in
  the top bar otherwise. The two rows of sections and tabs go.
- **The context row**, the same three buttons in every workspace:
  - **Method**: the property method in use; pressed, it opens the method choice (the lists of
    `model-picker.js`). Where a view has one method only (the steam tables: IAPWS-IF97), the button says so and does
    nothing.
  - **Data**: what the result rests on ("3 pairs: 3 fitted"); pressed, it opens the sources used by this
    calculation, with the parameter sets of its pairs.
  - **Units**: the units and the composition basis; pressed, the Settings.
  They replace the toolbar's Model and Composition groups and the cells of the status bar that repeat them. The
  status bar keeps the state ("Ready, 9 ms", errors) and the version.
- **Four supporting tools instead of seven**: Project (save and open), Data (Library, My data, Sources), Settings,
  Help (AI chat, Feedback).
- **The toolbar** keeps only what belongs to the workspace: which diagram, which specification, which block to place.

### 2. One workspace layout

Inputs, canvas and Results stay as UI_GUIDE.md section 4 has them. Three things are added:

- **Canvas tabs, the same in every workspace**: *Plot* (the diagram or the drawing), *Table* (the numbers behind
  it, with the downloads), *Data* (the measured points and the sources: section 4 below), *Warnings* (every warning
  and refusal of this calculation in one list, with a count on the tab). Today the table is under the plot, the
  sources behind a button and the warnings in three places.
- **A unit model is set up in numbered steps** (1. Components, 2. Feed, 3. the unit), as the Column, the Reactor and
  the Flowsheet do today; the Flash, the Heat exchanger and the Pipe move to it. The steps are sections of the Inputs
  panel, each folded when complete, not pages that replace each other, so a wide screen still shows them all.
- **Narrow: one pane at a time**, Inputs or Results, chosen by two buttons under the top bar. Results come first
  when the inputs are complete (the answer, then the chart, then the table); a workspace that still needs inputs
  opens on Inputs, and the Inputs button carries a dot while something is missing. The toolbar is one row that
  scrolls sideways. For the flowsheet the second pane is "Drawing and results", the drawing first.

### 3. The flowsheet's place

The flowsheet is where a project ends up, and the calculations are its instruments. In three steps:

1. **Its own button, and "From the flowsheet"** (in the prototype): in a calculation, one press takes the
   flowsheet's components and method, so a T-x-y or a flash of the mixture being designed needs no retyping.
2. **Open a block or a stream in its calculation**: on a selected column block, "Open in Column" shows that block
   with its feed in the Column workspace (profiles, McCabe-Thiele); on a stream, "Flash this stream" and "Phase
   envelope of this stream" (with the stream's point marked on it); on a heat exchanger block, its temperature-heat
   curves. And back: "Use in the flowsheet" puts a unit set up alone onto the drawing.
3. **Start from an example**: the empty flowsheet offers the project files of `examples/` (heater and flash, the
   recycle, the membrane, the evaporator, the crystallizer, the extraction), as the Column offers benzene and
   toluene. Building the recycle example by hand takes about 30 presses and entries today.

A calculation still works alone: a student who wants a T-x-y and nothing else never meets the flowsheet. (COFE's
plots need a stream first; that is not copied. See the review, section 3.)

### 4. Additions proposed: tabs for graphs and data, and models

Asked for by the maintainer (2026-11-11). Each row is a proposal to decide, not built here; "have" says what the
engine or the views already hold. The ones marked **A** need only a view; **B** need a small addition to a view's
logic; **C** need a model or a solver and so a proposal or roadmap item of their own.

| Where | Addition | Why it matters | Have | Size |
|---|---|---|---|---|
| Phase equilibrium | **Measured points on the diagram** (the Data tab): the open VLE sets of `validation/data/` drawn on the T-x-y and P-x-y, with each set's source and the model's deviation from it | CHEPTA's promise is that every model is tested against data; today the data are only in the tests | the data files, the fits' deviations | B |
| Phase equilibrium | **x-y diagram** (with the diagonal), **activity coefficients against x**, **relative volatility against x**, **K-values** | what an engineer reads before choosing a separation; γ shows at a glance how non-ideal the pair is | T-x-y already computes x, y and γ at every point | A |
| Phase equilibrium | **Compare two methods or two parameter sets** on one diagram (NRTL fitted against the ChemSep set, or against Mod. UNIFAC 2.0) | the user "compares the models and decides" (DATA_RULES, section 7), today by switching back and forth | every set is selectable | B |
| Phase equilibrium | **Residue curves and distillation boundaries** on the ternary map as its own tab, with the azeotropes table beside | choosing an entrainer | `residueCurve`, `binaryAzeotropes` | A |
| Properties | **Several components on one plot**, and a **property table at chosen temperatures** to copy | comparing solvents | the property explorer, one component at a time | A |
| Flash | **Heating curve** (temperature and vapour fraction against duty) and the **flash point marked on the phase envelope or T-x-y** | where the feed sits between bubble and dew point | P-H flash, the envelope | B |
| Heat exchanger | **Temperature along the exchanger with the pinch marked**; a **U and area summary by zone** | already half there (temperature-heat curves) | the zone table | A |
| Column | **Composition profile on the ternary map** (three components); **stage temperatures against the feed stage choice** | reading a column against its phase diagram | profiles, the ternary map | B |
| Pipe | **Pressure, temperature and velocity along the pipe** | where the pressure drop happens, flashing | the segments of the pipe model | A |
| Reactor | **Conversion and selectivity against temperature or residence time** | sizing a reactor | the profile charts along a plug-flow reactor | B |
| Flowsheet | **Tabs under the drawing**: Streams, Energy, Blocks (one line per block: duty, key result, warnings), Balances, **Convergence** (the recycle's error against the iteration), Warnings | today one long page under the drawing | the stream and energy tables, the recycle's iteration count (the error per iteration is to be recorded) | A |
| Flowsheet | **Composition bars per stream** and **stream labels on the drawing** (T, P, flow, chosen by the user) | reading a flowsheet without the table | the stream table | A |
| Flowsheet | **Case study**: vary one input (a feed flow, a split, a temperature), plot one or several results | the first question after a flowsheet converges; COFE and DWSIM both have it (parametric study, sensitivity analysis) | the request path (`src/api/`) runs a flowsheet from a document | C (the roadmap lists sensitivity under "Later" and under E4 and G) |
| Flowsheet | **A watch list**: a few chosen values kept in sight above the drawing | COFE's Watch window; on a phone the table is far | the stream table | B |
| Everywhere | **A report**: one printable page of a calculation (inputs, method, results, sources, warnings) | handing in or filing a calculation; the Excel download has the numbers but not the page | the Excel export, the sources | B |
| Models | The models on the roadmap stay there; this proposal adds none. Two the interface would show at once: the three-phase flash (the two-liquid labels of proposal 0019 already say where a split is predicted) and purity specifications on a column (CHEPTA-Lab's blockers, HANDOVER.md) | | | C |

### 5. Proposed changes to UI_GUIDE.md

Not made in this pull request; they come with the step that builds each.

- Section 4, "A workspace": the diagram above (top bar with the Flowsheet button and the context row; rail or
  Calculations menu; toolbar; Inputs, canvas with its tabs, Results; status bar with the state only).
- Section 4, new "Narrow": below 720 px one pane at a time (Inputs, Results), Results first when the inputs are
  complete; the toolbar is one row that scrolls sideways, with a shadow at the cut edge as wide tables have.
- Section 5, first paragraph: "The property method is chosen with the Method button of the context row, in every
  workspace" in place of the list of five places.
- Section 6, rule 3: "at 375 px the answer of a complete calculation is on the first screen (within 700 px of the
  top)", and section 7, step 3, checks it.
- Section 1: three tokens for the top bar's hover, edge and menu shadow (`--fn-bar-hover`, `--fn-bar-edge`,
  `--fn-shadow` in the prototype), in both themes.

### What the prototype is and is not

`CHEPTA.app(el, { layout: "next" })` and `examples/app-next.html`. It is `src/ui/app-next.js`, about 330 lines: a
shell that mounts the workbench of `app.js` inside itself, hides its two navigation rows, and adds the top bar, the
rail, the context row, the menus and the panes. The engine, the views, the Inputs and Results panels, the drawers
and the project files are the workbench's own; nothing is copied.

Built: section 1 in full; of section 2, the narrow panes and the one-row toolbar; of section 3, step 1. Three
workspaces were checked in it in detail (the phase diagrams, the Flash, the Flowsheet) and the Column's empty state;
the others run in it unchanged.

Not built, and known:

- the canvas tabs, the numbered steps for Flash, Heat exchanger and Pipe, and everything of section 4;
- the Method button opens the workspace's own Method page for the Flowsheet, the Column and the Reactor (their
  method is their own, kept in the flowsheet document), and does nothing in Charts, whose Equation list is still in
  its toolbar;
- the shell reads the method, the data and the units from the workbench's status bar, and presses the workbench's own
  buttons for "sources used here" and the Method pages. That is right for a prototype that must not touch `app.js`,
  and wrong for a product: step 1 below moves them into functions both layouts call;
- a menu closes with Escape or a press outside, but has no arrow-key movement yet;
- the mol frac / wt % switch is one press further away (Units, then the switch) than in today's toolbar;
- on a phone, selecting a block on the drawing puts its specification in the Inputs pane, one press away.

## Engineering basis

No equation, parameter or number of the engine changes. The basis is the review: 72 screenshots of the workbench as
it is, 12 findings, the presses and the scroll distances of five tasks, and the open documentation of COCO/COFE,
DWSIM and ChemSep (what was read is listed in the review, section 3; no look or asset is copied).

How the result is validated:

- **Measured, per pull request** (UI_GUIDE.md section 7, with the new check): at 375 px, the top of the Results of
  a complete calculation within 700 px (today 1422 to 2077 px; prototype 203 to 210 px, the flowsheet's drawing at
  188 px); no sideways scroll of the page at 375, 820 and 1280 px; both themes.
- **Tests**: `test/app-next.test.js` checks that every workspace and every supporting tool has exactly one place in
  the new navigation. The existing tests of the workbench's logic (`test/app.test.js` and the others) run unchanged,
  because the state, `applyPatch` and the project format are unchanged.
- **By people**: the maintainer and two or three users do the five tasks of the review in both layouts, in a chat
  artifact and on a phone, before step 4 makes the new layout the default.

## Effect on existing work

- **The public interface stays backward compatible.** `CHEPTA.app(target, cfg)` takes the same keys and returns the
  same `{ state, update, save, load }`; `update({ workspace, view, inputs, utility, tab })` means what it means today.
  One optional key is added: `layout` ("next" in this pull request; after step 4, "classic" for the workbench as it
  is, kept for at least two released versions). `CHEPTA.mount` and `CHEPTA.mountProperties` are not touched.
- **Project files keep opening.** The layout is not part of a project; formats 2 to 8 read and write as today. Which
  pane or tab is open is not saved.
- **Pages and artifacts that exist** keep the layout they have until step 4; after it they get the new layout with
  the same content, or keep the old with `layout: "classic"`.
- **Contributors**: a new view declares what it draws, its tables, its sources and its warnings; the shell places
  the method, the data, the tabs and the panes. UI_GUIDE.md changes as section 5 says.
- **In this pull request**: `src/ui/app.js` gains the `layout` key (an import and one line that hands over to
  `app-next.js`); nothing else of the workbench changes, and its tests pass unchanged.

## Alternatives considered

- **Keep the layout and only fix the phone** (stack Results above the canvas, fold the toolbar). Cheaper, and it
  answers finding 1 only; the method in four places, the sources' four doors and the flowsheet's place stay.
- **Flowsheet only, as COFE and DWSIM**: every diagram a tool of a flowsheet. It suits a designer, and loses the
  student who wants one T-x-y: three presses today, a flowsheet with a stream first there. The calculations stay
  usable alone.
- **A rail with all ten workspaces, the flowsheet last** (the first prototype). The maintainer: the flowsheet
  "should deserve something on its own". It has its own button now.
- **A rail with names beside the icons** (about 170 px). At 1280 px it leaves the canvas 550 px; the rail with the
  name under the icon is 76 px and leaves 640 px.
- **A new workbench written from nothing.** It would copy 15 000 lines of view logic or leave two to maintain. The
  shell reuses the one there is, and steps 1 to 3 move it piece by piece.
- **Results as a strip above the canvas instead of a right panel.** The maintainer finds the right panel good; it
  stays.

## Steps

Each is one pull request with its screenshots (UI_GUIDE.md section 7) and its tests.

1. **The shell's contract**: the workbench gives the method, the data summary, the units, the missing inputs and
   the sources of the current calculation as functions (tested without a DOM); `app-next.js` uses them instead of
   reading the status bar. The Method button becomes the one choice in every workspace, Charts included; arrow keys
   in the menus.
2. **Canvas tabs** (Plot, Table, Data, Warnings) in the phase diagrams and the Flash, then the other workspaces; the
   downloads move to the Table tab.
3. **Numbered steps** for the Flash, the Heat exchanger and the Pipe; the heat exchanger's empty band (finding 9)
   goes with it.
4. **The new layout becomes the default**, after the maintainer's check with users; `layout: "classic"` keeps the
   old; UI_GUIDE.md is changed as section 5 says; the example pages and the README's screenshots follow.
5. **The flowsheet's connections**: "Open in ..." on blocks and streams, "Use in the flowsheet", and the examples on
   the empty drawing (section 3, steps 2 and 3); the flowsheet's tabs under the drawing.
6. **The additions of section 4**, in the order the maintainer chooses, the A ones first; each C one through its
   own proposal or roadmap item.
7. The old layout is removed, two released versions after step 4.
