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
  - Neopentane (0.006-0.009 mol %) is counted as isopentane, as CHEPTA has no neopentane; said in the data file and
    on the chart. The real gas RG14 is not used: helium and methylcyclohexane are not CHEPTA components.
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
