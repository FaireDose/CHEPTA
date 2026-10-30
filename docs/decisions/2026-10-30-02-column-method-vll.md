# 2026-10-30-02: Proposal 0015, M2b, step 4 (W2): the column's own method, two liquids on the stages, the decanter

The coordinating session, for the maintainer (2026-10-29): start W2's milestone M2b task, the column's own property
method with the P-H boundary and two liquids on the stages. Written against contracts v1 (ARCHITECTURE.md, "The request
path and the contracts of proposal 0015"), on main at v0.5.0 (394c29a). W7's M2b cases were being prepared in a parallel
session and were not on main when this was written (2026-10-30), so W2 wrote its own independent reference for two
liquids (below); when W7's pull request lands, its cases are to be run against this engine.

## What was done

- **Two liquids on the stages** (`phases: "VLL"`, the option "look for two liquids on the stages", off by default;
  `src/units/columns/two-liquids.js`): activity models only, as the flash drum. At each stage's temperature Michelsen's
  tangent-plane test of the stage's whole liquid decides whether a second liquid exists; where it does, the
  liquid-liquid flash at that temperature (`splitLL`, now exported from `src/equilibrium/flash.js`; Newton's method on
  the same equations where its successive substitution falls back to one liquid near a plait point) gives the two
  liquids. Both liquids of a stage leave it together, so the stage's MESH equations are those of one liquid written for
  its whole liquid, with the whole liquid's K-values from the vapour in equilibrium with both liquids and the enthalpy of
  the two. A third liquid is refused, as by the flash. The two liquids are named light and heavy by density.
- **A decanter on the condenser** (`condenser: "decanter"`, `reflux_liquid: "light" | "heavy"`): the condensate splits;
  one liquid is the reflux, entirely, the other the distillate. The column then takes one specification. No outlet
  port added: the distillate port carries the other liquid.
- **The column's own property method** (`method: { model, vapour, sets, prefer }`), with the P-H boundary of proposal
  0015, Part I, section 3, at every stream that enters or leaves the column: the component flows, the pressure and the
  enthalpy flow kept, the temperature found by a P-H flash in the receiving method, the change reported
  (`state.boundary`, the notes, the panel, `qualifications.block_methods` and `reproduction.block_methods` through the
  request path). A state the receiving method cannot represent is refused with its reason, the stream named.
- **End to end:** the Column block's panel (Liquids on the stages: One / Look for two; the Decanter and the refluxed
  liquid; the property method of the column), the profile table with the light and heavy liquid of each stage, project
  format 6 (the new keys described in `docs/schema/project-6.json`), `solve_column` and `solve_flowsheet` through
  `CHEPTA.run`, the command line, the MCP server and the worker.
- **W2's independent reference** `validation/python/reference_mesh_vll.py` (fixture
  `validation/fixtures/columns-vll.json`): W7's MESH equations of `reference_mesh.py`, unchanged, with an independent
  Python liquid-liquid split (its own tangent-plane test and split, scipy) and a decanter written as extra unknowns.
  Cases: W7's F1 solved with two liquids; a ternary of W2 (1-butanol + water + methanol, NRTL, 10 stages: one liquid on
  stages 1 and 2, two below); F1's column with a decanter (the butanol-rich liquid refluxed, D = 35 mol/s).
- **Tests:** `test/columns-vll.test.js` (13 tests): the three cases against the reference within F1's numerical
  tolerances (they agree within about 2e-10 K and 1e-11 in mole fraction); F1 through `solve_column` and still refused
  with one liquid; the refusals (an equation of state, "LL", a decanter without two liquids or with two specifications or
  a reflux ratio); the decanter's degrees of freedom; the P-H boundary in both directions (UNIQUAC flowsheet and NRTL
  column, and the other way round), checked against independent P-H flashes, with the energy balances closed and each
  product returning to the column's temperature when taken back; the boundary in a recycle; a feed of two liquids into
  a column in Peng-Robinson refused; the request path's qualifications; save and reopen, the command line and the
  worker. Four earlier tests (test/api.test.js, columns-rigorous.test.js, columns-rigorous-m2a.test.js) matched the
  M2a wording "two liquids on the stages come with milestone M2b": the refusals are unchanged, their remedy now names
  the option, and "VLL" is no longer refused; each change says why.
- **Browser check** (Playwright, Chromium, the preview page, 2026-10-30): a project of 1-butanol + water (UNIQUAC
  flowsheet, the column in NRTL with two liquids and a decanter) opened from its file, solved in the worker, the column
  selected: the panel shows "One liquid / Look for two liquids", "Total / Partial / Decanter", "Light refluxed / Heavy
  refluxed" and the column's property method; the profile table shows the light and heavy liquid of stage 1 and the
  boundary's temperature changes; switching two liquids off gives back the total condenser and two specifications,
  on again and the decanter one specification; no sideways scroll at 375 px and 1280 px (the table scrolls in its box);
  no page errors.

## W7's M2b cases (merged into this branch, 2026-10-30)

W7's pull request #191 landed on main while this one was open; main was merged in (a merge commit) and its cases run
(`test/columns-vll.test.js`): F1 with phases "VLL", F2 (decanter, water-rich feed of two liquids, the case's branch
with 0.994 butanol at the bottom) and F3 (ternary, two liquids on stages 5 to 10 only) within about 1e-10 K of W7's
reference, the same two-liquid stages; G1, G2 (recycle) within 2e-8 K at every crossing and the energy balance within
the case's limit; G3 refused with OUT_OF_RANGE as the case expects. To reach F2's branch the start changed: with two
liquids the compositions start on a straight line between product estimates (from the feed's composition everywhere,
F2 went to its other solution), and a decanter tries the start reflux ratios 1, 3, 0.5, 2 and 5 in turn. F1's text
named the old remedy ("two liquids on the stages come with milestone M2b"); at the coordinating session's request it
now names the option (wording only).

## Decided by the maintainer (2026-10-30)

- **The decanter as built:** one whole liquid refluxed; no reflux fraction per liquid.

## Choices made here, for the maintainer to confirm or change

- **The whole liquid of a stage as the variables** (the "effective K-value" form) rather than separate variables for
  each liquid: exact where both liquids leave the stage together, as on trays without a decanter; written from the
  phase-equilibrium conditions, not taken from a source.
- **The start reflux ratios of a decanter** (1, 3, 0.5, 2, 5, tried in turn): only the start; this project's choice.
- **Names by density** from the components' liquid densities mixed ideally; only to name the liquids, not for any
  calculation.
- **The products with the column's own method** take the enthalpy flow of the column's last stages, and their
  temperature in the flowsheet's method by P-H; a product can then carry a trace of vapour in the flowsheet's method
  (0.06 % of the distillate in the UNIQUAC example): the two methods disagree there, and the energy is kept.

## For W7 and the maintainer

- W7's case F1 says its refusal names the remedy "two liquids on the stages come with milestone M2b"; since M2b the
  remedy is the option itself. The case was not changed (W7's file); its words are out of date.
- The ternary ethanol + water + ethyl acetate with stages near a plait point converged, but took 7 s; the tangent-plane
  test on every stage near the binodal is the cost. P1-sized columns with two liquids may need a budget of their own.

## What the maintainer must check

- The equations of two liquids on a stage and of the decanter (docs/models/columns.md, "Two liquids on the stages").
- The P-H boundary and its tests (docs/models/columns.md, "The column's own property method").
- The panel and the profile table in the workbench (the screenshots of the pull request).
