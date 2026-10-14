# Rules for adding thermodynamic data

How CHEPTA takes, fits, checks and records thermodynamic data. Read this before adding or changing a component, a
property record or a pair, whether you are a person or an AI assistant. It gathers in one place what
[AGENTS.md](../AGENTS.md), the standing rules of [DECISIONS.md](DECISIONS.md), the proposals and the scripts in
`validation/python/` apply. Where this page and a script differ, the script is what runs: fix the page or the script
in the same pull request, and record the decision in [decisions/](decisions/).

## 1. Where numbers may come from

Only from sources anyone can read for free and legally, so that every reviewer can check them. In this order
(AGENTS.md rule 1), and say which one was used:

1. official standards with published equations (IAPWS for water);
2. CoolProp (open source; reference equations of state from the cited literature);
3. the NIST Chemistry WebBook;
4. open databanks and libraries: **ChemSep** (Artistic License 2.0), thermo, chemicals. A table copied from a handbook
   or a commercial databank is not open just because an open library ships it;
5. the NIST TRC ThermoML Archive (its data are open even where the article is paywalled), open-access articles, open
   repositories;
6. free books (public domain or openly licensed).

What to take from where (the maintainer, 2026-10-14): take a number from the source that has it, and do not take a
number that then has to be compared with another source.

| Data | Where from |
|---|---|
| Pure-component properties (constants, vapour pressure, density, heat capacity, enthalpy of vaporization, transport properties, UNIQUAC r and q) | ChemSep when it has them, **taken as they are**: its equations are known and its authors maintain them, so a ChemSep record is not compared with measured data or refitted. The ThermoML Archive and open articles only for what ChemSep and the sources before it do not have. |
| Mixture data (VLE, azeotropes, excess enthalpies, liquid-liquid data) | The ThermoML Archive and open-access articles, **directly**. |
| Components in neither CoolProp nor ChemSep | Measured data only (section 3). |

Never:

- numbers from memory, or from a source not opened in the same session (AGENTS.md rule 2);
- paywalled articles or commercial databanks (DDB, DIPPR, DECHEMA) unless the same numbers are open. A paywalled
  article may be read to understand a method, but it is not cited and its numbers are not used;
- supplier catalogues and data sheets as measurements (they may be listed, never fitted);
- estimated values presented as data. Group-contribution estimates (Joback, UNIFAC) are not used for constants;
  Modified UNIFAC 2.0 is used only as a model, with the tier "predicted" (section 7).

If nothing open has a number, write **"no open data"** with the sources searched. Search the open literature too, not
only the databases (the maintainer, 2026-10-13).

## 2. Which path a component takes

| The component is | Script | Records from |
|---|---|---|
| a CoolProp fluid | `fit_properties.py` | CoolProp, then the WebBook, then ChemSep (the chain of proposal 0002) |
| in the ChemSep databank | `fit_properties.py` | ChemSep, taken as it is |
| in neither | `measured_components.py` | measured data only: ThermoML Archive, WebBook, open-access articles |

## 3. Records fitted to measured data (`measured_components.py`)

**Targets.** A record must meet the values it is fitted to within 1 % (vapour pressure, liquid density, heat
capacity, enthalpy of vaporization, surface tension) or 3 % (viscosity, thermal conductivity). Values whose stated
uncertainty is above the target do not make a record by themselves: with fewer than three temperatures within the
target, the property is "no open data at the target", with the values listed (for example the liquid heat capacities
of Nikitin et al. 2019, stated 2.4 %).

**Ranges.** A record covers the temperatures that were measured. Outside them the engine refuses with an
out-of-range error instead of extrapolating. With a measured critical point, the vapour-pressure curve runs to the
critical point and says where only the critical point holds it.

**Critical constants.** Measured values only (WebBook or ThermoML Archive), with the article named and, when several
disagree, the reason for the choice. None measured anywhere open: the component has no Tc, Pc or acentric factor
(section 6). They are never estimated.

**Several vapour-pressure sets: when to pool (the maintainer's rule, 2026-10-14).** A small stated uncertainty is
the authors' claim, not proof that a set is right.

1. Pool the sets only when they agree. Fit them together, each article with the same total weight (point weight
   1 / (u √n), u the stated uncertainty with a floor of 0.5 %, 1 % where none is stated). They agree when each set's
   mean deviation from the pooled curve lies within its mean stated uncertainty.
2. A single value is left out only when the fit misses it by more than three times its uncertainty; the record lists
   it with its deviation and the reason.
3. When the sets disagree, the script stops. A set may then be chosen, or left out (`vp_exclude`), only with a stated
   physical reason, for example the method does not suit the substance (transpiration takes the vapour as monomer, so
   it overstates the pressure of an acid that dimerizes) or the set fails the independent checks. Without such a
   reason the component is held, with the data that would decide.
4. Check the curve against evidence it was not fitted to, and state it in the record: the measured normal boiling
   temperatures of other articles, the WebBook average of the measured boiling points, and the calorimetric
   enthalpies of vaporization through the curve's slope.

The details (equal weight per article, the 0.5 % floor, three times the uncertainty) are this project's choices, not a
published standard.

**Compilations** (Stull 1947, CRC tables as listed on the WebBook) are labelled with their year and used as
cross-checks. They are fitted only where no measured set covers the range (levulinic acid above 375 K, 2,3-butanediol);
the record then says so.

**The normal boiling point** is where the vapour-pressure record reaches 101.325 kPa. When the measured vapour
pressures stop far below it, the WebBook's measured boiling temperature may complete the curve, with the maintainer's
agreement (butyl levulinate). It is not used when it contradicts measured vapour pressures near it (tetrahydrofurfuryl
alcohol). When the measured vapour pressures stop just short of 101.325 kPa and nothing else completes the curve, the
component has no normal boiling point, and says why (`Tb_note`).

**Enthalpy of vaporization.** Calorimetric values over a temperature range: fitted directly. Only one temperature or
none: the Clapeyron equation with the vapour-pressure record, fitted together with the calorimetric values, which it
must meet within their uncertainty. With critical constants: Peng–Robinson volumes, up to 500 kPa or the last measured
vapour pressure, whichever is lower. Without them: an ideal-gas vapour, up to 10 kPa.

**Liquid and vapour states with no overlap ("a gap").** When no temperature has both a vapour pressure and a liquid
density, the component may be added with the gap if its vapour-pressure sets pass the rule above (the maintainer,
2026-10-14; levulinic acid). Each record refuses outside its own range.

**Stereoisomers.** Data for either enantiomer, or the racemate, may serve one component (mirror images have the same
thermodynamic properties; limonene, `inchi_no_stereo`). Diastereomers (meso and chiral 2,3-butanediol) may not.

**Melting data** (`fusion_data.py`): the WebBook (triple point, else the average of the measured melting points; the
median of the enthalpies of fusion), else ChemSep, else the ThermoML Archive.

## 4. Records refitted before 2026-10-14

Until 2026-10-14 every ChemSep record was compared with the measured values of the ThermoML Archive, and refitted to
them when it missed them clearly (`MEASURED_REFIT` in `fit_properties.py`: glycerol, phenol, N-methyl-2-pyrrolidone and
others; each record says why). Those refits stay. The comparison itself was removed on 2026-10-14 (the maintainer: "I
want something lean"): no script, test or report section compares a ChemSep record with measured data any more, and no
new refit of a ChemSep record is made (section 1).

## 5. Pairs (NRTL, UNIQUAC, k_ij)

- Where a pair has a set fitted to measured mixture data (ThermoML Archive, open articles), that set is the default;
  the ChemSep set of the same pair stays as an alternative the user can choose (`sets`, `prefer`). The ChemSep set is
  the default only where no measured mixture data were fitted (the maintainer, 2026-10-14; `test/library.test.js`).
- Open databank sets (ChemSep) are imported as tier "databank".
- Fits to measured vapour-liquid data from the ThermoML Archive (`vle_batch.py`, then `fit_parameters.py`): isobaric
  T-x-y near 101.3 kPa first, that passes the point test of thermodynamic consistency; then other pressures; then
  isothermal P-x(-y); then bubble temperatures alone. The set's pure-component boiling points must be within 1 K of
  the vapour-pressure records.
- A fit is written when it follows its data within 0.5 K and 0.012 in y (1.5 % in P). Between that and 2.5 K, 0.02,
  3 % it is written with a quality warning and a "fit-quality" known issue. A fit that predicts a liquid split inside
  its data range is never written.
- The property method of a test or example follows [METHOD_SELECTION.md](METHOD_SELECTION.md).

## 6. Components without measured critical constants (proposal 0009)

Such a component has `Tc_K`, `Pc_Pa` and `omega` null and a `critical` marker with the sources searched.

- Activity models (NRTL, UNIQUAC, Modified UNIFAC 2.0, ideal solution) with an ideal-gas vapour use it.
- Peng–Robinson and SRK, for both phases or for an activity model's vapour, refuse it and say why
  (`src/thermo/critical.js`).
- Its pure vapour is an ideal gas.
- Its records cover the measured temperatures only: the vapour-pressure curve has no critical-point anchor, and liquid
  density and surface tension are polynomials in T.

## 7. Modified UNIFAC 2.0 (predicted tier)

The parameters are those of the paper (Hayer, Hasse and Jirasek 2025; CC BY 4.0), unchanged: no refits. It is a
prediction tool for when there are no data, so every component whose structure the subgroups can describe gets groups,
without waiting for a person to choose (the maintainer, 2026-10-14). A component's groups come from its structure
(thermo SMARTS) and must pass the atom balance; DDBST's published assignment is the check. When the two differ, DDBST's
is used (`CHOSEN` in `mod_unifac_2.py`); a substituted ring carbon counted in the ring's subgroup, as DDBST does, may
leave the balance one H over, which is stated. Without a DDBST assignment, the structure-based one is used after a
check of the structure (`REVIEWED`), or corrected when it is plainly wrong (`FROM_STRUCTURE`). The subgroups cannot
describe a furan ring, an anhydride or the small gases: those components have no groups, and say so. The UNIFAC
Consortium's newer groups (anhydrides, lactones, ...) are for its members only, so they are not used. Where measured
data show the prediction is off, a "predicted-deviation" known issue says by how much; the user compares the models and
decides.

## 8. What every record carries

- `source` (the citation, the table, the fit and its maximum deviation) and `source_ids` (run `make_sources.py`).
- `tier`: standard, fitted, databank or predicted.
- The values it was fitted to, in `validation/data/pure/<id>.json` (`test/properties.test.js` checks the record
  against them).
- Values left out, with their deviation and the reason.
- The licence of every new source in [src/data/LICENSES.md](../src/data/LICENSES.md).

## 9. Before the pull request

1. Run the scripts in this order after a component change: the component script, `fusion_data.py --write`,
   `make_sources.py`, `mod_unifac_2.py --write`, then `validation/report/make_cases.py` and `make_reference.py`; then
   `npm run wanted`, `npm run build` and `npm test`.
2. Never change validation data or tests to make results pass (AGENTS.md rule 6). Changing a test that counts or
   lists components, or that a new kind of component makes wrong, is fine; say why in the test.
3. Ask the person to compare every transcribed value with its source (AGENTS.md rule 4).
4. Record what the maintainer decided in a new file of [decisions/](decisions/), and update the open items in
   [DECISIONS.md](DECISIONS.md).
