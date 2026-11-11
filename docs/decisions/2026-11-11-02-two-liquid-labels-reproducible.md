# 2026-11-11-02: The two-liquid labels are reproducible (proposal 0019)

The coordinating session, 2026-11-11: a worker re-ran `two_liquid_labels.py --write` on 2026-11-10 in a fresh cloud
session and got about 2100 changed lines in `src/data/binaries.json` and `src/data/known-issues.json`, which it read as
numerical drift and did not keep (docs/decisions/2026-11-10-07-benzene-methanol-default.md). Task: find why, and make two
runs on different machines give the same files.

## What the re-run changes, and why

Run here with numpy 2.5.3 and scipy 1.18.1, on the committed `main` (5112c71): `binaries.json` 72 lines,
`known-issues.json` 2555 lines, `two-liquids.json` none. With the fix: `known-issues.json` about 1300 lines, all
in `source_ids` (137 issues gain `nist-thermoml-archive`, 40 also lose the other sets' sources) and the two removed issues. Sorted by kind:

| Kind | What | Cause |
|---|---|---|
| Numbers in the last digits | none: every stored split (T, x_a, x_b) of the 132 labelled sets came out the same | — |
| Splits found or lost | none | — |
| Evidence class changed | the two Wilson sets of benzene + methanol lose their label "predicted-contradicted" (below) | a stale label |
| Known issues added or removed | the two known issues of those Wilson sets removed (394 to 392) | the same |
| Known issues moved | all 213 of the script's known issues moved from their place (from entry 163) to the end of the file: about 2400 of the 2555 lines | the script appended them |
| Known issues' `source_ids` | 40 issues: the committed ones list every source of the pair's sets (written on 2026-11-05 by a step not in the script); the script wrote the set's own | the committed file was not the script's output |

So the 2100 lines of 2026-11-10 were the file order and the sources, not drift; there was no numerical drift.

**Benzene + methanol, Wilson.** A Wilson set carries the label of its pair's default NRTL (else UNIQUAC) set. On
2026-11-10 the default NRTL set became the ChemSep set, which does not split, and the pair's default UNIQUAC set does not
split either; the Wilson labels ("the NRTL set fitted-li2019-etal predicts two liquids ... measured as one liquid") were
left from before, because that run's output was not kept. The re-run takes them off with their two known issues. Wilson
on this pair now carries no two-liquid warning, as the NRTL default it is labelled by predicts one liquid.

## The search for numerical causes

- **Nothing random, nothing iterative.** `fit_parameters.phase_splits` evaluates g_mix/RT on a fixed grid (300 points
  log-spaced from 1e-9 to 0.1, 1500 from 0.1 to 0.9, 300 from 0.9 to 1 - 1e-9) and takes the lower convex hull; no seed,
  no starting point, no tolerance. The temperatures are fixed (273.15-373.15 K every 10 K and those of the pair's
  two-liquid evidence). The pairs are taken in sorted order and the sets in file order.
- **Library rounding.** Different numpy builds and processors round `exp` and `log` differently in the last bits. A
  stored value changes only if such a difference moves a point on or off the hull. Two checks, both passed:
  - `test/two-liquid-labels.test.js` recomputes all 132 labelled sets with the engine's JavaScript activity
    coefficients (another implementation and another maths library, V8's), on the same grid: every split equal to the
    stored 4 decimals;
  - g_mix perturbed by a relative 1e-12 (four orders above rounding, fixed seed) in the Python run: all 132 sets gave the same splits.
- **Rounding of stored numbers.** x is stored to 4 decimals and T to 0.01 K. A split's ends are grid points, so they
  are known to about one grid step (0.8/1499 = 5.3e-4 between 0.1 and 0.9; below 0.1, and above 0.9 for 1 - x, a step
  of 6.4 % of x, 10^(8/299)): between 0.1 and 0.9, 4 decimals hold the grid point without adding digits a step does
  not resolve; below 0.01 they are coarser than the grid but still the same on every machine, since a stored value is a
  grid point rounded once. No change.
- **Dependence on an earlier run.** The `default` flags of `binaries.json` are both an input and an output of the script
  (answer 5 and `FITTED_DEMOTED`), so the Wilson labels follow whatever default the last run left. That is why a default
  changed without re-running the script leaves stale labels. Rule kept: run the script after any change of a pair's
  NRTL, UNIQUAC or Wilson sets or defaults (it is idempotent: a second run changes nothing).
- **Versions.** The repository had no pinned Python versions and the CI installs no Python. Added
  `validation/python/requirements.txt` (numpy 2.5.3, scipy 1.18.1, the versions of this run), named in AGENTS.md.

## What was changed

- `validation/python/two_liquid_labels.py`:
  - its known issues are written back where the earlier ones stood, not appended, so a re-run without changes gives
    no diff;
  - each known issue's `source_ids` are the set's own and `nist-thermoml-archive` (the evidence of `classes.json` the
    message cites), sorted. This replaces the committed lists, which named every set of the pair (a fitted set's
    issue named `chemsep-ipd`, and a ChemSep set's issue the fitted set's article);
  - its header states what makes the output reproducible, the rounding and why, and the dependence on the defaults.
- `src/data/binaries.json`, `src/data/known-issues.json`: the script's output (`--write`): the benzene + methanol
  Wilson labels and their two known issues removed, the `source_ids` of the script's known issues as above. No split,
  no class of a non-Wilson set changed. `src/data/two-liquids.json`: unchanged.
- `src/data/LICENSES.md`: regenerated by `make_sources.py`; only the default counts of `chemsep-ipd` and
  `nist-thermoml-archive` change (one default each), from the benzene + methanol swap of 2026-11-10, which had not been
  regenerated. `sources.json` unchanged.
- Re-run on the result (a second `--write` in a copy): no change, so the script is idempotent.
- New test `test/two-liquid-labels.test.js`: every stored split recomputed by the engine; three pairs' unlabelled sets
  do not split; each evidence class and its sources follow from the splits and the class of the pair; the Wilson
  labels follow the default; one known issue per labelled set, together in the file, with the set's sources. No
  existing test or validation data changed.
- `validation/python/requirements.txt`; AGENTS.md names it.

## For the maintainer

- **Check:** the benzene + methanol Wilson sets no longer warn of two liquids. Their warning came from the fitted NRTL
  set's split, which you set aside on 2026-11-10; the NRTL default (ChemSep) predicts one liquid.
- **Decide:** the `source_ids` of the "phase-split" known issues: the set's own sources and the ThermoML Archive
  (this pull request; recommended: an issue is about one set) or every source of the pair's sets (as committed on
  2026-11-05).
