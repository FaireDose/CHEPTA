# Column inputs from CHEPTA-Lab's capability requests on chepta main at 415da41

The request files of CHEPTA-Lab (https://github.com/FaireDose/CHEPTA-Lab, public, main at commit 8b8b64f, read
2026-11-26) that showed a column fault, copied unchanged. They are inputs, not data: their stream values are Lab's
(here the column feed of Lab's converged plant), and no number of CHEPTA is fitted to them.
`test/columns-condenser-temperature.test.js` runs them.

| File | Lab case, run | Fault on main at 415da41 |
|---|---|---|
| vl-column-a6feed-T53.request.json | cases/methanol-co2-campos-2022, the methanol column alone (30 stages, feed 24, 100 kPa, condenser "vapour_liquid" at 326.15 K, reflux ratio 2, bottoms 4581 kmol/h, PR), fed with stream 29-col of Lab's converged plant (CO2 0.2425 %) | `NO_CONVERGENCE`: Newton stalled, the continuation stopped at 0 %; the message spoke of "a large vapour share" where the share is 0.8 % (M6) |
