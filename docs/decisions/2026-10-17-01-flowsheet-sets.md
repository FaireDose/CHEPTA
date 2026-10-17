# 2026-10-17: the flowsheet follows the Library's parameter sets

- **Asked:** "does the flowsheet use always Best available or it uses what I select from Best Available, fitted to
  Data or Databank only? ... if not yet the second one we can only do this change to make it also be connected".
- **Found:** the flowsheet used each pair's default set (and the person's own sets from My data) whatever the Library
  said; the rule and the per-pair menus reached only the diagrams and the flash.
- **Done:** the workbench's flowsheet now uses the same choice: the Library's rule for every pair and a pair's own set
  (chosen in a diagram's Inputs panel) where that set exists for the flowsheet's model. Changing it calculates the
  flowsheet again. The flowsheet's method section and its results say which choice is used. The flowsheet keeps its
  own model; one shared model for the whole project (a proposal, discussed 2026-10-16) was not asked for now.
- **Tested:** `test/flowsheet-workspace.test.js`: "Databank only" gives the same flowsheet as naming the ChemSep set;
  a set chosen by hand gives the same as naming it; a new choice changes the cache key; a set that does not exist for
  the flowsheet's model is not passed. In Chromium, ethanol + water, flash drum at 1 atm and vapour fraction 0.4:
  83.61 °C with the defaults, 83.98 °C with "Databank only", 85.71 °C with the kamihama2012-etal set by hand.
- **Also:** "Best available" in the Library promises more than it does (it is each pair's default set, which is not
  the best for every use); renaming it is left to the maintainer.
