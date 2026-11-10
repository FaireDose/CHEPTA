# Crystallizer: a pure solid in equilibrium with its mother liquor

The Crystallizer block ([proposal 0015](../../proposals/0015-separation-units.md), Part I section 4; milestone M3,
step 10; workstream W3). Code: `src/units/crystallizer.js`; the solid in equilibrium: `crystalStream` in
`src/stream/stream.js` (contract 1, stream v2). Written against **contracts v1**.

```js
CHEPTA.runUnit("crystallizer", { sys, inlets: { in: feed }, outletCount: 2,
  spec: { solute: "succinic-acid", T_K: 288.15 } })                          // cooling
CHEPTA.runUnit("crystallizer", { sys, inlets: { in: feed }, outletCount: 3,
  spec: { solute: "succinic-acid", P_kPa: 20, evaporated_kg_h: 300 } })      // evaporative
CHEPTA.run({ capability: "solve_crystallizer", input: { components, thermo, feed, crystallizer } })
```

In the Flowsheet workspace it is under the **Separator** button. The command line (`chepta request`) and the local MCP
server (`chepta-mcp`, tool `solve_crystallizer`) take the same request. Project format 6 holds it.

## The model

The solubility of `src/equilibrium/sle.js`: a pure solid in equilibrium with the liquid, no solid solution (eutectic
systems), ln(x_s γ_s) = −(ΔH_fus / R T)(1 − T / T_m), with ΔCp of fusion 0 and γ from the flowsheet's activity model.
Only the solute crystallizes, so the other components keep their ratios in the mother liquor; with n_o their flows,
the mother liquor holds n_s = x_s Σ n_o / (1 − x_s) of the solute and the rest crystallizes (none when the liquid is
not saturated).

- **Cooling:** give the temperature `T_K` (and `P_kPa`, default the feed's). No vapour.
- **Evaporative:** give the solvent evaporated, `evaporated_kg_h` (the vapour's mass flow), and `T_K` (the pressure is
  the mother liquor's bubble pressure there) or `P_kPa` (the temperature is its bubble temperature, by Brent's method).
  The vapour is the mother liquor's equilibrium vapour; it and the mother liquor are solved together by successive
  substitution. Nonvolatile components stay in the liquid. The vapour outlet must be connected.
- **Energy:** the duty is H_out − H_in. The crystals' enthalpy is the pure liquid solute's at T minus its enthalpy of
  fusion, h_solid(T) = h_L(T) − ΔH_fus: the labelled approximation of the maintainer's answer 3 (2026-10-29),
  consistent with the solid-liquid model (ΔCp of fusion 0 means c_p,solid = c_p,liquid). It needs the solute's liquid
  records at T: benzoic acid, naphthalene and salicylic acid have liquid heat capacities only above their melting
  points, so their solutions have no enthalpy at crystallizer temperatures and the block refuses them with the reason.
- **The crystals** leave as a stream with one `solid` phase, `equilibrium: true` (stream v2). The property methods
  have no solid phase, so any block that would recalculate the stream would melt the crystals: `runUnit` refuses
  them into every block but a Product.
- **The slurry outlet** (2026-11-05): `slurry_liquid_kg_per_kg` (kg of mother liquor per kg of crystals) or
  `slurry_solids_fraction` (the crystals' mass fraction of the slurry): the crystals outlet carries that share of the
  mother liquor, at its state and composition; the rest leaves clear by the liquor outlet. The balances and the duty
  are those of dry crystals. A component separator can then act as the filter (no solid-liquid separator block: the
  maintainer, 2026-11-05).
- **Results:** the yield (crystals over the solute fed), the crystals (kmol/h, kg/h), the solubility x_s and γ_s,
  T and P, the solvent evaporated, the duty. A mother liquor also saturated in another component with melting data
  (past a eutectic) is warned of, `SECOND_SOLID`.
- **Refused, with the reason:** T at or above the solute's melting point; a solute without melting data; no activity
  model; an evaporation larger than the solvent; an evaporative crystallizer without its vapour outlet; a cooled
  mother liquor that would boil at the given pressure.

**Not modelled:** hydrates and solvates (the solid is the pure solute), several solids at once, crystal size, growth
and nucleation, the liquid the crystals carry. The solid-liquid separator and the dryer are postponed (the maintainer,
2026-10-29).

## The case: succinic acid from water

Succinic acid is one of the green acids that proposal 0015 names. NRTL sets for succinic acid with water and nine other
solvents were fitted to the measured solubilities of the NIST TRC ThermoML Archive (`validation/data/sle/succinic-acid.json`,
`validation/python/fetch_sle.py` and `fit_sle.py`; [SLE_FITS.md](../SLE_FITS.md)). With water: 51 points from six
articles, 283.1-447.4 K, median deviation 8.6 % (10.5 % for articles left out of the fit; the ideal solution 20.6 %).
Modified UNIFAC 2.0 predicts about 35-40 % below the measured values at 290-320 K.

## Checks (test/crystallizer.test.js)

- **Independent reference** `validation/python/reference_crystallizer.py` (the `chemicals` library's
  `solubility_eutectic`, the Python NRTL, the enthalpies of `reference_enthalpy.py`), fixture
  `validation/fixtures/crystallizer.json`: two cooling and two evaporative cases agree within 1e-7 (T within 1e-6 K, the
  duty within 1e-5 relative).
- **Against the measured solubility curve:** 800 kg/h of water with 200 kg/h of succinic acid, from 343.15 K:

  | T | Solubility x: block (measured) | Yield: block (from the measured x) |
  |---|---|---|
  | 283.15 K | 0.006669 (0.00654 Yu 2009; 0.00663 Ma 2017 at 283.65 K) | 0.824 (0.825) |
  | 298.15 K | 0.01205 (0.01279 Deng 2014; 0.01265 Ma 2017 at 298.25 K; 0.01305 Yu 2009 at 298.05 K) | 0.680 (0.660) |

  The test holds the solubility to 10 % of each article and the yield to 0.03.
- **The solid:** h_crystals = h_L − ΔH_fus; a heater refuses the crystals; a Product takes them.
