# Reactions

How CHEPTA describes a reaction and computes its heat of reaction, equilibrium constant and rate (proposal 0010,
step 2; code in `src/reactions/`), and the conversion and yield reactors that use them (step 3; `src/units/reactors.js`,
[below](#reactors)). The equilibrium, CSTR, plug-flow and Gibbs reactors come in the next steps.

CHEPTA ships components, not reactions. The user writes the reactions of their process in the project or flowsheet
file (or, later, in the Reactions setup block next to Components and Method). CHEPTA checks them and computes what
follows from the components' data.

## The description

```json
{
  "id": "ether",
  "name": "2 ethanol ⇌ diethyl ether + water",
  "stoichiometry": { "ethanol": -2, "diethyl-ether": 1, "water": 1 },
  "phase": "liquid",
  "reversible": true,
  "equilibrium": { "from": "formation" },
  "rate": {
    "form": "power-law",
    "basis": "activity",
    "forward": { "k": { "k0": 0.0, "Ea_J_mol": 0.0 } },
    "reverse": "from-equilibrium",
    "per": "catalyst-mass",
    "T_K": [400, 450],
    "source": "where the rate law comes from"
  }
}
```

(The zeros are placeholders, not data.)

`checkReaction(r)` refuses, with the reason:

- a component it does not know (names, aliases, CAS numbers and formulas are looked up);
- a component that is listed twice, or a coefficient of 0;
- a reaction with no reactant or no product;
- a reaction that does not balance its elements against the components' formulas. The imbalance is named, for
  example "not balanced: H -2 (more in the reactants), O -1". Schematic biological reactions belong in a yield
  reactor;
- a phase other than `vapour` (or `gas`) or `liquid`;
- a rate that does not fit the reaction (below).

`checkReactions(list)` also checks that the ids differ.

## Heat of reaction and K(T)

`reactionProperties(reaction, T_K)` gives ΔrH°, ΔrG°, ln K and K at T. The standard state is:

- for a vapour reaction, the ideal gas at P° = 100 kPa, so K = Π (f_j/P°)^ν_j;
- for a liquid reaction, the pure liquid at T, so K = Π (γ_j x_j)^ν_j. The effect of pressure is neglected.

Each species' Gibbs energy at T comes from its formation record at 298.15 K by the Gibbs–Helmholtz equation,
G(T)/T = G(T0)/T0 − ∫ H/T² dT. H(T) comes from the property records: the ideal-gas heat capacity, or the liquid heat
capacity. This is the van 't Hoff equation summed over the species (Rawlings and Ekerdt, 2nd ed., eqns 3.10, 3.11 and
3.47, pp. 66 and 78).

A formation record is for one state: the ideal gas (ChemSep), the liquid or the crystal (measured values;
[DATA_RULES.md](../DATA_RULES.md) section 11). It is taken to the reaction's standard state by these paths, and the
result says which one it used (`notes`):

| Record | Standard state | Path |
|---|---|---|
| ideal gas | pure liquid | G_L = G_IG + RT ln(f_L/P°) and H_L = H_IG(T0) + h_L(T). f_L and h_L are those of the mixture enthalpies, from a one-component system with the ideal-gas vapour, so reactions and flowsheets share one basis. f_L = psat. h_L is on the liquid-heat-capacity basis, anchored at 298.15 K, or where the liquid's records start for a solid at 25 °C (adipic, benzoic, stearic acid). The Poynting factor is neglected. |
| ideal gas (a dimerizing acid: acetic acid) | pure liquid | The record is the ideal-gas monomer, and the saturated vapour is monomers and dimers (the chemical theory of `src/thermo/vapour.js`). So f_L = the monomer's saturation pressure, and the liquid's anchor adds the dimers' enthalpy, y_D ΔH_dim/(y_M + 2 y_D) per mole of acid. ΔH_dim = −R ln10 · B = −60.6 kJ/mol comes from the temperature dependence of the dimerization constant log10 K = A + B/T (van 't Hoff). |
| liquid | ideal gas | the same equation the other way |
| crystal | pure liquid | H_L = H_S + ΔHfus and G_L = G_S + ΔHfus (1 − T0/Tm) at 298.15 K, with the component's melting data. The heat capacities of liquid and crystal are taken as equal. |

Where a value cannot be computed, the result says why:

- **A species has no open enthalpy of formation:** the calculation is refused with the sources searched (MISSING_DATA).
  A K correlation the user cites still works: `"equilibrium": { "lnK": { "A", "B", "C" }, "T_K": [lo, hi], "source" }`
  gives ln K = A + B/T + C ln T, and ΔrH° is then null. A warning appears outside the correlation's range.
- **A species has an enthalpy of formation but no Gibbs energy:** ΔrH° only, with no K.
- **A nonvolatile species in a vapour reaction:** refused.
- **T outside a species' ideal-gas heat-capacity record:** a warning says the record was extrapolated.

Checked against `validation/python/reference_reactions.py`:

- Vapour reactions, against Cantera with NASA polynomials fitted to the same heat capacities, and against a scipy
  enthalpy-and-entropy integration: K within 1e-6 relative from 298 to 700 K. The reactions are methanol from CO2,
  the reverse water-gas shift, ethanol dehydration and ammonia synthesis.
- Liquid reactions, against the scipy route: ln K within 1e-6. The reactions are diethyl ether from ethanol, glucose
  to fructose from their crystal records, and ethyl acetate esterification with acetic acid.
- Other acids that dimerize (formic, propionic, acrylic) have no dimerization constant in CHEPTA yet, so their liquid
  values are 11–26 kJ/mol off the WebBook ([the decision](../decisions/2026-10-22-05-reactions.md)).
- The liquid values the paths give, against measured liquid values of the NIST WebBook: within 2 kJ/mol in ΔfH° and
  ΔfG° for acetic acid, ethanol, ethyl acetate and water at 298.15 K
  (`validation/data/reactions/liquid_formation_webbook.json`). For acetic acid the dimer path gives −482.9 kJ/mol
  against −483.5 kJ/mol (Steele et al. 1997); without the dimers it would be about 28 kJ/mol off.

## Rate laws

`reactionRate(reaction, { T_K, values })` gives the rate r of the reaction. Component j is formed at ν_j r, in
mol/(m³ s) per reactor volume or mol/(kg s) per catalyst mass (`per`). The values are given in the rate's basis:

- `concentration`: mol/m³;
- `partial-pressure` or `fugacity`: kPa;
- `mole-fraction` or `activity`: no units.

The forms are those printed in Rawlings and Ekerdt, 2nd ed. (full text free to read from the authors; used for the
equation forms):

| `form` | Rate | Book |
|---|---|---|
| `power-law` | k Π c_j^α_j. The orders default to the reactants' coefficients. | eqn 5.38, p. 204 |
| `power-law` with `reverse` | k Π c^α − k_r Π c^β, with β = α + ν. `"from-equilibrium"` sets k_r = k/K, so r = 0 exactly at equilibrium; it needs the activity basis, or kPa for a vapour reaction (K_p = K P°^Σν). Otherwise give k_r. | eqn 5.38 |
| `LHHW` | (k Π c^α − k_r Π c^β) / (1 + Σ (K_j c_j)^m_j)^n, with m_j = ½ for dissociative adsorption | section 5.6, eqn 5.148 (p. 251); section 7.4.4 (p. 376) |
| `michaelis-menten` | k c_S / (1 + K c_S) | Exercise 9.15, p. 569 |
| `monod` | μ c_X, μ = μm S/(Ks + S); with `K1`, substrate inhibition μm S/(Ks + S + K1 S²); with `product` and `Kp`, μm S/(Ks (1 + P/Kp) + S) | section 10.5, p. 596 |
| `growth` | μ c_X with `law` `blackman`, `tessier`, `moser` (with `n`) or `contois` (with `Ksx`), as printed | p. 596 |

Every constant is a number or `{ "k0", "Ea_J_mol", "B" }`: k = k0 T^B exp(−Ea/RT) (eqn 5.37, p. 204). An adsorption
constant with a negative `Ea_J_mol` grows as T falls, as an exothermic adsorption does.

The engine refuses with the reason:

- a missing value;
- a negative value;
- a negative order at zero concentration (the rate would be infinite);
- a reverse term on an irreversible reaction, or a reversible reaction without one;
- a rate that is not a finite number.

A warning appears outside the rate law's range, `T_K`.

Eley–Rideal and Mars–van Krevelen forms are not in the book. No open source with their forms was found
(docs/decisions/2026-10-22-05-reactions.md), so they are not built in. Your own formula ("Write your own kinetics",
proposal 0010 step 9) will cover them.

## Reactors

Two reactor blocks (proposal 0010, step 3; `src/units/reactors.js`) work alone (`runUnit`) and in flowsheets. The
reactions are written once, in the flowsheet file's `reactions` list (as above), and each reactor names those it uses.

**Conversion reactor** (`conversion-reactor`). Each reaction converts a given fraction of a key reactant:

```json
{ "id": "R1", "type": "conversion-reactor",
  "spec": { "reactions": [{ "reaction": "meoh", "key": "carbon-dioxide", "conversion": 0.25 }],
            "order": "parallel", "T_K": 550, "dP_kPa": 0 } }
```

- In parallel (the default) a conversion is of the key's inlet flow: ξ = X F_key,in / (−ν_key). The conversions of
  reactions that share a key add up, to 1 at most.
- In series it is of what the reactions listed before it left.
- A reaction that would need more of a co-reactant than comes in is refused, naming it.
- The outlet is given by its temperature, duty or vapour fraction, and its pressure (or pressure drop). It is
  flashed, so it may leave as two phases.

**Yield reactor** (`yield-reactor`), for reactions known by their products (a fermentation, a pyrolysis, a black box
from a paper):

```json
{ "id": "R2", "type": "yield-reactor",
  "spec": { "key": "acetic-acid", "conversion": 0.6, "basis": "mass",
            "yields": { "ethanol": -0.7672, "ethyl-acetate": 1.4672 }, "closure": "water", "T_K": 298.15 } }
```

(The stoichiometric yields of the esterification, from the molar masses; water takes the rest, 0.3000.)

- The yields are what forms per unit of key converted: kg per kg, or mol per mol with `"basis": "mole"`. A negative
  yield is a co-reactant consumed.
- They must close the mass within 1e-6: per kg of key converted, the mass yields add up to 1. The products are then
  scaled to close it exactly.
- `closure` names the component that takes what the others leave.
- The element balance is reported, not enforced. A lumped product often has no exact formula, so the notes say by how
  much each element is off.
- The heat of reaction comes from the formation data of every component that changes. Where one has none, give
  `heatOfReaction: { dH_J_mol, phase, source }`: per mol of key converted, at 298.15 K, every species as the ideal gas
  (`"vapour"`) or as the pure liquid (`"liquid"`), with its source. Without it, the reactor refuses and names the
  component.

**The energy balance.** The stream enthalpies are referred to each component's ideal gas at 298.15 K (a nonvolatile
component: its liquid there). The heat of reaction is put on the same basis: ΔrH_ref = Σ ν_j Hf_j, with Hf_j the
enthalpy of formation of j in that reference state, from its formation record by the paths of "Heat of reaction and
K(T)" (`formationReference`, `reactionHeat`). A given heat of reaction (`heatOfReaction` on a reaction or a yield
reactor) is shifted from its standard state to that basis. Then

duty = H_out − H_in + Σ_r ξ_r ΔrH_ref,r

with ξ in kmol/h, so the heat of reactions in kW is ξ ΔrH / 3600. An isothermal reactor's duty is therefore the heat of
reaction at its temperature, and an adiabatic one (`duty_kW: 0`) heats or cools by it.

**Balances.** Every reactor checks in + generation = out for each component, and the element balance of the
generation (the mass balance for the yield reactor) to 1e-9. A flowsheet with reactors closes feeds + generation =
products, and its energy balance subtracts the heat of the reactions. Its results give `generation_kmol_h` and
`reaction_kW`, and each reactor's `reaction`: the generation, the extents, the conversions and the heat.

**Tests** (`test/reactors.test.js`):

- Methanol from CO₂ with Peng–Robinson at 1 kPa (close to the ideal gas): the isothermal duty against Cantera's heat
  of reaction at 350, 550 and 700 K (validation/fixtures/reactions.json), within 1e-4.
- An adiabatic reactor and the isothermal one at its outlet temperature, which needs no duty.
- Parallel and series reactions, and what is refused.
- The yield reactor on esterification, mass and mole basis, with closure, a lumped product and a given heat of
  reaction.
- A methanol loop with a recycle and a purge against the hand calculation, with the overall material, element and
  energy balances.

**In the workbench** (step 7): the Flowsheet workspace has a Reactions page next to Components and Method.

- Each reaction is written with one coefficient per component. Its balance check and, where the formation data allow,
  ΔrH°, ΔrG° and K at 298.15 K are shown at once.
- Reactions can be exported as a file and imported into another project.
- The Reactors group of the toolbar places the two blocks.
- Their results give the duty, the heat of the reactions and the conversions; the table under the streams gives a row
  per reaction.
- The Excel export writes a conversion reactor's outlet flows as formulas of its conversions.
