# 2026-11-14-07: Two liquids in columns (proposal 0024)

Proposal 0024 (PR #253) answers the maintainer's question on PR #251 (docs/decisions/2026-11-14-05-column-fixes-lab-062.md,
answer 1). It proposes (a) a warning when a column's feed holds a second liquid, recommending a decanter; (b) a bypass of a
small second liquid to the top or the bottom; (c) a smooth two-liquid stage (a smoothed complementarity between the second
liquid's fraction and the tangent-plane distance) for splits that form inside the column, which Lab's column 11 with acetic
acid needs. No engine code yet.

## The maintainer's answers (2026-11-14, in the session of PR #253: "ok with 1%, 2; ok, 3 ok, 4, ok, 4 ok")

1. The share that triggers the warning: 1 mol % of the column's feed (this project's choice; the user can change it).
2. Above it: a warning, not a refusal; the column is still calculated. The bypass of (b) is refused above it.
3. Top or bottom for the bypass: the user's choice, no default.
4. (c) becomes the default once the existing two-liquid column tests, the validated case and Lab's column 11 with acid pass.
5. The final smoothing parameter: fixed by the tests, never loosened to make a column converge.

These answers replace the 5 % share and the default by volatility of the follow-up recorded in
docs/decisions/2026-11-14-05-column-fixes-lab-062.md (the maintainer confirmed "your answers now" when asked which held).
From that follow-up stay: the validated case is heterogeneous azeotropic distillation with an entrainer and a decanter on the
condenser, and the vapour + liquid distillate condenser (M5) is a separate proposal.

## The validated case

Ethanol dehydration with cyclohexane and a decanter on the condenser (all three pairs with NRTL sets fitted to open data),
tested against the ThermoML Archive's VLE and VLLE of water + ethanol + cyclohexane at 101.3 kPa (Gomis et al., Fluid Phase
Equilib. 235 (2005) 7-10) and the independent reference. No open measured column profile was found; what was searched is in
the proposal ("Engineering basis").
