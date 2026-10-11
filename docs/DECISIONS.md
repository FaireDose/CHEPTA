# Decisions and open items

A running record of what the maintainer decided while working with the AI assistant, and of
what is still pending. Anyone picking up the work, people or assistants, should start here. The
record in force is each pull request and proposal; this page points to them.

Newest first. Pull requests are in `FaireDose/Fugacity`.

## Open items (state on 2026-10-09)

### Waiting for the maintainer

- **Review and merge:**
  - [#85](https://github.com/FaireDose/Fugacity/pull/85): method advisor; older tests reviewed against the method rules.
  - [#86](https://github.com/FaireDose/Fugacity/pull/86): Newton flash; P-H search without workarounds.
  - The pull request that adds this page.
- **Proposals 0010 and 0011:** merged in [#83](https://github.com/FaireDose/Fugacity/pull/83) with status
  **Draft**. Accept or decline each one, then set its status in the file and in `proposals/README.md`. Proposal
  0009 was accepted on 2026-10-11 (batch 1 in its pull request).
- **Make the new name official** (decided 2026-10-09: **CHEPTA**, *Chemical Engineering Process Tools
  for Agents*). In this order:
  1. GitHub: Settings → General → Repository name: `CHEPTA`. GitHub redirects the old links,
     clones and pull requests to the new name.
  2. Merge the rename pull request (it already uses the new links).
  3. Settings → Pages: check that the site is served at `https://fairedose.github.io/CHEPTA/`
     (the Pages workflow runs on the merge).
  4. npm (the name `chepta` was free on 2026-10-10). npm adds a trusted publisher only to a package
     that exists, so the first upload uses a token, once:
     1. npmjs.com → profile picture → Access Tokens → Generate New Token → Granular Access Token:
        expiry 1 day, Packages and scopes: Read and write, All packages. Copy the token.
     2. GitHub → Settings → Secrets and variables → Actions → New repository secret: name `NPM_TOKEN`,
        the token as value.
     3. Publish the v0.3.0 GitHub release (Releases → the draft, or Draft a new release with tag
        `v0.3.0`). The Publish workflow stages `chepta@0.3.0` with the token and attaches the skills
        (if the release already exists: Actions → Publish to npm → Run workflow, from `main`).
     3b. npmjs.com: approve the staged version with your 2FA code (the package's Staged Packages, or the
        link in npm's e-mail). Direct publishing with a token is refused by npm since 2026; staging is
        how a token can create a new package (GitHub changelog, 2026-10-02).
     4. npmjs.com → Packages → chepta → Settings → Trusted publishing → GitHub Actions: owner
        `FaireDose`, repository `CHEPTA`, workflow `publish.yml`.
     5. Delete the `NPM_TOKEN` secret on GitHub and the token on npmjs.com. Later releases are staged
        by the workflow without a token and approved on npmjs.com.
  5. npm: deprecate the old package with a pointer, `npm deprecate fugacity "Renamed: use chepta"`.
  6. Optional: check for an existing trademark (for example in the EUIPO and USPTO search
     tools) before wider promotion, and register the name where you want it protected.
  The file formats keep their keys (`fugacity_project`, `fugacity_package`), so files and
  contribution packages made under the old name stay valid.
- **The two free component places** of proposal 0008: use them now, or keep them.
- **Proposal 0005** (association models, [#48](https://github.com/FaireDose/Fugacity/pull/48)): deferred, on hold.

### Engineering, in the suggested order

1. Equation-of-state pairs: fit PR and SRK k_ij to the archive data of the 92 nonpolar or gas pairs
   that have none (docs/PAIR_SCAN.md, "Coverage by the method each pair needs"), and import the
   ChemSep k_ij of the proposal 0008 components that the batches did not bring in (for example
   methane + n-nonane).
2. Gases in polar liquids (139 pairs with archive data): Henry's-law constants for gases in water
   from the archive; other solvents need PSRK or MHV2, not in CHEPTA yet.
3. Review the two pairs whose 1-atm data sets disagree by more than 1 K (methanol + 2-propanol,
   water + 2-propanol; docs/PAIR_SCAN.md).
4. Compressor, pump and valve blocks (shown as "coming later"). Optionally, then the energy side
   of the Cavett problem (no published values to compare with).
5. A "measured solubility" option next to the model, for a future crystallizer block.
6. Grow the flowsheet suite: more seeds, P-H drums, and reactive cases once proposal 0010 exists.
7. Two liquids with an equation of state: low priority. Only with a proper method such as CPA,
   never a plain cubic equation (decision of 2026-10-09).

### After the proposals are accepted

- **0009, green chemistry components** (accepted 2026-10-11):
  1. batch 1, 16 components from ChemSep and CoolProp (in a pull request, 2026-10-11);
  2. batch 2, lipids;
  3. batch 3, platform molecules from the WebBook and ThermoML, in small pull requests;
  4. the "nonvolatile" component class;
  5. batch 4, sugars and acids as solids.
  - Six names still need a CAS number: xylose, erythritol, muconic acid, levoglucosenone,
    glycerol carbonate, ethoxymethylfurfural.
- **0010, reactions:**
  1. formation data (ΔfH°, ΔfG°);
  2. the reaction description and its checks;
  3. conversion and yield reactors;
  4. equilibrium reactor;
  5. CSTR and plug flow;
  6. Gibbs reactor;
  7. views;
  8. benchmarks.
- **0011, agents:**
  1. the tool interface;
  2. the route-file format and its checker;
  3. two-pass extraction;
  4. the design-method file and decision records (first confirm the licence of the Northwestern
     open process-design textbook);
  5. route to flowsheet;
  6. comparison page;
  7. literature watch.

### On hold

- **UNIFAC:** until DDBST answers about the parameter licence (proposal 0008, Part A). DDBST was
  asked; nothing is installed.

## Standing rules from the maintainer

These apply to every piece of work, on top of [AGENTS.md](../AGENTS.md).

- **Pull requests:**
  - Every change goes through a pull request that the maintainer reviews and merges. The
    assistant never merges.
  - Each pull request starts from `main`; pull requests are not stacked.
- **No credit-consuming monitoring:** the assistant does not watch pull requests or schedule
  check-ins.
- **Method first (2026-10-09):** every test, benchmark and example first chooses the property
  method from the literature ([METHOD_SELECTION.md](METHOD_SELECTION.md)), then tests with it.
  For example, nobody uses an equation of state for water + ethanol, so no test should rely on
  one for that. A test that uses another method on purpose says so in a comment.
- **Rigorous methods, not patches:** when a solver fails, fix the method (as commercial
  simulators do), not the symptom.
- **Components, not reactions (2026-10-09):** the simulator ships components; users write the
  reactions of their own process, and Fugacity checks them. Reaction routes in green chemistry
  only guide which intermediates and products to add as components.
- **No two liquids with a plain cubic equation (2026-10-09):** if nobody uses it, Fugacity
  doesn't either.
- **Data:**
  - Good data and fits for everything. When ChemSep lacks something, go on to the NIST WebBook,
    the ThermoML Archive and other open sources (2026-10-06).
  - Known deviations go in the engineering report rather than being hidden (for example
    mesitylene, 2026-10-07).
- **Your files are yours:** files and results made with Fugacity belong to the people who
  make them ([#68](https://github.com/FaireDose/Fugacity/pull/68)).
- **Two licences on purpose:** MIT for the code, and the Artistic License 2.0 that must travel
  with the ChemSep data (README, [#81](https://github.com/FaireDose/Fugacity/pull/81)).

## Log

### 2026-10-11 (late): pairs of the green-chemistry components

- **Asked:** mixture parameters for the 16 new components, with the old ones and among themselves, in a pull request of
  their own after batch 1 (#103) was merged.
- **Done:** ChemSep NRTL/UNIQUAC sets for 5 pairs (1-hexanol + water, 1,4-butanediol + methanol and + water,
  diethylene glycol + water, aniline + p-cymene; three of them predict two liquids, as the import notes); ChemSep PR and
  SRK k_ij of n-hexane + 1-pentanol; the whole NIST TRC ThermoML Archive scanned again (855 CHEPTA pairs with binary
  vapour-liquid data, from 704); 76 new pairs with a data set chosen by the vle_batch rules, fitted with the same gate:
  120 NRTL/UNIQUAC sets for 64 pairs written (fitted pairs 218 -> 280 of the 3570 activity pairs). Not written, data kept:
  both models of 11 pairs (for example diethyl carbonate + water and dimethyl carbonate + glycerol, which predict a
  liquid split in the data range, ethylene carbonate + water 1.7-2.1 % in P), and one model of 6 more.
- **Pending:** the pairs of Cyrene, terephthalic acid, dimethyl terephthalate, maleic and adipic acid have no open
  vapour-liquid data in the archive; they stay on docs/DATA_WANTED.md.
- **Decided by the maintainer: sets a little outside the gate are written, with a warning.** "The gap is super small,
  even the 2 %": a generated fit outside the gate (0.5 K, 0.012 in y, 1.5 % in P) but within 2.5 K, 0.02 and 3 % is
  written with a `quality_warning` and a "fit-quality" entry in src/data/known-issues.json (the workbench shows it for
  that pair and model). Never written: a fit that predicts a liquid split inside the data range. A set within the wider
  limits replaces a ChemSep default only if it follows the same data better (seven ChemSep defaults became
  non-default; methanol + n-butyl acetate UNIQUAC kept its ChemSep set), and never replaces a set fitted to other open
  data (2-butanol + cyclohexane keeps its Belabbaci et al. 2012 set). Applied to every generated pair: 78 sets, 16 pairs
  of the new components and 33 older pairs (for example monoethanolamine + water, glycerol + water, sulfolane +
  toluene). Fitted activity pairs: 280 -> 315. The four flowsheet-suite cases whose default sets changed (G02, G04,
  G06, G10) have new reference solutions; their components are the same.

### 2026-10-11

- **Proposal 0009 accepted; batch 1 (16 green-chemistry components):** the maintainer asked for the first batch,
  using the databanks already in use and, where they have nothing, an extensive search of other open sources, newer
  or older. Added: 1,4-butanediol, Cyrene, dimethyl and diethyl carbonate, ethylene and propylene carbonate,
  acetaldehyde, 1-pentanol, 1-hexanol, 1-octanol, diethylene glycol, p-cymene, adipic acid, maleic anhydride,
  terephthalic acid, dimethyl terephthalate (ChemSep v8.3 and v8.31 data 2; dimethyl carbonate from CoolProp), with
  ThermoML checks and WebBook melting data. From outside the databanks: the Cyrene vapour pressures and densities of
  Baird et al. (Int. J. Thermophys. 2019, CC BY 4.0; validation/data/pure/measured/article_cyrene.json). Their
  vapour pressures have stated uncertainties of 1.4-17 %, so the Cyrene vapour pressure meets each within its own
  uncertainty and says it is no better. Refitted by the rule of proposal 0008: the 1,4-butanediol liquid heat
  capacity (ChemSep 7.5 % off three articles; the record now covers 283-353 K). No open data, with the sources
  searched: diethyl carbonate thermal conductivities and liquid heat capacity (the four ThermoML articles state 2-5 %,
  above the 1 % target), terephthalic acid liquid properties (no melting point on the WebBook; ChemSep's heat of
  vaporization covers only 298-308 K, where it is a solid).
  - **Cyrene, from the two articles the maintainer downloaded** (with their supporting information): Jerabek et al.
    (J. Chem. Eng. Data 2023, CC BY 4.0) and Medgyesi and Mika (ChemPlusChem 2024, CC BY-NC 4.0). Now fitted to
    measured values: vapour pressure (87 static values of 2023 and Baird et al. 2019, within 0.3 %), density, liquid
    heat capacity, viscosity, surface tension, and the melting data (251.9 K, 2.4 kJ/mol). ChemSep's Cyrene records
    were poor: heat capacity 19-32 % low, a viscosity equation with the wrong sign, surface tension 15 % low. The 2024
    vapour pressures, densities and viscosities have no stated uncertainty and are compared, not fitted (the vapour
    pressures lie up to 11 % from the curve at 400-450 K); its surface tensions are the only ones and are fitted.
  - **Cyrene ideal-gas heat capacity** (the maintainer left the choice to the assistant): ChemSep's value (190 J/(mol K)
    at 298 K) is about as large as the measured liquid heat capacity (200), so the record now uses the values that
    Jerabek et al. (2023, Table 4) calculated with the RRHO model (125.0 at 298 K, 200-700 K), labelled as calculated,
    like the WebBook ideal-gas tables of other components. Still open: the ChemSep critical point (657.86 K) holds the
    vapour-pressure curve above 403 K; no open measurement of it was found.
  Pending:
  - warnings kept (the measured values do not cover 25-100 degC): 1,4-butanediol viscosity, propylene carbonate heat
    capacity, 1-hexanol and 1-octanol vapour pressure, 1-octanol heat capacity.
- **The five large deviations of the engineering report (records against measured data):** the maintainer
  asked to refit them. Under the refit rule of proposal 0008 (refit when the measured values cover 25-100 degC,
  or when the record misses three times the tolerance): monoethanolamine vapour pressure refitted to the
  ThermoML values (all seven articles found the ChemSep curve high; the refit is closer to every one of them and
  to the Antoine equation of Matthews et al. 1950). Kept, with the reason as a known issue (check_measured.KNOWN):
  ETBE viscosity (one article), glycerol vapour pressure (two articles with uncertainties below 1 % disagree by
  9 %), vinyl acetate vapour pressure (ThermoML and the WebBook Antoine equations disagree in sign), NMP liquid heat
  capacity (all eight articles agree it is 1-9 % high, but only to 353 K; a refit would end the record there
  instead of 541 K). The maintainer chose to keep the NMP record over its full range, to 541 K (2026-10-11).
- **Activity-model pipeline (the literature package's activity part):** its four claims were checked against the
  code and all hold; fixed in scan_pairs, vle_batch, chemsep_pairs and fit_parameters: an equilibrium-property gate
  (density, heat capacity, surface tension and diffusion sets no longer count; gas solubility in molality,
  concentration, Ostwald or Bunsen units does), measured boiling temperatures read, sets without fixed T or P
  grouped into isotherms, a new data kind "tpx" (pressure against temperature at set compositions, fitted with the
  component vapour pressures), and the ChemSep import looking for each model separately (it finds no record for any
  of the 81 one-model pairs). Rerun: 64 new pair data sets, 81 new NRTL/UNIQUAC sets within the gate; fitted pairs
  169 -> 218 of the 2415 activity pairs. Not within the gate, data kept: MEA + water (2.1 % in P), glycerol + water
  (1.8 %), and others listed in docs/PAIR_SCAN.md. Ethanol + cyclohexane (ethanol dehydration benchmark) now
  defaults to the NRTL set fitted to Reddy et al. (2013), which gives the open azeotrope at 65.11 degC, x 0.457
  (data 64.9 degC, 0.445; ChemSep 65.20 degC, 0.444); the maintainer kept this default, the ChemSep set stays
  selectable.

### 2026-10-10

- **`chepta@0.3.0` is on npm** (staged with the one-time token and approved on npmjs.com; served by
  jsDelivr). Still to do by the maintainer: steps 4.4 and 4.5 under Open items (trusted publisher,
  then delete the token and the secret), deprecate `fugacity`, and optionally deprecate the
  placeholder `chepta@0.0.0-stage`.
- **Front page:** the maintainer edits README.md directly (new flowsheet screenshot, shorter
  rename note, the "model predictions" sentence reworded, a shorter load prompt, updated
  parameter counts).
- **Engineering report comment made shorter:** the top gives the totals (❌ large, ⚠️ small,
  ✅ ok, not checked) and whether the pull request changes results; each group is folded, its
  title starting with its own counts, and opens on its problems, with every result folded
  again inside. ❌ large = a failed or lost calculation, or a deviation of more than twice the
  tolerance; the tolerances themselves are unchanged.
- **Assistants use the workbench's own exports:** asked for an Excel file of a flowsheet, ChatGPT
  wrote its own spreadsheet instead of using the workbench's. The instructions (use.md and the
  skill) now say: open the workbench and name the button (Download Excel, Excel concept model,
  Download CSV, Copy CSV, the Excel button of a diagram, File > Save); do not make the file or
  compute again in code; do not solve the flowsheet in code after `checkProject` passes; ask
  before building anything the workbench cannot do. A test keeps the button names in the
  instructions equal to those in the interface.
- **Website domain:** the maintainer set up www.cheptasim.org for the GitHub Pages site (the same
  workbench as fairedose.github.io/CHEPTA, which redirects there). Pending: tick Settings → Pages →
  Enforce HTTPS; offered: change the old links in README, use.md, the install page and the skill.
- **Literature package from another assistant (2026-10-10):** the maintainer asked to use its data.
  The equation-of-state part had 584 transcribed rows for 16 pairs without a k_ij; every row was
  read again from the eight open sources (two Heriot-Watt theses, SciELO, four J-STAGE papers, IUPAC
  SDS 5/6): one value was wrong in the package (ethylene + 1-butene, 10.01 degC, y = 0.965, not
  0.956). Cyclohexane + n-heptane from the same open paper was added. Fitted with one constant k_ij
  and kept only within a gate set before the fits (5 % AAD in P with a bubble pressure at every
  point; 0.5 K and 0.012 in y for T-x-y): 21 sets for 11 pairs (ethane and propane with C10-C12,
  ethylene + 1-butene, the three xylene pairs, cyclohexane + n-heptane). Not kept, data kept for
  a better model: argon + H2S, ethylene + propylene, CO2 + n-decane, ammonia + benzene, SO2 +
  iso-octane (likely two liquids), hydrogen + n-decane, and SRK propane + n-decane (5.11 %).
  Pending: the package's activity-model part has no new data, but points to four gaps in the
  fitting pipeline (pressure-as-property data sets, non-equilibrium sets classified as T-x, sets
  missed inside indexed articles, the ChemSep import skipping a pair's second model); to be checked
  and fixed in a separate pull request.
- **The rename is done on GitHub:** the repository is `FaireDose/CHEPTA`, #90 is merged, and the website
  is at https://fairedose.github.io/CHEPTA/. Next: the first npm upload of `chepta` with a one-time
  token (#93 merged; the steps are under Open items), after the pair data (#91).
- **Previewing a pull request before approving it:** #92 adds a workbench preview to every pull
  request (Checks → Preview → Summary → Artifacts); CONTRIBUTING.md says how to review.

### 2026-10-09 (night): pair data

- **Asked:** why common pairs such as 1-propanol + 1-butanol had no parameters, and to look for the data
  again; each pair needs only the model the method rules choose for it.
- **Found** (docs/PAIR_SCAN.md):
  - the ChemSep databank gave about 50 more activity-model pairs, now imported;
  - the whole NIST TRC ThermoML Archive (bulk file, 11,923 records) holds binary vapour-liquid data
    for 7,158 compound pairs, of which 704 are pairs of CHEPTA components;
  - 137 activity-model pairs fitted to it, one consistent data set each (validation/data/vle/), within
    fixed limits; for 25 more a data set was chosen but neither model followed it within the limits
    (for example 1-butanol + water, which splits into two liquids), so nothing was written; hydrocarbon
    pairs are left for equation-of-state k_ij.
- **Still without open data:** many classic pairs measured before 2003, for example ethanol +
  1-propanol; they stay on docs/DATA_WANTED.md.

### 2026-10-09 (evening)

- **The name is CHEPTA**, *Chemical Engineering Process Tools for Agents* (maintainer's decision).
  The rename pull request changes the name everywhere it means the software, keeps "fugacity" where
  it means the thermodynamic quantity, keeps the old script global `Fugacity` and the error class
  `FugacityError` as aliases, and keeps the file-format keys. Steps to make it official are under
  Open items.
- **Pair data**: the archive has fewer binary pairs than expected. Maintainer's point: each pair
  needs only the model the method rules choose for it (an equation of state for nonpolar pairs,
  an activity model for polar liquids), so coverage is to be counted per needed model.

### 2026-10-09

- **Questions answered:**
  - **The Cavett problem needs no compressor.** Its drums have a fixed temperature and pressure,
    and the published VMGSim flowsheet uses compressors only because VMGSim's separators are P-H
    flashes. Leaving them out loses only the energy side, which the paper does not publish.
  - **Which component batches are left:** none from proposal 0008. Urea, phthalic anhydride and
    caprolactam have no open data. Two of the four free places now hold isopentane and
    n-undecane for the Cavett problem, so two are left.
  - **The Cavett failures:** neither the recycle solver nor the models were wrong. Searches
    inside the flash gave up and stopped with an error. Two of the fixes in #84 were
    workarounds (a restart from 300 K, and a 1e-6 J/mol tolerance), which #86 now replaces.
  - **Liquid-liquid:** it works with NRTL and UNIQUAC. An equation of state detects a second
    liquid and refuses it.
  - **How proposal 0011 works.**
- **The AI agent (proposal 0011):** it must follow the way engineers build a process design. A
  "how the agent designs a process" section was added, level by level:
  1. design basis;
  2. inputs and outputs;
  3. reactor and recycles;
  4. separations;
  5. heat recovery;
  6. cost.

  Each decision is checked with Fugacity's tools, cited, and approved by a person before the
  next level.
- **Reactions:** Fugacity ships no reaction library. Proposal 0010 was changed so the user writes
  the reactions. In proposal 0009 the reaction table only explains why the intermediates and
  products were chosen as components.
- **Method selection rules** ([METHOD_SELECTION.md](METHOD_SELECTION.md)) were added and written
  into AGENTS.md. The flowsheet suite uses only cases with the recommended method and physical
  conditions.
- **Recycles:** Broyden is now the default recycle method, and new guards stop a recycle that
  grows without bound or a flowsheet that does not balance
  ([#84](https://github.com/FaireDose/Fugacity/pull/84), merged). The suite runs in CI on every
  pull request, so the maintainer has nothing to run by hand.
- **Merged:** [#83](https://github.com/FaireDose/Fugacity/pull/83) and [#84](https://github.com/FaireDose/Fugacity/pull/84).
- **Opened:**
  - [#85](https://github.com/FaireDose/Fugacity/pull/85): the older tests reviewed, and the
    equation-of-state k_ij of polar pairs labelled "not recommended".
  - [#86](https://github.com/FaireDose/Fugacity/pull/86): Newton flash with a stability check,
    replacing the restart from 300 K and the 1e-6 J/mol tolerance.
- **Documentation:**
  - this page;
  - an index of the documentation ([README.md](README.md));
  - one reference page per topic in [models/](models/).

### 2026-10-08

- **Merged:**
  - NRTL fits to measured solubilities ([#80](https://github.com/FaireDose/Fugacity/pull/80));
  - future property methods as locked chips, and alphabetical component lists ([#81](https://github.com/FaireDose/Fugacity/pull/81));
  - solid solubility in g/L and g/100 g ([#82](https://github.com/FaireDose/Fugacity/pull/82)).
- **Requested:**
  - a literature-based test method for the flowsheet solver, with many 3–7 component flowsheets
    with recycles (became the flowsheet suite, #84);
  - green chemistry components, including reaction intermediates and products (proposal 0009);
  - a reactions proposal: conversion, simple kinetics, user-defined (0010);
  - an agents-and-literature proposal (0011).
- **Interface:** future methods for ions and polymers are shown as unavailable, and the
  liquid/solid/gas tags were removed from the component list.

### 2026-10-07

- **Proposal 0008, components:** batches 1–3 ([#71](https://github.com/FaireDose/Fugacity/pull/71), [#73](https://github.com/FaireDose/Fugacity/pull/73), [#75](https://github.com/FaireDose/Fugacity/pull/75))
  and solids with solid-liquid equilibrium ([#77](https://github.com/FaireDose/Fugacity/pull/77), [#79](https://github.com/FaireDose/Fugacity/pull/79)).
  Urea, phthalic anhydride and caprolactam have no open data.
- **Measured data:** the engineering report now compares records with measured data
  ([#72](https://github.com/FaireDose/Fugacity/pull/72)).
- **Component search** by name, formula, CAS number or alias everywhere
  ([#74](https://github.com/FaireDose/Fugacity/pull/74)).
- **Excel:**
  - the flowsheet as Excel with the balances as formulas ([#65](https://github.com/FaireDose/Fugacity/pull/65));
  - an "Excel concept model" where the flash drums are formulas too ([#78](https://github.com/FaireDose/Fugacity/pull/78)).

### 2026-10-06

- **Workbench:**
  - it opens empty and loads faster in AI chats ([#49](https://github.com/FaireDose/Fugacity/pull/49));
  - project files, with naming ([#50](https://github.com/FaireDose/Fugacity/pull/50), [#53](https://github.com/FaireDose/Fugacity/pull/53)).
- **Proposal 0006, the first flowsheet**, accepted and built:
  - streams, blocks and a solver with recycles ([#54](https://github.com/FaireDose/Fugacity/pull/54)–[#57](https://github.com/FaireDose/Fugacity/pull/57));
  - degrees of freedom and energy streams ([#58](https://github.com/FaireDose/Fugacity/pull/58));
  - the workspace ([#59](https://github.com/FaireDose/Fugacity/pull/59));
  - navigation by section ([#60](https://github.com/FaireDose/Fugacity/pull/60));
  - ports, delete and reconnect, zoom, and solver settings ([#61](https://github.com/FaireDose/Fugacity/pull/61), [#63](https://github.com/FaireDose/Fugacity/pull/63), [#64](https://github.com/FaireDose/Fugacity/pull/64));
  - AI instructions ([#62](https://github.com/FaireDose/Fugacity/pull/62)).
- **Decided:**
  - the menu section is called "Properties & Equilibria" ([#66](https://github.com/FaireDose/Fugacity/pull/66));
  - in the flowsheet, the user first chooses components and method, then draws;
  - proposals 0007 and 0008 accepted, with UNIFAC on hold ([#67](https://github.com/FaireDose/Fugacity/pull/67), [#69](https://github.com/FaireDose/Fugacity/pull/69));
  - the name change waits until the flowsheet improves.
- **Association models:** no new association model for now; the current deviations are small
  except for the mixture enthalpy. Proposal 0005 stays deferred.

### 2026-10-03 to 2026-10-05

- **Workbench:**
  - one Model selector, with activity models and their vapour first, then equations of state;
  - diagrams in mol or wt %;
  - the Flash workspace with CSV export and feed flow in kmol/h, kg/h or t/h
    ([#37](https://github.com/FaireDose/Fugacity/pull/37), [#38](https://github.com/FaireDose/Fugacity/pull/38)).
- **Proposal 0004, the first 50 components:**
  - for hydrocarbons and aromatics, equations of state come first, with activity models also
    available;
  - batches and benchmark pairs ([#39](https://github.com/FaireDose/Fugacity/pull/39)–[#47](https://github.com/FaireDose/Fugacity/pull/47)).
- **New rule:** no PR monitoring, because it uses credits.

### Before 2026-10-03

- **Origin:** the project was started in Claude chat; v0.1 to v0.2.2 and proposals 0001–0004
  ([#1](https://github.com/FaireDose/Fugacity/pull/1)–[#31](https://github.com/FaireDose/Fugacity/pull/31)).
- **Flash, steps 1–5 of proposal 0001** ([#32](https://github.com/FaireDose/Fugacity/pull/32)–[#36](https://github.com/FaireDose/Fugacity/pull/36)).
