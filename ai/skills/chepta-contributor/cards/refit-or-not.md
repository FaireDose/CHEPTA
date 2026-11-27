# Card B: do conflicting measurements justify a refit?

**Trigger.** Measured values of a pure-component property disagree with CHEPTA's record, or with each other, and
someone asks whether to refit.

**Minimum inputs.** The component and property; the record's path (`src/data/components.json` and
`validation/data/pure/<id>.json`: ChemSep, CoolProp or measured only); every measured set with its article, method,
temperature range, point count and stated uncertainty.

**Steps.**

1. **Find the record's path first** (docs/DATA_RULES.md sections 1, 2 and 4). A ChemSep record is taken as it is:
   since 2026-10-14 it is not compared with measured data or refitted, and the refits made before then stay
   (`MEASURED_REFIT` in `validation/python/fit_properties.py`). A disagreement with a ChemSep record is then recorded
   (a known issue, or a note to the maintainer), not refitted.
2. **For a record fitted to measured data** (`measured_components.py`), apply the pooling rule of DATA_RULES
   section 3: pool the sets only when each set's mean deviation from the pooled curve lies within its mean stated
   uncertainty; each article has the same total weight; leave out a single value only beyond three times its
   uncertainty, and list it.
3. **When the sets disagree, stop.** Choose or leave out a set only with a stated physical reason (the method does
   not suit the substance, or the set fails the independent checks). Without one, hold the record and list the data
   that would decide.
4. **Judge by evidence that was not fitted**: other articles' measured normal boiling temperatures, the WebBook's
   average boiling point, calorimetric enthalpies of vaporization through the curve's slope.
5. **A point count or a small stated uncertainty settles nothing.** Many points from one laboratory against a second
   laboratory's series is still one laboratory against another.
6. Never change validation data or tests to make a refit pass (AGENTS.md rule 6). The maintainer decides; record it in
   `docs/decisions/`.

**Output.** One of: refit (with the rule and the evidence); keep, with a known issue that states the disagreement;
or hold, with the data that would decide. Each with the articles and their deviations, for the person to check
against the sources (AGENTS.md rule 4).

**Worked cases.**

| Case | What the data said | Outcome |
|---|---|---|
| Monoethanolamine vapour pressure, [PR #101](https://github.com/FaireDose/CHEPTA/pull/101), docs/decisions/2026-10-11-01.md | All seven ThermoML articles found the ChemSep curve high (2-9 % above 350 K, up to 44 % near room temperature); the Antoine equation of Matthews et al. 1950 also found it high | **Refit** under proposal 0008's rule (before 2026-10-14): closer to every article and to Matthews 1950 |
| Glycerol vapour pressure, PR #101, docs/decisions/2026-10-11-01.md | The record was fitted to Verevkin et al. 2015 (113 values, PR #101); Mokbel et al. 2012, also below 1 % stated uncertainty, about 9 % higher over 352-463 K | **Kept** then as a known issue: no single curve met both. Today's record (`validation/data/pure/glycerol.json`) is a fit to measured values, 88 within 1 % from one article and 35 looser ones |
| Methyl myristate vapour pressure, [PR #119](https://github.com/FaireDose/CHEPTA/pull/119), docs/decisions/2026-10-14-06-measured-data-review.md | Sahraoui 2016-2017 about 1-2 % above the record; Zaitsau 2019 (94 values) about 8 % below | **Kept** as a known issue: the articles lie on opposite sides and the record between them |

Where the pooling rule applies: the measured-only path (section 3; levulinic acid and its esters, PR #120, where it
was introduced). The three cases above are ChemSep-path records judged by the older refit rule of proposal 0008.
