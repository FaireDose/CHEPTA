# 2026-10-13: batch 2 of proposal 0009 (lipids)

- **Asked:** the next batch of green-chemistry components, after the flowsheet pull request (#106) was merged.
- **Done:** 13 components.
  - **Methyl esters:** methyl laurate and myristate (ChemSep v8.31 data 2); methyl palmitate, stearate, oleate and
    linoleate (CoolProp 8.0.0, the equations of state of Huber et al. 2009). CoolProp has no viscosity or thermal
    conductivity for them, and the NIST WebBook has no fluid tables for them (its fluid list, checked 2026-10-13), so
    those come from ChemSep.
  - **Triglycerides and fatty acids:** triolein, tripalmitin, oleic, palmitic and stearic acid (ChemSep v8.31 data
    2). ChemSep does not say how it obtained their critical constants; the triglycerides decompose long before
    their critical points (925-935 K in ChemSep), so those constants are not measured values. Read them as
    parameters of the equations of state, not as properties.
  - **Paraffins:** n-hexadecane and n-octadecane (ChemSep v8.3).
- **Checks against the ThermoML Archive:** no record is three times off its tolerance; six are above it and stay
  with the warning, as the rule of proposal 0008 says. The measured values do not cover 25-100 degC, or come from
  one article:
  - vapour pressure of methyl laurate (1.6 %) and methyl myristate (2.7 %), 412-453 K;
  - liquid viscosity of methyl myristate (6.1 %), methyl palmitate (8.4 %) and methyl stearate (6.3 %), 293-363 K,
    where one article (Ceriani 2007) is 9-16 % from the rest;
  - liquid thermal conductivity of methyl myristate (5.8 %, one article).
- **Fatty-acid vapour pressures:** the NIST WebBook Antoine sets of Stull (1947) are 41-55 % from the ChemSep curves
  of palmitic and stearic acid near 430 K. The ThermoML articles of 2012 (stated uncertainty 3.5 %) agree with
  ChemSep within 1-5 %, so the ChemSep curves stay.
- **For the reviewer:** one article (doi:10.1016/j.jct.2019.01.007, stated uncertainty 1.3 %, so outside the 1 %
  rule) finds the methyl ester vapour pressures 7-16 % below the records at 300-430 K, where they are a few pascal.
  The other articles, at higher temperatures, agree within a few per cent.
- **Fitted vapour pressures:** one DIPPR 101 curve could not follow CoolProp from a few millipascal to the critical
  point within 1 % and still give the normal boiling point within the 0.2 K the engine is tested to. The four
  CoolProp methyl esters are now fitted through their normal boiling point. Their records state the cost: 1.0-1.5 %
  maximum deviation from CoolProp. No other component changes, since this applies only where the free fit misses
  Tb by more than 0.2 K.
- **Gaps filled from measured data:** the methyl linoleate liquid viscosity, fitted to the ThermoML values of Pratas
  et al. (2010) and Ceriani et al. (2007), 278-353 K.
- **Melting data:**
  - From the WebBook or ChemSep for nine of the components. The triolein values come from the ThermoML Archive
    (four articles), a new step of fusion_data.py.
  - The melting-temperature rule now leaves out the triple points of metastable crystal forms. Tripalmitin's alpha
    form melts about 21 K below its stable form. This also moves the diethyl ether melting temperature by 0.06 K.
  - Methyl oleate and methyl linoleate have no open melting data (WebBook, ChemSep and ThermoML searched).
- **No open data, with the sources searched** (ThermoML Archive, web search, Europe PMC):
  - triolein and tripalmitin: liquid heat capacity, heat of vaporization, gas viscosity, thermal conductivities;
  - methyl linoleate: thermal conductivities and gas viscosity.
  An open-access article with triglyceride vaporisation enthalpies (Verevkin and Nagrimanov, Thermo 2022) gives
  single values at 298.15 K, not a correlation, and the publisher's site refused the download.
- **The articles the maintainer provided (same day), used as follows:**
  - **Perkins and Huber, Energy Fuels 25 (2011) 2383** (NIST; not subject to U.S. copyright, free copy from NIST):
    their correlation of the liquid thermal conductivity of methyl oleate and methyl linoleate (eqs 2-4, Tables
    1-2; within 2.5 % of their measurements at 302-508 K) is coded in perkins2011_conductivity.py. The code
    reproduces the check values of their Table 3 within 0.0004 %.
    - Methyl linoleate: a liquid thermal conductivity record now exists.
    - Methyl oleate: the ChemSep record was 30-36 % below the correlation; it is refitted.
    - The records say they are fitted to values calculated from the authors' correlation. Their tabulated
      measurements are in the supporting information, which was not used.
  - **Verevkin and Nagrimanov, Thermo 2 (2022) 250** (CC BY 4.0): only saturated triglycerides. For tripalmitin it has
    one measured enthalpy of vaporization, 169.5 kJ/mol at 385-433 K. The ChemSep vapour pressure of the record
    implies about 190 kJ/mol there, so ChemSep's curve may be too steep at low pressure. The article's vapour
    pressures (its supporting information, Table S2) would show it; noted in the record.
  - **Not used:**
    - van Miltenburg and ten Grotenhuis, J. Chem. Eng. Data 44 (1999), tripalmitin heat capacity: paywalled, and its
      values are not in an open source.
    - Zong et al., Ind. Eng. Chem. Res. 49 (2010): paywalled, and predictions for mono- and diglycerides, not
      measurements.
    - The fifth file (arXiv 2501.12948) is about language models, not this batch.
- **Pending:**
  - the pairs (FAME + methanol, + glycerol, and the others) are listed in docs/DATA_WANTED.md for the next pull
    request, as for batch 1;
  - the supporting information of Verevkin and Nagrimanov (2022), for the tripalmitin vapour pressure.
