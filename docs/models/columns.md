# The Column block

One block for distillation ([proposal 0015](../../proposals/0015-separation-units.md), Part I, section 1). Its
modes: **shortcut** (milestone M1) and **rigorous** (MESH on equilibrium stages, milestone M2a: vapour and one
liquid). Absorber, stripper and extraction come later as configurations of the same block. Code:
`src/units/columns/shortcut.js` (the shortcut's equations), `src/units/columns/engine.js` (the column engine, the
rigorous solver), `src/units/columns/column.js` (the block). Tests: `test/columns-shortcut.test.js`,
`test/columns-rigorous.test.js`, against W7's cases ([columns-benchmarks.md](columns-benchmarks.md)).

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
M4; side draws with M4; two liquids on the stages and the column's own property method with M2b.

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
relative. Converged is not validated against data.

**What the engine refuses, and what it warns:**

| Situation | What the column does |
|---|---|
| a second liquid on a stage (Michelsen's tangent-plane test of each stage's liquid, after convergence) | refuses (`PHASE_SPLIT`, outcome "unsupported"), naming the stages and the liquid that splits off; two liquids on the stages come with M2b |
| the solver does not converge | `NO_CONVERGENCE` (outcome "not_converged"), with what it tried, the last residuals by group, a hint where constant molar overflow gives no boil-up (W7's E2) or where the last iterate holds two liquids; never a statement that the column has no solution |
| a stage's liquid below 1 % of the column's largest vapour flow (stages 2 to N − 1), or a stage's vapour below 1 % of the largest liquid flow | warns `DRY_STAGE`, with the stages, the cause and the remedy (W7's D1: stages 2 to 5); the 1 % is this project's choice |
| a pair without parameters | missing data, the pair named (C1) |
| purity or recovery specifications, side draws, phases "LL" or "VLL", no reboiler | not built yet: unsupported |
| nonvolatile components, inert solids, the dimerizing acids' chemical theory | not built yet: unsupported (columns with nonvolatile components are step 7) |

**The result:** the distillate and the bottoms (saturated at the column's pressure), the block's duty (the reboiler's
minus the condenser's) and the two apart, the reflux and boil-up ratios, and the profile of every stage: T, P, the
liquid and vapour leaving it, x, y and the duty. In the workbench: the block's panel (the method, the stages, the two
specifications), its results, and the profile table under the drawing when it is selected; solved in the worker, with
the Stop button. Through the request path: `solve_column` or the block in `solve_flowsheet`. Saved in project format 6.

**The benchmarks** (`test/columns-rigorous.test.js`): W7's A1, A3 and D1 agree with the independent reference within
about 1e-11 (the cases allow 1e-6 in flows, 1e-7 in mole fractions, 1e-5 K); B1 (ethanol + water, NRTL) within
3e-12 in mole fraction and 2e-11 K; A2's rigorous reflux at 101 stages gives the light key's recovery of 0.98 to
2e-13. The performance budgets, measured on the development container (2026-10-29, Node 22, one thread):

| Benchmark | Components, stages, method | Tolerances | Cold start | Budget in the test |
|---|---|---|---|---|
| B1 | ethanol + water, 20, NRTL with an ideal-gas vapour | TOLERANCES (1e-10) | 0.2-0.3 s, 2 Newton iterations | 10 s |
| four alcohols and water | methanol, ethanol, 1-propanol, water, 40, NRTL | the same | 7.5 s (Newton gives up after 12 iterations, 5.5 s; continuation in 4 steps, 2 s) | 60 s |

The engine's limits: extremely pure products (impurities below about 1e-30, for example 101 stages at five times the
minimum reflux) may not converge; they are refused as not converged.
