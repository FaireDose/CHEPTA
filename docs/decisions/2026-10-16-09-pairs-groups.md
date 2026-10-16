# 2026-10-16: proposal 0012, step 5 — pair parameters and Modified UNIFAC 2.0 groups, side by side

- **Asked:** "at step 5 i want to see also the coefficients side by side, the ones from the database and the empty
  table where i can add mine. for unifac also side by side the parameters and the selection of the groups"; then "ok,
  go next step".
- **Done:**
  - My data has two new sections, "Pair parameters" and "Modified UNIFAC 2.0 groups"
    (`src/ui/my-data-pairs-groups.js`, with the logic in `src/ui/pairs-groups-logic.js`).
  - **Pairs:** choose components i and j and a model (NRTL, UNIQUAC, Peng–Robinson or SRK k_ij).
    - One table shows every databank set of the pair, with its tier and which one is the default. The sets are turned
      to the order you chose (i, j), so each number is the one the calculation uses.
    - Next to them is an empty "Mine" column. "Copy" fills it from a set. Empty a_ij and a_ji count as 0, and an empty
      alpha counts as 0.3; any other empty field is named.
    - "Compare" gives the bubble point of an equimolar liquid at 1 atm with each set and with yours.
    - Your set is saved into the pair's existing entry, in that entry's order, and the entry's other models are kept.
  - **Groups:** choose a component.
    - The left column shows the database's groups (subgroup, main group, count, R, Q), the sums of r and q, the atom
      balance and how the groups were found. "Start mine from these" copies them across.
    - The right column is your own selection: search a subgroup, add it, change the counts, remove it. The balance is
      checked as you go.
    - Below both columns are the interaction parameters (a_nm, b_nm, a_mn, b_mn) between the main groups.
  - **The atom balance:** groups of your own must now pass the atom balance against the component's formula
    (`src/thermo/formula.js`; checked in `checkUserData`). As for the database's groups (DATA_RULES section 7), one H
    over is allowed. A component of your own without a formula is not checked.
  - **Subgroup atoms:** the atoms of each subgroup are now written into `src/data/mod-unifac-2.json` by
    `mod_unifac_2.py`. They come from the thermo library (`DOUFSG`, as before); BTI- has none. The paper's names,
    main groups, R, Q and parameters are unchanged.
- **Tests changed, with a comment in each:**
  - `test/user-data.test.js`: the made-up maleic anhydride groups did not balance (C4H2O3). They are now AC + CH2CO +
    COO, and the old choice is checked to be refused.
  - `test/mod-unifac.test.js`: it now reads the paper's fields apart from the added atoms.
- **Tested:** `test/pairs-groups.test.js`.
  - Databank sets are shown in the chosen order.
  - A databank set entered as your own gives the same bubble point, in either order (NRTL and UNIQUAC, ethanol + water).
  - Saving keeps the entry's order and its other models.
  - The database's groups entered as your own give identical activity coefficients for every component with groups
    (over 100).
  - Atom-balance refusals, and the tables are the file's.
- **Checked in Chromium:**
  - Ethanol + water NRTL shows its three sets next to Mine.
  - Compare: 79.68, 79.67 and 80.43 °C for the sets.
  - Saving writes the pair.
  - HMF shows the database's groups, one H over.
  - An unbalanced selection is refused with the reason.
- **Next:** every step of proposal 0012 is in.
