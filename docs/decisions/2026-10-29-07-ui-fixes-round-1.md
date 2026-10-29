# 2026-10-29-07: Proposal 0015, step 14 (W10): the first round of fixes from the workbench review

The maintainer, 2026-10-29, after merging the interface guide and the review (#177): "ok, approved. you select what
we change". The interface guide's new rules (11 px, "no open data", round-off as 0, no literal colours) are taken as
approved with it.

## What was chosen and done

From docs/ui-review/2026-10-29.md, items 1, 2, 3, 6, 8, 13, 14, 15, 16 and 17; the list there, under "Round 1 of
fixes", says what each became and which items wait, and why. Outside W10's own files this changes, visually only:
`txy.js` and `plot.js` (a smaller drawing on phones), `app-views.js` (passes `compact` to the T-x-y), `app.js` (one
label), `flowsheet-view.js` (duties below 1 mW shown as 0; the locked blocks' button labelled "Later").

## For the maintainer

- Whether 1 mW is the right threshold for "zero" duty (the solver's round-off seen was 7e-9 kW).
- Which of the items left for later to take next.
