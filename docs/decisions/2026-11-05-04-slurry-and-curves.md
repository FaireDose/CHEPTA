# 2026-11-05-04: The Crystallizer's slurry outlet, a pump with solids, and more solubility curves

The coordinating session, for the maintainer, after #209 (solids in every stream): (1) a slurry outlet on the
Crystallizer; (2) a pump that takes a slurry, its power from the slurry's density; (3) more measured solubility curves,
"at least 10-15-20 more", from the ThermoML Archive.

## What was done

- **(1) The slurry outlet** (`src/units/crystallizer.js`): `slurry_liquid_kg_per_kg` (kg of mother liquor per kg of
  crystals) or `slurry_solids_fraction` (the crystals' mass fraction of the slurry). The crystals outlet carries that
  share of the mother liquor, at its state and composition (`joinStreams` in `src/stream/stream.js`, no flash); the
  rest leaves clear by the liquor outlet. The balances and the duty are those of dry crystals (test/crystallizer.test.js).
  On the workbench: "Crystals leave: dry, with liquid per kg, as a slurry of". No solid-liquid separator block (the
  maintainer, 2026-11-05): the component separator acts as the filter.
- **(3) Solubility curves:** `fetch_sle.py` fetched 20 more solids (adipic, citric, fumaric, itaconic, malic, glycolic
  acid, glucose, fructose, xylose, sorbitol, xylitol, erythritol, FDCA, biphenyl, palmitic and stearic acid, phenol, HMF,
  levoglucosan, DMT). `solubility_curves.py` now writes a curve for every solid + solvent pair with at least 5 points
  over 10 K, except the pairs that have an NRTL set fitted to the same solubilities (`fit_sle.py`), and the hand-chosen
  TPA in water. Several articles are pooled, each with the same weight, only when they agree (each article's median
  deviation within 10 % of the pooled curve); otherwise the pair is held. **97 curves for 19 solids** were written;
  the table, with every pair, its points, deviation and result, is [docs/SOLUBILITY_CURVES.md](../SOLUBILITY_CURVES.md).
  The acids without open melting data (fumaric, itaconic) have curves as their only route.
- **Held, the articles disagree** (the data that would decide are listed in SOLUBILITY_CURVES.md): adipic acid in
  water, acetone and cyclohexanone; benzoic acid in acetic acid; citric acid in water, ethanol and 2-propanol; FDCA in
  water and acetic acid; malic acid in water and ethanol; salicylic acid in acetone; stearic acid in ethanol; TPA in NMP.
- **No sets** in the ThermoML Archive (searched by name, `fetch_sle.py`): xylitol, erythritol, biphenyl, HMF,
  levoglucosan; sorbitol and phenol in water one point each.
- A test checks that every automatic curve gives the largest deviation its record states, from the data files.

## (2) The pump with solids: not built, blocked

- **What other simulators do** (the method rule): DWSIM's pump (its open source, `DWSIM.UnitOperations/UnitOperations/
  Pump.vb`, branch "windows", lines 686-687) takes the density and volumetric flow of the overall liquid phase only;
  a solid phase does not enter its power. The slurry density, 1/ρ = w_s/ρ_s + (1 − w_s)/ρ_L (volumes additive;
  Wikipedia, "Slurry"), needs the solid's density.
- **Solid densities:** CHEPTA has none. ChemSep 8.32 (2022, Artistic License 2.0, the copy the open `chemicals` library
  ships) has them for benzoic acid, naphthalene, salicylic acid, adipic acid, phenol, terephthalic acid and others;
  CHEPTA's records come from ChemSep v8.3 and v8.31. ChemSep 8.32 also includes terephthalic acid, which CHEPTA's
  records list as "not in ChemSep": a solid heat capacity, a solid density valid at 298-308 K only, a liquid density
  above 700 K only, and an enthalpy of fusion of 0.
- **A solids limit:** no open source with a maximum pumpable solids fraction could be opened (the Hydraulic Institute
  FAQ in Pumps & Systems: 403; the FIPR report: an empty download).
- Even with solid densities, the TPA slurry could not be pumped: TPA has no liquid density for its dissolved part.

## Found on the way

- A curve gives benzoic acid, naphthalene and salicylic acid their solubility, but not an energy balance: the solid's
  enthalpy is built on the liquid solute's (h_solid = h_L − ΔH), and their liquid heat capacities start at their melting
  points. A solid heat capacity (ChemSep 8.32 has some) would be the route: h_solid from it, and the dissolved solute
  from the solid plus the enthalpy of solution.
- `fit_sle.py`, run now, would also fit NRTL sets to the new data of solids with melting data (adipic acid, the sugars,
  FDCA ...): not run here; the curves describe those pairs.

## For the maintainer to decide

1. **Pooling:** the agreement rule of this step (each article's median deviation within 10 % of the pooled curve) is
   this project's choice, not a published standard. Keep 10 %?
2. **ChemSep 8.32:** import the solid densities (and TPA's records) from it, for the pump?
3. **The pump's solids limit:** refuse every slurry until an open source gives a limit, or warn without a number? Or
   can a person download one of the two documents above?
4. **fit_sle.py on the new data:** NRTL sets for the new pairs too (they would then replace the curves, as for
   succinic acid), or curves only?
