# 0026: A condenser with a vapour and a liquid distillate

- **Status:** Draft (for the maintainer's answers; M5 accepted in principle on 2026-11-14: "proposal then build")
- **Author(s):** coding agent for the maintainer (2026-11-18)
- **Discussion:** the pull request of branch `claude/proposal-partial-condenser-m5`;
  docs/decisions/2026-11-14-05-column-fixes-lab-062.md (M5); docs/decisions/2026-11-18-02-vapour-liquid-condenser-proposal.md
- **Roadmap item:** proposal 0015, Part II, section 1 (the column's end configurations); CHEPTA-Lab's request M5

## Problem

CHEPTA's distillation column has one distillate: a liquid (`condenser: "total"`, or `"decanter"` with two liquids) or
a vapour (`condenser: "partial"`). Many columns that carry light gases send part of the top out as a vapour (the gases
that do not condense at the cooling water's temperature) and the rest as a liquid product. CHEPTA-Lab's methanol plant
(Campos et al. 2022, MDPI, open access; Lab's `cases/methanol-co2-campos-2022/CAPABILITY_REQUESTS.md`, request M5,
branch `claude/lab-methanol-campos-run`, read 2026-11-18) has such a column: a "partial vapor-liquid condenser at
53 C" with a gas distillate of 289 kmol/h (stream 32) and a liquid distillate of 4542 kmol/h (stream 31-MEOH),
reflux ratio 2. Lab's workarounds:

- a partial condenser with all the distillate as vapour, then a flash at 53 C. The products then have the condenser's
  equilibrium, but the reflux is the liquid of a different stage: the column is not the paper's;
- a liquid side draw from stage 2 with a stage-1 temperature specification: it did not start
  (runs `diag-column-partialside-T53-*`).

The maintainer (2026-11-18): "i am a bit concerned that you invent things that are not done in simulators". So this
proposal takes the specification set and the equations from simulators and books with open sources, and states where
it had to choose.

## What open simulators and books do

| Source (open) | What it calls it | Products of the condenser | What fixes the split between the two distillates |
|---|---|---|---|
| The ChemSep Book (Kooijman and Taylor, 2nd ed., 2006, public domain, http://www.chemsep.org/downloads/docs/book2.pdf, section 13.2, pp. 192-195, read 2026-11-18) | no separate type: the condenser is stage 1 of the MESH equations, with side streams | "For a total condenser ... the distillate is U1 [the liquid side stream of stage 1] ... For a partial condenser, the vapor product is V1." With both U1 and V1 nonzero, stage 1 gives both | "These special stages add degrees of freedom ... Common specifications are: 1. the flow rate of the distillate/bottoms product stream, 2. the mole fraction of a given component ..., 3. component flow rate ..., 4. a reflux/reboil ratio or rate, 5. the temperature of the condenser or reboiler, 6. a heat duty to the condenser or reboiler." |
| DWSIM (GPL-3.0, https://github.com/DanWBR/dwsim, branch `windows`, read 2026-11-18) | `condtype`: `Total_Condenser`, `Partial_Condenser`, `Full_Reflux` (`RigorousColumn.vb`, line 2410) | `Partial_Condenser`: a vapour product and a liquid distillate; `Full_Reflux`: the vapour product only (CHEPTA's `"partial"`) | the vapour product's flow is an input of the column (`VaporFlowRate`, line 2502; the start sets `V(0) = vaprate`, line 3350); the condenser specification is then one of `ColumnSpec.SpecType` (line 715: heat duty, product molar or mass flow, component flow, fraction or recovery, stream ratio, temperature, feed recovery), the reboiler's another. Its stream ratio for this condenser is reflux over liquid distillate, `Lj(0) / LSSj(0)` (`NewtonRaphson.vb`, line 447) |
| IDAES-PSE (BSD 3-clause, https://github.com/IDAES/idaes-pse, `idaes/models_extra/column_models/condenser.py`, read 2026-11-18) | `CondenserType.partialCondenser` | ports `reflux`, `distillate` (liquid) and `vapor_outlet`; "Incoming vapor from top tray is partially condensed to a vapor and liquid stream" | a partial condenser refuses `temperature_spec=atBubblePoint` and needs `customTemperature`: the user fixes the outlet temperature. Its test (`tests/test_partial_condenser.py`) fixes pressure 101325 Pa, temperature 369 K and `reflux_ratio` 1, with zero degrees of freedom. The reflux ratio splits the liquid only: `reflux_split_fraction = R / (1 + R)` of the liquid; all the vapour leaves |
| COCO / COFE (https://www.cocosimulator.org, help page `ChemSep/chemsep.htm`, read 2026-11-18) | its column is the ChemSep unit operation ("either a flash or a distillation, absorption or extraction column operation") | as ChemSep | as ChemSep |
| Aspen Plus RadFrac | "partial vapor-liquid" (the name Campos et al. use) | vapour and liquid distillate | **no open description found**: AspenTech's documentation is not open, and the open hits (course slides on Scribd, a vendor blog) are not sources this project may cite. Nothing here rests on RadFrac |

So the three open implementations agree on the model, and it is the one CHEPTA already has for a side draw: stage 1 is
an equilibrium stage (as in CHEPTA's `"partial"` condenser) whose vapour V1 leaves as the vapour distillate, and whose
liquid is split, with one composition, into the reflux L1 and the liquid distillate U1 (ChemSep's ratio
r1L = U1 / L1). That adds one unknown, U1, and so one degree of freedom at the top. They fix it differently:
DWSIM by the vapour flow, IDAES by the temperature, ChemSep by any of its list. The maintainer's follow-up of
2026-11-14 already chose the union of the first two plus a ratio: the pressure and one of the temperature, the vapour
distillate flow, or the vapour share.

## Proposal

A fourth value of `condenser`, `"vapour_liquid"`, for the rigorous distillation column. `"total"`, `"partial"` and
`"decanter"` do not change.

### The equations (rigorous engine, `src/units/columns/engine.js`)

Stage 1, an equilibrium stage at the column's pressure (the condenser's pressure; no pressure drop, as today), with
the liquid draw of the side-draw formulation already in the engine (ChemSep Book eqs. 13.1-13.7, DWSIM's `Sl(0)`):

    M_i1 = (1 + r) l_i1 + v_i1 - v_i2 = 0                    (material; r = U1 / L1)
    E_i1 = K_i1 l_i1 V1 / L1 - v_i1 = 0                       (equilibrium, as the "partial" condenser)
    H_1  = V2 h_V,2 - (1 + r) L1 h_L,1 - V1 h_V,1 - Q_1 = 0   (energy; Q_1 the duty removed, Q_1 > 0)

l_i1 is the reflux, r l_i1 the liquid distillate, v_i1 the vapour distillate. Unknowns of stage 1: l_i1, v_i1, T_1 and
r (one more than today). The equations of stage 1: the C material and C equilibrium rows as now, the energy row
replaced by the column's top specification as now (or kept, with Q_1 given, for `condenser_duty_kW`), and **one new
row, the condenser's own specification**:

| Given (exactly one) | Row | Range checked before solving |
|---|---|---|
| `condenser_T_K` | T_1 - T_given = 0 | above 0 K; a temperature at or above the top vapour's dew point or at or below its bubble point is refused after the solve (below) |
| `vapour_distillate_kmol_h` | V1 - V_given = 0 | between 0 and the total feed, both excluded |
| `vapour_share` | V1 - s (V1 + U1) = 0 | between 0 and 1, both excluded |

r enters only stage 1's rows and the next stage's material balance through l_i1, so the Jacobian stays
block-tridiagonal with stage 1's block one larger (2C + 2), as the side draws keep it.

### Degrees of freedom

A column with this condenser takes **three** specifications: the condenser's own one (above) and **two** from today's
list: `reflux_ratio`, `boilup_ratio`, `distillate_kmol_h`, `bottoms_kmol_h`, `condenser_duty_kW`, `reboiler_duty_kW`,
or a design specification (purity, recovery, component flow, stage temperature; `specifications.js`). This is the
count of ChemSep's "special stages add degrees of freedom" and of DWSIM's (vapour flow + condenser spec + reboiler
spec). The pressure is the column's `P_kPa`, as for every condenser today.

Definitions (to confirm, questions 2 and 3):

- `reflux_ratio` = L1 / U1, the reflux over the **liquid** distillate, as DWSIM's stream ratio and IDAES's
  `reflux_ratio` define it. The result also gives L1 / (U1 + V1), over the whole distillate.
- `distillate_kmol_h` = U1 + V1, the whole distillate, so that `bottoms_kmol_h` = F - D stays true. The result gives
  U1 and V1 apart.
- A purity, recovery or component flow `product: "distillate"` means the liquid distillate; `product:
  "vapour_distillate"` the vapour one (new value, accepted only with this condenser).

### What is refused, with the reason

- Not three specifications, or two of the condenser's own (`condenser_T_K` with `vapour_share`, ...): `BAD_INPUT`,
  naming the three options and the list.
- One of the three with another condenser: `BAD_INPUT` ("condenser_T_K is the vapour + liquid condenser's: give it
  with condenser: \"vapour_liquid\"").
- `mode: "shortcut"`: `NOT_AVAILABLE` (Fenske-Underwood-Gilliland has one distillate); the rigorous mode is named.
- `condenser_T_K` at which the top vapour does not split: at or above its dew point there is no liquid (the reflux
  would be zero), at or below its bubble point no vapour. Refused after the solve, or when the solver ends at U1 or V1
  at zero, as `OUT_OF_RANGE` with the dew and bubble temperatures of the top vapour at the column pressure ("between
  ... K and ... K; for no vapour use a total condenser, for no liquid distillate a partial one"). Never returned with a
  zero product.
- A converged column whose U1 or V1 is below 1e-9 of the feed (the limits of the share): `OUT_OF_RANGE` as above.
- Two liquids in the condenser (next section).

### Two liquids at the top (proposals 0024 and 0025)

A condensate with a vapour vent that also splits into two liquids is a three-phase condenser: vapour, reflux liquid,
other liquid. DWSIM has no such condenser (`Enum condtype` has three values, none with a decanter; proposal 0024 read
the same file) and ChemSep's flash "deals only with two different phases leaving" (proposal 0024). IDAES's condenser
treats one liquid phase. No open simulator found has it, so this proposal does not invent it:

- with `phases: "VL"`, the condenser's liquid is checked for a second liquid like every stage (the tangent-plane test
  after convergence); a split is refused (`PHASE_SPLIT`), naming the decanter: a `"decanter"` condenser if no vapour
  leaves, or this condenser followed by a decanter (the flash drum with two liquids) if one does;
- with `phases: "VLL"`, the stages below may hold two liquids (proposals 0024, 0025), but the condenser stage of
  `"vapour_liquid"` must hold one: the same refusal;
- `feed_second_liquid: "top"` (proposal 0024, (b)) needs a decanter and stays refused with this condenser.

A vented decanter (vapour + two liquids at the top) would be a later proposal, if a case asks for it and an open source
shows how it is specified.

### API and project file

```json
{ "id": "C1", "type": "column",
  "spec": { "mode": "rigorous", "stages": 30, "feed_stage": 24, "P_kPa": 100,
            "condenser": "vapour_liquid", "condenser_T_K": 326.15,
            "reflux_ratio": 2, "bottoms_kmol_h": 4581 } }
```

(Lab's methanol column with the paper's condenser temperature, 53 C, and reflux ratio; the bottoms flow is Lab's.)

- Outlets: `distillate` (the liquid distillate, port id unchanged), **`vapour_distillate`** (new, required with this
  condenser; refused as unknown with the others), `bottoms`, `side` as today.
- Result (`state`): `condenser: "vapour_liquid"`, `condenser_T_K`, `D_liquid_kmol_h`, `D_vapour_kmol_h`, `D_kmol_h`
  (their sum), `vapour_share`, `reflux_ratio` (L1/U1) and `reflux_over_distillate` (L1/(U1 + V1)), `condenser_kW`. The
  profile's stage 1 has L (the reflux), V (the vapour distillate) and the liquid draw U, as a side-draw stage has.
- Project file: the new keys are optional in a block's `spec`, so `PROJECT_FORMAT` goes up by one (a newer reader
  needed only for projects that use the condenser); older projects read unchanged.

### Workbench (flowsheet view, the column's form)

- The "Condenser" row gets a fourth button, "Vapour + liquid" (next to Total, Partial, Decanter), in the rigorous
  mode only.
- Chosen, a new row "Condenser fixed by": Temperature (°C or K, the project's units) | Vapour distillate flow |
  Vapour share of the distillate, with one input; then the two specifications as today.
- The column gains the outlet "vapour distillate" on the canvas; the stream table and the Excel export get the two
  distillates and the two reflux ratios.

## Engineering basis and validation

- **The equations:** ChemSep Book section 13.2 (stage 1 with a liquid side stream and a vapour product); DWSIM's
  `NewtonRaphson.vb` (stage 0 of `Partial_Condenser` writes the same M and E rows with `Sl(0)`); IDAES's condenser
  (material and energy balance of one equilibrium stage, the liquid split by the reflux ratio).
- **Independent reference (validation/python):** extend `reference_mesh.py` (the scipy MESH of the benchmark cases,
  sharing no code with the engine) with the liquid draw U1 on stage 1 and the three condenser specifications, as an
  option of the case file (`"condenser": "vapour_liquid"`), so the cases below are solved twice.
- **Cases (validation/data/columns/), tolerances as the existing ones (temperatures 0.01 K, mole fractions 1e-6,
  flows 1e-6 relative):**
  1. A3 extended: the constant-alpha ternary with a light component, each of the three condenser specifications,
     and the same column solved three times so the three agree (a temperature taken from the solution of the
     vapour-flow specification gives back the same column);
  2. limits: a share of 1e-3 and of 0.999 approach today's total and partial columns (stated tolerance); a
     temperature above the dew point refused;
  3. a real mixture with a gas: the methanol column of Lab's request (PR, the request file
     `validation/data/columns/lab-requests-0.6.2/u-column-partial-pr.request.json` with the condenser changed), against
     the reference with the same PR. A comparison with the paper's Aspen numbers (289 and 4542 kmol/h) is Lab's, not a
     validation (a different program and parameters);
  4. the condenser alone: IDAES's open test, benzene + toluene, an inlet of 1 mol/s, half benzene, at 375 K and 101325 Pa, condenser
     at 369 K, reflux ratio 1 (`test_partial_condenser.py`: reflux and liquid distillate 0.2306 mol/s each, x benzene 0.3806,
     vapour 0.5387 mol/s, y benzene 0.6021, duty -15901 W). CHEPTA's vapour pressures and enthalpies are not IDAES's
     ideal BTX package, so this is a cross-check with a stated tolerance (to set when it is run), not a fixture.
- **Not used:** RadFrac (no open description); DWSIM was read, not run (it is a .NET program; a person with DWSIM
  could run case 3 and add it as a cross-check).

## Effect on existing work

- `"total"`, `"partial"`, `"decanter"`, absorbers, strippers, extraction: no change; their code paths do not see the
  new row (the new unknown r exists only when `condenser === "vapour_liquid"`). Every existing test must pass
  unchanged.
- The public interface gains keys and an outlet; nothing is renamed. Old flowsheets and projects run as before.
- Lab can drop the "partial condenser + flash" workaround and rerun its methanol column.

## Alternatives considered

- **A liquid side draw from stage 1 of a `"partial"` condenser** (ChemSep's literal reading): the same equations, but
  the user would give the draw's rate, which is what Lab tried (from stage 2) and is neither of the specifications the
  paper prints. Kept as the internal formulation, not as the interface.
- **Partial condenser + flash afterwards** (Lab's workaround): the reflux has the wrong composition. Rejected.
- **Only DWSIM's vapour flow**, or **only IDAES's temperature**: the maintainer asked for all three; each is one row.
- **The reflux ratio over the whole distillate**: no open source found that defines it so for this condenser; offered
  in the result only (question 2).

## Steps

1. Engine: the new row and unknown in `engine.js` (start: the vapour share from the specification, or, for a
   temperature, from a flash of the start's top vapour at T_given), the refusals; `column.js` reads the keys, the new
   outlet and `state`; tests with case 1 and 2 against fixtures from the extended `reference_mesh.py`.
2. Design specifications on the two distillates (`product: "vapour_distillate"`); case 3; Lab's request file as a test
   that it runs.
3. Workbench: the button, the row, the outlet on the canvas, the stream table, Excel; `PROJECT_FORMAT` + 1;
   docs/models/columns.md.
4. Case 4 (IDAES cross-check) recorded in validation/report; Lab reruns the methanol plant.

## Questions for the maintainer

1. **Name of the option**: `condenser: "vapour_liquid"` (button "Vapour + liquid"), leaving `"partial"` as today's
   vapour-only condenser. *Recommended: yes.* Renaming `"partial"` to DWSIM's meaning would break saved flowsheets.
2. **Reflux ratio** with this condenser: reflux over the liquid distillate, L1/U1 (DWSIM's stream ratio and IDAES's
   `reflux_ratio`), with L1/(U1 + V1) in the result. *Recommended: L1/U1*, the definition of both open
   simulators; the other one may be what Aspen means by Campos's "reflux ratio 2" (not checkable openly; at 289 vs
   4542 kmol/h the two differ by 6 %).
3. **`distillate_kmol_h`** means the whole distillate (liquid + vapour). *Recommended: yes*, so that B = F - D holds;
   a design specification `component_flow` or a new `liquid_distillate_kmol_h` covers the liquid alone if needed
   (not proposed now).
4. **Two liquids in the vapour + liquid condenser**: refused, with the advice to add a decanter after it; no vented
   decanter until a case and an open source ask for it. *Recommended: yes.*
5. **Shortcut mode**: refused with this condenser (rigorous only). *Recommended: yes.*
6. **Validation**: the extended `reference_mesh.py` as the independent reference, the constant-alpha and PR methanol
   cases as fixtures, IDAES's condenser test as a cross-check only. *Recommended: yes.*
7. **Order of the build**: after proposal 0025's step 1 (the entrainer start) merges, since both touch
   `engine.js`'s top stage; steps 1-2 here in one pull request, step 3 in a second. *Recommended: yes.*
