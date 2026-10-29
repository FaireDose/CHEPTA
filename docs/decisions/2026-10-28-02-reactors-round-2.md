# 2026-10-28: Reactors, round 2: the Gibbs block, global reactions, more units, the examples' components

## What the maintainer asked for

- "gibbs as a separate block. now that it is more lean it is ok": the Gibbs reactor is a block of its own again, in
  the Reactor menu (this replaces the "mode of the equilibrium reactor" of docs/decisions/2026-10-28-01-reactors.md).
- "ok for the cstr and two phases; ok with ergun but only if it is selected": unchanged; the pressure drop is "None"
  until Ergun (or a given drop) is chosen, and only then does it ask for the gas viscosity.
- "add the chemicals and with their properties according to our rules": biphenyl, p-terphenyl, cumene hydroperoxide.
- "what do you recommend for the flash bug?": below.
- "a button for the reactions ... save global so i can find it in the other part as well".
- "add more units to select at settings, like much more with drop list for main properties".

## What was done

- **Gibbs reactor** (`gibbs-reactor`, id RG1): the species that may react; the equilibrium reactor's solver (one phase
  or two). The equilibrium reactor refuses `mode: "gibbs"` and names the Gibbs block.
- **Global reactions:**
  - Each reaction on a Reactions page has "Save global". It goes to one list of the project (`sharedReactions`, saved
    as `shared_reactions`), replacing a global reaction of the same name.
  - The Reactions page of the Flowsheet and of the Reactor workspace lists the global reactions, each with "Add here"
    ("in use here" once it is there) and a button to drop it from the list.
- **Units** (Settings, one drop list per quantity):
  - temperature: °C, K, °F, °R;
  - pressure: bar, kPa, Pa, MPa, mbar, atm, psia, mmHg, kgf/cm²;
  - molar flow: kmol/h, mol/s, kmol/s, lbmol/h;
  - mass flow: kg/h, kg/s, t/h, lb/h;
  - duty and power: kW, W, MW, kJ/h, kcal/h, Btu/h;
  - energy basis and viscosity, as before.

  The factors are those of NIST SP 811 (2008), Appendix B, to the digits printed there. Temperature and pressure apply
  everywhere. The flows and the duty apply to the flowsheet and the Reactor workspace (the stream table, the results,
  the energy streams, the duty field); the other workspaces keep their own units.
- **New components** (registry batch 12; `gap_report.py --new` first):
  - biphenyl and cumene hydroperoxide from ChemSep, taken as they are;
  - p-terphenyl from measured data (`measured_components.py`): the vapour pressure (ThermoML Archive), the enthalpy of
    vaporization (Clapeyron, checked against Zhao 2008), melting and formation data (WebBook);
  - p-terphenyl's liquid heat capacity is predicted (Ruzicka and Domalski; the ring-to-ring carbon counted as CB-(C),
    the nearest group). Its other gaps are "no open data", in `docs/missing-properties/MISSING_PROPERTIES_2026-10-28.md`;
  - Rawlings and Ekerdt name the third component "triphenyl" without its isomer: the para isomer is my choice, to
    confirm.

## The flash failure: recommendation

The P-H flash with Peng–Robinson starts its temperature search at 300 K when the bubble point is not a vapour-liquid
boundary (ethanol, water and diethyl ether split into two liquids there). The T-P flash at 300 K then refuses, because
two liquids are not supported yet with an equation of state, and the whole P-H flash fails.

1. **Now, small:** start that search from a temperature given by the caller (the last point of a PFR, the inlet of a
   block). Where a trial temperature meets the two-liquid refusal, step away from it instead of failing; refuse only
   if the answer itself lies in the two-liquid region. A few lines in `src/equilibrium/flash.js`, with a test on this
   mixture. Not done here: it waits for your yes.
2. **Then, the real fix:** two liquids (and vapour with two liquids) for Peng–Robinson and SRK, as NRTL and UNIQUAC
   already have. It is on the roadmap ("Two liquids with PR/SRK missing", ARCHITECTURE.md) and needs a proposal.

## To check

- Each value of the new components against its source (AGENTS.md rule 4).
- The para isomer for "triphenyl".
- The unit list.
- Global reactions replacing one of the same name.
