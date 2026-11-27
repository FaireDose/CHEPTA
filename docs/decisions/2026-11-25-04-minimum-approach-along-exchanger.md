# 2026-11-25-04: the minimum approach holds along the whole exchanger, not only at the zone boundaries

## The request (CHEPTA-Lab M4, "still open", relayed by the coordinating session for release 0.6.3)

CHEPTA-Lab's case methanol-co2-campos-2022 has an exchanger, HE5, given by a minimum approach of 2 K (counterflow,
Peng-Robinson). The hot side is stream 20, a gas that partly condenses. The cold side is stream 28, a methanol + water
liquid that starts to boil inside the exchanger. Lab feeds it the streams of its converged plant
(`he5-a6streams-dTmin2.request.json`, copied unchanged into `validation/data/heat-exchange/lab-requests/`). On main
(415da41 to dd31c2e) the request is refused: "Temperature cross: where 82150 kW of 96640 kW has left the hot side, the
hot side is at 72.18 °C and the cold side at 72.46 °C." With `zones: 10` the same request returned 96,643 kW. Lab's
plant loop stopped on it.

## Why main gave a cross

The exchanger checked the temperature difference only at its zone boundaries, the N + 1 points of equal heat steps.
`exchangerApproach` searched the duty with 10 zones. At 96,640 kW the 10 boundaries show 2.003 K. Between two of them,
where the cold side starts to boil, the two curves cross: their difference is -0.28 K at the 20-zone boundaries and
-0.77 K at its deepest point (found by the search below; the same with 10, 20 and 500 zones). The result was then sized with 20 zones, which saw the cross and threw it. The repeated
search with the full zones (M4, 2026-11-14) was meant to catch this, but it only ran when the result came back with
an approach below 2 K. It never ran when the result threw a cross instead. Underneath, the approach a zone grid
reports depends on where the zones are cut. At 95 MW the smallest difference is 3.82 K with 10 zones, 1.04 K with 20,
0.84 K with 40 and 0.68 K with 200.

## How others define it

- **Textbook** (Lienhard and Lienhard, A Heat Transfer Textbook, 6th ed., 2024, free from https://ahtt.mit.edu/;
  § 3.2, eqn. 3.2, and p. 115, Fig. 3.11): the heat balance dQ = U ΔT dA holds at every point of the exchanger, so
  heat flows from hot to cold only where ΔT > 0, at every point. A part where a side changes phase is "two different
  exchangers in series". So the smallest ΔT is a property of the whole curve. A cross anywhere along it means the
  exchanger cannot be built, whatever grid is used to look at it.
- **DWSIM** (HeatExchanger.vb, "Pinch Point" mode with its MITA, the minimum internal temperature approach; branch
  `windows`, commit 1abf72d, GPL): it computes both sides' temperatures at 25 equal heat steps by P-H flashes,
  takes the smallest |Th - Tc| of the 26 points, and drives it to the MITA with a Brent minimisation on the duty. It
  checks only at the steps, as CHEPTA did. Because it takes the absolute value, it does not see a cross at all.

## What CHEPTA does now

`exchangerArea` (src/units/heat-exchange.js, `profileMinimum`) takes the smallest temperature difference along the
whole exchanger:

1. at the zone boundaries, as before;
2. where a process side changes its number of phases inside a zone (its bubble or dew point), found by bisection on
   the heat to 1e-6 of the duty. The curves bend there, so a pinch often sits there;
3. golden-section search on the heat around the three smallest local minima of 1 and 2, to 1e-4 of the duty.

The smallest of these is `dT_min_K`, at `pinch` (which now also gives both vapour fractions and `inside`).
`dT_min_zones_K` keeps the value at the boundaries alone. When the two differ by more than 0.01 K, a note says where
the true minimum is. A cross is refused at its deepest point, with both phases and "inside the exchanger". The area
still comes from the equal heat steps, as before, and is unchanged. `exchangerApproach` searches on this minimum, so
the 10-zone search and the full-zone result agree. If the full zones still find a cross, or an approach that is off,
at the duty found, the search is repeated with the full zones. If even that fails, the refusal says so and names
where the curves cross.

## Results

- **Lab's HE5** (`he5-a6streams-dTmin2`): solved at **93,483 kW**. The approach is 2.000 K, at a pinch inside the
  exchanger where 80,760 kW has left the hot side: hot side 73.39 °C (vapour fraction 0.868), cold side 71.39 °C
  (vapour fraction 0.024, just started to boil). A 400- or 500-zone grid at that duty gives 2.000 K. The duty is 3.3 %
  below the 96,640 kW of main's 10 zones, as Lab expected ("somewhat below 96.6 MW"). The 96,640 kW duty is now
  refused as a cross with 10, 20 and 40 zones alike.
- **Independent check** (validation/python/reference_heat_exchange.py, case 3; CoolProp 8.0.0, its own Peng-Robinson
  backend): n-butane vapour at 1500 kPa and 420 K, condensed by n-butane liquid at 300 kPa and 270 K, which boils,
  10 kmol/h each, minimum approach 5 K. CoolProp takes 4000 equal heat steps plus its exact saturation enthalpies and
  gives 102.041 kW, with the pinch at the cold side's bubble point (305.181 K) when 88.689 kW has left the hot side.
  CHEPTA gives 101.996 kW (-0.04 %), with the pinch at 305.181 K and 88.660 kW. On main, CHEPTA returned 102.022 kW
  with a "pinch" at 297.2 K, a zone boundary, and the true smallest difference at that duty was 4.94 K, below the
  5 K asked.
- **Cost:** a minimum-approach solve takes about 2.5 times as long (Lab's HE5 alone: 2.3 s to 5.9 s; the n-butane
  case: 0.7 s to 1.9 s). It is about 100 more P-H flashes per sizing call, for the bisections and the golden sections.
  The whole `npm test` suite gives the same counts as main.

## Tests

`test/heat-exchange.test.js`: the CoolProp case (duty, pinch, outlets; a 500-zone grid at the duty found holds the
approach; 10 zones alone do not see the pinch, and the note says so); Lab's HE5 (solved, 2 K inside, a 400-zone grid
holds); the 96,640 kW duty refused as a cross inside the exchanger with 10, 20 and 40 zones. All three fail on main.
No existing test was changed.

## What the maintainer decided (2026-11-26, relayed by the coordinating session: "agree with all the other 6 points")

1. **The refinement stays as it is.** It covers the zone boundaries, every phase boundary inside a zone, and
   golden-section refinement around the three smallest minima. A dip narrower than one zone, with no phase boundary
   in it and no grid minimum beside it, could still be missed. With smooth curves between phase boundaries this does
   not happen in the cases tried, and a denser search would cost more flashes everywhere.
2. **Open: split the area at the phase boundaries, later.** The area is still the sum over equal heat steps.
   Splitting it at each side's bubble and dew points (Lienhard's "exchangers in series") makes it more accurate for a
   side that changes phase, but it changes every stored area slightly. It is done with proposal 0013's next step,
   against the CoolProp reference, not in this pull request.
3. **Note for CHEPTA-Lab:** drop the `zones: 10` workaround on HE5 and rerun the plant runs (`plant-vl-he5-nozones`,
   `plant-vl-share-warm-nobypass-nozones` and the others that stopped on HE5). This is Lab's to do; nothing in CHEPTA
   waits on it.
