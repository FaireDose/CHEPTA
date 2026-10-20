# Decisions and open items

A running record of what the maintainer decided while working with the AI assistant, and of
what is still pending. Anyone picking up the work, people or assistants, should start here. The
record in force is each pull request and proposal; this page points to them.

Pull requests are in `FaireDose/CHEPTA` (formerly `FaireDose/Fugacity`; the old links redirect).

## Open items (state on 2026-10-09)

### Waiting for the maintainer

- **Review and merge:**
  - [#85](https://github.com/FaireDose/Fugacity/pull/85): method advisor; older tests reviewed against the method rules.
  - [#86](https://github.com/FaireDose/Fugacity/pull/86): Newton flash; P-H search without workarounds.
  - The pull request that adds this page.
- **The Library rule "Best available"** (2026-10-17): it is each pair's default set, which is not the best for every
  use (ethanol + water: the default follows the 1 atm T-x-y data, the "-etal" set the excess enthalpies). Rename it,
  for example "Default sets (fitted to data where there are any)"? One model for the whole project (diagrams and
  flowsheet) was discussed as a proposal, not asked for now.
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
   - **Import done (2026-10-13, asked by the maintainer):** `eos_kij_from_chemsep.py --add-new` appended 40 ChemSep
     entries (20 pairs, PR and SRK) that kij.json did not have; the fitted and literature entries are unchanged.
     - Left out, with the reason printed by the script: PR and SRK carbon dioxide + n-decane and SRK propane +
       n-decane. Their literature fits were rejected (no constant k_ij reaches the 5 % gate), so a databank value
       would only hide that.
     - New reference solutions, by their own scripts:
       - the hard flashes (reference_flash_hard.py): 11 of 77 cases change, the same 77 points;
       - three flowsheet-suite cases (reference_flowsheet_suite.py): the Cavett problem, G03 and G07, whose
         components now have these k_ij. In the Cavett problem CHEPTA's vapour flows move by up to 1.7 kmol/h,
         mostly towards the two published solutions.
   - Still to do: fitting the archive pairs.
2. Gases in polar liquids (139 pairs with archive data): Henry's-law constants for gases in water
   from the archive; other solvents need PSRK or MHV2, not in CHEPTA yet.
3. Review the two pairs whose 1-atm data sets disagree by more than 1 K (methanol + 2-propanol,
   water + 2-propanol; docs/PAIR_SCAN.md).
4. Compressor, pump and valve blocks (shown as "coming later"); asked for again on 2026-10-14, to follow the enthalpy of
   a pure component through a compression (one-component flowsheets work since then). Optionally, then the energy side
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
     - 3a (furans, 1,3-propanediol) and 3b (levulinate esters; levulinic acid with a gap between its vapour-pressure
       and density records) done; levulinic acid's gap: wanted liquid densities above 375 K, or vapour pressures between
       343 and 375 K by a static or ebulliometric method, from an open source;
     - 3c done (GVL, CPME, tetrahydrofurfuryl alcohol, 2,3-butanediol, methyl and ethyl lactate, limonene, furfuryl
       alcohol, through the path for components without critical constants; gamma-butyrolactone, with its gap); **closed**
       on 2026-10-14 (isoamyl alcohol added, 2-methylfuran refitted; docs/decisions/2026-10-14-11-batch-3-closed.md);
       HMF, lactic acid and lactide move to the nonvolatile class; solketal and alpha-angelica lactone wait for open
       vapour pressures;
     - batch 3 pairs: 24 NRTL pairs written (6 with a quality warning); water + gamma-valerolactone has no NRTL set (the
       only usable set, Zaitseva 2016, gives a spurious liquid split with every alpha): wanted, open T-x-y or P-x-y data
       over the whole range with pure-component points within 1 K of the records;
       docs/decisions/2026-10-14-09-batch-3-pairs.md;
     - Modified UNIFAC 2.0: the furans are built from other groups (CHO, C=C, ring CH), a rough prediction; maleic
       anhydride and the small gases have no groups; check the furans against open binary VLE data when a pair needs them;
     - Modified UNIFAC 2.0 groups chosen by the user (asked 2026-10-14): part of the work on adding the user's own
       data, not before (tier "user", subgroups and atom balance checked, a group picker in the interface);
  4. the "nonvolatile" component class: done (lactic acid; predicted heat capacity, Ruzicka-Domalski;
     docs/decisions/2026-10-14-12-nonvolatile-class.md); check the transcribed groups against the tables;
  5. batch 4: 17 nonvolatile components added (HMF, sugars, sugar alcohols, polyacids, FDCA, BHET, diphenolic acid;
     docs/decisions/2026-10-16-01-batch-4.md). Still open:
     - the ten held for want of an open liquid vapour pressure: added 2026-10-20
       (docs/decisions/2026-10-20-02-no-vapour-pressure.md). Glycerol carbonate has measured vapour pressures after
       all (the archive calls it "glycerine carbonate"); the other nine (solketal, alpha-angelica lactone, lactide,
       isosorbide, levoglucosan, dimethyl FDCA, BHMF, levoglucosenone, EMF) have a "no open data" marker: VLE refuses
       them until the user gives a vapour pressure (My data). Wanted: open measured liquid vapour pressures of the nine;
       liquid heat capacities of all ten but glycerol carbonate; groups for BHMF, dimethyl FDCA and levoglucosenone
       (the subgroups cannot describe them);
     - xylose (58-86-6) and cis,cis-muconic acid (1119-72-8): added 2026-10-20 with their identity from PubChem
       (docs/decisions/2026-10-20-01-xylose-muconic-acid.md); muconic acid has no open melting data (its aqueous
       solubility is open: Scelfo et al. 2017, Iran. J. Chem. Chem. Eng. 36(4) 129, which needs melting data to be used);
     - FDCA has no Modified UNIFAC 2.0 groups (no ether subgroup without a hydrogen); citric acid's predicted heat
       capacity is far above its one measured value (236 J/(mol K) at 424.9 K): check when more data appear;
     - nonvolatile components in every flowsheet block with volatile ones, alone, and at the end of their heat-capacity
       record: done (docs/decisions/2026-10-16-04-nonvolatile-alone.md, 2026-10-16-06-nonvolatile-units.md). In
       reactors (proposal 0010: liquid formation data, pure-liquid standard state) and columns (roadmap v0.5) when
       those come.
- **The maintainer's order after batch 4 (2026-10-15):**
  1. an interface where a user adds their own properties (and Modified UNIFAC 2.0 groups) and saves them with the
     project, labelled as user data: a proposal first;
  2. the missing properties (docs/decisions/2026-10-17-02-liquid-heat-capacity.md): liquid heat capacity done for
     all 21 (terephthalic acid a nonvolatile liquid to 400 °C; dichloromethane a constant from single values,
     292.5 K to its boiling point, 313.1 K, 2026-10-18); surface tension, viscosity, density and
     fusion: 23 records added on 2026-10-17 and -18 (same file); **on hold** (the maintainer, 2026-10-18): the ideal-gas
     heat capacity of 2-methoxyethanol, the levulinates, levulinic acid, THFA and 2,3-butanediol, and of all 15 above
     the range derived from their liquid, by an open group-contribution method (tier "predicted", its group values
     open and without a non-commercial licence, checked on the CHEPTA components with an ideal-gas record); still
     open: the remaining thermal conductivities, surface tensions and viscosities (leads: Sharma et al. 2024, J. Chem.
     Eng. Data, paywalled; Nikitin et al. 2020-2023 critical constants of GVL, furfuryl alcohol and THFA, no open copy
     verified; levulinate conductivity from the diffusivities of Nikitin et al. 2019), else an open prediction method,
     then the water + lactic acid solution density and
     viscosity (open: Simion et al. 2012, Food and Environment Safety XI(4), Tables 1-2, 9-85 wt %, 293-353 K); a
     mixture density and viscosity model is needed to use them.
- **0010, reactions:**
  1. formation data (ΔfH°, ΔfG°);
  2. the reaction description and its checks;
  3. conversion and yield reactors;
  4. equilibrium reactor;
  5. CSTR and plug flow;
  6. Gibbs reactor;
  7. views;
  8. benchmarks.
- **0012, your own data** (accepted 2026-10-16): property records, components, pairs and Modified UNIFAC 2.0 groups
  of the user's own, in the project and in a file of their own; My data docked, with an optional separate window:
  1. the engine overlay (done); 2. project format 3, the My data file, the contribution-package export (done); 3. the My data panel (done);
  4. the separate window (done); 5. pairs and the groups panel (the database's groups as a proposal, or the user's own),
  with the databank's coefficients next to an empty table for one's own, and the Modified UNIFAC 2.0 parameters next
  to the selection of the groups (the maintainer, 2026-10-16) (done, waiting for the maintainer's review: every step
  of 0012 is then in).
  - inert solids (class "solid", the user's own components) pass through the flowsheet as a solid phase; a component
    separator serves as a filter (the maintainer, 2026-10-16: "for the moment"). A real solid phase (dissolving,
    crystallizing, drying, solids in the databank) needs a proposal first.
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
  - Several measured sets (2026-10-14): a small stated uncertainty is the authors' claim, not
    proof. Pool the sets (each article with the same weight) only when they agree; judge the
    result by independent evidence (measured boiling points of other articles, calorimetric
    enthalpies of vaporization); when they disagree, choose or leave out a set only with a stated
    physical reason, or hold the component.
  - Paywalled articles (2026-10-15): look for a legal free copy in Unpaywall before setting an
    article aside (`open_copy.py`; contact address info@cheptasim.org).
- **Your files are yours:** files and results made with Fugacity belong to the people who
  make them ([#68](https://github.com/FaireDose/Fugacity/pull/68)).
- **Two licences on purpose:** MIT for the code, and the Artistic License 2.0 that must travel
  with the ChemSep data (README, [#81](https://github.com/FaireDose/Fugacity/pull/81)).

## Log

One file per entry in [decisions/](decisions/), named by date (`YYYY-MM-DD-NN-topic.md`), so the folder lists
them in date order. Each pull request adds its own new file there and does not edit this page's log, so two open pull
requests never change the same lines. Open items and standing rules stay on this page.
