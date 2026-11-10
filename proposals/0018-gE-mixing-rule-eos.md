# 0018: An activity model inside the cubic equation of state (gE mixing rule)

- **Status:** Built: the engine (2026-11-06) and the interface (2026-11-10, below), in review; open items in
  docs/decisions/2026-11-10-03-mhv1-interface.md. Reopened (history): proposed again (the maintainer, 2026-11-06: "yes reopen 0018"), after the k_ij fits of
  docs/decisions/2026-11-04-13, 2026-11-05-03 and 2026-11-06-01 left CO2 + water at 14-15 % in pressure with
  k_ij = a + b/T. Steps 2 and 3 are built in the pull request of docs/decisions/2026-11-06-02-mhv1.md, with the
  differences it lists. Earlier: postponed (the maintainer, 2026-11-04, on #203: "if the PSRK and MHV2 are not open
  then we do not use them, PR and SRK should be ok for now").
- **Interface (2026-11-10):** "PR + gE (MHV1)" and "SRK + gE (MHV1)" are chosen in the Model selector, the flowsheet's
  Method page, a column's own method, project files (format 7), `CHEPTA.run`, the command line and the MCP tools
  (`thermo.mixing`); docs/decisions/2026-11-10-03-mhv1-interface.md.
- **Author(s):** a coding agent working for the maintainer
- **Discussion:** the pull request that adds this file
- **Roadmap item:** Methods track, **M2** ([ROADMAP.md](../ROADMAP.md#methods-track)), step 1: the source check and
  this proposal. Nothing is implemented yet.

## Problem

[docs/METHOD_SELECTION.md](../docs/METHOD_SELECTION.md), rule 4: "Polar, above 10 bar: PSRK, or a cubic equation with
Wong–Sandler or MHV2 mixing rules. CHEPTA does not have these yet". Two kinds of mixture fall there:

1. **polar liquids above 10 bar**, all of them condensable (methanol + water in a high-pressure column, ethanol +
   water): an activity model describes the liquid well, but the gamma-phi method with an ideal-gas or a separate
   equation-of-state vapour is a poor fit near the critical region;
2. **gases dissolved in polar liquids at high pressure** (CO2 in methanol, as in Rectisol absorption; CO2 in water;
   H2, CO and CH4 in methanol, as in the methanol-synthesis loop): Peng–Robinson or SRK alone describe the polar
   liquid badly (DWSIM's guide, below), and an activity model with Henry's law (proposal 0017) is meant for low
   pressure.

The roadmap says: "Its first step is a source check: PSRK's own group tables are used only if they are open; otherwise
the method is built on Modified UNIFAC 2.0 (CC BY 4.0, already in CHEPTA) inside the cubic equation of state, through
the gE mixing rule the proposal chooses."

## Source check (2026-11-04)

The question for every table: is it free to read **and** legally reusable (AGENTS.md rule 1; DATA_RULES.md, source 4:
"A table copied from a handbook or a commercial databank is not open just because an open library ships it").

### PSRK's group tables: free to read, not reusable

| Where | What was found | Open? |
|---|---|---|
| The articles: Holderbaum and Gmehling, Fluid Phase Equilib. 70 (1991) 251, doi 10.1016/0378-3812(91)85038-V; Fischer and Gmehling, Fluid Phase Equilib. 121 (1996) 185, doi 10.1016/0378-3812(95)02792-0; Gmehling, Li and Fischer, Fluid Phase Equilib. 141 (1997) 113, doi 10.1016/S0378-3812(97)00204-5; Horstmann, Fischer and Gmehling, Fluid Phase Equilib. 167 (2000) 173, doi 10.1016/S0378-3812(99)00333-7; Horstmann et al., Fluid Phase Equilib. 227 (2005) 157, doi 10.1016/j.fluid.2004.11.002 (revision IV, the last published) | `open_copy.py --all`: no copy in Unpaywall or OpenAlex (CORE answered 429, budget used up); OpenAlex gives `oa_status: closed`, `any_repository_has_fulltext: false` for revision IV | **No**: paywalled |
| DDBST's page "Published Parameters of the PSRK Model", https://www.ddbst.com/psrk.html | free to read: subgroups with R and Q, main groups, interaction parameters a, b, c, the gas groups (CO2, CH4, H2, N2, CO, H2S, O2, Ar, NH3 and others), ten references from Holderbaum (1990) to Horstmann et al. (2005); "Many new, updated, and revised parameters can be obtained from the UNIFAC Consortium" | free to read, **not reusable**: DDBST's Terms of Use, https://www.ddbst.com/terms-of-use.html, apply (next row) |
| DDBST's Terms of Use (read 2026-11-04) | "you agree not to save, download, cut and paste, sell, license, rent, lease, modify, distribute, copy, reproduce, transmit, publicly display, publicly perform, publish, adapt, edit, or create derivative works from materials, code or content on or from this site"; "Systematic retrieval of data or other content from this site ... to create or compile, directly or indirectly, a collection, compilation, database or directory without written permission from DDBST GmbH ... is prohibited." | **No**, without DDBST's written permission |
| DDBST, https://www.ddbst.com/model-parameters-for-data-prediction.html | "The parameters for the UNIFAC, mod. UNIFAC and PSRK methods delivered by DDBST conform to the latest published version"; the consortium version "is only available to consortium members." | newer parameters: members only |
| The `thermo` library 0.6.1 (MIT), `thermo/unifac.py` (`PSRKSG`, the subgroups) and `thermo/Phase Change/PSRK interaction parameters.tsv` (1912 main-group pairs, a, b, c) | neither the code nor its documentation (section "Data for PSRK UNIFAC") names where the tables come from; the `PSRK` class cites only Holderbaum and Gmehling (1991). The same main groups and gas groups as DDBST's page | **No**: an unattributed copy of the paywalled articles or of DDBST's page; MIT covers thermo's code, not the right to reuse the table (DATA_RULES.md, source 4) |
| The `chemicals` library: `Critical Properties/Appendix to PSRK Revision 4.tsv` | by its name, the appendix of the paywalled revision IV | not used (and not needed: CHEPTA has its own critical constants) |

**PSRK's group tables are not open.** The same holds for its successor VTPR (Schmid and Gmehling, Fluid Phase Equilib.
2012, doi 10.1016/j.fluid.2012.01.006; Schmid, Schedemann and Gmehling, Ind. Eng. Chem. Res. 53 (2014) 3393, doi
10.1021/ie404118f; Schmid and Gmehling, Fluid Phase Equilib. 2016, doi 10.1016/j.fluid.2016.06.042: all `closed` in
OpenAlex) and for thermo's VTPR tables, which are the only other tables in thermo with gas groups.

### MHV2's parameters: not open

- MHV2 itself: Dahl and Michelsen, AIChE J. 36 (1990) 1829, doi 10.1002/aic.690361207: no free copy.
- Its parameters for gases: Dahl, Fredenslund and Rasmussen, "The MHV2 model: a UNIFAC-based equation of state model
  for prediction of gas solubility and vapor-liquid equilibria at low and high pressures", Ind. Eng. Chem. Res. 30
  (1991) 1936, doi 10.1021/ie00056a041: OpenAlex `closed`; a web search finds only an upload on Scribd, which is not a
  legal copy. **Not open.**
- MHV1: Michelsen, Fluid Phase Equilib. 60 (1990) 213, doi 10.1016/0378-3812(90)85053-D; Huron and Vidal, Fluid
  Phase Equilib. 3 (1979) 255, doi 10.1016/0378-3812(79)80001-1; Wong and Sandler, AIChE J. 38 (1992) 671, doi
  10.1002/aic.690380505: no free copy of any. These are **equations**, not parameter tables; the equations are
  documented openly in the `thermo` library (MIT), for example `thermo.eos_mix.PSRKMixingRules`, whose docstring and
  code give the PSRK form of the MHV1 rule, with A = ln(u / (u + 1)), u = 1.1. CHEPTA may cite such an openly
  documented implementation for an equation (AGENTS.md, rules for code).

### The open alternative: Modified UNIFAC 2.0, with no gas groups

Modified UNIFAC 2.0 (Hayer, Hasse and Jirasek 2025, CC BY 4.0; `src/data/mod-unifac-2.json`, from the arXiv files in
`validation/data/unifac/mod-unifac-2.0/`) has 125 subgroups in 63 main groups. **None of them is CO2, CH4, H2, N2, CO,
H2S or O2** (checked in `Size_Parameters_modUNIFAC20.csv`, 2026-11-04). In thermo 0.6.1 only the PSRK (`PSRKSG`) and
VTPR (`VTPRSG`) tables have such groups; original UNIFAC (`UFSG`), Modified UNIFAC (Dortmund, `DOUFSG`) and NIST
modified UNIFAC (`NISTUFSG`) have none.

So Modified UNIFAC 2.0 in a gE mixing rule covers **case 1** (polar liquids, all condensable, above 10 bar), and **not
case 2** (gases in polar liquids).

### Open gas-group parameters

| Method | Gas groups | Polar groups | Open? |
|---|---|---|---|
| PSRK, VTPR | CO2, CH4, H2, N2, CO, H2S, O2, Ar, NH3 | yes | no (above) |
| MHV2 (Dahl et al. 1991) | 13 gases | 9 solvent groups | no |
| PPR78 and E-PPR78 (group-contribution k_ij for Peng–Robinson; thermo's `group_contribution/ppr78.py`, which names no source) | CO2, N2, H2S, H2, CO, He, Ar, CH4, H2O | **no alcohols, ketones or esters**: only hydrocarbon groups, water and SH | some articles are open (OpenAlex: Jaubert et al., Oil Gas Sci. Technol. 73 (2018), doi 10.2516/ogst/2017044, CC BY; an IntechOpen chapter, doi 10.5772/57058, CC BY; J. EEEP 2011, doi 10.1051/jeep/201100011, gold OA); the OGST server refused the script (403), so no table was read. Not for polar solvents, so not for M2 |
| UMR-PRU (Voutsas, Magoulas, Tassios) | CO2, N2, CH4 and others | yes | OpenAlex marks one article green (doi 10.1016/j.fluid.2005.12.028) but its link is the publisher's page; no copy checked. Not open as far as checked |

**No open gas-group table for polar solvents was found.**

### Other open data that M2 can use

- **ChemSep's Mathias–Copeman constants** (`MatthiasCopemanC1` to `C3`, the alpha function of PSRK) in ChemSep v8.3
  (`chemsep1.xml`, Artistic License 2.0, as shipped by DWSIM): 350 compounds, among them water, methanol, CO2, H2, N2,
  CH4 and CO (counted 2026-11-04). ChemSep does not state where they come from; by the maintainer's rule (2026-10-14)
  a ChemSep record is taken as it is.
- **High-pressure VLE in the ThermoML Archive** (`validation/data/vle/archive_index.json`, NIST open licence),
  counted 2026-11-04: CO2 + methanol 16 articles, 428 points; CO2 + water 33 articles, 869 points; CO2 + ethanol 27
  articles, 552 points; acetone + CO2 13 articles, 413 points; H2 + methanol 4 articles, 64 points; CO + methanol 1
  article, 27 points; CH4 + methanol 6 articles, 46 points; CH4 + water 9 articles, 93 points; N2 + water 4 articles,
  212 points; methanol + water 13 articles, 281 points; ethanol + water 27 articles, 786 points. All CHEPTA components.

## What other simulators offer (docs/METHOD_SELECTION.md, "When in doubt")

- **DWSIM** (read 2026-11-04). Its Property Packages Guide,
  https://dwsim.org/tutorials/en/reference/property-packages-guide.html, names no PSRK, MHV2 or Wong–Sandler package.
  For polar mixtures it says: "The cubic EOS form does not capture the strong hydrogen bonding in polar systems";
  "Always use NRTL or UNIQUAC for polar mixtures"; "For PR/SRK with strongly polar or quadrupolar compounds (CO2, H2S),
  the kij values matter". Its source code (github.com/DanWBR/dwsim, commit 1abf72d of 2026-07-17,
  `DWSIM.Thermodynamics/PropertyPackages/`) has 29 property packages (PR, PRSV2, SRK, LKP, NRTL, UNIQUAC, Wilson,
  UNIFAC, MODFAC, NIST-MODFAC, Sour Water, electrolytes, CoolProp and others) and **no PSRK, MHV2, Huron–Vidal or
  Wong–Sandler** package; no file of its tree names them. So DWSIM handles gases in polar solvents with PR or SRK and
  a k_ij, or an activity model with Henry's constants (`UseHenryConstants`, already recorded in METHOD_SELECTION.md).
- **ChemSep**: its pure-component file carries the Mathias–Copeman constants that PSRK uses (above); no open ChemSep
  page read on 2026-11-04 states whether ChemSep or COCO offers PSRK or which group tables it would use, so nothing is
  taken from them.

Both open simulators therefore stop where CHEPTA stops today: neither ships PSRK's tables.

## Why a gE rule where k_ij(T) falls short (Privat and Jaubert 2023)

R. Privat, J.-N. Jaubert, "The state of the art of cubic equations of state with temperature-dependent binary
interaction coefficients: From correlation to prediction", Fluid Phase Equilib. 567 (2023) 113697,
doi 10.1016/j.fluid.2022.113697 (open access, CC BY 4.0, stated on p. 1; downloaded by the maintainer, pp. 1-3 and 6-8
read by the maintainer and the coordinating session, 2026-11-07):

- Eq. (15), p. 6: a_ij(T) = sqrt(a_i a_j) [1 - k_ij(T)], the family of temperature-dependent binary interaction
  parameters the review covers; the support for the k_ij = a + b/T of docs/decisions/2026-11-06-01.
- Section 3.4, p. 8: "k_ij(T) coefficients cannot accurately model the most complex mixtures involving polar and
  associating compounds", so composition-dependent k_ij(T, z) are used, "especially useful in accounting for water
  traces that cannot be estimated accurately using a k_ij(T) coefficient".
- Eqs. (25)-(27), p. 8: EoS/gE mixing rules (Huron-Vidal; "the use of, e.g., MHV1 MRs do not change anything") are
  equivalent to a k_ij(T, z). This is the case for this proposal: MHV1 can capture what k_ij(T) cannot, as for CO2 +
  water.

## Proposal

Build **one gE mixing rule for SRK and Peng–Robinson that takes any of CHEPTA's activity models as its gE**, and
supply its parameters from open sources only:

1. **The rule: the PSRK form of MHV1** (Michelsen 1990; Holderbaum and Gmehling 1991), as documented openly in
   `thermo.eos_mix.PSRKMixingRules`:
   a / (b R T) = Σ z_i a_i / (b_i R T) + (1 / A) (gE / RT + Σ z_i ln(b / b_i)), b = Σ z_i b_i, A = ln(u / (u + 1)),
   u = 1.1 for SRK (and the matching constant for Peng–Robinson, derived the same way from its volume function).
   Why this rule: it is explicit (no inner iteration), it works with any gE model, and it has an independent
   implementation to test against. MHV2 adds a second constant for a small gain and has no open gas parameters to
   go with it; Wong–Sandler needs an extra k_ij per pair; a VTPR-type rule needs its own refitted group table, which
   is not open. Modified UNIFAC 2.0 was fitted at low pressure as a gE model, so it is used **unchanged** in the rule
   (no refit, DATA_RULES.md section 7).
2. **The alpha function:** Mathias–Copeman with ChemSep's constants (tier databank) where ChemSep has them; else the
   Soave alpha of today's SRK and PR. (Fitting Mathias–Copeman constants to CHEPTA's own vapour-pressure records is the
   alternative, if the maintainer prefers CHEPTA's records to ChemSep's constants.)
3. **Its gE:**
   - **Modified UNIFAC 2.0** (tier predicted) for mixtures of condensable components whose groups it has: case 1;
   - **NRTL, UNIQUAC or Wilson pairs** (tier fitted, databank or user) as they are today. For **gases in polar
     liquids** (case 2), NRTL pairs **fitted to open high-pressure VLE of the ThermoML Archive** inside this rule
     (tier fitted), by `fit_parameters.py` with the rule as its model: CO2 + methanol and CO2 + water first, then
     CO2 + ethanol, H2 + methanol, CH4 + methanol, CH4 + water, N2 + water, CO + methanol. These are pairs, not
     groups: a gas + solvent pair with no fitted set is refused, with the reason.
4. **The name in the interface:** "SRK + gE (MHV1)" and "PR + gE (MHV1)", with the gE model chosen as today
   (Modified UNIFAC 2.0, NRTL, UNIQUAC, Wilson); never "PSRK", because the PSRK group tables are not used. A mixture
   with a gas and no fitted pair says which pair is missing, and that PSRK's tables are not open.
5. **What stays in My data** (proposal 0012), tier user:
   - gE pairs for the rule (NRTL, UNIQUAC, Wilson), as today, fitted by the user or taken from an article;
   - Mathias–Copeman constants of one's own;
   - **group tables of one's own** (subgroups with R and Q, main-group a, b, c): a user who holds a licence for
     PSRK's or VTPR's tables (UNIFAC Consortium member, or the articles) can load them into their own project; CHEPTA
     never ships them.

## Engineering basis

- Equations: Michelsen (1990), Holderbaum and Gmehling (1991), cited through their open documentation in thermo
  (MIT), `thermo.eos_mix.PSRK` and `PSRKMixingRules` (docstring formulas), and the Mathias–Copeman alpha function in
  the same library.
- **Independent implementation:** thermo's `PSRK` class takes any `ge_model` (its docstring builds one with
  `UNIFAC.from_subgroups(...)`). The tests build thermo's PSRK and PR with the MHV1 rule with **CHEPTA's own** gE
  (Modified UNIFAC 2.0 from `src/data/mod-unifac-2.json`, or the same NRTL pair) and compare fugacity coefficients,
  bubble pressures and dew points; thermo's PSRK group tables are not used in the tests either. Tolerance: 1e-6
  relative on ln φ, 0.1 % on bubble pressure, as for the other models.
- **Open data**, ThermoML Archive (counts above):
  - case 1: methanol + water and ethanol + water above 10 bar, Modified UNIFAC 2.0 in the rule (predicted; the
    deviation is stated as a "predicted-deviation" known issue, not a pass or fail);
  - case 2: CO2 + methanol and CO2 + water, fitted NRTL in the rule, to DATA_RULES.md section 5's targets (0.5 K or
    1.5 % in P, 0.012 in y; between that and 2.5 K, 3 %, 0.02 with a quality warning); the data are split, one set
    fitted and the other articles held back as the check.
  - a comparison with plain PR with the databank k_ij on the same data, so the gain is shown.
- The method guide (rule 4) then points to "SRK/PR + gE (MHV1)" for polar mixtures above 10 bar, where the gE model
  covers the mixture.

## Effect on existing work

- New models in the property package; existing models, files and tests unchanged.
- `src/data/components.json`: Mathias–Copeman constants from ChemSep (a new optional record).
- `src/data/binaries.json`: NRTL sets with `"rule": "MHV1"` (pairs fitted inside the rule are not the same as the
  low-pressure NRTL sets and are kept apart).
- docs/METHOD_SELECTION.md: rule 4 and the "not available" row change.

## Alternatives considered

- **Use thermo's PSRK tables:** not open (above).
- **Ask DDBST for written permission** to use the published PSRK tables in CHEPTA (as the maintainer asked CORE and
  the Modified UNIFAC 2.0 authors). If DDBST grants it, the tables come in as tier databank and the method can be
  named PSRK; this proposal's rule is the same, only the gE parameters change. A choice for the maintainer.
- **MHV2 or Wong–Sandler instead of MHV1:** no open parameters to go with them; MHV2 could be added later as an
  option of the same rule.
- **Henry's law (proposal 0017) at high pressure:** works for dilute gases at moderate pressure; not near the
  mixture's critical region, which is case 2.
- **Wait for CPA (M3):** CPA covers water and alcohols with gases, but needs its own parameters (to be searched); it
  is the next item, not a replacement.

## Steps

0. **Postponed** (2026-11-04). Instead: PR and SRK k_ij fitted to the open high-pressure ThermoML data (CO2 +
   methanol, CO2 + water, then H2, CO and CH4 + methanol), with their deviations reported; those numbers decide whether
   the steps below are ever needed.
1. This proposal and the source check (this pull request). No code.
2. The MHV1 rule for SRK and PR with any gE model, Mathias–Copeman from ChemSep, tests against thermo's PSRK class
   with CHEPTA's gE; case 1 against ThermoML data with Modified UNIFAC 2.0; the interface entries.
3. NRTL fits inside the rule for CO2 + methanol and CO2 + water, then the other gas + solvent pairs; tests against
   held-back articles.
4. My data: Mathias–Copeman constants, rule pairs, and group tables of one's own.
