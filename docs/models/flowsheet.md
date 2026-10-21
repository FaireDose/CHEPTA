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
| `splitter` | The same composition in every outlet, split by fractions |
| `separator` | Component splitter: a split fraction per component and outlet |
| `flash` | Flash drum: vapour and liquid outlets at the given conditions or duty; an inert solid leaves with the liquid (a slurry) |
| `heater` | Heater or cooler: outlet T, VF or duty; with an optional `sizing` (a utility and U), also the area and the utility's flow |
| `hx` | Heat exchanger between two process streams (ports `hot` and `cold`): one outlet T or VF, the duty, or the minimum approach; with U, the area (proposal 0013) |
| `valve` | Adiabatic pressure drop: the outlet pressure or the drop |
| `pump` | A liquid to a higher pressure: power = V ΔP / efficiency (0.75 if not given), V from the liquid densities |
| `product` | End of a stream |

Every block with a duty has an energy stream (kW, positive = heat in); a pump's power is a work stream (`W-` and its
id). **Energy streams** (proposal 0013, `energyStreams` of the document, format 4): an energy feed gives a heater or a
flash drum its duty, so it needs one specification fewer (a heater calculates its outlet temperature); a heater, drum or
separator can send its heat into a heater or drum. They are edges of the graph: they set the order, and a loop closed by
one is torn on its duty. In the editor, **Energy feed** in the palette places one on the drawing; dragged onto a
heater/cooler or a flash drum it connects (until then `to` is missing and the flowsheet is not ready). A block's own
energy stream can be taken out of the drawing (`"energy": false`): its duty is still calculated, listed and counted in
the energy balance.

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
  the schema in [../schema/project-4.json](../schema/project-4.json) ([project-2.json](../schema/project-2.json) for
  format 2).
- **Writing and solving it:** an AI assistant can write the document, check it with
  `CHEPTA.checkProject` and solve it with `CHEPTA.runFlowsheet`.
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
