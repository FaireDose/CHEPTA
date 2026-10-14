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
