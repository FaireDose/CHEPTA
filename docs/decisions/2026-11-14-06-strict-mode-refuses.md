# 2026-11-14-06: The strict range mode refuses; missingPairs in a flowsheet; loop progress when out of time

CHEPTA-Lab tested chepta 0.6.2 on two closed plants (ethyl acetate, Piotrowski 2021; the methanol separator) and asked
for five changes (FaireDose/CHEPTA-Lab, cases/ethyl-acetate-piotrowski-2021/README.md, "Capability requests to CHEPTA
from 0.6.2"; Lab PR #21). The interface switch was agreed by the maintainer on 2026-11-13 (docs/HANDOVER.md, queue item
0b). What this pull request does, and the questions it leaves to the maintainer.

## 1. EA-10: `strictRanges: true` refused nothing

**Why.** Lab's heater feed at 15 degC (UNIQUAC, ethanol + water + ethyl acetate + acetic acid) gave `ok` with six
extrapolations with `options.strictRanges: true` and with `solver.strictRanges: true` alike. The policy was active;
two things let the answer through:

- the strict mode kept the margins of before 2026-11-13 by design (decision 2026-11-13-03): a vapour-pressure equation
  evaluated beyond its record, a liquid heat capacity continued up to 10 K below it, a pair set used up to 10 K outside
  its data with a warning only;
- the notes of the answer's states (`sys.extrapolations(T)`, src/thermo/system.js) are gathered after the fact, in the
  lenient mode on purpose, so they were reported and never refused.

**Fix** (src/flowsheet/flowsheet.js). In the strict mode a flowsheet whose answer would carry an extrapolation is
refused: OUT_OF_RANGE (outcome `invalid_input`), the message naming every record outside its range, `details` with the
list and `where` the blocks. As in the lenient mode, what counts is the answer's states, not the searches that led to
it (a flash or a recycle may pass outside a record's range on its way). An estimated pair is not refused again at the
end: the strict mode refuses it when the system is built, unless `thermo.missingPairs` asked for an estimate. The rule
holds for every request, since the single-block requests are flowsheets.

**Also** (same file): the list holds only the records of the components a block's outlets carry. Lab's case listed
ethyl acetate's vapour pressure and ideal-gas heat capacity at the feed although the feed has no ethyl acetate; the
strict mode would have refused a flowsheet for a component absent from it.

**Every result says which mode it ran in:** `value.rangeMode`, `"lenient"` or `"strict"`.

## 2. EA-11: `thermo.missingPairs` in a flowsheet

`flowsheet.thermo.missingPairs` (`"estimate"`, `"ideal"`, `"refuse"`), as `system()` takes it (decision 2026-11-13-05),
is accepted by the flowsheet document (src/flowsheet/document.js), so by every request, the project file and the
workbench; another value is refused with `where: flowsheet.thermo.missingPairs`. An explicit value holds in both range
modes. The project format is not raised: an older version refuses the key loudly ("unknown key").

## 3. EA-14: OUT_OF_TIME said nothing about the loops

A request stopped by its time limit ends its worker, and the worker's state is lost. The engine now reports its
progress (src/util/progress.js): after every iteration of a recycle loop, each loop's blocks, tear streams, iterations,
last residual, tolerance and last five residuals. The Node and browser workers pass the reports to the waiting thread
(src/runtime/), which puts the last one in the `out_of_time` result: `error.details.progress`, and in words in
`error.message` ("When it was stopped, the loop through C1, M2 (tear streams S7, S8) was at iteration 41 of 200, the
tear streams changing by 1.50e-3 per iteration ...").

## 4. solve_column dropped the extrapolations (Lab's B2 question)

`solve_column`, `solve_membrane`, `solve_extraction`, `solve_evaporator`, `solve_crystallizer` and `size_drum` built
their value from the flowsheet result and left out `extrapolations`. They now carry `extrapolations` (with `where`, the
block) and `rangeMode`. Lab's B2 column (Peng-Robinson, benzene + toluene) carries one: the benzene + toluene k_ij set
used 4.3 K above its data.

## 5. The Settings switch (agreed by the maintainer, 2026-11-13)

The Settings drawer (opened by the Units button; both layouts share it) has a section "Outside a record's range or a
missing pair" with two answers, "Continue with a warning" (default) and "Refuse", and a line saying what each does. It
is stored as the project's `solver.strictRanges` in each flowsheet document with components (the Flowsheet, Column and
Reactor workspaces), so it is saved with the project. Each result view (the results panel of the three workspaces)
says which mode the result was calculated in, from `result.rangeMode`.

## Tests

`test/strict-mode.test.js` (9 tests, on Lab's inputs). Two existing tests changed, both in
`test/authoring-contract.test.js`: the list of known thermo keys gained `missingPairs`; and the check that a pair given
as the user's own data works in the strict mode now runs its feed at 310 K instead of 300 K, because glycerol's
vapour-pressure record starts at 303.59 K and the strict mode now refuses that (the old test asserted the non-refusal).

## Questions for the maintainer (recommendations first)

1. **The strict mode is now stricter than before 2026-11-13** (no margin for pair sets, vapour pressures or the heat
   capacity's 10 K). Recommended: keep it so; the strict mode means "no extrapolation in the answer", which is what
   Lab and a reviewer expect from it. The alternative, the old margins, refuses nothing in Lab's cases.
2. **The switch applies to the Flowsheet, Column and Reactor workspaces only.** The diagrams, the flash and the other
   calculations of the workbench stay lenient. Recommended: keep it so for now; a strict diagram would refuse whole
   curves at their ends, which needs its own design.
3. **Direct library calls** (`system().flash`, `bubble`, ... outside a flowsheet) still keep the old margins in the
   strict mode. Recommended: leave them; a follow-up can refuse their results' extrapolations the same way if asked.
4. **No project format change for `thermo.missingPairs`.** Recommended: keep (an older version refuses the key and
   names it); raise the format only if the maintainer wants the older version to name the format.
