# 2026-11-10-07: Benzene + methanol: the ChemSep NRTL set is the default (proposal 0019, answer 5)

The maintainer, 2026-11-10 (decision (c) of PR #218, relayed by the coordinating session): apply proposal 0019,
answer 5 to benzene + methanol. The fitted NRTL set "fitted-li2019" is labelled "predicted-contradicted" (it predicts
two liquids where one liquid was measured); the ChemSep NRTL set of the pair does not split. The ChemSep set becomes the
pair's default; the contradicted fitted set stays selectable (`sets`, `prefer`).

## What was done

- `validation/python/two_liquid_labels.py`: the script that applied answer 5 to ChemSep sets now also swaps the default
  of a contradicted **fitted** set for the pairs named in `FITTED_DEMOTED` (only benzene + methanol). The change in
  `src/data/binaries.json` is written by the script (`--write`), not by hand. Other pairs of the same kind are only
  printed (below).
- `test/library.test.js`: a named exception (`CONTRADICTED_FITTED`) in the test that a fitted set is the default, with
  the reason; it also checks that the contradicted fitted set stays as an alternative. No other test changed.
- `docs/DATA_RULES.md` section 5: one sentence for the exception.
- `validation/fixtures/flowsheet-suite.json`: regenerated with `reference_flowsheet_suite.py` (the reference reads the default sets); only case "G14 bypass, NRTL, 6 components" (it has benzene + methanol) changed, by about 1e-3 kmol/h in its flows. Not a test edit.
- `src/data/binaries.json`: only the two `default` flags of the pair. A full `two_liquid_labels.py --write` run here also rewrote labels and known issues elsewhere (the numerical drift of this environment), so that output was not kept; the script has the rule and a person can rerun it.

## Other pairs with a contradicted default and an uncontradicted set of the same model

None. The script was run over all 379 classed pairs: the contradicted fitted default of benzene + methanol (NRTL
"fitted-li2019-etal") is the only one with an uncontradicted set of the same model. The fitted sets of 1-propanol +
water and acetonitrile + water have none, so they stay the default (open item in DECISIONS.md).

Only benzene + methanol was changed.

## Pending

A person checks that the ChemSep NRTL set of benzene + methanol is acceptable as a default (it does not split; it is
not fitted to measured data).
