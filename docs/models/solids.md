# Solids in equilibrium in every stream, and measured solubility curves

[Proposal 0015](../../proposals/0015-separation-units.md), Part I, section 5 (streams: a solid that forms and
dissolves; roadmap A5). Code: `src/equilibrium/solid-flash.js` (the flash), `src/thermo/solubility-curve.js` (the
curves), `src/equilibrium/sle.js` (the route and the solid's enthalpy), `src/system.js` (`solids`). Example:
`examples/tpa-recrystallization.chepta.json`.

```js
const sys = CHEPTA.system({ components: ["water", "terephthalic-acid"], model: "MOD-UNIFAC-2", solids: ["terephthalic-acid"] });
CHEPTA.stream(sys, { flow_kg_h: { water: 800, "terephthalic-acid": 200 }, T_K: 360, P_kPa: 8000 })   // a slurry: liquid + solid
// in a flowsheet: thermo: { model: "MOD-UNIFAC-2", solids: ["terephthalic-acid"] }; on the workbench: Method, Solid in equilibrium
```

## Solids everywhere

The flowsheet names one component that may form a solid (`thermo.solids`; one for now). Its system's flash becomes a
solid-liquid-vapour flash, so every block that sets an outlet state through it (mixer, heater, valve, flash drum, pump,
the component separator's outlets) dissolves or crystallizes it: water added or heating redissolves it, cooling or a
pressure letdown crystallizes it. Flowsheets that name no solid are calculated as before.

- **The equilibrium:** with c the solid per mole of feed, the fluid (z − c e_s)/(1 − c) is flashed by the method's own
  flash, and the solid is in equilibrium where the fluid's liquid is saturated: ln x_s − ln x_sat(T) = 0, or c = 0
  where the liquid is not saturated. c is found by Brent's method; at a given enthalpy (P-H) each step is the fluid's
  P-H flash at its share of the enthalpy. The vapour fraction counts the solid's moles too.
- **The solubility x_sat:** the solute's measured curve in the liquid's solvent where there is one, else the
  melting-point equation with the activity model (`sle.js`).
- **The solid's enthalpy:** h_solid(T) = h_liquid,pure(T) − ΔH, where ΔH is the enthalpy of fusion (the equation's
  route; ΔCp of fusion 0, the maintainer's answer 3 of 2026-10-29) or **the curve's apparent enthalpy of solution**,
  ΔH_sol = −R d ln x_sat / d(1/T) (its van't Hoff slope; an ideal-solution reading of the curve, the measured route
  where no enthalpy of fusion is known). The result's notes name which.
- **The crystals** leave a flash drum with the liquid, as a slurry; the **Crystallizer** separates them from the mother
  liquor. Products take solids. The streams table shows each stream's solid (kg/h).
- **Refused, with the reason:** a P-S flash with a solid (compressors and expanders take fluids only); an equation of
  state; two solid-forming components; a solid without a curve or melting data; a temperature outside a curve's
  measured range.

## Measured solubility curves

A new record kind: `solubility` on a component, a list of curves, one per solvent. A curve gives x_sat(T) in its
solvent from measured data: `{ solvent, equation: "apelblat", A, B, C, Tmin_K, Tmax_K }` (ln x = A + B/T + C ln T) or
`{ solvent, equation: "points", points: [[T_K, x], ...] }` (ln x linear in 1/T between the points). It is used in place
of the melting-point equation where the liquid holds only that solvent besides the solute, **only inside its measured
temperatures**; outside them the calculation refuses (OUT_OF_RANGE). A solid without open melting data has the curve as
its only route.

- **From open data:** `validation/python/solubility_curves.py` fits the Apelblat form to one measured set
  (`validation/data/sle/<solid>.json`, `fetch_sle.py`), with its deviations and the sets left out with the reason.
- **Your own (My data):** Solubility in a solvent: a table of temperatures and mole or mass fractions, with its source,
  tier "user" (`properties: { "<component>": { solubility: [{ solvent, points, source }] } }`).

### Terephthalic acid in water

TPA has no open melting data. Two sets of its solubility in water are in the NIST TRC ThermoML Archive
(`fetch_sle.py`, which now also keeps TPA's sets measured above 110 kPa, with their pressure):

| Article | Range | Used |
|---|---|---|
| Takebayashi, Sue, Yoda, Hakuta, Furuya, J. Chem. Eng. Data 57 (2012) 1810-1816, doi:10.1021/je300263z | 12 points, 348.8-547.4 K at 10 MPa | **yes, provisionally**: the curve, largest deviation 4.8 %, mean 1.7 % |
| Sunsandee et al., Fluid Phase Equilib. 338 (2013), doi:10.1016/j.fluid.2012.11.023 | 18 points, 303-473 K | left out: the curve is 50 times above it (median of its 13 points in range) |

The two disagree by a factor of about 50 to 110. Su, Zheng, Suga, Watanabe, J. Supercrit. Fluids 218 (2024) 106497
(open access, CC BY-NC-ND; 423-623 K) would decide, but its server refuses scripts: it is item 6 of
[TO_DOWNLOAD.md](../missing-properties/TO_DOWNLOAD.md). Its abstract gives 108.1 g/kg at 573.15 K (10 MPa) and 347.4
g/kg at 623.15 K (20 MPa), outside the curve's range. The curve ignores pressure (measured at 10 MPa).

## The example: TPA recrystallized from hot water

`examples/tpa-recrystallization.chepta.json`, Modified UNIFAC 2.0 (predicted; no fitted pairs of water with TPA; the
solubility is the curve's either way): 1000 kg/h of a 20 % slurry at 360 K and 8 MPa, heated at 8 MPa to 547 K (it all
dissolves), three adiabatic letdown drums at 4, 2 and 0.8 MPa (each boils off steam, cools and crystallizes), then a
cooling crystallizer at 373.15 K.

| Stream | T, K | Solid, kg/h | Liquid's x_TPA (measured near T) |
|---|---|---|---|
| feed | 360.00 | 199.86 | |
| heated | 547.00 | 0 | |
| drum at 4 MPa | 524.10 | 116.69 | the curve (0.0125 measured at 523.7 K) |
| drum at 2 MPa | 485.68 | 183.56 | the curve |
| drum at 0.8 MPa | 443.58 | 197.20 | the curve |
| crystals out (373.15 K) | 373.15 | 199.83 | yield 0.99917 |

The heater takes 228.0 kW and the crystallizer gives up 49.3 kW; both balances close.

## Checks (test/solids.test.js)

- The curve against the 12 points it was fitted to (within 5 %), and its range refused outside 348.8-547.4 K.
- **Independent reference** `validation/python/reference_solid_flash.py` (the ideal solution with the records'
  enthalpies, the curve, scipy; no shared code), fixture `validation/fixtures/solid_flash.json`: the whole chain, every
  state's T within 1e-5 K, solid and vapour within 1e-7, the duties within 1e-6, the yield within 1e-8.
- The example: each drum's liquid at the measured solubility (Takebayashi's points interpolated) within 6 %, more
  crystals at each lower pressure, both balances closed.
- Every block: water added dissolves the solid, heating dissolves it, cooling and a letdown crystallize it; a compressor
  refuses; without `solids`, a heater still refuses a crystallizer's crystals.
- A curve of one's own (points, tier user), its range refused; the flowsheet's `solids` saved and reopened.
