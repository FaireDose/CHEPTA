# Missing pure-component properties (2026-10-22)

What CHEPTA's databank still lacks besides vapour-liquid pairs, on 2026-10-22 (174 components). Made by `validation/python/missing_properties.py`; one file per update, named with its day, so the earlier files stay and the gaps can be followed over time (docs/DATA_RULES.md section 12). The pairs are in [DATA_WANTED.md](../DATA_WANTED.md).

Each gap is a "no open data" marker in `src/data/components.json` with the sources that were searched (`searched`). Start from that list before looking again, so the same sources are not searched twice.

## Summary

| Property | Missing | Predicted only | What it blocks today |
|---|---|---|---|
| Vapour pressure | 7 | - | Everything with a vapour: bubble and dew points, flashes, diagrams, distillation. The worst gap. |
| Critical constants (Tc, Pc, ω) | 14 | - | Peng–Robinson and SRK, for either phase. Activity models with an ideal-gas vapour still work. |
| Normal boiling point | 12 | - | Only where it is shown; the vapour-pressure record still works over its measured range. |
| Liquid density | 25 | - | Volumes, pump work, velocities; mass-to-volume conversions. |
| Liquid heat capacity | 9 | 26 | Energy balances: heaters, coolers, exchangers. Predicted values are within about 5 % at 300 K, worse for alcohols and polyols at higher temperature. |
| Ideal-gas heat capacity | 25 | - | Covered for the volatile ones by Kirchhoff's path from the liquid records; missing outright for those without a vapour pressure. |
| Heat of vaporization | 9 | - | Energy balances with evaporation or condensation. |
| Surface tension | 38 | - | Nothing in a calculation yet; column hydraulics later. |
| Liquid viscosity | 35 | - | Nothing in a calculation yet (shown in Properties); pumps, pipes and film coefficients later. |
| Liquid thermal conductivity | 50 | - | Nothing in a calculation yet; exchanger film coefficients from fluid properties later. |
| Vapour viscosity | 33 | - | Nothing in a calculation yet. |
| Vapour thermal conductivity | 34 | - | Nothing in a calculation yet. |
| Melting point and enthalpy of fusion | 32 | - | Solid solubility, crystallization, freezing checks. |
| Enthalpy of formation | 22 | - | Heats of reaction in the reactors (proposal 0010): a component without it can only be in a conversion or yield reactor with a given duty. |
| Gibbs energy of formation | 37 | - | Equilibrium constants from formation data (equilibrium and Gibbs reactors); heats of reaction still work with the enthalpy alone. |
| UNIQUAC r and q | 51 | - | UNIQUAC for those components (NRTL works). |
| Modified UNIFAC 2.0 groups | 20 | - | Prediction for those components; small gases and some rings cannot be described by the method. |

## What changed since the previous file (components.json at `db83677`)

- Critical constants (Tc, Pc, ω) found for 4: Tetrahydrofurfuryl alcohol, Methyl lactate, Ethyl lactate, Furfuryl alcohol.
- Normal boiling point found for 3: Tetrahydrofurfuryl alcohol, Methyl lactate, Furfuryl alcohol.
- Liquid thermal conductivity found for 4: Tetrahydrofurfuryl alcohol, Methyl lactate, Ethyl lactate, Furfuryl alcohol.

## The full-text search of 2026-10-22

`validation/data/searches/2026-10-22-fulltext.json`, made with `validation/python/fulltext_search.py` (docs/DATA_RULES.md section 1, "How to search for a missing number", step 3). "None of the pure compound": the passages name the component as a reactant, product, solvent or ligand, or give a value of a mixture or a solution. 176 gaps searched (the properties a calculation needs); 78 had at least one open article where a name of the component and the property appear in the same paragraph or table. Each such passage (the passage the script shows, and the article where it pointed to a value) was read on 2026-10-22. One measured value was found: solketal's vapour pressure (Türck et al. 2026), added with the maintainer's agreement, read off its figure and held to its uncertainty of 16-19 %. Europe PMC indexes the biomedical literature and the journals deposited in PubMed Central (MDPI, ACS Omega, RSC Advances, Scientific Reports); it does not have J. Chem. Eng. Data, J. Chem. Thermodyn., Fluid Phase Equilib. or Int. J. Thermophys., where most measurements are, so OpenAlex was asked too, later the same day, with a key. Neither index found a further value usable under the rules: the melting points of DL-malic acid and cis,cis-muconic acid came without an enthalpy of fusion.

- Europe PMC: asked (full texts of open-access articles; 8 articles read per search)
- OpenAlex: asked, with a key (a network secret of the environment): one full-text query per gap, open-access works only, 8 articles per query; 1185 articles found, 271 of them could be downloaded as a PDF and read (the others' servers refuse scripts or give no PDF)
- CORE: not asked: the maintainer has written to CORE to ask which licence fits an MIT-licensed simulator (2026-10-22)

| Component | Property | Europe PMC: found, with a passage | OpenAlex: found, read, with a passage | What they held |
|---|---|---|---|---|
| 2-Methoxyethanol | melting point and enthalpy of fusion | 171, 1 | 913, 5, 1 | none of the pure compound |
| Methyldiethanolamine | melting point and enthalpy of fusion | 59, 3 | 351, 3, 2 | none of the pure compound |
| Terephthalic acid | liquid density | 3691, 3 | 10093, 2, 2 | none of the pure compound |
| Terephthalic acid | melting point and enthalpy of fusion | 844, 3 | 2786, 1, 1 | none of the pure compound |
| Methyl oleate | melting point and enthalpy of fusion | 845, 2 | 6805, 0, 0 | none of the pure compound |
| Methyl linoleate | melting point and enthalpy of fusion | 57, 1 | 353, 5, 2 | none of the pure compound |
| Triolein | heat of vaporization | 65, 0 | 602, 1, 1 | none of the pure compound: Verevkin and Nagrimanov 2022 (Thermo) has saturated triglycerides only; Garcia Santander et al. 2012 (Fuel) a TGA normal boiling point only (419.10 degC), no enthalpy (downloaded by the maintainer and read) |
| Tripalmitin | heat of vaporization | 63, 0 | 585, 0, 0 | **measured, held for the maintainer**: Verevkin and Nagrimanov, Thermo 2 (2022) 250-266, doi:10.3390/thermo2030018 (CC BY 4.0), Table 1: quartz-crystal microbalance, 384.9-433.2 K, 169.5 +- 4.2 kJ/mol at the mean temperature (about 409 K; the values are in its supplementary Table S2), adjusted by the authors to 210.2 +- 9.2 kJ/mol at 298.15 K. A single value: no record without the maintainer's decision; the slope of CHEPTA's ChemSep vapour-pressure record gives 189.7 kJ/mol at 409 K (Clapeyron, ideal gas), 12 % above it. The paper's recommended 211.6 kJ/mol averages it with correlation estimates, which are not data. Also read: Garcia Santander et al., Fuel 92 (2012) 158-161, doi:10.1016/j.fuel.2011.08.011 (Elsevier OA licence), TGA normal boiling points only (416.87 degC), no enthalpy (downloaded by the maintainer and read) |
| 2-Methylfuran | enthalpy of formation | 6, 2 | 241, 4, 0 | Amaral et al., Molecules 2024, doi:10.3390/molecules29122729: theoretical increments only, no measured enthalpy of 2-methylfuran |
| 2-Methyltetrahydrofuran | melting point and enthalpy of fusion | 225, 1 | 802, 2, 1 | none of the pure compound |
| Ethyl levulinate | melting point and enthalpy of fusion | 26, 0 | 169, 4, 1 | none of the pure compound |
| Butyl levulinate | melting point and enthalpy of fusion | 6, 0 | 41, 4, 1 | none of the pure compound |
| gamma-Valerolactone | critical constants (Tc, Pc, ω) | 63, 0 | 231, 1, 1 | none of the pure compound |
| Tetrahydrofurfuryl alcohol | critical constants (Tc, Pc, ω) | 20, 0 | 54, 5, 1 | **measured, added**: Nikitin et al. 2023 (as for furfuryl alcohol): Tc = 668 +- 10 K, pc = 4.18 +- 0.17 MPa; with its heat capacities (Table 5, 298-453 K) and thermal conductivities (Table 7, 303-373 K). The vapour-pressure curve now runs to the critical point, and reaches 101.325 kPa at 449.46 K (Tb) (downloaded by the maintainer and read) |
| Tetrahydrofurfuryl alcohol | normal boiling point | 59, 1 | 234, 2, 1 | **now from the vapour-pressure record**, which runs to the measured critical point of Nikitin et al. 2023: 449.46 K. Nikitin et al.'s Table 2 gives 449.9 K, an average of earlier articles (downloaded by the maintainer and read) |
| 2,3-Butanediol | melting point and enthalpy of fusion | 130, 1 | 32, 0, 0 | none of the pure compound |
| 2,3-Butanediol | critical constants (Tc, Pc, ω) | 62, 2 | 4, 1, 0 | critical temperatures used as inputs of a machine-learning model (Sci. Rep. 2022, doi:10.1038/s41598-022-08842-5), not measured |
| 2,3-Butanediol | normal boiling point | 176, 5 | 74, 2, 1 | none of the pure compound |
| Methyl lactate | melting point and enthalpy of fusion | 40, 2 | 175, 4, 1 | none of the pure compound |
| Methyl lactate | critical constants (Tc, Pc, ω) | 16, 1 | 56, 2, 0 | **measured, added** (the maintainer accepted the larger vapour-pressure miss, 2026-10-22): Bogatishcheva et al., SSRN preprint 2026 (not peer reviewed), doi:10.2139/ssrn.6083032, Tables 3 and 4: Tc = 612 K (U_r 1.5 %), pc = 3.73 MPa (U_r 4.5 %), pulse heating; with it the vapour-pressure set of Lomba 2014 misses the curve by 3.37 % (stated 2.59 %). With its heat capacities (Eq. 24, 298-417 K, 3 %) and thermal conductivities (Eq. 27, 303-373 K, 8.5 %) (downloaded by the maintainer and read) |
| Methyl lactate | normal boiling point | 33, 2 | 165, 0, 0 | none of the pure compound |
| Ethyl lactate | melting point and enthalpy of fusion | 144, 1 | 528, 0, 0 | **measured, held for the maintainer**: Ashraf, MS thesis, St. John's University 2015 (open repository, doi:10.57912/23844132), Table 8 and Figures 27-29 (modulated DSC): racemate (CAS 97-64-3, CHEPTA's component) peak 247.51 K (-25.64 degC; onset -31.08 degC), 83.46 J/g = 9.86 kJ/mol; L-form -6.22 degC, 40.12 J/g; D-form -4.23 degC, 159.4 J/g. Mirror images have the same enthalpy of fusion, so the factor of four between them makes the thesis's enthalpies doubtful; the temperatures are DSC peaks, not onsets (downloaded by the maintainer and read) |
| Ethyl lactate | critical constants (Tc, Pc, ω) | 78, 2 | 283, 0, 0 | **measured, added** (as for methyl lactate): Bogatishcheva et al. 2026: Tc = 617 K, pc = 3.32 MPa; Resa 2010 misses the curve by 2.35 % (stated 1.70 %). With its heat capacities (298-398 K) and thermal conductivities (downloaded by the maintainer and read) |
| Limonene | melting point and enthalpy of fusion | 1088, 4 | 2912, 5, 2 | none of the pure compound |
| Limonene | critical constants (Tc, Pc, ω) | 493, 1 | 1198, 3, 2 | none of the pure compound |
| Limonene | normal boiling point | 916, 5 | 2749, 1, 0 | none of the pure compound |
| Furfuryl alcohol | critical constants (Tc, Pc, ω) | 77, 1 | 314, 4, 0 | **measured, added**: Nikitin et al., Fluid Phase Equilib. 565 (2023) 113656, doi:10.1016/j.fluid.2022.113656, read in the submitted manuscript on SSRN (doi:10.2139/ssrn.4213180), Tables 2 and 3: Tc = 660 +- 10 K, pc = 4.85 +- 0.19 MPa, pulse heating; with its heat capacities (Table 5, 298-373 K) and thermal conductivities (Table 7, 303-353 K) (downloaded by the maintainer and read) |
| Furfuryl alcohol | normal boiling point | 241, 2 | 1041, 0, 0 | a QSPR article's input table: not measured |
| 5-Hydroxymethylfurfural | liquid density | 2874, 4 | 11653, 0, 0 | none of the pure compound |
| D-Glucose | liquid density | 524878, 4 | 1090182, 4, 3 | none of the pure compound |
| D-Fructose | liquid density | 46038, 4 | 119052, 4, 4 | aqueous solutions only (among them J. Res. NBS 8 (1932), doi:10.6028/jres.008.033, public domain) |
| D-Sorbitol | liquid density | 17457, 5 | 47999, 1, 1 | none of the pure compound |
| D-Sorbitol | Gibbs energy of formation | 2, 1 | 43, 3, 0 | none of the pure compound |
| Xylitol | enthalpy of formation | 25, 1 | 407, 2, 0 | none of the pure compound |
| Succinic acid | liquid density | 8787, 7 | 22964, 3, 2 | none of the pure compound |
| Itaconic acid | liquid density | 1640, 6 | 5648, 1, 1 | none of the pure compound |
| Itaconic acid | melting point and enthalpy of fusion | 218, 4 | 1045, 2, 2 | none of the pure compound |
| Fumaric acid | liquid density | 3269, 5 | 8764, 2, 2 | none of the pure compound |
| Fumaric acid | melting point and enthalpy of fusion | 316, 2 | 1391, 3, 1 | none of the pure compound |
| Malic acid | liquid density | 7405, 1 | 30173, 1, 1 | none of the pure compound |
| Malic acid | melting point and enthalpy of fusion | 643, 2 | 4405, 5, 2 | Marques et al., Arab. J. Chem. 2020, doi:10.1016/j.arabjc.2020.10.036 (CC BY-NC-ND 4.0): DL-malic acid melting point 129.71 °C (melting-point apparatus, ±0.5 K), no enthalpy of fusion: no melting record (it needs both) |
| Malic acid | Gibbs energy of formation | 5, 1 | 78, 3, 0 | none of the pure compound |
| Citric acid | liquid density | 42540, 6 | 113743, 3, 3 | none of the pure compound |
| Glycolic acid | liquid density | 18993, 5 | 37346, 3, 3 | Savannah River National Laboratory reports on OSTI (doi:10.2172/982752, 10.2172/1019026, 10.2172/1371696): densities of 60-75 wt% aqueous glycolic acid only; 'neat glycolic acid was not measured' |
| Glycolic acid | enthalpy of formation | 21, 0 | 174, 4, 1 | a process model's input table (Chem. Eng. Trans. 2026, doi:10.3303/cet26125044) quoting a market-research report: not taken |
| D-Glucaric acid | liquid density | 659, 4 | 1505, 0, 0 | none of the pure compound |
| D-Glucaric acid | melting point and enthalpy of fusion | 49, 1 | 210, 1, 0 | none of the pure compound |
| 3-Hydroxypropionic acid | liquid density | 534, 1 | 1446, 1, 0 | none of the pure compound |
| 3-Hydroxypropionic acid | melting point and enthalpy of fusion | 44, 0 | 198, 3, 1 | none of the pure compound |
| 2,5-Furandicarboxylic acid | liquid density | 627, 1 | 355, 0, 0 | none of the pure compound |
| Bis(2-hydroxyethyl) terephthalate | melting point and enthalpy of fusion | 146, 2 | 4, 3, 0 | none of the pure compound |
| Diphenolic acid | liquid density | 68, 1 | 256, 3, 1 | none of the pure compound |
| D-Xylose | liquid density | 15458, 3 | 44617, 0, 0 | none of the pure compound |
| cis,cis-Muconic acid | liquid density | 560, 1 | 1591, 2, 1 | none of the pure compound |
| cis,cis-Muconic acid | melting point and enthalpy of fusion | 62, 0 | 259, 3, 1 | ACS Sustain. Chem. Eng. 2016, doi:10.1021/acssuschemeng.6b01820, Table 3: cis,cis-muconic acid melting point 197 °C (purity 99.2 %), no enthalpy of fusion: no melting record |
| Glycerol carbonate | liquid density | 160, 3 | 1031, 1, 0 | none of the pure compound |
| Glycerol carbonate | melting point and enthalpy of fusion | 37, 1 | 245, 2, 0 | none of the pure compound |
| Glycerol carbonate | critical constants (Tc, Pc, ω) | 10, 1 | 87, 3, 2 | none of the pure compound |
| Glycerol carbonate | normal boiling point | 72, 4 | 331, 0, 0 | a property table (RSC Adv. 2023, doi:10.1039/d3ra03028h: 354 °C) without the measuring article: not taken |
| Solketal | vapour pressure | 21, 2 | 119, 1, 1 | **measured, added** (the maintainer, 2026-10-22: "yes"; read off the graph, 40-100 °C, held to 19 %): Türck et al., ACS Omega 2026, doi:10.1021/acsomega.5c12056 (CC BY 4.0), Figure 7: the vapour-pressure curve of pure solketal (≥98 %, Merck), 20-100 °C, about 0.2 to 7.1 kPa, Herzog HVP 972 fuel vapour-pressure tester, n = 3, error bar about ±0.5 kPa at 80 °C. In a figure only (the supporting information has no table of it) |
| Solketal | heat of vaporization | 2, 0 | 21, 2, 1 | a fuel-property table (Int. J. Automot. Eng. Technol. 2018, doi:10.18245/ijaet.486410, Table 1: 374 kJ/kg at 20 °C) citing three references for all its fuels, none named as the measurement for solketal: not taken |
| Solketal | liquid heat capacity | 4, 0 | 28, 1, 0 | none of the pure compound: Samoilov et al., Molecules 28 (2023) 7483, doi:10.3390/molecules28227483 (CC BY 4.0), names solketal in its references only; its heat capacities are of glycerol methyl and ethyl ether mixtures (downloaded by the maintainer and read) |
| Solketal | melting point and enthalpy of fusion | 41, 1 | 187, 0, 0 | none of the pure compound |
| Solketal | critical constants (Tc, Pc, ω) | 4, 0 | 32, 3, 1 | none of the pure compound |
| Solketal | normal boiling point | 39, 3 | 198, 1, 1 | the same article (Türck et al. 2026) gives no boiling point |
| alpha-Angelica lactone | melting point and enthalpy of fusion | 37, 0 | 87, 1, 1 | none of the pure compound |
| alpha-Angelica lactone | enthalpy of formation | 3, 0 | 15, 0, 0 | none of the pure compound: Silva et al., Molecules 30 (2025) 399, doi:10.3390/molecules30020399 (CC BY 4.0), names angelica lactones in its references only (gamma- and delta-undecanolactone; its Table 8 quotes gamma-butyrolactone and gamma-valerolactone values of other articles) (downloaded by the maintainer and read) |
| Lactide | vapour pressure | 217, 2 | 1331, 1, 0 | the same review (Cunha et al. 2022): no vapour pressure |
| Lactide | liquid density | 11089, 1 | 35759, 0, 0 | none of the pure compound |
| Lactide | heat of vaporization | 11, 1 | 94, 1, 0 | Cunha et al., Bioengineering 2022, doi:10.3390/bioengineering9040164, Table 2: 63 kJ/mol, with liquid viscosities at 110-130 °C, 'found in the literature' without the article for each value: not taken (DATA_RULES section 1, modelling papers) |
| Lactide | liquid heat capacity | 211, 2 | 1233, 2, 1 | none of the pure compound |
| Lactide | critical constants (Tc, Pc, ω) | 531, 1 | 1954, 2, 0 | none of the pure compound |
| Lactide | normal boiling point | 385, 3 | 1679, 1, 1 | the same review (Cunha et al. 2022), Table 2: 255 °C without its source: not taken |
| Isosorbide | vapour pressure | 63, 3 | 245, 0, 0 | no vapour pressure of isosorbide itself (the hits are isosorbide diesters and dimethyl isosorbide) |
| Isosorbide | liquid density | 1548, 3 | 5069, 1, 1 | none of the pure compound |
| Isosorbide | liquid heat capacity | 24, 1 | 119, 1, 0 | none of the pure compound |
| Isosorbide | melting point and enthalpy of fusion | 257, 6 | 1042, 0, 0 | Hammami et al., Molecules 2025, doi:10.3390/molecules30224364: DSC melting onset 45 °C (endotherm 45-62 °C, sample about 70 % crystalline), no enthalpy of fusion: no melting record (it needs both) |
| Isosorbide | normal boiling point | 93, 6 | 380, 0, 0 | property tables without the measuring article (a ChemSusChem review, doi:10.1002/cssc.202102525: 433 K, unstated pressure): not taken |
| Levoglucosan | vapour pressure | 66, 3 | 917, 7, 6 | Zhang et al., Environ. Sci. Technol. Lett. 2024, doi:10.1021/acs.estlett.4c00608, cites four measurements: May et al. 2012 (doi:10.1021/es302276t, no free copy), Kabo et al. 2015 and Rocha et al. 2013 (sublimation pressures of the crystal in the ThermoML Archive), Oja and Suuberg 1999 (doi:10.1021/je980119b, no free copy). No liquid vapour pressure; OpenAlex: field studies of gas-particle partitioning (ACP 2021, 2023, and the discussion of egusphere-2023-1419) that use predicted vapour pressures (SIMPOL): no measurement; OpenAlex: Suuberg and Oja, DOE report DOE/PC92544-18 (1997), doi:10.2172/774960 (OSTI, a US government report): Table D.1, the sublimation pressures of the crystal (71-112 °C); section D.2.1 names the only liquid measurement, Enstein, Duronina and Pashinkin, Zh. Prikl. Khim. 37 (1964) 2543 (static method, three temperatures, 195-255 °C), shown in Figure D.5 as a line only, not as points; the original has no known free copy. No liquid vapour pressure that can be taken |
| Levoglucosan | liquid density | 583, 1 | 3740, 2, 1 | none of the pure compound |
| Levoglucosan | heat of vaporization | 7, 0 | 186, 4, 1 | the same DOE report (doi:10.2172/774960): 92.3 kJ/mol from Enstein et al. (1964) and 97 kJ/mol from the report's own extrapolation of sublimation data, neither a calorimetric value nor a value with an open measurement: not taken |
| Levoglucosan | liquid heat capacity | 19, 2 | 274, 1, 0 | Madejczyk et al., Sci. Rep. 2017, doi:10.1038/srep42103: only the heat-capacity step at the glass transition (0.696 J/(g K)), not a heat capacity of the liquid |
| Dimethyl 2,5-furandicarboxylate | liquid density | 54, 1 | 35, 1, 1 | none of the pure compound |
| Dimethyl 2,5-furandicarboxylate | melting point and enthalpy of fusion | 59, 2 | 43, 0, 0 | none of the pure compound |
| 2,5-Bis(hydroxymethyl)furan | vapour pressure | 11, 1 | 0, 0, 0 | a review's property table (doi:10.1186/s40643-023-00676-x, Table 1: 0.00248 mmHg at 25 °C) without the measuring article: not taken |
| 2,5-Bis(hydroxymethyl)furan | liquid density | 140, 1 | 3, 0, 0 | none of the pure compound |
| 2,5-Bis(hydroxymethyl)furan | melting point and enthalpy of fusion | 35, 2 | 0, 0, 0 | the same review table (melting point 74-77 °C, no enthalpy, no source): not taken |
| 2,5-Bis(hydroxymethyl)furan | normal boiling point | 25, 1 | 0, 0, 0 | the same review table (275 °C, no source): not taken |
| Levoglucosenone | liquid heat capacity | 4, 1 | 41, 2, 0 | none of the pure compound |
| Levoglucosenone | melting point and enthalpy of fusion | 34, 1 | 113, 3, 0 | none of the pure compound |
| 5-(Ethoxymethyl)furfural | liquid density | 52, 4 | 275, 1, 1 | none of the pure compound |
| 5-(Ethoxymethyl)furfural | melting point and enthalpy of fusion | 13, 1 | 43, 0, 0 | none of the pure compound |
| 5-(Ethoxymethyl)furfural | enthalpy of formation | 2, 0 | 21, 1, 1 | none of the pure compound |
| 5-(Ethoxymethyl)furfural | normal boiling point | 16, 3 | 98, 1, 0 | none of the pure compound |

No passage with a name and the property together, in the open full texts searched (82): 2-Methoxyethanol (Gibbs energy of formation); 2-Methylfuran (Gibbs energy of formation); 2-Methyltetrahydrofuran (enthalpy of formation); 2-Methyltetrahydrofuran (Gibbs energy of formation); 1,3-Propanediol (Gibbs energy of formation); Methyl levulinate (melting point and enthalpy of fusion); Methyl levulinate (Gibbs energy of formation); Ethyl levulinate (Gibbs energy of formation); Butyl levulinate (Gibbs energy of formation); Levulinic acid (Gibbs energy of formation); gamma-Valerolactone (Gibbs energy of formation); Tetrahydrofurfuryl alcohol (melting point and enthalpy of fusion); Cyclopentyl methyl ether (melting point and enthalpy of fusion); Cyclopentyl methyl ether (enthalpy of formation); Cyclopentyl methyl ether (Gibbs energy of formation); Cyclopentyl methyl ether (critical constants (Tc, Pc, ω)); 2,3-Butanediol (Gibbs energy of formation); Methyl lactate (enthalpy of formation); Methyl lactate (Gibbs energy of formation); Ethyl lactate (Gibbs energy of formation); Limonene (Gibbs energy of formation); Isoamyl alcohol (melting point and enthalpy of fusion); Isoamyl alcohol (Gibbs energy of formation); Lactic acid (Gibbs energy of formation); 5-Hydroxymethylfurfural (enthalpy of formation); 5-Hydroxymethylfurfural (Gibbs energy of formation); Xylitol (Gibbs energy of formation); Itaconic acid (Gibbs energy of formation); Malic acid (enthalpy of formation); Glycolic acid (Gibbs energy of formation); D-Glucaric acid (enthalpy of formation); D-Glucaric acid (Gibbs energy of formation); 3-Hydroxypropionic acid (enthalpy of formation); 3-Hydroxypropionic acid (Gibbs energy of formation); 2,5-Furandicarboxylic acid (enthalpy of formation); 2,5-Furandicarboxylic acid (Gibbs energy of formation); Bis(2-hydroxyethyl) terephthalate (liquid density); Bis(2-hydroxyethyl) terephthalate (enthalpy of formation); Bis(2-hydroxyethyl) terephthalate (Gibbs energy of formation); Diphenolic acid (melting point and enthalpy of fusion); Diphenolic acid (enthalpy of formation); Diphenolic acid (Gibbs energy of formation); cis,cis-Muconic acid (enthalpy of formation); cis,cis-Muconic acid (Gibbs energy of formation); Glycerol carbonate (enthalpy of formation); Glycerol carbonate (Gibbs energy of formation); Solketal (enthalpy of formation); Solketal (Gibbs energy of formation); alpha-Angelica lactone (vapour pressure); alpha-Angelica lactone (heat of vaporization); alpha-Angelica lactone (liquid heat capacity); alpha-Angelica lactone (Gibbs energy of formation); alpha-Angelica lactone (critical constants (Tc, Pc, ω)); alpha-Angelica lactone (normal boiling point); Lactide (Gibbs energy of formation); Isosorbide (heat of vaporization); Isosorbide (enthalpy of formation); Isosorbide (Gibbs energy of formation); Isosorbide (critical constants (Tc, Pc, ω)); Levoglucosan (critical constants (Tc, Pc, ω)); Levoglucosan (normal boiling point); Dimethyl 2,5-furandicarboxylate (vapour pressure); Dimethyl 2,5-furandicarboxylate (heat of vaporization); Dimethyl 2,5-furandicarboxylate (liquid heat capacity); Dimethyl 2,5-furandicarboxylate (enthalpy of formation); Dimethyl 2,5-furandicarboxylate (Gibbs energy of formation); Dimethyl 2,5-furandicarboxylate (critical constants (Tc, Pc, ω)); Dimethyl 2,5-furandicarboxylate (normal boiling point); 2,5-Bis(hydroxymethyl)furan (heat of vaporization); 2,5-Bis(hydroxymethyl)furan (liquid heat capacity); 2,5-Bis(hydroxymethyl)furan (enthalpy of formation); 2,5-Bis(hydroxymethyl)furan (Gibbs energy of formation); 2,5-Bis(hydroxymethyl)furan (critical constants (Tc, Pc, ω)); Levoglucosenone (enthalpy of formation); Levoglucosenone (Gibbs energy of formation); Levoglucosenone (critical constants (Tc, Pc, ω)); Levoglucosenone (normal boiling point); 5-(Ethoxymethyl)furfural (vapour pressure); 5-(Ethoxymethyl)furfural (heat of vaporization); 5-(Ethoxymethyl)furfural (liquid heat capacity); 5-(Ethoxymethyl)furfural (Gibbs energy of formation); 5-(Ethoxymethyl)furfural (critical constants (Tc, Pc, ω)).

## Today's third update: the articles the maintainer downloaded (docs/decisions/2026-10-22-09-search-tools.md)

Seven articles the search found but scripts could not fetch were downloaded by the maintainer and read, text, tables
and figures. The earlier updates of today are in [MISSING_PROPERTIES_2026-10-22-2.md](MISSING_PROPERTIES_2026-10-22-2.md).

**Added** (check every value against the article, AGENTS.md rule 4):
- **Furfuryl alcohol and tetrahydrofurfuryl alcohol, critical constants, liquid heat capacity, liquid thermal
  conductivity**: Nikitin et al., Fluid Phase Equilib. 565 (2023) 113656, doi:10.1016/j.fluid.2022.113656, read in the
  authors' submitted manuscript on SSRN (doi:10.2139/ssrn.4213180, not peer reviewed; a new kind of source, "free
  copy"). Pulse heating: Tc = 660 ± 10 K and 668 ± 10 K, pc = 4.85 ± 0.19 and 4.18 ± 0.17 MPa (Tables 2 and 3). DSC heat
  capacities, Table 5 (3 %): measured values replace the predicted records. Thermal conductivities, Table 7 (8 %, from
  the measured thermal diffusivity). Both components now work with Peng–Robinson and SRK; their vapour-pressure curves
  run to the critical point, so THFA has a normal boiling point, 449.46 K (Lomba 2014's own curve: about 449.5 K), and
  its curve follows Lomba 2014 better than before (mean deviation +1.33 %, was +3.32 %). CHEPTA's acentric factors,
  from its own curves at 0.7 Tc, beyond the last measured vapour pressure: 0.443 and 0.417 (the authors: 0.466 and
  0.419). Furfuryl acetate, the fourth compound of the article, is not in CHEPTA: it can be added (AGENTS.md rule 8).
- **Methyl and ethyl lactate, critical constants, liquid heat capacity and liquid thermal conductivity**:
  Bogatishcheva et al., SSRN preprint 2026, doi:10.2139/ssrn.6083032 (not peer reviewed). Pulse heating (the esters
  decompose near their critical points): Tc = 612 and 617 K (1.5 %), pc = 3.73 and 3.32 MPa (4.5 %; Table 4's header
  prints "K", the values are MPa). With the critical point, the measured vapour-pressure sets miss the curve by more
  than the narrow misses accepted on 2026-10-14: methyl lactate, Lomba 2014 +3.37 % (was 2.96 %, stated 2.59 %); ethyl
  lactate, Resa 2010 +2.35 % (was 1.94 %, stated 1.70 %). The maintainer accepted them (2026-10-22: "i accept the
  error"). Both now work with Peng–Robinson and SRK; methyl lactate's curve now reaches 101.325 kPa, at 416.04 K (Lecat's
  measured 417.0 K), and ethyl lactate's at 426.76 K. CHEPTA's acentric factors: 0.416 and 0.455 (the authors: 0.435
  and 0.467). Heat capacities from their Eq. (24) and Table 5 (DSC, 3 %; 298-417 K and 298-398 K), replacing the
  predicted records; thermal conductivities from Eq. (27) and Table 7 (8.5 %).

**Held for the maintainer:**
- **Tripalmitin, heat of vaporization**: Verevkin and Nagrimanov, Thermo 2 (2022) 250-266, doi:10.3390/thermo2030018
  (CC BY 4.0), Table 1: 169.5 ± 4.2 kJ/mol at about 409 K (quartz-crystal microbalance, 384.9-433.2 K). One value only,
  so no record without a decision; and the slope of the ChemSep vapour-pressure record gives 189.7 kJ/mol there
  (Clapeyron, ideal gas), 12 % more. The article's recommended 211.6 kJ/mol at 298.15 K mixes it with correlation
  estimates.
- **Ethyl lactate, melting data**: Ashraf, MS thesis, St. John's University 2015, doi:10.57912/23844132 (open
  repository), Table 8 and Figures 27-29: the racemate (CHEPTA's ethyl lactate, CAS 97-64-3) melts at -25.64 °C (DSC
  peak; onset -31.08 °C) with 83.46 J/g (9.86 kJ/mol). The two enantiomers give -6.22 and -4.23 °C with 40.12 and
  159.4 J/g: mirror images have the same enthalpy of fusion, so the thesis's enthalpies are doubtful by a factor of
  four.

**Read, nothing for the gaps:**
- Samoilov et al., Molecules 28 (2023) 7483 (glycerol ethers): solketal only in its references.
- Silva et al., Molecules 30 (2025) 399 (undecanolactones): angelica lactones only in its references.
- García Santander et al., Fuel 92 (2012) 158-161 (Elsevier OA licence): TGA normal boiling points of triolein
  (419.10 °C) and tripalmitin (416.87 °C), no enthalpy; their vapour pressures are ChemSep's and are taken as they are.

**Still paywalled, carried over:** alpha-angelica lactone (critical point and heat capacity, Nikitin et al., Fluid
Phase Equilib. 2022, doi:10.1016/j.fluid.2022.113523: the same group posted its 2023 article on SSRN, so a preprint may
exist), levoglucosan (doi:10.1021/es302276t, doi:10.1021/je980119b), HMF and glycolic acid formation
(doi:10.1021/ie901012g, doi:10.1134/S0036024410080054), propionic and butyric acid dimerization (Clague and Bernstein
1969). CORE: not asked until it answers the maintainer.

**Where to start, by what it unlocks** (carried over):
1. Vapour pressures of the seven liquids in table A.
2. Liquid density and heat of vaporization of the same seven, then liquid heat capacity where it is predicted only.
3. Enthalpies of formation of the green platform chemicals that reactions start from (HMF, glycolic acid, methyl
   lactate, 2-MeTHF), and standard entropies for the measured ones without a Gibbs energy.
4. Melting data for the acids and esters in tables C and D: crystallization of the green acids.
5. Critical constants of table B: only for equations of state; activity models already work.
6. Transport properties last: no calculation uses them yet.

## The gaps, component by component

"Predicted only" means a group-contribution prediction stands in (tier "predicted").

### A. No vapour pressure (7)

| Component | Missing (no open data found) | Predicted only |
|---|---|---|
| alpha-Angelica lactone | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| Lactide | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, Gibbs energy of formation | - |
| Isosorbide | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| Levoglucosan | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | - |
| Dimethyl 2,5-furandicarboxylate | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| 2,5-Bis(hydroxymethyl)furan | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| 5-(Ethoxymethyl)furfural | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |

### B. No critical constants (with a vapour pressure) (7)

| Component | Missing (no open data found) | Predicted only |
|---|---|---|
| gamma-Valerolactone | critical constants (Tc, Pc, ω), ideal-gas heat capacity, surface tension, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, Gibbs energy of formation | - |
| Cyclopentyl methyl ether | critical constants (Tc, Pc, ω), ideal-gas heat capacity, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| 2,3-Butanediol | critical constants (Tc, Pc, ω), normal boiling point, ideal-gas heat capacity, surface tension, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | - |
| Limonene | critical constants (Tc, Pc, ω), normal boiling point, ideal-gas heat capacity, surface tension, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | liquid heat capacity |
| Glycerol carbonate | critical constants (Tc, Pc, ω), normal boiling point, liquid density, ideal-gas heat capacity, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| Solketal | critical constants (Tc, Pc, ω), normal boiling point, liquid heat capacity, ideal-gas heat capacity, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| Levoglucosenone | critical constants (Tc, Pc, ω), normal boiling point, liquid heat capacity, ideal-gas heat capacity, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |

### C. Nonvolatile components (21)

| Component | Missing (no open data found) | Predicted only |
|---|---|---|
| Terephthalic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion | liquid heat capacity |
| Lactic acid | surface tension, liquid viscosity, liquid thermal conductivity, Gibbs energy of formation | liquid heat capacity |
| 5-Hydroxymethylfurfural | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| D-Glucose | liquid density, surface tension, liquid viscosity, liquid thermal conductivity | liquid heat capacity |
| D-Fructose | liquid density, surface tension, liquid viscosity, liquid thermal conductivity | - |
| D-Sorbitol | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, Gibbs energy of formation | liquid heat capacity |
| Xylitol | surface tension, liquid viscosity, liquid thermal conductivity, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| Succinic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity | liquid heat capacity |
| Itaconic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | liquid heat capacity |
| Fumaric acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion | liquid heat capacity |
| Malic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| Citric acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity | liquid heat capacity |
| Glycolic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| D-Glucaric acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| 3-Hydroxypropionic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| 2,5-Furandicarboxylic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| Bis(2-hydroxyethyl) terephthalate | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| Diphenolic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| Erythritol | surface tension, liquid viscosity, liquid thermal conductivity | liquid heat capacity |
| D-Xylose | liquid density, surface tension, liquid viscosity, liquid thermal conductivity | liquid heat capacity |
| cis,cis-Muconic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |

### D. Other components with gaps (22)

| Component | Missing (no open data found) | Predicted only |
|---|---|---|
| Dichloromethane | surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | - |
| 2-Methoxyethanol | ideal-gas heat capacity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | - |
| Methyldiethanolamine | melting point and enthalpy of fusion | - |
| Diethyl carbonate | liquid thermal conductivity, vapour thermal conductivity | - |
| Methyl oleate | melting point and enthalpy of fusion | - |
| Methyl linoleate | vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion | - |
| Triolein | heat of vaporization, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | liquid heat capacity |
| Tripalmitin | heat of vaporization, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | liquid heat capacity |
| Furan | liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | liquid heat capacity |
| 2-Methylfuran | liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| 2-Methyltetrahydrofuran | ideal-gas heat capacity, surface tension, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| 1,3-Propanediol | ideal-gas heat capacity, surface tension, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, Gibbs energy of formation | - |
| Methyl levulinate | ideal-gas heat capacity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | - |
| Ethyl levulinate | ideal-gas heat capacity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | - |
| Butyl levulinate | ideal-gas heat capacity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | - |
| Levulinic acid | ideal-gas heat capacity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, Gibbs energy of formation | - |
| Tetrahydrofurfuryl alcohol | ideal-gas heat capacity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion | - |
| Methyl lactate | ideal-gas heat capacity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| Ethyl lactate | ideal-gas heat capacity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | - |
| Furfuryl alcohol | ideal-gas heat capacity, vapour viscosity, vapour thermal conductivity | - |
| gamma-Butyrolactone | surface tension, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | - |
| Isoamyl alcohol | liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | - |

### UNIQUAC r and q (51)

Dichloromethane, 2-Methoxyethanol, Terephthalic acid, Furan, 2-Methylfuran, 2-Methyltetrahydrofuran, 1,3-Propanediol, Methyl levulinate, Ethyl levulinate, Butyl levulinate, Levulinic acid, gamma-Valerolactone, Tetrahydrofurfuryl alcohol, Cyclopentyl methyl ether, 2,3-Butanediol, Methyl lactate, Ethyl lactate, Limonene, Furfuryl alcohol, gamma-Butyrolactone, Isoamyl alcohol, Lactic acid, 5-Hydroxymethylfurfural, D-Glucose, D-Fructose, D-Sorbitol, Xylitol, Succinic acid, Itaconic acid, Fumaric acid, Malic acid, Citric acid, Glycolic acid, D-Glucaric acid, 3-Hydroxypropionic acid, 2,5-Furandicarboxylic acid, Bis(2-hydroxyethyl) terephthalate, Diphenolic acid, Erythritol, D-Xylose, cis,cis-Muconic acid, Glycerol carbonate, Solketal, alpha-Angelica lactone, Lactide, Isosorbide, Levoglucosan, Dimethyl 2,5-furandicarboxylate, 2,5-Bis(hydroxymethyl)furan, Levoglucosenone, 5-(Ethoxymethyl)furfural.

### Modified UNIFAC 2.0 groups (20)

Oxygen, Nitrogen, Hydrogen, Methane, Ethylene, Carbon monoxide, Carbon dioxide, Hydrogen sulfide, Argon, Ammonia, Sulfur dioxide, Nitrous oxide, Formaldehyde, Hydrogen peroxide, Maleic anhydride, 2,5-Furandicarboxylic acid, Dimethyl 2,5-furandicarboxylate, 2,5-Bis(hydroxymethyl)furan, Levoglucosenone, Helium.

## Recommendation: values you find or measure yourself (carried over from 2026-10-21 and the earlier files of 2026-10-22, still to decide)

The idea (the maintainer, 2026-10-21): find the missing values yourself and add them with a tag "given by CHEPTA"
instead of a paper, so that nothing is infringed.

A tag for values the maintainer adds is a good idea, and the rules are the maintainer's to change. The tag should say
where each number really comes from. Calling it "given by CHEPTA" when it comes from a paper would not change the legal
position, because what matters is whether the number may be used, not whose name is on it. And it would cost two
things: reviewers could no longer check the number, which is the reason for the open-source rule, and it would
misattribute the work.

On the legal side (not legal advice): single measured values are facts, and in most countries facts are not protected
by copyright. Copying whole tables or databases can be restricted (the EU database right), and the commercial databanks
(DIPPR, DDB, DECHEMA) forbid it by their licence contracts whatever the law says about facts; those stay out.

**Proposed:** one new tier, for example `contributed`, whose record always says which of three kinds it is.

| Kind | Example | What the record carries |
|---|---|---|
| Own measurement | your lab measures the viscosity of isosorbide | Best: publish it on Zenodo (free, CC BY, a DOI) with the method and the uncertainty. It is then an open source like any other, CHEPTA cites it, and anyone can reuse it. |
| From a paywalled article | a table in J. Chem. Eng. Data that you can read | The full citation and table, marked "paywalled, checked by the maintainer". This needs a change to rule 1 of AGENTS.md (today paywalled numbers are not used). ChemSep and the thermo library cite paywalled literature this way. Unpaywall first: a legal free copy makes it an ordinary open source (`open_copy.py`). |
| Engineering estimate | your judgement, or a correlation you choose | The basis of the estimate. The interface shows it with a warning, as it shows the predicted tier. |

The interface would show all three, so users see what they rely on.

**How values could come in**, once the tier is decided:
- one small JSON file per component (in `validation/data/contributed/`), with the value or the points, the
  temperatures, the kind, the citation and the uncertainty; the scripts fit it like measured data (section 3 of
  [DATA_RULES.md](../DATA_RULES.md)) and the record says `tier: "contributed"`;
- until then, **My data** (proposal 0012) already lets anyone give a vapour pressure or another property for their
  own work, without changing the databank.

**Decisions needed:** (1) a new tier, and its name; (2) whether numbers from paywalled articles are allowed with the
citation; (3) whether CHEPTA should publish its own measurements on Zenodo.
