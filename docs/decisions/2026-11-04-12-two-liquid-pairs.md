# 2026-11-04-12: Pairs with two liquids, proposal 0019 (step 1: proposal and evidence survey)

The maintainer, 2026-11-04: "we need to think about the whole structure of nrtl fitting when we have two liquids. i
understand now there is a discrepancy and it refuses to calculate but in fact it could." Roadmap Data track D9
(ROADMAP.md, PR #201; docs/decisions/2026-11-04-08-program-after-m4.md).

## What was done

- **proposals/0019-two-liquid-pairs.md**, status Proposed: class each pair from open evidence (partly miscible,
  miscible, not known), fit by class (no split for miscible pairs; a joint VLE and liquid-liquid fit with gates on the
  mutual solubilities for partly miscible pairs; VLE alone with the predicted split kept and labelled for not-known
  pairs), the engine calculates every predicted split and says what evidence stands behind it, Wilson refused only
  inside a measured split, and the new wording of DATA_RULES.md section 5. No fit, data file or calculation is
  changed by this pull request.
- **The survey**, `validation/python/two_liquid_survey.py`, output `validation/data/two_liquids/survey.json`: every
  record of the ThermoML Archive's bulk file (ThermoML.v2020-09-30.tgz, SHA-256 checked) read for the 57 pairs where a
  set predicts a split: the 50 ChemSep pairs whose record notes a predicted split, and the 10 generated fits refused
  for a predicted split (rerun on 2026-11-04 with every NRTL alpha tried; 14 more generated fits are unwritten only
  for the quality gate, which this proposal does not touch). Result: 22 partly miscible, 17 miscible, 18 not known.
  - Six of the ten refused fits are pairs with open liquid-liquid data (1-butanol + water, furfural + water, methanol
    + n-heptane, diethyl carbonate + water, dimethyl carbonate + glycerol, n-pentane + water): refused although the
    mixture splits.
  - Ethanol + n-decane was measured as one liquid inside the refused fit's split (two articles, 323-333 K): there the
    refusal was right.
  - 17 ChemSep pairs have a predicted split where open data show one liquid (1-propanol + water, acetonitrile +
    water, tetrahydrofuran + water, ethanol + alkanes, ...).
- **Other simulators** (read 2026-11-05, quoted in the proposal): DWSIM keeps VLE-fitted NRTL and UNIQUAC sets and
  says their split may be misplaced, "Fit the pair to LLE data when the liquid compositions matter"; its regression
  utility takes LLE data. The ChemSep Book's extraction example uses separate UNIQUAC LLE parameters at 25 and 50 °C.
  DDBST's Regression Mix fits VLE and LLE data simultaneously (LLE by isoactivity or by the compositions). None refuses
  a set because it predicts a split.

## Accepted by the maintainer (2026-11-04, from a review, relayed by the coordinating session)

Every miscibility class names its sources and the temperature, pressure and composition range they cover. One liquid
seen at sampled conditions is not a claim of miscibility everywhere, and a predicted split is not a measured fact.
Results, the structured tool results included (the qualifications of `CHEPTA.run`), say whether a split is measured
or predicted without liquid-liquid validation at those conditions, so CHEPTA-Lab's records can carry it. Written into
the proposal, sections 1 and 3.

## The maintainer's answers (2026-11-05, relayed by the coordinating session: "i go with your recommendations")

1. Proposal 0019 is accepted; it becomes Accepted when this pull request is merged.
2. The solubility gates are accepted as a start: 0.02 in mole fraction or 25 % (minor component below 0.05); 0.04 or
   50 % with a quality warning. To be tightened after the refit.
3. One-liquid data measured 20-50 K below the fit's temperature do not by themselves class a pair miscible: such a
   pair is "miscible below the measured temperature, not known above it", because some mixtures split only on
   heating. Its fit is kept with a label, not refused (2-propanol + glycerol, GVL + water, o-xylene + sulfolane).
4. The Wilson pairs of PR #200: refuse diethyl carbonate + water; keep ethanol + n-decane; keep the other three with
   the label of answer 3.
5. The 17 ChemSep sets contradicted by open data are no longer the default where another set exists (a fitted set, or
   the other model's set), and are labelled where none exists.

Still to do: a person compares the classes with the ThermoML records named in survey.json (AGENTS.md rule 4) before
step 2 writes `classes.json`. Step 2 (classes, labels, the refit) goes to the session that has the two-liquid code of
PR #200 in progress.
