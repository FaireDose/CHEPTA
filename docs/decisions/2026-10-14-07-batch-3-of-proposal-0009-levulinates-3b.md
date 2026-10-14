# 2026-10-14: batch 3 of proposal 0009, second part (3b): the levulinates

- **Asked:** "both in order": first the refits that the larger engineering report showed (the measured-data review,
  its own pull request), then batch 3b.
- **Done (3 components):** methyl, ethyl and butyl levulinate, from measured data alone (`measured_components.py`).
  Their critical constants come from Nikitin et al., J. Chem. Thermodyn. 2019 (doi:10.1016/j.jct.2019.03.040),
  ThermoML Archive, the only measurement. Their Modified UNIFAC 2.0 groups are the structure-based ones, the same as
  DDBST's published ones (CH3, CH2, CH3CO, CH2COO).
- **Vapour pressures, the choice for each component** (stated in its record):
  - methyl levulinate: Lomba et al. 2013 (333-453 K, 0.2-2.7 %) and Emel'yanenko et al. 2018 (transpiration,
    294-353 K, 6 %) differ by up to 10 % where they overlap, beyond their uncertainties. The more precise set is
    fitted, as for isoamyl alcohol, and the record starts at 333 K. The values of both sets with larger stated
    uncertainties are kept as confirmation where the fit meets them (333-353 K); the others are listed as left out:
    Emel'yanenko et al. at 294-343 K (7-25 % above the fit) and one value of Lomba et al. (338 K).
  - ethyl and butyl levulinate: the only measured vapour pressures are Emel'yanenko et al. 2018 (294-349 K, 6-7 %).
    The curve also goes through the WebBook normal boiling temperature (Weast and Grasselli 1989, a compilation:
    479.0 K and 510.7 K) and the critical point. Without that point, the curve from 349 K to the critical point would
    put butyl levulinate's boiling point at 500.7 K, 10 K below.
  - Stull (1947, a compilation) only as a cross-check: it differs from the measured sets by up to 16 % at its
    low-pressure end.
- **Held back:** levulinic acid. Its open vapour pressures disagree. Verevkin et al. 2012 (transpiration, 328-373 K)
  and the measured normal boiling temperature (Uslu et al. 2008, 518.2 K) with the critical point do not lie on one
  curve with a physical enthalpy of vaporization: the curve that meets them all has ΔHvap rising with temperature, and
  it misses the calorimetric 70.3 kJ/mol at 298 K by 18 %.
  - Wanted: vapour pressures between 373 K and 518 K from a static or ebulliometric method in an open source.
  - The script accepts its densities and heat capacities, which the archive labels "metastable liquid"
    (`metastable_liquid`).
- **Changed for every component built this way:** the Clapeyron enthalpies of vaporization stop at the last measured
  vapour pressure (or at 500 kPa if lower), never in the part of the curve held only by the critical point.
  1,3-propanediol's record now ends at 487 K instead of 551 K; within 296-487 K its values move by -0.3 to +0.4 %.
- **Engineering report:** a boiling-point case for each new component. Methyl levulinate is compared with the one
  WebBook value (a compilation, report only). For ethyl and butyl levulinate the record is fitted to that value, so
  the case is a consistency check (report only).
- **Kept as before:** the liquid heat capacities of Nikitin et al. 2019 (2.4 %) are above the 1 % target of the
  records, so the three have "no open data at the 1 % target" for liquid heat capacity, as for 1,3-propanediol.
- **Found, not used yet:** Bo et al., Energies 18 (2025) 3939, open access: isobaric vapour-liquid equilibrium of ethyl
  levulinate + ethanol at 40, 60 and 80 kPa, up to 470 K. Its pure ethyl levulinate end points would replace the
  compiled boiling point. The MDPI site refuses downloads from the assistant's container; a person can download it.
