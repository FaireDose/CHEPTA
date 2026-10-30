# 2026-10-30-01: The methods track (Wilson, PSRK, CPA, PC-SAFT, electrolytes, ionic liquids)

The maintainer, 2026-10-30: "is it in your planning to upgrade the methods as well to include Wilson, PC-SAFT, ionic
methods? please check and maybe add these somewhere in the future milestones if not".

## What the plans said

docs/METHOD_SELECTION.md names these methods and marks them "not available"; the roadmap had no item for any of them,
only "Electrolytes, solids and polymers" under "Later". Wilson is even recommended by the method guide (one liquid) but
not built. CPA was left out of proposal 0015 on purpose and is item 7 of "Engineering" in DECISIONS.md.

## What changed

- ROADMAP.md: a **Methods track (M)**, M1 Wilson, M2 PSRK and MHV2, M3 CPA, M4 PC-SAFT and Flory-Huggins, M5 electrolytes
  (electrolyte NRTL, Pitzer), M6 ionic liquids, each with what it is for and which open parameters are known; Wilson in
  release v0.6 (small: ChemSep ships Wilson parameters, `wilson.json`, Artistic License 2.0, as for NRTL and UNIQUAC);
  a new release **v0.9 – Advanced thermodynamics** for M2 to M6.
- docs/METHOD_SELECTION.md: its "not available" rows point to the roadmap items.
- Each method still needs its own proposal (AGENTS.md), with open parameters only and tests against an independent
  implementation and open data.

## To decide

- Whether Wilson (M1) should start now, beside M2b, or after M3; and which of M2 to M6 matters first for the maintainer's
  processes (CPA for water + hydrocarbons is also the real fix of the P-H flash failure).
