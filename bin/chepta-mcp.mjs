#!/usr/bin/env node
/**
 * CHEPTA's local MCP server (proposal 0015, section 9, contract 6; roadmap G1; milestone M1, W8): the stdio transport of
 * the Model Context Protocol, run on the user's computer by an assistant that starts MCP servers (Claude Code, Claude
 * Desktop). The protocol is in src/api/mcp.js; each tool call runs in a Node worker thread (src/runtime/node-worker.js),
 * so a time limit or the host's cancellation stops it. Standard output carries only MCP messages; notes go to standard
 * error. How to add it to a host: docs/models/tools.md.
 *
 *   npx chepta-mcp [--time-ms N]      (default time limit of a call: 60000 ms)
 */
import { createInterface } from "node:readline";
import { createMcpServer } from "../src/api/mcp.js";
import { startNodeRun, closeNodeWorkers } from "../src/runtime/node-worker.js";
import pkg from "../package.json" with { type: "json" };

const args = process.argv.slice(2);
let timeMs = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--help" || a === "-h") {
    process.stdout.write(`chepta-mcp ${pkg.version}: CHEPTA's MCP server (stdio). Start it from an MCP host, for example\n  claude mcp add chepta -- npx -y -p chepta chepta-mcp\nOptions: --time-ms N (time limit of a tool call, default 60000), --version.\n`);
    process.exit(0);
  } else if (a === "--version" || a === "-v") { process.stdout.write(`${pkg.version}\n`); process.exit(0); }
  else if (a === "--time-ms" || a.startsWith("--time-ms=")) {
    timeMs = Number(a.includes("=") ? a.split("=")[1] : args[++i]);
    if (!(Number.isFinite(timeMs) && timeMs > 0)) { process.stderr.write("chepta-mcp: --time-ms needs a positive number of milliseconds.\n"); process.exit(1); }
  } else { process.stderr.write(`chepta-mcp: unknown argument ${a}.\n`); process.exit(1); }
}

// one message per line, no newline inside (JSON.stringify writes none)
const server = createMcpServer({ startRun: startNodeRun, timeMs, send: m => process.stdout.write(`${JSON.stringify(m)}\n`) });
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", line => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: a line is not JSON." } })}\n`); return; }
  try { Promise.resolve(server.handle(msg)).catch(e => process.stderr.write(`chepta-mcp: ${e?.stack ?? e}\n`)); }
  catch (e) { process.stderr.write(`chepta-mcp: ${e?.stack ?? e}\n`); }
});
// the host closes standard input to stop the server
lines.on("close", () => { for (const h of server.inFlight.values()) h.cancel(); closeNodeWorkers(); process.exit(0); });
process.stderr.write(`chepta-mcp ${pkg.version} ready (stdio; MCP 2026-07-28, and 2025-11-25 / 2025-06-18 through initialize)\n`);
