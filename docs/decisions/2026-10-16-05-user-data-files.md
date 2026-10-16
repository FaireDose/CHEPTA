# 2026-10-16: proposal 0012, step 2 — your own data in files

- **Asked:** "ok, continue with step 2"; earlier: someone who adds data saves the project with the data in it, "but
  also save the user data" (proposal 0012, section 3a).
- **Done:**
  - Project format 3 (`src/ui/project.js`): a project keeps the user data it was calculated with as `user_data`. It
    is written as format 3 only when there is user data, otherwise as format 2, so older versions still open it;
    formats 1 and 2 open unchanged. Wrong user data in a project is refused with the reason, and `user_data` in a
    file that says format 1 or 2 is refused.
  - The My data file (`src/ui/user-data-file.js`): `{ "chepta_user_data": 1, saved_with, saved_at, title, user_data }`,
    saved with `userDataDoc` and opened with `readUserDataFile`, which also takes the data out of a project file.
  - Merging (`mergeUserData`): property records merge one property at a time; a component, a pair (its models and
    source together) and a component's groups are one entry each, keyed by component id whatever name was typed. An
    entry held with other numbers is a conflict: the project's entry is kept unless the person chooses the incoming
    one (nothing replaced silently). The panel (step 3) will show the conflicts side by side.
  - The contribution-package draft (`userDataPackage`): one entry as a `component` package (a property record, a
    component, groups; vapour-pressure points as a `pure-vapour-pressure` data block in kPa), with the problems
    `checkPackage` finds (an open copy, the access, a CAS number). Pair parameters are not contributed as such
    (AGENTS.md rule 5): their draft asks for the measured mixture data instead.
  - The workbench state holds the user data (`userData`), and the flowsheet view solves with it, so a format 3
    project with its own components solves in the workbench. Choosing and entering data comes with the panel
    (step 3).
- **Tested** (`test/user-data-files.test.js`): project round trip with the same flowsheet result from the file alone;
  format 2 without user data and older formats opening; four kinds of wrong user data refused; My data file round
  trip, from a project too, and seven wrong files refused; merge with new, equal and conflicting entries and the
  choice; package drafts. `test/project.test.js` now expects format 2 for a project without user data and refuses
  format 4 (the format change, not a result).
- **Next:** step 3, the My data panel.
