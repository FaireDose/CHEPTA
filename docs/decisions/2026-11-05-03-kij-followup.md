# 2026-11-05-03: high-pressure k_ij, the maintainer's answers to pull request #206

## What the maintainer decided (2026-11-05, relayed by the coordinating session)

On the choices of docs/decisions/2026-11-04-13-kij-high-pressure.md:

1. **CO2 + water**: refuse Peng-Robinson and SRK for the pair, ChemSep's set included; keep the ChemSep set in the data,
   marked not usable, with the reason and the numbers; Henry's law (proposal 0017) is the remedy.
2. **CH4 + methanol**: write it with a fit-quality known issue.
3. **A temperature-dependent k_ij**, k = a + b/T, for CO2 + methanol and CO2 + water, if cheap: CO2 + methanol written
   if it meets the 5 % gate; CO2 + water's errors reported either way.
4. **The fit window**, T <= 400 K and P <= 20 MPa: confirmed.

## What was built

1. **CO2 + water not usable in a liquid.** Its PR and SRK entries in `src/data/kij.json` carry `not_usable` (the
   reason, with the numbers of `high_pressure_fits.json`, and the decision). `refuseNotUsableLiquid`
   (`src/thermo/eos/system.js`) refuses with that reason and names Henry's law in an activity model, or the user's own
   k_ij (My data), as the remedies:
   - every bubble and dew point of a PR or SRK system whose liquid (or incipient liquid) holds both;
   - a flash whose result has a liquid holding both;
   - every column with the pair (`gasSolubilityCheck`).

   Not refused: work in the vapour alone (fugacities, a flash that ends all vapour). The reason: refusing the pair
   outright stopped 11 tests of the methanol-synthesis reactors, the Excel flowsheet and the reactor workspace, which
   use PR for the hot gas, not for CO2 dissolving in water. The user's own k_ij carries no mark. One absorber test ran
   PR with CO2 + water; it now asserts the refusal, and its METHOD_RANGE warning check uses H2S + water instead (DATA_RULES.md
   section 9.2: a test that the decision makes wrong). No example file relies on PR for CO2 + water in a liquid (the
   example tests pass).
2. **CH4 + methanol written** (PR -0.0503, SRK -0.0800; 42 points of 6 articles, 273-323 K, 1.05-19.9 MPa): AAD 9.2 %
   and 8.9 % in P (max 36 % and 32 %), 7.8 % and 7.7 % in solubility (max 20 % and 18 %), with a `quality_warning` in
   the record and a "fit-quality" entry in `src/data/known-issues.json` (both written by
   `validation/fit_kij_high_pressure.mjs`, `WARNED`).
3. **k_ij = a + b/T** (`TEMPERATURE_STUDY` in the same script, recorded under `temperature_study`). A bubble pressure at
   a given T needs only k at that T, so the study ran on the engine as it is. Neither pair meets the gate, so nothing
   is written and the engine keeps constant k_ij (adding the form to the engine, the Python reference and kij.json is
   left until a pair needs it):

   | Pair, model | a | b, K | k at 250 / 300 / 350 / 400 K | P: AAD / max % | solubility: AAD / max % | y: AAD | no bubble P |
   |---|---|---|---|---|---|---|---|
   | CO2 + methanol, PR | 0.1883 | -40.62 | 0.026 / 0.053 / 0.072 / 0.087 | 7.1 / 30 | 13.1 / 355 | 0.027 | 0 |
   | CO2 + methanol, SRK | 0.1857 | -42.12 | 0.017 / 0.045 / 0.065 / 0.080 | 7.3 / 32 | 13.2 / 385 | 0.029 | 0 |
   | CO2 + water, PR | 0.2484 | -109.44 | -0.189 / -0.116 / -0.064 / -0.025 | 13.8 / 74 | 10.2 / 56 | 0.008 | 4 |
   | CO2 + water, SRK | 0.2352 | -111.6 | -0.211 / -0.137 / -0.084 / -0.044 | 15.3 / 78 | 11.1 / 52 | 0.007 | 4 |

   Against a constant k_ij: CO2 + methanol from 13 % to 7 % in P (the solubility's large maximum is near the mixture
   critical point, where P hardly changes with x); CO2 + water from 58-66 % to 14-15 % in P and from 45-48 % to 10-11 %
   in solubility.
4. **The window** stays T <= 400 K, P <= 20 MPa.

## What this leaves open (for the maintainer)

- **CHEPTA-Lab's high-pressure separator has no method now.** A flash of CO2, H2, CO, methanol and water at 313 K and
  5 MPa is refused in PR and SRK (CO2 + water in the liquid), in NRTL (no pairs of the gases) and in the ideal solution
  (H2 far above its critical temperature); Henry's law in CHEPTA is for water alone as the solvent. Choices:
  - (a) accept the refusal until proposal 0018 or CPA (M3);
  - (b) allow CO2 + water with the a + b/T k_ij written with a fit-quality known issue (10-11 % in solubility, 14-15 % in
    P), which needs a + b/T in the engine (cubic.js mixing rule and its temperature derivatives, kij.json, the Python
    reference): a pull request of its own;
  - (c) reopen proposal 0018 for the separator's liquid (a polar liquid of methanol and water with dissolved gases).
- **CO2 + methanol**: a + b/T at 7.1-7.3 % is close to the gate but outside it; the ChemSep constant k_ij stays the
  default, unchanged.
- **A finding beside the task, fixed** (the maintainer, 2026-11-06): an absorber of CO2 in methanol with PR (5 stages,
  2 MPa, 300 K) failed with "Mole fractions must be non-negative with a positive sum" (on main as well). A trial step
  of the equation-of-state flash's Newton method (`newtonEos`, `src/equilibrium/flash.js`) sent a K-value to overflow,
  and the phase compositions it gave (NaN) reached the equation of state; such a trial is now rejected like any other
  bad step. `test/columns-absorber.test.js` reproduces the case: the column solves, its balances close, and the
  bottoms hold no more CO2 than a liquid saturated at the bottom stage's T and P. The a + b/T option (b) is on hold
  (the maintainer, 2026-11-06: 14-15 % in pressure is too high; weighed against reopening proposal 0018).

## To check against the source

As in 2026-11-04-13: the ThermoML rows of `validation/data/eos/thermoml_methane_methanol_*.json` (six articles) now make
a written k_ij. Compare them with the records (https://trc.nist.gov/ThermoML/<doi>.html).
