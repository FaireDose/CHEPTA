# 2026-10-20: D-xylose and cis,cis-muconic acid, with their identity from PubChem

- **Asked:** "bring from pub chem the two xylose and muconic acid" (two of the components held in proposal 0009,
  batch 4, because the open `chemicals` library files them under another form).
- **Done:**
  - **A structure source:** `validation/python/pubchem.py` stores the PubChem record of a component's CAS number in
    `validation/data/pure/identity/<id>.json`. The data scripts (`measured_components.py`, `mod_unifac_2.py`,
    `scan_archive.py`, `fetch_sle.py`) read the identity through `pubchem.chemical()`, which falls back to `chemicals`
    for every other component. The fetch checks that the CAS number is a synonym of the PubChem compound. PubChem is a
    new source (`pubchem` in `src/data/sources.json`, LICENSES.md).
  - **D-xylose** (CAS 58-86-6, PubChem CID 135191; `chemicals` files it as dl-xylose, CAS 25990-60-7):
    - nonvolatile, like the other sugars;
    - described in its open-chain aldehyde form (aldehydo-D-xylose, CID 644160), as glucose and fructose are. The
      ThermoML Archive lists D-xylose under that form's InChI (37 of its 39 records);
    - melting data from the WebBook: 416.2 K and 31.7 kJ/mol (Jónsdóttir, Cooke et al. 2002). The WebBook lists no
      melting temperature, so the temperature of the measured enthalpy of fusion is taken, as for HMF (DATA_RULES
      section 3);
    - liquid heat capacity predicted (Ruzicka–Domalski, open-chain form, as for glucose), 195–430 K;
    - Modified UNIFAC 2.0 groups from the structure, checked (no DDBST assignment): CHO, 3 CH, CH2, OH (P), 3 OH (S);
    - no open liquid density, viscosity, surface tension or thermal conductivity (the archive's values are of the
      crystal).
  - **cis,cis-Muconic acid** (CAS 1119-72-8, PubChem CID 5280518; `chemicals` files it without its double-bond
    geometry, under the trans,trans CAS 3588-17-8):
    - nonvolatile, like the other polyacids;
    - not a WebBook compound; no values in the ThermoML Archive;
    - no open melting data. A web search found its solubility in water, ethanol, 2-propanol and acetic acid
      (Scelfo, Pirone and Russo 2017, open access), which needs melting data to be used;
    - liquid heat capacity predicted (Ruzicka–Domalski), 230–450 K. The two inner carbons of the conjugated diene,
      Cd-(H)(Cd), have no group in the method and are counted as Cd-(H)(C), stated in the record;
    - Modified UNIFAC 2.0 groups from the structure, checked: 2 COOH, 2 CH=CH (the subgroups do not tell cis from
      trans).
- **Tests changed, with a comment in each:**
  - the component count is 161 (`test/properties.test.js`, `test/pure.test.js`);
  - the two components join the measured-data list (`test/component-registry.test.js`).
- **Tested:** `npm test`, 1093 pass, 1 to-do. Only the two new components changed in `src/data/components.json`.
- **Still held** (DECISIONS open items): the ten volatile or distilled components without an open liquid vapour
  pressure.
