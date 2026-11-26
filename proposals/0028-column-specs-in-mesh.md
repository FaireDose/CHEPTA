# 0028: Column product specifications among the MESH equations, cheaper second-liquid tests, a faster design-specification search

- **Status:** Accepted (the maintainer, 2026-11-26, through the coordinator; the four decisions below)
- **Author(s):** Claude (coding agent), for the maintainer
- **Discussion:** follows proposal 0027 (PR #269, column restarts, timing, a time limit) and its benchmark on CHEPTA-Lab's
  ethyl acetate plant (docs/decisions/2026-11-25-03-solve-speed-build.md)
- **Roadmap item:** flowsheet solver speed (release 0.6.3)

## Problem

With proposal 0027, CHEPTA-Lab's ethyl acetate design-specification run (`new-plant-ds-ethanol0.0004`: the ethanol feed
F1 varied until product S16 holds 0.04 mass % ethanol) takes 13.6-14.9 minutes, against 108 before. One block takes
most of it: column SCDS15 (18 stages, two liquids allowed on the stages, a total condenser at a reflux ratio of 2 and
99.99 mass % water in the bottoms), 654 of 816 s. Its purity is met by the outer loop of
`src/units/columns/specifications.js`: every outer step is a whole column solved at a fixed distillate flow, and its
Jacobian; and every Newton step of a column with two liquids allowed runs the tangent-plane stability test at every
perturbed point of the stage's Jacobian. The design-specification search itself spends solves on doubling steps of
1 % of the range before it brackets the answer, and each solve starts from the last one, not from the nearest.

Who is affected: everyone who runs a flowsheet with rigorous columns on product specifications, above all inside
recycles and design specifications (CHEPTA-Lab's plants).

## Proposal

The maintainer's four decisions (2026-11-26), each built as its own commit of one pull request:

1. **Product specifications among the column's own MESH equations, whenever a restart profile exists**, as a general
   feature of the column engine: purity (mole or mass basis), recovery and component flow of the distillate, the
   vapour distillate (vapour + liquid condenser), the bottoms and a side draw of given rate; every condenser
   (total, partial, vapour_liquid, decanter) and the partial reboiler; phases "VL" and "VLL". A specification takes
   the place of the energy balance of the end it frees (the condenser's or the reboiler's), as ChemSep and DWSIM
   write theirs. The outer search of trial columns stays for the cold first call (no profile) and as the fallback when
   the MESH form does not converge. The decanter's bottoms purity among the MESH equations
   (docs/decisions/2026-11-18-07-purity-in-mesh.md) keeps its path, cold starts included.
2. **Cheaper second-liquid tests**: a second memo slot per stage for the base point, and the reuse of a clearly
   stable verdict (the tangent-plane distance tm above a margin) at the derivative perturbation points of that
   stage. The full stability test still runs on every stage at the converged answer (with the reuse turned off), so a
   one-liquid answer is never returned without it.
3. **Design specifications**: after the first two solves, a secant step towards the target (Aspen Plus's default for
   one specification is the secant method) instead of doubling steps of 1 % of the range; every evaluation starts
   from the NEAREST solved point (its tear streams and its columns' profiles, kept per solve), not only from the last
   one. Brent's method inside the bracket and the bounds stay.
4. **The tolerance warning**: the advice "tighter than 100 times the recycle tolerance" is made relative to the target
   for a fraction (an absolute target): today it advises 0.001 for a mass-fraction target of 0.0004.

No input or output format changes. `specifications.method` and `tried` in a column's result say which path met the
specifications.

### The rows (item 1)

On the end whose own specification is free (the condenser for a distillate specification, the reboiler for a bottoms
specification where free, else the other free end), in place of that end's energy balance:

    purity          ln(x_P,i / value) = 0          x the product's mole fraction, or its mass fraction
    recovery        ln(p_i / (value f_i)) = 0     p_i the component's flow in the product, f_i its total feed
    component flow  ln(p_i / value) = 0           mol/s (mass basis: kg/s)

with the product's flows from the stage that delivers it: the condenser's distillate (total, partial, decanter), the
vapour + liquid condenser's liquid U1 x1 or vapour, the reboiler's liquid, a side draw's liquid or vapour at its rate.
A row that reads another stage than its own end (a distillate purity on the reboiler's row, a side draw) widens the
band of the Newton matrix to reach that stage; the band solver is unchanged.

Example: SCDS15, `{ "reflux_ratio": 2, "bottoms_purity": { "component": "water", "value": 0.9999, "basis": "mass" } }`:
the reflux row on the condenser, `ln(w_B,water / 0.9999) = 0` on the reboiler, one Newton solve from the last answer.

## Engineering basis

- The ChemSep Book (H. A. Kooijman and R. Taylor, 2nd ed., 2006, public domain,
  http://www.chemsep.org/downloads/docs/book2.pdf), section 13.2.4 "Special Stages": the condenser and the reboiler
  equations are replaced by specification equations, among them "the mole fraction of a given component in either the
  distillate or bottoms product stream" and component flows and recoveries.
- DWSIM (GPL-3.0), DWSIM.UnitOperations/UnitOperations/RigorousColumnSolvers/NewtonRaphson.vb, branch "windows",
  https://github.com/DanWBR/dwsim, read 2026-11-26: the condenser's and the reboiler's specifications
  `Component_Fraction` `Log(xc(0)(i) / spval)` (mass basis: the mass fraction), `Component_Molar_Flow_Rate`
  `Log(LSSj(0) * xc(0)(i) / spval)`, `Component_Recovery` `Log(LSSj(0) * xc(0)(i) / sumc / rec)` with sumc the
  component's feed, and the same on the reboiler with `xc(ns)`, `Lj(ns)`.
- Second-liquid tests: the literature the maintainer named is checked and cited in the decision file of the build
  (only what was opened in the session).
- Validation: the independent Python reference `validation/python/reference_mesh.py` (and `reference_mesh_vll.py`,
  which already writes a bottoms purity row for decanter columns) gets the new rows, written from the definitions
  above; fixtures of columns with each kind of row, each end and each condenser, solved by the reference from the
  engine's profile (perturbed), and the engine's answer compared within the engine's tolerances. Each new case is
  also solved by the outer loop (cold), and the two answers must agree within the specification tolerance.
- Answers must not change beyond solver tolerances: CHEPTA-Lab's two benchmark runs (`new-plant-ds-ethanol0.0004`,
  `plant62-R-bottoms-col5-14stages`) are compared stream by stream before and after, and SCDS15 is tested at Lab's
  phase boundary (F1 = 6503.5 kg/h, where a second liquid appears on its stage 1).

## Effect on existing work

No format change; every test kept unchanged (AGENTS.md rule 6). A column on design specifications that has a
restart profile (a flowsheet's second pass, a design specification's next solve, a `start` given) takes the MESH
form first; its answer is the same column within the tolerances, its `solver.specifications` says "among the MESH
equations". Without a profile, the path is unchanged.

## Alternatives considered

- Keeping the outer loop and making each trial column cheaper: the trial columns are already restarted; the outer
  loop needs at least one column and one Jacobian per step, the MESH form one Newton solve.
- Writing the specifications among the MESH equations also cold: the continuation in the volatilities cannot hold a
  purity (The ChemSep Book, section 13.5, p. 224; docs/decisions/2026-11-11-01-column-specifications.md), so the cold
  first call keeps the outer loop, as decided.
- A mixed-K pseudo-liquid or skipping the stability test where the state barely moved: see the decision file of the
  build; the reuse of a clearly stable verdict at the perturbation points is the form chosen by the maintainer.

## Steps

One pull request, one commit per item: (1) the MESH-form specifications, with the reference and its tests; (2) the
second-liquid tests; (3) the design-specification search; (4) the tolerance warning. Then the benchmark before and
after, the decision file and the open items of docs/DECISIONS.md.
