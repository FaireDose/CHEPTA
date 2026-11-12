# 2026-11-11-06: Two-liquid pairs not refitted in #218: a follow-up (proposal 0019)

The maintainer (2026-11-10, decision (a) of #218) accepted that the pairs that missed the gates keep their sets and asked
for a follow-up data task. For each pair: why it missed, what more data exists, what the rules allow. No gate and no
test was changed.

## What was found

- **No more open data for these pairs.** `validation/data/vle/archive_index.json` (the archive's whole bulk file) lists
  one usable vapour-liquid record per pair, the one already fitted: 1-butanol + water has Lladosa et al. 2008 (T-x, 15
  points) and two records with two points each; aniline + n-octane, acetonitrile + n-hexane, diethyl carbonate + water,
  dimethyl carbonate + glycerol and methanol + n-heptane have one each. Their liquid-liquid data are all in
  `validation/data/two_liquids/lle/`. A search of OpenAlex for open vapour-liquid-liquid articles found Gomis et al. 2013
  (J. Chem. Eng. Data, DOI 10.1021/je400501z, water + n-butanol + cyclohexane) and Garcia-Cano and Saquete 2020 (Fluid
  Phase Equilib. 112617, water + 1-butanol + 2-butanol). Their repository copies refused scripts; the maintainer supplied
  both accepted manuscripts (2026-11-12) and they were read. **Three rows were added** (no other number was taken):
  - `1-butanol_water_azeotrope_garcia-cano2020_101.3kPa.json`: Table 4, last row (the binary point, x3 = 0): 365.73 K,
    vapour water 0.754, at 101.3 kPa, a heterogeneous azeotrope (the vapour lies between the liquids);
  - `1-butanol_water_lle_garcia-cano2020_365.73K.json`: the same row's two liquids, water 0.638 (organic) and 0.979
    (aqueous);
  - `1-butanol_water_azeotrope_gomis2013_101.3kPa.json`: Table 8, column EXPERIMENTAL, heterogeneous azeotrope
    water + n-butanol: 365.65 K, water 0.750. The paper does not say it is its own measurement (it cites earlier works,
    refs 14, 15); it is used as a published experimental value.
  Gomis et al.'s binary liquid-liquid row at 313.15 K (Table 1) is the row already in the tie lines (ThermoML record).
  Garcia-Cano and Saquete take their water + 1-butanol VLE from earlier works, and measured the binary VLLE point of
  water + 2-butanol as well (a pair already fitted; not added). The three files enter the 1-butanol + water joint fit
  (`EXTRA_FILES` in `fit_parameters.py`), with the access text "accepted manuscript, free to read" (source kind "free
  copy"; not peer reviewed in this form).
- **1-butanol + water: why it missed.** The 22 articles' 36 tie lines agree with each other (water-rich x1 0.016-0.022,
  butanol-rich 0.36-0.52 falling with T), so there is no disagreement to pool (DATA_RULES section 3). The joint fit gave
  every residual the same weight; the 15 bubble temperatures (0.5 K) then pulled the temperature-dependent NRTL away from
  the tie lines (butanol-rich phase rising with T where it falls). 40 random starts found the same optimum, so it was not
  a local minimum.

## What changed (`fit_parameters.py`)

- **Tie-line weight.** For a partly miscible pair with measured two liquids, the joint fit tries the weight of the tie-line
  residuals 1, 3, 5, 7 and 10 (the unit weight is the earlier fit); each result goes through the same gates, and the first
  that meets them (else the first within the wider ones) is kept. The weight is stated in the set's `source`.
- **Comparison with the existing set.** A set within the wider gates replaces the databank default only if it follows "the
  same data" as well as the databank set. The measured two liquids are part of those data, so `score()` now includes the
  mutual-solubility deviations (a set with no split where one was measured scores infinite). Before, only the
  vapour-liquid deviations counted, so a databank set with no useful tie lines won.
- **Notes of kept sets.** A rejected fit left the pair's earlier set but removed that set's "fit-quality" known issue
  (acetonitrile + n-hexane lost one). The notes now stay whenever a fit is rejected.
- The gate message of a T-x-only set no longer prints "nan in y".

## Result

| Pair | Model | Gate missed before | Data added | Result |
|---|---|---|---|---|
| 1-butanol + water | NRTL | 0.79 K off the bubble temperatures (with unit weight: also solubilities 0.051) | 3 rows of 2 open manuscripts (above) | **written with a quality warning, as a non-default set** (`fitted-lladosa2008`): tie lines at weight 10, AAD 1.64 K in T (max 2.32), solubilities 0.031 (butanol-rich) and 0.008 (water-rich); the azeotrope at 93.26 degC against 92.50-92.58 measured (without the new rows: 1.20 K, weight 7); ChemSep NRTL set is the default (its solubilities: AAD 0.068) |
| 1-butanol + water | UNIQUAC | solubilities 0.055 | 3 rows (above) | still held: with the new rows 3.88 K in T at the best weight; no weight meets even the wider gates. The ChemSep set stays (T 0.74 K, solubilities 0.133) |
| aniline + n-octane | NRTL | solubilities 0.163 | none | still held (same); 2 tie lines only |
| aniline + n-octane | UNIQUAC | solubilities 0.045 | none | still held: 0.043 (limit 0.04 wider) |
| acetonitrile + n-hexane | NRTL | no split at 331-348 K | none | still held: no split |
| acetonitrile + n-hexane | UNIQUAC | (not in the table) | none | held: 5.25 % in P |
| diethyl carbonate + water | NRTL, UNIQUAC | 3.6 % in P / no split at 363 K | none | still held: measured one-liquid rows inside the predicted split (a split is predicted where one liquid was measured) |
| dimethyl carbonate + glycerol | NRTL, UNIQUAC | one-liquid rows inside the predicted split | none | still held (UNIQUAC: the bubble-point calculation fails at every start) |
| methanol + n-heptane | NRTL | one-liquid rows inside the predicted split | none | still held: 0.87 K off, outside by the model, not by data |
| methanol + n-heptane | UNIQUAC | the same | none | still held: one-liquid rows inside the predicted split |

## Column cases F1, F2, W2

The cases use 1-butanol + water with `sets: default`. A first run wrote the fitted NRTL set as the default; 14 tests of
the column cases then failed (F1, F2 and both W2 VLL cases): the fixtures and the cases' stated expectations are those of
the ChemSep set, and with the fitted set the two liquids sit on stages 3 and 4 instead of 1 and 2 (stage 1 at 366.23 K
instead of 366.10 K, the decanter's distillate no longer the water-rich liquid). The expectations are validation data, so
they were not changed. The fitted set is therefore written as a **further, non-default set**
(`fitted-lladosa2008`, `NOT_DEFAULT` in `fit_parameters.py`); the cases and their results are unchanged. A user chooses it
with `sets`. Making it the default needs the maintainer's decision and re-derived case expectations.

## For the maintainer

- **Check against the sources** (AGENTS.md rule 4): compare each of the three new rows with its PDF: Garcia-Cano and
  Saquete 2020, Table 4, last row (365.73 K; vapour water 0.754; organic water 0.638; aqueous water 0.979), and Gomis et
  al. 2013, Table 8, EXPERIMENTAL column (365.65 K; water 0.750). The tie lines and the Lladosa 2008 rows are those of
  #218.
- **Decide:**
  1. Make the 1-butanol + water fitted NRTL (tie lines weight 7) the default, which DATA_RULES section 5 would do for
     a fitted set? It follows the tie lines (0.03 against 0.07) and the boiling points within 1.2 K (ChemSep: 0.93 K),
     but moves the two liquids of F1, F2 and W2 to other stages. **Decided by the maintainer, 2026-11-12: it stays
     non-default until F1, F2 and W2 are re-derived on purpose, in a separate pull request.**
  2. Tie-line weights up to 10 in the joint fit and the tie lines in the comparison with a databank set: keep as a rule of
     DATA_RULES section 5? Recommended: yes, state it there.
