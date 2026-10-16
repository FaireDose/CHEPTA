# 0012: Your own data, kept with the project, in panels that can open as separate windows

- **Status:** Accepted (the maintainer, 2026-10-16: "ok", after answering its questions; see the end)
- **Author(s):** the maintainer (request of 2026-10-15 and 2026-10-16), drafted with Claude
- **Discussion:** the pull request that adds this file
- **Roadmap item:** track B (bridges: project files) and the open item "user-chosen Modified UNIFAC 2.0 groups"
  (docs/DECISIONS.md, proposal 0009)

## Problem

CHEPTA only calculates with its own databank, and every number in it must come from an open source (AGENTS.md
rule 1). That keeps it checkable, but it leaves people stuck in three common situations:

1. **A property the databank does not have.** Lactic acid has no open liquid density, and 25 components lack a
   thermal conductivity. A company or a lab often has its own measurement, or a supplier's value it trusts for a
   first design.
2. **A component the databank does not have.** An intermediate of the person's own process, an oligomer, a
   proprietary solvent.
3. **Parameters the databank cannot give.** An NRTL pair the person fitted to their own data, or Modified UNIFAC 2.0
   groups for a molecule the automatic assignment cannot describe (FDCA, the anhydrides).

Today the only way in is a contribution to the shared databank, which is right for open data and wrong for private
or provisional numbers. The workbench is also getting crowded: one more panel on the main screen would make it
harder to read.

## Proposal

### 1. What a person can add ("your data")

| Kind | What they enter | Used for |
|---|---|---|
| A property record of a databank component | a table of measured points (temperature, value), or the coefficients of a correlation (the equations components.json uses: DIPPR 100, 101, 102, 104, 105, 106, 107) with its range | that property, replacing the databank's record or filling a "no open data" gap |
| A new component | name, formula (optional), molar mass, nonvolatile or volatile; for a volatile one a vapour-pressure record; optional Tc, Pc and acentric factor; any property records | everything the databank components do, as far as its data reach |
| Pair parameters | NRTL (or UNIQUAC) parameters for a pair, in the units of data/binaries.json | that pair, as a parameter set next to the databank's |
| Modified UNIFAC 2.0 groups | subgroup counts for a component, picked from the method's subgroup list | the MOD-UNIFAC-2 model |

Every item carries a **source line the person writes** ("own measurement, lab book 12, 2026"; "supplier data
sheet"; "fit to our pilot data") and gets the tier **"user"**.

### 2. Rules that keep it honest

- **Visible everywhere.** A result that uses your data says so: the Sources panel lists "Your data" with the source
  lines, the result notes name the records used, and exported tables (CSV, Excel, project) carry them.
- **Your data wins, but only in your project.** Inside the project where it was entered, a user record replaces the
  databank's record for that property, and a user pair set becomes that pair's default (the person added it on
  purpose). The databank's record stays available, so the two can be compared. Nothing is written into the shared
  databank.
- **Checked like the databank.** The same checks as components.json: known property names and equations, SI units
  inside (the form converts °C, g/cm³, mPa·s and so on), a range for every record, and out-of-range refusals rather
  than extrapolation. A table of points is fitted by the same equation forms the repository uses, and the fit's
  maximum deviation is shown before the record is saved. User Modified UNIFAC groups must pass the atom balance
  against the formula when one is given.
- **Not open data.** User data is never counted as an open source. To share it, the panel can export a contribution
  package (the format of AGENTS.md, type `component` or `pair-data`) for the Data form, where it is reviewed like any
  other contribution.

### 3. Where it is stored: the project file, format 3

The project file gains one optional top-level key, `user_data`. Format 1 and 2 files still open (they have none).

```json
{
  "fugacity_project": 3,
  "saved_with": "chepta 0.4.0",
  "workbench": { "...": "unchanged" },
  "user_data": {
    "properties": {
      "lactic-acid": {
        "liquidDensity": {
          "equation": "DIPPR100", "coefficients": { "A": 0, "B": 0 }, "units": "kg/m3",
          "Tmin_K": 293.15, "Tmax_K": 353.15,
          "points": [[293.15, 0], [313.15, 0], [333.15, 0]],
          "tier": "user", "source": { "name": "own measurement, lab book 12", "fit": "3 points, max deviation 0.2 %" }
        }
      }
    },
    "components": {
      "user:pla-oligomer": {
        "name": "PLA oligomer (n = 4)", "MW": 0, "class": "nonvolatile",
        "properties": { "liquidHeatCapacity": { "...": "a record as above" } },
        "source": { "name": "own estimate" }
      }
    },
    "pairs": {
      "water+lactic-acid": { "NRTL": { "...": "the parameters, in the format of data/binaries.json" },
                             "tier": "user", "source": { "name": "fit to our VLE data, 2026" } }
    },
    "groups": {
      "fdca": { "subgroups": { "...": "subgroup id: count" }, "source": { "name": "my assignment" } }
    }
  }
}
```

(The zeros only show the format; real entries carry the person's numbers.) User component ids start with `user:`, so
they can never collide with a databank id.

### 3a. Your data as a file of its own, to reuse in other projects

The maintainer (2026-10-16): someone who adds data saves the project, with the data in it, "but also save the user
data". So My data can also be saved and opened as a file of its own, a personal or company library of numbers:

```json
{ "chepta_user_data": 1, "saved_with": "chepta 0.4.0", "title": "Our lab data",
  "user_data": { "properties": { }, "components": { }, "pairs": { }, "groups": { } } }
```

- **Save my data** writes this file; **Open my data** adds its entries to the current project. The project keeps its
  own copy, so a project still opens and calculates the same without the library file (a project and the numbers it
  was calculated with stay together).
- When an entry being opened already exists in the project with other numbers, the panel shows both and asks which to
  keep; nothing is replaced silently.
- Where a page cannot download files (some AI chats), Copy and Paste work as for projects today.

### 4. The engine: an overlay, not a change to the databank

```js
const mine = CHEPTA.checkUserData(project.user_data);          // throws an error that names the problem
const sys = CHEPTA.system({ components: ["water", "lactic-acid"], model: "MOD-UNIFAC-2", userData: mine });
const p = CHEPTA.pure("lactic-acid", { userData: mine });      // pure() already takes extra property records
CHEPTA.listComponents({ userData: mine });                      // the databank's components plus the user's
```

`userData` is passed per call, never stored globally, so two workbenches on one page (or a page and its pop-out
window) cannot leak data into each other, and the library's own tests and results are unchanged when it is absent.

### 5. The interface: a "My data" panel, docked, that can also open as its own window

- **My data** is a new item next to Library, Sources and Settings. It lists what the project holds, by component, and
  offers "Add a property", "Add a component", "Add pair parameters" and "Choose groups".
- Adding a property: pick the component and property, paste a table (from Excel or a data sheet; units chosen in the
  header) or type coefficients, see the fitted curve plotted over the databank's record (where there is one), and
  save. The plot and the fit's deviation are shown before saving.
- **Docked by default.** My data opens as a panel sliding over the side of the workspace, like Library and Sources:
  entering data is a short task (add, check the plot, save, go back), the panel always opens (also inside AI chats and
  on phones), and the workspace stays where it was.
- **Separate window as an option** (only My data for now, the maintainer, 2026-10-16). A button in the panel, "Open in
  a new window", moves it into a window of its own, for a second screen or for comparing data next to a diagram while
  working. The main window keeps all the data; the new window only shows and edits it, and every change appears in
  both at once. Closing the new window loses nothing; the panel can be docked again.
  - How: the main window opens an empty window (`window.open`) and builds the panel into it with its own code and
    styles, so no second file has to load and it works offline and from a file on disk.
  - Where it cannot: pages inside AI chats (artifacts) usually block new windows, and phones have none. The button is
    hidden on phones; where the browser refuses the window when the button is pressed, the panel stays docked and a
    note says why.

### 6. Modified UNIFAC 2.0 groups: the database's proposal, or your own

The maintainer (2026-10-16): "for each chemical you could give the proposed structure for unifac 2.0 combinations by
our database or the user can insert their own".

- For every component, the groups panel shows the subgroups CHEPTA uses (name, count, the main group they belong to)
  and how they were found: DDBST's published assignment, the structure-based one checked against it, chosen, reviewed
  or corrected (with the note `mod_unifac_2.py` writes), and the atom balance against the formula.
- For a component without groups (FDCA, maleic anhydride, the small gases) it shows why, and the closest assignment
  the structure gives, as a starting point.
- **Use these** keeps the database's groups; **Edit** opens a picker of the method's subgroups (searchable by name and
  main group) with counts; the atom balance is checked as the counts change (a stated one-H difference allowed, as
  for substituted rings), and saving stores the result as user groups (tier "user") in My data.
- A user component (section 1) gets its groups the same way, from nothing or from a formula.

## Engineering basis

- Correlation equations: the ones the databank already uses (src/thermo/correlations.js, with their references).
- Fitting a table of points: linear least squares, the DIPPR 100 polynomial directly and DIPPR 101 in its
  logarithmic form with E fixed, as `validation/python/fit_properties.py` does. A test compares the browser fit with
  numpy on the same points (a fixture made by a new reference script), to 1e-9 relative.
- Modified UNIFAC 2.0 with user groups: the same code as the databank's groups; a test checks that entering a
  databank component's own groups as user groups gives identical activity coefficients.
- Validation of results with user data: the existing tests, run with an overlay that repeats the databank's records,
  must give the same numbers (the overlay changes nothing by itself).

## Effect on existing work

- Project files: format 3 adds `user_data`; formats 1 and 2 open unchanged. A format 3 file opened by an older CHEPTA
  is refused with a message to update (as for format 2 today).
- The library: `system`, `pure` and `listComponents` take an optional `userData`; without it nothing changes. New:
  `checkUserData`, and `userDataPackage` (the contribution-package export).
- The workbench: one new item (My data); the pop-out button on the supporting panels. Nothing moves on the main
  screen.
- The databank, its scripts and the data rules are not touched: user data never enters src/data.

## Alternatives considered

- **User data saved in the browser only** (localStorage). Lost with the browser's data, not shareable, and not in the
  project the results belong to. Rejected; the browser's autosave keeps working as today, with the user data inside
  the project it saves.
- **Only a separate "user databank" file, not in the project.** It would split a project from the numbers it was
  calculated with. Taken instead as section 3a: the file exists, and the project keeps its own copy.
- **Separate windows by default.** Pop-up windows get lost behind the main window, are blocked inside AI chats, and
  do not exist on phones; for a short data-entry task a docked panel is quicker. Kept as an option.
- **Separate windows as separate pages** (a second HTML file loaded by URL, talking over BroadcastChannel). Needs a
  server or a second file next to the page, and does not work from a file on disk or inside a chat. Building the
  window from the main page avoids both.
- **No separate windows: tabs inside the page.** Simpler, but it does not free the main screen, which is the point.
  Kept as the fallback where windows cannot open.

## Steps

1. The engine overlay: `checkUserData`, `userData` in `system`, `pure` and `listComponents`, user components and pair
   sets; tests (the overlay repeating the databank changes nothing; a user record replaces a databank record; a user
   component in a flash and a flowsheet; refusals with their messages).
2. Project format 3 with `user_data`, the separate My data file (save, open, merge with the choice on conflicts), and
   the contribution-package export; round-trip tests, old formats opening.
3. The My data panel (docked): property tables and coefficients with units, the fit with its deviation and plot,
   user components; the browser fit compared with numpy.
4. The separate window for My data (the only panel with one for now), the docked fallback where windows are
   blocked; tests of both paths.
5. Pair parameters, and the Modified UNIFAC 2.0 groups panel (section 6): the database's groups with how they were
   found, the picker with the atom balance; the test that a databank component's own groups entered as user groups
   give identical activity coefficients.

## The maintainer's answers (2026-10-16)

1. May user data **replace** a databank record that has open measured data, or only fill gaps? **Both** ("yes
   both"), clearly labelled.
2. Which panels get a separate window? **Only My data for now.** Asked which is better, a new window or a place in
   the main window: docked by default, with the separate window as an option (section 5).
3. Added: the user data can be saved as a file of its own as well as in the project (section 3a).
4. Added: for every component, the groups panel shows the database's Modified UNIFAC 2.0 groups as a proposal, which
   the user keeps or replaces with their own (section 6).
