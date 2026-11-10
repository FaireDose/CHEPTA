# 2026-11-06-01: a temperature-dependent k_ij (a + b/T) for CO2 + methanol and CO2 + water

## What the maintainer decided (2026-11-06, relayed by the coordinating session)

Option (b) of docs/decisions/2026-11-05-03-kij-followup.md, "the lean way": the temperature-dependent k_ij,
k = a + b/T, in the engine (PR and SRK, kij.json, My data). CO2 + methanol and CO2 + water are written with a
fit-quality known issue that states the measured errors. The CO2 + water refusal is lifted for the temperature-dependent
set only; ChemSep's constant set stays not usable. Record that a temperature-dependent k_ij is established practice
(Privat and Jaubert's review; the PPR78 model), and check whether DWSIM takes one. Proposal 0018 (MHV1) follows in its
own pull request.

## What was built

- **The engine** (`src/thermo/eos/cubic.js`): the van der Waals mixing rule with k_ij(T) = a_ij + b_ij / T. The
  terms df/dT = b/T² and d²f/dT² = -2b/T³ enter da/dT and d²a/dT², so the residual enthalpy, entropy and heat
  capacity carry the temperature dependence. `kij.json` takes `kij_b_K` (b, in K) beside `kij` (a); so do My data
  (`pairs`: `PR: { kij, kij_b_K }`) and `library.add`. Messages and the workbench show "a - b K / T".
- **The independent check**: `validation/python/reference_eos.py` takes b too, and takes the residual enthalpy by a
  numerical temperature derivative of the residual Helmholtz energy. `eos_check_literature.py` records its bubble
  pressures and liquid residual enthalpies at four points of each set; the engine agrees within 0.5 % in P and
  1e-4 in h_R (`test/eos-high-pressure.test.js`). A second test checks the engine's h_R and cp_R against numerical
  derivatives of its own ln phi.
- **The sets** (`validation/fit_kij_high_pressure.mjs`, `WARNED_T`; merged by `eos_fit_kij.py --merge-only`): the
  fitted set is the default, and the ChemSep set is kept as the alternative `chemsep`. For CO2 + water, ChemSep's
  set keeps its `not_usable` mark, so `sets: { "carbon-dioxide+water": "chemsep" }` is refused in a liquid as
  before.

  | Pair, model | a | b, K | P: AAD / max % | solubility: AAD / max % | y: AAD | no bubble pressure |
  |---|---|---|---|---|---|---|
  | CO2 + methanol, PR | 0.1883 | -40.62 | 7.1 / 30 | 13.1 / 355 | 0.027 | 0 of 424 |
  | CO2 + methanol, SRK | 0.1857 | -42.12 | 7.3 / 32 | 13.2 / 385 | 0.029 | 0 of 424 |
  | CO2 + water, PR | 0.2484 | -109.44 | 13.8 / 74 | 10.2 / 56 | 0.008 | 4 of 573 |
  | CO2 + water, SRK | 0.2352 | -111.6 | 15.3 / 78 | 11.1 / 52 | 0.007 | 4 of 573 |

  The fit window is the confirmed one (T <= 400 K, P <= 20 MPa). Each set has a "fit-quality" known issue with these
  numbers.
- **A check beyond the fit: the heat of absorption.** dk/dT carries the heat of solution, which the k_ij was not
  fitted to. At 313.15 K and 2 MPa, CO2 dissolving into water from its pure gas:
  - the a + b/T set (PR): -14.1 kJ/mol;
  - -R T² d ln H/dT of the IAPWS G7-04 Henry's law constant (`src/data/henry.json`): -16.7 kJ/mol;
  - ChemSep's constant set: +11.3 kJ/mol, endothermic, the wrong sign.

  A test holds the a + b/T value within 20 % of the Henry value.
- **A flash fix found on the way** (`src/equilibrium/flash.js`, P-H flash). With the new set, a PR absorber of CO2 in
  water failed. A stage mixture rich in CO2 has its bubble point at 254 K, where water's IF97 ideal-gas enthalpy
  stops. The search now falls back to its way without a bubble point (T-P flashes stepped out from 300 K). The
  absorber of `test/columns-absorber.test.js` (5 stages, 2 MPa, 300 K) now runs with the default set: bottoms x_CO2
  0.0088 at 301 K, warmed 1.5 K by the absorption; Henry's law with an ideal gas gives 0.011 there. The ChemSep set,
  chosen by name, is refused.

## Established practice (the method rule, docs/METHOD_SELECTION.md)

- R. Privat, J.-N. Jaubert, The state of the art of cubic equations of state with temperature-dependent binary
  interaction coefficients, Fluid Phase Equilib. 567 (2023) 113697, doi 10.1016/j.fluid.2022.113697. The accepted
  manuscript is on HAL (hal-03970737, CC BY-NC-ND 4.0); the HAL API record and its abstract were read on 2026-11-06.
  The abstract: "The binary interaction parameter (BIP) involved in the Van der Waals mixing rules of CEoSs is
  introduced with special attention to the temperature-dependent functions used to express it". HAL's robot check
  refused the PDF to the script, so it is listed in `docs/missing-properties/TO_DOWNLOAD.md` (no. 8), to see which
  forms it reviews.
- PPR78: "classical Van der Waals mixing rules involving a temperature-dependent binary interaction parameter kij(T)"
  (R. Privat, J.-N. Jaubert, PPR78, a thermodynamic model for the prediction of petroleum fluid-phase behaviour,
  JEEP 2011, 00011, doi 10.1051/jeep/201100011, gold open access; abstract read through OpenAlex; the PDF server
  refused the script).
- DWSIM: its Peng-Robinson package takes a constant k_ij per pair. `RET_KIJ(id1, id2)` returns
  `InteractionParameters(...).kij`, with no temperature argument (`DWSIM.Thermodynamics/PropertyPackages/PengRobinson.vb`,
  commit 1abf72d, read on raw.githubusercontent.com on 2026-11-06). Its other packages were not checked.

## Open for the maintainer

- Proposal 0018 (MHV1) is next, in its own pull request, compared with these numbers.
- CHEPTA-Lab's separator runs again with PR. A flash of CO2, H2, CO, methanol and water (0.2/0.5/0.05/0.15/0.1) at
  313 K and 5 MPa gives 25 % liquid with x_CO2 = 0.033. Four of its pairs have no k_ij: H2 + methanol (a constant
  k_ij was 17-21 % off and was left out), H2 + water, CO + water and CO2 + CO. For these PR uses k_ij = 0 and says so
  in the flash's warnings.

## Addendum (2026-11-07): Privat and Jaubert read

The maintainer downloaded the review (TO_DOWNLOAD.md no. 8, now under Done): R. Privat, J.-N. Jaubert, "The state of
the art of cubic equations of state with temperature-dependent binary interaction coefficients: From correlation to
prediction", Fluid Phase Equilib. 567 (2023) 113697, doi 10.1016/j.fluid.2022.113697, open access, CC BY 4.0 (stated
on p. 1). Pages 1-3 and 6-8 were read by the maintainer and the coordinating session:

- Eq. (15), p. 6: a_ij(T) = sqrt(a_i a_j) [1 - k_ij(T)], with temperature-dependent BIPs as the family the review
  covers. This supports the a + b/T of this record.
- Section 3.4, p. 8: "k_ij(T) coefficients cannot accurately model the most complex mixtures involving polar and
  associating compounds"; composition-dependent k_ij(T, z) are "especially useful in accounting for water traces that
  cannot be estimated accurately using a k_ij(T) coefficient".
- Eqs. (25)-(27), p. 8: EoS/gE mixing rules (Huron-Vidal; "the use of, e.g., MHV1 MRs do not change anything") are
  equivalent to a k_ij(T, z). That is the case for proposal 0018 (docs/decisions/2026-11-06-02-mhv1.md).
