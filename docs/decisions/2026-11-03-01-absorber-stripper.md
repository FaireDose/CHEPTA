# 2026-11-03-01: Proposal 0015, M3, step 7 (W2): the absorber and the stripper; columns with nonvolatile components

The maintainer, 2026-10-30, after pull request #190 merged: "done next milestone boss": W2's next task, step 7 of
proposal 0015 (milestone M3). Written against contracts v1, on main at 4a8a9cf. W7's M3 cases were not on main, so W2
wrote its own independent reference (below); W7's cases are to be run against the engine when they land.

## What was done

- **The engine** (`src/units/columns/engine.js`): `ends.condenser: "none"` and `ends.reboiler: "none"`. An end without
  a condenser or a reboiler is an adiabatic equilibrium stage (its vapour, or its liquid, the product) and takes no
  specification: an absorber none, a stripper with a reboiler one. Feeds may enter stage 1 or stage N where those are
  not a condenser or a reboiler. **The start** for these columns: the sum-rates method of Burningham and Otto, as DWSIM's
  open source code documents it (`SumRates.vb`, GPL-3.0, read 2026-10-30, written anew), then Newton's method as for
  distillation.
- **Nonvolatile components** (proposal 0009, step 5) in every column with an activity model: their vapour pressure of
  1e-20 kPa keeps them in the liquid; the refusal is gone.
- **The block** (`src/units/columns/column.js`): `configuration` "distillation" (the default), "absorber", "stripper"
  (with `reboiler` "none", the default, or "partial"), rigorous only; the reflux and boil-up ratios are `null` where
  they do not exist; a nonvolatile component's vapour trace (about 1e-20) goes to the bottoms. `solve_column` takes a
  list of feeds (one per feed stage). The panel: a Configuration choice and, for a stripper, Reboiler; the number of
  specification fields follows the configuration; the results and the profile table name the top and bottom stages.
- **Two fixes found on the way:** the dew point of a vapour without its nonvolatile component (mole fraction 0) was
  searched over a NaN range (`src/equilibrium/dew.js`: only the boiling points of the components present); and where
  the flash at a product's saturation does not converge (water with glucose and a trace of ethanol, Modified UNIFAC
  2.0), the product takes the column's enthalpy flow by a P-H flash, with a note.
- **W2's reference** `validation/python/reference_mesh_open.py` (fixture `validation/fixtures/columns-open.json`): W7's
  `reference_mesh.Column`, unchanged, with the condenser's duty (and the reboiler's, where there is none) held at zero;
  its own start (fixed temperatures between the feeds', Wilson's K-values for an equation of state) and an `EosStart`
  vapour, because W7's `Eos` finds the trivial K = 1 at a decane-rich liquid. Cases: a lean-oil absorber (Peng-Robinson),
  a live-steam stripper and a reboiled stripper (NRTL).
- **Tests:** `test/columns-open.test.js` (10): the three cases against the reference within W7's numerical tolerances
  (within 3e-11 K and 1.5e-9 K); the Kremser equation (exact for a dilute solute, within 1e-5); the absorber through
  `solve_column`; the refusals and the degrees of freedom; the reboiled stripper by its boil-up ratio and by its bottoms
  flow; glucose in a stripper and in a distillation column; the dew-point fix; save and reopen, the command line and the
  worker.

- **The start's compositions** (found by the browser check): the sum-rates start first took every stage's liquid at the
  overall feed's composition, which in an absorber is mostly gas; there Peng-Robinson has one root and K = 1 for every
  component (the trivial solution), and a last-digit difference (Chromium against Node) decided whether Newton reached
  the solution or a stage with 46 % methane in its liquid (refused by the phase check, never returned). The liquid now
  starts from the liquid feeds and the vapour from the vapour feeds; the absorber converges in 2 Newton iterations at
  pressures 1e-15 to 1e-3 apart (a test).
- **Browser check** (Playwright, Chromium, the preview page, 2026-11-03): the lean-oil absorber opened from a project
  file solves in the worker; the panel shows Configuration (Distillation, Absorber, Stripper), no specification fields
  and no condenser for the absorber; the profile table names the top and bottom stages; switching to a stripper and to
  a reboiler asks for one specification, and back to distillation gives a fully specified column (the feed stages
  moved into its range); no sideways scroll at 375 px and 1280 px; no page errors.

## Choices made here, for the maintainer to confirm or change

- **The default stripper has no reboiler** (live steam or a stripping gas fed at the bottom).
- **The stripper and absorber are rigorous only**; the shortcut stays for distillation.
- **The glucose column has no independent reference**: the Python reference has no Modified UNIFAC 2.0; it is checked
  by its balances and by glucose staying in the liquid.

## For W7 and W4

- W7: an absorber and a stripper case with an open published example (a textbook lean-oil absorber or a sour-water
  stripper) would check the engine against more than a reference; `reference_mesh.Eos` starts a stage's vapour at the
  trivial solution where the cubic has one root (`EosStart` in W2's reference avoids it).
- W4: the column sizing takes the stages between the condenser and the reboiler as trays; an absorber's stage 1 and
  stage N are trays too.

## What the maintainer must check

- The configurations' table and the start (docs/models/columns.md, "The absorber and the stripper").
- The panel in the workbench (the screenshots of the pull request).
