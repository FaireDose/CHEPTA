# 2026-11-13-04: Acetic acid + cyclohexane, a pair fitted to the one open set (decided 2026-11-13), tested against Liu et al. 2013

The task (the coordinator, 2026-11-13): follow-up (a) of docs/decisions/2026-11-12-02-acid-chemical-theory-vlle.md:
fit an acetic acid + cyclohexane pair to open mixture data, jointly to vapour-liquid and liquid-liquid data
(DATA_RULES.md section 5, "Two liquids"), with the chemical theory for the acid's vapour, so that the measured VLLE of
Liu et al. 2013 tests a fitted model. The instruction: if no open data meet the fit criteria, stop and report "no
open data" with what was searched; do not fit anything weaker without the maintainer.

**First result (before the decision): nothing was fitted.** The only open binary vapour-liquid set fails the rules'
point test and has no pure-component rows, and no open binary liquid-liquid data were found. The maintainer then
decided (2026-11-13, "ok with recommendations"): question 1 as recommended, so the set was fitted; see "What was done
after the decision" below.

## What was done after the decision

- `vle_batch.py` has a `WAIVED` entry for the pair (the set's DOI), so the set is taken although it fails the point test and
  has no pure rows; the data file `validation/data/vle/acetic-acid_cyclohexane_10-1021-je900669t_101.3kPa.json` says so in
  its notes.
- **The class** (`two_liquid_survey.py --classes`, the archive's bulk file): "miscible below the measured temperature,
  not known above it": one binary one-liquid density set, Meghelli et al. 2019 (`10.1016/j.jct.2017.07.035`, 88 points,
  288.15-343.15 K, 100 kPa, whole composition range); no two-liquid set. Only this pair's entry was kept in
  `classes.json` (the survey run also changed another pair, belabbaci2012, a drift not part of this work, left out).
- **Fit** (`fit_parameters.py --only acetic-acid+cyclohexane --write`; the vapour by the chemical theory of acetic acid, as
  every acetic acid pair of the engine): NRTL, alpha 0.47, b_ij 576.99 K, b_ji 546.98 K, AAD 0.42 K in T, 0.0154 in y (max
  2.02 K, 0.0286): outside the main limits (0.5 K, 0.012), within the wider ones, so written with a quality warning and a
  "fit-quality" known issue. **Wilson** (b_ij -793.35 K, b_ji -343.84 K, a_ij 0.636; 0.42 K, 0.0148 in y) written the same
  way. **UNIQUAC rejected**: 0.89 K and 0.0246 in y, outside the wider limits. Set `fitted-yang2010`, tier fitted.
- **Liu et al. 2013 as the independent test** (`test/vlle-acid.test.js`, new test; Liu is not in the fit; NRTL with the
  default sets of the three pairs; the feeds, bubble point at 101.3 kPa, as the Modified UNIFAC 2.0 test): vapour + two
  liquids at all 13 points with acid; the three-phase temperature 0.15 to 1.85 K above the measured (mean 0.94 K; Modified
  UNIFAC 2.0: 4.28 K); without the dimers -0.57 to +0.94 K (mean 0.36 K); the incipient vapour within 0.049 in mole fraction
  (Modified UNIFAC 2.0: 0.040; without the dimers 0.082). So the temperature is much closer, the vapour composition is not
  better. Not tuned; the figures are asserted as they came out. The old Modified UNIFAC 2.0 test stays (decided).
- Run: `make_sources.py`, `make_fixtures.py` (no fixture changed), `npm run wanted`, `npm run vle-points`, `npm run build`,
  `npm test` (1664 pass, 0 fail). No engine file was touched.

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

1. The 14 rows of `validation/data/vle/acetic-acid_cyclohexane_10-1021-je900669t_101.3kPa.json` (columns x_1, T_K, y_1)
   against Yang et al. 2010 in the ThermoML record sets 12 and 13 (https://trc.nist.gov/ThermoML/10.1021/je900669t.html).
2. The 14 rows of the Liu 2013 file used by the new test were already on the list of decision 2026-11-12-02.
3. The class entry: Meghelli et al. 2019, `10.1016/j.jct.2017.07.035`, set 8: 88 points, 288.15-343.15 K, 100 kPa.
4. Statements of the search:

   - Yang et al. 2010, ThermoML record `10.1021/je900669t`, sets 12 and 13: 14 rows, x_1 0.0258-0.9801, T 351.95-380.45 K,
   no pure-component rows; the point-test value 0.01176 is computed by `fit_parameters.point_test` from them
   (https://trc.nist.gov/ThermoML/10.1021/je900669t.html).
   - That the archive holds no binary liquid-liquid or vapour-liquid-liquid set of the pair: records listed above.

## Limits

- The article's own consistency test (its abstract: "Thermodynamic consistency was tested for all of the VLE data")
  and its correlations (Wilson, NRTL, UNIQUAC with Hayden-O'Connell) are the authors'; the paywalled article was not
  read, and its fitted parameters are not used (DATA_RULES section 1).
- No engine file was touched.

## Decided (the maintainer, 2026-11-13)

All three as recommended: 1, fit the set with a quality warning (done above); 2, the ternary liquid-liquid fit later; 3, the
DECISIONS.md item stays open for that and for the better data that would replace the set.
