# 2026-10-16: nonvolatile components with the other flowsheet blocks

- **Asked:** "the non volatile class should work in a flowsheet also when other units are there. for example it can
  be part of a reaction where it turns into something else, into a volatile chemical for example. this volatile
  components can later go into a distillation unit or other separation".
- **Checked:** every block that exists today (feed, mixer, heater and cooler, flash drum, condenser to VF = 0,
  splitter, component separator, product) with a recycle, HMF beside formic acid and water, with Modified UNIFAC 2.0
  and the ideal solution. HMF stays in the liquid, the separated stream of HMF alone is heated by a duty, every
  component balances, and the energy balance closes to 1e-5 kW (`test/nonvolatile.test.js`).
- **Fixed:** a feed at 298.15 K with HMF, whose liquid heat capacity starts at 298.15 K, failed in the mixer: the
  temperature search could not land on the end of the record. The liquid enthalpy now takes a temperature within
  1 mK outside a heat-capacity record at the record's end value (at most about 0.3 J/mol); farther out it still
  refuses (`src/thermo/enthalpy.js`).
- **Not yet possible, written down for when they come:**
  - reactors (proposal 0010, a draft): nonvolatile components carry the formation enthalpy and Gibbs energy of the
    liquid, their standard state is the pure liquid, and a nonvolatile reactant to volatile products separated
    downstream is one of the reaction tests;
  - columns (roadmap v0.5): nonvolatile components stay in the liquid and leave with the bottoms.
- **Found:** 21 components have no liquid heat capacity (levulinic acid, GVL, the levulinates, the lactates, furfuryl
  alcohol, ...), so they cannot be in a flowsheet energy balance yet; this is the first item of the missing
  properties (DECISIONS.md).
