# 2026-10-27: The equilibrium reactor (proposal 0010, step 4)

## What the maintainer asked for

- "ok, all accepted. what is next?" Next in proposal 0010 (accepted 2026-10-22) is step 4: the equilibrium reactor,
  gas and liquid, tested against Cantera (gas) and a Python reference (liquid with NRTL).

## What was done

- **The solver** (`src/equilibrium/reaction-equilibrium.js`, layer 2): the extents at which every listed reaction meets
  Σ ν ln a = ln K(T), by Newton's method (Rawlings and Ekerdt, section 3.5.1, p. 88).
  - Activities in the reaction's standard state, from the property package: a vapour reaction f/P° (ideal gas, PR,
    SRK); a liquid reaction f/f_pure from the same model (γx for an activity model).
  - One phase: the whole mixture is taken to be in the reaction's phase.
  - A species that takes part and is not fed starts at 1e-8 of the feed, made by a reaction that forms it. A reaction
    none of whose species can be fed or formed gets no extent, with a note.
  - Refused with the reason: dependent reactions (a singular Jacobian), no convergence, no K (a component without a
    Gibbs energy of formation and no correlation given).
- **The block** `equilibrium-reactor` (`src/units/reactors.js`, layer 4).
  - Spec: the reactions (ids, or `{ reaction, approach }`), the outlet temperature or the duty, and the pressure or
    pressure drop.
  - Approach to equilibrium, per reaction: K at T + ΔT, or a fraction of the equilibrium extent.
  - The duty given: the outlet temperature where the energy balance closes with the reactions at equilibrium
    (bracketing, then regula falsi).
  - A vapour fraction is not a specification. All reactions must be vapour, or all liquid.
  - The outlet is flashed afterwards; a note says when it is not in the reaction's phase. A reactive flash is not done.
- **The workbench:** the block in the reactor group of the flowsheet palette (id RE1, ...), with the reactions to
  check, the approach per reaction, the outlet temperature or duty, and the results (extent, K and its temperature,
  where K comes from, ΔrH). In the Excel export its outlet flows are values from CHEPTA, and the Inputs sheet lists
  each reaction's K and extent. The "coming" button now names only the CSTR and plug flow.
- **References** (`validation/python/reference_equilibrium.py` → `validation/fixtures/equilibrium.json`):
  - gas: Cantera's Gibbs minimization of an ideal-gas phase with the same species and records, for methanol from CO₂
    with the shift, ammonia, and ethanol dehydration;
  - liquid: ethyl acetate esterification, NRTL, solved by scipy's brentq.
  - The engine agrees within 2e-4 relative in the mole fractions (gas) and 1e-6 in the extent (liquid).
- **A bug found on the way**, also on main ("A flash of a system with hydrogen and the "ideal" model at 550 K does not
  finish", DECISIONS):
  - Hydrogen's vapour-pressure curve, extrapolated far above its critical temperature (33 K), overflows to infinity
    from about 150 K.
  - The dew-pressure iteration then halved its step forever: its exit at the smallest step was skipped while the
    error stayed infinite.
  - Fixed both: the loop now always stops at the smallest step (`src/equilibrium/dew.js`), and a vapour pressure
    with no finite value is refused, with the remedy (`src/thermo/system.js`): Raoult's law cannot hold such a gas;
    use Peng-Robinson or SRK, as METHOD_SELECTION.md already says for activity models.
  - So the comparison with Cantera calls the solver directly with the ideal gas (it needs no flash), and the block is
    tested with Peng-Robinson.

## To check

- One phase per reactor, with the note when the outlet is not in the reaction's phase. A reactive flash (the outlet at
  chemical and phase equilibrium together) would be a later step.
- The approach to equilibrium as K at T + ΔT, or as a fraction of the extent.
- No vapour-fraction specification on this reactor.
- The block in the workbench: add an equilibrium reactor to a flowsheet with a reaction, and look at its inputs and
  results.

## Still open

- Steps 5 (CSTR, plug flow), 6 (Gibbs reactor), 8 (the worked examples), 9 (your own kinetics).
