# 2026-10-30-05: The methods track (Wilson, PSRK, CPA, PC-SAFT, electrolytes, ionic liquids)

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

## The maintainer's answer (2026-10-30)

"when to start with wilson and M2? decide yourself. for the others we find data where we have and we implement the add
data yourself method."

- **Wilson (M1)** starts when the four pull requests of M2b are merged (the limit of four open pull requests), in one
  session and one pull request; it ships with v0.6.
- **M2** starts when M1 is merged. First a source check of PSRK's group tables; if they are not open, the method uses
  Modified UNIFAC 2.0 (CC BY 4.0, already in CHEPTA) in the gE mixing rule the proposal chooses.
- **M3 to M6** follow in order (CPA, PC-SAFT, electrolytes, ionic liquids; PC-SAFT reuses CPA's association term). Each
  ships with the open parameters a search finds and with **My data** (proposal 0012) for the rest: the user adds the
  method's parameters with a source and the tier "user", as for NRTL, UNIQUAC and k_ij today.
- To spend fewer tokens: one session at a time unless the work is independent; small items (Wilson) as one proposal and
  implementation in one pull request; a fresh session per milestone instead of one long session.

The file was numbered 05 because the M2b sessions may use 2026-10-30-01 to 04.
