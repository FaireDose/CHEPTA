# 2026-10-14: model drop-down lists, any component selectable, one Excel button

- **Asked:** after #114: a drop-down list to choose an activity model or an equation of state, and for an activity
  model a second list for the vapour, an ideal gas by default; every component selectable in every sheet, with an
  error only when the chosen model cannot use it; one Excel button, at the bottom as on the flowsheet.
- **Done:**
  - `src/ui/model-picker.js`: Method (activity model / equation of state), then Liquid or Equation, then Vapour (activity
    models only, ideal gas by default); the models not available yet are in the lists, disabled. The same lists in the
    workbench's Model group and on the flowsheet's Method page; the Solubility views have the Liquid list alone.
  - Pickers: no component is greyed out any more (also the Henry's law gas and solvent); a note says what the chosen
    model or view cannot do, and the Inputs check (workbench) or the Components and Method pages (flowsheet) give the
    error with what to do.
  - Excel: one "Download Excel" button under the diagram (the one above it and the one in the Results panel removed);
    the AI instructions name it so.
