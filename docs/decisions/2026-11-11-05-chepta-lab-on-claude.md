# 2026-11-11-05: CHEPTA-Lab moves from Astra 6 to Claude, with an independent check of its evaluations

## What the maintainer decided (2026-11-11, to the coordinating session)

"i will switch from Astra 6 to claude as well so i can work on Chepta-Lab also in a coordinated session here", then,
after the coordinator's three conditions: "when we have two free slots start the CHEPTA-Lab and embedd in the rules
that another ai model needs a check like you said".

1. **CHEPTA-Lab gets its own Claude coordinator session**, separate from CHEPTA's, with its own handover file in the
   CHEPTA-Lab repository. It starts when two worker slots are free. The two coordinators pass capability requests and
   release notices to each other by short messages.
2. **One limit on workers across both repositories**: at most two worker sessions at a time, CHEPTA and CHEPTA-Lab
   counted together (docs/HANDOVER.md, usage rule 2). Fable 5.2 sessions are not counted while that model is free to
   use (from 2026-11-11, for a few days).
3. **An independent check of the evaluations**: ROADMAP.md, "CHEPTA and CHEPTA-Lab", rule 7. Lab's held-out evaluation
   cases and their expected answers are reviewed by the maintainer or by an AI model of another family (for example
   Astra 6) before use. Every score names who reviewed its cases. No Claude session that writes CHEPTA code sees the
   held-out cases.

## Why

CHEPTA-Lab measures how well AI assistants use CHEPTA. With Claude building the simulator, writing the cases and being
evaluated on them, the same model family would grade itself; an outside reviewer of the held-out cases keeps the
scores honest. The Astra 6 review of 2026-11-04 (the order of Lab's next steps) is an example of what such a check
adds. A review by another model is a second opinion; it never replaces the person's check of numbers (AGENTS.md rule
4).

## Still open

- The CHEPTA-Lab repository must be attached to the new coordinator session; its own rules file (its AGENTS.md or
  equivalent) takes rule 7 over when that session starts.
