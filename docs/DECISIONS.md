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
- **Formation data** (proposal 0010, step 1; docs/decisions/2026-10-22-03-formation-data.md): xylitol is held (two
  crystal energies of combustion disagree by about 100 kJ/mol); five records are uncertain (the values disagree by more
  than 10 kJ/mol: 2-methoxyethanol, 1,3-propanediol, limonene, gamma-butyrolactone, levoglucosan); 22 components have no
  open data. Compare the transcribed values with their sources.
- **Supplier data** (docs/decisions/2026-10-22-06-supplier-data.md): the rule is written (3 suppliers within 2 K or
  1 %, assay of at least 98 %, single constants only, tier `supplier`); no record uses it yet.
- **Reactors, step 3** (proposal 0010; docs/decisions/2026-10-22-10-reactors.md): confirm the energy basis (the
  stream enthalpies against each ideal gas at 298.15 K, the heat of reaction on the same basis) and parallel
  conversions as the default; the yield reactor's element balance is reported, not enforced (the maintainer,
  2026-10-22: "it is ok to report the imbalances"). The views came next (step 7,
  docs/decisions/2026-10-22-11-reactor-views.md): check the Reactions page and the reactor blocks in the workbench.
  HMF rehydration (step 8) waits for an open ideal-gas heat capacity of levulinic acid. The flash of hydrogen with
  the "ideal" model that did not finish is now refused with the remedy (Peng-Robinson or SRK; 2026-10-27).
- **Reactors, steps 5, 6 and 9** (proposal 0010; docs/decisions/2026-10-28-01-reactors.md): two phases in the
  equilibrium reactor, the CSTR and the PFR; Gibbs as a mode of the equilibrium reactor; one Reactor button; your own
  kinetics; the PFR's profiles; the Reactor workspace. Confirm the choices under "To check" there. Step 8 and the
  vapour-viscosity mixing rule: done 2026-10-28 (below). Two liquids in reactors and the P-H flash with Peng–Robinson
  that fails through a two-liquid region: "Engineering", item 7.
- **Reactors, round 2** (docs/decisions/2026-10-28-02-reactors-round-2.md): the Gibbs reactor as a block again, global
  reactions, more units in Settings, biphenyl, p-terphenyl (para isomer: to confirm) and cumene hydroperoxide. The
  flash failure: no small fix; the real fix later, as an item of "Engineering" below, not a proposal (the maintainer,
  2026-10-28).
- **Proposal 0015, the separation units: accepted** (2026-10-29; docs/decisions/2026-10-29-01-separation-units-accepted.md),
  with the recommendations under its ten questions. The program's state, by the active workstreams:
  - **M0** done (2026-10-29; docs/decisions/2026-10-29-02-m0-contracts.md): the contracts in ARCHITECTURE.md, the
    request path `CHEPTA.run`, the execution envelope, the column and sizing contracts refusing until built, and the
    heater and flash example through the whole path, in Node and in the browser.
  - **M1, W2: the shortcut column, built, to review** (docs/decisions/2026-10-29-05-shortcut-column.md): the Column
    block in shortcut mode (Fenske, Underwood, Gilliland) in the palette, its result table, project format 6,
    `solve_column` through `CHEPTA.run`, the command line and the MCP server. To check: the equation forms against
    DWSIM's source, the 20 % volatility warning, the net duty as the block's one energy stream. Next for W2: the
    rigorous column (M2a), when the maintainer says so.
  - **M1, W8 with W9: built, to review** (docs/decisions/2026-10-29-03-cli-mcp-worker.md): the command line, the local
    MCP server, the worker. The first assistant test passed in Claude Code, in the session and on your computer
    (2026-10-29).
  - **W8, the authoring contract, and W9, steadier speed tests: built, to review**
    (docs/decisions/2026-10-29-09-authoring-contract.md): an unknown key in a flowsheet's `thermo` or in a block's
    `spec` is refused with the key and the known keys (`invalid_input` with `where` on the request path); the
    missing-pair message names the user's data and another method first; the speed tests compare the fastest of five
    timings with the same budgets. To check: each block's list of keys (the decision file), and that the message reads
    well to a user. Next for W8: the authoring contract and messages of each new block as it lands (the rigorous
    column, M2a).
  - **W7, M1 done** (2026-10-29; docs/decisions/2026-10-29-04-column-cases.md): nine column cases and the MESH and
    shortcut references, ahead of W2. To check: the tolerances, and the equation forms against DWSIM's source.
  - **W7, M2a cases: built, to review** (docs/decisions/2026-10-29-08-benchmark-column.md): the complete benchmark,
    The ChemSep Book's benzene + toluene column (public domain) with its published stage results, and five more cases
    (two feeds, near an azeotrope, two liquids on the stages, an iteration limit, the performance benchmark); the
    reference extended (several feeds, saturated feeds, the phase-stability check). To check: every transcribed number
    against Figures 1.18 to 1.21 of the book (checked by the maintainer, 2026-10-29); B2 uses Peng–Robinson, and
    METHOD_SELECTION.md rule 6 sends nonpolar hydrocarbons to an equation of state at any reduced temperature (the
    maintainer, 2026-10-29). To confirm: the agreement tolerances (1.0 K, 0.02), k_ij = 0 for the pair. Next for W7: the cases of
    W2's M2b tasks, then the benchmark separations' pairs.
  - **W4, M1: the drum and decanter sizes, built, to review** (docs/decisions/2026-10-29-06-drum-sizing.md): a vertical
    or horizontal flash drum and a decanter from the flash block's result (`sizeDrum`, `sizeDecanter`, the `size_drum`
    capability, the size under the drum's results). To check: the constants and rules against the four open sources
    (University of Trieste and Oklahoma slides, Coker 1993, the University of Baghdad notes; the list in the decision
    file); to decide: the defaults (85 % of the permitted velocity, 2 min of liquid, 150 μm drops). Next for W4: the
    column diameter by flooding (M2b), with W2's stage traffic.
  - **W10, M1 step 14: the guide and the review merged; round 1 of fixes to review**
    (docs/decisions/2026-10-29-07-ui-fixes-round-1.md): ten of the review's 17 items fixed. To check: the 1 mW
    threshold for a zero duty; which of the items left for later come next. Then W10 checks W5's and W6's new views.
  - Waiting: W1, W3, W5 and W6.
- **The roadmap's statuses** (2026-10-28): every item is Open, On-going or Closed; check them.
- **Reactors, finished** (docs/decisions/2026-10-28-03-reactors-finish.md): the worked examples of step 8, the Ergun
  gas viscosity by Wilke's rule, the full-text search for the three new components. Check the transcribed constants of
  the ethanol example against Aali and Hadi 2023, Tables 8 and 9. Waiting for open data: benzene pyrolysis,
  esterification kinetics, HMF rehydration.
- **Reactions, step 2** (proposal 0010; docs/decisions/2026-10-22-05-reactions.md): confirm the standard pressure of
  100 kPa, the pure-liquid standard state and its paths (through the saturated vapour, for acetic acid with its
  monomers and dimers; crystal to liquid with ΔHfus); compare the WebBook liquid values of
  validation/data/reactions/liquid_formation_webbook.json with their pages. Acetic acid enthalpies now work everywhere
  (flowsheets included), and so do those of acids that are solid at 25 °C. Formic acid has its dimer constants (Chao and
  Zwolinski 1978) and the WebBook gas ΔfH°; propionic and acrylic acid have none open yet (their liquid values are
  12-26 kJ/mol off). No open source with the Eley–Rideal and Mars–van Krevelen forms was found.
- **Values the maintainer adds** (2026-10-21; the latest list: [MISSING_PROPERTIES_2026-10-28-2.md](missing-properties/MISSING_PROPERTIES_2026-10-28-2.md)):
  a new tier for them (for example `contributed`), and its name; whether numbers from paywalled articles may be used
  with their citation (a change to AGENTS.md rule 1); whether CHEPTA publishes its own measurements on Zenodo.
- **Missing properties, round 3** (docs/decisions/2026-10-22-07-missing-round3.md): levoglucosenone's vapour
  pressure and density from Baird et al. 2019 (open access); compare the transcribed values. Supplier pages to
  download: glycerol carbonate and 5-(ethoxymethyl)furfural liquid densities.
- **The Library rule "Best available"** (2026-10-17): it is each pair's default set, which is not the best for every
  use (ethanol + water: the default follows the 1 atm T-x-y data, the "-etal" set the excess enthalpies). Rename it,
  for example "Default sets (fitted to data where there are any)"? One model for the whole project (diagrams and
  flowsheet) was discussed as a proposal, not asked for now.
- **Proposal 0011:** merged in [#83](https://github.com/FaireDose/Fugacity/pull/83) with status **Draft**. Accept
  or decline it, then set its status in the file and in `proposals/README.md`. Proposal 0010 was accepted on
  2026-10-22 (docs/decisions/2026-10-22-02-reactions-proposal.md), proposal 0009 on 2026-10-11.
- **Search tools and the new search** (proposal 0014, steps 1 and 2 accepted; docs/decisions/2026-10-22-09-search-tools.md):
  check solketal's seven vapour pressures read off Figure 7 of Türck et al. 2026
  (validation/data/pure/measured/article_solketal_acsomega2026.json), and the values transcribed from the downloaded
  articles (Nikitin et al. 2023 for furfuryl alcohol and THFA; Bogatishcheva et al. 2026 for the lactates, whose
  critical points the maintainer accepted with the larger vapour-pressure misses). To decide: tripalmitin's single heat
  of vaporization, ethyl lactate's melting data from a thesis whose enantiomer enthalpies disagree fourfold, adding
  furfuryl acetate. CORE agreed to its personal licence (2026-10-23; docs/decisions/2026-10-23-01-light-gases-core.md):
  CORE was asked for every gap on 2026-10-25 (docs/decisions/2026-10-25-01-core-search.md); steps 3 to 5 of proposal
  0014 are not decided.
- **Supplements and the two search reports of 2026-10-27** (docs/decisions/2026-10-27-01-supplements.md): check the
  added values against their sources (alpha-angelica lactone and levoglucosenone heat capacities, levoglucosenone's
  enthalpy of formation, the lactide melt and its Gibbs energy of formation, BHET's melting data). HMF's liquid enthalpy of
  formation was accepted (2026-10-27). To decide: methyl lactate's -646.5 kJ/mol (method not stated in the free
  supplement; the article that would say, doi:10.1016/j.jct.2018.07.029, is still needed), and whether a copy on
  ResearchGate counts as open (glycolic acid).
- **CORE search** (docs/decisions/2026-10-25-01-core-search.md): to decide whether limonene's vapour pressures of
  Gowda 2018 (an open MEng thesis, 40.0-101.4 kPa) join the pooled curve with both narrow misses accepted (Gowda
  +1.38 % against its stated 0.88 %, Wu 2019 -2.49 % against 1.62 %), which moves the curve by about 2 % (normal
  boiling point 450.47 K instead of 450.20 K), or stay out. Since the rule of
  docs/decisions/2026-10-25-02-tb-extension.md limonene has its boiling point without the thesis. For next week: the
  list of articles whose servers refused the scripts, with their links, for the maintainer to download. Download the thesis PDF (https://scholar.sun.ac.za/handle/10019.1/103666) and compare
  Table 8.12 with validation/data/searches/held/article_limonene_gowda2018.json.
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
        `FaireDose`, repository `CHEPTA`, workflow `publish.yml` (made again on 2026-10-22: the first one had
        expired, unused for 2 days; docs/decisions/2026-10-22-01-publish-trusted.md).
     5. Delete the `NPM_TOKEN` secret on GitHub and the token on npmjs.com (done 2026-10-22). Later releases are staged
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
4. Compressor, pump and valve blocks: done (proposal 0013, 2026-10-20 and 2026-10-21). Optionally, the energy side
   of the Cavett problem (no published values to compare with).
5. A "measured solubility" option next to the model, for a future crystallizer block.
6. Grow the flowsheet suite: more seeds, P-H drums, and reactive cases once proposal 0010 exists.
7. Two liquids with an equation of state: low priority. Only with a proper method such as CPA,
   never a plain cubic equation (decision of 2026-10-09).
   - **The real fix of the P-H flash failure** (the maintainer, 2026-10-28: "do only the real fix later", kept in this
     list, not a proposal): with Peng–Robinson, the P-H search of a reactor's outlet (ethanol, water and diethyl ether)
     tries 300 K, where the cubic predicts two liquids, and the flash refuses ("no vapour-liquid split"), so the whole
     search fails. The fix is the vapour-liquid-liquid flash for equations of state, then two liquids in the
     equilibrium reactor, the CSTR and the PFR. By the decision above, with CPA or another method that describes two
     liquids properly, not the plain cubic; until then the refusal stays, and NRTL or UNIQUAC is the method for such
     liquids (docs/METHOD_SELECTION.md). The proposal for the separation units (proposal 0015) lists the liquid-liquid
     thermodynamics it needs.

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
- **0013, heat exchangers, energy streams, pumps, valves and compressors** (accepted 2026-10-20;
  docs/decisions/2026-10-20-04-heat-exchanger-proposal.md): Lienhard and Lienhard's free textbook as a source; the
  allowable stress is the user's; no material recommendation; the low end of a U range; typical efficiencies from an
  open source as defaults; recycles through a two-stream exchanger and loops closed by energy streams are torn; no
  pinch analysis. Steps:
  1-5 done (2026-10-20, docs/decisions/2026-10-20-06-heat-exchangers.md): the heat-exchange calculation (Lienhard
  and Lienhard's tables, transcribed: the maintainer to compare them with the book), the Heat exchanger workspace in
  Unit models (Rating locked), energy streams, the heater's sizing, the two-stream block, valve and pump (75 % by
  default, NC State Extension AG-452-6); project format 4; open: CHEPTA's flash of pure water takes the vapour as an
  ideal gas or Peng-Robinson, not IAPWS (latent heat about 1.2 % above IF97 at 300 kPa), which a water process stream
  in an exchanger carries;
  review of 2026-10-21 (same decision file): one mode switch (Utility exchanger, Process exchanger), each stream of a
  process exchanger with its own components (at most 3) and method, the energy feed in the flowsheet's palette, a
  block's own energy stream can be taken out of the drawing, the canvas scrolls instead of shrinking; open: film
  coefficients calculated from correlations with the stream's own properties and the exchanger's geometry (Lienhard
  and Lienhard, chapters 7-9) instead of the single examples of Table 1.1, proposed, for the maintainer to decide;
  the canvas's size and drawing speed for large flowsheets, later (the maintainer, 2026-10-21: "not now");
  6. mixture entropy, the P-S flash, compressor and expander (done 2026-10-21,
     docs/decisions/2026-10-21-03-entropy-compressor-charts.md; efficiencies 75 % and 80 % by default, from NETL's
     Process Modeling Design Parameters, 2019);
  7. Charts: the gas phase envelope traced through the critical point (done 2026-10-21,
     docs/decisions/2026-10-21-01-phase-envelope.md; neopentane, helium and methylcyclohexane added for its natural
     gases); P-H, T-S and H-S charts, with the steam charts (done 2026-10-21, with step 6: the Steam workspace is now
     Charts; project format 5);
  every error of the workbench as a small warning that opens its details when pressed, by the maintainer's request
  (done 2026-10-21, docs/decisions/2026-10-21-05-warnings.md), with the new logo (docs/decisions/2026-10-21-04-logo.md);
  8. Rating (done 2026-10-21, docs/decisions/2026-10-21-06-rating.md): the duty and outlets of a given area, U and
     arrangement, in the workspace (Design or Rating) and as the flowsheet block's A_m2;
  Then 0010.
- **0010, reactions** (accepted 2026-10-22; kinetics defined with the reaction in a Reactions setup block; the
  user's own kinetics in a text box later, step 9):
  1. formation data (ΔfH°, ΔfG°);
  2. the reaction description and its checks;
  3. conversion and yield reactors (pull request of docs/decisions/2026-10-22-10-reactors.md);
  4. equilibrium reactor;
  5. CSTR and plug flow;
  6. Gibbs reactor;
  7. views (pull request of docs/decisions/2026-10-22-11-reactor-views.md: the Reactions page, the reactor blocks, Excel);
  8. benchmarks;
  9. the user's own kinetics (a text box).
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
  0. the AI chat panel (a new chat with Claude, ChatGPT, Gemini or HuggingChat that loads the workbench; the page as a file for
     Ollama): done, 2026-10-20 (docs/decisions/2026-10-20-03-open-in-claude.md); Claude tested by the maintainer; to try:
     ChatGPT's canvas and Gemini's Canvas; a CHEPTA connector (MCP) later, with step 1;
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
  - The list of missing properties is a new dated file at every update, `docs/missing-properties/MISSING_PROPERTIES_<date>.md`, made by
    `validation/python/missing_properties.py`; the earlier files stay, so the gaps can be followed over time
    (2026-10-22; DATA_RULES section 12).
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
