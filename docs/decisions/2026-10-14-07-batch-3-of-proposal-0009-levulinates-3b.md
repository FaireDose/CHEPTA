# 2026-10-14: batch 3 of proposal 0009, second part (3b): the levulinates

- **Asked:** "both in order": first the refits that the larger engineering report showed (the measured-data review,
  its own pull request), then batch 3b.
- **Done (4 components):** levulinic acid (with a gap, below) and methyl, ethyl and butyl levulinate, from measured data alone (`measured_components.py`).
  Their critical constants come from Nikitin et al., J. Chem. Thermodyn. 2019 (doi:10.1016/j.jct.2019.03.040),
  ThermoML Archive, the only measurement. Their Modified UNIFAC 2.0 groups are the structure-based ones, the same as
  DDBST's published ones (CH3, CH2, CH3CO, CH2COO).
- **Vapour pressures, the choice for each component** (stated in its record):
  - methyl levulinate: Lomba et al. 2013 (333-453 K, 0.2-2.7 %) and Emel'yanenko et al. 2018 (transpiration,
    294-353 K, 6 %) differ by up to 10 % where they overlap, beyond their uncertainties. The more precise set is
    fitted, as for isoamyl alcohol, and the record starts at 333 K. The values of both sets with larger stated
    uncertainties are kept as confirmation where the fit meets them (333-353 K); the others are listed as left out:
    Emel'yanenko et al. at 294-343 K (7-25 % above the fit) and one value of Lomba et al. (338 K).
  - ethyl levulinate: Emel'yanenko et al. 2018 (294-349 K, 6 %) and Bo et al., Energies 18 (2025) 3939 (open access,
    CC BY 4.0; the paper the maintainer downloaded, since MDPI refuses the assistant's container): the pure ethyl
    levulinate end points of their isobaric sets, 445.93 K at 40.0 kPa, 459.64 K at 60.0 kPa, 470.00 K at 80.0 kPa
    (Table 2), and 478.88 K at 101.3 kPa (Table 1), in `validation/data/pure/measured/article_ethyl-levulinate_bo2025.json`.
    Every value fitted within its stated uncertainty: Emel'yanenko et al. within 5.7 %, Bo et al. within 0.1 %; the
    record's boiling point is 478.94 K.
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
- **Gamma-butyrolactone and isoamyl alcohol stay held.** The maintainer asked to add them with a gap too, unless many
  of their vapour pressures would be left out. A trial build left out 11 of 33 values for gamma-butyrolactone (33 %,
  2-6 % from the fit) and 56 of 119 for isoamyl alcohol (47 %, 0.6-3.6 %, its sets disagreeing beyond their stated
  uncertainties), so, as the maintainer decided, neither was added.
- **Changed for every component built this way:** the Clapeyron enthalpies of vaporization stop at the last measured
  vapour pressure (or at 500 kPa if lower), never in the part of the curve held only by the critical point.
  1,3-propanediol's record now ends at 487 K instead of 551 K; within 296-487 K its values move by -0.3 to +0.4 %.
- **Engineering report:** a boiling-point case for each new component. Methyl levulinate is compared with the one
  WebBook value (a compilation, report only); so is ethyl levulinate, whose record is fitted to Bo et al. instead.
  For butyl levulinate the record is fitted to that WebBook value, so the case is a consistency check (report only).
- **Kept as before:** the liquid heat capacities of Nikitin et al. 2019 (2.4 %) are above the 1 % target of the
  records, so the four have "no open data at the 1 % target" for liquid heat capacity, as for 1,3-propanediol.
