# CHEPTA-Lab's closed ethyl acetate plant on chepta 0.6.2

Three request files of CHEPTA-Lab (https://github.com/FaireDose/CHEPTA-Lab, public;
`cases/ethyl-acetate-piotrowski-2021/results-chepta-0.6.2/`, read at commit 783776e), copied unchanged. They are
inputs, not data: their stream values are Lab's readings of Piotrowski et al. 2021 or CHEPTA's own streams of an
earlier round, and no number of CHEPTA is fitted to them. They are the runs of decision 2026-11-14-05 that showed the
recycle plateau (Lab's request 14); decision 2026-11-14-07 records what the recycle solver does with them now.

| File | Plant | Column 11 | Splitter 16 to the purge |
|---|---|---|---|
| plant62-R-bottoms-warm.request.json | the whole plant, five tear streams (S27, S7, S21, S15, S24) with Lab's warm guesses | R/D 3, bottoms (product) 141.5 kmol/h | rest after 95,797 kg/h recycled |
| plant62-R-bottoms-warm-col5iter100.request.json | the same, column 5 with `max_iterations` 100 | as above | as above |
| plant62-W-dist.request.json | the same plant | R/D 3, distillate 230.4 kmol/h | 20,000 kg/h |

`test/flowsheet-safeguards.test.js` checks that they are present; it runs them only with `CHEPTA_SLOW_TESTS=1` (each
takes 20-60 minutes).
