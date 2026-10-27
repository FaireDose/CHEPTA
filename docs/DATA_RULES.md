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
   repositories, and the supplementary information of a paywalled article where the publisher makes it free to read
   (kind "free supplement"; Lomba et al. 2011): its numbers are used, but not the article's own (its stated
   uncertainties, for example);
6. free books (public domain or openly licensed);
7. supplier data, as a last resort, for single constants only (below, "Supplier data").

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
- supplier catalogues and data sheets as measurements: they are never fitted, and they are used only as "Supplier
  data" below, with the tier `supplier`;
- estimated values presented as data. Group-contribution estimates (Joback, UNIFAC) are not used for constants;
  Modified UNIFAC 2.0 is used only as a model, with the tier "predicted" (section 7). Where a property has no open
  measured value at all, an open group-contribution method may predict it, labelled tier "predicted" with its method
  and accuracy (section 10); it is never mixed with measured values.

<a id="search-order"></a>**How to search for a missing number.** When CHEPTA lacks a property of a component, CHEPTA's data
file `src/data/components.json` holds a **"no open data" note** in its place: what is missing, and the list of places
already searched (`searched`). The latest `docs/MISSING_PROPERTIES_<date>.md` (section 12) collects all the notes.
To fill one, do these steps in order and stop when the number is found:

1. **Read the note and the latest missing-properties file**, so the same places are not searched again. Start where
   the last search stopped, and with what a person was asked to download.
2. **The databases**: CoolProp, the NIST WebBook, ChemSep and the ThermoML Archive. `gap_report.py` asks them all for a
   component (`--new ID:CAS` for a chemical CHEPTA does not have yet).
3. **The full texts of open articles**: `fulltext_search.py` (section 13) lists the articles where the component and
   the property are named together, with the passage. Read each passage, and take a value only as "Measured values in
   articles" below says.
4. **A free copy of every useful article that is behind a paywall**, and of the original measurement an open article
   names: `open_copy.py --all` (section 13). Where a server refuses scripts, ask the person to download the file.
   **And its supplement**: the supplementary information of a paywalled article is often free, and often holds the
   measured tables (the maintainer, 2026-10-27): `open_copy.py --supplements` finds it for ACS and Elsevier articles,
   and gives the article page for the others.
5. **Beyond the indexes**: a web search, the free NIST reprints of J. Phys. Chem. Ref. Data, open theses, free books.
6. **Supplier data**, only for a single constant (a melting point, a boiling point, a density at one temperature),
   below.
7. **Nothing found**: the note stays "no open data". Add what was searched, the articles that have the number but no
   free copy (with their DOI, so a person can try to get them), and the indexes that could not be used.

Write down every step, found or not: in the note's `searched` list, and for step 3 in the search record
`validation/data/searches/<date>-fulltext.json`, which `missing_properties.py` shows next to each gap. (The scripts call
the note a "marker": `vapourPressure_missing`, `critical`, and `available: false` on a property.)

<a id="modelling-papers"></a>**Measured values in articles, modelling and simulation papers included** (the maintainer, 2026-10-22: "in the
articles where you see simulations they have some data and cited sources for comparison? use those"). An article that
fits a model (an equation of state, PC-SAFT, COSMO-RS) or runs a simulation often prints the measured values it
compares with. An open article counts as the open copy of the measured values it prints:

- its own measurements (Baird et al. 2019 measured levoglucosenone's vapour pressure for a PC-SAFT paper);
- an open thesis counts as an open article (kind "open thesis"): its own measurements, and the values it quotes with
  the measuring article named (Buchholz 2018, the lactide melt; Andreeva 2021, levoglucosenone's enthalpy of
  formation, measured in the same group's article; 2026-10-27);
- values it quotes with the measuring article named: the open article is cited, together with that original. Where
  the original is open, its numbers are checked there and it is the source;
- not values it quotes from a commercial databank or a handbook (DIPPR, Yaws, CRC, DDB): they stay that source's, as
  for open libraries (source 4);
- not its model's or simulation's results, nor its fitted parameters, even when they carry the name of a physical
  quantity: a model's association energy is not a measured enthalpy (2026-10-22: the dimerization parameters of the
  NRHB model, Tsivintzelis et al. 2017). They may be named as a cross-check (Wasik et al. 2025: Monte Carlo
  dimerization enthalpies of formic acid against the fitted -63.2 kJ/mol), never as data.

<a id="free-copies"></a>**Free copies** (the maintainer, 2026-10-15; proposal 0014, step 1). A paywalled article may have a
legal free copy: the publisher's open-access version, or an accepted or submitted manuscript in a repository. Look it
up with `python validation/python/open_copy.py DOI ... --cache DIR --all`, which asks Unpaywall, OpenAlex and CORE for
every copy (in a batch, `gap_report.py --open-copies`, Unpaywall only). Such a copy is open: cite the published
article, the link to the copy and its version, and check the numbers in that copy. A preprint or a manuscript is a
source of the kind "free copy" (`src/data/sources.json`), and the record says when it was not peer reviewed (Nikitin
et al. 2023 and Bogatishcheva et al. 2026, read on SSRN; 2026-10-22). `--fetch DIR` downloads the first
copy that really is a PDF: a server may answer "200 OK" with an HTML page (a login, a robot check), which is never
kept as the article. Where a repository serves its PDFs to browsers only, the script prints the link, for a person to
download (the maintainer, 2026-10-22: "if you want to stop and ask me to download something let me know"). The
indexes do not know every copy (the free NIST reprints of J. Phys. Chem. Ref. Data are in none of them), so "no copy
found" is not "no open data" by itself.

<a id="supplier-data-last-resort"></a>**Supplier data, last resort** (the maintainer, 2026-10-22: "if nothing found in open literature than check
these websites and if they are similar within a small range take from there and note that it is an average for the
values from few places"). Chemical suppliers (Merck/Sigma-Aldrich, TCI, Thermo Fisher/Alfa Aesar and the like) print
a few constants on their product pages and specification sheets, free to read. They may make a record only when:

- the full open search (steps 1-5 of "How to search for a missing number") found no measured value of that
  constant, and the record lists what was searched;
- the constant is a single number: a melting point, a normal boiling point (or a boiling point at a stated
  pressure), or a density at a stated temperature. Never a temperature curve, an enthalpy, a heat capacity, a
  dimerization constant or a mixture property, and never fitted into a correlation;
- the values come from **at least three suppliers**, for products of **at least 98 % assay** (analytical, reagent or
  "for synthesis" grade), and agree **within 2 K** (temperatures) or **1 %** (densities). A printed range (165-168
  degC) counts as its midpoint, with half its width as that supplier's spread;
- the record is their **mean**, with the spread of the values as its uncertainty, tier `supplier`, and says so: "an
  average of the values printed by N suppliers, not a measurement". Each value is cited with the supplier, the
  product number, its grade and assay, the page's address and the date it was read. A value marked "decomposes",
  "sublimes" or "lit." (copied from the literature) is noted as such;
- suppliers often print the same handbook value, so their agreement is not three measurements: a measured value
  found later replaces the supplier record, and a supplier record is never mixed with measured values.

If the values disagree by more than the limits, or fewer than three suppliers print the constant, the property stays
"no open data", with the supplier values listed in its note.

**New chemicals** (AGENTS.md rule 8; the maintainer, 2026-10-21): a chemical met in a task that CHEPTA does not have
is proposed for addition, with the properties the task needs, never replaced silently. `gap_report.py --new ID:CAS`
shows what each open source has; the person decides; it is then added by the path below. A stand-in used until then
(neopentane counted as isopentane in the natural gases of the phase-envelope examples, until it was added on
2026-10-21) is stated in the data file and wherever it is shown.

## 2. Which path a component takes

| The component is | Script | Records from |
|---|---|---|
| a CoolProp fluid | `fit_properties.py` | CoolProp, then the WebBook, then ChemSep (the chain of proposal 0002) |
| in the ChemSep databank | `fit_properties.py` | ChemSep, taken as it is |
| in neither | `measured_components.py` | measured data only: ThermoML Archive, WebBook, open-access articles |

A component's identity (formula, structure, CAS) comes from the `chemicals` library. Where that library files the
compound under another CAS number or stereo form (D-xylose as dl-xylose; cis,cis-muconic acid without its double-bond
geometry), it comes from PubChem instead, stored in `validation/data/pure/identity/` (`pubchem.py`); the data scripts
read it through `pubchem.chemical()`. A sugar is described in its open-chain form, for groups and for matching the
ThermoML Archive's compounds, as glucose and fructose are.

## 3. Records fitted to measured data (`measured_components.py`)

**Targets.** A record must meet the values it is fitted to within 1 % (vapour pressure, liquid density, heat
capacity, enthalpy of vaporization, surface tension) or 3 % (viscosity, thermal conductivity). Values whose stated
uncertainty is above the target make a record only where no open values meet it, at three temperatures or more: the
record is then held to the largest stated uncertainty and says so (`stated_uncertainty_percent`; section 10, "measured
before predicted"). With fewer than three temperatures, the property is "no open data at the target", with the values
listed.

**Surface tension rows** of the ThermoML Archive name the phases liquid and gas (or air at 1 atm). They are kept;
only liquid-density, heat-capacity and viscosity rows that name a gas phase are left out (2026-10-17: the old filter
dropped every surface tension measured against the vapour).

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
alcohol). When the measured vapour pressures stop short of 101.325 kPa, the curve is extended to it only from a last
measured value at **50 kPa or more** (the maintainer, 2026-10-25: limonene's curve stopped 0.2 K short). The record
then covers the boiling point, says how far it was extended, and states the error that
`validation/python/tb_extrapolation_check.py` measured for such an extension on CoolProp's reference curves of 22
liquids (10 values over a factor of 30 in pressure, 1 % scatter, the worst liquid): from 95 kPa within 0.9 K, from
50 kPa within 2.5 K; from 20 kPa up to 6 K, and from 7 kPa up to 14 K. Below 50 kPa the component has no normal
boiling point, and its `Tb_note` says why and gives the extended value only as an indication (solketal, glycerol
carbonate, levoglucosenone).

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
median of the enthalpies of fusion), else ChemSep, else the ThermoML Archive. Where the WebBook lists no melting
temperature but an enthalpy of fusion measured at a stated temperature, and ChemSep has no melting data, that
temperature is taken (HMF: 308.5 K, DSC; such a temperature is not always the melting point, so ChemSep comes first).
An enthalpy of fusion counts when it was measured within 3 K of the melting temperature; for 1,3-propanediol 3.5 K, by
the maintainer's decision (2026-10-18: its only value, at 249 K, against the triple point of 245.5 K).

**Single values only.** Where the open values of a property are single temperatures from several articles, with no
series, there is no record, except where the maintainer decides otherwise. Dichloromethane's liquid heat capacity
(2026-10-18) is the mean of its open single values, a constant over 292.5 K to its normal boiling point, 313.1 K (10 K
beyond the values, also by the maintainer's decision), held to their largest deviation from it (`cp_single_values`).

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
  the vapour-pressure records. A set held at one temperature whose recorded temperature drifts by 0.5 K or less is one
  isotherm, at the mean temperature.
- A fit is written when it follows its data within 0.5 K and 0.012 in y (1.5 % in P). Between that and 2.5 K, 0.02,
  3 % it is written with a quality warning and a "fit-quality" known issue. A fit that predicts a liquid split inside
  its data range is never written.
- The property method of a test or example follows [METHOD_SELECTION.md](METHOD_SELECTION.md).

## 6. Components without measured critical constants (proposal 0009)

Such a component has `Tc_K`, `Pc_Pa` and `omega` null and a `critical` note with the sources searched.

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
leave the balance one H over per such ring (THF, (CH2)2CB, FURFURAL; isosorbide's two THF rings: two H), which is
stated. Where DDBST's assignment itself fails the atom balance (solketal, as the thermo library lists it), it is not
used (`DDBST_FAILS_BALANCE`). Without a DDBST assignment, the structure-based one is used after a
check of the structure (`REVIEWED`), or corrected when it is plainly wrong (`FROM_STRUCTURE`). A ring the method has
no subgroup for is built from the groups it has (the maintainer, 2026-10-14): a furan ring as the ether CH-O (CHO), one
C=C and a ring CH, with what is not represented (the second double bond, the aromatic character) stated. An
anhydride and the small gases cannot be described: those components have no groups, and say so. The UNIFAC
Consortium's newer groups (anhydrides, lactones, ...) are for its members only, so they are not used. Where measured
data show the prediction is off, a "predicted-deviation" known issue says by how much; the user compares the models and
decides.

## 8. What every record carries

- `source` (the citation, the table, the fit and its maximum deviation) and `source_ids` (run `make_sources.py`).
- `tier`: standard, fitted, databank, predicted, or supplier (section 1, "Supplier data").
- The values it was fitted to, in `validation/data/pure/<id>.json` (`test/properties.test.js` checks the record
  against them).
- Values left out, with their deviation and the reason.
- The licence of every new source in [src/data/LICENSES.md](../src/data/LICENSES.md).

## 9. Before the pull request

1. Run the scripts in this order after a component change: the component script, `fusion_data.py --write`,
   `formation_data.py --write`, `make_sources.py`, `mod_unifac_2.py --write`, then `validation/report/make_cases.py` and `make_reference.py`; then
   `npm run wanted`, `npm run build` and `npm test`. When the change fills a gap or finds a new one, write a new
   dated list of the missing properties (section 12).
2. Never change validation data or tests to make results pass (AGENTS.md rule 6). Changing a test that counts or
   lists components, or that a new kind of component makes wrong, is fine; say why in the test.
3. Ask the person to compare every transcribed value with its source (AGENTS.md rule 4).
4. Record what the maintainer decided in a new file of [decisions/](decisions/), and update the open items in
   [DECISIONS.md](DECISIONS.md).

## 10. Predicted properties and nonvolatile components (proposal 0009, step 5)

**Predicted, not refused (the maintainer, 2026-10-14):** "definitely not refuse ... there should be some data or
predicted like Mod. UNIFAC". Where no open source has a measured value of a property a calculation needs, an open
group-contribution method predicts it:

- liquid heat capacity: Ruzicka and Domalski (1993), J. Phys. Chem. Ref. Data 22, 597 and 619 (free NIST reprints),
  transcribed from the page images into `validation/data/gc/ruzicka_domalski_1993.json` (`predict_cp.py`);
- the record has tier "predicted", names the groups and every approximation (a group the method lacks counted as its
  nearest group, as for the furan ring of Modified UNIFAC 2.0), and states the method's accuracy on CHEPTA liquids
  with CoolProp or ChemSep records, computed by `predict_cp.py` on its check set (twenty liquids on 2026-10-16: within
  5.3 % at 300 K for all; up to 400 K within 8.6 % except alcohols and polyols, which it overpredicts more as the
  temperature rises, up to +19 % at 400 K). An earlier version of this page said "within 3.4 % at 300 K for all
  fifteen checked"; that was wrong (diethyl ether -5.3 %, ethyl acetate -3.8 %);
- the range is where every group was fitted, with its upper end raised by 100 K: the authors find that an
  extrapolation of up to about 100 K "has no significant effect on the error of prediction" (part II, p. 620), and on
  furfural the furan ring correction, fitted to 305 K, stays within 3.4 % of the record up to 405 K. Not for polyols
  (two or more alcohol groups): on the check set the polyol groups drift far beyond their range (glycerol +42 % at
  560 K). One group is used beyond that rule, up to 380 K (confirmed by the maintainer, 2026-10-17): the ether and
  ester carbon C-(H)(C)2(O), fitted at 130-170 K only, which THFA, CPME and the triglycerides need; on isopropyl acetate
  (ChemSep record) the prediction with it stays within 8.1 % from 220 to 380 K, and on 2-methyltetrahydrofuran within
  4.5 % of the measured values (`ether_check` in `predict_cp.py`, stated in each record that uses it). Methane
  derivatives (dichloromethane) have no group in the method;
- **measured before predicted** (2026-10-16): where the only alternative is a prediction, measured values whose
  stated uncertainty is above the target of section 3 make the record, with that uncertainty stated (fructose: liquid
  heat capacities stated to 2 %, where the prediction is 7-22 % above them at 200-370 K). Single measured values that cannot
  make a record are listed in the predicted record with the prediction's deviation from them. This holds for every
  component, volatile or not (2026-10-17: the levulinates, levulinic acid, GVL, 2-MeTHF, 1,3-propanediol, isoamyl
  alcohol and diethyl carbonate, with stated uncertainties of 1.5-5.2 %; `cp_measured_or_predicted` in
  `measured_components.py`, also called by `fit_properties.py`); such a record carries `stated_uncertainty_percent`,
  the target it is held to (`test/properties.test.js`). The same holds for every other property of section 3
  (2026-10-17): where no open values meet the target, measured values above it make the record, named "used because
  no open values meet the target" (GVL viscosity, 4.2 %; lactic acid density, 7.2 %; 2-methoxyethanol surface tension,
  2.9 %; `fit_or_marker` in `measured_components.py`).

**Ideal-gas heat capacity without open data** (the maintainer, 2026-10-17, after a literature search found none open
for 15 volatile components): it is derived from the liquid's records by Kirchhoff's path, h_IG(T) = integral of
cp_L + (dHvap - h_R,sat)(T) - (dHvap - h_R,sat)(298.15 K), where the liquid heat capacity and the heat of
vaporization both apply from 298.15 K (`src/thermo/pure.js`); outside that range it refuses. On the CHEPTA liquids with
an ideal-gas record it is within 5 % at 300 K for half of them, 22 % for 90 %, and within 2.6 % for furan and
2-methylfuran, whose records are made the same way as those of the components that use it
(`test/derived-ideal-gas.test.js`). The Burcat–Ruscic database is free to read but forbids inclusion in commercial
software without permission, so it is not used.

**Nonvolatile components:** a component that does not evaporate in the processes where it appears (it decomposes,
polymerizes, or has no measurable vapour pressure) has `"class": "nonvolatile"` and no vapour pressure, critical
constants or vapour properties. Activity models keep it in the liquid (a vapour pressure of 1e-20 kPa keeps the flash
finite: its vapour mole fraction stays below 1e-20); a vapour fraction above the share of the other components, a dew
point and the equations of state are refused with the reason. Nonvolatile components alone make a system too (the
maintainer, 2026-10-16: heat a nonvolatile chemical, then cool it): the feed stays liquid, and a bubble point or a
vapour-fraction specification is refused with the reason. Its liquid enthalpy is the integral of its liquid heat
capacity from 298.15 K, so its reference state is the liquid there; that is enough for energy balances without
reactions. `measured_components.py` (`build_nonvolatile`) builds it from the measured values that meet the targets,
with the heat capacity predicted where none is measured. A volatile liquid without open vapour pressures (solketal,
alpha-angelica lactone) is not made nonvolatile: that would make every distillation with it wrong.

**Liquids without an open vapour pressure** (the maintainer, 2026-10-20): such a component is added with a "no open
data" note for its vapour pressure (`vapourPressure_missing`, with the sources searched; `build_no_vp` in
`measured_components.py`) and its other records from measured data. It has no normal boiling point, critical
constants or vapour records. Activity coefficients, liquid-liquid and solid-liquid equilibria work with it; whatever
needs its vapour pressure (bubble and dew points, flashes, vapour-liquid diagrams) refuses with the sources searched,
until the user gives a vapour pressure of their own in My data (proposal 0012). No vapour pressure is predicted:
SIMPOL.1, the only open group-contribution method that covers these molecules, was checked on 109 CHEPTA components and
not accepted (errors of a factor of 2 and more). Supplier catalogues and compilations that give a single boiling point
are listed in the note, never fitted (section 1; a supplier boiling point is not a vapour-pressure curve). Terephthalic acid is a nonvolatile liquid up to an assumed melting temperature of 400 degC, by the
maintainer's choice (2026-10-17; it sublimes at 402-404 degC). Nor is a substance
that is distilled or sublimed in its own processes (lactide, isosorbide, BHMF, dimethyl FDCA, levoglucosan; held in
batch 4 for want of an open liquid vapour pressure). A substance whose measured volatility is negligible beside its
solvents may be (HMF: its WebBook boiling temperature of 388.2 K at 0.1 kPa, where water's vapour pressure is
169.5 kPa; its vacuum distillation is then not represented, and the record says so).

## 11. Enthalpy and Gibbs energy of formation (proposal 0010, step 1)

`formation_data.py` makes each component's `formation` record (the maintainer, 2026-10-22):

- **ChemSep has the compound:** its ideal-gas enthalpy and Gibbs energy of formation at 298.15 K, **taken as they
  are** (section 1); the elements in their reference state are zero. ChemSep does not state the standard pressure of
  its Gibbs energies in the file. The one exception, by the maintainer's decision, is formic acid (2026-10-22): ChemSep's
  value is 15 kJ/mol below the WebBook's measured gas values, so its record takes those
  (`WEBBOOK_GAS_OVER_CHEMSEP`, with the reason).
- **ChemSep does not:** the measured values, searched in the NIST WebBook, the ThermoML Archive's combustion
  reactions and entropies, and the open literature (the maintainer, 2026-10-22: "search everything now"), stored as
  found in `validation/data/pure/formation/measured.json`, and, for a value printed in an open article or thesis, in
  `validation/data/pure/formation/article_<id>_*.json` with its source (2026-10-27):
  - one value per article: a measured enthalpy of formation of the liquid or the crystal, or an enthalpy or energy
    of combustion turned into one with the CODATA key values of CO2 (g) and H2O (l) (open table, codata.info);
  - the state the component is in at 298.15 K (the crystal above its melting temperature, else the liquid); values of
    the other condensed state are left out and named;
  - a liquid or gas value may come from either enantiomer or the racemate; a crystal value only from the crystal the
    component's own records refer to (a racemic and an enantiopure crystal, or two anomers, are different solids);
  - the median of the articles, with their number and spread; a spread above 10 kJ/mol is stated as "uncertain";
  - the Gibbs energy of formation only where an open standard entropy of the same state and form exists, with the
    CODATA entropies of the elements; else none;
  - values that disagree with nothing open to decide between them are held for the maintainer (`HOLD`, xylitol);
  - nothing open: `{available: false, searched}`, the sources searched. Computed (quantum-chemical) and
    group-additivity values are not data and are not used.
- The record keeps the state measured. Turning a liquid or crystal value into the ideal gas, or into the liquid of a
  nonvolatile component, is the reactor step's (proposal 0010, step 3), with the component's own records.

## 12. The list of missing properties: one dated file per update

The maintainer, 2026-10-22: "make a new file with the day of today so we keep track. add this as a rule".

- What the databank still lacks (every "no open data" note, the predicted-only records, the components without
  UNIQUAC r and q or Modified UNIFAC 2.0 groups) is written to a new file, `docs/MISSING_PROPERTIES_<date>.md`, at
  every update. It is made by `validation/python/missing_properties.py --date <date> --since <revision>`; `--since`
  is the commit of the previous file, and the new file says what changed since then.
- A second update on the same day is a new file with `-2` after the date (`MISSING_PROPERTIES_2026-10-22-2.md`).
- The earlier files are not edited, so the gaps can be followed over time; `docs/README.md` and `docs/DECISIONS.md`
  link the latest one.
- Prose the script does not write (what a search found, the recommendation still to decide) is added below its
  tables, and carried over from the previous file while it is open.

## 13. The search tools (proposal 0014, steps 1 and 2)

Two scripts in `validation/python/` do steps 3 and 4 of "How to search for a missing number" (section 1). They find
articles; they never take a number. Each value is read in the article by a person or an assistant, and a person checks
it against the article before it is added (AGENTS.md rule 4).

**`open_copy.py`: the legal free copies of an article.**

- `python validation/python/open_copy.py DOI ... --cache DIR` prints Unpaywall's best free copy (as before;
  `gap_report.py --open-copies` uses it).
- `--all` lists every copy that three indexes know: Unpaywall (all its locations), OpenAlex and CORE. A repository
  copy is often missing from Unpaywall (Baird et al. 2019: Unpaywall gave only the publisher's copy, OpenAlex also the
  Aalto and OSF copies).
- A CORE record with neither a download nor a text is CORE's copy of the Crossref metadata: it is not listed as a
  copy (2026-10-25).
- `--supplements` lists an article's supplementary files, free even where the article is paywalled (2026-10-27): ACS
  supporting information through the figshare API (by the article's DOI), Elsevier files under the article's PII
  (from Crossref, `mmc1` to `mmc4`); for MDPI, RSC, Wiley, Springer and Taylor & Francis it gives the article page, for
  a person to open. Their numbers are used with the kind "free supplement" (section 1, source 5).
- `--fetch DIR` downloads the first copy that really is a PDF (it starts with "%PDF"). A server may answer "200 OK"
  with an HTML page (a login, a robot check, a landing page): such an answer is never kept. A repository landing page
  is followed to the PDF named in its `citation_pdf_url` tag. Where a server serves PDFs to browsers only (403 to
  scripts: Springer, ScienceDirect, the Aalto and DTU repositories on 2026-10-22), the script prints the link and the
  person downloads it.
- The answers are cached per DOI in the cache directory.

**`fulltext_search.py`: open articles whose full text names a missing property.**

- `python validation/python/fulltext_search.py --cache DIR --out FILE [--only ID ...] [--props KEY ...]
  [--indexes europepmc openalex core]`.
- For each "no open data" note it asks for articles where one of the component's names (the name, the aliases
  without acronyms, the CAS number) appears together with a word for the property ("vapor pressure", "vapour
  pressure", "saturation pressure", ...). By default it searches the properties a calculation needs (vapour pressure,
  liquid density, heat of vaporization, liquid heat capacity, melting data, formation data, critical constants,
  normal boiling point); the transport properties and the ideal-gas heat capacity only with `--props`.
- It reads each article it can get and lists the passages (a table or a paragraph, or twelve lines of a PDF) where a
  name, as a whole word, and the property word appear together; a passage with numbers ranks first. Each listed
  passage is then read, and the article where it points to a value.
- The three indexes:

  | Index | What it covers | Key | How the text is read |
  |---|---|---|---|
  | Europe PMC | the biomedical literature and the journals deposited in PubMed Central (MDPI, ACS Omega, RSC Advances, Scientific Reports); not J. Chem. Eng. Data, J. Chem. Thermodyn., Fluid Phase Equilib. or Int. J. Thermophys. | none | its open full text (XML) |
  | OpenAlex | open-access works of all fields, the chemistry journals included; its data are CC0 | free, a daily budget of US$1 (about 1000 queries); without a key a small budget shared by everyone on the same network address | one query per gap, (names) AND (property words), open-access works only; each hit's open copy fetched as a PDF |
  | CORE | the full texts of open repositories | free, under CORE's personal licence: the maintainer asked CORE (2026-10-22) and has the agreement (2026-10-23) | one query per name form and gap, of single words joined by AND and OR (its parser ignores a group that holds an AND inside an OR, finds nothing for a quoted phrase, and refuses a field name); the passages are then screened for the exact names and property words; the text comes with each hit, else its open copy is fetched as a PDF; paced at one query per 7 s (its limit is 10 per minute) |

- **The keys** are network secrets of the cloud environment (the environment's settings, Network secrets): secret
  type Bearer, allowed website `api.openalex.org` (one secret) and `api.core.ac.uk` (another), header `Authorization`
  with the prefix `Bearer` and the key as its value. The secret adds the header to every request to that website; the
  script never sees the key. On a computer of one's own, the variables `OPENALEX_API_KEY` and `CORE_API_KEY` do the
  same.
- Many publishers refuse scripts: on 2026-10-22, 271 of the 1185 articles OpenAlex found could be downloaded and read.
  An article the script could not read is not "searched": it is listed in the record, for a person to open.
- **The record of a search** is written to `validation/data/searches/<date>-fulltext.json`: for each gap, the
  articles found and read per index, the passages, and what they held, in one line ("none of the pure compound" when
  the passages name the component as a reactant, product, solvent or ligand, or give a value of a mixture). It also
  says which indexes were asked and which were not, and why. `missing_properties.py` shows it next to the gaps.
