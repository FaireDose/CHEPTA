# Streams, blocks and the flowsheet (layers 3 to 5)

How CHEPTA builds and solves a process. Each layer uses only the one below it
([ARCHITECTURE.md](../../ARCHITECTURE.md)):

- a stream is a flash result ([equilibrium.md](equilibrium.md));
- a block turns inlet streams into outlet streams;
- the flowsheet solver orders the blocks and converges the recycles.

As elsewhere, the header comment of each file is the authoritative statement.

## Streams (layer 3)

[`src/stream/stream.js`](../../src/stream/stream.js) (proposal 0006, step 1):

```js
CHEPTA.stream(sys, { flow_kmol_h: { ethanol: 40, water: 60 }, T_K: 351, P_kPa: 101.325 })
CHEPTA.stream(sys, { flow_kmol_h, P_kPa, H_kW })   // given enthalpy flow (P-H flash)
CHEPTA.stream(sys, { flow_kmol_h, P_kPa, VF })     // given vapour fraction
```

- **Always from a flash:** every stream is the result of `sys.flash`, so its phases and enthalpy
  are consistent with the model.
- **Enthalpy reference:** each component as an ideal gas at 298.15 K.
- **Empty streams:** a stream with zero flow carries only T and P.
- **Units:** K, kPa, kmol/h, kg/h, kW.

## Blocks (layer 4)

[`src/units/units.js`](../../src/units/units.js) (proposal 0006, step 2). Every block is registered
with the same shape, `registerUnit({ type, inlets, outlets, checkSpec, solve })`, and runs through
`runUnit`. `runUnit` checks:

- the ports;
- the specification;
- the component balance, which throws if it does not close;
- the energy balance, which is reported.

| Block | What it does |
|---|---|
| `feed` | A stream given by the user |
| `mixer` | Adds streams; the outlet is flashed at the lowest inlet pressure (or a given one) |
| `splitter` | The same composition in every outlet, split by fractions, or by flow: `flow_kmol_h` or `flow_kg_h`, one total flow per outlet and exactly one `"rest"` (e.g. `[12, "rest"]`); negative flows and flows above the inlet are refused (BAD_INPUT). In a recycle, an inlet short of the asked flow is allowed while the loop iterates (the asked outlets share the inlet, the rest outlet is empty) and refused if the converged loop is still short |
| `separator` | Component splitter: a split fraction per component and outlet |
| `flash` | Flash drum: vapour and liquid outlets at the given conditions or duty; an inert solid leaves with the liquid (a slurry) |
| `heater` | Heater or cooler: outlet T, VF or duty; with an optional `sizing` (a utility and U), also the area and the utility's flow |
| `hx` | Heat exchanger between two process streams (ports `hot` and `cold`): one outlet T or VF, the duty, or the minimum approach; with U, the area (proposal 0013) |
| `valve` | Adiabatic pressure drop: the outlet pressure or the drop |
| `pump` | A liquid to a higher pressure: power = V ΔP / efficiency (0.75 if not given), V from the liquid densities of the liquid phase (a solid rides along, with the warning SLURRY) |
| `compressor`, `expander` | A gas to a higher or lower pressure (P_kPa, dP_kPa or the ratio): the isentropic outlet (P-S flash), then the isentropic efficiency (0.75 and 0.80 if not given); power out of an expander is negative |
| `product` | End of a stream |

Every block with a duty has an energy stream (kW, positive = heat in); the power of a pump, compressor or expander is a
work stream (`W-` and its id). **Energy streams** (proposal 0013, `energyStreams` of the document, format 4): an energy feed gives a heater or a
flash drum its duty, so it needs one specification fewer (a heater calculates its outlet temperature); a heater, drum or
separator can send its heat into a heater or drum. They are edges of the graph: they set the order, and a loop closed by
one is torn on its duty. In the editor, **Energy feed** in the palette places one on the drawing; dragged onto a
heater/cooler or a flash drum it connects (until then `to` is missing and the flowsheet is not ready). A block's own
energy stream can be taken out of the drawing (`"energy": false`): its duty is still calculated, listed and counted in
the energy balance. **Undo** and **Redo** (Edit group; Ctrl + Z, Ctrl + Y) take back and redo every change of the
flowsheet made in its workspace, 100 at most; the history lasts as long as the page.

**Heat-exchanger sizing** ([`src/units/heat-exchange.js`](../../src/units/heat-exchange.js), the reference in
[heat-exchangers.md](heat-exchangers.md)): zones along each side's temperature-heat curve, the arrangement's correction
F from effectiveness-NTU, U from a service, from film coefficients and a wall, or the user's.

**Degrees of freedom:** `specStatus` and `flowsheetStatus` count what each block needs, what is
given, and what is missing or extra. A flowsheet is solved only when every block is complete.

**Shown as "coming later" in the workbench:** compressor (after the mixture entropy, proposal 0013 step 6), reactors,
distillation and extraction. Reactors are designed in proposal 0010 (Draft).

## Flowsheet document (layer 5)

[`src/flowsheet/document.js`](../../src/flowsheet/document.js) (proposal 0006, step 4) holds the
components, the method (`thermo`), the blocks with positions, the streams and the solver settings.

- **Where it is kept:** project files of format 2 (format 4 with energy streams or the blocks of proposal 0013), with
  the schema in [../schema/project-5.json](../schema/project-5.json) ([project-2.json](../schema/project-2.json) for
  format 2).
- **Writing and solving it:** an AI assistant can write the document, check it with
  `CHEPTA.checkProject` and solve it with `CHEPTA.runFlowsheet`.
- **Mixing rule of an equation of state:** `thermo.mixing: "MHV1"` with `model` `"PR"` or `"SRK"` is "PR + gE (MHV1)" or
  "SRK + gE (MHV1)" (proposal 0018; `system({ model, mixing: "MHV1" })`); left out, the classical rule with k_ij. Each
  pair's NRTL parameters come from a set fitted inside the rule, else the databank's NRTL set, else g^E = 0 with a
  warning; a light gas with a polar liquid without a set is refused with the engine's reason. A project that uses it is
  written as format 7 ([schema/project-7.json](../schema/project-7.json)), and the Method page names the rule and lists
  each pair's source, or the refusal. The heat exchanger's own stream methods and the Charts workspace's equation list
  do not offer it yet.
- **Parameter sets:** `thermo.sets` and `thermo.prefer` choose a pair's set as in `system()`. In the workbench the
  flowsheet uses the Library's choice, as the diagrams and the flash do: the rule for every pair (each pair's default,
  fitted to data first, databank only) and a pair's own set chosen in a diagram's Inputs panel, where that set exists
  for the flowsheet's model (`calculatedFlowsheet` in [`src/ui/app-logic.js`](../../src/ui/app-logic.js)). Sets the
  document names itself win. Changing the choice calculates the flowsheet again; its results name the choice.

## Flowsheet solver (layer 5)

[`src/flowsheet/flowsheet.js`](../../src/flowsheet/flowsheet.js) (proposal 0006, step 3). It is
sequential modular:

1. **Order:** the loops are the strongly connected components (Tarjan 1972). They are calculated in
   topological order.
2. **Tear streams:** the streams marked `tear: true`. Otherwise, the smallest set of streams whose
   removal breaks every cycle (as in pyomo.network, after FOQUS).
3. **Convergence of the tear streams' component flows**, `solver: { method, tolerance, maxIterations }`:
   - `broyden` (default): Broyden's quasi-Newton method on all tear flows together (as
     scipy.optimize.broyden1);
   - `wegstein`: Wegstein per flow with q bounded to [−5, 0] (as pyomo.network);
   - `direct`: direct substitution.
4. **Fail loudly.** A loop that does not converge throws NO_CONVERGENCE, naming the loop, its tear
   streams and what usually helps. So does:
   - a recycle that grows without bound;
   - a converged flowsheet whose overall component balance does not close.

## Design specifications (proposal 0022)

[`src/flowsheet/design-specs.js`](../../src/flowsheet/design-specs.js). A design specification varies one number of a
block's specification, within bounds, until one quantity of a stream or block reaches a value: the make-up that keeps a
recycle at 100 kmol/h, the ethanol feed that holds a product's purity, the heater duty that brings a stream to its bubble
point. It is a list in the flowsheet document, `designSpecs`, not a block:

```json
"designSpecs": [{ "id": "DS1",
  "vary":   { "block": "F2", "key": "flow_kmol_h", "component": "water", "min": 0, "max": 500, "guess": 20 },
  "target": { "stream": "S7", "quantity": "flow_kmol_h", "value": 100 },
  "tolerance": 1e-6 }]
```

| | |
|---|---|
| Varied (`vary.key`) | feed: `flow_kmol_h`, `flow_kg_h` (with `component`: that component's flow; without: the total flow, the composition kept), `T_K`, `P_kPa`; splitter: `fractions`, `flow_kmol_h`, `flow_kg_h`, one outlet (`index`, from 0; not the "rest"); heater: `T_K`, `duty_kW`; flash drum: `T_K`, `P_kPa`, `duty_kW` |
| Bounds | `min` and `max` are required; `guess` is the start (default: the value in the spec; a key left out of the spec is then given by the guess) |
| Target (`target.quantity`) | a stream's `flow_kmol_h`, `flow_kg_h`, `component_flow_kmol_h`, `component_flow_kg_h`, `mole_fraction`, `mass_fraction`, `T_K`, `VF`; a block's `duty_kW`; `ratio_of` (another quantity of the same form) makes the value a ratio |
| Tolerance | relative to the value (absolute for a mole or mass fraction and VF, and for a value of 0); by default 1e-6, or 100 times `solver.tolerance` where that is looser; a tolerance you give is used as given, with a warning in the result when it is tighter than 100 times `solver.tolerance` (the maintainer, 2026-11-14) |
| Limits | `solver.designSpecIterations`: a number (Brent's or Broyden's solves) or `{ bracket: 8, solve: 50 }` |

How it is solved: an **outer loop of whole solves** around the sequential solver, each with its recycles converged and its
tear streams started from the previous solve's answer. One specification: the guess and a step of 1 % of the range,
then doubling steps towards the side where the residual falls (at most 8 solves), then the bounds; inside the bracket,
Brent's method (Brent 1973, chapter 4; as scipy.optimize.brentq), which never leaves it. Several: Broyden's method on
the residuals, the variables scaled to their bounds and kept inside them, started with a finite-difference Jacobian.

The answer lists `designSpecs` (each with the varied value, the target asked and reached, its residual and tolerance,
the method and the solves) and writes the varied value into `blocks[id].spec`, so a plain forward solve reproduces it.
The request format adds `checks.design_specs`. `flowsheet_status` counts each specification as one input freed and one
target given (the degrees of freedom are unchanged) and lists them; it warns when a guess differs from the value given.

Failures (every one throws; no partial answer):

| Case | Code | The message says |
|---|---|---|
| no sign change between the bounds | NO_CONVERGENCE, `reason: "unreachable"` | the target at both bounds and at the start, e.g. "DS1: the total flow of S6 is 262.404 kmol/h at the flow of Water in F2 = 0 kmol/h, ... and 1890.06 kmol/h at 500 kmol/h; 100 kmol/h is not reachable ..." |
| an inner solve fails (a recycle, a block refusing) | the inner error's code | the specification, the varied value where it happened, the solve |
| Brent's or Broyden's limit | NO_CONVERGENCE, `reason: "limit"` | the bracket and the residual reached |
| the target has no value (a fraction of a stream with no flow) | NO_CONVERGENCE, `reason: "undefined"` | where; narrow the bounds |
| the bracket closes on a jump | NO_CONVERGENCE, `reason: "discontinuous"` | where the target jumps |
| several: an input that moves no target, two that act alike, a target beyond the bounds | NO_CONVERGENCE, `no_effect`, `singular`, `unreachable` | which input, which bound |
| malformed: unknown key, bounds missing or reversed, a stream or block that is not there, a guess outside the bounds, an input varied twice or fixed by an energy stream | BAD_INPUT | the field, before anything is solved |

Checked in [`test/design-specs.test.js`](../../test/design-specs.test.js): the make-up of a separator loop against its
closed form and against `scipy.optimize.brentq` and `root` ([`validation/python/reference_design_spec.py`](../../validation/python/reference_design_spec.py));
two specifications together; a ratio; a heater duty that meets the bubble point against the heater given VF = 0; an
ethanol feed that holds an ethyl acetate product's purity inside an NRTL recycle (CHEPTA-Lab's request 15); every failure.

A worked example to open in the workbench (File > Project):
[`examples/design-spec-ethyl-acetate.chepta.json`](../../examples/design-spec-ethyl-acetate.chepta.json): ethyl acetate
and water with an ethanol make-up, a flash drum whose vapour is the product and whose liquid is recycled with a purge;
the design specification PURITY finds the ethanol make-up (about 1.46 kmol/h, from a start of 10) that holds the product
at 95 mass % ethyl acetate.

## How the solver is checked

- **Tests:** [test/stream.test.js](../../test/stream.test.js), [test/units.test.js](../../test/units.test.js) and
  [test/flowsheet.test.js](../../test/flowsheet.test.js) check the pieces.
- **The flowsheet test suite** ([../FLOWSHEET_TESTS.md](../FLOWSHEET_TESTS.md),
  [test/flowsheet-suite.test.js](../../test/flowsheet-suite.test.js)):
  - the Cavett problem against published solutions;
  - 16 generated recycle flowsheets against an independent equation-oriented solution (scipy and
    thermo);
  - relations every correct solver must satisfy: tear choice, method, order, scaling and balances.
  - Every case uses the method chosen by [../METHOD_SELECTION.md](../METHOD_SELECTION.md). The
    suite runs in CI on every pull request; regenerate the reference only when the suite itself
    changes.
- **Excel exports:** the "Excel concept model" export is checked in LibreOffice
  ([../EXCEL_CONCEPT_CHECK.md](../EXCEL_CONCEPT_CHECK.md)).
