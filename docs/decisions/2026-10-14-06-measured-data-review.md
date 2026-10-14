# 2026-10-14: review of the measured-data deviations shown by the full engineering report

- **Asked:** after the engineering report covered every component (#117): the refits it showed, then batch 3b.
- **The rule** (proposal 0008, Part B; `validation/python/check_measured.py`): a record is refitted to the ThermoML
  values when the median deviation of at least three articles is above three times the tolerance, or when the
  measured values cover 25-100 degC; otherwise a deviation above the tolerance stays a warning, and a large one a
  known issue with the reason.
- **The two large deviations, not refitted (known issues, with the reason in `check_measured.py`):**
  - 1-octanol liquid heat capacity (4.3 %): the record agrees with two of the three articles (Rubini 2007 and Paramo
    2015, +1.6 % each); Anouti 2010 alone is -14 % to +1.4 % off.
  - methyl myristate vapour pressure (2.7 %): the articles disagree with each other, Sahraoui 2016-2017 about 1-2 %
    above the record, Zaitsau 2019 (94 values) about 8 % below; the record lies between them.
- **The smaller warnings stay warnings:** none has three agreeing articles above three times the tolerance or data over
  25-100 degC. Closest, for the maintainer to decide: n-nonane liquid viscosity (11 articles agree the ChemSep record is
  4-8 % high, but only over 273-358 K) and the methyl ester viscosities (methyl myristate: 4 articles, +5 to +7 %).
- `docs/MEASURED_CHECKS.md` regenerated (the two known issues); the engineering report now shows no large deviation.
