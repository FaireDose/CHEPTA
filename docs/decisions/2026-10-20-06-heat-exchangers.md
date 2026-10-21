# 2026-10-20: heat exchangers, energy streams, valve and pump (proposal 0013, steps 1-5)

- **Asked:** "can you do in the same time 1-5?" (after accepting proposal 0013, docs/decisions/2026-10-20-04-heat-exchanger-proposal.md).
- **Done, in the pull request of the proposal:**
  1. `src/units/heat-exchange.js`: pre-sizing by zones along each side's temperature-heat curve (P-H flashes; IAPWS-IF97
     for steam and water), the LMTD correction F of shell-and-tube and crossflow arrangements from effectiveness-NTU,
     U from a service, from film coefficients with fouling and a wall metal, or the user's; Lamé's wall thickness with
     the user's allowable stress. `src/data/heat-transfer.json`: Lienhard and Lienhard, A Heat Transfer Textbook, 6th
     ed., version 6.00 (2024), Tables 1.1 (p. 21), 2.2 (p. 82), 2.3 (p. 84) and A.1 (pp. 739-740), transcribed value by
     value from the page images (the PDF pages 35, 96, 98, 753-754); the building rows of Table 2.2 and the metals not
     used for exchanger walls are left out, and said so.
  2. Unit models, **Heat exchanger**: with a utility (steam, water, a fluid of your own, electric) or two streams; the
     U from its three sources; the arrangement; the wall thickness; a temperature-heat diagram; the zones as a table;
     the Excel export; a locked **Rating** button (in the toolbar).
  3. Flowsheet: **energy streams** (`energyStreams`): an energy feed into a heater or flash drum (it needs one
     specification fewer and calculates its outlet), or a heater's, drum's or separator's heat into a heater or drum;
     counted in the degrees of freedom; drawn dashed; a loop closed by one is torn on its duty (energy streams are
     torn first). The heater's optional **sizing** (a utility and U: the area and the utility's flow).
  4. The **heat exchanger** block (`hx`, ports hot and cold): an outlet temperature or vapour fraction of either side,
     the duty, or the minimum approach; a recycle through it works (a feed-effluent exchanger); a side without flow on
     the first pass exchanges nothing.
  5. **Valve** (adiabatic) and **pump** (power = V ΔP / η, V from the liquid densities; η = 0.75 by default: the low end
     of the "target pump efficiencies ... 75 to 85 percent" of N.C. Cooperative Extension AG-452-6, free to read; the
     U.S. DOE sourcebook of 2006, public domain, gives "from 35% to more than 90%"). The compressor stays "coming
     later" (step 6, after the mixture entropy).
  - Project **format 4**, written only with these features (energy streams, the hx, valve or pump blocks, the Heat
    exchanger workspace); older files open unchanged. `docs/schema/project-4.json`; the AI instructions list the new
    blocks and energy streams.
  - A start link to the flowsheet with components (`start: "flowsheet"`) no longer throws (`resolveView` returns the
    flowsheet, which has its own components; `viewAvailability` still refuses it, as `test/app.test.js` asks).
- **Changed on the way:** F was first applied zone by zone; that hides the temperature cross of a multipass exchanger
  (each small zone looks feasible), so F comes from the terminal temperatures (proposal section 1c updated). The
  minimum-approach specification refuses a target that the arrangement stops short of, instead of returning another
  approach.
- **Tested:** Lienhard and Lienhard's Examples 3.5 and 3.6 and the condenser of section 3.2; CoolProp 8.0.0
  (validation/python/reference_heat_exchange.py, n-butane with Peng-Robinson, water and steam with IF97): duty, area
  and utility flows within 0.05-0.13 %; the effectiveness-NTU relations; Lamé; the flowsheet cases (energy feed, heat
  between blocks, a loop torn on an energy stream with all three solvers, a feed-effluent exchanger, valve and pump,
  the Excel export); the workspace's settings and project file. Tests changed because the new kind makes them wrong,
  each with a comment: the list of workspaces (Heat exchanger), the project format number (4), the sources' year
  bound (Lamé, 1852). Checked in Chromium at 1440 and 390 px.
- **Found:** CHEPTA's flash of pure water takes its vapour as an ideal gas (or Peng-Robinson), not IAPWS: the latent
  heat at 300 kPa comes out 2189.6 kJ/kg (ideal-gas vapour) or 2179.3 kJ/kg (Peng-Robinson vapour) against 2163.4
  kJ/kg from IF97, the vapour's residual enthalpy. The CoolProp comparison therefore uses n-butane as the process
  stream, with water and steam as utilities. Left as an open item (DECISIONS.md).
- **For the maintainer to check:** every value of `src/data/heat-transfer.json` against the pages named in it (the
  "+" and "-" marks of Table A.1 are kept); the Lamé citation (§ 80, eqns. 22-23, pp. 190-191 of the Internet Archive
  copy: the OCR is poor, so compare the equations on the page images); the NC State and DOE quotes.

## Review of 2026-10-21

The maintainer's comments on the pull request, and what was done:

- "there is twice written: With a utility and Two streams. make it only once and change the names": the mode is in the
  ribbon only, named **Utility exchanger** (a process stream heated or cooled by a utility) and **Process exchanger**
  (heat recovery between two process streams). The Inputs panel's copy and its second Rating button are gone.
- "Heat from the hot inlet ... make this on two rows": every column header of the zone table has its unit on a second
  line.
- "The shell and tube doesn't bring any difference compared with countercurrent. Is there a factor?": the factor F is
  applied, and it changes the area when both temperatures change (in the check of the review, two water-ethanol
  streams: 75 m² in shell and tube against 58 m² in counterflow, F = 0.783). Against condensing steam,
  the default, one side stays at one temperature, and F is exactly 1 for every arrangement: "If one flow remains at
  constant temperature ... F must go to one" (Lienhard and Lienhard, section 3.2, p. 116). The Inputs panel now says
  so under the arrangement.
- "for heat exchanger model with two components, the two are not mixed ... should be two streams maybe with max 3
  components and the method should be for each stream": each stream of a process exchanger has its own components
  (at most three) and its own method (an activity model with its vapour, or an equation of state); until chosen, the
  workspace's. The engine takes a system per side (`exchangerArea`: `hot: { stream, sys }`); the search for a
  minimum approach is `exchangerApproach`, used by the flowsheet block too (one system there: a flowsheet has one
  property method).
- "what is the films and wall? is this more rigorous design? the difference is two order of magnitude": the equation
  is right (1/U adds the five resistances, Lienhard and Lienhard eqn. 2.36; with the defaults 1125 W/(m² K), the
  aniline-alcohol film being 43 % of the resistance); it is not more rigorous. Table 1.1 gives single examples of each order of
  magnitude (water at 10 m/s, 34 500 W/(m² K)), not values for a given stream, while the default service, "steam or
  water to oil", is a viscous oil at its low end, 60 W/(m² K). The Inputs panel says this. A rigorous U needs film
  coefficients calculated from the stream's own properties and the exchanger's geometry (tube diameter, velocity:
  Lienhard and Lienhard, chapters 7 to 9); proposed as a next step, not done.
- "i want also a energy stream similar like a feed stream where i can put a duty": **Energy feed** in the palette,
  next to Feed. It is placed on the drawing with a duty; dragged onto a heater/cooler or a flash drum (or chosen in its
  form) it connects; it can be disconnected (it stays on the drawing) or deleted. A placed energy feed not yet
  connected makes the flowsheet not ready, with the reason (`energyStreams` entries may now lack `to`; schema 4).
- "the flowsheet automatically assigns a duty stream ... but i want to be able to take it out": a block's own energy
  stream (Q- and the id) can be selected and taken out of the drawing (`"energy": false` on the block). Its duty is
  still calculated, listed in the results and counted in the energy balance; the block's form shows it again.
- "The heater icon make it Heater/Cooler": done, in the palette and the forms (the engine's messages still say
  "Heater / cooler", which the tests check).
- "a bar in the flowsheet so when it gets crowded i can move up and down. a bar or drag along": the drawing keeps its
  scale (one unit, one pixel, times the zoom) in a box with scrollbars; dragging the empty canvas moves the view; the
  view stays where it was scrolled when a block is selected; **Fit** sets the zoom that shows all of it (40 % at
  least). "resolution wise kinda large ... not now": left for later (DECISIONS.md).
