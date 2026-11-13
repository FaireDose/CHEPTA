# 2026-11-13-05: A missing pair is estimated from Modified UNIFAC 2.0, not refused

The maintainer, 2026-11-13: "our software does not allow calculations because we are too strict with the data ... this
does not allow the simulation to flow." Decision 2026-11-13-03 made records usable outside their ranges. The next
blocker: with NRTL, UNIQUAC or Wilson, one pair without parameters refused the whole mixture (`MISSING_DATA "No NRTL
parameters for: ..."`), and a flowsheet of 5-8 components almost always has such a pair. The maintainer gave the
coordinator freedom to fix it; the design below is the coordinator's, with the refinements this pull request made
(marked).

## The rule

1. **Estimated, not refused.** A pair with no stored set of the chosen model (NRTL, UNIQUAC, Wilson) gets the model's
   b_ij, b_ji regressed to the activity coefficients of Modified UNIFAC 2.0 (Hayer, Hasse and Jirasek 2025, CC BY 4.0,
   parameters unchanged) when the system is built (`src/thermo/activity/estimate-pairs.js`, cached per process).
2. **Labelled.** Tier "predicted", set "estimated-mod-unifac-2", source Hayer et al. 2025, chosen by "estimate"; the
   pair's `source` text says how it was regressed and how closely it follows Modified UNIFAC 2.0. Every result warns:
   `Acetone + Ethyl acetate: no measured NRTL parameters; estimated from Modified UNIFAC 2.0 (predicted, not data).`
   Where the regression residual is above 0.1 in ln gamma, the warning says how closely it follows.
3. **No groups:** the pair is ideal (zero interaction), with a louder warning that says so and names My data and
   another method.
4. **Two liquids:** where the estimate predicts a split, the warning adds "Two liquids predicted from an estimate, not
   checked against data (at T, from x about ... to ...)" and the pair carries the label `predicted-unvalidated`, so the
   two-liquid statements of a result (proposal 0019) name it. With Wilson, which cannot split, the warning says where
   Modified UNIFAC 2.0 splits the pair and recommends NRTL or UNIQUAC.
5. **Strict mode:** `strictRanges: true` (a flowsheet's `solver`, a request's `options`, `withRangePolicy`) refuses as
   before, the message adding that the strict mode refuses to estimate. `createSystem({ missingPairs })` takes
   `"estimate"` (default), `"ideal"` (as `allowMissingPairs: true`, unchanged) or `"refuse"`; an explicit value holds in
   either mode.
6. **Nothing is stored.** No file of `src/data` changes; the estimates are computed at run time. The pairs stay in
   DATA_WANTED.md: a fit to measured data is still the aim.
7. **Where it shows:** `info.pairs` (the estimated entry), `info.estimatedPairs` (pair, ideal, warning, estimate),
   `info.missingPairs` (now only the pairs taken as ideal), the warnings of every calculation, a flowsheet's
   `result.extrapolations` (kind `estimatedPair`, once per pair, with the blocks), the request path's
   `qualifications.estimated_pairs`, the MCP summary, and the Inputs panel's pair list (the warning as the row's note).

### The scheme (this project's choice)

| | |
|---|---|
| temperatures | the two normal boiling points and their mean, clamped to 250-550 K, widened to at least 30 K; 298.15-373.15 K where a component has no boiling point |
| compositions | x_1 = 0.001, 0.05, 0.1, 0.2, ..., 0.9, 0.95, 0.999 |
| residuals | ln gamma_i(model) - ln gamma_i(Mod. UNIFAC 2.0), both components, all points, equal weights |
| parameters | b_ij, b_ji only (a = 0); NRTL alpha 0.3; Wilson Lambda_ij = exp(b_ij / T) (no molar-volume ratio); UNIQUAC with the components' r, q, q' |
| solver | Levenberg-Marquardt from six starting points, the best kept |

## Refinements of the coordinator's brief (and why)

- **A light gas without Modified UNIFAC 2.0 groups stays refused** (it boils below 25 °C, or has no boiling point and
  a critical temperature below 400 K, as carbon dioxide; and is no Henry component). The brief said "ideal with a
  louder warning" for every component without groups. But for these gases the activity model is the wrong method
  (METHOD_SELECTION.md, step 1), and the refusal names Peng–Robinson or SRK: carbon dioxide + water as an ideal
  solution would be off by orders of magnitude, silently in the numbers. DWSIM does something similar (below: near-zero
  parameters for a component boiling below 200 K), but CHEPTA has Henry's law and equations of state for these cases.
  Liquids without groups (maleic anhydride, hydrogen peroxide, cumene hydroperoxide) take the ideal path.
- **The single-calculation warnings keep their 10 K margin for pair sets**, as before; `result.extrapolations` (part 2)
  has none. Changing the warnings' wording and margin would have changed tests that assert them exactly
  (`library.test.js`, `fitted-pairs.test.js`) for no gain; the flowsheet's list is where the maintainer looks.
- **Equation-of-state k_ij sets and MHV1 sets** used outside their data range are gathered the same way (decision
  2026-11-13-03, question 3, named k_ij).

## What other simulators do (METHOD_SELECTION.md, "When in doubt")

- **DWSIM** (source, GPL-3.0, cloned at commit 1abf72d, 2026-07-17, read 2026-11-13): `PropertyPackage.vb` line 263
  `Public Property AutoEstimateMissingNRTLUNIQUACParameters As Boolean = True`; `PropertyPackages/NRTL.vb`,
  `EstimateMissingInteractionParameters`: for a pair whose A12, A21 and alpha are all zero, `T1 = 298.15`, the UNIFAC
  activity coefficients at `{0.25, 0.75}`, `{0.5, 0.5}`, `{0.75, 0.25}`, IPOPT from starts `{-2000, -500, 0, 500, 2000}`
  for each parameter, `ipset.Value.alpha12 = 0.2`; "If comp1.Normal_Boiling_Point < 200 Or comp2.Normal_Boiling_Point <
  200 Then ipset.Value.A12 = 0.01, A21 = 0.01". UNIQUAC.vb does the same. So DWSIM estimates by default, from the
  original UNIFAC, at one temperature and three compositions.
- **Aspen Plus** is reported (course materials and articles found by a web search) to estimate missing NRTL and UNIQUAC
  parameters with UNIFAC, but its documentation is not open and was not read; nothing is claimed about it.
- CHEPTA differs from DWSIM in the predictive model (Modified UNIFAC 2.0: open, temperature-dependent, fitted to far
  more data), the range (13 compositions, the dilute ends, three temperatures), alpha 0.3, and the labels and warnings.

## Checks (`test/estimated-pairs.test.js`)

**Independent calculation** (`validation/python/reference_estimate_pairs.py` → `validation/fixtures/estimated_pairs.json`):
scipy's `least_squares` with the thermo library's NRTL, UNIQUAC, Wilson and modified UNIFAC classes (thermo 0.6.1), no
code shared. At check points the regression did not use (x_1 = 0.15, 0.45, 0.85 between the regression temperatures):
the engine's estimate gives the same ln gamma to 2e-5, and stays within the regression's largest residual of Modified
UNIFAC 2.0.

| Model, pair | T (K) | b_ij, b_ji (K) | rms (max) in ln gamma | split |
|---|---|---|---|---|
| NRTL acetone + ethyl acetate | 324.7, 339.7, 354.7 | 89.2, -47.7 | 0.0013 (0.004) | no |
| NRTL methanol + ethylene glycol (column case C1) | 337.6, 404.0, 470.3 | 346.1, -173.9 | 0.021 (0.076) | no |
| NRTL benzene + ethylene glycol | 353.2, 411.8, 470.3 | 1149.7, 716.2 | 0.056 (0.21) | yes |
| Wilson dichloromethane + methanol | 310.4, 325.4, 340.4 | -113.4, -564.5 | 0.0071 (0.039) | no |
| UNIQUAC ethyl acetate + toluene | 350.3, 367.0, 383.8 | -100.3, 85.9 | 0.0004 (0.0013) | no |
| UNIQUAC water + toluene | 363.4, 378.4, 393.4 | -358.8, -798.9 | 0.061 (0.19) | yes |

**Against fitted sets and measured data (information, not tuned).** The pairs below have fitted NRTL sets; the
estimate was computed as if they had none, and both were compared with the open isobaric T-x-y set at 101.3 kPa the fit
used (mean absolute deviation of the bubble temperature and of y_1):

| Data set | fitted NRTL set | NRTL estimate | Mod. UNIFAC 2.0 itself |
|---|---|---|---|
| ethanol + water | 0.12 K, 0.004 | 1.08 K, 0.018 | 1.06 K, 0.018 |
| acetone + methanol | 0.12 K, 0.002 | 0.50 K, 0.007 | 0.49 K, 0.008 |
| ethyl acetate + ethanol | 0.09 K, 0.003 | 0.40 K, 0.009 | 0.29 K, 0.008 |
| chloroform + methanol (not in the test) | 0.11 K, 0.007 | 0.46 K, 0.013 | 0.53 K, 0.012 |

The estimate is about as good as Modified UNIFAC 2.0 itself and 3-9 times further from the data than a fit to them:
usable for a flowsheet to flow, not a substitute for data. UNIQUAC and Wilson estimates gave similar figures.

**Behaviour:** labels, warnings in bubble points and flashes, gammas equal to the estimate's, nothing in
binaries.json; the strict mode and `missingPairs` choices; the ideal fallback with its warning; the light gases
refused; two-liquid warnings (NRTL and Wilson); a four-component system with stored and estimated pairs; a flowsheet's
`extrapolations` with the estimated pair once (`Where: F1`); a pair set used 6.45 K and 11.45 K above its range listed
once, at the farthest distance, with its blocks, while the warnings keep their margin; a PR k_ij set the same way.

## Tests changed (the maintainer's decision changing behaviour, not results made to pass)

Each asserted the refusal of a missing pair; each now asserts it in the strict mode (or with `missingPairs: "refuse"`)
**and** the estimate without it. No validation data changed: column case C1
(`validation/data/columns/C1-missing-pair.json`) is unchanged and runs as the strict mode's case, as G3 does since
decision 2026-11-13-03.

| Test file | Change |
|---|---|
| `api.test.js` | benzene + glycerol: `missing_data` with `options.strictRanges` (message names the strict mode); without: `ok`, the pair predicted, `estimated_pairs`, the note in `value.extrapolations` with `where: ["F1"]` |
| `authoring-contract.test.js` | the missing-pair message asserted with `options.strictRanges`; the user's own pair: tier user, no estimate |
| `benchmark-columns.test.js` | case C1 refused in the strict mode; lenient: the pair estimated, not ideal, with the warning |
| `columns-rigorous.test.js`, `columns-shortcut.test.js` | C1 through `solve_column` with `options.strictRanges` |
| `cli.test.js`, `mcp.test.js` | the missing-data flowsheet gained `solver: { strictRanges: true }`; without it: `ok`, with the estimate in the qualifications / the summary's warning |
| `dew-errors.test.js` | benzene + ethylene glycol `MISSING_DATA` in the strict mode |
| `library.test.js` | acetone + ethyl acetate refused with `missingPairs: "refuse"`; estimated without |
| `wilson.test.js` | dichloromethane + methanol refused with `missingPairs: "refuse"`; estimated without |
| *new* `estimated-pairs.test.js` | above |

Unchanged and still passing: `henry-components.test.js` and `dew-errors.test.js` (helium + water, CO2 + water with
`henry: false`: refused, light gases), `reactors.test.js` (CO + H2 + methanol with an activity model: refused, naming
the gases).

Full suite: 1683 pass, 0 fail, 1 known TODO (before: 1672 pass).

## What the maintainer must decide

1. **Light gases without groups: refuse (recommended) or ideal with a warning?** Recommended: refuse, as built. An
   activity model is the wrong method for them; Henry's law or an equation of state is offered by the message.
2. **The regression scheme: b_ij, b_ji only, alpha 0.3, three temperatures over the boiling range (recommended), or
   also a_ij, a_ji (a temperature dependence closer to Modified UNIFAC 2.0's)?** Recommended: as built. Two parameters
   are stable and extrapolate gently; four would follow Modified UNIFAC 2.0's temperature dependence more closely but
   can run away outside the regression temperatures.
3. **Pair sets in the single-calculation warnings: keep the 10 K margin (recommended) or drop it as in
   `result.extrapolations`?** Recommended: keep. The flowsheet's list already has every pair set without a margin.
4. **A per-flowsheet switch** (`thermo.missing_pairs: "estimate" | "ideal" | "refuse"`) **later, or only the strict
   mode (recommended)?** Recommended: only the strict mode for now; `missingPairs` exists for programs calling
   `system()`, and a flowsheet switch can follow if users ask.

## Decided (the maintainer, 2026-11-13, through the coordinator)

The maintainer agreed to all four recommendations:

1. **Light gases without groups keep refusing**, the message naming an equation of state or Henry's law. The refusal
   of a gas the earlier hint did not name (carbon dioxide, which has no boiling point) now names them too: "Carbon
   dioxide is a gas without Modified UNIFAC 2.0 groups, so the pair cannot be estimated: use Peng–Robinson or SRK, or
   Henry's law with water as the only solvent" (`test/estimated-pairs.test.js`).
2. **The scheme stays as built:** b_ij, b_ji only, NRTL alpha 0.3, over the boiling range.
3. **Single-calculation warnings keep their 10 K margin** for pair sets; `result.extrapolations` has none.
4. **The strict mode only for now;** a per-flowsheet setting (`thermo.missing_pairs`) only if users ask for it.

Follow-up (open item in DECISIONS.md): a lenient twin of column case C1, a data PR that checks the estimate's warning
beside the unchanged strict-mode case, as for G3.

## What to check

No numbers from sources were transcribed: the estimates are computed from Modified UNIFAC 2.0's tables, which are
unchanged. Please check one case of your own, for example a flowsheet with methanol + water + ethylene glycol (case
C1): the Warnings tab lists "Methanol + Ethylene glycol: no measured NRTL parameters; estimated from Modified UNIFAC
2.0 (predicted, not data)" once, and `solver: { strictRanges: true }` refuses it.
