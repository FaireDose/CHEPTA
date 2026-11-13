# Choosing the property method

A calculation is only as good as its property method, and a test only means something if it uses
the method an engineer would choose for that mixture. Every new test, benchmark and example
first chooses the method by the rules below. A test that uses a method outside its recommended
domain on purpose (to check an error message, or a code path that must work for any method)
says so in a comment.

## The rules

From the decision trees of Eric Carlson (Aspen Technology) and the heuristics that follow
them, as presented in the Northwestern University *Chemical Process Design Open Textbook*, page
"Property package", revision 4210
(https://processdesign.mccormick.northwestern.edu/index.php/Property_package, free to read; the
page credits the trees to Carlson without a reference to his original article). The page lists
Towler and Sinnott (2012), Chaves (2015), Ulrich (1984) and Walas (1990) as its references.
Read on 2026-10-09:

1. **Polar or not?** Water, alcohols, acids, ketones, esters, ethers, amines and chlorinated
   solvents are polar. Hydrocarbons and the light gases are not. In gas processing, cubic
   equations of state are used with N₂, CO₂, H₂S, CO, O₂, Ar and H₂ (the Cavett problem uses
   Peng–Robinson with them).
2. **Nonpolar, real components:** Peng–Robinson or SRK, at any pressure. Use fitted k_ij where
   they exist.
   - **Light gases with polar components** (methanol from syngas, CO + 2 H₂ or CO₂ + 3 H₂; hydrogenations): the
     equation of state, as gas-phase reactors and synthesis loops are simulated (for example the DWSIM methanol
     synthesis tutorial, Peng–Robinson; https://dwsim.org/tutorials/en/advanced/07-methanol-synthesis.html, read on
     2026-10-23). An activity model cannot hold the gases: Modified UNIFAC 2.0 has no groups for H₂ or CO, NRTL and
     UNIQUAC no pairs, and an activity model with a cubic vapour (γ-φ) needs every liquid component below its critical
     temperature, as H₂ (33 K) and CO (133 K) are not (dissolved gases need Henry's law, which CHEPTA has for ten gases
     in water: below). CHEPTA refuses them with that remedy; the "ideal" model (Raoult's law) too, where the gas's
     vapour-pressure curve, extrapolated far above its critical temperature, has no finite value (hydrogen above about
     150 K). The polar liquid alone (the methanol–water column) is where
     an activity model is more accurate; PSRK, which puts UNIFAC with gas groups inside an equation of state, would do
     both and is not in CHEPTA yet (step 4).
   - **Gases dissolved in water** (an absorber, a stripper; proposal 0017, the maintainer, 2026-11-04): an activity
     model with water as the only solvent treats the gases that have a Henry's law constant in water (H₂, N₂, O₂, CH₄,
     C₂H₆, Ar, CO, CO₂, H₂S: IAPWS G7-04; ethylene: Sander 2023) as Henry components, f = H x, with water by Raoult's
     law; a mixed solvent is refused. Peng–Robinson or SRK with a light gas and a polar liquid runs only where each such
     pair has a k_ij, with a warning, as the DWSIM Property Packages Guide advises ("Sour gas (with H2S, CO2): PR with
     kij ... Set binary interaction parameters"; Peng–Robinson "performs poorly for water/alcohol mixtures";
     https://dwsim.org/tutorials/en/reference/property-packages-guide.html, read 2026-11-04). Sour water (NH₃ with H₂S
     or CO₂) and amines need an electrolyte model ("Sour water (NH3, H2S, CO2): Sour Water ... Specialized for gas
     treating", the same guide): not in CHEPTA yet (methods track M5), so refused.
3. **Polar, no electrolytes, below 10 bar, with interaction parameters:**
   - an activity model: NRTL or UNIQUAC, or Wilson when there is only one liquid (`WILSON`, proposal 0016; ChemSep's
     Wilson set, tier databank, 165 pairs, and Wilson pairs of one's own in My data);
   - for the vapour, the ideal gas at low pressure, or an equation of state.
4. **Polar, above 10 bar:** PSRK, or a cubic equation with Wong–Sandler or MHV2 mixing rules.
   CHEPTA's rule of this kind is MHV1 in the PSRK form, "PR + gE (MHV1)" and "SRK + gE (MHV1)" (proposal 0018): an
   EoS/gE mixing rule, which Privat and Jaubert (Fluid Phase Equilib. 567 (2023) 113697, open access, CC BY 4.0,
   eqs. 25-27, p. 8) show to be a k_ij(T, z), the form that "k_ij(T) coefficients cannot accurately model" for "the most
   complex mixtures involving polar and associating compounds" (section 3.4, p. 8; as quoted in docs/decisions/2026-11-06-02-mhv1.md). It is only as good as its pairs' NRTL
   sets (the table below lists them). PSRK itself, Wong–Sandler and MHV2 are not in CHEPTA.
5. **Electrolytes** (salts, ionized acids and bases): electrolyte NRTL or Pitzer. **Not in
   CHEPTA yet.**
6. **Reduced temperature** by Kay's rule, Tr = T / Σ zᵢ Tc,ᵢ:
   - above about 0.75 (with no second liquid expected): an equation of state;
   - below it, for **polar** mixtures: an activity model for the liquid;
   - below it, for **nonpolar hydrocarbons**: Peng–Robinson or SRK, as rule 2 (the maintainer, 2026-10-29, on the
     benzene + toluene benchmark column: "I was expecting Peng Robinson for the hydrocarbons"). The source gives both
     here: its decision tree sends nonpolar real components to an equation of state, and its heuristics 3 and 4 give a
     solution model below 0.75 (Wilson "for C4-C18 hydrocarbons" and "for aromatics"). Its heuristic 8 says when the
     choice matters: where the infinite-dilution activity coefficients are all below 1.3 and there is no azeotrope,
     many models are reasonably accurate (benzene + toluene: about 0.98 with NRTL, and the bubble points of NRTL, SRK,
     Peng–Robinson and Raoult's law at the ChemSep Book's ten stage compositions are within 0.45 K of the book's).

   Activity models can be stretched, with growing error, to about 0.9.
7. **Two liquids:**
   - NRTL and UNIQUAC describe them; Wilson can't (it gives one liquid whatever the parameters). In CHEPTA a Wilson
     system warns at every result where a pair's NRTL (else UNIQUAC) set predicts two liquids at that temperature, and
     the column refuses to look for two liquids (phases "VLL") with Wilson (proposal 0016).
   - A cubic equation of state with the classical mixing rule is not used where a second liquid
     forms. Water + hydrocarbons need special treatment, which CHEPTA doesn't have.
8. **Physical sense:** no temperature below the melting point of a component that is present
   (it would freeze), and parameters used within the temperature range they were fitted to where possible. Outside
   it the engine continues a record with a warning (2026-11-13, DATA_RULES section 3, "Ranges"): a result that carries
   such a warning is an extrapolation, not data; prefer a method whose records cover the conditions.

## When in doubt: what other simulators do

The maintainer, 2026-11-04: "check again what the other simulators are doing where you have a doubt, put this as a
method in fact". Where the rules above leave a case open, or a choice would refuse a calculation engineers routinely
make (a method, a refusal, a default), check how other simulators handle it before deciding:

1. **Which simulators:** those whose documentation anyone can read for free: DWSIM (its Property Packages Guide and
   tutorials), ChemSep and COCO (The ChemSep Book, the COLAN forum where its authors answer), and open method guides
   (the Northwestern open textbook above). Commercial manuals behind a login are not cited (AGENTS.md rule 1).
2. **What to record:** the page, the date it was read, and the sentences that decide the case, quoted, in the
   decision file and in this page when it changes a rule.
3. **What it decides:** whether a calculation is offered, refused or offered with a warning. Another simulator's
   practice never replaces the sources of the numbers: parameters still come from open data or databanks, and every
   method is still tested against an independent calculation and open data.
4. **Where they differ from CHEPTA's rules,** say so and give the reason (CHEPTA refuses where its parameters cannot
   support the result; another simulator may leave that judgement to the user).

Checked so far:

| Case | Other simulators (read 2026-11-04) | CHEPTA |
|---|---|---|
| Gases dissolved in water (absorbers) | DWSIM's base property package carries Henry's law constants (`UseHenryConstants`, DWSIM class library, https://dwsim.org/api_help/html/P_DWSIM_Thermodynamics_PropertyPackages_PropertyPackage_UseHenryConstants.htm) | an activity model with Henry's law for the gases with an open constant (IAPWS G7-04, Sander 2023), proposal 0017 |
| A light gas with a polar liquid in Peng–Robinson or SRK | DWSIM Property Packages Guide (https://dwsim.org/tutorials/en/reference/property-packages-guide.html): "Sour gas (with H2S, CO2): PR with kij ... Set binary interaction parameters"; "For PR/SRK with strongly polar or quadrupolar compounds (CO2, H2S), the kij values matter"; "Peng-Robinson is excellent for hydrocarbons and gases, but performs poorly for water/alcohol mixtures" | offered, with a warning, where the pair has a k_ij; refused without one; **carbon dioxide + water and carbon dioxide + methanol** with the temperature-dependent k_ij = a + b/T fitted to ThermoML data, with a fit-quality known issue (CO2 + water: 14-15 % in P, 10-11 % in solubility; CO2 + methanol: 7 % in P, 13 % in solubility; the maintainer, 2026-11-06; docs/decisions/2026-11-06-01-kij-temperature.md). A temperature-dependent k_ij is established practice (Privat and Jaubert, Fluid Phase Equilib. 567 (2023) 113697; PPR78's k_ij(T)); DWSIM's Peng-Robinson package takes a constant k_ij (PengRobinson.vb, commit 1abf72d). ChemSep's constant k_ij of CO2 + water stays refused in a liquid (not usable, 2026-11-05) |
| A light gas with a polar liquid above 10 bar: a cubic equation with a gE mixing rule (rule 4) | DWSIM (read 2026-11-10): its class library lists no EoS/gE property package (no PSRK, MHV or Wong–Sandler; https://dwsim.org/api_help/html/N_DWSIM_Thermodynamics_PropertyPackages.htm, which lists PengRobinsonPropertyPackage, PRSV2PropertyPackage, PRSV2VLPropertyPackage, SRKPropertyPackage among others), and its Property Packages Guide (the page above) gives "PR or PRSV2" for hydrocarbons at "High pressure (> 100 bar)" ("PRSV2 has better accuracy for polar species") and "PR with kij" for sour gas, with no pressure condition. The open thermo library (Caleb Bell) has a PSRK class, against which CHEPTA's rule is tested (docs/decisions/2026-11-06-02-mhv1.md) | the advisor recommends "PR + gE (MHV1)" or "SRK + gE (MHV1)" above 10 bar where every gas + polar pair of the mixture has an NRTL set the rule can use (one fitted inside the rule, else the databank's), and gives the engine's refusal where one has none; PR or SRK with k_ij stays what runs unless the user switches. CHEPTA follows the method guide's rule 4 and its 10 bar where DWSIM offers no gE rule at all (docs/decisions/2026-11-10-04-mhv1-followups.md) |
| Sour water (NH3, H2S, CO2 in water), amines | the same guide: "Sour water (NH3, H2S, CO2): Sour Water ... Specialized for gas treating"; "Aqueous electrolytes: Electrolyte NRTL" | refused until the electrolyte methods (roadmap M5) |
| A dimerizing acid (acetic acid) in a distillation column (read 2026-11-12) | ChemSep offers the vapour's association on the stages: The ChemSep Book (2nd ed., 2006, public domain, section 10.1.5, pp. 134-135): "Hayden-O'Connell ... You must input the association parameters" and "Chemical theory This is an extension of the Hayden O'Connell virial model that takes into account the association between molecules". DWSIM's Property Packages Guide (the page above) has "Acid/water \| NRTL or UNIQUAC \| NRTL is the safer default" and names no vapour-association model; its class library lists none | the rigorous and the shortcut column with NRTL or UNIQUAC and the chemical theory on every stage (monomers and dimers, the vapour's enthalpy with the dimerization enthalpy), as the flash; not switched off, because the pairs with acetic acid were fitted with it (the same column without it: 0.869 instead of 0.960 water in the distillate) (docs/decisions/2026-11-11-08-acetic-acid-columns.md) |
| A dimerizing acid with two liquids (water + acetic acid + an entrainer; read 2026-11-12) | Pirola et al., Chem. Eng. Trans. 32 (2013) 1897 (free to read, https://www.aidic.it/cet/13/32/317.pdf, section 2) computed "the phase equilibria (vapor-liquid and vapor-liquid-liquid) of the ternary system water/acetic acid/p-xylene" with modified UNIFAC and "the Hayden-O'Connel correlation to take into account the acetic acid association" (PRO/II) | the three-phase flash, the heater and the columns' stages (distillation, absorber, stripper) with the chemical theory and two liquids (docs/decisions/2026-11-12-02-acid-chemical-theory-vlle.md) |
| Gas-liquid flow in a pipe (read 2026-11-10) | DWSIM's pipe segment offers Lockhart-Martinelli and Beggs-Brill. Its LockhartMartinelli.vb (DWSIM.UnitOperations/FluidFlowCorrelations, GPL-3.0) takes Chisholm's form with C = 20 whatever the regimes ("fi_Ltt = 1 + 20 / X + 1 / X ^ 2"), each phase alone with its own friction factor and the pipe's roughness ("fsl = FrictionFactor(Re_SL, D, k)"), and the elevation with the no-slip holdup ("dPg = (Cg * rhov + Cl * rhol) * g * Math.Sin(teta) * L", Cg = Vsg / Vm) | Lockhart-Martinelli in Chisholm's form with C by the regimes (5, 10, 12, 20; Filip et al. 2014, eq. 17; ANL/CP-74646, Table 1), each phase alone with the block's friction factor and the roughness, as DWSIM; the no-slip holdup for elevation and acceleration, as DWSIM, with a warning on an elevation change; fittings, two liquids and choked flow refused (proposal 0020, step 4; docs/decisions/2026-11-10-06-pipe-two-phase.md). Beggs-Brill: later |

## What this means for CHEPTA today

| Mixture | Method in CHEPTA | Status |
|---|---|---|
| Hydrocarbons and light gases, any pressure and reduced temperature | Peng–Robinson or SRK with the databank's k_ij (0 where it has none, with a warning) | covered |
| Polar liquids below 10 bar | NRTL or UNIQUAC with fitted or databank pairs; ideal-gas or PR/SRK vapour | covered where the pairs exist (docs/DATA_WANTED.md) |
| Polar liquids below 10 bar, one liquid | Wilson with pairs fitted to ThermoML data (332 sets) or ChemSep's databank pairs; ideal-gas or PR/SRK vapour | covered where the pairs exist (roadmap M1, proposal 0016); refused or warned where two liquids form |
| Polar mixtures above 10 bar | (PSRK, MHV2, Wong–Sandler, CPA) | **SRK/PR + gE (MHV1)** with NRTL (proposal 0018, the maintainer, 2026-11-06; `mixing: "MHV1"`): pairs fitted inside the rule (CO + methanol and H2 + water within the 5 % gate; H2, CO2 and CH4 + methanol, CO and CH4 + water, and with PR CO2 + water, with fit-quality known issues; the water pairs but CO2 + water fitted to IAPWS G7-04) or the databank's NRTL sets; a light gas with a polar liquid without a set is refused (CO2 + water with SRK, nitrogen + ethanol). Against the k_ij fits on the same ThermoML data: better for every gas in methanol, and with PR for CO2 + water (11.4 % in P against 13.8 %); CHEPTA-Lab's separator runs under PR + gE (MHV1) (docs/decisions/2026-11-06-02-mhv1.md). Water's association: CPA, roadmap M3 (Privat and Jaubert 2023, section 3.4). PSRK's and MHV2's group tables are not open; CPA: roadmap M3 |
| Water + hydrocarbons (two liquids) | (CPA, or a free-water approach) | **not available**; the engine refuses a second liquid with an equation of state; planned: roadmap M3 |
| Electrolytes | (eNRTL, Pitzer) | **not available**, shown as "not available yet"; planned: roadmap M5 (ionic liquids: M6) |
| Polymers | (Flory–Huggins, PC-SAFT) | **not available**; planned: roadmap M4 |

## Two liquids: extraction and decanting (proposal 0015, Part I, section 6)

- **Method:** NRTL or UNIQUAC. Only the liquid's activity coefficients set the two liquids, so the vapour model does
  not matter for a liquid-liquid calculation. With the acid chemical theory, the vapour-liquid-liquid flash and the
  columns' stages hold two liquids too, the vapour of monomers and dimers in equilibrium with both
  (docs/decisions/2026-11-12-02-acid-chemical-theory-vlle.md).
- **Parameters:** a binary fit reproduces its own pair, not a ternary. Where the pairs were fitted to binary data only,
  check the ternary's tie lines first. Water + acetic acid + ethyl acetate: the default sets miss the measured tie lines
  by up to 0.16 in mole fraction in the ester-rich liquid. For extraction, choose the jointly fitted sets
  `fitted-lle-roque2018` of all three pairs together (`sets`; validation/python/fit_ternary_lle.py). They follow the
  tie lines and still follow each pair's binary data.
- **Fit targets** (the maintainer, 2026-10-29): each record's stated uncertainty, per system, with the solute in view;
  0.01 in mole fraction is not a target for every system.
- **No measured tie lines:** Modified UNIFAC 2.0 gives a prediction (tier "predicted"), to be compared with what data
  there are.

## Where the rules are applied

- **MHV1 as a choice** (proposal 0018; docs/decisions/2026-11-10-03-mhv1-interface.md): "PR + gE (MHV1)" and "SRK +
  gE (MHV1)" are chosen where a method is chosen: the Model selector of the workbench and the flowsheet's Method page
  (the equation list), a column's own method, `thermo.mixing` of a project, of `CHEPTA.run` and of the command line and
  MCP tools (`thermo: { model: "PR", mixing: "MHV1" }`), and `system({ model, mixing: "MHV1" })`. Each pair takes the
  first of a set fitted inside the rule, the databank's NRTL set, else g^E = 0 with a warning; a light gas with a polar
  liquid without a set is refused, and the interface shows the engine's reason. Also in a heat exchanger stream's own
  method and the Charts workspace's Equation list (docs/decisions/2026-11-10-04-mhv1-followups.md). The Library lists
  each set fitted inside the rule (`library.sets(a, b, "PR", { mixing: "MHV1" })`) with its source, tier and fit quality,
  and the Sources browser names what uses each source.

- **The flowsheet test suite** (docs/FLOWSHEET_TESTS.md): every generated case is checked
  against rules 2–8 before it is accepted (`method_check` in
  `validation/python/reference_flowsheet_suite.py`). Draws that fail are rejected and listed
  with the reason.

## The method advisor

`src/thermo/method-advice.js` applies rules 1–4 to every system:

- `system(...).info.advice` holds a note when the method is not the recommended one for the
  components, for example Peng–Robinson with water + ethanol. Calculation results carry the note
  in their `warnings`.
- An activity model above about 10 bar gets a note at that pressure.
- **Above about 10 bar, a light gas (the gases of rule 1, and methane) with a polar component** (rule 4; the maintainer,
  2026-11-10): Peng–Robinson or SRK with k_ij, or an activity model, gets a note that recommends "PR + gE (MHV1)" or
  "SRK + gE (MHV1)", naming where each gas + polar pair's NRTL set comes from (fitted inside the rule, with its
  fit-quality warning, or the databank's set fitted at low pressure). It asks the engine first (`mhv1Availability` in
  `src/thermo/eos/system.js`): the note never recommends a rule the engine would refuse. Where the chosen equation's
  rule is refused but the other's runs (SRK with CO2 + water), it names the one that runs and gives the refusal; where
  both are refused (nitrogen + ethanol: no set in the rule or the databank), it says so with the engine's reason and
  recommends nothing. The pairs with a set fitted inside the rule (`src/data/mhv1.json`): with both PR and SRK, CO2,
  H2, CO and CH4 + methanol, and H2, CO and CH4 + water; with PR only, CO2 + water. With the rule itself chosen there is
  no such note.
- The workbench shows the note above the parameter sets in the Inputs panel, and on the
  flowsheet's Method page.
- `library.sets(...)` marks equation-of-state k_ij of pairs with a polar component
  `recommended: false`, and the Library says why.

The advice is a note, never a refusal: a person may compare methods on purpose.

## Older tests, reviewed (2026-10-09)

Written before these rules, these tests use an equation of state for polar liquids. Each now
says in a comment why it does so on purpose:

- `test/diagrams-any-model.test.js`: draws methanol + water, methanol + chloroform and
  methanol + acetone + chloroform with PR or SRK. It checks that the diagram code works with
  any method, not the method's accuracy.
- `test/benchmark-ethanol-dehydration.test.js`, `test/benchmark-ethyl-acetate.test.js`,
  `test/benchmark-methanol-synthesis.test.js`: PR and SRK k_ij fitted to polar pairs (proposal
  0004). They are kept to show how far a plain cubic equation is from the data, and labelled
  "not recommended" for the liquid. The recommended methods (NRTL, UNIQUAC; PSRK or MHV2 above
  10 bar) are tested elsewhere, or not available yet.
- `test/eos.test.js`, `test/eos-stability.test.js`: methane + water (+ nitrogen) with PR, as in
  gas processing for the water content of a gas. They check the messages and the refusal of a
  second liquid, not the liquid's accuracy.
