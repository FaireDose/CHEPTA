# 2026-10-29-03: Proposal 0015, M1, step 2 (W7): the column cases and the independent references

The maintainer, 2026-10-29: start W7 (the benchmark cases and the MESH reference), ahead of the column engine (W2).
Written against contracts v1 (ARCHITECTURE.md, "The request path and the contracts of proposal 0015").

## What was done

- **Nine cases** in `validation/data/columns/` (docs/models/columns-benchmarks.md): (a) constant relative volatility
  A1 (binary), A2 (ternary shortcut), A3 (partial condenser); (b) B1 ethanol + water with NRTL and energy balances;
  (c) C1 a pair without NRTL parameters (methanol + ethylene glycol): missing_data; (d) D1 a reflux ratio of 0.001:
  DRY_STAGE on stages 2 to 5; (e) E1 a shortcut below the minimum reflux, E2 a negative boil-up, E3 a purity above the
  azeotrope (from M4): refusals, never a converged answer.
- **The references:** `validation/python/reference_mesh.py` (all MESH equations together by Newton's method from a
  bubble-point start, scaled residuals below 1e-12) and `reference_fug.py` (Fenske, Underwood, Gilliland in Eduljee's
  form, the forms read in DWSIM's open source code, `dwsim-shortcut-column` in src/data/sources.json). Fixture
  `validation/fixtures/columns.json`.
- **The checks with exact answers:** McCabe-Thiele equals the A1 profile to 7e-15; at R = 10⁴ the separation is within
  1.1e-4 of Fenske's; the rigorous column at 101 stages needs 0.99999 times Underwood's R_min for A2's recovery.
- `test/benchmark-columns.test.js` passes now: the cases are well formed, and every stage's balances of the reference
  close when recomputed in JavaScript, for B1 with CHEPTA's own NRTL, vapour pressures and enthalpies (they agree with
  the Python reference's to 1e-7 J/mol). No test fails on purpose; comparing the engine with the cases is W2's.
- **No open worked example** of a non-ideal column with stage results was found (the DWSIM tutorial gives B1's setup
  and only "about 0.80" and "about 0.40" for the products; the reference gives 0.801 and 0.400 with CHEPTA's
  parameters, which is not a check). The Python reference stands in, as the task allowed.
- docs/BENCHMARKS.md is generated for the benchmark processes and their pairs; the column cases are described in
  docs/models/columns-benchmarks.md instead.

## Choices made here, for the maintainer to confirm or change

- The numerical tolerances: the engine's flows within 1e-6 relative of the reference and its balances closed to 1e-8
  (the proposal's numbers); the shortcut within 1e-9.
- D1 leaves the dry-stage threshold to W2: any threshold between 0.001 and 2/3 of the largest vapour flow gives the
  case's answer.
- B1's setup follows the DWSIM tutorial (100 mol/s, 50/50, 350 K, 20 stages, feed on 10, R = 2, B = 75 mol/s).

## To check

- B1's measured azeotrope used for information: x = 0.892 and 78.1 °C (validation/data/azeotropes_101kPa.json, from
  the Wikipedia azeotrope tables, Lange's and the CRC handbook); the model gives 0.8805 at 351.37 K.
- The equation forms against DWSIM's `ShortcutColumn.vb` (link in docs/models/columns-benchmarks.md): Fenske at
  "Nmin calculation", Underwood at "rminfunc" and the sum after it, Gilliland at "0.75 * (1 - xx ^ 0.5668)", the feed
  stage at "optimum feed stage".
