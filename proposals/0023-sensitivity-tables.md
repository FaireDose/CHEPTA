# 0023: Sensitivity tables: sweep inputs of a flowsheet and tabulate chosen results

- **Status:** Draft (2026-11-14), for the maintainer to decide its open questions. Not built.
- **Author(s):** drafted by a coding agent for CHEPTA-Lab's request 15 (second half), while building proposal 0022
- **Discussion:** the pull request that adds this file (the one that builds proposal 0022, steps 1-3)
- **Roadmap item:** A8, flowsheet solver; track B (bridges: the table is exported as CSV)

## Why a new proposal and not an addendum to 0022

Proposal 0022 is accepted with its answers; adding a second feature to it would reopen an accepted document. A sweep
is also a different thing: a design specification *solves* for an input (one answer, or a refusal), a sensitivity
table *evaluates* the flowsheet at inputs the person chooses (many answers, some of which may fail). It shares 0022's
machinery (setting a block's number, reading a stream's quantity, warm-starting the tears), so it is cheap to build
after 0022, but its result, its failure rules and its limits need their own decisions.

## Problem

CHEPTA-Lab's ethyl acetate case (cases/ethyl-acetate-piotrowski-2021, README, request 15) ran every sweep (ethanol feed,
extractor temperature, the water-to-acid ratio, column 11's distillate) as one run per point: one request each, each
started cold. An engineer does this with Aspen Plus's Sensitivity analysis or HYSYS's Case Study: vary one or two inputs
over a list or a range, tabulate chosen results, each point started from the last.

## Proposal

### 1. A part of the flowsheet document, as `designSpecs` is

```json
"sensitivity": [
  {
    "id": "SENS1",
    "vary": [
      { "block": "F2", "key": "flow_kmol_h", "component": "ethanol", "values": [0, 2, 4, 6, 8] },
      { "block": "V1", "key": "P_kPa", "from": 90, "to": 110, "points": 3 }
    ],
    "report": [
      { "stream": "S4", "quantity": "mass_fraction", "component": "ethyl-acetate" },
      { "block": "V1", "quantity": "duty_kW" }
    ]
  }
]
```

- `vary`: one or two inputs, written as a design specification's `vary` (the same variables, the same keys `block`,
  `key`, `component`, `index`), each with `values` (a list) or `from`, `to`, `points` (evenly spaced, both ends
  included). Two inputs make a grid (every pair).
- `report`: the quantities to tabulate, written as a design specification's target without `value` (the same
  quantities, `ratio_of` included). Every point also reports whether it converged and the solves it took.
- Design specifications still apply at every point: a sweep of the extractor temperature with the purity held by the
  ethanol feed (0022) gives, at each temperature, the ethanol feed that meets the purity. The varied inputs of a sweep
  and of a design specification must differ (refused otherwise).

### 2. Solved point by point, each started from the last

- The points are visited in order (the second input fastest, back and forth, so that each point is next to the one
  before: a "snake" order), each a whole solve whose tear streams start from the previous point's answer (as in 0022).
- **A point that fails does not stop the table** (recommended; open question 1): its row says `converged: false` with
  the error's code and message, and the next point starts from the last point that converged. A table where every point
  failed is refused (NO_CONVERGENCE). This differs from every other calculation of CHEPTA, which returns nothing when it
  fails; but a sweep's purpose is often to find where a flowsheet stops working, and a whole table lost to one bad point
  hides that.
- Nothing is extrapolated or interpolated between points: a row is a solve, or it says it failed.

### 3. The result

```json
"sensitivity": [{ "id": "SENS1",
  "columns": ["F2 flow of Ethanol (kmol/h)", "V1 P_kPa (kPa)", "S4 mass fraction of Ethyl acetate", "V1 duty_kW (kW)"],
  "rows": [ { "inputs": [0, 90], "results": [0.9627, 812.3], "converged": true, "solves": 1 },
            { "inputs": [2, 90], "results": null, "converged": false, "error": { "code": "NO_CONVERGENCE", "message": "..." } } ] }]
```

The answer of the flowsheet itself (its streams and blocks) is the document's own inputs, solved once more at the end, so
that `value.streams` is never the last point of a sweep by accident. The table is exported as CSV (track B) and, in the
workbench (later, as 0022's step 4), shown as a table with a plot of one result against one input.

### 4. Limits

- At most 200 points per table (recommended; open question 2), refused beyond with the count; the execution envelope's
  time limit (src/runtime/) applies to the whole, and on a timeout the rows done so far are not returned (the envelope
  stops the worker) but the message says how many were done (CHEPTA-Lab's request 14 asks the same for loops).
- Project format: the next free one, written only when there is a sensitivity table.

## Engineering basis

- What other simulators do: DWSIM has a sensitivity analysis utility (open source, GPL-3); it was **not** read for this
  draft, and is to be read for the design before the build (docs/METHOD_SELECTION.md, "When in doubt: what other
  simulators do"), as 0022 read DWSIM's Adjust. Aspen Plus's Sensitivity block and HYSYS's Case Study are what Lab's
  request names; their manuals are not open and are not cited.
- Validation: (1) the separator loop of test/design-specs.test.js swept over its make-up water: every row against the
  closed form; (2) a sweep whose middle point is made to fail (a splitter asked more than its inlet): that row says so,
  the others are exact; (3) a sweep with a design specification held at every point, each row against a single solve of
  0022 at that point; (4) the warm start gives the same rows as cold solves within the recycle tolerance.

## Effect on existing work

Flowsheets without `sensitivity` are unchanged. It reuses src/flowsheet/design-specs.js (setting a varied input,
reading a quantity, the warm start), which then moves its shared parts into a small module of their own.

## Alternatives considered

- **One request per point** (today): works, but cold-started, and the person writes the loop.
- **A "sweep" capability in the request format only, not in the document:** simpler, but a project file could not
  keep its tables, and the workbench could not show them on reopening.
- **Stop the table at the first failure** (as every other calculation): consistent, but loses the rows that converged,
  which are what a person sweeps for.

## Steps

1. Engine and request format: `sensitivity` in the document, the snake order, the warm start, failed rows, the result
   table, the limits; `checks.sensitivity` (points, converged, failed). Tests (1)-(4).
2. Project format, CSV export, the assistant instructions.
3. Workbench: the table and its plot (with proposal 0022's step 4, following docs/UI_GUIDE.md).

## Open questions (recommendations first)

1. **A failed point: a row that says so, or a refusal of the whole table?** Recommended: a row that says so (with the
   error's code and message), and a refusal only when every point fails. It is the one place where CHEPTA would return
   numbers next to a failure, so the maintainer decides.
2. **Limits:** recommended at most 200 points per table and two varied inputs; more inputs are a later step if needed.
3. **The flowsheet's own answer:** recommended solved once more at the document's own inputs (one solve more), so
   `value.streams` always means the document as written. The alternative, the last point, is cheaper but surprising.
4. **Order of the points:** recommended the snake order (each point next to the last, best for the warm start); the
   alternative is the order written, which a person may want for a list of values that is not sorted.
5. **With design specifications:** recommended allowed (a design specification held at every point of a sweep, as
   Aspen Plus allows); refused when the sweep and a specification vary the same input.
