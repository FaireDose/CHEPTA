# Evaporator: one effect or several, the steam economy and the boiling-point rise

The Evaporator block ([proposal 0015](../../proposals/0015-separation-units.md), Part I section 4; milestone M3, step 10;
workstream W3). Code: `src/units/evaporator.js`. Written against **contracts v1**.

```js
CHEPTA.runUnit("evaporator", { sys, inlets: { in: feed }, spec: {
  P_kPa: [70, 35, 12.35],                        // one pressure per effect, falling (forward feed)
  steam_P_kPa: 200,                              // saturated heating steam (or steam_T_K)
  product_mass_fraction: { "citric-acid": 0.5 }, // or steam_kg_h
  U_W_m2K: [3000, 2000, 1200] } })               // optional: each effect's area
CHEPTA.run({ capability: "solve_evaporator", input: { components, thermo, feed, evaporator } })
```

In the Flowsheet workspace it is under the **Separator** button, with the flash drum, the component separator and the
membrane. The command line (`chepta request`) and the local MCP server (`chepta-mcp`, tool `solve_evaporator`) take the
same request. Project format 6 holds it.

## The model

Each effect is a heater and a flash at its pressure, the same calculation as the Heater and Flash drum blocks: the
liquid of the effect before (the feed for the first) is brought, at P_i, to the enthalpy H_in + Q_i by a P-H flash.
The first effect is heated by saturated steam, Q_1 = m_steam (h'' − h'), the steam condensing to saturated liquid
(IAPWS-IF97). Effect i + 1 is heated by the vapour of effect i condensed totally at P_i:
Q_(i+1) = H(V_i) − H(C_i), C_i the vapour as a liquid at its bubble point at P_i. No heat losses.

This is the textbook model of a multiple-effect evaporator: "the latent heat of the vapor product off of an effect is
used to heat the following effect" (M. Subramanian, *Heat Transfer: Evaporation*, lecture notes, SSN College of
Engineering, 2019, [msubbu.in](https://msubbu.in/ln/ht/HT-Lecture-17-Evaporation.pdf), free to read; slide 10). The
enthalpies here are the property method's, not a constant heat capacity and latent heat: the sensible heat, the heat of
mixing and the boiling-point rise are the method's.

- **What you give:** the effects' pressures (1 to 10, each below the one before), the steam (`steam_P_kPa` or
  `steam_T_K`, saturated), and either the steam flow `steam_kg_h` or the product's concentration
  `product_mass_fraction: { component: w }`. With the concentration, the steam is found by Brent's method on Q_1.
  Optionally `U_W_m2K` (one value or one per effect): each effect's area A_i = Q_i / (U_i ΔT_i).
- **What you get:** the outlets `product` (the last effect's liquid), `vapour` (the last effect's vapour, to the
  condenser) and `condensate` (the condensed vapours of effects 1 to N−1, mixed adiabatically at P_1 so that the mixture
  stays liquid: one stream for the balance, not a model of the condensate system); the block's duty is the steam's
  heat; the state holds the steam flow, the water evaporated and the **steam economy** (water evaporated over steam,
  kg/kg); the profile holds each effect's pressure, temperature, duty, vapour and liquid, the heating medium's
  condensing temperature, the driving difference ΔT and the **boiling-point rise**.
- **Boiling-point rise:** the effect's boiling temperature minus the bubble temperature of its own vapour condensed at
  its pressure. For a vapour of one solvent this is the solvent's boiling point at P_i, so with nonvolatile components
  (proposal 0009, class `nonvolatile`), which stay in the liquid, it is the rise they cause.
- **Refused, with the reason:** pressures that do not fall; an effect whose heating medium condenses at or below its
  boiling temperature; a product concentration the feed already has, or that boiling cannot reach.

**Not modelled:** backward and mixed feed, feed preheating by the condensates, vapour recompression, heat losses,
entrainment, the condensate flashed from chest to chest, and areas designed for equal duties or equal areas (the
pressures are given, as the proposal says; the areas follow). The solid-liquid separator and the dryer of proposal 0015
are postponed (the maintainer, 2026-10-29).

## Checks (test/evaporator.test.js)

- **Independent reference** `validation/python/reference_evaporator.py` (scipy; all effects' temperatures, vapour flows
  and the steam solved together, equation-oriented; the ideal solution with the records' enthalpies, the steam from the
  `iapws` library), fixture `validation/fixtures/evaporator.json`: four cases (one effect at two feed temperatures,
  three effects for a product concentration, two effects for a steam flow); the engine agrees within 1e-7 relative on
  the steam, economy, duties and vapours and within 1e-6 K on the temperatures and boiling-point rises.
- **The same chain of blocks:** two flash drums and a condenser placed in a flowsheet, joined by energy streams (the
  steam's heat into the first drum, the condenser's heat into the second), give the evaporator's product, vapour,
  condensate and second-effect duty within 1e-9.
- **Worked example:** Subramanian 2019, Example 1 (slides 16-20): 30000 kg/h of a 10 % solution of "solids" to 50 %,
  steam at 0.2 MPa, boiling at 323 K, U = 2.9 kW/(m² K). The example takes c_p = 3.98 kJ/(kg K), latent heats of 2202
  and 2383 kJ/kg, and no boiling-point rise. Here the solids are citric acid (a stand-in: the example does not name
  them), the ideal solution, and the pressure is water's saturation pressure at 323 K (12.26 kPa, IAPWS-IF97):

  | Feed | Steam, kg/h (printed) | Economy (printed) | Area, m² (printed) |
  |---|---|---|---|
  | 293 K | 27674 (27708.4), −0.12 % | 0.8672 (0.87) | 85.14 (83.5), +2.0 % |
  | 308 K | 26860 (26786.1), +0.28 % | 0.8935 (0.896) | 82.64 (80.7), +2.4 % |

  The steam's latent heat at 0.2 MPa, 2201.6 kJ/kg, is the printed 2202. The areas are larger because the solution
  boils 1.8 K above water by Raoult's law, so ΔT is 68.5 K, not 70 K. The test holds the steam to 0.3 %, the economy to
  0.005 and the area to 2.5 %.

## Which property method

An aqueous solution of a nonvolatile solute is a polar liquid at low pressure: an activity model
(docs/METHOD_SELECTION.md, rule 3). CHEPTA has no fitted pairs of water with its nonvolatile components, so the choice
is Modified UNIFAC 2.0 (predicted) or the ideal solution. **For the sugars, Modified UNIFAC 2.0 is not usable here:** it
gives water an activity coefficient above 1 in glucose, fructose, xylose, sorbitol, xylitol and erythritol solutions
(1.06 in 50 % glucose at 323 K), so the boiling-point rise is small and it predicts a liquid-liquid split of water +
glucose near 55 % (the P-H flash then fails); a concentrated sugar solution does not split. For the acids (citric,
malic, succinic, lactic, glycolic) its water activity coefficient stays near 1 and its boiling-point rises are larger
than the ideal solution's.
