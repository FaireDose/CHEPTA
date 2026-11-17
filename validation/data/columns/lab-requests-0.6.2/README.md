# Column inputs from CHEPTA-Lab's capability requests on chepta 0.6.2

The request files of CHEPTA-Lab (https://github.com/FaireDose/CHEPTA-Lab, public) that showed the column faults it
reported on 2026-11-14, copied unchanged (the column 11 rows added on 2026-11-17 for proposal 0024, from Lab's main at
commit 783776e). They are inputs, not data: their stream values are Lab's readings of the
papers' tables (or CHEPTA's own streams of an earlier round), and no number of CHEPTA is fitted to them.
`test/columns-lab-requests.test.js` runs them.

| File | Lab case, run | Lab commit | Fault on 0.6.2 |
|---|---|---|---|
| iso-scds5-r2-reflux55000.request.json | cases/ethyl-acetate-piotrowski-2021, column 5 alone, CHEPTA's round-2 vapour 6, reflux 55,000 kg/h | 072aea3 (main) | `NO_CONVERGENCE` after 12 Newton iterations per start; with `max_iterations` 100 still 12 (EA-12) |
| iso-scds5-paper-reflux70000.request.json | the same column, the paper's vapour 6, reflux 70,000 kg/h | 072aea3 | the column converged, then its product's P-H flash failed ("Three-phase flash ... did not converge") |
| u-column-partial-pr.request.json | cases/methanol-co2-campos-2022, the methanol column, PR, partial condenser, with 10 to 20 ppm of CO and N2 | 22ec102 (branch claude/lab-methanol-campos-run) | refused before any stage iteration: no PR bubble point of the start's liquid (M1) |
| u-column-total-pr.request.json | the same with a total condenser | 22ec102 | as above |
| u-he5-dTmin2.request.json | the same case, exchanger HE5, PR, `dTmin_K` 2, counterflow | 22ec102 | refused: "a crossflow exchanger ... still 1.65 K" (searched on 10 zones, checked on 20; M4) |
| iso-scds11-acid0-bottoms141.5.request.json | cases/ethyl-acetate-piotrowski-2021, column 11 alone (35 stages, R/D 3, VLL), the paper's feed 13 without acetic acid, product 141.5 kmol/h | bd8073d | none: converged (99.868 mass % ester); the no-acid reference of the next rows (proposal 0024) |
| iso-scds11-acid0.001-bottoms141.5.request.json, iso-scds11-acid0.005-bottoms141.5.request.json, iso-scds11-acid0.01-bottoms141.5.request.json | the same with 0.001, 0.005 and 0.01 mass % acetic acid in feed 13 | bd8073d | `NO_CONVERGENCE`: the continuation stopped at 90.92 % (EA-9, acetic acid; proposal 0024) |
| iso-scds11-acid0.01-bottoms139.request.json, iso-scds11-acid0.01-bottoms140.request.json, iso-scds11-acid0.01-bottoms141.request.json | 0.01 mass % acid, product 139, 140 and 141 kmol/h | bd8073d | 139: converged; 140 and 141: `NO_CONVERGENCE` |
