// The prototype of the reorganized layout (proposal 0021, src/ui/app-next.js): its navigation, DOM-free. The shell
// itself is a view around CHEPTA.app and is checked on screenshots (docs/ui-review/2026-11-11-reorganization/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, PICKER_WORKSPACES, METHOD_PAGE, calculations, appNext } from "../src/ui/app-next.js";
import { WORKSPACES, UTILITIES } from "../src/ui/workspaces.js";

test("every workspace has one place: the flowsheet on its own, the others among the calculations", () => {
  const ids = calculations().flatMap(g => g.workspaces.map(w => w.id));
  assert.deepEqual([...ids, "flowsheet"].sort(), WORKSPACES.map(w => w.id).sort());
  assert.equal(new Set(ids).size, ids.length);
  for (const g of calculations()) assert.ok(g.label && g.workspaces.every(w => w.short && w.icon));
});

test("every supporting tool of the workbench is reachable, once, from the four buttons", () => {
  const items = TOOLS.flatMap(t => t.items);
  assert.deepEqual([...items].sort(), UTILITIES.map(u => u.id).sort());
  assert.equal(TOOLS.length, 4);
});

test("the Method button has one behaviour per workspace: the picker, or the workspace's own Method page", () => {
  for (const ws of [...PICKER_WORKSPACES, ...Object.keys(METHOD_PAGE)]) assert.ok(WORKSPACES.some(w => w.id === ws), ws);
  assert.equal(PICKER_WORKSPACES.filter(ws => ws in METHOD_PAGE).length, 0);
  assert.equal(typeof appNext, "function");
});
