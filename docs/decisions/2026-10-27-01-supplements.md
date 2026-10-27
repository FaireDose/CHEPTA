# 2026-10-27: Free supplements of paywalled articles, open theses, and the values of two search reports

## What the maintainer asked for

- Two reports from another agent: `CHEPTA_missing_data_search_2026-10-27.md` and
  `CHEPTA_supplement_audit_2026-10-27.md`.
- "i have few more missing properties in these two reports. i found out with another agent that we can have also
  supplements that are free from paywalled papers. usually all the supplements are free"

## What was done

Every value below was read in its source in this project. The reports were used as leads only (AGENTS.md rule 2).

### Added

- **alpha-Angelica lactone, liquid heat capacity** (was missing).
  - Source: Nikitin et al., Fluid Phase Equilib. 561 (2022) 113523. The article is paywalled; its supplement is free
    (Elsevier, mmc1.pdf).
  - Table S1: 285 values, 298.6-440.6 K, 0.1 MPa, Ur = 0.03 (95 %); purity 99.1 % (GC).
  - All 285 pairs of the report agree with the supplement's text layer. The record fits them within 0.49 % and is held
    to the stated 3 %.
- **Levoglucosenone, liquid heat capacity** (was missing).
  - Source: Andreeva et al., Ind. Eng. Chem. Res. 60 (2021) 17183-17194. Paywalled; its supporting information is free
    on figshare, CC BY-NC 4.0.
  - Table S2: 70 values, 306.5-375.5 K, U = 0.02 Cp (k = 2). The record fits them within 0.93 %.
  - The caption says "at T = 298.15 K" over a temperature series; the tabulated temperatures are used.
- **Levoglucosenone, enthalpy of formation** (was missing): liquid, -383.3 ± 1.5 kJ/mol at 298.15 K.
  - Source: Andreeva, doctoral thesis, University of Rostock (2021), open in RosDok, Table D.1.
  - The value was measured in the 2021 article above (combustion, ΔcH° -2835.3 ± 1.2 kJ/mol). The record cites both.
  - The gas-phase values of the same row rest on quantum chemistry and are not used.
- **Lactide, liquid heat capacity** (was missing).
  - Source: Buchholz, doctoral thesis, Magdeburg (2018), open in MPG.PuRe, Table 7.1.
  - (RS)-lactide melt: 291.1, 293.1 and 294.1 J/(mol K) at 408.7, 418.7 and 428.8 K; the "Abs dev." column, 2.2-3.2,
    is taken as the uncertainty.
  - The record covers those 20 K only.
  - The (S)-lactide melt of the same table is the enantiomer, 0.9-2.7 % higher at the same temperatures. It is kept in
    the file as a cross-check, not used.
- **Lactide, Gibbs energy of formation** (was missing): solid, -567.2 kJ/mol.
  - Source: the NIST WebBook's DL-lactide page (CAS 615-95-2), S°(solid, 1 bar) = 213.1 J/(mol K) (Kulagina, Lebedev et
    al. 1980 and 1982).
  - That page holds the same crystal as the component's own page: the same ΔfH°(solid) -792.1 ± 1.7 kJ/mol, and a
    melting point of 397 K against the component's 397.5 K.
  - Declared as another form of the component (`OTHER_FORMS` in formation_data.py; `--only` added to fetch one
    component).
  - The record counts the 1980 and 1982 listings of the same ΔfH° as two values. They are probably one measurement;
    the value is unchanged.
- **BHET, melting point and enthalpy of fusion** (were missing).
  - Source: Shariatmadar Tehrani et al., ACS Omega 11 (2026) 59039-59053, open access (CC BY-NC-ND 4.0), Table 3 (read at
    Europe PMC).
  - 109.6 ± 0.5 °C (382.75 K) and 34.0 ± 1.2 kJ/mol, the authors' DSC: the peak temperature, not the onset.
  - The QSPR and COSMO columns are predictions and are not used.
  - Cross-check in the same table: DMT 31.5 kJ/mol against NIST 31.6 kJ/mol.

### Held for the maintainer

- **HMF, enthalpy of formation:** liquid, -417.6 ± 1.4 kJ/mol at 298.15 K.
  - Source: Andreeva's thesis, p. 58, from Verevkin et al. 2009, doi:10.1021/ie901012g.
  - HMF is a crystal at 298.15 K (it melts at 308.5 K), so formation_data.py leaves the liquid value out. But CHEPTA's
    own records of HMF, a nonvolatile component, take the liquid at 298.15 K as their reference state.
  - To decide: use the liquid value for HMF.
- **Methyl lactate, enthalpy of formation:** liquid, -646.5 ± 1.1 kJ/mol.
  - Source: the free supplement of doi:10.1016/j.jct.2018.07.029, Table S3, marked "this work".
  - The supplement does not say how it was obtained. The same table's ethyl lactate value, -684.2 ± 2.3, matches
    CHEPTA's record from the measured combustion (-684.15). For methyl lactate the ThermoML record of the article
    holds no combustion, and the title names "complementary experimental and computational methods".
  - It may rest on a computed gas-phase value. To decide after a look at the paywalled article: the maintainer could
    download it.
- **Glycolic acid, enthalpy of formation:** the report's value is in a copy on ResearchGate, which scripts cannot open,
  so it was not read here.
  - To decide: whether a published version posted on ResearchGate counts as an open copy (DATA_RULES section 1 names
    the publisher's open-access version and manuscripts in repositories).
- **Tripalmitin:** the raw QCM series of its free supplement has a pressure heading that does not match its own equation
  (the report infers micro-pascals). Still held, as on 2026-10-22.

### Read, nothing new

- **Levoglucosan:** the supplements of May et al. 2012 (doi:10.1021/es302276t; aerosol volatility) and Rocha et al. 2013
  (doi:10.1021/je400207t; the crystal, already in CHEPTA through the ThermoML Archive).
- **Levoglucosan, Kabo et al. 2015:** its supplement (doi:10.1016/j.jct.2015.01.005, mmc1.doc) could not be converted to
  text here.
- **HMF:** the 2009 supplement holds a density and a heat capacity below the melting temperature.
- **Levoglucosenone:** the transpiration vapour pressures in the 2021 supplement are of other compounds.

### The tools and rules

- **`open_copy.py --supplements`:** finds an article's supplementary files, free even where the article is paywalled.
  - ACS supporting information through the figshare API (by DOI); Elsevier files under the article's PII, from
    Crossref.
  - MDPI and RSC refuse scripts. Wiley, Springer and Taylor & Francis name their files on the article page only. For
    all of these the tool gives the article page.
  - Run on the seven paywalled articles named in the gap notes: four supplements found and read (above).
- **New source kind "open thesis":** `make_sources.py`, test/sources.test.js.
  - Two sources by the same first author and year (Andreeva 2021: an article and a thesis) are told apart by the first
    word of the journal or university.
- **`formation_data.py`** reads values printed in open articles and theses from
  `validation/data/pure/formation/article_<id>_*.json`.
- **DATA_RULES:**
  - section 1, step 4 of the search: the supplement;
  - section 1, open theses as open sources;
  - sections 11 and 13 updated to match.
- **Not changed, noted:** a heat-capacity record built from values above the 1 % target says "used because the only
  alternative is a prediction", also where no prediction exists (angelica lactone, lactide, levoglucosenone; older records not
  checked). The wording is to be corrected separately.

## Still open

- The three held values above.
- The list of articles whose servers refused the scripts, with links, for the maintainer to download (next week). Run
  `--supplements` on them first, so only what has no free supplement remains.
