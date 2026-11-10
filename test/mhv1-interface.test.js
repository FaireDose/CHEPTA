// The MHV1 mixing rule ("PR + gE (MHV1)", "SRK + gE (MHV1)"; proposal 0018, decision 2026-11-10-03) at every place where a
// user or a program chooses a method: the selector's logic, the workbench, the flowsheet's Method page, the column's own
// method, project files, CHEPTA.run, the command line and the MCP server. Each test checks that the choice reaches the
// engine and gives the same numbers as calling the engine (system({ model, mixing: "MHV1" })) directly, and differs from
// the classical rule with k_ij (so a choice that was dropped on the way would fail). The property method of the cases:
// CO2 + methanol with a set fitted inside the rule (src/data/mhv1.json), by docs/METHOD_SELECTION.md for a gas with a
// polar liquid at pressure; nitrogen + ethanol on purpose, for the engine's refusal (no set inside the rule, none in the databank).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { system, run, runFlowsheet, normalizeFlowsheet } from "../src/index.js";
import { createMcpServer } from "../src/api/mcp.js";
import { initialState, applyPatch, setsFor, modelLabel } from "../src/ui/app-logic.js";
import { projectOf, projectText, readProject, stateFromProject, checkProject, PROJECT_FORMAT } from "../src/ui/project.js";
import { equationChoices, equationValue, parseEquation, kindChoice, workbenchPatch, thermoPatch, columnMethod, MHV1_CHOICES, EOS_CHOICES } from "../src/ui/model-picker.js";
import { mhv1Status } from "../src/ui/mhv1-status.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "chepta-mhv1-"));
const COMPS = ["carbon dioxide", "methanol"];
const T = 323.15, P = 2000, z = [0.3, 0.7];
const MODERN_META = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "chepta-test", version: "1" } };

/** The engine's flash, directly. */
const direct = (model, mixing) => system({ components: COMPS, model, ...(mixing ? { mixing } : {}) }).flash({ T, P, z });
const liquidOf = r => r.phases.find(p => p.type === "liquid").composition;
const flashSheet = thermo => ({ components: COMPS, thermo,
  blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { "carbon dioxide": 30, methanol: 70 }, T_K: T, P_kPa: P } }, { id: "V1", type: "flash", spec: { P_kPa: P, duty_kW: 0 } },
    { id: "P1", type: "product" }, { id: "P2", type: "product" }],
  streams: [{ id: "S1", from: "F1.out", to: "V1.in" }, { id: "S2", from: "V1.vapour", to: "P1.in" }, { id: "S3", from: "V1.liquid", to: "P2.in" }] });
const near = (a, b, tol, what) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= tol, `${what}: ${v} vs ${b[i]}`));

test("the selector's logic: the equations with MHV1 are named as the engine names them, never PSRK", () => {
  assert.deepEqual(MHV1_CHOICES.map(c => c[1]), ["PR + gE (MHV1)", "SRK + gE (MHV1)"]);
  assert.equal(system({ components: COMPS, model: "PR", mixing: "MHV1" }).info.method, "PR + gE (MHV1)");
  assert.equal(system({ components: COMPS, model: "SRK", mixing: "MHV1" }).info.method, "SRK + gE (MHV1)");
  // a view that does not support the rule is not offered it
  assert.deepEqual(equationChoices(false), EOS_CHOICES);
  assert.deepEqual(equationChoices(true).map(c => c[1]), ["Peng–Robinson", "SRK", "PR + gE (MHV1)", "SRK + gE (MHV1)"]);
  assert.ok(!JSON.stringify(equationChoices(true)).match(/PSRK/i));
  for (const [m, x] of [["PR", null], ["SRK", null], ["PR", "MHV1"], ["SRK", "MHV1"]]) assert.deepEqual(parseEquation(equationValue(m, x)), { model: m, mixing: x });
  // a pick becomes the workbench's patch and the flowsheet's thermo patch; an activity model drops the rule
  const st = { model: "PR", mixing: null };
  assert.deepEqual(workbenchPatch({ model: "PR", vapour: "ideal", mixing: "MHV1" }, st), { vapour: "ideal", mixing: "MHV1" });
  assert.deepEqual(workbenchPatch({ model: "NRTL", vapour: "ideal", mixing: null }, st), { model: "NRTL", vapour: "ideal", mixing: null });
  assert.deepEqual(thermoPatch({ model: "SRK", vapour: "ideal", mixing: "MHV1" }, { model: "PR" }), { model: "SRK", vapour: "ideal", mixing: "MHV1" });
  assert.equal(thermoPatch({ model: "NRTL", vapour: "ideal", mixing: null }, { model: "PR", mixing: "MHV1" }).mixing, undefined);
  assert.equal(kindChoice("activity", "ideal").mixing, null);
  assert.deepEqual(columnMethod("SRK|MHV1"), { model: "SRK", mixing: "MHV1" });
  assert.deepEqual(columnMethod("PR"), { model: "PR" });
  assert.deepEqual(columnMethod("NRTL"), { model: "NRTL", vapour: "ideal" });
  assert.equal(columnMethod(""), null);
});

test("the selector tells what the engine does where MHV1 has no set: its refusal, with its reason", () => {
  const ok = mhv1Status(COMPS, "SRK");
  assert.equal(ok.ok, true);
  assert.equal(ok.pairs.length, 1);
  assert.match(ok.pairs[0].source, /mhv1-fitted/);
  const no = mhv1Status(["nitrogen", "ethanol"], "PR");
  assert.equal(no.ok, false);
  assert.throws(() => system({ components: ["nitrogen", "ethanol"], model: "PR", mixing: "MHV1" }), e => e.code === "NOT_AVAILABLE" && e.message === no.message);
  assert.match(no.message, /no NRTL parameters fitted inside the rule/);
});

test("the workbench: the Model group's mixing reaches the engine, the label names it, and a rule on an activity model is refused", () => {
  let s = initialState({ components: COMPS, model: "PR", mixing: "MHV1" });
  assert.equal(s.mixing, "MHV1");
  assert.equal(modelLabel(s), "PR + gE (MHV1)");
  const sys = system({ components: COMPS, model: s.model, ...setsFor(s, s.model) });
  assert.equal(sys.info.method, "PR + gE (MHV1)");
  const r = sys.flash({ T, P, z });
  near(liquidOf(r), liquidOf(direct("PR", "MHV1")), 1e-12, "workbench flash = engine flash");
  assert.ok(Math.abs(liquidOf(r)[0] - liquidOf(direct("PR"))[0]) > 1e-3, "differs from k_ij");
  s = applyPatch(s, { mixing: null });
  assert.equal(setsFor(s, s.model).mixing, undefined);
  assert.equal(modelLabel(s), "Peng–Robinson");
  assert.throws(() => applyPatch(s, { mixing: "PSRK" }), /Unknown mixing rule/);
  assert.throws(() => system({ components: COMPS, model: "NRTL", mixing: "MHV1" }), e => e.code === "BAD_INPUT" && /activity model/.test(e.message));
});

test("the flowsheet: thermo.mixing reaches the engine (same liquid as the engine's flash), and is checked", () => {
  const r = runFlowsheet(flashSheet({ model: "PR", mixing: "mhv1" }));
  near(r.streams.S3.z, liquidOf(direct("PR", "MHV1")), 1e-9, "flowsheet flash = engine flash");
  const k = runFlowsheet(flashSheet({ model: "PR" }));
  assert.ok(Math.abs(r.streams.S3.z[0] - k.streams.S3.z[0]) > 1e-3, "differs from k_ij");
  assert.equal(normalizeFlowsheet(flashSheet({ model: "SRK", mixing: "MHV1" })).thermo.mixing, "MHV1");
  assert.equal(normalizeFlowsheet(flashSheet({ model: "SRK" })).thermo.mixing, undefined, "a flowsheet without the rule is as before");
  assert.throws(() => normalizeFlowsheet(flashSheet({ model: "NRTL", mixing: "MHV1" })), /goes with model "PR" or "SRK"/);
  assert.throws(() => normalizeFlowsheet(flashSheet({ model: "PR", mixing: "PSRK" })), /not a mixing rule/);
  // the engine's refusal reaches the flowsheet's solver unchanged
  const bad = flashSheet({ model: "PR", mixing: "MHV1" });
  bad.components = ["nitrogen", "ethanol"]; bad.blocks[0].spec.flow_kmol_h = { nitrogen: 30, ethanol: 70 };
  assert.throws(() => runFlowsheet(bad), e => e.code === "NOT_AVAILABLE" && /no NRTL parameters fitted inside the rule/.test(e.message));
});

test("the column's own method: { model, mixing } reaches the engine (no temperature change at the boundary when it equals the flowsheet's)", () => {
  const input = method => ({ components: ["methanol", "water"], thermo: { model: "PR", mixing: "MHV1" }, feed: { flow_kmol_h: { methanol: 50, water: 50 }, T_K: 340, P_kPa: 101.325 },
    column: { mode: "rigorous", stages: 12, feed_stage: 6, condenser: "total", P_kPa: 101.325, reflux_ratio: 2, distillate_kmol_h: 50, ...(method ? { method } : {}) } });
  const flowsheetLevel = run({ capability: "solve_column", input: input(null) });
  const own = run({ capability: "solve_column", input: input({ model: "PR", mixing: "MHV1" }) });
  const classical = run({ capability: "solve_column", input: input({ model: "PR" }) });
  assert.equal(own.outcome, "ok");
  assert.deepEqual(own.value.distillate.flow_kmol_h, flowsheetLevel.value.distillate.flow_kmol_h);
  assert.equal(own.value.column.method.mixing, "MHV1");
  assert.ok(own.value.column.boundary.every(b => Math.abs(b.dT_K) < 1e-6), "the column's method is the flowsheet's: no change at the boundary");
  assert.match(own.value.column.notes.join(" "), /PR \+ gE \(MHV1\)/);
  assert.ok(classical.value.column.boundary.some(b => Math.abs(b.dT_K) > 0.01), "the classical rule differs");
  assert.equal(own.reproduction.block_methods.C1.mixing, "MHV1");
  assert.equal(run({ capability: "solve_column", input: input({ model: "NRTL", mixing: "MHV1" }) }).outcome, "invalid_input");
});

test("project files: a workbench and a flowsheet with MHV1 round-trip (format 7, written only then), and an older reading refuses it", () => {
  const plain = projectOf(initialState({ components: COMPS, model: "PR" }));
  assert.ok(plain.fugacity_project <= 6 && !("mixing" in plain.workbench), "without the rule the file is as before");
  let s = initialState({ components: COMPS, model: "SRK", mixing: "MHV1" });
  s = applyPatch(s, { workspace: "flowsheet", flowsheet: flashSheet({ model: "SRK", mixing: "MHV1" }) });
  const doc = projectOf(s, { version: "1.0.0", now: new Date("2026-11-10T12:00:00Z") });
  assert.equal(doc.fugacity_project, 7);
  assert.equal(doc.workbench.mixing, "MHV1");
  assert.equal(doc.flowsheet.thermo.mixing, "MHV1");
  const back = stateFromProject(projectText(doc));
  assert.equal(back.mixing, "MHV1");
  assert.equal(back.model, "SRK");
  assert.deepEqual(projectOf(back, { version: "1.0.0", now: new Date("2026-11-10T12:00:00Z") }), doc, "save, open, save: the same file");
  near(liquidOf(system({ components: COMPS, model: back.model, ...setsFor(back, back.model) }).flash({ T, P, z })), liquidOf(direct("SRK", "MHV1")), 1e-12, "reopened workbench = engine");
  near(runFlowsheet(readProject(doc)).streams.S3.z, liquidOf(direct("SRK", "MHV1")), 1e-9, "reopened flowsheet = engine");
  // the rule needs format 7: a file that says format 6 and uses it is refused, naming the reason
  assert.throws(() => readProject({ ...doc, fugacity_project: 6 }), /MHV1.*format 7/);
  assert.equal(checkProject({ ...doc, fugacity_project: 6 }).ok, false);
  // a column's own method counts as well
  const col = flashSheet({ model: "PR" });
  col.blocks.push({ id: "C1", type: "column", spec: { method: { model: "PR", mixing: "MHV1" } } });
  assert.equal(projectOf(applyPatch(initialState({ components: COMPS }), { workspace: "flowsheet", flowsheet: col })).fugacity_project, 7);
  assert.ok(PROJECT_FORMAT >= 7);
});

test("CHEPTA.run: thermo.mixing gives the engine's numbers and the reproduction block names the method", () => {
  const r = run({ capability: "solve_flowsheet", input: { flowsheet: flashSheet({ model: "PR", mixing: "MHV1" }) } });
  assert.equal(r.outcome, "ok");
  near(r.value.streams.S3.z, liquidOf(direct("PR", "MHV1")), 1e-9, "run = engine");
  assert.deepEqual(r.reproduction.method, { model: "PR", vapour: null, mixing: "MHV1", name: "PR + gE (MHV1)" });
  const k = run({ capability: "solve_flowsheet", input: { flowsheet: flashSheet({ model: "PR" }) } });
  assert.deepEqual(k.reproduction.method, { model: "PR", vapour: null }, "without the rule the block is as before");
  const bad = run({ capability: "solve_flowsheet", input: { flowsheet: flashSheet({ model: "NRTL", mixing: "MHV1" }) } });
  assert.equal(bad.outcome, "invalid_input");
  const refused = flashSheet({ model: "PR", mixing: "MHV1" });
  refused.components = ["nitrogen", "ethanol"]; refused.blocks[0].spec.flow_kmol_h = { nitrogen: 30, ethanol: 70 };
  const rr = run({ capability: "solve_flowsheet", input: { flowsheet: refused } });
  assert.notEqual(rr.outcome, "ok");
  assert.match(JSON.stringify(rr), /no NRTL parameters fitted inside the rule/);
});

test("the command line: a request with thermo.mixing gives the library's numbers", () => {
  const request = { capability: "solve_flowsheet", input: { flowsheet: flashSheet({ model: "SRK", mixing: "MHV1" }) } };
  const f = join(dir, "mhv1-request.json");
  writeFileSync(f, JSON.stringify(request));
  const p = spawnSync(process.execPath, [join(ROOT, "bin", "chepta.mjs"), "request", f, "--compact"], { cwd: ROOT, encoding: "utf8", timeout: 60000 });
  assert.equal(p.status, 0, p.stderr);
  const out = JSON.parse(p.stdout);
  near(out.value.streams.S3.z, liquidOf(direct("SRK", "MHV1")), 1e-9, "command line = engine");
  assert.equal(out.reproduction.method.name, "SRK + gE (MHV1)");
  // and `chepta run` on a saved project
  const pf = join(dir, "mhv1.chepta.json");
  writeFileSync(pf, JSON.stringify({ fugacity_project: 7, workbench: {}, flowsheet: flashSheet({ model: "SRK", mixing: "MHV1" }) }));
  const q = spawnSync(process.execPath, [join(ROOT, "bin", "chepta.mjs"), "run", pf, "--compact"], { cwd: ROOT, encoding: "utf8", timeout: 60000 });
  assert.equal(q.status, 0, q.stderr);
  near(JSON.parse(q.stdout).value.streams.S3.z, liquidOf(direct("SRK", "MHV1")), 1e-9, "chepta run = engine");
});

test("the MCP tool interface: the tools take thermo.mixing and describe it; the numbers are the engine's", async () => {
  const out = [];
  const srv = createMcpServer({ startRun: req => ({ result: Promise.resolve(run(req)), cancel() {} }), send: m => out.push(m) });
  await srv.handle({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: MODERN_META } });
  const tools = out[0].result.tools;
  for (const name of ["solve_flowsheet", "solve_column", "solve_membrane"]) assert.ok(tools.some(t => t.name === name), name);
  assert.match(tools.find(t => t.name === "solve_column").inputSchema.properties.thermo.description, /mixing/);
  assert.match(tools.find(t => t.name === "solve_column").inputSchema.properties.column.description, /mixing/);
  await srv.handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "solve_flowsheet", arguments: { flowsheet: flashSheet({ model: "PR", mixing: "MHV1" }) }, _meta: MODERN_META } });
  const r = out[1].result;
  assert.equal(r.isError, false, r.content[0].text);
  near(r.structuredContent.value.streams.S3.z, liquidOf(direct("PR", "MHV1")), 1e-9, "MCP = engine");
  assert.equal(r.structuredContent.reproduction.method.mixing, "MHV1");
});
