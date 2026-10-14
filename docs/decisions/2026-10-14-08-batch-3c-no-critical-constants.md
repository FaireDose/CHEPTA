# 2026-10-14: batch 3 of proposal 0009, third part (3c): components without measured critical constants

- **Asked:** start with gamma-valerolactone (GVL); then do every step for the remaining batch 3 molecules, and those
  without critical constants the same way as GVL; implement the point of proposal 0009 for such components ("used with
  activity models, refused by Peng-Robinson and SRK, which say so instead of estimating Tc and Pc"); and a document
  that says clearly how data are taken, for people and AI agents.
- **Engine (`src/thermo/critical.js`):** a component with no measured Tc and Pc in any open source has none (not
  estimated). Activity models with an ideal-gas vapour use it; Peng-Robinson and SRK, for both phases or as the
  vapour of an activity model, refuse it and name the sources searched; its pure vapour is an ideal gas; its records'
  own ranges bound it. The interface shows "no open data" for Tc, Pc and the acentric factor.
- **Data script:** for such a component the vapour-pressure curve covers the measured range only; density and
  surface tension are polynomials in T; the Clapeyron enthalpy of vaporization uses an ideal-gas vapour up to 10 kPa;
  boiling temperatures measured at a stated pressure (the pure end of an isobaric set) are read as vapour pressures.
- **Added (4):** GVL (six vapour-pressure sets, pooled; boiling point 478.90 K, Pokki 2018 met within 0.1 %;
  calorimetric enthalpy of vaporization of Leitao 1990); cyclopentyl methyl ether (four sets, pooled; 378.47 K);
  tetrahydrofurfuryl alcohol (one set, Lomba 2014, to 448 K and 97.9 kPa: no normal boiling point, `Tb_note`; the
  WebBook value of Moshkin 1955, 451.0 K, would make the curve miss Lomba's values near 448 K by 2-3.7 %, so it is not
  used); 2,3-butanediol (the Antoine equation of Stull 1947, a compilation, is the only open vapour-pressure source;
  at the measured boiling temperature 454.21 K of Wu 2007-2008 the record gives 4.9 % below 101.325 kPa, stated in the
  record; no normal boiling point).
- **Held, with the reason in `measured_components.py`:**
  - furfuryl alcohol: two sets 4-7 % apart (Tai 2014, Negadi 2014); both reach the measured boiling temperatures, so
    no independent check singles out one;
  - methyl lactate (Lomba 2014: 2.96 % against its stated 2.59 %), ethyl lactate (Resa 2010: 1.94 % against 1.70 %)
    and limonene (Wu 2019: 1.83 % against 1.62 %): the sets miss the pooling rule narrowly, by one set each;
  - no open measured vapour pressure: 5-hydroxymethylfurfural, lactic acid, lactide, solketal, alpha-angelica lactone
    (densities only, or mixture data only; supplier sheets are not measurements).
- **Modified UNIFAC 2.0 for water + GVL:** the measured bubble temperatures of Havasi et al. 2016 (ThermoML Archive,
  `validation/data/water_gvl_tx_havasi2016.json`) are on average 3.0, 7.3 and 6.9 K above the prediction at 101.3,
  50.6 and 10.1 kPa, and the prediction splits liquids of 40-80 % water into two phases. The maintainer: the parameters
  stay as published; the user compares NRTL, UNIQUAC, Modified UNIFAC 2.0 and the ideal solution and decides. The
  deviation is shown as a "predicted-deviation" known issue.
- **Modified UNIFAC 2.0 groups for a person to choose:** tetrahydrofurfuryl alcohol (the structure-based and DDBST
  assignments differ), as for 2-methyltetrahydrofuran and gamma-butyrolactone.
- **The data rules:** [docs/DATA_RULES.md](../DATA_RULES.md), linked from AGENTS.md and the docs index, gathers the
  rules for taking, fitting and checking data that were spread over AGENTS.md, the standing rules, the proposals and
  the scripts.
- **The method of a non-open article** (read by the maintainer to understand pooling) is not cited or used in the
  repository.
- **Where to look, in order (the maintainer, 2026-10-14):** AGENTS.md rule 1 now opens with the order of sources and
  points to [docs/DATA_RULES.md](../DATA_RULES.md). Putting the ThermoML Archive before ChemSep was considered and
  turned down: the order stays standards, CoolProp, NIST WebBook, ChemSep and the open libraries, then the ThermoML
  Archive and open articles. The maintainer: "if the information exists in ChemSep, do not compare further, we trust
  the database; someone else is taking care of it. If there is no information, go to ThermoML." So a ChemSep record is
  taken as it is, with no new comparison with measured data or refit; the records refitted before (glycerol, phenol,
  N-methyl-2-pyrrolidone and others) stay as they are for now. CLAUDE.md now also loads docs/DATA_RULES.md, so Claude
  Code reads the data rules in every session; other agents reach them from AGENTS.md.
- **What to take from where (the maintainer, 2026-10-14):** "take the numbers you know there are in ChemSep and not
  in ThermoML. Do not take something that you have to compare. For example if VLE data is in ThermoML take it from
  there directly. If other properties are in ChemSep take them from there." AGENTS.md rule 1 and docs/DATA_RULES.md
  section 1 now say: pure-component properties from ChemSep as they are; mixture data (VLE, azeotropes, excess
  enthalpies, liquid-liquid data) from the ThermoML Archive and open articles directly; the ThermoML Archive for pure
  components only for what ChemSep does not have. The maintainer assumes ChemSep's correlations were themselves
  fitted to such literature data, which is why they work.
- **Lean: the comparison of ChemSep records with measured data removed (the maintainer, 2026-10-14):** "I want
  something lean so if we spend some time now to clean is no problem." Removed: `validation/python/check_measured.py`,
  `test/measured-checks.test.js`, the "Records against measured data" group of the engineering report
  (`make_measured_cases.py`, its references and code in `scripts/engineering-report.mjs`), `docs/MEASURED_CHECKS.md`,
  and the `measuredCheck` texts of the records. Kept: the records refitted before (`MEASURED_REFIT`), and the
  ThermoML values in `validation/data/pure/measured/thermoml_<id>.json`, which the refits, the melting data
  (`fusion_data.py`) and `gap_report.py` read (`gap_report.py --fetch` now downloads them). The report-coverage test
  no longer asks for a case for components taken from ChemSep as they are.
- **Narrow misses accepted (the maintainer, 2026-10-14):** methyl lactate (Lomba 2014, 2.96 % against its stated
  2.59 %), ethyl lactate (Resa 2010, 1.94 % against 1.70 %) and limonene (Wu 2019, 1.83 % against 1.62 %) are pooled
  (`vp_accept` in `measured_components.py`: the build stops if the miss grows beyond the accepted value). Methyl lactate
  and limonene have no normal boiling point: their records end at 413.15 K (92.2 kPa) and 450.00 K (100.8 kPa).
- **Furfuryl alcohol (the maintainer, 2026-10-14):** first "choose the one with more citations" (Crossref,
  2026-10-14: Tai 2014, 19; Negadi 2014, 15), then, told that Tai 2014 has three values at 353-408 K against Negadi's
  27 at 273-412 K: "the 36 points are better also the range is better. keep this" (the archive lists 36 entries, 9 of
  them twice). Negadi 2014 is used and Tai 2014 left out with that reason. No normal boiling point: the record ends at
  412 K.
- **Modified UNIFAC 2.0 groups without asking (the maintainer, 2026-10-14):** "it is just a prediction tool ... at
  least you have something you can work with in case we do not have data". Groups added: 2-methyltetrahydrofuran and
  tetrahydrofurfuryl alcohol (DDBST's assignment, one H over in the atom balance), propylene carbonate (CH3 +
  (CH2)2CB; the SMARTS match had taken a nitrogen subgroup), ethylene carbonate ((CH2)2CB), Cyrene (from the structure).
  The method has no subgroup for a furan ring, an anhydride or the small gases, so furan, 2-methylfuran, furfuryl
  alcohol, maleic anhydride and the gases still have none.
- **Pairs (the maintainer, 2026-10-14, "I go with your suggestion"):** where a pair has a set fitted to measured
  mixture data, that set is the default and the ChemSep set stays as an alternative; ChemSep is the default only
  where no measured mixture data were fitted. The data already followed this; `test/library.test.js` now checks it.
