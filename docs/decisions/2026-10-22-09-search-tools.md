# 2026-10-22-09: the search tools of proposal 0014 (steps 1 and 2), the search order, and a new search

## What the maintainer decided

- "at 162 i go first for points 1 and 2. after i close all you re-make the data gahthering rules and look again for
  the missing ones": proposal 0014 is accepted for steps 1 (the wider open-copy search) and 2 (the full-text search
  for candidates). Steps 3 to 5 (the uncertainty of fitted records, a second reading of tables, the evidence
  checklist) are not decided.
- On the DTU paper (Tsivintzelis, Kontogeorgis and Panayiotou 2017): "they are citing the source and this paper is
  for free". Agreed: an open paper's measured values, with the measuring article named, are taken. That paper has no
  dimerization constant per acid to take (below).

- Solketal's vapour-pressure curve of Türck et al. (ACS Omega 2026), held for the maintainer: "for 2 yes". It is
  added, read off the article's Figure 7 (below).
- CORE: "for 3 we wait", until CORE answers on its licence.
- "make the data_rules clear as it would start from the beginning to have a lean go": the search procedure of
  DATA_RULES section 1 is written again as seven plain steps, starting from what is already known, and the "no open
  data" note is explained where it first appears (the scripts call it a marker; the rules now say note throughout).

## What was made

### The rules (docs/DATA_RULES.md, section 1)

- **How to search for a missing number:** one order, seven steps (the marker's `searched`; the databases and the
  ThermoML Archive through `gap_report.py`; the full texts of open articles; a free copy of every article that has
  the number; the open literature beyond the indexes; supplier data for single constants; "no open data" with
  everything searched). Every step is recorded, found or not: in the marker's `searched`, and for the full-text
  search in `validation/data/searches/2026-10-22-fulltext.json`, which `missing_properties.py` shows next to each gap
  (the `searched` lists are written by several scripts; one file per search keeps the record in one place).
- **Measured values in modelling and simulation papers** (the maintainer's idea of 2026-10-22), written into the rules
  from docs/decisions/2026-10-22-07-missing-round3.md, with one addition from today's reading: a model's fitted
  parameters and a simulation's results are not data, even when they carry the name of a physical quantity (the NRHB
  association energy of Tsivintzelis et al. 2017; the Monte Carlo dimerization enthalpies of Wasik et al. 2025 are a
  cross-check only).
- **Free copies:** `open_copy.py --all` asks Unpaywall, OpenAlex and CORE; `--fetch` keeps only a real PDF.

### The tools (validation/python; described in docs/DATA_RULES.md section 13)

- `open_copy.py` (step 1): `--all` and `--fetch`; the old `open_copy()` and `describe()` are unchanged, so
  `gap_report.py --open-copies` works as before.
- `fulltext_search.py` (step 2), new: Europe PMC, OpenAlex and CORE (`--indexes`).
- The maintainer asked (2026-10-22) that the description of the tools be in the data rules, not only here: it is
  section 13 of docs/DATA_RULES.md.

### Tested

- `open_copy.py --fetch` on the DOIs of 2026-10-22:
  - Wasik et al. 2025: the publisher refuses scripts (403) and the TU/e page is HTML, but a submitted manuscript on
    HAL (hal-05064689) was found and saved as a PDF. It was not known before.
  - Baird et al. 2019 and Tsivintzelis et al. 2017: the landing pages of Aalto and DTU Orbit were followed to their
    PDFs (`citation_pdf_url`), which those servers serve to browsers only (403 to scripts). The script names the
    link, for a person to download. Four "200 OK" answers that were HTML pages were rejected, as they should be.
  - Chao and Zwolinski 1978 (J. Phys. Chem. Ref. Data): no copy in any index, as expected (the NIST reprints are in
    none of them).
- `fulltext_search.py`: levoglucosenone's vapour pressure (Baird et al. 2019) is not found through Europe PMC, which
  does not index Int. J. Thermophys. With the maintainer's OpenAlex key (a network secret, added the same day),
  OpenAlex's full-text search lists Baird et al. 2019 first for levoglucosenone and vapour pressure: the validation
  the proposal named passes. CORE has not run (below).

## The new search (docs/missing-properties/MISSING_PROPERTIES_2026-10-22-2.md)

- **Full-text search, Europe PMC:** 176 gaps; 78 with at least one passage where a name and the property appear
  together; every passage read (`validation/data/searches/2026-10-22-fulltext.json`). Nearly all name the component
  as a reactant, product or solvent, or give a value of a mixture.
- **Found, then added with the maintainer's agreement:** solketal's vapour-pressure curve (Türck et al., ACS Omega 2026, CC BY 4.0),
  20-100 °C, in a figure only, measured with a fuel vapour-pressure tester. Not added: whether a curve read off a
  graph may make a record, and to what uncertainty, is the maintainer's decision.
- **Found, not usable:** isosorbide's DSC melting onset of 45 °C (Hammami et al., Molecules 2025), without an
  enthalpy of fusion; property tables of reviews without the measuring article (lactide, BHMF, isosorbide, glycerol
  carbonate), which are not taken.
- **Measured, paywalled, no free copy:** alpha-angelica lactone's critical point and heat capacity (Nikitin et al.
  2022); levoglucosan's liquid volatility (May et al. 2012) and sublimation pressures (Oja and Suuberg 1999). The 15
  other articles that the markers call paywalled: no new copy with `open_copy.py --all`.
- **Propionic, acrylic and butyric acid dimers:** still no open constant. Tsivintzelis et al. (2017) give a range of
  60-65 kJ/mol for all short acids (Clague and Bernstein 1969, paywalled); the J. Phys. Chem. Ref. Data review of
  Chao, Hall, Marsh and Wilhoit (1986, free NIST reprint) treats methanoic and ethanoic acid only.
- **Data added:** solketal's vapour pressure (below); levoglucosenone's records came with the previous pull request ([#161](https://github.com/FaireDose/Fugacity/pull/161)).

- **Full-text search, OpenAlex** (later the same day, with the key): 1185 articles found, 271 downloaded and read
  (the others' publishers refuse scripts). Nothing new usable: DL-malic acid's melting point (129.71 °C; Marques et
  al., Arab. J. Chem. 2020) and cis,cis-muconic acid's (197 °C) without an enthalpy of fusion; levoglucosan's only
  liquid measurement (Enstein et al., Zh. Prikl. Khim. 1964) named in Suuberg and Oja's open DOE report of 1997, but
  shown there as a line only, and the original has no known free copy.
- The 2022 correction to Baird et al., found by OpenAlex: checked, below.

## Solketal's vapour pressure (added)

- Source: Türck et al., ACS Omega 11 (2026) 24063-24074, doi:10.1021/acsomega.5c12056, CC BY 4.0; Figure 7, left panel;
  a Herzog HVP 972 fuel vapour-pressure tester, 10 mL in a sealed cell, n = 3, solketal of at least 98 %.
- Read off the graph: the figure image of the article's open files (690 x 290 px) by the marker centres, with the
  gridlines as the scale (one pixel = 0.043 kPa). Seven values, 40-100 °C: 0.435, 0.696, 1.213, 1.915, 3.326, 4.674 and
  7.065 kPa (`validation/data/pure/measured/article_solketal_acsomega2026.json`).
- Uncertainty: 16 % (the only error bar visible, at 80 °C: 2.79 to 3.87 kPa) combined with the reading resolution:
  16-19 %. The record (DIPPR 101, 313-373 K) meets the values within 6.8 % and is held to 19 %.
- Left out, with the reason in the file and the record: the readings at 20 and 30 °C (0.174 and 0.196 kPa), where one
  pixel is a quarter of the value and the two are nearly equal although the curve above 40 °C rises 1.6-1.8 times per
  10 K (the lower end of the tester's range).
- Checks: the same instrument's methanol and ethanol at 100 °C (about 352 and 225 kPa, read off the right panel)
  against CoolProp (353.7 and 224.2 kPa); the article's ratios at 100 °C give 7.06 and 7.0 kPa for solketal.
- The heat of vaporization follows from the curve (Clapeyron, ideal-gas vapour, as for every component without
  critical constants). No normal boiling point: the curve ends at 7 kPa, and the WebBook's 461.7 K is from a supplier
  catalogue (DATA_RULES section 1).
- `make_sources.py` now also matches a citation whose author has an accent (Türck) against its folded rule (Turck).
- `test/no-vapour-pressure.test.js`: solketal left the list of liquids without a vapour pressure; the examples that
  used it now use alpha-angelica lactone (a new data source made the old test wrong, DATA_RULES section 9).

## The 2022 correction to Baird et al.

Downloaded by the maintainer (Int. J. Thermophys. 43 (2022) 184). It corrects only Table 4, the PC-SAFT parameters, after
an error in the authors' PC-SAFT code; it says nothing changes in the other tables. The measured vapour pressures and
densities (Tables 13 and 19), which levoglucosenone's records use, are unchanged: the records stay.

## Not done, and why

- **CORE.** Its terms ask software that "might be monetised now or in the future" to contact it; CHEPTA's MIT licence
  allows anyone to do that. The maintainer wrote to CORE on 2026-10-22 (the personal licence, and an AI assistant
  reading the passages, a person checking each value). Until CORE answers, the search runs without it.

## The articles the maintainer downloaded (2026-10-22)

The maintainer: "for 163 i attach all the docs you ask. read also charts but also text". Seven articles the search had
found but scripts could not fetch. Each was read, text, tables and figures; the details are in
[MISSING_PROPERTIES_2026-10-22-3.md](../missing-properties/MISSING_PROPERTIES_2026-10-22-3.md) and in the search record
(`validation/data/searches/2026-10-22-fulltext.json`, the `downloaded` entries).

- **Added.**
  - Furfuryl alcohol and THFA: critical constants, liquid heat capacities and liquid thermal conductivities, from
    Nikitin et al., Fluid Phase Equilib. 565 (2023) 113656, read in the submitted manuscript on SSRN
    (`article_furfuryl-alcohol_nikitin2023.json`, `article_thfa_nikitin2023.json`).
  - Methyl and ethyl lactate: liquid heat capacities and liquid thermal conductivities, from Bogatishcheva et al., SSRN
    preprint 2026 (`article_*_bogatishcheva2026.json`). Their heat capacities are the authors' Eq. (24) with Table 5's
    constants at 298.15 K and every 10 K; their raw points are in a supplement that is not in the preprint file. Their
    critical constants, as the maintainer decided (below).
  - The measured heat capacities (3 %) replace the predicted records of all four, by "measured before predicted". The
    thermal conductivities (8-8.5 %) are records held to that uncertainty, as "no open values meet the target".
- **The lactates' critical constants** (Bogatishcheva et al. 2026, Tables 3 and 4): with the critical point the
  vapour-pressure sets miss by more than the narrow misses accepted on 2026-10-14 (Lomba 2014, methyl lactate: 3.37 %,
  was 2.96 %; Resa 2010, ethyl lactate: 2.35 %, was 1.94 %). The maintainer: "i accept the error" (2026-10-22). Both
  now have Tc, Pc and ω, and methyl lactate a normal boiling point (416.04 K; Lecat's measured 417.0 K).
- **Held for the maintainer**: tripalmitin's heat of vaporization, ethyl lactate's melting data (the reasons are in
  the list of missing properties).
- **Code changes.**
  - `measured_components.py`: a critical point from an article outside the archive (`critical_thermoml` with its
    access text, `critical_note`).
  - The same script: a record held to a stated uncertainty above the target follows its values within the usual
    target where it can. Before, the simplest curve within the stated uncertainty was taken: a constant through the
    lactates' conductivities, 8 % off. The only other record that changed is 2-methoxyethanol's surface tension (max
    deviation 1.6 to 1.3 %).
  - The same script: a record names only the sources it uses ("an article outside the archive", the WebBook).
  - A preprint's citation without volume and pages.
- **A new kind of source, "free copy"**: a preprint or the authors' manuscript, free to read
  (`make_sources.py`, `test/sources.test.js`, the Library view).
- **Check against the articles** (AGENTS.md rule 4):
  - Nikitin et al., SSRN 4213180: Tables 2, 3, 5 and 7, pages 27-33;
  - Bogatishcheva et al., SSRN 6083032: Tables 3, 4, 5 and 7, pages 18, 19, 24 and 27, and Eq. (27) on page 29
    (λ = d0 − d1 T).
