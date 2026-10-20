# 2026-10-20: proposal 0013, heat exchangers, energy streams, pumps, valves and compressors

- **Asked:** "is there something left from the proposal with the chemicals? if not we can go at the reaction one but
  we do also something in between like always. i want in the models some update on the heating exchanger in the
  flowsheet and in the model unit, something where you put some known values for the some heat coefficients or you let
  the user put his and you calculate the transfer area for a pre-sizing. maybe based on pressure show recommended
  thickness and material. make in fact a drop list with a material there which will have different conductivities.
  always add also the option to let the user insert theirs. write a locked button there at the heat exchanger in the
  unit model tab, one that says rating ... then in the flowsheet add also an energy stream so this would be another
  specification and the number of equations will increase ... i give the duty and gives back the temperatures at the
  end. at a heat exchanger i should have then two models, one which is the simple one and another one where i have two
  fluids there ... also for the simple one i can get the area because this model can select different utilities with
  their own UA. ... then add also the compressor and pump model in flowsheet and then go to the reaction engineering
  and add the properties first and then few types of reactor model".
- **Proposal 0009 (green chemistry components):** every step is done. What is left are data no open source has yet
  (the "wanted" lists in DECISIONS.md: vapour pressures of nine components, heat capacities, groups), and the
  ideal-gas heat capacities on hold.
- **Drafted:** proposals/0013-heat-exchangers-and-energy-streams.md (status Draft). New unit models, a new flowsheet
  edge and a file-format change need an accepted proposal first (AGENTS.md, "Kinds of contribution"), so no code yet.
- **Sources searched for the data:**
  - Lienhard and Lienhard, A Heat Transfer Textbook, 6th edition, version 6.00 (2024), free to download from
    https://ahtt.mit.edu/ (read in this session): typical U (Table 2.2), film coefficients (Table 1.1), fouling
    resistances (Table 2.3), metals' conductivities with temperature (Table A.1), LMTD, F and effectiveness-NTU
    (sections 3.2-3.3, Table 3.1). Free to read, not openly licensed: question 1 of the proposal.
  - Allowable stresses: no open table. ASME Section II, Part D is paywalled; the Northwestern process-design wiki
    quotes it (12,900 psi for 304 stainless at 500 °F) and states no licence.
  - Material by pressure, default efficiencies, utility temperature levels: no open source found.
- **The maintainer's answers (2026-10-20):** "1-4 do what you recommend, 5- add a typical recommendation as default,
  6- i do not understand, but if i have a heat exchanger where i put two streams i expect that i can put one from
  recycle. we do not need to do pinch analysis now." Recorded in the proposal (status Accepted):
  1. Lienhard and Lienhard's numbers are taken, cited by table and page;
  2. the allowable stress is the user's;
  3. no material recommendation from the pressure;
  4. the low end of a U range by default;
  5. pump and compressor efficiencies default to a typical value from an open source, found in their step (a first
     search found only trade pages and an irrigation extension page; the US Department of Energy's public-domain
     sourcebooks are the next place to look);
  6. a recycle into a two-stream exchanger is torn as any material recycle; a loop closed by an energy stream is torn
     on its duty; no pinch analysis.
- **Also asked:** "the energy stream can put only at the heat exchanger, or other units as well? I assume at heat
  exchanger, or heater, if i select the outlet temperature, then the energy stream calculates the duty itself,
  otherwise it calculates the outlet temperature if i define the energy stream." Yes: every block with a duty takes
  one (heater / cooler, flash drum, component separator, later reactors), and pumps and compressors take a work
  stream. Given the outlet state, the energy stream is a result; given the energy stream, the outlet is calculated
  (proposal section 6, the table).
- **Added to the proposal (section 9, step 7):** charts for gases and mixtures with the steam charts, asked the same
  day ("phase envelopes of different gases ... so I know where to compress them, something like an enthalpy entropy
  diagram ... maybe you can combine this with steam properties from water"): the envelope traced through the critical
  point, and P-H, T-S and H-S charts.
- **Next:** step 1, the heat-exchange calculation, in its own pull request after this one.
