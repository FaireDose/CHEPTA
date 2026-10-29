# Column benchmark cases (proposal 0015, W7)

One case per file (`chepta_column_case: 1`), read by `validation/python/reference_mesh.py` and
`reference_fug.py` (fixture `validation/fixtures/columns.json`) and by `test/benchmark-columns.test.js`. What each
case is for, and the tolerances: [docs/models/columns-benchmarks.md](../../../docs/models/columns-benchmarks.md).

Conventions:

- **Units:** mol/s, K, kPa, J/mol, W. Pressure uniform (no pressure drop).
- **Stages** are numbered from the top: 1 is the condenser, N the partial reboiler, both counted in `stages`. A total
  condenser is not an equilibrium stage (its liquid leaves at its bubble point as reflux and distillate, `V` of stage 1
  is 0); a partial condenser is one (its vapour is the distillate). The partial reboiler is an equilibrium stage.
- **The feed** enters stage `feed.stage` as one stream (liquid and vapour together); `q` is its liquid fraction for a
  model system, `T_K` its temperature for a real mixture, or `q` = 1 (saturated liquid) or 0 (saturated vapour) at the
  column's pressure for a real mixture. Several feeds: `column.feeds`, a list of such feeds (A4).
- **L_j, V_j** are the liquid and vapour leaving stage j (L_1 the reflux, L_N the bottoms).
- **Specifications:** `reflux_ratio` (L_1 / D), `distillate_flow_mol_s`, `bottoms_flow_mol_s`, `distillate_purity`
  (milestone M4).
- **`thermo.kind`:** `constant-alpha` (a model system: K_i = alpha_i p(T) / P with ln(p/kPa) = A - B/T; h_L = 0 and
  h_V = the latent heat for every component) or `chepta` (CHEPTA's components, model and default parameter sets).
- **`expected`:** the outcome of the request path (`src/api/dispatcher.js`: ok, invalid_input, missing_data,
  unsupported, not_converged, ...), the warnings, the behaviour in words, and the branch where more than one solution
  could exist.
- **`tolerances.numerical`** (the engine against the reference) is kept apart from **`agreement_with_data`**
  (information about the model, never a test of the column) and from **`agreement_with_published_example`** (B2: a
  published column solved with another property method).
- **`published`** (B2): the numbers of the open source as printed, with where each is (`where`), and `source`.
- **`solver`** (E4): solver options the case sets (an iteration limit); **`performance`** (P1): the runs of the time
  budget (cold and warm start), the budget being W9's.
