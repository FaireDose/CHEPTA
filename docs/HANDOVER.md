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
   green, waiting for the maintainer (Liu 2013 rows, Pirola quote; four decisions, all recommended yes). #236's worker hit
   the 5-hour limit overnight; resumed 2026-11-13. A small fix for step 3: an opened warning repeats its first line as the text's first sentence. Then, the
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
