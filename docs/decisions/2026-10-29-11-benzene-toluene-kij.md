# 2026-10-29-11: Peng-Robinson and SRK k_ij for benzene + toluene, and the nonpolar pairs without k_ij

The maintainer, 2026-10-29, before the v0.5 release: "can you look for the peng robinson values of the benzene toluene,
i wonder why we do not have them", then "can you find similar pairs that were mistakenly done with activity model and
the peng robinson was not looked for".

## Why there was no k_ij

- The k_ij of the databank come from ChemSep's `pr.ipd` and `srk.ipd` (DECHEMA's tables, as ChemSep lists them).
  `pr.ipd` has 17 pairs with benzene, none with toluene; toluene only with hydrogen, methane and carbon dioxide.
- The batch fit of pairs to the NIST TRC ThermoML Archive, `vle_batch.py`, takes only the pairs for which the method
  rules choose an activity model (`scan_pairs.needed_method`); a nonpolar pair, which needs an equation of state, is
  skipped on purpose. Peng-Robinson k_ij beyond ChemSep's were fitted by hand only for the benchmarks and a few open
  articles (`eos_fit_kij.py`).
- So benzene + toluene, nonpolar, had ChemSep's NRTL and UNIQUAC sets but no k_ij: Peng-Robinson used k_ij = 0 and said
  so in a warning. Nothing was invented.

## What changed

- The set chosen by `vle_batch.py`'s own rules (isobaric T-x-y between 90 and 110 kPa, the best point test): Li et al.,
  Fluid Phase Equilib. 364 (2014) 62-66, doi:10.1016/j.fluid.2013.12.002, 11 points at 101.33 kPa between the pure
  components, point test 0.0011, from the ThermoML Archive (the article may be paywalled; the data are open there).
  Written beside it as checks: Huang et al., J. Chem. Eng. Data 53 (2008) 252 and Yang et al., Fluid Phase Equilib. 337
  (2013) 109. Files: `validation/data/eos/benzene_toluene_*.json`.
- Fitted by `eos_fit_kij.py` (an entry of TXY_FITS, within its quality gate):
  - PR: k_ij = -0.0003, AAD 0.09 K in T (max 0.30 K), 0.0045 in y (max 0.0079);
  - SRK: k_ij = 0.0030, AAD 0.05 K in T (max 0.10 K), 0.0027 in y (max 0.0051).
  `make_sources.py` gave them the set `fitted-li2014`; no other pair of `kij.json` changed.
- k_ij = 0 was already close: the fit adds a measured basis and the tier "fitted" instead of the warning.
- **The B2 benchmark column** (Peng-Robinson, by the maintainer's choice) used k_ij = 0. Its reference was regenerated
  with `reference_mesh.py`; only B2's part of `validation/fixtures/columns.json` is taken (the other cases changed only by
  round-off, energy residuals of about 1e-8 W, and are kept as they were). B2's distance from the published stages:
  at most 0.80 K and 0.018 in benzene's mole fraction (before: 0.85 K and 0.018), within its agreement tolerances of 1.0 K
  and 0.02, which are unchanged. B2's text no longer says k_ij = 0.
- Tests that used benzene + toluene as the example of a pair without k_ij now use p-xylene + toluene (no k_ij in ChemSep's
  files and no open data in the archive); the k_ij counts and the list of fitted pairs grow by these two entries
  (docs/DATA_RULES.md section 9: a test that a data change makes wrong may change, with the reason).

## The similar pairs

Nonpolar pairs (the method rules give an equation of state) with NRTL or UNIQUAC parameters but no Peng-Robinson k_ij,
on 2026-10-29: benzene + toluene (now fitted); ethylbenzene + styrene and ethylbenzene + toluene (open data in the
archive, not isobaric T-x-y: 89 and 52 points); benzene + ethylbenzene, benzene + m-xylene, benzene + p-xylene, benzene +
styrene, p-xylene + toluene, benzene + cumene, cumene + ethylbenzene (no data in the archive); n-heptane + naphthalene and
naphthalene + toluene (NRTL fitted to the solubility of solid naphthalene, which needs an activity model: right as they
are). Beyond these, 116 nonpolar pairs have open data in the archive and no parameters of any kind (26 with isobaric
T-x-y). Proposed, for after v0.5: extend the batch fit to nonpolar pairs (PR and SRK k_ij by the same selection rules),
a W7 task (roadmap D2).

## To check

- The 11 rows of Li et al. (2014) in `validation/data/eos/benzene_toluene_10-1016-j-fluid-2013-12-002_101.33kPa.json`
  against the ThermoML record (https://trc.nist.gov/ThermoML/10.1016/j.fluid.2013.12.002.html, sets 5 and 6).
- Whether to start the batch fit of the nonpolar pairs after the release.
