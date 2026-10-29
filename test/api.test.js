// The request path and the contracts of milestone M0 (proposal 0015, section 9): one dispatcher over the existing
// functions, with structured outcomes, checks and reproduction data; the execution envelope; the column and sizing
// contracts, which refuse until they are built. The flowsheet is ethanol + water with NRTL and an ideal-gas vapour,
// the method docs/METHOD_SELECTION.md gives for this pair near 1 atm; benzene + glycerol with NRTL is used on purpose
// for its missing pair.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as CHEPTA from "../src/index.js";
import { run, capabilities, registerCapability, OUTCOMES } from "../src/api/dispatcher.js";
import { hash64, canonicalJson } from "../src/api/hash.js";
import { resultGate, newRun, endRun, cancelRun, checkLimits } from "../src/runtime/envelope.js";
import { solveCascade } from "../src/units/columns/engine.js";
import { sizeDrum, sizeDecanter, columnDiameter, membraneArea } from "../src/sizing/sizing.js";
import { registerUnit, runUnit } from "../src/units/units.js";
import { readProject, stateFromProject, projectOf, projectText } from "../src/ui/project.js";

const project = JSON.parse(readFileSync(new URL("../examples/heater-flash.chepta.json", import.meta.url), "utf8"));

test("M0 path: saved project → checks → request → result → saved and reopened, the same numbers", () => {
  const check = run({ capability: "check_project", input: { project } });
  assert.equal(check.outcome, "ok");
  assert.equal(check.value.ok, true, check.value.problems.join(" "));
  const r = run({ capability: "solve_flowsheet", input: { project } });
  assert.equal(r.outcome, "ok", r.error?.message);
  // the same numbers as the library's own function
  assert.deepEqual(r.value, CHEPTA.runFlowsheet(project));
  // checks by group
  assert.ok(r.checks.material_kmol_h < 1e-9);
  assert.ok(Math.abs(r.checks.energy_kW) < 1e-6);
  assert.deepEqual(Object.keys(r.checks.blocks).sort(), ["E1", "F1", "P1", "P2", "V1"]);
  assert.deepEqual(r.checks.loops, []);
  // reproduction: version, method, parameter sets, hashes
  assert.equal(r.reproduction.library, CHEPTA.version);
  assert.deepEqual(r.reproduction.method, { model: "NRTL", vapour: "ideal" });
  assert.equal(r.reproduction.parameter_sets.length, 1);
  assert.match(r.reproduction.input_hash, /^[0-9a-f]{16}$/);
  assert.match(r.reproduction.databank_hash, /^[0-9a-f]{16}$/);
  assert.equal(r.reproduction.user_data_hash, null);
  assert.equal(r.run.status, "done");
  assert.equal(r.run.input_hash, r.reproduction.input_hash);
  // the result is plain JSON (a tool or a page can pass it on)
  assert.deepEqual(JSON.parse(JSON.stringify(r)).value.blocks.V1.state.T_K, r.value.blocks.V1.state.T_K);
  // saved by the workbench and reopened: the same result, and the same request hash for the same flowsheet
  const saved = JSON.parse(projectText(projectOf(stateFromProject(readProject(project)), { version: CHEPTA.version })));
  const again = run({ capability: "solve_flowsheet", input: { project: saved } });
  assert.equal(again.outcome, "ok");
  assert.deepEqual(again.value, r.value);
  assert.equal(run({ capability: "solve_flowsheet", input: { project } }).reproduction.input_hash, r.reproduction.input_hash);
  assert.equal(again.reproduction.databank_hash, r.reproduction.databank_hash);
});

test("outcomes: invalid input names the block or field; missing data stays missing data", () => {
  const fs = JSON.parse(JSON.stringify(project.flowsheet));
  delete fs.blocks[1].spec.T_K;
  const r = run({ capability: "solve_flowsheet", input: { flowsheet: fs } });
  assert.equal(r.outcome, "invalid_input");
  assert.equal(r.error.code, "BAD_INPUT");
  assert.deepEqual(r.error.where.map(w => w.block), ["E1"]);
  const bad = run({ capability: "solve_flowsheet", input: { flowsheet: fs, colour: "red" } });
  assert.equal(bad.outcome, "invalid_input");
  assert.deepEqual(bad.error.where.map(w => w.field), ["input.colour"]);
  assert.equal(run({ capability: "solve_flowsheet", input: {} }).outcome, "invalid_input");
  assert.equal(run({ capability: "no_such_thing" }).outcome, "invalid_input");
  assert.equal(run(null).outcome, "invalid_input");
  // benzene + glycerol: no NRTL pair in the data; never an invented value
  const md = run({ capability: "solve_flowsheet", input: { flowsheet: {
    components: ["benzene", "glycerol"], thermo: { model: "NRTL" },
    blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { benzene: 50, glycerol: 50 }, T_K: 300, P_kPa: 101.325 } }, { id: "P1", type: "product" }],
    streams: [{ id: "S1", from: "F1.out", to: "P1.in" }] } } });
  assert.equal(md.outcome, "missing_data");
  assert.equal(md.value, undefined);
  assert.match(md.error.message, /No NRTL parameters for: Benzene \+ Glycerol/);
});

test("unsupported: the column is listed as not built yet and refused; an internal error is an outcome of its own", () => {
  const list = capabilities();
  const col = list.find(c => c.name === "solve_column");
  assert.equal(col.status, "unsupported");
  assert.match(col.planned, /M1/);
  for (const name of ["capabilities", "find_component", "component_info", "check_project", "flowsheet_status", "solve_flowsheet"]) {
    assert.equal(list.find(c => c.name === name)?.status, "available", name);
  }
  const r = run({ capability: "solve_column", input: {} });
  assert.equal(r.outcome, "unsupported");
  assert.equal(r.error.code, "NOT_AVAILABLE");
  assert.ok(OUTCOMES.includes(r.outcome));
  registerCapability({ name: "test_bug", summary: "A capability with a bug", status: "available", input: { type: "object" },
    run: () => { throw new TypeError("x is undefined"); } });
  const bug = run({ capability: "test_bug", input: {} });
  assert.equal(bug.outcome, "error");
  assert.match(bug.error.message, /internal error: x is undefined/);
  assert.equal(bug.run.status, "failed");
});

test("lookups: a component and its records, with tiers and sources", () => {
  const f = run({ capability: "find_component", input: { query: "64-17-5" } });
  assert.equal(f.outcome, "ok");
  assert.equal(f.value.id, "ethanol");
  const i = run({ capability: "component_info", input: { component: "ethanol" } });
  assert.equal(i.outcome, "ok");
  assert.equal(i.value.cas, "64-17-5");
  assert.ok(i.value.properties.some(p => p.key === "liquidDensity" && p.tier));
  assert.ok(i.value.sources.length > 0);
  assert.equal(run({ capability: "find_component", input: { query: "" } }).outcome, "invalid_input");
  const st = run({ capability: "flowsheet_status", input: { project } });
  assert.equal(st.outcome, "ok");
  assert.equal(st.value.ready, true);
});

test("hash: the published FNV-1a 64-bit test values, and key order does not matter", () => {
  // test vectors of the FNV reference page (http://www.isthe.com/chongo/tech/comp/fnv/): "" , "a", "foobar"
  assert.equal(hash64(""), "cbf29ce484222325");
  assert.equal(hash64("a"), "af63dc4c8601ec8c");
  assert.equal(hash64("foobar"), "85944171f73967e8");
  assert.equal(canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }] }), '{"a":[1,{"c":3,"d":2}],"b":1}');
  assert.equal(hash64({ b: 1, a: 2 }), hash64({ a: 2, b: 1 }));
  assert.notEqual(hash64({ a: 1 }), hash64({ a: 2 }));
});

test("envelope: limits are checked; a cancelled or overtaken run's result is discarded", () => {
  assert.deepEqual(checkLimits(null), { time_ms: 60000 });
  assert.throws(() => checkLimits({ time_ms: -1 }), /positive/);
  assert.throws(() => checkLimits({ steps: 3 }), /unknown key "steps"/);
  assert.equal(run({ capability: "capabilities", input: {}, limits: { time_ms: 0 } }).outcome, "invalid_input");
  const gate = resultGate();
  const first = gate.begin("aaaa");
  const second = gate.begin("bbbb");
  assert.equal(gate.accept(first), false, "an older revision's result is never shown");
  assert.equal(gate.accept(second), true);
  const r = newRun("cccc");
  cancelRun(r);
  assert.equal(endRun(r, "done").status, "cancelled");
});

test("contracts not built yet refuse: the column engine and the sizing layer", () => {
  assert.throws(() => solveCascade({}), e => e.code === "NOT_AVAILABLE" && /M1/.test(e.message));
  // the drum and decanter sizes landed at M1 (test/sizing.test.js): an empty result is now a wrong input
  for (const f of [columnDiameter, membraneArea]) assert.throws(() => f({}), e => e.code === "NOT_AVAILABLE");
  for (const f of [sizeDrum, sizeDecanter]) assert.throws(() => f({}), e => e.code === "BAD_INPUT");
});

test("unit v2: a block's profile, warnings and method pass through runUnit; an unknown warning code is a bug", () => {
  registerUnit({ type: "test-stage", label: "Test stage", inlets: [{ port: "in" }], outlets: [{ port: "out" }],
    solve: ({ inlets, spec }) => ({ outlets: { out: inlets.in[0] }, duty_kW: 0,
      profile: [{ stage: 1, T_K: inlets.in[0].T_K }], method: { model: "NRTL" },
      warnings: [{ code: spec.code ?? "DRY_STAGE", stage: 1, message: "stage 1 runs dry", remedy: "raise the reflux" }] }) });
  const sys = CHEPTA.system({ components: ["ethanol", "water"], model: "NRTL" });
  const s = CHEPTA.stream(sys, { flow_kmol_h: [1, 1], T_K: 300, P_kPa: 101.325 });
  const r = runUnit("test-stage", { sys, inlets: { in: s } });
  assert.deepEqual(r.warnings, [{ code: "DRY_STAGE", message: "stage 1 runs dry", stage: 1, remedy: "raise the reflux" }]);
  assert.deepEqual(r.profile, [{ stage: 1, T_K: 300 }]);
  assert.deepEqual(r.method, { model: "NRTL" });
  assert.throws(() => runUnit("test-stage", { sys, inlets: { in: s }, spec: { code: "HOT" } }), /without a known code/);
  // an existing block returns none of them
  const h = runUnit("heater", { sys, inlets: { in: s }, spec: { T_K: 320 } });
  assert.equal("warnings" in h || "profile" in h || "method" in h, false);
});
