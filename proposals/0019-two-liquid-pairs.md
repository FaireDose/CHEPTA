# 0019: Pairs with two liquids: how they are fitted and used

- **Status:** Accepted (PR #205); steps 2-5 in the pull request of docs/decisions/2026-11-05-01-two-liquid-refit.md.
  Proposed; accepted by the maintainer on 2026-11-05 ("i go with your recommendations", answers below). It
  becomes Accepted when this pull request is merged.
- **Author(s):** a coding agent working for the maintainer
- **Discussion:** the pull request that adds this file
- **Roadmap item:** Data track, **D9** ([ROADMAP.md](../ROADMAP.md#data-track)); decision file
  [docs/decisions/2026-11-04-12-two-liquid-pairs.md](../docs/decisions/2026-11-04-12-two-liquid-pairs.md)

This is step 1: the proposal and a survey of the evidence. It changes no fit, no data and no calculation.

## Problem

The maintainer, 2026-11-04: "we need to think about the whole structure of nrtl fitting when we have two liquids. i
understand now there is a discrepancy and it refuses to calculate but in fact it could."

[DATA_RULES.md](../docs/DATA_RULES.md#5-pairs-nrtl-uniquac-k_ij) section 5 says today: "A fit that predicts a liquid
split inside its data range is never written." `fit_parameters.py` (`check_phase_splits`) applies it to every fit to
vapour-liquid data, whatever the mixture really does. The rule was made against **spurious** splits: an NRTL or UNIQUAC
set fitted to bubble points alone can put a second liquid where there is none. But it also refuses mixtures that
**really** split. Then:

- the pair keeps no fitted set, or a databank set that misses the same data (1-butanol + water, furfural + water,
  methanol + n-heptane keep their ChemSep sets);
- the Wilson fits of the same data are not written either (PR #200, `fit_parameters.py`): "a one-liquid fit to the
  bubble temperatures of a mixture that splits would hide the split";
- the opposite also happens: 50 ChemSep pairs are imported with a predicted split, written in their `source` as "not
  checked against data in this import". Some of them are miscible: the user gets two liquids where there is one, and
  nothing says which.

Users are affected in both directions: a calculation refused where it could be made, and a split shown with no word on
whether it is real. Nothing in the fitting asks the one question that decides: **does this mixture split, by open
data?**

## Proposal

### 1. Class every pair from open evidence, before it is fitted

| Class | Evidence (open sources only) |
|---|---|
| **partly miscible** | liquid-liquid data of the pair: tie lines, mutual solubilities, cloud points, vapour-liquid-liquid points (ThermoML sets with phases "Liquid mixture 1" and "Liquid mixture 2"), or a heterogeneous azeotrope in an open article. The class holds at the temperatures measured; above a measured upper critical solution temperature the pair is miscible. |
| **miscible** | no liquid-liquid data, and the pair measured as one liquid (density, excess enthalpy, viscosity, speed of sound, surface tension: ThermoML sets of one liquid phase) at compositions and temperatures where a set predicts two. The class holds where it was measured. |
| **miscible below the measured temperature, not known above it** | one-liquid data over the composition range only at temperatures below those where a set predicts the split (answer 3): some mixtures split only on heating, so the data do not decide above them. Treated as not known where the split is predicted. |
| **not known** | neither. |

Vapour-liquid sets are not one-liquid evidence: a ThermoML vapour-liquid set may list the two liquids of a
three-phase point as ordinary rows (PR #200, commit "Two liquids in the VLE data").

The class is stored per pair in a data file, `validation/data/two_liquids/classes.json`, with the sets and articles
behind it, written by `validation/python/two_liquid_survey.py` (added in this pull request) and checked by a person
against the records (AGENTS.md rule 4). A person may add an open article the archive does not have; the file then
names it.

**Every class names its sources and the conditions they cover** (the maintainer, 2026-11-04, accepted from a review of
this proposal): the articles and ThermoML sets behind it, and the temperature, pressure and composition range of
their points. A class holds only where it was measured. One liquid seen at sampled conditions is not a claim of
miscibility everywhere, and a split predicted by a set is never recorded as a measured fact. `classes.json` (step 2)
stores per pair a list of evidence entries `{ "kind": "two-liquid" | "one-liquid", "source_ids", "T_K": [lo, hi],
"P_kPa": [lo, hi] or null, "x": [lo, hi] }`. The survey of this pull request gives the sets, articles and temperature
ranges; the pressure and composition ranges are added in step 2.

### 2. Fit by class

- **Miscible** pairs: as now. A fit that predicts a split where the pair was measured as one liquid, or anywhere in
  its data range, is not written. A ChemSep set that predicts a split there stays selectable but is no longer the
  default where another set exists (a fitted set, or the pair's set of the other model; answer 5), and its known
  issue says where it was measured as one liquid. Where no other set exists it stays the default, labelled.
- **Partly miscible** pairs: a **joint fit** to the vapour-liquid data and the liquid-liquid data, as for the ethyl
  acetate ternary (`fit_ternary_lle.py`, 2026-11-04) and the two-liquid rows of PR #200: the liquid-liquid points by
  isoactivity, the vapour-liquid points as now. The split is **required** where the liquid-liquid data are, and is not
  allowed where a one-liquid measurement is. Gates, on top of the gates of section 5:
  - the predicted mutual solubilities within 0.02 in mole fraction of the measured ones in the solvent-rich liquid and
    within 25 % (relative) for the minor component of each liquid when its mole fraction is below 0.05, at the
    measured temperatures;
  - within 0.04 and 50 %: written with a quality warning and a "fit-quality" known issue, as for the wider VLE gate;
  - outside them: not written; the pair keeps what it had, and the run says why.
  The liquid-liquid data are fitted over their own temperatures; the set is temperature-dependent (a + b/T) where the
  two data kinds cover different temperatures.
- **Not known** pairs: fitted to the vapour-liquid data alone, as now, but a predicted split is **kept**, not refused.
  The set carries `"two_liquids": "predicted, not checked against liquid-liquid data"` with where it splits, and a
  "phase-split" known issue says the same. A set of this class still has to pass the VLE gates.

ChemSep sets are imported as they are (section 1 of DATA_RULES); their predicted split is labelled by the class of
the pair in the same way, with no refit.

### 3. What the engine does with a predicted split

- It **calculates** the split wherever the chosen set predicts it: the flash, the decanter and the columns with
  phases "VLL" use the two liquids (they already can, `src/equilibrium/flash.js`, `resolveSplit`). Nothing is refused
  because of the class.
- Every result with two liquids says which evidence stands behind them, from the set's `two_liquids` field:
  - "two liquids measured (partly miscible, <articles>); the set was fitted to them";
  - "two liquids predicted by the set, not checked against liquid-liquid data (no open data found)";
  - "two liquids predicted by the set where the pair was measured as one liquid (<articles>): the split is probably
    wrong; choose another set or another model".
  These are warnings in `sys.warnings(T, P)`, the channel the Wilson warnings already use, with a new code.
- The split is called **measured** only where the state lies inside the conditions (T, P, composition) of the pair's
  two-liquid evidence. Anywhere else, even for a partly miscible pair, it is "predicted, without liquid-liquid
  validation at these conditions".
- The structured results say the same: `CHEPTA.run`'s `qualifications` (src/api/dispatcher.js) carry, for each pair
  with two liquids in the result, `{ pair, set, two_liquids: "measured" | "predicted-unvalidated" |
  "predicted-contradicted", evidence: [source ids], conditions }`, so that CHEPTA-Lab's records can keep it.
- Diagrams that assume one liquid keep their present "phase-split" notes.

### 4. Wilson

Wilson cannot predict two liquids (proposal 0016). Today it is not fitted where the pair's NRTL or UNIQUAC set
predicts two liquids, and it warns where another model predicts them. With the classes:

- **Fitting:** a Wilson fit is refused only for a pair classed **partly miscible** whose data range overlaps the
  measured split. Miscible and not-known pairs get their Wilson fit, the latter with the label of the predicted split (answer 4
  decides the five pairs of PR #200).
- **Calculating:** Wilson is **refused** (`NOT_AVAILABLE`, naming NRTL and UNIQUAC as the remedy) only where a pair of
  the mixture is classed partly miscible and the state lies inside the measured split at that temperature. Elsewhere
  the present warning stays, and it says the class: "predicted by the NRTL set, not checked against data".

### 5. New wording for DATA_RULES.md section 5

Replace the sentence "A fit that predicts a liquid split inside its data range is never written." and the Wilson line
of PR #200 with:

> - **Two liquids** (proposal 0019; the maintainer, 2026-11-04). Before a pair is fitted, it is classed from open
>   data (`validation/data/two_liquids/classes.json`, `two_liquid_survey.py`): *partly miscible* where liquid-liquid
>   data, mutual solubilities, vapour-liquid-liquid points or a heterogeneous azeotrope are open; *miscible* where it
>   was measured as one liquid where a set predicts two; *not known* otherwise. A vapour-liquid set is not evidence of
>   one liquid. Each class names its sources and the temperature, pressure and composition range they cover, and holds
>   only there; a predicted split is never recorded as measured. Then:
>   - miscible: a fit that predicts a liquid split in its data range, or where the pair was measured as one liquid, is
>     never written;
>   - partly miscible: the fit is joint, to the vapour-liquid and the liquid-liquid data; it must predict the split
>     where the liquid-liquid data are and not where a one-liquid point is, and meet the mutual solubilities within
>     0.02 in mole fraction (25 % for a minor component below 0.05); between that and 0.04 (50 %) it is written with a
>     quality warning and a "fit-quality" known issue;
>   - not known: fitted to the vapour-liquid data as above; a predicted split is kept, and the set says "two liquids
>     predicted, not checked against liquid-liquid data" with where it splits.
>   - one-liquid data only below the temperatures of a predicted split class the pair miscible below them and not
>     known above them: the fit is kept with the label, not refused;
>   - ChemSep sets are not refitted; their predicted split is labelled by the class of the pair. A ChemSep set whose
>     split is contradicted by open data is not the default where another set exists (a fitted set, or the other
>     model's).
> - Wilson cannot give two liquids: it is not fitted to liquid-liquid data, a heterogeneous azeotrope or data with two
>   liquids, nor to a pair classed partly miscible whose data range overlaps the measured split.

## Answers of the maintainer (2026-11-05)

Relayed by the coordinating session: "i go with your recommendations", with these points.

1. **Proposal 0019 is accepted.** It becomes Accepted when this pull request is merged.
2. **The solubility gates** are accepted as a start: 0.02 in mole fraction or 25 % (minor component below 0.05);
   0.04 or 50 % with a quality warning. They are to be tightened after the refit.
3. **One-liquid data measured 20-50 K below the fit's temperature do not by themselves class a pair miscible.** Such a
   pair is "miscible below the measured temperature, not known above it", because some mixtures split only on
   heating. Its fit is kept with a label, not refused. This covers 2-propanol + glycerol, GVL + water and o-xylene +
   sulfolane.
4. **The Wilson pairs of PR #200:** refuse diethyl carbonate + water (partly miscible); keep ethanol + n-decane
   (miscible); keep 2-propanol + glycerol, GVL + water and o-xylene + sulfolane with the label of answer 3.
5. **The 17 ChemSep sets contradicted by open data** are no longer the default where another set exists (a fitted set,
   or the other model's set), and are labelled where none exists.

Step 2 (classes, labels and the refit) goes to the session that has the two-liquid code of PR #200 in progress.

## Engineering basis

### The evidence survey (step 1, this pull request)

`validation/python/two_liquid_survey.py` read every record of the NIST TRC ThermoML Archive's bulk file
(ThermoML.v2020-09-30.tgz, doi 10.18434/mds2-2422, NIST open license; SHA-256 checked against the published file,
2026-11-04) and kept every binary set of the pairs below. Its output, with the articles behind each class, is
[validation/data/two_liquids/survey.json](../validation/data/two_liquids/survey.json). The classes are a first pass for
a person to check; they change nothing yet.

The pairs are every pair refused or labelled so far because a set predicts a split:

- the generated fits of `vle_batch.py` that `fit_parameters.py` refused for a predicted split (rerun 2026-11-04 with
  each alpha it tries; 24 generated fits have no written NRTL set, 14 of them only for the quality gate, which this
  proposal does not change);
- the 50 pairs whose ChemSep NRTL or UNIQUAC set notes "The set predicts two liquid phases" (`chemsep_pairs.py`);
- the five Wilson pairs of PR #200, which are among the refused fits.

| Pair | Sets that predict a split | Class | Evidence |
|---|---|---|---|
| 1-butanol + water | ChemSep NRTL, ChemSep UNIQUAC, refused fit NRTL, refused fit UNIQUAC | partly miscible | two-liquid data, 51 sets of 27 articles, 278-366 K; one liquid measured inside the split of ChemSep NRTL: 55 points of 3 articles, 283-315 K; one liquid measured inside the split of ChemSep UNIQUAC: 71 points of 2 articles, 283-315 K |
| 1-hexanol + water | ChemSep NRTL, ChemSep UNIQUAC | partly miscible | two-liquid data, 19 sets of 9 articles, 278-353 K |
| 1-propanol + cyclohexane | ChemSep NRTL, ChemSep UNIQUAC | miscible | one liquid measured inside the split of ChemSep NRTL: 3 points of 1 articles, 293-293 K; one liquid measured inside the split of ChemSep UNIQUAC: 1 points of 1 articles, 298-298 K |
| 1-propanol + n-decane | ChemSep NRTL, ChemSep UNIQUAC | not known | none (2 one-liquid sets, none inside the split) |
| 1-propanol + n-heptane | ChemSep UNIQUAC | miscible | one liquid measured inside the split of ChemSep UNIQUAC: 258 points of 4 articles, 293-323 K |
| 1-propanol + n-hexane | ChemSep NRTL, ChemSep UNIQUAC | miscible | one liquid measured inside the split of ChemSep NRTL: 2 points of 1 articles, 298-298 K; one liquid measured inside the split of ChemSep UNIQUAC: 2 points of 1 articles, 298-298 K |
| 1-propanol + n-octane | ChemSep NRTL, ChemSep UNIQUAC | not known | none (7 one-liquid sets, none inside the split) |
| 1-propanol + water | ChemSep UNIQUAC | miscible | one liquid measured inside the split of ChemSep UNIQUAC: 264 points of 8 articles, 282-362 K |
| 2-3-butanediol + water | ChemSep NRTL | not known | none (10 one-liquid sets, none inside the split) |
| 2-butanone + water | ChemSep NRTL, ChemSep UNIQUAC | partly miscible | two-liquid data, 9 sets of 4 articles, 283-347 K |
| 2-propanol + glycerol | refused fit NRTL, refused fit UNIQUAC (Wilson set in PR #200) | not known | none (2 one-liquid sets, none inside the split) |
| acetonitrile + water | ChemSep UNIQUAC | miscible | one liquid measured inside the split of ChemSep UNIQUAC: 104 points of 7 articles, 279-328 K |
| acrylonitrile + water | ChemSep UNIQUAC | partly miscible | two-liquid data, 2 sets of 1 articles, 288-313 K |
| aniline + water | ChemSep NRTL, ChemSep UNIQUAC | partly miscible | two-liquid data, 3 sets of 3 articles, 298-333 K |
| bdo + water | ChemSep NRTL | miscible | one liquid measured inside the split of ChemSep NRTL: 59 points of 6 articles, 283-323 K |
| cumene + water | ChemSep NRTL, ChemSep UNIQUAC | partly miscible | two-liquid data, 4 sets of 3 articles, 293-318 K |
| cyclohexane + ethanol | ChemSep NRTL, ChemSep UNIQUAC | miscible | one liquid measured inside the split of ChemSep NRTL: 55 points of 4 articles, 283-313 K; one liquid measured inside the split of ChemSep UNIQUAC: 139 points of 5 articles, 283-333 K |
| cyclohexane + methanol | ChemSep NRTL, ChemSep UNIQUAC | partly miscible | two-liquid data, 4 sets of 3 articles, 278-316 K; one liquid measured inside the split of ChemSep UNIQUAC: 86 points of 1 articles, 321-325 K; one liquid measured inside the split of ChemSep NRTL: 40 points of 1 articles, 321-325 K |
| cyclohexanone + water | ChemSep NRTL, ChemSep UNIQUAC | partly miscible | two-liquid data, 8 sets of 5 articles, 283-323 K |
| diethyl-carbonate + water | refused fit NRTL, refused fit UNIQUAC (Wilson set in PR #200) | partly miscible | two-liquid data, 14 sets of 7 articles, 293-363 K |
| diethyl-ether + water | ChemSep NRTL, ChemSep UNIQUAC | partly miscible | two-liquid data, 1 sets of 1 articles, 293-293 K |
| dimethyl-carbonate + glycerol | refused fit NRTL | partly miscible | two-liquid data, 2 sets of 1 articles, 303-333 K |
| dioxane + water | ChemSep UNIQUAC | not known | none (16 one-liquid sets, none inside the split) |
| ethanol + ethylbenzene | ChemSep UNIQUAC | not known | none (3 one-liquid sets, none inside the split) |
| ethanol + isooctane | ChemSep NRTL, ChemSep UNIQUAC | miscible | one liquid measured inside the split of ChemSep NRTL: 46 points of 7 articles, 288-298 K; one liquid measured inside the split of ChemSep UNIQUAC: 523 points of 9 articles, 288-328 K |
| ethanol + isopentane | ChemSep NRTL, ChemSep UNIQUAC | not known | none (0 one-liquid sets, none inside the split) |
| ethanol + isoprene | ChemSep UNIQUAC | not known | none (0 one-liquid sets, none inside the split) |
| ethanol + n-decane | refused fit NRTL, refused fit UNIQUAC (Wilson set in PR #200) | miscible | one liquid measured inside the split of refused fit NRTL: 133 points of 2 articles, 323-333 K; one liquid measured inside the split of refused fit UNIQUAC: 133 points of 2 articles, 323-333 K |
| ethanol + n-heptane | ChemSep UNIQUAC | miscible | one liquid measured inside the split of ChemSep UNIQUAC: 1204 points of 7 articles, 293-373 K |
| ethanol + n-hexadecane | ChemSep NRTL, ChemSep UNIQUAC | partly miscible | two-liquid data, 2 sets of 1 articles, 294-323 K |
| ethanol + n-hexane | ChemSep NRTL, ChemSep UNIQUAC | miscible | one liquid measured inside the split of ChemSep NRTL: 257 points of 5 articles, 273-313 K; one liquid measured inside the split of ChemSep UNIQUAC: 251 points of 5 articles, 273-313 K |
| ethanol + n-octane | ChemSep UNIQUAC | miscible | one liquid measured inside the split of ChemSep UNIQUAC: 452 points of 5 articles, 273-373 K |
| ethanol + n-pentane | ChemSep NRTL, ChemSep UNIQUAC | not known | none (0 one-liquid sets, none inside the split) |
| ethanol + p-xylene | ChemSep UNIQUAC | not known | none (1 one-liquid sets, none inside the split) |
| ethylbenzene + methanol | ChemSep NRTL, ChemSep UNIQUAC | not known | none (1 one-liquid sets, none inside the split) |
| furfural + water | ChemSep NRTL, ChemSep UNIQUAC, refused fit NRTL, refused fit UNIQUAC | partly miscible | two-liquid data, 16 sets of 11 articles, 288-373 K |
| gvl + water | refused fit NRTL (Wilson set in PR #200) | not known | none (5 one-liquid sets, none inside the split) |
| isoamyl-alcohol + water | ChemSep NRTL | partly miscible | two-liquid data, 7 sets of 4 articles, 288-368 K |
| isobutanol + water | ChemSep NRTL, ChemSep UNIQUAC | partly miscible | two-liquid data, 11 sets of 6 articles, 288-343 K |
| isooctane + methanol | ChemSep NRTL, ChemSep UNIQUAC | partly miscible | two-liquid data, 4 sets of 2 articles, 283-298 K |
| isoprene + methanol | ChemSep NRTL, ChemSep UNIQUAC | not known | none (0 one-liquid sets, none inside the split) |
| m-xylene + methanol | ChemSep NRTL, ChemSep UNIQUAC | miscible | one liquid measured inside the split of ChemSep NRTL: 27 points of 1 articles, 303-323 K; one liquid measured inside the split of ChemSep UNIQUAC: 23 points of 1 articles, 303-323 K |
| methanol + methylcyclohexane | ChemSep NRTL, ChemSep UNIQUAC | partly miscible | two-liquid data, 8 sets of 2 articles, 288-313 K; one liquid measured inside the split of ChemSep UNIQUAC: 12 points of 1 articles, 298-313 K; one liquid measured inside the split of ChemSep NRTL: 6 points of 1 articles, 298-313 K |
| methanol + n-butane | ChemSep NRTL | not known | none (0 one-liquid sets, none inside the split) |
| methanol + n-heptane | ChemSep NRTL, ChemSep UNIQUAC, refused fit NRTL, refused fit UNIQUAC | partly miscible | two-liquid data, 8 sets of 4 articles, 268-318 K |
| methanol + n-hexane | ChemSep NRTL, ChemSep UNIQUAC | partly miscible | two-liquid data, 9 sets of 5 articles, 268-308 K |
| methanol + n-octane | ChemSep NRTL, ChemSep UNIQUAC | not known | none (0 one-liquid sets, none inside the split) |
| methanol + p-xylene | ChemSep NRTL, ChemSep UNIQUAC | miscible | one liquid measured inside the split of ChemSep NRTL: 27 points of 1 articles, 303-323 K; one liquid measured inside the split of ChemSep UNIQUAC: 23 points of 1 articles, 303-323 K |
| methyl-acetate + water | ChemSep UNIQUAC | partly miscible | two-liquid data, 9 sets of 3 articles, 278-343 K |
| methylcyclohexane + phenol | ChemSep NRTL, ChemSep UNIQUAC | not known | none (0 one-liquid sets, none inside the split) |
| n-butyl-acetate + water | ChemSep NRTL, ChemSep UNIQUAC | partly miscible | two-liquid data, 16 sets of 8 articles, 283-398 K |
| n-pentane + water | refused fit NRTL, refused fit UNIQUAC | partly miscible | two-liquid data, 3 sets of 3 articles, 285-464 K |
| o-xylene + sulfolane | refused fit NRTL, refused fit UNIQUAC (Wilson set in PR #200) | not known | none (3 one-liquid sets, none inside the split) |
| phenol + water | ChemSep NRTL, ChemSep UNIQUAC | partly miscible | two-liquid data, 9 sets of 6 articles, 283-333 K |
| pyridine + water | ChemSep NRTL | miscible | one liquid measured inside the split of ChemSep NRTL: 1 points of 1 articles, 297-297 K |
| sulfolane + toluene | ChemSep NRTL | miscible | one liquid measured inside the split of ChemSep NRTL: 4 points of 1 articles, 303-323 K |
| tetrahydrofuran + water | ChemSep NRTL, ChemSep UNIQUAC | miscible | one liquid measured inside the split of ChemSep UNIQUAC: 185 points of 5 articles, 279-333 K; one liquid measured inside the split of ChemSep NRTL: 100 points of 4 articles, 279-333 K |

Reading the table: "one liquid measured inside the split" means one-liquid points that lie inside the composition
range the set predicts as two liquids at that temperature (by more than 0.01 on each side). It contradicts that set
there, not the pair's behaviour at other temperatures. A pair classed "partly miscible" may still have a set whose
split is in the wrong place; the joint fit is what checks it.

What the survey shows (57 pairs: 22 partly miscible, 17 miscible, 18 not known):

- **The refused fits are mostly real splits.** Of the ten generated fits refused for a predicted split, six are pairs
  with open liquid-liquid data: 1-butanol + water, furfural + water, methanol + n-heptane, diethyl carbonate + water,
  dimethyl carbonate + glycerol and n-pentane + water. The rule refused them although the mixture splits.
  (n-pentane + water: the liquid-liquid data reach 464 K, the refused VLE data are at 565-637 K.)
- **One refused fit is contradicted by data:** ethanol + n-decane, measured as one liquid inside the predicted split
  at 323-333 K (Zamora-Lopez et al. 2012, doi 10.1016/j.jct.2012.06.012; Nourozieh et al. 2013,
  doi 10.1016/j.jct.2012.11.017). The refusal was right there, and its Wilson fit can stay.
- **Three are not known by the survey's rule**: 2-propanol + glycerol, GVL + water and o-xylene + sulfolane. Each was
  measured as one liquid over the whole composition range, but only 20-50 K below the temperature of the refused fit:
  2-propanol + glycerol, densities at 298-333 K (Li et al. 2007) against the fit at 353 K; GVL + water, excess
  enthalpies at 303-323 K, x from 0.002 to 0.903 (Zaitseva et al. 2016) and refractive indices at 293-298 K (Havasi et
  al. 2016) against the fit at 350 K; o-xylene + sulfolane, densities and viscosities at 303-323 K (Yang et al. 2004)
  against the fit at 333 K. A liquid that is one phase at a lower temperature stays one phase on heating unless the
  pair has a lower critical solution temperature, and no open data show one for these pairs. By answer 3 they are
  "miscible below the measured temperature, not known above it", and their fits are kept with a label. The batch-3 decision of 2026-10-14 already called GVL
  + water "fully miscible", without naming a source.
- **The five Wilson pairs of PR #200:** diethyl carbonate + water is partly miscible (14 two-liquid sets of 7 articles,
  293-363 K): its Wilson fit should be refused by section 4. Ethanol + n-decane is miscible: keep it. 2-propanol +
  glycerol, GVL + water and o-xylene + sulfolane: keep them with a label (answer 4).
- **ChemSep sets predict splits that measurements contradict in 17 pairs.** Examples: 1-propanol + water (UNIQUAC; 264
  one-liquid points of 8 articles inside its split, 282-362 K), acetonitrile + water (UNIQUAC), tetrahydrofuran + water
  (NRTL and UNIQUAC), ethanol + n-hexane, n-heptane, n-octane and isooctane (UNIQUAC, NRTL), 1,4-butanediol + water
  (NRTL). These sets are imported "as they are" (DATA_RULES section 1) and stay, but today nothing tells the user that
  their split is contradicted by open data.
- **Partly miscible pairs whose ChemSep split is in the wrong place:** 1-butanol + water, cyclohexane + methanol and
  methanol + methylcyclohexane have one-liquid points inside the ChemSep split (1-butanol + water: water-rich
  liquids at 283-315 K, where ChemSep's NRTL set predicts too little 1-butanol in the aqueous liquid). These are the
  pairs where a joint fit matters most.

### Other simulators (docs/METHOD_SELECTION.md, "When in doubt"; read 2026-11-05)

| Simulator | What its open documentation says |
|---|---|
| DWSIM, NRTL property package (DWSIM API Reference, https://dwsim.org/help/api/property-packages/nrtl.html, generated with DWSIM 10.2.11.0, 2026-10-08) | "Unlike the Wilson equation it describes partially miscible liquids, so the same parameters give vapor-liquid and liquid-liquid equilibrium." "Parameters regressed from vapor-liquid data may predict a liquid-liquid split poorly, or miss it." "Estimated (UNIFAC) parameters are a fallback; for design work fit the pair to measured data with the Data Regression utility." |
| DWSIM, UNIQUAC property package (https://dwsim.org/help/api/property-packages/uniquac.html, same version) | "The parameters can be edited in the package editor, fitted to VLE or LLE data with the Data Regression utility". "Parameters fitted to vapor-liquid data reproduce bubble points and vapor compositions, and may misplace the mutual solubilities of a liquid-liquid split." "Fit the pair to LLE data when the liquid compositions matter." Its example: "60 mol% water lies inside the miscibility gap: at its bubble point two liquids boil together with one vapor (vapor-liquid-liquid equilibrium)". |
| DWSIM, Data Regression Utility (https://dwsim.org/wiki/index.php?title=Using_the_Data_Regression_Utility) | Data sets "LLE Temperature and mole fractions (Txx)", "LLE Pressure and mole fractions (Pxx)", "LLE Temperature, Pressure and mole fractions (TPxx)" next to the VLE ones; "Currently, only the Least Squares obj. function is available"; "the calculated interaction parameters are not copied to the BIP databases". DWSIM's package list also has a separate "UNIFAC_LL UNIFAC for LLE" (Property Packages Guide, https://dwsim.org/tutorials/en/reference/property-packages-guide.html). |
| ChemSep (The ChemSep Book, 2nd ed., Kooijman and Taylor, public domain, http://www.chemsep.org/book/docs/book2.pdf) | p. 98, the extraction example: "The UNIQUAC model is used for the activity coefficients in the extractor; parameters for this model are given in Table 3.1", "Table 3.1: UNIQUAC LLE interaction parameters (K)", one set at 25 °C and one at 50 °C. p. 96: "at not too high temperature, the liquid mixture splits into two liquid phases ... We can use a decanter to separate the two liquid phases" (water + n-butanol). p. 183: NRTL, "Unlike the original Wilson equation it may also be used for liquid-liquid equilibrium calculations." |
| DDBST Regression Mix (manual, free to read, https://www.ddbst.com/files/files/ddbsp/2026/Documentation/RegressionMix.pdf) | p. 3: "a regression tool that allows the user to fit binary interaction parameters to different phase equilibrium data and some excess properties simultaneously". p. 15: "The LLE objection [sic] function can minimize the difference in the activities of the two phases (the goal is isoactivity) or by meeting the experimental liquid compositions with the additional option of obtaining the right gap width." "The isoactivity criterion also works when the fitted parameters show no miscibility gap." "The other three properties can be used with information from a single phase only but they need starting values which already estimate a miscibility gap." |

What they do, and where CHEPTA differs:

- **None of them refuses a set because it predicts a split.** DWSIM keeps the VLE-fitted set, warns in its
  documentation that its split may be misplaced, and tells the user to fit to LLE data when the liquid compositions
  matter. CHEPTA refuses today; this proposal keeps a predicted split and labels it, which is closer to DWSIM, but it
  still refuses a split where open data show one liquid, because CHEPTA states the evidence behind every number
  (AGENTS.md).
- **Partly miscible pairs are fitted to both kinds of data** (DDBST, simultaneous regression, LLE by isoactivity or by
  the compositions) **or given separate LLE parameters** (ChemSep's extraction example, DWSIM's UNIFAC-LLE). CHEPTA's
  choice is one joint set per pair, so that a column with a decanter uses one set for both equilibria; separate LLE
  sets remain possible as further, non-default sets (as the ternary sets of `fit_ternary_lle.py` are).
- **Gates on the mutual solubilities:** none of the documents gives numbers. The limits above (0.02 and 25 %) are this
  project's choice, set against the stated uncertainties of typical solubility data; they are for the maintainer to
  confirm.

### Validation (steps 2 to 4)

- The class of each pair against the ThermoML records it names (a person, AGENTS.md rule 4).
- The joint fits: the engine's two liquids (`splitLL`) against the Python reference's own split
  (`fit_parameters.py`, `phase_splits` and the isoactivity solve, independent of the engine) at every measured
  temperature, within 1e-4 in mole fraction; and against the measured tie lines within the gates above.
- The bubble temperatures and vapour compositions against the VLE data, within the section 5 gates, as now.
- One open worked example per class where one exists: 1-butanol + water (partly miscible, the ChemSep Book's decanter
  example), a miscible pair whose ChemSep set splits (survey above), and a not-known pair with its label.

## Effect on existing work

- **For users:** pairs that really split get a fitted set, and two liquids where the data show them; Wilson results
  for miscible and not-known pairs; a sentence on every two-liquid result that says whether the split was measured,
  predicted only, or contradicted by measurements. No calculation that works today is refused, except Wilson inside a
  measured split, where its one-liquid answer is wrong.
- **Data:** a new field `two_liquids` on pair records; `classes.json`; "phase-split" known issues for the labelled
  sets. Existing sets are not changed by this step; the refit batch (step 3) writes new sets, with the old ones kept
  as alternatives.
- **Tests:** none changed in this step. Step 3 adds tests; tests that count sets or known issues change with it, as
  DATA_RULES section 9 allows, and say why.
- **PR #200:** its commit "Two liquids in the VLE data" (two-liquid rows of ThermoML vapour-liquid records, fitted by
  isoactivity) is the start of the joint fit and is kept; its Wilson rule becomes the one of section 4.

## Alternatives considered

- **Keep the rule and refuse every predicted split:** safe against spurious splits, but it refuses the mixtures that
  matter most for decanters and extraction, and the maintainer asked for it to change.
- **Keep every predicted split with no class:** what DWSIM does. The user then cannot tell a measured split from a
  spurious one; CHEPTA's rule is to say what stands behind a result.
- **Separate LLE parameter sets only** (ChemSep's extraction example): two sets for one pair make a column with a
  decanter inconsistent (the stage and the decanter would see different liquids). Kept possible as further sets.
- **Class from a predictive model (Modified UNIFAC 2.0) where no data exist:** a prediction is not evidence; it may be
  shown next to a not-known pair as a hint, labelled predicted, but it does not set the class.

## Steps

1. **This pull request:** the proposal, `two_liquid_survey.py` and its output `survey.json`, the decision file.
2. **Classes and labels:** `classes.json` from the survey after a person's check; `chemsep_pairs.py` and
   `fit_parameters.py` write the `two_liquids` field and the "phase-split" known issues; the engine's warnings with the
   new code; tests of the warnings (engine against the class file).
3. **Fitting by class:** `vle_batch.py` gathers the liquid-liquid sets of the ThermoML Archive with the vapour-liquid
   ones for partly miscible pairs (as PR #200 started for two-liquid rows); `fit_parameters.py` replaces
   `check_phase_splits` by the class rules and the solubility gates. The refit batch: every pair of the table above,
   NRTL and UNIQUAC, and the Wilson fits by section 4. Tests: the engine's split against the Python reference, the
   fits against the open tie lines and VLE data, at the gates.
4. **Wilson by class:** the refusal inside a measured split, the warning text by class, `test/wilson.test.js`.
5. **DATA_RULES.md section 5** reworded as in section 5 above, in the pull request of step 3, with its decision file.
