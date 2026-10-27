# 2026-10-23: Light gases with an activity model, and CORE

## What the maintainer asked for

- "i tried CO + 2H2 to Methanol and even with UNIFAC it doesn not calculate it. we should make this work. in
  simulations in literature what thermodynamic methods they use. i get an error that CO deesn't have UNIFAC
  parameters". Then: "but UNIFAC 2.0+ PR would have worked right? i have also methanol".
- "i got ok for using personal license form CORE".

## What was done

- **The method for light gases.** Methanol from CO solves with Peng–Robinson and SRK. Methanol from CO₂ worked already.
  An activity model cannot hold H₂ and CO (docs/METHOD_SELECTION.md, step 1, the new note):
  - Modified UNIFAC 2.0 has no groups for them;
  - NRTL and UNIQUAC have no pairs;
  - with a Peng–Robinson vapour (γ-φ) every liquid component must be below its critical temperature.
- **What changed:**
  - **The flowsheet** no longer starts a calculation that cannot work. It says "Carbon monoxide and Hydrogen are light
    gases: an activity model describes liquids … use Peng–Robinson or SRK", with a **Use Peng–Robinson** button, on
    the canvas, the Components page and the Method page.
  - **The engine's errors** for an activity model (no groups, no r and q, no pairs) name the gases and the remedy.
  - **The advice under Peng–Robinson:** with light gases and polar components it now says Peng–Robinson is the method
    here, and that only the polar liquid alone (a methanol–water column) would be better with an activity model.
    Before, it called Peng–Robinson "not the recommended method" for methanol.
- **The check:** methanol from CO was added to validation/python/reference_reactions.py (Cantera 3.2.0, and scipy
  within 1e-8 in ln K). `test/reactors.test.js` checks:
  - the reactor's duty at 350, 550 and 700 K against Cantera's ΔrH, within 1e-4;
  - the 50-bar flowsheet with Peng–Robinson and SRK;
  - the activity models' message.
- **CORE:** its personal licence is agreed (the maintainer, 2026-10-23). DATA_RULES section 13 says so, and the keys
  are two network secrets, one for `api.openalex.org` and one for `api.core.ac.uk`. The next full-text search asks
  CORE too.

## Still to decide

- **PSRK** (UNIFAC with gas groups inside SRK), the method for polar liquids with dissolved gases at high pressure
  (the crude methanol after the reactor). It would need a proposal, and open parameters for the gas groups.
