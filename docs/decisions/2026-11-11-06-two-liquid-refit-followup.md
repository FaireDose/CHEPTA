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
  (J. Chem. Eng. Data, DOI 10.1021/je400501z, water + n-butanol + cyclohexane) and Garcia-Cano et al. 2020 (Fluid Phase
  Equilib. 112617, water + 1-butanol + 2-butanol). Their repository copies refused scripts; the maintainer supplied both
  PDFs (2026-11-12) and they were read. Neither adds a usable binary 1-butanol + water point: Gomis et al.'s binary
  liquid-liquid row at 313.15 K (Table 1: 0.484 and 0.019 in 1-butanol) is the row already in the tie lines, and its Table 8
  heterogeneous azeotrope (365.65 K, 0.750 water, 101.3 kPa) is one point, not stated to be the authors' own measurement and
  in line with the existing 366 K rows; Garcia-Cano et al. take the binary water + 1-butanol data from earlier works
  (their refs 14, 15) and measured the binary VLLE point of water + 2-butanol only (a pair already fitted). No new data
  file was added; nothing was taken from memory.
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
| 1-butanol + water | NRTL | 0.79 K off the bubble temperatures (with unit weight: also solubilities 0.051) | none (none open) | **written with a quality warning, as a non-default set** (`fitted-lladosa2008`): tie lines at weight 7, AAD 1.20 K in T (max 1.72), solubilities 0.032 (butanol-rich) and 0.009 (water-rich); ChemSep NRTL set stays as the non-default set (its solubilities: AAD 0.068) |
| 1-butanol + water | UNIQUAC | solubilities 0.055 | none | still held: weight 1: 0.055 in x; weight 3: 0.051; weight 10: 3.97 K in T; no weight meets even the wider gates. The ChemSep set stays (T 0.74 K, solubilities 0.133) |
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

- **Check against the sources** (AGENTS.md rule 4): no data file was added. The tie lines and the Lladosa 2008 rows are
  those of #218.
- **Decide:**
  1. Make the 1-butanol + water fitted NRTL (tie lines weight 7) the default, which DATA_RULES section 5 would do for
     a fitted set? It follows the tie lines (0.03 against 0.07) and the boiling points within 1.2 K (ChemSep: 0.93 K),
     but moves the two liquids of F1, F2 and W2 to other stages. Recommended: keep it non-default until the column cases
     are re-derived on purpose (a separate pull request).
  2. Tie-line weights up to 10 in the joint fit and the tie lines in the comparison with a databank set: keep as a rule of
     DATA_RULES section 5? Recommended: yes, state it there.
