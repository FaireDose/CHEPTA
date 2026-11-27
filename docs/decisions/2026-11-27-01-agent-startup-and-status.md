# 2026-11-27-01: Agent start-up and status pages, for 0.6.3

An outside review of how agents work in this repository (2026-11-26/27) found two problems, and the coordinator
checked both against `main`:

- CLAUDE.md imported docs/DATA_RULES.md (49,174 bytes) into every session, even for tasks that touch no data, though
  AGENTS.md rule 1 already says to read it before adding or changing data.
- docs/HANDOVER.md on `main` was stale: written 2026-11-10, it still said the published version was 0.5.0 and that
  Fable sessions were not counted. Workers could pick up old rules from it and restart finished work.

The maintainer agreed to fix both in 0.6.3 (2026-11-27), and: "the learnings things we do after CHEPTA-lab 4 plants
check ok, but mark it somewhere"; on speed, the target for 0.6.3 is Lab's ethanol design-specification case under 10
minutes on the cloud machine, run alone, with a fixed-feed re-run agreeing, and "we should aim later for even faster
solutions".

## What was decided and done

- **CLAUDE.md** loads `@AGENTS.md` only. Below it, plain paths say which guide to read: DATA_RULES.md in full before
  adding or changing data, METHOD_SELECTION.md for a model choice, tests or numerical changes, UI_GUIDE.md for views;
  combine them when a task overlaps, and read the next one when a task grows into another kind. The same routing is
  in AGENTS.md ("Working in the repository"), for agents that do not read CLAUDE.md, and in CONTRIBUTING.md and the
  contributor skill. AGENTS.md rule 1 now says DATA_RULES.md is read in full, also when a task of another kind comes
  to touch data. No rule was weakened.
- **docs/HANDOVER.md** is a short page of the rules in force, the release gate, the four states of an item (proposal
  accepted, merged, released, verified by Lab) and where things live. It copies no version number (package.json and
  the GitHub releases hold them). The old page is kept unchanged in
  [docs/history/HANDOVER-to-2026-11-27.md](../history/HANDOVER-to-2026-11-27.md); its relative links point from
  `docs/`, so some no longer resolve from `docs/history/`.
- **ROADMAP.md**: a section "The next gate" (0.6.3, then Lab's 4 complete plants, then 0.7.0), the 0.6.3 speed target
  on its own line, the later faster target and the deferred items; the method named PR/SRK + gE (MHV1) throughout,
  PSRK and MHV2 marked not available; the "four agent sessions" of 2026-11-04 replaced by the working rules.
- **Deferred until Lab's 4 plants pass**: the items listed in the open item "After Lab's 4 plants: skills and manual"
  of [DECISIONS.md](../DECISIONS.md) and in the roadmap.
- **Two guidance cards** in `ai/skills/chepta-contributor/cards/`: "Do conflicting measurements justify a refit?"
  (monoethanolamine and glycerol, PR #101; methyl myristate, PR #119) and "Which calculations still work when a
  property is missing?" (alpha-angelica lactone + water, PR #142, `test/no-vapour-pressure.test.js`; My data, PR #131).

## Where an older rule differs

- **Fable.** The 2026-11-10 page (rule 2) and docs/decisions/2026-11-11-05-chepta-lab-on-claude.md said Fable
  sessions were not counted while free. The maintainer's later rule (2026-11-12, in the coordinator's log): no Fable
  sessions. The later rule holds.
- **Context limit.** docs/decisions/2026-11-10-01-working-method.md: a coordinator past about 150,000 tokens writes a
  new handover and stops. The 2026-11-27 brief: compaction near 150,000 tokens. The later rule holds; the new page
  asks the coordinator to bring the page and its log up to date first.
- **Parallel sessions.** ROADMAP.md (2026-11-04) allowed four agent sessions at a time; the maintainer's limit of two
  workers (2026-11-05) and the phases (2026-11-12) hold.

## Startup text (bytes, `wc -c` of what CLAUDE.md imports)

| | CLAUDE.md | AGENTS.md | DATA_RULES.md | Total |
|---|---|---|---|---|
| Before | 31 | 14,537 | 49,174 | 63,742 |
| After | 563 | 15,173 | not imported (0) | 15,736 |

About 75 % less text at startup (63,742 to 15,736 bytes). Nothing else was measured.
