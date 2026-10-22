# 2026-10-22: Supplier data as the last resort for single constants

Pull request: the supplier-data rule (docs/DATA_RULES.md section 1, AGENTS.md rule 1).

## What the maintainer decided

The maintainer, 2026-10-22: "some of these chemicals are sold on many shops. for example merck or sigma, tci or
similar. maybe we can make another rule. if nothing found in open literature than check these websites and if they
are similar within a small range take from there and note that it is an average for the values from few places. be
careful that for example maybe some of these chemicals are not pure, but we can accept analytical or reaction
purity."

The maintainer chose these details, from the options offered:

- **Agreement:** at least 3 suppliers; temperatures within 2 K of each other, densities within 1 %. The record is
  their mean, with the spread as its uncertainty.
- **Which properties:** single constants only: a melting point, a normal boiling point (or one at a stated pressure),
  a density at a stated temperature. Never fitted into a temperature curve, never mixed with measured values.
- **Purity:** an assay of at least 98 %, any grade (analytical, reagent, "for synthesis"). The grade and assay are
  recorded with each value.

## What changed

- **docs/DATA_RULES.md:**
  - section 1 gains a seventh, last-resort source and the rule "Supplier data, last resort";
  - the "Never" list now says supplier data are never fitted and are used only under that rule;
  - section 8 adds the tier `supplier`.
- **AGENTS.md rule 1:** item 7, pointing to the rule.
- **ARCHITECTURE.md:** the tier `supplier` in the table of quality tiers.
- **The interface:** the tier is shown as "average of supplier values, not a measurement".
- **test/properties.test.js:** accepts the tier for property records (a new kind of record, as DATA_RULES section 9
  allows).

## What was said with it

- Suppliers print melting ranges, boiling points, densities and flash points, not enthalpies of fusion or
  dimerization constants. So this rule does not close today's gaps: the dimerization constants of formic,
  propionic and acrylic acid, and the enthalpies of fusion of fumaric and itaconic acid
  (docs/decisions/2026-10-22-05-reactions.md). It helps later gaps of a single constant.
- Suppliers often print the same handbook value (Merck Index, CRC), so three agreeing pages may be one value. The
  record therefore says "an average of the values printed by N suppliers, not a measurement", and a measured value
  found later replaces it.

## Still open

- No record uses the tier yet. The first one will cite each supplier page with the product number, grade, assay and
  the date it was read.
