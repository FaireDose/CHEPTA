# 0016: The Wilson activity model

- **Status:** Accepted (merged in #192; the maintainer's answers of 2026-11-04 in
  docs/decisions/2026-10-30-06-wilson.md). Step 1 implemented; step 2 (the fits) postponed until needed, after M3.
- **Author(s):** a coding agent working for the maintainer
- **Discussion:** the pull request that adds this file
- **Roadmap item:** Methods track, **M1** ([ROADMAP.md](../ROADMAP.md#methods-track))

## Problem

[docs/METHOD_SELECTION.md](../docs/METHOD_SELECTION.md) recommends Wilson for polar mixtures that stay one liquid
(rule 3) and for hydrocarbons below a reduced temperature of 0.75 (rule 6), but CHEPTA had only NRTL, UNIQUAC,
Modified UNIFAC 2.0 and the ideal solution. Users who have Wilson parameters from an article or another simulator
could not use them, and the interface showed Wilson as "not available yet".

## Proposal

1. **The model**, `src/thermo/activity/wilson.js`, next to NRTL and UNIQUAC, through the same property-package
   interface (`createSystem({ model: "WILSON" })`; the key is case-insensitive, "Wilson" works too; shown as "Wilson"):

   Λ_ij = exp(a_ij + b_ij / T), Λ_ii = 1,
   ln γ_i = 1 − ln(Σ_j x_j Λ_ij) − Σ_k x_k Λ_ki / Σ_j x_j Λ_kj.

   The parameters have the same four keys as UNIQUAC's (a_ij, a_ji, b_ij, b_ji, b in K), in `src/data/binaries.json`
   with `"model": "WILSON"`. The volume form Λ_ij = (V_j / V_i) exp(−A_ij / RT) of ChemSep and many textbooks is the
   same with a_ij = ln(V_j / V_i) and b_ij = −A_ij / R; the volumes are held constant, at the values the parameters
   were fitted with, as ChemSep does.
2. **ChemSep's Wilson set** (`wilson.json`, Artistic License 2.0, as shipped by the thermo library), imported by
   `validation/python/chemsep_pairs.py --all --models WILSON` for every pair of CHEPTA's components that ChemSep has:
   165 pairs, tier "databank", set "chemsep". thermo ships the set already converted to the form above (its
   documentation of `thermo.wilson.Wilson`: a_ij = ln(V_j / V_i), b_ij = −A_ij / 1.98720 with A_ij in cal/mol), so a_ij
   and b_ij are taken as they are.
3. **Fits to ThermoML data: a follow-up.** `fit_parameters.py` and `vle_batch.py` fit NRTL and UNIQUAC to about 300
   pairs of the archive. Adding Wilson there is a change of every generated fit and of the known-issue file, larger
   than this item; it is the next step (below), and until then the ChemSep set is the only Wilson set.
4. **Pairs of one's own**: `user_data.pairs["a+b"].WILSON = { a_ij?, a_ji?, b_ij, b_ji }` (My data panel, project
   files, requests) and `CHEPTA.library.add({ model: "WILSON", ... })`, tier "user", as for NRTL and UNIQUAC.
5. **The interface**: Wilson in the Model group ("Wilson (one liquid)"), the flowsheet's Method page, the column's own
   property method, the My data pair table, `mount()`'s model list; removed from the "not available yet" entries.
6. **Two liquids** (what Wilson cannot do). The Wilson equation with positive Λ gives a mixing Gibbs energy that is
   always convex, so it never predicts a second liquid (The ChemSep Book: "Unlike the original Wilson equation [NRTL]
   may also be used for liquid-liquid equilibrium calculations"; thermo: "not recommended for liquid-liquid
   equilibria"). A Wilson result would then show one liquid where there are two, without a sign. CHEPTA:
   - **refuses** to look for two liquids with Wilson where the user asks for them: the column's phases "VLL" (and a
     decanter) are refused, `NOT_AVAILABLE`, naming NRTL, UNIQUAC and Modified UNIFAC 2.0;
   - **warns** at every result (flash, bubble and dew points, column profiles, enthalpies: everything that collects
     `sys.warnings(T, P)`) where a pair of the mixture has a default NRTL set (else UNIQUAC) that predicts two liquids
     at that temperature (the binary's mixing Gibbs energy is not convex, checked on 200 compositions): "Wilson cannot
     predict two liquids, but the NRTL set "chemsep" of 1-Butanol + Water predicts them at 300 K (from x(1-Butanol)
     about 0.03 to 0.22): check this mixture with NRTL or UNIQUAC, and do not use Wilson where it splits.";
   - the flash drum's second-liquid outlet stays empty with Wilson; the warning above says why that may be wrong.

## Engineering basis

- G. M. Wilson, J. Am. Chem. Soc. 86 (1964) 127 (doi:10.1021/ja01056a002; paywalled, cited, its numbers not used).
- The ChemSep Book, 2nd ed. (Kooijman and Taylor 2006, public domain, http://www.chemsep.org/downloads/docs/book2.pdf),
  chapter 10, eqs. 10.13-10.15 (PDF p. 133): the equation and ChemSep's parameter form.
- thermo (C. Bell et al., MIT), `thermo.wilson.Wilson`: the same equations, the conversion of ChemSep's parameters, and
  an example in its documentation (ethanol + water, 343.15 K, x = 0.252: γ = 1.95733110, 1.1600677).
- **Validation** ([test/wilson.test.js](../test/wilson.test.js); fixture `validation/fixtures/wilson.json` by
  `validation/python/reference_wilson.py`):
  - γ against thermo's Wilson with ChemSep's set read from thermo's own IPDB (not from binaries.json): 30 cases of four
    binaries and a ternary at 298-363 K, relative difference below 1e-10; thermo's printed example to 1e-7;
  - bubble temperatures and vapour fractions at 101.3 kPa against `validation/python/reference_model.py` (Wilson added
    there, numpy), to 1e-4 K and 1e-6;
  - against six open isobaric T-x-y sets at 101.3 kPa (NIST ThermoML Archive), the ChemSep set not fitted to them:

    | Pair | Data | Mean abs. dT (K) | Mean abs. dy |
    |---|---|---|---|
    | ethanol + water | Kamihama et al. 2012 | 0.08 | 0.005 |
    | acetone + methanol | Li et al. 2018 | 0.21 | 0.002 |
    | acetone + chloroform | validation/data/acetone_chloroform_101kPa.json | 0.47 | 0.006 |
    | chloroform + methanol | validation/data/chloroform_methanol_101kPa.json | 0.19 | 0.008 |
    | ethyl acetate + ethanol | validation/data/ethyl-acetate_ethanol_101kPa.json | 0.15 | 0.003 |
    | ethanol + ethylene glycol | Kamihama et al. 2012 | **5.3** | 0.003 |

    The first five meet the limits a fitted set must meet in CHEPTA (docs/DATA_RULES.md section 5: 0.5 K, 0.012); the
    test holds them to it. Ethanol + ethylene glycol misses by 5.3 K, as ChemSep's NRTL set does (6.2 K); the fitted
    NRTL and UNIQUAC sets follow the data (0.07 K). The test records the deviation instead of hiding it; the fits
    (step 2) would replace the set.
  - the two-liquid behaviour: 1-butanol + water, unstable with NRTL at 300 K and x = 0.1, stable with Wilson, with the
    warning; the column's "VLL" refused through `CHEPTA.run`; a 12-stage methanol + water column solved with Wilson
    through `CHEPTA.run`.

## Effect on existing work

- New model key `WILSON`; nothing else changes for NRTL, UNIQUAC and the equations of state. Old project files keep
  working; a file with `"model": "WILSON"` was refused before and opens now.
- `library.sets(a, b)` without a model lists the pair's Wilson sets too; `docs/DATA_WANTED.md` counts Wilson sets
  (five pairs that only ChemSep's Wilson set covered move from "no parameters" to "databank only").
- Four tests used "Wilson" as an example of an unknown model; they use "PC-SAFT" now, with a comment.

## Alternatives considered

- **The volume form with liquid molar volumes from the density records** (Λ_ij = V_j(T) / V_i(T) exp(−A_ij / RT)):
  closer to Wilson's paper, but ChemSep's A_ij were fitted with constant volumes, so changing the volumes would change
  its parameters; and components without a density record could not use the model. The constant form keeps the
  databank's values exact; users with the volume form convert with a_ij = ln(V_j / V_i).
- **Refusing every Wilson calculation where another model predicts two liquids**: that would make the method depend on
  another model's parameters, which may be wrong themselves (several ChemSep NRTL sets predict splits that measured data
  do not show, src/data/known-issues.json). A warning lets the engineer decide; only an explicit request for two liquids
  is refused.
- **The T-dependent extra terms of thermo** (c ln T, d T, e / T², f T²): not needed for ChemSep's set; can be added
  later with the same keys if a fit or a user needs them.

## Steps

1. This pull request: the model, ChemSep's set, My data and the library, the interface, the two-liquid refusal and
   warning, the tests, the method guide.
2. Postponed until needed, after M3 (the maintainer, 2026-11-04): Wilson in `fit_parameters.py` for the ThermoML pairs (`vle_batch.py`'s fits), with the same gates as
   NRTL and UNIQUAC; a fitted Wilson set becomes the pair's default, ChemSep's stays as an alternative (DATA_RULES.md
   section 5).
