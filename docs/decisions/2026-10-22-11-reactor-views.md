# 2026-10-22: The Reactions page and the reactor blocks (proposal 0010, step 7), and less text in the workbench

Pull request: reactor views (contains the reactors of step 3, docs/decisions/2026-10-22-10-reactors.md, until that
pull request is merged).

## What the maintainer asked for

- "i agree to go to the visuals first step 7 before the rest so i can check there" (2026-10-22), and "it is ok to
  report the imbalances" (the yield reactor).
- "what you press it gives a repetition on the screen of this info ... do not write anything, people would know.
  only if there are errors. same with other tabs, do not repeat", and "no not need to write below the flowsheet name
  the components and the method".

## What was done

- **The Reactions page** (Setup group of the flowsheet toolbar: Components, Method, Reactions).
  - Each reaction has its name, its phase (vapour or liquid) and its coefficients, one field per component.
  - The equation is shown as chips, with the balance check ("Balanced: C H O", or what is off).
  - ΔrH°, ΔrG° and K at 298.15 K appear where the formation data allow; otherwise it says which component has none.
  - An optional heat of reaction with its source, which is used only where a component has no open enthalpy of
    formation.
  - It says which reactors use the reaction. Reactions can be added, deleted, exported as a file and imported into
    another project (new ids where taken).
  - The kinetics come with the CSTR and plug flow (step 5).
- **The reactor blocks** (a Reactors group in the toolbar; the vessel with its agitator on the canvas).
  - **Conversion reactor:** the reactions to use (a check box each), each with its key reactant and conversion; the
    order (in parallel or in series) when there are two or more; the outlet temperature, duty or vapour fraction, and
    the pressure or pressure drop.
  - **Yield reactor:** the key reactant, conversion and basis, the yields per component and a closure component (the
    sum is shown on the mass basis), an optional heat of reaction, and the outlet as above.
  - **The results:**
    - the duty, the heat of the reactions at 298.15 K, the conversion of each key, and the element and material
      balances;
    - a line per reaction;
    - a "Reactors" table under the streams (and in the results panel).
  - A reaction still being written does not stop the flowsheet: only the reactions a reactor uses are checked and
    solved (`usedReactions`).
- **Excel:**
  - A conversion reactor's outlet flows are formulas of its conversions (inputs on the Inputs sheet), in parallel and
    in series.
  - Its duty is out minus in plus the heat of the reactions (a value from CHEPTA).
  - The material balance counts what the reactors make.
  - The yield reactor's outlet stays a value from CHEPTA.
- **Less text** (every workspace):
  - no line above the canvas title (the workspace), no line below it (the components, the model, the conditions), and
    no title unless the project was given one;
  - no "Start by choosing..." box, no "No results yet" and no "None chosen yet";
  - no label of the view at the head of the Inputs panel.
  - On the flowsheet: no hint on the empty canvas, no "Property method: ..." line, and the Flowsheet status only once
    there are blocks.
  - Warnings and errors stay as they were.
- **Tests:**
  - `test/reactor-workspace.test.js`: the edits; a flowsheet built with them solves.
  - `test/flowsheet-excel.test.js`: the reactor's formulas, evaluated, give CHEPTA's flows, in parallel and in series.
  - The screens were checked in a browser, the methanol case end to end.

## What the maintainer should check

- The Reactions page and the two reactor blocks, in the preview of this pull request.
- Whether anything still repeats, or something removed is missed.
