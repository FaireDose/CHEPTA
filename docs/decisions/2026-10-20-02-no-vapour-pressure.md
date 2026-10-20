# 2026-10-20: the ten components held for want of an open vapour pressure

- **Asked:** "for the other 10 i want combined both A and B": an open group-contribution vapour pressure and the user's
  own. After the research below the maintainer did not accept the prediction ("a factor of 2 for vle data is huge")
  and chose the user's own vapour pressure only. Paid handbooks (Perry's, CRC and the like) stay out: the maintainer
  kept AGENTS.md rule 1 as it is ("None").
- **The research on group-contribution vapour pressures** (not used):
  - **Open methods:**
    - SIMPOL.1 (Pankow and Asher 2008, ACP 8, 2773, CC BY) covers all ten;
    - EVAPORATION (Compernolle et al. 2011, ACP 11, 9431, CC BY) leaves out aromatic compounds, so it cannot do the
      furans.
  - **Paywalled, with no free copy in Unpaywall:** the methods based on the boiling point (Nannoolal et al. 2008,
    Moller et al. 2008, Myrdal and Yalkowsky 1997).
  - **SIMPOL.1 checked on 109 CHEPTA components of C, H and O** with vapour-pressure records, 273–393 K:
    - median error a factor of 1.8;
    - within a factor of 2 for 57 %, of 3 for 74 %, of 10 for 93 %;
    - far off for the ring types of the held components:

      | Ring type | Measured relatives | Error |
      |---|---|---|
      | cyclic carbonates | ethylene and propylene carbonate | about 100–250× too high |
      | lactones | GVL, GBL | 30–40× too high |
      | furans | furan, 2-methylfuran, furfural, furfuryl alcohol | 8–12× too low |

  - **Corrections and anchors:**
    - A correction per ring type fitted to those relatives would have brought the leave-one-out errors to 1.6–6×.
    - Anchoring at a measured boiling point does not help above about 420 K.
    - The only boiling points of the held components are from supplier catalogues and a compilation, which are not
      used.
- **Done:**
  - **Glycerol carbonate has open measured vapour pressures after all.** The ThermoML Archive names it "glycerine
    carbonate", which the earlier name search missed. It is now a measured component:
    - vapour pressure from Verevkin et al., Fluid Phase Equilib. 268 (2008) 1, 330–398 K (20 values), and Chernyak and
      Clements, J. Chem. Eng. Data 49 (2004) 1180, 430–456 K (9 values), pooled because they agree (mean deviations
      +0.13 % and −0.00 %; the largest deviation, 6.8 %, is at the lowest pressure, stated to about 7 %);
    - liquid heat capacity, 10 measured values (283–373 K, 0.55 %);
    - heat of vaporization by Clapeyron;
    - no measured critical constants;
    - no normal boiling point (the measured pressures end at 0.9 kPa);
    - no open liquid density.
  - **The other nine have a "no open data" marker for the vapour pressure** (`vapourPressure_missing`, with the
    sources searched; `build_no_vp` in `measured_components.py`): solketal, α-angelica lactone, lactide, isosorbide,
    levoglucosan, dimethyl FDCA, BHMF, levoglucosenone and EMF.
    - They are liquids for the activity models, not nonvolatile.
    - Activity coefficients, liquid-liquid and solid-liquid equilibria work.
    - Bubble and dew points, flashes and vapour-liquid diagrams refuse them, with the sources searched and the advice
      to add a vapour pressure in My data, which replaces the marker.
    - `pure().props()` gives the liquid's properties, takes the phase as liquid, and gives no enthalpy.
  - **Their records:**
    - liquid densities: solketal (5 values, 293–323 K) and α-angelica lactone (8 values, 288–323 K), ThermoML Archive;
    - melting data: lactide (WebBook) and levoglucosan (ThermoML Archive);
    - nothing else open. No liquid heat capacity is predicted: the Ruzicka–Domalski groups of these molecules are not
      transcribed, and several (the ketal and acetal carbons) are not in the method.
  - **Levoglucosan's melting data are those of its high-temperature crystal.** It melts at 454–455 K with 2.9–3.3
    kJ/mol, and below 384–385 K the stable crystal changes into it with 23–25 kJ/mol. The record says that solid-liquid
    equilibrium below 384 K, without that transition, overpredicts the solubility (`FUSION_NOTES` in `fusion_data.py`).
  - **Identities from PubChem** for levoglucosenone (CID 699486) and EMF (CID 12648080, CAS 1917-65-3), which the
    chemicals library does not have.
  - **Modified UNIFAC 2.0 groups for seven:**
    - α-angelica lactone and lactide: the same as DDBST's;
    - isosorbide: DDBST's, two THF rings, so two H over;
    - glycerol carbonate: the cyclic carbonate subgroup, as for propylene carbonate;
    - levoglucosan: as for Cyrene, the same bicyclic skeleton;
    - EMF: FURFURAL, as for HMF;
    - solketal: DDBST's assignment as the thermo library lists it gives C5H13O3, not C6H12O3, so the dioxolane ring is
      built from CY-CH2O, CHO and CY-C (`DDBST_FAILS_BALANCE`).

    BHMF, dimethyl FDCA and levoglucosenone cannot be described, and each says why (`NO_GROUPS`).
  - **The atom balance allows one H over per ring subgroup** (THF, (CH2)2CB, FURFURAL), and at least one as before,
    for the database's groups and for the user's own (`src/thermo/formula.js`). This was needed for isosorbide's two
    THF rings.
- **Tests:**
  - **New:** `test/no-vapour-pressure.test.js`.
  - **Changed, with a comment in each:**
    - counts: 171 components;
    - lists: the measured components, the search results, the components without a report case;
    - the boiling-point and typical-state checks, which a component without a vapour pressure cannot pass, check it
      separately.
- **Still open** (DECISIONS open items):
  - open measured liquid vapour pressures of the nine;
  - liquid heat capacities of all but glycerol carbonate;
  - groups for BHMF, dimethyl FDCA and levoglucosenone.
