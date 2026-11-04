# 2026-11-04-10: M2, the source check for PSRK and MHV2 (proposal 0018)

Roadmap, Methods track, M2: "Its first step is a source check: PSRK's own group tables are used only if they are open;
otherwise the method is built on Modified UNIFAC 2.0 (CC BY 4.0, already in CHEPTA) inside the cubic equation of
state, through the gE mixing rule the proposal chooses." M1 (Wilson) is merged, so M2 started on 2026-11-04.

## What was found (2026-11-04; details and quotes in proposals/0018-gE-mixing-rule-eos.md)

- **PSRK's group tables are not open.** The five articles (Holderbaum and Gmehling 1991 to Horstmann et al. 2005) have
  no free copy (`open_copy.py --all`; OpenAlex: closed). DDBST's page https://www.ddbst.com/psrk.html is free to read
  and lists the gas groups, but DDBST's Terms of Use forbid copying, adapting or compiling its content "without written
  permission from DDBST GmbH". The `thermo` library's PSRK tables (MIT code) name no source: they are a copy of the
  paywalled articles or of DDBST's page, so not open (DATA_RULES.md, source 4). VTPR: the same.
- **MHV2's parameters are not open** (Dahl, Fredenslund and Rasmussen 1991, Ind. Eng. Chem. Res., closed).
- **Modified UNIFAC 2.0 has no gas groups** (no CO2, CH4, H2, N2, CO, H2S, O2 among its 125 subgroups). In a gE mixing
  rule it covers polar mixtures of condensable components above 10 bar, not gases in polar liquids.
- **No open gas-group table for polar solvents** was found. PPR78 (open in part) has gas groups but no alcohol,
  ketone or ester groups.
- **Open and usable:** ChemSep's Mathias–Copeman constants (350 compounds, among them water, methanol, CO2, H2, N2,
  CH4, CO; Artistic License 2.0), and high-pressure VLE in the ThermoML Archive (CO2 + methanol 428 points, CO2 + water
  869 points, and other gas + polar pairs).
- **Other simulators:** DWSIM has no PSRK, MHV2 or Wong–Sandler package (its guide and its source, commit 1abf72d,
  read 2026-11-04); it uses PR or SRK with k_ij, or an activity model with Henry's constants. No open ChemSep or COCO
  page states its practice.

## What is proposed (proposal 0018, status Proposed)

The PSRK form of the MHV1 rule for SRK and PR, with any CHEPTA activity model as gE: Modified UNIFAC 2.0 (predicted)
for condensable polar mixtures; NRTL pairs fitted inside the rule to ThermoML high-pressure data for gases in polar
liquids (CO2 + methanol and CO2 + water first); ChemSep's Mathias–Copeman alpha; named "SRK/PR + gE (MHV1)", never
"PSRK"; My data for rule pairs, Mathias–Copeman constants and group tables a user holds a licence for. Tested against
thermo's PSRK class run with CHEPTA's own gE, and against ThermoML data.

## For the maintainer to decide

1. Accept the proposal as written, or change the rule (MHV1; MHV2 or Wong–Sandler as later options).
2. Write to DDBST for permission to use its published PSRK tables in CHEPTA (then: tier databank, named PSRK, gas
   groups predicted), or not.
3. The alpha function: ChemSep's Mathias–Copeman constants taken as they are (ChemSep names no source for them), or
   constants fitted to CHEPTA's own vapour-pressure records.
4. Gases in polar liquids without a fitted pair: refused with the reason (proposed), or offered with the plain PR/SRK
   k_ij and a warning.
