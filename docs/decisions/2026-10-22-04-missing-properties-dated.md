# 2026-10-22: the list of missing properties, one dated file per update

The maintainer (2026-10-22): "you made yesterday a doc with data needed for chemicals. update the file with the info
from today. in fact make a new file with the day of today so we keep track. add this as a rule".

- New file [../MISSING_PROPERTIES_2026-10-22.md](../missing-properties/MISSING_PROPERTIES_2026-10-22.md): the gaps of today, with the
  enthalpy and Gibbs energy of formation added (22 components without the enthalpy, 37 without the Gibbs energy), what
  changed since the file of 2026-10-21, and what today's formation-data search found. The recommendation on values
  the maintainer adds is carried over, still to decide.
- The file of 2026-10-21 stays as it was.
- The rule (docs/DATA_RULES.md section 12; DECISIONS.md, standing rules): every update is a new dated file, made by
  `validation/python/missing_properties.py`, which reproduces the counts of the 2026-10-21 file from that day's
  components.json.
