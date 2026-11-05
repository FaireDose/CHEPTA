# 2026-10-30-10: The Extraction block and its view (proposal 0015, step 8)

The second pull request of the extraction task. The first, #196 (docs/decisions/2026-10-30-08-extraction.md), added the
tie lines of water + acetic acid + ethyl acetate and the jointly fitted sets `fitted-lle-roque2018`.

## The maintainer's answers on #196 (2026-11-04, through the coordinating session)

1. **Toikka et al. 2014 stays a check only.** Its ester-rich liquid disagrees with the binary data of Grande and
   Marschoff 2005, which Roque et al. 2018 agree with.
2. **The joint sets are the default in the Extraction block only, for this ternary.** Elsewhere today's defaults stay,
   and the user can choose either set. Built as follows: the block takes, for every ternary among its components whose
   three pairs have a set of the same name `fitted-lle-…`, those sets (`jointSets` in `src/units/extraction.js`); its
   own `method.sets` replaces them.
3. **The vapour-liquid-liquid flash refusing a second liquid with the acetic acid chemical theory** is recorded as a
   known issue (src/data/known-issues.json, kind phase-split, water + acetic acid + ethyl acetate, NRTL and UNIQUAC), to
   be fixed when a flowsheet needs it. The Extraction block is not affected: a liquid-liquid stage uses only the liquid's
   activity coefficients.

## What was built

- **The engine:** `solveCascade({ phases: "LL" })`, the liquid-liquid cascade (src/units/columns/extraction.js). It
  holds N equilibrium stages at given temperatures, two liquids in countercurrent and equal activities on every stage.
  It starts from a split of the mixed feeds and the isothermal sum-rates method, then Newton's method on all equations.
  A trivial solution (the two liquids of one composition) and feeds that mix to one liquid are refused, with the
  reason.
- **The block** "extraction" (src/units/extraction.js):
  - ports: feed (stage 1), solvent (stage N), extract and raffinate;
  - specification: stages, and optionally T_K, P_kPa and its own method;
  - results: the profile of every stage, the recoveries into the extract, the solvent-to-feed ratio and the duty that
    holds the temperature;
  - the warning `METHOD_SPLIT` where the flowsheet's own sets would split an outlet into two liquids (true for the
    example's extract with the default sets).
- **The request path:** the capability `solve_extraction`, which the command line and the MCP server serve.
- **The workbench:**
  - under the Separator button: a tall vessel, with the feed and the extract at the top and the solvent and the
    raffinate at the bottom;
  - its inputs and its result rows;
  - with the block selected, the ternary diagram under the drawing (binodal and tie lines of the block's method, every
    stage's tie line, the paths of both liquids, the feed and the solvent) and the profile table;
  - project format 6 holds it.
- **The Column block** with phases "LL" now points to the Extraction block.
- **Example:** examples/extraction-acetic-acid.chepta.json.

## Checks

- **An independent implementation:** validation/python/reference_extraction.py, six cascades of 1 to 6 stages, NRTL
  and UNIQUAC. Every stage's flows agree within 1e-7.
- **The published worked example** of Glatz and Parker (AIChE 2004, paper 232a, free to read in the meeting's
  proceedings): the Kremser equation with m = 1.06 and S/F = 1.24.
  - On an algebraic stand-in with a straight equilibrium line (not a substance), the engine gives the Kremser equation
    to 1e-6.
  - 10 and 11 stages bracket the paper's 0.26 % at 10.6 stages: 0.297 % and 0.240 %.
  - 13 stages with pure solvent give 0.0993 % (the paper: 0.1 %).
- **A browser check** (Playwright, light and dark): the example opened from its file, the block selected, the ternary
  and the table drawn, no console errors, no horizontal scroll at 390 px.

The open textbook found (Lamm and Jarboe, LibreTexts, CC BY-NC 4.0) states extraction problems without printed
answers or equilibrium data, so it could not serve as a check.

## For the maintainer to decide

- **Isothermal only.** An adiabatic cascade (stage temperatures from an energy balance) is not built. Is it wanted?
- **The ternary view** draws mole fractions. Should it also offer mass fractions, as the Ternary view does?
- **The METHOD_SPLIT warning** asks the user to choose the same sets in the flowsheet's thermo. Should the flowsheet
  take the joint sets by itself when it holds an Extraction block of that ternary? (Answer 2 says: in the block only.)
