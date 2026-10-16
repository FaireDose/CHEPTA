# 2026-10-16: proposal 0012, step 3 — the My data panel

- **Asked:** "ok, merged both. continue with step 3".
- **Done:**
  - `src/thermo/user-fit.js`: a table of points becomes a record. Linear least squares with the repository's forms
    (DIPPR 100 on relative deviations; DIPPR 101 on ln y with E fixed), Householder QR on scaled columns; the fewest
    coefficients that meet the points within 0.5 % by default, or the number the person chooses. Unit conversions
    are definitions only (°C, °F; g/cm3; J/g/K with the molar mass; cal; kPa, bar, atm, mmHg; mPa s, cP; mW/m/K;
    mN/m). Pasted tables: tabs, semicolons, commas or spaces, decimal commas, a header line.
  - `src/ui/my-data-panel.js`, a docked panel next to the Library:
    - the project's entries, each with Remove and a contribution draft (its missing fields listed);
    - Add a property, for any databank component except water, or a component of one's own: a table of points with
      its units, or typed coefficients; the fit's largest deviation and a plot over the databank's record before saving;
    - Add a component of one's own: name, formula, CAS number, molar mass, volatile (vapour pressure fitted) or
      nonvolatile, liquid heat capacity, optional critical constants;
    - the source line is required; the published source (citation, DOI, free copy, why it is open) is optional and
      goes into contribution drafts;
    - Save my data, Copy, Open my data and Paste; when an entry exists with other numbers, both are shown with their
      value at mid-range and the person chooses which to keep.
  - Every view takes the project's data (component pickers, inputs, systems, the property explorer, the flowsheet
    and its Excel export); a result that uses it carries the note "Uses your own data: ..." on the canvas.
  - A component of one's own keeps its CAS number; a CAS number of a databank component is refused (the records go to
    that component instead). Removing a component that the flowsheet uses is refused; removing one takes it out of
    the views' inputs.
- **Tested:** `test/user-fit.test.js` (the fit against numpy, `validation/python/reference_user_fit.py`, to 1e-9;
  units, tables, refusals), `test/user-data-workbench.test.js` (a component of one's own in the inputs and the
  systems; removal; put, list, remove; the Excel export). The panel in Chromium (Playwright): a pasted table fitted and
  saved, a component added, the Properties curve drawn from the saved record with the note, a flash with the
  component, a project saved and opened, a My data file opened with a conflict and the file's entry chosen, an entry
  removed, the panel at 375 px wide without overflow. `test/workbench-navigation.test.js` lists the new panel.
- **Not yet:** pair parameters and groups (step 5); with NRTL or UNIQUAC a component of one's own needs pair
  parameters, so until then it calculates with the ideal solution or Modified UNIFAC 2.0 groups given in code.
- **Next:** step 4, the separate window.
