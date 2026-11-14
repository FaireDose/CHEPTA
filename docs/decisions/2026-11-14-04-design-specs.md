# 2026-11-14-04: Design specifications built (proposal 0022, steps 1-3); sensitivity tables proposed (0023)

CHEPTA-Lab's request 15 (approved by the maintainer on 2026-11-14: "like in Aspen or HYSYS, a master tab where you set
fixed targets and the variables to vary"), whose use case is the ethyl acetate plant of
cases/ethyl-acetate-piotrowski-2021 (hold the product's purity by varying the ethanol feed inside the closed plant). The
Lab repository was read (public, read-only clone) for the request's text; nothing of it is in this pull request.

## What was decided before this pull request

Proposal 0022 was accepted on 2026-11-13 with its five recommended answers (docs/decisions/2026-11-13-02-splitter-flow.md):
an outer loop around the recycle solver; at most 8 bracketing and 50 Brent solves, settable in `solver`; the
specification's tolerance at least 100 times the recycle tolerance; no feed-forward "set"; bounds required. This pull
request builds them as written.

## What was built

- `src/flowsheet/design-specs.js` (new): checking (`checkDesignSpecs`, BAD_INPUT before anything is solved), the outer
  loop for one specification (bracket: the start, a step of 1 % of the range, doubling steps towards the side where the
  residual falls, at most 8 solves, then the bounds; Brent's method inside the bracket, at most 50 solves) and for several
  (Broyden's method on the scaled residuals with the variables kept inside their bounds, a finite-difference Jacobian at
  the start, step halving, one Jacobian refresh), the warm start of the tear streams, and the failures with their
  codes and reasons (`unreachable`, `limit`, `undefined`, `discontinuous`, `no_effect`, `singular`, `stalled`).
- `src/flowsheet/flowsheet.js`: `solveFlowsheet` runs the outer loop when the document has `designSpecs`;
  `flowsheetStatus` counts the varied inputs at their start values, lists the specifications and warns when a guess
  differs from the value given. A flowsheet without design specifications takes no new path.
- `src/flowsheet/document.js`: `designSpecs` is a known key (its shape checked); kept only when there are some.
- Request format: `checks.design_specs`; the flowsheet input's description lists the keys; the MCP instructions and the
  tool's result summary name them.
- Project format 10 (`src/ui/project.js`, `docs/schema/project-10.json`), written only when a flowsheet has a design
  specification; a format-9 file with one is refused, naming format 10.
- Docs: docs/models/flowsheet.md (a section), ARCHITECTURE.md, docs/README.md, ai/skills/chepta/SKILL.md,
  ai/instructions/use-chepta.md; proposals/README.md and proposal 0022's status.

**Independent check.** `validation/python/reference_design_spec.py` solves the separator loop with a make-up feed in
closed form with `scipy.optimize.brentq` (one specification) and `scipy.optimize.root` (two), writing
`validation/fixtures/design_specs.json`; test/design-specs.test.js compares CHEPTA's answers with it and with the closed
form written in the test (make-up to 1e-6 kmol/h), checks a heater duty that meets the bubble point against the heater
given VF = 0, a ratio target, a feed's total flow scaled with its composition kept, an ethanol feed that holds an ethyl
acetate product's purity inside an NRTL recycle (the purity a forward solve gives at 4 kmol/h of ethanol is found again
from a start of 12), and every failure of the proposal's section 3. No thermodynamic data were added or changed.

## Choices made while building (for the maintainer to confirm; recommendations first)

1. **The tolerance rule applies to every flowsheet, with or without a recycle.** Recommended: apply it only when the
   flowsheet has a recycle loop. The rule exists because a target cannot be met more tightly than a recycle is
   converged; a flowsheet without a loop has no recycle noise, yet today a tolerance of 1e-7 needs solver.tolerance
   1e-9 there too. It matters for CHEPTA-Lab: its closed plant converges only to a loose recycle tolerance (1e-4 to
   1e-5), which makes the tightest allowed tolerance of a mass fraction 0.01 to 0.001 (absolute), too loose for a
   purity of 99.9 %. Built as decided (every flowsheet); the change is one line if agreed. Lab's way meanwhile:
   tighten the recycle, or target the impurity's component flow (relative tolerance) instead of a fraction.
2. **A splitter's outlet is `index` from 0** (the position in the list as written in the document), while the block's
   own messages say "outlet 1" for the first. Recommended: keep 0 (it is the position in the JSON list a person or an
   assistant writes); the alternative is from 1, as the messages count.
3. **The bounds are tried after the 8 bracketing solves** (up to two more solves), so that a target out of reach is
   always reported with its value at both bounds, as the proposal's message asks. Recommended: keep.
4. **A warm start that fails is retried once from the document's own start** (one more solve), before the error is
   reported. Recommended: keep (a warm start far from the answer, at a bound, can fail where a cold start does not).
5. **Variables of the first set only** (the proposal's list). CHEPTA-Lab's request also names a column's reflux and
   distillate. Recommended: add them in a follow-up pull request with a column test, once the column work running now
   (src/units/columns) is merged; nothing in src/units/columns was touched here.

## Sensitivity tables (proposal 0023, draft)

The second half of request 15 (Aspen's Sensitivity, HYSYS's Case Study) is not in proposal 0022, so it was not built. It
is written as a new proposal, 0023, rather than an addendum to 0022, because 0022 is accepted and a sweep has its own
decisions (what a failed point returns, limits, order). Its open questions, each with a recommendation, are in the
proposal: (1) a failed point is a row that says so, the table refused only when every point fails; (2) at most 200
points and two varied inputs; (3) the flowsheet's own answer solved once more at the document's inputs; (4) the points
in a snake order; (5) design specifications held at every point allowed.
