# 2026-11-13-02: Splitter by flow (built) and design specifications (proposal 0022, draft)

CHEPTA-Lab's request 7, approved by the maintainer. The Lab's repository is not attached to this session, so the request
was taken from the task text.

## What the maintainer must check and decide (recommendations first)

1. **Project format 9** for a splitter given by flow. *Recommended: keep it.* A format-8 reader would open such a file
   and then report the splitter's fractions "missing" without saying why; raising the format makes it say "format 9",
   as for every earlier addition. It is written only when a splitter is given by flow, so every other project keeps
   its format. The alternative (no new format, the older version's "missing fractions" message) saves a schema file.
2. **Inside a recycle, a short inlet is allowed while the loop iterates, refused once it has converged.** *Recommended:
   keep it.* The first pass of a loop starts from an empty tear stream, so a recycle asked at 100 kmol/h may see only
   70 kmol/h before it fills up. While the loop iterates, the asked outlets then share the inlet in proportion and the
   "rest" outlet is empty; if the converged loop is still short, the solver throws BAD_INPUT naming the splitter, the
   asked and the available flow. Outside a loop (and in `runUnit`) a short inlet is refused at once. Alternative:
   refuse in every pass, which would make most recycles specified by flow fail on their first pass.
3. **Spec keys `flow_kmol_h` and `flow_kg_h`**, a list with one total flow per outlet and **exactly one "rest"**
   (`[12, "rest"]`). The same names as a feed's, with another shape (a list of totals, not flows per component); an
   object is refused with a message that says so. *Recommended: keep the names* (they read as the flowsheet's units);
   the alternative is `outlet_flows_kmol_h`.
4. **Proposal 0022 (design specifications)** is a draft: decide its five open questions (section "Open questions",
   recommendations given there): outer loop rather than inside the recycle loop; limits of 8 bracketing and 50 Brent
   solves; the specification's tolerance at least 100 times the recycle tolerance; no feed-forward "set" (DWSIM's Spec)
   for now; bounds required. **No design-specification code is written before the proposal is accepted.**

## What was built (part 1)

- `src/units/units.js`: the splitter takes one of `fractions` (as before, unchanged), `flow_kmol_h` or `flow_kg_h`.
  Negative flows, more than one specification, no or two "rest", a list of the wrong length, and asked flows above the
  inlet are refused (BAD_INPUT, with the numbers). The result's `state` gives the basis, the asked flows, the inlet's
  total and the fractions used. `runUnit` takes `iterating` (section 2 above); the degrees-of-freedom count knows the
  new keys.
- `src/flowsheet/flowsheet.js`: blocks of a loop are calculated with `iterating`; a converged loop with a short splitter
  is refused.
- The workbench (`src/ui/flowsheet-view.js`): the splitter's form has a "Give" choice, Fractions, kmol/h or kg/h; the
  outlet buttons and the removal of an outlet keep the chosen basis (`splitKey` in `flowsheet-logic.js`). The Excel
  export writes a splitter given by flow with the fractions CHEPTA solved, as values (grey), since Excel cannot know
  the inlet's flow ahead.
- Request format: `solve_flowsheet` takes the spec as part of the flowsheet document (no schema change: block specs are
  passed through and checked by the block). The CLI and MCP schemas do not list block specs, so nothing changed there.
- Project format 9 (`src/ui/project.js`, `docs/schema/project-9.json`, ARCHITECTURE.md, docs/README.md).
- Docs: docs/models/flowsheet.md, ai/skills/chepta/SKILL.md.

**Independent check.** The splitter keeps the inlet's composition and state, so it is a mass balance; the tests check the
asked flows and the balance directly. In the recycle cases (test/splitter-flow.test.js) the steady state of the
separator loop is computed in the test by bisection on the purge fraction, a different calculation from the solver's
Broyden iterations, and agrees to 1e-6 kmol/h; one case starts with the splitter's inlet short of the asked flow (70
against 100 kmol/h) and converges; a purge the converged loop cannot give (75 against at most 70 kmol/h) is refused.
No thermodynamic data were added or changed.

## Proposal 0022 (part 2)

`proposals/0022-design-specification.md`: a `designSpecs` list in the flowsheet document (vary one number of a block's
spec within required bounds to meet a stream's or block's quantity), solved by bracketing and Brent's method around the
sequential solver, several together by Broyden; failures and the message for each; the request format, project format
and workbench form; what DWSIM's Adjust, simultaneous adjust and Spec do, read in its open source and API help on
2026-11-13 (cited in the proposal; the routine that runs a single Adjust was not found in the files read, which the
proposal says).
