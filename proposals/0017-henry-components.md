# 0017: Henry components: gases dissolved in water in the activity models

- **Status:** Proposed (the maintainer decided the approach on 2026-11-04, on pull request #194's open question 2; the
  implementation is in the same pull request, as for the small methods items)
- **Author(s):** a coding agent working for the maintainer
- **Discussion:** the pull request that adds this file
- **Roadmap item:** proposal 0015, step 7 (the absorber); [METHOD_SELECTION.md](../docs/METHOD_SELECTION.md), step 2

## Problem

An absorber washes a gas with a liquid, very often water. CHEPTA's activity models (NRTL, UNIQUAC, Wilson, the ideal
solution) take each component's fugacity in the liquid from its vapour pressure, which has no meaning for a gas above its
critical temperature (CO2 at 304 K, N2 at 126 K); they also need a pair for every gas with water, which the databank
does not have. The equations of state describe the gas but not a polar liquid well. So the absorber refused every gas in
water. The maintainer (2026-11-04): "we need to have a working equipment ... something should work also without the
electrolyte model". CHEPTA already has Henry's law constants for ten gases in water (`src/data/henry.json`: IAPWS G7-04
for H2, N2, O2, CH4, C2H6, Ar, CO, CO2 and H2S; Sander 2023 for ethylene), used only by `gasSolubility()` until now.

## Proposal

1. **Henry components.** In a system with an activity model (NRTL, UNIQUAC, Wilson, ideal) and **water**, every other
   component that has a Henry's law constant in water is a Henry component (`system.henry[i]`, `info.henry`): its liquid
   fugacity is
   f_i = H_i(T) x_i (the unsymmetric convention, the activity coefficient at infinite dilution taken as 1),
   and water's is x_w p_w^sat(T) (Raoult's law, its own convention). With an ideal-gas vapour the K-values are
   K_i = H_i / P and K_w = p_w^sat / P. Every calculation that uses the system's K-values and enthalpies takes them
   unchanged: flashes, bubble and dew points, the flowsheet, the columns, the absorber. `henry: false` turns it off.
2. **Its liquid enthalpy** is its partial molar enthalpy at infinite dilution,
   h_i = h_i^IG(T) - R T^2 (d ln H_i / dT)_P,
   so the heat of absorption (about -20 kJ/mol for CO2 near 25 degC) is in every energy balance.
3. **Refused, with the reason:**
   - a Henry component with a solvent other than water, or with water and another liquid (CHEPTA's constants are for
     pure water; a mixed solvent needs its own constants);
   - a temperature outside the range of the gas's equation (`henry()` already refuses there);
   - a cubic vapour (gamma-phi with PR or SRK): built with an ideal-gas vapour only, for now;
   - a gas without a Henry's law constant: as before (its missing pair, or above its critical temperature in an
     absorber).
4. **Equations of state in an absorber** (the same decision): Peng-Robinson or SRK with a light gas and a polar liquid
   runs where every such gas-polar pair has a k_ij (fitted or databank), with a warning (`METHOD_RANGE`) about its range
   and the classical mixing rule; it is refused without one. Sour water (ammonia with H2S or CO2 in water) and amines
   (MEA, DEA, MDEA) are refused in every case until the electrolyte models (methods track, M5). This follows the DWSIM
   Property Packages Guide (https://dwsim.org/tutorials/en/reference/property-packages-guide.html, read 2026-11-04):
   "Sour gas (with H2S, CO2): PR with kij ... Set binary interaction parameters"; "Peng-Robinson ... performs poorly
   for water/alcohol mixtures"; "Sour water (NH3, H2S, CO2): Sour Water ... Specialized for gas treating".

## Engineering basis

- Henry's law in the unsymmetric convention, f_i = H_i x_i gamma_i* with gamma_i* -> 1 at infinite dilution: IAPWS
  G7-04 (2004), "Guideline on the Henry's constant and vapor-liquid distribution constant for gases in H2O and D2O at
  high temperatures", eqs. 3 and 4 (free; http://www.iapws.org); Fernandez-Prini, Alvarez and Harvey, J. Phys. Chem.
  Ref. Data 32 (2003) 903. Taking gamma_i* = 1 is the dilute-solution limit the guideline's constants describe; with
  water the only solvent the activity model's parameters are not used (water at x_w near 1 has gamma_w = 1).
- The temperature dependence (the van 't Hoff relation, derived from f_i = H_i x_i): ln(f_i / P0) = (mu_i - g_i^IG) / RT
  and d(mu_i / T)/dT = -h_i / T^2 at constant pressure give h_i = h_i^IG - R T^2 d ln H_i / dT, item 2; derived here,
  no source needed beyond the definitions.
- **Validation** (`test/henry-components.test.js`, `test/columns-absorber.test.js`):
  - the system's H against the IAPWS G7-04 check values (table 6), 6e-5 in ln H;
  - the solubility of CO2 in water at 101.325 and 500 kPa total pressure, 10 to 80 degC, against Carroll, Slupsky and
    Mather, J. Phys. Chem. Ref. Data 20 (1991) 1201, Table 3 (free NIST reprint; their correlation of about 100
    measured investigations): within 3.5 % (largest difference 3.1 %, at 10 degC: the two correlations of the same
    data differ that much);
  - an absorber of CO2 and N2 in water at 1000 kPa (case H9) against the independent Python reference
    (`validation/python/reference_mesh_absorber.py`, IAPWS G7-04 coded there from the guideline): 1e-5 K, 1e-6 in the
    flows, 1e-8 in the mole fractions.

## Effect on existing work

Systems of an activity model with water and one of the ten gases used to be refused (no pair) or, with the ideal
solution, to extrapolate the gas's vapour pressure; they now use Henry's law. Systems without water are unchanged.
`henry: false` restores the old behaviour. Project files are unchanged.

## Alternatives considered

- **PSRK or a cubic equation with Wong-Sandler mixing rules** (methods track, M2): the general answer for gases with
  polar liquids, and the next step; Henry's law gives a working absorber now, for the commonest solvent.
- **Henry's law in mixed solvents** (water with an alcohol, an amine): needs constants per solvent or a mixing rule for
  them; refused until such data are added.
- **gamma_i* from the activity model** (the gas's gamma divided by its value at infinite dilution): needs gas-water
  pairs, which the databank does not have.
- **Ammonia + water** (ammonia is below its critical temperature at absorber conditions): an NRTL pair fitted to
  ThermoML VLE data would make it a normal activity system; left for a data task (a search, a VLE batch and a fit).
