# 2026-10-14: the engineering report reaches every component

- **Asked:** "the engineering report is never updating with the new chemicals".
- **Found:** its case list was fixed: boiling points and properties for the 16 original components, and the measured-
  data group generated once. 50 of the 127 components were in no case. `make_cases.py` was also behind
  `cases.json` (the three-phase flashes and two ternary azeotropes had been added by hand), so regenerating would have
  dropped them.
- **Done:** `make_cases.py` takes every CoolProp fluid of the component registry (boiling point, properties at 25 degC
  and at Tb, against CoolProp) and the components built from measured data (boiling point against the WebBook average
  of the measured values); it now also writes the three-phase flashes and both ternary azeotropes, unchanged. The
  measured-data group is regenerated (96 components). 1350 results, from 791. A test fails when a component is in no
  case.
- **Shown by the larger report (for the maintainer, not fixed here):** two large deviations from measured data, 1-octanol
  liquid cp (4.3 %) and methyl myristate vapour pressure (2.7 %), and smaller ones (vapour pressures of 1-hexanol,
  1-octanol, cyclohexanone, NMP, methyl laurate 1.4-1.9 %; viscosities of the methyl esters 6-8 %). They follow the
  refit rule of proposal 0008 (refit, or a known issue with the reason).
