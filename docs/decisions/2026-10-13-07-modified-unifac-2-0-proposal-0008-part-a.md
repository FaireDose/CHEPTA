# 2026-10-13: Modified UNIFAC 2.0 (proposal 0008, Part A)

- **Asked:** add Modified UNIFAC 2.0 (Hayer, Hasse and Jirasek 2025, arXiv:2412.12962) before the last batch: its
  parameter files are CC BY 4.0, which the author confirmed to the maintainer by e-mail. "This unifac will not mean
  that you can skip searching in open literature for properties, besides the databases."
- **Done:**
  - `MOD-UNIFAC-2` model ("Mod. UNIFAC 2.0" in the interface), every pair labelled predicted, with the source;
  - parameters from the three arXiv files (stored unchanged), group assignments for 106 of the 127 components;
  - checks: thermo's implementation to 1e-9 in ln γ; T-x-y of six pairs against open data, 0.3-1.1 K mean deviation.
- **For the maintainer to check:**
  - the three assignments where the SMARTS split and DDBST differ (tetrahydrofuran, 1,4-dioxane, NMP: DDBST's used,
    with the reason in the script);
  - the three reviewed without a DDBST assignment (glycerol, methyl linoleate, triolein);
  - left without groups until checked: Cyrene, ethylene carbonate (is the (CH2)2CB group meant for the cyclic
    carbonate?), propylene carbonate, and 2-methyltetrahydrofuran (the structure-based split and DDBST's differ, and
    DDBST's gives C5H11O instead of C5H10O); furan and 2-methylfuran are not covered by the method's groups.
- **Found:** Modified UNIFAC 2.0 predicts no ethanol + water azeotrope at 101.325 kPa (y - x stays positive up to
  x = 0.98); the measured azeotrope is very shallow. Reported in the docs, not corrected.
- **Not done here:** the drop-down model selector and "every component selectable, error only when the model cannot
  use it" (its own pull request); Mod. UNIFAC 2.0 as the fallback of NRTL and UNIQUAC for missing pairs (proposal
  0008, Part A, step 2).
