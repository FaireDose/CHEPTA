# 2026-11-11-01: Proposal 0015, step 11 (M4): purity and recovery specifications and side draws of the column

The task (the coordinator, 2026-11-11): proposal 0015, step 11, milestone M4: design specifications and side draws for
the Column block, one of CHEPTA-Lab's known blockers (a reaction-separation case must meet declared product
constraints: purity, impurities, recovery). The cost correlations of M4 (step 12) and the benchmark flowsheets of
step 11 are not in this pull request.

## What was built

- **Design specifications of the rigorous column** (`src/units/columns/specifications.js`): a purity (mole or mass
  fraction of a component in the distillate, the bottoms or a side draw), a recovery (the share of a component's feed
  that leaves in a product), a component's flow in a product (kmol/h or kg/h), and the temperature of any stage. Each
  takes the place of a reflux ratio, a boil-up ratio, a product flow or a duty; the column still takes two
  specifications (one with a decanter, one for a reboiled stripper). The solver finds what was left open, in this
  order: the reflux ratio, the distillate flow, the boil-up ratio. With one liquid or two (phases "VLL", a decanter):
  the specifications sit outside the stage solver, so they work with whatever it solves.
- **How: an outer loop around the stage solver**, not the specifications among the MESH equations. Newton's method on
  the specifications; its Jacobian from the converged column's own Jacobian (the implicit function theorem), so one
  outer step costs one column and one Jacobian; every column started from the last. With one free variable, a scan of
  its whole range and a bracketing secant search take over where Newton's method fails. The argument, from open
  sources read on 2026-11-11:
  - DWSIM's Naphtali-Sandholm solver writes one specification in place of the condenser's energy balance and one in
    place of the reboiler's, each of that end's own product (component fraction, component flow, component recovery,
    product flow, stream ratio, temperature, duty; `NewtonRaphson.vb`, the block "handle user specs", GPL-3.0,
    https://github.com/DanWBR/dwsim, branch "windows"). That keeps the block-tridiagonal Jacobian, for one
    specification per end. A purity with a recovery of the same product, a stage temperature inside the column or a
    specification on a side draw would couple distant stages.
  - CHEPTA's engine reaches long columns with very pure products by a continuation that first solves a column without
    any separation (decision 2026-10-29-10). No purity can be met there, so a purity among the equations would take
    the continuation away. The ChemSep Book says the same of its continuation in the stage efficiency: "it cannot,
    without modification, handle problems in which a product stream purity is specified" (Kooijman and Taylor, 2nd
    edition, 2006, public domain, section 13.5, p. 224).
  - A specification that no column can meet makes Newton's method on the whole system fail without a reason. The
    outer loop sees how each specification answers to the reflux and the product flow, so it can say what the column
    reaches and what limits it.
  - The price: several column solutions for one answer. In the tests a solved case took 4 to 8 columns.
- **Fail loudly.** Refused before solving (`BAD_INPUT`): a purity or a recovery outside 0 to 1 (1 included: "ask for
  0.999"), a component that is not fed, a component flow above its feed, purities of one product adding up to more
  than 1, a purity that a given product flow cannot hold (with the largest fraction and the largest flow). Refused as
  outside what the column can do (`OUT_OF_RANGE`, the outcome "invalid_input"), with the reason and what would make it
  feasible:
  - a purity beyond a binary azeotrope seen from the feed: the azeotrope's composition and temperature by the
    column's own method (case E3: ethanol 0.95 asked, the model's azeotrope at 0.8805, 351.4 K);
  - one free variable and no solution in its range (a reflux ratio fixed below the minimum for a purity): the largest
    and the smallest value the specification reaches, and where;
  - two specifications that the stages cannot give even at a reflux ratio of 100: what each reaches there.
  Anything else is `NO_CONVERGENCE` with the closest point, never a statement that the specifications cannot be met.
  Every result lists each specification as asked and as reached (`state.design_specifications`,
  `checks.columns.<id>.specifications`) and what was found (`adjusted`).
- **Side draws** (`src/units/columns/engine.js`): a liquid or a vapour of a given flow from a stage between the
  condenser and the reboiler, in the stage solver's own equations (The ChemSep Book, section 13.2.1, eqs. 13.1 to
  13.3, p. 192); a side draw given without a flow has it found, for one more specification (a recovery or a purity in
  it). The Column block has a third outlet, `side`: one stream per side draw, in order.
- **Everywhere the column is set:** the block's keys `specifications`, `distillate_purity`, `bottoms_purity`,
  `side_draws` (flowsheets, project files, `solve_flowsheet`); `solve_column` (CHEPTA.run, the command line and the
  MCP server go through the dispatcher), which returns the side draws as streams; the block's panel in the Flowsheet
  and in the Column workspace (each specification slot offers the four kinds; side draws are added and removed with
  their product stream; the results show each specification as asked and as reached). No new project format (the newest stays 8;
  a file is written with the lowest format its content needs, 6 for a column): the new keys are optional keys of
  the column's specification (`docs/schema/project-8.json` describes them).
- **Validation:** the independent reference `validation/python/reference_mesh_specifications.py` (it extends
  `reference_mesh.py`; the specifications are among its Newton equations, and a side-draw flow is found by Brent's
  method: other routes than the engine's), eight cases in `validation/data/columns/specifications/cases.json`, the
  fixture `validation/fixtures/column_specifications.json`, and `test/columns-specifications.test.js` (18 tests). One
  case is the worked example of The ChemSep Book (case B2) asked the other way round: its published distillate
  purity given, its reflux ratio found.
- **Documents:** `docs/models/columns.md` (a new section), ARCHITECTURE.md, ROADMAP.md, proposal 0015 (step 11).

## Tests that were changed, and why (AGENTS.md rule 6)

No validation data and no benchmark was changed; `test/benchmark-columns.test.js`, `columns-rigorous-m2a`,
`columns-vll` and `columns-absorber` pass unchanged. Four tests asked for a purity or a side draw to be refused as
"not built yet (M4)"; M4 is now built, so they ask for something else, each with a comment saying so:

- `test/api.test.js`, `test/cli.test.js`: the "unsupported" outcome is now shown with two liquids on a stripper's
  stages (still not built).
- `test/columns-rigorous.test.js`: a purity without a component and a side draw without a rate are now `BAD_INPUT`.
- `test/columns-shortcut.test.js` (case E3): the case's `outcome_from_M4` ("invalid_input", the message names the
  azeotrope) in place of `outcome_before_M4`.

## Measured, not assumed

- Engine against the reference, eight cases: flows within 2e-5 relative, mole fractions within 2e-6, temperatures
  within 1e-4 K (the limits are in the cases file; the engine meets a specification to a scaled 1e-6, the reference
  to 1e-12).
- The ChemSep Book column asked for its published distillate purity (0.925473, Figure 1.21): CHEPTA's Peng-Robinson
  column needs a reflux ratio of 2.343; the book's is 2, with UNIFAC, Antoine and constant molar overflow. 17 % apart:
  two property methods, not a solver error (the engine and the reference agree on 2.343).
- Time, on this session's machine: a solved case 0.1 to 4 s; the refusal of ethanol + water at a fixed reflux ratio
  of 2 with 0.85 asked about 27 s, because columns next to the pinch are slow to solve.
- Browser (Chromium, the built bundle): a column opened from a project, specification 1 changed to a purity, a side
  draw added with its product stream, solved on change; the results show the specification as asked and as reached;
  no page errors; no sideways scroll at 375 px.

## What the maintainer must check

1. The argument for the outer loop against the two sources (DWSIM's `NewtonRaphson.vb`, "handle user specs"; The
   ChemSep Book, section 13.5, p. 224, and section 13.2.1, eqs. 13.1 to 13.3, p. 192).
2. The published number used in case S4 against the book: the distillate's benzene mole fraction 0.925473 (Figure
   1.21, p. 20) and the reflux ratio 2 (Figure 1.19, p. 19). Both were already transcribed in case B2.
3. The wording of the refusals in the workbench (an azeotrope; a reflux below the minimum; too few stages).
4. The panel: the specification slots and the side draws (the Flowsheet's column, and the Column workspace).
5. The refusals' units: the stage solver's messages give flows in mol/s (its own unit), also where the block was
   given kmol/h ("the distillate is 58.33 mol/s" for 210 kmol/h). To change if the maintainer wants kmol/h there.

## What the maintainer must decide (a recommendation each)

1. **The outer loop, or the specifications among the equations.** Recommendation: keep the outer loop, for the three
   reasons above. If speed matters later, the specifications of one end's product could also be written among the
   equations (DWSIM's way) as a fast path, with the outer loop for the rest.
2. **The tolerance of a specification:** a scaled residual of 1e-6 (for a purity x about 1e-6 x (1 - x), for a flow a
   relative 1e-6, for a temperature 1e-5 K). This project's choice, not from a source. Recommendation: keep.
3. **The agreement limit with the book's reflux ratio** in case S4: 25 % (17 % found). It states agreement between
   two property methods. Recommendation: keep, or drop the comparison and keep only the numerical one.
4. **The limits of the search:** reflux and boil-up ratios from 0.001 to 1000; "near total reflux" taken as a reflux
   ratio of 100 when a failure is explained. This project's choices. Recommendation: keep.
5. **No new project format** (the newest stays 8; the new keys are optional). A build before this change refuses a file that holds
   them, naming the unknown key. Recommendation: no new format; a format 9 only if the maintainer wants older builds to say
   "needs a newer CHEPTA" instead.
6. **Refusals that are slow next to a pinch** (about 27 s in the worst case found). Recommendation: accept for now
   (the worker has its Stop button and time limit); a coarser scan would be faster and say less.
7. **What comes next for specifications** (not built here): inequalities ("at least 0.99", "at most 10 ppm"), which
   CHEPTA-Lab's product constraints will want; a side draw of one of two liquids; pumparounds; a liquid distillate
   beside a partial condenser's vapour; side draws on absorbers; the azeotrope test before solving for three or more
   components. Recommendation: inequalities first, as a check on a solved column (met or not, by how much), since an
   equality at the bound already gives the design.

## Open sources used

- DWSIM, GPL-3.0, `DWSIM.UnitOperations/UnitOperations/RigorousColumnSolvers/NewtonRaphson.vb`, branch "windows",
  https://github.com/DanWBR/dwsim (read 2026-11-11; read for how it handles specifications, no code taken).
- H. A. Kooijman and R. Taylor, The ChemSep Book, 2nd edition, 2006, public domain,
  http://www.chemsep.org/downloads/docs/book2.pdf (read 2026-11-11): section 13.2.1 (p. 192), section 13.5 (p. 224);
  sections 1.2 and 1.3 through case B2. Already in `src/data/sources.json` (`kooijman-taylor-2006-chemsep-book`).
