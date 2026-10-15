# 2026-10-14: the nonvolatile component class (proposal 0009, step 5), and predicted properties where no open data exist

- **Asked:** for the nonvolatile class, "maybe we need to add additional thermodynamic models or maybe modified unifac
  2.0 predicts the properties in +/- 5 % which is enough"; then, on what to do where no measured heat capacity exists:
  "definitely not refuse. we go with b. there should be some data or predicted like Mod. UNIFAC. for example if i want
  to heat up lactic acid and water and then evaporate water should be available data, easy peasy. we do not look at
  electrolyte models yet".
- **What Modified UNIFAC 2.0 covers:** the mixture (activity coefficients: the water's volatility over the solution,
  solubility with melting data). It does not give pure-component properties (heat capacity, density); those come
  from data or, now, from an open group-contribution method.
- **Predicted heat capacity:** Ruzicka and Domalski (1993), free NIST reprints of J. Phys. Chem. Ref. Data 22, 597 and
  619; the 18 groups CHEPTA uses so far transcribed from the page images (the text layer has OCR errors) into
  `validation/data/gc/ruzicka_domalski_1993.json`, to be checked against the tables by a person. Accuracy on 15 CHEPTA
  liquids with CoolProp or ChemSep records (`predict_cp.py`): within 3.4 % at 300 K for all; for alcohols and polyols
  it rises with temperature (ethanol +11 %, 2-propanol +8 %, propylene glycol +6 %, glycerol +8 % at 350 K; up to
  +19 % at 400 K), acids and ketones within about 2-6 %. Other estimation methods were not used because their
  parameter tables are not open (Zabransky's 1996 compilation, Dadgostar-Shaw, GCVOL); Joback's thesis is free to read
  on DSpace@MIT and may serve the ideal-gas properties and formation enthalpies later.
- **Engine (`src/thermo/system.js`, `enthalpy.js`, `pure.js`, `critical.js`, `src/equilibrium/flash.js`, `dew.js`,
  `bubble.js`):** a component with `"class": "nonvolatile"` has no vapour pressure; in activity-model systems it gets
  1e-20 kPa, so it stays in the liquid (vapour mole fraction below 1e-20) and the flash stays finite. Its liquid
  enthalpy is the integral of its liquid heat capacity from 298.15 K (reference: its liquid there). A vapour fraction
  above the share of the other components, VF = 1, a dew point, and the equations of state are refused with the
  reason; a system of nonvolatile components alone is refused. The P-VF and T-VF flashes of such a feed search from
  its bubble point.
- **Lactic acid (added, nonvolatile):** no open measured vapour pressure or heat capacity; heat capacity predicted
  (the alpha carbon CH(OH)(COOH) counted as the secondary alcohol carbon, the method's nearest group; 230-445 K);
  three liquid densities with stated uncertainties of 2.9-7.2 %, above the 1 % target, so no density record; melting
  point 290 K (ThermoML Archive); Modified UNIFAC 2.0 groups CH3, CH, COOH, OH (S). Example of the maintainer, in
  `test/nonvolatile.test.js`: 100 kmol/h of 10 % lactic acid in water heated from 25 to 87 degC (164 kW), then 60 % of
  it evaporated at 1 atm (380 K, 732 kW); the vapour has no lactic acid.
- **Left for batch 4:** HMF (nothing in the ThermoML Archive; a furan ring the heat-capacity method has no group for)
  and lactide (a solid to 397.5 K, with its fusion data), with the sugars and acids.
- **Not done:** electrolytes (acid dissociation), as asked.
