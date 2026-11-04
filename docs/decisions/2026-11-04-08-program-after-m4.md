# 2026-11-04-08: The program after M4, and how CHEPTA works with CHEPTA-Lab

The maintainer, 2026-11-04: "first i want you to propose the steps after M4 so I know the complete picture. Of course,
somehow the agents shouldn't get stuck in the cost estimations but it is good to start working on this as well ... Ok
also with the three proposals for CHEPTA-Lab"; and earlier: "i am ok to have reactive distillation for later".

## What changed

- ROADMAP.md, "The program after M4 (v0.7 to 1.0)": phases P5 cost (bounded, v0.7), P6 agentic design with CHEPTA-Lab
  (v0.8), P7 advanced thermodynamics (v0.9; M2 alongside P5), P8 stability and bridges (v0.10 and later), and later (reactive
  distillation, optimization, dynamics, batch, solids, LCA). At most four agent sessions at a time.
- The rules that keep cost work from stalling: one workstream in parallel; one open source per equipment family,
  searched once; otherwise "no open data" and the user's own cost in My data; index year and accuracy range stated;
  a missing cost is a warning, never a refusal.
- ROADMAP.md, "CHEPTA and CHEPTA-Lab": Lab pins released versions; Lab's blockers are capability requests (a new issue
  form, .github/ISSUE_TEMPLATE/capability-request.yml); G2 to G5 are done in CHEPTA-Lab, CHEPTA keeps G1 and G6 and takes
  Lab's reviewed cases as benchmarks; no training data flows back into the databank.
- Reactive distillation: later.
- No 1.0 (the maintainer, 2026-11-04: "i do not need to have 1.0. i can continue with 0.xxx because i am not releasing it
  officially until i am happy"): versions stay 0.x; A12 is the stability policy for an official release, whenever the
  maintainer decides on one.
- Data track D9, pairs with two liquids (the maintainer: "we need to think about the whole structure of nrtl fitting
  when we have two liquids ... it refuses to calculate but in fact it could"): classify each pair from open evidence
  (miscible, partly miscible, not known), fit by class (no split allowed; joint VLE and liquid-liquid fit; VLE alone with
  a predicted split kept and labelled), the engine calculates the split wherever a set predicts it and says what evidence
  stands behind it, Wilson refused only inside a known split. Needs proposal 0019, which changes DATA_RULES.md section 5;
  the five Wilson pairs of PR #200 wait for it.

## Known Lab blockers (CHEPTA-Lab, docs/CAPABILITY_AUDIT_2026-10-30.md, read 2026-11-04)

- Ethyl acetate: multistage liquid-liquid extraction (being built, M3); acetic acid's association in columns and in the
  three-phase flash (a known issue); reactive distillation (later); purity specifications (M4).
- CO2 to methanol: gases with methanol and water at high pressure (PR/SRK with k_ij and a warning, 2026-11-04-05; PSRK
  in M2); the paper's kinetics are Lab's to extract.
- Ethanol to ethylene: downstream purification (flash, columns, absorber).

These are to be filed as capability requests by CHEPTA-Lab.

## The Astra 6 review (2026-11-04), accepted by the maintainer

The maintainer uploaded a review of this PR by Astra 6 (OpenAI), the agent that built CHEPTA-Lab, and wrote: "i agree with
your proposals. i also added the recommendation from Astra 6 High". Taken into ROADMAP.md:

1. G5 benchmarks start with G1 and G2 on small reviewed cases (ethanol reactor, benzene + toluene column), not after G4;
   development cases kept apart from held-out evaluation cases.
2. P6's "done when": declared product and operating constraints met, balances closed, warnings and sources kept,
   reproducible from saved inputs, substitutions recorded; costs shown with coverage, never holding back the demonstration.
3. Cost results say complete within scope, partial or unavailable; missing never zero; partial estimates do not rank
   routes; comparisons on a common basis; accuracy ranges need a basis, else "unquantified"; the source search is
   time-bounded and recorded, and reopened when new evidence justifies it (instead of "searched once").
4. A small shared study record (Lab writes it, G6 shows it) and release coordination (Lab's compatibility suite before
   it moves its pin; the consumed interfaces versioned with a change policy, in 0.x).
5. D9: every miscibility classification names its sources and the conditions they cover; measured and predicted splits
   are told apart in results and carried into Lab's records.

Also decided (2026-11-04): PSRK and MHV2 are not used, their parameters not being open; PR and SRK with k_ij fitted to the
open high-pressure data instead (proposal 0018 postponed; decision file 2026-11-04-13-kij-high-pressure.md).
