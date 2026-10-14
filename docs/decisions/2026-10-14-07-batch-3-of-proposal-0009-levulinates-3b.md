# 2026-10-14: batch 3 of proposal 0009, second part (3b): the levulinates

- **Asked:** "both in order": first the refits that the larger engineering report showed (the measured-data review,
  its own pull request), then batch 3b.
- **Done (6 components):** levulinic acid, gamma-butyrolactone and isoamyl alcohol (each with a gap, below) and
  methyl, ethyl and butyl levulinate, from measured data alone (`measured_components.py`).
  Their critical constants come from Nikitin et al., J. Chem. Thermodyn. 2019 (doi:10.1016/j.jct.2019.03.040),
  ThermoML Archive, the only measurement. Their Modified UNIFAC 2.0 groups are the structure-based ones, the same as
  DDBST's published ones (CH3, CH2, CH3CO, CH2COO).
- **The rule for vapour pressures (the maintainer's decision, 2026-10-14).** The maintainer pointed out that a small
  stated uncertainty is the authors' own claim, not proof that a set is right: another laboratory may have measured
  better and stated more. So no set is preferred for its stated uncertainty:
  1. all the measured sets are fitted together, each article with the same total weight (a set with 28 points does not
     outweigh one with 3); within a set, each value is weighted by its stated uncertainty, with a floor of 0.5 %
     (1 % where none is stated);
  2. the curve is judged by independent evidence, not fitted: the measured normal boiling temperatures of other
     articles, the WebBook average of the measured boiling points, and the calorimetric enthalpies of vaporization
     through the slope (Clapeyron); the record states each check;
  3. a whole set is left out, or one paper preferred, only with a stated physical reason (`vp_exclude`); a single
     value only when the fit misses it by more than three times its uncertainty.
  Why: isoamyl alcohol, until then anchored on Censky et al. 2010 for their smallest stated uncertainty (0.14-0.21 %).
  The fit of all twelve sets gives a boiling point of 404.43 K against the measured median of 404.48 K (6 articles;
  Censky alone: 404.67 K) and a slope within 1.4 % of the calorimetric enthalpies of vaporization (Censky alone: 0.4-2.6 %
  low); Censky et al. lie about 1 % below the other sets.
  Applied (`vp_fit: "consensus"` in `measured_components.py`) to furan, 2-methyltetrahydrofuran, 1,3-propanediol (all
  already on main) and the six components of this pull request:
  - furan: boiling point 304.56 -> 304.50 K (WebBook average 304.7 +/- 0.6 K), no value left out;
  - 2-methyltetrahydrofuran: 352.91 -> 352.97 K; the record now starts at 279 K (the values of Lepori et al. 2017 are
    fitted, no longer only confirmation); none left out (10 before);
  - 1,3-propanediol: 487.71 -> 487.07 K (WebBook average 487 +/- 3 K); none left out (9 before); the sets still differ
    by up to 9 %, so the record is good to about that;
  - 2-methylfuran **not changed**: its three sets disagree with each other (Tai et al. 2014 and Liebergesell et al. 2015
    overlap at 353-409 K and differ by up to 5 %; Lomba et al. 2015 cover 285-337 K); the fit of all three leaves out a
    third of the values, so it needs a stated reason to prefer a set, an open item; its record (Tai et al. left out)
    stays as merged.
  Dichloromethane and 2-methoxyethanol (built earlier with chosen WebBook sets) are not changed here.
- **Vapour pressures, the choice for each component** (stated in its record):
  - methyl levulinate: Lomba et al. 2013 (333-453 K, 0.2-2.7 %) and Emel'yanenko et al. 2018 (transpiration,
    294-353 K, 6 %), fitted together under the rule: none left out; the fit lies 0.4 % above Lomba et al. and 4.6 %
    below Emel'yanenko et al. on average (within their 6 %); the record starts at 294 K; boiling point 470.24 K
    (WebBook, a compilation: 469.2 K). (Before the rule, only Lomba et al. were fitted and the record started at 333 K.)
  - ethyl levulinate: Emel'yanenko et al. 2018 (294-349 K, 6 %) and Bo et al., Energies 18 (2025) 3939 (open access,
    CC BY 4.0; the paper the maintainer downloaded, since MDPI refuses the assistant's container): the pure ethyl
    levulinate end points of their isobaric sets, 445.93 K at 40.0 kPa, 459.64 K at 60.0 kPa, 470.00 K at 80.0 kPa
    (Table 2), and 478.88 K at 101.3 kPa (Table 1), in `validation/data/pure/measured/article_ethyl-levulinate_bo2025.json`.
    Fitted together under the rule, none left out: on average the fit lies 0.85 % below Emel'yanenko et al. and 0.01 %
    from Bo et al.; the record's boiling point is 478.93 K.
  - butyl levulinate: the only measured vapour pressures are Emel'yanenko et al. 2018 (298-348 K, 6-7 %). The curve
    also goes through the WebBook normal boiling temperature (Weast and Grasselli 1989, a compilation: 510.7 K) and
    the critical point; without it the boiling point would come out at 500.7 K, 10 K below. **The maintainer agreed
    to this fit (2026-10-14).**
  - Stull (1947, a compilation) only as a cross-check: it differs from the measured sets by up to 16 % at its
    low-pressure end.
- **Levulinic acid, written with a gap.** The maintainer asked why the best known of the four had no good data. Its
  open data:
  - vapour pressure: Verevkin et al. 2012 (transpiration, 328-373 K, 5 %), Stull 1947 (a compilation, 375-519 K)
    and the measured normal boiling temperature (Uslu et al. 2008, 518.2 K). Stull, the boiling point and the critical
    point lie on one curve (within 3 %); Verevkin et al. lie 11-43 % above it, and no curve with a physical enthalpy
    of vaporization meets both. Transpiration takes the vapour as monomer, and a carboxylic acid partly dimerizes in
    the gas, which makes the apparent pressure too high: a likely reason, not checked here. Fitted: Stull, the
    boiling point and the critical point; Verevkin et al. left out with that reason in the record (`vp_why`);
  - liquid density: only 293-343 K (Nikitin et al. 2019, which the archive labels "metastable liquid": the acid melts
    at 306-310 K; the script accepts these values with `metastable_liquid`).
  No liquid state has both a vapour pressure (from 375 K) and a density (to 343 K). Until now such a component was
  held (gamma-butyrolactone, isoamyl alcohol). **The maintainer decided (2026-10-14) to add levulinic acid with the
  gap**: each record refuses outside its own range. Vapour-liquid equilibrium with an ideal-gas vapour needs only the
  vapour pressure, so it works above 375 K (for example water + levulinic acid with Modified UNIFAC 2.0 at
  101.325 kPa: bubble point 107.9 °C at x_water = 0.5; a water-rich liquid boiling below 375 K is refused). The
  liquid density, and the Peng-Robinson or SRK vapour option that uses it, are refused above 343 K; there is no
  ideal-gas heat capacity, so no energy balance (as for the three esters). `test/properties.test.js` checks the
  refusal (`REFUSED_AT_TYPICAL_STATE`). Wanted, to close the gap: liquid densities above 375 K, or vapour pressures
  between 343 and 375 K by a static or ebulliometric method, from an open source. Its Modified UNIFAC 2.0 groups
  (CH3CO + 2 CH2 + COOH) are the same as DDBST's; fusion data from the WebBook (308 K, 9.2 kJ/mol).
- **Gamma-butyrolactone and isoamyl alcohol, written with a gap.** Held until now: no liquid state had both a vapour
  pressure and a density. The maintainer first asked to add them with a gap unless many vapour pressures would be left
  out; with the old fits a third (gamma-butyrolactone) and half (isoamyl alcohol) were, so they stayed held. Under the
  rule above, none and 4 of 119 are left out, and the maintainer asked to add them if the rule allows it:
  - isoamyl alcohol: vapour pressure 335.85-577.2 K (twelve sets; boiling point 404.43 K, measured median 404.48 K);
    liquid density 288-332.7 K and viscosity 288-323 K, refused at the start of the vapour-pressure record; Modified
    UNIFAC 2.0 groups the same as DDBST's;
  - gamma-butyrolactone: vapour pressure 377-731 K (six sets; boiling point 478.17 K, measured 477.80 K, WebBook values
    477.7 and 479.2 K); liquid density to 333 K and viscosity to 323 K, refused above; no Modified UNIFAC 2.0 groups yet:
    the structure-based split fails the atom balance (it takes a nitrogen subgroup) and DDBST's (CH2COO + 2 cy-CH2) is
    used only after a person chooses it, like 2-methyltetrahydrofuran's.
  `test/properties.test.js` checks the refusals (`REFUSED_AT_TYPICAL_STATE`). The component search now finds isoamyl
  alcohol for "butanol" (its alias 3-methyl-1-butanol); the search test lists it, before isobutanol (a word of an alias
  ranks before a match inside a word, as the search is written).
- **Changed for every component built this way:** the Clapeyron enthalpies of vaporization stop at the last measured
  vapour pressure (or at 500 kPa if lower), never in the part of the curve held only by the critical point.
  1,3-propanediol's record now ends at 487 K instead of 551 K; within 296-487 K its values move by -0.3 to +0.4 %.
- **Engineering report:** a boiling-point case for each new component. Methyl levulinate is compared with the one
  WebBook value (a compilation, report only); so is ethyl levulinate, whose record is fitted to Bo et al. instead.
  For butyl levulinate the record is fitted to that WebBook value, so the case is a consistency check (report only).
- **Kept as before:** the liquid heat capacities of Nikitin et al. 2019 (2.4 %) are above the 1 % target of the
  records, so the four levulinic components have "no open data at the 1 % target" for liquid heat capacity, as for
  1,3-propanediol.
