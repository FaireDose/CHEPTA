# Reactions

How CHEPTA describes a reaction and computes its heat of reaction, equilibrium constant and rate (proposal 0010,
step 2; code in `src/reactions/`), and the conversion, yield (step 3) and equilibrium (step 4) reactors that use them
(`src/units/reactors.js`, [below](#reactors)). The CSTR, plug-flow and Gibbs reactors come in the next steps.

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

Six reactor blocks (proposal 0010, steps 3 to 6; `src/units/reactors.js`, `src/units/kinetic-reactors.js`) work alone
(`runUnit`), in flowsheets, and in the Reactor workspace of the Unit models (below). The
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

**Equilibrium reactor** (`equilibrium-reactor`; step 4). The listed reactions reach chemical equilibrium together at
the outlet temperature and pressure:

```json
{ "id": "RE1", "type": "equilibrium-reactor",
  "spec": { "reactions": [{ "reaction": "meoh" }, { "reaction": "rwgs", "approach": { "dT_K": 10 } }],
            "T_K": 523.15, "P_kPa": 5000 } }
```

- The extents ξ_r solve Σ_j ν_rj ln a_j = ln K_r(T) for every reaction (Rawlings and Ekerdt, section 3.5.1, p. 88), by
  Newton's method (`src/equilibrium/reaction-equilibrium.js`). K is from the formation data, or from the reaction's own
  correlation, as in "Heat of reaction and K(T)".
- The activities are those of the reaction's standard state, from the simulation's property package: a vapour reaction
  a_j = f_j / P° (the ideal gas, Peng–Robinson or SRK); a liquid reaction a_j = f_j / f_j,pure, which is γ_j x_j for
  an activity model.
- The reactions must be independent (none a sum of the others).
- `"phases": 1` (the default): the reactions are all vapour or all liquid, and the whole mixture is taken to be in that
  phase. The outlet is flashed afterwards, and a note says when it is not in the reaction's phase.
- `"phases": 2`, a reactive flash (2026-10-28): at each set of extents the mixture is flashed at T and P, and the
  activities come from the fugacities of the phases found (equal in both at phase equilibrium), so chemical and phase
  equilibrium hold together. Each reaction keeps its own standard state, so vapour and liquid reactions can be mixed.
- **Gibbs reactor** (`gibbs-reactor`, step 6; a block of its own, on this solver): the species that may react are given
  (`species`, default all), not the reactions. CHEPTA reduces their element matrix and writes one reaction for each species that is not a pivot (a basis of
  the null space): a complete set of independent reactions, with K from the formation data in the standard state of
  `phase` (vapour by default). Their equilibrium is the minimum of the Gibbs energy with the elements balanced
  (Rawlings and Ekerdt, section 3.5.2, p. 92). The others pass through. The result lists the reactions it wrote
  (`reaction.generated`). One phase or two, as above.
- An approach to equilibrium, per reaction: `{ "dT_K" }` evaluates K at the outlet temperature plus ΔT (an approach
  temperature), `{ "fraction" }` takes that fraction of the equilibrium extent.
- The outlet is given by its temperature or the duty (0: adiabatic, the outlet temperature where the energy balance
  closes with the reactions at equilibrium), and its pressure or pressure drop. A vapour fraction is not a
  specification of this reactor.
- A species that takes part and is not fed is first made present by a tiny extent (1e-8 of the feed) of a reaction
  that forms it. A reaction none of whose species can be fed or formed has no extent, and a note says so.
- Refused, with the reason: dependent reactions, reactions in both phases with one phase, a component without a Gibbs
  energy of formation when the reaction has no K of its own.

**CSTR** (`cstr`) and **plug-flow reactor** (`pfr`), step 5: the reactions with their rate laws ("Rate laws" above, or
your own formula, below).

```json
{ "id": "CS1", "type": "cstr", "spec": { "reactions": [{ "reaction": "est" }], "V_m3": 2, "T_K": 340, "P_kPa": 101.325 } }
{ "id": "PF1", "type": "pfr", "spec": { "reactions": ["r1", "r2"], "L_m": 3, "D_m": 0.05, "tubes": 20, "duty_kW": 0,
  "pressureDrop": { "particle_m": 0.003, "voidage": 0.4, "viscosity_Pa_s": 2e-5 } } }
```

- Each rate is evaluated in its reaction's phase, from that phase's composition: C_j = x_j / v (v = Z R T / P for a
  vapour; Σ x_j M_j / ρ_j for a liquid, from the pure liquids' density records), p_j = x_j P, the fugacity f_j, and the
  activity a_j (f_j / P° for a vapour, f_j / f_j,pure for a liquid). `"phases": 2` flashes the mixture and uses the phase
  found; with one phase the whole mixture is the reaction's phase.
- CSTR: ξ_r = 3.6 S_r r_r at the outlet, S_r the reactor volume `V_m3` (with two phases times `liquidFraction`, the
  liquid's share, or one minus it), or the catalyst mass `W_kg` for a rate per kg of catalyst. Newton's method in the
  extents, with a continuation in the size when the direct solution fails. T given, or the duty (then the steady state
  nearest the inlet temperature; a CSTR can have several, Rawlings and Ekerdt section 6.3.1). It reports the residence
  time V / Q_out.
- PFR: dξ_r/dz = 3.6 A w_r r_r along the tube (A = tubes π D²/4; w_r = 1 with one phase, the share of the volume flow in
  the reaction's phase with two, or the bed density `bed_kg_m3` for a rate per kg of catalyst). Energy: isothermal
  (`T_K`), a duty spread evenly (`duty_kW`, 0 adiabatic), or a coolant (`coolant: { U_W_m2K, T_K }`, through the wall);
  d(H + Σ ξ ΔrH)/dz = q, and T where the reaction phase's enthalpy (with two phases: a P-H flash) meets H. Pressure:
  none, a given drop spread along the tube, or the Ergun equation of a packed bed (eqn 7.69, p. 398) with the gas
  viscosity you give. Integrated by the stiff, error-controlled Rosenbrock pair of ode23s (Shampine and Reichelt 1997;
  `src/util/ode.js`); `reaction.kinetic.profile` holds z, T, P, the flows, the vapour fraction and the rates at each step.
- The Excel export lists their extents; the outlet flows are values from CHEPTA.

**Your own kinetics** (`"form": "expression"`, step 9): a formula, parsed without `eval` (`src/reactions/expression.js`):

```json
{ "form": "expression", "rate": "k1 * C['acetic-acid'] * C['ethanol'] - k1 / K * C['ethyl-acetate'] * C['water']",
  "constants": { "k1": { "k0": 2.5e3, "Ea_J_mol": 48000 } }, "per": "volume", "source": "..." }
```

Names: T (K), P (kPa), R, K (the reaction's equilibrium constant at T), C['…'] (mol/m³), x['…'], p['…'] (kPa),
f['…'] (kPa), a['…'], your constants (a number, or k0 T^B exp(−Ea/RT)); exp, ln, log10, sqrt, abs, min, max; + − * /
^ (or **). An error names its position ("unknown name 'conc' at character 12; known: …").
- In the Excel export its outlet flows are values from CHEPTA (equilibrium is not a spreadsheet formula); the Inputs
  sheet lists each reaction's K and extent.

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

**In the workbench.** The flowsheet's toolbar has one Reactor button; its menu lists the six types. A reaction saved
"global" on a Reactions page can be added on the other workspace's Reactions page without writing it again. A selected
plug-flow reactor (or a double-click on it) shows its profiles under the drawing, in place of the stream table:
molar flows, mole fractions, temperature, pressure, conversion, rates and vapour fraction against the length, as the
profile plots of desktop simulators. The Reactor workspace of the Unit models is a flowsheet of its own (a feed, one
reactor, its product) with the same panels and engine, and the curves of a preliminary study: the profiles, the
conversion (or the outlet's mole fractions, or the duty) against the reactor temperature, the conversion against a
CSTR's volume, ΔrH and ln K of each reaction against temperature, and each rate against temperature at the feed's
composition. The Reactions page edits each reaction's kinetics (a form and its constants, or your own formula).

**Tests** (`test/reactors.test.js`):

- Methanol from CO₂ with Peng–Robinson at 1 kPa (close to the ideal gas): the isothermal duty against Cantera's heat
  of reaction at 350, 550 and 700 K (validation/fixtures/reactions.json), within 1e-4.
- An adiabatic reactor and the isothermal one at its outlet temperature, which needs no duty.
- Parallel and series reactions, and what is refused.
- The yield reactor on esterification, mass and mole basis, with closure, a lumped product and a given heat of
  reaction.
- A methanol loop with a recycle and a purge against the hand calculation, with the overall material, element and
  energy balances.

`test/equilibrium-reactor.test.js` (the equilibrium reactor):

- Gas, the ideal gas: methanol from CO₂ with the reverse water-gas shift (493-573 K, 30-80 bar), ammonia synthesis
  (650-700 K, 100-200 bar) and ethanol dehydration (450-550 K, 1-5 bar), against Cantera's minimization of the Gibbs
  energy with the same species and records (`validation/python/reference_equilibrium.py`,
  `validation/fixtures/equilibrium.json`): mole fractions within 2e-4 relative.
- Liquid: ethyl acetate esterification with NRTL at 320 and 345 K, two feeds, against scipy (brentq) with the NRTL of
  `reference_model.py`: the extent within 1e-6 relative.
`test/kinetic-reactors.test.js` (steps 5, 6 and 9; `validation/python/reference_kinetics.py`,
`validation/fixtures/kinetics.json`):

- The reactive flash: esterification with NRTL and its vapour at 350, 352 and 355 K and 101.325 kPa, against scipy
  (a flash by fsolve inside brentq on the extent): the extent within 1e-6, the vapour fraction within 1e-4.
- Gibbs reactor: the reactions it writes for CO₂, H₂, methanol, water and CO give Cantera's Gibbs minimum (the fixture of
  the equilibrium reactor), mole fractions within 2e-4 relative.
- PFR and CSTR with two reversible Arrhenius rates (ethanol to ethylene and to diethyl ether, ideal gas): the profile
  and outlet against scipy's solve_ivp (Radau) within 2e-5 relative at the outlet; the CSTR against fsolve within 1e-8;
  the same with the rates written as your own formula.
- Rawlings and Ekerdt Example 4.4 (a 12.2 m tube for 35 % conversion) within 0.002 in the conversion, and Example 4.2's
  balance X = kτ/(1 + kτ) for a first-order CSTR exactly.
- An adiabatic PFR with the Ergun pressure drop: balances, and the drop of a short tube against eqn 7.69.
- The stiff integrator on Robertson's problem against Radau; the formula's error messages.

- With Peng–Robinson, the reactor block closes the element and energy balances in every gas case; it tends to the ideal
  gas at 10 kPa and differs from it at 50 bar.
- The duty given (adiabatic, and the duty of a given temperature brings that temperature back), the two approaches, a
  liquid outlet that is partly vapour, and what is refused.

**In the workbench** (step 7): the Flowsheet workspace has a Reactions page next to Components and Method.

- Each reaction is written with one coefficient per component. Its balance check and, where the formation data allow,
  ΔrH°, ΔrG° and K at 298.15 K are shown at once.
- Reactions can be exported as a file and imported into another project.
- The Reactors group of the toolbar places the two blocks.
- Their results give the duty, the heat of the reactions and the conversions; the table under the streams gives a row
  per reaction.
- The Excel export writes a conversion reactor's outlet flows as formulas of its conversions.

## Worked examples

Proposal 0010, step 8. CHEPTA ships no reactions: each example is defined in a test, with its source, for a user to copy
into the Reactions page (the rate as written there). `docs/BENCHMARKS.md` is generated by a script, so the examples are
listed here.

| Example | Reactor | Source | Checked against | Test |
|---|---|---|---|---|
| Methanol from CO₂ and the shift (CO₂ + 3 H₂ ⇌ CH₃OH + H₂O; CO₂ + H₂ ⇌ CO + H₂O), 493–573 K, 30–80 bar | equilibrium | the formation records | Cantera's Gibbs minimization | `test/equilibrium-reactor.test.js` |
| Methanol from CO (CO + 2 H₂ → CH₃OH), and a methanol loop with a purge | conversion | the formation records | Cantera's heat of reaction; the balances of the loop | `test/reactors.test.js` |
| Ethyl acetate by esterification, liquid, and with vapour and liquid together | equilibrium (one or two phases) | NRTL pairs fitted to open data | scipy | `test/equilibrium-reactor.test.js`, `test/kinetic-reactors.test.js` |
| Ethanol to ethylene and diethyl ether over ZSM-5, 573.15 K, 1 atm | plug flow, rate per kg of catalyst, your own formula | Aali and Hadi, Diyala J. Eng. Sci. 16(2) (2023) 30–49, [doi:10.24237/djes.2023.16203](https://doi.org/10.24237/djes.2023.16203), CC BY 4.0: eqns 4 and 14, Tables 8 and 9 | scipy (Radau) | `test/kinetic-reactors.test.js` |
| Phenol and acetone from cumene hydroperoxide, 85 °C, k = 4.12 1/h, 37 m³ | CSTR | Rawlings and Ekerdt, Example 4.2 | the book: 85 % with the volume unchanged; CHEPTA 83.8 %, because the products take about 10 % more volume (the liquid density records) | `test/kinetic-reactors.test.js` |
| A → B + C in a 12.2 m tube (ethane to ethylene and hydrogen as A, B, C) | plug flow | Rawlings and Ekerdt, Example 4.4 | the book: 35 % | `test/kinetic-reactors.test.js` |

The ethanol example, as typed in the rate box (partial pressures in atm, rates in mol/(kg s): the article's mol/(g h)
times 1000/3600), with the constants of Table 9 at 573.15 K and K_eq of Table 8:

```
ethylene:      k1 * (p['ethanol']/101.325 - p['ethylene']/101.325 * p['water']/101.325 / Keq1) / (1 + p['ethanol']/101.325 * KA1)
diethyl ether: k2 * KA2^2 * ((p['ethanol']/101.325)^2 - p['water']/101.325 * p['diethyl-ether']/101.325 / Keq2) / (1 + p['ethanol']/101.325 * KA2)^2
```

Not yet possible:

- **Benzene pyrolysis** (Rawlings and Ekerdt, Example 4.5; biphenyl and p-terphenyl): p-terphenyl has no open ideal-gas
  heat capacity, so its enthalpy at 1033 K, which the reactor's duty needs, is refused.
- **Esterification kinetics** from an open article: a web search named one on the open TÜBİTAK site (Turk. J. Eng.
  Environ. Sci. 25 (2001), acetic acid and ethanol on Amberlyst-15), but the server refused the download, so it was not
  opened; it is on the list of articles to download by hand.
- **HMF rehydration** to levulinic and formic acid: levulinic acid has no open ideal-gas heat capacity.
