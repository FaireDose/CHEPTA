# Heat exchangers, valves and pumps

What CHEPTA calculates for heat exchangers (proposal 0013), where the numbers come from, and how it is checked.
Code: [`src/units/heat-exchange.js`](../../src/units/heat-exchange.js) (the calculation),
[`src/units/units.js`](../../src/units/units.js) (the flowsheet blocks), [`src/ui/hx-logic.js`](../../src/ui/hx-logic.js)
(the Heat exchanger workspace of Unit models). Data: [`src/data/heat-transfer.json`](../../src/data/heat-transfer.json).

## Pre-sizing: Q = U A ΔT along the real curves

- **Zones.** The duty is split into equal heat steps (20 by default). At each step, each side's temperature comes from
  its own curve: a P-H flash of a process stream (with its pressure drop spread evenly), IAPWS-IF97 for steam and
  water, or a straight line for a fluid of the user's own. Each zone has the LMTD of its two ends (Lienhard and
  Lienhard, A Heat Transfer Textbook, 6th ed., eqn. 3.13), paired counterflow or cocurrent, and the zones' UA add up.
  A condensing or boiling stream is therefore sized on its real curve, not one LMTD.
- **Second law.** A temperature difference of zero or less at any zone boundary is an error that says where, never an
  area. The smallest difference (the pinch) is reported.
- **Arrangement.** Shell and tube (one or more shells, two tube passes each) and crossflow (neither stream mixed) use
  the LMTD correction F = NTU(counterflow) / NTU(arrangement), with NTU from the effectiveness-NTU relations of Table
  3.1 and eqns. 3.20-3.21, for ε and R of the terminal temperatures. One F for the exchanger: zone by zone, every
  small zone looks feasible and the temperature cross of a multipass exchanger would be hidden. With a side that
  changes phase, F from the terminal temperatures is an approximation, and the result says so. An effectiveness above
  what the arrangement can give is an error ("put more shells in series"). The crossflow relations of Table 3.1 are
  approximate (≃).
- **Two process streams** (the Process exchanger of the workspace) never mix, so each side may have its own
  system: `hot: { stream, sys }` (its components and method). The flowsheet block uses the flowsheet's one system.
  The minimum approach (`exchangerApproach`): the duty by bisection and regula falsi.
- **U.** One of:
  - a service of Table 2.2 (typical ranges), the low end by default (the larger, safer area);
  - film coefficients (Table 1.1), fouling resistances (Table 2.3, the high end by default) and a plane wall:
    1/U = 1/h_hot + R_f,hot + t/k + R_f,cold + 1/h_cold (eqn. 2.36), with k of a metal of Table A.1, interpolated
    linearly in temperature at the mean of the two sides, refused outside the table;
  - the user's own value.

  Film coefficients are not a more rigorous route: Table 1.1 gives single examples of each order of magnitude (water
  at 10 m/s, an aniline-alcohol mixture at 3 m/s), not values for a given stream, so the U from them can lie far from
  a service range of Table 2.2 (with the defaults 1125 against 60 W/(m² K)). Coefficients calculated from the stream's
  properties and the geometry (Lienhard and Lienhard, chapters 7-9) are proposed for later.
- **F = 1 with an isothermal side.** Against condensing steam (or a fluid at one temperature) F is 1 for every
  arrangement ("If one flow remains at constant temperature ... F must go to one", section 3.2, p. 116).
- **Utilities.** Saturated steam at a pressure (condensing; its flow from the latent heat), water between two
  temperatures (IAPWS-IF97), a fluid of the user's own (a constant temperature, or two with a heat capacity), electric
  heating (no area). Utility temperatures and prices are the user's: no open table was found.
- **Wall thickness.** Lamé's thick cylinder (1852, § 80, eqns. 22-23): the hoop stress at the inner wall equals the
  allowable stress times the joint efficiency, R'/R = √((A + P)/(A − P)); plus a corrosion allowance. The allowable
  stress is the user's: ASME Section II, Part D is paywalled, and no open table of allowable stresses was found. No
  material is recommended from the pressure.

## In the flowsheet

- `heater` with `sizing: { utility, U, arrangement }`: the area and the utility's flow; the outlet stays as specified.
- `hx`: two process streams (ports `hot` and `cold`), adiabatic overall; one specification: an outlet temperature or
  vapour fraction of either side, the duty, or the minimum approach (`dTmin_K`, found by bisection and regula falsi;
  a target the arrangement cannot reach is an error). A recycle through it is torn as any recycle (a feed-effluent
  exchanger). On the first pass of a recycle, a side without flow exchanges nothing.
- `valve`: a P-H flash at the inlet enthalpy and the outlet pressure: a throttle. A gas cools by the Joule-Thomson
  effect and a saturated liquid partly flashes, when the method has a real-gas vapour (Peng-Robinson or SRK); an
  activity model's ideal-gas vapour keeps its temperature, and the valve says so. Checked against CoolProp's
  Peng-Robinson ([`validation/python/reference_valve.py`](../../validation/python/reference_valve.py)): methane from 50
  to 10 bar, 300.00 to 280.21 K; liquid propane and n-butane flashing, within 0.005 K and 0.0015 in vapour fraction.
  CoolProp's reference equations of state give 282.45 K for the methane: the 2.2 K is Peng-Robinson's own.
- `pump`: power = V ΔP / η, with V the inlet's volume flow from the liquid-density records (molar volumes added); the
  outlet from H_out = H_in + power. A vapour at the inlet is refused. η defaults to 0.75, the low end of the "target
  pump efficiencies ... 75 to 85 percent" of NC State Extension AG-452-6; the U.S. DOE's Improving Pumping System
  Performance (2006) gives "from 35% to more than 90%".
- `compressor` and `expander` (proposal 0013, step 6): the isentropic outlet is the P-S flash at the inlet's entropy
  ([thermodynamics.md](thermodynamics.md#mixture-entropy)), w_s = h_s − h_in; the work is w_s/η (compressor) or η w_s
  (expander, negative), the outlet from H_out = H_in + power. An inlet with liquid is refused; liquid that forms along
  the isentropic path is said. η defaults to the U.S. NETL's Process Modeling Design Parameters (2019, public domain):
  0.75 for a compressor, the lower of its single-stage compressors' 75 and 84 % (Exhibits 5-7 and 4-8); 0.80 for an
  expander, its boiler feed pump turbine (Exhibit 4-3; its steam turbines 85-93.5 %). Checked against an independent
  Peng–Robinson ([`validation/python/reference_compressor.py`](../../validation/python/reference_compressor.py)):
  methane, nitrogen and carbon dioxide compressed, methane + ethane compressed and expanded, propane expanded from
  saturated vapour into the dome: isentropic outlets within 0.11 K (0.10 K for the mixture: CHEPTA's ethane ideal-gas
  record is 0.6 % below CoolProp's cp0), work within 0.1 %.
- Energy streams: [flowsheet.md](flowsheet.md#blocks-layer-4).

## How it is checked

[`test/heat-exchange.test.js`](../../test/heat-exchange.test.js),
[`test/energy-streams.test.js`](../../test/energy-streams.test.js),
[`test/hx-workspace.test.js`](../../test/hx-workspace.test.js):

- Lienhard and Lienhard's worked examples: Example 3.6 (LMTD 52.79 K, 22.73 m²), the steam condenser of section 3.2
  (LMTD 28.85 K), Example 3.5 sized back (30 m²);
- an independent calculation with CoolProp 8.0.0 ([`validation/python/reference_heat_exchange.py`](../../validation/python/reference_heat_exchange.py)):
  n-butane condensed and subcooled against cooling water, and boiled by steam (Peng-Robinson, IAPWS-IF97), duty, area,
  water and steam flows within 0.5 % (0.05-0.13 % found);
- the effectiveness-NTU relations inverted for every arrangement; the limits of one shell refused; a cross refused;
- Lamé's hoop stress back to the allowable stress; the thin-wall limit;
- energy feeds, a block's heat into another, a loop closed by an energy stream (torn on its duty, with every solver),
  a feed-effluent exchanger with a recycle, the valve and the pump.

**A limit found on the way:** CHEPTA's flash of pure water takes its vapour as an ideal gas (or Peng-Robinson), not
IAPWS, so its latent heat at 300 kPa is about 1.2 % above IF97 (0.7 % with a Peng-Robinson vapour). A process stream of
water sized against steam carries that difference; the steam and water utilities themselves use IF97.
