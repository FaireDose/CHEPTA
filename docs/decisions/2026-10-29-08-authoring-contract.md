# 2026-10-29-08: Proposal 0015, W8 the authoring contract, and W9 steadier speed tests

Asked by the maintainer on 2026-10-29 (the next step of W8 named in docs/DECISIONS.md, and the timing failure of
`test/three-phase.test.js` on GitHub's runner, 61.7 ms against 60 ms). One pull request, two separate commits.

## W8: a key CHEPTA does not read is refused

An assistant wrote `thermo: { method: "PR" }`; CHEPTA ignored `method` and solved with NRTL, without a word. Now:

- **`thermo`** takes `model`, `vapour`, `sets` and `prefer` (`src/flowsheet/document.js`). Any other key is BAD_INPUT
  naming it and the known keys; for `method` the message adds that the method is `model`. On the request path:
  outcome `invalid_input`, `where: [{ field: "flowsheet.thermo.method" }]`.
- **A block's `spec`**: each block type now lists its keys (`specKeys` in `registerUnit`), checked in one place
  (`runUnit` and `specStatus`, src/units/units.js) before the block's own check. On the request path: `invalid_input`,
  `where: [{ block, message }]`; in the workbench the block shows the message. The lists, read from each block's
  check:

  | Block | Keys |
  |---|---|
  | feed | flow_kmol_h, flow_kg_h, T_K, P_kPa, VF |
  | mixer | P_kPa |
  | splitter | fractions |
  | separator | fractions, outlets |
  | flash | T_K, P_kPa, VF, duty_kW |
  | heater | T_K, duty_kW, VF, A_m2, P_kPa, dP_kPa, sizing, design |
  | product | none |
  | hx | T_hot_out_K, T_cold_out_K, VF_hot_out, VF_cold_out, duty_kW, dTmin_K, A_m2, dP_hot_kPa, dP_cold_kPa, U, arrangement, shells, zones, design |
  | valve | P_kPa, dP_kPa |
  | pump | P_kPa, dP_kPa, efficiency |
  | compressor, expander | P_kPa, dP_kPa, ratio, efficiency |
  | conversion reactor | reactions, order, T_K, duty_kW, VF, P_kPa, dP_kPa |
  | yield reactor | key, conversion, basis, yields, closure, heatOfReaction, T_K, duty_kW, VF, P_kPa, dP_kPa |
  | equilibrium reactor | reactions, phases, mode, T_K, duty_kW, VF, P_kPa, dP_kPa |
  | Gibbs reactor | species, phase, phases, mode, T_K, duty_kW, VF, P_kPa, dP_kPa |
  | CSTR | reactions, phases, T_K, duty_kW, VF, P_kPa, dP_kPa, V_m3, W_kg, liquidFraction |
  | plug-flow reactor | reactions, phases, L_m, D_m, tubes, bed_kg_m3, T_K, duty_kW, coolant, pressureDrop, P_kPa, dP_kPa |
  | column | its own list, unchanged (it already refused unknown keys; that check moved to the shared one) |

  Choices made with care, for you to confirm:
  - **`design`** (heater, hx) is not read by the calculation: the workbench keeps there the specification a rated
    exchanger came from, to go back to. It is part of saved projects, so it stays allowed.
  - Keys a block refuses with a reason of its own stay in its list, so that the reason is shown and not "unknown
    key": `VF` of the equilibrium and Gibbs reactors and of the CSTR, `mode` of the equilibrium reactor
    (`"gibbs"` points to the Gibbs reactor), `dP_kPa` of the plug-flow reactor (refused with `P_kPa`).
  - Not allowed any more, because nothing read them: `species` and `phase` on the equilibrium reactor (they belong to
    the Gibbs reactor), `reactions` on the Gibbs reactor, a heater's or reactor's key that is not in the list.
  - **Older files**: no example project, test fixture or JSON file of the repository has a key outside these lists
    (all checked with a script over every JSON file; the full test suite, the workbench tests included, passes), so
    no older file stops opening. A file written by hand with an invented key now gets the message instead of being
    solved without that key; that is the purpose.
- **The missing-pair message** (`src/thermo/system.js`) now says: add the pair's parameters as your own data, with
  their source (My data; in a project or a request `user_data.pairs["a+b"] = { NRTL: { b_ij, b_ji, alpha }, source }`),
  or choose another method (Modified UNIFAC 2.0); and only then that a program calling `system()` may pass
  `allowMissingPairs: true` to treat the pair as ideal. The error carries `details.missing_pairs`. The request path
  never treats a pair as ideal.
- ai/instructions/use-chepta.md, the skill and docs/models/tools.md describe these errors; ARCHITECTURE.md shows
  `specKeys` in the shape of a block.
- Tests: `test/authoring-contract.test.js` (thermo through the library and the request path; every registered block
  type refuses an unknown key through `runUnit` and `specStatus`; known keys and the example projects still work; the
  request path's `where` names the block; the missing-pair message and its remedy, the user's pair, then solving).

## W9: the speed tests compare the fastest of five timings

One timing of a few milliseconds measures the machine as much as the calculation (a garbage collection, another job
on a shared runner). The changed tests now run each calculation after a warm-up, time it five times and compare the
**fastest** with the **same budget** (`test/helpers/timing.js`). A calculation that is slow every time still fails;
no budget changed (AGENTS.md rule 6 concerns results; no result or budget is touched).

| Test | Before | Now |
|---|---|---|
| `test/three-phase.test.js` "speed: two liquids under 5 ms ...; ternary vapour + two liquids under 60 ms" | median of 7 calculations, each timed once | median of 7 calculations, each the fastest of 5 timings |
| `test/flash.test.js` "speed: a two-phase T-P flash of a ternary under 5 ms" | mean of 20 flashes, timed once | the same mean, the fastest of 5 runs |
| `test/flash.test.js` "speed: a two-phase T-P flash with an SRK vapour under 5 ms" | mean of 10 flashes, timed once | the same mean, the fastest of 5 runs |
| `test/flash.test.js` "speed: P-H flashes of up to 4 components under 20 ms" | median of 5 flashes, each timed once | median of 5 flashes, each the fastest of 5 timings |

`test/worker.test.js` measures that an endless loop is stopped within 5 s; that is a time limit of the worker, not a
speed budget, and is unchanged. The cost: the three-phase speed test takes about 10 s instead of 3 s in this session.

## How it was checked

`npm run build` and `npm test`: all tests pass (one run at a time). The two example projects solve through the
command line.
