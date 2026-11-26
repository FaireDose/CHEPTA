# Heat-exchanger inputs from CHEPTA-Lab's capability requests

The request files of CHEPTA-Lab (https://github.com/FaireDose/CHEPTA-Lab, public) that showed a heat-exchanger fault,
copied unchanged. They are inputs, not data: their stream values are CHEPTA's own streams of Lab's converged plant, and
no number of CHEPTA is fitted to them. `test/heat-exchange.test.js` runs them. Development cases only (never Lab's
held-out cases).

| File | Lab case, run | Lab commit | Fault on main 415da41 to dd31c2e |
|---|---|---|---|
| he5-a6streams-dTmin2.request.json | cases/methanol-co2-campos-2022, exchanger HE5 alone, PR, `dTmin_K` 2, counterflow, default zones; hot = stream 20, cold = stream 28 of Lab's converged plant (plant-a6, chepta 0.6.2); `results-chepta-main-415da41/`, CAPABILITY_REQUESTS.md, "M4, still open" | 8b8b64f (main) | refused: "Temperature cross: where 82150 kW of 96640 kW has left the hot side ..." (the 10-zone search missed the pinch at the cold side's bubble point; decision 2026-11-25-04) |
