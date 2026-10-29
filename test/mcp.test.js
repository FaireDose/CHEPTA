// The local MCP server (bin/chepta-mcp.mjs, src/api/mcp.js; proposal 0015, milestone M1, W8), spawned as a host would:
// initialize / tools/list / tools/call (legacy revision 2025-11-25) and the same calls with per-request _meta
// (revision 2026-07-28); the same numbers as the library and the command line for the same saved project; a missing-data
// call stays a missing-data tool error with no value; notes, warnings and the reproduction block reach the answer; the
// host's cancellation stops a call. Flowsheets: ethanol + water with NRTL and an ideal-gas vapour (docs/METHOD_SELECTION.md);
// benzene + glycerol with NRTL on purpose for its missing pair.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run, registerCapability } from "../src/api/dispatcher.js";
import { createMcpServer, mcpTools, MCP_MODERN, MCP_LEGACY } from "../src/api/mcp.js";
import { registerUnit } from "../src/units/units.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXAMPLE = join(ROOT, "examples", "heater-flash.chepta.json");
const project = JSON.parse(readFileSync(EXAMPLE, "utf8"));
const same = r => { const { run: _run, ...rest } = JSON.parse(JSON.stringify(r)); return rest; };
const MODERN_META = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "chepta-test", version: "1" } };
const PUMP = { components: ["ethanol", "water"], thermo: { model: "NRTL", vapour: "ideal" },
  blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { ethanol: 40, water: 60 }, T_K: 300, P_kPa: 101.325 } },
    { id: "M1", type: "pump", spec: { P_kPa: 300 } }, { id: "P1", type: "product" }],
  streams: [{ id: "S1", from: "F1.out", to: "M1.in" }, { id: "S2", from: "M1.out", to: "P1.in" }] };
const MISSING = { components: ["benzene", "glycerol"], thermo: { model: "NRTL" },
  blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { benzene: 50, glycerol: 50 }, T_K: 300, P_kPa: 101.325 } }, { id: "P1", type: "product" }],
  streams: [{ id: "S1", from: "F1.out", to: "P1.in" }] };

/** The server as a child process, with a call(method, params) → response and notify(method, params). */
function server(args = []) {
  const p = spawn(process.execPath, [join(ROOT, "bin", "chepta-mcp.mjs"), ...args], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
  const waiting = new Map(), stray = [];
  let buf = "", next = 1;
  p.stdout.setEncoding("utf8");
  p.stdout.on("data", d => {
    buf += d;
    for (let i; (i = buf.indexOf("\n")) >= 0;) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      const m = JSON.parse(line);   // every line of standard output is one JSON-RPC message
      if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } else stray.push(m);
    }
  });
  const send = m => p.stdin.write(`${JSON.stringify(m)}\n`);
  return {
    stray,
    call(method, params, id = next++) { return new Promise(res => { waiting.set(id, res); send({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }); }); },
    notify(method, params) { send({ jsonrpc: "2.0", method, ...(params ? { params } : {}) }); },
    raw(line) { p.stdin.write(`${line}\n`); },
    close() { return new Promise(res => { p.on("exit", res); p.stdin.end(); }); },
  };
}

test("MCP (2025-11-25): initialize, tools/list, tools/call — the library's numbers, and the command line's", async () => {
  const s = server();
  const init = await s.call("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "chepta-test", version: "1" } });
  assert.equal(init.result.protocolVersion, "2025-11-25");
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
  assert.equal(init.result.serverInfo.name, "chepta");
  assert.match(init.result.instructions, /never estimate/);
  s.notify("notifications/initialized");
  const list = await s.call("tools/list");
  const names = list.result.tools.map(t => t.name);
  // solve_column is a tool since the shortcut column (proposal 0015, M1); an unsupported capability is not offered
  // (the later test registers one)
  assert.deepEqual(names, ["capabilities", "find_component", "component_info", "check_project", "flowsheet_status", "solve_flowsheet", "solve_column"]);
  for (const t of list.result.tools) {
    assert.equal(t.inputSchema.type, "object");
    assert.equal(t.annotations.readOnlyHint, true);
    assert.match(t.name, /^[a-z_]+$/);
  }
  assert.deepEqual(list.result.tools.find(t => t.name === "solve_flowsheet").inputSchema, run({ capability: "capabilities", input: {} }).value.find(c => c.name === "solve_flowsheet").input);

  const call = await s.call("tools/call", { name: "solve_flowsheet", arguments: { project } });
  const r = call.result;
  assert.equal(r.isError, false);
  assert.equal(r.resultType, undefined, "legacy answers carry no resultType");
  const lib = run({ capability: "solve_flowsheet", input: { project } });
  assert.deepEqual(same(r.structuredContent), same(lib));
  assert.deepEqual(JSON.parse(r.content[1].text), r.structuredContent);
  assert.match(r.content[0].text, /^solve_flowsheet: ok\. 4 streams, 5 blocks; method NRTL/);
  assert.match(r.content[0].text, /Pair Ethanol \+ Water: set fitted-kamihama2012, tier fitted/);
  // the command line, on the same saved file
  const c = spawnSync(process.execPath, [join(ROOT, "bin", "chepta.mjs"), "run", EXAMPLE], { cwd: ROOT, encoding: "utf8" });
  assert.deepEqual(same(JSON.parse(c.stdout)), same(r.structuredContent));

  // notes reach the answer; missing data is a tool error with no value; invalid input names its field
  const pump = (await s.call("tools/call", { name: "solve_flowsheet", arguments: { flowsheet: PUMP } })).result;
  assert.match(pump.structuredContent.qualifications.notes[0].note, /typical value/);
  assert.match(pump.content[0].text, /1 note\(s\) from the blocks/);
  const md = (await s.call("tools/call", { name: "solve_flowsheet", arguments: { flowsheet: MISSING } })).result;
  assert.equal(md.isError, true);
  assert.equal(md.structuredContent.outcome, "missing_data");
  assert.equal(md.structuredContent.value, undefined);
  assert.match(md.content[0].text, /^solve_flowsheet: missing_data \(MISSING_DATA\)\. No NRTL parameters for: Benzene \+ Glycerol/);
  const bad = (await s.call("tools/call", { name: "solve_flowsheet", arguments: { project, colour: "red" } })).result;
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /invalid_input[\s\S]*Where: input\.colour/);
  // protocol errors: an unknown tool, an unknown method, a line that is not JSON (an unsupported capability is no tool:
  // below)
  assert.equal((await s.call("tools/call", { name: "no_such_tool", arguments: {} })).error.code, -32602);
  assert.equal((await s.call("resources/list")).error.code, -32601);
  assert.deepEqual((await s.call("ping")).result, {});
  s.raw("{ not json");
  await s.call("ping");
  assert.equal(s.stray.find(m => m.error?.code === -32700)?.id, null);
  await s.close();
});

test("MCP (2026-07-28): per-request _meta, server/discover, version errors, cancellation", async () => {
  const s = server(["--time-ms", "30000"]);
  const d = await s.call("server/discover", { _meta: MODERN_META });
  assert.equal(d.result.resultType, "complete");
  assert.deepEqual(d.result.supportedVersions, [...MCP_MODERN, ...MCP_LEGACY]);
  assert.equal(d.result._meta["io.modelcontextprotocol/serverInfo"].name, "chepta");
  const list = await s.call("tools/list", { _meta: MODERN_META });
  assert.deepEqual(list.result.tools, mcpTools());
  const call = await s.call("tools/call", { name: "check_project", arguments: { project }, _meta: MODERN_META });
  assert.equal(call.result.resultType, "complete");
  assert.equal(call.result.isError, false);
  assert.equal(call.result.content[0].text, "check_project: no problems");
  const old = await s.call("tools/list", { _meta: { ...MODERN_META, "io.modelcontextprotocol/protocolVersion": "1900-01-01" } });
  assert.equal(old.error.code, -32022);
  assert.deepEqual(old.error.data, { supported: [...MCP_MODERN, ...MCP_LEGACY], requested: "1900-01-01" });
  const noCaps = await s.call("tools/list", { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } });
  assert.equal(noCaps.error.code, -32602);
  // neither _meta nor initialize: refused, naming both ways
  assert.match((await s.call("tools/list")).error.message, /2026-07-28.*initialize/);
  // the host cancels a call: nothing more is sent for it
  const id = "to-cancel";
  const pending = s.call("tools/call", { name: "solve_flowsheet", arguments: { project }, _meta: MODERN_META }, id);
  s.notify("notifications/cancelled", { requestId: id, reason: "test" });
  const after = await s.call("ping", { _meta: MODERN_META });
  assert.equal(after.result.resultType, "complete");
  const raced = await Promise.race([pending.then(() => "answered"), new Promise(res => setTimeout(() => res("silent"), 1500))]);
  assert.equal(raced, "silent");
  await s.close();
});

test("MCP protocol in-process: Unit v2 warnings reach the summary and the structured result", async () => {
  registerUnit({ type: "test-mcp-stage", label: "Test stage", inlets: [{ port: "in" }], outlets: [{ port: "out" }],
    solve: ({ inlets }) => ({ outlets: { out: inlets.in[0] }, duty_kW: 0,
      warnings: [{ code: "DRY_STAGE", stage: 3, message: "stage 3 runs dry", remedy: "raise the reflux" }] }) });
  const fs = JSON.parse(JSON.stringify(PUMP));
  fs.blocks[1] = { id: "M1", type: "test-mcp-stage", spec: {} };
  const out = [];
  const srv = createMcpServer({ startRun: req => ({ result: Promise.resolve(run(req)), cancel() {} }), send: m => out.push(m) });
  await srv.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "solve_flowsheet", arguments: { flowsheet: fs }, _meta: MODERN_META } });
  const r = out[0].result;
  assert.equal(r.isError, false, r.content[0].text);
  assert.deepEqual(r.structuredContent.qualifications.warnings, [{ block: "M1", code: "DRY_STAGE", message: "stage 3 runs dry", stage: 3, remedy: "raise the reflux" }]);
  assert.match(r.content[0].text, /Warning \(M1\): stage 3 runs dry/);
  // a capability registered later is a tool at once; an unsupported one is not
  registerCapability({ name: "test_mcp_later", summary: "A later capability", status: "unsupported", input: { type: "object" }, planned: "never" });
  assert.ok(!mcpTools().some(t => t.name === "test_mcp_later"));
});
