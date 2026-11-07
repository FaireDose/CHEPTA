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
   **CHEPTA does not have these yet**; such mixtures are outside what it can calculate well.
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
   (it would freeze), and parameters used only within the temperature range they were fitted
   to.

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
| Sour water (NH3, H2S, CO2 in water), amines | the same guide: "Sour water (NH3, H2S, CO2): Sour Water ... Specialized for gas treating"; "Aqueous electrolytes: Electrolyte NRTL" | refused until the electrolyte methods (roadmap M5) |

## What this means for CHEPTA today

| Mixture | Method in CHEPTA | Status |
|---|---|---|
| Hydrocarbons and light gases, any pressure and reduced temperature | Peng–Robinson or SRK with the databank's k_ij (0 where it has none, with a warning) | covered |
| Polar liquids below 10 bar | NRTL or UNIQUAC with fitted or databank pairs; ideal-gas or PR/SRK vapour | covered where the pairs exist (docs/DATA_WANTED.md) |
| Polar liquids below 10 bar, one liquid | Wilson with pairs fitted to ThermoML data (332 sets) or ChemSep's databank pairs; ideal-gas or PR/SRK vapour | covered where the pairs exist (roadmap M1, proposal 0016); refused or warned where two liquids form |
| Polar mixtures above 10 bar | (PSRK, MHV2, Wong–Sandler, CPA) | **SRK/PR + gE (MHV1)** with NRTL (proposal 0018, the maintainer, 2026-11-06; `mixing: "MHV1"`): pairs fitted inside the rule (CO + methanol within the 5 % gate) or the databank's NRTL sets; a light gas with a polar liquid without a fitted set is refused. Against the k_ij fits on the same ThermoML data: better for H2, CO, CH4 and CO2 + methanol, not better for CO2 + water (docs/decisions/2026-11-06-02-mhv1.md). PSRK's and MHV2's group tables are not open; CPA: roadmap M3 |
| Water + hydrocarbons (two liquids) | (CPA, or a free-water approach) | **not available**; the engine refuses a second liquid with an equation of state; planned: roadmap M3 |
| Electrolytes | (eNRTL, Pitzer) | **not available**, shown as "not available yet"; planned: roadmap M5 (ionic liquids: M6) |
| Polymers | (Flory–Huggins, PC-SAFT) | **not available**; planned: roadmap M4 |

## Two liquids: extraction and decanting (proposal 0015, Part I, section 6)

- **Method:** NRTL or UNIQUAC. Only the liquid's activity coefficients set the two liquids, so the vapour model does
  not matter for a liquid-liquid calculation. (With the acid chemical theory, the vapour-liquid-liquid flash itself still
  refuses a second liquid.)
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
