# 2026-10-14: a flowsheet and a flash of one component

- **Asked:** "in the flowsheet of the workbench should be able to put only one component as well, not minimum 2.
  maybe i want to see an increase of enthalpy, after compression or heating, phase change".
- **Engine:** every model now takes one component (`createSystem`; before, the activity models asked for two). With
  one component the activity coefficient is 1, so the activity models reduce to the pure component's vapour-pressure
  record and enthalpies; their flashes already handled it (bubble and dew points coincide). The equations of state
  did not: their bubble-point search assumes a mixture, so P-VF and T-VF had no solution and a P-H flash between the
  saturated liquid and vapour gave a wrong all-liquid state. A pure component with Peng-Robinson or SRK now uses the
  equation of state's own saturation pressure (equal fugacities, `psatEos`): T-VF and P-VF at it, and P-H on the
  saturation curve with the vapour fraction from the enthalpies of the saturated liquid and vapour, or one phase
  outside them (`pureEosFlash` in `src/equilibrium/flash.js`). Above the critical pressure the ordinary P-H flash; a
  vapour fraction asked for there is refused with the reason.
- **Checked against:** CoolProp's own Peng-Robinson and SRK backends (`validation/python/reference_pure_flash.py`):
  saturation temperature within 0.001 K and enthalpy of vaporization within 0.01 % for water at 1 and 10 bar,
  n-butane at 1 atm and methane at 20 bar (`test/pure-flowsheet.test.js`).
- **Workbench:** the flash view takes one component with every model; the flowsheet solves a one-component flowsheet
  (feed, heaters, flash drum). The phase envelope still asks for two liquids with an activity model.
- **Not yet:** compression. There is no compressor block yet (item 4 of the engineering list in DECISIONS.md:
  compressor, pump and valve); with one component it would show the enthalpy rise of a compression directly.
