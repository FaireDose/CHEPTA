# Review of the workbench for a reorganization, 2026-11-11

The maintainer (2026-11-11) asked for "a reorganization of the visual interface of the chepta simulator". This page is
the review behind [proposal 0021](../../proposals/0021-interface-reorganization.md): every screen as it is today,
against [UI_GUIDE.md](../UI_GUIDE.md); how other open simulators organize theirs; and the same tasks in the prototype
of the proposal. Built from main at af50855 (version 0.6.0) with `npm run build`, opened in Chromium at 1280 px and
375 px wide (and the prototype also at 820 px, a chat panel), light and dark. 72 screenshots of the workbench as it is
were taken (18 screens, two widths, two themes); the ones the findings point to are in
[2026-11-11-reorganization/](2026-11-11-reorganization/), most of them as "today / prototype" pairs.

What works well and stays: Inputs, canvas and Results are the same three places in every workspace; both themes read
well; the page never scrolls sideways at 375 px; every empty state says what to do; warnings, refusals and "no open
data" follow the guide. The findings below are about **where things are**, not about how they look.

## 1. What is hard to find, inconsistent or crowded

| # | Finding | Where | Screenshot |
|---|---|---|---|
| 1 | **On a phone or in a chat panel the answer is far down the page.** Everything is stacked: navigation, tabs, toolbar, Inputs, canvas, Results. The T-x-y chart starts 969 px down and its Results (the bubble temperature) 1422 px down; the flash's Results 1969 px down; the flowsheet's drawing 961 px and its Results 2077 px down. A phone screen shows about 700 px. | every workspace, 375 px | 02, 03, 06, 15 |
| 2 | **The property method is chosen in four different ways.** Three lists in the toolbar's Model group (Phase equilibrium, Flash, Heat exchanger, Pipe); one "Equation" list (Charts); one "Liquid" list (Solubility of solids); a "Method: NRTL" button under Setup that turns the Inputs panel into a Method page (Flowsheet, Column, Reactor). The guide's section 5 lists these as they are; a person who learned one does not find the next. | all | 01, 05, 16 |
| 3 | **"Where does this number come from" has four doors.** The tier badge and the set menu in the Inputs panel (folded on a phone); "Sources used here" at the top of Results (at the bottom of the page on a phone); Library in the top bar, whose "Per pair" section sends the person back to the Inputs panel; Sources in the top bar, and again as "Browse sources" inside Library. | Library, Sources, Inputs, Results | 14, 01 |
| 4 | **Two rows of navigation, and seven supporting tools of equal weight.** A section, then a tab: reaching the Column from a phase diagram is two presses, and the second row changes with the first. File, Library, My data, Sources, Settings, AI chat and Feedback all sit in the top bar; on a phone they are seven icons without names. | top bar | 01, 02 |
| 5 | **The flowsheet is one tab among three, though it holds all the others.** Its blocks are the unit models, its method is the property method, its streams are flashes. Nothing connects them: a person cannot take the flowsheet's components to a T-x-y diagram, or open a column block in the Column workspace, without typing everything again. (The maintainer, 2026-11-11: "flowsheet is in fact encompassing all the other tabs so should deserve something on its own".) | navigation | 05 |
| 6 | **The toolbar is tall and mixes three kinds of things**: what to draw (T-x-y, P-x-y), how to calculate (Model), and settings that are also in Settings (mol frac or wt %, Background, which is there twice: toolbar and canvas). At 1280 px the Inputs panel starts 195 px down; on a phone the flowsheet's toolbar is 16 buttons and 480 px before anything else. | toolbar | 01, 05, 06 |
| 7 | **The unit models set themselves up in two different ways.** Flash, Heat exchanger and Pipe: everything in the Inputs panel, one long column (the heat exchanger's is 1700 px). Column, Reactor and Flowsheet: numbered pages (1. Components, 2. Method, ...) chosen in the toolbar. | Unit models | 04, 13, 15 |
| 8 | **The status bar repeats** the model, the pressure and the units that the toolbar and the Inputs panel already show, and they are not controls there. | status bar | 01 |
| 9 | **An empty band of about 350 px** between the heat exchanger's chart and its table at 1280 px (the canvas stretches to the height of the long Inputs panel and the chart is centred in it). | Heat exchanger | 13 |
| 10 | **The flowsheet has no example to start from**, though `examples/` holds six project files; the Column and the phase diagrams have one. | Flowsheet | 05 |
| 11 | **At 820 px (a chat panel) the flowsheet's toolbar takes three rows** (about 250 px) before the drawing. | Flowsheet, mid width | 10 |
| 12 | Three icon buttons without names float at the top right of every canvas (hide Inputs, background, hide Results) and take a row of the canvas. | canvas | 01 |

Against UI_GUIDE.md: findings 1, 6 and 11 are within its letter ("below 720 px everything stacks") but against its
aim (section 6, rule 3: "it works at 375 px wide"); finding 9 breaks "nothing cut off or overlapping" in spirit;
finding 12 has `aria-label`s, so it passes rule 4. No literal colour, no text under 11 px and no sideways scroll was
found in this review.

## 2. Presses for five common tasks

Counted on the screens, from the workbench as it opens (methanol, acetone and chloroform on the ternary map). A press
is a click or a tap; choosing in a list counts two (open, choose). "Scroll" is how far down the result is at 375 px,
measured in the page (a phone shows about 700 px).

| Task | Today, 1280 px | Today, 375 px | Prototype, 1280 px | Prototype, 375 px |
|---|---|---|---|---|
| A T-x-y diagram of ethanol and water | 3 (T-x-y; Examples, Ethanol and water) | 3, then scroll: chart at 969 px, bubble temperature at 1422 px | 3 | 3 and one more to see it (Results): bubble temperature at 210 px, chart at 473 px |
| A flash of the mixture | 2 (Unit models, Flash is the first tab) | 2, then scroll: table at 1241 px, vapour fraction at 1969 px | 1 (Flash in the rail) | 2 (Calculations, Flash): vapour fraction at 203 px, table at 493 px |
| A column from its example | 3 (Unit models; Column; the example) | 3 | 2 (Column; the example) | 3 |
| A flowsheet with a recycle | 1 to reach it, then about 30 presses and entries to build it by hand (components, four blocks, six streams, their specifications), or File, open a file | the same, with the toolbar's 16 buttons above the drawing; drawing at 961 px, balances at 2077 px | 1 to reach it from anywhere; the building is **not changed** by the prototype (proposal, step 5) | drawing at 188 px, balances at 1304 px |
| The source of a parameter (the NRTL set of ethanol + water) | 1 ("Sources used here", top of Results), if the person knows it is there; else Library, then back to Inputs | scroll 1422 px to Results, then 1 | 1 (the Data button of the top bar: "1 pair: 1 fitted") | 1, no scroll |

The building of a flowsheet was estimated from the screens, not measured press by press.

## 3. How other open simulators organize their interface

Read on 2026-11-11 in their open documentation; nothing of their look or assets is copied.

| Simulator | What was read | How it is organized | Copy | Do not copy |
|---|---|---|---|---|
| COCO / COFE | the COFE help at cocosimulator.org: "Document Explorer", "Watches", "Parametric studies", "Binary plot", "A flowsheet as Unit Operation" | The flowsheet is the document. A Document Explorer at the left lists the document's views (flowsheet, plots) and gives access to the flowsheet configuration (compounds, property packages). A plot (binary, ternary, property) "always refers to a stream": it takes its compounds and thermodynamic models from the flowsheet. A Watch window keeps chosen values in sight. Parametric studies vary inputs of a solved flowsheet. | The flowsheet as the frame, with the diagrams taking its components and method ("From the flowsheet"). A list of views at the left. A parametric study, later. | Plots that cannot exist before a stream exists: CHEPTA's diagrams must keep working alone, for a student who wants a T-x-y and nothing else. Dockable windows and right-click menus: they do not work in a narrow chat panel or on a phone. |
| DWSIM | the wiki page "Features by Platform" (state of November 2020), which lists its three interfaces (Classic, Cross-Platform, Android/iOS) and their tools | Phase envelopes, binary envelopes and ternary envelopes are "Flowsheet Utilities"; sensitivity analysis and optimization are "Flowsheet Tools"; sizing (separator, valves) is a utility too. The mobile version has fewer tools than the desktop ones. | The idea that diagrams and sizing are tools *of the flowsheet*. One interface that adapts, instead of three with different contents. | A separate, smaller mobile product. Its user guide could not be opened at the wiki address tried (404), so its screens were not reviewed. |
| ChemSep | the program overview at chemsep.org | One unit (a column) with "one easy and intuitive interface": the column is set up step by step and the results are many graphs of the same solution (profiles, McCabe-Thiele). | A unit model as numbered steps, then a set of result tabs over one solution, as CHEPTA's Column workspace already does. | Only the overview page was read; no detail of its screens is relied on. |

The commercial simulators' interfaces are documented behind their licences and were not read.

## 4. The prototype, on the same tasks

`CHEPTA.app(el, { layout: "next" })`, or `examples/app-next.html`. It is the same workbench inside another shell
(`src/ui/app-next.js`); the workbench without the option is unchanged.

| Screenshot | Shows |
|---|---|
| [01](2026-11-11-reorganization/01-txy-1280-before-after.png) | T-x-y at 1280 px: one bar and a rail instead of two navigation rows; Method, Data and Units in the bar; Inputs start at 153 px instead of 195 px |
| [02](2026-11-11-reorganization/02-txy-375-before-after.png) | T-x-y at 375 px: today's one long page (1687 px) beside the prototype's two panes, Results (911 px, the answer first) and Inputs |
| [03](2026-11-11-reorganization/03-flash-375-dark-before-after.png) | Flash at 375 px, dark |
| [04](2026-11-11-reorganization/04-column-1280-before-after.png) | Column at 1280 px, empty state |
| [05](2026-11-11-reorganization/05-flowsheet-1280-before-after.png), [06](2026-11-11-reorganization/06-flowsheet-375-before-after.png) | The flowsheet with a recycle at 1280 px and 375 px: its own button in the bar; on a phone the palette is one row that scrolls sideways and the drawing is on the first screen |
| [07](2026-11-11-reorganization/07-next-menus-1280.png), [08](2026-11-11-reorganization/08-next-menus-375.png) | The Method button, the Data menu (Library, My data, Sources), "sources used here" from the Data button, the Calculations menu on a phone |
| [09](2026-11-11-reorganization/09-next-from-flowsheet-1280.png) | "From the flowsheet": a phase diagram takes the flowsheet's components and method in one press |
| [10](2026-11-11-reorganization/10-next-820.png) | 820 px (a chat panel): the flowsheet today and in the prototype (the palette as one row: the drawing starts at 179 px instead of 358 px), and T-x-y |
| [11](2026-11-11-reorganization/11-next-1280-dark.png), [12](2026-11-11-reorganization/12-next-375-dark.png) | Dark, 1280 px and 375 px |
| [13](2026-11-11-reorganization/13-today-hx-gap-1280.png) to [16](2026-11-11-reorganization/16-today-method-places-1280.png) | Today: findings 9, 3, 1 and 2 |

Checked on the prototype against UI_GUIDE.md section 7: no sideways scroll of the page at 375, 820 and 1280 px in the
four tasks (measured: the page is as wide as the window in all 44 screenshots of the comparison); no script error; both themes; an empty
state (the Column) shown. What the prototype does **not** do yet is listed in the proposal ("What the prototype is
and is not").
