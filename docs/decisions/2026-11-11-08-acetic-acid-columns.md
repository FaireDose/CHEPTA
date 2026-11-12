# 2026-11-11-08: Columns with a dimerizing acid in the vapour (acetic acid)

The task (the coordinator, 2026-11-11): CHEPTA-Lab lists as a blocker that acetic acid's dimerization model does not
work in columns. Find out what happens, and make the rigorous column (and the shortcut, if simple) handle the
dimerizing vapour, with the design specifications of PR #227. Written on 2026-11-11 and 2026-11-12.

## What happened before (run on main, 2026-11-11)

Water + acetic acid, 50 + 50 kmol/h, saturated liquid, 101.325 kPa; NRTL with an ideal-gas vapour and the chemical
theory for acetic acid, the method docs/METHOD_SELECTION.md recommends (rule 3; `info.advice` empty).

| Column | Before |
|---|---|
| Shortcut (recoveries 0.95, 1.3 times the minimum reflux) | **Solved, with the dimers.** Its relative volatilities come from bubble points (`sys.equilibrium`, which has the chemical theory) and its duties from `sys.enthalpy` (which has the dimers' enthalpy): 21 stages, reflux ratio 2.638 (minimum 2.029), relative volatility 1.767 (top), 1.845 (feed), 1.822 (bottom). Nothing was wrong; nothing was changed but a note. |
| Rigorous (20 stages, reflux ratio 3, distillate 50 kmol/h) | **Refused**, `NOT_AVAILABLE`: "the rigorous column does not handle the chemical theory of dimerizing acids in the vapour yet; build the system with association: false, or use the shortcut column." |
| Rigorous with the column's own method `{ association: false }` | Refused, `BAD_INPUT`: "method: unknown key association" (the block's method keys are model, vapour, sets, prefer, mixing). So from a flowsheet there was no way to a rigorous column with acetic acid. |

The reason: the stage solver takes K-values `ln K_i(x, y, T, P)` from `sys.lnKValues`, which a system with the
chemical theory does not have (the flash uses the liquid's bubble pressure instead).

## What was built

- **The stage K-values of the chemical theory** (`sys.lnKAssociation`, `src/thermo/system.js`):
  ln K_i = ln(gamma_i f_i^0 / (phi_i P)). The vapour is an ideal gas of monomers and dimers (`src/thermo/vapour.js`,
  no cross-dimers), so a component's fugacity is the partial pressure of its monomer: for the apparent vapour y at T
  and P, with xi_i dimers of acid i per apparent mole and N = 1 - sum xi true moles (`dimerSplit`),
  phi_i = (y_i - 2 xi_i) / (y_i N) for an acid and 1 / N for the others. The pure liquid's fugacity f_i^0 is the
  monomer's pressure in the acid's saturated vapour, and the vapour pressure for the others. These are the fugacities
  the bubble point (`sys.equilibrium`) and the enthalpy routines (`sys.phase(...).lnFugacity`) already use: nothing
  new in the model, and no new number. The dimerization constants are the components' own records (acetic acid:
  log10 K = -10.4205 + 3166/T, 1/mmHg, as used by Schmid et al. 2007; formic acid: Chao and Zwolinski 1978).
- **`sys.lnKValues` stays null** with the chemical theory, so the flash, the three-phase flash and the two-liquid
  column keep their paths unchanged. Only the column's adapter (`cascadeThermo`, `engine.js`) takes the new function.
- **The stage's variables are apparent**: x and y count a dimer as two molecules, the flows are apparent moles, as
  everywhere else in CHEPTA. The Jacobian is by finite differences per stage, so K-values that depend on y need
  nothing more (an equation of state's do too).
- **The energy balance** uses `sys.enthalpy`, unchanged: the vapour's enthalpy holds xi_i times the dimerization
  enthalpy (-R ln(10) B: -60.6 kJ per mol of acetic acid dimer, from the record's B), the liquid's is anchored to the
  dimerized saturated vapour. Every stage's balance closes to the engine's tolerances (TOLERANCES, 1e-10 scaled).
- **The design specifications** (purity, recovery; PR #227) sit outside the stage solver and work unchanged.
- **The Column block** says so in a note (rigorous and shortcut): "Vapour by the chemical theory for Acetic acid:
  monomers and dimers in equilibrium on every stage ...; the vapour's enthalpy holds the enthalpy of dimerization.
  Cross-dimers between two acids are not modelled."
- **Still refused, with the reason**: two liquids on the stages (phases "VLL", a decanter) with the chemical theory
  (`NOT_AVAILABLE`; the message now names the vapour model and says the three-phase flash with it is not built); a
  column that does not converge (`NO_CONVERGENCE`, with what it tried and the residuals); a specification no column
  meets (`OUT_OF_RANGE`, with what the column reaches).

## What other simulators do (docs/METHOD_SELECTION.md, "When in doubt")

- **ChemSep** (The ChemSep Book, Kooijman and Taylor, 2nd edition, 2006, public domain,
  http://www.chemsep.org/downloads/docs/book2.pdf, section 10.1.5, pp. 134-135; read 2026-11-12) offers for its
  columns, among the equations of state of the vapour: "Hayden-O'Connell ... a method of predicting the second virial
  coefficient for multicomponent vapor mixtures ... You must input the association parameters", and "Chemical theory
  This is an extension of the Hayden O'Connell virial model that takes into account the association between molecules
  ... Since the mole fractions are a function of the association, an iterative method (here Newton's method) must be
  used to obtain them". So a column simulator with open documentation offers the vapour's association on the stages.
- **DWSIM** (Property Packages Guide, https://dwsim.org/tutorials/en/reference/property-packages-guide.html, read
  2026-11-12): the table "Polar Mixtures" has the row "Acid/water | NRTL or UNIQUAC | NRTL is the safer default"; the
  page names no vapour-association model, and its class library
  (https://dwsim.org/api_help/html/N_DWSIM_Thermodynamics_PropertyPackages.htm, read 2026-11-12) lists no
  Hayden-O'Connell or chemical-theory package. So DWSIM runs acid columns with NRTL and leaves the vapour to the user.
- **In the literature**: Pirola et al. (2013, below) simulate the column with PRO/II and Hayden-O'Connell, "for taking
  into account the acetic acid association in vapor phase".
- **CHEPTA**: offered, with the chemical theory on every stage. It differs from DWSIM because its NRTL pairs with
  acetic acid were fitted with the chemical theory, so leaving the dimers out is not consistent with the parameters
  (case K1 below: 0.960 against 0.869).

## Validation

Cases: `validation/data/columns/acid/cases.json`; reference: `validation/python/reference_mesh_acid.py`; fixture:
`validation/fixtures/columns_acid.json`; tests: `test/columns-acid.test.js` (13).

- **The independent reference** is the MESH reference of `reference_mesh.py` with its own thermodynamics: the
  vapour's species from the liquid (p_M = x gamma p_M,sat, p_D = K p_M^2, a stage at equilibrium when the true
  pressure is the column's), where the engine takes the fugacity coefficients of the apparent vapour. Two routes that
  agree only at the solution. For the design specifications it uses `reference_mesh_specifications.py` (the
  specifications among its Newton equations), where the engine has an outer loop.

  | Case | Engine against reference (largest difference on any stage) |
  |---|---|
  | K1 water + acetic acid, 20 stages, R = 3, D = 50 mol/s | T 2e-11 K, x 1e-12, flows 8e-12 relative, duties 1e-12 |
  | K2 the published column (8 stages, R = 5.7) | T 4e-12 K, x 2e-13, duties 2e-12 |
  | K3 ethanol + water + acetic acid, partial condenser | T 8e-11 K, x 6e-12, duties 4e-11 |
  | K4 the published column, two purities (10 stages) | reflux ratio 5.2459 both, within 2e-5 (the engine's tolerance on a specification) |
  | K5 a purity and a recovery (K1's column) | reflux ratio 3.5696 both, within 2e-5 |

- **What ignoring the dimers changes** (K1, same column, `association: false` on purpose; the engine and the
  reference agree on it too): water in the distillate 0.869 instead of 0.960. Not a small correction.
- **Measured data**: the column's adapter (its bubble temperature and K-values) against the vapour-liquid equilibria
  of water + acetic acid at 101.3 kPa in the ThermoML Archive: Chang et al. 2005 (18 points) and Calvar et al. 2005
  (24 points), within the fit quality the pair states in `src/data/binaries.json` (AAD 0.24 K and 0.0085 in y;
  the check set 0.45 K and 0.0327). No number was added or changed.
- **An open worked example**: the direct distillation column (T1, without entrainer) of C. Pirola, F. Galli,
  C. L. Bianchi, G. Carvoli, Chem. Eng. Trans. 32 (2013) 1897-1902, DOI 10.3303/CET1332317, free to read at
  https://www.aidic.it/cet/13/32/317.pdf (section 4 and Table 3, p. 1901; read 2026-11-11). A simulation (PRO/II,
  Lyngby modified UNIFAC with Hayden-O'Connell), not a measurement: an agreement between two property methods, kept
  apart from the numerical tolerances.

  | | Published | CHEPTA, 8 stages in all (best feed stage, 3) | CHEPTA, 8 stages between a condenser and a reboiler (feed stage 3) |
  |---|---|---|---|
  | x(water), distillate, at R = 5.7 and D = 17.7 kmol/h | 0.74 | 0.726 | 0.742 |
  | x(water), residue | 0.02 | 0.051 | 0.020 |
  | reflux ratio for 0.74 and 0.02 | 5.7 | not computed | 5.25 |

  The article does not state the feed stage, the pressure, the condenser, whether its 8 stages count the condenser
  and the reboiler, and gives two feed states (the boiling point in the text, 65 degC in the table's caption); the
  case file lists these under `not_stated`.
- **No open measured column** of water + acetic acid alone was found (searched 2026-11-11: the same group's
  micro-pilot runs, Pirola et al. 2013 and Ind. Eng. Chem. Res. 2014 (open copy at re.public.polimi.it), are all with
  p-xylene, which needs two liquids on the stages).
- The existing column benchmarks pass unchanged.

## Limits, stated

- **Two liquids with the chemical theory** (phases "VLL", a decanter, the three-phase flash): refused, as before.
  Acetic acid dehydration with an entrainer (p-xylene, the acetates) needs it; it is the other half of CHEPTA-Lab's
  blocker and is not in this pull request.
- **Two acids in one mixture** (acetic + formic acid): the engine's K-values handle them (no cross-dimers, as the
  bubble point), but the Python reference's enthalpy takes one acid, and CHEPTA has no NRTL pair for water + formic
  acid or acetic + formic acid, so no case tests it.
- **Absorbers and strippers** with a dimerizing acid go through the same adapter; no case tests them.
- **The association of the liquid** is in the activity coefficients, as fitted; nothing changes there.
- The model's quality is the pair's: near the water end the measured sets scatter (the pair's known point-test
  failure), and the tangent pinch there makes a column's stage count sensitive to it.

## To check against the sources (the maintainer)

1. Pirola et al. 2013, p. 1901: 8 stages; 26.62 kmol/h; water 0.74 in the distillate and 0.02 in the residue; reflux
   ratio 5.7; Table 3, column T1: distillate 17.7 kmol/h with x(AcAc) 0.26, residue 8.9 kmol/h with x(W) 0.02.
   Transcribed into `validation/data/columns/acid/cases.json` (cases K2 and K4, `published`).
2. The ChemSep Book, section 10.1.5, pp. 134-135: the two quotations above.
3. DWSIM's Property Packages Guide: the row "Acid/water | NRTL or UNIQUAC | NRTL is the safer default".
4. The licence line of Chemical Engineering Transactions in `src/data/LICENSES.md` ("free to read on the publisher's
   site; copyright AIDIC Servizi").

## To decide (the maintainer), with a recommendation each

1. **The agreement limits with the published column**: 0.05 in mole fraction on the products (8 stages in all), 25 %
   on the reflux ratio (as case S4 of the specifications). Recommended: keep; they are this project's choices.
2. **Which reading of "8 stages" the case K4 takes**: 10 stages (8 between a condenser and a reboiler), because that
   reading gives the published products within 0.003 at the published reflux ratio. Recommended: keep, stated as a
   reading; the article does not say.
3. **A known issue for acetic acid columns without the chemical theory?** A system built with `association: false`
   still solves, and gives another column (0.869 against 0.960). Recommended: no known issue (the default is the
   chemical theory, and a program must ask for the other on purpose); a warning in the column's notes could be added.
4. **What comes next for CHEPTA-Lab's blocker**: the three-phase flash and two liquids on the stages with the
   chemical theory (the entrainer columns). Recommended: next, as its own proposal step: it needs
   `lnKAssociation` in the three-phase flash and the two-liquid adapter, and a reference with it.
5. **The column's own method cannot switch the chemical theory off** (`method: { association }` is refused as an
   unknown key). Recommended: leave it refused; with the chemical theory working there is no reason to switch it off.
