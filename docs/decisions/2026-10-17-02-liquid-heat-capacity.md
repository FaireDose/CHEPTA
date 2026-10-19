# 2026-10-17: liquid and ideal-gas heat capacity of the components without one

- **Asked:** "go to the next point which was to look for the missing properties for the chemicals you installed in
  the last batches" (the open item "missing properties" of DECISIONS.md; liquid heat capacity first).
- **Done:** 19 of the 21 components without a liquid heat capacity now have one. The rule "measured before predicted"
  (DATA_RULES section 10, 2026-10-16) now applies to every component, not only the nonvolatile ones
  (`cp_measured_or_predicted` in `measured_components.py`, also called by `fit_properties.py`):
  - **9 from measured values whose stated uncertainty is above the 1 % target.** These values were already in the
    repository (the ThermoML Archive files). Each record states the uncertainty it is held to
    (`stated_uncertainty_percent`):

    | Component | Stated uncertainty | Values | Range |
    |---|---|---|---|
    | levulinic acid | 2.5 % | 144 | 303–374 K |
    | methyl levulinate | 2.5 % | 143 | 303–374 K |
    | ethyl levulinate | 2.5 % | 143 | 303–374 K |
    | butyl levulinate | 2.5 % | 144 | 303–374 K |
    | GVL | 3.9 % | 20 | 265–359 K |
    | 2-MeTHF | 2.0 % | 11 | 288–323 K |
    | 1,3-propanediol | 4.2 % | 47 | 283–353 K |
    | isoamyl alcohol | 2.4 % | 45 | 123–347 K |
    | diethyl carbonate | 5.2 % | 156 | 202–373 K (8 values left out by the fit) |

  - **10 predicted by group additivity** (Ruzicka and Domalski 1993, tier "predicted"): furan, 2-methylfuran,
    furfuryl alcohol, THFA, CPME, methyl lactate, ethyl lactate, limonene, triolein and tripalmitin.
    - For this, 8 groups and ring corrections were transcribed from the page images of the free NIST reprints, with
      the equivalences of part I, Table 2. Each source table is named in
      `validation/data/gc/ruzicka_domalski_1993.json`:
      - part I, Table 5: Cd-(H)(C), Cd-(C)2, C-(H)2(C)(Cd), C-(H)(C)2(Cd);
      - part I, Table 6: the substituted cyclopentane and the cyclohexene ring corrections;
      - part II, Table 8: C-(H)(C)2(O) (ether, ester);
      - part II, Table 9: the tetrahydrofuran ring correction.
    - Against the single measured values the repository has (WebBook):

      | Component | Measured | Predicted |
      |---|---|---|
      | furan | 114.6 J/(mol K) at 298.15 K | +0.7 % |
      | 2-methylfuran | 143.7 J/(mol K) at 298.15 K | −1.5 % |
      | furfuryl alcohol | 204 J/(mol K) at 298.15 K | −2.2 % |
      | THFA | 190 J/(mol K) at 298.15 K | +0.5 % |
      | limonene | 249.4 J/(mol K) at 293.3 K | +5.1 % |
      | tripalmitin | 1665 at 343 K and 1753.1 at 338.8 K (5 % apart) | +4.3 % and −1.6 % |

- **Confirmed by the maintainer** ("i confirm the groups"): the 8 transcribed groups, and the ether and ester carbon
  C-(H)(C)2(O) used beyond its range. The authors fitted it at 130–170 K only; THFA, CPME and the triglycerides need it,
  so it is used up to 380 K, where it holds on the liquids that have it:
  - on isopropyl acetate (ChemSep record), within 8.1 % from 220 to 380 K (−0.4 % at 300 K);
  - on 2-MeTHF, 3.4–4.5 % below the 11 measured values.

  Counting it as the alcohol carbon instead would be 8–10 % high on isopropyl acetate. Each record that uses it says
  so (`ether_check` in `predict_cp.py`; DATA_RULES section 10).
- **Terephthalic acid: a nonvolatile liquid up to 400 °C** (the maintainer: "you can assume the melting is at 400 and
  keep it liquid until then"):
  - **No open melting temperature or liquid heat capacity was found.** The ECHA registration dossier, which is free to
    read, reports sublimation at 402–404 °C and melting at 427 °C in a sealed tube; it is context, not a number used.
  - **It is now built by `measured_components.py` as a nonvolatile component** (like HMF), no longer from ChemSep.
    ChemSep's liquid records began above 700 K, and its vapour pressure, critical constants and vapour records are
    dropped.
  - **Its liquid heat capacity is predicted** (all four groups exist in the method) from 230 to 673.15 K. That is 73 K
    beyond the authors' 100 K extrapolation, by the maintainer's choice, and the record says so.
  - **It now works in energy balances.** A 10 % terephthalic acid / 90 % water feed flashes at 470 K and 8 bar, and the
    PH flash returns 470 K.
- **Dichloromethane: still no liquid heat capacity over a temperature range.** The maintainer doubted this. The search
  (2026-10-17) found that measurements over a range exist, but none is open:
  - **Harrison and Moelwyn-Hughes**, Proc. R. Soc. A 239 (1957) 230, measured 244–303 K. The paper is behind the
    Royal Society paywall, and Unpaywall knows no free copy.
  - **Moseeva et al. (1978)** measured 5–300 K. The WebBook prints only their 298.15 K value.
  - **Chorazewski et al.**, Ind. Eng. Chem. Res. 54 (2015) 720, measured 293–313 K, doi:10.1021/ie5038903.
    Paywalled, and no free copy is known to Unpaywall or QUB's repository.
  - **The critically evaluated equation** is in Zábranský et al., *Heat Capacity of Liquids*, JPCRD Monograph 6
    (1996). It is a book, not a free NIST reprint. Its free Supplement I (JPCRD 30, 1199, 2001) lists
    dichloromethane under the monograph only, with no new equation, and Supplement II (2010) has no free copy.

  The open values are single temperatures, 95.6–105.5 J/(mol K) at 292.5–303.2 K, from six articles (WebBook,
  ThermoML Archive). The Ruzicka–Domalski method has no single-carbon groups. **Pending** (open items): a record from
  those single values over 292.5–303.2 K, or a source the maintainer can point to.
- **Ideal-gas heat capacity of the volatile components without one** (the maintainer: "search first more in
  literature … for the remaining ones do the A"):
  - **The search found no open values.**
    - GVL: the open *Molecules* 30 (2025) 399 (CC BY) covers other lactones only.
    - Levulinic acid (J. Phys. Chem. A 2010), ethyl levulinate (Proc. Combust. Inst. 2019), the levulinate esters
      (Thermochim. Acta 2018) and 2-MeTHF (Phys. Chem. Chem. Phys. 2022; J. Chem. Thermodyn. 2022) are paywalled, and
      Unpaywall knows no free copy of any of them.
    - The Burcat–Ruscic database (free to read) has 1,3-propanediol, furfuryl alcohol, levulinic acid and limonene,
      but its terms forbid including any part of it in commercial software without the authors' permission. CHEPTA's
      users may be commercial, so it is not used.
  - **Option A, implemented in `src/thermo/pure.js`.** Where the liquid heat capacity, the heat of vaporization (and,
    with Peng–Robinson residuals, the vapour pressure) all apply from 298.15 K, the ideal-gas enthalpy follows from
    the liquid by Kirchhoff's path:
    - h_IG(T) = ∫cp_L dT + g(T) − g(298.15 K), with g = ΔHvap − h_R,sat;
    - cp_IG = dh_IG/dT.

    The reference stays the ideal gas at 298.15 K. Outside that range it refuses, saying why. Vapour and liquid
    differ by exactly ΔHvap at every temperature, so evaporation balances are right; only the sensible heat of
    superheated vapour carries the error.
  - **Accuracy, checked by hiding the record of every CHEPTA liquid that has one** (86 of them; check script in the
    session, test in `test/derived-ideal-gas.test.js`):
    - median 5 % at 300 K, 90 % within 22 %;
    - within 1–4 % for CoolProp fluids;
    - 10–30 % for several ChemSep alcohols and acids, whose heat-capacity and heat-of-vaporization records do not
      agree with each other;
    - within 2.6 % for furan and 2-methylfuran, whose records are made like those of the components that use it
      (measured vapour pressures through Clapeyron).
  - **Now derived for 8 components:**

    | Component | Range |
    |---|---|
    | 2-MeTHF | 288–323 K |
    | 1,3-propanediol | 292–353 K |
    | GVL | 265–358 K |
    | CPME | 259–315 K |
    | methyl lactate | 283–351 K |
    | ethyl lactate | 275–360 K |
    | limonene | 238–376 K |
    | furfuryl alcohol | 298–380 K |

    These ranges end below the boiling points, so vapour enthalpies near boiling are still refused.
  - **Still none for 7:** 2-methoxyethanol, the three levulinates, levulinic acid, THFA and 2,3-butanediol. Their
    liquid records do not reach 298.15 K together.
  - **Pending** (open items): an open group-contribution method for the ideal-gas heat capacity, for these 7 and for
    the full temperature range of all 15.
- **Also changed by the scripts:**
  - `docs/PURE_DATA.md` now labels records fitted to measured values "measured" (they were shown as "ChemSep") and
    predicted ones "predicted (p)";
  - `make_sources.py` added the article ids that records already cite, from pair data added since they were last
    written.
- **Second round, the other properties** (the maintainer: "take your suggestion and take the 6 and in the same time look
  in this .md file", a research report by another assistant; its leads were checked here, not copied):
  - **A filter bug, found from that report.** ThermoML Archive surface tensions name the phases liquid and gas (719
    rows) or liquid and air (1047). The script dropped every row with a gas phase, meant for vapour densities, so it
    dropped surface tensions measured against the vapour. Now only liquid-density, heat-capacity and viscosity rows with
    a gas phase are left out (DATA_RULES section 3).
  - **"Measured before predicted" for every property** (the suggestion the maintainer took): where no open values meet
    the target, measured values above it make the record, held to the largest stated uncertainty, at three
    temperatures or more (`fit_or_marker` in `measured_components.py`; DATA_RULES section 10). The test checks each
    such record against that uncertainty.
  - **New records:**

    | Component | Property | Values | Range | Fit | Stated uncertainty |
    |---|---|---|---|---|---|
    | THFA | surface tension | 25 | 278–338 K | 0.014 % | within target |
    | CPME | surface tension | 9 (1 left out, −1.6 %) | 283–353 K | 0.58 % | within target |
    | methyl lactate | surface tension | 25 | 278–338 K | 0.47 % | up to 1.1 % |
    | ethyl lactate | surface tension | 25 | 278–338 K | 0.42 % | up to 1.2 % |
    | methyl levulinate | surface tension | 25 | 278–338 K | 0.27 % | up to 3.4 % |
    | 2-methoxyethanol | surface tension | 15 | 298–393 K | 1.6 % | up to 2.9 % |
    | GVL | liquid viscosity | 7 | 293–323 K | 0.32 % | up to 4.2 % |
    | lactic acid | liquid density | 3 | 293–298 K | 0.32 % | up to 7.2 % |
    | furfuryl alcohol | liquid viscosity | 18 | 288–373 K | 0.92 % | 0.007 mPa·s (k = 2) |

    - Lactic acid's density is weak: three values within 5 K, so the record is a constant, 1203 kg/m³, and refuses
      outside 293–298 K.
    - **Furfuryl alcohol viscosity:** Simić et al., Energies 14 (2021) 7769, doi:10.3390/en14227769, CC BY 4.0, Table 2,
      the x1 = 0.0000 rows (component 1 is furfural), 98 wt % purity
      (`validation/data/pure/measured/article_furfuryl-alcohol_simic2021.json`).
  - **New fusion data: D-glucose and D-fructose.**
    - Values: glucose 448 ± 7 K and 40 ± 5 kJ/mol; fructose 420 ± 7 K and 35 ± 4 kJ/mol.
    - Source: Chua et al., Food Biophys. 17 (2022) 181, doi:10.1007/s11483-021-09707-6, CC BY 4.0, Table 2, fast scanning
      calorimetry. The published version was read in the TU Dortmund repository, hdl:2003/40946.
    - The authors find the lower DSC values lowered by decomposition before melting.
  - **Leads from the report that were not taken:**
    - **Lomba et al.**, Green Chem. 13 (2011) 2062: the supplement could not be retrieved (404, then 403), and Unpaywall
      knows no free copy.
    - **Sharma et al.**, J. Chem. Eng. Data 69 (2024) 3747: paywalled, no free copy.
    - **Nikitin et al. 2020–2023** (critical constants of GVL, furfuryl alcohol and THFA): no open copy verified.
    - **The levulinic acid ideal-gas coefficients** (Reichert et al. 2010 supplement): CC BY-NC, so not usable in
      software that may be commercial.
    - **Xylitol and erythritol density** (Materials 10 (2017) 444, CC BY): one liquid temperature each in the text, not
      yet read from the tables.
    - **The 1,3-propanediol enthalpy of fusion** at 249 K: 3.5 K from its triple point, beyond the 3 K rule.
    - **Levulinate conductivity** from measured diffusivities: needs a derivation, not done.

    These remain open items.
- **Third round (2026-10-18), the maintainer's answers.**
  - **Lomba et al. 2011** (Green Chem. 13, 2062): the maintainer downloaded the supplementary information from the
    publisher's site, where it is free to read; the article itself is paywalled. Its tables 6 and 8 give surface
    tensions (278–333 K) and viscosities (278–338 K) of five liquids.
    - Taken only where CHEPTA had no record:

      | Component | Property | Values | Range | Fit |
      |---|---|---|---|---|
      | furfuryl alcohol | surface tension | 23 | 278–333 K | 0.28 % |
      | levulinic acid | surface tension | 15 | 298–333 K | 0.21 % |
      | levulinic acid | viscosity | 17 | 298–338 K | 0.41 % |
      | ethyl levulinate | surface tension | 23 | 278–333 K | 0.22 % |
      | ethyl levulinate | viscosity | 25 | 278–338 K | 0.54 % |
      | butyl levulinate | surface tension | 23 | 278–333 K | 0.18 % |
      | butyl levulinate | viscosity | 25 | 278–338 K | 0.33 % |

    - **No uncertainties.** The supplement states none; they are in the paywalled article, so they are not used
      (DATA_RULES section 1).
    - **A new kind of source,** "free supplement" (`make_sources.py`, `test/sources.test.js`, the Library view).
    - **Not taken:** its densities, vapour pressures and furfuryl alcohol viscosities, because those records already
      exist (DATA_RULES section 1: take a number only where it is missing).
  - **Xylitol and erythritol liquid density** (the maintainer: "read the values"), Höhlein et al., Materials 10 (2017)
    444, CC BY 4.0.
    - **What the article prints:** the measured points are in a figure only. Table 4 gives the liquid density at
      120 °C and the expansion coefficient from the melting point to 150 °C, from a linear fit the authors state is
      within 0.3 % of their points.
    - **What the record is:** that linear fit, evaluated at the listed temperatures, and not read off the figure
      (`article_<id>_hohlein2017.json` says how):
      - xylitol: 363–423 K;
      - erythritol: 391–423 K, where the fit with fewest terms that meets 1 % is a constant, 1283 kg/m³.
    - **Both refuse at 25 °C,** below their melting points.
    - **Not taken:** the liquid thermal conductivities, one temperature each.
  - **1,3-propanediol enthalpy of fusion** (the maintainer: "is ok"): 11.4 kJ/mol (Jabrane, Létoffé et al. 1998, DSC,
    at 249 K) with the triple point 245.5 K. It is taken with a 3.5 K window for this component only
    (`NEAR_TM_K_FOR` in `fusion_data.py`); the record says so.
  - **Dichloromethane liquid heat capacity** (the maintainer: "look also at methylene chloride, but use this values
    you found because dichlormethane has a lower boiling point").
    - **The search under that name found nothing new.** The ThermoML search already included "methylene chloride",
      and a web search for open data under that name found no temperature series.
    - **The record:** the mean of the eight open single values, 100.3 J/(mol K), a constant over 292.5–303.2 K, held
      to their largest deviation from it, 5.2 % (`cp_single_values` in `measured_components.py`).
    - **Left out:** Kurbatov 1948 (129.3), a mean over −76 to 41 °C, not a value at 298 K.
    - **Extended to the normal boiling point, 313.1 K** (the maintainer: "yes for dichloremethane"). The constant is
      used 10 K beyond the measured temperatures, and the record says so. Above 313.1 K (a liquid under pressure) it
      refuses.
  - **Ideal-gas heat capacity by group contribution: on hold,** with the idea recorded in the open items.
  - **Also fixed:** records fitted to values of articles outside the ThermoML Archive were named "NIST TRC ThermoML
    Archive" with its access text (furfuryl alcohol viscosity, Simić et al.). They now name "an article outside the
    archive" with that article's access (`ThermoML.origin` in `measured_components.py`).
- **Tests:**
  - `test/properties.test.js`: levulinic acid's viscosity, and the xylitol and erythritol densities, join the list of
    records that do not reach the temperature the test picks (each with a comment).
  - `test/sources.test.js`: the list of source kinds gains "free supplement".
  - `test/user-data.test.js`: the user-record example used lactic acid as "no open liquid density"; it now has one, so
    the example uses succinic acid, which has none. The behaviour checked is unchanged.
  - `test/properties.test.js` holds such a record to its stated uncertainty, where the source says why. This is
    section 10's rule; before, the test had only the 1 % target.
  - Levulinic acid's heat capacity joins its density in the list of records that do not reach the temperature the
    test picks (its liquid records do not overlap).
  - The ideal-gas check (`test/properties.test.js`) counts a derived ideal-gas heat capacity as data, and expects a
    vapour state beyond its range to be refused with the reason.
  - Terephthalic acid joins the measured-data components listed in `test/component-registry.test.js`.
  - New: `test/derived-ideal-gas.test.js`.
  - `npm test`: 1093 pass, 1 to-do (2026-10-18).
