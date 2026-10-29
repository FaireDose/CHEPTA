# Interface guide

How CHEPTA's views look and read. Every view in `src/ui/` follows it; the interface designer (W10, proposal 0015)
keeps it and checks every pull request that changes a view against it. It describes the workbench as it is
(2026-10-29); a change to the guide is a pull request of its own, with the maintainer's decision.

## 1. Colours: tokens only

Colours live in two files, as CSS custom properties with a light and a dark value:

| File | Prefix | What |
|---|---|---|
| `src/ui/styles.js` | `--fug-` | the base: page, panel, text, rules, accent, liquid and vapour, errors and warnings, the six series colours of charts |
| `src/ui/app-styles.js` | `--fa-` | the workbench: navigation bar, ribbon, canvas, panels, status bar, the state dots, the tier badges |

Dark mode follows the host page: `@media (prefers-color-scheme: dark)` under `:root:not([data-theme="light"])`, and
`:root[data-theme="dark"]` to force it (an AI chat page sets `data-theme`). Every token has both values.

The main tokens:

| Role | Token | Light | Dark |
|---|---|---|---|
| canvas (results area) | `--fa-canvas` / `--fug-bg` | `#ffffff` | `#1a1e22` |
| side panels | `--fa-panel` | `#f3f5f7` | `#1d2227` |
| text | `--fug-fg` | `#15191d` | `#eef1f3` |
| secondary text | `--fug-fg2` | `#4c555e` | `#b3bbc2` |
| captions, units, notes | `--fug-muted` | `#7b848c` | `#86909a` |
| rules and borders | `--fug-rule` | `#dde1e5` | `#2f363c` |
| accent (links, selection, focus) | `--fug-accent` | `#1c5cab` | `#6da7ec` |
| liquid / vapour | `--fug-liq` / `--fug-vap` | blue / orange | blue / orange |
| warning | `--fug-warn-bg`, `--fug-warn-fg` | amber | amber |
| error | `--fug-err-bg`, `--fug-err-fg` | red | red |
| state dots | `--fa-ok`, `--fa-busy`, `--fa-bad` | green, amber, red | |
| flowsheet marks | `--fa-mark` (a block's warning dot), `--fa-energy` (energy streams) | `#d9822b`, `#c0392b` | `#e39a4c`, `#f07a6e` |
| data tier badges | `--fa-t-<tier>`, `--fa-t-<tier>-bg` | standard, fitted, databank, predicted, user, none | |

Rules:

- A view uses tokens, never a literal colour (`#c0392b`, `red`). A colour that has no token yet gets one, in both
  themes, in the pull request that needs it.
- Liquid is blue and vapour orange everywhere: charts, phase bars, streams.
- Series colours `--fug-s1` to `--fug-s6` in that order; every curve also carries a direct label or a legend entry, so
  colour is never the only key.
- Text on a background meets WCAG AA contrast (4.5:1; 3:1 for text of 18 px or more, icons and chart lines), in both
  themes. Muted text is for captions and units, not for values someone must read.

## 2. Spacing

Steps of 2 px, from this scale only: **2, 4, 6, 8, 10, 12, 14, 16, 20, 24**.

- inside a control (a button, a field): 3-8 px;
- between controls in a row: 4-8 px; between groups of the ribbon: a 1 px rule and 10 px each side;
- inside a panel: 12 px at the edges, 6-10 px between fields, 12-14 px between sections;
- the canvas: 14-20 px at the edges, 12 px between blocks of results.

## 3. Type

One sans-serif family (the system's: `system-ui`); numbers in tables and SVG labels in the monospace family with
tabular figures, so columns align.

| Use | Size | Weight |
|---|---|---|
| a headline value (the bubble temperature, the vapour fraction) | 1.7 rem (about 24 px) | 600 |
| a section title in the canvas | 14 px | 600 |
| body text, field labels, table cells | 12-13 px | 400 |
| panel headings ("Inputs", "Results") | 12-12.5 px | 600 |
| captions, units, notes under a table, ribbon group names | 11-11.5 px | 400, muted |

Nothing smaller than 11 px on screen, chart labels included (at 375 px wide too).

## 4. The patterns

### A workspace

```
 navigation bar   File | sections (Properties & Equilibria, Unit models, Flowsheet) | utilities (Library, My data, ...)
 workspace tabs   the views of the section; a view not built yet is shown locked, "not available yet"
 ribbon           groups of buttons with a name under each group (Diagrams, Model, Display, Composition)
 Inputs | canvas | Results
 status bar       state dot and message, the model, the conditions, the units, the version
```

- **Inputs** (left, 252 px): what the user gives, top to bottom in the order they think of it: components, then
  conditions, then options (parameter sets, folded). Each field has its unit in the label ("Pressure, kPa").
- **Canvas** (middle): the chart or drawing, then the tables, then the downloads (Excel, CSV) in one row at the end.
- **Results** (right, 312 px): the answer first, as a headline value; then a short table; then the notes (model,
  reference state, "model predictions, not measurements") in muted text; "Sources used here" at the top right.
- Before the inputs are complete, the canvas says what is missing (`.fa-need`), never stays blank.
- Below 1080 px the Results panel moves under the canvas; below 720 px (phones) everything stacks: ribbon, Inputs,
  canvas, Results. The size is measured on the workbench, not the window (`data-size`), because a chat artifact can be
  narrow on a wide screen.

### A block's panel in the flowsheet

- Selecting a block or stream puts its specification in the Inputs panel: its name, then the fields its degrees of
  freedom need, then the optional ones (sizing, energy), each section folded when it is optional.
- The Results panel shows the selected block's results, or the flowsheet's (degrees of freedom, balances) when nothing
  is selected.
- On the drawing, a block that lacks a specification is dashed, a block with a warning has an amber dot; energy
  streams are dashed and red, with their duty.
- The stream table under the drawing has one column per stream, the units in their own column.

### Tables

- A header row in muted 11.5-12.5 px; the first column left aligned, numbers right aligned with tabular figures.
- Units in the header or in a Unit column, never inside the cells.
- Significant figures fit the property: the same number of decimals down a column. A value that is zero within
  round-off is shown as 0 (not `7.36e-9`).
- A wide table scrolls inside its own box (`.fug-scroll`), never the page; a shadow at the edge shows that more
  columns are there.

### Charts

- Axes with the quantity and its unit ("T, °C"); grid lines in `--fug-rule`.
- A legend under the chart, or direct labels at the curve ends.
- The selected point is a ring; a fixed point (azeotrope, critical point) is a filled dot.
- Text in a chart is at least 11 px at the width it is shown: on a phone the chart is drawn smaller (`compact`), not
  shrunk.

## 5. Warnings, refusals and errors

| Kind | Looks | Worded |
|---|---|---|
| **Warning**: the result stands, with a caveat | amber, one line with the warning sign; pressed, it opens the whole message (`warning.js`) | what is wrong, then its effect: "The pair has no fitted set; the databank set is used." |
| **Missing data**: a value no open source has | in tables the words "no open data"; on a refused calculation, the sources searched | "no open data" (never "N/A", "–" or an empty cell); a dash "–" only where the quantity does not apply (a feed has no temperature of its own in a flash table) |
| **Not available yet**: a model on the roadmap | locked tab or button, muted, with a lock icon and "not available yet"; its title says which roadmap version | "Shortcut and rigorous columns: roadmap v0.5, not available yet." |
| **Refusal**: the engine will not compute it (out of range, a method that does not apply) | amber warning in the Inputs panel, the canvas says what to change | why, then what to do: "Peng–Robinson needs critical constants; HMF has none measured. Choose an activity model." |
| **Error**: something failed (a solver did not converge, a file could not be read) | red (`--fug-err-*`), and the status dot red | what failed and why, as the engine says it; never only "Error" |

Words: plain, short, in the engineer's terms (no code names such as `h_J_mol` or `allowMissingPairs` in what the user
reads). Sentences, not capitals. One message per problem; several are grouped ("3 problems: ...").

## 6. What a new view follows

1. It sits in the workspace pattern above (or the block panel pattern), with the Inputs, canvas and Results it needs.
2. Colours from the tokens; spacing and type from the scales.
3. It works at 375 px wide: nothing cut off, no sideways scroll of the page, chart text readable.
4. Every interactive element is reachable by keyboard, shows a focus ring (`--fug-accent`), and has a name a screen
   reader can say (a visible label, or `aria-label` on an icon-only button).
5. Warnings, refusals and errors as in section 5.
6. Its styles go into `app-styles.js` (or `styles.js` for the embeddable views), scoped under `.fug` or `.fug-app`.

## 7. The visual check of every pull request that changes a view

1. `npm run build`, then `node scripts/preview.mjs`, and open `preview/workbench-preview.html`.
2. Screenshots of the changed views at **375 px** and **1280 px** wide, each in **light** and **dark** (in Chromium:
   `colorScheme: "light"` and `"dark"`), with an example loaded so the results show.
3. Check against this guide: nothing cut off or overlapping, no sideways scroll of the page, text readable in both
   themes, the empty state and a warning shown at least once.
4. Attach the screenshots to the pull request (or put them in `docs/ui-review/<date>/` when they are part of a
   review). The interface designer reviews them before the maintainer merges.
