# 2026-10-30-03: Proposal 0015, milestone M2b, W4: the column diameter, flooding and weeping

Step 6 of proposal 0015 (columns), started by the maintainer. Written against contracts v1 (contract 2, Unit v2
warnings; contract 4, `columnDiameter`).

## What was built

- `src/units/columns/hydraulics.js`: Fair's flooding velocity on every tray of the rigorous column, the diameter from
  the largest required vapour-flow area, the fraction of flooding of every tray, the warnings FLOODING (above the
  design fraction) and WEEPING (below the trays' turndown), and a given diameter checked instead of sized. It stays
  with the column, as the heater's area stays with the heater (a block may not call the sizing layer above it).
- The Column block's optional `sizing` (rigorous mode); `columnDiameter(columnResult, { sys, ... })` in
  `src/sizing/sizing.js` (contract 4); `solve_column` returns `column.sizing` (command line, MCP); the project schema's
  description; in the Flowsheet workspace, a folded "Diameter and flooding (optional)" section under the rigorous
  column, the diameter and the highest fraction of flooding in its results, and a "Flooding, %" column in its profile.
- `validation/python/reference_hydraulics.py`, `validation/fixtures/hydraulics.json`,
  `validation/data/sizing/fair_chart_fermeglia2021.json`, `test/column-hydraulics.test.js`; docs/models/sizing.md.

## The numbers to check against the source

All from M. Fermeglia, "Staged column design", University of Trieste (19 April 2021), the source of proposal 0015:

| What | Value in CHEPTA | Where |
|---|---|---|
| Fair's chart | 96 values of K_n,fl (m/s), 6 tray spacings (0.15, 0.2, 0.3, 0.45, 0.6, 0.9 m) × 16 flow parameters (0.01 to 1.8), **read off the graph** by pixel position (`validation/data/sizing/fair_chart_fermeglia2021.json`); e.g. at F = 0.1: 0.0410, 0.0474, 0.0590, 0.0767, 0.0939, 0.1268 | slide 37 |
| flooding velocity | u_fl = K_n,fl K1 K2 K3 K4 √((ρl − ρv)/ρv); K1 = (σ/20)^0.2; K2 = (10 Ah/Aa)^0.44 if Ah/Aa < 0.1, else 1; K3 = 0.9 for holes above 6 mm, else 1; K4 for foam | slide 38 |
| flow parameter | (W_L/W_V)(ρV/ρL)^0.5, mass flows | slide 46 |
| net area | A_net = η π D²/4, η 0.85-0.95; 0.90 in the example | slides 44, 47 |
| operating fraction | "typically 0.65 to 0.90"; "Initially fix K5 = 0.8" | slides 50, 39 |
| tray spacing | 24 in in the example; 0.15-1 m typical | slides 45, 52 |
| turndown | sieve 2, valve 4, bubble cap 5 | slide 54 |
| worked example | F = 0.0546, C_sb = 0.36 ft/s, K = 0.331, u_flood = 4.836 ft/s, D = 11.03 ft | slides 46-47 |

The surface tension of the liquid: Winterfeld, Scriven and Davis, as the chemicals library (MIT) computes it; its own
example, 0.02496738845043982 N/m, is a test. The library states it for nonaqueous mixtures (3-4 %); for water mixtures
it is an estimate.

## Choices of this project (to confirm or change)

- **Design fraction of flooding: 0.80** (answer 5: within the slides' 0.65-0.90; slide 39's starting K5 = 0.8; the
  University of Oklahoma slides say "~80 %"). The worked example of slide 47 uses 0.75.
- Tray spacing 0.6 m (the example's 24 in); η = 0.90 (the example's); sieve trays (the slides' perforated trays);
  holes 5 mm and Ah/Aa = 0.1 (K2 = K3 = 1, the chart's basis); K4 = 1 (non-foaming, the chart's basis).
- Each tray takes the vapour and liquid leaving it, at its temperature; the condenser and the reboiler are not trays.
- Between the chart's values: linear in ln K against ln F, and against ln H. Outside the chart: refused.
- WEEPING: a tray below 1/turndown of its own flooding velocity (the slides' definition of turndown applied per tray).

## What the sources did not give

- No open fitted form of Fair's chart with its tray spacing stated. The University of Oklahoma's 2018 slides (already
  a source) print two log-quadratic fits without their spacing, and their example does not reproduce
  (0.398 √(1099/1.043)(15/20)^0.2 = 12.2, printed 10.84): not used. NPTEL's notes name the chart without values.
  Lygeros and Magoulas (1986), the usual fit, is in a paywalled journal: not used.
- Slide 46 reads C_sb = 0.36 ft/s off another drawing of Fair's chart; slide 37's chart gives 0.332 ft/s there (8 %
  lower), so CHEPTA's diameter for the example is 11.56 ft (4.8 % above the slide's 11.03 ft); with the slide's K the
  same arithmetic gives 11.03 ft (the test checks both).
- Slide 35 says the diameter "depends on the tray having the lowest flooding velocity"; proposal 0015 (Part I §2)
  takes the largest required area, which the test shows differs with a cold feed (the stripping section's stage 11
  sets 1.34 m; stage 2, the slowest, alone would give 1.26 m).
- Not built: the column's height, the downcomer backup and the pressure drop of slides 41-43, packed columns.

## How it was checked

`test/column-hydraulics.test.js`: the formulas against the Python reference within 1e-9 (six cases: the example, the
slowest stage not setting the diameter, the chart's span, between spacings with K2, K3, K4, a given diameter that
floods, one that weeps with valve trays); the chart table against the data file; the worked example; the
surface-tension rule; W7's case B1 (ethanol + water, NRTL) through `solve_column`: sized, too small (FLOODING), too
large (WEEPING, not with valve trays), a cold feed; `columnDiameter` against the block's own sizing; the refusals.
`npm test` passes.
