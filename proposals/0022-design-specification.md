# 0022: Design specifications in the flowsheet: vary one input to meet a target

- **Status:** Accepted (the maintainer, 2026-11-13, with the five recommended answers to the open questions; docs/decisions/2026-11-13-02-splitter-flow.md). Steps 1-3 built on 2026-11-14 (src/flowsheet/design-specs.js;
  docs/decisions/2026-11-14-04-design-specs.md); step 4, the workbench form, to do. Sensitivity tables, asked with the same
  request of CHEPTA-Lab (15), are proposal 0023.
- **Author(s):** drafted by a coding agent for CHEPTA-Lab's request 7 (2026-11-13); to be reviewed by the maintainer
- **Discussion:** the pull request that adds this file
- **Roadmap item:** A8, flowsheet solver ("design specifications open"; [proposal 0015](0015-separation-units.md), Part II, A8:
  "design specifications as a block")

## Problem

A flowsheet in CHEPTA is solved forward: every block is given its inputs and the solver works out what comes out. An
engineer often knows what must come out instead, and needs the input that gives it:

- a **make-up** feed: the solvent or water lost with the products must be replaced, so the make-up flow is whatever keeps
  the recycle's total at, say, 100 kmol/h;
- a **purge**: the purge flow (a splitter) that keeps an inert below 5 % in the recycle;
- a **heater duty** that brings a stream to its bubble point, or a feed temperature that gives a drum outlet of 40 °C;
- a **feed ratio**: the steam flow that is 3 times the hydrocarbon flow.

Today the person tries values by hand and solves again. The rigorous column already meets its own design specifications
(proposal 0015, milestone M4: a purity, a recovery, a component flow or a stage temperature, found by varying the reflux,
the distillate or the boil-up), but only inside the column. CHEPTA-Lab, which builds process routes with CHEPTA, asked
for the flowsheet-wide version (request 7). The splitter given by flow (built in the same pull request as this proposal)
covers the simplest cases (a fixed purge flow, a fixed recycle flow) without a design specification; it cannot meet a
composition, a temperature or a flow elsewhere in the flowsheet.

## Proposal

### 1. A design specification is a part of the flowsheet document, not a block

```json
"designSpecs": [
  {
    "id": "DS1",
    "vary":   { "block": "F2", "key": "flow_kmol_h", "component": "water", "min": 0, "max": 500, "guess": 20 },
    "target": { "stream": "S7", "quantity": "component_flow_kmol_h", "component": "water", "value": 100 },
    "tolerance": 1e-6
  }
]
```

- `vary`: one number of one block's specification (the **manipulated** input): a block id, the spec key, and where the
  key holds a list or an object, the component or the position (`component`, `index`). `min` and `max` are required: a
  design specification without bounds is refused, since the bounds are what lets the solver bracket the answer and say
  when there is none. `guess` is optional (default: the value in the spec).
- `target`: one quantity of one stream or block (the **controlled** variable) and the value it must reach. The first
  set of quantities: a stream's `flow_kmol_h`, `flow_kg_h`, `component_flow_kmol_h`, `component_flow_kg_h`,
  `mole_fraction`, `mass_fraction`, `T_K`, `VF`; a block's `duty_kW` (heater, flash drum). A ratio of two of them
  (`ratio_of`: another target of the same form, the value being the ratio) covers feed ratios.
- `tolerance`: on the target, relative to the value asked (absolute for a fraction and VF). Default 1e-6, ten times
  looser than nothing and a hundred times tighter than the tear tolerance, so the outer loop never chases the noise of
  the recycle (open question 3).

Variables that may be varied in the first step: a feed's component flow or total flow (scaling its composition), a
feed's T_K or P_kPa, a splitter's fraction or flow (one entry of its list), a heater's T_K or duty_kW, a flash drum's
T_K, P_kPa or duty_kW. Others are added when they are needed, each with a test.

Why not a block (as DWSIM's Adjust or Aspen Plus's design-spec "block"): a design specification has no streams; drawing
it as a block with dotted lines, as DWSIM does, helps on a drawing but would put a block without material ports into the
graph the solver orders. In the document it is a list beside `energyStreams` and `reactions`; the workbench shows it as
a badge on the varied block and on the target stream (section 5).

### 2. Solved as an outer loop around the sequential solver

For one design specification, the residual is r(x) = target(x) − value, where target(x) is the controlled quantity after
`solveFlowsheet` with the manipulated input set to x (recycles converged inside, as today). The outer loop:

1. **Bracket.** Solve at the guess x0 and at x0 + h (h = 1 % of max − min, inside the bounds). If r changes sign
   between them, or between either and a bound, the root is bracketed; otherwise step towards the side that reduces |r|,
   doubling the step, up to the bounds (at most 8 solves). No sign change within the bounds: refused (section 3).
2. **Brent's method** inside the bracket (inverse quadratic interpolation and secant steps, with bisection when they
   leave the bracket; Brent, *Algorithms for Minimization without Derivatives*, 1973, ch. 4; the same algorithm as
   `scipy.optimize.brentq`, BSD, open source). It cannot leave the bracket, so it cannot step outside the bounds or into a
   region where a block refuses (a negative flow, a drum above its dew point). At most 50 solves (open question 2).
3. Each inner solve starts its tear streams from the previous solve's converged values (a warm start), so a recycle
   typically converges in a few iterations after the first.

Several design specifications: solved together by Broyden's method on the vector of residuals, started with a
finite-difference Jacobian (one solve per specification), each variable kept inside its bounds by projection; the same
method the recycle loops already use (src/flowsheet/flowsheet.js). With one specification it falls back to the bracketed
method above, which is safer.

**Inside the recycle loop instead?** The alternative is to add the manipulated variable to the tear vector and the
residual to the tear residuals, so that Broyden converges the recycle and the specification together (DWSIM's
"simultaneous adjust" solves the adjusts together, but outside the recycles; Aspen Plus offers both orders, and nests
the specifications outside the recycles by default, as we read its manuals, which are not open and are not cited). It is
faster for large flowsheets but loses the bracket: a failed recycle and an unreachable target become one undiagnosable
"did not converge". **Recommendation:** the outer loop first (step 2); the simultaneous form only if a flowsheet of the
suite needs it (open question 1).

### 3. Failure: loud and with what would help

Every failure throws, as the recycle loops do, with a code the request format already knows:

| Case | Code | The message says |
|---|---|---|
| No sign change between the bounds | `NO_CONVERGENCE` (`reason: "unreachable"`) | the target's value at both bounds and at the guess, e.g. "DS1: the water flow in S7 is 62 kmol/h at F2 water = 0 and 88 kmol/h at 500; 100 kmol/h is not reachable with F2 water between 0 and 500" |
| An inner solve fails (a recycle, a block refusing) | the inner error's code, with the design specification and the x where it happened | which x failed; the bracket so far |
| Brent stops at its limit | `NO_CONVERGENCE` | the bracket and the residual reached |
| The varied key does not exist, bounds missing or reversed, the target names no stream | `BAD_INPUT` | the field, before anything is solved |
| The varied input is also fixed by an energy stream, or two specifications vary the same input | `BAD_INPUT` | the conflict |

No partial answer is returned: a design specification that is not met gives no streams, as a loop that does not
converge gives none today. The result of a met specification is listed: `designSpecs: [{ id, varied: { block, key,
value }, target: { asked, reached, residual }, solves, bracket }]`, and the varied value is written into the answer's
block specification (so the solution is reproducible as a plain forward solve).

### 4. In the request format, the command line and the MCP server

`solve_flowsheet` takes the document as it is; `designSpecs` is one more key of the flowsheet document
(src/flowsheet/document.js, refused today as unknown, which is what an older version must do). `checks.design_specs`
gives the residuals and tolerances, as `checks.columns` does for the column's own specifications. `flowsheet_status`
counts a design specification as one specification freed (the varied input) and one given (the target), so the degrees
of freedom are unchanged; it warns when the varied value is also given and differs from the guess (the given value is
then only the start). Project files: format 10 (or the next free one), written only when there is a design
specification.

### 5. In the workbench

- On a block's form, next to a number that can be varied, a small "Vary to meet…" link opens a short form: the target
  stream (picked on the drawing), the quantity, the value, the bounds (prefilled at 0 and 10 times the current value for a
  flow, ±50 K for a temperature, the person asked to confirm them).
- The varied field then shows "found by DS1" and the value reached (greyed, not editable, with a link to the
  specification); the target stream carries a small "DS1" tag on the drawing.
- The Results tab lists each specification: asked, reached, the varied value, the number of solves.
- Following docs/UI_GUIDE.md: no new top-level control; the form is part of the block's Inputs.

## Engineering basis

- Brent's method: R. P. Brent, *Algorithms for Minimization without Derivatives*, Prentice-Hall 1973, chapter 4 (the
  zero-finding algorithm); open implementations: `scipy.optimize.brentq` (BSD; the reference implementation for the
  tests).
- Broyden's method for several specifications: as in src/flowsheet/flowsheet.js (Broyden, Math. Comp. 19 (1965) 577;
  scipy.optimize.broyden1, BSD).
- What open simulators do, read on 2026-11-13 in DWSIM's open source (GPL-3; read for the design, no code taken) and its
  API documentation:
  - **Adjust** (`DWSIM.UnitOperations/LogicalBlocks/Adjust.vb`; API help, "Adjust Class", version 10.0.0.0,
    https://dwsim.org/api_help/html/T_DWSIM_UnitOperations_SpecialOps_Adjust.htm): a logical block with a manipulated
    variable (object and property), a controlled variable, a target value (`AdjustValue`), optionally relative to a
    reference object's variable (`Referenced`), optional bounds `MinVal` / `MaxVal` and `InitialEstimate`, a `StepSize`
    for the first perturbation, a `Tolerance` on the controlled variable and `MaximumIterations`; defaults in the source:
    step 0.1, tolerance 1e-4, 10 iterations. The API help gives its methods as "bisection or secant" (`SolvingMethodSelf`
    0 = bisection, 1 = secant). We did not find the routine that runs one Adjust in the files we read, so how its secant
    handles the bounds is not stated here.
  - **Simultaneous adjust** (`DWSIM.FlowsheetSolver/FlowsheetSolver.vb`, `SolveSimultaneousAdjusts`): the adjusts marked
    "simultaneous" are solved together by Newton's method with a finite-difference gradient, the step damped by
    min(1, 0.2 (k + 1)) at iteration k and cut by 10 when a step is larger than the variable itself; converged when
    every |residual| is below its adjust's tolerance; at most 25 iterations, then an error.
  - **Spec** (`DWSIM.UnitOperations/LogicalBlocks/Spec.vb`): not a solver: it evaluates an expression Y = f(X) of a
    source variable and writes it into a target variable, clamped to `MinVal` / `MaxVal` (a feed-forward ratio, such as
    "the steam is 3 times the hydrocarbon flow"). CHEPTA's `ratio_of` target covers the same need through the solver;
    a feed-forward "set" (open question 4) would be the direct equivalent.
- What we take from them: bounds and a starting value on the varied input, a tolerance on the target, a limit on the
  solves, and solving several together. What we do differently: the bounds are required (a bracket is what makes the
  failure diagnosable), Brent rather than plain secant (it never leaves the bracket), and the failure lists the target at
  the bounds.
- Validation: (1) a flowsheet with an exact answer: the separator loop of test/flowsheet.test.js with a make-up feed
  varied to hold the recycle at a given flow, whose balance is linear and solvable by hand; (2) the same flowsheet
  solved with `scipy.optimize.brentq` around an independent Python model of the loop (validation/python/, extended),
  to 1e-8; (3) a heater duty that meets a bubble point, against the flash's own bubble temperature; (4) every failure
  case of section 3, which must throw with its code; (5) the flowsheet suite (docs/FLOWSHEET_TESTS.md) unchanged.

## Effect on existing work

- Flowsheets without `designSpecs` solve exactly as today (no outer loop).
- The column's own specifications (M4) stay where they are: they are faster inside the column's Newton solver. A
  flowsheet design specification may target a column product too; it then varies an input outside the column.
- Project format raised once, written only with a design specification; older versions refuse it, naming the format.
- An outer loop multiplies the solve time by the number of solves (typically 5 to 15 for one specification). The
  execution envelope's time limit (src/runtime/) applies to the whole, and the message on a timeout says how many solves
  were done.

## Alternatives considered

- **Inside the tear loop** (section 2): faster, but loses the bracket and the diagnosis; kept as a later option.
- **Equation-oriented solution of the whole flowsheet** (proposal 0006 mentioned it): handles specifications naturally,
  but needs derivatives of every block, a rewrite of the solver; not for now.
- **A design-specification block on the drawing** (DWSIM, Aspen Plus): a block without material ports in a graph of
  material blocks; a list in the document with badges on the drawing gives the same information.
- **Secant without bounds** (the simplest): it can step outside where a block works (a negative make-up flow) and
  gives no useful message when the target is unreachable.

## Steps

1. Engine: `designSpecs` in the document (checked, refused when malformed), one specification by bracket + Brent around
   `solveFlowsheet`, warm-started tears, the failures of section 3, the result listing. Tests (1), (2), (4), (5).
2. Several specifications together (Broyden with bounds), with a test of two specifications on one recycle.
3. Request format (`checks.design_specs`), flowsheet_status, project format, the assistant instructions
   (ai/skills/chepta/SKILL.md).
4. Workbench: the "Vary to meet…" form, the badges, the results.

## Open questions (answered 2026-11-13: every recommendation accepted)

1. **Outer loop or inside the recycle loop?** Recommended: the outer loop (bracketed, diagnosable); revisit if a
   flowsheet of the suite is too slow.
2. **Limits:** recommended 8 bracketing solves and 50 Brent solves per specification, both settable in `solver`
   (`designSpecIterations`).
3. **Tolerances:** recommended the specification's tolerance at least 100 times the recycle tolerance (refused
   otherwise, with the reason), since a target cannot be met more tightly than the recycle is converged.
4. **A feed-forward "set"** (DWSIM's Spec: an input computed from another quantity by a formula, no solving):
   recommended not now; a `ratio_of` target covers the feed-ratio case through the solver, and a formula language is a
   separate decision (security and checking).
5. **Bounds required?** Recommended yes, with defaults offered by the workbench form, not by the engine.
