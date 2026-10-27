# 2026-10-25: Normal boiling points from a curve extended beyond the measured values

## What the maintainer asked for

- "If Chepta has already a curve of vapor pressure, why is it missing a boiling point, doesn't make sense. a curve
  gives automatically the boiling point at that pressure."
- On a first proposal to extend by at most 1 K: "why not more than 1k? This is an extrapolation, right? so then with
  this rule how many chemicals would solve the boiling point problem?" Then, on the 50 kPa rule below: "ok".

## What was decided

- A vapour-pressure curve fitted to measured values may be extended to 101.325 kPa when the last measured value is at
  **50 kPa or more**. The record then reaches the boiling point and says how far it was extended and with what
  estimated error (docs/DATA_RULES.md section 3).
- Below 50 kPa there is no normal boiling point. The `Tb_note` gives the extended value as an indication only, with
  the error the check finds at that distance.

## Why 50 kPa

`validation/python/tb_extrapolation_check.py` measures the error on curves whose answer is known:
- the reference curves are CoolProp's, for 22 liquids;
- each "measured set" has 10 values over a factor of 30 in pressure, with 0.5 % or 1 % scatter, repeated 200 times;
- each set is fitted with CHEPTA's curve form and extended to 101.325 kPa.

The 95th percentile of the error, at 1 % scatter, is:

| Last measured value | About this far below Tb | Median liquid | Worst liquid |
|---|---|---|---|
| 95 kPa | 2 K | 0.6 K | 0.9 K |
| 80 kPa | 8 K | 0.8 K | 1.3 K |
| 50 kPa | 23 K | 1.3 K | 2.5 K |
| 20 kPa | 49 K | 3.1 K | 6.2 K |
| 7 kPa | 73 K | 6.1 K | 13.8 K |
| 1 kPa | 109 K | 17 K | no boiling point for some liquids |

From 50 kPa the error stays within about 1-2.5 K, near the 1 K that CHEPTA asks of a pair set's pure-component
boiling points (docs/DATA_RULES.md section 5). Far beyond the data a fitted curve can even turn down again:
levoglucosenone's, from 3.5 kPa, peaks near 700 K.

## What changed

- **Limonene:** its curve is extended by 0.20 K, from 450.00 K (100.8 kPa). Normal boiling point 450.20 K, estimated
  within 0.9 K. The NIST WebBook's average of 13 measured values is 451 ± 4 K.
- **2,3-Butanediol:** extended by 0.75 K, from 455.00 K (98.9 kPa). Normal boiling point 455.75 K, within 0.9 K. The
  WebBook's measured values have a median of 455.4 K. Its curve rests on Stull's 1947 compilation, the only source
  over its range.
- **No boiling point, with the indication in the note:**
  - solketal: last value 7.1 kPa, about 456 K, 83 K beyond the data;
  - glycerol carbonate: last value 0.9 kPa, about 600 K;
  - levoglucosenone: last value 3.5 kPa, about 629 K.
- **The seven other components without a boiling point** have no vapour-pressure curve at all.
- **Limonene and 2,3-butanediol** now join the vapour-liquid pairs wanted at 1 atm (docs/DATA_WANTED.md).
- **The engineering report** compares their boiling points with the WebBook's.
- **Not a change of value:** the heat-capacity records of 2,3-butanediol and glycerol carbonate now name only the
  ThermoML Archive. The script has named only the sources a record uses since #163; their values are unchanged.
- **`make_sources.py`** skips `validation/data/searches/`: search records and held sets are cited by no record.

## Still open

- Limonene and Gowda 2018 (docs/decisions/2026-10-25-01-core-search.md): the thesis set is no longer needed for the
  boiling point. It only decides whether the curve moves by about 2 %.
- For next week (the maintainer, 2026-10-25): a list of the articles whose servers refused the scripts, with links, so
  the maintainer can download them.
