# 2026-11-10-01: How the agents work, to spend less usage

The maintainer, 2026-11-10: "before proceeding i want to check again why the usage goes out immediately? ... on what
in this software is the most usage coming from?", then: "yes, write the handover session, then do also the other
recommendations. i am thinking about the lighter model if it can be coordinated by the new handover coordinator as
well".

## What the session records showed (2026-11-10)

The coordinating session (2026-10-03 to 2026-11-10) held about 600,000 tokens of context and had re-read about 3.8
billion tokens in total, against under 8 million it wrote: every tool call and every relayed message re-reads the
whole conversation. Worker sessions cost a few percent of that each, more the longer they lived (the Wilson session
grew to about 740,000 tokens over three tasks). Reading PDFs, running tests and builds, and the code itself were small
by comparison.

## What was decided

- A handover page, [docs/HANDOVER.md](../HANDOVER.md): the state, the queue, the open questions and the rules below; a
  new coordinator starts from it, and writes a new one (replacing the state and queue) when its own context passes about
  150,000 tokens.
- One task, one session, one pull request; a finished worker is not given a second task.
- At most two worker sessions at a time (the maintainer, 2026-11-05).
- A lighter model (Sonnet) for routine work (fits with existing scripts, merge conflicts, documentation, small fixes),
  chosen by the coordinator per session; Opus for new models, solvers, proposals and engineering judgement. The
  coordinator may itself run on Sonnet.
- Workers report once, when the PR is open; no subscriptions, check-ins or polling.
- The low-pressure comparison of MHV1 with plain NRTL is not done (the maintainer, 2026-11-10).
