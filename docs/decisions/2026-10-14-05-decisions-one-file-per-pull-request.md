# 2026-10-14: the decisions log, one file per pull request

- **Asked:** the pull requests kept conflicting in `docs/DECISIONS.md`, because each one added its entry at the top of
  the same log. The maintainer chose option 1: the folder is the index.
- **Done:** the 22 entries of the log moved, unchanged, into one file each in `docs/decisions/`, named
  `YYYY-MM-DD-NN-topic.md` (NN keeps the order within a day), so GitHub lists the folder in date order.
  `docs/DECISIONS.md` keeps the open items and the standing rules, and points to the folder. AGENTS.md: each pull
  request adds a new file there instead of editing the log. Checked: the files hold every word of the old log.
- **Later, if wanted:** a page with titles and summaries, rebuilt by a GitHub Action after each merge (option 2).
