# 2026-10-22: enthalpy and Gibbs energy of formation (proposal 0010, step 1)

The maintainer's answers (2026-10-22), on two questions asked before any value was written:

- "For the 124 components ChemSep has, which source should give ΔfH° and ΔfG°?": **ChemSep as is**. The accepted
  proposal named Argonne's Active Thermochemical Tables first, with a comparison; the rule of 2026-10-14 (ChemSep taken
  as it is, no comparisons) decides. The elements in their reference state (hydrogen, oxygen, nitrogen, argon,
  helium) are zero.
- "For the 50 components ChemSep doesn't have, what should I do?": **search everything now**: the NIST WebBook, the
  ThermoML Archive and the open literature, before the pull request.

What was found for the 50 (`validation/data/pure/formation/measured.json`, `validation/python/formation_data.py`):

- **28 records** of the liquid or the crystal measured, at 298.15 K: from WebBook enthalpies of formation, and from
  enthalpies (WebBook) or energies (ThermoML Archive) of combustion turned into enthalpies of formation with the CODATA
  key values (Cox, Wagman and Medvedev 1989, open table at codata.info). The ThermoML Archive stores combustion as
  reaction data, which CHEPTA's readers did not read before: levulinic acid, the three levulinates, ethyl lactate,
  1,3-propanediol, levoglucosan, succinic acid and xylose. Where the WebBook gives an enthalpy of formation of the same
  compound, the cycle agrees with it (succinic acid: within the WebBook's ± 2 kJ/mol; `test/formation.test.js`).
- **Gibbs energy of formation** for 13 of them, where an open standard entropy of the same state exists (WebBook,
  ThermoML Archive), with the CODATA entropies of the elements; the others have the enthalpy only (heats of reaction
  work; equilibrium constants from formation data do not, until an entropy is found).
- **Rules set here, for the maintainer to confirm** (docs/DATA_RULES.md section 11):
  - the record's state follows the melting temperature: the crystal when the component melts above 298.15 K. The
    WebBook labels a few values of crystalline compounds "liquid" (erythritol, xylitol, fumaric acid); they are left
    out and named. Without melting data, the condensed state with more articles (fumaric acid);
  - a crystal value only from the component's own crystal (DL-malic acid has none: the L- and D-malic acid crystals
    are other solids); liquid and gas values from either enantiomer (ethyl D-lactate for ethyl lactate,
    (R)-(+)-limonene for limonene). Glucose's crystal is alpha-D-glucopyranose, the crystal of its melting data;
  - several articles: the median, with the number and spread; a spread above 10 kJ/mol is stated as uncertain
    (2-methoxyethanol 19 kJ/mol, 1,3-propanediol 17, limonene 39, gamma-butyrolactone 12, levoglucosan 44: each with
    one old value far from the others);
  - **xylitol is held**: its two crystal energies of combustion in the ThermoML Archive disagree by about 100 kJ/mol
    (one with a stated uncertainty of 100 kJ/mol, the other recorded for a compound named
    "SRS-1,2,3,4,5-pentanepentol"), and its WebBook value is labelled liquid. The maintainer decides.
- **22 with no open data**, each listing the sources searched: 2-methylfuran, 2-methyltetrahydrofuran, CPME, methyl
  lactate, HMF, xylitol (held), malic acid, glycolic acid, glucaric acid, 3-hydroxypropionic acid, FDCA, BHET,
  diphenolic acid, muconic acid, glycerol carbonate, solketal, alpha-angelica lactone, isosorbide, dimethyl FDCA, BHMF,
  levoglucosenone, EMF. Two measurements exist behind paywalls with no free copy (HMF: Ind. Eng. Chem. Res. 2009;
  glycolic acid: Russ. J. Phys. Chem. 2010); for several others only computed or group-additivity values were found,
  which are not data.
- ChemSep's heats of combustion were not taken: they refer to the compound's standard state (the liquid for a liquid),
  so they do not mix with ideal-gas formation data; heats of reaction come from the enthalpies of formation.

The record keeps the state measured; turning a liquid or crystal value into the ideal gas, or into the liquid of a
nonvolatile component, is the reactor step's (proposal 0010, step 3).

To check: compare the stored values in `measured.json` with the WebBook pages and ThermoML records they name, and the
CODATA values in its `_codata` block with the table.
