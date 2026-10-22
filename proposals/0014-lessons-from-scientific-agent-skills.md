# 0014: Lessons from the scientific agent skills of K-Dense: finding, reading and checking data

- **Status:** Accepted for steps 1 and 2 (the maintainer, 2026-10-22); steps 3 to 5 not decided
- **Author(s):** CHEPTA maintainers (drafted with an AI assistant)
- **Discussion:** this pull request
- **Roadmap item:** data track (D), the data rules (docs/DATA_RULES.md), track G (agents)

## Problem

The maintainer asked (2026-10-22) whether anything in
[K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills) (MIT licence; each skill
states its own, mostly MIT, LiteParse Apache-2.0) is useful for CHEPTA's checks of data, models and ways of
engineering. They asked that nothing be added until they decide; this proposal is the answer.

The skills are instructions and small scripts for AI agents, mostly for biology and medicine. The catalogue
(`docs/skills.md`, reviewed 2026-09-30, 177 skills) was read, and five skills in full (`paper-lookup`,
`database-lookup`, `uncertainty-and-units`, `liteparse`, `scientific-critical-thinking`). None does chemical
engineering thermodynamics. The closest are `cantera` (ignition kinetics) and `pycalphad` (alloys). But four of
them name problems CHEPTA met today, 2026-10-22:

1. **Finding the open copy.**
   - Baird et al. (2019), which has levoglucosenone's vapour pressures, is open access. Unpaywall lists only the
     publisher's copy, which refuses scripts; the Aalto repository serves the same PDF. Our earlier searches marked
     levoglucosenone "no open data".
   - Three other open articles (Wasik et al. 2025, a DTU review, Chao and Zwolinski's reprint) were found by web
     search, not by a script.
   - `paper-lookup` queries 18 open scholarly APIs: CORE and OpenAlex list repository copies; CORE and Europe PMC
     search inside full texts.
2. **Answers that look right but are not.**
   - Several downloads today returned "200 OK" with an HTML page saved as a ".pdf" (Springer, TU/e, DTU).
   - `paper-lookup` says it plainly: "These APIs can fail with HTTP 200 ... Verify the shape of what you got, not
     just the status code."
3. **Uncertainty.**
   - CHEPTA records state the largest deviation of a fit, and since 2026-10-17 the stated uncertainty they are held
     to. But they do not give the uncertainty of the fitted curve itself, and nothing carries it to a result (a
     bubble point, a duty, K of a reaction).
   - `uncertainty-and-units` covers GUM budgets, Monte Carlo propagation through curve fits, and checks of units and
     plausibility (dimensionless groups).
4. **Reading tables.** Values are transcribed from pdftotext's layout text, or from page images by eye (Chao and
   Zwolinski's Table 8 today). `liteparse` gives text with positions on the page (bounding boxes) and page images,
   so a table can be read twice, in two independent ways.

## Proposal

Nothing is installed. The skills are other people's instructions to agents, and their scripts would be code CHEPTA
runs. The ideas are rewritten as CHEPTA's own small scripts and rules, each a separate pull request the maintainer
accepts or declines.

1. **A wider open-copy search** (`validation/python/open_copy.py`):
   - beside Unpaywall, ask OpenAlex (`locations`) and CORE (repository copies) for every copy of a DOI, so a
     repository copy is found when the publisher's refuses scripts;
   - check that a download is a PDF (the "%PDF" header), not a "200 OK" HTML page.

   No new data rule: a repository copy of an open article is already open (DATA_RULES section 1).
2. **A full-text search for measured values in open articles**, the maintainer's idea of 2026-10-22 ("articles where
   you see simulations ... have some data and cited sources"):
   - for each "no open data" marker, search CORE's full texts for the compound's names together with the property
     (for example "levoglucosenone" and "vapor pressure");
   - list the open articles found in the marker's `searched`, for a person to read.

   It finds candidates; it never takes a number by itself.
3. **The uncertainty of a fitted record** (a step after 1 and 2, and only if wanted):
   - each record fitted to measured values gets the uncertainty of its curve, from the stated uncertainties of the
     values by Monte Carlo (refit to values drawn within their uncertainties);
   - the engine can then show it next to a result as "±". The method follows GUM Supplement 1 (JCGM 101:2008, free
     from the BIPM).
4. **A second reading of transcribed tables:** where a table is transcribed, a script reads it a second way (the
   text layer with positions, or pdftotext on the cropped table) and compares the two readings value by value. A
   person still checks every number (AGENTS.md rule 4).
5. **A short evidence checklist for data pull requests** (in the pull request template's reviewer part), from
   `scientific-critical-thinking`, written for thermodynamic data:
   - the measurement method suits the substance (transpiration and a dimerizing acid);
   - the sample's purity;
   - the stated uncertainty and the consistency test;
   - whether the values are measured, evaluated (a reference-data table) or quoted from a databank.

Not proposed:
- the biology, medicine, quantum and machine-learning skills;
- `pycalphad` (alloys);
- the cloud services (Rowan, Modal);
- `DataLad`: CHEPTA's records already name their script and data file. A provenance manifest could come later.

## Engineering basis

- GUM: JCGM 100:2008 and Supplement 1, JCGM 101:2008 (Monte Carlo propagation), free from the BIPM
  (https://www.bipm.org/en/committees/jc/jcgm/publications).
- CORE (https://core.ac.uk/services/api), OpenAlex (https://docs.openalex.org) and Unpaywall: open APIs, free to use;
  CORE asks for a free key for full-text search.
- Validation of each step:
  - (1) the open copies found for the DOIs of today's decisions;
  - (2) levoglucosenone (Baird 2019) found again by the search;
  - (3) a vapour-pressure record's Monte Carlo band compared with the analytic one of a linear fit;
  - (4) the second reading agreeing with the transcribed Table 19 of Baird 2019 and Table 8 of Chao and Zwolinski.

## Effect on existing work

None until a step is accepted. Steps 1, 2 and 4 are tools for contributors. Step 3 adds a field to fitted records
and a display. Step 5 adds lines to the pull request template.

## Alternatives considered

- **Install the skills as they are.** Rejected: they are instructions written for other fields, they would change
  how an agent works in this repository outside its rules (AGENTS.md), and their scripts would run here unchecked.
- **Do nothing.** Today's searches showed the cost: open data marked "no open data", and downloads that silently
  failed.

## Steps

Steps 1 and 2 were accepted by the maintainer on 2026-10-22 ("at 162 i go first for points 1 and 2") and are in
docs/DATA_RULES.md, section 1 ("How to search for a missing number", "Free copies"); decision:
docs/decisions/2026-10-22-09-search-tools.md. Steps 3 to 5 wait for the maintainer.


1. `open_copy.py`: OpenAlex and CORE copies, and the PDF check. Test on the DOIs of 2026-10-22.
2. The full-text candidate search, writing candidates into the markers' `searched`.
3. If wanted: the Monte Carlo uncertainty of fitted records, and its display.
4. The second reading of transcribed tables.
5. The evidence checklist in the pull request template.
