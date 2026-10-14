# 2026-10-13: batch 3 of proposal 0009, first part (3a)

- **Asked:** the next batch, after the maintainer decided "do A" (NRTL without UNIQUAC r and q, its own pull request)
  and to wait for the DDBST answer on the UNIFAC tables (B). None of the 23 molecules of batch 3 is in ChemSep or
  CoolProp, so all are built from measured data (`measured_components.py`).
- **Split:** first the molecules that have measured critical constants. The others need the "no critical constants"
  path of proposal 0009 (activity models only), which the engine does not have yet.
- **Done (4 components):** furan, 2-methylfuran, 2-methyltetrahydrofuran (Tc and Pc: Kobe et al. 1956 and Cheng et
  al. 1962, WebBook), 1,3-propanediol (Tc and Pc: Nikitin et al. 2014, ThermoML Archive).
- **New in the script, each a rule stated in the record it affects:**
  - vapour pressures: where the sets disagree beyond their stated uncertainties, every value fitted within its own
    uncertainty (2-methylfuran: Tai et al. 2014 left out, up to 6 % from the two other sets; 1,3-propanediol: all sets
    state 6-31 %, so the record is good to 8 % only), or values above the 1 % target kept as confirmation;
  - enthalpy of vaporization: where the measured values give no temperature dependence, the Clapeyron equation with
    the vapour-pressure record (Peng-Robinson volumes, up to 500 kPa), fitted together with the calorimetric values,
    which it must meet within their uncertainty (1,3-propanediol: Knauth and Sabbah 1988, 72.4 kJ/mol at 298 K);
  - ideal-gas heat capacity from the WebBook gas heat-capacity tables (furan, 2-methylfuran).
- **Held back, with the data that would complete them:**
  - gamma-butyrolactone: open vapour pressures start at 377 K and densities end at 353 K, so no liquid state has
    both. Wanted: vapour pressures below 377 K (Pokorny et al., J. Chem. Eng. Data 2017, measured 238-363 K, but its
    ThermoML record does not contain GBL) or densities above 353 K.
  - isoamyl alcohol: vapour pressures start at 335.85 K, densities end at 332.7 K. Its sets also disagree by up to
    3 %; the script anchors the fit on Censky et al. 2010 (0.14-0.21 %).
- **Found while doing this:** the ThermoML-API name search found every archive record with the properties the
  records use (checked against an InChI scan of the whole bulk archive for these six molecules).
- **Asked during this work, next after 3a:**
  - Modified UNIFAC 2.0 (Hayer, Hasse and Jirasek, Ind. Eng. Chem. Res. 64 (2025) 10304; arXiv 2412.12962): its
    parameter files are CC BY 4.0 (the arXiv record; the author confirmed it to the maintainer by e-mail). To be added
    as a predicted tier before the last batch. UNIFAC does not replace the search of the open literature and databases
    for each component.
  - Workbench and flowsheet: every component selectable in every sheet; an error only when the chosen thermodynamic
    model cannot use a component; the model chosen with a list (activity model or equation of state), and for an
    activity model a second list for the vapour phase, ideal vapour by default.
