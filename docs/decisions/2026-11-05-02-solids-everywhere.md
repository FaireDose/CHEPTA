# 2026-11-05-02: Solids in equilibrium in every stream, and measured solubility curves (proposal 0015, section 5)

The maintainer, relayed by the coordinating session: "if i add solubility of terephthalic acid in water at high
temperatures i could then dissolve it and recrystallize it and get a stream with the solid TPA and a stream with the
mother liquor. The solids i could remove then or i can redissolve." Proposal 0015, Part I, section 5 (roadmap A5): (1)
measured solubility curves as a new record kind, from open data and in My data; (2) the solid dissolving or
crystallizing in every block; (3) a worked TPA example. Model page: [docs/models/solids.md](../models/solids.md).

## The maintainer's answers on #207 (the Crystallizer), 2026-11-05

1. **Crystals may go only to a Product for now**, and making them usable elsewhere is the very next step: done here,
   for a flowsheet that names the solid in `thermo.solids`.
2. **Salt hydrates later.**
3. **The ten succinic acid solubility sets are the default in the Crystallizer only, and elsewhere only where the pair
   has no other set.** `fit_sle.py` fits a pair only where it has no other NRTL set, so where a set is written it is
   the default (no number changes today: none of the ten pairs has another set). The Crystallizer now takes its
   solute's solubility from the solubility-fitted set even where the flowsheet chose another
   (`solubilitySystem` in `src/units/crystallizer.js`; test/solids.test.js). DATA_RULES.md, section 5, says so.

## What was done

- **Solubility curves** (`src/thermo/solubility-curve.js`): `solubility` records on a component, one per solvent,
  Apelblat (ln x = A + B/T + C ln T) or points (ln x linear in 1/T). `sle.js` uses a curve where the liquid's solvent
  is the curve's, in place of the melting-point equation, only inside its measured temperatures; `solidHeat` gives the
  enthalpy that separates the solid from the liquid solute: the enthalpy of fusion, or the curve's apparent enthalpy of
  solution (van't Hoff slope).
- **From open data:** `fetch_sle.py` now fetches terephthalic acid and keeps its sets measured above 110 kPa (with the
  pressure); `solubility_curves.py` fits the curve of TPA in water to Takebayashi et al. 2012 (12 points, 348.8-547.4 K,
  10 MPa; largest deviation 4.8 %). Sunsandee et al. 2013 is left out: the two sets disagree by a factor of 50 to 110,
  with no stated reason to choose between them, so the choice is **held for the maintainer**, the curve made
  provisionally from Takebayashi. Su et al. 2024 (open, CC BY-NC-ND) would decide; it is item 6 of TO_DOWNLOAD.md.
- **In My data:** Solubility in a solvent: a table of T and x (mole or mass fraction) with its source, tier "user".
- **Solids everywhere** (`src/equilibrium/solid-flash.js`): `system({ ..., solids: [component] })` and the flowsheet's
  `thermo.solids` (one component for now) make the flash a solid-liquid-vapour flash; every block that sets an outlet
  state through it dissolves or crystallizes the solid. The energy balance uses h_solid = h_liquid − ΔH (fusion, or the
  curve's enthalpy of solution). `runUnit` lets the crystals into any block of such a flowsheet; the Crystallizer takes
  a slurry; the flash drum's slurry goes with its liquid; Products take solids. The Method page has "Solid in
  equilibrium"; the streams table shows each stream's solid.
- **The example** `examples/tpa-recrystallization.chepta.json`: a 20 % slurry dissolved at 547 K under 8 MPa,
  crystallized in letdown drums at 4, 2 and 0.8 MPa, then a crystallizer at 373.15 K: yield 0.99917, both balances
  closed; each drum's liquid at the measured solubility within 6 %.
- **Independent reference** `validation/python/reference_solid_flash.py`: the chain agrees within 1e-7.
- **The two routes agree** (the coordinating session's addition): a cooler, or a flash drum at the same T and vapour
  fraction, followed by taking the solid apart gives exactly the Crystallizer's crystals, mother liquor, enthalpy and
  duty (within 1e-8), for TPA (the curve) and succinic acid (the equation), cooling and evaporative (test/solids.test.js).
- **Fixed on the way:** `fit_sle.py` did not run after #207 (a local variable shadowed its `pairs()` function) and would
  have failed on a solid without melting data; both fixed, and a rerun reproduces binaries.json byte for byte. The
  workbench's mass-fraction rows and molar masses were empty (the component list carries no molar masses). A flash
  drum's note called crystals "the inert solid". The solid phase's `equilibrium` flag was lost when a stream or a
  drum outlet was built.

## Found on the way

- The flash of water with a little of a nonvolatile solute at a given T and vapour fraction failed for some compositions
  with the dew point's error (a nonvolatile component has none): fixed in `src/equilibrium/flash.js` (no dew bracket
  with a nonvolatile component; below the bubble pressure, a split that converges to no vapour is the liquid, and a split
  that does not converge starts again from K = γ p_sat / P). The P-H flash of water with a trace of about 1e-6 of it
  near water's boiling point still fails in Modified UNIFAC 2.0; the solid flash avoids such states.
- TPA has no open liquid density, so a pump cannot take it: the example's feed is given at 8 MPa.

## For the maintainer to check

- The 12 solubilities of Takebayashi et al. 2012 in `validation/data/sle/terephthalic-acid.json` (from the ThermoML
  Archive) against the article's table, and the 18 of Sunsandee et al. 2013.

## For the maintainer to decide

1. **TPA in water: which set?** Takebayashi 2012 (used now, provisionally) or Sunsandee 2013, 50 times lower. Download
   Su et al. 2024 (TO_DOWNLOAD.md, item 6) to decide.
2. **The enthalpy of solution from the curve's slope** (an ideal-solution reading) for the solid's enthalpy where no
   enthalpy of fusion is known: keep, or wait for open calorimetric data?
3. **One solid-forming component at a time**, named by the flowsheet (`thermo.solids`), so that flowsheets without
   solids are unchanged: or every component with a curve or melting data, always?
4. **Pressure:** the curve was measured at 10 MPa and is used at every pressure. Keep, or refuse far from the measured
   pressure?
