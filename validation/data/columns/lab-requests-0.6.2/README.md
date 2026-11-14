# Column inputs from CHEPTA-Lab's capability requests on chepta 0.6.2

The request files of CHEPTA-Lab (https://github.com/FaireDose/CHEPTA-Lab, public) that showed the column faults it
reported on 2026-11-14, copied unchanged. They are inputs, not data: their stream values are Lab's readings of the
papers' tables (or CHEPTA's own streams of an earlier round), and no number of CHEPTA is fitted to them.
`test/columns-lab-requests.test.js` runs them.

| File | Lab case, run | Lab commit | Fault on 0.6.2 |
|---|---|---|---|
| iso-scds5-r2-reflux55000.request.json | cases/ethyl-acetate-piotrowski-2021, column 5 alone, CHEPTA's round-2 vapour 6, reflux 55,000 kg/h | 072aea3 (main) | `NO_CONVERGENCE` after 12 Newton iterations per start; with `max_iterations` 100 still 12 (EA-12) |
| iso-scds5-paper-reflux70000.request.json | the same column, the paper's vapour 6, reflux 70,000 kg/h | 072aea3 | the column converged, then its product's P-H flash failed ("Three-phase flash ... did not converge") |
| u-column-partial-pr.request.json | cases/methanol-co2-campos-2022, the methanol column, PR, partial condenser, with 10 to 20 ppm of CO and N2 | 22ec102 (branch claude/lab-methanol-campos-run) | refused before any stage iteration: no PR bubble point of the start's liquid (M1) |
| u-column-total-pr.request.json | the same with a total condenser | 22ec102 | as above |
| u-he5-dTmin2.request.json | the same case, exchanger HE5, PR, `dTmin_K` 2, counterflow | 22ec102 | refused: "a crossflow exchanger ... still 1.65 K" (searched on 10 zones, checked on 20; M4) |
