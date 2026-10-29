# 2026-10-29-05: Proposal 0015, M1, step 14 (W10): the interface guide and the first review of the workbench

The maintainer, 2026-10-29: "have the website visuals improved somehow when needed"; proposal 0015, answer 10: the
interface guide and the review of the workbench at M1.

## What was done

- **docs/UI_GUIDE.md**: the colours as tokens for light and dark (as `styles.js` and `app-styles.js` already define
  them), the spacing and type scales, the patterns of a workspace, of a block's panel in the flowsheet, of tables and
  charts, how warnings, missing data, "not available yet", refusals and errors look and are worded, what a new view
  follows, and the visual check of every pull request that changes a view (375 px and 1280 px, light and dark).
- **docs/ui-review/2026-10-29.md**: the workbench reviewed in every workspace at both widths and both themes; 17
  findings for the maintainer to choose from, each with its reason, the fix proposed and its size; the screenshots in
  docs/ui-review/2026-10-29/.
- **Fixed here, in W10's files only:** the duplicate "warn" icon (esbuild's warning); the Flowsheet ribbon cut off on
  phones; the Charts label "Pressures, kPa" hidden under its input.

## For the maintainer to decide

- Which of the review's 17 items to fix. W10 fixes them in small pull requests of their own; those in another
  workstream's view go with that view's owner.
- The guide's rules that are new rather than a description of what exists: nothing under 11 px on screen (charts
  included), "no open data" as the only wording for a missing value, round-off shown as 0, no literal colours.
