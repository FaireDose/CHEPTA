# 2026-11-05-01: Pairs with two liquids, step 2: classes, labels and the refit (proposal 0019)

Proposal 0019 (PR #205, accepted 2026-11-05), step 2, with the answers of the maintainer of that day. The coordinating
session relayed it: "do 0019 step 2, the NRTL/UNIQUAC refits, on a new branch claude/d9-two-liquid-refit, following
0019 and its answers". Before that, the maintainer, 2026-11-04: "the procedure should be fixed on how the liquid data is
extracted".

## What was done

- **Extraction of the two liquids** (`vle_batch.two_liquid_points`). A record of the ThermoML Archive stores the two
  liquids of a pair in sets with phases "Liquid mixture 1" and "Liquid mixture 2". Three layouts are read:
  - one set per liquid at the same T and P;
  - one set with both liquids as two rows per temperature;
  - the compositions as variables, with the three-phase temperature as the property "Triple point temperature".

  Mass fractions are converted with the molar masses of the component records. Cloud points (one liquid per
  temperature), three-phase pressures without compositions, interfacial tensions and mass ratios give no point.
- **Classes** (`two_liquid_survey.py --classes`, from the archive's bulk file ThermoML.v2020-09-30.tgz, SHA-256 checked
  against the published value). The 379 pairs are the 57 of 0019's survey and every pair of the generated fits:

  | Class | Pairs |
  |---|---|
  | partly miscible | 29 |
  | miscible | 25 |
  | miscible below the measured temperature, not known above it | 195 |
  | not known | 130 |

  - Each class lists its evidence entries in `validation/data/two_liquids/classes.json`: the article (DOI, citation),
    its sets, and the T, P and composition ranges of its points.
  - "Miscible below the measured temperature, not known above it" (answer 3) is given where one-liquid points span x
    from 0.1 or less to 0.9 or more, none of them inside a predicted split.
  - 24 partly miscible pairs have their measured tie lines in `validation/data/two_liquids/lle/<pair>.json`, with the
    records they come from.
- **Fitting by class** (`fit_parameters.py`):
  - **partly miscible:** a joint fit to the vapour-liquid data and the tie lines (isoactivity). It is temperature-
    dependent, a + b/T, where the tie lines lie more than 5 K outside the vapour-liquid temperatures. The split is
    required at the measured temperatures. The mutual-solubility gates are those of answer 2: 0.02 in mole fraction or
    25 % for a minor component below 0.05; within 0.04 or 50 % the set is written with a quality warning.
  - **miscible:** no split in the data range, nor where one liquid was measured.
  - **not known, and miscible below the measured temperature:** a predicted split is kept and labelled, not refused.
  - **Wilson:** refused only for a partly miscible pair whose data reach the measured split, and fitted to the
    vapour-liquid data only.
  - **Refused fits:** a refused fit leaves what the pair had ("the pair keeps what it had"). A first run of this
    branch took out the earlier sets of the same data; that went against 0019, and the 12 NRTL and UNIQUAC sets it
    removed were put back.
- **The refit batch:** 46 pairs (every generated fit of 0019's table, of a partly miscible pair, or with a refused NRTL
  or UNIQUAC fit), NRTL, UNIQUAC and Wilson. 38 sets were written. Joint fits that pass the gates:
  - furfural + water: NRTL and UNIQUAC;
  - 2-butanol + water: UNIQUAC.

  Partly miscible pairs whose joint fits miss the measured split or solubilities keep what they had:

  | Pair | Model | Why not written |
  |---|---|---|
  | 1-butanol + water | NRTL | 0.79 K off the bubble temperatures |
  | 1-butanol + water | UNIQUAC | solubilities off by 0.055 |
  | aniline + n-octane | NRTL | solubilities off by 0.163 |
  | aniline + n-octane | UNIQUAC | solubilities off by 0.045 |
  | acetonitrile + n-hexane | NRTL | no split at 331-348 K |
  | diethyl carbonate + water | NRTL | 3.6 % in P |
  | diethyl carbonate + water | UNIQUAC | no split at 363 K |
  | dimethyl carbonate + glycerol | NRTL and UNIQUAC | one-liquid rows inside the predicted split |
  | methanol + n-heptane | NRTL and UNIQUAC | the same |

  New fits of miscible pairs that split where one liquid was measured are not written either: 1-propanol + water,
  acetonitrile + water (UNIQUAC), sulfolane + toluene, isobutanol + n-hexane and ethanol + n-decane.
- **Labels** (`two_liquid_labels.py`):
  - Every NRTL, UNIQUAC and Wilson set of a classed pair that splits (at 273-373 K and at the measured two-liquid
    temperatures) carries `two_liquids: { class, evidence, splits, sources, fitted }`. The evidence is "measured",
    "predicted-unvalidated" or "predicted-contradicted".
  - Each labelled set has a "phase-split" known issue naming its evidence.
  - Answer 5 demotes a contradicted ChemSep set from the default where the pair has a non-contradicted set of the same
    model. A set can only give way to another set of its own model. Where the contradicted ChemSep set is the pair's
    only set of that model, it stays the default, labelled, and its known issue names the other model.
- **The engine** (`src/thermo/two-liquids.js`, `src/data/two-liquids.json`):
  - A flash with two liquids lists, per pair, `two_liquids` "measured", "predicted-unvalidated" or
    "predicted-contradicted", with the evidence and conditions, and says so in its warnings.
  - A split is "measured" only inside an entry's T (1 K), P (10 %) and composition (0.02) range.
  - The flash drum reports a predicted or contradicted split as warning `TWO_LIQUIDS`, and a measured one as a note.
  - `CHEPTA.run` puts the same per block and pair in its `qualifications.two_liquids`.
  - Wilson is refused (`NOT_AVAILABLE`) where a liquid lies inside the measured split of a partly miscible pair at its
    temperature: in the flash and in the bubble points. The split is interpolated between the measured tie lines.
  - Wilson's warning gives the class of the prediction.
- **DATA_RULES.md section 5** has 0019's wording.
- **Tests** (`test/two-liquids.test.js`, fixture by `reference_two_liquids.py`):
  - the engine's two liquids equal the Python reference's (isoactivity) at the measured temperatures, within 1e-4;
  - the joint fits meet the measured mutual solubilities within the wider gate;
  - the classes name their sources;
  - the labels agree with the classes;
  - the statements by class, the Wilson refusal, and the qualifications of `CHEPTA.run`.

## For the maintainer

- **Few joint fits pass the gates of answer 2.** 1-butanol + water, aniline + n-octane and the others above would need
  wider gates, separate liquid-liquid sets (0019, "Alternatives"), or more parameters. The column cases F1, F2 and W2
  keep their ChemSep set of 1-butanol + water.
- **1-propanol + water and acetonitrile + water:** their fitted sets predict a split at 298 K, below their data, where
  the survey found one liquid measured. Under 0019 such a set is not written anew. The existing ones stay as the
  pair's default, now labelled "predicted-contradicted". Keep them, or prefer another set?
- **To check against the records** (AGENTS.md rule 4): the classes and their evidence in `classes.json`, and the tie
  lines in `validation/data/two_liquids/lle/`. Each row names its record and sets.
