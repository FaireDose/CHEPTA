# CHEPTA's ethyl-acetate flowsheet with a design specification: where the 15 minutes go, and what work could be skipped

Scope: code reading of CHEPTA at `origin/claude/build-0027-solve-speed` (commit 9eb2312, "Proposal 0027 built"), the
Lab case `cases/ethyl-acetate-piotrowski-2021` (request `results-chepta-main-415da41/new-plant-ds-ethanol0.0004.request.json`
and its output on main 415da41), the proposal 0027 text (branch `origin/claude/proposal-0027-solve-speed`,
`proposals/0027-solve-speed.md`, decision `docs/decisions/2026-11-25-02-solve-speed-proposal.md`), the build decision
`docs/decisions/2026-11-25-03-solve-speed-build.md` and `docs/decisions/2026-11-18-07-purity-in-mesh.md`. The full
flowsheet was not run. Short targeted runs of column SCDS15 alone (each under 3 minutes) were made with the script
`/tmp/claude-0/-home-user-Fugacity/3ea4cc3a-28ab-563e-8d4f-77bda30af5d9/scratchpad/r269/col15.mjs` on the build's source,
feed = stream S28 of Lab's converged answer (F1 = 6,506.23 kg/h), and are cited below as "[run col15]". One run used a
three-line scratch patch (not committed) that lets the bottoms purity go into the MESH equations of a total-condenser
column; it is cited as "[run col15, MESH patch]". File references are `path:line` at commit 9eb2312 (sources are local
files, not URLs). Simulated values throughout; estimates are marked as such.

## 1. What is nested, and how many evaluations each level triggers

### Takeaway
Four levels are nested: Brent's design-specification solver (7 whole-flowsheet solves on the build) -> one Broyden
recycle loop over 17 blocks with 5 tear streams (20 tear variables; 55 regular passes plus, by inference, 3
finite-difference Jacobians of 20 passes each = 115 calculations of every column) -> per column, for SCDS15 an outer
Newton/scan search on its distillate flow (1 to 13+ trial columns per call) -> per trial column Naphtali-Sandholm
Newton with a central-difference Jacobian whose every perturbed stage property runs the two-liquid split or a
tangent-plane stability test. SCDS15 alone is 726 of 894 s, about 6.3 s per call on average against about 0.2-0.3 s
when its restart works.

### Cited Findings
**The case (request file)**
- 24 blocks, 28 streams; UNIQUAC with an ideal vapour; 4 components (ethanol, water, ethyl acetate, acetic acid);
  `solver: { maxIterations: 200, tolerance: 1e-05, designSpecIterations: { bracket: 8, solve: 20 } }`; method not
  given, so Broyden (default, `src/flowsheet/flowsheet.js:88`) — [request.json](new-plant-ds-ethanol0.0004.request.json)
- Five streams marked `tear: true` with guesses from the settled plant: S27, S7, S21, S15, S24 — [request.json]
- Three rigorous columns, all `phases: "VLL"`: SCDS5 absorber, 8 stages, feeds on 1 and 8; SCDS11 35 stages, feed 15,
  total condenser, `reflux_ratio: 3`, `distillate_kmol_h: 240`; SCDS15 18 stages, feed 9, total condenser,
  `reflux_ratio: 2`, `bottoms_purity: { component: water, value: 0.9999, basis: mass }` — [request.json]
- One design specification DS_ETHANOL: vary F1's ethanol flow (guess 6,511, bounds 6,490-6,515 kg/h) for 0.04 mass %
  ethanol in S16, `tolerance: 1e-05` — [request.json]
- The loop solved is one strongly connected set of 17 blocks: MIX13, MIX3, PUMP14, KREA4, SCDS5, HTXR6, MIX7, EXTR8,
  SPLIT9, HTXR19, HTXR10, HTXR18, SCDS15, SCDS11, SPLIT16, HTXR12, HTXR17 — [main output `value.loops[0].blocks`]

**Level 1: design specification (Brent)**
- One specification: residual bracketed from the guess with a first step of 1 % of (max - min), then doubling steps
  toward the side where |r| falls, at most `bracket` solves, then Brent — `src/flowsheet/design-specs.js:17-22`,
  `:484` (`h = 0.01 * (hi - lo)`), `:505-517`
- Each evaluation is a full recycle solve; the tear streams start from the last solve's converged streams
  (`warmGuesses`, `design-specs.js:319-331`; `warm = result`, `:432`); the columns' kept profiles carry over
  (proposal 0027 (a)); on a failed warm solve it retries once from the document's start with the restarts cleared
  (`:413-421`)
- Build run: 7 solves taking 37, 1, 60, 84, 201, 274 and 238 s with 1, 1, 7, 7, 12, 14 and 13 passes; 894 s in all;
  SCDS15 726 s, SCDS11 108 s, SCDS5 48 s, the other 21 blocks 12 s, "over 115 calculations of each block" —
  `docs/decisions/2026-11-25-03-solve-speed-build.md` (benchmark section)
- Main 415da41 (cold columns): 8 solves, 108 min; result F1 6,506.2314 kg/h, bracket [6,503.5, 6,507.5],
  `method: "brent"` — [main output `value.designSpecs`]

**Level 2: recycle loop (Broyden)**
- Tear vector = component flows only (`vec`, `flowsheet.js:567`): 5 tears x 4 components = 20 variables
- Converged when the largest relative change per pass is below `tolerance` (`flowsheet.js:823`)
- Safeguard 4: when the change has not halved in STALL = 8 accepted passes, H is replaced by a forward-difference
  Jacobian, one pass per tear variable, step FD_STEP = 1e-7 of the tear's flow (`flowsheet.js:653`, `:706-729`,
  `:840-853`); each such pass calculates every block in the loop
- Every block calculation passes the block's own last answer as `restart` (`flowsheet.js:515-519`)
- Main's last solve: 13 iterations, residual 8.9e-6 at tolerance 1e-5 — [main output `value.loops`]

**Level 3: SCDS15's own purity specification (outer loop around the stage solver)**
- A column with a design specification goes to `solveSpecified` (`src/units/columns/engine.js:421`); the method is
  "an outer loop around the stage solver ... Newton's method on g_k(p) = s_k(column solved with p) - s_k(asked)", each
  trial point a whole column; with one free variable a scan of 15 grid values of D and an Illinois secant search take
  over when Newton fails — `src/units/columns/specifications.js:17-30`, grid at `:332-338` (distillate grid 0.01-0.99 of
  Dmax)
- For SCDS15 the free variable is the distillate flow (reflux ratio fixed at 2), Newton in logit(D/Dmax); the outer
  Jacobian comes from the converged column's own sensitivities (`exact`, `specifications.js:415-435`); step halving up to
  8 columns per outer step; MAX_OUTER = 30 (`:103`)
- With a restart: first the search from the last answer's D (`prevVals`, `:546-555`); if it fails, NO_CONVERGENCE
  (`:556`) is caught and the whole search runs again "as from a cold start", with start, startAdjusted and startEarly
  removed (`:263-272`, `:268`), i.e. from `estimateDistillate` and reflux starts [3, 8, 1.2, 20] (`:557-567`), then
  the scan (`:574`)
- Trial columns after the first are `quick` (`specifications.js:354`: `quick: !!warm && anySolved`): Newton from the
  neighbour stopped early, then the bubble-point start, no continuation (`engine.js:736-741`, `:832-836`)
- SCDS15 on main's last calculation: 13 column solves, 39 column iterations, "Newton's method on the specifications
  from the distillate flow 144.9 mol/s (7 iterations)"; final answer D = 399.68 kmol/h (111 mol/s), bottoms water
  0.9998999999999888, scaled residual -1.1e-10 — [main output `blocks.SCDS15.state`]

**Level 4: the stage solver (Naphtali-Sandholm) and the two-liquid stage**
- Newton with a guarded step; restart attempt with `early`: gives up at iteration 4 when the residual has not fallen
  tenfold (`engine.js:689`); `patient`: gives up at PATIENCE = 12 without a thousandfold fall (`:173`)
- Jacobian by central differences per stage variable (l_i, v_i, T): two `props(j, w)` calls per variable
  (`engine.js:611-636`); `props` calls the adapter's `lnK(x, y, T, j)`, `hL(x, T, j)` and `hV(y, T)` (`:497-532`)
- The VLL adapter decides each stage's liquids by Michelsen's tangent-plane test and splits by successive
  substitution/Newton (`src/units/columns/two-liquids.js:1-30`, `splitOf` `:246-277`); it keeps one memo entry per
  stage (`memo`, `:230`; `split` `:239-244`), so only an exact repeat of the last (x, T) of that stage is free
- The tangent-plane test runs 2n trial starts (here 8), each successive substitution of up to 400 iterations with a
  gamma evaluation per iteration (`src/equilibrium/stability.js:72-82`)
- Every column must meet TOLERANCES = 1e-10 in every residual group (`engine.js:192`), whatever the recycle tolerance
- Cold path when no restart converges: bubble-point starts (Wang-Henke), continuation in the relative volatilities,
  Newton resumed to LONG_NEWTON = 100 (`engine.js:765-850`, `:180`)

**Measured per-call costs of SCDS15 alone on the build (feed S28) [run col15]**
- Cold, VLL, purity spec: 24.6 s, 13 column solves, 39 Newton iterations, 10.3 million calls of `sys.gammas` (the
  two-liquid tests; the VL path calls none). Cold, VL: 7.9 s, 13 solves, 36 iterations
- Restart, VLL, purity spec, feed changed in one component by 1e-5 / 1e-4 / 1e-3 / 1e-2 relative: 0.28 / 0.34 /
  1.0-2.9 / 5.4-7.0 s, 2 / 2 / 4 / 4-5 column solves
- Restart, VLL, purity spec, feed changed by 3 % / 10 %: 13.3-13.6 / 13.8-16.6 s, 7-9 column solves, 19-29 Newton
  iterations, 5.7-7.0 million gamma calls (most trial columns fell back to the bubble-point start)
- Fixed distillate (D = 399.68 kmol/h, no purity), VLL: cold 2.0 s (bubble-point start, 3 Newton iterations, 0.89
  million gamma calls); restart 2-4 iterations, 0.14-0.33 s for changes up to 1e-3; at 1 % the restart stalls ("the
  residual fell only from 0.001144 to 0.0009603 in 4 iterations") and the bubble-point start runs, 2.5-2.6 s.
  Fixed D, VL: cold 0.6 s; restarts 0.06-0.15 s; the same stall at 1 %

### Inferences
- The 115 calculations per block = 55 regular passes (1+1+7+7+12+14+13) + 60 = three finite-difference Jacobians of
  20 passes each (safeguard 4 fired once in each of the three longest solves). Not printed in the decision file; the
  arithmetic fits exactly.
- SCDS15 averaged 726/115 = 6.3 s per call. Measured restarts cost 0.2-1 s for small feed changes and 13-17 s for
  3-10 % changes, a cold call 25 s: so most of the 726 s is a minority of calls in which SCDS15's feed moved by
  percent-level amounts (Broyden steps; the proposal records jumps of up to 0.62 of a tear's flow, `flowsheet.js:622`)
  and its search fell back toward cold trial columns. Estimate: about 20-30 calls at 15-30 s each.
- Lower bound if SCDS15 never fell back (estimate): solve 2 shows a whole pass with restarted columns takes about 1 s;
  55 passes x 1-2 s + 60 FD passes x 0.5-1 s + one cold first pass (37 s) is about 2-4 minutes, against 15.
- Nominal product of the levels: 7 solves x 16.4 passes per solve (115/7) x 3 columns x (1-13 trial columns) x (2-40
  Newton iterations) x 18-35 stages x about 11 split/stability calls per stage per Newton iteration (next item).
- Per Newton iteration of SCDS15 (fixed D, restart, VLL) about 22,000 gamma calls and 65-70 ms against 23-27 ms with
  VL; the bubble-point start 2.0 s against 0.59 s: VLL costs about 2.7-3.4 times VL on a column that holds one liquid
  on every stage at this point (main output: `two_liquid_stages: []`).
- Split calls per stage per Jacobian (from the code): 2 x 4 liquid-flow perturbations change x; the first vapour
  perturbation needs the base (x, T) again, which the one-entry memo has just overwritten (one more test); the 7 other
  vapour perturbations hit the memo; 2 for T: about 11 tangent-plane tests or splits per stage per Newton iteration,
  plus N more in each line-search trial.

### Gaps
- No per-pass or per-call record of the build run was available locally (`run.timing` with per-pass slowest block and
  `jacobian_passes` would settle the 55 + 60 split and the count of SCDS15 fallbacks). A file
  `scratchpad/ds269.out.json` exists but was empty at reading time (a run possibly in progress elsewhere).
- Whether any design-spec evaluation used the retry from the document's start (`design-specs.js:413-421`) is not known
  from the decision file.

## 2. Tolerances at intermediate steps: is anything loosened?

### Takeaway
No. Every design-spec evaluation is a full recycle solve to the tear tolerance (1e-5 here), every column call in every
pass (including the 60 finite-difference passes) is solved to 1e-10 in every residual group, and SCDS15's purity to
1e-6 in logit (about 1e-10 absolute in mass fraction) every time. The 100x rule ties only the design-spec tolerance to
the recycle tolerance, and in this case it is applied to an absolute mass-fraction tolerance.

### Cited Findings
- Recycle: converged when the largest relative change of the tear flows (and T) in one pass is below
  `solver.tolerance` (`flowsheet.js:803-823`); 1e-5 in this case, default 1e-8 (`flowsheet.js:88`)
- Column: TOLERANCES material/energy/equilibrium/summation/specifications all 1e-10 (`engine.js:192`); no argument from
  the flowsheet lowers it; restarts are "accepted only when every group of residuals is within the column's tolerance,
  as a cold-started one" (proposal 0027, Engineering basis)
- Column design spec: SPEC_TOLERANCE = 1e-6 on the scaled residual, "for a purity x, about 1e-6 x (1 - x)"
  (`specifications.js:94-96`); SCDS15 reached 0.9998999999999888 for 0.9999 (error -1.1e-14) — [main output]
- Design spec: default tolerance max(1e-6, 100 x recycle tolerance); a given tolerance tighter than 100 x the recycle
  tolerance is used with a warning (`design-specs.js:261-271`, ratio `:49`); mass fraction is an absolute quantity
  (`absolute: true` in the output). Here: tolerance 1e-5 absolute on 4e-4 (2.5 % of the value), the warning fired
  ("tighter than 100 times the recycle tolerance ... loosen the tolerance to 0.001 or tighten solver.tolerance to
  1e-7"); reached 0.00040088 on main (residual 8.8e-7) and 0.00040020 on the build — [main output; build decision]
- Finite-difference passes of the recycle Jacobian perturb each tear flow by 1e-7 of the tear's flow
  (`flowsheet.js:653`, `:710-712`)
- Plant balance check on its own tolerance (balanceTolerance 1e-4) after the loop (`flowsheet.js:94-106`, `:904-916`);
  Lab's README records an earlier answer at a recycle tolerance of 3e-4 that "had not settled: the ethanol inventory was
  still rising" — [README.md, verdict section]

### Inferences
- The column tolerance is five orders of magnitude tighter than the recycle tolerance during the regular passes; with
  quadratic convergence that is roughly one extra Newton iteration out of 2-4 per restarted column (estimate), not the
  main cost. It must stay tight in the finite-difference passes: column noise of 1e-10 against a step of 1e-7 gives a
  derivative error of about 1e-3 relative; a column loosened to 1e-7 would make those 20-pass Jacobians noise.
- SCDS15's purity is pinned to about 1e-10 in mass fraction at every pass, while its feed changes by up to percent-level
  amounts between passes; one outer Newton step fewer per call would follow from a tolerance tied to the recycle's
  current change (estimate: one trial column of 2-9).
- The recycle tolerance itself should not be loosened in this case (see section 4: the ethanol inventory is nearly
  integrating; Lab's 3e-4 answer was wrong by 0.2 points of purity).
- Solve 2 (F1 + 0.25 kg/h) converged in one pass: the first pass's change was already below 1e-5. With a slow
  inventory mode a per-pass change below the tolerance does not bound the distance to the steady state (error about
  change / (1 - gain)); the design-spec answer here met its loose absolute tolerance, but the 1-pass solve's residual
  carries that bias (inference from `flowsheet.js:823` and the README's round 3).

### Gaps
- No measurement of how many Newton iterations of a restarted column are spent below, say, 1e-7.

## 3. SCDS15: what it is, why its purity search falls back to cold starts, and whether purity-in-MESH removes the outer loop

### Takeaway
SCDS15 (18 stages, total condenser, R = 2, 99.99 mass % water in the bottoms) needs "VLL" only because a second liquid
appears on its stage 1 at the low end of the design spec's range. Its purity is met by an outer loop of fixed-D trial
columns; a fixed-D column of a sharp split is ill-conditioned to feed changes (its restart stalls at a 1 % feed
change), so the trial columns fall back to bubble-point starts that each cost about 2 s with the two-liquid tests.
With the bottoms purity written among the MESH equations (the row CHEPTA already has for decanter columns), a
restarted SCDS15 converged in one column of 2-4 Newton iterations (0.14-0.31 s) for feed changes from 1e-5 to 10 %,
against 0.3-17 s for the outer loop, with the same distillate within about 1e-9 relative. From a cold bubble-point
start the MESH row did not converge for SCDS15 and fell back to the outer loop.

### Cited Findings
- Spec: see section 1. At F1 = 6,506 kg/h SCDS15 holds one liquid on every stage (main output `two_liquid_stages: []`)
- Why VLL: "With `phases: "VL"` for SCDS15 the same solve takes 96 s, but the design specification then stops at
  F1 = 6,503.5 kg/h, where a second liquid forms on SCDS15's stage 1: "VLL" is needed over Lab's range" — proposal 0027,
  section "What (a) does on Lab's plant"
- Why it falls back: "on some passes Newton from a nearby answer stalls on this column (the residual falls by less than
  1 % in 4 iterations), so trial columns of its purity search fall back to the cold start, which costs as much as
  today"; "59 % of SCDS15's time is the stability test of stages that hold one liquid, 47 % (self time) UNIQUAC's
  activity coefficients, 15 % pure-liquid enthalpies of water through IAPWS-IF97" — proposal 0027, same section
- Mechanism in the code: the restarted search's first column has `quick` false but `startEarly` true
  (`specifications.js:354`, `column.js:799`, `engine.js:738`), so when Newton from the last profile stops early it
  continues with the full cold path, continuation included (`engine.js:834`); later trial columns are `quick`
  (Newton early stop, then bubble-point start); if the restarted search fails, the whole cold search starts again from
  `estimateDistillate` (144.9 mol/s on main against the answer's 111 mol/s) (`specifications.js:263-272`, `:557`)
- Fixed-D sensitivity measured [run col15]: fixed D, restarts converge for feed changes up to 1e-3 (2-4 iterations)
  and stall at 1 % (residual 0.00114 -> 0.00096 in 4 iterations), both with VL and VLL; the purity search at 3-10 %
  feed changes needed 7-9 trial columns (13-17 s)
- Purity among MESH: built only for "a column with a decanter and one purity of its bottoms ... in place of the
  reboiler's energy balance", DWSIM's `Log(xc/spval)` row; "every other design specification (every column without a
  decanter, ...): the outer loop, unchanged" — `specifications.js:55-71`; gate `specifications.js:296`; engine refusal
  for other columns `engine.js:376` (`if (ds.length || !decanter || !hasReboiler) throw NOT_AVAILABLE`); the start of
  such a column replaces the purity by a distillate rate `startD` for the bubble-point start (`engine.js:745-749`)
- The decision for decanters: the ChemSep Book lists "the mole fraction of a given component in either the distillate
  or bottoms product stream" among the specification equations (section 13.2.4, p. 195); F9-F12 converged in 11-17
  iterations where the outer loop refused — `docs/decisions/2026-11-18-07-purity-in-mesh.md`
- Why the outer loop was chosen in general: a purity cannot be met by the continuation's column without separation, and
  the outer loop can say what the column reaches at most — `specifications.js:34-53` (ChemSep Book 13.5, p. 224)
- [run col15, MESH patch] (gate at `specifications.js:296` opened to a total condenser with one base spec, base spec
  kept beside the purity row; `!decanter` removed at `engine.js:376`): restarts for feed changes of 1e-5, 1e-4, 1e-3,
  1e-2, 3e-2, 1e-1 in ethanol or ester: 1 column, 2/2/2/3/3/4 Newton iterations, 0.14-0.31 s, 44-87 thousand gamma
  calls; D 399.89468214921 vs 399.8946821479453 (outer loop) at 1e-3, 406.22448604446 vs 406.22448596114 at 3 %, i.e.
  within about 2e-10 relative. Cold: "the purity among the MESH equations: not converged (5494 ms ...: Newton from the
  bubble-point start ... 10 iterations ... the residual stopped falling; continuation ... stopped at 0 %)", then the
  outer loop as before: 30.5 s in all against 24.6 s

### Inferences
- For SCDS15 the expensive part is not the outer Newton itself (its Jacobian is nearly free) but that each of its
  trial columns is a fixed-D column, which is the poorly conditioned way to pose a high-purity split; the purity row
  pins the composition front, so the profile from the last pass stays close and Newton converges in 2-4 iterations.
- Purity-in-MESH would remove the outer loop for restarted calls (all but the first in a run); the first, cold call
  would still need the outer loop (or a start from a converged fixed-D column), so the change is "MESH row first when a
  restart profile exists, outer loop otherwise or on failure". Estimate for this case: SCDS15 from 726 s to roughly
  115 x 0.2-0.3 s + one cold call = about 50-60 s (assuming the measured restarts are representative of the flowsheet
  passes, not shown).
- It also removes most of the two-liquid cost of SCDS15 indirectly: the 6 million gamma calls of a fallback search are
  bubble-point starts of trial columns, not Newton iterations.
- Answers: the same within the column's tolerances (measured to about 2e-10 in D); a path change. Extending the MESH row
  beyond decanter columns reverses the maintainer's scoping in 2026-11-18-07 and needs his decision (new algorithm path:
  AGENTS.md "Rules for code").

### Gaps
- The MESH-patch runs were on SCDS15 alone with one-component feed perturbations at fixed feed T; not tested inside the
  flowsheet, at F1 = 6,503.5 kg/h where stage 1 holds two liquids, nor with the existing test suite.
- Why the MESH row fails from the bubble-point start for SCDS15 (startD 30 % off, or the row itself) was not examined.

## 4. Is the case special?

### Takeaway
Yes. Against CHEPTA's own flowsheet suite (Cavett's four flash drums with three recycles; generated cases of two or
three drums and recycles), Lab's plant has five tears around three rigorous two-liquid columns, a reactor and an
extractor, one column with its own purity specification, and a design specification on top. Its ethanol balance is
nearly integrating: the excess ethanol fed is about 0.25 kmol/h while about 217 kmol/h circulates in S21 alone, which
slows the recycle and makes the design-spec target sensitive to 0.25 kg/h changes of the feed.

### Cited Findings
- CHEPTA's flowsheet suite: the Cavett problem, "16 components, four flash drums at fixed temperature and pressure,
  three recycle loops that share streams"; Broyden needs 37 iterations at 1e-8 (Wegstein 170, direct substitution
  222); generated cases with two or three drums and two or three recycles (G01-G09) — `docs/FLOWSHEET_TESTS.md:7-8`,
  `:51`, `:55-65`
- Lab's plant: 24 blocks, 28 streams, 5 tears, 3 rigorous VLL columns (8, 18, 35 stages), SCDS11 with two liquids on
  32 of 35 stages — [request.json; main output `blocks.SCDS11.state.two_liquid_stages`]
- Feeds: ethanol 6,511 kg/h, acetic acid 8,472 kg/h; reactor conversion 0.7703 on acetic acid — [request.json];
  ethanol in S21's guess 216.5 kmol/h — [request.json]
- "the purity is set by the plant's ethanol balance (excess ethanol must leave with the product); 5 kg/h less ethanol
  feed gives 99.50 %"; "6,503 kg/h fails after 7 min (column 15) and 6,500 kg/h after 56 min (column 11)" — [README.md]
- Main's earlier closed-plant runs: the loop "gained 0.24 kmol/h of ethanol and lost 0.42 of ester per pass for 200
  passes" — comment at `flowsheet.js:879-881`

### Inferences
- With molar masses 46.069 and 60.052 g/mol, the feeds are 141.33 kmol/h ethanol and 141.08 kmol/h acid: about 0.25
  kmol/h (11.5 kg/h) of excess ethanol, of which the product takes about 5 kg/h (0.04 % of 12,496 kg/h), against about
  10,000 kg/h of ethanol in S21: the ethanol inventory mode has a gain close to one per pass, which is why Broyden
  stalls (safeguard 4) and the 12-14-pass solves each needed a 20-pass Jacobian.
- The design spec's bracket ends (6,503.5 kg/h) at a phase boundary of SCDS15 (second liquid on stage 1), where
  restarts are hardest; solve 6 there was the longest (274 s).
- Tear choice: every cycle of the loop passes through S6 (KREA4 -> SCDS5), S10 (MIX7 -> EXTR8) or S24 (HTXR17 ->
  MIX13) (derived from the stream list), so three tears (12 variables) would cut each finite-difference Jacobian from 20
  to 12 passes; its effect on Broyden's convergence is not known.

### Gaps
- No comparison with textbook flowsheet examples outside the repository was made (no web sources consulted for this
  part); the suite comparison above is CHEPTA's own.

## 5. Candidate changes, in order of expected gain

### Takeaway
The largest gain is in SCDS15's specification path (purity among the MESH equations for restarted calls, and a cold
fallback that starts from the last D); then cheaper two-liquid tests at perturbed points; then the design
specification's bracketing and warm-start choice; tolerance loosening and Jacobian reuse are smaller and partly risky
here.

### Cited Findings
1. **Bottoms purity among the MESH equations for SCDS15-type columns (total condenser, R fixed), at least when a restart
   profile exists** — `specifications.js:296-322`, `engine.js:376`, start `engine.js:745-749`. Measured: one column,
   0.14-0.31 s per restarted call vs 0.3-17 s; same D within about 2e-10 relative [run col15, MESH patch]. Answer: same
   within tolerances; path change; needs the maintainer's decision (extends 2026-11-18-07). Estimated gain: most of
   SCDS15's 726 s.
2. **Cold fallback of a restarted search started from the last answer's D (not `estimateDistillate`), and the
   restarted search's first column made `quick`** — `specifications.js:263-272` (strips startAdjusted), `:354`
   (`quick: !!warm && anySolved` is false for the first column), `:557`; `engine.js:834` (continuation runs when not
   quick). Main's cold search started at 144.9 mol/s for an answer of 111 and took 7 outer iterations, 13 columns.
   Answer: same within tolerance; path change; proposal 0027 deliberately kept "the search of today" as the fallback.
   Estimated gain: large on fallback calls, redundant once (1) is in.
3. **Two-liquid tests at perturbed points (proposal 0027's (e2))** — `two-liquids.js:230-244` (one memo entry per
   stage), `:259` (tangent-plane test on every non-memo call), `engine.js:613-636` (two property calls per variable).
   Options: a second memo slot for the base point (saves one test per stage per Jacobian); reuse the base point's
   "stable" verdict for perturbed points when its tangent-plane minimum is well above zero (the test returns `tm`,
   `stability.js:118`, `{ stable, tm, trial }`). Measured: VLL 2.7-3.4 x VL per Newton iteration and per bubble-point start on SCDS15; the
   proposal's profile: 59 % of SCDS15's time in stability tests of one-liquid stages. Answer: unchanged if the margin
   rule is safe and the converged column is re-tested (the final check `third`, `two-liquids.js:382-390`, and the split
   at the base point stay).
4. **Design specification: secant/Brent from the first two points instead of doubling 1 %-of-range steps; warm-start
   from the nearest solved point, not the last** — `design-specs.js:484-517`, `:432`. The inferred sequence 6,511,
   6,511.25, 6,510.5, 6,509.5, 6,507.5, 6,503.5, then Brent at 6,506.23 (consistent with the bracket [6,503.5,
   6,507.5], h = 0.25 kg/h and 7 solves); solves 3-6 cost 619 of 894 s; Brent's point was warm-started from 6,503.5
   (2.7 kg/h away, at the phase boundary) rather than 6,507.5 (1.3 kg/h away). Answer: the final point moves within the
   tolerance; needs the column restarts kept per solve (they live in one Map, `flowsheet.js:421`).
5. **Column tolerance tied to the recycle's progress in regular passes, full 1e-10 in finite-difference passes and in
   the final pass** — `engine.js:192`, `specifications.js:96`, `flowsheet.js:706-729`. Estimated gain: about one Newton
   iteration of 2-4 per restarted column and up to one outer step of SCDS15. Answer: intermediate values change; the
   final answer within tolerance provided the last pass is tight. Risk: Broyden's secant updates see column noise.
6. **Fewer tear variables / cheaper recycle Jacobians** — `flowsheet.js:567` (20 variables), `:653` (STALL 8, FD 1e-7),
   `:840-853`. Case side: three tears {S6, S10, S24} (12 variables). Estimated gain: 60 passes -> 36, about tens of
   seconds once columns restart well. Answer: same within tear tolerance; convergence path unknown.
7. **Stage-Jacobian reuse inside a column Newton (chord/Shamanskii) or analytic vapour columns** — `engine.js:613-636`
   recomputes every stage's properties at every perturbation, also for vapour flows (the ideal vapour's K-values do not
   depend on y). Proposal 0027's profile: Newton iterations 17 % of the time. Lower gain.
8. **Looser recycle tolerance during bracketing** — not recommended for this case: the near-integrating ethanol mode
   makes a loose solve biased (README round 3; balance check `flowsheet.js:904-916`).

### Inferences
- Combining (1) and (3) attacks both halves of the measured cost: the number of cold trial columns and the price of
  each property call on a VLL stage. With (1) alone the remaining floor is set by the first cold pass (about 37 s) and
  roughly 115 x 1-2 s of restarted passes (estimate: 3-5 minutes in all).
- (2) and (1) overlap: with (1), the outer loop runs only on the first call or on failure.

### Gaps
- None of these changes was run in the flowsheet; gains are estimates from single-column runs and the recorded totals.
- The share of SCDS11 (108 s) and SCDS5 (48 s) that (3) would save was not measured.
