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

## For the maintainer to decide

1. **Accept the proposal**, or change it: the three classes, the fit per class, the labels, Wilson refused only
   inside a measured split.
2. **The solubility gates** of the joint fit: 0.02 in mole fraction (25 % relative for a minor component below 0.05);
   0.04 (50 %) with a quality warning. No open simulator documentation gives numbers; these are a proposal.
3. **One liquid measured below the fit's temperature:** may one-liquid data over the whole composition range at a
   lower temperature class a pair miscible, when no open data show a lower critical solution temperature? Yes would
   make 2-propanol + glycerol, GVL + water and o-xylene + sulfolane miscible (their one-liquid data are 20-50 K below
   the refused fits); no keeps them not known, and their VLE fits are then written with the split labelled.
4. **The five Wilson pairs of PR #200:** by the survey, refuse diethyl carbonate + water (partly miscible, 7 articles
   of liquid-liquid data, 293-363 K) and keep ethanol + n-decane (miscible); 2-propanol + glycerol, GVL + water and
   o-xylene + sulfolane follow answer 3 (kept either way: not known or miscible).
5. **ChemSep sets contradicted by data** (17 pairs): keep them as they are with a label (the proposal), or also stop
   making them the default where the pair has no fitted set.
6. **The classes**: a person compares them with the ThermoML records named in survey.json (AGENTS.md rule 4) before
   step 2 writes `classes.json`.
