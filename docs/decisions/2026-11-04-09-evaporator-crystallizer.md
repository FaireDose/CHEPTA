# 2026-11-04-09: Proposal 0015, M3, step 10 (W3): the Evaporator block

The coordinating session, for the maintainer: build step 10 of proposal 0015 (accepted 2026-10-29), the evaporator and
the crystallizer of Part I, section 4. The two together were too large for one reviewable pull request, so this one is
the **evaporator**; the crystallizer follows in its own pull request (decision file 2026-11-04-11-crystallizer.md). The
solid-liquid separator and the dryer are left out, as the maintainer decided on 2026-10-29 (answer 4: the component
separator does that separation until a real model comes). Written against contracts v1. Model page:
[docs/models/evaporator.md](../models/evaporator.md).

## What was done

- **Engine** (`src/units/evaporator.js`): N effects in forward feed (1 to 10); each a P-H flash of the liquid of the
  one before at its pressure, the first heated by saturated steam (IAPWS-IF97), each next one by the vapour of the one
  before condensed totally at its pressure. Given: the effects' pressures (falling), the steam's pressure or
  temperature, and the steam flow or the product's mass fraction of one component (then the steam is found by Brent's
  method). Results: the steam flow, the water evaporated, the steam economy, and per effect the temperature, duty,
  vapour, the driving ΔT and the boiling-point rise (the boiling temperature minus the bubble temperature of the
  effect's own vapour condensed at its pressure); with U, each effect's area (A = Q / (U ΔT)). Outlets: product, vapour
  (the last effect's), condensate (the condensed vapours of the effects before the last). Refused with the reason:
  pressures that do not fall, an effect its heating medium cannot heat, an unreachable or already-met concentration.
- **Request path:** the capability `solve_evaporator` (CHEPTA.run, `chepta request`, MCP tool `solve_evaporator`);
  project format 6 holds the evaporator block (`docs/schema/project-6.json`).
- **Workbench:** Evaporator in the **Separator** menu, with the flash drum, the component separator and the membrane;
  its form (number of effects and their pressures, the steam, steam flow or product concentration, an optional U) and
  its results (steam, water evaporated, economy, and per effect T, P, heat, ΔT, boiling-point rise and area). Checked
  in Chromium (Playwright) with the example below.
- **Independent reference** `validation/python/reference_evaporator.py` (scipy, equation-oriented, the ideal solution
  with the records' enthalpies, the steam from the `iapws` library; it shares no code with the engine), fixture
  `validation/fixtures/evaporator.json`, four cases: the engine agrees within 1e-7 relative (steam, economy, duties,
  vapours) and 1e-6 K (temperatures, boiling-point rises).
- **The same chain of blocks** (the proposal's check "an evaporator against the same chain of flashes"): two flash
  drums and a condenser joined by energy streams give the evaporator's numbers within 1e-9.
- **Worked example:** M. Subramanian, *Heat Transfer: Evaporation*, lecture notes, SSN College of Engineering (2019),
  free to read on the author's site, Example 1 (slides 16-20), single effect: steam 27674 kg/h against the printed
  27708.4 (−0.12 %) and 26860 against 26786.1 (+0.28 %), economy 0.867 and 0.894 against 0.87 and 0.896, area 85.1
  and 82.6 m² against 83.5 and 80.7 (+2.0 and +2.4 %: the example neglects the boiling-point rise, here 1.8 K). The
  example names no solid: citric acid stands in for its "solids" (AGENTS.md rule 8: the stand-in is stated in the test,
  the reference and the model page). No open worked example of several effects with full numbers was found (the
  slides' triple-effect problems are exercises without answers; the NZIFST copy of Earle's *Unit Operations in Food
  Processing* did not answer on 2026-11-04, and its examples neglect the sensible heat and the boiling-point rise).
- **Example** `examples/evaporator-citric-acid.chepta.json`: 30000 kg/h of 10 % citric acid to 50 % in three effects
  at 70, 35 and 12.35 kPa, steam at 200 kPa, U 3000, 2000, 1200 W/(m² K) (the example's own choices), Modified UNIFAC
  2.0: 11697 kg/h of steam, economy 2.05.

## Found on the way

- **Modified UNIFAC 2.0 and the sugars:** for water with glucose, fructose, xylose, sorbitol, xylitol and erythritol
  it gives water an activity coefficient above 1 (1.06 in 50 % glucose at 323 K) and predicts a liquid-liquid split of
  water + glucose near 55 % by mass (the P-H flash then stops with "the result jumps"). A concentrated sugar solution
  does not split. For the acids (citric, malic, succinic, lactic, glycolic) the coefficient stays near 1. So the
  evaporator of a sugar solution has no usable property method in CHEPTA today: the ideal solution works, without
  the real boiling-point rise; fitted water + sugar pairs (water activity or boiling-point data from open sources)
  would fix it.
- A flash of nearly pure water (a nonvolatile trace of 1e-24) inside the two-phase region fails with "the result
  jumps"; the block avoids it by mixing the condensates at the first effect's pressure, where they stay liquid. The
  engine's flash is not changed here.

## For the maintainer to check

- Subramanian 2019, slides 16-20: the inputs and the printed results in `validation/python/reference_evaporator.py`
  (`CASES`), in `test/evaporator.test.js` and in `docs/models/evaporator.md`.
- The steam's latent heat at 0.2 MPa: 2201.6 kJ/kg from IAPWS-IF97, the example prints 2202.

## For the maintainer to decide

1. **A block or a template?** Answer 4 of proposal 0015 says "the evaporator is a template of heater and flash
   blocks"; the coordinating session asked for a block with the duties, the economy and the boiling-point rise. This
   pull request builds the block, whose engine is exactly that chain (the test places the same chain as blocks and gets
   the same numbers). Keep the block, or replace it by a template that places the heater and flash blocks?
2. **The condensate**: one outlet, mixed at the first effect's pressure (it stays liquid there), or each effect's
   condensate flashed from chest to chest at the lower pressures (more outlets, closer to a plant)?
3. **Feed arrangements**: forward feed only now; backward and mixed feed, and the equal-area design (the pressures
   found for equal areas), later or not at all?
4. **Sugar solutions**: look for open water-activity or boiling-point data of glucose and sucrose solutions to fit
   NRTL pairs (sucrose is not a CHEPTA component yet: it would be proposed for addition, rule 8), or leave the sugars on
   the ideal solution with a note?

## The maintainer's answers (2026-11-05)

Relayed by the coordinating session:

1. **Keep the block.**
2. **One condensate outlet** for now.
3. **Backward or mixed feed and equal areas:** later, when needed.
4. **Sugars:** a data task: NRTL pairs for water + glucose and water + sucrose, fitted to open data (sucrose to be
   proposed for addition first, AGENTS.md rule 8). Until then the ideal solution, with a warning: the evaporator adds a
   note for a solution of glucose, fructose, xylose, sorbitol, xylitol, erythritol or sucrose (`SUGARS` in
   `src/units/evaporator.js`), saying that the ideal solution gives the boiling-point rise without activity
   coefficients, or, with Modified UNIFAC 2.0, that it does not describe sugar solutions and the ideal solution should
   be used (test/evaporator.test.js).

**Still open:** the sugar data task (not started).
