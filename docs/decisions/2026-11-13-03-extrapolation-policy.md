# 2026-11-13-03: Strict data, lenient use: records outside their range

The maintainer, 2026-11-13: "I see the problems appear always, that our software does not allow calculations because
we are too strict with the data. We want to be fair but this does not allow the simulation to flow. Calculations are
now restricted every time and we lose tokens and time to fix this because we want to work only between fitted points
or do not accept extrapolation." They gave the coordinator freedom on how to fix it and agreed to the design below.

## The rule

1. **Data stay strict.** Sources, fits, tiers, stated ranges and validation data are unchanged (AGENTS.md rules 1-6).
   Only the engine's *use* of a record outside its range changes.
2. **Outside a record's range the engine calculates and warns.** The result carries a warning naming the component,
   the property, the record's range, how far outside and how it was continued, ending "This is an extrapolation, not
   data." Example: `Acetic acid: liquid heat capacity at 275 K is 14.69 K below its range (289.69-400 K): the value is
   continued linearly from the record's end, through its value and slope there. This is an extrapolation, not data.`
3. **What still refuses:** a physically impossible state, a property with no record (`MISSING_DATA`, unchanged),
   inconsistent specifications, and solvers that do not converge. An extrapolated answer is returned *loudly*.
4. **Strict mode, opt-in:** `solver: { strictRanges: true }` in a flowsheet, `options: { strictRanges: true }` in a
   `CHEPTA.run` request, or `CHEPTA.withRangePolicy({ strictRanges: true }, fn)` / `CHEPTA.setStrictRanges(true)`
   restore the refusals of before 2026-11-13. Default: lenient.
5. **Warnings are not noise.** A flowsheet's `result.extrapolations` lists each once per component, property and side,
   at the farthest distance reached, with the blocks where it happened (`where`), a one-line `short` form and the full
   `message`; the canvas Warnings tab shows them in the two-step form of PR #235 and the Excel export has a "Warnings"
   sheet. The equilibrium and enthalpy records are checked at the **answer's** temperatures (each block's outlets and
   a column's stages and feeds), not during the searches that lead there (`quietly` in `src/util/ranges.js`), so a
   search that probes 1000 K does not report a 1000 K extrapolation.

## How each kind of record is continued (`src/thermo/correlations.js` and the files named)

| Record | Continuation | Refused when |
|---|---|---|
| vapour pressure (DIPPR101) | its own equation where it stays finite and rising between the end and T; else ln P linear in 1/T from the end, value and slope (Clausius-Clapeyron) | above the critical temperature with no finite rising equation (hydrogen in Raoult's law at 523 K, as before) |
| liquid and ideal-gas heat capacity, thermal conductivities, solid heat capacity (DIPPR100 and others) | linear from the end, value and slope | the value becomes zero or negative |
| ideal-gas heat capacity in the Aly-Lee form (DIPPR107) | its own equation (*refinement, below*) | not finite or not positive |
| liquid density, heat of vaporization, surface tension (DIPPR105/106) | their own equation, which reaches the critical point | at or above the record's critical temperature |
| any other form of those three | linear from the end | not positive |
| liquid viscosity | ln mu linear in 1/T from the end (Arrhenius) | not positive |
| vapour viscosity | linear from the end (*refinement*) | not positive |
| any liquid property (density, cp, ΔHvap, viscosity, conductivity, surface tension) | as above | at or above the component's critical temperature: no liquid (*refinement*) |
| derived ideal-gas heat capacity (Kirchhoff, DATA_RULES 10) | its liquid records continued | as they are |
| Henry's law constant (`henry.js`) | ln H linear in 1/T from the end of the equation's range (van 't Hoff) | at or above water's critical temperature |
| solubility curve (`solubility-curve.js`) | its fitted equation; points: ln x linear in 1/T along the end segment | a mole fraction of 1 or more |
| drum K chart (`sizing.js`), Fair's flooding chart (`hydraulics.js`), wall conductivity table (`heat-exchange.js`) | the end value held | never (a chart value is positive) |
| IAPWS-IF97, transport releases (`iapws/*.js`, `pure.js`) | the equations evaluated beyond their range where they stay finite (supercooled water, above 2273.15 K, above 100 MPa) | saturation above the critical point; a non-finite or non-positive value |

**What other simulators do** (METHOD_SELECTION.md, "When in doubt"): the open thermo library (version 0.6.1, MIT,
installed and its source read in this session) continues every temperature-dependent property by default:
`VaporPressure` `extrapolation='AntoineAB|DIPPR101_ABC'` (ln P linear in 1/T), `HeatCapacityLiquid` and
`HeatCapacityGas` `'linear'`, `ViscosityLiquid` `'Arrhenius'`, `ViscosityGas` `'linear'`, `ThermalConductivityLiquid`
and `ThermalConductivityGas` `'linear'`, `VolumeLiquid` `'quadratic_positive_slope|linear'`, `EnthalpyVaporization`
`'Watson'`, `SurfaceTension` `'DIPPR106_AB'` (the last two go to zero at the critical point, as a DIPPR106 record does
itself). The forms above follow these. DWSIM's and ChemSep's own sources were not opened in this session, so nothing is
claimed about them here.

## Refinements of the design (where this work differs from the coordinator's brief, and why)

- **Ideal-gas heat capacity in the Aly-Lee form: its own equation, not linear.** Evidence:
  `test/equilibrium-reactor.test.js` compares gas equilibria with Cantera's NASA polynomials; ethylene's record ends at
  450 K, and at 550 K the linear continuation missed Cantera by 3e-4 in a mole fraction (the test's tolerance is 2e-4)
  where the equation itself agrees, as it did before. The Aly-Lee form follows the molecule's vibrational heat capacity
  and stays bounded. Polynomial ideal-gas records are continued linearly.
- **Vapour viscosity: linear**, as thermo does; the brief's ln mu in 1/T applies to the liquid.
- **A liquid property at or above the component's critical temperature is refused** (there is no liquid), and a
  vapour pressure is not continued by Clausius-Clapeyron above it. These are rule 4's "physically impossible states".
- **The ideal-gas enthalpy** used the equation itself beyond its range *silently* before 2026-11-13 (`extrapolate:
  true`); it is now continued as above and warned about. The strict mode keeps the old silent equation for it, so that
  strict results are those of before.

## Inventory of the range refusals (Phase 1)

From `git grep -n "OUT_OF_RANGE\|failRange\|extrapolate" -- src` on main at 7b920f8.

**Became "calculate and warn"** (the strict mode still refuses): 24.

| # | Where | Before | Now |
|---|---|---|---|
| 1 | `correlations.js` `evaluate` (every pure-component record: density, cp, ΔHvap, viscosity, conductivity, surface tension, ideal-gas cp) | refused | continued by kind, note |
| 2 | `pure.js` derived ideal-gas cp, outside its records | refused | continued, note |
| 3 | `pure.js` `tsat` outside the record's pressures | refused | searched between 10 K and Tc (or 3 x the record's end) on the continued curve, note |
| 4 | `pure.js` ideal-gas enthalpy beyond the cp record | equation, silent | continued, note |
| 5 | `pure.js` water: IAPWS property outside its range | refused | IAPWS continued, note (not above Tc for saturation) |
| 6 | `pure.js` water: IF97 ideal-gas enthalpy outside 273.15-1073.15 K | refused | continued, note |
| 7 | `enthalpy.js` liquid cp more than 10 K below its record | refused | linear, note |
| 8 | `enthalpy.js` nonvolatile liquid above its cp record | refused | linear, note |
| 9 | `system.js` mixture vapour pressure outside its record | equation, warned (#236) | equation if finite and rising, else Clausius-Clapeyron, warned |
| 10 | `henry.js` outside the equation's range | refused | van 't Hoff, note |
| 11 | `solubility-curve.js` outside the measured temperatures | refused | equation, note |
| 12 | `inert-solids.js` solid cp outside its record | refused | linear, note |
| 13 | `inert-solids.js` P-H search bounded by the solid cp records | refused at their ends | bounded at 30-2000 K |
| 14-16 | `iapws/if97.js` saturation pressure below 273.15 K, saturation temperature below 611 Pa, region check below 273.15 K / above 2273.15 K | refused | continued, note |
| 17-18 | `iapws/if97.js` above 100 MPa (below 1073.15 K) and 50 MPa (region 5) | refused | continued, note |
| 19 | `iapws/transport.js` outside 273.16-1173.15 K | refused | continued, note |
| 20 | `iapws/steam.js` transport outside its range | null, note | value, note |
| 21 | `sizing.js` `kDrum` outside the chart | refused | end value, note |
| 22-23 | `hydraulics.js` `kFlood`: flow parameter, tray spacing outside the chart | refused | end value, note |
| 24 | `heat-exchange.js` wall conductivity outside Table A.1 | refused | end value, note |

**Stay errors** (physical, infeasible, or a solver that fails): 38 throws (plus the places that catch them in `dew.js`, `solid-flash.js`, `solve.js`), unchanged in meaning; 6 kinds of refusal added.

| Where | Why it stays |
|---|---|
| `correlations.js` non-finite value inside the range | the record itself fails |
| *new:* `correlations.js` a continuation that is not finite or not positive; DIPPR105/106 at or above its critical temperature; vapour pressure above Tc without a finite equation | physically impossible |
| *new:* `pure.js` a liquid property at or above the critical temperature; `henry.js` at or above water's critical temperature; `solubility-curve.js` x >= 1 | physically impossible |
| `pure.js` `saturation` above Tc; water saturation above Tc; `if97.js` saturation above Tc or Pc; `cubic.js` no saturation above Tc; `enthalpy.js`, `system.js` (lnKValues) and `gamma-phi-vapour.js` (3) a component above its critical temperature or with no vapour root | no saturated vapour exists |
| `system.js` vapour pressure with no finite value (hydrogen in Raoult's law) | method cannot describe the gas (METHOD_SELECTION.md) |
| `phi-phi.js` (3): at or above the critical pressure, below 0.45 Tc on the EOS saturation curve, near the critical point | no boiling point, or the EOS algorithm's own limit (not a record) |
| `sle.js` (2): above the melting point, does not crystallize | no solid |
| `crystallizer.js` (3), `evaporator.js` (2), `membrane.js` (2), `extraction.js` (1), `columns/specifications.js` (3) | infeasible specifications, with what would make them feasible |
| `flash.js` (9), `inert-solids.js` (1), `dew.js`, `solid-flash.js`, `solve.js` | bounded searches: they now meet only physical bounds (T_FLOOR, T_CEIL, non-physical continuations) in the lenient mode; in the strict mode the record ends as before (`hOutOfRange`) |
| `util/inputs.js` T <= 0, P <= 0 (`BAD_INPUT`) | impossible input |

Pair parameter sets (NRTL, UNIQUAC, Wilson, k_ij) were already used outside their data range with a warning beyond a
10 K margin (`library.js`, `pairWarnings`); unchanged (question 3).

## Tests changed (the maintainer's decision changing behaviour, not results made to pass)

Every test below asserted a refusal outside a record's range. Each now asserts the calculation with its warning
(where the value can be checked, against an independent calculation) **and** the old refusal under the strict mode. No
validation data were changed.

| Test file | Change |
|---|---|
| `acetic-acid-supercooled.test.js` | 288.15 K: the new wording; 275 K: calculated (14.69 K below), strict refuses with the 10 K limit; 279 K with a given vapour pressure: strict refuses naming the sources searched |
| `benchmark-columns.test.js` | case G3: the case's refusal asserted in the strict mode; lenient: a finite enthalpy |
| `columns-vll.test.js` | W7's G3 run with `options.strictRanges`; a new test: without it the column takes the feed and `result.extrapolations` names benzene's liquid heat capacity in C1 |
| `charts.test.js` | the failing state point is now T = -5 K; 3000 K refused in the strict mode |
| `column-hydraulics.test.js` | Fair's chart outside: the edge value and a note; strict refuses; a 1.2 m tray spacing sized with a note |
| `sizing.test.js` | drum K chart outside: the end value and a note; strict refuses |
| `derived-ideal-gas.test.js`, `kinetic-reactors.test.js`, `measured-components.test.js`, `no-critical.test.js`, `user-data.test.js`, `inert-solids.test.js`, `reactions.test.js` | the out-of-range line: a finite value, strict refuses |
| `dew-errors.test.js` | `steam(5000, 100)`: `OUT_OF_RANGE` in the strict mode |
| `enthalpy.test.js` | the cp_L warning's wording; ethanol at 500 K: calculated, strict refuses; at 520 K refused in both (above the record's Tc); adipic acid at 350 K: calculated, strict refuses |
| `heat-exchange.test.js` | wall conductivity below Table A.1: the 20 °C value and a note; strict refuses |
| `henry.test.js` | outside an equation: the van 't Hoff continuation against the slope computed in the test; strict refuses; 650 K refused |
| `henry-components.test.js` | CO2 at 270 K: finite with the warning; strict refuses |
| `nonvolatile.test.js` | cooling a nonvolatile liquid: strict keeps the 10 K refusal; lenient reaches 280 K with the warning, and -1e5 J/mol is refused at the search's physical floor |
| `properties.test.js` | styrene at 25 °C and the components with record gaps (`EXTRAPOLATED_AT_TYPICAL_STATE`): values with notes; derived ideal-gas cp: a value with a note |
| `pure.test.js` | `evaluate` outside its range: linear with a note, strict refuses; oxygen's liquid viscosity at 300 K: refused (no liquid above Tc) |
| `solids.test.js` | solubility curves outside: the equation (computed in the test) with a note; strict refuses |
| `steam.test.js` | IF97 and transport outside their ranges: values with notes, strict refuses; a supercooled liquid continuous with the stable one |
| *new* `extrapolation.test.js` | each continuation form against the record's equation written out in the test and its analytic slope; non-physical continuation refused; the strict mode; notes once per property at the farthest point; a flowsheet's `extrapolations` and `solver.strictRanges`; `CHEPTA.run` `options.strictRanges` |

Full suite: 1672 pass, 0 fail, 1 known TODO (before: 1662 pass).

## Decided (the maintainer, 2026-11-13, through the coordinator)

The maintainer agreed to all three recommendations:

1. **Column case G3** (`validation/data/columns/G3-own-method-cannot-represent.json`) stays unchanged and runs as the
   strict-mode case, as the tests now do. A lenient twin case, which checks the warning, comes in a later data PR
   (open item in DECISIONS.md).
2. **The four refinements are accepted:** the Aly-Lee ideal-gas heat capacity is continued by its own equation; the
   vapour viscosity linearly; a liquid property at or above the critical temperature is refused; a vapour pressure is
   not continued by Clausius-Clapeyron above the critical temperature, so a supercritical component needs Henry's law
   or an equation of state.
3. **Pair parameter sets** (NRTL, UNIQUAC, Wilson, k_ij) are to be gathered into `result.extrapolations` in the same
   once-per-pair form, in a small follow-up PR (open item in DECISIONS.md).

## What to check

No new numbers from sources: the continuations are computed from the existing records. Please check on one case of
your own (for example acetic acid at 275 K, or a heater cooling benzene + toluene to 260 K) that the Warnings tab lists
each extrapolation once, with the blocks, and that `solver: { strictRanges: true }` refuses it.
