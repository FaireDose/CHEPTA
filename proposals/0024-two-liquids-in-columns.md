# 0024: Two liquids in columns: a decanter warning, a bypass for a small second liquid, and a smooth two-liquid stage

- **Status:** Draft; the open questions answered by the maintainer on 2026-11-14 (section "Decided")
- **Author(s):** a coding agent, for the maintainer
- **Discussion:** the pull request of this file; the maintainer's question of 2026-11-14 in
  [docs/decisions/2026-11-14-05-column-fixes-lab-062.md](../docs/decisions/2026-11-14-05-column-fixes-lab-062.md)
  (PR #251), answer 1
- **Roadmap item:** proposal 0015, Part I, section 3 (two liquids on the stages, milestone M2b)

## Problem

CHEPTA-Lab's ethyl acetate plant (public repository FaireDose/CHEPTA-Lab, `cases/ethyl-acetate-piotrowski-2021`)
cannot close column 11 when the feed carries 0.001-0.01 mass % acetic acid. PR #251 found the cause: the column
converges only through the continuation in the relative volatilities, and with acid the continuation stops at 91 %
because the two-liquid region grows down the column one stage at a time, and Newton stalls each time a stage crosses
the edge of the two-liquid region. The whole-liquid K-values of `src/units/columns/two-liquids.js` have a kink there:
on one side the stage's tangent-plane test says "one liquid" and K_i = K_i(x); on the other the liquid-liquid split
gives beta > 0 and K_i = K_i(x') x'_i / x_i. The switch is a yes/no decision inside every Jacobian evaluation.

The maintainer asked (2026-11-14, verbatim): "in reality will a two liquid mixture will be in a column? or only traces
of a small amount of liquid will be, which cannot be fully separated upstream. if it is the second case just make a
smaller modification where the nonmiscible part goes either top or bottom. in case it is a large amount of nonmiscible
entering the column should be a warning and the user should select first a decanter."

Both cases occur. (1) A feed that already holds two liquids: a small immiscible amount that a decanter upstream could
not remove, or a large one that a decanter should. (2) A split that forms inside the column from a one-liquid feed:
heterogeneous azeotropic distillation, and Lab's columns 5 and 11, where ethyl acetate and water split near the top.
The ChemSep Book (below) lists many such processes. A decanter upstream does not remove case 2, so case 2 needs the
stage model itself to cross the binodal smoothly.

## Proposal

**(a) Warning when the feed holds two liquids.** Before solving, every column feed is flashed at its own T and P with
the stage method's liquid-liquid test (the flash drum's three-phase flash, already used for streams). Where the second
liquid is more than **1 mol % of the column's feed** (the maintainer, 2026-11-14; this project's choice of the number,
which the user can change per column), the result carries a warning, whatever `phases` says: "The feed to stage k
holds two liquids (the second, water-rich, is n mol % of the feed, m % by mass). A column is normally fed one liquid:
put a decanter before the column." The column is still calculated (a warning, not a refusal). At 1 mol % or less there
is no warning.

**(b) A small second liquid in the feed** (1 mol % of the feed or less): `feed_second_liquid: "stages" | "top" |
"bottom"`.

- `"stages"` (the default; today's behaviour): the whole feed enters the stage. With `phases: "VLL"` the stages carry
  both liquids; with `"VL"` the one-liquid stage model is used, and the warning of (a) says so where it applies.
- `"top"` or `"bottom"`: the user's choice, with no automatic default (the maintainer, 2026-11-14): which way the
  liquid goes depends on the process (water in a hydrocarbon column leaves at the top as a heterogeneous azeotrope; a
  heavy, nearly involatile liquid falls to the bottom). The feed is split at its own T and P; its second liquid
  bypasses the stages and joins the condenser's liquid (with a decanter: the decanter's feed, so it is split there) or
  the bottoms (mixed at the product's pressure, P-H flash of the mixture). The stages see only the first liquid and the
  vapour. The result says what was bypassed and that the duties do not include heating or vaporizing it.
- Refused above 1 mol %: "Too much second liquid for a bypass: put a decanter before the column, or use
  feed_second_liquid: \"stages\"". The refusal names both directions.

(a) and (b) answer the maintainer's case 1. They do not fix Lab's column 11, where the split forms inside the column.
The validated case of all three parts is heterogeneous azeotropic distillation with an entrainer and a decanter on the
condenser (the maintainer, 2026-11-14; "Engineering basis", the validated case).

**(c) A smooth two-liquid stage** (for `phases: "VLL"`, case 2). The yes/no test of each stage is replaced by
equations that hold on one-liquid and on two-liquid stages alike, by a complementarity, as Dabadghao et al. (below)
write for a vapour that appears and vanishes. On stage j, beside l_ij, v_ij and T_j (the whole liquid x stays the
engine's variable, so the material balances and the vapour's equilibrium are unchanged), add the variables W_ij
(c values: a trial second liquid, w = W / sum W), beta_j (the second liquid's fraction of the whole liquid) and s_j:

    x'_j = (x_j - beta_j w_j) / (1 - beta_j)                              (the first liquid)
    ln W_ij + ln gamma_i(w_j, T_j) - ln x'_ij - ln gamma_i(x'_j, T_j) = 0   (c equations)
    s_j = 1 - sum_i W_ij                                                  (Michelsen's tm at a stationary point)
    0 <= beta_j  perp  s_j >= 0,  smoothed:  beta + s - sqrt((beta - s)^2 + eps^2) = 0

On a two-liquid stage s_j = 0, sum W = 1 and the equations are equal activities of x' and w; on a one-liquid stage
beta_j = 0, x' = x and W_j is the stationary point of the tangent-plane test of x, with s_j = tm > 0. The stage's
K-values and enthalpy stay those of today's adapter (K_i(x') x'_i / x_i; (1 - beta) h_L(x') + beta h_L(w)), so where a
stage is clearly inside or outside the two-liquid region nothing changes. The equations are stage-local, so the
Jacobian stays block-tridiagonal (3c + 3 unknowns per stage instead of 2c + 1). The column is solved first with a
larger eps, then eps is reduced in steps to its final value, each solve started from the last; eps appears in the
result's `solver` record. The start: W, beta from today's split on stages that split, the tangent-plane test's best
trial phase and its tm elsewhere.

## Engineering basis

- **What CHEPTA does now is ChemSep's "mixed K-value model".** The ChemSep Book (H. A. Kooijman, R. Taylor, 2nd ed.,
  2006, public domain, http://www.chemsep.org/downloads/docs/book2.pdf, read 2026-11-14), section 13.7.2, pp. 229-230:
  "The basic idea is to treat the two liquid phases as a single phase with thermodynamic properties defined by an
  appropriate averaging of the two liquid phases present" (eqs. 13.45-13.52; Schuil and Bool 1985, Baden and
  Michelsen 1987). Section 13.7.1, pp. 227-229, gives the full three-phase stage (eqs. 13.35-13.44, 3c + 4 equations)
  and the difficulty: "the number of equations and variables ... is not known until the problem has been solved", and
  "The set of model equations listed above always admits the ('trivial') two-phase solution". Section 13.7, p. 226,
  lists the processes with two liquids on the trays (steam distillation, ethanol dehydration with an entrainer, acetic
  acid dehydration with butyl acetate, ...); p. 232: "it is important to be able to accurately locate those trays on
  which a second liquid phase forms (so that it can be withdrawn by a sidestream if desired)".
- **The complementarity form.** V. Dabadghao, J. Ghouse, J. Eslick, A. Lee, A. Burgard, D. Miller, L. Biegler, "A
  complementarity-based vapor-liquid equilibrium formulation for equation-oriented simulation and optimization", AIChE
  J. (2023), doi:10.1002/aic.18029; free copy: the submitted manuscript of 2022-12-01 on OSTI,
  https://www.osti.gov/servlets/purl/1924675 (found by `open_copy.py --all`, 2026-11-14; not the peer-reviewed
  version). Section 2.2, eqs. 5.1-5.3, pp. 6-7: slack variables complementary to the phase flows, "0 <= sV ⊥ V >= 0";
  section 2.4, p. 8, the smoothing "0 <= ξ ⊥ η >= 0 ⟺ ξ − max(0, ξ − η) = 0 ≈ ½(ξ + η − sqrt((ξ − η)^2 + ε^2)) = 0",
  used there for "distillation optimization with disappearing phases" (abstract). Proposal (c) applies the same form
  to the second liquid, with the tangent-plane distance as the slack. That transfer is this proposal's, not the
  paper's. The articles it builds on (Gopal and Biegler 1999, doi:10.1002/aic.690450715; Kamath, Biegler and
  Grossmann 2010, doi:10.1016/j.compchemeng.2010.07.028) have no free copy (`open_copy.py --all`, 2026-11-14) and are
  not used.
- **tm = 1 - sum W** at a stationary point of the tangent-plane test: Michelsen 1982, as `src/equilibrium/stability.js`
  already states and uses.
- **The trivial solution** (ChemSep's point 3) is the main risk: w = x', s = 0 satisfies the equations with any beta.
  The start from the nontrivial trial phase, and a check after convergence (every stage with beta > 0 has w and x'
  apart; every stage with beta = 0 passes today's tangent-plane test), guard it. A stage that fails the check is
  reported, never returned silently (AGENTS.md, "fail loudly").
- **Tests.** (1) Every existing two-liquid column gives today's answer within its tolerances:
  `test/columns-vll.test.js` (F1, F2 and the ternary cases against `validation/python/reference_mesh_vll.py`), F3
  (two liquids on some stages only), `test/columns-acid.test.js` and `test/vlle-acid.test.js`. (2) Lab's inputs of
  `validation/data/columns/lab-requests-0.6.2/` (PR #251): column 11 with 0.001 and 0.01 mass % acetic acid must
  converge, and column 5 must give the same answer as with today's adapter. (3) An independent check:
  `reference_mesh_vll.py` extended with ChemSep's full three-phase stage (eqs. 13.35-13.44, both liquid flows as
  unknowns, the stages with two liquids taken from the converged JavaScript column and confirmed by the reference's
  own tangent-plane test), solved by scipy, compared on column 11, F3 and the validated case below with F1's
  tolerances. (4) For (b): the material balance closes exactly; with a second liquid of 0.1 % the bypassed column
  agrees with the full `"VLL"` column within that share; the warning appears above 1 mol %, and the bypass is
  refused there.
- **The validated case: ethanol dehydration with cyclohexane as the entrainer, a decanter on the condenser** (CHEPTA's
  ethanol dehydration benchmark, docs/BENCHMARKS.md). All three pairs have NRTL sets fitted to open data
  (`src/data/binaries.json`: ethanol + water `fitted-kamihama2012`, cyclohexane + water `fitted-marche2006-etal`,
  ethanol + cyclohexane `fitted-reddy2013`), and the water + cyclohexane heterogeneous azeotrope is already checked
  (`test/benchmark-ethanol-dehydration.test.js`). The open data to test against: the NIST TRC ThermoML Archive file of
  Gomis, Font, Pedraza, Saquete, Fluid Phase Equilib. 235 (2005) 7-10, doi:10.1016/j.fluid.2005.07.015
  (https://trc.nist.gov/ThermoML/10.1016/j.fluid.2005.07.015.html, read 2026-11-14): isobaric VLE and VLLE of water +
  ethanol + cyclohexane at 101.3 kPa; its abstract states "a ternary heterogeneous azeotrope at 335.6K with a
  composition of 0.188, 0.292, 0.520 mole fraction of water, ethanol and cyclohexane". The tests: the column at high
  reflux must bring its top vapour to the azeotrope that the model predicts, and the deviation of that prediction from
  the measured azeotrope and from the VLLE tie lines is stated (the pairs were not fitted to ternary data); the
  decanter's two liquids must lie on the model's tie line at the decanter's temperature; the column must give the same
  profile with (c) and with today's adapter where both converge, and match the independent reference.
- **No open measured column profile was found** (2026-11-14). Searched: OpenAlex (open-access works, "heterogeneous
  azeotropic distillation" with "pilot", "experimental", "tray composition", "decanter", "entrainer"); `open_copy.py
  --all --supplements` for the articles with measured columns named by De Guido et al. (below): Gomis et al., Ind. Eng.
  Chem. Res. 46 (2007) 4572 (ethanol, isooctane), doi:10.1021/ie0616343; Font et al., Ind. Eng. Chem. Res. 42 (2003)
  140, doi:10.1021/ie0204078; Wang et al., Ind. Eng. Chem. Res. 37 (1998) 2835 (2-propanol, cyclohexane, a laboratory
  sieve-plate column), doi:10.1021/ie970855t; Cairns and Furzer, Ind. Eng. Chem. Res. 29 (1990), parts 1 and 3,
  doi:10.1021/ie00103a040 and 10.1021/ie00103a042 (tray data, which The ChemSep Book, p. 231, also names): none has a
  free copy or a supplement. Alliet-Gaubert et al., Ind. Eng. Chem. Res. (2001), doi:10.1021/ie000808s (submitted
  manuscript, https://hal.science/hal-03483870), compares pilot and industrial data, but the components are not named
  ("an organic acid dehydration using an immiscible entrainer"), so it cannot be rebuilt. Open simulated worked examples
  exist, made with Aspen Plus and its own NRTL parameters, so their numbers test those parameters, not CHEPTA's: De
  Guido, Monticelli, Spatolisano, Pellegrini, Energies 14 (2021) 5471, doi:10.3390/en14175471, CC BY (copy at
  https://re.public.polimi.it/bitstream/11311/1184588/1/energies-14-05471.pdf): 2-propanol + water with isooctane, a
  30-stage column with a decanter (section 2), but CHEPTA has no isooctane + water pair; Plesu Popescu et al., Chem.
  Eng. Trans. 81 (2020) 829, doi:10.3303/CET2081139 (ethanol with several entrainers). They may be named as
  cross-checks of the process behaviour, never as data.

## Effect on existing work

- (a) adds a warning only; no result changes. (b) is a new option whose default is today's behaviour.
- (c) changes how `"VLL"` stages are solved. Steps 2-3 keep it behind an option until every test above passes; then
  it becomes the default and today's adapter stays as a fallback attempt. Flowsheet and project files are unchanged
  (no new required field). The decanter condenser keeps its own equations.
- The column's `solver` record gains eps and the two-liquid check.

## Alternatives considered

- **Only (a) and (b), as the maintainer first suggested:** the smallest change, but it does not fix Lab's column 11 or
  any heterogeneous azeotropic column, where the split forms on the stages.
- **ChemSep's full three-phase stage (eqs. 13.35-13.44) with a stage-by-stage choice of two or three phases:** the
  number of equations changes as stages cross the binodal; ChemSep (p. 229) calls a fixed choice "a rather uncertain
  adventure". It is kept as the independent reference of the tests instead.
- **Smoothing only beta in today's adapter** (a smooth max of the split's beta and 0): the split does not exist
  outside the binodal, so there is nothing to smooth from on one-liquid stages.
- **What DWSIM does** (source, GPL-3.0, https://github.com/DanWBR/dwsim, commit 1abf72d of 2026-07-17, read
  2026-11-14): its rigorous column computes each stage's K-values with `DW_CalcKvalue(x, y, T, P)` of one liquid
  (`RigorousColumnSolvers/NewtonRaphson.vb`, around line 290), unless the property package sets
  `ShouldUseKvalueMethod2`/`3` (default `False` in `PropertyPackage.vb`, lines 524-526; none of the packages in
  `DWSIM.Thermodynamics/PropertyPackages` overrides it). Method 2 takes K from a T-P flash of the stage's whole
  contents (`DW_CalcKvalue(Vx, T, P)`, `result(3)(i) / result(2)(i)`, vapour over the first liquid). Its condenser
  types are `Total_Condenser`, `Partial_Condenser` and `Full_Reflux` (`RigorousColumn.vb`, `Enum condtype`), and the
  file has no decanter or free-water option. So DWSIM offers neither a feed warning nor a bypass, and by default no
  second liquid on the stages. ChemSep's flash "deals only with two different phases leaving, a vapor and a liquid"
  (The ChemSep Book, chapter 12, p. 183); its columns use the mixed K-value model above. CHEPTA goes further than both,
  because Lab's plant needs the split on the stages.

## Steps

1. (a) and (b): the feed check, the warning above 1 mol %, `feed_second_liquid`, the refusal of a bypass above it;
   tests (4). Small; no change to any converged column.
2. (c) in `src/units/columns/two-liquids.js` and `engine.js`, behind `two_liquid_stage: "smooth"`; tests (1) and (2),
   and the validated case (ethanol + water + cyclohexane with a decanter) as a column case in `validation/data/columns/`.
3. The independent reference (3) in `validation/python/reference_mesh_vll.py` and its fixture.
4. If 1-3 pass: `"smooth"` the default, today's adapter the fallback; Lab reruns column 11 and the closed plant.

## Decided (the maintainer, 2026-11-14, on the questions of the first draft)

1. **The share:** 1 mol % of the column's feed (this project's choice; the user can change it per column). Above it, a
   warning that recommends a decanter first; the warning also gives the mass share.
2. **A large second liquid:** a warning, not a refusal; the column is still calculated. Only the bypass of (b) is
   refused above the share.
3. **Top or bottom for the bypass:** the user's choice, with no default; the refusal text names both options.
4. **(c) as the default:** yes, once every existing two-liquid column gives its present answer within its tolerances,
   the validated case passes and Lab's column 11 converges with acid; until then it stays behind
   `two_liquid_stage: "smooth"`.
5. **The final eps:** the largest value at which every test of (1) still passes at its tolerance, stated in the code
   and in the `solver` record; never loosened to make a column converge.

The validated case (heterogeneous azeotropic distillation with an entrainer and a decanter on the condenser) and the
separate proposal for the condenser with a vapour and a liquid distillate (M5) follow the maintainer's follow-up on
PR #251 (docs/decisions/2026-11-14-05-column-fixes-lab-062.md). These answers replace that follow-up's 5 % share and
its default by volatility (the maintainer, 2026-11-14, in this pull request's session).
