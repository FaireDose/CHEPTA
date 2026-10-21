# 2026-10-21: the phase envelope of gases, traced through the critical point (proposal 0013, step 7, first part)

- **Asked:** "what happened with the phase envelope and Entropy enthalpy stuff. I see the envelope curves are still
  here and nothing seems to work. I see you still need two. phase envelope is for gases and petrochemicals so maybe
  you make some real industrial examples from these ones where i see a real phase envelope with a two phase region".
- **Done:**
  - `src/equilibrium/envelope.js`, `CHEPTA.phaseEnvelope(sys, z)`: with an equation of state, the dew and bubble
    curves as one line through the mixture critical point (continuation in ln K, ln T, ln P after Michelsen 1980,
    with the equations as the open-source thermopack writes them, Apache 2.0), with the critical point, the
    cricondenbar and the cricondentherm. 20-150 ms for a natural gas of ten components.
  - The Phase envelope view: with an equation of state and two components or more, the traced line, the two-phase
    region shaded, the three points marked, a readout of the dew points (two in the retrograde region) and the bubble
    point at any temperature; tables of the line and the points for the exports. With an activity model the view is as
    before (bubble and dew points pressure by pressure), and a **Use Peng–Robinson** button appears when the
    components need an equation of state (gases, or one component).
  - Examples: three synthetic natural gases with measured dew points (Zhang et al., ACS Omega 5 (2020) 8463, open
    access, Tables 2 and 3, read from the PubMed Central full text by script), drawn as crosses on the chart, and a
    classic retrograde binary (methane 0.7, n-butane 0.3). Choosing one sets Peng–Robinson and the feed. The
    envelope takes up to 12 components (the gases have ten); the workbench's list too (`MAX_COMPONENTS` 12).
  - Neopentane, helium and methylcyclohexane, which the gases contain and CHEPTA did not have, were added (see the
    review below); the first version counted neopentane as isopentane and left the real gas RG14 out.
- **Tested:** CoolProp 8.0.0's Peng-Robinson (`validation/python/reference_envelope.py`, k_ij = 0): methane +
  n-butane within 0.4 % along the whole line, critical point within 0.05 K; the natural gas SNG27 against CoolProp's
  saturation solver, bubble within 0.01 K, dew within 0.1 K. CoolProp's own envelope trace drifts on the bubble side
  of the natural gas (about 9 K off its own flashes at 4.3 MPa), and its critical-point solver gives a point 0.2 K off
  its own flash curve, so the test uses its flashes. Measured dew points, with CHEPTA's k_ij: mean deviations PR
  4.50, 3.09, 3.16 K and SRK 2.43, 1.80, 1.76 K for SNG26-28, as the paper's own figures for these equations (Table 4:
  PR 4.66, 3.41, 3.45 K; SRK 2.81, 1.93, 1.41 K).
- **Tests changed** (each with a comment): the envelope's largest list (6 to 12), its Examples menu (none since
  2026-10-20; now the real gases, by this request), the example check (an example made for a view is checked with its
  own method).
- **Not done yet:** the P-H, T-S and H-S charts (the Steam workspace becoming Charts): they need the entropy of
  step 6, so they come with it, next.
- **For the maintainer to check:** the compositions and dew points of `validation/data/envelope/zhang2020_natural_gas.json`
  against Tables 2 and 3 of the article (https://pmc.ncbi.nlm.nih.gov/articles/PMC7178342/).

## Review of 2026-10-21: the conflict, the three components, a new rule

- "147 has a conflict please check": main (with pull request #146) merged into the branch; the conflicts were
  neighbouring lines (the envelope's component count and the heat exchanger's start aliases and input hints; both
  sets of imports), kept from both sides.
- "you mentioned three components, neopentane, methylcyclohexane and helium. add them also": registry batch 11
  (validation/data/component_registry.json), with `gap_report.py` first (no gaps):
  - **neopentane** and **helium**: CoolProp 8.0.0 fluids (constants and the records fitted to CoolProp, as every
    CoolProp fluid; helium's vapour viscosity within 2.9 % of its 3 % target, the rest within 1 %); helium's melting
    data are ChemSep's (the WebBook has none);
  - **methylcyclohexane**: not a CoolProp fluid, so ChemSep, taken as it is (rule of 2026-10-14);
  - Mod. UNIFAC 2.0 groups for neopentane (4 CH3, 1 C) and methylcyclohexane (1 CH3, 5 CY-CH2, 1 CY-CH), the same as
    DDBST's; helium has none (no subgroup);
  - k_ij: ChemSep has helium + carbon monoxide only (0.5463 PR, 0.6507 SRK); no pair of neopentane or
    methylcyclohexane, so k_ij = 0 with the others, as the view says; NRTL and UNIQUAC sets of methylcyclohexane with
    methanol and with phenol from ChemSep (tier databank; both predict the liquid split these pairs are known for,
    not checked against data in this import, as the sets say).
  - The natural gases now use the real components: neopentane is no longer counted as isopentane, and the real gas
    **RG14** (21 components, with hydrogen and helium) is a fourth example. The envelope takes up to 24 components.
- **Found on the way, not changed** (for the maintainer): the ChemSep imports would also add pairs that were never
  imported: NRTL for 2,3-butanediol + water, ethanol + isoamyl alcohol and isoamyl alcohol + water, and PR and SRK
  k_ij for n-hexane + isoamyl alcohol. They were left out of this pull request (DECISIONS.md, open items).
- The envelope, made robust by the larger gases: the jump over the critical point starts from the mirror point (every
  ln K negated, as thermopack's change of formulation), from |ln K| = 0.03; a bubble curve that turns back up (hydrogen,
  helium) ends at three times its lowest pressure, said in the notes. SNG26-28 unchanged within 0.1 K; RG14 against
  its measured dew points: PR 2.72 K, SRK 1.26 K (the paper: 1.58 and 2.12 K).
- **"add a new rule, when you encounter new chemicals propose to add them as well and their relevant properties"**:
  AGENTS.md rule 8 and DATA_RULES.md section 1: a chemical a task meets that CHEPTA does not have is proposed for
  addition with the properties the task needs (gap_report.py --new first), never replaced silently; a stand-in until
  then is stated.
- Tests changed because the new components make them wrong, each with a comment: the component counts (171 to 174),
  the gases at 25 °C (23 to 25), the k_ij count and bound (helium's large k_ij), the vapour state of the typical-state
  test (helium's critical point is 1 K above its boiling point), the search for "eth" (methylcyclohexane), the
  selection-limit test (24).
- **For the maintainer to check:** the RG14 composition and dew points against Tables 2 and 3 of the article.
