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
     - 3a (furans, 1,3-propanediol) and 3b (levulinate esters; levulinic acid with a gap between its vapour-pressure
       and density records) done; levulinic acid's gap: wanted liquid densities above 375 K, or vapour pressures between
       343 and 375 K by a static or ebulliometric method, from an open source;
     - held: isoamyl alcohol, whose twelve vapour-pressure sets disagree (not pooled), with a gap too;
     - 2-methylfuran: its three vapour-pressure sets disagree; under the rule of 2026-10-14 (all sets with the same
       weight) a set is preferred only with a stated reason; find one (independent boiling points, calorimetric
       enthalpy of vaporization) or keep the merged record;
     - 3c done (GVL, CPME, tetrahydrofurfuryl alcohol, 2,3-butanediol, methyl and ethyl lactate, limonene, furfuryl
       alcohol, through the path for components without critical constants; gamma-butyrolactone, with its gap); no open vapour pressures: HMF, lactic
       acid, lactide, solketal, alpha-angelica lactone;
     - Modified UNIFAC 2.0: the furans are built from other groups (CHO, C=C, ring CH), a rough prediction; maleic
       anhydride and the small gases have no groups; check the furans against open binary VLE data when a pair needs them;
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
  - Several measured sets (2026-10-14): a small stated uncertainty is the authors' claim, not
    proof. Pool the sets (each article with the same weight) only when they agree; judge the
    result by independent evidence (measured boiling points of other articles, calorimetric
    enthalpies of vaporization); when they disagree, choose or leave out a set only with a stated
    physical reason, or hold the component.
- **Your files are yours:** files and results made with Fugacity belong to the people who
  make them ([#68](https://github.com/FaireDose/Fugacity/pull/68)).
- **Two licences on purpose:** MIT for the code, and the Artistic License 2.0 that must travel
  with the ChemSep data (README, [#81](https://github.com/FaireDose/Fugacity/pull/81)).

## Log

One file per entry in [decisions/](decisions/), named by date (`YYYY-MM-DD-NN-topic.md`), so the folder lists
them in date order. Each pull request adds its own new file there and does not edit this page's log, so two open pull
requests never change the same lines. Open items and standing rules stay on this page.
