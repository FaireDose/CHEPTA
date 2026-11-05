# Membrane: gas permeation, and the area for a target

The Membrane block ([proposal 0015](../../proposals/0015-separation-units.md), Part I section 4; milestone M3, step 9;
workstreams W3 and W4). Code: `src/units/membrane.js` (the block), `src/sizing/sizing.js` (`membraneArea`, contract 4).
Written against **contracts v1**.

```js
CHEPTA.runUnit("membrane", { sys, inlets: { in: feed }, spec: {
  permeances: { "carbon-dioxide": 204.2e-10, oxygen: 60.2e-10, nitrogen: 13.1e-10 },   // mol/(m2 s Pa)
  permeate_P_kPa: 101.325, flow: "counter-current", cells: 20, stage_cut: 0.3 } })
CHEPTA.membraneArea(result, { inner_diameter_m: 125e-6, length_m: 0.63 })   // → { dimensions: { A_m2, fibres }, basis, source }
CHEPTA.run({ capability: "solve_membrane", input: { components, thermo, feed, membrane } })
```

In the Flowsheet workspace it is under the **Separator** button, with the flash drum and the component separator. The
command line (`chepta request`) and the local MCP server (`chepta-mcp`, tool `solve_membrane`) take the same request.

## The model

Solution-diffusion, as K. Aziaba, C. Jordan, B. Haddadi and M. Harasek, "Design of a gas permeation and pervaporation
membrane model for an open source process simulation tool", *Membranes* 12 (2022) 1186,
[doi:10.3390/membranes12121186](https://doi.org/10.3390/membranes12121186), CC BY 4.0 (open full text:
[Europe PMC, PMC9784710](https://europepmc.org/article/PMC/PMC9784710)):

- the local flux of each component is its permeance times its partial-pressure difference across the membrane,
  d(x n) = −Q A (x P − y p) (Equation (1)), with Dalton's partial pressures (section 2.3.3);
- the stage cut θ is the permeate flow over the feed flow (Equation (3));
- the area of a hollow-fibre module is A = ε d π l, ε fibres of inner diameter d and length l (Equation (2));
- "perfect mixing in every compartment", no pressure variation along the module, permeances independent of
  composition, temperature and pressure (section 1.3); the module divided into cells (section 4.1.3, where the results
  stop changing above about five cells).

**Cells.** The module is N cells along the feed side, each well mixed on both sides, with the area A/N. In cell k

  n_k,i = (A/N) Q_i (P x_k,i − p y_k,i),  x_k the retentate leaving the cell,

and y_k the composition of the permeate gathered in that cell: from cells 1 to k in **co-current** flow (the permeate
flows with the feed and leaves after the last cell), from cells k to N in **counter-current** flow (it leaves at the
feed end). One cell is the **complete-mixing** model; with many cells the cells approach the plug-flow co- and
counter-current models. All N·c equations are solved together by Newton's method with the analytic Jacobian, the steps
kept inside positive flows; when the direct start fails, a continuation in the area from 0.1 % of it.

**How far 20 cells are from plug flow** (the default; Binous 2006's oxygen from air, θ = 0.2, against his printed
plug-flow results): counter-current 2.8819 × 10⁸ cm², 0.80 % above the printed 2.859 × 10⁸ (permeate oxygen 0.5722
against 0.5763, reject 0.1182 against 0.1171); co-current 2.9715 × 10⁸ cm², 0.56 % above 2.955 × 10⁸ (0.5554 against
0.5584, 0.1224 against 0.1216). With 200 cells the areas are within 0.15 % (below). More cells come closer to plug flow
and take longer; a module that really is well mixed on its permeate side is closer to fewer cells.

**Target.** With a stage cut (`stage_cut`) or the recovery of one component into the permeate (`recovery: { id:
fraction }`), the area is found by Brent's method on ln A, and returned in the block's state and its `sizing`. Without
a target, the area is given (`A_m2`).

## What you give

| Key | Meaning |
|---|---|
| `permeances` | every component's permeance (0 for one that does not pass). **Your values with their source**: CHEPTA has no databank of permeances; they belong to a membrane, not to a component |
| `permeance_unit` | `"mol/(m2 s Pa)"` (default, the article's), `"mol/(m2 s bar)"` (its Table 2) or `"GPU"` (1 GPU = 10⁻⁶ cm³(STP)/(cm² s cmHg) = 3.3463 × 10⁻¹⁰ mol/(m² s Pa), with cm³(STP) at 273.15 K and 101.325 kPa and 1 cmHg = 101.325/76 kPa) |
| `permeate_P_kPa` | the permeate side's pressure, below the feed's |
| `flow` | `"counter-current"` (default) or `"co-current"` |
| `cells` | 1 to 200 (default 20, the maintainer's choice of 2026-11-04); at most 1200 cells × components |
| `A_m2`, `stage_cut` or `recovery` | one of them |
| `fibre` | optional `{ inner_diameter_m, length_m }`: the number of hollow fibres of the area |

## Assumptions and refusals

- **A gas feed only.** A feed with liquid is pervaporation, which needs the liquid's fugacities and the heat of
  evaporation: refused (`NOT_AVAILABLE`, outcome `unsupported`) until a later step.
- **Isothermal:** both outlets at the feed's temperature; the duty that keeps them there is reported (a real module
  cools as the permeate expands).
- The feed side at the feed's pressure and the permeate side at the permeate pressure throughout (no pressure drop),
  no sweep gas, permeances held constant.
- An outlet that would partly condense at its pressure is warned (`CONDENSATION`): the model takes a gas on both sides.
- An area larger than the one that permeates the whole feed has no solution (complete mixing permeates everything at a
  finite area): refused (`OUT_OF_RANGE`) with the stage cut reached. A target that is not reached says so.

## Checks (`test/membrane.test.js`)

- The independent reference `validation/python/reference_membrane.py` (scipy; other unknowns, the retentate flows, and
  MINPACK's hybrid method), fixture `validation/fixtures/membrane.json`: every case within 1e-9 (in practice 1e-13).
- **H. Binous, "Gas permeation computations with Mathematica", *Chem. Eng. Educ.* 40 (2006) 140-144**, free to read on
  the journal's archive ([journals.flvc.org/cee/article/view/122538](https://journals.flvc.org/cee/article/view/122538)):
  - the ternary mixture by complete mixing (p. 141): A = 3.54176 × 10⁶ cm², the permeate and reject compositions, all
    six printed figures reproduced by one cell;
  - oxygen from air (α* = 10, pressure ratio 10, θ = 0.2; p. 142-144): complete mixing A = 3.228 × 10⁸ cm²
    (CHEPTA 3.2314 × 10⁸, 0.1 % above), counter-current 2.859 × 10⁸ (200 cells: 2.8620 × 10⁸), co-current
    2.955 × 10⁸ (200 cells: 2.9569 × 10⁸); the permeate and reject oxygen within 5 × 10⁻⁴ and 2 × 10⁻⁴ (tolerance
    0.2 % on the area, for the printed rounding and for 200 cells against plug flow); the order counter-current <
    co-current < complete mixing.
- One cell checked against the flux equations directly (the hand calculation); the permeance units; the balances; the
  area found, given back as the area, gives the same outlets.

## Example

Aziaba et al.'s test case 2 (their Table 1, after Sada et al., *J. Appl. Polym. Sci.* 45 (1992) 2181): a cellulose
triacetate hollow fibre, CO₂ 50.0 %, O₂ 10.5 %, N₂ 39.5 % at 303 K and 15.7 bar, permeate at 1013.25 mbar,
counter-current, permeances 204.2, 60.2 and 13.1 × 10⁻¹⁰ mol/(s m² Pa); module 31 has 270 fibres of 125 µm and 63 cm
(0.0668 m²). Only the open article's Table 1 is used; Sada et al.'s article is paywalled and not read. The project file
`examples/membrane-co2.chepta.json` takes that module's area with a feed of 0.01 kmol/h (a choice of the example, not
the article's).
