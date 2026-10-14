# 2026-10-09 (night): pair data

- **Asked:** why common pairs such as 1-propanol + 1-butanol had no parameters, and to look for the data
  again; each pair needs only the model the method rules choose for it.
- **Found** (docs/PAIR_SCAN.md):
  - the ChemSep databank gave about 50 more activity-model pairs, now imported;
  - the whole NIST TRC ThermoML Archive (bulk file, 11,923 records) holds binary vapour-liquid data
    for 7,158 compound pairs, of which 704 are pairs of CHEPTA components;
  - 137 activity-model pairs fitted to it, one consistent data set each (validation/data/vle/), within
    fixed limits; for 25 more a data set was chosen but neither model followed it within the limits
    (for example 1-butanol + water, which splits into two liquids), so nothing was written; hydrocarbon
    pairs are left for equation-of-state k_ij.
- **Still without open data:** many classic pairs measured before 2003, for example ethanol +
  1-propanol; they stay on docs/DATA_WANTED.md.
