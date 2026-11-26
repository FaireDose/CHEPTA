# 2026-11-26-01: Proposal 0028 accepted and built: product specifications among the column's MESH equations, cheaper second-liquid tests, a faster design-specification search

Branch `claude/proposal-0028-column-specs-in-mesh`, on top of proposal 0027's build (PR #269, not yet merged when this
was written). The analysis behind it: the coordinator's report "Column solve speed in flowsheets" (branch
`claude/trusting-euler-2prvu8`, `reports/`), which found that column SCDS15 of CHEPTA-Lab's ethyl acetate plant spent
most of the design-specification run in its outer purity search, and most of each column in the tangent-plane tests of
one-liquid stages.

## What the maintainer decided (2026-11-26, through the coordinator), for release 0.6.3

1. Product specifications among the column's own MESH equations whenever a restart profile exists, as a general
   feature of the column engine: purity and recovery of the distillate, the bottoms and side draws, every condenser and
   reboiler, VL and VLL; not a special case for SCDS15. The outer search of trial columns stays for the cold first call
   and as the fallback. Extends decision 2026-11-18-07 (built then for decanter columns only). The formulation is
   ChemSep's (The ChemSep Book, 2nd ed., section 13.2.4) and DWSIM's (NewtonRaphson.vb). Tested at Lab's phase boundary,
   F1 = 6503.5 kg/h.
2. Cheaper second-liquid tests: a second memo slot per stage for the base point, the reuse of a clearly stable verdict
   (the tangent-plane tm margin) at derivative perturbation points, and the full stability test on every stage at the
   converged answer always kept.
3. Design specifications: a secant step from the first two points instead of doubling 1 % steps, and every evaluation
   warm-started from the nearest solved point (tears and column profiles kept per solve); Brent's safeguard and the
   bounds kept.
4. The tolerance warning relative to the target (it advised 0.001 for an absolute mass-fraction target of 0.0004).

Answers must not change beyond the solver tolerances; no existing test changed (AGENTS.md rule 6).

## What was built (one commit per item)

**1. The MESH form** (`src/units/columns/engine.js`, specification kind `product_spec`; `specifications.js`). A column
whose design specifications are all purities (mole or mass basis), recoveries or component flows of the distillate,
the vapour distillate (condenser "vapour_liquid"), the bottoms or a side draw of given rate, and that has a profile to
start from (a flowsheet's last answer of the block, a design specification's next solve, a `start` given), writes
each specification in place of the energy balance of the end it frees: the condenser for a distillate specification,
the reboiler for a bottoms one where free, else the other free end:

    purity          ln(x_i / value) = 0          (mass basis: the mass fraction)
    recovery        ln(p_i / (value f_i)) = 0    (f_i the component's total feed)
    component flow  ln(p_i / value) = 0          (mol/s; mass basis kg/s)

These are DWSIM's rows (NewtonRaphson.vb, branch "windows", read 2026-11-26: `Component_Fraction`
`Log(xc(0)(i) / spval)`, `Component_Molar_Flow_Rate` `Log(LSSj(0) * xc(0)(i) / spval)`, `Component_Recovery`
`Log(LSSj(0) * xc(0)(i) / sumc / rec)`, and the reboiler's with `xc(ns)`, `Lj(ns)`). A row that reads another stage
than its end (a distillate purity written on the reboiler because the reflux is given; two specifications on one
product; a side draw) widens the band of the Newton matrix to reach that stage, and that one row is differentiated with
the stage it reads. Newton runs from the profile with the usual patience; if it does not converge, the engine does not
try its cold starts (they cannot hold a purity: The ChemSep Book, section 13.5, p. 224), and `specifications.js`
continues with the paths of before (the restart's outer loop, then the cold outer loop), its `tried` starting with the
attempt. The free variables found (reflux ratio, distillate flow, boil-up ratio) are reported in `adjusted` as the
outer loop reports them, so that the next restart has them. The decanter's bottoms purity keeps its own path of
2026-11-18-07, cold starts included. Not in the MESH form: stage temperatures and side draws whose rate is to be found
(the outer loop, unchanged); merged with main's one-liquid start of EA-8 (#265), which is not used for these rows.

**2. Second-liquid tests** (`two-liquids.js`, `stability.js`, `engine.js`). `liquidTangentPlane` now also returns
`tmMin`, the smallest tangent-plane distance of the nontrivial stationary points it found (Infinity where every trial
returned to the liquid). A stage whose last full test found its liquid stable with `tmMin >= 0.01` (TM_MARGIN) reuses
that verdict at a liquid within 1e-4 in every ln x_i and 0.01 K of the test (the perturbed points of its Jacobian,
1e-5 relative in the flows and about 1e-4 K); a liquid that split is never reused. A second memo slot per stage keeps the
last split computed in full, so the base point survives its perturbed points. At the answer the engine turns the reuse
off, recomputes every stage with the full test, and goes on with Newton where a verdict changed (refused if it then
does not converge). Answers are the same as with a full test at every point (tested on F9, to 1e-9). The three numbers
are this project's choice: moving ln x by 1e-4 moves tm by about as much, a hundredth of the margin.

The literature named by the maintainer: Ottenbacher and Hasse (Distillation and Absorption 2006, paper 82, free at
https://skoge.folk.ntnu.no/prost/proceedings/distillation06/CD-proceedings/paper082.pdf, read 2026-11-26) carry the
three-phase and the two-phase equations of a stage and switch on a negative liquid flow ("negative flash" criterion),
which "has worked very reliable and stable while requiring much less calculation effort than a fully-fledged phase
stability test would, e.g. by tangent plane criterion" (section on the model). The mixed-K form of Schuil and Bool
(1985) and Baden and Michelsen (1987) is the one the coordinator's report cites from The ChemSep Book, section 13.7.2;
no open copy of the two articles was found in this session (OpenAlex searches by title words and authors), and the
book's section was not reread here, so neither is used for a number. The reuse built here keeps the yes/no
tangent-plane decision and skips only its repetition next to a clear verdict, the "state barely moved" idea of the
report's reservoir-simulation sources, which were not opened in this session.

**3. Design specifications** (`src/flowsheet/design-specs.js`). After the guess and the step of 1 % of the range, one
secant step from these two points, aimed a tenth beyond the root it estimates (so that a good estimate brackets the
target and Brent's method finishes inside a narrow bracket), kept inside the bounds and to at most a quarter of the
range; where it does not bracket, the doubling steps go on from it. (A secant repeated until the target is met was tried
first: on the hyperbolic recycle of test/design-specs.test.js it met the target before any bracket, which that test's
Brent limit forbids, so one step was kept.) Every converged solve keeps its tear streams and its columns' last answers;
the next solve starts from the nearest one, the distance scaled by each variable's bounds. Brent's method, its
bisection safeguard, the bounds and the retry from the document's own start are unchanged.

**4. The tolerance warning.** For a fraction or a vapour fraction (an absolute tolerance) the warning compares the
tolerance with 100 times the recycle tolerance times the target's value, and advises that value: for Lab's 0.0004 at a
recycle tolerance of 1e-5 the floor is 4e-7, so Lab's 1e-5 gets no warning (before: "loosen the tolerance to 0.001").
The default tolerance is unchanged (see question 2).

## Validated

- `validation/python/reference_mesh_specifications.py --mesh` (new mode; its specifications among its own linear rows,
  another form of the same equations): new cases `validation/data/columns/specifications/mesh-cases.json`: M1 partial
  condenser with two purities, M2 a side draw's purity at a given reflux (a row reading stage 5), M3 a reflux ratio and a
  bottoms mass purity (SCDS15's form, one liquid), M4 a component flow of the vapour distillate and a bottoms recovery;
  fixture `validation/fixtures/column_specifications_mesh.json`. The engine meets each from its own profile, perturbed,
  in one solve, within 1e-7 of the flows and 1e-6 K of the reference; cold, by the outer loop, within the cases' wider
  tolerances. The same for the earlier cases S1, S2, S4, S5 and S6 against their fixture.
- `validation/python/reference_mesh_vll.py --mesh` (new mode): **F13**, SCDS15 alone with its feed S28 as CHEPTA
  computed it in Lab's plant at F1 = 6503.5 kg/h (acid trace left out), on ChemSep's three-phase stage with the purity
  row; fixture `validation/fixtures/columns-vll-mesh.json`. The MESH form from the profile: one column, 3 Newton
  iterations, 0.15 s; the outer loop cold: 11 columns, 18 s; both within F5's tolerances of the reference. At this feed no
  stage holds two liquids at the answer.
- The vapour + liquid condenser (a liquid-distillate purity with a bottoms recovery; a vapour-distillate purity) and the
  decanter (F9's column: its distillate purity, and a bottoms recovery) are not in those references: there the MESH form
  is checked against the outer loop's column and the column it started from.
- `test/columns-specs-in-mesh.test.js` (14 tests), `test/two-liquid-test-reuse.test.js` (2), `test/design-specs-secant.test.js` (3).

## Benchmark (CHEPTA-Lab, cases/ethyl-acetate-piotrowski-2021, results-chepta-main-415da41 inputs)

Same container, 4 cores, `node bin/chepta.mjs request --time-ms 3500000`, the four runs of each pair side by side (so
each run had one core, and the "before" times are longer than the 894 s of decision 2026-11-25-03, measured two at a
time). Before: PR #269's head 9eb2312; after: this branch with main merged. Times from `run.elapsed_ms` and
`run.timing`. Simulated values throughout.

| Run | Before | After | Answer |
|---|---|---|---|
| `new-plant-ds-ethanol0.0004` (the ethanol feed F1 varied for 0.04 mass % ethanol in S16; its tolerance 1e-5) | **1,200 s** (20.0 min), 7 solves | **179 s** (3.0 min), 4 solves | F1 6,506.2318 (before) and 6,506.2211 kg/h (after; Lab's main: 6,506.2314), ethanol 0.040020 and 0.039938 % against 0.04 %: both within the specification's 1e-5; largest stream difference 2.6e-4 of its flow (S21), from the two F1 values, both inside that tolerance |
| `plant62-R-bottoms-col5-14stages` (Lab's request 8) | 843 s | 671 s | the same streams (largest difference 0) |
| Lab's plant with F1 fixed at 6,503.5 kg/h (the phase boundary; no design specification) | 598 s | 102 s | largest stream difference 5e-6 of its flow |

By block (seconds; calls):

| Run | SCDS15 | SCDS11 | SCDS5 |
|---|---|---|---|
| design specification, before | 976 (115) | 140 (115) | 67 (115) |
| design specification, after | 70 (76) | 65 (76) | 32 (76) |
| 14 stages, before | 53 (46) | 298 (46) | 486 (46) |
| 14 stages, after | 48 (46) | 246 (46) | 370 (46) |
| F1 = 6,503.5, before | 490 (42) | 64 (42) | 38 (42) |
| F1 = 6,503.5, after | 46 (42) | 26 (42) | 24 (42) |

The design-specification solves (F1 kg/h, seconds, passes): before 6511 (51 s, 1), 6511.25 (1.5 s, 1), 6510.5 (76 s,
7), 6509.5 (110 s, 7), 6507.5 (289 s, 12), 6503.5 (367 s, 14), 6506.2318 (305 s, 13); after 6511 (46 s, 1), 6511.25
(0.9 s, 1), the secant step 6504.75 (19 s, 15), Brent's first step 6506.2211 (113 s, 19), met. So item 1 took SCDS15 from
976 to 70 s (on every restart it is now one column among its MESH equations, "from the last answer's profile"), item 3
the solves from 7 to 4, and item 2 most of the gain in SCDS11 and SCDS5 (two-liquid columns without design
specifications; the 14-stage run, where SCDS5 is an absorber, gains 20 % from item 2 alone, its answer unchanged).

At F1 = 6,503.5 kg/h no stage of SCDS15 holds two liquids at the converged plant, before or after (`two_liquid_stages`
empty); the second liquid on its stage 1 that the report names may appear on the way (a pass of the recycle), which the
result does not record. The run converges there with the MESH form and the full test at every answer.

Where the time goes now (design specification, after): SCDS15 70 s, SCDS11 65 s, SCDS5 32 s of 179 s; the Brent step's
19 passes (a finite-difference Jacobian of the recycle) are 113 s. Not built here: the report's recommendations 5 to 7
(fewer tear streams in Lab's case, analytic derivatives, column tolerances tied to the recycle).

## Questions for the maintainer (recommendations)

1. The MESH form is used whenever a profile exists, also for a `start` given by a person outside a flowsheet (not only
   for a flowsheet's restart). **Recommended: yes**: the same column within the tolerances, one solve.
2. The default tolerance of a fraction target (when none is given) is still max(1e-6, 100 x the recycle tolerance),
   absolute: 0.001 for a target of 0.0004 at a recycle tolerance of 1e-5. **Recommended: the same target-relative floor
   as the warning (here max(1e-6, 4e-7) = 1e-6)**; not changed in this build because it changes answers where no
   tolerance is given.
3. Side draws whose rate is to be found, and stage temperatures, stay on the outer loop. **Recommended: yes for now**:
   a free draw rate is one more unknown (a bordered system), a separate step if Lab needs it.

## Rules kept

No existing test or validation data changed; new cases, fixtures and tests only. `npm run build` passes; `npm test` (main merged): 1857 tests, 1851 pass, 0 fail, 5 skipped, 1 todo (the UNIQUAC ternary azeotrope, as before).
