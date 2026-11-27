# Card C: which calculations still work when a property is missing?

**Trigger.** A component lacks a property (a "no open data" note in `src/data/components.json`), a calculation
refuses or warns, and the person asks what they can still do.

**Minimum inputs.** The components, the property method, and the operations the person needs (activity
coefficients, bubble or dew point, flash, liquid-liquid or solid-liquid equilibrium, energy balance, a flowsheet
block); the refusal or warning text, if any.

**Steps.**

1. **Name the kind of gap**, because each behaves differently:
   - **an absent property**: no record at all (`vapourPressure_missing`, `available: false`, `critical: null`). What
     needs it refuses, naming the sources searched;
   - **outside a record's range**: the record exists but not at this temperature. The engine calculates and warns
     ("This is an extrapolation, not data."); `strictRanges: true` refuses (docs/DATA_RULES.md section 3, "Ranges");
   - **a method that cannot represent the phases**: the data are there, the model is not fit for it (Peng–Robinson or
     SRK without measured critical constants, DATA_RULES section 6; Wilson cannot give two liquids, section 5; no two
     liquids with a plain cubic equation, the standing rule in docs/DECISIONS.md).
2. **For each operation the person needs**, state one of: supported; supported with a named qualification (a
   predicted tier, an extrapolation warning, a stand-in); or blocked. Give the evidence: a test, or a run of the
   engine in this session.
3. **Give the smallest remedy** for each blocked operation: the person's own record in My data (proposal 0012, with
   its source and tier "user"); another method from docs/METHOD_SELECTION.md; or the search steps of DATA_RULES
   section 1 ("How to search for a missing number").
4. **Never reclassify a component as nonvolatile to get past a gap.** DATA_RULES section 10: a volatile liquid
   without an open vapour pressure is not made nonvolatile, because that would make every distillation with it wrong.
   Never estimate the missing value silently (AGENTS.md rule 1).

**Output.** A table: operation, status (supported / qualified / blocked), evidence, smallest remedy.

**Worked case: alpha-angelica lactone + water** (added without an open vapour pressure in
[PR #142](https://github.com/FaireDose/CHEPTA/pull/142); `test/no-vapour-pressure.test.js`, Modified UNIFAC 2.0).

| Operation | Status | Evidence |
|---|---|---|
| Activity coefficients | supported | `s.gammas([0.3, 0.7], 300)` finite and positive |
| Bubble point, flash | blocked: "No open data for the vapour pressure of alpha-Angelica lactone (searched: ...). Add your own vapour pressure for it in My data" | `s.bubbleT(...)`, `s.flash(...)` throw |
| Pure vapour pressure | blocked, the same message | `pure("angelica-lactone").psat(300)` throws |
| Liquid properties at 298.15 K | supported for density; no enthalpy (`h_J_mol` is null) | `pure(...).props(298.15, 101.325)` |
| Solid-liquid equilibrium | needs no vapour pressure (shown for lactide + water, another component of the same list) | `s.solidSolubility("lactide", 330)` |
| Remedy | the person's own vapour pressure in My data fills the gap; the databank stays unchanged | the engine overlay of [PR #131](https://github.com/FaireDose/CHEPTA/pull/131); the test's made-up record gives a finite `bubbleT` |
