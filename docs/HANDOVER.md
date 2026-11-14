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
