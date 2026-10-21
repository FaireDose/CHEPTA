# Thermodynamic models (layers 0 and 1)

What CHEPTA calculates for a phase: activity coefficients, fugacity coefficients, vapour
pressures, enthalpies and pure-component properties. Each section names the source file. The
file's header comment is the authoritative statement of the equations and their open
references; this page is a map of them. Algorithms that use these models (bubble and dew points,
flash, stability) are in [equilibrium.md](equilibrium.md). Which model to choose for which
mixture is in [../METHOD_SELECTION.md](../METHOD_SELECTION.md).

All engine units are SI: K, kPa, mol, J (ARCHITECTURE.md).

## The property package: `system()`

[`src/thermo/system.js`](../../src/thermo/system.js) builds a *system* from components and a
model. Every layer above uses only this object.

| `model` | Liquid | Vapour (`vapour` option) | File |
|---|---|---|---|
| `NRTL` | NRTL activity coefficients | ideal gas, or PR / SRK | [activity/nrtl.js](../../src/thermo/activity/nrtl.js) |
| `UNIQUAC` | UNIQUAC activity coefficients | ideal gas, or PR / SRK | [activity/uniquac.js](../../src/thermo/activity/uniquac.js) |
| `MOD-UNIFAC-2` | Modified UNIFAC 2.0, predicted from groups | ideal gas, or PR / SRK | [activity/mod-unifac.js](../../src/thermo/activity/mod-unifac.js) |
| `ideal` | ideal solution (γ = 1) | ideal gas, or PR / SRK | system.js |
| `PR` | Peng–Robinson (1976) | the same equation | [eos/cubic.js](../../src/thermo/eos/cubic.js), [eos/system.js](../../src/thermo/eos/system.js) |
| `SRK` | Soave–Redlich–Kwong (1972) | the same equation | same |

Locked in the interface as "not available yet": Wilson, UNIFAC, PC-SAFT, CPA, eNRTL, Pitzer,
Flory–Huggins and PC-SAFT for polymers ([src/ui/future-models.js](../../src/ui/future-models.js)). The original UNIFAC
is on hold until its parameter licence is settled (proposal 0008); Modified UNIFAC 2.0 is available (below).

**Method advice** (pull request #85, open): `info.advice` and the warnings say when a model is
used outside the domain of the selection rules. For example, an equation of state with polar
components, or an activity model above 1000 kPa
(`src/thermo/method-advice.js` in that pull request).

## Activity models

- **NRTL**: τ_ij = a_ij + b_ij / T, G_ij = exp(−α_ij τ_ij).
- **UNIQUAC**: τ_ij = exp(a_ij + b_ij / T), coordination number z = 10. An optional q′
  replaces q in the residual term (Anderson–Prausnitz modification).
- **Modified UNIFAC 2.0** (`MOD-UNIFAC-2`): the modified UNIFAC (Dortmund) equations (Weidlich and Gmehling 1987;
  Gmehling, Li and Schiller 1993) with the parameters of Hayer, Hasse and Jirasek, Ind. Eng. Chem. Res. 64 (2025)
  10304 (arXiv:2412.12962, CC BY 4.0): R and Q of 125 subgroups and complete a and b tables of 63 main groups,
  Ψ_nm = exp(−(a_nm + b_nm T)/T). Every pair is **predicted** from the groups of its components, labelled so, never
  fitted to data of the pair.
  - Parameters: [src/data/mod-unifac-2.json](../../src/data/mod-unifac-2.json), written from the arXiv files
    ([validation/data/unifac/mod-unifac-2.0/](../../validation/data/unifac/mod-unifac-2.0/)) by
    [validation/python/mod_unifac_2.py](../../validation/python/mod_unifac_2.py).
  - Groups of each component (`modUnifac` in components.json): split from its structure by the SMARTS patterns of the
    thermo library and checked against DDBST's published assignment and the atom balance; a component without
    groups (gases, and a few whose structure is not covered or not checked yet) says why.
  - Checks ([test/mod-unifac.test.js](../../test/mod-unifac.test.js)): ln γ equal to thermo's modified UNIFAC with
    the same tables to 1e-9; against the open isobaric T-x-y sets of six pairs, mean deviations 0.3-1.1 K in T and
    0.001-0.019 in y (the NRTL fits to the same data: 0.06-0.16 K). It predicts no ethanol + water azeotrope at
    101.325 kPa (the measured one, at x(ethanol) 0.89, is less than 0.2 K below the boiling point of ethanol).
- **Gamma-phi equilibrium** ([gamma-phi-vapour.js](../../src/thermo/gamma-phi-vapour.js)):
  y_i φ_i^V P = x_i γ_i P_i^sat φ_i^sat exp[v_i^L (P − P_i^sat) / RT]. φ^V and φ^sat come from the
  cubic equation; v^L comes from the liquid-density record (Poynting factor). With an ideal-gas
  vapour, all three corrections are 1 (modified Raoult's law).
  - φ^sat is taken at the databank vapour pressure, so a pure component boils exactly at its
    record. The header compares this with thermo's convention.
  - Reference: thermo `GibbsExcessLiquid`, equilibrium basis "Poynting&PhiSat".
- **Dimerizing acids** ([vapour.js](../../src/thermo/vapour.js)): the chemical theory. Monomers and
  dimers are in equilibrium in the vapour, p_A2 = K p_A². Cross-dimers are not modelled.
- **Parameters**: [src/data/binaries.json](../../src/data/binaries.json), each pair with a tier
  (fitted, databank, user) and its sources. Pairs that are still missing are listed in
  [../DATA_WANTED.md](../DATA_WANTED.md).

## Cubic equations of state

[`eos/cubic.js`](../../src/thermo/eos/cubic.js), in the generic two-parameter form of the thermo
library documentation:

- P = RT / (v − b) − a(T) / ((v + d₁b)(v + d₂b)), with PR: d₁,₂ = 1 ± √2 and SRK: d₁ = 1, d₂ = 0.
- α(T) = [1 + m(1 − √(T/Tc))]², with m(ω) from Peng & Robinson (1976) or Soave (1972). The DOIs
  are in the header.
- Van der Waals one-fluid mixing rule with binary k_ij:
  a = ΣΣ x_i x_j (1 − k_ij) √(a_i a_j), b = Σ x_i b_i.
- The header gives ln φ_i, H^R, S^R and Cp^R. Root selection: the smallest root is the liquid and
  the largest the vapour. A single root is labelled liquid-like or vapour-like.
- k_ij: [src/data/kij.json](../../src/data/kij.json). They come from ChemSep (Artistic License 2.0)
  or are fitted to open data. A pair without one uses 0 and is reported in `info.missingPairs`.
  - The fits for polar pairs (proposal 0004) are labelled "not recommended" once pull request
    #85 is merged.
- Checked against an independent Python implementation and thermo PRMIX / SRKMIX
  ([validation/python/reference_eos.py](../../validation/python/reference_eos.py),
  [test/eos.test.js](../../test/eos.test.js)).

## Pure-component properties: `pure()`

- **Correlations** ([correlations.js](../../src/thermo/correlations.js)): the DIPPR equation
  forms 100–107. The forms are as documented by ChemSep and implemented in the `chemicals`
  library; the coefficients are in each component's record.
- **Vapour pressure** ([psat.js](../../src/thermo/psat.js)): DIPPR 101,
  ln(P/Pa) = A + B/T + C ln T + D T^E.
- **Properties and units** ([pure.js](../../src/thermo/pure.js)): every record states its units
  and source, and "no open data" is written where nothing was found.
  - Enthalpy reference: the ideal gas at 298.15 K.
  - Vapour and supercritical states use Peng–Robinson.
  - Without an open ideal-gas heat capacity, one is derived from the liquid's records (Kirchhoff):
    h_IG(T) = ∫cp_L dT + (ΔHvap − h_R,sat)(T) − (ΔHvap − h_R,sat)(298.15 K), where both records apply from
    298.15 K; it says so in its source and refuses outside that range. Checked in
    [test/derived-ideal-gas.test.js](../../test/derived-ideal-gas.test.js) (DATA_RULES section 10).
- **Data**:
  - [src/data/components.json](../../src/data/components.json);
  - fit quality: [../PURE_DATA.md](../PURE_DATA.md);
  - components fitted only to measured data: [../PURE_DATA_MEASURED.md](../PURE_DATA_MEASURED.md).

## Mixture enthalpy

[`enthalpy.js`](../../src/thermo/enthalpy.js). Reference: each component as an ideal gas at
298.15 K, with h = 0.

- **Activity models:**
  - vapour: Σ y_i h_IG,i + h_R;
  - liquid: Σ x_i h_L,i + h^E, with the pure liquid on the liquid heat-capacity basis (the
    decision in pull request #34) and h^E from Gibbs–Helmholtz.
- **Equations of state:** Σ z_i h_IG,i + h_R(T, P, z), for either phase.
- **Limits:** the header states them, including dimerizing acids and the end of the cp_L records.

## Mixture entropy

[`enthalpy.js`](../../src/thermo/enthalpy.js) (proposal 0013, step 6): `sys.phase(phase, T, P, z, { entropy: true })`
(`s_J_molK`, `g_J_mol`), `sys.entropy(phase, T, P, z)`, and `S_J_molK` in a flash with `{ entropy: true }`. Reference:
each component as an ideal gas at 298.15 K and 101.325 kPa, s = 0 (a nonvolatile component: its liquid at 298.15 K).

- **Every model, from the Gibbs energy:** s = (h − g)/T, with g = Σ z_i μ_i and μ_i = g_IG,i(T, P0) + RT ln(f_i/P0),
  from the same fugacities the flash uses. Two phases in equilibrium then differ by exactly the latent heat over T.
- **Ideal gas:** s_IG,i = ∫ cp_IG/T dT = h_IG,i/T + ∫ h_IG,i/T² dT, so every ideal-gas enthalpy works (records,
  IAPWS-IF97, the one derived from the liquid).
- **Equations of state:** this gives Σ z_i s_IG,i − R Σ z_i ln(z_i P/P0) + s_R, the cubic's own residual entropy
  (checked to 1e-5 J/(mol K)).
- **Activity models' liquid:** it holds the excess entropy (h^E − g^E)/T. Its entropy follows the vapour-pressure
  record through f_i, its enthalpy the heat-capacity record, so dS/dT is cp_L/T only as far as the two agree: water's
  entropy rise from 300 to 370 K is within 0.8 % of IAPWS-IF97's.
- **Checks:** [test/entropy.test.js](../../test/entropy.test.js), against an independent Peng–Robinson
  ([validation/python/reference_compressor.py](../../validation/python/reference_compressor.py): CoolProp's ideal-gas
  cp0 plus the thermo library's departure functions). CoolProp's own cubic backend is not used: its entropy does not
  follow from its ideal-gas and residual parts.

## Water and steam

- **IAPWS-IF97** ([iapws/if97.js](../../src/thermo/iapws/if97.js)): IAPWS R7-97(2012), regions 1–5.
  Region 3 is solved on its basic equation.
- **Transport** ([iapws/transport.js](../../src/thermo/iapws/transport.js)): viscosity by IAPWS
  R12-08 and thermal conductivity by R15-11, in their industrial forms.
- **Steam tables** ([iapws/steam.js](../../src/thermo/iapws/steam.js)): steam-table units.
- **Verification:** every table of the releases is reproduced in
  [test/steam.test.js](../../test/steam.test.js).

## Gases in water: Henry's law

[`henry.js`](../../src/thermo/henry.js) uses IAPWS G7-04 for hydrogen, nitrogen, oxygen, methane and
ethane, and the Sander compilation (CC BY 4.0) for ethylene. Outside an entry's temperature range
it throws.

## The Library: where every parameter comes from

[`library.js`](../../src/thermo/library.js) (proposal 0003):

- **Sources:** every source is listed once in [src/data/sources.json](../../src/data/sources.json),
  and the licences are in [src/data/LICENSES.md](../../src/data/LICENSES.md).
- **Several parameter sets per pair:** a pair can carry more than one set. The user chooses one
  with `sets` or `prefer`; otherwise the default set is used.
- **No thermodynamics:** the file only records sources and selects sets.

## Your own data: an overlay on the databank

[`user-data.js`](../../src/thermo/user-data.js) (proposal 0012):

- **What:** property records, components, pair parameters (NRTL, UNIQUAC, PR, SRK) and Modified UNIFAC 2.0 groups of
  the user's own, every item with a source line the person writes and the tier "user".
- **How:** `checkUserData(userData)` checks it (the databank's units, equations and ranges; a DIPPR101 vapour pressure;
  subgroup ids of the method) and `system({ ..., userData })`, `pure(id, { userData })` and
  `listComponents({ userData })` put it over the databank for that call only. A user record replaces the databank's
  record of that property; a user pair set is that pair's default (the databank's set stays selectable with `sets`);
  the user's own components have ids starting with `user:`. `info.userData` lists what a system uses.
- **Not stored:** nothing is written into the databank or kept between calls; water stays on IAPWS-IF97.
- **Checked by:** [test/user-data.test.js](../../test/user-data.test.js): an overlay repeating the databank's own
  records gives exactly the databank's results; a component copied as the user's own gives the same equilibrium.
- **Files** ([`src/ui/project.js`](../../src/ui/project.js), [`src/ui/user-data-file.js`](../../src/ui/user-data-file.js)):
  a project keeps its own copy as `user_data` (project format 3, written only when there is user data; formats 1 and
  2 still open), so it calculates the same without any other file. The same data can be saved as a My data file
  (`"chepta_user_data": 1`, `userDataDoc`, `readUserDataFile`) and opened into another project with
  `mergeUserData(current, incoming, choose)`: new entries are added, equal ones kept once, and an entry held with other
  numbers is a conflict that keeps the project's entry unless the person chooses the incoming one.
  `userDataPackage(userData, key)` drafts a contribution package (AGENTS.md) from one entry and lists what is missing
  before it can go to the Data form (an open copy, the access, a CAS number; for pair parameters, the measured
  mixture data). Checked by [test/user-data-files.test.js](../../test/user-data-files.test.js).
- **The My data panel** ([`src/ui/my-data-panel.js`](../../src/ui/my-data-panel.js)): lists the project's entries,
  adds a property of a databank component or of a component of one's own (a pasted table of points, fitted by
  [`src/thermo/user-fit.js`](../../src/thermo/user-fit.js), or typed coefficients), adds a component of one's own,
  saves, copies, opens and merges My data files, and drafts a contribution package from an entry. The fit uses the
  repository's forms by linear least squares: DIPPR 100 on relative deviations (density, heat capacities, enthalpy of
  vaporization, conductivity, surface tension) and DIPPR 101 on ln y (vapour pressure, viscosities), with the fewest
  coefficients that meet the points within 0.5 %, or the number the person chooses; its largest deviation is shown
  and written into the record's source. Checked against numpy on the same points to 1e-9
  ([test/user-fit.test.js](../../test/user-fit.test.js), `validation/python/reference_user_fit.py`). A result that
  uses the person's data says so on the canvas ("Uses your own data: ..."), with a switch per record between the
  person's record and the databank's: a record switched off (`use: false`) is kept in the data and the files, and
  the databank's is used.
- **A window of its own** ([`src/ui/my-data-window.js`](../../src/ui/my-data-window.js)): "Open in a new window" moves
  the panel into a window the main window builds (no second file is loaded); the main window keeps the data, and
  changes in either appear in both. Not on phones; where the page or the browser refuses a window (AI chats), the panel
  stays docked and says why. Closing the window docks the panel again.
- **Pairs and groups side by side** ([`src/ui/my-data-pairs-groups.js`](../../src/ui/my-data-pairs-groups.js),
  [`src/ui/pairs-groups-logic.js`](../../src/ui/pairs-groups-logic.js)): for a pair and a model (NRTL, UNIQUAC, PR or
  SRK k_ij), one table holds every databank set, turned to the order the person chose (i, j), next to an empty column
  for one's own; a set can be copied into it, and "Compare" gives the bubble point of an equimolar liquid at 1 atm
  with each set and with one's own. Saved into the pair's existing entry in that entry's order, keeping its other
  models. For Modified UNIFAC 2.0, the database's groups of a component (subgroup, main group, R, Q, how they were
  found) stand next to the selection of one's own (search, add, count, remove), with the interaction parameters between
  their main groups below. Groups of one's own must pass the atom balance against the component's formula
  ([`src/thermo/formula.js`](../../src/thermo/formula.js); one H over is allowed, as for the database's, section 7 of
  DATA_RULES); the atoms of each subgroup are those of thermo (`DOUFSG`), written into `mod-unifac-2.json` by
  `mod_unifac_2.py`. Checked by [test/pairs-groups.test.js](../../test/pairs-groups.test.js): a databank set entered as
  one's own gives the same bubble point in either order; every component's database groups entered as one's own give
  identical activity coefficients.
- **Inert solids** ([`src/equilibrium/inert-solids.js`](../../src/equilibrium/inert-solids.js)): a component of one's own
  with `class: "solid"` and a solid heat capacity neither evaporates, dissolves nor melts. `system()` flashes the fluid
  part as it would alone and adds a solid phase whose enthalpy is the integral of the solid heat capacity from 298.15 K;
  the vapour fraction counts every mole. In a flowsheet it leaves a flash drum with the liquid, and a component
  separator filters it out. Bubble and dew points and the diagrams refuse it with the reason. Checked by
  [test/inert-solids.test.js](../../test/inert-solids.test.js).
