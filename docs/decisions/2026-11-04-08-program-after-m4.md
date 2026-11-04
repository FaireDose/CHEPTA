# 2026-11-04-08: The program after M4, and how CHEPTA works with CHEPTA-Lab

The maintainer, 2026-11-04: "first i want you to propose the steps after M4 so I know the complete picture. Of course,
somehow the agents shouldn't get stuck in the cost estimations but it is good to start working on this as well ... Ok
also with the three proposals for CHEPTA-Lab"; and earlier: "i am ok to have reactive distillation for later".

## What changed

- ROADMAP.md, "The program after M4 (v0.7 to 1.0)": phases P5 cost (bounded, v0.7), P6 agentic design with CHEPTA-Lab
  (v0.8), P7 advanced thermodynamics (v0.9; M2 alongside P5), P8 stability and bridges (1.0), and after 1.0 (reactive
  distillation, optimization, dynamics, batch, solids, LCA). At most four agent sessions at a time.
- The rules that keep cost work from stalling: one workstream in parallel; one open source per equipment family,
  searched once; otherwise "no open data" and the user's own cost in My data; index year and accuracy range stated;
  a missing cost is a warning, never a refusal.
- ROADMAP.md, "CHEPTA and CHEPTA-Lab": Lab pins released versions; Lab's blockers are capability requests (a new issue
  form, .github/ISSUE_TEMPLATE/capability-request.yml); G2 to G5 are done in CHEPTA-Lab, CHEPTA keeps G1 and G6 and takes
  Lab's reviewed cases as benchmarks; no training data flows back into the databank.
- Reactive distillation: after 1.0.

## Known Lab blockers (CHEPTA-Lab, docs/CAPABILITY_AUDIT_2026-10-30.md, read 2026-11-04)

- Ethyl acetate: multistage liquid-liquid extraction (being built, M3); acetic acid's association in columns and in the
  three-phase flash (a known issue); reactive distillation (after 1.0); purity specifications (M4).
- CO2 to methanol: gases with methanol and water at high pressure (PR/SRK with k_ij and a warning, 2026-11-04-05; PSRK
  in M2); the paper's kinetics are Lab's to extract.
- Ethanol to ethylene: downstream purification (flash, columns, absorber).

These are to be filed as capability requests by CHEPTA-Lab.
