# 2026-11-04-11: Proposal 0015, M3, step 10 (W3): the Crystallizer block

The coordinating session, for the maintainer: the second half of step 10 (the evaporator was the first,
docs/decisions/2026-11-04-09-evaporator-crystallizer.md): the crystallizer of Part I, section 4, with the solid in
equilibrium with its mother liquor (the solubility of `src/equilibrium/sle.js`, eutectic systems); cooling (T) or
evaporative (the solvent evaporated); the yield, the solid, the mother liquor and the duty. The solid-liquid separator
and the dryer stay postponed (answer 4, 2026-10-29). Model page: [docs/models/crystallizer.md](../models/crystallizer.md).

## What was done

- **Engine** (`src/units/crystallizer.js`): the solute's solubility at the crystallizer's temperature, at the solvent
  composition of the liquid (only the solute crystallizes); cooling at T, or evaporative with the vapour mass and T or P
  (the vapour the mother liquor's bubble-point vapour, solved with it by successive substitution; at P the temperature
  by Brent's method). Outlets: crystals, liquor (the mother liquor), vapour (optional; needed when evaporative).
- **The solid in equilibrium (contract 1, stream v2):** `crystalStream` in `src/stream/stream.js`, one `solid` phase
  with `equilibrium: true`, its enthalpy h_L(T) − ΔH_fus (answer 3 of 2026-10-29: the labelled approximation,
  consistent with the solid-liquid model's ΔCp of fusion 0). The property methods have no solid phase, so `runUnit`
  refuses the crystals into any block but a Product (NOT_AVAILABLE, with the reason). Warning code `SECOND_SOLID`
  (contract 2): a mother liquor saturated in a second component with melting data.
- **Data:** the measured solubilities of succinic acid (NIST TRC ThermoML Archive, `fetch_sle.py`: 32 sets from 17
  articles, 12 solvents), and NRTL sets fitted to them by `fit_sle.py` (tier fitted, set `fitted-sle-thermoml`), ten
  written: water, 1-butanol, 1-propanol, 2-propanol, acetone, cyclohexanone, diethylene glycol, ethanol, methanol,
  propionic acid. Acetic acid and ethyl acetate were not written (the fit splits a miscible liquid), as the script's
  rules say. Water: 51 points, 6 articles, median 8.6 %, left-out articles 10.5 %, ideal solution 20.6 %.
- **A fix to `fit_sle.py`:** it counted its own earlier sets as "already has NRTL parameters", skipped them, and its
  `--write` then replaced every set of its kind with the new ones only: run for a new solid, it would have dropped the
  26 sets of benzoic acid, naphthalene and salicylic acid. It now refits its own sets in place (they come out
  identical: the 26 records are unchanged byte for byte) and keeps their `source_ids`; new sets get the ThermoML
  Archive, since `make_sources.py`'s guess from the cited names picks unrelated articles of the same first author.
- **Request path:** `solve_crystallizer` (CHEPTA.run, `chepta request`, MCP); project format 6 holds the block.
- **Workbench:** Crystallizer in the Separator menu: the solute (the components with melting data), cooling or
  evaporative, T or P; results: yield, crystals, T and P, solubility and γ.
- **Independent reference** `validation/python/reference_crystallizer.py`, fixture `validation/fixtures/crystallizer.json`:
  four cases within 1e-7.
- **Against measured data:** the yield of cooling 20 % succinic acid from 343.15 K to 283.15 K is 0.824 (0.825 from the
  measured solubilities), to 298.15 K 0.680 (0.660); the solubility is within 10 % of every article near those
  temperatures. No open worked example of a crystallizer with full numbers was found; the proposal's check is "a
  crystallizer's yield against the solubility curve".

## Found on the way

- Benzoic acid, naphthalene and salicylic acid, the three solids with fitted solubilities before this step, have liquid
  heat capacities only above their melting points, so their solutions have no enthalpy at crystallizer temperatures:
  the block (and any flowsheet stream of them) refuses with the reason. A liquid heat capacity of the subcooled melt (or
  a solid heat capacity, with the solid's enthalpy rule changed to use it) would open them.

## For the maintainer to check

- The solubilities of succinic acid in water in `validation/data/sle/succinic-acid.json`, against the six articles
  (Lin 2007, Luo 2019, Ma 2017, Lei 2014, Deng 2014, Yu 2009; their numbers are public in the ThermoML Archive), and the
  values in the table of docs/models/crystallizer.md.
- The melting data of succinic acid used (458.04 K, 32.72 kJ/mol; src/data/components.json, as before this step).

## For the maintainer to decide

1. **Crystals only into a Product** until a flash holds a solid in equilibrium: or let the component separator take
   them as a filter (it would need to keep the solid phase, not re-flash it)?
2. **Hydrates** (citric acid monohydrate below about 36 °C, glucose monohydrate): not modelled; the solid is the pure
   solute. A later step, with open hydrate solubility data?
3. **The ten new solubility sets** of succinic acid are written as default NRTL sets for those pairs, as the earlier
   solubility fits are; they come from solid-liquid data only and are not checked against vapour-liquid data (each
   record says so). Keep them as defaults?
