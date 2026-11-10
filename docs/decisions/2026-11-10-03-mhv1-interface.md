# 2026-11-10-03: MHV1 ("PR + gE (MHV1)", "SRK + gE (MHV1)") in every place where a method is chosen

## What the maintainer asked (2026-11-10, relayed by the coordinating session)

Put the MHV1 method, already in the engine (proposal 0018, docs/decisions/2026-11-06-02-mhv1.md), into the Model selector,
the flowsheet's Method page, the column's own method, project files, `CHEPTA.run`, the command line and the MCP tools.
Names exactly "PR + gE (MHV1)" and "SRK + gE (MHV1)", never "PSRK". Where MHV1 has no NRTL set inside the rule for a
pair, show what the engine does with its reason; no invented parameters. No low-pressure comparison study (the
maintainer, 2026-11-10: not needed).

## What was built (no new data, no new parameters)

- **One spelling everywhere:** `mixing: "MHV1"` next to `model: "PR" | "SRK"`: `system({ model, mixing })` (as before),
  a flowsheet's `thermo.mixing`, a column's `method.mixing`, the workbench's `mixing`. Left out: the classical rule with
  k_ij, so every existing file and request is unchanged. A rule with an activity model, or an unknown rule (including
  "PSRK"), is refused (BAD_INPUT) with the known ones; `system()` itself now refuses `mixing` with an activity model
  instead of ignoring it.
- **Model selector** (`src/ui/model-picker.js`): the equation list offers "PR + gE (MHV1)" and "SRK + gE (MHV1)" in the
  views that support them: the workbench's Model group and the flowsheet's Method page (so also the Column workspace's).
  The pick logic is pure (`equationChoices`, `parseEquation`, `workbenchPatch`, `thermoPatch`, `columnMethod`) and tested.
  The workbench labels the model "PR + gE (MHV1)".
- **A column's own method:** the "Property method of the column" list has the two entries; `column.js` passes the rule to
  the engine; the results name the method; the reproduction block carries `mixing`.
- **Project files: format 7**, written only when the rule is used (workbench, a flowsheet's, reactor's or column
  workspace's thermo, or a column block's method), so other projects keep their format; an older reading (format 6)
  refuses it naming the format, and a file that says format 6 but uses the rule is refused. Schema:
  docs/schema/project-7.json.
- **`CHEPTA.run`, the command line and the MCP tools** take `thermo.mixing` (they all go through the one dispatcher);
  the tool descriptions say so; `reproduction.method` becomes `{ model, vapour, mixing: "MHV1", name: "PR + gE (MHV1)" }`
  only when the rule is used.
- **Where there is no set:** the engine decides (its unchanged refusal for a light gas with a polar liquid, a warning and
  g^E = 0 for another pair without a set). The Method page asks the engine (`src/ui/mhv1-status.js`) and shows its
  message as it is, or each pair's source; nothing is filled in.
- **Tests:** `test/mhv1-interface.test.js`, one per entry point (selector logic, refusal display, workbench, flowsheet,
  column, project round trip, `CHEPTA.run`, command line, MCP), each against the engine called directly, and against the
  classical rule so that a dropped choice would fail. Case: CO2 + methanol (a set fitted inside the rule), by
  docs/METHOD_SELECTION.md for a gas with a polar liquid at pressure; nitrogen + ethanol for the refusal.

## Not done (stated, not hidden)

- The heat exchanger's own stream methods and the Charts workspace's equation list do not offer the rule (they keep PR
  and SRK with k_ij); the stream-method list of the Library's view of pairs does not show MHV1 sets.
- The method advisor (`src/thermo/method-advice.js`) neither recommends nor warns about the rule.
- The DOM wiring of the picker was not run in a browser here; its logic is tested without a DOM.

## What the maintainer must check

- That the Equation list shows the two names and the Method page's note and refusal read as intended (open the workbench
  with CO2 + methanol, then nitrogen + ethanol).
- That format 7 for projects with the rule is acceptable (an alternative: keep format 6 and let older readers fail on the
  unknown key).

## Open (recommendation each)

1. **Let the method advisor recommend the rule** for a gas with a polar liquid above 10 bar (METHOD_SELECTION.md's table
   already says so). Recommended: yes, as the next small step.
2. **Offer the rule in the heat exchanger's stream methods and the Charts equation list.** Recommended: yes, after 1; they
   are one-line changes of the same picker.
3. **Show MHV1's sets in the Library** next to the k_ij sets of a pair. Recommended: yes, so a person sees which set a
   result used.
