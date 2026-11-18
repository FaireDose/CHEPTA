# 2026-11-18-06: Proposal 0026, steps 1 and 2 built (the vapour + liquid condenser: engine and API)

What was decided before: proposal 0026 accepted by the maintainer on 2026-11-18 with the seven recommended answers
(docs/decisions/2026-11-18-05-vapour-liquid-condenser-proposal.md), including the correction to answer 4:
`feed_second_liquid: "top"` with this condenser mixes the bypassed liquid into the **liquid** distillate after the
column, never into the condenser stage. The maintainer (2026-11-18): "i am a bit concerned that you invent things that
are not done in simulators": the build stays with what the proposal cites (The ChemSep Book section 13.2, DWSIM's
`Partial_Condenser`, IDAES's partial condenser).

## What this pull request does

- **Engine** (`src/units/columns/engine.js`): `condenser: "vapour_liquid"` with `ends.condenser_spec` `{ kind: "T_K" |
  "vapour_rate" | "vapour_share", value }`. Stage 1 is an equilibrium stage (as the partial condenser); its liquid is
  split into the reflux l_i1 and the liquid distillate r l_i1 (ChemSep's side-stream ratio r = U1 / L1); r is one more
  unknown of stage 1 and the condenser's specification one more row (proposal 0026's equations). To keep one block size
  in the block-tridiagonal Jacobian, every stage gets one more slot when this condenser is chosen: r on stage 1, a slot
  held at 1 by the row u - 1 = 0 on the others (its Newton step is zero). The other condensers keep exactly their path
  (the slot exists only with `"vapour_liquid"`).
  - `reflux_ratio` = L1 / U1, `distillate_rate` = U1 + V1 (answers 2 and 3).
  - The start: the bubble-point method with the vapour share from the specification; for a temperature, a start at a
    share of 0.5, a flash of its top vapour at the given temperature, and the start again with that share; for a vapour
    flow, the share from that flow and the start's distillate.
  - Refused: a converged column with U1 or V1 below 1e-9 of the feed, and a column that fails with a distillate at zero
    or a temperature outside the top vapour's two-phase range, both as `OUT_OF_RANGE` with the top vapour's bubble and
    dew temperatures; two liquids in the condenser (`PHASE_SPLIT`, advising a decanter, or this condenser followed by a
    decanter), with `"VL"` and with `"VLL"` (the condenser stage then takes the one-liquid K-values).
- **Column block** (`src/units/columns/column.js`): the keys `condenser_T_K`, `vapour_distillate_kmol_h`,
  `vapour_share` (exactly one, only with this condenser; the shortcut refuses the condenser); the outlet
  `vapour_distillate` (required with this condenser, refused with the others: a new `outletProblem` hook of a block,
  read by `inspectFlowsheet`; port names may now hold `_`); `state` with `condenser_T_K`, `D_liquid_kmol_h`,
  `D_vapour_kmol_h`, `D_kmol_h`, `vapour_share`, `reflux_ratio` (L1/U1), `reflux_over_distillate`, `condenser_kW`;
  the degrees of freedom count the condenser's specification. The two distillates leave by their enthalpy flows (a P-H
  flash, as an absorber's products): the vapour of light gases may have no dew point to search for.
  `feed_second_liquid: "top"` needed no change: the bypassed liquid is mixed into the port `distillate`, which is the
  liquid distillate.
- **Design specifications** (step 2; `specifications.js`): `product: "vapour_distillate"` (only with this condenser);
  `"distillate"` is then the liquid distillate.
- **API**: `solve_column` adds the vapour distillate's product and returns `vapour_distillate`.
- **Validation**: `validation/python/reference_mesh.py`'s `Column` holds the condenser (and a boil-up ratio
  specification); `validation/python/reference_mesh_condenser.py` solves H1, H2, H3 (`validation/data/columns/vapour-liquid/`)
  into `validation/fixtures/columns-vapour-liquid.json`; `test/columns-vapour-liquid.test.js`.
- **A correction of the reference** (not of data): `reference_mesh.Eos` left out the temperature term of the databank's
  k_ij(T) = k + kb / T. No earlier column case has a pair with kb (only CO2 with methanol and with water have one), so
  no earlier fixture changes; H3 needed it: with it the engine and the reference agree to 3e-10 K and 1e-11 in mole
  fraction on Lab's methanol column (without it, CO2's K differed by a factor of 2.5).

## Results

- H1 (constant alpha, 15 stages, R = 1.5 over the liquid distillate, D = 40 mol/s): the vapour share 0.2, the
  temperature 306.198 K and the vapour flow 8 mol/s give the same column, each against the reference within A3's
  tolerances (1e-6 relative flows, 1e-7 mole fractions, 1e-5 K).
- H2: share 0.001 against the total condenser, 0.999 against the partial one, within 0.1 K and 5e-4 in mole fraction;
  330 K, above the top vapour's dew point (318.3 K by the reference), refused as `OUT_OF_RANGE`.
- H3 (Lab's methanol column, Peng-Robinson, 30 stages, 53 C, R = 2, B = 4581 kmol/h): converges (27 Newton
  iterations, the bubble-point start resumed without the early stop; about 6 s); liquid distillate 4532.7 kmol/h,
  vapour distillate 298.3 kmol/h, against the reference within A3's tolerances. Campos et al.'s Aspen Plus numbers
  (Lab's reading): 4542 and 289 kmol/h, so -0.2 % and +3.2 %; for information only (another program and parameters).
  With the paper's 289 kmol/h of vapour given instead, the condenser is at 52.58 C.
- 2b: with `"top"` the stages, the condenser and the vapour distillate equal those of the column fed without the
  bypassed liquid, and the liquid distillate is the column's plus the bypassed liquid (flows and enthalpy flow to 1e-9).
- Every earlier test passes unchanged.

## Not done / open

- The workbench (step 3: button, row, outlet on the canvas, stream table, Excel, `PROJECT_FORMAT` + 1,
  docs/models/columns.md) is the next pull request; step 4 (IDAES cross-check) after it.
- A recovery or component flow specification of the lightest component of a product (either distillate) can fail to
  start the outer loop: its first column takes a distillate of about recovery x feed of that component. Found with
  this condenser (the light G of H1), but the total condenser does the same (pre-existing, `estimateDistillate` in
  specifications.js); purities work. Left for the maintainer to decide whether to take it up.
