# How process simulators solve rigorous columns inside recycle and design-spec loops

Scope note. Primary sources actually opened in this session: the Aspen Plus 10.1 User Guide (volume 2, convergence,
sensitivity and optimization chapters; an open copy hosted on a University of Maryland course page, file named
"AspenPlusV10UserGuide2.pdf" but the page footers say "Version 10.1-0", i.e. the 1999 release, not V10 of 2017), the
DWSIM source code (github.com/DanWBR/dwsim, commit 1abf72d1, 2026-07-17), Crossref records of the inexact-Newton papers,
and OpenAlex records. Not opened (403, HTML instead of PDF, or no open copy found): current Aspen Plus/HYSYS online help,
AspenTech knowledge base, the Aspen Plus Input Language Guide, the ChemSep Book, Seider/Seader/Lewin, Biegler/Grossmann/
Westerberg, Westerberg et al. 1979, the 1980 Jirapongphan MIT thesis (only its catalogue page), and the Seidel et al.
2020 paper (only its abstract). Where a claim rests on a forum, a slide deck or a search snippet, it says so.

## 1. How columns are initialised on each pass of a recycle loop or each design-spec evaluation

### Takeaway
In sequential-modular simulators the default is a warm start: each block, columns included, starts its next
calculation from its own last result, not from scratch. Aspen Plus documents this as the "Use Results from Previous
Convergence Pass" block option and as the default carry-over between sensitivity rows. DWSIM keeps the last solution
but only feeds it back as the next initial estimate when the user turns on `AutoUpdateInitialEstimates` (default
False), and falls back to freshly generated estimates when a warm-started solve fails.

### Cited Findings
- Aspen Plus 10.1: in the optimization troubleshooting list, one remedy is to "Disable the Use Results from Previous
  Convergence Pass option on the BlockOptions SimulationOptions sheet for blocks within the optimization convergence
  loop. You can also specify this globally on the Setup SimulationOptions Calculations sheet." This implies the option
  exists per block and globally and is on by default (it must be disabled), i.e. blocks restart from the previous
  pass. (User Guide p. 22-11/22-12) — [Aspen Plus 10.1 User Guide vol. 2, open course copy](https://user.eng.umd.edu/~nsw/chbe446/AspenPlusV10UserGuide2.pdf)
- Aspen Plus 10.1, sensitivity: "By default, Aspen Plus begins the calculations for a new row using the results of the
  previous row. If blocks or recycle loops fail to converge for some rows, you can specify that the calculations are to
  be reinitialized for each row." Options "Blocks to be Reinitialized" (Include Specified Blocks / Reinitialize All
  Blocks) and "Streams To Be Reinitialized". (p. 20-5, "Reinitializing Blocks and Streams") — [Aspen Plus 10.1 User Guide](https://user.eng.umd.edu/~nsw/chbe446/AspenPlusV10UserGuide2.pdf)
- Aspen Plus 10.1, case study: the Case Study Setup Specifications sheet can "Reset convergence and unit operation
  restart flags for blocks" and "Restore initial values for tear streams and feed streams" — i.e. block restart flags
  are the mechanism that carries a block's last solution forward. — [Aspen Plus 10.1 User Guide](https://user.eng.umd.edu/~nsw/chbe446/AspenPlusV10UserGuide2.pdf)
- Aspen Plus 10.1 general strategy: "Aspen Plus gives tear streams a default value of zero, which can cause problems";
  give good initial guesses, and among remedies "Reinitialize the simulation" and converge with Wegstein bounds 0
  (direct substitution) to look for component build-up. — [Aspen Plus 10.1 User Guide](https://user.eng.umd.edu/~nsw/chbe446/AspenPlusV10UserGuide2.pdf)
- DWSIM `RigorousColumn.vb`: properties `AutoUpdateInitialEstimates` (backing field `_autoupdie As Boolean = False`),
  `UseTemperatureEstimates`, `UseVaporFlowEstimates`, `UseLiquidFlowEstimates`, `UseCompositionEstimates` (all default
  False) and `InitialEstimates`. After a solve, the code comment "'if enabled, auto update initial estimates" precedes
  `If Me.AutoUpdateInitialEstimates Then` ... which copies the converged stage temperatures, vapour and liquid flows,
  and liquid and vapour compositions (`Tf`, `Vf`, `Lf`, `xf`, `yf`) and the product rates into `InitialEstimates` and
  into a private `LastSolution`; if the option is off, only `LastSolution` is stored (exposed by `GetLastSolution()`).
  The estimates are used on the next solve only where the matching `Use...Estimates` flag is on and the estimates
  validate (`InitialEstimates.ValidateTemperatures()` etc.). — [DWSIM source, RigorousColumn.vb](https://github.com/DanWBR/dwsim/blob/windows/DWSIM.UnitOperations/UnitOperations/RigorousColumn.vb)
- DWSIM fallback: when the warm-started solve throws, DWSIM shows "Column Solver did not converge. Will reset some
  parameters and try again shortly..." (Wang-Henke variants) or "the column did not converge. DWSIM will try again with a
  different solver configuration..." (Naphtali-Sandholm), and re-solves with `GetSolverInputData(True)`, whose argument is
  `ignoreuserestimates`, under the comment "'try to solve with auto-generated initial estimates." DWSIM also accepts
  pluggable `InitialEstimatesProvider`s (`ExternalInitialEstimatesProviders`, and "Internal 2 (Experimental)"). — [DWSIM source, RigorousColumn.vb](https://github.com/DanWBR/dwsim/blob/windows/DWSIM.UnitOperations/UnitOperations/RigorousColumn.vb)
- DWSIM column defaults: `_ilooptolerance As Double = 0.00001` and `_elooptolerance As Double = 0.00001`
  (`InternalLoopTolerance`, `ExternalLoopTolerance`). — [DWSIM source, RigorousColumn.vb](https://github.com/DanWBR/dwsim/blob/windows/DWSIM.UnitOperations/UnitOperations/RigorousColumn.vb)

### Inferences
- The established practice is "warm start from the block's own last converged profile, cold restart only as a
  fallback". In Aspen Plus the warm start is default; in DWSIM it is opt-in per column (off by default), so a DWSIM
  column inside a recycle re-initialises from its internal estimator on every pass unless the user enables it.
- A warm start is what makes repeated rigorous column solves cheap near convergence of the outer loop: when the feed
  changes little between tear iterations, an inside-out or Newton column solver started from the previous profile
  needs few iterations. No source opened here quantifies this.
- Aspen's own advice to disable the warm start inside optimization loops points to its known drawback: the column's
  result then depends on the path (previous pass), which makes finite-difference derivatives noisy.

### Gaps
- Current (V12-V14) Aspen Plus help text for "Use results from previous convergence pass" and RadFrac's
  initialization options could not be opened; the option name above is from the 10.1 guide.
- HYSYS column behaviour inside a recycle (whether it keeps its last profile, "Reset" vs "Run") was not found in an
  open primary source.
- ChemSep/COCO (COFE) column initialization in loops: the ChemSep Book and COCO documentation were not reached (the
  COCO "Flowsheeting with COCO and ChemSep" notes, downloaded, only mention "Breaking recycles by automatic tearing").

## 2. Are inner blocks converged fully at intermediate outer iterations, or loosely ("inexact", tolerance tightening)?

### Takeaway
Documented sequential-modular practice is the opposite of loose-then-tight: every pass converges each inner block to
its own fixed tolerance, and the documented rule is that inner loops must be tighter than outer loops (Aspen: inner
"Highest", outer "Final"; optimization tolerance = square root of block tolerance). The only built-in staged-tolerance
feature found is Aspen's "Tear Tolerance" / "Tear Tolerance Ratio" for converging tears first before adding design
specs to a simultaneous Broyden/Newton block. The inexact-Newton theory (Dembo-Eisenstat-Steihaug 1982;
Eisenstat-Walker 1996) justifies loose inner solves, but no simulator was found that applies an adaptive forcing-term
schedule to columns or tears.

### Cited Findings
- Aspen Plus 10.1, nesting accuracy: "For some flowsheets it is necessary to adjust tolerances so the inner loops are
  calculated more accurately than outer loops; otherwise the outer loops would be overwhelmed with errors from inner
  loops." Example table: HEATER, PSPEC "Final"; $OLVER01, COOLER "Intermediate (higher)"; TOPCOL, BOTCOL "Highest".
  "If the Error/Tolerance for PSPEC seems to go down to 10 quickly and stay there, you should tighten tolerances for all
  the blocks inside the PSPEC loop or loosen the tolerance for PSPEC." "It is particularly important to ensure that any
  nested design specifications have sufficiently tight tolerances, since these tolerances are specified by the user."
  (p. 17-21/17-22) — [Aspen Plus 10.1 User Guide](https://user.eng.umd.edu/~nsw/chbe446/AspenPlusV10UserGuide2.pdf)
- Aspen Plus 10.1 troubleshooting table: symptom "Err/Tol down to a threshold level, but no further"; cause "Nested
  loops, and the convergence tolerance of the inner loops is too loose"; remedies "Set a tighter tolerance for the
  blocks and convergence blocks in the inner loop ... Block tolerance can be changed globally on the Setup
  SimulationOptions Flash Convergence sheet or locally on the block's Flash Options sheet", "Relax the tolerance for the
  outside loop", or "Converge the inside and outside loops simultaneously, using the Broyden or Newton method." — [Aspen Plus 10.1 User Guide](https://user.eng.umd.edu/~nsw/chbe446/AspenPlusV10UserGuide2.pdf)
- Aspen Plus 10.1, optimization: "Tighten tolerances of unit operation and convergence blocks within the optimization
  convergence loop. The optimization tolerance should be equal to the square root of the block tolerances. For example,
  if the optimization tolerance is 10-3, then the block tolerances should be 10-6." "The step size should be equal to
  the square root of the inner tolerances." (p. 22-11) — [Aspen Plus 10.1 User Guide](https://user.eng.umd.edu/~nsw/chbe446/AspenPlusV10UserGuide2.pdf)
- Aspen Plus 10.1, tear test: a tear converges when −tol ≤ (X calculated − X assumed)/X assumed ≤ tol for total mole
  flow, all component mole flows, pressure and enthalpy; "Tolerance" default 0.001; "Trace Threshold" default
  Tolerance/100; "Trace Option" Cutoff (skip the test for trace components) or Gradual ("adds a 100*Trace threshold
  term to the denominator. This setting gradually relaxes the convergence test for trace components"). — [Aspen Plus 10.1 User Guide](https://user.eng.umd.edu/~nsw/chbe446/AspenPlusV10UserGuide2.pdf)
- Aspen Plus 10.1, Broyden and Newton "Advanced Parameters": "Tear Tolerance. Used if initializing tears by converging
  tears (to specified tolerance) before design specifications are included"; "Tear Tolerance Ratio. Used if
  initializing tears by converging tears (to a tolerance relative to the tear tolerance) before design specifications
  are included"; "Maximum Iterations ... Maximum number of flowsheet iterations to solve tears before design
  specifications are included". Text: "When converging both tear streams and design specifications, you can specify
  that tear streams be converged or partially converged first. The simultaneous convergence of both tear streams and
  design specifications then follows." Troubleshooting: if Broyden/Newton fails, "solve only tear streams first by
  specifying Tear Tolerance or Tear Tolerance Ratio." No default value is printed for these two fields. — [Aspen Plus 10.1 User Guide](https://user.eng.umd.edu/~nsw/chbe446/AspenPlusV10UserGuide2.pdf)
- Secondary (search snippet of an AspenTech RadFrac training deck from about 2002, on Scribd; not opened): "the RadFrac
  tolerance should be one or two orders of magnitude tighter than the tear tolerance, since errors inside RadFrac can
  impede tear convergence"; another snippet says a default block tolerance of 1e-4, tightened to 1e-6, often improves
  tear convergence. Unverified. — [Scribd, "Customizing RADFRAC convergence"](https://www.scribd.com/document/38111991/Customizing-RADFRAC-convergence)
- HYSYS Recycle (forum, not primary): the Recycle's tolerance is a "sensitivity" multiplier times the internal
  tolerance; a CheResources thread gives internal tolerances 0.01 (temperature), 0.001 (flow, relative), 1.00
  (enthalpy), 0.0001 (composition) and a default multiplier of 10 (e.g. 0.01*10 = 0.1 for temperature); "the smaller the
  multiplier, the tighter the convergence tolerance". A course handout snippet gives different default sensitivities
  (1 for enthalpy and composition, 10 for pressure). Conflicting, unverified. — [CheResources forum thread 9203](https://www.cheresources.com/invision/topic/9203-hysys-recycle-convergence-issues); [Scribd lecture "Simulation of Recycle Streams"](https://www.scribd.com/doc/133120786/Lecture-4-Simulation-of-Recycle-Streams)
- Theory: Dembo, R.S., Eisenstat, S.C., Steihaug, T., "Inexact Newton Methods", SIAM J. Numer. Anal. 19(2), 400-408
  (1982), doi:10.1137/0719025 (Crossref record checked; full text not opened, paywalled). — [Crossref / DOI](https://doi.org/10.1137/0719025)
- Theory: Eisenstat, S.C., Walker, H.F., "Choosing the Forcing Terms in an Inexact Newton Method", SIAM J. Sci.
  Comput. 17(1), 16-32 (1996), doi:10.1137/0917003. A search summary states it gives forcing-term choices, analyzes their
  local convergence, and that "the choice of the forcing terms is critical to the efficiency of the method and can
  affect robustness". — [Crossref / DOI](https://doi.org/10.1137/0917003)
- Theory applied elsewhere (reservoir simulation, open arXiv): "a very small forcing term may lead to oversolving the
  Newton equation"; adaptive forcing terms "reduce the total linear iterations while only resulting in few extra Newton
  iterations" (search summary of the paper). — [Inexact Newton Method for General Purpose Reservoir Simulation, arXiv:1912.06568](https://arxiv.org/pdf/1912.06568)
- Related theory (titles only, contents not read): Cătinaş, "The inexact, inexact perturbed, and quasi-Newton methods
  are equivalent models", Math. Comp. 74 (2005), doi:10.1090/s0025-5718-04-01646-1 ([open AMS PDF](https://www.ams.org/mcom/2005-74-249/S0025-5718-04-01646-1/S0025-5718-04-01646-1.pdf));
  van den Eshof, Sleijpen, van Gijzen, "Relaxation strategies for nested Krylov methods", J. Comput. Appl. Math.
  177(2), 347-365 (2005), doi:10.1016/j.cam.2004.09.024 ([open Elsevier PDF](https://www.sciencedirect.com/science/article/pii/S0377042704004303/pdf)).

### Inferences
- In a sequential-modular tear iteration the column's convergence error enters the tear map G(X) as a perturbation; an
  error of size e in G limits the attainable tear residual to about e (Aspen's "Err/Tol down to a threshold level, but
  no further"). This is why vendors insist on inner tolerance ≪ outer tolerance at every pass, and why a loose inner
  solve early on is admissible in principle only if it is tightened in proportion to the outer residual (the
  forcing-term idea: inner tolerance η_k · ||outer residual||).
- A loose-then-tight schedule for columns inside tears would be CHEPTA's own design choice built on inexact-Newton
  theory, not a reproduction of documented simulator practice. If adopted, the final pass(es) must be done at full
  column tolerance so the reported answer is the same as a fully converged one; the Aspen "square-root" rule
  (outer 1e-3 ↔ inner 1e-6) gives a published ratio to keep at the final pass.
- Aspen's "Tear Tolerance Ratio" is a staged-accuracy feature of a different kind: it loosely converges the tears
  before the design specs are added to a simultaneous block (a two-phase homotopy in what is converged), not a loosening
  of the column.

### Gaps
- No primary source found for any simulator applying adaptive (forcing-term) inner tolerances to columns or tears.
  Searches on OpenAlex for "inexact Newton sequential modular flowsheet" returned nothing relevant.
- Default value of Aspen's "Tear Tolerance Ratio" and current RadFrac default tolerance not found in an open source.
- HYSYS recycle sensitivity defaults: sources disagree; no AspenTech primary text opened.
- DWSIM recycle tolerances and whether its solver loosens column tolerance on early passes: only the column defaults
  (1e-5 inner and outer) were read; no adaptive mechanism was seen in the lines read.

## 3. How nested loops (design spec around recycle around column with its own spec) are ordered or merged

### Takeaway
Aspen Plus nests design specs inside tear loops by default ("Design Spec Nesting" = Inside), with Wegstein for tears
and Secant for a single spec, and offers "Outside" or simultaneous convergence (one Broyden/Newton block for tears and
specs). Column purity specs are not flowsheet loops at all: the column solves them internally (RadFrac "Design Specs"
and DWSIM column specs). DWSIM offers "GlobalBroyden" to converge all recycles together and a simultaneous adjust
solver.

### Cited Findings
- Aspen Plus 10.1, Default Methods sheet: Tears "Wegstein" (others Direct, Broyden, Newton); Single Design Spec
  "Secant" (others Broyden, Newton); Multiple Design Specs "Broyden" (other Newton); Tears & Design Specs "Broyden"
  (other Newton); Optimization "SQP". — [Aspen Plus 10.1 User Guide](https://user.eng.umd.edu/~nsw/chbe446/AspenPlusV10UserGuide2.pdf)
- Aspen Plus 10.1, Sequencing sheet: "Design Spec Nesting", default "Inside": "Whether design specifications should be
  nested inside tear stream loops, outside tear stream loops, or converged simultaneously with tear streams"; "User
  Nesting", default "Outside", for user-defined convergence blocks, with precedence over Design Spec Nesting; "When the
  tear of an outer loop is recalculated in an inner loop, the actual sequence generated may not strictly follow the
  loop-order preference". Inside generates "one tear convergence block for all tear streams and tear variables, and ...
  an individual design specification convergence block for each design specification." — [Aspen Plus 10.1 User Guide](https://user.eng.umd.edu/~nsw/chbe446/AspenPlusV10UserGuide2.pdf)
- Aspen Plus 10.1, worked example (two columns TOPCOL/BOTCOL with an inter-column reflux recycle and a spec PSPEC): the
  default inside nesting failed; "The inter-reflux between the columns should be converged before evaluation of the
  design specification. The design specification should be nested outside the column recycle loop", obtained with
  "Design Spec Nesting as Outside" or by listing PSPEC on the ConvOrder sheet; resulting sequence HEATER, PSPEC, |
  $OLVER01 TOPCOL BOTCOL, | (RETURN $OLVER01, | COOLER, (RETURN PSPEC). — [Aspen Plus 10.1 User Guide](https://user.eng.umd.edu/~nsw/chbe446/AspenPlusV10UserGuide2.pdf)
- Aspen Plus 10.1, Broyden: "useful for multiple tear streams and/or design specifications, tear variables that are
  highly interdependent, or recycle loops and design specifications so interrelated that nesting is impractical."
  Defaults: Maximum Flowsheet Evaluations 30, X Tolerance 0.001, Wait 2 (direct substitution iterations before the first
  acceleration). Newton: "modified Newton ... Derivatives are calculated only when the rate of convergence is not
  satisfactory"; Maximum Newton Iterations 30, Maximum Flowsheet Evaluations 9999, Wait 2, X Tolerance 0.0001, Reduction
  Factor 0.2 (Jacobian reused while it reduces the error each iteration by that factor); "Use NEWTON for tear streams
  only when the number of components is small". Wegstein bounds: Lower Bound −5, Upper Bound 0; "usually the quickest
  and most reliable". Secant "is the default method for design specification convergence". — [Aspen Plus 10.1 User Guide](https://user.eng.umd.edu/~nsw/chbe446/AspenPlusV10UserGuide2.pdf)
- Aspen Plus 10.1 diagnostics: control-panel lines such as "> Loop CV Method: WEGSTEIN Iteration 9 ... 4 vars not
  converged, Max Err/Tol 0.18603E+02"; ">" outside loop, ">>" nested one deep; "Convergence is achieved when the value of
  Max Err/Tol becomes less than 1.0." — [Aspen Plus 10.1 User Guide](https://user.eng.umd.edu/~nsw/chbe446/AspenPlusV10UserGuide2.pdf)
- Secondary (slide deck snippet, not opened): "for multiple recycle loops, use 'nested' instead of 'simultaneously' with
  more than one convergence block defined". — [Scribd presentation "Recycle1"](https://www.scribd.com/presentation/379039943/Recycle1-pptx)
- DWSIM `FlowsheetSolver.vb`: recycles with `AccelerationMethod = AccelMethod.GlobalBroyden` are updated together
  ("'update variables of all recycles set to global broyden.", call `MathEx.Broyden.broydn(...)`); the simultaneous
  adjust solver collects each `adj.Tolerance` and throws "SADJMaxIterationsReached" at 25 iterations (`If ic >= 25`).
  — [DWSIM source, FlowsheetSolver.vb](https://github.com/DanWBR/dwsim/blob/windows/DWSIM.FlowsheetSolver/FlowsheetSolver.vb)

### Inferences
- Vendor default for "spec around recycle around column": column specs inside the column solver; tear loop next;
  flowsheet design spec innermost (Aspen default Inside) unless the spec depends on a converged recycle, in which case
  Outside. Each outer evaluation therefore re-converges the whole inner loop, and with it the columns, many times. The
  documented way to avoid nested re-convergence is to merge tears and specs into one Broyden/Newton block (one
  flowsheet pass per iteration, every column solved once per pass, warm-started).
- Putting a column's purity spec inside the column (as RadFrac and DWSIM do) is already the standard "merge" of the
  innermost loop; a flowsheet-level adjust around a column's reflux is the pattern vendors steer away from.

### Gaps
- Westerberg, Hutchison, Motard, Winter, "Process Flowsheeting" (1979) and Biegler/Grossmann/Westerberg (1997) chapters
  on loop ordering were not available in open copies in this session.

## 4. Simultaneous-modular / equation-oriented approaches, local column models, and reported speed-ups

### Takeaway
The way large simulators avoid re-solving a rigorous column at every outer pass is the simultaneous-modular idea
(Boston, Britt, Evans and students at MIT around 1980): converge the flowsheet on simplified (linear or reduced) unit
models fitted to the rigorous blocks, and re-run the rigorous blocks only to update those models. Equation-oriented
solving goes further (all MESH equations in one Newton system). Open primary documents with numbers were not reached
in this session, so no speed-up figure can be quoted from a source opened here.

### Cited Findings
- Jirapongphan, S., "Simultaneous modular convergence concept in process flowsheet optimization", Sc.D. thesis, MIT
  Dept. of Chemical Engineering, 1980; advisors Lawrence B. Evans, Joseph F. Boston, Herbert I. Britt. Open in MIT
  DSpace (13 MB scan; abstract not on the record page; not read). — [MIT DSpace hdl 1721.1/99552](https://dspace.mit.edu/handle/1721.1/99552)
- Companion MIT thesis, "Successive Quadratic Programming in sequential modular process flowsheet simulation and
  optimization" (1985), open in MIT DSpace (not read). — [MIT DSpace hdl 1721.1/99554](http://hdl.handle.net/1721.1/99554)
- Open review-level statement (search summary of a patent, "Plant simulation and optimization software apparatus and
  method using dual execution models", US 5,666,297; full text 403 here): "some equipment models may be rigorous, some may
  be simplified models", and "the simultaneous approach is significantly faster when a flowsheet has several
  specifications or nested recycle loops". Assignee and numbers not verified. — [USPTO PDF 5666297](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/5666297)
- Seidel, Hoffmann, Bortz, Scherrer, Burger, Asprion, Küfer, Hasse, "A novel approach for infeasible path optimization
  of distillation-based flowsheets", Chem. Eng. Sci. X (2020), doi:10.1016/j.cesx.2020.100063, CC BY: simulation and
  optimization of distillation flowsheets with recycles are solved together, columns "calculated from stage-to-stage
  using fixed-point iterations", and "an algorithm is presented that determines a possible calculation sequence of
  units within one iteration of the optimization algorithm" (abstract, via OpenAlex; body not read). — [DOI](https://doi.org/10.1016/j.cesx.2020.100063)
- "Between EO and SM" global optimization: Bongartz and Mitsos (authors checked on OpenAlex), "Deterministic global flowsheet
  optimization: Between equation-oriented and sequential-modular methods", AIChE J. (2019), doi:10.1002/aic.16507, open
  copy at KU Leuven (title and record only; not read). — [Lirias open copy](https://lirias.kuleuven.be/retrieve/985e32d4-a140-43ef-afd0-2593798e7e87)
- Embedding EO unit models in a sequential-modular simulator (TU Delft, 2005; record only). — [TU Delft repository](http://resolver.tudelft.nl/uuid:cf92b1af-a8bf-4424-aab5-9c06772b2474)
- Surrogate columns in flowsheet optimization (recent, open): "Reusable Surrogate Models for Distillation Columns"
  (arXiv 2509.06638) replaces the MESH equations by neural-network surrogates and solves the flowsheet balances
  simultaneously (search summary; not read). — [arXiv:2509.06638](https://arxiv.org/pdf/2509.06638)

### Inferences
- The simultaneous-modular pattern relevant to CHEPTA: after one rigorous, warm-started column solve, a linear model
  of the column outlet (product flows and enthalpies) in its inlets and specs, obtained by perturbation or from the
  column Newton Jacobian, can drive the tear/design-spec Newton steps; the rigorous column is re-run only to correct the
  linear model at the new point. This trades many rigorous solves for a few rigorous solves plus cheap linear-model
  iterations. This is a description of the method's idea, not a quoted result.
- Aspen's Newton option already reuses its Jacobian while each step reduces the error by the "Reduction Factor" (0.2),
  which is the same economy at the tear level.

### Gaps
- No open source opened in this session gives counts of column solves for a converged recycle + design spec, or
  measured time savings of warm starts, loose inner tolerances, or simultaneous-modular schemes. The MIT theses
  (open scans) are the most likely open sources of such numbers; Kisala, Trevino-Lozano, Boston, Britt and Evans (Comput.
  Chem. Eng., 1987) and Biegler and Hughes (1980s) were not found open.
- Aspen Plus EO (equation-oriented) mode documentation (e.g. the UAlberta-hosted "Aspen Plus 2004.1 Getting Started EO
  Modeling") was found in search but not opened.
- Seider/Seader/Lewin and Biegler/Grossmann/Westerberg convergence chapters: no open copy found.
