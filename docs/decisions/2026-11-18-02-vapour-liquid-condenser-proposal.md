# 2026-11-18-02: Proposal 0026, the condenser with a vapour and a liquid distillate (M5)

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

## Waiting for the maintainer

The seven questions at the end of the proposal, each with a recommendation: the option's name (`"vapour_liquid"`),
the reflux ratio's definition (L/U, liquid distillate, as DWSIM and IDAES), `distillate_kmol_h` as the whole
distillate, two liquids in this condenser refused, shortcut refused, the validation plan, and the build order (after
proposal 0025, step 1).
