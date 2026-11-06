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

## The maintainer's answers (2026-11-06)

Relayed by the coordinating session:

1. **Pooling:** pool the articles by DATA_RULES.md, section 3, first: each article with the same total weight, point
   weight 1 / (u √n), and they agree when each article's mean deviation from the pooled curve is within its mean
   stated uncertainty. The 10 % only for articles that state no uncertainty, recorded as this project's choice. The
   held pairs re-checked with this rule.
2. **ChemSep 8.32:** import the solid densities as they are, with the version stated in each record. TPA's enthalpy of
   fusion of 0 is not taken: its melting data stay "no open data".
3. **The pump's solids limit:** no number. Every pumped slurry carries a warning that the power uses the liquid's
   density and ignores the slurry's rheology. The Hydraulic Institute FAQ goes to TO_DOWNLOAD.md.
4. **The pump:** the liquid phase's density only, as in DWSIM; the solids ride along. A later option, not now: the
   user enters the slurry's own viscosity and density. The TPA slurry must be pumpable: its solid density covers only
   298-308 K, which is fine because the power does not use it. For the dissolved TPA, which has no liquid density, a
   stated approximation with a warning (for example, leave the dilute TPA out of the liquid volume). The example's
   slurry goes through a pump.
5. **fit_sle.py on the new data too**; the existing default sets stay unchanged.
6. **Show the curves** in the workbench's tables (Properties, Library) and in the docs' property tables.

## What was done for them

- **(1) Pooling** (`solubility_curves.py`): `fetch_sle.py` now stores each point's stated relative uncertainty of x
  (`u_rel`, from the ThermoML Archive's uncertainties; 130 of 271 sets state one), and the three files of benzoic
  acid, naphthalene and salicylic acid were left as they were (rule 6). An article's u is the mean of its stated values
  with the 0.5 % floor of DATA_RULES.md, or **10 % where it states none (this project's choice, for solubilities;
  DATA_RULES.md says 1 % for vapour pressures)**. Re-checked: adipic acid in acetone now agrees and has a curve;
  benzoic acid in cyclohexane is now held (both articles state no uncertainty; one is 10.2 % from the pooled curve,
  above 10 %; the melting-point equation still covers the pair). Held now (SOLUBILITY_CURVES.md lists each article's
  mean deviation and u): benzoic acid in acetic acid and cyclohexane; citric acid in water, ethanol and 2-propanol;
  malic acid in water and ethanol; salicylic acid in acetone; stearic acid in ethanol; TPA in NMP.
- **(5) fit_sle.py:** 52 new NRTL sets, fitted to the solubilities of adipic, citric, glycolic, palmitic and stearic
  acid, FDCA, DMT and xylose (docs/SLE_FITS.md; the pairs not written, and why, are listed there). The 36 earlier sets
  are byte for byte unchanged (compared with the file before the run). Where a pair now has such a set, it is that
  set's, not a curve's (adipic acid in water and cyclohexanone, FDCA in water and acetic acid among them, which were
  held before): **49 curves for 15 solids** now, from 97 for 19.
- **(4) The pump** (`src/units/units.js`): the power from the liquid phase's volume only; a solid rides along, with
  the warning `SLURRY` ("the power uses the liquid's density and volume flow only, and ignores the slurry's rheology").
  A component without a liquid density at a mole fraction of at most 1 % in the liquid (`PUMP_DILUTE`, this project's
  choice of limit) is left out of the volume, with the warning `DENSITY_MISSING`; above 1 % the pump refuses, as
  before. In the TPA example the liquid's x_TPA is 1.9e-5. The example's feed is now at 360 K and 101.325 kPa and a
  pump raises it to 8 MPa: 2.42 kW (efficiency 0.75, typical), the liquid warming 2.5 K; the heater then takes 225.6 kW
  (was 228.0). The independent reference (`reference_solid_flash.py`) has the pump too, with water's density from
  IAPWS-IF97 by the open `iapws` package: the power and the pumped state agree within 1e-9.
- **Found on the way:** a P-H flash of a cold slurry tried a state with nothing crystallized, colder than the curve's
  measured range, and failed although the answer lay inside it. `solid-flash.js` now solves such a case as a T-P flash
  at the given enthalpy, searched upwards from that trial; where the first state inside the range already has more
  enthalpy than given, the answer is outside the range and the error stands.
- **(2) Solid densities** (`validation/python/chemsep_solids.py`): 100 records (`solidDensity`, tier databank, source
  "ChemSep Lite 8.32 (chemsep1.xml, created 2022-08-30)", source id `chemsep-8.32`), taken as they are from the copy
  the chemicals library ships (equations 2 and 100, kmol/m3 converted with ChemSep's molar mass). Seven with a 0-9.5 K
  range are placeholders and left out (hydrogen sulfide, argon, acrylic acid, methylamine, ethylene carbonate, maleic
  anhydride, DMT). Many records are one constant over 9.5 K below the melting point (TPA: 1510 kg/m3 at 298.15-307.65
  K); taken as they are. Nothing else is taken from ChemSep 8.32. No calculation uses them yet (the pump uses the
  liquid).
- **(3)** TO_DOWNLOAD.md, item 7: the Hydraulic Institute FAQ.
- **(6) Shown:** the workbench's Properties view lists the solid density and each solubility curve with its source,
  range and tier under "Correlations for ..."; the Sources (Library) cards list them under "Used for"; `listComponents`
  says which components have a solid density. docs/SOLUBILITY_CURVES.md gained the table "Solid data by component"
  (melting data, solid density, curves).

## Still for the maintainer

- The person checks the solid densities against ChemSep 8.32 (`chemicals/Misc/ChemSep8.32.xml`), and the stated
  uncertainties read from the ThermoML Archive for the pooled pairs.
- The 1 % limit of the pump's dilute approximation, and the 10 % for solubility sets without a stated uncertainty, are
  this project's choices.
- Later: the slurry's own viscosity and density as user input for the pump.
