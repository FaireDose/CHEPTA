# Inputs from CHEPTA-Lab's check of CHEPTA main 415da41

The request files of CHEPTA-Lab (https://github.com/FaireDose/CHEPTA-Lab, public, main at commit ca68c70) that showed
the faults it reported on CHEPTA main 415da41 (2026-11-19/20), copied unchanged. They are inputs, not data: their
stream values are Lab's readings of the papers' tables, or CHEPTA's own streams of an earlier round, and no number of
CHEPTA is fitted to them. `test/lab-requests-063.test.js` runs them (decision 2026-11-20-03).

| File | Lab case, run | Fault on main 415da41 |
|---|---|---|
| R17-strict-loop-not-converged.request.json | cases/ethyl-acetate-piotrowski-2021/capability-requests-main-415da41: the 15 degC feed of acid and ethanol, a heater and a 50 % recycle, `strictRanges: true`, the loop limited to 2 iterations | `NO_CONVERGENCE` with nothing about the ranges (request 17) |
| R17-strict-loop-converged-control.request.json | the same loop allowed to converge | `OUT_OF_RANGE`, but only once the loop had converged (request 17) |
| R19-column-purity-always-exceeded.request.json | the same folder: column 15 alone (18 stages, R 2, 99.99 mass % water in the bottoms), fed the settled plant's stream 28 with its organics cut to 0.0002 of their flows | `OUT_OF_RANGE` "the reflux ratio is too low", although every column solved was purer than asked (request 19) |
| rerun-u-column-partial-flash53-purity.request.json | cases/methanol-co2-campos-2022/results-chepta-main-415da41: the methanol column (30 stages, partial condenser, R 2, PR), 99.985 mol % water in the bottoms | `NO_CONVERGENCE`: the value lies inside the scanned range, but the columns where it is met were not solved (M2) |
| rerun-diag-column-recovery-0.99987.request.json | the same column, a water recovery of 0.99987 in the bottoms | as above (M2) |

Built here from a Lab input (not a Lab file):

| File | Built from | Fault on main 415da41 |
|---|---|---|
| plant62-R-bottoms-col5-14stages-SCDS5-iteration5.request.json | Lab's cases/ethyl-acetate-piotrowski-2021/results-chepta-main-415da41/plant62-R-bottoms-col5-14stages.request.json, run on this branch: column 5 (absorber, 14 stages, VLL) alone, with the two inlets (S27, S6) it had when the plant stopped in it at loop iteration 5, as CHEPTA computed them | `NO_CONVERGENCE` (request 8); the same inlets converge with 8, 11 and 13 stages, and with one liquid on 14 |

Added for proposal 0029, step 1 (CHEPTA-Lab M6; Lab's main at commit 8b8b64f, read 2026-11-26), copied unchanged;
`test/columns-condenser-temperature.test.js` runs it:

| File | Lab case, run | Fault on main 415da41 |
|---|---|---|
| vl-column-a6feed-T53.request.json | cases/methanol-co2-campos-2022/results-chepta-main-415da41: the methanol column alone (30 stages, feed 24, 100 kPa, condenser "vapour_liquid" at 326.15 K, reflux ratio 2, bottoms 4581 kmol/h, PR), fed with stream 29-col of Lab's converged plant (CO2 0.2425 %) | `NO_CONVERGENCE`: Newton stalled, the continuation stopped at 0 %; the message spoke of "a large vapour share" where the share is 0.8 % (M6) |
