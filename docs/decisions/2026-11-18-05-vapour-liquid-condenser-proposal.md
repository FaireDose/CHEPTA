# 2026-11-18-05: Proposal 0026, the condenser with a vapour and a liquid distillate (M5)

What was decided before, and what this pull request does.

- **2026-11-14** (docs/decisions/2026-11-14-05-column-fixes-lab-062.md, answer 2 and its follow-up): M5 accepted in
  principle, "proposal then build". The condenser takes its pressure and one of: the condenser temperature, the vapour
  distillate flow, or the vapour share of the distillate; the reflux ratio or another specification as today.
- **2026-11-18**, the maintainer: "i am a bit concerned that you invent things that are not done in simulators".
  The proposal therefore takes its equations and specification count from open sources only: the ChemSep Book
  (section 13.2), DWSIM's source (`RigorousColumn.vb`, `NewtonRaphson.vb`), IDAES-PSE's condenser
  (`condenser.py` and its test), and COCO's help (its column is ChemSep). RadFrac has no open description and is not
  used.

This pull request adds proposals/0026-vapour-liquid-condenser.md (Draft), its line in proposals/README.md, and the
open item in docs/DECISIONS.md. No code, data or test changes.

## The maintainer's answers (2026-11-18, relayed by the coordinator)

All seven as recommended; proposal 0026 is **Accepted**, not built yet.

1. Name: `condenser: "vapour_liquid"` ("Vapour + liquid"); `"partial"` stays the vapour-only condenser.
2. Reflux ratio with this condenser: L1/U1, over the liquid distillate (DWSIM's stream ratio, IDAES's
   `reflux_ratio`); the result also gives L1/(U1 + V1).
3. `distillate_kmol_h` is the whole distillate, liquid plus vapour.
4. Two liquids in the condenser itself: refused, with the advice to add a decanter after it; no vented decanter.
   **Correction:** the first draft also refused `feed_second_liquid: "top"` with this condenser. That contradicted
   main (`src/units/columns/column.js`: with every condenser but the decanter, the small bypassed second liquid is
   mixed into the distillate after the column by a P-H flash) and the maintainer's choice in proposal 0024 that the
   user picks top or bottom. Now: with `"vapour_liquid"`, `"top"` mixes the bypassed liquid into the **liquid**
   distillate after the condenser, as with `"total"`, never into the condenser stage; the mixed product reports two
   liquids in its `phases` where its flash finds them, as for `"total"` today. A test case (2b) is added to the
   validation plan.
5. Shortcut mode: refused with this condenser.
6. Validation: the extended `reference_mesh.py` as the independent reference; the constant-alpha and PR methanol
   cases as fixtures; IDAES's condenser test as a cross-check only.
7. Build after proposal 0025's step 1 merges; steps 1-2 in one pull request, the workbench (step 3) in a second.
