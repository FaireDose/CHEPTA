# 2026-10-16: nonvolatile components alone (heat, then cool)

- **Asked:** the maintainer put only 2,5-furandicarboxylic acid in a flowsheet and got "Not solved. ... a system needs
  at least one component that evaporates"; that error "should not be there. maybe i want only to heat this chemical,
  then to cool it".
- **Done:**
  - `src/thermo/system.js`: the refusal of a system of nonvolatile components alone is removed.
  - `src/equilibrium/flash.js`: a feed of nonvolatile components alone is liquid; the P-H flash (a heater or cooler
    with a duty) finds T from the liquid enthalpy alone. A vapour-fraction specification is refused with the reason
    ("nothing in this feed evaporates ... give the temperature or the enthalpy").
  - `src/equilibrium/bubble.js`: the bubble temperature and pressure of such a liquid are refused with the reason
    (before: "No solution between Infinity and -Infinity", or a bubble pressure of 1e-20 kPa).
  - `src/thermo/enthalpy.js`: a temperature below the start of a liquid heat-capacity record is refused with a
    message naming the record (before: the correlation's range message, which could print 298.15 K as outside
    298.15-405 K); a cooler duty that would go below it says so.
  - `docs/DATA_RULES.md` section 10 says it.
- **Tested** (`test/nonvolatile.test.js`): FDCA alone heated from 300 to 380 K and cooled by 2 kW, with NRTL and the
  ideal solution: always liquid, the heater duty equals the integral of its liquid heat capacity (to 1e-4 kW), the
  cooler closes the energy balance; too much cooling, a vapour fraction, the bubble and dew points are refused with
  their reasons. The test that expected the old refusal is replaced (the maintainer's decision above).
