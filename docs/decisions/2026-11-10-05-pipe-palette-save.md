# 2026-11-10-05: the Pipe in the flowsheet palette and in the project file (proposal 0020)

## What the maintainer decided (2026-11-10, answers to #217, relayed by the coordinating session)

1. Proposal 0020 is **accepted for steps 1-2**.
2. #217 was merged with one phase only.
3. The liquid-gas flow comes later, in its own pull request: Lockhart-Martinelli first, then Beggs-Brill, once open
   sources are found.
4. **Save the Pipe workspace in the project file.**
5. **Add the Pipe to the flowsheet drawing's palette.**
6. The default roughness of 0.05 mm is kept.

## What was built

- **The palette** (`src/ui/flowsheet-logic.js`, `src/ui/flowsheet-view.js`, `src/ui/pipe-view.js`): a Pipe button
  between Pump and Compressor, with the pipe icon the workspace already has, the drawing of a pipe run (a rectangle with
  a flange at each end), the id prefix `PI` (`P` is the product's), and a hint.
  - A new block starts with the workspace's geometry: 100 m, 50 mm, roughness 0.05 mm, adiabatic (the worked example the
    engine is tested on). They are starting values for the person to change, as a column's keys are.
  - Its Inputs panel has the sections Pipe (length, inner diameter in mm, roughness in mm, elevation), Fittings (a row
    of the DOE table, or your own K or Leq/D, with a count), Heat (adiabatic, isothermal, U with the surroundings'
    temperature) and Options (segments, your own friction factor and viscosity). They are the workspace's fields and
    write the keys of `src/units/pipe.js`.
  - Its Results panel shows the outlet temperature and pressure, the pressure drop with its four parts, the velocity,
    Reynolds number, flow regime and friction factor, then the duty (the heat, for an isothermal or U pipe), the
    block's warnings and notes as for every block.
  - A refusal (a two-phase inlet, a phase change inside the pipe, choking, a missing record) is the engine's own text,
    shown on the block as for every other block.
  - The Excel export treats the pipe as it treats a valve (its outlet carries its inlet's flows).
- **The project file is format 8** (`src/ui/project.js`, `docs/schema/project-8.json`). It holds `workbench.pipe` (the
  workspace's settings in full, with its `components`) and the flowsheet's pipe block. It is written only when a pipe is
  used (a setting changed, the Pipe view open, or a pipe block drawn); every other project keeps the format it had.
- **New format, not an optional section of format 7. Why:** the project code does not let a format-7 reader ignore the
  new part. `readProject` refuses any unknown key of `workbench` ("unknown key"), and a flowsheet with a block type the
  version does not know does not load. A key outside `workbench` would be skipped without a word, and the person's pipe
  would then be lost the next time they save. Every earlier addition (hx, chart, column, MHV1) raised the format for the
  same reason, so an older version says "this project uses format 8" instead of dropping data. The file keeps its older
  format when it holds no pipe.
- Docs: `docs/README.md`, `ARCHITECTURE.md` (the paragraph on project formats), proposal 0020's status, its row in
  `proposals/README.md`, the roadmap row and `docs/DECISIONS.md`.

## Checks

- `test/pipe-project.test.js` (new, 8 tests):
  - the palette's block gives the same result as `runUnit("pipe")` called directly, for the same spec (all the numbers
    equal to 1e-12), and the workspace sends the same spec for the same settings;
  - the new block's starting spec is complete, and a valve can be changed into a pipe;
  - the engine's two-phase refusal reaches the block, with its text;
  - the format: 8 with a pipe, 2 for a plain project; the Pipe view opened or a setting changed counts as a pipe;
  - round trips: the workspace (settings, components, fittings, U heat, own friction factor and viscosity), the
    workspace with defaults, and a flowsheet with a pipe block, which solves to the same pressure drop from the file;
  - a format-7 file with a pipe is refused naming "format 8", and a wrong saved value is named (`pipe.length_m must be a
    positive number`).
- Tests changed because a new format changes what they count (DATA_RULES section 9.2): `test/project.test.js` (the
  newest format is 8; the first format refused is 9) and `test/pipe-workspace.test.js` (its last assertions said the
  project does not carry the pipe, which is what this change reverses).
- The Inputs and Results panels were opened in Chromium at 1280 px (light and dark) and 375 px: the pipe placed, a feed
  added, solved, a fitting added; no script error, results shown. The view has no DOM test (the repository has none).

## What the maintainer must check

1. In the Flowsheet workspace, place a Pipe, add a feed, set a water feed (25 °C, 500 kPa, 100 kmol/h), and compare its
   pressure drop with the Pipe workspace's for the same settings (they are the same engine).
2. Save a project with a pipe (File → save), open it again: the workspace's settings and the drawn pipe are back.
3. A refusal in the drawing: feed water at 100 °C and 101.325 kPa with vapour fraction 0.5 into a pipe: the block says
   two-phase, single-phase only.
4. The screenshots against docs/UI_GUIDE.md (the interface designer).

## What the maintainer must decide (with a recommendation each)

1. **Format 8, not an optional section of format 7.** Recommendation: keep it (the reason above). An optional section
   would be dropped silently by an older reader, which is worse than refusing it.
2. **Starting values of a new Pipe block** (100 m, 50 mm, 0.05 mm, adiabatic) instead of an empty block that must be
   specified. Recommendation: keep them, as the column does; the block then solves as soon as it has a feed.
3. **A pipe can carry heat only by the block's own duty** (isothermal or U); it is not connected to an energy stream.
   Recommendation: leave it until a case needs it (a heat exchanger or heater does that).

## Still open

The two-phase flow (its own pull request, once open sources for Lockhart-Martinelli and Beggs-Brill are found).
