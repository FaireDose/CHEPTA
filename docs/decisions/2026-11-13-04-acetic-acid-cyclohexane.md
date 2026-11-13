# 2026-11-13-04: Acetic acid + cyclohexane, a pair fitted to open data: held, no open data meet the criteria

The task (the coordinator, 2026-11-13): follow-up (a) of docs/decisions/2026-11-12-02-acid-chemical-theory-vlle.md:
fit an acetic acid + cyclohexane pair to open mixture data, jointly to vapour-liquid and liquid-liquid data
(DATA_RULES.md section 5, "Two liquids"), with the chemical theory for the acid's vapour, so that the measured VLLE of
Liu et al. 2013 tests a fitted model. The instruction: if no open data meet the fit criteria, stop and report "no
open data" with what was searched; do not fit anything weaker without the maintainer.

**Result: nothing was fitted, no data file and no parameter was added.** The only open binary vapour-liquid set fails
the rules' point test and has no pure-component rows, and no open binary liquid-liquid data were found.

## To decide (the maintainer), with a recommendation each

1. **Fit the one open set anyway, with a quality warning?** Yang et al. 2010 (below) is the only open binary
   vapour-liquid set of the pair. Its point test is mean |dy| 0.0118 (the limit is 0.01, `vle_batch.choose`), and it
   has no rows at x = 0 or 1, so the rule "pure-component boiling points within 1 K of the vapour-pressure records"
   cannot be checked. Recommended: **yes**, as a fit to this set alone, class "not known" (no open liquid-liquid data:
   the set says "two liquids predicted, not checked against liquid-liquid data" where the fit splits), written with a
   "fit-quality" known issue that names the point-test value, with the vapour treated by the chemical theory like the
   other acetic acid pairs; the pair is then used for the Liu 2013 test as the task asked. The test would state the
   deviations honestly; it is then a test of a model fitted to one set at 101.3 kPa, not of a joint fit. Reason: it is
   the only open set, and the miss of the limit is small; the maintainer's rule (DATA_RULES section 3, "A small stated
   uncertainty is the authors' claim") treats a single set as the evidence there is.
2. **Fit the ternary liquid-liquid data of water + cyclohexane + acetic acid** (the record is
   `10.1021/je400704a`, "Liquid Liquid Equilibrium for Ternary System Water + Cyclohexane + Acetic Acid at (303.2 to ...) K", in the ThermoML Archive) to constrain the acid's pairs jointly? It would give the tie lines the pair needs, but
   it is a ternary fit with three pairs at once (water + acetic acid and water + cyclohexane already have sets), a
   method CHEPTA has for the ethyl acetate ternary only (`fit_ternary_lle.py`, `fitted-lle-roque2018`). Recommended:
   **later**, after 1; it needs the authors of that record named and read, and a decision on whether Liu 2013 (also
   a ternary) may then test it, since both are the same ternary.
3. **Keep the open item** in DECISIONS.md as "held for a decision", not closed. Recommended: yes.

## What was searched (2026-11-13)

All in the order of DATA_RULES.md section 1, "How to search for a missing number" (the pair had no note in
`components.json`: it is a missing pair, not a missing property):

- **The ThermoML Archive's whole bulk file** (ThermoML.v2020-09-30.tgz, doi 10.18434/mds2-2422, 23 846 records), read
  record by record for any data set that names acetic acid and cyclohexane together:
  - `10.1021/je900669t` (Yang, Zhu, Wu, Chen, Ye, J. Chem. Eng. Data 55 (2010) 1527-1531): isobaric VLE at 101.3 kPa,
    sets 12 (T-x) and 13 (T-x-y), 14 points, x_1 from 0.0258 to 0.9801. **The only binary vapour-liquid set.**
    `vle_batch.py --pairs acetic-acid+cyclohexane` reports: "not fitted: 1 isobaric T-x-y sets, none passes the
    consistency point test (best mean |dy| 0.012)" (0.01176); the T-x set cannot be used by rule 4 because it has
    no pure-component rows to compare with the records;
  - `10.1016/j.jct.2017.07.035`: a binary one-liquid property set (not vapour-liquid, not liquid-liquid; at most
    evidence that the pair is one liquid at its temperature, for the class);
  - ternaries, not binary data: `10.1016/j.fluid.2013.04.011` (Liu 2013, the test set, never a fit input),
    `10.1021/je400704a` (ternary liquid-liquid, water + cyclohexane + acetic acid), `10.1021/je301202v` and
    `10.1021/je500231c` (solubility of adipic and succinic acid in acetic acid + cyclohexane mixtures: solid-liquid);
  - the archive's search interface (trc.nist.gov/ThermoML/search.html) answered 404 today, so the bulk file was used.
- **Open-access articles and repositories** (OpenAlex, three queries: binary liquid-liquid equilibrium and mutual
  solubility; isothermal vapour-liquid; vapour-liquid in theses): no work with measured binary data of the pair that
  is open and that the archive lacks. The hits were other systems (sulfolane + carboxylic acids, acetic acid +
  acrylic acid, the water + acetic acid systems, ionic liquids).
- Not searched: free books (the pair's classical data, for example the old Landolt-Börnstein and Chu/Wehe-type
  compilations, are not open); the NIST WebBook and CoolProp hold no mixture data; ChemSep has no acetic acid +
  cyclohexane pair set (`validation/data/two_liquids/survey.json` lists none for it).
- The pair's class (`classes.json`) is not yet recorded: no set was fitted, so `two_liquid_survey.py --classes` has
  no entry for it. With the data found: no two-liquid set of the pair in the archive, so "not known".

## To check against the sources (the maintainer)

Nothing was transcribed into the repository. Two statements to check:

1. Yang et al. 2010, ThermoML record `10.1021/je900669t`, sets 12 and 13: 14 rows, x_1 0.0258-0.9801, T 351.95-380.45 K,
   no pure-component rows; the point-test value 0.01176 is computed by `fit_parameters.point_test` from them
   (https://trc.nist.gov/ThermoML/10.1021/je900669t.html).
2. That the archive holds no binary liquid-liquid or vapour-liquid-liquid set of the pair: records listed above.

## Limits

- The article's own consistency test (its abstract: "Thermodynamic consistency was tested for all of the VLE data")
  and its correlations (Wilson, NRTL, UNIQUAC with Hayden-O'Connell) are the authors'; the paywalled article was not
  read, and its fitted parameters are not used (DATA_RULES section 1).
- No engine file was touched.
