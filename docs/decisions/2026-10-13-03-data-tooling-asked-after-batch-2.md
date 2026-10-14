# 2026-10-13: data tooling (asked after batch 2)

- **Asked:** why building batch 2 took so long, and how to get the data more efficiently. The maintainer chose three
  changes:
  - one list of the components;
  - fitting only the new batch;
  - a report of the sources per property before fitting.
- **Done:**
  - **One list:** `validation/data/component_registry.json` (read by `validation/python/registry.py`) replaces the
    eleven hand-kept lists of add_components.py, fit_properties.py and check_measured.py. The CoolProp gaps are no
    longer typed: the script probes CoolProp for them.
    - Every derived list was checked equal to the one it replaces, and a full run gives the same data files.
    - Two reports change only in order: docs/MEASURED_CHECKS.md and docs/PURE_DATA.md now follow the registry order.
    - One text changes, a correction: the access text of the two Perkins and Huber records had not been refitted
      after its last edit in #107.
    - A test checks that every component is in the registry.
  - **Fitting one batch:** `fit_properties.py --only ID ...` fits just those components, in about 6 s instead of
    7.5 min, and writes the same records as a full run (checked). docs/PURE_DATA.md is rewritten only by the full run
    at the end.
  - **Sources per property:** `validation/python/gap_report.py`, for a batch or the ids given, shows what CoolProp,
    ChemSep, the full NIST WebBook page (Mask=FFFF, as the maintainer pointed out) and the ThermoML Archive have for
    each property, and marks GAP where none has it.
    - Run on batch 2, it shows the gaps found by hand there: the triglycerides, methyl linoleate, and the methyl
      oleate and linoleate melting data.
    - The articles to ask for can be listed at the start of a batch.
