/**
 * Flowsheet workspace (proposal 0006, step 5), DOM-free: the edits a person makes on the
 * canvas, as functions from one flowsheet document (src/flowsheet/document.js) to the next.
 * No thermodynamics here.
 *
 * Products are automatic: every outlet of a unit that is not connected to another unit ends in
 * a Product block, which the canvas draws as an open arrow (a stream leaving the flowsheet).
 * Placing a unit gives it these product streams; connecting an outlet to a unit removes its
 * Product; disconnecting or deleting gives one back. So the flowsheet is always complete in
 * structure, and the degrees of freedom are the only thing left to fill in.
 */
import { unitType } from "../units/units.js";
import "../units/reactors.js";   // the reactor blocks, registered

/** Id prefix of each block type: F1, M1, SP1, X1, V1, E1, HX1, VLV1, PU1, P1; reactors R1 (conversion), RE1 (equilibrium
 * and Gibbs), RY1 (yield), CS1 (CSTR), PF1 (plug flow). */
export const PREFIX = { feed: "F", mixer: "M", splitter: "SP", separator: "X", flash: "V", heater: "E", hx: "HX", valve: "VLV", pump: "PU", compressor: "K", expander: "EX",
  "conversion-reactor": "R", "equilibrium-reactor": "RE", "yield-reactor": "RY", cstr: "CS", pfr: "PF", product: "P" };
/** The reactor blocks (proposal 0010, steps 3 to 6), behind one Reactor button of the toolbar. */
export const REACTORS = ["conversion-reactor", "yield-reactor", "equilibrium-reactor", "cstr", "pfr"];
/** The reactors that use the reactions of the Reactions page; their spec.reactions lists ids or { reaction, ... }. */
export const REACTION_USERS = ["conversion-reactor", "equilibrium-reactor", "cstr", "pfr"];
/** The reactors whose reactions need a rate law (proposal 0010, step 5). */
export const KINETIC = ["cstr", "pfr"];
const reactionIdOf = e => (typeof e === "string" ? e : e?.reaction);
/** The block types of the palette, in order (products are automatic). */
export const PALETTE = ["feed", "mixer", "splitter", "separator", "flash", "heater", "hx", "valve", "pump", "compressor", "expander", ...REACTORS];

const clone = fs => JSON.parse(JSON.stringify(fs));
const nextId = (taken, prefix) => { let i = 1; while (taken.has(prefix + i)) i++; return prefix + i; };
const blockIds = fs => new Set(fs.blocks.map(b => b.id));
const streamIds = fs => new Set([...fs.streams.map(s => s.id), ...(fs.energyStreams ?? []).map(q => q.id), ...fs.blocks.map(b => b.energy).filter(Boolean)]);
const portOf = end => { const i = end.lastIndexOf("."); return { block: end.slice(0, i), port: end.slice(i + 1) }; };
const isProduct = (fs, id) => fs.blocks.find(b => b.id === id)?.type === "product";

/** A free spot for a new block: right of the rightmost block, on a 140 px grid. */
export function freeSpot(fs, near) {
  if (near) return { x: near.x, y: near.y };
  const units = fs.blocks.filter(b => b.type !== "product");
  if (!units.length) return { x: 120, y: 160 };
  const x = Math.max(...units.map(b => b.x ?? 0)) + 160;
  return { x, y: units[units.length - 1].y ?? 160 };
}

/** A spot for a new block near (x, y) that no other block occupies (moved down in 50 px steps). */
function clearSpot(fs, x, y) {
  while (fs.blocks.some(b => Math.abs((b.x ?? 0) - x) < 40 && Math.abs((b.y ?? 0) - y) < 30)) y += 50;
  return { x, y };
}

/** Where the Product of outlet `from` (BLOCK.port) goes: right of the unit, by port, on a free spot. */
function productSpot(fs, from, k = 0) {
  const src = fs.blocks.find(b => b.id === portOf(from).block);
  const dy = { vapour: -60, liquid: 60, liquid2: 100, hot: -40, cold: 40 }[portOf(from).port] ?? (k - 0.5) * 70;
  return clearSpot(fs, (src?.x ?? 0) + 130, (src?.y ?? 0) + dy);
}

/** Add a Product block and a stream from `from` (BLOCK.port) to it, placed right of the unit. */
function addProductStream(fs, from, k = 0) {
  const pid = nextId(blockIds(fs), PREFIX.product), sid = nextId(streamIds(fs), "S");
  fs.blocks.push({ id: pid, type: "product", ...productSpot(fs, from, k) });
  fs.streams.push({ id: sid, from, to: `${pid}.in` });
  return sid;
}

/** The outlet streams a new block starts with (minimum count of each outlet port). */
function outletEnds(type) {
  const u = unitType(type);
  return u.outlets.filter(p => !p.optional).flatMap(p => Array.from({ length: p.min === Infinity ? 2 : p.min }, () => p.port));
}

/** Default specification of a new block (left to fill in; a splitter starts at half and half). */
function defaultSpec(type, fs) {
  if (type === "splitter") return { fractions: [0.5, "rest"] };
  // a conversion reactor starts with the first reaction written, its first reactant as the key (the conversion left
  // to fill in); a yield reactor with the mass basis
  if (type === "conversion-reactor") {
    const r = (fs.reactions ?? [])[0];
    const key = r && Object.entries(r.stoichiometry ?? {}).find(([, v]) => v < 0)?.[0];
    return { reactions: r ? [{ reaction: r.id, ...(key ? { key } : {}) }] : [], order: "parallel" };
  }
  // an equilibrium reactor starts with the first reaction written, at equilibrium (no approach)
  if (type === "equilibrium-reactor") {
    const r = (fs.reactions ?? [])[0];
    return { reactions: r ? [{ reaction: r.id }] : [] };
  }
  if (type === "yield-reactor") return { basis: "mass", yields: {} };
  // a CSTR or plug-flow reactor starts with the first reaction that has kinetics (else none), one phase
  if (KINETIC.includes(type)) {
    const r = (fs.reactions ?? []).find(x => x.rate);
    return { reactions: r ? [{ reaction: r.id }] : [] };
  }
  if (type === "separator") return { fractions: Object.fromEntries(fs.components.map(c => [c, [0.5, "rest"]])) };
  return {};
}

/** Change a block into another type of the same ports (the Reactor workspace's choice of reactor): a new default spec. */
export function setBlockType(fs, id, type) {
  if (!PALETTE.includes(type)) throw new Error(`Unknown block type "${type}".`);
  const out = clone(fs), b = out.blocks.find(x => x.id === id);
  if (!b) throw new Error(`No block ${id}.`);
  const keep = ["T_K", "duty_kW", "P_kPa", "dP_kPa"].filter(k => b.spec?.[k] != null);
  // its id follows the type (RE1 → PF1), and its streams with it
  const nid = nextId(new Set(out.blocks.filter(x => x !== b).map(x => x.id)), PREFIX[type]);
  for (const st of out.streams) for (const end of ["from", "to"]) if (st[end]?.startsWith(`${id}.`)) st[end] = `${nid}.${st[end].slice(id.length + 1)}`;
  b.id = nid;
  b.type = type;
  b.spec = { ...defaultSpec(type, out), ...Object.fromEntries(keep.map(k => [k, b.spec[k]])) };
  if (type === "pfr" || type === "equilibrium-reactor" || type === "cstr") delete b.spec.VF;
  return out;
}

/** Place a block of `type` at (x, y) (or a free spot) with automatic products on its outlets. */
export function addBlock(fs, type, pos) {
  if (!PALETTE.includes(type)) throw new Error(`Unknown block type "${type}". The palette has: ${PALETTE.join(", ")}.`);
  const out = clone(fs);
  const id = nextId(blockIds(out), PREFIX[type]);
  const { x, y } = freeSpot(out, pos);
  out.blocks.push({ id, type, x, y, spec: defaultSpec(type, out) });
  outletEnds(type).forEach((port, k) => addProductStream(out, `${id}.${port}`, k));
  return { fs: out, id };
}

/** A new Feed connected to an inlet port of a unit (BLOCK.port). */
export function addFeedTo(fs, to) {
  const out = clone(fs);
  const dst = out.blocks.find(b => b.id === portOf(to).block);
  const id = nextId(blockIds(out), PREFIX.feed), sid = nextId(streamIds(out), "S");
  const n = out.streams.filter(s => s.to === to).length;
  out.blocks.push({ id, type: "feed", x: (dst?.x ?? 160) - 140, y: (dst?.y ?? 160) + n * 60, spec: {} });
  out.streams.push({ id: sid, from: `${id}.out`, to });
  return { fs: out, id, stream: sid };
}

/** The inlets that take one more stream, as "BLOCK.port", for the stream "goes to" choice. */
export function openInlets(fs, exceptBlock) {
  const out = [];
  for (const b of fs.blocks) {
    if (b.type === "product" || b.type === "feed" || b.id === exceptBlock) continue;
    for (const p of unitType(b.type).inlets) {
      const n = fs.streams.filter(s => s.to === `${b.id}.${p.port}`).length;
      if (n < p.max) out.push(`${b.id}.${p.port}`);
    }
  }
  return out;
}

/**
 * Send stream `sid` to an inlet (BLOCK.port), or out of the flowsheet (to = null: a new
 * Product). A Product it went to is removed.
 */
export function connect(fs, sid, to) {
  const out = clone(fs);
  const s = out.streams.find(x => x.id === sid);
  if (!s) throw new Error(`No stream ${sid}.`);
  const old = portOf(s.to).block;
  if (to == null) {
    if (isProduct(out, old)) return out;
    const pid = nextId(blockIds(out), PREFIX.product);
    out.blocks.push({ id: pid, type: "product", ...productSpot(out, s.from) });
    s.to = `${pid}.in`;
    delete s.tear; delete s.guess;
  } else {
    if (!openInlets(out).includes(to) && s.to !== to) throw new Error(`${to} takes no more streams.`);
    s.to = to;
  }
  if (isProduct(out, old) && !out.streams.some(x => portOf(x.to).block === old)) out.blocks = out.blocks.filter(b => b.id !== old);
  return out;
}

/**
 * Delete a unit and keep its streams (the way a person expects a simulator to: the streams stay,
 * open at the end that went to the deleted block). A stream that went into it now leaves the
 * flowsheet (a Product; a feed keeps its stream); a stream that came out of it now starts from a
 * new Feed in its place, still going where it went (fill in the feed, or delete it). Returns
 * { fs, note } (the note says which streams were kept and how). A feed goes with its stream (and the
 * Product it went to), as deleting a feed's stream does.
 */
export function removeBlock(fs, id) {
  let out = clone(fs);
  const b = out.blocks.find(x => x.id === id);
  if (!b || b.type === "product") return { fs: out, note: "" };
  if (b.type === "feed") {
    // a feed's stream exists only with it: both go, and the Product it went to (a unit it went to loses that inlet)
    const mine = out.streams.filter(x => portOf(x.from).block === id);
    for (const s of mine) if (isProduct(out, portOf(s.to).block)) out.blocks = out.blocks.filter(x => x.id !== portOf(s.to).block);
    out.streams = out.streams.filter(x => portOf(x.from).block !== id);
    out.blocks = out.blocks.filter(x => x.id !== id);
    return { fs: out, note: mine.length ? `Deleted the feed stream ${mine.map(streamName).join(", ")}.` : `Deleted the feed ${id}.` };
  }
  const leave = [], feeds = [];
  for (const s of out.streams.filter(x => portOf(x.to).block === id)) {
    out = connect(out, s.id, null);
    leave.push(streamName(s));
  }
  out.streams.filter(x => portOf(x.from).block === id).forEach((s, k) => {
    const fid = nextId(blockIds(out), PREFIX.feed);
    out.blocks.push({ id: fid, type: "feed", ...clearSpot(out, (b.x ?? 0), (b.y ?? 0) + k * 60), spec: {} });
    s.from = `${fid}.out`;
    delete s.tear; delete s.guess;
    feeds.push(streamName(s));
  });
  out.blocks = out.blocks.filter(x => x.id !== id);
  // its energy streams go with it (an energy stream needs both of its blocks)
  const gone = (out.energyStreams ?? []).filter(q => q.from === id || q.to === id);
  if (gone.length) { out.energyStreams = out.energyStreams.filter(q => !gone.includes(q)); if (!out.energyStreams.length) delete out.energyStreams; }
  const note = [`Deleted ${blockName(b)}; its streams are kept${gone.length ? ` (its energy stream${gone.length > 1 ? "s" : ""} ${gone.map(q => q.id).join(", ")} ${gone.length > 1 ? "are" : "is"} removed)` : ""}.`,
    leave.length ? `${leave.join(", ")} now leave${leave.length === 1 ? "s" : ""} the flowsheet (drag the end onto an inlet to connect again).` : "",
    feeds.length ? `${feeds.join(", ")} now ${feeds.length === 1 ? "starts as a feed stream" : "start as feed streams"} where ${blockName(b)} was; fill in ${feeds.length === 1 ? "its" : "their"} flows or delete ${feeds.length === 1 ? "it" : "them"}.` : ""]
    .filter(Boolean).join(" ");
  return { fs: out, note };
}

/** Give a stream a name shown on the drawing and in the tables ("" removes it); its id stays. */
export function setStreamLabel(fs, sid, label) {
  const out = clone(fs);
  const s = out.streams.find(x => x.id === sid);
  if (!s) throw new Error(`No stream ${sid}.`);
  putLabel(s, label);
  return out;
}

/** Give a feed or a unit a name shown on the drawing and in the tables ("" removes it); its id stays. */
export function setBlockLabel(fs, id, label) {
  const out = clone(fs);
  const b = out.blocks.find(x => x.id === id);
  if (!b) throw new Error(`No block ${id}.`);
  if (b.type === "product") throw new Error(`${id} is the end of a product stream; give the stream a name instead.`);
  putLabel(b, label);
  return out;
}

/** One line, at most 40 characters; empty or the id itself removes the label. */
function putLabel(o, label) {
  const name = String(label ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (name && name !== o.id) o.label = name; else delete o.label;
}

/** The Feed block a stream starts from, or null. On the drawing a feed is its stream (a feed stream). */
export function feedOf(fs, sid) {
  const s = fs.streams.find(x => x.id === sid);
  const b = s && fs.blocks.find(x => x.id === portOf(s.from).block);
  return b?.type === "feed" ? b : null;
}

/** The stream that leaves a Feed block, or null. */
export const feedStreamOf = (fs, fid) => fs.streams.find(s => portOf(s.from).block === fid) ?? null;

/** The name of a stream or a block on the drawing and in the tables: its label, else its id. */
export const streamName = s => s?.label || s?.id;
export const blockName = b => b?.label || b?.id;

/** Delete a block and keep its streams (removeBlock without the note). */
export function deleteBlock(fs, id) {
  return removeBlock(fs, id).fs;
}

/** Add an outlet to a splitter or component separator (a new product stream and its fraction). */
export function addOutlet(fs, id) {
  const out = clone(fs);
  const b = out.blocks.find(x => x.id === id);
  if (!b || !["splitter", "separator"].includes(b.type)) return out;
  const k = out.streams.filter(s => s.from === `${id}.out`).length;
  addProductStream(out, `${id}.out`, k);
  const grow = list => { const l = Array.isArray(list) ? list.slice() : []; l.splice(Math.max(0, l.length - 1), 0, 0); return l; };
  b.spec ??= {};
  if (b.type === "splitter") b.spec.fractions = grow(b.spec.fractions);
  else b.spec.fractions = Object.fromEntries(Object.entries(b.spec.fractions ?? {}).map(([c, l]) => [c, grow(l)]));
  return out;
}

/** Remove the last outlet of a splitter or separator (it must lead to a Product, and two stay). */
export function removeOutlet(fs, id) {
  const out = clone(fs);
  const b = out.blocks.find(x => x.id === id);
  const outs = out.streams.filter(s => s.from === `${id}.out`);
  if (!b || outs.length <= 2) return out;
  const last = outs[outs.length - 1];
  if (!isProduct(out, portOf(last.to).block)) throw new Error(`The last outlet of ${id} (${last.id}) goes to a unit; send it out of the flowsheet first.`);
  out.streams = out.streams.filter(s => s.id !== last.id);
  out.blocks = out.blocks.filter(x => x.id !== portOf(last.to).block);
  const shrink = list => { const l = list.slice(0, -1); if (list[list.length - 1] === "rest" && !l.includes("rest")) l[l.length - 1] = "rest"; return l; };
  if (b.type === "splitter" && Array.isArray(b.spec?.fractions)) b.spec.fractions = shrink(b.spec.fractions);
  if (b.type === "separator") b.spec.fractions = Object.fromEntries(Object.entries(b.spec?.fractions ?? {}).map(([c, l]) => [c, shrink(l)]));
  return out;
}

/** Change a block's specification (merged; a key set to null or "" is removed). */
export function setSpec(fs, id, patch) {
  const out = clone(fs);
  const b = out.blocks.find(x => x.id === id);
  if (!b) throw new Error(`No block ${id}.`);
  const spec = { ...(b.spec ?? {}), ...patch };
  for (const k of Object.keys(spec)) if (spec[k] == null || spec[k] === "") delete spec[k];
  b.spec = spec;
  return out;
}

/*
 * Rating in the flowsheet (proposal 0013, step 8): a block is designed first (an outlet, a duty or an approach gives its
 * area), then rated: its area and U are kept as its specification (A_m2), and the outlets follow from them. The design
 * is kept in spec.design, to go back to.
 */
const HEATER_DESIGN = ["T_K", "duty_kW", "VF"];
const HX_DESIGN = ["T_hot_out_K", "T_cold_out_K", "VF_hot_out", "VF_cold_out", "duty_kW", "dTmin_K"];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] != null).map(k => [k, o[k]]));
const keep = v => +v.toPrecision(6);

/** The patch that rates a solved block: its area and U kept, its design remembered (null when it cannot be rated). */
export function ratingPatch(type, spec, done) {
  const z = done?.sizing;
  if (!(z?.area_m2 > 0) || !(z.U_W_m2K > 0)) return null;
  const U = { value: keep(z.U_W_m2K) };
  if (type === "hx") {
    return { ...Object.fromEntries(HX_DESIGN.map(k => [k, null])), A_m2: keep(z.area_m2), U, design: { ...pick(spec, HX_DESIGN), U: spec.U ?? null } };
  }
  const ut = spec.sizing?.utility;
  if (!ut || ut.kind === "electric") return null;
  // water or a fluid with inlet and outlet: its flow of the design instead of its outlet
  const { T_out_K, ...rest } = ut;
  const utility = T_out_K != null && z.utility?.flow_kg_h > 0 ? { ...rest, flow_kg_h: keep(z.utility.flow_kg_h) } : ut;
  return { ...Object.fromEntries(HEATER_DESIGN.map(k => [k, null])), A_m2: keep(z.area_m2), sizing: { ...spec.sizing, utility, U },
    design: { ...pick(spec, HEATER_DESIGN), sizing: spec.sizing } };
}

/** Back from rating to the design that was rated (or to no specification, when the file had none). */
export function designPatch(spec) {
  return { A_m2: null, design: null, ...(spec.design ?? {}) };
}

/** Move a block. */
export function moveBlock(fs, id, x, y) {
  const out = clone(fs);
  const b = out.blocks.find(v => v.id === id);
  if (b) { b.x = Math.round(x); b.y = Math.round(y); }
  return out;
}

/** Mark or unmark a stream as a tear stream (recycle). */
export function setTear(fs, sid, on) {
  const out = clone(fs);
  const s = out.streams.find(x => x.id === sid);
  if (s) { if (on) s.tear = true; else { delete s.tear; delete s.guess; } }
  return out;
}

/**
 * Change the setup's components: the specifications follow (a removed component leaves the
 * feeds and the separators; a new one starts at zero flow and with "rest" to the last
 * outlet). Returns the new flowsheet and a note of what changed for the person.
 */
export function setComponents(fs, ids) {
  const out = clone(fs);
  const removed = out.components.filter(c => !ids.includes(c)), added = ids.filter(c => !out.components.includes(c));
  out.components = ids.slice();
  let touched = 0;
  for (const b of out.blocks) {
    if (b.type === "feed" && b.spec) {
      for (const key of ["flow_kmol_h", "flow_kg_h"]) {
        if (b.spec[key] && typeof b.spec[key] === "object" && !Array.isArray(b.spec[key])) {
          for (const c of removed) if (c in b.spec[key]) { delete b.spec[key][c]; touched++; }
        }
      }
    }
    if (b.type === "yield-reactor" && b.spec) {
      for (const c of removed) if (b.spec.yields && c in b.spec.yields) { delete b.spec.yields[c]; touched++; }
      for (const k of ["key", "closure"]) if (removed.includes(b.spec[k])) { delete b.spec[k]; touched++; }
    }
    if (b.type === "conversion-reactor" && Array.isArray(b.spec?.reactions)) {
      for (const e of b.spec.reactions) if (removed.includes(e.key)) { delete e.key; touched++; }
    }
    if (b.type === "separator" && b.spec?.fractions) {
      const n = out.streams.filter(s => s.from === `${b.id}.out`).length;
      for (const c of removed) if (c in b.spec.fractions) { delete b.spec.fractions[c]; touched++; }
      for (const c of added) b.spec.fractions[c] = [...Array(Math.max(1, n - 1)).fill(0), "rest"];
    }
  }
  for (const r of out.reactions ?? []) {
    for (const c of removed) if (r.stoichiometry && c in r.stoichiometry) { delete r.stoichiometry[c]; touched++; }
  }
  const units = out.blocks.filter(b => b.type !== "product").length;
  const note = !units || (!removed.length && !added.length) ? ""
    : [removed.length ? `Removed ${removed.join(", ")} from ${touched ? `${touched} specification${touched === 1 ? "" : "s"}` : "the flowsheet"}.` : "",
      added.length ? `${added.join(", ")} start${added.length === 1 ? "s" : ""} at zero flow in the feeds${out.blocks.some(b => b.type === "separator") ? " and goes to the last outlet of each separator" : ""}.` : ""].filter(Boolean).join(" ");
  return { fs: out, note };
}

/** The stream ids a block has, by port: { in: [...], out: [...], vapour: [...], ... }. */
export function streamsOf(fs, id) {
  const res = {};
  for (const s of fs.streams) {
    const f = portOf(s.from), t = portOf(s.to);
    if (f.block === id) (res[f.port] ??= []).push(s.id);
    if (t.block === id) (res[t.port] ??= []).push(s.id);
  }
  return res;
}

/** Where a stream ends: { kind: "product" } or { kind: "unit", block, port }. */
export function endOf(fs, sid) {
  const s = fs.streams.find(x => x.id === sid);
  if (!s) return null;
  const t = portOf(s.to);
  return isProduct(fs, t.block) ? { kind: "product", block: t.block } : { kind: "unit", block: t.block, port: t.port };
}

/**
 * Delete a stream, as far as the flowsheet allows; returns { fs, note } (note says what
 * happened, or why nothing did):
 *  - a feed's stream: the feed goes with it;
 *  - a stream into a unit: disconnected, it leaves the flowsheet (a product);
 *  - an outlet of a splitter or separator with more than two: that outlet is removed with its
 *    fraction;
 *  - any other stream already leaving the flowsheet: kept, since every outlet of a unit must
 *    go somewhere (delete the unit instead).
 */
export function deleteStream(fs, sid) {
  const s = fs.streams.find(x => x.id === sid);
  if (!s) return { fs, note: `No stream ${sid}.` };
  const src = fs.blocks.find(b => b.id === portOf(s.from).block);
  if (src?.type === "feed") {
    const out = clone(fs);
    // the feed and the Product end go with it (a unit it went to loses that inlet)
    const end = endOf(fs, sid);
    out.streams = out.streams.filter(x => x.id !== sid);
    out.blocks = out.blocks.filter(b => b.id !== src.id && !(end?.kind === "product" && b.id === end.block));
    return { fs: out, note: `Deleted the feed stream ${streamName(s)}.` };
  }
  const end = endOf(fs, sid);
  if (end.kind === "unit") return { fs: connect(fs, sid, null), note: `${sid} no longer goes to ${end.block}: it now leaves the flowsheet.` };
  const outs = fs.streams.filter(x => x.from === s.from);
  if (src && ["splitter", "separator"].includes(src.type) && portOf(s.from).port === "out" && outs.length > 2) {
    const k = outs.findIndex(x => x.id === sid);
    const out = clone(fs);
    out.streams = out.streams.filter(x => x.id !== sid);
    out.blocks = out.blocks.filter(b => b.id !== end.block);
    const b = out.blocks.find(x => x.id === src.id);
    const cut = list => { if (!Array.isArray(list)) return list; const l = list.slice(); const was = l[k]; l.splice(k, 1); if (was === "rest" && !l.includes("rest")) l[l.length - 1] = "rest"; return l; };
    if (b.type === "splitter") b.spec = { ...b.spec, fractions: cut(b.spec?.fractions) };
    else b.spec = { ...b.spec, fractions: Object.fromEntries(Object.entries(b.spec?.fractions ?? {}).map(([c, l]) => [c, cut(l)])) };
    return { fs: out, note: `Removed the outlet ${sid} of ${src.id}.` };
  }
  return { fs, note: `${sid} is how ${src?.id ?? "a unit"} sends its ${portOf(s.from).port} out of the flowsheet; every outlet must go somewhere. To remove it, delete ${src?.id ?? "the unit"}, or connect ${sid} to another block.` };
}

// ---------------------------------------------------------------------------------------
// Energy streams (proposal 0013, section 6): an energy feed into a block, or the heat of one block into another

/** The block types whose duty can be given by an energy stream, and those that can give their heat to one. */
export const ENERGY_TARGETS = ["heater", "flash"];
export const ENERGY_SOURCES = ["heater", "flash", "separator"];

/** A block's energy stream, if it has one: { stream, role: "in" | "out" }. */
export function energyOf(fs, id) {
  const q = (fs.energyStreams ?? []).find(x => x.to === id || x.from === id);
  return q ? { stream: q, role: q.to === id ? "in" : "out" } : null;
}

/** The blocks that can take the heat of `id` (an energy stream into them): a heater or drum without an energy stream. */
export const energyTargets = (fs, id) => fs.blocks.filter(b => b.id !== id && ENERGY_TARGETS.includes(b.type) && !energyOf(fs, b.id)).map(b => b.id);

/** Give a heater or flash drum an energy feed of `duty_kW` (+ heat in): its duty comes from it, so it needs one specification fewer. */
export function addEnergyFeed(fs, id, duty_kW = 0) {
  const out = clone(fs);
  const b = out.blocks.find(x => x.id === id);
  if (!b || !ENERGY_TARGETS.includes(b.type)) throw new Error(`${id} takes no energy stream (a heater or a flash drum does).`);
  if (energyOf(out, id)) throw new Error(`${id} already has an energy stream.`);
  const qid = nextId(streamIds(out), "Q");
  (out.energyStreams ??= []).push({ id: qid, to: id, duty_kW });
  if (b.spec) delete b.spec.duty_kW;   // the duty is the stream's now
  return { fs: out, id: qid };
}

/** Send the heat of block `from` (a heater, drum or separator) into block `to` (a heater or drum). */
export function connectEnergy(fs, from, to) {
  const out = clone(fs);
  const a = out.blocks.find(x => x.id === from), b = out.blocks.find(x => x.id === to);
  if (!a || !ENERGY_SOURCES.includes(a.type)) throw new Error(`${from} gives up no heat (a heater, flash drum or separator does).`);
  if (!b || !ENERGY_TARGETS.includes(b.type)) throw new Error(`${to} takes no energy stream (a heater or a flash drum does).`);
  if (from === to) throw new Error("A block cannot send its heat to itself.");
  if (energyOf(out, from) || energyOf(out, to)) throw new Error(`${energyOf(out, from) ? from : to} already has an energy stream.`);
  const qid = nextId(streamIds(out), "Q");
  (out.energyStreams ??= []).push({ id: qid, from, to });
  if (b.spec) delete b.spec.duty_kW;
  return { fs: out, id: qid };
}

/** Place an energy feed of `duty_kW` (+ heat in) on the drawing, not connected yet: drag it onto a heater or flash
 *  drum, or choose one in its form (connectEnergyFeed). */
export function placeEnergyFeed(fs, duty_kW = 100, pos) {
  const out = clone(fs);
  const qid = nextId(streamIds(out), "Q");
  const units = out.blocks.filter(b => b.type !== "product" && b.type !== "feed");
  // left of the first unit (not off the drawing), below the units and the feeds already placed
  const x = pos?.x ?? (units.length ? Math.max(40, Math.min(...units.map(b => b.x ?? 0)) - 90) : 60);
  let y = pos?.y ?? (units.length ? Math.max(...units.map(b => b.y ?? 0)) + 90 : 240);
  while ((out.energyStreams ?? []).some(q => q.x != null && Math.abs(q.x - x) < 40 && Math.abs(q.y - y) < 24)) y += 40;
  (out.energyStreams ??= []).push({ id: qid, duty_kW, x, y });
  return { fs: out, id: qid };
}

/** Connect an energy feed to a heater or flash drum (its duty then comes from the feed). */
export function connectEnergyFeed(fs, qid, to) {
  const out = clone(fs);
  const q = (out.energyStreams ?? []).find(x => x.id === qid), b = out.blocks.find(x => x.id === to);
  if (!q || q.from) throw new Error(`${qid} is not an energy feed.`);
  if (!b || !ENERGY_TARGETS.includes(b.type)) throw new Error(`${to} takes no energy stream (a heater or a flash drum does).`);
  const other = energyOf(out, to);
  if (other && other.stream.id !== qid) throw new Error(`${to} already has an energy stream (${other.stream.id}).`);
  q.to = to;
  if (b.spec) delete b.spec.duty_kW;   // the duty is the feed's now
  if (b.energy === false) delete b.energy;
  return out;
}

/** Disconnect an energy feed from its block: it stays on the drawing, and the block needs its own specification again. */
export function disconnectEnergy(fs, qid) {
  const out = clone(fs);
  const q = (out.energyStreams ?? []).find(x => x.id === qid);
  if (!q || q.from) throw new Error(`${qid} is not an energy feed.`);
  delete q.to;
  return out;
}

/** Move an energy feed on the drawing. */
export function moveEnergy(fs, qid, x, y) {
  const out = clone(fs);
  const q = (out.energyStreams ?? []).find(v => v.id === qid);
  if (q) { q.x = Math.round(x); q.y = Math.round(y); }
  return out;
}

/** Take a block's own energy stream (its duty, "Q-" and the id) out of the drawing, or show it again. The duty is still
 *  calculated and counted in the energy balance, and the results still list it; only the drawing leaves it out. */
export function showEnergy(fs, id, shown) {
  const out = clone(fs);
  const b = out.blocks.find(x => x.id === id);
  if (!b) throw new Error(`No block ${id}.`);
  if (shown) { if (b.energy === false) delete b.energy; }
  else b.energy = false;
  return out;
}

/** Remove an energy stream (the block it went into needs its own specification again). */
export function removeEnergy(fs, qid) {
  const out = clone(fs);
  out.energyStreams = (out.energyStreams ?? []).filter(q => q.id !== qid);
  if (!out.energyStreams.length) delete out.energyStreams;
  return out;
}

/** Change an energy feed's duty (kW, + heat in). */
export function setEnergyDuty(fs, qid, duty_kW) {
  const out = clone(fs);
  const q = (out.energyStreams ?? []).find(x => x.id === qid);
  if (!q || q.from) throw new Error(`${qid} is not an energy feed.`);
  q.duty_kW = duty_kW;
  return out;
}

// ---------------------------------------------------------------------------------------
// Reactions (proposal 0010, step 7): the flowsheet's list, written once and used by its reactors

const nextReactionId = fs => { const taken = new Set((fs.reactions ?? []).map(r => r.id)); let i = 1; while (taken.has(`r${i}`)) i++; return `r${i}`; };

/** A new reaction, empty: its name, the vapour phase, no coefficients yet. */
export function addReaction(fs) {
  const out = clone(fs), id = nextReactionId(out);
  out.reactions = [...(out.reactions ?? []), { id, name: `Reaction ${id.slice(1)}`, phase: "vapour", stoichiometry: {} }];
  return { fs: out, id };
}

/**
 * Change a reaction: `name`, `phase`, `heatOfReaction` ({ dH_J_mol, source }, or null to remove it), and
 * `stoichiometry` as a patch of coefficients (a component's coefficient, or null or 0 to take it out).
 */
export function setReaction(fs, id, patch) {
  const out = clone(fs), r = (out.reactions ?? []).find(x => x.id === id);
  if (!r) throw new Error(`No reaction ${id}.`);
  for (const [k, v] of Object.entries(patch)) {
    if (k === "stoichiometry") {
      const st = { ...(r.stoichiometry ?? {}) };
      for (const [c, nu] of Object.entries(v)) { if (nu == null || nu === 0) delete st[c]; else st[c] = nu; }
      r.stoichiometry = st;
    } else if (v == null || v === "") delete r[k];
    else r[k] = v;
  }
  return out;
}

/** Remove a reaction; the conversion and equilibrium reactors that used it lose it from their list (and say so). */
export function removeReaction(fs, id) {
  const out = clone(fs);
  out.reactions = (out.reactions ?? []).filter(r => r.id !== id);
  if (!out.reactions.length) delete out.reactions;
  const touched = [];
  for (const b of out.blocks) {
    if (REACTION_USERS.includes(b.type) && Array.isArray(b.spec?.reactions) && b.spec.reactions.some(e => reactionIdOf(e) === id)) {
      b.spec.reactions = b.spec.reactions.filter(e => reactionIdOf(e) !== id);
      touched.push(blockName(b));
    }
  }
  return { fs: out, note: touched.length ? `${touched.join(", ")} no longer use${touched.length === 1 ? "s" : ""} it.` : "" };
}

/** The reaction list as a file of its own, to copy reactions between projects (no reaction catalogue is shipped). */
export function reactionsFile(fs) {
  return { chepta_reactions: 1, reactions: JSON.parse(JSON.stringify(fs.reactions ?? [])) };
}

/**
 * Add the reactions of a file (reactionsFile, or a plain list) to the flowsheet. A reaction whose id is taken gets a
 * new id. Returns the flowsheet and a note; a file that is not a reaction list throws, saying why.
 */
export function importReactions(fs, file) {
  const list = Array.isArray(file) ? file : file?.reactions;
  if (!Array.isArray(list)) throw new Error("This file has no reaction list (a file saved with Export reactions, or a list of reactions).");
  let out = clone(fs);
  const added = [], renamed = [];
  for (const r of list) {
    if (!r || typeof r !== "object" || !r.stoichiometry || typeof r.stoichiometry !== "object") throw new Error("Every reaction needs its stoichiometry, for example { \"carbon-dioxide\": -1, \"hydrogen\": -3, \"methanol\": 1, \"water\": 1 }.");
    const taken = new Set((out.reactions ?? []).map(x => x.id));
    const id = r.id && !taken.has(r.id) ? r.id : nextReactionId(out);
    if (r.id && r.id !== id) renamed.push(`${r.id} → ${id}`);
    out.reactions = [...(out.reactions ?? []), { ...JSON.parse(JSON.stringify(r)), id }];
    added.push(r.name ?? id);
  }
  const missing = [...new Set(list.flatMap(r => Object.keys(r.stoichiometry)))].filter(c => !out.components.includes(c));
  const note = [`Added ${added.length} reaction${added.length === 1 ? "" : "s"}${renamed.length ? ` (new ids: ${renamed.join(", ")})` : ""}.`,
    missing.length ? `They use ${missing.join(", ")}, not among the components: add ${missing.length === 1 ? "it" : "them"} in Components.` : ""].filter(Boolean).join(" ");
  return { fs: out, note };
}

/** The reactions the reactors use: only these are checked and solved, so a reaction still being written does not stop the flowsheet. */
export function usedReactions(fs) {
  if (!fs?.reactions) return fs;
  const used = new Set(fs.blocks.filter(b => REACTION_USERS.includes(b.type)).flatMap(b => (b.spec?.reactions ?? []).map(reactionIdOf)));
  // a rate still being written stops only the CSTR and plug-flow reactors that use it
  const kinetic = new Set(fs.blocks.filter(b => KINETIC.includes(b.type)).flatMap(b => (b.spec?.reactions ?? []).map(reactionIdOf)));
  const reactions = fs.reactions.filter(r => used.has(r.id)).map(r => (r.rate && !kinetic.has(r.id) ? (({ rate, ...rest }) => rest)(r) : r));
  const out = { ...fs };
  if (reactions.length) out.reactions = reactions; else delete out.reactions;
  return out;
}
