# 2026-10-16: proposal 0012, step 1 — the user's own data in the engine

- **Asked:** proposal 0012 accepted ("ok"), its steps in order; this is step 1, the engine overlay.
- **Done:**
  - `src/thermo/user-data.js`: `checkUserData` checks and normalizes the user's property records, components, pair
    sets and Modified UNIFAC 2.0 groups (units, equations, ranges, sources, subgroup ids), and refuses wrong data with
    a message naming it; `userDataUsed` lists what a system uses (`info.userData`).
  - `system`, `pure`, `listComponents`, `findComponent`, streams, the separator, flowsheet documents and
    `runFlowsheet` (a project's `user_data`) take it per call; nothing is stored, the databank is untouched.
  - A user record replaces the databank's for that property (the maintainer: "yes both", replacing measured records
    allowed); a user pair set is that pair's default, and the databank's set stays selectable with `sets`.
  - Water's records stay IAPWS-IF97: user records for water are refused, with the reason.
- **Tested** (`test/user-data.test.js`): an overlay that repeats the databank's own numbers gives exactly the
  databank's results (NRTL ethanol + water bubble point and flash enthalpy; Modified UNIFAC 2.0 glycerol + water;
  Peng-Robinson with a copy of propane); a copy of ethanol as the user's own component gives the same bubble point and
  boiling point; a user nonvolatile component in a flowsheet closes the mass and energy balances with its own molar
  mass; 17 kinds of wrong input are refused. The whole existing suite passes unchanged.
- **Next:** step 2, project format 3 and the My data file.
