# 2026-10-20: the phase envelope with an activity model; no Examples on the ternary map and the envelope

- **Reported:** "i look at the workbench at the properties and equilibria, the phase envelope and it is not working
  ... your examples are not working there, i mean the examples you suggest. in fact take out the examples from the
  ternary curves as well, not needed it."
- **Found:** with an activity model (NRTL, the default) every phase envelope stopped with "Pmax is not defined": the
  readout's note read the top pressure, which was declared only inside the branch for mixtures. With an equation of
  state the envelope worked; the one gas example (nitrogen + oxygen, Peng-Robinson) was listed only when an equation
  of state was chosen, so every example offered with NRTL failed.
- **Fixed:** the top pressure and the note are `envelopeTop` and `envelopeNote` in `src/ui/app-logic.js`, tested in
  `test/app.test.js` (ethanol + water with NRTL; nitrogen + oxygen with Peng-Robinson). Checked in Chromium: the five
  examples that failed now draw.
- **Removed:** the Examples menu of the ternary map and the phase envelope (`NO_EXAMPLES` in `src/ui/workspaces.js`);
  T-x-y, P-x-y, azeotropes and the flash keep theirs. `test/workbench-navigation.test.js` checks the two views have
  none (the test listed them among the views with examples; changed with a comment).
- **Asked at the same time, for proposal 0013:** phase envelopes of gases up to the critical point, and charts such as
  enthalpy-entropy for compression, together with the steam charts. They need the mixture entropy and an envelope
  traced through the critical point; recorded in proposal 0013.
