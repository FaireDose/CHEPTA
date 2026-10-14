# 2026-10-11 (late): pairs of the green-chemistry components

- **Asked:** mixture parameters for the 16 new components, with the old ones and among themselves, in a pull request of
  their own after batch 1 (#103) was merged.
- **Done:** ChemSep NRTL/UNIQUAC sets for 5 pairs (1-hexanol + water, 1,4-butanediol + methanol and + water,
  diethylene glycol + water, aniline + p-cymene; three of them predict two liquids, as the import notes); ChemSep PR and
  SRK k_ij of n-hexane + 1-pentanol; the whole NIST TRC ThermoML Archive scanned again (855 CHEPTA pairs with binary
  vapour-liquid data, from 704); 76 new pairs with a data set chosen by the vle_batch rules, fitted with the same gate:
  120 NRTL/UNIQUAC sets for 64 pairs written (fitted pairs 218 -> 280 of the 3570 activity pairs). Not written, data kept:
  both models of 11 pairs (for example diethyl carbonate + water and dimethyl carbonate + glycerol, which predict a
  liquid split in the data range, ethylene carbonate + water 1.7-2.1 % in P), and one model of 6 more.
- **Pending:** the pairs of Cyrene, terephthalic acid, dimethyl terephthalate, maleic and adipic acid have no open
  vapour-liquid data in the archive; they stay on docs/DATA_WANTED.md.
- **Decided by the maintainer: sets a little outside the gate are written, with a warning.** "The gap is super small,
  even the 2 %": a generated fit outside the gate (0.5 K, 0.012 in y, 1.5 % in P) but within 2.5 K, 0.02 and 3 % is
  written with a `quality_warning` and a "fit-quality" entry in src/data/known-issues.json (the workbench shows it for
  that pair and model). Never written: a fit that predicts a liquid split inside the data range. A set within the wider
  limits replaces a ChemSep default only if it follows the same data better (seven ChemSep defaults became
  non-default; methanol + n-butyl acetate UNIQUAC kept its ChemSep set), and never replaces a set fitted to other open
  data (2-butanol + cyclohexane keeps its Belabbaci et al. 2012 set). Applied to every generated pair: 78 sets, 16 pairs
  of the new components and 33 older pairs (for example monoethanolamine + water, glycerol + water, sulfolane +
  toluene). Fitted activity pairs: 280 -> 315. The four flowsheet-suite cases whose default sets changed (G02, G04,
  G06, G10) have new reference solutions; their components are the same.
