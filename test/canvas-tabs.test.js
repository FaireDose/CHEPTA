// The canvas tabs of the reorganized layout (proposal 0021, step 2; src/ui/canvas-tabs.js): their DOM-free part. The
// tabs themselves are checked on screenshots (docs/ui-review/2026-11-12-0021-canvas-tabs/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CANVAS_TABS, tabLabel, tabOf, tabMove, staysOnCanvas, warningCount, tablePreview, cellText, warningsHeading, allLabel } from "../src/ui/canvas-tabs.js";

test("four tabs, in the proposal's order; the flowsheet's Plot is its Drawing", () => {
  assert.deepEqual(CANVAS_TABS.map(t => t.id), ["plot", "table", "data", "warnings"]);
  assert.equal(tabLabel("plot", "txy"), "Plot");
  assert.equal(tabLabel("plot", "flowsheet"), "Drawing");
  assert.equal(tabLabel("warnings", "flash"), "Warnings");
  assert.equal(tabOf("table"), "table");
  assert.equal(tabOf("nonsense"), "plot");
  assert.equal(tabOf(undefined), "plot");
});

test("the arrow keys move between the tabs, round; Home and End to the ends", () => {
  assert.equal(tabMove("ArrowRight", 0), 1);
  assert.equal(tabMove("ArrowRight", 3), 0);
  assert.equal(tabMove("ArrowLeft", 0), 3);
  assert.equal(tabMove("Home", 2), 0);
  assert.equal(tabMove("End", 0), 3);
  assert.equal(tabMove("Enter", 1), null);
  assert.equal(tabMove("ArrowRight", 0, 0), null);
});

test("an error and 'Solving' stay above the tabs; known deviations and notes move to Warnings", () => {
  assert.equal(staysOnCanvas({ role: "alert" }), true);
  assert.equal(staysOnCanvas({ role: "status" }), true);
  assert.equal(staysOnCanvas({ role: "note" }), false);
  assert.equal(staysOnCanvas({ role: null }), false);
  assert.equal(staysOnCanvas(), false);
});

test("the count on the Warnings tab: warnings, the error, and the problems of inputs that are not blank", () => {
  assert.equal(warningCount(), 0);
  assert.equal(warningCount({ warnings: 2 }), 2);
  assert.equal(warningCount({ warnings: 1, error: "No bubble point" }), 2);
  const problems = [{ message: "Component 3 is empty" }];
  assert.equal(warningCount({ missing: { complete: false, blank: false, problems } }), 1);
  // nothing chosen yet is a start, not a problem (shell-contract.js missingOf)
  assert.equal(warningCount({ missing: { complete: false, blank: true, problems } }), 0);
  assert.equal(warningCount({ missing: { complete: true, blank: false, problems: [] } }), 0);
});

test("the Table tab shows at most 300 rows, the rest in the Excel file; cells with six digits", () => {
  const rows = Array.from({ length: 450 }, (_, i) => [i]);
  const p = tablePreview({ rows });
  assert.equal(p.rows.length, 300);
  assert.equal(p.cut, 150);
  assert.equal(p.total, 450);
  assert.equal(tablePreview({ rows: rows.slice(0, 5) }).cut, 0);
  assert.equal(cellText(78.20491234), "78.2049");
  assert.equal(cellText(0), "0");
  assert.equal(cellText(1.2156e-11), "1.2156e-11");
  assert.equal(cellText(2.5e8), "2.5e+8");
  assert.equal(cellText(null), "–");
  assert.equal(cellText(NaN), "–");
  assert.equal(cellText("one liquid"), "one liquid");
});

test("the Warnings tab in two steps: the count above the one-line list, and one button for all", () => {
  assert.equal(warningsHeading(1), "1 warning");
  assert.equal(warningsHeading(3), "3 warnings");
  assert.equal(allLabel(false), "Expand all");
  assert.equal(allLabel(true), "Collapse all");
});

test("an opened warning reads its first sentence once (openHead)", async () => {
  const { openHead } = await import("../src/ui/canvas-tabs.js");
  // the line is the first sentence, cut: open, it shows that sentence whole and the text the rest
  const t = "The liquid is predicted to split into two liquid phases in the hatched region. Results there assume a single liquid and are not reliable.";
  assert.deepEqual(openHead("The liquid is predicted to split into two liquid phases in the…", t),
    { line: "The liquid is predicted to split into two liquid phases in the hatched region", text: "Results there assume a single liquid and are not reliable." });
  // the line is the whole first sentence
  assert.deepEqual(openHead("No bubble point", "No bubble point. Raise the pressure."), { line: "No bubble point", text: "Raise the pressure." });
  // a one-sentence message: no paragraph left
  assert.deepEqual(openHead("No bubble point", "No bubble point."), { line: "No bubble point", text: "" });
  // a label before the text's start: open, the label only, the text whole
  const k = "The ternary azeotrope comes out at 69.95 °C. Reference: Lange's Handbook.";
  assert.deepEqual(openHead("Known deviation (NRTL): The ternary azeotrope comes out at 69.95 °C", k), { line: "Known deviation (NRTL)", text: k });
  assert.deepEqual(openHead("Not calculated: The solver did not…", "The solver did not converge in 50 steps."),
    { line: "Not calculated", text: "The solver did not converge in 50 steps." });
  // nothing in common: both as they are
  assert.deepEqual(openHead("2 problems: a", "Something else."), { line: "2 problems: a", text: "Something else." });
});
