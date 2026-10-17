# 2026-10-17: liquid heat capacity of the components without one

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

- **For the maintainer to confirm:** the ether and ester carbon C-(H)(C)2(O) was fitted by the authors at 130–170 K
  only. THFA, CPME and the triglycerides need it, so it is used up to 380 K. It holds there on the liquids that have
  it:
  - on isopropyl acetate (ChemSep record), within 8.1 % from 220 to 380 K (−0.4 % at 300 K);
  - on 2-MeTHF, 3.4–4.5 % below the 11 measured values.

  Counting it as the alcohol carbon instead would be 8–10 % high on isopropyl acetate. Each record that uses it says
  so (`ether_check` in `predict_cp.py`; DATA_RULES section 10).
- **Still without a liquid heat capacity:**
  - **dichloromethane:** the method has no group for a single-carbon compound; its open values are single
    temperatures, 292–303 K;
  - **terephthalic acid:** no open source has its melting temperature, so where its liquid exists is not known.
- **Not yet usable in energy balances:** a volatile component's liquid enthalpy is h(ideal gas) − ΔHvap. So 15
  volatile components still need an **ideal-gas heat capacity**: 2-methoxyethanol, 2-MeTHF, 1,3-propanediol, the
  three levulinates, levulinic acid, GVL, THFA, CPME, 2,3-butanediol, the two lactates, limonene and furfuryl
  alcohol. Until then their enthalpies are refused with the reason. How to fill it is the next decision (open items).
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
  - `npm test`: 1090 pass, 1 to-do.
