# 2026-10-13: NRTL without UNIQUAC r and q (before batch 3)

- **Found:** none of the 23 molecules of batch 3 of proposal 0009 is in ChemSep, so none has UNIQUAC r and q. CHEPTA
  offered a component for activity models only with them, also for NRTL, which does not use them; dichloromethane
  and 2-methoxyethanol were in that state already. Most of batch 3 are polar liquids, and few have critical
  constants for an equation of state.
- **Decided by the maintainer:** option A. A liquid at 25 degC with a vapour-pressure record is an activity-model
  component; UNIQUAC also needs r and q, and says so when they are missing. Option B (UNIFAC group tables for r and
  q, after DDBST answers) goes on in parallel.
- **Done:**
  - `listComponents()` gives `activity` (that rule) and `uniquac` (r and q present).
  - With UNIQUAC, the workbench checks, the component pickers and the flowsheet say "no UNIQUAC r and q (no open
    data yet) ... choose NRTL".
  - The engine already refused UNIQUAC with the reason, and fit_parameters.py already fits only NRTL for such a pair.
  - docs/DATA_WANTED.md and the pair scan count the pairs by the same rule. This adds the pairs of dichloromethane
    and 2-methoxyethanol (DATA_WANTED: 4322 -> 4503 missing).
  - Their `uniquac_missing` notes now say that NRTL and the ideal solution work.
