# 2026-11-10-04: MHV1 follow-ups: the method advisor, the heat exchanger and Charts, the Library

## What the maintainer decided (2026-11-10, relayed by the coordinating session)

Answers to the four open items of #216 (docs/decisions/2026-11-10-03-mhv1-interface.md), all four accepted:

1. Project format 7 when the rule is used (done in #216).
2. The method advisor recommends MHV1 above 10 bar for a gas with a polar liquid.
3. Offer MHV1 in the heat exchanger's stream methods and the Charts equation list.
4. Show the MHV1 parameter sets in the Library.

Items 2, 3 and 4 are built here, in that order, in one pull request.

## 2. The method advisor (`src/thermo/method-advice.js`)

- **The rule and its threshold** come from docs/METHOD_SELECTION.md, rule 4 (the Carlson decision tree as given in the
  Northwestern open textbook): "Polar, above 10 bar: PSRK, or a cubic equation with Wong–Sandler or MHV2 mixing rules".
  MHV1 in the PSRK form is CHEPTA's rule of that kind (proposal 0018). Privat and Jaubert 2023 (Fluid Phase Equilib. 567,
  113697, open access, CC BY 4.0), as quoted in docs/decisions/2026-11-06-02-mhv1.md: EoS/gE rules are a k_ij(T, z)
  (eqs. 25-27, p. 8), and "k_ij(T) coefficients cannot accurately model the most complex mixtures involving polar and
  associating compounds" (section 3.4, p. 8). Rule 4 of the guide is updated to say CHEPTA has this rule.
- **What other simulators do** (the guide's "When in doubt", read 2026-11-10): DWSIM's class library
  (https://dwsim.org/api_help/html/N_DWSIM_Thermodynamics_PropertyPackages.htm) lists no EoS/gE package (no PSRK, MHV or
  Wong–Sandler); its Property Packages Guide gives "PR or PRSV2" for hydrocarbons at "High pressure (> 100 bar)" and "PR
  with kij" for sour gas, with no pressure condition. So DWSIM leaves this case to k_ij; CHEPTA follows the method guide's
  rule 4 and its 10 bar, because it has the rule and fitted sets for it. Recorded in the guide's table.
- **When:** P above 1000 kPa, a light gas of rule 1 or methane with a polar component, and the method is PR or SRK with
  k_ij or an activity model (Raoult's law excluded). With the rule chosen, no note.
- **Never a refused method:** the advisor asks the engine (`mhv1Availability` in `src/thermo/eos/system.js`, which runs
  `gEMatrices` for PR and SRK and catches its NOT_AVAILABLE refusal). It recommends the chosen equation's rule where it
  runs, else the other equation's (SRK with CO2 + water: "PR + gE (MHV1)", with SRK's refusal quoted); where both are
  refused (nitrogen + ethanol: no set in the rule or the databank) it says so with the engine's reason and recommends
  nothing.
- **Which pairs have MHV1 sets** (`src/data/mhv1.json`): with PR and SRK, CO2, H2, CO and CH4 + methanol, H2, CO and
  CH4 + water; with PR only, CO2 + water. Other gas + polar pairs use the databank's NRTL set where one exists; the note
  names each pair's source ("fitted inside the rule, with a fit-quality warning", or "the databank's NRTL set, fitted at
  low pressure").
- The note's first sentence is its one-line title in the interface: "Above 10 bar, PR + gE (MHV1) is recommended here."
  or "Above 10 bar the gE rule (MHV1) would suit, but it has no set here."
- The older notes that said "PSRK ... not in CHEPTA yet" (an equation of state with polar components, an activity model
  above 10 bar) now name "PR + gE (MHV1)" and "SRK + gE (MHV1)"; the activity-model note leaves the name out where a gas
  + polar pair is present, since the MHV1 note then says whether the rule runs.

## 3. The heat exchanger and Charts

- **Heat exchanger, process exchanger:** each stream's own method lists "PR + gE (MHV1)" and "SRK + gE (MHV1)"
  (`hx.hot.mixing`, `hx.cold.mixing`: null or "MHV1", only with the stream's own PR or SRK, else refused with the reason).
  A stream without its own model takes the workspace's model and rule. Its pair list shows the rule's sets. Project
  files: format 7 when a stream uses the rule.
- **Charts, Any fluid:** the Equation list has the two MHV1 entries; the pick is the workbench's `mixing`, which the
  chart's system already took (`modelSystem`), so a chart of CO2 + methanol under "PR + gE (MHV1)" is the engine's.

## 4. The Library

- `CHEPTA.library.sets(a, b, "PR" | "SRK", { mixing: "MHV1" })` lists the pair's NRTL set fitted inside the rule: set
  "mhv1-fitted", tier, source ids and sources, the fit's description with its deviations (`source`), the temperature range,
  the NRTL parameters and `quality_warning` (null where the fit met the 5 % gate). Without `mixing`, `sets()` is unchanged
  (k_ij only), so existing callers see nothing new.
- The Sources browser names, under each source, the MHV1 sets that use it ("PR + gE (MHV1): NRTL sets in the rule").
- The Inputs panel's list of pairs, with the rule chosen, is headed "Pairs, PR + gE (MHV1): NRTL in the rule" and shows
  under each pair its tier, the set's source with its deviations and its fit-quality warning.

## Tests

- `test/method-advice.test.js`: five new tests; each case checks the note against `system({ model, mixing: "MHV1" })`
  built directly (it runs where the note recommends it, is refused where the note says so, and the note quotes the
  engine's refusal and source).
- `test/mhv1-followups.test.js`: the heat exchanger (a stream's method, its outlet equal to the engine's and closing its
  energy balance, different from k_ij, format 7), Charts (the chart equal to the engine's, different from k_ij), the
  Library (every set of mhv1.json with its source, tier and fit quality, the same as the engine's info.pairs, in usedBy).
- Screenshots: docs/ui-review/2026-11-10-mhv1-followups/ (375 and 1280 px, light and dark): the advice note (SRK, CO2 +
  water, 5000 kPa), the heat exchanger with a PR + gE (MHV1) cold stream, Charts, and the pair list under the rule.

## What the maintainer must check

- The wording of the advisor's note (Results panel of a flash of CO2 + water with SRK at 5000 kPa) and that the 10 bar of
  rule 4 is the right threshold for a gas with a polar liquid.
- The heat exchanger and Charts lists in the browser (the screenshots were taken from the built bundle, headless).

## Open (recommendation each)

1. **The flowsheet's Method page pair list** shows each pair's source through `mhv1-status.js`, but not the fit-quality
   warning in the same form as the Inputs panel. Recommended: align it in a small later change.
2. **The advisor for a polar liquid alone above 10 bar** (no light gas, e.g. methanol + water at 20 bar) says "PR + gE
   (MHV1) or SRK + gE (MHV1)" in general words, since the rule then takes the databank's low-pressure NRTL sets.
   Recommended: keep it a general note until there are high-pressure sets of such pairs.
