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
- **Open PRs waiting for the maintainer:** #227 column purity/recovery specifications and side draws (proposal 0015
  step 11, M4; seven decisions, recommendations in its decision file 2026-11-11-01).
- **Running workers:**

  | Session | Model | Task | Counted |
  |---|---|---|---|
  | session_01FPbeWV6v28HcnkuHkqBeF9 | Sonnet | two-liquid pairs not refitted in #218 (decision file 2026-11-11-06) | yes |
  | session_01FPbeWUNd3ZWdPaYwB7BeFQ | Sonnet | Lab capability requests 2-5 (sets message, MHV1 warnings, MHV1 source ids; 2026-11-11-09) | yes |

  Stopped on the 5-hour limit on 2026-11-11 with nothing pushed (their branches do not exist), Fable, not to be resumed
  (no Fable): proposal 0021 step 1 (session_01FPbeWVaRyxCA4YVjgf6jXc) and acetic acid in columns
  (session_01FPbeWWQkqeGndx5sPQ3zMS). Both go back in the queue for Opus.

## Queue, in order

1. Relay the reports of the running workers. Lab's requests from CHEPTA-Lab#5: 1 in #227; 2-5 in the requests worker;
   6 (SRK + gE (MHV1) for CO2 + water) only if the maintainer asks.
0. Usage rules (the maintainer, 2026-11-12, from session_01FPbeWW7BAkeYbFJnho1BYY's measurements): one Sonnet worker,
   when no other worker runs: `npm test` quiet (dot reporter on screen, the full TAP written to a file at the same time;
   `npm run test:verbose` keeps the old output; CI keeps the full output); never open the big data files or generated
   lists whole and use `git diff --stat` for src/data and validation/data, with a lookup script
   (`node scripts/show.mjs component ethanol`, `... pair ethanol water`); the "cheap checks" rule copied into AGENTS.md;
   `@docs/DATA_RULES.md` removed from CLAUDE.md (AGENTS.md rule 1 still sends data work to it); one script for the
   nine steps of DATA_RULES section 9. Shortening DATA_RULES.md itself: later, reviewed line by line by the maintainer.
1a. Restart with Opus: acetic acid dimerization in columns (Lab blocker; the earlier prompt is in this session's
   events), then proposal 0021 step 1 (measured VLE points, x-y / γ / α diagrams).
2. Column specifications follow-ups (after #227): inequality specifications first ("at least 0.99", "at most
   10 ppm"), then the draw of one of two liquids, pumparounds, side draws on absorbers.
3. Proposal 0021 step (c): the flowsheet's tabs and examples; then the rest of the proposal's steps. The "next" layout
   becomes the default only after steps 1-3 and a check by users; "classic" stays two versions.
4. M4 remainder (proposal 0015 steps 11-12): the benchmark flowsheets; cost correlations E2 and utilities E3 (P5,
   v0.7), by the bounded-cost rules in ROADMAP.md.
5. Small: align the flowsheet Method page's pair notes with the Inputs panel's (from #220).
6. Later: NH3 + water NRTL; water + glucose/sucrose NRTL; CPA for CO2 + water (M3); gas-hydrate check; the user's own
   slurry viscosity and density for the pump; Beggs-Brill for the Pipe; ChemE-as-Code bridge (B6: CHEPTA's command
   line as a simulation backend through their files only; their code is AGPL, never copied).
7. Next release (0.6.1 or 0.7) when #227 and the acetic-acid columns are in, so Lab can try its first
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
dimerization model in columns and the three-phase flash, purity specifications, and the methanol separator (now
possible with PR + MHV1 once item 3 is done).
