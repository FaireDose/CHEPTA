# 2026-10-30-07: Proposal 0015, step 7 (W2; milestone M3): the absorber, the stripper, columns with nonvolatile components

The coordinating session started this task on 2026-10-30 (proposal 0015 accepted; its Part I, section 1: "the same
without condenser or reboiler: a gas washed by a liquid, or a liquid stripped by a gas"; proposal 0009, step 5). No
decision of the maintainer's is recorded yet: this file lists what was built, what to check and what to decide.

## What was built

- **The engine** (`src/units/columns/engine.js`): `ends.condenser: "none"` and `ends.reboiler: "none"`. Without a
  condenser stage 1 is an equilibrium stage whose vapour leaves the column; without a reboiler stage N is one whose
  liquid leaves it; their energy balances hold. Specifications: none for an absorber or a stripper, one (boil-up
  ratio, reboiler duty, bottoms or top flow) for a reboiled stripper; a condenser without a reboiler is refused (not
  built). Stage duties (`duties: [{ stage, Q_W }]`) on any equilibrium stage. The start: the sum-rates method
  (Burningham and Otto, as DWSIM's `SumRates.vb` documents it, written anew and simplified), with each stage's
  temperature from its energy balance (wide-boiling) or at its liquid's bubble point (narrow-boiling), the order by the
  spread of the K-values (a factor of 1000); then Newton on all MESH equations, as for distillation.
- **Nonvolatile components** in every column (proposal 0009, step 5): the refusal of M2a is removed. They keep their
  vapour pressure of 1e-20 kPa and stay in the liquid. A bottoms at or below their feed is refused (BAD_INPUT: the
  bottom stage would boil dry); a stage whose volatile liquid falls below 1 % of the column's largest vapour flow
  (the M2a dry-stage threshold) is warned DRY_STAGE (phase "volatile liquid"), the reboiler included.
- **The Column block** (`src/units/columns/column.js`): `configuration` "distillation" (default), "absorber" or
  "stripper"; for the last two `stages`, `feed_stage` (default 1 and N), `reboiler` ("none" or, for a stripper,
  "partial" with one specification), `stage_duties_kW`, `P_kPa`, `method`, `sizing`. The outlets keep their ports:
  `distillate` is the top gas, `bottoms` the bottom liquid; the workbench names them "gas out" and "liquid out" (below). The block's
  duty adds the stage duties, so the flowsheet's energy balance closes.
- **Methods for absorption** (docs/METHOD_SELECTION.md, step 2): an absorber or stripper refuses (NOT_AVAILABLE) an
  activity model or the ideal solution with a component above its critical temperature (a vapour pressure
  extrapolated past the critical point), and an equation of state with a light gas and a polar component (Henry's law,
  PSRK or Wong-Sandler would be needed). Hydrocarbons with light gases take Peng-Robinson or SRK.
- **The request path**: `solve_column` gains `gas_feed` (the second inlet); the command line and the MCP tool take it
  the same way. **The workbench**: the block's panel (Distillation / Absorber / Stripper, the reboiler, the
  specification, "Heat added to stages"), its results, the profile table, the Column workspace's charts (McCabe-Thiele
  only for distillation) and the Excel sheet. Saved in project format 6 (no new keys at the project level).
- **The method's notes** on a column now name a temperature range once ("the stages' 305.70-309.68 K are outside that
  range") instead of once per stage; this changes distillation's notes too.
- **Sizing** takes every stage that is not a condenser or a reboiler as a tray, so an absorber can be sized.

## The checks

`test/columns-absorber.test.js`, eight cases in `validation/data/columns/absorber-stripper/cases.json`, the
independent reference `validation/python/reference_mesh_absorber.py` (scipy; it reuses the NRTL and Peng-Robinson
classes of `reference_mesh.py`, not the engine), fixture `validation/fixtures/columns_absorber.json`:

- H1, a model absorber: the solute's fraction not absorbed equals the Kremser equation's to 1e-9 (engine 0.03108305002,
  Kremser 0.03108305002 at A = 1.5, 6 stages);
- H2 and H3, The ChemSep Book's ammonia absorber (2nd ed., section 1.6.7, Table 1.4; public domain; the book gives the
  problem, not a solution) with 400 mol/s of water and 8 stages, adiabatic and with 100 kW removed from stage 6;
- H4 and H5, methanol stripped from water by live steam and in a reboiled stripper (NRTL);
- H6, a lean-oil absorber at 2000 kPa (Peng-Robinson);
- H7 and H8, methanol, water and lactic acid (nonvolatile; the ideal solution, since no NRTL or UNIQUAC pair exists
  with lactic acid): a distillation, and a reboiled stripper boiled nearly dry (DRY_STAGE on the reboiler; a bottoms at
  or below the lactic acid refused).

Every profile within 1e-5 K, 1e-6 in the flows and 1e-8 in the mole fractions of the reference. On H6 the reference
first converged to the trivial solution (vapour equal to liquid on every stage); it now refuses that and starts from
Wilson's K-values, and agrees with the engine's physical solution. Converged is not validated against data: no open
absorber with measured profiles was found; the ammonia case checks the solver against the book's correlations only.

Browser check (Playwright, the preview page): the absorber project opens in the Flowsheet, its panel, results and
profile table show, switching it to a stripper with a reboiler works; at 390 px no sideways scroll; no page errors.

## For the maintainer to check

- The numbers of The ChemSep Book's Table 1.4 in `cases.json` (H2): gas 80 mol/s, ammonia 0.416, air 0.584, 20 degC,
  1 atm; alpha, beta, A, B, a, b for ammonia, water and air, as printed in J/kmol (divided by 1000 in the code).

## For the maintainer to decide (still open)

- The method refusals: refuse an equation of state with a light gas and a polar liquid (as built), or allow it with a
  warning. Water with CO2 or ammonia is refused today, until Henry's law, PSRK or Wong-Sandler is in a method. **Not
  decided** (2026-11-04): the maintainer wants a working absorber and is clarifying; the code is left as built.

## The maintainer's answers (2026-11-04)

Relayed by the coordinating session; #194 is the pull request kept.

1. **The outlets get their own names:** "gas out" (the top) and "liquid out" (the bottom), in what the person sees (the
   drawing's labels and tooltips, the stream table's "From", the block's hint, the notes). The stored port ids stay
   `distillate` and `bottoms`, since renaming them would break project files and requests.
2. (Open, above.)
3. **The wide-boiling factor of 1000** that orders the two starts is accepted.
4. **A refluxed absorber and two liquids on an absorber's stages** are postponed until needed.
