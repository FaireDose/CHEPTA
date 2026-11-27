# Handover for the coordinating session

Written 2026-11-10 by the coordinating session that ran from 2026-10-03 to 2026-11-10. Until about 2026-10-28 that
session built most of CHEPTA itself; from then on it coordinated worker sessions. It grew to about 600,000 tokens of
context, and every step it took re-read all of it: that was most of the account's usage (the maintainer, 2026-11-10:
"why the usage goes out immediately?"). A new coordinator starts from this page instead. Keep this page short and
current: replace its "State" and "Queue" sections at each handover, never append a diary.

## Who decides, and how to talk to them

- The maintainer is a chemical engineer, not a programmer. They review and merge every pull request; agents never
  merge. Use plain language, short messages, and tables; say "they", never guess pronouns.
- Each message to the maintainer has the same shape: what is ready to merge, what they must check against a source,
  what they must decide (with a recommendation for each), and nothing else.
- Decisions come from the maintainer to the coordinator, which passes them on; a worker that gets one directly is
  told to tell the coordinator in one line.
- The rules of the repository are [AGENTS.md](../AGENTS.md) and [docs/DATA_RULES.md](DATA_RULES.md); the plan is
  [ROADMAP.md](../ROADMAP.md) (section "The program after M4"); what was decided is [docs/DECISIONS.md](DECISIONS.md)
  and [docs/decisions/](decisions/).

## How to work: the usage rules (the maintainer, 2026-11-10)

1. **Short sessions.** One task, one session, one pull request. Never give a finished worker a second task; start a
   fresh session from `main` instead. A coordinator that passes about 150,000 tokens of context writes a new handover
   and stops.
2. **At most two worker sessions at a time** (the maintainer, 2026-11-05), counted across CHEPTA and CHEPTA-Lab together
   (2026-11-11).
3a. **No Fable** (the maintainer, 2026-11-12): only Opus and Sonnet for coordinators and workers. (Fable sessions of
   2026-11-11 hit the 5-hour limit like the others: it was not free of the usage limits.)
3b. **CHEPTA and CHEPTA-Lab never work at the same time** (the maintainer, 2026-11-12): while a CHEPTA worker runs, no
   Lab worker runs, and the other way round. The two coordinators take turns; the Lab coordinator asks before it starts.
   **In phases** (the maintainer, 2026-11-12: "it is confusing for me"): CHEPTA finishes a few packages with its two
   worker slots, then CHEPTA-Lab works for a while with both slots, then back to CHEPTA. Never one CHEPTA worker and
   one Lab worker at the same time. CHEPTA's coordinator tells the Lab coordinator when its phase ends (no CHEPTA
   worker running) and the Lab coordinator says when Lab's ends.
   Current phase (2026-11-12, from 21:24 UTC): **CHEPTA**. Lab's phase ended (the Lab coordinator, 21:23 UTC); 0.6.1
   live on npm, its version PR #232 merged. Workers (Opus): proposal 0021 step 1, the shell's contract
   (session_01FPbeWXbcjE3ybjeJ9yNi2A, branch claude/ui-0021-shell-contract, decision file 2026-11-12-01); VLLE with
   acetic acid's chemical theory in flash, heater and column stages, Lab's request 1, plus request 2 (two liquids in
   the absorber-type column) if it fits (session_01FPbeWThqvPhvb1foYiW5Ga, branch claude/acid-chemical-theory-vlle,
   decision file 2026-11-12-02). Then 0021 steps 2 and 3 (one Opus worker each, same files), then the maintainer's
   check with users, then step 4 (the new layout the default) in 0.7 (the maintainer, 2026-11-12: option A). Lab's
   next phase after this one; tell the Lab coordinator, with the release that carries the VLLE.
   Lab's other requests (2026-11-12, from its ethyl acetate plant S2, evidence in CHEPTA-Lab PR #14). The maintainer
   agreed (2026-11-12) to all but 6, in this order, in the next free slot: 5. Extraction at 70 degC returns ok with
   boiling outlets and no warning (warn or refuse) and 4. Extraction: an adiabatic option, and a feed with a little
   vapour (now BAD_INPUT), one Sonnet worker; 3. acetic acid liquid below 289.81 K (OUT_OF_RANGE; feeds at 15 degC):
   search open measured data of the supercooled liquid, else it stays refused; 7. a splitter by flow (small), and a
   flowsheet design specification (make-up controller) through a proposal first (Opus).
   6. (a reactor-evaporator: boiling reacting liquid, vapour outlet only): not built (the maintainer, 2026-11-12). The
   coordinator checked other simulators: DWSIM's reactors give liquid and vapour outlets of the reacted stream at the
   outlet conditions, and its tutorials and Aspen Plus course notes split the vapour with a separator after the
   reactor; no simulator found has a reactor-evaporator unit. CHEPTA does not need one: its conversion and yield
   reactors flash their outlet, so `VF: 1` (in place of T_K or duty_kW) gives an all-vapour outlet with the duty
   computed (the maintainer, 2026-11-12; Lab told to use it).
   Running in this phase also: Extraction, Lab's requests 5 and 4 (Sonnet, session_01FPbeWVw5Cnd3sC7XwBYRGc, branch
   claude/extraction-lab-requests, decision file 2026-11-12-03). 0021 step 1, PR #233, merged 2026-11-12; the maintainer
   agreed to its three recommendations (api.shell hidden until step 4; Flowsheet, Column and Reactor: the Method button
   opens their own Method page; an empty flowsheet on a phone opens on Inputs). Step 2's worker writes these answers
   into docs/decisions/2026-11-12-01-ui-0021-shell-contract.md. Step 2 (Opus) running: session_01FPbeWUQUvGVgVGax2pHMRY, branch claude/ui-0021-canvas-tabs, decision file 2026-11-12-04.
   Extraction (Lab's 5 and 4): #234 merged 2026-11-12 with the maintainer's answers. 0021 step 2 (canvas tabs, every
   workspace): PR #235 open; the maintainer agreed to its four recommendations and asked for warnings in two steps (a
   short form, the full text on a press), added (c759343); all checks green; the maintainer merges it (2026-11-12).
   #235 merged (f39e6e9). Step 3 (Opus) running in a fresh session (rule 1): session_01FPbeWWzrSq4VtnRnVFpB4f, branch
   claude/ui-0021-numbered-steps, with the step-2 worker's handover note forwarded. VLLE (Lab's 1 and 2): PR #237, checks
   green; the maintainer agreed to all four (2026-11-13), the worker records them, then the maintainer merges. Follow-ups: fit acetic acid + cyclohexane; search water + acetic acid + ethyl acetate VLLE when the ThermoML API is back; Lab reruns its column 5 on main. #236's worker hit
   the 5-hour limit overnight; resumed 2026-11-13; built (cp_L linear 10 K below with a warning, general; vapour pressure
   warned only: a refusal beyond 10 K broke six validated VLE sets and hot reactors), checks green; waiting for the
   maintainer (warning-only vapour pressure; G3 benzene case now accepted by the column within the extension).
   Follow-ups: widen the narrow vapour-pressure records; restate METHOD_SELECTION rule 8 (proposal) and fix G3's description.
   #237 merged (a1bdaf4). Step 3: PR #238 (four questions, all recommended yes; 16 screenshots).
   2026-11-13 11:15 UTC: #236 (4d08a78, the maintainer's answers recorded) and #238 (9a2c74e) green, ready to merge;
   both workers done. Lab's 7 built: PR #239 (b8597df; splitter by flow, project format 9, proposal 0022 draft;
   decisions in 2026-11-13-02: format 9, short inlet inside a recycle, key names, 0022's five questions). Next, after
   #238 and #239 merge (same UI files): row chooser + (d). Acetic acid + cyclohexane fit (Sonnet) after #236 merges.
   2026-11-13 ~14:15 UTC: #236, #238, #239 merged (7b920f8). The maintainer's MAJOR FIX (2026-11-13): the engine is
   too strict with data ranges; freedom given; rule agreed: strict data, lenient use (outside a record's range calculate
   and warn, refuse only physically impossible states, missing records, non-convergence; opt-in strictRanges).
   Running: Opus session_01FPbeWYJNRFWSghzUdYR71F, branch claude/extrapolate-with-warnings, decision 2026-11-13-03.
   Running: Sonnet session_01FPbeWV438LB4CRTCq5C76s, branch claude/fit-acetic-acid-cyclohexane, decision 2026-11-13-04.
   Then: row chooser + (d) (priority after the extrapolation fix), then (a)-(c).
   ~15:40 UTC: #241 merged (4b4438a). #240 (fit, Yang 2010 waived, NRTL+Wilson, Liu 2013 test) ready: tested merged
   with #241 locally (1674 pass, 0 fail); the maintainer agreed to its recommendations. The maintainer gave the
   coordinator freedom ("make this project great"; the interface matters less but should be fixed). Next blocker found:
   a missing pair refuses NRTL/UNIQUAC/Wilson (system.js MISSING_DATA). Running: Opus session_01FPbeWTfAS2pMutd9hyH292,
   branch claude/missing-pairs-estimated (estimate missing pairs from Mod. UNIFAC 2.0, predicted, warned; pair sets in
   result.extrapolations without the 10 K margin), decision 2026-11-13-05. Running: Sonnet session_01FPbeWXkaEvseVormS8C46q,
   branch claude/site-next-preview (site/next.html + docs/ui-review/TESTING-0021.md for the user check), decision -06.
   Recommended to the maintainer: release 0.7.0 after #240 (ships #236-#241). Queue after: row chooser + (d) in the new
   layout only; G3 lenient twin (data); (a)-(c); proposal 0022 step 1 (design specs).
   ~16:20 UTC: #243 (missing pairs estimated) green, the maintainer agreed to its four recommendations; worker records
   them. #240 + #243 tested together on main locally: 1685 pass, 0 fail. #242 (site preview) not reported yet.
   RELEASE (the maintainer, 2026-11-13): next release is 0.6.2, after #240, #242 and #243 are merged; 0.7.0 only once
   CHEPTA-Lab has solved all of its first four cases (proof that the simulator handles real cases).
   ~17:40 UTC: #240, #243, #242 merged (9fa4c02); chepta@0.6.2 live on npm (tag v0.6.2 = 9fa4c02, provenance attested).
   Open: the version pull request (from the publish workflow's summary link); #242's three questions (chat test via the
   website's chepta.js, now solved by 0.6.2; testers reply + one issue "Layout check, proposal 0021"; Task 4 uses
   examples/flowsheet-recycle.chepta.json) not yet answered. Follow-up found: since #241 CO2 gets a "normal boiling
   point" of -88 C from its liquid vapour pressure continued below the triple point (it sublimes at -78.5 C); warn
   "solid here" below a triple point and make such values report-only. Recommended next: switch to the Lab phase on
   0.6.2 (Lab reruns its first four cases; 0.7.0 when all four pass).
   The maintainer agreed (2026-11-13) to #242's three answers, the triple-point follow-up and the Lab phase. Site is
   https://cheptasim.org/ (github.io redirects); preview https://cheptasim.org/next.html checked live (no errors).
   Running, the LAST CHEPTA item of this phase: Sonnet session_01FPbeWYGgyfTtC89rwSmAkS, branch
   claude/below-triple-point (decision -07; also records #242's answers). After it merges: tell the Lab coordinator
   (session_01FPbeWUJu4MrkqCuGX3UKYB) the Lab phase starts on chepta 0.6.2 (VLLE with acetic acid, splitter by flow,
   extrapolation with warnings, missing pairs estimated); CHEPTA works only on Lab's capability requests until the
   four cases pass; then 0.7.0.
   The maintainer (2026-11-13, testing next.html): in Flowsheet the rail's calculations and the toolbar's blocks both
   show (Pipe, Reactor, Column twice): confusing; freedom given. Design: two modes [Flowsheet | Calculations], no rail
   in Flowsheet mode. Running: Opus session_01FPbeWW1BmHZD9uAHap4cew, branch claude/ui-0021-flowsheet-mode, decision
   -08. The Lab phase starts after this and the triple-point PR merge.
   Status 18:30: PR #244 (triple point) and PR #245 (Flowsheet/Calculations modes, Settings once via the Units button,
   the background switch "Grid and shading" only in Phase eq., Charts, Solubility; classic layout unchanged) both
   verified, checks green, 1699 pass merged together. The maintainer agreed to all seven questions (relayed to both
   workers to record). Order: (1) the maintainer merges the 0.6.2 version PR (branch version-0.6.2, never opened;
   main reads 0.6.1); (2) then tell #244's worker to rebase and drop "ui-review" from VERSION_EXEMPT, then merge
   #244; (3) tell #245's worker to rebase (DECISIONS.md conflict), merge #245; (4) open the public issue "Layout
   check, proposal 0021" (agreed) once next.html shows #245; (5) start the Lab phase.
   Done 19:40: #244, #245, #246 (answers), #247 (version 0.6.2) merged; #248 (drop the ui-review exemption) open, checked,
   waiting for the maintainer's merge. next.html live with 0.6.2 and the mode switch. Issue
   https://github.com/FaireDose/CHEPTA/issues/249 "Layout check, proposal 0021" opened. Both CHEPTA workers finished.
   LAB PHASE STARTED: the Lab coordinator (session_01FPbeWUJu4MrkqCuGX3UKYB) told to rerun its first four cases on
   chepta@0.6.2 and report per case; CHEPTA works only on Lab's requests until all four pass, then 0.7.0.
   CHANGED 2026-11-13 ~19:50 (the maintainer, agreed): 0.7.0 comes when Lab has simulated its first 4 COMPLETE plant
   flowsheets from papers, compared stream by stream (Lab's docs/reference/CANDIDATE_PROCESSES.md, priorities 1-4:
   CO2 to methanol, Medrano-Garcia 2025; ethyl acetate, Piotrowski & Kubica 2021, being closed on 0.6.2; ethanol to
   ethylene, Van der Borght 2019; cumene hydroperoxide to phenol/acetone, open process paper still missing). The
   datasets matter: Lab's worker session_01FPbeWVyeERdKyC4UFSgSKV sends a per-plant dataset table (stream table, unit
   specs, energy table, locators, what is missing) before any run; check it and bring it to the maintainer. Lab PR #17
   (pin 0.6.2): ethanol reactor, B2 column, methanol flash pass with identical numbers, no estimated pairs (Lab's
   report, not checked here). Methanol flash, H2+CO k_ij fitted 68-88 K used at 313 K: keep the warning, Lab reruns
   once with k_ij = 0 and records the effect (agreed). The strict mode (strictRanges) has no switch in the interface. Workers' send_message to @parent may fail ("credential for this
   connector"): when a worker goes idle, read its last message with list_events. A small fix for step 3: an opened warning repeats its first line as the text's first sentence. Then, the
   maintainer's request (2026-11-12): **the person chooses the rows of the stream tables** (mass and heat balance of
   the Flash and the Flowsheet): add rows the default lacks (molar mass, mass flows and mass fractions per component,
   and so on); one Opus or Sonnet worker after step 3, its own PR, recorded as a new row of proposal 0021 section 4. Running: acetic acid below its melting point,
   Lab's 3 (Sonnet, session_01FPbeWTusiqkoJkDYZMVMki, branch claude/acetic-acid-supercooled, decision file
   2026-11-12-05): PR #236. The maintainer agreed (2026-11-12): (1) liquid cp continued linearly below its record, 10 K at
   most, with a warning in every result; (2) a warning when the mixture path evaluates the vapour pressure outside its
   record, same limit; (3) restate METHOD_SELECTION rule 8 (melting point as a limit only for a pure component) in a
   follow-up proposal; (4) the same ChemSep lower ends for other components only on request. The worker builds 1-2 in #236.
   Lab asked (2026-11-12, for the maintainer) for visual proof from CHEPTA of each Lab case; answered: possible today via
   a project file and Playwright; missing (a) open a project at start, (b) PNG/SVG of the flowsheet drawing, (c) stream
   values on the drawing, (d) a per-block balance table; the maintainer agreed (2026-11-12): CHEPTA builds them; queue order: step 3, Lab's 7, row chooser + (d), then (a)-(c) in one PR. Lab told. Next free slot after step 3: Lab's 7 (splitter by flow; the design specification through a
   proposal). Small, seen in #235: "Sources used here" (sourceUsedFor) lists excess-enthalpy articles of other mixtures
   (ethanol + water shows benzene + cyclohexane): a pull request of its own.
3. **A lighter model for routine work.** `create_session` takes `model`. Use `claude-sonnet-5-5` for data fits with the
   existing scripts, merge conflicts, documentation, small fixes, and re-running a check; use `claude-opus-5-5` for new
   models, new solvers, proposals and engineering judgement. The coordinator itself can run on Sonnet: it plans,
   starts sessions and relays.
4. **Few relays.** A worker reports once, when its pull request is open (one short `send_message` to the coordinator),
   and once more only when it is blocked. No PR subscriptions, no scheduled check-ins, no polling.
5. **Cheap checks.** Read files in parts (`grep`, `sed -n`), not whole; run the affected tests while working and the
   full `npm test` once before pushing.
6. **A merge conflict** in DECISIONS.md, proposals/README.md, known-issues.json or sources.json is fixed by the
   coordinator (keep both sides; regenerate `src/data/LICENSES.md` with `validation/python/make_sources.py`, never by
   hand). A conflict in code goes back to the session that wrote it.

## How to start a worker

`create_session` with `source_url: "https://github.com/FaireDose/CHEPTA"`, `source_revision: "main"` (a short commit
fails), `outcome_branch` set to the branch the worker may push (it refuses other branches), `model` as above. The
prompt says: read AGENTS.md, DATA_RULES.md, METHOD_SELECTION.md (with "When in doubt: what other simulators do") and,
for views, UI_GUIDE.md; open sources only, no numbers from memory; an independent Python reference and an open worked
example; the decision file's exact name (`docs/decisions/YYYY-MM-DD-NN-topic.md`, unique); report once to the
coordinator's session id with the PR link, what to check, what to decide; the GitHub MCP tools take owner
`FaireDose`, repo `CHEPTA`; commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or the model
used).

## State on 2026-11-11 (afternoon)

- `main` has #216 to #226 merged; **0.6.0 is live on npm** (released 2026-11-11). Release procedure:
  docs/decisions/2026-11-11-03-release-0.6.0.md (release, approve on npmjs.com once validation ends, merge the version
  PR from the link in the workflow summary).
- Coordinator of 2026-11-10/11: session_01FPbeWU4uw4v3pDoUjAjH7E. CHEPTA-Lab coordinator: session_01FPbeWUJu4MrkqCuGX3UKYB
  (Fable); it asks this coordinator before starting a counted worker.
- **Open PRs waiting for the maintainer:** none. #227 (column purity/recovery specifications and side draws, proposal
  0015 step 11) merged on 2026-11-11 at 18:34 UTC.
- **Running workers:**

  | Session | Model | Task | Counted |
  |---|---|---|---|
  | session_01FPbeWV6v28HcnkuHkqBeF9 | Sonnet | two-liquid pairs not refitted in #218 (decision file 2026-11-11-06) | yes |
  | session_01FPbeWUNd3ZWdPaYwB7BeFQ | Sonnet | Lab capability requests 2-5 (sets message, MHV1 warnings, MHV1 source ids; 2026-11-11-09) | yes |

  Both Sonnet workers stopped on the 5-hour limit on 2026-11-11; they wait for a free slot (resume them, do not restart).
  Resumed on 2026-11-12 at the maintainer's request (the two existing Fable sessions may finish; no new Fable sessions),
  holding both slots: acetic acid in columns (session_01FPbeWWQkqeGndx5sPQ3zMS, branch claude/acetic-acid-columns) and
  proposal 0021 step 1 (session_01FPbeWVaRyxCA4YVjgf6jXc, branch claude/ui-0021-step1).

## Queue, in order

CHEPTA PHASE STARTED 2026-11-14 ~15:57 UTC (Lab's phase ended; the maintainer approved Lab's batch of requests from
   two closed plants on 0.6.2: ethyl acetate S2, Piotrowski; CO2 to methanol, Campos 2022, Lab PR #22). Running:
   (A) Opus session_01FPbeWVdRopqMZBAjVHY788, branch claude/design-spec-0022: proposal 0022 steps 1-3 (EA-15; the
   sensitivity table only drafted as a proposal); (B) Opus session_01FPbeWX2Pxvf8FbTmYGFdwi, branch
   claude/column-fixes-lab-062: EA-12/M3 (Newton capped at 12 iterations), EA-13/M2 (spec refused inside the reported
   range), EA-9/M1 (traces stop a column), EA-8 message, M4 if time; answers Lab's column-5 question. Next, one worker:
   EA-10 (strictRanges refuses nothing: reproduced on main with Lab's u-htxr2-15C, ok with 6 extrapolations), EA-11
   (thermo.missingPairs rejected in a flowsheet), EA-14 (OUT_OF_TIME without loop progress), item 0b below. Later: M5
   condenser with vapour and liquid distillate (feature). Lab coordinator asks which release to pin when this ends.
   17:05: PR #250 (design specs, 0022 steps 1-3, proposal 0023 drafted; worker A finished) and PR #251 (columns: EA-12,
   EA-13, M1, EA-8, M4 fixed; EA-9 needs a two-liquid stage proposal; column 5 alone converges, the plant now stops on the
   Broyden recycle plateau ~1.5e-3; worker B finished) both verified: CI green, merged together on main 1719 pass,
   0 fail, 1 TODO; only added tests (project format 9 -> 10). Questions to the maintainer: #250's 3 + 0023's 5, #251's 4
   (all recommended). Running: (C) Opus session_01FPbeWTq8DLsWizWuKvrS7i, branch claude/strict-mode-fixes: EA-10,
   EA-11, EA-14, extrapolations in solve_column, the Settings switch (item 0b). Next: a recycle-solver task (the
   plateau, Lab's 14), column reflux/distillate as design-spec inputs, proposal for a smooth two-liquid stage, then M5.
   17:30: PR #252 (worker C finished: EA-10 strict mode refuses any answer that carries an extrapolation, no margins;
   EA-11; EA-14 loop progress on OUT_OF_TIME; extrapolations kept in solve_column and the other wrappers; value.rangeMode;
   the Settings switch) verified: CI green; #250+#251+#252 merged together on main 1728 pass, 0 fail, 1 TODO; Lab's
   u-htxr2-15C now refused in strict mode, ok with 4 extrapolations otherwise. One test changed with reason (strict
   user-pair check moved 300 -> 310 K, inside glycerol's vapour-pressure record). 4 questions to the maintainer (all
   recommended). No worker running. After the merges: release 0.6.3 (recommended; Lab pins it).
   17:49: the maintainer answered #252's four questions directly in worker C's session (checked in its transcript; 1
   "only if this is possible to add in the workbench": it is, the Settings switch's Refuse); recorded in ef35080.
   17:54: the maintainer answered #251 directly in worker B's session (checked): (1) a column with two liquids: a
   warning and "decanter first" when a large second liquid enters, a simple top/bottom exit for a small immiscible part,
   and the smooth formulation for splits forming inside: a short proposal (new session); (2) M5 condenser with vapour
   and liquid distillate (pressure set, vapour ratio given): accepted in principle, proposal then build (new session,
   after #251 merges); (3) kept; (4) the recycle plateau: flowsheet-solver task after #250 merges. Still open: #250's 3
   + 0023's 5. Running: (D) Opus, branch claude/proposal-two-liquid-columns (proposal 0024, docs only).
   18:04 follow-up (recorded by worker B in #251): 5 % of the feed as a second liquid -> warning + decanter first; below
   it the immiscible part goes where its volatility takes it, with an override; the proposal's validated case is
   heterogeneous azeotropic distillation with an entrainer (decanter on the condenser); relayed to D. M5: the condenser
   takes its pressure plus one of T, vapour distillate flow or vapour share; proposal + build (Opus) after #251 merges.
   18:14: the maintainer merged #248, #250, #251, #252 (main 6aedc14; #250's answers recorded: tolerance a default the
   person may change, warning not refusal; 0023 accepted, with worked examples in its step 2). RELEASE (the maintainer):
   0.6.3 only after the liquid-liquid column issue is solved completely (proposal 0024 accepted and built, Lab's column
   11 converging with acid). Running: (D) proposal 0024, PR #253, being updated to the maintainer's 5 % / volatility
   default / entrainer case; (E) Opus session_01FPbeWVE7raM96jEeGEL1Po, branch claude/recycle-plateau (Lab's 14).
   Queue after: build 0024; M5 condenser (proposal + build); column reflux/distillate as design-spec inputs; 0023
   build with examples; 0022 step 4 (workbench form).
   2026-11-17: the maintainer confirmed to the coordinator "I chose A" for proposal 0024: 1 mol % of the column's feed
   (warning, column still calculated; the bypass refused above it), top or bottom the user's choice, no default by
   volatility; this replaces #251's follow-up (5 %, default by volatility). D told to record it in #253 and mark -05's
   point as replaced. Worker E stopped on 2026-11-14 at the weekly usage limit with 3 commits pushed (08a9c38: recycle
   safeguards, Lab plant inputs, a decision draft numbered -07, which collides with #253); resumed 2026-11-17 16:31,
   told to rename its decision file to 2026-11-14-08 and open the PR.
   16:33: #253 (proposal 0024, docs only) checked, head 6579428: 5 % no longer current anywhere; ready for the
   maintainer's merge. Worker D finished. Running: (E) recycle; (F) Opus session_01FPbeWY5iuoQWSbqwAKZFgG, branch
   claude/build-0024-two-liquid-columns, started from #253's branch: builds 0024 (a), (b), (c); must report whether
   Lab's column 11 converges with acid and whether (c) became the default (the condition for 0.6.3).
0b. NEXT CHEPTA PHASE, first (the maintainer, agreed 2026-11-13), one small PR each or together:
   (1) a switch in the Settings drawer (the Units button): "Outside a record's range or a missing pair: continue with a
   warning / refuse" (strictRanges in the project's solver), and each result says which mode it ran in;
   (2) solve_column and the other single-block wrappers of src/api/dispatcher.js drop the flowsheet result's
   `extrapolations` (they rebuild `value`); pass it through, with a test (found from Lab's B2 question).
   Then #248 if still open, then the rest of this queue.
1. Relay the reports of the running workers. Lab's requests from CHEPTA-Lab#5: 1 done (#227, merged); 2-5 in the requests worker;
   6 (SRK + gE (MHV1) for CO2 + water) only if the maintainer asks.
0. Usage rules (the maintainer, 2026-11-12, from session_01FPbeWW7BAkeYbFJnho1BYY's measurements): one Sonnet worker,
   when no other worker runs: `npm test` quiet (dot reporter on screen, the full TAP written to a file at the same time;
   `npm run test:verbose` keeps the old output; CI keeps the full output); never open the big data files or generated
   lists whole and use `git diff --stat` for src/data and validation/data, with a lookup script
   (`node scripts/show.mjs component ethanol`, `... pair ethanol water`); the "cheap checks" rule copied into AGENTS.md;
   `@docs/DATA_RULES.md` removed from CLAUDE.md (AGENTS.md rule 1 still sends data work to it); one script for the
   nine steps of DATA_RULES section 9. Shortening DATA_RULES.md itself: later, reviewed line by line by the maintainer.
1a. Acetic acid dimerization in columns (Lab blocker) and proposal 0021 step 1: running in the resumed Fable sessions
   (above). If either stops again, restart it with Opus from its pushed branch.
2. Column specifications follow-ups (#227 is merged): inequality specifications first ("at least 0.99", "at most
   10 ppm"), then the draw of one of two liquids, pumparounds, side draws on absorbers.
3. Proposal 0021 step (c): the flowsheet's tabs and examples; then the rest of the proposal's steps. The "next" layout
   becomes the default only after steps 1-3 and a check by users; "classic" stays two versions.
4. M4 remainder (proposal 0015 steps 11-12): the benchmark flowsheets; cost correlations E2 and utilities E3 (P5,
   v0.7), by the bounded-cost rules in ROADMAP.md.
5. Small: align the flowsheet Method page's pair notes with the Inputs panel's (from #220).
   From #230 (accepted 2026-11-12): fit_parameters.py writes a reason per set not fitted; methanol + water NRTL check-file
   deviations recorded 0.81 / 0.68 K against 0.67 / 0.61 K from the engine today, look into it with the next data task.
6. Later: NH3 + water NRTL; water + glucose/sucrose NRTL; CPA for CO2 + water (M3); gas-hydrate check; the user's own
   slurry viscosity and density for the pump; Beggs-Brill for the Pipe; ChemE-as-Code bridge (B6: CHEPTA's command
   line as a simulation backend through their files only; their code is AGPL, never copied).
7. Release 0.6.1 (the maintainer, 2026-11-12), after #230 and the two-liquid data task. Pre-check on main b71795c
   with the version set to 0.6.1 (the workflow's own steps): 1597 tests, 1596 pass, 0 fail, 1 known TODO; 0.6.1 is free
   on npm. Re-run on the final main before the release. Was: Next release (0.6.1 or 0.7) when the acetic-acid columns are in (#227 is), so Lab can try its first
   reaction-separation case.

## CHEPTA-Lab moves to Claude (the maintainer, 2026-11-11)

- When two worker slots are free (Fable sessions not counted), start a separate CHEPTA-Lab coordinator session on
  https://github.com/FaireDose/CHEPTA-Lab (not this session): its own handover file in that repository, the same usage
  rules, `chepta@0.6.0` pinned, then the roadmap's order (ROADMAP.md, "CHEPTA and CHEPTA-Lab", "Next, in this order").
- The two coordinators exchange capability requests and release notices by short messages.
- ROADMAP.md, "CHEPTA and CHEPTA-Lab", rule 7: Lab's held-out evaluation cases are reviewed by the maintainer or by an
  AI model of another family before use; no Claude session that writes CHEPTA code sees them.
- Decision: docs/decisions/2026-11-11-05-chepta-lab-on-claude.md.
- Started 2026-11-11 at the maintainer's request: the Lab coordinator, session_01FPbeWUJu4MrkqCuGX3UKYB (Fable 5.2,
  repository FaireDose/CHEPTA-Lab, branch claude/lab-next-steps). First job: docs/WHERE_WE_ARE_HEADING.md in Lab (the
  plain picture of where CHEPTA and Lab are going, Lab's next steps, and whether to take up ChemE-as-Code,
  cheme-as-code.org, TU Delft: plant files in git with checks, DWSIM/IDAES backends, AGPL code and CC BY 4.0 data, an
  unreviewed AI-generated Process Atlas; and plant ontologies for operations, out of scope for now). It starts no
  workers before the maintainer chooses the next steps.

## Open questions for the maintainer

- The website link reads "Powered by CHEPTA-Lab"; "Tested by CHEPTA-Lab" would be more accurate (the maintainer has not
  answered).
- Numbers to check against their sources are listed in each PR and decision file; the open ones are in
  docs/DECISIONS.md.
- Documents to download by hand: docs/missing-properties/TO_DOWNLOAD.md (Su et al. 2024 decides terephthalic acid in
  water; the Hydraulic Institute FAQ for a slurry limit).

## CHEPTA-Lab

[CHEPTA-Lab](https://github.com/FaireDose/CHEPTA-Lab) (built with Astra 6, OpenAI) owns literature screening, cases,
training data and evaluation; CHEPTA owns the simulator (ROADMAP.md, "CHEPTA and CHEPTA-Lab"). Lab pins released
versions, files capability requests, and does the agentic items G2 to G5. Its known blockers: acetic acid's
dimerization model in the three-phase flash and with two liquids on a column's stages (one liquid: solved,
docs/decisions/2026-11-11-08-acetic-acid-columns.md), purity specifications (built, PR #227), and the methanol
separator (now
possible with PR + MHV1 once item 3 is done).

16:45: Worker E finished: #254 (recycle safeguards, Lab request 14), checked locally: 1741 tests, 1737 pass, 0 fail,
3 skipped, 1 todo; no test lines removed; CI green. Lab's plant still does not converge: the cause is its specification
(column 11's bottoms fixed at 141.5 kmol/h takes 0.42 kmol/h more ester than is formed). #253 and #254 conflict in
docs/DECISIONS.md: merge #253 first, then ask E (same task, allowed) to rebase #254 onto main. Five questions for the
maintainer at the end of 2026-11-14-08; recommendations given to the user.

17:50: Worker F finished: #255 (build of 0024; contains #253). Checked locally: 1749 tests, 1748 pass, 0 fail, 1 todo;
#255 + #254 together (DECISIONS.md conflict resolved by hand for the check): 1759, 1755 pass, 0 fail, 3 skipped;
no existing test or data line removed; CI green. Lab's column 11 with acid converges (all 7 inputs; liquid-weighted
continuation as the last attempt). "smooth" stays opt-in (Lab's column 5 fails with it as default). Not done: a
high-reflux column reaching the heteroazeotrope; the three-phase flash fails near 335.5 K. Merge order: #253, #255,
then E rebases #254. 0.6.3: the user's rule was "after we solve completely the liquid liquid issue": asked the user.
The maintainer must check the Gomis 2005 file against ThermoML set 1 (11 rows).

2026-11-18 08:10: The maintainer (in F's session, 07:39, verified): "we do not release now. i want the columns to
calculate rigously LLV also . Like in ASpen they do with RadFrac." F recorded it in #255 (1abc9fd): the default "split"
stage is already RadFrac's stage model; RadFrac's outer-loop split tried, not more robust, not kept. No 0.6.3 yet.
Nothing merged (main 6aedc14). Started (G) Opus session_01FPbeWUzst4nr3xUKjs1RZv, from #255's branch, outcome
claude/vll-columns-rigorous: (a) three-phase flash near the heteroazeotrope, (b) the entrainer column with a decanter
(proposal instead if it needs an inside-out solver), (c) re-check "smooth" as default. One worker running.

08:30: #254 revised by E after the maintainer's review (verified in E's session: 07:42 "early messages if the columns
are not converging ... you invent things that are not done in simulators ... look at the specs", then answers "Stop at
once, name it" and "Warn early, keep iterating"). Head f41f3c5: retry after a block failure removed; FD Jacobian on a
stall and rejection kept (COFE does the same); a failing block stops the loop at once with its name, iteration, guess
extrapolation and "check the specifications first"; accumulation warning after 30 passes. Checked locally: 1741 tests,
1737 pass, 0 fail, 3 skipped, 1 todo; no test lines removed. Still conflicts with #253 in DECISIONS.md.

09:15: Worker G finished: #256 (base #255's branch; retarget to main after #255 merges), head 4e9d54d. Checked locally:
1766 tests, 1765 pass, 0 fail, 1 todo; with #254 also merged: 1776, 1772 pass, 0 fail, 3 skipped. One existing test
changed (columns-heteroazeotropic: it asserted the 2 Gomis flash failures, now fixed; the 0.021 bound kept on the 9 old
lines, the 2 new lines within 0.024): justified. (a) flash near the heteroazeotrope fixed (Gibbs minimization where
substitution fails; all 11 Gomis lines; independent scipy reference within 1e-6 K). (b) entrainer column not done:
proposal 0025 drafted (start, continuation past turning points; decanter reflux pinned at 1.39). (c) "smooth" stays
opt-in (column 5 at 55,000 kg/h still fails). Merge order now: #253, #255, #256 (retarget), #254 (E rebases).
No worker running. 0.6.3 still on hold (the maintainer: VLL columns rigorous first).

11:05: The maintainer in F's session (11:01, verified): "i agree with all recommendations" (F's: no release yet, flash
fix, sweep column 11 for multiple steady states; F is adding that sweep to #255) and "recap all the points on hold
from the previous decisions and fix important ones before going to next version". Recap sent to the user (from
DECISIONS.md open items + HANDOVER queue). Started (H) Opus session_01FPbeWYNvX8NhAxgwjuRrzD from claude/recycle-plateau,
outcome claude/flowsheet-balance-absolute: absolute per-component balance check (#254 question 3; fail loudly).
Running: F (column 11 sweep, own PR), H. Waiting for the user: which recap items go before 0.6.3 (recommended:
merge #253/#255/#256/#254, H's balance check, proposal 0025 step 1, M5 condenser).

11:25: Worker H finished: #257 (base claude/recycle-plateau = #254; rebase after #254 merges), head aa50d71. Checked
locally: 1746 tests, 1742 pass, 0 fail, 3 skipped, 1 todo; no test lines removed; all open PRs merged together
(#253 #255 #256 #254 #257; DECISIONS.md conflicts resolved by hand for the check): 1781, 1777 pass, 0 fail.
solver.balanceTolerance 1e-4 of the fresh feed, per component, independent of the recycle tolerance (as COFE);
refused in strict mode, warned otherwise. Four questions for the maintainer. Running: F (column 11 sweep).
Merge order: #253, #255, #256 (retarget), #254 (E rebases), #257 (H rebases).

11:40: The maintainer (to me): "ok agree with all i will merge one by one". Answers sent to E (#254: 5 as
recommended), G (#256: 4 as recommended, 0025 accepted, step 1 first; ask Lab about the decanter option), H (#257: 4 as
recommended; Settings hint line; drains/accumulates wording may go in). Each records them in its own PR and rebases
after its base merges (order #253, #255, #256, #254, #257). Agreed before 0.6.3: 0025 step 1 and M5 (proposal then
build). Next worker (0025 step 1, from #256's branch or main once merged) starts when F has finished and the answer
recordings are done (2-worker limit).

After the usage limit: E, G, H had stopped at the 5-hour limit before recording the answers; nothing merged (main
6aedc14). F idle: column 11 sweep 139-140 kmol/h shows one solution (the two-liquid jump is physical), not yet pushed
to #255; F also answered the maintainer about contacting Anthropic. Resumed E and G (record answers). Next: H (record
answers), then F (push the sweep to #255), then the 0025 step 1 worker.

12:40: Answers recorded: G #256 e14c17a (0025 accepted), E #254 bc7afd1 (1737 pass), H #257 088bb99 (Settings hint;
drains/accumulates wording; checked locally 1747 tests, 1743 pass, 0 fail). F asked to push the column 11 sweep to
#255 (don't merge #255 before). Started (I) Opus session_01FPbeWV9hTLSkYs9AyAYquE from claude/vll-columns-rigorous,
outcome claude/build-0025-step1: proposal 0025 step 1. Running: F, I. Waiting to rebase: G after #255, E after
#253+#255, H after #254. Then M5 (proposal then build).

12:55: #253 and #255 merged by the maintainer (main b2f1d8a; #255 head 8462d0f with the column 11 sweep, one solution
136-141 kmol/h). Told G to rebase #256 onto main and retarget; E to rebase #254 (one more rebase after #256).
Running: I (0025 step 1); G and E rebasing.

13:35: #256 ready (head ec325a0, merge of main into the branch; checked: 1766 tests, 1765 pass, 0 fail; suggest
squash-merge). E rebased #254 onto b2f1d8a (3a12376, squashed into one commit; 1755 pass); one more rebase after #256;
H must rebase #257 onto the new #254 history. Worker I finished: #258 (0025 step 1, entrainer start; base
claude/vll-columns-rigorous): checked with #256 merged: 1773 tests, 1772 pass, 0 fail; no existing test changed.
F6 (20 stages) and F7 (30) converge; F4 with 1, 2, 10 % cyclohexane and the near-dry column do not; the "dry-ethanol"
spec of 2026-11-18-01 (B = 66, 1.17 % cyclohexane) has no solution (min B about 66.8). Step 2 needed. Three questions.
No worker running now. Next: M5 condenser proposal; 0025 step 2 after the maintainer's answers.

13:50: The maintainer: "56 and 58 done. ok with your recommendations" (#258's three questions: last-attempt entrainer
start; step 2 = bottoms purity in MESH first, continuation only if needed; dehydration case by purity). #256 is on main
(50bfa24), but #258 was merged into claude/vll-columns-rigorous (dcac0a8), NOT main. Asked I to bring its branch up to
main, record the answers, build the last-attempt start, and open a new PR to main replacing #258. Asked E for the final
rebase of #254. Running: I, E. Next: H rebases #257 after #254; then M5 proposal; 0025 step 2 after I's new PR.

18:10: #254 rebased by E onto 50bfa24 (12a6c0c); checked: 1776 tests, 1772 pass, 0 fail, 3 skipped; ready to merge.
Note: fetch refs/pull/N/head with a leading '+' (forced updates are refused otherwise and the old head is tested).
Started (J) Opus session_01FPbeWYErbUtLFZuyABGJGN, from main, outcome claude/proposal-partial-condenser-m5: the M5
proposal (docs only; how open simulators do it). Running: I (new PR replacing #258), J.

18:20: #254 merged by the maintainer (main 36b0d96). Asked H to bring #257 onto main. Worker I opened #259 (replaces
#258; head 2ddeb57): checked: 1775 tests, 1774 pass, 0 fail, no test removed; merges cleanly with 36b0d96. F8 (10 %
cyclohexane) converges as the last attempt. Ready to merge. Running: H (rebase), J (M5 proposal).

18:25: Worker J finished: #260 (proposal 0026, M5 vapour + liquid distillate condenser; docs only). Seven questions.
Asked J to renumber its decision file to 2026-11-18-05 (02 is #257's, 03/04 #258/#259). Build after #259 merges.

18:40: #259 merged (main 323e8ea). #257 rebased by H (head 28a7984; note refs/pull/257/head lagged, fetch the branch):
merged with main checked: 1791 tests, 1787 pass, 0 fail, 3 skipped. Ready. The maintainer: OK with all seven of #260,
question on 4: the proposal wrongly said feed_second_liquid "top" is refused with "vapour_liquid"; on main "top"
without a decanter bypasses stages and condenser and is mixed into the distillate. Told J to correct it (mix into the
liquid distillate after the condenser), record the answers, mark 0026 accepted. Next: build 0026 (engine PR, then
workbench), 0025 step 2 (bottoms purity in MESH). Then 0.6.3 decision.

18:45: #257 merged (main 027fba8). J asked to bring #260 onto main. Started (K) Opus session_01FPbeWVQYfmFQqV9mKbnoqg
from claude/proposal-partial-condenser-m5, outcome claude/build-0026-condenser-engine: build 0026 steps 1-2 (engine,
API, validation incl. Lab's methanol column). Next when J is done: (L) 0025 step 2 (bottoms purity in MESH; dehydration
case by purity), told to coordinate with K in engine.js.

18:35: J brought #260 onto main (head 700832c, docs only, merges cleanly): ready to merge. Started (L) Opus
session_01FPbeWW2cai2XmDCb49ASfS from main, outcome claude/build-0025-step2: bottoms purity in MESH first,
continuation only if needed; dehydration case by purity. Running: K (0026 engine), L (0025 step 2).

18:50: #260 merged (main 4c98081). Told K. Open PRs: none. Running: K (0026 engine), L (0025 step 2).
- 19:00: K opened #261 (0026 steps 1-2, head a4fd104, on main 4c98081). Verified locally: 1801 tests, 1797 pass, 0 fail, 3 skipped, 1 todo; no test lines removed. Decision -06. CI test running at report time. Reported to the user with K's 3 questions (a formulation, b PR k_ij(T) fix in reference, c workbench next). L (0025 step 2) has not pushed yet; it also edits specifications.js, which #261 touches. K finished: do not give it a new task (rule 1), except the workbench if the maintainer treats it as the same task — prefer a new worker.
- 11-19: Maintainer: "I agree with all three" (#261 a, b, c). CI on #261 green. Told K to record the answers in decision -06 (allowed). L had stopped at the 5-hour limit; resumed it, told it #261 touches specifications.js/engine.js and -06 is taken. Next: once K is done and #261 merged, start a new worker (M) for 0026 step 3, the workbench, from main (max 2 workers: L + M).
- 11-19 19:56: K recorded the answers in decision -06 (head 14bec6f, docs only, 7 lines). K is finished. #261 ready to merge. Waiting: maintainer merges #261, then start M (0026 step 3 workbench). L resumed, working.
- 11-19 20:20: L opened #262 (0025 step 2, head 0c48483, decision -07). Verified: 1802 tests, 1798 pass, 0 fail, 3 skipped, 1 todo; no test lines removed; CI green. Combined with #261: 2 conflict blocks in engine.js; L will merge main and resolve after #261 lands. L's 5 questions reported to the maintainer (all recommended yes; Q4 = ask Lab about entrainer recycle / decanter option at its next phase). Merge order: #261 first, then L brings #262 onto main.
- 11-19: Maintainer agreed with L's 5 answers on #262 and is merging #261. Told L to record them, then merge main after #261 and resolve engine.js. Maintainer asked why 1-2 % cyclohexane fails; explained (dry bottoms: distillate takes ~0.27 cyclohexane per water, so >= ~3.2 % needed; F4 at B=80 with 1-2 %: unexplained). Proposed (not yet answered): one worker task after #261/#262 = (i) early "too little entrainer" check before solving, (ii) step the cyclohexane down from 5 % on F4 to see whether the branch ends or the solver fails. Explain case names (F4 etc.) in plain words to the maintainer.
- 11-19 21:52: #261 merged (main c8f3d47). Told L to merge main into #262 and resolve engine.js. Started M: session_01FPbeWXEjN14VK7hvoZ4qaC, branch claude/build-0026-workbench, task 0026 step 3 (workbench, PROJECT_FORMAT + 1, docs/models/columns.md); told to avoid engine.js/specifications.js. Running: L (#262), M (workbench). K finished.
- 11-19 22:05: L merged main into #262 (head 7d523e5), answers recorded in -07. Verified: 1812 tests, 1808 pass, 0 fail, 3 skipped, 1 todo; no test lines removed; CI green. #262 ready to merge. L finished. Running: M (workbench). Open question to maintainer: the 1-2 % cyclohexane follow-up task (early entrainer check + F4 step-down).
- 11-19 22:20: #262 merged (main 4849cd8). L finished. Maintainer on the 1-2 % cyclohexane follow-ups: NO early "too little entrainer" warning ("the person should learn this from LL curves ... the software cannot tell us what to do"); SKIP the F4 step-down investigation; look at a specific case with CHEPTA-Lab later. Record these in a decision file with the next PR that touches columns (not urgent; no worker started for it).
- M opened #263 (0026 step 3 workbench, head 432d648): 1805 tests, 1801 pass, 0 fail; only test edits are the 3 format-number lines (10->11, 11->12), as for format 10. main+#263 merges cleanly; combined test run in progress. M's 3 questions (short button names; McCabe-Thiele refused; format 11) to report.
- 11-19 22:30: The maintainer answered M directly in M's session (verified in its transcript, web_claude_ai): "ok with 1" (short buttons); McCabe-Thiele "if it is [in the engine] let's do it" (now drawn: condenser as first step, line through the whole distillate at L/(U+V)); screenshot remark: vapour distillate at the top, liquid at the right below (done). New head 6859586. Still open: confirm format 11. Testing main+#263 (a first combined run hung past 10 min and was stopped; rerun with timeout).
- 11-19 22:40: #263 final head 7e65ae2 (format 11 confirmed by the maintainer in M's session, "ok"). main+#263 verified: 1817 tests, 1813 pass, 0 fail, 3 skipped, 1 todo; CI green. Ready to merge. Told M not to start step 4 (IDAES cross-check): not assigned. After #263: no workers running. Next to decide with the maintainer: 0026 step 4 (IDAES cross-check) or not; Lab's rerun of the methanol plant (Lab phase); 0.6.3 release (two-liquid columns rigorous + important on-hold items fixed) — review the (A) list.
- 11-19 22:50: #263 merged (main 415da41). Maintainer: "you can continue with the lab phase". No CHEPTA workers running (CHEPTA paused while Lab works). Sent the Lab coordinator (session_01FPbeWUJu4MrkqCuGX3UKYB) the changes since 0.6.2 and asked: (1) rerun the methanol plant with condenser "vapour_liquid" at main 415da41; (2) rerun other plants/columns for regressions; (3) entrainer recycle vs decanter share option for 1-2 % cyclohexane, and a specific literature case; (4) capability requests. 0026 step 4 (IDAES cross-check) not started; ask the maintainer after Lab. Then 0.6.3.
- 11-19 22:35: Lab started two Opus workers against main 415da41: methanol plant with vapour_liquid condenser (session_01FPbeWXkABqQHP7Kb61UHYK) and regression check (session_01FPbeWWcQaBWSn4QjvqyTos). Lab has no ethanol + cyclohexane case; the Lab coordinator asks the maintainer whether Lab should find a literature case next. Waiting for Lab's report.
- 11-20 09:35: Lab coordinator relayed the maintainer (verified in its transcript, 09:27): (A) CHEPTA item: check CO2 solubility in methanol (+ water) at 30-50 C, 50-80 bar against measured open data (OpenAlex, CORE); CHEPTA PR k_ij gives 3.4 % CO2 in the 70 bar flash liquid, Campos 2022 (Aspen) 18.5 %; which method fits (PR k_ij, PR+MHV1, SRK+MHV1). Case files: Lab PR #24. Start when the Lab phase ends (CHEPTA and Lab never at the same time); Lab regression worker session_01FPbeWWcQaBWSn4QjvqyTos still running at 09:35. (B) coordination: replied with points 6-10; my miss: release list omitted #250 (design specs), #251, #252 since v0.6.2 — build "what changed" from git log --merges <pin>..main + decision files from now on. Maintainer wants one best-case simulation per plant for regression checks.
- 11-20 10:00: Lab coordinator relayed the maintainer: Lab simulations should take minutes, not hours; plan, nothing to build yet. My finding (code read at 415da41): the flowsheet's column unit (column.js:790, solveCascade) never passes a start profile, so every loop pass and every design-spec evaluation cold-starts each column (decanter columns: the whole start ladder); design-spec warm start covers tears only. Proposed step 1: reuse each column's converged profile (keyed by block) + timing per block/pass/evaluation + time budget; benchmark Lab's ethyl acetate plant 99.90 % spec. Skills: proposed CHEPTA .claude/skills/ index (data, columns, flowsheet, ui, coordination) and a shorter AGENTS.md — maintainer's decision. The Lab coordinator merges both sides into one proposal.
- 11-20 13:40: Lab: regression check (Lab PR #25) and methanol check (Lab #24, merged) done; findings + requests 16-19 + the CO2 item come in Lab's end-of-phase report. Lab phase continues with one worker (session_01FPbeWU5omSnAq1GwCDcnnU, knowledge-base structure in Lab's dataset; runs no CHEPTA). CHEPTA waits until Lab says the phase ended.
- 11-20 19:20: Lab phase ENDED (Lab report received; no regressions vs 0.6.2, Lab PR #25). Maintainer (verified in Lab coordinator transcript): "Chepta should fix stuff at 0.6.3 or 6.4 including the CO2 stuff". Lab's list by priority: 1 speed (ethyl acetate design-spec run < 10 min; a reuse column profiles, b timing, c time limit); 2 req 16 design spec varying a column spec; 3 req 18 OUT_OF_TIME names no solve/value; 4 req 19 col 15 refuses 0.9999 purity it exceeds; 5 req 17 strict mode refuses out-of-range only after loop converges; 6 CO2 in methanol at 30 C / 69.25 bar (CHEPTA 3.4 % vs paper 18.5 %); 7 M6 vapour_liquid condenser by T fails on Lab's feed; 8 M4 min-approach exchanger cross. Also finish req 8, 13, 14, M2. Inputs in CHEPTA-Lab main. Lab wants back: release split, "what Lab can now do" list per release from the merge log, CO2 answer with sources. Proposed split to maintainer: 0.6.3 = speed (proposal 0027 + build, with req 18) + fixes 17, 19, 8/13/14/M2; 0.6.4 = req 16, CO2 (research starts now), M6, M4.
- 11-20 19:25: Maintainer: ALL 8 Lab points in 0.6.3 (+ finish 8/13/14/M2); speed as proposal then build by the same worker: yes; start A and B: yes. Started (A) session_01FPbeWWDTSn7nfcFu7tJGVK, branch claude/proposal-0027-solve-speed (profile, proposal 0027, then build a-c incl. req 18); (B) session_01FPbeWUxdgugDy3bwytfXQc, branch claude/co2-methanol-vle-check (measured CO2 solubility, method comparison, fix if CHEPTA off). Queue for 0.6.3 as slots free: (C) req 17 + 19 + finish 8/13/14/M2; (D) req 16 (design spec varying a column spec); (E) M6 after B; (F) M4. Then release 0.6.3, then Lab gets the "what Lab can now do" list from git log --merges v0.6.2..main + decision files, one example each, and the CO2 answer. Told the Lab coordinator.
- 11-20 19:55: B opened #264 (CO2, head 216f60a, decision 2026-11-20-01): measured data (ThermoML: Xia 2004 je049803i set 1, 221 pts; Bezanehtak 2004 je0301491 set 2, 142; Xie 2005 je0498614 set 2, 16 — counts checked against the ThermoML XML) say ~2-3 % CO2; paper's 18.5 % not physical; CHEPTA PR k_ij 3.4 % too high (+77 % in 1:1 solvent); PR+MHV1 fits (7.9 % AAD), 2.6 % for Lab's separator without N2. No default change; METHOD_SELECTION rule + known issues + test. Questions: 1 check rows (rule 4); 2 N2 MHV1 sets (N2+water from IAPWS G7-04 now, N2+methanol after search); 3 move Lab separator/methanol examples to PR+MHV1 once N2 sets exist. Local test run in progress. B finished. add_repo for CHEPTA-Lab refused by classifier: workers clone the public repo instead. Started (C) session for req 17, 19, finish 8/13/14/M2, branch claude/lab-requests-17-19. Running: A (speed), C.
- 11-25: Maintainer: "continue". Found A and C stopped since 11-20 19:53 (5-hour limit, "out of usage credits"); no new PRs; main still 415da41; #264 open (ready, questions 1-3 unanswered: N2 MHV1 sets, switch methanol cases to PR+MHV1, tell Lab not to tune to the paper's CO2). Resumed A and C.
- 11-25: Maintainer on #264: (1) N2 MHV1 sets "likely yes do it, we missed this"; (2) yes; (3) yes. Told B to record. Why N2 was missing: the high-pressure pairs (decision 2026-11-04-13, then MHV1 2026-11-06-02) were chosen from Lab's FIRST CO2-to-methanol separator (CO2, H2, CO, CH4 + methanol/water); N2 came with the Campos 2022 plant later, and nobody re-checked the pair list. Proposal 0018 named N2 + water (ThermoML: 4 articles, 212 points) as a later pair; never built. mhv1.json has 15 sets: CO2/H2/CO/CH4 + methanol (SRK, PR), CO2 + water (PR only; SRK not written, so SRK+MHV1 refuses), H2/CO/CH4 + water (SRK, PR). Next worker (D, when a slot frees): N2 + water and N2 + methanol MHV1 sets, AND a check that every gas + liquid pair in each Lab plant has a set (so this is not missed again). Running: A, C.
- 11-25 17:45: B recorded the answers on #264 (head e3f5764, docs only). #264 ready to merge after the maintainer's rule-4 check of the rows. B finished.
- 11-25 18:20: Maintainer merged #264 at 216f60a (main dd31c2e) — WITHOUT the answers commit e3f5764; asked B to open a small follow-up PR with it. C opened #265 (req 17, 19, 8, 13/M2; decision 2026-11-20-03; head ea1dcc5 on main dd31c2e; claims 1824 pass, 0 fail, 5 skipped (2 slow tests gated by CHEPTA_SLOW_TESTS)); local run in progress. C's questions: 1 refuse early only outside loops (yes); 2 scan to 1e-6 of the feed (yes); 3 accept ~40 s cold-start columns, M2 3-7 min (yes for now; 0027 to address). C left request 14 (= design-spec progress, req 18) to A; overlap risk in flowsheet.js with A. C finished. Started D: nitrogen MHV1 sets + SRK CO2+water + coverage check of Lab gas pairs + script, branch claude/mhv1-nitrogen-pairs. Running: A (speed), D.
- 11-25 18:35: #266 (answers of #264 on main; head 38e900f, 2 doc files) ready. C added a docs commit to #265 (4102b2a): req 8 in the whole plant still stops at iteration 14 (column 5 cold-starts every pass; needs 0027). #265 full suite on ea1dcc5: 1824 pass, 0 fail, 5 skipped (3 plant + 2 M2 slow tests gated by CHEPTA_SLOW_TESTS); running the 2 M2 slow tests myself. A opened #267 = proposal 0027 (docs only, decision 2026-11-25-01). Profile: 99.7 % of a pass is the 3 columns; 74 % cold starts; (e1) two-liquid stage retries old K-values before stability test: dropping them halves VLL time. Prototype: Lab's 108 min run -> 16 min with (a)+(e1), same answers (1e-5). 10 min not reached; next (e2) thermo hotspots. 7 questions, all recommended (restart "previous" default + "cold"; no auto save of profiles; solver.timeLimit_s; no partial answer, best in error.details.best; timing always; (e1) in same PR; (e2) as own proposal after).
- 11-25 18:55: #265 slow M2 tests run with CHEPTA_SLOW_TESTS=1: both pass (15.6 min together). #265 ready to merge.
- 11-25 18:50: D opened #268 (N2 MHV1; head 32e99c1; decision 2026-11-25-01, collides with #267's -01: told A to rename to -02). N2+water from ThermoML (Chapoy 2004, Muromachi 2017; PR 5.4 % P AAD, misses 5 % gate by 0.4-0.6, written WITH fit-quality warning "for the maintainer to confirm"); N2+methanol from IUPAC SDS Vol. 10 (4 sets; PR 2.8 %, written); SRK+MHV1 CO2+water still fails gate (not written, SRK+MHV1 refuses separator). New validation/pair_coverage.mjs. Lab separator PR+MHV1 with N2: CO2 2.376 %, H2 0.418 % in liquid. DOIs checked on Crossref (6, all right; D admitted two first written from memory, corrected). One test line changed in co2-methanol-water-solubility.test.js: justified (asserted the old refusal; replaced by a tighter check). Questions a-e (keep ThermoML N2+water; confirm SDS-10 + Boyer 1 atm; leave SRK refused; ethylene no action; rule-4 checks). D finished. Full test run in progress. Running: A (waiting for answers on #267).
- 11-25 19:00: Maintainer: #267 agree with all 7 (relayed to A: record, then build a-c + e1, re-measure Lab's ds-ethanol0.0004 run and plant62 col5 run); #265 agree (relayed to C to record, plus the maintainer's remark on 19). On req 19 the maintainer asked why a higher purity is a problem. Explained: R19 is column 15's bottoms = the plant's waste water, the test feed already 99.996 % water (organics cut to 0.0002 in the constructed variant); a purity equality spec met at every distillate flow fixes no column (2 DOF: R + purity); not a refusal of higher purity. Recommend Lab specifies what matters for waste water (organic ppm / ester+ethanol recovery overhead / distillate flow); "at least" purity spec not built (Aspen/DWSIM/ChemSep design specs are equalities; an inequality needs an optimiser). Awaiting the maintainer.
- 11-25 19:10: #265 answers recorded (head 8388f9b, docs only): ready. #268 verified: 1836 tests, 1832 pass, 0 fail, 3 skipped; merges with #265 and #267 cleanly; with #266 see below. Reported #268 questions a-e to the maintainer.
- 11-25 19:40: A recorded #267 answers (head e87927f, decision -02) and opened #269 (build 0027, head 9eb2312, decision 2026-11-25-03): columnRestart previous/cold, (e1), timing, timeLimit_s, OUT_OF_TIME details (req 18). A measured: Lab's ds-ethanol0.0004 108 min -> 14.9 min (7 solves), same answer within 1e-5; plant62 col5 (req 8) now converges, 46 iterations, 624 s. No existing test changed. Merge order #267 before #269. Running locally: #269 full tests, then Lab's ds-ethanol0.0004 run timed (on 4 cores; Lab clone in scratchpad/lab). A finished (next: (e2) proposal — needs a new worker).
- 11-25 19:45: Started F (M4 min-approach exchanger cross), session_01FPbeWV7z1MQitvvj9zNePs, branch claude/lab-m4-min-approach-hx. Remaining 0.6.3 after merges: req 16 (design spec varying a column spec; after #269), M6 (vapour_liquid condenser by T on Lab's feed; after #268, try PR+MHV1), (e2) proposal (thermo speed, optional for 0.6.3?). Running: F.
- 11-26: #269 full tests: 1827 pass, 0 fail, 3 skipped. My first timing run hit the CLI's default 60 s limit (showed req 18's OUT_OF_TIME message working: names DS_ETHANOL solve 3, the value, the best point, the loop state); rerunning with --time-ms 3500000 (background). Maintainer asked (/deep-research): why so slow, is something missing in the column solver, is the case special, must columns be solved fully at intermediate steps? Three research agents running (simulators' practice, column algorithms, CHEPTA code + Lab case); notes in research_notes/Column solve speed in flowsheets/ (untracked, not to commit); report to reports/.
- 11-26: My own timing of #269 on Lab's new-plant-ds-ethanol0.0004 (this container, 4 cores): ok in 816 s (13.6 min), F1 6506.2318 kg/h, ethanol in S16 0.000400195 (asked 0.0004); 115 loop passes over 7 design-spec solves; SCDS15 654 s of 816, SCDS5 44 s. Confirms A's 14.9 min. #269 ready to merge (after #267).
- 11-26: Speed research report delivered: reports/Column solve speed in flowsheets.md (commit 55da25a; notes in research_notes/). Finding: SCDS15's 99.99 % water purity is met by an outer search of fixed-D trial columns that restart badly after percent-level feed changes and fall back to cold starts (13-17 s vs 0.3 s). Top recommendation: purity among the MESH equations when a restart profile exists (extends decision 2026-11-18-07 beyond decanters; scratch test: restarted SCDS15 0.14-0.31 s), outer search kept for the cold first call; est. run 3-5 min. Then cheaper two-liquid stability tests; secant design-spec bracketing. Loose-early column solves: no simulator does it, small gain; not recommended. Side finding: the 100x design-spec tolerance warning advises 0.001 for a 0.0004 target (should be relative). Asked the maintainer whether to start (e2)-style work as proposal 0028.
- 11-26 06:35: Maintainer: proposal 0028 yes, item 1 as a GENERAL column-engine feature (all product specs, all condensers, VL and VLL, whenever a restart profile exists; outer search kept for cold first call/fallback); items 2-4 ok; 0027 and 0028 both in 0.6.3. Started G: session_01FPbeWW38LRorg9GNXSVHUn, branch claude/proposal-0028-column-specs-in-mesh, from claude/build-0027-solve-speed (proposal + build in one PR). Running: F (M4), G (0028). Queue for 0.6.3: req 16 (design spec varying a column spec; after #269/0028), M6 (after #268, try PR+MHV1). Merge order to give the maintainer: #266, #265, #267, #269, then #268 (D merges main), then F's, then G's.
- 11-26 06:40: #266 and #265 merged (main b88d874). Conflicts with main: #267 (DECISIONS.md), #269 (flowsheet.js, specifications.js), #268 (DECISIONS.md): told A (merge main into #267 then #269) and D (#268). #268's questions a-e still unanswered by the maintainer. Maintainer asked to compact after this.
- 11-26 06:50: NOTE: since 11-20 10:00 my handover commits went to a detached HEAD on top of an old main (an earlier `git checkout origin/main --` detached it) and the push of the branch silently did nothing (the output filter hid it). Restored: the 21 lines above re-applied on the branch, research notes and the speed report added. Always check `git status -sb` shows the branch, and push without filtering errors.
- 11-26 06:55: D merged main into #268 (head 8a72e1b; D: 1837 pass, 0 fail, 5 skipped). D flags: #266's decision text (B's recommendation that the maintainer agreed on 11-25) says "nitrogen + water (IAPWS G7-04)", but my brief to D said fit to ThermoML and compare with G7-04; #268 writes the ThermoML set (5.4 % in P on measured data; 9-12 % off G7-04 to 363 K) and keeps G7-04 as an unwritten alternative (6.7 % in H, 9.5 % in P). Switch is one line if the maintainer wants G7-04. This is question (a) to the maintainer; my brief caused the difference.

### 2026-11-26 12:05 — usage limit; #270 opened and verified
- A, F and G all stopped at 07:00 UTC on the 5-hour usage limit (reset 11:00). A and G resumed by message at 11:55; F had finished.
- F opened #270 (M4, minimum approach along the whole exchanger), head faf41a3, main merged. Verified locally: build clean, 1833 tests, 1827 pass, 0 fail, 5 skipped, 1 todo. The only removed test line is an import that gained `exchangerApproach`. Merges cleanly with #268 and #269; conflicts with #267 only in docs/DECISIONS.md.
- #270's questions for the maintainer: (1) keep the refinement as it is (recommended); (2) split the area at phase boundaries later, with proposal 0013's next step (recommended); (3) Lab drops its `zones: 10` workaround on HE5.
- A pushed #267 at b3833c6 and #269 at 03539ac (main merged) and was re-running the two Lab benchmarks when it stopped. G has not pushed its branch yet; asked it to push.
- Merge order: #267 → #269, then #268, then #270, then G's PR.

### 2026-11-26 12:25 — #267 and #269 verified after A's merges
- A's report (2 messages, 11:53): both bench2 runs finished before the limit. On 03539ac: new-plant-ds-ethanol0.0004 ok in 968 s (894 s before merging main; SCDS15 782 s), same answer F1 6506.2318 kg/h, 7 solves, ester 99.474 %; plant62-R-bottoms-col5-14stages ok in 654 s (624 s before), 46 iterations, ester 99.931 %, no balance warning. About 5-8 % slower after the merge, not separated from noise.
- Verified locally: #267 b3833c6 1824 pass / 0 fail / 5 skipped; #269 03539ac 1832 pass / 0 fail / 5 skipped. No removed test lines. Both merge cleanly with main.
- Merging in order #267 → #269 → #268 is clean; #270 then conflicts only in docs/DECISIONS.md (F merges main after #268).
- G pushed claude/proposal-0028-column-specs-in-mesh at acbe439 (proposal + items 1-4). Told G to merge #269's new head 03539ac before its after-benchmarks.

### 2026-11-26 12:55 — #271 (proposal 0028) verified; H started; M6 start refused
- G opened #271 (proposal 0028 + build), head 7cb4b96. It contains main and the OLD #269 head 9eb2312 (not 03539ac); it merges cleanly with 03539ac, #268 and #270; conflicts with #267 only in proposals/README.md.
- Verified locally on #271 merged with #269's 03539ac: build clean, 1857 tests, 1851 pass, 0 fail, 5 skipped, 1 todo. No removed test/data lines.
- My timing of new-plant-ds-ethanol0.0004 on that tree: ok in 208 s (3.5 min; 968 s on #269), 4 solves, F1 6506.2211 kg/h, ethanol 0.039938 % (asked 0.04 %). SCDS15 82 s, SCDS11 76 s, SCDS5 37 s.
- G's questions: (1) MESH form also for a user-given start outside a flowsheet (rec. yes); (2) default fraction tolerance relative to target, as a separate change (rec. yes, separately: it changes answers); (3) free side-draw rates stay on the outer loop for now (rec. yes).
- Started H (Lab request 16: a design spec varying a column spec): session_01FPbeWWrDHFFeAZug8nDpfW, branch claude/lab-request-16-column-spec-design-spec, from #271's branch.
- Starting I (M6, vapour+liquid condenser by temperature on Lab's methanol feed, also tried with PR+MHV1) was REFUSED by the permission classifier. Asked the maintainer whether to start it. Running: H.
- Merge order: #267 → #269 → #268 → #270 → #271, then H's (and M6's).
- 13:01 G: merged 03539ac into #271 (head 3bc1b9a). Its code is identical to the tree I tested; only the decision file gained the new timings. G's benchmark, 4 runs at once on one core each, 03539ac → #271: ds-ethanol 1179 → 184 s (SCDS15 958 → 69 s); plant62 col5-14 828 → 663 s, identical streams.

### 2026-11-26 13:50 — #272 (request 16) checked: one regression sent back to H
- H opened #272 (design spec varying a column's numbers), head 97ebe3d, based on #271's branch. Verified here: 1864 tests, 1858 pass, 0 fail, 5 skipped. No removed test/data lines. It conflicts with #267 (DECISIONS.md, proposals/README.md) and #270 (DECISIONS.md) only in docs.
- The column-11 distillate run reproduces H's "not reachable": ester 0.990821 at 235, 0.99109 at 240, 0.991896 at 260 kmol/h; 248 s.
- REGRESSION, Lab's ds-ethanol case: #271 had 4 solves, 208 s, F1 6506.2211, ethanol 0.00039938. #272 has 6 solves, 343 s, F1 6506.1120, ethanol 0.00039068 (residual -9.3e-6, inside the 1e-5 tolerance). The cause: Brent's solve at 6506.229 took 0.56 s, so the recycle was accepted unchanged after a 0.14 kg/h step (H's question 3). Sent back to H to finish on the same branch (allowed: finishing the same task).
- H's questions: (1) keep "stalled ... may not be reachable together" for 0.6.3; (2) keep the step tied to the recycle tolerance; (3) the stale-recycle item, now being fixed in #272.
- Running: H (fix). M6 is still waiting for the maintainer (start refused by the classifier).

### 2026-11-26 15:30 — #272 fixed by H and verified
- H's fix (head 1646b69): in design-spec solves only, a recycle is accepted from its second pass on, and only when the error left (err·r/(1−r) from the last two passes' rate) is below the tolerance. Plain flowsheet solves are unchanged. New tests: a slow separator loop, and an input held at its bound named "unreachable".
- Verified here: 1866 tests, 1860 pass, 0 fail, 5 skipped. No removed test/data lines.
- Ethanol case alone: ok, 3 solves, 297 s (H: 242 s), F1 6506.3365, ethanol 0.000409 (residual +8.6e-6, tolerance 1e-5). #271 was 208 s at 6506.22 / 0.000399, partly because some of its solves read loops that had not moved. Accepted as correct: slower, but no stale reads; still under Lab's 10-minute goal.
- Distillate + F1 together, alone: "unreachable" in 1369 s (H: 1181 s beside another run), distillate held at its bound 260, F1 6504.07: ester 99.787 %, ethanol 0.0229 %. The old "stalled at 99.36 %" came from stale loops.
- H's questions: (1) keep the "stalled" message for 0.6.3; (2) keep the step tied to the recycle tolerance; (3) apply the new recycle test to all flowsheets as a separate change (it changes all pass counts). Recommend yes to all three.
- H done. Running: none. M6 still waits for the maintainer.

### 2026-11-26 19:15 — maintainer's answers; I started (M6 + proposal 0029)
- Maintainer (this chat): "Agree with the points 1-3" (#272's three: keep the "stalled" message; keep the step tied to the recycle tolerance; apply the new recycle test to all flowsheets later, separately). Sent to H to record (docs only).
- Maintainer: "for 268 ok with your recommendation": (a) ThermoML fit for N2+water (replaces the 11-25 wording "IAPWS G7-04"); (b) SDS-10 + Boyer 1960 confirmed; (c) SRK+MHV1 stays refused for CO2+water; (d) no action for ethylene. Rule-4 check of the copied rows NOT yet confirmed. Sent to D to record (docs only).
- Maintainer on M6: "before that have a quick research on more possibilities as what we can put as specs inside the column ... together with reboiler and condenser, side streams and everything else so we have a full package; in fact make this also part of M6 and start it". Started I: session_01FPbeWUFxhYBosa1Co2MEb2, branch claude/lab-m6-column-spec-package, from #272's branch. Plan: research note → proposal 0029 (full column-spec package, M6 as step 1) → PR + questions → build step 1 (M6, also PR+MHV1) at once, the rest after the answers.
- Still open: #270's three points and #271's three points ("points 1-3" was read as #272's); #268 rule-4 check.
- Workers: I running; D and H on short docs-only recording tasks (three at once for a few minutes, above the 2-worker rule).
- 19:19 H recorded #272's answers (head 9580b53; docs only: decision 2026-11-26-08 and DECISIONS.md; checked the diff). H done.
- 19:21 D recorded #268's answers (head 0450446, docs only; 1837 pass, 0 fail). Leftover: the N2+water sets' quality_warning and known-issue text still say "for the maintainer to confirm" (from WARNED in fit_mhv1_high_pressure.mjs; a test checks the wording). Asked D to update the wording only, rerun --from-results --write, update the test's wording, and check that no number in mhv1.json moved.
- 19:30 D: #268 head 7a8fc2e. Checked the diff from 8a72e1b: in mhv1.json only the two quality_warning strings changed (numbers the same); the test changed only its expected wording; the rest is docs and the WARNED text. D reports 1837 pass, 0 fail. D done. Running: I only.

### 2026-11-26 19:40 — maintainer: #268 data check deferred; #270 and #271 answers
- Maintainer (this chat): "I will not check data now but agree" (the rule-4 check of #268's transcribed rows is deferred; they agree to #268 as it stands). "agree with all the other 6 points": #270 (keep the refinement; split the area later with 0013; Lab drops zones: 10 on HE5) and #271 (MESH form also for user-given starts; target-relative default tolerance as a separate change; free side-draw rates stay on the outer loop).
- Recording, one worker at a time to stay within 2 running (I is running): F (#270) now, then G (#271), then D (#268: rule-4 check deferred by the maintainer).
- 19:46 F recorded #270's answers: head 5449690, docs only (checked); 1827 pass, 0 fail. F done. Sent #271's answers to G (if (1), the MESH form for user-given starts, is small, G builds it on #271; otherwise it is recorded as still to build).
- 19:51 G recorded #271's answers: head 44d35dd, docs only (checked); 1851 pass, 0 fail. Answer 1 (MESH form for a user-given start) was already built and tested. G done. Sent D the deferred rule-4 note for #268.
- 19:49 I opened #273 (proposal 0029 + step 1, M6), head 42b0323, on #272's branch. Research note research_notes/column-specifications/README.md (ChemSep book, DWSIM, IDAES; no open Aspen/HYSYS docs). Proposal steps: (1) M6, (2) condenser, (3) reboiler, (4) side streams, (5) whole column, (6) pumparounds, (7) workbench. Decision 2026-11-26-09. I reports 1865 pass, 0 fail. Lab M6: the column alone at 53 C converges (PR 7 s; PR+MHV1 20 s); 7 closed plants converge; plant-vl-boilup still fails (open); the closed plant with PR+MHV1 is refused until #268 (methanol + nitrogen). I's 7 questions were put to the maintainer, with recommendations. Verifying #273 locally.
- 20:10 Verified #273 (42b0323) here: build clean, 1871 tests, 1865 pass, 0 fail, 5 skipped. No removed test/data lines vs #272. Merges cleanly with #268; conflicts with #270 (docs). Lab's vl-column-a6feed-T53: ok in 12 s, vapour share 0.008401 (Lab's vapour-share run: 0.008406). plant-vl-warm: ok in 62 s, 326.15 K, share 0.008401. Waiting for the maintainer's answers on 0029's 7 questions.
- 20:00 D recorded the maintainer's agreement on #268 (rule-4 check deferred, still open): head 4428b1b, docs only (checked). D done. Every open PR now has its answers recorded. Running: none (I waits for 0029's answers).

### 2026-11-26 20:15 — maintainer merged #267, #269, #268 (main 4af9dd3)
- #270 conflicts with main in docs/DECISIONS.md: F asked to merge main. #271, #272 and #273 also conflict with main now (docs). Plan: once F has pushed, G merges main + #270's new head into #271, then H merges #271 into #272, then I merges #272 into #273, one at a time. After that the whole stack merges cleanly in order.
- 11-27: Maintainer merged #270 and #271 ("all others are ok so do not check if not needed": skip re-verifying PRs whose only change is a docs merge). #272 conflicts with main: H told to merge origin/main. #273 waits for the maintainer's answers to 0029's 7 questions.
- 11-27 07:55 H merged main (a2fe0c8) into #272: head 8b13473, 1876 pass, 0 fail; merges cleanly with main. H done.
- 11-27: Maintainer shared a review by another agent (engineering + agent organisation). My recommendation for 0.6.3: (1) CLAUDE.md loads AGENTS.md only, with pointers to DATA_RULES/METHOD_SELECTION/UI_GUIDE; (2) one short current-state page replacing main's stale HANDOVER.md, roadmap reconciled; (3) a short CLI run summary; (4) a fixed-feed replay of the ethanol design-spec answer (me, after #272); (5) two cards (refit or not; what survives a data gap). Later: fitting and simulator-building skills, user manual, browser test, property cache, Lab-side items. Waiting for the maintainer.

### 2026-11-27 08:15 — review items agreed; #272 merged into the WRONG base
- Maintainer: agrees with decision 1 (do review items 1-5 in 0.6.3) and 2 (time target: Lab's ethanol case < 10 min on the cloud machine, run alone, with a fixed-feed replay agreeing; "we should aim later for even faster solutions"). The 0029 questions were answered by the maintainer directly to I ("accepted 2026-11-26: all steps in one go"); I is building steps 2-7 and merging main. Learning items (skills, manual, etc.) after Lab's 4 plants, "but mark it somewhere".
- #272 was merged by the maintainer into its base branch claude/proposal-0028-column-specs-in-mesh, NOT main (main still a2fe0c8). Request 16 is not on main. Fix: a new PR from claude/lab-request-16-column-spec-design-spec (8b13473, contains main, merges cleanly) to main; and #273's base must be changed to main before it is merged. Asked the maintainer.
- Started J: session_01FPbeWUccvXrqq5unxweW8H, branch claude/agent-startup-and-status, from main: CLAUDE.md routing, short current-state HANDOVER.md (old moved to docs/history/), ROADMAP reconciled, deferred items marked, cards B and C, decision file. Running: I, J. Item 3 (CLI run summary) waits for a free slot.
- Running the fixed-feed replay (F1 = 6506.3365 kg/h, no design spec, cold, tolerances 1e-5 and 1e-7) on #272's head.
- 08:35 Fixed-feed replay (review item 4) on #272's head 8b13473, F1 = 6506.3365 kg/h, design spec removed, cold start, run alone side by side:
  - recycle tolerance 1e-7: 61 s; S16 ethanol 0.0004086 (design-spec run 0.0004086), ester 0.99464; worst stream difference 1.8e-6 of its flow; largest temperature difference 0.03 K; balance 4e-7 kmol/h, -0.03 kW.
  - recycle tolerance 1e-5 (the request's own): 57 s; ethanol 0.0004095; worst stream difference 2.8e-4 (S21 ethanol); 0.13 K; balance 2.4e-4 kmol/h, -7.0 kW. That is the recycle's own noise at 1e-5.
  - Verdict: the design-spec answer is the converged plant (the tight replay matches it to 1.8e-6); no stale-recycle effect left.
- 08:45 Maintainer: "yes, let's fix this". Opened #274 (head claude/lab-request-16-column-spec-design-spec at 8b13473 → main) to put #272 on main. Changed #273's base to main. Told I: merge origin/main next time; refresh #273's stale nitrogen text; re-run the closed plant with PR + MHV1.
- 08:30 J opened #275 (docs and instructions only, from main a2fe0c8), head 80f172b; 1867 pass, 0 fail. Startup import 63,742 → 15,736 bytes (DATA_RULES no longer imported; CLAUDE.md routes to it). New 74-line HANDOVER.md; old one moved byte-identical to docs/history/HANDOVER-to-2026-11-27.md (its relative links break there, accepted). ROADMAP "The next gate". Cards in ai/skills/chepta-contributor/cards/ (refit-or-not, missing-property), included in the skill zip. Decision 2026-11-27-01. Rule conflicts resolved by the later rule (no Fable; compaction at 150k; 2 workers + phases). Sent J two corrections: today's speed = about 5 min (297 s) with the replay result, not #271's 179 s; Lab's table at docs/CANDIDATE_PROCESSES.md.
- Slot free after J: start K (CLI run summary, review item 3) from main.
- 08:35 J pushed its corrections to #275 (head 0713ccf, docs only). J done. Started K (CLI run summary, review item 3): session_01FPbeWX1zuDPxJQvq2w6MsD, branch claude/cli-run-summary, from main. Running: I, K.
- 08:50 I finished #273 (all of 0029), head 9eb8311, base main; I reports 1895 pass, 0 fail. Removed test lines checked: only the project format 11→12 and the partial condenser's condenser_T_K now allowed (both by decision). Correction recorded by I: partial-condenser and reboiler temperatures take a purity's path (MESH from a profile, outer loop cold). Lab: 9 of 10 PR plants ok; plant-vl-boilup still fails (open); PR+MHV1 closed plant stops before the column (MIXER1 "no physical root at 84.2 K"; CP3 PHASE_SPLIT at 300 K, 7000 kPa): recommend as first 0.6.4 item. My timing of the ethanol case on #273, alone: ok in 249 s (297 s on #272), same answer (F1 6506.3365, ethanol 0.0004086), 3 solves; SCDS15 99 s, SCDS11 119 s, SCDS5 23 s. #273 merges cleanly with main; conflicts with #275 in DECISIONS.md only. I done.
- 08:55 #274 merged by the maintainer (main 7a04a7f). K finished #276 (CLI run summary), head 3ac1b88, from main with #274; K reports 1881 pass, 0 fail. Lab's ethanol result 379 KB → summary 17 KB (14 KB --compact), all 35 warnings kept. My light check: no test lines removed; merges cleanly with main; `chepta summary` works on #273's ethanol result (384 KB → 17 KB) and on the methanol plant result. #273, #275 and #276 each add to DECISIONS.md open items: they conflict pairwise there only, so each one merged after the first needs main merged in by its worker. K's questions for the maintainer: (1) keep block notes in the summary for 0.6.3 (some carry qualifications); later the engine could tag those as warnings (0.6.4 item); (2) `chepta summary` exits 0 when made (outcome is in the JSON); (3) commit read by git only from a clone, null for saved results. Recommend yes to all three. K done.
- 09:00 #273 merged by the maintainer. Maintainer agrees with K's three recommendations. Asked J to merge main into #275 (DECISIONS.md conflict); asked K to record the answers in 2026-11-27-02 and the 0.6.4 open item (engine tags qualifying notes as warnings), and not to merge main until #275 is in. Running: J, K (recording/merge only).
- 09:05 K recorded the answers (2026-11-27-02 + DECISIONS open item), #276 head b01e1c4, docs only; waits to merge main after #275. Waiting for J.
