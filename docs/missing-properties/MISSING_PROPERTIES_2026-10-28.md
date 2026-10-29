# Missing pure-component properties (2026-10-28)

What CHEPTA's databank still lacks besides vapour-liquid pairs, on 2026-10-28 (177 components). Made by `validation/python/missing_properties.py`; one file per update, named with its day, so the earlier files stay and the gaps can be followed over time (docs/DATA_RULES.md section 12). The pairs are in [DATA_WANTED.md](../DATA_WANTED.md).

Each gap is a "no open data" marker in `src/data/components.json` with the sources that were searched (`searched`). Start from that list before looking again, so the same sources are not searched twice.

## Summary

| Property | Missing | Predicted only | What it blocks today |
|---|---|---|---|
| Vapour pressure | 7 | - | Everything with a vapour: bubble and dew points, flashes, diagrams, distillation. The worst gap. |
| Critical constants (Tc, Pc, ω) | 15 | - | Peng–Robinson and SRK, for either phase. Activity models with an ideal-gas vapour still work. |
| Normal boiling point | 11 | - | Only where it is shown; the vapour-pressure record still works over its measured range. |
| Liquid density | 26 | - | Volumes, pump work, velocities; mass-to-volume conversions. |
| Liquid heat capacity | 6 | 27 | Energy balances: heaters, coolers, exchangers. Predicted values are within about 5 % at 300 K, worse for alcohols and polyols at higher temperature. |
| Ideal-gas heat capacity | 26 | - | Covered for the volatile ones by Kirchhoff's path from the liquid records; missing outright for those without a vapour pressure. |
| Heat of vaporization | 9 | - | Energy balances with evaporation or condensation. |
| Surface tension | 39 | - | Nothing in a calculation yet; column hydraulics later. |
| Liquid viscosity | 37 | - | Nothing in a calculation yet (shown in Properties); pumps, pipes and film coefficients later. |
| Liquid thermal conductivity | 51 | - | Nothing in a calculation yet; exchanger film coefficients from fluid properties later. |
| Vapour viscosity | 34 | - | Nothing in a calculation yet. |
| Vapour thermal conductivity | 35 | - | Nothing in a calculation yet. |
| Melting point and enthalpy of fusion | 32 | - | Solid solubility, crystallization, freezing checks. |
| Enthalpy of formation | 20 | - | Heats of reaction in the reactors (proposal 0010): a component without it can only be in a conversion or yield reactor with a given duty. |
| Gibbs energy of formation | 36 | - | Equilibrium constants from formation data (equilibrium and Gibbs reactors); heats of reaction still work with the enthalpy alone. |
| UNIQUAC r and q | 52 | - | UNIQUAC for those components (NRTL works). |
| Modified UNIFAC 2.0 groups | 21 | - | Prediction for those components; small gases and some rings cannot be described by the method. |

## What changed since the previous file (components.json at `575ff5d`)

- New components: Biphenyl, Cumene hydroperoxide, p-Terphenyl.

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

## The full-text search of 2026-10-25

`validation/data/searches/2026-10-25-fulltext.json`, made with `validation/python/fulltext_search.py` (docs/DATA_RULES.md section 1, "How to search for a missing number", step 3). CORE (the full texts of open repositories: theses, reports, accepted manuscripts) asked for every gap of the properties a calculation needs, with the key the maintainer obtained under CORE's personal licence (2026-10-23). 167 gaps of 51 components; CORE found works for 108 of them; 891 works returned (up to 20 per name form), 371 of them with a text CORE serves or a PDF that could be read; 30 gaps had a passage where a name of the component and the property appear together. Each passage was read on 2026-10-25. One measured set was found, limonene's own vapour pressures up to 101.4 kPa in an open thesis (Gowda 2018), held for the maintainer because it lies outside the stated uncertainty of the pooled curve. The other passages name the component as a reactant, product, solvent or ligand, give a value of a mixture or another substance, quote a handbook or a supplier, or give pressures over the crystal (levoglucosan, lactide).

- CORE: asked, with a key (a network secret of the environment, api.core.ac.uk): one query per name form and gap, single words joined by AND and OR (CORE ignores a group that holds an AND inside an OR), up to 20 works each; paced at one query per 7 s
- Europe PMC: not asked again (asked on 2026-10-22)
- OpenAlex: not asked again (asked on 2026-10-22)

| Component | Property | CORE: found, read, with a passage | What they held |
|---|---|---|---|
| 2-Methoxyethanol | melting point and enthalpy of fusion | 32, 6, 1 | none of the pure compound |
| Terephthalic acid | melting point and enthalpy of fusion | 141, 2, 1 | none of the pure compound |
| Methyl oleate | melting point and enthalpy of fusion | 502, 4, 1 | none of the pure compound |
| Limonene | melting point and enthalpy of fusion | 222, 3, 3 | none of the pure compound |
| Limonene | normal boiling point | 113, 5, 3 | Gowda, MEng thesis, Stellenbosch University 2018 (open, SUNScholar): limonene's own vapour pressures, 40.0-101.4 kPa at 417.0-450.9 K (Table 8.12, +-0.32 K), which reach 101.325 kPa; held for the maintainer, since they lie 2.0 % below CHEPTA's curve, beyond their stated 0.88 % (validation/data/searches/held/article_limonene_gowda2018.json). The normal boiling point of 449.65 K the thesis prints is Yaws' handbook's (its reference [59]): not taken |
| Isoamyl alcohol | melting point and enthalpy of fusion | 37, 4, 1 | none of the pure compound |
| D-Glucose | liquid density | 72362, 4, 4 | none of the pure compound |
| D-Fructose | liquid density | 4044, 2, 2 | none of the pure compound |
| D-Sorbitol | liquid density | 1614, 7, 3 | none of the pure compound |
| Succinic acid | liquid density | 718, 9, 6 | none of the pure compound |
| Itaconic acid | liquid density | 205, 2, 1 | none of the pure compound |
| Fumaric acid | liquid density | 210, 7, 3 | none of the pure compound |
| Fumaric acid | melting point and enthalpy of fusion | 59, 1, 1 | none of the pure compound |
| Malic acid | liquid density | 1226, 1, 1 | none of the pure compound |
| Citric acid | liquid density | 2352, 5, 3 | none of the pure compound |
| Glycolic acid | liquid density | 651, 3, 3 | SRNL reports on glycolic acid (OSTI, doi:10.2172/982752 and doi:10.2172/1019026): the neat acid was not measured, the values are the vendor's specification sheet: not taken |
| D-Xylose | liquid density | 2094, 9, 2 | none of the pure compound |
| cis,cis-Muconic acid | liquid density | 45, 6, 3 | none of the pure compound |
| Glycerol carbonate | normal boiling point | 32, 8, 1 | none of the pure compound |
| Solketal | critical constants (Tc, Pc, ω) | 6, 5, 1 | acetone's critical temperature, not solketal's: none |
| Lactide | liquid density | 1114, 6, 6 | a UFSC thesis (2014, L,L-lactide with CO2 and propane at high pressure) measured L-lactide's melting (90.2 degC, 17.02 kJ/mol), a different crystal from CHEPTA's DL-lactide; its critical constants are Joback estimates, and the lactide vapour pressures it quotes (Emel'yanenko et al. 2009, 60-80 degC) are below the melting point, over the crystal: none |
| Lactide | liquid heat capacity | 59, 2, 2 | none of the pure compound |
| Lactide | normal boiling point | 20, 4, 1 | none of the pure compound |
| Isosorbide | vapour pressure | 18, 2, 1 | none of the pure compound |
| Isosorbide | liquid density | 102, 1, 1 | none of the pure compound |
| Levoglucosan | vapour pressure | 33, 3, 3 | Booth et al., Atmos. Chem. Phys. 11 (2011) 655-665 (CC BY 3.0): pressures over the crystal, 298-318 K (Knudsen effusion, +-40 %), and a sub-cooled liquid value at 298 K derived from them with melting data, not measured on the liquid: no liquid record. It names Epshtein et al., Zh. Prikl. Khim. 37 (1964) 2543, measured at 468-528 K, above the melting point: no free copy known |
| Levoglucosan | heat of vaporization | 7, 6, 4 | a 2025 student thesis (aerosol partitioning with ammonium sulphate, FIGAERO-CIMS) gives 31 +- 6 kJ/mol, which its author says vapour wall losses distort; the 52 kJ/mol of Booth et al. 2011 is their sublimation enthalpy minus an enthalpy of fusion, not measured: none |
| Levoglucosan | normal boiling point | 9, 4, 4 | a 2001 Iowa State thesis lists 384 degC in a table whose cited reference is a sorption paper (no traceable source); levoglucosan decomposes: not taken |
| Dimethyl 2,5-furandicarboxylate | liquid density | 2, 1, 1 | none of the pure compound |
| 5-(Ethoxymethyl)furfural | liquid density | 14, 1, 1 | none of the pure compound |

No passage with a name and the property together, in the open full texts searched (137): 2-Methoxyethanol (Gibbs energy of formation); Methyldiethanolamine (melting point and enthalpy of fusion); Terephthalic acid (liquid density); Methyl linoleate (melting point and enthalpy of fusion); Triolein (heat of vaporization); Tripalmitin (heat of vaporization); 2-Methylfuran (enthalpy of formation); 2-Methylfuran (Gibbs energy of formation); 2-Methyltetrahydrofuran (melting point and enthalpy of fusion); 2-Methyltetrahydrofuran (enthalpy of formation); 2-Methyltetrahydrofuran (Gibbs energy of formation); 1,3-Propanediol (Gibbs energy of formation); Methyl levulinate (melting point and enthalpy of fusion); Methyl levulinate (Gibbs energy of formation); Ethyl levulinate (melting point and enthalpy of fusion); Ethyl levulinate (Gibbs energy of formation); Butyl levulinate (melting point and enthalpy of fusion); Butyl levulinate (Gibbs energy of formation); Levulinic acid (Gibbs energy of formation); gamma-Valerolactone (Gibbs energy of formation); gamma-Valerolactone (critical constants (Tc, Pc, ω)); Tetrahydrofurfuryl alcohol (melting point and enthalpy of fusion); Cyclopentyl methyl ether (melting point and enthalpy of fusion); Cyclopentyl methyl ether (enthalpy of formation); Cyclopentyl methyl ether (Gibbs energy of formation); Cyclopentyl methyl ether (critical constants (Tc, Pc, ω)); 2,3-Butanediol (melting point and enthalpy of fusion); 2,3-Butanediol (Gibbs energy of formation); 2,3-Butanediol (critical constants (Tc, Pc, ω)); 2,3-Butanediol (normal boiling point); Methyl lactate (melting point and enthalpy of fusion); Methyl lactate (enthalpy of formation); Methyl lactate (Gibbs energy of formation); Ethyl lactate (melting point and enthalpy of fusion); Ethyl lactate (Gibbs energy of formation); Limonene (Gibbs energy of formation); Limonene (critical constants (Tc, Pc, ω)); Isoamyl alcohol (Gibbs energy of formation); Lactic acid (Gibbs energy of formation); 5-Hydroxymethylfurfural (liquid density); 5-Hydroxymethylfurfural (enthalpy of formation); 5-Hydroxymethylfurfural (Gibbs energy of formation); D-Sorbitol (Gibbs energy of formation); Xylitol (enthalpy of formation); Xylitol (Gibbs energy of formation); Itaconic acid (melting point and enthalpy of fusion); Itaconic acid (Gibbs energy of formation); Malic acid (melting point and enthalpy of fusion); Malic acid (enthalpy of formation); Malic acid (Gibbs energy of formation); Glycolic acid (enthalpy of formation); Glycolic acid (Gibbs energy of formation); D-Glucaric acid (liquid density); D-Glucaric acid (melting point and enthalpy of fusion); D-Glucaric acid (enthalpy of formation); D-Glucaric acid (Gibbs energy of formation); 3-Hydroxypropionic acid (liquid density); 3-Hydroxypropionic acid (melting point and enthalpy of fusion); 3-Hydroxypropionic acid (enthalpy of formation); 3-Hydroxypropionic acid (Gibbs energy of formation); 2,5-Furandicarboxylic acid (liquid density); 2,5-Furandicarboxylic acid (enthalpy of formation); 2,5-Furandicarboxylic acid (Gibbs energy of formation); Bis(2-hydroxyethyl) terephthalate (liquid density); Bis(2-hydroxyethyl) terephthalate (melting point and enthalpy of fusion); Bis(2-hydroxyethyl) terephthalate (enthalpy of formation); Bis(2-hydroxyethyl) terephthalate (Gibbs energy of formation); Diphenolic acid (liquid density); Diphenolic acid (melting point and enthalpy of fusion); Diphenolic acid (enthalpy of formation); Diphenolic acid (Gibbs energy of formation); cis,cis-Muconic acid (melting point and enthalpy of fusion); cis,cis-Muconic acid (enthalpy of formation); cis,cis-Muconic acid (Gibbs energy of formation); Glycerol carbonate (liquid density); Glycerol carbonate (melting point and enthalpy of fusion); Glycerol carbonate (enthalpy of formation); Glycerol carbonate (Gibbs energy of formation); Glycerol carbonate (critical constants (Tc, Pc, ω)); Solketal (liquid heat capacity); Solketal (melting point and enthalpy of fusion); Solketal (enthalpy of formation); Solketal (Gibbs energy of formation); Solketal (normal boiling point); alpha-Angelica lactone (vapour pressure); alpha-Angelica lactone (heat of vaporization); alpha-Angelica lactone (liquid heat capacity); alpha-Angelica lactone (melting point and enthalpy of fusion); alpha-Angelica lactone (enthalpy of formation); alpha-Angelica lactone (Gibbs energy of formation); alpha-Angelica lactone (critical constants (Tc, Pc, ω)); alpha-Angelica lactone (normal boiling point); Lactide (vapour pressure); Lactide (heat of vaporization); Lactide (Gibbs energy of formation); Lactide (critical constants (Tc, Pc, ω)); Isosorbide (heat of vaporization); Isosorbide (liquid heat capacity); Isosorbide (melting point and enthalpy of fusion); Isosorbide (enthalpy of formation); Isosorbide (Gibbs energy of formation); Isosorbide (critical constants (Tc, Pc, ω)); Isosorbide (normal boiling point); Levoglucosan (liquid density); Levoglucosan (liquid heat capacity); Levoglucosan (critical constants (Tc, Pc, ω)); Dimethyl 2,5-furandicarboxylate (vapour pressure); Dimethyl 2,5-furandicarboxylate (heat of vaporization); Dimethyl 2,5-furandicarboxylate (liquid heat capacity); Dimethyl 2,5-furandicarboxylate (melting point and enthalpy of fusion); Dimethyl 2,5-furandicarboxylate (enthalpy of formation); Dimethyl 2,5-furandicarboxylate (Gibbs energy of formation); Dimethyl 2,5-furandicarboxylate (critical constants (Tc, Pc, ω)); Dimethyl 2,5-furandicarboxylate (normal boiling point); 2,5-Bis(hydroxymethyl)furan (vapour pressure); 2,5-Bis(hydroxymethyl)furan (liquid density); 2,5-Bis(hydroxymethyl)furan (heat of vaporization); 2,5-Bis(hydroxymethyl)furan (liquid heat capacity); 2,5-Bis(hydroxymethyl)furan (melting point and enthalpy of fusion); 2,5-Bis(hydroxymethyl)furan (enthalpy of formation); 2,5-Bis(hydroxymethyl)furan (Gibbs energy of formation); 2,5-Bis(hydroxymethyl)furan (critical constants (Tc, Pc, ω)); 2,5-Bis(hydroxymethyl)furan (normal boiling point); Levoglucosenone (liquid heat capacity); Levoglucosenone (melting point and enthalpy of fusion); Levoglucosenone (enthalpy of formation); Levoglucosenone (Gibbs energy of formation); Levoglucosenone (critical constants (Tc, Pc, ω)); Levoglucosenone (normal boiling point); 5-(Ethoxymethyl)furfural (vapour pressure); 5-(Ethoxymethyl)furfural (heat of vaporization); 5-(Ethoxymethyl)furfural (liquid heat capacity); 5-(Ethoxymethyl)furfural (melting point and enthalpy of fusion); 5-(Ethoxymethyl)furfural (enthalpy of formation); 5-(Ethoxymethyl)furfural (Gibbs energy of formation); 5-(Ethoxymethyl)furfural (critical constants (Tc, Pc, ω)); 5-(Ethoxymethyl)furfural (normal boiling point).

## The gaps, component by component

"Predicted only" means a group-contribution prediction stands in (tier "predicted").

### A. No vapour pressure (7)

| Component | Missing (no open data found) | Predicted only |
|---|---|---|
| alpha-Angelica lactone | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| Lactide | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | - |
| Isosorbide | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| Levoglucosan | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | - |
| Dimethyl 2,5-furandicarboxylate | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| 2,5-Bis(hydroxymethyl)furan | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| 5-(Ethoxymethyl)furfural | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |

### B. No critical constants (with a vapour pressure) (8)

| Component | Missing (no open data found) | Predicted only |
|---|---|---|
| gamma-Valerolactone | critical constants (Tc, Pc, ω), ideal-gas heat capacity, surface tension, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, Gibbs energy of formation | - |
| Cyclopentyl methyl ether | critical constants (Tc, Pc, ω), ideal-gas heat capacity, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| 2,3-Butanediol | critical constants (Tc, Pc, ω), ideal-gas heat capacity, surface tension, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | - |
| Limonene | critical constants (Tc, Pc, ω), ideal-gas heat capacity, surface tension, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | liquid heat capacity |
| Glycerol carbonate | critical constants (Tc, Pc, ω), normal boiling point, liquid density, ideal-gas heat capacity, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| Solketal | critical constants (Tc, Pc, ω), normal boiling point, liquid heat capacity, ideal-gas heat capacity, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| Levoglucosenone | critical constants (Tc, Pc, ω), normal boiling point, ideal-gas heat capacity, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | - |
| p-Terphenyl | critical constants (Tc, Pc, ω), normal boiling point, liquid density, ideal-gas heat capacity, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | liquid heat capacity |

### C. Nonvolatile components (21)

| Component | Missing (no open data found) | Predicted only |
|---|---|---|
| Terephthalic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion | liquid heat capacity |
| Lactic acid | surface tension, liquid viscosity, liquid thermal conductivity, Gibbs energy of formation | liquid heat capacity |
| 5-Hydroxymethylfurfural | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, Gibbs energy of formation | liquid heat capacity |
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
| Bis(2-hydroxyethyl) terephthalate | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| Diphenolic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| Erythritol | surface tension, liquid viscosity, liquid thermal conductivity | liquid heat capacity |
| D-Xylose | liquid density, surface tension, liquid viscosity, liquid thermal conductivity | liquid heat capacity |
| cis,cis-Muconic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |

### D. Other components with gaps (23)

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
| Cumene hydroperoxide | liquid viscosity, melting point and enthalpy of fusion | - |

### UNIQUAC r and q (52)

Dichloromethane, 2-Methoxyethanol, Terephthalic acid, Furan, 2-Methylfuran, 2-Methyltetrahydrofuran, 1,3-Propanediol, Methyl levulinate, Ethyl levulinate, Butyl levulinate, Levulinic acid, gamma-Valerolactone, Tetrahydrofurfuryl alcohol, Cyclopentyl methyl ether, 2,3-Butanediol, Methyl lactate, Ethyl lactate, Limonene, Furfuryl alcohol, gamma-Butyrolactone, Isoamyl alcohol, Lactic acid, 5-Hydroxymethylfurfural, D-Glucose, D-Fructose, D-Sorbitol, Xylitol, Succinic acid, Itaconic acid, Fumaric acid, Malic acid, Citric acid, Glycolic acid, D-Glucaric acid, 3-Hydroxypropionic acid, 2,5-Furandicarboxylic acid, Bis(2-hydroxyethyl) terephthalate, Diphenolic acid, Erythritol, D-Xylose, cis,cis-Muconic acid, Glycerol carbonate, Solketal, alpha-Angelica lactone, Lactide, Isosorbide, Levoglucosan, Dimethyl 2,5-furandicarboxylate, 2,5-Bis(hydroxymethyl)furan, Levoglucosenone, 5-(Ethoxymethyl)furfural, p-Terphenyl.

### Modified UNIFAC 2.0 groups (21)

Oxygen, Nitrogen, Hydrogen, Methane, Ethylene, Carbon monoxide, Carbon dioxide, Hydrogen sulfide, Argon, Ammonia, Sulfur dioxide, Nitrous oxide, Formaldehyde, Hydrogen peroxide, Maleic anhydride, 2,5-Furandicarboxylic acid, Dimethyl 2,5-furandicarboxylate, 2,5-Bis(hydroxymethyl)furan, Levoglucosenone, Helium, Cumene hydroperoxide.
## This update: free supplements of paywalled articles and open theses (docs/decisions/2026-10-27-01-supplements.md)

The previous file is [MISSING_PROPERTIES_2026-10-25-2.md](MISSING_PROPERTIES_2026-10-25-2.md). Two search reports of
2026-10-27 (another agent's, given by the maintainer) were followed up; every value was read in its source here.

- **Found:** alpha-angelica lactone and levoglucosenone liquid heat capacities (free supplements of paywalled articles),
  levoglucosenone's and HMF's enthalpies of formation (Andreeva's open thesis; measured in the group's 2021 and 2009 articles), the lactide
  melt's heat capacity (Buchholz's open thesis), lactide's Gibbs energy of formation (the WebBook's DL-lactide entropy),
  BHET's melting data (an open-access article).
- **HMF's enthalpy of formation:** the liquid, -417.6 +- 1.4 kJ/mol (Andreeva's thesis, from Verevkin et al. 2009), by
  the maintainer's decision: HMF is a crystal at 298.15 K, but its records take the liquid as reference.
- **Held for the maintainer:** methyl lactate's -646.5 +- 1.1 kJ/mol (a free supplement marks it "this
  work" without saying how it was obtained); glycolic acid (the value is in a copy on ResearchGate, not opened here).
- **New tool:** `open_copy.py --supplements` (ACS on figshare, Elsevier by PII). On the seven paywalled articles named in
  the gap notes it found four supplements; their findings are above.

**Found, held for the maintainer:**
- **Limonene, vapour pressure up to 101.4 kPa (it would give the normal boiling point)**: Gowda, *Phase equilibrium of
  limonene, p-cymene, indane, butylbenzene and 1,2,3-trimethylbenzene at subatmospheric conditions*, MEng thesis,
  Stellenbosch University (2018), open in SUNScholar (https://scholar.sun.ac.za/handle/10019.1/103666), Table 8.12:
  17 boiling temperatures of pure (R)-limonene (Sigma-Aldrich, 98.38 wt % by the author's GC) in a dynamic still,
  40.0-101.4 kPa at 417.0-450.9 K, stated to +-0.32 K (0.88 % in pressure). The values were read in CORE's text of the
  PDF; CORE's and the university's servers refuse scripts, so the PDF must be downloaded and every value checked
  (`validation/data/searches/held/article_limonene_gowda2018.json`). The set lies 2.0 % below CHEPTA's curve all
  along. Pooled with the six published sets, it misses the curve by +1.38 % (stated 0.88 %), and Wu 2019 then by
  -2.49 % (stated 1.62 %; accepted at -1.83 % on 2026-10-14), so the script stops (DATA_RULES section 3). Were both
  accepted, the curve would reach 450.9 K and give a normal boiling point of 450.47 K; the other measured ones are
  449.3-449.6 K (Wu 2019), 450.34 K (Sun 2011) and 450.2-450.8 K from the curves of Ngema 2012 and Clara 2009. The
  thesis is not peer reviewed as a journal article is, and its author saw limonene degrade in the still after about 8 h.
  Since this update limonene has a normal boiling point without the thesis (450.20 K, below), so the set only decides
  whether the curve moves by about 2 %.
- Carried over: tripalmitin's heat of vaporization (Verevkin and Nagrimanov 2022) and ethyl lactate's melting data
  (Ashraf 2015), as in the previous file.

**Read, nothing for the gaps:** levoglucosan's vapour pressure in Booth et al., Atmos. Chem. Phys. 11 (2011) 655
(CC BY 3.0) is over the crystal (298-318 K, +-40 %), and its "sub-cooled liquid" value is derived from it; the 31 kJ/mol
of a 2025 student thesis on levoglucosan aerosols is, its author says, distorted by wall losses; a UFSC thesis (2014)
measured the melting of L-lactide, not CHEPTA's DL-lactide; an SRNL report on glycolic acid prints the vendor's
values; the other passages name the component as a reactant, product, solvent or ligand.

**New lead without a free copy:** levoglucosan's liquid vapour pressure, 468-528 K, Epshtein, Durynina and Pashinkin,
Zh. Prikl. Khim. 37 (1964) 2543 (named by Booth et al. 2011).

**Still paywalled, carried over:** alpha-angelica lactone (critical point and heat capacity, Nikitin et al., Fluid
Phase Equilib. 2022, doi:10.1016/j.fluid.2022.113523), levoglucosan (doi:10.1021/es302276t, doi:10.1021/je980119b),
glycolic acid formation (doi:10.1134/S0036024410080054) and methyl lactate formation (doi:10.1016/j.jct.2018.07.029), propionic and butyric acid
dimerization (Clague and Bernstein 1969). CORE was asked for them on 2026-10-25: it holds their metadata only, no
copy (`open_copy.py` no longer counts such records as copies).

**For next week** (the maintainer, 2026-10-25): the list of articles whose servers refused the scripts, with their
links, for the maintainer to download.

**Where to start, by what it unlocks** (carried over):
1. Vapour pressures of the seven liquids in table A.
2. Liquid density and heat of vaporization of the same seven, then liquid heat capacity where it is predicted only.
3. Enthalpies of formation of the green platform chemicals that reactions start from (glycolic acid, methyl lactate,
   2-MeTHF), and standard entropies for the measured ones without a Gibbs energy.
4. Melting data for the acids and esters in tables C and D: crystallization of the green acids.
5. Critical constants of table B: only for equations of state; activity models already work.
6. Transport properties last: no calculation uses them yet.

## This update: the components of the reactor examples (docs/decisions/2026-10-28-02-reactors-round-2.md)

- **Biphenyl** and **cumene hydroperoxide**: from ChemSep, taken as they are. Cumene hydroperoxide has no open liquid
  viscosity (ChemSep, the WebBook and the ThermoML Archive have none), and no Modified UNIFAC 2.0 groups (its
  hydroperoxide group is not one of the method's subgroups).
- **p-Terphenyl** (Rawlings and Ekerdt's "triphenyl", Example 4.5; the isomer is not named there, the para isomer is
  the maintainer's choice) is in no open databank. From measured data: the vapour pressure (12 values of the ThermoML
  Archive), the enthalpy of vaporization (Clapeyron, with the calorimetric value of Zhao 2008 as the check), the melting
  data (WebBook) and the enthalpy and Gibbs energy of formation of the crystal (WebBook). Its liquid heat capacity is
  predicted (Ruzicka and Domalski; the ring-to-ring carbon counted as CB-(C)). No open liquid density, ideal-gas heat
  capacity, critical constants, transport properties or surface tension: "no open data" with the sources searched.
  Example 4.5 at 1033 K therefore cannot run with an energy balance until an ideal-gas heat capacity is found.
