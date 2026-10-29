# The Column block

One block for distillation ([proposal 0015](../../proposals/0015-separation-units.md), Part I, section 1). Its
modes: **shortcut** (built, milestone M1) and **rigorous** (MESH on equilibrium stages, planned for M2a; refused until
then with the outcome "unsupported"). Absorber, stripper and extraction come later as configurations of the same
block. Code: `src/units/columns/shortcut.js` (the equations), `src/units/columns/column.js` (the block). Tests:
`test/columns-shortcut.test.js`, against W7's cases ([columns-benchmarks.md](columns-benchmarks.md)).

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
| a purity specification, the rigorous mode | not built yet: unsupported (case E3 before M4) |

Gilliland's correlation is a fit to columns: its N is an estimate, never a check.

**The result:** the distillate and the bottoms (saturated at the column's pressure); the block's duty, its one energy
stream, is the reboiler's duty minus the condenser's, and the two are given apart; N_min, R_min, θ, N, the whole
stages and the feed stage; the minimal profile (the condenser, the feed stage, the reboiler: temperature, liquid and
vapour flows by constant molar overflow, duty, the keys' relative volatility, the liquid composition). In the
workbench: the block's panel, and the column's table under the drawing when it is selected. Through the request path:
`solve_column` (`CHEPTA.run`, `chepta request`, the MCP tool), or the block in `solve_flowsheet`. Saved in project
format 6.
