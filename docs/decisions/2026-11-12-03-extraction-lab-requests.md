# 2026-11-12-03: Extraction block, Lab requests 5 (first) and 4

Accepted by the maintainer on 2026-11-12, from CHEPTA-Lab (PR #14, case ethyl-acetate-piotrowski-2021). The Lab's
repository is not attached to this session, so the run ids and exact messages were not read here; the two requests were
taken from the task text.

## 1. Outlets above their bubble point (Lab's 5)

- **Cause.** The block computed the outlets with `stream(own, { T, P })`, which flashes them: at 70 degC and the feed's
  pressure the ethyl acetate-rich extract is above its bubble point, the flash returns a vapour, and nothing checked it.
- **Choice: refuse.** Every liquid of the cascade (both liquids of every stage, so the two outlets included) is checked
  against its bubble temperature at the block's pressure (`bubbleT` of the block's own liquid method); at or above it
  the block throws `OUT_OF_RANGE`, naming the liquid, its bubble temperature, T and P, and what to change (raise
  `P_kPa`, lower `T_K`, a solvent that boils higher); `details.boiling` lists every liquid. Why refuse and not warn:
  the stages hold two liquids and no vapour (the engine's equations have no vapour term), so the numbers behind a
  warning would be those of a process that cannot run as stated, and AGENTS.md says "fail loudly; never return a
  silently wrong answer". A user who wants the pressurised extractor gives `P_kPa`.
- **Other simulators (METHOD_SELECTION.md, "When in doubt").** Searched 2026-11-12: DWSIM's Property Packages Guide
  (https://dwsim.org/tutorials/en/reference/property-packages-guide.html) says nothing about liquid-liquid extraction
  or an extractor's vapour (read; its LLE mentions are about property-package choice only). ChemSep's help file
  (skoge.folk.ntnu.no ... chemsep-help.pdf) could not be read here: its text is compressed and the reader got only the
  table of contents. A secondary paper snippet (not opened) says ChemSep gives one temperature per stage, which is not
  the point at issue. **No open document was found that says what they do**, so no quotation is recorded and the
  choice above is CHEPTA's own, on its rule. Nothing is added to the "Checked so far" table of METHOD_SELECTION.md for
  that reason.

## 2. Adiabatic option and a little vapour in a feed (Lab's 4)

- **Specification.** `adiabatic: true` (a boolean; `T_K` must then be left out: BAD_INPUT). Without it the block is
  isothermal as before.
- **What adiabatic means here, stated in the notes of every result.** One temperature for **all** stages, found by the
  secant method so that the outlets' enthalpy equals the inlets' (the inlets re-evaluated in the block's own method at
  their own T and P, so a difference of methods does not leak in); the duty is zero and `state.adiabatic` is true. It
  is **not** a stage-by-stage energy balance with a temperature profile: that needs enthalpy equations in the cascade
  solver (`src/units/columns/extraction.js`, "the stage temperatures are given") and is left out. For an extractor
  whose stage temperatures differ little this is the usual first answer; the profile is a later step.
- **A feed with a little vapour.** Taken in up to a vapour fraction of 0.1 (`MAX_INLET_VF`, this project's choice, like
  the 0.5 % floor of DATA_RULES section 3), more than that: BAD_INPUT as before. The vapour is **mixed in**: all the
  stream enters its stage as liquid, nothing leaves as vapour (the block has no vapour port), and the stream's enthalpy
  flow, which includes the heat of condensation, is in the duty (isothermal) or in the temperature (adiabatic). The
  block warns `FEED_VAPOUR` (new code in `WARNING_CODES`), with the remedy to flash the stream first and send only its
  liquid. If the vapour could not condense at the block's T and P, the boiling check of section 1 refuses. Mixing in
  was chosen over flashing off because flashing off would drop material without a port to carry it.
- **Interface.** The Extraction inputs in the flowsheet workbench have a "Given / Adiabatic" selector; with Adiabatic the
  temperature field is hidden. The block's result lists "Temperature (adiabatic)".

## Validation

- `validation/python/reference_extraction.py` (scipy, the enthalpies of `reference_enthalpy.py`: DIPPR heat capacities,
  the `thermo` library's excess enthalpy) now also finds the adiabatic temperature by `brentq` for three cases
  (`validation/fixtures/extraction.json`, key `adiabatic`; the existing cases are unchanged). `test/extraction.test.js`:
  the engine's T agrees within 0.01 K (the first case: 303.2532 K in both) and the raffinate flows within 1e-5.
- No open worked example of an adiabatic liquid-liquid extractor with printed temperatures was found; the check is the
  independent calculation only.
- Tests: boiling refusal (and acceptance at 200 kPa), the BAD_INPUT cases, and the vapour feed (warning, mass balance,
  refusal above 0.1).

## For the maintainer to check

1. The bubble check reads the block's own liquid method; confirm 350.15 K at 101.325 kPa is refused with the bubble
   temperature in the message for the water + acetic acid + ethyl acetate case (346 K for the stage-1 raffinate liquid).
2. The wording of the three messages (boiling, `adiabatic` with `T_K`, partly vapour) and of `FEED_VAPOUR`.
3. That the reference's adiabatic cases (feed and solvent temperatures chosen by this worker, 298-318 K, inside the
   acetic acid heat-capacity record's range) are fair: they are the worker's inputs, not published data.

## To decide

- **Refuse or warn on boiling?** Recommended: refuse (done). A "pressurised" extractor then needs `P_kPa`.
- **A temperature profile (stage-by-stage energy balance)?** Recommended: later, when a case needs it; the single
  temperature is stated in every note.
- **0.1 as the largest vapour fraction accepted?** Recommended: keep; raise it only with a case.
