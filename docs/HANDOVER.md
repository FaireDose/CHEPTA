# Working rules and current state, for agent sessions

The page every coordinator and worker session reads first, after [AGENTS.md](../AGENTS.md). It holds the rules in
force and where the state of each item is kept; it is not a diary. Replaced on 2026-11-27
([decision](decisions/2026-11-27-01-agent-startup-and-status.md)); the page before that, unchanged, is
[history/HANDOVER-to-2026-11-27.md](history/HANDOVER-to-2026-11-27.md). Where it and a later dated decision differ,
the later decision holds: fix this page in the same pull request.

## Working rules (the maintainer)

1. **At most two worker sessions at a time**, counted across CHEPTA and CHEPTA-Lab together; the coordinator is not
   counted (2026-11-05, 2026-11-11).
2. **CHEPTA and CHEPTA-Lab work in phases, never at the same time** (2026-11-12): while a CHEPTA worker runs, no Lab
   worker runs. The coordinators tell each other when a phase ends.
3. **No Fable sessions.** Opus, or Sonnet for routine work (fits with the existing scripts, merges, documentation,
   small fixes); Opus for new models, solvers, proposals and engineering judgement (2026-11-10, 2026-11-12).
4. **One task per worker, one pull request.** A finished worker gets no new task. It may still record the
   maintainer's answers to its own pull request, merge `main` into its branch, or finish its own task (2026-11-10).
5. **Compaction near 150,000 tokens of context** (2026-11-27). A coordinator then brings this page and its running
   log up to date first.
6. **The maintainer merges; agents never do.** Workers report once, when the pull request is open, and once more
   only when blocked; no subscriptions, scheduled check-ins or polling (2026-11-10).
7. **New work starts from `main`.** Pull requests are not stacked (standing rule, [DECISIONS.md](DECISIONS.md)). The
   0.6.3 stack of pull requests built on unmerged pull requests was an exception, and it caused merge trouble (one was
   merged into its base branch instead of `main`).
8. **Read only the guide the task needs** (2026-11-27): AGENTS.md is loaded at startup; DATA_RULES.md before any data
   change, METHOD_SELECTION.md for a model choice, tests or numbers, UI_GUIDE.md for views
   ([CLAUDE.md](../CLAUDE.md), AGENTS.md "Working in the repository").

## Starting a worker

`create_session` with `source_url: "https://github.com/FaireDose/CHEPTA"`, `source_revision: "main"`,
`outcome_branch` set to the one branch it may push, and `model` by rule 3. The prompt names: the task; the guide it
needs (rule 8); open sources only, no numbers from memory; an independent reference and an open worked example; the
decision file's exact name (`docs/decisions/YYYY-MM-DD-NN-topic.md`, checked unused on `origin`); report once to the
coordinator's session id with the PR link, what to check and what to decide.

## The release gate

- **0.6.3** is the release before CHEPTA-Lab's next phase.
- **0.7.0** comes only after Lab has simulated its 4 complete plants from papers, compared stream by stream
  (the maintainer, 2026-11-13).
- What 0.6.3 holds, its speed target and what waits until after the 4 plants: [ROADMAP.md](../ROADMAP.md), section
  "The next gate".
- Version numbers are not copied here: the version on `main` is in [package.json](../package.json), the published
  ones are the [GitHub releases](https://github.com/FaireDose/CHEPTA/releases) and npm.

## The state of an item: four separate states

Say which of these an item has reached, each with its evidence; one does not imply the next.

| State | Means | Evidence |
|---|---|---|
| Proposal accepted | the maintainer accepted the proposal (only for items that need one) | the proposal's status and its decision file |
| Merged | the pull request is merged into `main` (not into another branch) | the merge commit on `main` |
| Released | a published version contains it | the GitHub release and its tag |
| Verified by Lab | CHEPTA-Lab ran its case on that released version and it passed | Lab's case table |

## Where things live

- [DECISIONS.md](DECISIONS.md): the open items and the standing rules.
- [decisions/](decisions/): one dated file per decision or pull request.
- [proposals/](../proposals/README.md): proposals and their status.
- The coordinator's running log: `docs/HANDOVER.md` on branch `claude/trusting-euler-2prvu8` (not merged; who runs,
  which PRs wait, what was relayed).
- Plant status: CHEPTA-Lab's case table ([CHEPTA-Lab](https://github.com/FaireDose/CHEPTA-Lab); the coordinator's
  log names `docs/reference/CANDIDATE_PROCESSES.md` there for the 4 plants).
- Documents a person must download by hand: [missing-properties/TO_DOWNLOAD.md](missing-properties/TO_DOWNLOAD.md).

## Talking to the maintainer

The maintainer is a chemical engineer, not a programmer. Plain language, short messages, tables; "they", never a
guessed pronoun. Each message: what is ready to merge, what to check against a source, what to decide (with a
recommendation for each), and nothing else. Decisions reach workers through the coordinator.
