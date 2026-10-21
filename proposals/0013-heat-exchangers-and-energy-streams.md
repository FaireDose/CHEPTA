# 0013: Heat exchangers, energy streams, pumps, valves and compressors

- **Status:** Accepted (by the maintainer, 2026-10-20; answers below)
- **Author(s):** CHEPTA maintainers (drafted with an AI assistant)
- **Discussion:** this pull request
- **Roadmap item:** core track A6 (unit operations: "Pump, valve"; "Heat exchangers, compressors and expanders"),
  cost track E1 (heat-exchanger area, pump and compressor power), release v0.4 to v0.6

## Problem

The flowsheet's heater / cooler gives a duty, but not the size of the exchanger that would carry it, nor the steam
or cooling water it takes. Nothing exchanges heat between two process streams. Energy streams exist only as results
(each block with a duty reports `Q-<block>`); they cannot be given, or carried from one block to another. Pumps,
valves and compressors are drawn as "coming later". The Unit models section has only the flash.

The maintainer asked for (2026-10-20):

1. in **Unit models**, a heat exchanger for **pre-sizing**: known heat transfer coefficients, or the user's own, and
   the transfer area from them;
2. the **wall**: a drop-down list of materials with their thermal conductivities, the user's own as an option, and a
   thickness from the pressure;
3. a **Rating** button, locked for now (does a given exchanger heat a given flow?);
4. in the **flowsheet**, energy streams as a specification: "I give the duty and it gives back the temperatures at the
   end"; the number of equations grows with them;
5. two heat-exchanger models: the **simple** one (one process stream and a utility, each utility with its own U, so it
   also gives an area) and one with **two fluids**;
6. **pump and compressor** blocks in the flowsheet.

## Proposal

### 1. Pre-sizing: Q = U A ΔT, along the real temperature-heat curve

One calculation serves the Unit models workspace and the flowsheet blocks (`src/units/heat-exchange.js`, layer 4):

```js
CHEPTA.exchangerArea(sys, {
  hot:  { stream, out: { T_K } },            // or a utility, below
  cold: { utility: { kind: "cooling-water", T_in_K: 303.15, T_out_K: 313.15 } },
  U_W_m2K: 850,                              // or film: { h_hot, h_cold, Rf_hot, Rf_cold, wall } (section 2)
  arrangement: "counterflow",                // or "shell-and-tube-1-2", "crossflow-unmixed" (section 1c)
  zones: 20,
}) → { duty_kW, area_m2, UA_kW_K, dT_lm_K, dT_min_K, F, zones: [...], utility: { flow_kg_h, ... }, notes }
```

a. **Zones, not one LMTD.** A stream that boils or condenses has a curved temperature-heat line, and one LMTD over
   the whole exchanger is then wrong. The duty is split into equal heat steps; each side's temperature at each step
   comes from a P-H flash of that side (the same flash as every stream); each zone's area is
   dA = dQ / (U F ΔT_lm,zone), and the areas add up. With constant heat capacities the zones give back the single
   LMTD (a test). The smallest temperature difference over the zones (the internal pinch) is reported; a crossing
   (ΔT ≤ 0 anywhere) is an error that names where, never an area.
b. **Pressure drop**: given per side (default none), spread evenly over the zones.
c. **Arrangement**: counterflow (F = 1), cocurrent, one shell pass with 2, 4, ... tube passes, and crossflow, through
   the effectiveness-NTU relations of Lienhard and Lienhard (Table 3.1 and eqns. 3.20-3.21): NTU from ε and R of the
   terminal temperatures, compared with the counterflow NTU, gives one F for the exchanger, applied to the zones'
   counterflow UA. An arrangement whose relation has no solution (ε above the arrangement's limit) is refused with the
   reason ("needs more shells in series"). (Step 1 first applied F zone by zone; that hides the temperature cross of a
   multipass exchanger, since every small zone looks feasible, so F is taken from the terminal temperatures, and the
   result says it is an approximation when a side changes phase.)

### 2. Where U comes from: a service table, film coefficients, or the user

Three ways, shown side by side; the user's own value is always one of them:

- **Overall U for a service**: the typical ranges of Lienhard and Lienhard, Table 2.2 (for example "Steam condensers
  with 25 °C water: 1,500-5,000 W/m² K", "Steam or water to oil: 60-340"). A range is a range: the user picks the
  value, the default is the **low end** (the larger, safer area), and the range is shown next to the result.
- **From film coefficients**: 1/U = 1/h_hot + R_f,hot + t_wall/k_wall + R_f,cold + 1/h_cold (thin wall, area of
  the wall's outside; Lienhard and Lienhard eqn. 2.36 for fouling), with
  - h: approximate values of Lienhard and Lienhard, Table 1.1, or the user's own;
  - R_f: Table 2.3 (fouling resistances, "based on reasonable maintenance ... conventional shell-and-tube heat
    exchangers"), or the user's own;
  - the **wall material** from a drop-down list with its thermal conductivity at temperature, Table A.1 (carbon
    steels, stainless steels 304, 316, 347 and 410, copper, brass, aluminium alloys, nickel, Inconel X-750, titanium
    ...), interpolated in temperature and refused outside the table's range; or the user's own material and k.
  This is where the material and thickness matter. They are not added to a service U, which already includes a
  typical wall.
- **The user's own U**.

The data go in `src/data/heat-transfer.json`, every value with its table and page, tier "databank" (or "user").

### 3. Utilities, each with its own U

The simple model is one process stream against a utility. Each utility has a temperature behaviour, its consumption
and a default service row of Table 2.2 for U (changeable):

| Utility | Temperature | Consumption | Properties from |
|---|---|---|---|
| Saturated steam at a chosen pressure (condensing) | T_sat(P) | kg/h from the latent heat | IAPWS-IF97 (in CHEPTA) |
| Cooling water, chilled water | inlet and outlet temperatures given | kg/h | IAPWS-IF97 |
| Hot or cold fluid of the user's own | constant, or inlet and outlet with a heat capacity | kg/h | the user |
| Electric heating | none | kW | (no area) |

Utility temperature levels and prices are the user's (no open table was found); the cost track (E) will add prices.

### 4. The wall thickness from the pressure

For a tube or shell of inside radius r under internal pressure P, with an allowable stress S and a weld joint
efficiency E: the thick-walled cylinder of Lamé (the hoop stress at the inner wall equals S E), which for thin walls
reduces to t = P r / (S E); plus a corrosion allowance c. The result is the minimum thickness; the larger of it and
the tube's own wall is used in section 2.

- **The allowable stress is the user's.** The values designers use (ASME Section II, Part D) are paywalled, and no
  open table of allowable stresses was found (searched: Lienhard and Lienhard; the Northwestern process-design wiki,
  which quotes ASME II-D and states no licence). So the drop-down gives each material's conductivity, and asks for S.
- **No material recommendation from the pressure.** No open source ties a material to a pressure; the choice is
  driven mostly by corrosion and temperature. The workbench shows the material's conductivity range and the
  temperatures its data cover, and leaves the choice to the engineer.

### 5. The Unit models workspace: Heat exchanger

Next to Flash: **Heat exchanger**, with two modes, *with a utility* and *two streams*. Inputs: the stream(s) (the
workspace's components and model, as in Flash), the outlet specification (outlet T, duty or vapour fraction of one
side), the utility or the second stream, the arrangement, the U (section 2) and the wall (section 4). Results: duty,
area, UA, mean and minimum ΔT, the utility's consumption, the zones as a table, and the temperature-heat diagram of
both sides (with the pinch marked); CSV and Excel export as for the flash. A locked **Rating** button: "Given an
exchanger (area, U, arrangement), the outlet temperatures of a given flow: not available yet."

### 6. Energy streams in the flowsheet: a specification, carried between blocks

Today every block with a duty reports an energy stream as a result. Two additions:

- **An energy feed**: a stream of given duty (kW) into a block with a duty (heater / cooler, flash drum, separator,
  heat exchanger). The block's duty comes from it, so it needs one specification fewer: a heater with an energy feed
  of 500 kW gives its outlet temperature.
- **An energy stream between two blocks**: the duty taken out of one block (a cooler) goes into another (a heater). It
  adds one equation (Q_out of the first = Q_in of the second) and frees one specification of the second. The
  degrees-of-freedom count of the Inputs panel includes them.

Which blocks take one: every block with a duty (heater / cooler, flash drum, component separator, later the reactors);
pumps and compressors take a work stream (power) the same way. Each block decides by its specification:

| The block is given | Its energy stream |
|---|---|
| its outlet state (outlet temperature, vapour fraction) | is a **result**: the block calculates the duty and sends it on |
| an energy stream (an energy feed, or one from another block) | is a **specification**: the block calculates its outlet temperature from it |

Giving both is one specification too many, and the Inputs panel says so.

Energy streams are drawn dashed, with their kW. **Recycles:** a two-stream heat exchanger may take a recycle stream on
either side (a feed-effluent exchanger), since the solver tears material recycles as it does today. A loop closed by
an energy stream alone (a cooler's duty sent to a heater upstream of it) is torn the same way, on the duty (one number
per energy stream). No pinch analysis or heat-exchanger network design.

### 7. Heat-exchanger blocks in the flowsheet

- **Heater / cooler** (today's block) gains an optional utility and U: it then also reports the area and the
  utility's consumption. Nothing else changes, so every saved flowsheet calculates as before.
- **Heat exchanger** (two streams): inlets `hot` and `cold`, outlets `hot` and `cold`; one specification (an outlet
  temperature of either side, the duty, the minimum approach ΔT, or a vapour fraction), pressure drop per side
  optional, U optional (with it, the area). The second-law check of section 1a holds: a temperature cross is an error.

### 8. Pump, valve, compressor

- **Valve**: outlet pressure or pressure drop; adiabatic (a P-H flash at the inlet enthalpy).
- **Pump**: outlet pressure or pressure drop, and an efficiency, by default a typical value from an open source
  (chosen in the pump's step, with its range; the user's own replaces it).
  Power = V ΔP / η with V the inlet liquid's volume flow (its liquid-density records); outlet from the enthalpy
  balance, H_out = H_in + power. A vapour fraction above zero at the inlet is refused ("a pump needs a liquid").
- **Compressor and expander**: outlet pressure, and an isentropic (or polytropic) efficiency. They need the entropy
  of a mixture and a flash at given P and S, which CHEPTA does not have yet (it has the residual entropy of the
  equations of state and the pure-component entropy, not the mixture's for every model). So a step of its own: the
  mixture entropy for every model (ideal gas plus the residual of the equation of state, or the activity model's
  liquid through its excess enthalpy and Gibbs energy), the P-S flash with the tests of the other flashes, then the
  blocks. The power and the energy stream are reported as for the pump. The efficiency defaults to a typical value
  from an open source, as for the pump.

### 9. Charts for gases and mixtures, with the steam charts

Asked on 2026-10-20: "phase envelopes of different gases ... so I know where to compress them, something like an
enthalpy entropy diagram ... maybe you can combine this with steam properties from water". The mixture entropy of
section 8 makes it possible:

- **Phase envelope traced through the critical point.** Today's envelope solves bubble and dew points pressure by
  pressure and stops short of the mixture critical point. With an equation of state it is traced instead as one curve
  by continuation in ln K and ln T (Michelsen 1980), which passes the critical point and the cricondentherm and
  cricondenbar, and marks them. To be cited from an open copy in its step, or else from an open implementation.
- **Charts**: the Steam workspace becomes **Charts**: water and steam (IAPWS-IF97, as today), or any component or
  mixture with an equation of state: pressure-enthalpy, temperature-entropy and enthalpy-entropy (Mollier) diagrams,
  with the two-phase dome and lines of constant pressure, temperature and quality, and a compression drawn on it
  (from an inlet to an outlet pressure at an isentropic efficiency). Validated against CoolProp for pure fluids, within
  0.5 %.

## Engineering basis

- **Lienhard, J. H. V and Lienhard, J. H. IV, A Heat Transfer Textbook, 6th edition, version 6.00 (19 April 2024),
  Phlogiston Press**: <https://ahtt.mit.edu/> (PDF <https://ahtt.mit.edu/wp-content/uploads/2024/04/AHTTv600.pdf>).
  Free to download and read; "the authors grant you the right to download and print it for your personal use or for
  non-profit instructional use" (title page verso). It is free and legal to read, so every reviewer can check it, but
  not openly licensed: CHEPTA would take its numbers (facts, cited by table and page), not its text or figures.
  Used: Table 1.1 (h, p. 21), Table 2.2 (U, p. 82), Table 2.3 (R_f, p. 84), eqn. 2.36, section 3.2 (LMTD, eqn.
  3.13; F, eqn. 3.14), section 3.3 (effectiveness-NTU, eqns. 3.20-3.21, Table 3.1), Table A.1 (metals, pp. 739-740).
- **Lamé**, thick-walled cylinder (1852): to be cited from a public-domain copy in the step that uses it.
- **IAPWS-IF97** for steam and water utilities (in CHEPTA).
- **Validation**:
  - zone sum against the single LMTD for constant heat capacities (to 1e-9), and against Lienhard's worked examples:
    section 3.2, water heated from 20 to 40 °C by steam condensing at 60 °C, LMTD = 28.85 K; Example 3.6, A = 22.73 m²
    by the LMTD; Example 3.5 (effectiveness), Q = 655.6 kW, outlets 84.44 °C and 72.78 °C;
  - an independent calculation in `validation/python/` with CoolProp for water and a refrigerant condensing against
    water (zones, area), within 0.5 %;
  - F of one shell pass with two tube passes, from the ε-NTU relation of Table 3.1, against Lienhard's Fig. 3.14(a)
    at a few points (read off the graph, and said so);
  - pump power against V ΔP / η by hand; valve outlet against a P-H flash; compressor against CoolProp's isentropic
    outlet for a pure gas and a mixture of the equations of state (methane + ethane), within 0.1 K.

## Effect on existing work

- Saved flowsheets keep calculating as before: the heater's utility and U are optional, the new blocks and energy
  feeds are new types. The flowsheet file gains `energy` edges (a new list, `energyStreams`), so the format version
  rises by one, and older files open unchanged.
- The "coming later" pump, valve and compressor become blocks; reactor, column and extraction stay "coming later".
- The Unit models section gains a workspace (navigation test lists it, with a comment).

## Alternatives considered

- **One LMTD for the whole exchanger**: simple, and wrong for any condensing or boiling stream with a superheat or a
  subcool. The zones cost one P-H flash per zone per side; twenty zones run in well under a second.
- **A detailed thermal design (Kern, Bell-Delaware) now**: it needs tube layouts, baffles and the shell-side
  correlations; it belongs to the Rating step, which this proposal leaves locked.
- **Default efficiencies and utility temperatures**: tempting, but no open source gives general values; the user's
  numbers, labelled as theirs, are honest.
- **Allowable stresses from secondary web tables**: they copy ASME II-D, which is paywalled (AGENTS.md rule 1).

## Steps

Steps 1-5 are done, together, as the maintainer asked (2026-10-20: "can you do in the same time 1-5?"), in the pull
request of this proposal (docs/decisions/2026-10-20-06-heat-exchangers.md).

1. **The heat-exchange calculation** (layer 4): zones, arrangements (F from ε-NTU), U from the three sources, the
   data file from Lienhard and Lienhard, utilities, the wall thickness; tests and the Python reference.
2. **Unit models, Heat exchanger workspace**: both modes, the material drop-down with the user's own, the thickness,
   the temperature-heat diagram, exports, the locked Rating button.
3. **Flowsheet energy streams**: energy feeds and energy streams between blocks, the degrees of freedom, the drawing,
   the file format; the heater's optional utility and area.
4. **Flowsheet heat exchanger** (two streams).
5. **Valve and pump** blocks.
6. **Mixture entropy and the P-S flash**, then the **compressor and expander** blocks. Done 2026-10-21
   (docs/decisions/2026-10-21-03-entropy-compressor-charts.md).
7. **Charts**: the envelope traced through the critical point (done 2026-10-21, docs/decisions/2026-10-21-01-phase-envelope.md),
   and the P-H, T-S and H-S charts with the steam charts (done 2026-10-21, with step 6).
8. Later: **Rating** (unlocked).

Then proposal 0010 (reactions): formation data first, then the reactor blocks.

## The maintainer's answers (2026-10-20)

"1-4 do what you recommend, 5- add a typical recommendation as default, 6- ... if i have a heat exchanger where i put
two streams i expect that i can put one from recycle. we do not need to do pinch analysis now."

1. Lienhard and Lienhard: its numbers are taken, cited by table and page.
2. The allowable stress is the user's.
3. No material recommendation from the pressure; the list gives the conductivity.
4. A range of U: the low end by default.
5. Efficiencies: a typical value from an open source by default (section 8), the user's own replaces it.
6. A recycle into a two-stream exchanger works (section 6), and so does a loop closed by an energy stream; no pinch
   analysis.

Also asked: which blocks take an energy stream, and whether it is a result or a specification (section 6, the
table); and the charts for gases (section 9, step 7).

## Questions answered before acceptance

1. Lienhard and Lienhard's textbook is free to read but not openly licensed: may CHEPTA take its numbers, cited by
   table and page (as with the free NIST reprints of J. Phys. Chem. Ref. Data)?
2. Allowable stress: the user's own (no open table found). Agreed, or search further?
3. Material: no recommendation from the pressure (no open source); the list gives the conductivity. Agreed?
4. A range of U: the low end by default (the larger area). Agreed, or the middle?
5. Pump and compressor efficiencies: always the user's (no default). Agreed?
6. Energy streams in loops: refused at first, torn in a later step. Agreed?
