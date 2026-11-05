# 2026-11-04-13: PR and SRK k_ij for gases in methanol and water at high pressure (proposal 0018 postponed)

## What the maintainer decided (2026-11-04, relayed by the coordinating session)

"If the PSRK and MHV2 are not open then we do not use them, PR and SRK should be ok for now." Proposal 0018 (gE
mixing rules) is postponed (pull request #203). Instead: fit Peng-Robinson and SRK k_ij to the open high-pressure
data of the NIST TRC ThermoML Archive for the pairs of CHEPTA-Lab's CO2-to-methanol high-pressure separator (CO2 +
methanol, CO2 + water, H2 + methanol, CO + methanol, CH4 + methanol), and report the errors. These numbers decide
whether proposal 0018 is ever needed.

## What was built

- `validation/python/hp_gas_solubility.py`: reads every record that `validation/data/vle/archive_index.json` lists for
  the five pairs and writes one file per article, `validation/data/eos/thermoml_<gas>_<solvent>_<doi>.json` (56
  files): equilibrium states T, P, x, y as stored. Mass fractions and molalities of the gas are converted to mole
  fractions with the molar masses of `components.json` (stated in each file). Where the record gives the partial
  pressure of the gas (Decultot 2019, Gui 2011, Haghtalab 2015, Luo 2017, Wu 2019), it is kept as `p_1_kPa` and the
  fit compares it with y_1 P. Left out, with the reason in the file or the script's output: three sets given as amount
  concentrations (mol/dm3; they need the liquid density: Gemo 2012 H2 + methanol, Li 2004 and Koglbauer 2008 CO2 +
  water), one Henry's-constant set (Dell'Era 2010, set 1), one set whose composition names no compound (Kruger 2012).
- `validation/fit_kij_high_pressure.mjs`: the objective and the gate of `fit_kij_literature.mjs` (sum of squared
  ln(P_calc/P_exp) of the bubble points at the measured T and x; kept only with an AAD of at most 5 % in P and a bubble
  pressure at every point), with each article given the same total weight (the pooling weights of DATA_RULES.md
  section 3). Fit window T <= 400 K, P <= 20 MPa (the methanol loop and its separator, and cold absorbers; the archive's
  CO2 + water data reach 120 MPa and 573 K). At the fitted and at the databank k_ij it reports the error in P, the gas
  solubility (the liquid x at the measured T and P) and y where measured, per article and pooled, and each article's
  own k_ij: `validation/data/eos/high_pressure_fits.json`.
- `eos_fit_kij.py` merges the kept entries into `src/data/kij.json`; `eos_check_literature.py` checks them with the
  independent Python equation of state; `test/eos-high-pressure.test.js` compares the engine with the data at every
  recorded k_ij (the kept ones within the gate; the errors of the others are the engine's).

## The results (fit window; x = gas solubility at the measured T and P, relative error)

| Pair, model | k_ij | points (articles) | T, K | P, kPa | P: AAD / max % | x: AAD / max % | y: AAD / max | Kept |
|---|---|---|---|---|---|---|---|---|
| CO2 + methanol, PR | 0.0421 | 424 (16) | 213-395 | 79-12068 | 13.1 / 69 | 21.6 / 436 | 0.028 / 0.081 (4) | no; 3 points without a bubble pressure |
| CO2 + methanol, SRK | 0.0356 | 424 (16) | 213-395 | 79-12068 | 12.8 / 71 | 20.9 / 464 | 0.030 / 0.086 (4) | no; 3 without a bubble pressure |
| CO2 + water, PR | -0.1148 | 573 (29) | 273-393 | 14-20000 | 58.5 / 3400 | 48 / 189 | 0.011 / 0.039 (25) | no; 8 without a bubble pressure |
| CO2 + water, SRK | -0.1335 | 573 (29) | 273-393 | 14-20000 | 65.7 / 4160 | 45 / 180 | 0.010 / 0.038 (25) | no; 7 without a bubble pressure |
| H2 + methanol, PR | -0.2882 | 49 (2) | 248-375 | 237-3427 | 16.8 / 43 | 19.4 / 57 | none measured | no |
| H2 + methanol, SRK | -0.5200 | 49 (2) | 248-375 | 237-3427 | 21.2 / 56 | 20.6 / 47 | none measured | no |
| CO + methanol, PR | -0.1802 | 27 (1) | 298-373 | 242-3232 | 4.9 / 16 | 5.0 / 19 | none measured | **yes** |
| CO + methanol, SRK | -0.2585 | 27 (1) | 298-373 | 242-3232 | 4.6 / 15 | 4.7 / 18 | none measured | **yes** |
| CH4 + methanol, PR | -0.0503 | 42 (6) | 273-323 | 1050-19930 | 9.2 / 36 | 7.8 / 20 | none measured | no |
| CH4 + methanol, SRK | -0.0800 | 42 (6) | 273-323 | 1050-19930 | 8.9 / 32 | 7.7 / 18 | none measured | no |

The databank (ChemSep) k_ij on the same data:

| Pair, model | databank k_ij | P: AAD % | x: AAD % | points without a bubble pressure |
|---|---|---|---|---|
| CO2 + methanol, PR | 0.0583 | 14.6 | 18.5 | 17 |
| CO2 + methanol, SRK | 0.0496 | 14.5 | 18.6 | 16 |
| CO2 + water, PR | 0.0952 | 13264 | 91 (too low: about ten times too little CO2 dissolved) | 457 of 573 |
| CO2 + water, SRK | 0.1000 | 19846 | 93 | 478 of 573 |

What the numbers say:

- **Only CO + methanol is within the gate**, on a single article (Wu et al. 2019) whose stated uncertainty of x is
  close to half of x at the lowest pressures. It is written (tier fitted, PR -0.1802, SRK -0.2585).
- **The others are left out**, by the gate of `fit_kij_literature.mjs` (the only gate CHEPTA has for k_ij on P-x
  data; it has no quality-warning band). Their k_ij and errors stay on record in `high_pressure_fits.json`.
- **The cause is the model, not the data, for the CO2 pairs**: each article's own k_ij drifts with its temperature
  (CO2 + methanol PR: 0.02 at 213-273 K to 0.065-0.07 at 313-395 K; CO2 + water PR: -0.16 at 273 K to -0.035 at 375
  K), while articles at the same temperatures need k_ij within about 0.03 of each other (CO2 + methanol near 313 K: 0.040-0.069). A constant k_ij cannot follow both. At one
  article's own k_ij the errors are 3-13 % in P for CO2 + methanol and 2-47 % for CO2 + water. The CO2 + water errors in
  P are inflated where the bubble pressure is flat in x (above CO2's vapour pressure); the solubility error, 45-48 %, is
  the useful figure.
- **H2 + methanol**: the two articles need different k_ij (PR -0.34 at 248-308 K, -0.20 at 297-375 K), and Wu et al.
  2019 scatters by about 20 % about its own best k_ij (its stated uncertainty of x is up to half of x).
- **The databank k_ij of CO2 + water is far off**: with +0.095 (PR) or +0.10 (SRK) the equation of state dissolves
  about a tenth of the measured CO2 and finds no bubble pressure at most points. These are the values the absorber of
  pull request #199 (`gasSolubilityCheck`) runs with today.

## Choices for the maintainer

1. **CO2 + water**: (a) keep the ChemSep default (k_ij +0.095/+0.10; off by a factor of about ten in solubility); (b)
   write the fitted k_ij (-0.115/-0.134) as the default with a "fit-quality" known issue (about 45 % in solubility),
   the ChemSep value kept as the alternative set; (c) refuse PR and SRK for CO2 + water until a better model.
   Suggested: (b) at once, then (d) below.
2. **CO2 + methanol, H2 + methanol, CH4 + methanol**: leave out (as now; CO2 + methanol keeps its ChemSep k_ij, with
   about the same errors as the fit), or write the fits with a "fit-quality" known issue and a wider gate for gases in
   polar liquids (a decision on the gate, which DATA_RULES.md section 5 would record).
3. **(d) A temperature-dependent k_ij** (k_ij = a + b/T, two constants per pair; a change to the engine and to
   kij.json, small enough for a pull request without a proposal, or folded into proposal 0018): the per-article k_ij
   above suggest it would bring CO2 + methanol near the 5 % gate. Whether it is enough for CO2 + water is not known
   before the fit; if not, that pair is the case for proposal 0018 (or CPA, M3).
4. The fit window (T <= 400 K, P <= 20 MPa) is this pull request's choice: confirm it, or name the separator's range.

## To check against the source

Each `validation/data/eos/thermoml_*.json` file says which sets of which ThermoML record it holds. Compare the rows
with the records (https://trc.nist.gov/ThermoML/<doi>.html), in particular: the two kept CO + methanol rows sampled in
`literature_check.json` and the 27 rows of `thermoml_carbon-monoxide_methanol_10-1021-acs-jced-9b00676.json` (partial
pressures of CO, PureOrMixtureData 1); the converted molalities of CO2 + water (Guo 2014, Haghtalab 2015, Wang 2019,
Messabeb 2016 and 2017, Mohammadian 2015, Han 2011, Luo 2017) and the mass fractions (Sato 2010, Martin 2009).
