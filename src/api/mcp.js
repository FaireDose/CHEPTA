/**
 * The MCP server's protocol (proposal 0015, section 9, contract 6; roadmap G1; milestone M1, W8): the tools of a local
 * Model Context Protocol server are the dispatcher's available capabilities. bin/chepta-mcp.mjs connects it to the
 * standard streams; it runs each call in a Node worker thread (src/runtime/node-worker.js).
 *
 * Written against the MCP specification, https://modelcontextprotocol.io/specification/2026-07-28 (read 2026-10-29):
 *   - revision 2026-07-28 ("modern"): every request carries its version and the client's capabilities in
 *     params._meta ("io.modelcontextprotocol/protocolVersion", ".../clientCapabilities"); server/discover; results carry
 *     resultType "complete" and the server's name in _meta; an unsupported version is error -32022 with the supported
 *     ones; a request without the required _meta is -32602;
 *   - revisions 2025-11-25 and 2025-06-18 ("legacy"): the initialize handshake, for hosts that still open with it (the
 *     specification's "dual-era" server, section "Backward Compatibility with Initialization-Based Versions").
 * No SDK: JSON-RPC over newline-delimited standard streams needs a few dozen lines, and CHEPTA keeps no runtime
 * dependency (the SDK would bring a schema library and an HTTP stack the stdio server does not use).
 *
 * Tools: name = the capability's name, inputSchema = its input schema (src/api/schema.js, a subset of JSON Schema
 * 2020-12), annotations.readOnlyHint = readOnly. Capabilities listed as "unsupported" are not offered as tools (the
 * "capabilities" tool lists them, with where they are planned). A call is the request { capability: name, input:
 * arguments, limits: { time_ms } }; its result is the dispatcher's result as structuredContent, with a short summary and
 * the same JSON as text (the specification asks for the text copy, for hosts that read only text). An outcome other
 * than "ok" is a tool execution error (isError: true) whose text is the dispatcher's message and its `where`; an unknown
 * tool or malformed arguments object is a protocol error (-32602). notifications/cancelled ends the call's worker.
 */
import pkg from "../../package.json" with { type: "json" };
import { capabilities } from "./dispatcher.js";

export const MCP_MODERN = Object.freeze(["2026-07-28"]);
export const MCP_LEGACY = Object.freeze(["2025-11-25", "2025-06-18"]);
const SUPPORTED = [...MCP_MODERN, ...MCP_LEGACY];
const SERVER_INFO = Object.freeze({ name: "chepta", title: "CHEPTA process simulator", version: pkg.version });
const META = { "io.modelcontextprotocol/serverInfo": SERVER_INFO };
const PV = "io.modelcontextprotocol/protocolVersion", CC = "io.modelcontextprotocol/clientCapabilities";

export const MCP_INSTRUCTIONS = [
  "CHEPTA is an open-source chemical process simulator. Use its tools for numbers instead of computing thermodynamics or balances yourself.",
  "solve_flowsheet takes a project file (.chepta.json) as input.project, or a flowsheet document as input.flowsheet; check_project and flowsheet_status check one without solving.",
  "Every result has an outcome. Only \"ok\" carries numbers. \"missing_data\" means the data are not in CHEPTA: say so and never estimate the value; \"invalid_input\" names the fields or blocks to fix (error.where).",
  "Report the warnings and notes (qualifications) and the method and parameter sets (reproduction) with the numbers. A converged result is not a result validated against data.",
  "When you change a project for the user, show the change as a proposal, kept apart from their file until they apply it.",
].join(" ");

/** The tools: one per available capability, in the dispatcher's order. */
export function mcpTools() {
  return capabilities().filter(c => c.status === "available").map(c => ({
    name: c.name, title: c.summary,
    description: `${c.summary}. The result is CHEPTA's result object: outcome, value, checks, qualifications (warnings, parameter tiers) and reproduction (version, method, hashes).`,
    inputSchema: c.input?.type === "object" ? c.input : { type: "object", ...(c.input ?? {}) },
    annotations: { title: c.summary, readOnlyHint: c.readOnly !== false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }));
}

const fmt = v => (typeof v === "number" ? Number(v.toPrecision(4)).toString() : String(v));

/** A short summary of a result, for the text of a tool's answer. */
export function resultSummary(r) {
  if (r.outcome !== "ok") {
    const where = (r.error?.where ?? []).map(w => [w.block && `block ${w.block}`, w.field, w.message].filter(Boolean).join(": ")).filter(Boolean);
    return `${r.capability}: ${r.outcome}${r.error?.code ? ` (${r.error.code})` : ""}. ${r.error?.message ?? ""}${where.length ? `\nWhere: ${where.join("; ")}` : ""}`;
  }
  if (r.capability === "solve_flowsheet") {
    const v = r.value, q = r.qualifications ?? {}, m = r.reproduction?.method ?? {};
    const lines = [`solve_flowsheet: ok. ${Object.keys(v.streams ?? {}).length} streams, ${Object.keys(v.blocks ?? {}).length} blocks; method ${m.model ?? "?"}${m.vapour ? ` (vapour ${m.vapour})` : ""}.`,
      `Balances: material ${fmt(r.checks?.material_kmol_h)} kmol/h, energy ${fmt(r.checks?.energy_kW)} kW${r.checks?.loops?.length ? `; ${r.checks.loops.length} recycle loop(s)` : ""}.`];
    const streams = Object.values(v.streams ?? {});
    for (const st of streams.slice(0, 12)) lines.push(`Stream ${st.name ?? st.id}: ${fmt(st.F_kmol_h)} kmol/h, ${fmt(st.T_K)} K, ${fmt(st.P_kPa)} kPa, vapour fraction ${fmt(st.VF)}.`);
    for (const p of q.pairs ?? []) lines.push(`Pair ${[].concat(p.pair).join(" + ")}: set ${p.set ?? "?"}, tier ${p.tier ?? "?"}.`);
    if (q.missing_pairs?.length) lines.push(`Pairs without parameters: ${q.missing_pairs.join(", ")}.`);
    for (const w of q.warnings ?? []) lines.push(`Warning (${w.block}): ${w.message}`);
    if (streams.length > 12) lines.push(`(${streams.length - 12} more streams in value.streams)`);
    if (q.notes?.length) lines.push(`${q.notes.length} note(s) from the blocks (qualifications.notes).`);
    return lines.join("\n");
  }
  if (r.capability === "check_project") return `check_project: ${r.value?.ok ? "no problems" : `problems: ${(r.value?.problems ?? []).join(" ")}`}`;
  if (r.capability === "flowsheet_status") return `flowsheet_status: ${r.value?.ready ? "ready to solve" : `not ready: ${r.value?.message ?? ""}`}`;
  if (r.capability === "find_component") return `find_component: ${r.value.name} (id ${r.value.id}, CAS ${r.value.cas ?? "?"})`;
  if (r.capability === "component_info") return `component_info: ${r.value.name}, ${r.value.properties?.length ?? 0} property records`;
  return `${r.capability}: ok`;
}

/** The answer to tools/call for a dispatcher result. */
export function toolResult(r) {
  return { content: [{ type: "text", text: resultSummary(r) }, { type: "text", text: JSON.stringify(r) }], structuredContent: r, isError: r.outcome !== "ok" };
}

/**
 * A server: handle(message) takes one parsed JSON-RPC message; answers go out through send(message).
 * startRun(request) → { result: Promise, cancel() } runs a request (a worker thread in bin/chepta-mcp.mjs).
 */
export function createMcpServer({ startRun, send, timeMs = null }) {
  let legacy = null;   // the legacy revision agreed by initialize, if a host opened with it
  const inFlight = new Map();
  const key = id => `${typeof id}:${id}`;
  const error = (id, code, message, data) => send({ jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } });

  function handle(msg) {
    if (Array.isArray(msg) || !msg || typeof msg !== "object" || msg.jsonrpc !== "2.0") return error(null, -32600, "Invalid request: one JSON-RPC 2.0 message per line.");
    if (msg.method === undefined) return;   // a response from the client: the server sends no requests
    const isRequest = msg.id !== undefined && msg.id !== null;
    if (!isRequest) {
      if (msg.method === "notifications/cancelled") {
        const h = inFlight.get(key(msg.params?.requestId));
        if (h) { inFlight.delete(key(msg.params.requestId)); h.cancel(msg.params?.reason ? `Cancelled by the host: ${msg.params.reason}` : "Cancelled by the host."); }
      }
      return;   // notifications/initialized and others: nothing to answer
    }
    const { id, method } = msg, params = msg.params ?? {};
    const meta = params._meta ?? {};
    let modern = false;
    if (method === "initialize") {
      const asked = params.protocolVersion;
      legacy = MCP_LEGACY.includes(asked) ? asked : MCP_LEGACY[0];
      return send({ jsonrpc: "2.0", id, result: { protocolVersion: legacy, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: MCP_INSTRUCTIONS } });
    }
    if (meta[PV] !== undefined) {
      if (!MCP_MODERN.includes(meta[PV])) return error(id, -32022, "Unsupported protocol version", { supported: SUPPORTED, requested: meta[PV] });
      if (meta[CC] === undefined) return error(id, -32602, `Invalid params: _meta["${CC}"] is required.`);
      modern = true;
    } else if (!legacy && method !== "ping") {
      return error(id, -32602, `Invalid params: _meta["${PV}"] is required (supported: ${MCP_MODERN.join(", ")}), or open with initialize (${MCP_LEGACY.join(", ")}).`);
    }
    const reply = result => send({ jsonrpc: "2.0", id, result: modern ? { resultType: "complete", ...result, _meta: META } : result });
    switch (method) {
      case "ping": return reply({});
      case "server/discover":
        if (!modern) return error(id, -32601, "Method not found: server/discover");
        return reply({ supportedVersions: SUPPORTED, capabilities: { tools: { listChanged: false } }, instructions: MCP_INSTRUCTIONS });
      case "tools/list": return reply({ tools: mcpTools() });
      case "tools/call": {
        const name = params.name;
        const tool = capabilities().find(c => c.name === name && c.status === "available");
        if (!tool) return error(id, -32602, `Unknown tool: ${name}. Tools: ${mcpTools().map(t => t.name).join(", ")}.`);
        const args = params.arguments ?? {};
        if (typeof args !== "object" || Array.isArray(args)) return error(id, -32602, "Invalid params: arguments must be an object.");
        const h = startRun({ capability: name, input: args, ...(timeMs ? { limits: { time_ms: timeMs } } : {}) });
        inFlight.set(key(id), h);
        return h.result.then(r => {
          if (inFlight.get(key(id)) !== h) return;   // cancelled: nothing more is sent for it
          inFlight.delete(key(id));
          reply(toolResult(r));
        });
      }
      default: return error(id, -32601, `Method not found: ${method}`);
    }
  }
  return { handle, inFlight };
}
