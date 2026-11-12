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
   (2026-11-11). While Fable 5.2 is free to use (from 2026-11-11, for a few days), Fable sessions are not counted.
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

## State on 2026-11-10

- `main` at 9e29672 (#214 merged); full `npm test` 1494 of 1495 pass, 0 fail, 1 known TODO. Published version 0.5.0.
- Done since 0.5.0: Wilson (with ThermoML fits), membrane, absorber and stripper, Henry's law components, extraction
  and its view, evaporator, crystallizer with slurry outlet and solids in every block, solubility curves, liquid-liquid
  fits, k_ij = a + b/T, MHV1 ("SRK/PR + gE (MHV1)", proposal 0018, engine only), proposal 0019 (two liquids, step 1),
  the method rule "check other simulators", the program after M4 in the roadmap, CHEPTA-Lab's section.
- Work on branches, not merged, both stopped when the weekly limit was reached on 2026-11-07:
  - `claude/pipe-block`: the Pipe block (proposal 0020), last commit 2026-11-07 "independent Python reference
    (CoolProp), worked examples and refusals". Still to add: the Pipe workspace under Unit models (the maintainer,
    2026-11-07: "put it in the model tab so I can check a pipe without doing a flowsheet").
  - `claude/d9-two-liquid-refit`: proposal 0019 steps 2-5, complete at 4986f79 (2026-11-05 15:31 UTC). It was
    missing from GitHub on 2026-11-10 and was pushed back unchanged the same day. 10 commits ahead of main, 32 behind.
  - Finish each in a fresh session that reads its branch and its decision file, not in the old sessions (they hold
    300,000 to 740,000 tokens of context).

## Queue, in order

1. Two-liquid refit (0019 steps 2-5): a merge-and-test job, not a redo. A fresh Opus worker checks out
   `claude/d9-two-liquid-refit`, merges origin/main in (merge commit; conflicts expected in binaries.json,
   known-issues.json, DECISIONS.md, sources.json; LICENSES.md regenerated by make_sources.py), runs the full test,
   opens the PR. Its description carries the two open decisions with the coordinator's recommendations: (a) accept that
   only furfural + water and 2-butanol + water got joint fits, list the others as a follow-up data task with the
   reason; (b) keep 1-propanol + water and acetonitrile + water labelled "contradicted" and check that proposal 0019
   answer 5 is applied (another set of the pair becomes the default where one exists). Starts when one of the two
   running workers reports.
   2026-11-10, second coordinator: started session_01FPbeWV9iSu48kT5ogbUByo (item 2, Pipe, Opus, branch
   `claude/pipe-block`) and session_01FPbeWY9j2N2BLmp9R117hg (item 3, MHV1 interface, Sonnet, branch
   `claude/mhv1-interface`).
State at 2026-11-10 23:15 UTC: #218 and #219 merged; #220, #221 and #222 open, each clean against main and against
   each other (checked by trial merges), no worker running. The maintainer accepted every recommendation on #218-#221.
   - #222 benzene + methanol (session_01FPbeWXkVXDkXeiaEwNjZjS): ChemSep NRTL the default by answer 5; also regenerated
     validation/fixtures/flowsheet-suite.json (case G14 contains the pair). Open: the worker saw numerical drift when
     re-running two_liquid_labels.py --write (about 2100 lines of labels and known issues), so the committed labels may
     not be reproducible. Recommended follow-up (Opus): make the labels script reproducible (find the source of drift:
     solver tolerances, library versions) before any further rerun.
   - Follow-up data task from #218 (a): the pairs not refitted (table in #218's description).
   - Later small change (from #220): align the flowsheet Method page's pair notes with the Inputs panel's.
   - 2026-11-11: #220-#222 merged; release v0.6.0 live on npm (approved by the maintainer; `latest` is 0.6.0); the version PR, merged,
     FaireDose/CHEPTA#223 opened by the coordinator (Actions may not open PRs); the sync job fixed on
     `claude/trusting-euler-2prvu8` (docs/decisions/2026-11-11-03-release-0.6.0.md). Running: Fable 5.2 on column
     specifications and side draws (session_01FPbeWVRtHfgQpQsNCeF1x6, branch claude/m4-column-specs); Opus on the
     reproducible two-liquid labels (session_01FPbeWXtto9EJo2KEAdKB5T). Then CHEPTA-Lab pins 0.6.0.
2. Finish the Pipe block with its Unit models workspace (0020). Opus.
3. (Built, in review: docs/decisions/2026-11-10-03-mhv1-interface.md.) MHV1 in the interface: "PR + gE (MHV1)" and "SRK + gE (MHV1)" in the Model selector, the flowsheet's Method page,
   the column's method, project files and `CHEPTA.run` (thermo `mixing`), the command line and MCP. No low-pressure
   comparison study (the maintainer, 2026-11-10: not needed). Sonnet or Opus.
4. Release 0.6.0: the maintainer creates the GitHub release with tag `v0.6.0`; `.github/workflows/publish.yml` sets
   the version from the tag, publishes to npm (the maintainer approves the staged version on npmjs.com) and pushes the
   version back to `main`. Then CHEPTA-Lab runs its cases against the published 0.6.0 package and files capability requests.
5. Later, by the roadmap: proposal 0015 M3 leftovers (benchmark flowsheets, share by link) and M4 (purity and recovery
   specifications, side draws, equipment cost E2 and utilities E3); the gas-hydrate check; an NH3 + water NRTL fit;
   NRTL pairs for water + glucose and sucrose; CPA for CO2 + water (methods M3); the user's own slurry viscosity and
   density for the pump.

## CHEPTA-Lab moves to Claude (the maintainer, 2026-11-11)

- When two worker slots are free (Fable sessions not counted), start a separate CHEPTA-Lab coordinator session on
  https://github.com/FaireDose/CHEPTA-Lab (not this session): its own handover file in that repository, the same usage
  rules, `chepta@0.6.1` pinned, then the roadmap's order (ROADMAP.md, "CHEPTA and CHEPTA-Lab", "Next, in this order").
- The two coordinators exchange capability requests and release notices by short messages.
- ROADMAP.md, "CHEPTA and CHEPTA-Lab", rule 7: Lab's held-out evaluation cases are reviewed by the maintainer or by an
  AI model of another family before use; no Claude session that writes CHEPTA code sees them.
- Decision: docs/decisions/2026-11-11-05-chepta-lab-on-claude.md.

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
