# The Column block

One block for distillation ([proposal 0015](../../proposals/0015-separation-units.md), Part I, section 1). Its
modes: **shortcut** (milestone M1) and **rigorous** (MESH on equilibrium stages, milestone M2a: vapour and one
liquid; milestone M2b: two liquids on the stages, a decanter on the condenser, and the column's own property method).
Absorber, stripper and extraction come later as configurations of the same block. Code:
`src/units/columns/shortcut.js` (the shortcut's equations), `src/units/columns/engine.js` (the column engine, the
rigorous solver), `src/units/columns/two-liquids.js` (two liquids on the stages), `src/units/columns/column.js` (the
block, and the P-H boundary of its own method). Tests: `test/columns-shortcut.test.js`,
`test/columns-rigorous.test.js`, `test/columns-vll.test.js` (M2b), against W7's cases ([columns-benchmarks.md](columns-benchmarks.md)).

## The shortcut mode

**Specification:** the light and the heavy key; the fraction of the light key's feed recovered in the distillate and
of the heavy key's feed recovered in the bottoms; the reflux ratio or the reflux as a multiple of the minimum; the
condenser, total (liquid distillate, the default) or partial (vapour distillate); the pressure (default the feed's;
no pressure drop). Purity specifications come with milestone M4.

**The equations** (as the open source code of DWSIM documents them, `ShortcutColumn.vb`, GPL-3.0, read 2026-10-29;
the original articles are paywalled and not used), with α the relative volatilities to the heavy key and q the feed's
liquid fraction:

- Fenske: N_min = ln[(d_LK / b_LK)(b_HK / d_HK)] / ln(α_LK / α_HK); each non-key by d_i / b_i = (d_HK / b_HK)(α_i / α_HK)^N_min.
- Underwood: Σ α_i z_i / (α_i − θ) = 1 − q with θ between the keys; R_min = Σ α_i x_D,i / (α_i − θ) − 1.
- Gilliland in Eduljee's form: X = (R − R_min)/(R + 1), Y = 0.75 (1 − X^0.5668), N = (Y + N_min)/(1 − Y).
- The feed stage: N_S = N_min,S N / N_min, with N_min,S Fenske's equation between the feed and the bottoms.
- q = (H_dew − H_F)/(H_dew − H_bub) of the feed at the column's pressure; the condenser's duty from the distillate's
  saturated vapour and liquid; the reboiler's from the energy balance.

N counts equilibrium stages, the reboiler included and a total condenser not. The whole stages are numbered from the
top (1 the condenser), with the feed stage between the condenser and the reboiler.

**The thermodynamics:** the relative volatilities are the K-values of the flowsheet's method at the feed's bubble
point (DWSIM takes them at the feed's conditions), held constant through the column.

**Where it holds, and what it does where it does not:**

| Situation | What the block does |
|---|---|
| reflux ratio at or below Underwood's minimum | refuses (invalid input), naming R_min (case E1) |
| boil-up of zero or less | refuses, naming the specifications to change (case E2) |
| the keys' relative volatility at 1 or below at the top or the bottom (an azeotrope or a pinch between the keys) | refuses, naming the azeotrope |
| the keys' relative volatility changes by more than 20 % between the top, the feed and the bottom | warns (`VOLATILITY_VARIES`) with the three values (B1's mixture); the 20 % is this project's choice |
| a non-key between the keys in volatility | refuses as not built (Underwood's several roots): choose adjacent keys |
| a pair without parameters | missing data, the pair named (case C1) |
| a purity specification | not built yet: unsupported (case E3 before M4) |

Gilliland's correlation is a fit to columns: its N is an estimate, never a check.

**The result:** the distillate and the bottoms (saturated at the column's pressure); the block's duty, its one energy
stream, is the reboiler's duty minus the condenser's, and the two are given apart; N_min, R_min, θ, N, the whole
stages and the feed stage; the minimal profile (the condenser, the feed stage, the reboiler: temperature, liquid and
vapour flows by constant molar overflow, duty, the keys' relative volatility, the liquid composition). In the
workbench: the block's panel, and the column's table under the drawing when it is selected. Through the request path:
`solve_column` (`CHEPTA.run`, `chepta request`, the MCP tool), or the block in `solve_flowsheet`. Saved in project
format 6.

## The rigorous mode

**Specification:** the number of stages, counted from the top with the condenser and the reboiler (1 the condenser,
N the partial reboiler; W7's convention); the feed stage, from 2 to N − 1 (one per feed: the rigorous mode takes
several feeds, each entering its stage as one stream); the condenser, total (liquid distillate) or partial (vapour
distillate); the pressure (default the first feed's; no pressure drop); and **two** of: the reflux ratio L₁/D, the
boil-up ratio V_N/B, the distillate or the bottoms flow, the condenser duty (heat removed) or the reboiler duty. Not
both product flows (they add up to the feed), not both duties, and not two specifications of the same end (the reflux
ratio with the condenser duty, the boil-up ratio with the reboiler duty). Purity and recovery specifications come with
M4; side draws with M4. Two liquids on the stages, the decanter and the column's own property method (M2b) are below.

**The equations** (the engine's file header has them in full): for every stage the component balances, the
equilibrium y = K x with the flowsheet's method (activity models with their vapour model, or an equation of state), and
the energy balance, in the variables of Naphtali and Sandholm (the component flows of the liquid and of the vapour
leaving each stage, and its temperature), as the open source code of DWSIM documents them (`NewtonRaphson.vb`, class
NaphtaliSandholmMethod, GPL-3.0, read 2026-10-29; written anew, not translated). A total condenser is not an
equilibrium stage: its liquid, the reflux and the distillate, is at its bubble point. The condenser's and the
reboiler's energy balances give their duties; the two specifications take their place.

**The solver**, as NeqSim's column documentation describes its Naphtali-Sandholm solver (a finite-difference
block-tridiagonal Jacobian, a guarded Newton step, a robust start; https://equinor.github.io/neqsim/wiki/distillation_column,
read 2026-10-29):

1. a start by constant molar overflow, then the bubble-point method of Wang and Henke as DWSIM's `BubblePoint.vb`
   documents it (compositions by one tridiagonal system per component, temperatures at the bubble points, vapour flows
   from the energy balances); or a previous solution of the same column;
2. Newton's method on all equations together: the Jacobian by central differences, stage by stage; the step in the
   logarithms of the component flows (a trace never turns negative), at most 20 K per stage, halved until the residual
   falls; given up when the residual has not fallen a thousandfold in 12 iterations;
3. if that fails, continuation: the column is first solved with every component's ln K replaced by their mean (no
   separation), and the differences come back in steps, each solve started from the last. Long columns with very pure
   products need it (A2 at 101 stages and 0.99999 of the minimum reflux; four alcohols and water on 40 stages). This is
   this project's choice of a continuation method.

**Solved means** every group of residuals within its tolerance, given with the result (`state.residuals`,
`state.tolerances`, and `checks.columns` through the request path): material 1e-10 of the total feed (mol/s), energy
1e-10 of the feed times 10 kJ/mol (W), equilibrium and summation 1e-10 in mole fraction, the specifications 1e-10
relative. Converged is not validated against data. The maintainer kept 1e-10 (2026-10-29): measured against 1e-8 on
B1, B2, B3 and P1 it costs at most one Newton step and no measurable time (Newton's method squares the error each
step), the flowsheet checks every block's material balance to 1e-9 of its flow (the column's overall balance is the sum
of its stages' errors), and W7's case E4 needs it. An optional `max_iterations` (the engine's `maxIterations`) limits
the Newton iterations; a column that reaches it is not converged (E4).

**What the engine refuses, and what it warns:**

| Situation | What the column does |
|---|---|
| a second liquid on a stage with phases "VL" (Michelsen's tangent-plane test of each stage's liquid, after convergence) | refuses (`PHASE_SPLIT`, outcome "unsupported"), naming the stages and the liquid that splits off, and the remedy: "look for two liquids on the stages" (phases "VLL") |
| a third liquid on a stage with phases "VLL" (each of a stage's two liquids tested) | refuses (`PHASE_SPLIT`), as the flash does |
| phases "VLL" with an equation of state, or the dimerizing acids' chemical theory | refuses (`NOT_AVAILABLE`): two liquids need an activity model, as in the flash drum |
| a decanter whose two liquids come out the same (the condensate holds one liquid) | `NO_CONVERGENCE`, saying so; use a total condenser |
| a stream the column's own method (or, leaving, the flowsheet's) cannot represent: no P-H solution, a phase it cannot have (two liquids in Peng-Robinson) | refuses with that method's reason (for example `PHASE_SPLIT`), naming the stream |
| the solver does not converge | `NO_CONVERGENCE` (outcome "not_converged"), with what it tried, the last residuals by group, a hint where constant molar overflow gives no boil-up (W7's E2) or where the last iterate holds two liquids; never a statement that the column has no solution |
| a stage's liquid below 1 % of the column's largest vapour flow (stages 2 to N − 1) | warns `DRY_STAGE`, with the stages, the cause and the remedy (W7's D1: stages 2 to 5); the 1 % is this project's choice: no open source gives a threshold for equilibrium stages without the trays' geometry (searched 2026-10-29) |
| a stage's vapour below 1/5 of the column's largest vapour flow (stages 2 to N) | warns `DRY_STAGE` (vapour): outside the turndown of bubble-cap trays, 5 (sieve 2, valve 4; Fermeglia, "Staged column design", University of Trieste, 2021, slide 54), so with one diameter the trays would weep; the maintainer's choice, 2026-10-29. The checks with the trays' geometry (flooding, weeping) come with M2b |
| a pair without parameters | missing data, the pair named (C1) |
| purity or recovery specifications, side draws, phases "LL" (extraction), no reboiler | not built yet: unsupported |
| nonvolatile components, inert solids, the dimerizing acids' chemical theory | not built yet: unsupported (columns with nonvolatile components are step 7) |

**The result:** the distillate and the bottoms (saturated at the column's pressure), the block's duty (the reboiler's
minus the condenser's) and the two apart, the reflux and boil-up ratios, and the profile of every stage: T, P, the
liquid and vapour leaving it, x, y and the duty. In the workbench: the block's panel (the method, the stages, the two
specifications), its results, and the profile table under the drawing when it is selected; solved in the worker, with
the Stop button. Through the request path: `solve_column` or the block in `solve_flowsheet`. Saved in project format 6.

## Two liquids on the stages (milestone M2b)

**The option** "look for two liquids on the stages" (`phases: "VLL"`), off by default (proposal 0015, Part I,
section 3: a three-phase calculation on every stage costs time); activity models only (NRTL, UNIQUAC, Modified UNIFAC
2.0), as the flash drum. With it, a stage holds a vapour and one or two liquids; **the phase-stability check decides
where a second liquid exists**: at each stage's temperature, Michelsen's tangent-plane test of the stage's whole liquid
(`src/equilibrium/stability.js`), and where it would split, the two liquids by the liquid-liquid flash at that
temperature (`splitLL` of `src/equilibrium/flash.js`; near a plait point, where its successive substitution falls back
to one liquid, Newton's method on the same equations from the trial phase, the neighbouring stages' splits or a liquid
rich in each component).

**The equations.** Both liquids of a stage leave it together (to the stage below, or as the reboiler's or the total
condenser's product), so the MESH equations are those of one liquid written for the stage's whole liquid x, with: the
vapour in equilibrium with both liquids, y_i = K_i(x′) x′_i, so the whole liquid's K-values are K_i(x′) x′_i / x_i; the
liquid's molar enthalpy (1 − β) h_L(x′) + β h_L(x″); and the bubble temperature of a liquid that splits where
Σ K_i(x′) x′_i = 1. Where a stage holds one liquid these are the one-liquid equations exactly. This is the usual way to
write a three-phase stage when its two liquids are not separated (the "effective K-value" of the whole liquid), written
here from the phase-equilibrium conditions, not taken from a source. A binary with two liquids and a vapour boils at
one temperature (Gibbs' phase rule): the stages that hold two liquids sit at the heterogeneous boiling point.

**The two liquids are named by density** (proposal 0015, section 5), light and heavy, from the components' liquid
densities at T mixed ideally (the volumes add); without a density record, by the component each is richest in.

**The decanter** (`condenser: "decanter"`, with `phases: "VLL"`): the condensate splits at its bubble point; one liquid,
`reflux_liquid` (`"light"`, the default, or `"heavy"`), returns to stage 2 entirely, the other is the distillate. Stage
1's equations: the component balances, both liquids in equilibrium with one vapour (equal activities), the reflux at its
bubble point; the condenser's energy balance gives its duty. A decanter fixes the reflux, so the column takes **one**
specification: the boil-up ratio, the reboiler duty, or a product flow (not the reflux ratio nor the condenser duty).
No outlet port is added: the decanter's distillate leaves by the distillate port; where both liquids of a condensate
are wanted as products, the flash drum's liquid2 outlet already does it.

**The result:** each stage's whole liquid (x) as before, and `liquids` (null for one liquid): the light and the heavy
liquid, their flows and compositions and densities (for the decanter, which one is the reflux); `state.two_liquid_stages`.
In the workbench: "Liquids on the stages: One / Look for two", the Decanter and the refluxed liquid in the panel; the
profile table adds the light and heavy flows and x′, x″ of every stage that holds two.

**Checked** (`test/columns-vll.test.js`) against W2's independent reference `validation/python/reference_mesh_vll.py`
(fixture `validation/fixtures/columns-vll.json`: W7's MESH equations of `reference_mesh.py` with an independent Python
liquid-liquid split; written by W2 because W7's M2b reference was not on main on 2026-10-30), within F1's numerical
tolerances: W7's F1 (1-butanol + water, NRTL, 6 stages) with two liquids, stages 1 and 2 two-liquid, within 2e-10 K and
1e-11 in mole fraction; a ternary of W2 (1-butanol + water + methanol, NRTL, 10 stages: one liquid on stages 1 and 2,
two below) within 6e-11 K; F1's column with a decanter (the butanol-rich liquid refluxed, D = 35 mol/s) within 2e-10 K.
F1 with phases "VL" is still refused. Times on the development container (2026-10-30, Node 22): F1 0.3 s, the ternary
0.5 s, the decanter 0.3 s; a ternary of ethanol, water and ethyl acetate with stages near a plait point took 7 s.

## The column's own property method (milestone M2b)

**The option** `method: { model, vapour, sets, prefer }` (as a flowsheet's thermo): the column is solved with that
method (for example NRTL with liquid-liquid parameters) while the flowsheet uses another. **The P-H boundary**
(proposal 0015, Part I, section 3): a shared enthalpy reference (each ideal gas at 298.15 K) does not make two methods
agree at the same T and P (their departure and excess enthalpies differ), so every stream that enters or leaves the
column keeps its **component flows, its pressure and its enthalpy flow**, and its temperature is found by a P-H flash in
the receiving method: each feed in the column's method, each product in the flowsheet's (the product's enthalpy flow is
the column's own, from its last stage). The change of temperature is reported (`state.boundary`, the block's notes, the
panel; through the request path `qualifications.block_methods` and `reproduction.block_methods`). A state the
receiving method cannot represent (no P-H solution, a phase it cannot have) is refused with that method's reason and
the stream named. The block's and the flowsheet's energy balances close because the enthalpy flows are kept.

**Checked** (`test/columns-vll.test.js`): the boundary in both directions (a UNIQUAC flowsheet with an NRTL column, and
an NRTL flowsheet with a UNIQUAC column, 1-butanol + water with a decanter): each feed's temperature in the column's
method equals an independent P-H flash, the same temperature in the other method would differ by more than 1 kW, each
product taken back into the column's method returns to the column's temperature within 1e-6 K, and the block's and the
flowsheet's energy balances close within 1e-6 kW; in a recycle (part of the distillate back to the feed) the flowsheet's
energy balance closes; a feed of two liquids into a column in Peng-Robinson is refused (`PHASE_SPLIT`, the feed named).
On the butanol + water example the feed at 360 K in UNIQUAC enters the NRTL column at 363.8 K, the distillate leaves at
+0.22 K and the bottoms at −0.53 K.

**The benchmarks** (`test/columns-rigorous.test.js`): W7's A1, A3 and D1 agree with the independent reference within
about 1e-11 (the cases allow 1e-6 in flows, 1e-7 in mole fractions, 1e-5 K); B1 (ethanol + water, NRTL) within
3e-12 in mole fraction and 2e-11 K; A2's rigorous reflux at 101 stages gives the light key's recovery of 0.98 to
2e-13. The performance budgets, measured on the development container (2026-10-29, Node 22, one thread):

| Benchmark | Components, stages, method | Tolerances | Cold start | Budget in the test |
|---|---|---|---|---|
| B1 | ethanol + water, 20, NRTL with an ideal-gas vapour | TOLERANCES (1e-10) | 0.2-0.3 s, 2 Newton iterations | 10 s |
| four alcohols and water | methanol, ethanol, 1-propanol, water, 40, NRTL | the same | 7.5 s (Newton gives up after 12 iterations, 5.5 s; continuation in 4 steps, 2 s) | 60 s |

W7's M2a cases (`test/columns-rigorous-m2a.test.js`): A4 (two feeds), B2, B3 (acetone + methanol, pinched 0.0012 below
the model's azeotrope; it needs the continuation) and P1 agree with the reference within the cases' numerical
tolerances; E4 (one iteration) is not converged; F1 (1-butanol + water) is refused with PHASE_SPLIT on stages 1 and 2,
the stages the reference finds. **B2, the complete benchmark** (The ChemSep Book, 2nd ed., section 1.2, benzene +
toluene, 10 stages; public domain): the engine is within 0.373 K and 0.0059 in benzene's mole fraction of the published
stages (W7's agreement tolerances 0.6 K and 0.01: two property methods, not a check against measured data). **P1** (the
named performance benchmark: methanol, ethanol, 1-propanol, water; NRTL; 40 stages; phase check on every stage):
cold start 1.9 s (6 Newton iterations), warm start at R = 3.3 0.6 s (5 iterations), on the development container
(2026-10-29, Node 22); W9 sets the budget.

The engine's limits: extremely pure products (impurities below about 1e-30, for example 101 stages at five times the
minimum reflux) may not converge; they are refused as not converged.
