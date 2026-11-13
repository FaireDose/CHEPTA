# 2026-11-13-07: a pure component below its triple point

The maintainer (2026-11-13) agreed to this change after pull request #241 ("strict data, lenient use", decision
[2026-11-13-03](2026-11-13-03-extrapolation-policy.md)). Carbon dioxide got a "normal boiling point" of -88 C, from its
liquid vapour-pressure curve continued below its triple point (216.58 K); in reality it has no liquid at 101.325 kPa and
sublimes at about -78.5 C. The engineering report then showed its liquid cp 13.5 % off (a red "large" mark) and its
liquid viscosity 9.7 % off, both at that point.

## What changed

| What | Where |
|---|---|
| `pure().props(T, P)`: when the phase is liquid and T is below the triple point (the melting temperature where none is recorded), the notes start with "*Name*: the state at T K is below its triple point (216.58 K): the stable phase there is the solid, and the liquid value is a supercooled extrapolation, not data."; the result carries `belowTriplePoint: { T_K, label }` | `src/thermo/pure.js` |
| `pure().saturation(T)`: the same sentence in `warning`, with `belowTriplePoint` | `src/thermo/pure.js` |
| New `pure().normalBoilingPoint(P = 101.325)`: `{ T_K, sublimes, Tsub_K, message }`; where the liquid curve reaches P only below the triple point, `T_K` is `null`, `sublimes` true, and `message` says "none, the component sublimes at 101.325 kPa". `Tsub_K` is `null`: no open sublimation record is stored, and none is estimated. `tsat()` is unchanged (the engine's flashes use it) | `src/thermo/pure.js` |
| **Mixtures: nothing changes.** The pure-component code only; a component below its melting point in a liquid mixture uses the supercooled liquid as its reference state (METHOD_SELECTION.md rule 8; decision 2026-11-12-05, acetic acid), and no warning is added beyond #241's | tested |
| Engineering report: a normal boiling point that is "none" is a new status shown as "none (sublimes)", not a failure and not "lost"; a `pure().props()` value with an extrapolation note or below the triple point that is out of tolerance is "report only" (small, marked "extrapolated outside the record's range"). No reference value, case or tolerance changed | `scripts/engineering-report.mjs`, `validation/report/README.md` |
| Rules text | DATA_RULES.md section 3 ("Ranges"), METHOD_SELECTION.md rule 8 |

Measured on the real cases (`validation/report/cases.json` against the unchanged references): before, CO2's normal
boiling point was "ok" at -88.05 C and its liquid cp "large"; now the boiling point is "none (sublimes)", cp and
viscosity are "report only" (small), nothing is large, and CO2 is the only component with "none".

## Tests

New: `test/below-triple-point.test.js` (9 tests: the CO2 boiling point and its message; water, ethanol and benzene keep
theirs; the props wording, above the triple point and for a vapour no warning; the saturation warning; a mixture of
acetic acid + water at 285 K without the new wording; the report classification of "none", of a continued value, and
`runCases` on CO2). **No existing test was changed**: all 1695 tests pass (1693 pass, 0 fail, 1 known TODO, 1 test
file added).

## Questions for the maintainer (answered 2026-11-13: "agree with all", as recommended)

1. **The sublimation temperature.** CO2 sublimes at about 194.7 K at 101.325 kPa (the maintainer's figure), but no open
   record of it is stored in CHEPTA, so none is given and none is estimated. *Recommendation:* leave it "none" until a
   measured sublimation-pressure record from an open source is added under DATA_RULES (a data proposal for
   solid-vapour data).
2. **A vapour below the triple point** (CO2 gas at 200 K and 50 kPa) is not warned about: at low pressure the vapour is
   the stable phase, and the sublimation line would be needed to know where the solid takes over. *Recommendation:*
   keep it so for now, and warn only for liquid values, as here.
3. **Other components in the same state.** Only CO2 has no normal boiling point because of this; a component that is a
   solid at 25 C (phenol, glucose) now carries the "stable phase is the solid" note in `pure().props` at 25 C when its
   liquid properties are shown, which is true. *Recommendation:* accept; a user who wants the solid's properties uses
   the solid records.

## Decided (the maintainer, 2026-11-13, through the coordinator)

The maintainer agreed to all three recommendations:

1. Carbon dioxide's sublimation temperature stays "none" until an open measured sublimation-pressure record is added.
2. No warning for a vapour below the triple point; only liquid values are warned about.
3. The "stable phase is the solid" note for solids at 25 C (phenol, glucose) is accepted.
