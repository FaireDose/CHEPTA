// The shell's contract (proposal 0021, step 1; src/ui/shell-contract.js): what the workbench says about the current
// calculation, DOM-free. Both layouts read it: the status bar of the classic one and the top bar of the new one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, applyPatch, modelLabel, tierSummary, tierCounts, setsFor, viewCheck } from "../src/ui/app-logic.js";
import { WORKSPACES } from "../src/ui/workspaces.js";
import { system } from "../src/system.js";
import {
  OWN_METHOD, methodOf, dataOf, unitsOf, missingOf, isBlank, sourcesOf, componentsOf, statusOf, setsRuleOf, shellContext,
} from "../src/ui/shell-contract.js";
import { METHOD_ACTION, menuMove } from "../src/ui/app-next.js";

const at = patch => applyPatch(initialState(), patch);
const CHOICES = ["workbench", "liquid", "equation", "own", "streams", "fixed"];

test("every workspace and view has one method choice, and the Method button an action for it", () => {
  for (const w of WORKSPACES) {
    for (const view of w.views) {
      const m = methodOf(at({ view }));
      assert.ok(CHOICES.includes(m.choice), `${view}: ${m.choice}`);
      assert.ok(METHOD_ACTION[m.choice], `${view}: no action for ${m.choice}`);
      assert.ok(m.label && m.note, view);
    }
  }
  assert.deepEqual(Object.keys(METHOD_ACTION).sort(), [...CHOICES].sort());
});

test("the method: the workbench's, the liquid's, the Charts' equation, a document's own, or one fixed", () => {
  assert.equal(methodOf(at({ view: "ternary" })).choice, "workbench");
  assert.equal(methodOf(at({ view: "ternary" })).label, modelLabel(at({ view: "ternary" })));
  assert.equal(methodOf(at({ view: "flash", model: "NRTL", vapour: "PR" })).label, "NRTL with a PR vapour");
  // Charts: an equation of state only, chosen with the Method button (no longer only in its toolbar)
  const ch = methodOf(at({ view: "charts", components: ["methane", "ethane"], model: "PR", mixing: "MHV1" }));
  assert.deepEqual([ch.choice, ch.model, ch.mixing, ch.label], ["equation", "PR", "MHV1", "PR + gE (MHV1)"]);
  assert.equal(methodOf(at({ view: "charts", model: "NRTL" })).label, "Choose an equation of state");
  assert.equal(methodOf(at({ view: "solid" })).choice, "liquid");
  assert.equal(methodOf(at({ view: "sle", model: "PR" })).label, "Choose an activity model");
  for (const [view, label] of [["steam", "IAPWS-IF97"], ["henry", "Henry's law"], ["properties", "Pure-component data"]]) {
    assert.deepEqual([methodOf(at({ view })).choice, methodOf(at({ view })).label], ["fixed", label]);
  }
  // the flowsheet, the column and the reactor keep their own method, in their document
  for (const ws of Object.keys(OWN_METHOD)) {
    const s = at({ workspace: ws, [ws]: { components: ["methanol", "water"], thermo: { model: "UNIQUAC", vapour: "SRK" } } });
    const m = methodOf(s);
    assert.deepEqual([m.choice, m.page, m.model, m.label], ["own", OWN_METHOD[ws], "UNIQUAC", "UNIQUAC with a SRK vapour"], ws);
  }
  // a process exchanger: each stream its own
  const hx = methodOf(at({ view: "hx", hx: { mode: "two" } }));
  assert.equal(hx.choice, "streams");
});

test("the data: the tiers of the pairs the calculation uses, as the readouts count them", () => {
  const s = at({ view: "ternary", components: ["methanol", "acetone", "chloroform"] });
  const use = viewCheck(s).use;
  const sys = system({ components: use, model: "NRTL", allowMissingPairs: true, ...setsFor(s, "NRTL") });
  const d = dataOf(s);
  assert.equal(d.pairs, tierSummary(tierCounts(sys.info.pairs, sys.info.missingPairs)));
  assert.equal(d.tiers.reduce((a, t) => a + t.count, 0), 3);
  assert.equal(d.sets, null);
  assert.equal(d.text, d.pairs);
  // an equation of state counts its k_ij pairs
  assert.match(dataOf(at({ view: "pxy", components: ["methane", "ethane"], model: "PR" })).pairs, /^1 k_ij pair: /);
  // the rule of the sets, as the status bar showed it before
  const db = at({ view: "ternary", prefer: ["databank"] });
  assert.equal(setsRuleOf(db), "Sets: Databank only (ChemSep)");
  assert.equal(dataOf(db).text, `${dataOf(db).pairs}; Sets: Databank only (ChemSep)`);
  assert.equal(dataOf(at({ view: "txy", model: "ideal" })).pairs, "Ideal solution, no pair parameters");
  // no pairs: the view's own line, when it has drawn
  const steam = at({ view: "steam" });
  assert.equal(dataOf(steam).pairs, null);
  assert.equal(dataOf(steam, { data: "IAPWS-IF97 (Standard)" }).text, "IAPWS-IF97 (Standard)");
  // a document's own pairs, with its own method
  const fs = at({ workspace: "flowsheet", flowsheet: { components: ["methanol", "water"], thermo: { model: "NRTL" } } });
  assert.match(dataOf(fs).pairs, /^1 pair: /);
});

test("the units and the composition basis", () => {
  assert.deepEqual(unitsOf(at({})), { T: "°C", P: "kPa", basis: "mol frac", text: "°C, kPa, mol frac" });
  const u = unitsOf(at({ units: { T: "K", P: "bar" }, basis: "mass" }));
  assert.equal(u.text, "K, bar, wt %");
});

test("what is missing: the inputs' problems, a blank start, a document without components", () => {
  const ok = missingOf(at({ view: "ternary" }));
  assert.deepEqual(ok, { complete: true, blank: false, problems: [] });
  const two = missingOf(at({ view: "txy", inputs: { txy: ["methanol", null] } }));
  assert.equal(two.complete, false);
  assert.equal(two.blank, false);
  assert.ok(two.problems.length && two.problems.every(p => typeof p.message === "string"));
  const empty = at({ view: "txy", inputs: { txy: [null, null] } });
  assert.equal(isBlank(empty), true);
  assert.deepEqual([missingOf(empty).complete, missingOf(empty).blank], [false, true]);
  assert.equal(isBlank(at({ view: "steam" })), false);
  const col = missingOf(at({ workspace: "column" }));
  assert.deepEqual([col.complete, col.blank], [false, true]);
});

test("the sources used here: those of the calculation's components and pairs", () => {
  const s = at({ view: "txy", components: ["ethanol", "water"] });
  assert.deepEqual(componentsOf(s), ["ethanol", "water"]);
  const { ids, sources } = sourcesOf(s);
  assert.deepEqual(ids, ["ethanol", "water"]);
  assert.ok(sources.length > 0);
  assert.ok(sources.every(x => x.usedBy.some(u => ["ethanol", "water"].includes(u.component) || u.pair || u.gas)));
  assert.deepEqual(sourcesOf(at({ view: "txy", inputs: { txy: [null, null] } })).sources, []);
});

test("the state of the calculation, as the status bar words it", () => {
  assert.equal(statusOf({ ms: 9.2 }).text, "Ready, 9 ms");
  assert.equal(statusOf({ ms: 0.1 }).text, "Ready, 1 ms");
  assert.equal(statusOf({ ms: 2345 }).text, "Ready, 2.3 s");
  assert.deepEqual([statusOf({ waiting: true }).kind, statusOf({ waiting: true }).text], ["waiting", "Inputs needed"]);
  assert.deepEqual([statusOf({ busy: true }).kind, statusOf({ error: "x" }).text], ["busy", "Error"]);
  assert.equal(statusOf({}).text, "Ready");
  const c = shellContext(at({ view: "flash" }), { ms: 5 });
  assert.deepEqual(Object.keys(c).sort(), ["data", "method", "missing", "status", "units", "view", "workspace"]);
});

test("the arrow keys in the menus: down, up, home, end, round", () => {
  assert.equal(menuMove("ArrowDown", -1, 3), 0);
  assert.equal(menuMove("ArrowDown", 2, 3), 0);
  assert.equal(menuMove("ArrowUp", 0, 3), 2);
  assert.equal(menuMove("ArrowUp", -1, 3), 2);
  assert.equal(menuMove("Home", 2, 3), 0);
  assert.equal(menuMove("End", 0, 3), 2);
  assert.equal(menuMove("Enter", 0, 3), null);
  assert.equal(menuMove("ArrowDown", -1, 0), null);
});
