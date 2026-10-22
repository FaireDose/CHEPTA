# Missing pure-component properties (2026-10-22)

What CHEPTA's databank still lacks besides vapour-liquid pairs, on 2026-10-22 (174 components). Made by `validation/python/missing_properties.py`; one file per update, named with its day, so the earlier files stay and the gaps can be followed over time (docs/DATA_RULES.md section 12). The pairs are in [DATA_WANTED.md](DATA_WANTED.md).

Each gap is a "no open data" marker in `src/data/components.json` with the sources that were searched (`searched`). Start from that list before looking again, so the same sources are not searched twice.

## Summary

| Property | Missing | Predicted only | What it blocks today |
|---|---|---|---|
| Vapour pressure | 9 | - | Everything with a vapour: bubble and dew points, flashes, diagrams, distillation. The worst gap. |
| Critical constants (Tc, Pc, ω) | 18 | - | Peng–Robinson and SRK, for either phase. Activity models with an ideal-gas vapour still work. |
| Normal boiling point | 15 | - | Only where it is shown; the vapour-pressure record still works over its measured range. |
| Liquid density | 26 | - | Volumes, pump work, velocities; mass-to-volume conversions. |
| Liquid heat capacity | 9 | 30 | Energy balances: heaters, coolers, exchangers. Predicted values are within about 5 % at 300 K, worse for alcohols and polyols at higher temperature. |
| Ideal-gas heat capacity | 25 | - | Covered for the volatile ones by Kirchhoff's path from the liquid records; missing outright for those without a vapour pressure. |
| Heat of vaporization | 11 | - | Energy balances with evaporation or condensation. |
| Surface tension | 38 | - | Nothing in a calculation yet; column hydraulics later. |
| Liquid viscosity | 35 | - | Nothing in a calculation yet (shown in Properties); pumps, pipes and film coefficients later. |
| Liquid thermal conductivity | 54 | - | Nothing in a calculation yet; exchanger film coefficients from fluid properties later. |
| Vapour viscosity | 33 | - | Nothing in a calculation yet. |
| Vapour thermal conductivity | 34 | - | Nothing in a calculation yet. |
| Melting point and enthalpy of fusion | 32 | - | Solid solubility, crystallization, freezing checks. |
| Enthalpy of formation | 22 | - | Heats of reaction in the reactors (proposal 0010): a component without it can only be in a conversion or yield reactor with a given duty. |
| Gibbs energy of formation | 37 | - | Equilibrium constants from formation data (equilibrium and Gibbs reactors); heats of reaction still work with the enthalpy alone. |
| UNIQUAC r and q | 51 | - | UNIQUAC for those components (NRTL works). |
| Modified UNIFAC 2.0 groups | 20 | - | Prediction for those components; small gases and some rings cannot be described by the method. |

## What changed since the previous file (components.json at `5c27db8`)

- Enthalpy of formation found for 152 (a new kind of record; the components still without it are listed below).
- Gibbs energy of formation found for 137 (a new kind of record; the components still without it are listed below).

## Today's search for formation data (proposal 0010, step 1)

[decisions/2026-10-22-03-formation-data.md](decisions/2026-10-22-03-formation-data.md) has the details.

- **22 with no enthalpy of formation.** Two of them were measured, but only in paywalled articles with no free copy
  known to Unpaywall:
  - HMF: Ind. Eng. Chem. Res. 2009, doi:10.1021/ie901012g;
  - glycolic acid: Russ. J. Phys. Chem. 2010, doi:10.1134/S0036024410080054.

  For others (2-methyltetrahydrofuran, alpha-angelica lactone, solketal, glycerol carbonate, FDCA), only computed or
  group-additivity values were found, which are not data.
- **Xylitol is held for the maintainer.** Its two crystal energies of combustion disagree by about 100 kJ/mol.
- **Uncertain: the values disagree by more than 10 kJ/mol.** 2-methoxyethanol, 1,3-propanediol, limonene,
  gamma-butyrolactone and levoglucosan each have one old value far from the others.
- **Enthalpy only, no Gibbs energy of formation.** 15 of the measured components have no open standard entropy. Heats
  of reaction work for them; equilibrium constants from formation data do not.

**Where to start, by what it unlocks** (unchanged from 2026-10-21, with the formation data added):
1. Vapour pressures of the nine liquids in table A: each one makes its component usable in distillation.
2. Liquid density and heat of vaporization of the same nine, then liquid heat capacity where it is predicted only.
3. Enthalpies of formation of the green platform chemicals that reactions start from (HMF, glycolic acid, methyl
   lactate, 2-MeTHF), and standard entropies for the measured ones without a Gibbs energy.
4. Melting data for the acids and esters in tables C and D: crystallization of the green acids.
5. Critical constants of table B: only for equations of state; activity models already work.
6. Transport properties last: no calculation uses them yet.

## The gaps, component by component

"Predicted only" means a group-contribution prediction stands in (tier "predicted").

### A. No vapour pressure (9)

| Component | Missing (no open data found) | Predicted only |
|---|---|---|
| Solketal | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| alpha-Angelica lactone | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| Lactide | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, Gibbs energy of formation | - |
| Isosorbide | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| Levoglucosan | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | - |
| Dimethyl 2,5-furandicarboxylate | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| 2,5-Bis(hydroxymethyl)furan | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| Levoglucosenone | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| 5-(Ethoxymethyl)furfural | vapour pressure, critical constants (Tc, Pc, ω), normal boiling point, liquid density, liquid heat capacity, ideal-gas heat capacity, heat of vaporization, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |

### B. No critical constants (with a vapour pressure) (9)

| Component | Missing (no open data found) | Predicted only |
|---|---|---|
| gamma-Valerolactone | critical constants (Tc, Pc, ω), ideal-gas heat capacity, surface tension, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, Gibbs energy of formation | - |
| Tetrahydrofurfuryl alcohol | critical constants (Tc, Pc, ω), normal boiling point, ideal-gas heat capacity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion | liquid heat capacity |
| Cyclopentyl methyl ether | critical constants (Tc, Pc, ω), ideal-gas heat capacity, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| 2,3-Butanediol | critical constants (Tc, Pc, ω), normal boiling point, ideal-gas heat capacity, surface tension, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | - |
| Methyl lactate | critical constants (Tc, Pc, ω), normal boiling point, ideal-gas heat capacity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| Ethyl lactate | critical constants (Tc, Pc, ω), ideal-gas heat capacity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | liquid heat capacity |
| Limonene | critical constants (Tc, Pc, ω), normal boiling point, ideal-gas heat capacity, surface tension, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | liquid heat capacity |
| Furfuryl alcohol | critical constants (Tc, Pc, ω), normal boiling point, ideal-gas heat capacity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | liquid heat capacity |
| Glycerol carbonate | critical constants (Tc, Pc, ω), normal boiling point, liquid density, ideal-gas heat capacity, surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |

### C. Nonvolatile components (21)

| Component | Missing (no open data found) | Predicted only |
|---|---|---|
| Terephthalic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion | liquid heat capacity |
| Lactic acid | surface tension, liquid viscosity, liquid thermal conductivity, Gibbs energy of formation | liquid heat capacity |
| 5-Hydroxymethylfurfural | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| D-Glucose | liquid density, surface tension, liquid viscosity, liquid thermal conductivity | liquid heat capacity |
| D-Fructose | liquid density, surface tension, liquid viscosity, liquid thermal conductivity | - |
| D-Sorbitol | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, Gibbs energy of formation | liquid heat capacity |
| Xylitol | surface tension, liquid viscosity, liquid thermal conductivity, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| Succinic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity | liquid heat capacity |
| Itaconic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | liquid heat capacity |
| Fumaric acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion | liquid heat capacity |
| Malic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| Citric acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity | liquid heat capacity |
| Glycolic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| D-Glucaric acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| 3-Hydroxypropionic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| 2,5-Furandicarboxylic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| Bis(2-hydroxyethyl) terephthalate | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| Diphenolic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| Erythritol | surface tension, liquid viscosity, liquid thermal conductivity | liquid heat capacity |
| D-Xylose | liquid density, surface tension, liquid viscosity, liquid thermal conductivity | liquid heat capacity |
| cis,cis-Muconic acid | liquid density, surface tension, liquid viscosity, liquid thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |

### D. Other components with gaps (18)

| Component | Missing (no open data found) | Predicted only |
|---|---|---|
| Dichloromethane | surface tension, liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | - |
| 2-Methoxyethanol | ideal-gas heat capacity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | - |
| Methyldiethanolamine | melting point and enthalpy of fusion | - |
| Diethyl carbonate | liquid thermal conductivity, vapour thermal conductivity | - |
| Methyl oleate | melting point and enthalpy of fusion | - |
| Methyl linoleate | vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion | - |
| Triolein | heat of vaporization, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | liquid heat capacity |
| Tripalmitin | heat of vaporization, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | liquid heat capacity |
| Furan | liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | liquid heat capacity |
| 2-Methylfuran | liquid viscosity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, enthalpy of formation, Gibbs energy of formation | liquid heat capacity |
| 2-Methyltetrahydrofuran | ideal-gas heat capacity, surface tension, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, enthalpy of formation, Gibbs energy of formation | - |
| 1,3-Propanediol | ideal-gas heat capacity, surface tension, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, Gibbs energy of formation | - |
| Methyl levulinate | ideal-gas heat capacity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | - |
| Ethyl levulinate | ideal-gas heat capacity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | - |
| Butyl levulinate | ideal-gas heat capacity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | - |
| Levulinic acid | ideal-gas heat capacity, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, Gibbs energy of formation | - |
| gamma-Butyrolactone | surface tension, liquid thermal conductivity, vapour viscosity, vapour thermal conductivity | - |
| Isoamyl alcohol | liquid thermal conductivity, vapour viscosity, vapour thermal conductivity, melting point and enthalpy of fusion, Gibbs energy of formation | - |

### UNIQUAC r and q (51)

Dichloromethane, 2-Methoxyethanol, Terephthalic acid, Furan, 2-Methylfuran, 2-Methyltetrahydrofuran, 1,3-Propanediol, Methyl levulinate, Ethyl levulinate, Butyl levulinate, Levulinic acid, gamma-Valerolactone, Tetrahydrofurfuryl alcohol, Cyclopentyl methyl ether, 2,3-Butanediol, Methyl lactate, Ethyl lactate, Limonene, Furfuryl alcohol, gamma-Butyrolactone, Isoamyl alcohol, Lactic acid, 5-Hydroxymethylfurfural, D-Glucose, D-Fructose, D-Sorbitol, Xylitol, Succinic acid, Itaconic acid, Fumaric acid, Malic acid, Citric acid, Glycolic acid, D-Glucaric acid, 3-Hydroxypropionic acid, 2,5-Furandicarboxylic acid, Bis(2-hydroxyethyl) terephthalate, Diphenolic acid, Erythritol, D-Xylose, cis,cis-Muconic acid, Glycerol carbonate, Solketal, alpha-Angelica lactone, Lactide, Isosorbide, Levoglucosan, Dimethyl 2,5-furandicarboxylate, 2,5-Bis(hydroxymethyl)furan, Levoglucosenone, 5-(Ethoxymethyl)furfural.

### Modified UNIFAC 2.0 groups (20)

Oxygen, Nitrogen, Hydrogen, Methane, Ethylene, Carbon monoxide, Carbon dioxide, Hydrogen sulfide, Argon, Ammonia, Sulfur dioxide, Nitrous oxide, Formaldehyde, Hydrogen peroxide, Maleic anhydride, 2,5-Furandicarboxylic acid, Dimethyl 2,5-furandicarboxylate, 2,5-Bis(hydroxymethyl)furan, Levoglucosenone, Helium.

## Recommendation: values you find or measure yourself (carried over from 2026-10-21, still to decide)

The idea (the maintainer, 2026-10-21): find the missing values yourself and add them with a tag "given by CHEPTA"
instead of a paper, so that nothing is infringed.

A tag for values the maintainer adds is a good idea, and the rules are the maintainer's to change. The tag should say
where each number really comes from. Calling it "given by CHEPTA" when it comes from a paper would not change the legal
position, because what matters is whether the number may be used, not whose name is on it. And it would cost two
things: reviewers could no longer check the number, which is the reason for the open-source rule, and it would
misattribute the work.

On the legal side (not legal advice): single measured values are facts, and in most countries facts are not protected
by copyright. Copying whole tables or databases can be restricted (the EU database right), and the commercial databanks
(DIPPR, DDB, DECHEMA) forbid it by their licence contracts whatever the law says about facts; those stay out.

**Proposed:** one new tier, for example `contributed`, whose record always says which of three kinds it is.

| Kind | Example | What the record carries |
|---|---|---|
| Own measurement | your lab measures the viscosity of isosorbide | Best: publish it on Zenodo (free, CC BY, a DOI) with the method and the uncertainty. It is then an open source like any other, CHEPTA cites it, and anyone can reuse it. |
| From a paywalled article | a table in J. Chem. Eng. Data that you can read | The full citation and table, marked "paywalled, checked by the maintainer". This needs a change to rule 1 of AGENTS.md (today paywalled numbers are not used). ChemSep and the thermo library cite paywalled literature this way. Unpaywall first: a legal free copy makes it an ordinary open source (`open_copy.py`). |
| Engineering estimate | your judgement, or a correlation you choose | The basis of the estimate. The interface shows it with a warning, as it shows the predicted tier. |

The interface would show all three, so users see what they rely on.

**How values could come in**, once the tier is decided:
- one small JSON file per component (in `validation/data/contributed/`), with the value or the points, the
  temperatures, the kind, the citation and the uncertainty; the scripts fit it like measured data (section 3 of
  [DATA_RULES.md](DATA_RULES.md)) and the record says `tier: "contributed"`;
- until then, **My data** (proposal 0012) already lets anyone give a vapour pressure or another property for their
  own work, without changing the databank.

**Decisions needed:** (1) a new tier, and its name; (2) whether numbers from paywalled articles are allowed with the
citation; (3) whether CHEPTA should publish its own measurements on Zenodo.
