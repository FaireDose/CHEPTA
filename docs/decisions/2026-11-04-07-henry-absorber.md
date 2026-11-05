# 2026-11-04-07: Henry components; the equation of state in an absorber (proposal 0017; #194's question 2)

## What the maintainer decided (2026-11-04, relayed by the coordinating session)

On pull request #194's open question 2, the refusal of an equation of state with a light gas and a polar liquid: "we
need to have a working equipment ... something should work also without the electrolyte model". **Decided:** the
activity model plus Henry's law, and Peng-Robinson or SRK allowed where the gas-polar pairs have a k_ij. Built in this
pull request (branch `claude/m3-henry-absorber`, which starts from #194's branch: #194 must be merged first).

## What was built

- **Henry components** (`src/thermo/system.js`, `src/thermo/enthalpy.js`; proposal 0017): in an activity model (NRTL,
  UNIQUAC, Wilson, ideal) with water, the ten gases of `src/data/henry.json` dissolve by f = H x (unsymmetric
  convention, activity coefficient 1 at infinite dilution), water by Raoult's law; the dissolved gas's liquid enthalpy
  is h_IG - R T² d ln H / dT. Refused: another solvent beside water, a temperature outside the gas's equation, a cubic
  vapour; a gas without a Henry constant is refused as before. `henry: false` turns it off. Flashes, the flowsheet and
  every column take it unchanged; the bubble-point scan stays inside the Henry equations' range, and an absorber's
  products are now formed by their enthalpy flow (a gas of N2 and CO2 has no bubble point to form it by VF).
- **The equation of state in an absorber** (`gasSolubilityCheck`, `src/units/columns/column.js`): PR or SRK with a
  light gas and a polar liquid runs where every such pair has a k_ij (fitted or databank; the databank's "no k_ij, 0
  used" does not count), with the warning `METHOD_RANGE`; refused without one. Sour water (NH3 with H2S or CO2 in water)
  and amines (MEA, DEA, MDEA) are refused in every method until electrolytes (methods track M5). Source: the DWSIM
  Property Packages Guide, quotes checked on the page 2026-11-04.
- **Not built (c):** an NRTL pair for ammonia + water fitted to ThermoML VLE data. It needs a ThermoML search, a VLE
  batch and a fit with its checks: a data task of its own, left out.

## The checks

- `test/henry-components.test.js`: the system's H against the IAPWS G7-04 check values (table 6); the solubility of CO2
  in water at 101.325 and 500 kPa, 10-80 degC, against Carroll, Slupsky and Mather, J. Phys. Chem. Ref. Data 20 (1991)
  1201, Table 3 (free NIST reprint; doi 10.1063/1.555900 confirmed through OpenAlex), within 3.5 % (largest 3.1 % at
  10 degC; their table is their correlation of about 100 measured investigations, so this compares two correlations
  of the same data); the enthalpy of solution; the refusals.
- `test/columns-absorber.test.js`, case H9: CO2 and N2 washed with water at 1000 kPa against the independent Python
  reference (IAPWS G7-04 coded there from the guideline): 1e-5 K, 1e-6 in the flows, 1e-8 in the mole fractions. The
  method test now expects PR with CO2 + water to run (its k_ij is ChemSep's, fitted at 383-623 K: the warning says so),
  PR with N2 + water and sour water to be refused, and NRTL with CO2, N2 and water to run by Henry's law.

## For the maintainer to check

- Carroll et al.'s Table 3 values in `validation/data/henry/co2_water_carroll1991.json` (p. 1208, columns 101.325 and
  500 kPa, rows 10 to 80 degC) against the reprint.

## For the maintainer to decide

1. Water as the only solvent (as built), or Henry's law with a mixed solvent (water with an alcohol) by some rule.
2. The 3.5 % tolerance against Carroll et al.
3. Whether the ammonia + water NRTL fit (c) becomes a data task.
