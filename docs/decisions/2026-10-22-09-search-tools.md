# 2026-10-22-09: the search tools of proposal 0014 (steps 1 and 2), the search order, and a new search

## What the maintainer decided

- "at 162 i go first for points 1 and 2. after i close all you re-make the data gahthering rules and look again for
  the missing ones": proposal 0014 is accepted for steps 1 (the wider open-copy search) and 2 (the full-text search
  for candidates). Steps 3 to 5 (the uncertainty of fitted records, a second reading of tables, the evidence
  checklist) are not decided.
- On the DTU paper (Tsivintzelis, Kontogeorgis and Panayiotou 2017): "they are citing the source and this paper is
  for free". Agreed: an open paper's measured values, with the measuring article named, are taken. That paper has no
  dimerization constant per acid to take (below).

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

### The tools (validation/python)

- `open_copy.py` (step 1):
  - `copies()` gathers every copy that Unpaywall (all its locations, not only the best), OpenAlex and CORE know.
  - `fetch_pdf()` keeps a download only when it starts with "%PDF". A repository landing page is followed to the
    PDF its `citation_pdf_url` tag names.
  - The old `open_copy()` and `describe()` are unchanged, so `gap_report.py --open-copies` works as before.
- `fulltext_search.py` (step 2), new:
  - for each "no open data" marker (by default the properties a calculation needs: vapour pressure, liquid density,
    heat of vaporization, liquid heat capacity, melting data, formation data, critical constants, normal boiling
    point), it searches Europe PMC's open full texts for the component's names together with the property;
  - it reads each hit's full text and lists the tables and paragraphs where a name (as a whole word: levoglucosenone
    is not found in dihydrolevoglucosenone) and the property appear together;
  - OpenAlex and CORE are asked when their free keys are set (`OPENALEX_API_KEY`, `CORE_API_KEY`).

### Tested

- `open_copy.py --fetch` on the DOIs of 2026-10-22:
  - Wasik et al. 2025: the publisher refuses scripts (403) and the TU/e page is HTML, but a submitted manuscript on
    HAL (hal-05064689) was found and saved as a PDF. It was not known before.
  - Baird et al. 2019 and Tsivintzelis et al. 2017: the landing pages of Aalto and DTU Orbit were followed to their
    PDFs (`citation_pdf_url`), which those servers serve to browsers only (403 to scripts). The script names the
    link, for a person to download. Four "200 OK" answers that were HTML pages were rejected, as they should be.
  - Chao and Zwolinski 1978 (J. Phys. Chem. Ref. Data): no copy in any index, as expected (the NIST reprints are in
    none of them).
- `fulltext_search.py`: levoglucosenone's vapour pressure (Baird et al. 2019) is **not** found through Europe PMC,
  which indexes the biomedical literature and the journals deposited in PubMed Central (MDPI, ACS Omega, Scientific
  Reports), not Int. J. Thermophys. The validation the proposal named (finding Baird again) needs OpenAlex or CORE,
  which were not asked: OpenAlex's shared daily budget for keyless requests was used up on this network, and CORE
  needs a key. Those two branches of the script are written but have not run yet.

## The new search (docs/MISSING_PROPERTIES_2026-10-22-2.md)

- **Full-text search, Europe PMC:** 176 gaps; 78 with at least one passage where a name and the property appear
  together; every passage read (`validation/data/searches/2026-10-22-fulltext.json`). Nearly all name the component
  as a reactant, product or solvent, or give a value of a mixture.
- **Found, held for the maintainer:** solketal's vapour-pressure curve (Türck et al., ACS Omega 2026, CC BY 4.0),
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
- **Data added:** none in this pull request; levoglucosenone's records came with the previous one ([#161](https://github.com/FaireDose/Fugacity/pull/161)).

## Not done, and why

- **OpenAlex and CORE keys.** Both are free. The maintainer adds them in the environment's settings
  (`OPENALEX_API_KEY`, `CORE_API_KEY`); a new session reads them. Until then the full-text search covers Europe PMC
  only, and the search record says which indexes were not asked.
