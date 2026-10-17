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
- **Tests:**
  - `test/properties.test.js` holds such a record to its stated uncertainty, where the source says why. This is
    section 10's rule; before, the test had only the 1 % target.
  - Levulinic acid's heat capacity joins its density in the list of records that do not reach the temperature the
    test picks (its liquid records do not overlap).
  - The ideal-gas check (`test/properties.test.js`) counts a derived ideal-gas heat capacity as data, and expects a
    vapour state beyond its range to be refused with the reason.
  - Terephthalic acid joins the measured-data components listed in `test/component-registry.test.js`.
  - New: `test/derived-ideal-gas.test.js`.
  - `npm test`: 1093 pass, 1 to-do.
