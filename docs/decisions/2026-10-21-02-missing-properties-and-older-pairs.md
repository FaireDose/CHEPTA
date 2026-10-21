# 2026-10-21: the missing properties, and the older ChemSep pairs

**The missing properties.** The maintainer asked for a dated list of every pure-component property still missing
besides the vapour-liquid pairs, with the recommendation on values the maintainer finds or measures:
[../MISSING_PROPERTIES_2026-10-21.md](../MISSING_PROPERTIES_2026-10-21.md). It is a snapshot (174 components), not a
generated page. The tier for such values is not decided yet (open item in [../DECISIONS.md](../DECISIONS.md)).

**The older ChemSep pairs** found while adding neopentane, helium and methylcyclohexane (2026-10-21) are imported, by
the maintainer's request, as tier "databank" with the usual data-wanted note:

| Pair | Model | Set | Note in the record |
|---|---|---|---|
| 2,3-butanediol + water | NRTL | ChemSep | predicts two liquids at 273.15 K, x(2,3-butanediol) 0.057-0.138; not checked against data |
| ethanol + isoamyl alcohol | NRTL | ChemSep | one liquid |
| isoamyl alcohol + water | NRTL | ChemSep | two liquids from 273.15 to 373.15 K (x(isoamyl alcohol) about 0.002-0.42); not checked against data |
| n-hexane + isoamyl alcohol | PR, SRK | ChemSep pr.ipd, srk.ipd (p747) | k_ij 0.0485 (PR), 0.0496 (SRK) |

Scripts: `chemsep_pairs.py --all --write`, `eos_kij_from_chemsep.py ... --add-new --write`, `make_sources.py`.
`test/databank-pairs.test.js` checks the two-liquid notes against the engine's stability test.

None of these pairs has a set fitted to measured data yet; where one is fitted later, it becomes the default
([../DATA_RULES.md](../DATA_RULES.md) section 5).
