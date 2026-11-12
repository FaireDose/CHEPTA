# 2026-11-12-02: Vapour + two liquids with acetic acid's chemical theory

The task (the coordinator, 2026-11-12): the next step decided in docs/decisions/2026-11-11-08-acetic-acid-columns.md
("Decided", item 4): two liquids with the chemical theory of a dimerizing acid, in the three-phase flash, the heater
and the rigorous column's stages. CHEPTA-Lab's first request (its ethyl acetate plant, Piotrowski and Kubica 2021) and,
if it fits, its second: two liquids on the stages of an absorber. Both are in this pull request.

## What happened before (main, 2026-11-12)

- The three-phase flash refused: `PHASE_SPLIT` "... the three-phase flash needs an activity model without the acid
  chemical theory." So did every flash, heater or P-H/P-VF search that met a second liquid with acetic acid present.
- The column refused two liquids on the stages with it: `NOT_AVAILABLE` "... this system's vapour follows the chemical
  theory (dimerization) for Acetic acid (the three-phase flash with it is not built)".
- An absorber or a stripper refused phases "VLL" with any method: `NOT_AVAILABLE` "an absorber holds a vapour and one
  liquid ...; two liquids on its stages ... are not built yet."

The reason: the three-phase iteration takes the vapour's K-values from `sys.lnKValues`, which a system with the
chemical theory does not have. Decision 2026-11-11-08 built `sys.lnKAssociation` (ln K_i = ln(gamma_i f_i^0 /
(phi_i P)), the fugacity coefficients of the apparent vapour of monomers and dimers) for the column; nothing used it in
the flash.

## What was built

- **The three-phase flash** (`src/equilibrium/flash.js`): the vapour's K-values are `sys.lnKValues`, or
  `sys.lnKAssociation` with the chemical theory (`vapourLnK`), in the successive substitution (`splitThree`), its
  Newton steps (`newtonThree`), the vapour's stability test (`vapourTangentPlane`) and the search for two liquids in
  the P-H, P-VF and T-VF flashes (`canThree`). The two liquids' equilibrium, x' gamma(x') = x'' gamma(x''), does not
  involve the vapour, so nothing else changes. No new equation and no new number: the K-values are those the columns
  already use (decision 2026-11-11-08), from the components' own dimerization records.
- **The heater** works through vapour + two liquids with it (it is the P-H and P-VF flash).
- **Two liquids on a column's stages** (`src/units/columns/two-liquids.js`): the stage's adapter accepts
  `sys.lnKAssociation`. Its bubble temperature of a liquid that splits iterates the vapour y to y = K x at each trial T
  (the K-values depend on y with the dimers).
- **Absorbers and strippers with two liquids** (`src/units/columns/column.js`): phases "VLL" is accepted and solved by
  the same engine and stage equations as distillation (milestone M2b's). Phases "LL" on an absorber stays refused
  (`NOT_AVAILABLE`, pointing to the Extraction block). With an equation of state two liquids stay refused, as before.
- Still refused, with the reason: a third liquid; two liquids with an equation of state; two liquids with Wilson; a
  system that gives no K-values for its vapour.

## What other simulators do (docs/METHOD_SELECTION.md, "When in doubt")

C. Pirola, F. Galli, C. L. Bianchi, G. Carvoli, Chem. Eng. Trans. 32 (2013) 1897-1902, DOI 10.3303/CET1332317, free to
read at https://www.aidic.it/cet/13/32/317.pdf (read 2026-11-12), section 2: "The phase equilibria (vapor-liquid and
vapor-liquid-liquid) of the ternary system water/acetic acid/p-xylene were analysed ... The simulations obtained by
SIMSCI PRO II software adopting the Lyngby modified UNIFAC equation to calculate the activity coefficients and the
Hayden-O'Connel correlation to take into account the acetic acid association gave very satisfactory results." So a
commercial simulator computes acid systems with two liquids with the vapour's association. CHEPTA does the same with
its chemical theory. The row is added to docs/METHOD_SELECTION.md.

## Validation

Cases: `validation/data/columns/acid/vlle-cases.json`; reference: `validation/python/reference_vlle_acid.py`; fixture:
`validation/fixtures/vlle_acid.json`; tests: `test/vlle-acid.test.js` (15, and the heater's).

- **The independent reference** solves the three-phase flash from the liquid side: the unknowns x', x'', the phase
  fractions (or T), the equations the component balances, x' gamma(x') = x'' gamma(x''), and P_true(x') = P with the
  vapour's species from liquid x' (p_M = x gamma p_M,sat, p_D = K p_M^2). The engine iterates on the fugacity
  coefficients of the apparent vapour instead: two routes that meet only at the solution. The columns are
  reference_mesh.Column, reference_mesh_vll.DecanterColumn and reference_mesh_absorber.Column with that thermodynamics
  (reference_mesh_acid.ActivityDimer with reference_mesh_vll.TwoLiquids).

  | Case | Engine against reference |
  |---|---|
  | F1-F6: water + acetic acid + ethyl acetate, NRTL: two liquids (340 K), vapour + two liquids (347, 348, 348.5 K), vapour + liquid (355 K), P-VF (VF 0.3) | T within 1e-6 K, phase fractions and mole fractions within 1e-7 (largest seen: 3e-10 K) |
  | C1: distillation, 12 stages, R 2, D 40 mol/s; two liquids on stage 1 | T 1e-5 K, x 1e-7, flows 1e-6 relative |
  | C2: absorber, 6 stages, two-liquid solvent on the top, gas on the bottom; two liquids on every stage | the same |
  | C3: distillation with a decanter, 10 stages, the water-rich liquid refluxed | the same |

- **What ignoring the dimers changes** (association: false on purpose; the reference agrees on it too): C1's distillate
  holds 0.0165 acetic acid with the dimers, 0.0532 without; C2's top gas 0.0208 mol/s of acid with them, 0.0532 without;
  at F2 the vapour holds 0.0085 acid with them, more than 0.7 times less than without.
- **Measured tie lines** (water + acetic acid + ethyl acetate; Roque et al. 2018 and Toikka et al. 2014, ThermoML
  Archive, already in `validation/data/lle/`): with the jointly fitted sets `fitted-lle-roque2018`, the flash with the
  chemical theory reproduces the largest deviations those sets state (0.0587 against Roque, 0.1877 against Toikka). The
  default sets (fitted to binary data) miss these tie lines by more: up to 0.16 against Roque and 0.30 against Toikka,
  near the plait point (computed 2026-11-12; METHOD_SELECTION.md already says to use the joint sets for this ternary).
- **Measured vapour-liquid-liquid equilibria of an acid system**: cyclohexane + acetic acid + water at 101.3 kPa, Liu,
  Cheng, Mu, Li, Tan, Fluid Phase Equilib. 350 (2013) 32-36, DOI 10.1016/j.fluid.2013.04.011, 14 points, public in the
  ThermoML Archive (new file `validation/data/lle/cyclohexane_acetic-acid_water_vlle_liu2013.json`). CHEPTA has no
  fitted acetic acid + cyclohexane pair, so the method is Modified UNIFAC 2.0 (predicted). For the 13 points with acid,
  the bubble point at 101.3 kPa of the mid-point of the two measured liquids: vapour + two liquids at every point; the
  three-phase temperature 1.0 to 7.6 K above the measured (mean 4.28 K; 3.27 K without the dimers); the vapour within
  0.040 in mole fraction (0.041 without). These are the predicted model's deviations, not the flash's: the flash meets
  the reference to 1e-7.
- **Searched for measured VLLE of water + acetic acid + ethyl acetate or n-butyl acetate** (the pairs CHEPTA has): the
  ThermoML Archive's search interface answered 503 all day (2026-11-12); OpenAlex searches found sets with other esters
  (n-propyl, isobutyl, sec-butyl, isopropenyl acetate: Zhang et al. 2011, Chai et al. 2014, Wang et al. 2012) whose
  components or pairs CHEPTA does not have, and Calvar et al. 2005 (quaternary, homogeneous) and Lladosa et al. 2008
  (no ternary set). Open thesis and article copies of a heterogeneous ethyl acetate set were not found.
- The existing flash, three-phase and column tests pass unchanged, except those that asserted the refusals now built
  (below).

## Tests changed, and why

The behaviour they checked was a refusal that this pull request removes by decision 2026-11-11-08, item 4:

- `test/columns-acid.test.js`: phases "VLL" with acetic acid was refused; now it solves, finds one liquid on every stage
  (water + acetic acid is miscible) and gives the column of phases "VL".
- `test/three-phase.test.js`: the refusal for a system without vapour K-values stays; its message no longer names the
  chemical theory (which has them now).
- `test/columns-absorber.test.js`: an absorber with phases "VLL" was "unsupported" as not built; the case there is
  Peng-Robinson, so it is now refused for that reason; phases "LL" stays "unsupported".
- `test/api.test.js`, `test/cli.test.js`: they used "two liquids on a stripper" as their example of a capability not
  built (before it, a purity, and the rigorous mode); now phases "LL" on a stripper.

## Limits, stated

- **Robustness of decanter columns**: with the dimers, decanter columns of 10 and 15 stages converged; one of 12
  stages (feed 6, D 20 kmol/h) stopped at a residual of 0.0015 after the solver's 12 iterations, where the same column
  without the dimers converges. The refusal is `NO_CONVERGENCE` with what was tried. Decanter columns of this ternary
  are hard without the dimers too (three of four specifications tried did not converge either way).
- **Cooled absorbers** (stage duties that condense much of the gas) did not converge in the cases tried, with or
  without the dimers, and with phases "VL" too: a solver question, not this pull request's.
- **CHEPTA-Lab's own case** (`cases/ethyl-acetate-piotrowski-2021/README.md` of PR #14) could not be read from this
  session (the repository is not attached to it), so its column 5 was not run here.
- **Two acids** (cross-dimers) are not modelled, as before.

## To check against the sources (the maintainer)

1. Liu et al. 2013, ThermoML record set 1: the 14 rows of `validation/data/lle/cyclohexane_acetic-acid_water_vlle_liu2013.json`
   (columns as its `_about` says), against https://trc.nist.gov/ThermoML/10.1016/j.fluid.2013.04.011.html.
2. Pirola et al. 2013, section 2: the quotation above.

## To decide (the maintainer), with a recommendation each

1. **The test against Liu et al. 2013 pins the predicted model's deviations** (mean 4.28 K, 1.0-7.6 K, 0.040 in y).
   Recommended: keep it as a regression of stated figures; it says nothing about the flash beyond the reference.
2. **A pair acetic acid + cyclohexane fitted to open data**, so that Liu et al. 2013 tests a fitted model.
   Recommended: later, as a data task (it is not needed by CHEPTA-Lab's ethyl acetate plant).
3. **Measured VLLE of water + acetic acid + ethyl acetate** for the plant's own ternary: search the ThermoML Archive
   again when its search answers. Recommended: yes, as a data task; until then the joint tie-line sets and the
   reference stand.
4. **Absorbers and strippers with two liquids, built here for every activity model** (not only with the dimers).
   Recommended: keep (the stage equations are milestone M2b's, the reference agrees).
