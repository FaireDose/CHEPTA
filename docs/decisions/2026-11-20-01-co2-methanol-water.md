# 2026-11-20-01: how much CO2 dissolves in the condensate of a methanol plant's separator

## The question (from CHEPTA-Lab, relayed by the coordinating session)

CHEPTA-Lab's case methanol-co2-campos-2022 (Campos et al. 2022, the paper's simulator: NRTL with parameters it does
not print) has a high-pressure flash at 30 degC and 69.25 bar. Its feed, stream 23, is in mol % H2 59.631, CO 1.776,
CO2 18.136, methanol 7.485, water 7.273, N2 5.698 (Lab's COMPARISON.md, main 415da41). The liquid, stream 24, holds
3.414 mol % CO2 in CHEPTA (PR with the fitted k_ij) and 18.545 % in the paper (supplement p. 14, Table S10). The
paper's value comes from a simulation, not a measurement. It makes Lab's CO2 recycle 86 % smaller. Which value is
physical?

## The answer

**Neither, but CHEPTA's is much closer. The paper's 18.5 % is not physical.** The measured data put the CO2 in this
liquid at about 2-3 mol %. CHEPTA's PR with k_ij gives 3.4 %, which is too high. PR + gE (MHV1), which follows the
measured data, gives 2.6 %.

- **The paper's 18.5 % is above every measured liquid of this kind.** Xia et al. (2004) measured CO2 in a 1:1 (molar)
  methanol + water solvent at 313.75 K. Even under 7072 kPa of nearly pure CO2, that liquid held only 10.8 mol % CO2
  (molality 4.828 mol/kg). In the separator, CO2 is only about 21 % of an H2-rich gas, so its partial pressure is about
  1.4 MPa, not 7 MPa. In pure methanol, which dissolves more CO2 than methanol + water does, Bezanehtak et al. (2004)
  measured x_CO2 = 0.066-0.115 at 298 K and 4-7 MPa under gases of 70-73 % H2 and 24-27 % CO2. The paper's liquid
  also has more CO2 than its own feed (18.5 % against 17.9 %), so its K value for CO2 is below 1. The data give K
  values of 2.3 and more in pure methanol (0.26 / 0.109 at 7 MPa), and higher still with water in the solvent.
- **The mixture critical region does not matter here.** CO2's vapour pressure at 303.15 K is 7214 kPa (CHEPTA's record
  fitted to CoolProp, Span-Wagner; Tc = 304.13 K), close to the 6925 kPa of the separator. But the liquid is a
  methanol + water solution with a few per cent of dissolved CO2. It is far from the CO2-rich mixtures where
  CO2 + methanol becomes critical. The H2 and CO in the gas dilute the CO2 and lower how much of it dissolves.
- **Where CHEPTA was off:** PR and SRK with the k_ij of the three pairs (CO2 + methanol, CO2 + water,
  methanol + water) overpredict CO2 solubility in methanol + water mixtures. Against Xia et al. at 313.75 K: +77 % in
  the 1:1 solvent (bubble pressure -40 %), +112 % at a methanol mole fraction of 0.25, +12 % at 0.9, about +12 % in pure
  methanol. Each binary k_ij follows its own binary data (decision 2026-11-06-01: CO2 + methanol 13 % in solubility over
  424 points, 213-395 K, 79-12068 kPa, a + b/T fitted inside T <= 400 K, P <= 20 MPa). The error is in the mixture,
  which the van der Waals mixing rule cannot follow. PR + gE (MHV1) is +9 % in the 1:1 solvent, within 30 % at every
  solvent ratio, and 7.9 % (AAD) in solubility over all 221 points.
- **H2 as well:** PR has no H2 + methanol k_ij (k_ij = 0, with a warning). Against the 142 measured CO2 + H2 + methanol
  liquids of Bezanehtak et al., its bubble pressures are +132 % on average (H2 far too insoluble), and 19 liquids get
  no bubble pressure at all. PR + gE (MHV1) is within 12 % (AAD), with 0.03 in y_CO2. In the separator, MHV1 gives
  0.45 % H2 in the liquid against PR's 0.09 %. The paper's 0.38 % is close to MHV1's.

| Method | Xia 2004, 1:1 solvent, 313.75 K: x_CO2 bias | Xia 2004, all 221 points: x_CO2 AAD | Bezanehtak 2004: P AAD | Lab's separator: x_CO2, mol % |
|---|---|---|---|---|
| PR (k_ij) | +77 % | 32 % | 132 % (19 without a bubble pressure) | 3.414 (3.692 without N2) |
| SRK (k_ij) | +77 % | 33 % | 213 % (17 without) | 3.443 (3.722 without N2) |
| PR + gE (MHV1) | +9.2 % | 7.9 % | 12.0 % | refused (N2 + methanol has no set); 2.565 without N2 |
| SRK + gE (MHV1) | refused (CO2 + water has no set) | refused | 13.6 % | refused |
| the paper (NRTL, its own parameters) | | | | 18.545 |

Dropping N2 (5.7 % of the feed) raises the other gases' partial pressures. Under PR the CO2 in the liquid then rises
from 3.414 to 3.692 %, so the MHV1 value with N2 present would be about 2.4 %.

## The measured data (all open through the NIST TRC ThermoML Archive, NIST open license)

Found by reading every record of the archive's bulk file (ThermoML.v2020-09-30.tgz, doi 10.18434/mds2-2422; 189 MB,
read on 2026-11-20) for sets that hold methanol with CO2, H2 or CO and any third compound. Each record is fetched by
its DOI from trc.nist.gov by `validation/python/hp_ternary_solubility.py` and written as stored to
`validation/data/eos/multicomponent/`:

- J. Xia, M. Jödecke, A. Pérez-Salado Kamps, G. Maurer, Solubility of CO2 in (CH3OH + H2O), J. Chem. Eng. Data 49
  (2004) 1756-1759, doi 10.1021/je049803i; https://trc.nist.gov/ThermoML/10.1021/je049803i.html; ThermoML
  PureOrMixtureData 1 (221 points: 313.75, 354.35, 395.0 K; CO2-free methanol mole fractions 0.05, 0.1, 0.2515,
  0.4999, 0.7508, 0.9015, 0.9527, 1; molality of CO2 and the total pressure). The mole fractions are computed from the
  molality with the molar masses of src/data/components.json (formula in the file).
- K. Bezanehtak, F. Dehghani, N. R. Foster, Vapor-Liquid Equilibrium for the Carbon Dioxide + Hydrogen + Methanol
  Ternary System, J. Chem. Eng. Data 49 (2004) 430-434, doi 10.1021/je0301491;
  https://trc.nist.gov/ThermoML/10.1021/je0301491.html; PureOrMixtureData 2 (142 points, 278-298 K, 2-20 MPa, x and y).
- X. Xie, J. S. Brown, D. Bush, C. A. Eckert, Bubble and Dew Point Measurements of the Ternary System Carbon Dioxide +
  Methanol + Hydrogen at 313.2 K, J. Chem. Eng. Data 50 (2005) 780-783, doi 10.1021/je0498614;
  https://trc.nist.gov/ThermoML/10.1021/je0498614.html; PureOrMixtureData 2 (16 bubble pressures).

The table numbers in the articles were not checked. The binary CO2 + methanol sets of 16 articles were already in
`validation/data/eos/` (decision 2026-11-04-13).

Not used, and why: Höhler et al., Fluid Phase Equilib. 459 (2018) 186, doi 10.1016/j.fluid.2017.12.004, sets 3-4:
methanol-rich solvents (water-to-methanol amount ratios 0.05-0.2) at 258-298 K, far from the 1:1 solvent. Schuler et
al., J. Chem. Eng. Data 57 (2012) 2304, doi 10.1021/je300332b, set 3: 103 kPa only. Gemo et al., J. Chem. Thermodyn.
54 (2012) 1, doi 10.1016/j.jct.2012.03.021: H2 given as mol/dm3, and the record has no liquid density to convert it.
There is no ThermoML liquid + gas set for N2 + methanol. A first OpenAlex search for open articles on N2 solubility in
methanol found none with usable data. The search is not complete.

## What was built

- `validation/python/hp_ternary_solubility.py`: the three data files, written as stored.
- `validation/co2_methanol_check.mjs`: CHEPTA's methods against the data, and Lab's separator flash. Results in
  `validation/data/eos/multicomponent/co2_methanol_check.json`.
- `test/co2-methanol-water-solubility.test.js`: the data files (sources, row counts, and the molality conversion
  recomputed), the data's bound on the separator liquid, PR + gE (MHV1) against Xia and Bezanehtak/Xie, the known
  issues (the test fails when a fix makes them false), and Lab's flash reproduced (3.414 %).
- `src/data/known-issues.json`: four "predicted-deviation" entries (PR and SRK; CO2 + methanol + water and
  CO2 + H2 + methanol) with these numbers.
- `docs/METHOD_SELECTION.md`: the rule "CO2 and H2 dissolved in methanol + water at high pressure: PR + gE (MHV1)".
- Sources: `make_sources.py` added Bezanehtak 2004 to src/data/sources.json and the new files to the Xia 2004 and
  Xie 2005 entries. src/data/LICENSES.md was regenerated.

No parameter was refitted and no default changed. Refitting the k_ij to the ternary would only shift the error, since
the van der Waals rule cannot hold the methanol + water interaction. The default method of a flowsheet is the user's
choice; CHEPTA now says which method fits this mixture, and why.

## For CHEPTA-Lab

The paper's stream 24 (18.5 % CO2, and the 86 % larger CO2 recycle that follows from it) contradicts the measured
solubility of CO2 in methanol + water and in methanol under H2 + CO2. It is a property of the paper's NRTL parameters,
not of the mixture. To compare with the data, Lab can run the separator with PR + gE (MHV1) without N2 (2.6 % CO2),
or with PR and the known issue (3.4 %, about 1.3 to 1.8 times too high). Lab should not tune toward the paper's value.

## Open for the maintainer

1. Check the transcribed rows against the three ThermoML records (AGENTS.md rule 4). The files list the record and
   set numbers.
2. Nitrogen in MHV1. Should CHEPTA add sets for nitrogen + water (fitted to the IAPWS G7-04 Henry's law constants, as
   for H2 + water, 2026-11-07) and nitrogen + methanol (open data still to be found), so that PR + gE (MHV1) runs Lab's
   whole separator? Recommended: yes. Nitrogen + water now; nitrogen + methanol after a full search (steps 2-5 of
   DATA_RULES "How to search").
3. Should Lab's separator, and the methanol examples, move to PR + gE (MHV1) once nitrogen has its sets? Recommended:
   yes.
