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

Milestone M2b (the cases F1 with `expected_VLL`, F2, F3, G1 to G3, and `hydraulics/`):

- **`phases`:** `"VL"` (the default: one liquid; a stage where a second liquid would form is refused, PHASE_SPLIT) or
  `"VLL"` (look for two liquids on the stages). In the reference's profile a stage with two liquids carries `liquids`:
  `x_I` (the liquid richer in the first component), `x_II` and `beta_II` (the share of liquid II in the stage's
  liquid); `x` is the overall liquid, `L_j` its flow. F1 has both: `expected` for "VL" and `expected_VLL`
  (fixture `rigorous_VLL`).
- **The decanter** (`condenser: "decanter"`, phases "VLL"): the condensate, at its bubble point, splits into two
  liquids. The specification `decanter_reflux` with `rich_in` (a component) refluxes all of the liquid richer in that
  component and draws all of the other as the distillate; its `start_reflux_ratio` is the reference's first guess only.
  The profile's stage 1 carries `decanter`: `reflux_x`, `distillate_x`, `reflux_share_of_condensate`.
- **The column's own method** (G cases): `thermo` is the column's method, `flowsheet_thermo` the flowsheet's. The feed
  is given in the flowsheet's method (`T_K`); `boundary` says what crosses (component flows, pressure, enthalpy flow) and
  the temperatures searched by the P-H flash. G2's `recycle` sends a share of the bottoms back to the feed through an
  adiabatic mixer in the flowsheet's method; its `bottoms_flow_mol_s` is the product's. The fixture's `boundary` holds
  each crossing, the overall energy balance in the flowsheet's method, a round trip, and (G3) the refusal's numbers.
- **`hydraulics/`** (`chepta_hydraulics_case: 1`): Fair's flooding velocity and the column diameter for W4 (H1, the
  open worked example of Fermeglia 2021 with its published numbers; H2, the largest required area against the lowest
  flooding velocity); reference `validation/python/reference_hydraulics.py`, fixture
  `validation/fixtures/column_hydraulics.json`.

Proposal 0024 (two liquids in columns, 2026-11-17): `vll/` holds F4 (water + ethanol + cyclohexane with a decanter, the
validated case of heterogeneous azeotropic distillation) and F5 (CHEPTA-Lab's product column 11 of the ethyl acetate
plant, without its acetic acid), in the format above with a decanter's single specification (`bottoms_flow_mol_s`) or
a feed given by `T_K` (part vapour). Their reference is ChemSep's full three-phase stage
(`validation/python/reference_mesh_vll.py --three-phase`, fixture `validation/fixtures/columns-vll-three-phase.json`,
which also holds F3), started from the engine's profiles (`validation/columns_vll_engine_starts.mjs`).

Proposal 0025, step 1 (the entrainer start, 2026-11-18): `vll/` also holds F6 and F7 (ethanol with 12 mol % water and
3 mol % cyclohexane, a decanter refluxing the organic liquid; 20 and 30 stages), the columns that converge from the
engine's entrainer start where every bubble-point start is refused. Their reference is the same three-phase stage
(`validation/python/reference_mesh_vll.py --entrainer`, fixture `validation/fixtures/columns-vll-entrainer.json`),
started from the engine's profiles (`node validation/columns_vll_engine_starts.mjs --entrainer`). F8 (F4's column with
10 mol % cyclohexane) converges from the same start tried as the very last attempt (decision 2026-11-18-04).

Proposal 0026, steps 1 and 2 (the condenser with a vapour and a liquid distillate, `condenser: "vapour_liquid"`,
2026-11-18): `vapour-liquid/` holds H1 (A3's constant-alpha model system with a fourth, light component; the column solved
with the vapour share given, then with the condenser temperature and the vapour distillate's flow of that solution), H2
(the limits: a share of 0.001 against the total condenser, 0.999 against the partial one; a temperature above the top
vapour's dew point, refused) and H3 (CHEPTA-Lab's methanol column, Peng-Robinson, 53 C, reflux ratio 2 over the liquid
distillate, Lab's bottoms flow). Their reference is `validation/python/reference_mesh_condenser.py` (the MESH equations of
`reference_mesh.py`, whose `Column` holds the condenser), fixture `validation/fixtures/columns-vapour-liquid.json`; H3 is
started from the engine's profile (`node validation/columns_vapour_liquid_engine_start.mjs`). In the reference, the
reflux ratio of this condenser is L1 / U1 (the reflux over the liquid distillate) and `distillate_flow_mol_s` the whole
distillate U1 + V1, as the maintainer decided (2026-11-18).
