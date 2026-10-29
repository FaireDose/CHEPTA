# 2026-10-29-08: Proposal 0015, M2a (W7): the complete benchmark column and the further cases

The maintainer, 2026-10-29: W7 prepares milestone M2a's cases ("one complete benchmark") ahead of W2's rigorous
column. Written against contracts v1 (ARCHITECTURE.md, "The request path and the contracts of proposal 0015").

## What was done

- **The complete benchmark, B2:** the benzene + toluene column of *The ChemSep Book*, 2nd edition (Kooijman and
  Taylor 2006, **public domain**), section 1.2, with its published results (section 1.3, Figures 1.18 to 1.21,
  pp. 19-20): 10 stages, 1.1 atm, saturated-liquid feed of 11.7471 mol/s on stage 5, reflux ratio 2, bottoms
  5.874 mol/s. The setup and every published number are in `validation/data/columns/B2-chemsep-benzene-toluene.json`,
  each with its figure and page. Source `kooijman-taylor-2006-chemsep-book` in src/data/sources.json and LICENSES.md.
- **Two comparisons, kept apart:** the engine against `reference_mesh.py` on CHEPTA's method (NRTL, ChemSep set,
  ideal-gas vapour, energy balances; tolerances as in M1), and the engine against the published profile, which comes
  from another property method (UNIFAC, ChemSep's Antoine equations, constant molar overflow): within 0.6 K and 0.01
  in mole fraction. CHEPTA's method is within 0.37 K and 0.0059 of the published stages; with constant molar overflow
  0.39 K and 0.0056, so the difference is the K-values (CHEPTA's K of benzene 0.6-1.0 % above the published y/x).
- **A transcription check:** the published numbers agree with each other to their rounding (balances, ratios, the
  operating lines). The book's K column does not match its own y/x (up to 2.8 % at the top); x, y, T and the flows are
  compared, K is not.
- **Further cases:** A4 two feeds (McCabe-Thiele with three operating lines, exact); B3 acetone + methanol, the
  distillate 0.0012 below the model's azeotrope (hard: a pinch, 12 Newton steps); F1 1-butanol + water, a second
  liquid on stages 1 and 2 (expected refusal PHASE_SPLIT); E4 the B1 column with an iteration limit of 1 (expected
  not_converged); P1 the performance benchmark (methanol, ethanol, 1-propanol, water; 40 stages; cold and warm start;
  the budget is W9's).
- **The reference:** several feeds, saturated feeds of real mixtures (q = 1 or 0), UNIQUAC, a constant-molar-overflow
  variant (only for B2's comparison), the phase-stability check by the tangent-plane distance, a Jacobian built by
  groups of stages and a shorter bubble-point start (the M1 profiles are unchanged to the last digit).
- `test/benchmark-columns.test.js` passes now; comparing the engine with the cases is W2's.

## Choices made here, for the maintainer to confirm or change

- **B2's method:** NRTL with an ideal-gas vapour by rule 6 of METHOD_SELECTION.md (reduced temperature 0.62-0.67,
  below 0.75), although benzene and toluene are nonpolar (rule 2 would give Peng-Robinson). For information: the
  UNIQUAC ChemSep set gives up to 0.94 K and 0.016 from the published stages (with constant molar overflow).
- **The agreement tolerances, 0.6 K and 0.01,** chosen after the comparison (about 1.6 times the differences found).
- **F1:** the ChemSep NRTL set of 1-butanol + water, as the liquid-liquid fits are W1's (M2b).
- **E4:** an iteration limit stands in for a column without a solution, as no such open case passes the input checks.

## To check

Every number of the `published` block of B2 against the book (http://www.chemsep.org/downloads/docs/book2.pdf):
Figure 1.19 on p. 19 (stage temperatures, liquid and vapour flows, RR = 2, BR = 2.99954, products 5.8731 and
5.874 mol/s, pressure 1.11458 bar), Figure 1.20 on p. 20 (x, y and K of benzene, ten stages), Figure 1.21 on p. 20
(feed temperature 95.78 degC, component flows and mole fractions of the products), the feed of 11.7471 mol/s on
p. 14 and the bottoms specification of 5.874 mol/s on p. 17. Also: the measured acetone + methanol azeotrope used
for information (x = 0.8, 55.7 degC, validation/data/azeotropes_101kPa.json).
