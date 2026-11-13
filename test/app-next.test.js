// The prototype of the reorganized layout (proposal 0021, src/ui/app-next.js): its navigation, DOM-free. The shell
// itself is a view around CHEPTA.app and is checked on screenshots (docs/ui-review/2026-11-11-reorganization/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, SETTINGS_BUTTON, PICKER_WORKSPACES, METHOD_PAGE, calculations, appNext, MODES, FIRST_CALCULATION, modeOf, navigation, modeTarget, switchMove } from "../src/ui/app-next.js";
import { WORKSPACES, UTILITIES } from "../src/ui/workspaces.js";

test("every workspace has one place: the flowsheet on its own, the others among the calculations", () => {
  const ids = calculations().flatMap(g => g.workspaces.map(w => w.id));
  assert.deepEqual([...ids, "flowsheet"].sort(), WORKSPACES.map(w => w.id).sort());
  assert.equal(new Set(ids).size, ids.length);
  for (const g of calculations()) assert.ok(g.label && g.workspaces.every(w => w.short && w.icon));
});

// changed 2026-11-13 (the maintainer): the Settings button is taken out, the Units button of the context row opens the
// Settings, so the tools are three buttons and the Settings one place
test("every supporting tool of the workbench is reachable, once: the Settings from the Units button, the others from three buttons", () => {
  const items = TOOLS.flatMap(t => t.items);
  assert.deepEqual([...items, "settings"].sort(), UTILITIES.map(u => u.id).sort());
  assert.equal(new Set(items).size, items.length);
  assert.equal(TOOLS.length, 3);
  assert.equal(SETTINGS_BUTTON, "fn-units");
});

test("the Method button has one behaviour per workspace: the picker, or the workspace's own Method page", () => {
  for (const ws of [...PICKER_WORKSPACES, ...Object.keys(METHOD_PAGE)]) assert.ok(WORKSPACES.some(w => w.id === ws), ws);
  assert.equal(PICKER_WORKSPACES.filter(ws => ws in METHOD_PAGE).length, 0);
  assert.equal(typeof appNext, "function");
});

// The switch [Flowsheet | Calculations] (the maintainer, 2026-11-13: the calculations in the rail and the blocks in the
// toolbar, on one screen, were "very confusing"; docs/decisions/2026-11-13-08-ui-0021-flowsheet-mode.md)
test("every workspace has one place in one mode: the flowsheet in Flowsheet mode, each calculation in Calculations mode", () => {
  assert.deepEqual(MODES.map(m => m.id), ["flowsheet", "calculations"]);
  for (const m of MODES) assert.ok(m.label && m.icon && m.title);
  assert.equal(modeOf("flowsheet"), "flowsheet");
  for (const g of calculations()) for (const w of g.workspaces) assert.equal(modeOf(w.id), "calculations", w.id);
  // each calculation is reached from its mode: the switch opens a calculation, the rail or the menu the others
  for (const w of WORKSPACES) assert.equal(modeOf(modeTarget(modeOf(w.id), w.id, null)), modeOf(w.id), w.id);
});

test("Flowsheet mode has no rail and no menu of calculations; Calculations mode has the rail when wide, the menu otherwise", () => {
  assert.deepEqual(navigation("flowsheet", true), { rail: false, menu: false });
  assert.deepEqual(navigation("flowsheet", false), { rail: false, menu: false });
  assert.deepEqual(navigation("calculations", true), { rail: true, menu: false });
  assert.deepEqual(navigation("calculations", false), { rail: false, menu: true });
});

test("the rail's unit models are headed as calculations of their own, not as the flowsheet's blocks", () => {
  assert.deepEqual(calculations().map(g => g.label), ["Properties", "Unit calculations"]);
  assert.deepEqual(calculations()[1].workspaces.map(w => w.short), ["Flash", "Exchanger", "Pipe", "Reactor", "Column"]);
});

test("Calculations brings back the last calculation used, Phase equilibrium when none was", () => {
  assert.equal(FIRST_CALCULATION, "equilibrium");
  assert.equal(modeTarget("calculations", "flowsheet", null), "equilibrium");
  assert.equal(modeTarget("calculations", "flowsheet", "column"), "column");
  assert.equal(modeTarget("calculations", "flowsheet", "flowsheet"), "equilibrium");
  assert.equal(modeTarget("calculations", "flowsheet", "no-such-workspace"), "equilibrium");
  // in Calculations mode already, the switch keeps the calculation shown
  assert.equal(modeTarget("calculations", "pipe", "column"), "pipe");
  assert.equal(modeTarget("flowsheet", "pipe", "column"), "flowsheet");
});

test("the switch from the keyboard: Left and Right move between its halves, Home and End go to the ends, nothing else moves", () => {
  assert.equal(switchMove("ArrowRight", 0), 1);
  assert.equal(switchMove("ArrowRight", 1), 0);
  assert.equal(switchMove("ArrowLeft", 0), 1);
  assert.equal(switchMove("Home", 1), 0);
  assert.equal(switchMove("End", 0), 1);
  for (const key of ["Enter", " ", "ArrowDown", "Tab"]) assert.equal(switchMove(key, 0), null, key);
  assert.equal(switchMove("ArrowRight", -1), null);
});
