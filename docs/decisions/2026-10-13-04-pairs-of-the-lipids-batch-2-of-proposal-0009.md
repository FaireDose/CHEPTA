# 2026-10-13: pairs of the lipids (batch 2 of proposal 0009)

- **Asked:** the mixture pairs of batch 2, after #107 was merged.
- **Done:**
  - **ChemSep NRTL/UNIQUAC:** 5 sets.
    - Ethanol + n-hexadecane, NRTL and UNIQUAC. Both predict two liquids, but in different composition ranges (NRTL
      x(ethanol) 0.5-0.99, UNIQUAC 0.03-0.72 at 273-373 K), so at least one is wrong. The archive has no
      vapour-liquid data for the pair to decide.
    - Ethanol + oleic acid, NRTL and UNIQUAC.
    - Methanol + oleic acid, UNIQUAC.
  - **ChemSep k_ij:** none; pr.ipd and srk.ipd have no pair with a lipid.
  - **The whole ThermoML Archive scanned again:** 883 CHEPTA pairs with binary vapour-liquid data, from 855; 28 are
    lipid pairs. vle_batch chose a data set for 7 of them.
  - **Fitted:**
    - methyl myristate + n-hexadecane (Li et al. 2016, 5 kPa): NRTL and UNIQUAC, 0.10 K and 0.002 in y.
    - methyl myristate + methyl palmitate (Chen et al. 2014, 0.5 kPa, bubble temperatures): NRTL and UNIQUAC,
      0.37-0.41 K.
    - methyl palmitate + methyl stearate (Hou et al. 2012, 10 kPa, bubble temperatures): 0.62 K. That is above the
      0.5 K gate and within the wider one, so written with a fit-quality warning, as decided for the batch 1 pairs.
  - **Rejected (data files kept):**
    - methanol + methyl laurate, myristate and palmitate: total pressures at 493-543 K, up to and above the critical
      temperature of methanol (about 512 K), where an activity model with an ideal vapour does not apply; 8-13 % in P.
    - methanol + methyl oleate (Silva et al. 2016, 101 kPa): 5 K. The set has two points that contradict each other
      (x(methanol) 0.0528 at 414.85 K and 0.0552 at 435.15 K), and its vapour is almost pure methanol, so the
      consistency test cannot catch them. The data are kept as published.
- **Not fitted here, and why:**
  - **Gases in the lipids:** CO2, ethane, propane, hydrogen and methane with the esters, triolein, the acids and the
    paraffins. These are equation-of-state pairs, like the gas pairs of the pending k_ij item above.
  - **Fatty acids with solvents:** activity coefficients at infinite dilution (Belting et al., J. Chem. Thermodyn.
    2012-2013), which the activity fits do not use.
  - **Palmitic + stearic acid:** its data set's pure boiling points are 2.1 K or more from the records.
- **Found while doing this (left for the maintainer):** ChemSep has k_ij for 43 entries (PR and SRK) of older
  components (proposal 0008: for example methane + n-decane, CO2 + n-decane, nitrogen + sulfur dioxide) that
  src/data/kij.json does not have. This is item 1 of the engineering list above; not done in this pull request.
