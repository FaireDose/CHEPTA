/**
 * Flowsheet workspace (proposal 0006, step 5): the canvas, the Inputs panel (setup, block and
 * stream forms with their degrees of freedom) and the results (stream table, energy streams).
 *
 * A view (layer 6): it edits the flowsheet document with flowsheet-logic.js and calculates
 * only through the public functions of the layers below (flowsheetDocStatus, and the request path of src/api/ to solve).
 * The person's selection and the last solution live in `ui.fs` (not in the saved state):
 *   ui.fs = { sel: null | { kind: "block" | "stream", id }, auto: true, solveKey, cache, note }
 */
import { warning, summaryOf, problemsWarning } from "./warning.js";
import { h, s as svgEl } from "./dom.js";
import { icon } from "./icons.js";
import { FUTURE_MODELS } from "./future-models.js";
import { modelPicker } from "./model-picker.js";
import { listComponents, modelName } from "../thermo/system.js";
import { methodAdvice } from "../thermo/method-advice.js";
import { componentPicker } from "./component-picker.js";
import { unitType } from "../units/units.js";
import { flowsheetDocStatus } from "../flowsheet/document.js";
import { run } from "../api/dispatcher.js";
import {
  PALETTE, addBlock, addFeedTo, connect, removeBlock, addOutlet, removeOutlet, setSpec, moveBlock, setTear,
  setComponents, streamsOf, endOf, openInlets, deleteStream, setStreamLabel, streamName, setBlockLabel, blockName, feedOf, feedStreamOf,
  energyOf, energyTargets, addEnergyFeed, connectEnergy, removeEnergy, setEnergyDuty, ENERGY_TARGETS, ENERGY_SOURCES,
  placeEnergyFeed, connectEnergyFeed, disconnectEnergy, moveEnergy, showEnergy, ratingPatch, designPatch,
  REACTORS, REACTION_USERS, KINETIC, saveShared, hasShared, addReaction, setReaction, removeReaction, reactionsFile, importReactions, usedReactions,
} from "./flowsheet-logic.js";
import { checkReaction, reactionProperties } from "../reactions/reaction.js";
import { HEAT_TRANSFER } from "../units/heat-exchange.js";
import { PUMP_EFFICIENCY, COMPRESSOR_EFFICIENCY, EXPANDER_EFFICIENCY } from "../units/units.js";
import { tLabel, tToDisplay, pToDisplay, fmtShort, flowToDisplay, massFlowToDisplay, dutyToDisplay, dutyFromDisplay } from "./properties-logic.js";
import { flowsheetXlsx } from "./flowsheet-excel.js";
import { kineticsEditor, FORM_LABEL } from "./kinetics-editor.js";
import { profilePanel } from "./reactor-charts.js";
import pkg from "../../package.json" with { type: "json" };
import { parseP, parseT, fmtTemp, fmtP, userOverlay, calculatedFlowsheet, setsLabel } from "./app-logic.js";

// the user's own data of the workbench being drawn (proposal 0012), set by each entry point below from its state;
// the drawing is synchronous, so it never mixes two workbenches
let drawing = null;
const enter = state => { drawing = userOverlay(state); };
const byId = () => new Map(listComponents({ userData: drawing }).map(c => [c.id, c]));
const nameOf = id => byId().get(id)?.name ?? id;
// the models with parameters per pair (Modified UNIFAC 2.0 and the ideal solution have none)
const PAIR_MODELS = ["NRTL", "UNIQUAC", "PR", "SRK"];
const LABEL = { feed: "Feed", mixer: "Mixer", splitter: "Splitter", separator: "Separator", flash: "Flash drum", heater: "Heater/Cooler",
  hx: "Heat exchanger", valve: "Valve", pump: "Pump", compressor: "Compressor", expander: "Expander", product: "Product",
  "conversion-reactor": "Conversion reactor", "equilibrium-reactor": "Equilibrium reactor", "gibbs-reactor": "Gibbs reactor", "yield-reactor": "Yield reactor", cstr: "CSTR", pfr: "Plug-flow reactor" };
/** One line per reactor type in the Reactor menu of the toolbar. */
const REACTOR_LINE = { "conversion-reactor": "a given conversion of a key reactant", "yield-reactor": "products per kg of a key reactant",
  "equilibrium-reactor": "the listed reactions at equilibrium", "gibbs-reactor": "every reaction among the species, at equilibrium (minimum Gibbs energy)", cstr: "stirred tank, with kinetics", pfr: "tube, with kinetics; profiles along it" };
const HINT = {
  feed: "A stream entering the flowsheet: its flows and two of T, P and vapour fraction.",
  mixer: "Joins streams; adiabatic, at the lowest inlet pressure unless you set one.",
  splitter: "Divides a stream: the same state in every outlet, a fraction of the flow each. Several inlets are mixed first.",
  separator: "Sends a fraction of each component to each outlet (a black box); each outlet flashes at its T and P. Several inlets are mixed first.",
  flash: "Vapour and liquid at equilibrium: two of T, P, vapour fraction and duty.",
  heater: "Heats or cools: outlet T, duty or vapour fraction; pressure drop optional. Several inlets are mixed first. With a utility and U, it also gives the area.",
  hx: "Two process streams exchange heat: one outlet temperature, a vapour fraction, the duty or the minimum approach; the other outlet from the energy balance. With U, the area.",
  valve: "Lowers the pressure, adiabatically (the outlet has the inlet's enthalpy): the outlet pressure or the pressure drop.",
  pump: "Raises a liquid's pressure: the outlet pressure or the rise, and the efficiency (75 % if not given). Its power is a work stream.",
  compressor: "Raises a gas's pressure along the isentropic path: the outlet pressure, the rise or the ratio, and the isentropic efficiency (75 % if not given). Its power is a work stream.",
  expander: "Lowers a gas's pressure and gives power: the outlet pressure, the drop or the ratio, and the isentropic efficiency (80 % if not given). Its power is a work stream (negative: out).",
  "conversion-reactor": "Converts a given fraction of a key reactant by each reaction of the Reactions page; then the outlet temperature, duty or vapour fraction. Its duty carries the heat of the reactions.",
  "equilibrium-reactor": "The reactions of the Reactions page reach chemical equilibrium at the outlet temperature and pressure (K from the formation data, or the reaction's own K). One phase, or vapour and liquid together; then the outlet temperature or the duty. Its duty carries the heat of the reactions.",
  "gibbs-reactor": "The species you tick reach the minimum of the Gibbs energy with the elements balanced: every reaction among them, written by CHEPTA (reformers, gasifiers, combustion). One phase, or vapour and liquid together; then the outlet temperature or the duty.",
  cstr: "A stirred tank at steady state: the reactions of the Reactions page with their kinetics, the volume (or catalyst mass), and the temperature or the duty.",
  pfr: "A tube (or a bundle of tubes) in plug flow: the reactions with their kinetics, the length and diameter; isothermal, a duty or a coolant; a pressure drop. Its profiles show under the drawing (double-click it).",
  "yield-reactor": "Turns a given fraction of a key reactant into the products you give per kg (or mol) of it, for a reaction known by its products (a fermentation, a pyrolysis). The mass must close; the elements are reported.",
};
/** Blocks on the roadmap, shown in the toolbar but not available yet. */
const COMING = [
  { id: "column", label: "Distillation", icon: "column", note: "roadmap v0.5" },
  { id: "extraction", label: "Extraction", icon: "extract", note: "after liquid-liquid equilibria in the flash" },
];
// a feed is drawn as the start of its stream (a tab), not as a block; its size is that point
const SIZE = { feed: [0, 0], mixer: [40, 44], splitter: [40, 44], separator: [46, 62], flash: [34, 72], heater: [40, 40], hx: [56, 44], valve: [34, 26], pump: [40, 40], compressor: [44, 40], expander: [44, 40],
  "conversion-reactor": [44, 58], "equilibrium-reactor": [44, 58], "yield-reactor": [44, 58], "gibbs-reactor": [44, 58], cstr: [44, 58], pfr: [76, 30], product: [0, 0] };
// the inlet and outlet ports of a two-stream exchanger: hot above, cold below
const PORT_DY = { hot: -11, cold: 11 };

// setup: which setup page the Inputs panel shows while nothing is selected ("components", "method" or "reactions")
export const ensureUi = ui => (ui.fs ??= { sel: null, setup: "components", auto: true, solveKey: null, cache: null, note: "" });

/** On the drawing a feed is its stream: a selected Feed block becomes its stream (a feed with no stream stays a block). */
function feedSel(f, fs) {
  if (f.sel?.kind !== "block") return;
  const b = fs.blocks.find(x => x.id === f.sel.id), s = b?.type === "feed" ? feedStreamOf(fs, b.id) : null;
  if (s) f.sel = { kind: "stream", id: s.id };
}

/** Delete what is selected (a block, or a stream as far as the flowsheet allows) and say what happened. */
export function deleteSelected(state, set, ui) {
  enter(state);
  const f = ensureUi(ui), fs = state.flowsheet;
  if (!f.sel) return;
  if (f.sel.kind === "energy") {
    const q = (fs.energyStreams ?? []).find(x => x.id === f.sel.id), bid = f.sel.block;
    f.sel = null;
    if (q) {
      f.note = q.from ? `${q.id} removed: ${q.to} needs its own specification again.` : `Energy feed ${q.id} deleted${q.to ? `: ${q.to} needs its own specification again` : ""}.`;
      set({ flowsheet: removeEnergy(fs, q.id) });
    } else if (bid) {
      // a block's own energy stream: taken out of the drawing; the block still has its duty
      f.note = `${bid}'s energy stream is taken out of the drawing; ${bid} still calculates its duty (in its results and in the energy balance). Its form can show it again.`;
      set({ flowsheet: showEnergy(fs, bid, false) });
    } else set({});
    return;
  }
  if (f.sel.kind === "block") {
    const r = removeBlock(fs, f.sel.id);
    f.sel = null; f.note = r.note;
    set({ flowsheet: r.fs });
    return;
  }
  const r = deleteStream(fs, f.sel.id);
  f.note = r.note;
  if (r.fs !== fs) { if (!r.fs.streams.some(x => x.id === f.sel.id)) f.sel = null; set({ flowsheet: r.fs }); }
  else set({});
}

// ---------------------------------------------------------------------------------------
// Undo and redo: the flowsheets before each change made in the workspace (app.js records them), 100 at most

const HISTORY = 100;
/** Record a change of the flowsheet from `before` to `after` (nothing when they are the same, or when the change is
 *  itself an undo or a redo). A new change clears what could be redone. */
export function recordFlowsheet(ui, before, after, how = null) {
  const hst = (ui.fsHistory ??= { undo: [], redo: [] });
  if (how === "undo" || how === "redo" || !before || JSON.stringify(before) === JSON.stringify(after)) return;
  hst.undo.push(before);
  if (hst.undo.length > HISTORY) hst.undo.shift();
  hst.redo = [];
}

/** Undo (dir "undo") or redo the last change of the flowsheet; the selection is cleared if what it named is gone. */
export function stepFlowsheet(state, set, ui, dir) {
  const f = ensureUi(ui), hst = (ui.fsHistory ??= { undo: [], redo: [] });
  const from = dir === "undo" ? hst.undo : hst.redo, to = dir === "undo" ? hst.redo : hst.undo;
  if (!from.length) return false;
  to.push(state.flowsheet);
  const next = from.pop();
  const has = s => !s || (s.kind === "block" ? next.blocks.some(b => b.id === s.id) : s.kind === "stream" ? next.streams.some(x => x.id === s.id)
    : (next.energyStreams ?? []).some(q => q.id === s.id) || (s.block && next.blocks.some(b => b.id === s.block && b.energy !== false)));
  if (!has(f.sel)) f.sel = null;
  set({ flowsheet: next }, { history: dir });
  return true;
}

// ---------------------------------------------------------------------------------------
// Solving (cached by the flowsheet's text)

/** What the solution depends on, as text: the flowsheet with the Library's parameter sets, and the user's own data
 *  when the project has some. */
export const flowsheetKey = state => JSON.stringify(state.userData ? [calculatedFlowsheet(state), state.userData] : calculatedFlowsheet(state));

/** The status and, when it can be had, the solution of the flowsheet in the state (with the project's own data). */
export function solution(state, ui) {
  enter(state);
  // the flowsheet with the parameter sets chosen in the Library and the diagrams
  const f = ensureUi(ui), fs = calculatedFlowsheet(state), ud = userOverlay(state);
  // a method that cannot describe a component (light gases with an activity model): that is the one thing to say,
  // with its remedy, not the error of the calculation it would start
  const problem = methodProblem(fs.components, fs.thermo);
  if (problem) return { status: { ready: false, message: problem, structure: [], blocks: {} }, result: null, error: problem, method: true };
  let status;
  try { status = flowsheetDocStatus(fs, ud); } catch (e) { return { status: { ready: false, message: e.message, structure: [], blocks: {} }, result: null, error: e.message }; }
  const key = flowsheetKey(state);
  if (!status.ready) return { status, result: null, error: null, stale: false };
  if (!(f.auto || f.solveKey === key)) return { status, result: null, error: null, stale: true };
  if (f.cache?.key !== key) {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    // through the request path (proposal 0015, section 9, contract 6), as the command line and the assistants call it
    const r = run({ capability: "solve_flowsheet", input: { flowsheet: fs, user_data: ud } });
    f.cache = r.outcome === "ok"
      ? { key, result: r.value, error: null, ms: (typeof performance !== "undefined" ? performance.now() : 0) - t0, reproduction: r.reproduction }
      : { key, result: null, error: r.error.message, loop: r.error.details?.loop ?? null };
  }
  return { status, result: f.cache.result, error: f.cache.error, loop: f.cache.loop, ms: f.cache.ms, stale: false };
}

// ---------------------------------------------------------------------------------------
// Ribbon

/** The toolbar groups of the Flowsheet workspace (helpers from app.js: group, bigButton, smallButton). */
export function flowsheetRibbon({ state, set, ui, group, smallButton }) {
  enter(state);
  const f = ensureUi(ui), fs = state.flowsheet;
  const ready = fs.components.length > 0;
  const place = type => () => {
    const r = addBlock(fs, type);
    f.sel = { kind: "block", id: r.id }; feedSel(f, r.fs);
    set({ flowsheet: r.fs });
  };
  // one band of groups, at most two rows of buttons each (the maintainer, 2026-10-22: "two line only. zoom and do and
  // undo and solver on one side. the blocks in the middle"): the setup on the left, the blocks in the middle, editing,
  // view and solving on the right; the frequent tools as icon buttons with their name as tooltip
  const rows2 = (...children) => h("div", { class: "fa-rows2" }, ...children);
  const iconBtn = ({ ico, label, fk, onClick, disabled, pressed }) => {
    const b = h("button", { type: "button", class: "fa-btn fa-small fa-icon-only", title: label, "aria-label": label, "data-fk": fk,
      "aria-pressed": pressed == null ? undefined : String(!!pressed), on: { click: onClick } }, icon(ico, 18));
    b.disabled = !!disabled;
    return b;
  };
  const method = fs.thermo.model + (["PR", "SRK"].includes(fs.thermo.model) || fs.thermo.vapour === "ideal" ? "" : ` + ${fs.thermo.vapour}`);
  const setupBtn = (ico, label, page, fk, title) => {
    const b = smallButton({ ico, label, fk, title, pressed: !f.sel && (f.setup ?? "components") === page, onClick: () => { f.sel = null; f.setup = page; set({}); } });
    return b;
  };
  const blockBtn = type => {
    const b = smallButton({ ico: type === "flash" ? "drum" : REACTORS.includes(type) ? "reactor" : type, label: LABEL[type].replace(" reactor", ""), fk: `fs-add-${type}`,
      title: ready ? `Place a ${LABEL[type].toLowerCase()}: ${HINT[type]}` : "Choose the components first", onClick: place(type) });
    b.disabled = !ready;
    return b;
  };
  const energyBtn = (() => {
    const q = smallButton({ ico: "energy", label: "Energy feed", fk: "fs-add-energy",
      title: ready ? "Place an energy feed: a given duty (+ heat in, − heat out). Drag it onto a heater/cooler or a flash drum: the block then calculates its outlet from it." : "Choose the components first",
      onClick: () => { const r = placeEnergyFeed(fs); f.sel = { kind: "energy", id: r.id }; set({ flowsheet: r.fs }); } });
    q.disabled = !ready;
    return q;
  })();
  const blocks = PALETTE.filter(type => !REACTORS.includes(type));
  feedSel(f, fs);
  const selName = !f.sel ? "" : f.sel.kind === "block" ? blockName(fs.blocks.find(x => x.id === f.sel.id)) ?? f.sel.id
    : f.sel.kind === "energy" ? f.sel.id : streamName(fs.streams.find(x => x.id === f.sel.id)) ?? f.sel.id;
  const nUndo = ui.fsHistory?.undo.length ?? 0, nRedo = ui.fsHistory?.redo.length ?? 0;
  const tools = group("Edit, view and solve", h("div", { class: "fa-rows2 fa-tools" },
    iconBtn({ ico: "undo", label: nUndo ? `Undo (Ctrl + Z); ${nUndo} can be undone` : "Undo: nothing yet", fk: "fs-undo", disabled: !nUndo, onClick: () => stepFlowsheet(state, set, ui, "undo") }),
    iconBtn({ ico: "redo", label: nRedo ? "Redo (Ctrl + Y)" : "Redo: nothing to redo", fk: "fs-redo", disabled: !nRedo, onClick: () => stepFlowsheet(state, set, ui, "redo") }),
    iconBtn({ ico: "plus", label: "Zoom in (Ctrl + mouse wheel)", fk: "fs-zoom-in", onClick: () => { f.zoom = Math.min(3, (f.zoom ?? 1) * 1.25); set({}); } }),
    iconBtn({ ico: "minus", label: "Zoom out (Ctrl + mouse wheel)", fk: "fs-zoom-out", onClick: () => { f.zoom = Math.max(0.4, (f.zoom ?? 1) / 1.25); set({}); } }),
    iconBtn({ ico: "search", label: `Fit the whole drawing (now ${Math.round((f.zoom ?? 1) * 100)} %)`, fk: "fs-zoom-fit", onClick: () => {
      // the zoom that shows the whole drawing in the box (at most 100 %), from the top left
      const v = f.view, W = v?.wrap?.clientWidth ?? 0, H = Math.max(v?.wrap?.clientHeight ?? 0, 320);
      f.zoom = W > 0 ? Math.max(0.4, Math.min(1, (W - 4) / v.w, (H - 4) / v.h)) : 1;
      f.scroll = { left: 0, top: 0 }; set({});
    } }),
    iconBtn({ ico: "trash", label: f.sel ? `Delete ${selName} (Delete key)` : "Delete: select a block or a stream first", fk: "fs-delete", disabled: !f.sel, onClick: () => deleteSelected(state, set, ui) }),
    smallButton({ ico: "solve", label: "Solve", fk: "fs-solve", title: "Calculate the flowsheet now", onClick: () => { f.solveKey = flowsheetKey(state); set({}); } }),
    smallButton({ ico: "check", label: "On change", pressed: f.auto, fk: "fs-auto",
      title: "Solve on change: recalculate whenever the flowsheet is complete and changes", onClick: () => { f.auto = !f.auto; set({}); } })));
  tools.classList.add("fa-push");
  return [
    group("Setup", rows2(
      setupBtn("flask", `Components${ready ? ` (${fs.components.length})` : ""}`, "components", "fs-setup", "1. Choose the components of the simulation (and see the status of the flowsheet)"),
      setupBtn("cubic", `Method: ${method}`, "method", "fs-method", "2. The property method of the whole flowsheet, and the recycle solver"),
      setupBtn("spark", `Reactions${fs.reactions?.length ? ` (${fs.reactions.length})` : ""}`, "reactions", "fs-reactions", "3. The reactions of the process, written once for every reactor: stoichiometry, balance check, heat of reaction and K"))),
    group("Blocks", rows2(blockBtn("feed"), energyBtn, ...blocks.filter(t => t !== "feed").map(blockBtn))),
    // the blocks still to come: one locked button, with what they are in its tooltip
    group("Reactors", rows2((() => {
      // one button; its menu lists the reactor types (the maintainer, 2026-10-28: "the blocks ... seems crowded")
      const open = !!f.reactorMenu;
      const b = smallButton({ ico: "reactor", label: "Reactor", fk: "fs-add-reactor", pressed: open,
        title: ready ? "Place a reactor: choose its type" : "Choose the components first", onClick: () => { f.reactorMenu = !open; set({}); } });
      b.disabled = !ready;
      b.setAttribute("aria-haspopup", "menu");
      return h("div", { class: "fa-menu-wrap" }, b, open && ready ? h("div", { class: "fa-menu", role: "menu" }, ...REACTORS.map(t =>
        h("button", { type: "button", role: "menuitem", class: "fa-menu-item", "data-fk": `fs-add-${t}`, title: HINT[t],
          on: { click: () => { f.reactorMenu = false; place(t)(); } } }, h("b", {}, LABEL[t]), h("span", {}, REACTOR_LINE[t])))) : null);
    })(), (() => {
      const b = iconBtn({ ico: "lock", label: `Coming later: ${COMING.map(c => `${c.label} (${c.note})`).join("; ")}`, fk: "fs-soon", disabled: true, onClick: () => {} });
      b.classList.add("is-locked");
      return b;
    })())),
    tools,
  ];
}

// ---------------------------------------------------------------------------------------
// Inputs panel

function numberField(label, value, onCommit, { id, uid, unit, placeholder, title } = {}) {
  const inp = h("input", { type: "text", inputmode: "decimal", id: `fa-fs-${id}-${uid}`, value: value ?? "", placeholder: placeholder ?? "", style: "width:7em", title,
    "data-fk": `fs-field-${id}`, on: { change: ev => { if (onCommit(ev.target.value.trim()) === false) ev.target.value = value ?? ""; } } });
  return h("label", { class: "fa-field", for: inp.id }, h("span", {}, label, unit ? h("small", {}, unit) : null), inp);
}
const num = t => { if (t === "") return null; const v = Number(String(t).replace(",", ".")); return Number.isFinite(v) ? v : undefined; };
const segRow = (label, choices, current, onPick, fk) => h("div", { class: "fug-seg fa-seg", role: "group", "aria-label": label },
  ...choices.map(([v, text]) => h("button", { type: "button", "aria-pressed": String(current === v), "data-fk": `${fk}-${v}`, on: { click: () => onPick(v) } }, text)));

function dofBadge(st) {
  if (!st) return null;
  if (st.ok) return h("div", { class: "fa-dof is-ok", role: "status" }, icon("check", 14), `Fully specified${st.needed ? ` (${st.given} of ${st.needed})` : ""}`);
  return h("div", { class: "fa-dof is-bad", role: "status" }, st.message.replace(/^[^:]+: /, ""));
}

/** The sections of the Inputs panel. env: { state, set, ui, uid, inputsSection } */
export function flowsheetInputs(env) {
  enter(env.state);
  const f = ensureUi(env.ui);
  const note = f.note; f.note = "";
  const secs = inputsFor(env);
  return note ? [warning(note, { attrs: { role: "note" } }), ...secs] : secs;
}

function inputsFor({ state, set, ui, uid, inputsSection }) {
  const f = ensureUi(ui), fs = state.flowsheet, u = state.units;
  let st = null;
  try { st = flowsheetDocStatus(usedReactions(fs), userOverlay(state)); } catch { /* shown on the canvas */ }
  const put = next => set({ flowsheet: next });
  feedSel(f, fs);
  const back = h("button", { type: "button", class: "fa-mini", "data-fk": "fs-back", on: { click: () => { f.sel = null; set({}); } } }, icon("chevronUp", 14), "Setup and status");
  if (f.sel?.kind === "energy") {
    const secs = energyInputs({ fs, f, put, set, inputsSection, uid, back });
    if (secs) return secs;
    f.sel = null;
  }
  const sel = f.sel && (f.sel.kind === "block" ? fs.blocks.find(b => b.id === f.sel.id) : fs.streams.find(s => s.id === f.sel.id));
  if (!sel) { f.sel = null; return setupSections({ state, set, ui, uid, inputsSection, st }); }
  // a feed stream: the stream, then its flows and state (kept in its Feed block, which is not drawn)
  const feed = f.sel.kind === "stream" ? feedOf(fs, sel.id) : null;
  if (f.sel.kind === "stream" && !feed) return streamSections({ fs, put, sel, f, inputsSection, back, set });
  const b = feed ?? sel, bst = st?.blocks?.[b.id];
  const [streamHead, streamActions] = feed ? streamSections({ fs, put, sel, f, inputsSection, back, set, badge: dofBadge(bst) }) : [];
  const secs = [feed ? streamHead : inputsSection(`${LABEL[b.type]} ${blockName(b)}`, h("p", { class: "fa-in-hint" }, HINT[b.type] ?? ""),
    nameField(b, `${LABEL[b.type].toLowerCase()} ${b.id}`, v => put(setBlockLabel(fs, b.id, v))), dofBadge(bst))];
  const spec = b.spec ?? {};
  const setS = patch => put(setSpec(fs, b.id, patch));
  // the block's last solved result: rating keeps the area and U of its design
  const done = f.cache?.result?.blocks?.[b.id] ?? null;
  const T = (key, label = "Temperature") => numberField(label, spec[key] == null ? "" : String(+tToDisplay(spec[key], u).toFixed(3)),
    t => { if (t === "") return setS({ [key]: null }); const v = parseT(t, u); if (v == null) return false; setS({ [key]: v }); }, { id: `${b.id}-${key}`, uid, unit: tLabel(u) });
  const P = (key, label = "Pressure") => numberField(label, spec[key] == null ? "" : fmtShort(pToDisplay(spec[key], u), 6),
    t => { if (t === "") return setS({ [key]: null }); const v = parseP(t, u); if (v == null) return false; setS({ [key]: v }); }, { id: `${b.id}-${key}`, uid, unit: u.P });
  const plain = (key, label, unit, ph) => numberField(label, spec[key] == null ? "" : String(spec[key]),
    t => { const v = num(t); if (v === undefined) return false; setS({ [key]: v }); }, { id: `${b.id}-${key}`, uid, unit, placeholder: ph });
  /** Choose which two (or one) state variables are given: keeps their values, drops the others. */
  const modeSeg = (modes, keys) => {
    const cur = modes.find(([m]) => m.split("+").every(k => spec[k] != null) && keys.filter(k => !m.split("+").includes(k)).every(k => spec[k] == null))?.[0]
      ?? f.mode?.[b.id] ?? null;
    return segRow("Specification", modes.map(([m, l]) => [m, l]), cur, m => {
      const want = m.split("+");
      f.mode = { ...(f.mode ?? {}), [b.id]: m };   // before the redraw, which shows this mode's fields
      setS(Object.fromEntries(keys.map(k => [k, want.includes(k) ? spec[k] ?? null : null])));
    }, `fs-mode-${b.id}`);
  };
  const shown = (modes, keys) => {
    const cur = modes.find(([m]) => m.split("+").every(k => spec[k] != null))?.[0] ?? f.mode?.[b.id] ?? modes[0][0];
    return cur.split("+");
  };
  const fieldFor = key => key === "T_K" ? T("T_K") : key === "P_kPa" ? P("P_kPa") : key === "VF" ? plain("VF", "Vapour fraction", "mol/mol", "0 to 1")
    : key === "duty_kW" ? numberField("Duty", spec.duty_kW == null ? "" : String(+dutyToDisplay(spec.duty_kW, u).toPrecision(8)),
      t => { const v = num(t); if (v === undefined) return false; setS({ duty_kW: v == null ? null : dutyFromDisplay(v, u) }); }, { id: `${b.id}-duty_kW`, uid, unit: u.duty ?? "kW", placeholder: "+ heat in" }) : null;

  if (b.type === "feed") {
    const mass = spec.flow_kg_h != null;
    const key = mass ? "flow_kg_h" : "flow_kmol_h";
    const flows = spec[key] ?? {};
    secs.push(inputsSection("Flows",
      segRow("Flow unit", [["kmol_h", "kmol/h"], ["kg_h", "kg/h"]], mass ? "kg_h" : "kmol_h", v => {
        const to = v === "kg_h" ? "flow_kg_h" : "flow_kmol_h";
        if (to !== key) setS({ [to]: spec[key] ?? {}, [key]: null });
      }, `fs-funit-${b.id}`),
      ...fs.components.map(c => numberField(nameOf(c), flows[c] == null ? "" : String(flows[c]), t => {
        const v = num(t); if (v === undefined || (v != null && v < 0)) return false;
        const next = { ...flows }; if (v == null) delete next[c]; else next[c] = v;
        setS({ [key]: next });
      }, { id: `${b.id}-f-${c}`, uid, unit: mass ? "kg/h" : "kmol/h", placeholder: "0" }))));
    const modes = [["T_K+P_kPa", "T, P"], ["P_kPa+VF", "P, VF"], ["T_K+VF", "T, VF"]];
    secs.push(inputsSection("State", modeSeg(modes, ["T_K", "P_kPa", "VF"]), ...shown(modes, ["T_K", "P_kPa", "VF"]).map(fieldFor)));
  } else if (b.type === "flash" && energyOf(fs, b.id)?.role === "in") {
    secs.push(inputsSection("Conditions", P("P_kPa"), h("p", { class: "fa-in-hint" }, `The duty comes from the energy stream ${energyOf(fs, b.id).stream.id}; the drum calculates its temperature.`)));
  } else if (b.type === "heater" && energyOf(fs, b.id)?.role === "in") {
    secs.push(inputsSection("Outlet", h("p", { class: "fa-in-hint" }, `The duty comes from the energy stream ${energyOf(fs, b.id).stream.id}; the heater calculates its outlet temperature.`)),
      inputsSection("Pressure", spec.P_kPa != null ? P("P_kPa", "Outlet pressure") : P("dP_kPa", "Pressure drop"), h("p", { class: "fa-in-hint" }, "Empty pressure drop: none.")));
  } else if (b.type === "flash") {
    const modes = [["T_K+P_kPa", "T, P"], ["P_kPa+duty_kW", "P, Q"], ["P_kPa+VF", "P, VF"], ["T_K+VF", "T, VF"]];
    secs.push(inputsSection("Conditions", modeSeg(modes, ["T_K", "P_kPa", "VF", "duty_kW"]), ...shown(modes, ["T_K", "P_kPa", "VF", "duty_kW"]).map(fieldFor),
      h("p", { class: "fa-in-hint" }, "P and Q = 0: an adiabatic drum.")));
  } else if (b.type === "heater" && spec.A_m2 != null) {
    secs.push(inputsSection("Rating",
      plain("A_m2", "Area of the exchanger", "m²"),
      h("p", { class: "fa-in-hint" }, "The area and U of the design are kept (Sizing below); the outlet follows from them. Change the area to rate another exchanger."),
      backToDesign(spec, setS, b.id)),
      inputsSection("Pressure", spec.P_kPa != null ? P("P_kPa", "Outlet pressure") : P("dP_kPa", "Pressure drop"), h("p", { class: "fa-in-hint" }, "Empty pressure drop: none.")));
  } else if (b.type === "heater") {
    const modes = [["T_K", "T"], ["duty_kW", "Duty"], ["VF", "VF"], ["T_K+VF", "T, VF"]];
    const keys = shown(modes, ["T_K", "duty_kW", "VF"]);
    secs.push(inputsSection("Outlet", modeSeg(modes, ["T_K", "duty_kW", "VF"]), ...keys.map(fieldFor)));
    if (!(keys.includes("T_K") && keys.includes("VF"))) {
      secs.push(inputsSection("Pressure", spec.P_kPa != null ? P("P_kPa", "Outlet pressure") : P("dP_kPa", "Pressure drop"),
        h("button", { type: "button", class: "fa-mini", "data-fk": `fs-pmode-${b.id}`, on: { click: () => setS(spec.P_kPa != null ? { P_kPa: null } : { dP_kPa: null, P_kPa: 101.325 }) } },
          spec.P_kPa != null ? "Give a pressure drop instead" : "Give the outlet pressure instead"),
        h("p", { class: "fa-in-hint" }, "Empty pressure drop: none.")));
    }
  } else if (b.type === "mixer") {
    secs.push(inputsSection("Outlet", P("P_kPa", "Outlet pressure"), h("p", { class: "fa-in-hint" }, "Empty: the lowest inlet pressure.")));
  } else if (b.type === "splitter" || b.type === "separator") {
    const outs = streamsOf(fs, b.id).out ?? [];
    const outletTools = h("div", { class: "fa-in-actions" },
      h("button", { type: "button", class: "fa-mini", "data-fk": `fs-addout-${b.id}`, on: { click: () => put(addOutlet(fs, b.id)) } }, icon("plus", 14), "Outlet"),
      h("button", { type: "button", class: "fa-mini", "data-fk": `fs-rmout-${b.id}`, disabled: outs.length <= 2,
        on: { click: () => { try { put(removeOutlet(fs, b.id)); } catch (e) { f.note = e.message; set({}); } } } }, icon("minus", 14), "Outlet"));
    /** One row of fractions over the outlets, with a "rest" choice. */
    const fracRow = (list, onChange, tag) => h("div", { class: "fa-frac-row" }, ...outs.map((sid, k) => {
      const isRest = list[k] === "rest";
      const inp = h("input", { type: "text", inputmode: "decimal", value: isRest ? "" : list[k] ?? "", placeholder: isRest ? "rest" : "0", disabled: isRest, style: "width:4.6em",
        "aria-label": `Fraction to ${sid}`, "data-fk": `fs-fr-${b.id}-${tag}-${k}`,
        on: { change: ev => { const v = num(ev.target.value.trim()); if (v === undefined || v == null || v < 0 || v > 1) { ev.target.value = list[k] ?? ""; return; } const l = list.slice(); l[k] = v; onChange(l); } } });
      const rest = h("input", { type: "radio", name: `fa-rest-${b.id}-${tag}-${uid}`, checked: isRest, title: `${sid} takes the rest`, "aria-label": `${sid} takes the rest`,
        "data-fk": `fs-rest-${b.id}-${tag}-${k}`, on: { change: () => { const l = list.map((v, i) => (i === k ? "rest" : v === "rest" ? 0 : v)); onChange(l); } } });
      return h("label", { class: "fa-frac" }, h("span", {}, sid), inp, rest);
    }));
    if (b.type === "splitter") {
      const list = Array.isArray(spec.fractions) ? outs.map((_, k) => spec.fractions[k] ?? 0) : outs.map((_, k) => (k === outs.length - 1 ? "rest" : 0));
      secs.push(inputsSection("Fractions of the flow", fracRow(list, l => setS({ fractions: l }), "all"),
        h("p", { class: "fa-in-hint" }, "The dot marks the outlet that takes the rest."), outletTools));
    } else {
      const fr = spec.fractions ?? {};
      secs.push(inputsSection("Fraction of each component to each outlet",
        ...fs.components.map(c => {
          const list = Array.isArray(fr[c]) ? outs.map((_, k) => fr[c][k] ?? 0) : outs.map((_, k) => (k === outs.length - 1 ? "rest" : 0));
          return h("div", { class: "fa-frac-comp" }, h("div", { class: "fa-frac-name" }, nameOf(c)), fracRow(list, l => setS({ fractions: { ...fr, [c]: l } }), c));
        }),
        h("p", { class: "fa-in-hint" }, "Each outlet is flashed at the inlet's T and P."), outletTools));
    }
  }
  // proposal 0010, step 7: the reactors; the reactions themselves are on the Reactions page
  if (REACTORS.includes(b.type)) {
    const reactants = r => Object.entries(r.stoichiometry ?? {}).filter(([, v]) => v < 0).map(([c]) => c);
    if (b.type === "conversion-reactor") {
      const list = fs.reactions ?? [], used = Array.isArray(spec.reactions) ? spec.reactions : [];
      const setList = next => setS({ reactions: next });
      const rows = list.map(r => {
        const k = used.findIndex(e => e.reaction === r.id), e = used[k], chk = reactionCheck(r);
        const on = h("input", { type: "checkbox", checked: !!e, "data-fk": `fs-rxuse-${b.id}-${r.id}`, "aria-label": `Use ${r.name || r.id} in ${blockName(b)}`,
          on: { change: ev => setList(ev.target.checked ? [...used, { reaction: r.id, ...(reactants(r)[0] ? { key: reactants(r)[0] } : {}) }] : used.filter(x => x.reaction !== r.id)) } });
        return h("div", { class: "fa-rx-use" },
          h("label", { class: "fa-rx-use-head" }, on, h("span", {}, h("b", {}, r.name || r.id), " ", h("span", { class: "fa-in-hint" }, equation(r)))),
          !chk.ok && Object.keys(r.stoichiometry ?? {}).length ? warning(chk.message, { attrs: { role: "note" } }) : null,
          e ? h("div", { class: "fa-rx-use-row" },
            selectField("Key reactant", [["", "choose"], ...reactants(r).map(c => [c, nameOf(c)])], e.key ?? "",
              v => setList(used.map((x, j) => (j === k ? { ...x, key: v || null } : x)).map(x => Object.fromEntries(Object.entries(x).filter(([, y]) => y != null)))),
              `fs-rxkey-${b.id}-${r.id}`, uid),
            numberField("Conversion", e.conversion == null ? "" : String(e.conversion), t => {
              const v = num(t); if (v === undefined || (v != null && (v < 0 || v > 1))) return false;
              setList(used.map((x, j) => { if (j !== k) return x; const y = { ...x }; if (v == null) delete y.conversion; else y.conversion = v; return y; }));
            }, { id: `${b.id}-x-${r.id}`, uid, unit: "0 to 1", placeholder: "0.5" })) : null);
      });
      secs.push(inputsSection("Reactions",
        list.length ? h("div", {}, ...rows) : h("p", { class: "fa-in-hint" }, "No reaction written yet."),
        h("button", { type: "button", class: "fa-mini", "data-fk": `fs-go-reactions-${b.id}`, on: { click: () => { f.sel = null; f.setup = "reactions"; set({}); } } },
          icon("spark", 14), list.length ? "Write or change reactions" : "Write a reaction"),
        used.length > 1 ? segRow("Order", [["parallel", "In parallel"], ["series", "In series"]], spec.order === "series" ? "series" : "parallel", v => setS({ order: v }), `fs-rxorder-${b.id}`) : null,
        used.length > 1 ? h("p", { class: "fa-in-hint" }, spec.order === "series"
          ? "In series: each reaction converts its fraction of what the reactions above it left of its key."
          : "In parallel: each reaction converts its fraction of the key's inlet flow; the conversions of one key add up (at most 1).") : null));
    } else if (b.type === "equilibrium-reactor" || b.type === "gibbs-reactor" || KINETIC.includes(b.type)) {
      // proposal 0010, step 4: each reaction checked reaches equilibrium, or an approach to it; as a Gibbs reactor
      // (step 6) the species ticked, every reaction among them; the CSTR and PFR (step 5) use their reactions' kinetics
      const kinetic = KINETIC.includes(b.type), gibbs = b.type === "gibbs-reactor";
      const phasesRow = segRow("Phases", [["1", "One phase"], ["2", "Vapour + liquid"]], String(spec.phases ?? 1), v => setS({ phases: v === "2" ? 2 : null }), `fs-phases-${b.id}`);
      const phasesHint = h("p", { class: "fa-in-hint" }, Number(spec.phases) === 2
        ? (kinetic ? "The mixture is flashed at each point; each reaction runs in its own phase." : "Chemical and phase equilibrium together: the outlet may boil or condense as it reacts.")
        : "The whole mixture in the reactions' phase (the outlet is flashed afterwards).");
      if (!kinetic) secs.push(inputsSection("Phases", phasesRow, phasesHint));
      if (gibbs) {
        const species = spec.species ?? fs.components;
        secs.push(inputsSection("Species that may react",
          ...fs.components.map(c => h("label", { class: "fa-check" }, h("input", { type: "checkbox", checked: species.includes(c), "data-fk": `fs-gspecies-${b.id}-${c}`,
            on: { change: ev => { const next = ev.target.checked ? [...species, c] : species.filter(x => x !== c); setS({ species: next.length === fs.components.length ? null : next }); } } }), nameOf(c))),
          h("p", { class: "fa-in-hint" }, "The others pass through. CHEPTA writes a complete set of independent reactions among the species ticked, with K from their formation data: the outlet is the minimum of the Gibbs energy."),
          segRow("Standard state", [["vapour", "Ideal gases"], ["liquid", "Pure liquids"]], spec.phase === "liquid" ? "liquid" : "vapour", v => setS({ phase: v === "liquid" ? v : null }), `fs-gphase-${b.id}`)));
      }
      const list = gibbs ? [] : fs.reactions ?? [];
      const used = (Array.isArray(spec.reactions) ? spec.reactions : []).map(e => (typeof e === "string" ? { reaction: e } : e));
      const setList = next => setS({ reactions: next });
      const rows = list.map(r => {
        const k = used.findIndex(e => e.reaction === r.id), e = used[k], chk = reactionCheck(r);
        const on = h("input", { type: "checkbox", checked: !!e, "data-fk": `fs-rxuse-${b.id}-${r.id}`, "aria-label": `Use ${r.name || r.id} in ${blockName(b)}`,
          on: { change: ev => setList(ev.target.checked ? [...used, { reaction: r.id }] : used.filter(x => x.reaction !== r.id)) } });
        const a = e?.approach ?? {}, mode = a.dT_K != null ? "dT" : a.fraction != null ? "fraction" : "none";
        const setApproach = ap => setList(used.map((x, j) => (j === k ? (ap ? { reaction: x.reaction, approach: ap } : { reaction: x.reaction }) : x)));
        return h("div", { class: "fa-rx-use" },
          h("label", { class: "fa-rx-use-head" }, on, h("span", {}, h("b", {}, r.name || r.id), " ", h("span", { class: "fa-in-hint" }, `${equation(r)} (${r.phase === "liquid" ? "liquid" : "vapour"})`))),
          !chk.ok && Object.keys(r.stoichiometry ?? {}).length ? warning(chk.message, { attrs: { role: "note" } }) : null,
          kinetic ? (r.rate ? h("p", { class: "fa-in-hint" }, `Kinetics: ${FORM_LABEL[r.rate.form] ?? r.rate.form}${r.rate.per === "catalyst-mass" ? ", per kg of catalyst" : ""}.`)
            : e ? warning("No kinetics yet: give them on the Reactions page.", { attrs: { role: "note" } }) : null) : null,
          e && !kinetic ? h("div", { class: "fa-rx-use-row" },
            segRow("Approach to equilibrium", [["none", "Full"], ["dT", "ΔT"], ["fraction", "Fraction"]], mode,
              m => setApproach(m === "dT" ? { dT_K: a.dT_K ?? 0 } : m === "fraction" ? { fraction: a.fraction ?? 1 } : null), `fs-rxapp-${b.id}-${r.id}`),
            mode === "dT" ? numberField("K at T +", String(a.dT_K), t => { const v = num(t); if (v == null) return false; setApproach({ dT_K: v }); },
              { id: `${b.id}-adt-${r.id}`, uid, unit: "K", placeholder: "0" }) : null,
            mode === "fraction" ? numberField("Of the equilibrium extent", String(a.fraction), t => { const v = num(t); if (v == null || v < 0 || v > 1) return false; setApproach({ fraction: v }); },
              { id: `${b.id}-afr-${r.id}`, uid, unit: "0 to 1", placeholder: "1" }) : null) : null);
      });
      if (!gibbs) secs.push(inputsSection("Reactions",
        list.length ? h("div", {}, ...rows) : h("p", { class: "fa-in-hint" }, "No reaction written yet."),
        h("button", { type: "button", class: "fa-mini", "data-fk": `fs-go-reactions-${b.id}`, on: { click: () => { f.sel = null; f.setup = "reactions"; set({}); } } },
          icon("spark", 14), list.length ? "Write or change reactions" : "Write a reaction"),
        kinetic ? phasesRow : null, kinetic ? phasesHint : null));
      if (kinetic) {
        const rates = used.map(e => list.find(r => r.id === e.reaction)?.rate).filter(Boolean);
        const cat = rates.some(q => q.per === "catalyst-mass"), vol = !rates.length || rates.some(q => q.per !== "catalyst-mass");
        if (b.type === "cstr") {
          secs.push(inputsSection("Size", vol ? plain("V_m3", "Volume", "m³", "1") : null, cat ? plain("W_kg", "Catalyst mass", "kg") : null,
            Number(spec.phases) === 2 && vol ? plain("liquidFraction", "Liquid share of the volume", "0 to 1") : null,
            h("p", { class: "fa-in-hint" }, "The volume the reacting mixture fills; the residence time is the volume over the outlet's volume flow.")));
        } else {
          const d = spec.pressureDrop ?? null, dm = d?.particle_m != null ? "ergun" : d?.dP_kPa != null ? "dP" : "none";
          const setD = patch => setS({ pressureDrop: patch == null ? null : { ...(d ?? {}), ...patch } });
          const dField = (key, label, unit, ph, scale = 1) => numberField(label, d?.[key] == null ? "" : String(d[key] / scale), t => {
            const v = num(t); if (v === undefined) return false; setD({ [key]: v == null ? null : v * scale });
          }, { id: `${b.id}-dp-${key}`, uid, unit, placeholder: ph });
          secs.push(inputsSection("Tube", plain("L_m", "Length", "m"), plain("D_m", "Inner diameter", "m"), plain("tubes", "Tubes", "", "1"),
            cat ? plain("bed_kg_m3", "Bed density", "kg/m³") : null),
          inputsSection("Pressure drop",
            segRow("Pressure drop", [["none", "None"], ["dP", "Given"], ["ergun", "Ergun (packed bed)"]], dm,
              v => setS({ pressureDrop: v === "none" ? null : v === "dP" ? { dP_kPa: 0 } : { particle_m: 0.003, voidage: 0.4, viscosity_Pa_s: null } }), `fs-dpmode-${b.id}`),
            dm === "dP" ? dField("dP_kPa", "Pressure drop over the tube", "kPa", "0") : null,
            dm === "ergun" ? dField("particle_m", "Particle diameter", "mm", "3", 0.001) : null,
            dm === "ergun" ? dField("voidage", "Bed voidage", "0 to 1", "0.4") : null,
            dm === "ergun" ? dField("viscosity_Pa_s", "Gas viscosity", "Pa s", "from the records") : null,
            dm === "ergun" ? h("p", { class: "fa-in-hint" }, "Ergun (Rawlings and Ekerdt, eqn 7.69). Gas viscosity empty: the mixture's at each point along the tube, from the components' vapour viscosity records (Wilke's rule); or give it from your source.") : null));
        }
      }
    } else {
      const basis = spec.basis === "mole" ? "mole" : "mass", yields = spec.yields ?? {};
      const yu = basis === "mass" ? "kg/kg" : "mol/mol";
      const others = fs.components.filter(c => c !== spec.key);
      const heatGiven = spec.heatOfReaction ?? {};
      const setHeat = patch => { const n = { ...heatGiven, ...patch }; for (const k of Object.keys(n)) if (n[k] == null || n[k] === "") delete n[k]; setS({ heatOfReaction: Object.keys(n).length ? { phase: "vapour", ...n } : null }); };
      const sum = Object.entries(yields).filter(([c]) => c !== spec.closure).reduce((a, [, v]) => a + (Number(v) || 0), 0);
      secs.push(inputsSection("Key reactant",
        selectField("Key reactant", [["", "choose"], ...fs.components.map(c => [c, nameOf(c)])], spec.key ?? "", v => setS({ key: v || null }), `fs-ykey-${b.id}`, uid),
        plain("conversion", "Conversion", "0 to 1", "1"),
        segRow("Basis of the yields", [["mass", "Mass (kg per kg)"], ["mole", "Mole (mol per mol)"]], basis, v => setS({ basis: v }), `fs-ybasis-${b.id}`)),
        inputsSection("Yields",
          h("p", { class: "fa-in-hint" }, `What forms per ${basis === "mass" ? "kg" : "mol"} of the key converted; a negative yield is a co-reactant consumed (water in a hydrolysis). ${basis === "mass" ? "On the mass basis they add up to 1." : ""}`),
          ...others.map(c => numberField(nameOf(c), yields[c] == null ? "" : String(yields[c]), t => {
            const v = num(t); if (v === undefined) return false;
            const n = { ...yields }; if (v == null) delete n[c]; else n[c] = v;
            setS({ yields: n });
          }, { id: `${b.id}-y-${c}`, uid, unit: yu, placeholder: "0" })),
          selectField("Closure (takes the rest of the mass)", [["", "none"], ...others.map(c => [c, nameOf(c)])], spec.closure ?? "", v => setS({ closure: v || null }), `fs-yclosure-${b.id}`, uid),
          basis === "mass" && !spec.closure && Object.keys(yields).length ? h("p", { class: "fa-in-hint", "data-fk": `fs-ysum-${b.id}` }, `They add up to ${fmtShort(sum, 6)} kg per kg${Math.abs(sum - 1) > 1e-6 ? " (must be 1, or name a closure component)" : ""}.`) : null),
        inputsSection("Heat of reaction",
          h("p", { class: "fa-in-hint" }, "From the formation data of every component that changes. Where one has none, give it here with its source: per mol of the key converted, at 298.15 K."),
          numberField("ΔrH at 298.15 K", heatGiven.dH_J_mol == null ? "" : String(heatGiven.dH_J_mol / 1000), t => {
            const v = num(t); if (v === undefined) return false; setHeat({ dH_J_mol: v == null ? null : v * 1000 });
          }, { id: `${b.id}-ydh`, uid, unit: "kJ/mol", placeholder: "– exothermic" }),
          segRow("Standard state", [["vapour", "Ideal gases"], ["liquid", "Pure liquids"]], heatGiven.phase === "liquid" ? "liquid" : "vapour", v => setHeat({ phase: v }), `fs-yphase-${b.id}`),
          h("label", { class: "fa-field fa-field-stack" }, h("span", {}, "Its source"),
            h("input", { type: "text", value: heatGiven.source ?? "", placeholder: "article, table, page", "data-fk": `fs-ysrc-${b.id}`,
              on: { change: ev => setHeat({ source: ev.target.value.trim() || null }) } }))));
    }
    // the equilibrium reactor and the CSTR have no vapour-fraction specification; a plug-flow reactor has a coolant
    const pfr = b.type === "pfr";
    const keys = ["equilibrium-reactor", "gibbs-reactor", "cstr"].includes(b.type) ? ["T_K", "duty_kW"] : pfr ? ["T_K", "duty_kW", "coolant"] : ["T_K", "duty_kW", "VF"];
    const modes = [["T_K", pfr ? "Isothermal" : "T"], ["duty_kW", "Duty"], ["VF", "VF"], ["coolant", "Coolant"]].filter(([m]) => keys.includes(m));
    const cool = spec.coolant ?? {};
    const coolant = () => [numberField("U", cool.U_W_m2K == null ? "" : String(cool.U_W_m2K), t => { const v = num(t); if (v === undefined) return false; setS({ coolant: { ...cool, U_W_m2K: v } }); }, { id: `${b.id}-cu`, uid, unit: "W/(m² K)" }),
      numberField("Coolant temperature", cool.T_K == null ? "" : String(+tToDisplay(cool.T_K, u).toFixed(3)), t => { const v = parseT(t, u); if (v == null) return false; setS({ coolant: { ...cool, T_K: v } }); }, { id: `${b.id}-ct`, uid, unit: tLabel(u) })];
    secs.push(inputsSection(pfr ? "Heat" : "Outlet", modeSeg(modes, keys), ...shown(modes, keys).flatMap(k => (k === "coolant" ? coolant() : [fieldFor(k)])),
      h("p", { class: "fa-in-hint" }, pfr ? "Duty: spread evenly along the tube; 0: adiabatic. Coolant: at a constant temperature, through the tube wall (U on its inner area)." : "Duty 0: an adiabatic reactor. The duty includes the heat of the reactions."),
      ...(pfr ? [P("P_kPa", "Inlet pressure"), h("p", { class: "fa-in-hint" }, "Empty: the feed's pressure.")] : [
        spec.P_kPa != null ? P("P_kPa", "Outlet pressure") : P("dP_kPa", "Pressure drop"),
        h("button", { type: "button", class: "fa-mini", "data-fk": `fs-pmode-${b.id}`, on: { click: () => setS(spec.P_kPa != null ? { P_kPa: null } : { dP_kPa: null, P_kPa: 101.325 }) } },
          spec.P_kPa != null ? "Give a pressure drop instead" : "Give the outlet pressure instead"),
        h("p", { class: "fa-in-hint" }, "Empty pressure drop: none.")])));
  }
  // proposal 0013: the heater's optional sizing, the two-stream exchanger, the valve, the pump, energy streams
  if (b.type === "heater") secs.push(sizingSection({ b, spec, setS, inputsSection, uid, u, done, rateable: energyOf(fs, b.id)?.role !== "in" }));
  if (b.type === "hx") secs.push(...hxSections({ b, spec, setS, inputsSection, uid, u, T, P, plain, done }));
  if (b.type === "compressor" || b.type === "expander") {
    const up = b.type === "compressor", word = up ? "rise" : "drop", eta = up ? COMPRESSOR_EFFICIENCY : EXPANDER_EFFICIENCY;
    const mode = spec.ratio != null ? "r" : spec.dP_kPa != null ? "dP" : "P";
    secs.push(inputsSection("Pressure and efficiency",
      segRow("Pressure", [["P", "Outlet pressure"], ["dP", `Pressure ${word}`], ["r", "Ratio"]], mode,
        m => setS(m === "P" ? { dP_kPa: null, ratio: null, P_kPa: spec.P_kPa ?? 101.325 } : m === "dP" ? { P_kPa: null, ratio: null, dP_kPa: spec.dP_kPa ?? 100 } : { P_kPa: null, dP_kPa: null, ratio: spec.ratio ?? (up ? 3 : 0.3) }), `fs-pmode-${b.id}`),
      mode === "r" ? plain("ratio", "Pressure ratio", "outlet over inlet", up ? "3" : "0.3") : mode === "dP" ? P("dP_kPa", `Pressure ${word}`) : P("P_kPa", "Outlet pressure"),
      plain("efficiency", "Isentropic efficiency", "0 to 1", `${eta} (typical)`),
      h("p", { class: "fa-in-hint" }, up
        ? `Empty: ${eta * 100} %, the lower of the single-stage compressor efficiencies (75 and 84 %) in NETL's Process Modeling Design Parameters (2019). Give your compressor's own.`
        : `Empty: ${eta * 100} %, the lowest turbine efficiency (a boiler feed pump turbine; its steam turbines: 85 to 93.5 %) in NETL's Process Modeling Design Parameters (2019). Give your expander's own.`)));
  }
  if (b.type === "valve" || b.type === "pump") {
    const word = b.type === "valve" ? "drop" : "rise";
    secs.push(inputsSection("Pressure",
      segRow("Pressure", [["P", "Outlet pressure"], ["dP", `Pressure ${word}`]], spec.dP_kPa != null ? "dP" : "P", m => setS(m === "P" ? { dP_kPa: null, P_kPa: spec.P_kPa ?? 101.325 } : { P_kPa: null, dP_kPa: spec.dP_kPa ?? 100 }), `fs-pmode-${b.id}`),
      spec.dP_kPa != null ? P("dP_kPa", `Pressure ${word}`) : P("P_kPa", "Outlet pressure"),
      b.type === "pump" ? plain("efficiency", "Efficiency", "0 to 1", `${PUMP_EFFICIENCY} (typical)`) : null,
      b.type === "pump" ? h("p", { class: "fa-in-hint" }, `Empty: ${PUMP_EFFICIENCY * 100} %, the low end of the target pump efficiencies of 75 to 85 % (N.C. Cooperative Extension AG-452-6); the U.S. DOE sourcebook gives 35 % to more than 90 %. Give your pump's own.`) : null));
  }
  if (ENERGY_TARGETS.includes(b.type) || ENERGY_SOURCES.includes(b.type)) secs.push(energySection({ fs, b, put, inputsSection, uid, f, set }));
  // inlets: add a feed to an inlet that takes one more stream
  const ins = unitType(b.type).inlets;
  if (ins.length) {
    const open = openInlets(fs).filter(x => x.startsWith(`${b.id}.`));
    const connected = (streamsOf(fs, b.id).in ?? []);
    secs.push(inputsSection("Connections",
      h("p", { class: "fa-in-hint" }, connected.length ? `In: ${connected.join(", ")}.` : "No stream comes in yet."),
      open.length ? h("button", { type: "button", class: "fa-mini", "data-fk": `fs-feed-${b.id}`, on: { click: () => {
        const r = addFeedTo(fs, open[0]); f.sel = { kind: "stream", id: r.stream }; put(r.fs);
      } } }, icon("feed", 14), "Add a feed to this inlet") : null,
      h("p", { class: "fa-in-hint" }, "To connect: drag from an outlet dot (●, where a stream leaves a block) to an inlet ring (○ on the left of a block). The rings that can take the stream light up while you drag. A recycle is the same: drag a later block's outlet back to an earlier block, usually a mixer.")));
  }
  if (feed) { secs.push(streamActions); return secs; }
  secs.push(inputsSection("Block", h("div", { class: "fa-in-actions" }, back,
    h("button", { type: "button", class: "fa-mini", "data-fk": `fs-del-${b.id}`, on: { click: () => deleteSelected(state, set, ui) } }, icon("trash", 14), `Delete ${blockName(b)}`))));
  return secs;
}

const UTIL_KINDS = [["", "No sizing"], ["steam", "Steam (condensing)"], ["water", "Water"], ["fluid-T", "Fluid at a constant T"], ["fluid", "Fluid, inlet and outlet"], ["electric", "Electric"]];
const ARRS = [["counterflow", "Counterflow"], ["cocurrent", "Cocurrent"], ["shell-and-tube", "Shell and tube"], ["crossflow-unmixed", "Crossflow"]];

function selectField(label, options, current, onPick, fk, uid) {
  const id = `fa-fs-${fk}-${uid}`;
  return h("label", { class: "fa-field fa-field-stack", for: id }, h("span", {}, label),
    h("select", { id, "data-fk": fk, on: { change: ev => onPick(ev.target.value) } }, ...options.map(([v, t]) => h("option", { value: v, selected: v === current }, t))));
}

/** U for a block's sizing: none, a service of Table 2.2 (low end) or the person's own value. */
function uFields(U, onU, uid, id, { optional = true } = {}) {
  const src = U == null ? "" : U.value != null ? "value" : "service";
  return [
    selectField("U", [...(optional ? [["", "No U (no area)"]] : []), ["service", "A service (Lienhard and Lienhard, Table 2.2, low end)"], ["value", "Your own"]], src,
      v => onU(v === "" ? null : v === "value" ? { value: 500 } : { service: "steam-water-oil" }), `${id}-usrc`, uid),
    src === "service" ? selectField("Service", HEAT_TRANSFER.services.rows.map(r => [r.id, `${r.label}: ${r.bound ?? `${r.U[0]}-${r.U[1]}`} W/(m² K)`]), U.service,
      v => onU({ service: v }), `${id}-usvc`, uid) : null,
    src === "value" ? numberField("U", String(U.value), t => { const v = num(t); if (!(v > 0)) return false; onU({ value: v }); }, { id: `${id}-uval`, uid, unit: "W/(m² K)" }) : null,
  ];
}

/** Rating (flowsheet-logic.js ratingPatch): back to the design that was rated. */
function backToDesign(spec, setS, id) {
  return h("button", { type: "button", class: "fa-mini", "data-fk": `fs-design-${id}`, on: { click: () => setS(designPatch(spec)) } },
    icon("undo", 14), spec.design ? "Back to the design" : "Design instead");
}

/** The "Rate this exchanger" button of a designed block, or why it cannot be rated yet. */
function rateButton(type, spec, setS, done, id) {
  const patch = ratingPatch(type, spec, done);
  if (!patch) return h("p", { class: "fa-in-hint" }, `Rating keeps the area and U that the design gives: ${type === "hx" ? "give U" : "choose a utility (not electric) and U"}, and let the flowsheet solve first.`);
  return h("button", { type: "button", class: "fa-mini", "data-fk": `fs-rate-${id}`,
    title: "Keep this area and U as the exchanger's specification: the outlets then follow from them",
    on: { click: () => setS(patch) } }, icon("hx", 14), `Rate this exchanger: keep ${fmtShort(patch.A_m2, 4)} m² and U = ${fmtShort(patch.U?.value ?? patch.sizing.U.value, 4)} W/(m² K)`);
}

/** The heater's optional sizing: a utility and U give the area and the utility's consumption (not a specification). */
function sizingSection({ b, spec, setS, inputsSection, uid, u, done, rateable }) {
  const rating = spec.A_m2 != null;
  const z = spec.sizing ?? null, ut = z?.utility ?? null;
  const kind = !ut ? "" : ut.kind === "fluid" && ut.T_K != null ? "fluid-T" : ut.kind;
  const putZ = patch => setS({ sizing: patch == null ? null : { ...(z ?? {}), ...patch } });
  const putU = patch => putZ({ utility: { ...ut, ...patch } });
  const tf = (key, label) => numberField(label, ut?.[key] == null ? "" : String(+tToDisplay(ut[key], u).toFixed(3)), t => { const v = parseT(t, u); if (v == null) return false; putU({ [key]: v }); }, { id: `${b.id}-sz-${key}`, uid, unit: tLabel(u) });
  const pf = (key, label) => numberField(label, ut?.[key] == null ? "" : fmtShort(pToDisplay(ut[key], u), 6), t => { const v = parseP(t, u); if (v == null) return false; putU({ [key]: v }); }, { id: `${b.id}-sz-${key}`, uid, unit: u.P });
  const DEF = { steam: { kind: "steam", P_kPa: 300 }, water: { kind: "water", T_in_K: 303.15, T_out_K: 313.15 }, "fluid-T": { kind: "fluid", T_K: 423.15 },
    fluid: { kind: "fluid", T_in_K: 473.15, T_out_K: 423.15, cp_J_kgK: 2000 }, electric: { kind: "electric" } };
  return inputsSection(rating ? "Sizing (kept from the design)" : "Sizing (optional)",
    h("p", { class: "fa-in-hint" }, rating ? "The utility, its flow and U of the design. The utility heats when it enters hotter than the stream, else it cools."
      : "A utility and U give the area and the utility's flow; the outlet stays as specified."),
    rating ? h("p", { class: "fa-in-hint" }, `Utility: ${UTIL_KINDS.find(([k]) => k === kind)?.[1] ?? "none"}.`)
      : selectField("Utility", UTIL_KINDS, kind, v => putZ(v ? { utility: DEF[v], ...(v === "electric" ? {} : { U: z?.U ?? { service: "steam-water-oil" } }) } : null), `${b.id}-sz-kind`, uid),
    kind === "steam" ? pf("P_kPa", "Steam pressure") : null,
    kind === "water" || kind === "fluid" ? tf("T_in_K", "Utility inlet") : null,
    (kind === "water" || kind === "fluid") && !rating ? tf("T_out_K", "Utility outlet") : null,
    (kind === "water" || kind === "fluid") && rating ? numberField("Utility flow", ut.flow_kg_h == null ? "" : String(ut.flow_kg_h), t => { const v = num(t); if (!(v > 0)) return false; putU({ flow_kg_h: v }); }, { id: `${b.id}-sz-flow`, uid, unit: "kg/h" }) : null,
    kind === "fluid-T" ? tf("T_K", "Utility temperature") : null,
    kind === "fluid" ? numberField("Utility heat capacity", String(ut.cp_J_kgK), t => { const v = num(t); if (!(v > 0)) return false; putU({ cp_J_kgK: v }); }, { id: `${b.id}-sz-cp`, uid, unit: "J/(kg K)" }) : null,
    ...(kind && kind !== "electric" ? [...uFields(z.U, U => putZ({ U }), uid, `${b.id}-sz`, { optional: false }),
      selectField("Arrangement", ARRS, z.arrangement ?? "counterflow", v => putZ({ arrangement: v }), `${b.id}-sz-arr`, uid)] : []),
    !rating && rateable && kind ? rateButton("heater", spec, setS, done, b.id) : null);
}

/** The two-stream exchanger: one specification, pressure drops, and U (optional) for the area. */
function hxSections({ b, spec, setS, inputsSection, uid, u, T, P, plain, done }) {
  if (spec.A_m2 != null) {
    return [
      inputsSection("Rating",
        plain("A_m2", "Area of the exchanger", "m²"),
        h("p", { class: "fa-in-hint" }, "The area and U of the design are kept; both outlets follow from them. Change the area or U to rate another exchanger."),
        backToDesign(spec, setS, b.id),
        P("dP_hot_kPa", "Hot side pressure drop"), P("dP_cold_kPa", "Cold side pressure drop")),
      inputsSection("U and arrangement (kept from the design)",
        ...uFields(spec.U, U => setS({ U }), uid, `${b.id}-hx`, { optional: false }),
        selectField("Arrangement", ARRS, spec.arrangement ?? "counterflow", v => setS({ arrangement: v }), `${b.id}-hx-arr`, uid)),
    ];
  }
  const KINDS = [["T_hot_out_K", "Hot T out"], ["T_cold_out_K", "Cold T out"], ["VF_hot_out", "Hot VF"], ["VF_cold_out", "Cold VF"], ["duty_kW", "Duty"], ["dTmin_K", "Min ΔT"]];
  const cur = KINDS.find(([k]) => spec[k] != null)?.[0] ?? null;
  return [
    inputsSection("Specification",
      segRow("Specification", KINDS, cur, k => setS(Object.fromEntries(KINDS.map(([x]) => [x, x === k ? spec[x] ?? { T_hot_out_K: 320, T_cold_out_K: 330, VF_hot_out: 0, VF_cold_out: 1, duty_kW: 100, dTmin_K: 10 }[x] : null]))), `fs-hxspec-${b.id}`),
      cur === "T_hot_out_K" || cur === "T_cold_out_K" ? T(cur, cur === "T_hot_out_K" ? "Hot outlet temperature" : "Cold outlet temperature")
        : cur === "duty_kW" ? plain("duty_kW", "Duty", "kW", "heat exchanged") : cur === "dTmin_K" ? plain("dTmin_K", "Minimum approach", "K")
        : cur ? plain(cur, cur === "VF_hot_out" ? "Hot outlet vapour fraction" : "Cold outlet vapour fraction", "mol/mol", "0 to 1") : h("p", { class: "fa-in-hint" }, "Choose one; the other outlet follows from the energy balance."),
      P("dP_hot_kPa", "Hot side pressure drop"), P("dP_cold_kPa", "Cold side pressure drop")),
    inputsSection("Area (optional)",
      ...uFields(spec.U, U => setS({ U }), uid, `${b.id}-hx`),
      selectField("Arrangement", ARRS, spec.arrangement ?? "counterflow", v => setS({ arrangement: v }), `${b.id}-hx-arr`, uid),
      h("p", { class: "fa-in-hint" }, "Each side's temperature follows its own curve, in zones; a temperature cross is an error."),
      cur ? rateButton("hx", spec, setS, done, b.id) : null),
  ];
}

/** The form of a selected energy stream: an energy feed (its duty and the block it goes to), the heat of one block into
 *  another, or a block's own energy stream (its duty, which can be taken out of the drawing). Null when it is gone. */
function energyInputs({ fs, f, put, set, inputsSection, uid, back }) {
  const tryPut = fn => { try { put(fn()); } catch (e) { f.note = e.message; set({}); } };
  const q = (fs.energyStreams ?? []).find(x => x.id === f.sel.id);
  const del = (label, fn) => h("button", { type: "button", class: "fa-mini", "data-fk": "fs-qdelete", on: { click: fn } }, icon("trash", 14), label);
  if (q && !q.from) {
    const targets = [...(q.to ? [q.to] : []), ...fs.blocks.filter(b => ENERGY_TARGETS.includes(b.type) && !energyOf(fs, b.id)).map(b => b.id)];
    return [back, inputsSection(`Energy feed ${q.id}`,
      h("p", { class: "fa-in-hint" }, "A given duty into a heater/cooler or a flash drum: the block calculates its outlet from it. + heat in, − heat out."),
      numberField("Duty", String(q.duty_kW ?? 0), t => { const v = num(t); if (v == null) return false; put(setEnergyDuty(fs, q.id, v)); }, { id: `${q.id}-duty`, uid, unit: "kW", title: "+ heat into the block, − heat out" }),
      selectField("Goes to", [["", "Not connected"], ...targets.map(t => [t, t])], q.to ?? "", v => tryPut(() => (v ? connectEnergyFeed(fs, q.id, v) : disconnectEnergy(fs, q.id))), `${q.id}-to`, uid),
      h("p", { class: "fa-in-hint" }, q.to ? `Drag it to move it; disconnect it here, and ${q.to} needs its own specification again.` : "Drag it onto a heater/cooler or a flash drum, or choose one here."),
      del(`Delete ${q.id}`, () => { f.sel = null; f.note = `Energy feed ${q.id} deleted${q.to ? `: ${q.to} needs its own specification again` : ""}.`; put(removeEnergy(fs, q.id)); }))];
  }
  if (q) {
    return [back, inputsSection(`Energy stream ${q.id}`,
      h("p", { class: "fa-in-hint" }, `The heat that ${q.from} gives up goes into ${q.to}; ${q.to} calculates its outlet from it.`),
      del(`Remove ${q.id}`, () => { f.sel = null; f.note = `${q.id} removed: ${q.to} needs its own specification again.`; put(removeEnergy(fs, q.id)); }))];
  }
  const b = f.sel.block && fs.blocks.find(x => x.id === f.sel.block);
  if (!b || b.energy === false) return null;
  const work = unitType(b.type).energy === "work";
  return [back, inputsSection(`${work ? "Work" : "Energy"} stream ${f.sel.id}`,
    h("p", { class: "fa-in-hint" }, `The ${work ? "power" : "duty"} of ${blockName(b)}, calculated from its specification (+ into the block, − out).`),
    work ? null : h("p", { class: "fa-in-hint" }, "Taken out of the drawing, the block still calculates its duty: it stays in its results and in the energy balance."),
    work ? null : del("Take it out of the drawing", () => { f.sel = null; put(showEnergy(fs, b.id, false)); }),
    h("button", { type: "button", class: "fa-mini", "data-fk": "fs-qblock", on: { click: () => { f.sel = { kind: "block", id: b.id }; set({}); } } }, icon("chevronUp", 14), `Go to ${blockName(b)}`))];
}

/** A block's energy stream: an energy feed (a given duty), or its heat into another block; or a way to add one. */
function energySection({ fs, b, put, inputsSection, uid, f, set }) {
  const conn = energyOf(fs, b.id);
  const tryPut = fn => { try { put(fn()); } catch (e) { f.note = e.message; set({}); } };
  if (conn) {
    const q = conn.stream;
    return inputsSection(`Energy stream ${q.id}`,
      conn.role === "in" && !q.from
        ? numberField("Duty of the energy feed", String(q.duty_kW ?? 0), t => { const v = num(t); if (v == null || v === undefined) return false; put(setEnergyDuty(fs, q.id, v)); }, { id: `${b.id}-qfeed`, uid, unit: "kW", title: "+ heat into the block, - heat out" })
        : h("p", { class: "fa-in-hint" }, conn.role === "in" ? `The heat that ${q.from} gives up comes in here.` : `Its heat goes to ${q.to}.`),
      h("p", { class: "fa-in-hint" }, conn.role === "in" ? "The block takes its duty from the stream: give its outlet pressure only." : "The block's duty is calculated from its outlet; the other block takes it."),
      h("button", { type: "button", class: "fa-mini", "data-fk": `fs-qrm-${b.id}`, on: { click: () => put(removeEnergy(fs, q.id)) } }, icon("trash", 14), `Remove ${q.id}`));
  }
  const targets = ENERGY_SOURCES.includes(b.type) ? energyTargets(fs, b.id) : [];
  // energy feeds on the drawing that are not connected yet
  const loose = ENERGY_TARGETS.includes(b.type) ? (fs.energyStreams ?? []).filter(q => !q.from && !q.to).map(q => q.id) : [];
  return inputsSection("Energy stream",
    b.energy === false ? h("p", { class: "fa-in-hint" }, "Its energy stream is not drawn; its duty is still calculated (in the results and the energy balance).") : null,
    b.energy === false ? h("button", { type: "button", class: "fa-mini", "data-fk": `fs-qshow-${b.id}`, on: { click: () => put(showEnergy(fs, b.id, true)) } }, icon("energy", 14), "Show its energy stream") : null,
    loose.length ? selectField("Connect an energy feed", [["", "Choose an energy feed…"], ...loose.map(q => [q, q])], "", v => { if (v) tryPut(() => connectEnergyFeed(fs, v, b.id)); }, `${b.id}-qloose`, uid) : null,
    ENERGY_TARGETS.includes(b.type) ? h("button", { type: "button", class: "fa-mini", "data-fk": `fs-qfeed-${b.id}`,
      on: { click: () => tryPut(() => addEnergyFeed(fs, b.id, b.spec?.duty_kW ?? 100).fs) } }, icon("plus", 14), "Add an energy feed (a given duty)") : null,
    targets.length ? selectField("Send its heat to", [["", "Choose a heater or drum…"], ...targets.map(t => [t, t])], "", v => { if (v) tryPut(() => connectEnergy(fs, b.id, v).fs); }, `${b.id}-qto`, uid) : null,
    h("p", { class: "fa-in-hint" }, "Given an energy stream, a block calculates its outlet from it; given its outlet, its duty goes out as an energy stream."));
}

/** What the property method cannot do with the chosen components, as one message ("" when it can use them all). */
/** One click to the method a mixture with light gases needs: Peng-Robinson for both phases. */
function usePR(state, set) {
  return h("button", { type: "button", class: "fa-mini", "data-fk": "fs-use-pr", title: "Peng–Robinson for every block and stream (Method page)",
    on: { click: () => set({ flowsheet: { ...state.flowsheet, thermo: { ...state.flowsheet.thermo, model: "PR", vapour: "ideal" } } }) } }, icon("cubic", 15), "Use Peng–Robinson");
}

function methodProblem(ids, thermo) {
  const eos = ["PR", "SRK"].includes(thermo.model);
  const list = xs => `${xs.map(nameOf).join(", ")} ha${xs.length === 1 ? "s" : "ve"}`;
  const them = xs => (xs.length === 1 ? "it" : "them");
  // an inert solid passes every method (src/equilibrium/inert-solids.js): it takes no part in the phase equilibrium
  const fluid = ids.filter(c => !byId().get(c)?.solid);
  const gases = eos ? [] : fluid.filter(c => !byId().get(c)?.activity);
  if (gases.length) return `${gases.map(nameOf).join(", ").replace(/, ([^,]*)$/, " and $1")} ${gases.length === 1 ? "is a light gas" : "are light gases"}: an activity model (${modelName(thermo.model)}) describes liquids, so it cannot calculate ${them(gases)}. Use Peng–Robinson or SRK, as gas-phase reactors and synthesis loops are simulated.`;
  const noRq = thermo.model === "UNIQUAC" ? fluid.filter(c => !byId().get(c)?.uniquac) : [];
  if (noRq.length) return `${list(noRq)} no UNIQUAC r and q (no open data yet), so UNIQUAC cannot use ${them(noRq)}: choose NRTL in the Method page.`;
  const noGroups = thermo.model === "MOD-UNIFAC-2" ? fluid.filter(c => !byId().get(c)?.modUnifac) : [];
  if (noGroups.length) return `${list(noGroups)} no Mod. UNIFAC 2.0 groups, so Mod. UNIFAC 2.0 cannot use ${them(noGroups)}: choose NRTL in the Method page.`;
  return "";
}

function setupSections({ state, set, ui, uid, inputsSection, st }) {
  const f = ensureUi(ui), fs = state.flowsheet;
  const all = listComponents({ userData: drawing });
  const eos = ["PR", "SRK"].includes(fs.thermo.model);
  const changeComps = ids => { const r = setComponents(fs, ids); f.note = r.note; set({ flowsheet: r.fs }); };
  // type a name, formula or CAS number (component-picker.js); every component can be chosen, and the Components and
  // Method pages say when the property method cannot use one (methodProblem)
  const add = componentPicker({
    id: `fa-fs-addcomp-${uid}`, fk: "fs-addcomp", label: "Add a component", clearOnPick: true,
    components: all.filter(c => !fs.components.includes(c.id)),
    status: c => (eos || c.activity ? {} : { note: "gas: needs Peng–Robinson or SRK" }),
    placeholder: fs.components.length ? "Add: name, formula, CAS…" : "Choose: name, formula, CAS…",
    onPick: id => { if (id) changeComps([...fs.components, id]); },
  });
  const chips = fs.components.map(c => h("li", { class: "fa-chip" }, h("span", {}, nameOf(c)),
    h("button", { type: "button", class: "fa-chip-x", "aria-label": `Remove ${nameOf(c)}`, "data-fk": `fs-rm-${c}`, on: { click: () => changeComps(fs.components.filter(x => x !== c)) } }, "×")));
  const setThermo = patch => {
    const thermo = { ...fs.thermo, ...patch };
    f.note = "";
    set({ flowsheet: { ...fs, thermo } });
  };
  if (f.setup === "reactions") return reactionSections({ state, fs, f, set, uid, inputsSection });
  if (f.setup === "method") {
    // the Method page: the property method and the recycle solver
    return [methodSection({ state, set, fs, eos, setThermo, inputsSection, uid, problem: methodProblem(fs.components, fs.thermo) }),
      ...solverSection({ fs, set, uid, inputsSection })];
  }
  const secs = [];

  // the components and, once there are blocks, what is missing; no hints (the maintainer, 2026-10-22: "do not write
  // anything, people would know. only if there are errors"): the method is in the toolbar, the blocks in the palette
  secs.push(inputsSection("1. Components",
    chips.length ? h("ol", { class: "fa-chips", "aria-label": "Components of the flowsheet" }, ...chips) : null,
    methodProblem(fs.components, fs.thermo) ? warning(methodProblem(fs.components, fs.thermo), { attrs: { role: "alert", "data-fk": "fs-comp-problem" }, details: [usePR(state, set)] }) : null,
    h("div", { class: "fa-add" }, add)));
  const units = fs.blocks.filter(b => b.type !== "product");
  if (fs.components.length && units.length) secs.push(inputsSection("Flowsheet status",
        h("div", {}, st ? h("div", { class: `fa-dof ${st.ready ? "is-ok" : "is-bad"}`, role: "status" }, st.message) : null,
          h("ul", { class: "fa-dof-list" }, ...(st ? [...st.structure.map(p => h("li", {}, p.message)),
            ...Object.entries(st.blocks).filter(([, b]) => !b.ok).map(([id, b]) => h("li", {}, h("button", { type: "button", class: "fa-link", "data-fk": `fs-go-${id}`,
              on: { click: () => { f.sel = { kind: "block", id }; set({}); } } }, feedStreamOf(fs, id) ? streamName(feedStreamOf(fs, id)) : blockName(fs.blocks.find(x => x.id === id)) ?? id), ": ", b.message.replace(/^[^:]+: /, "")))] : [])))));
  return secs;
}

/** A reaction as words: reactants → products, each with its coefficient (1 is left out). */
function equation(r) {
  const side = sign => Object.entries(r.stoichiometry ?? {}).filter(([, v]) => Math.sign(v) === sign)
    .map(([c, v]) => `${Math.abs(v) === 1 ? "" : `${fmtShort(Math.abs(v), 4)} `}${nameOf(c)}`);
  const a = side(-1), b = side(1);
  return a.length || b.length ? `${a.join(" + ") || "…"} → ${b.join(" + ") || "…"}` : "no coefficients yet";
}

/** What CHEPTA makes of a reaction: its check (balance), and ΔrH° and K at 298.15 K where the formation data allow. */
function reactionCheck(r) {
  let c;
  try { c = checkReaction(r, { userData: drawing }); } catch (e) { return { ok: false, message: e.message.replace(/^[^:]+: /, "") }; }
  let props = null, missing = null;
  try { props = reactionProperties(c, 298.15, { userData: drawing }); } catch (e) { missing = e.message.replace(/^[^:]+: /, ""); }
  return { ok: true, checked: c, props, missing };
}

/** The Reactions page (proposal 0010, step 7): the flowsheet's reactions, each with its check, heat and K. */
function reactionSections({ state, fs, f, set, uid, inputsSection }) {
  const put = (next, note = "") => { f.note = note; set({ flowsheet: next }); };
  const list = fs.reactions ?? [];
  const intro = inputsSection("3. Reactions",
    h("p", { class: "fa-in-hint" }, "The reactions of the process, written once; each conversion reactor uses those you choose in it. CHEPTA ships components, not reactions: write your own, or import a list saved from another project."),
    !fs.components.length ? h("p", { class: "fa-in-hint" }, "Choose the components first: a reaction is written with them.") : null,
    h("div", { class: "fa-in-actions" },
      h("button", { type: "button", class: "fa-mini", "data-fk": "fs-rx-add", disabled: !fs.components.length,
        on: { click: () => { const r = addReaction(fs); f.open = r.id; put(r.fs); } } }, icon("plus", 14), "Add a reaction"),
      h("button", { type: "button", class: "fa-mini", "data-fk": "fs-rx-export", disabled: !list.length, title: "Save the reactions as a file, to use them in another project",
        on: { click: () => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(reactionsFile(fs), null, 1)], { type: "application/json" }));
          const a = h("a", { href: url, download: `${(state.title || "flowsheet").replace(/[\\/:*?"<>|]+/g, "-")} - reactions.json`, style: "display:none" });
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        } } }, icon("download", 14), "Export reactions"),
      h("label", { class: "fa-mini", "data-fk": "fs-rx-import", title: "Add the reactions of a file saved with Export reactions" }, icon("file", 14), "Import reactions",
        h("input", { type: "file", accept: ".json,application/json", style: "display:none", on: { change: async ev => {
          const file = ev.target.files?.[0]; if (!file) return;
          try { const r = importReactions(fs, JSON.parse(await file.text())); put(r.fs, r.note); }
          catch (e) { f.note = `The reactions could not be imported: ${e.message}`; set({}); }
        } } }))));
  // the global reactions (the maintainer, 2026-10-28): saved from either the Flowsheet or the Reactor workspace, added
  // to this one with a click
  const shared = state.sharedReactions ?? [];
  const secs = [intro];
  if (shared.length) secs.push(inputsSection("Global reactions",
    h("p", { class: "fa-in-hint" }, "Saved with \"Save global\" in the Flowsheet or the Reactor workspace; add one here to use it."),
    ...shared.map((g, k) => h("div", { class: "fa-in-actions" }, h("span", {}, h("b", {}, g.name || g.id), " ", h("span", { class: "fa-in-hint" }, equation(g))),
      hasShared(fs, g) ? h("span", { class: "fa-in-hint" }, "in use here")
        : h("button", { type: "button", class: "fa-mini", "data-fk": `fs-rx-addglobal-${k}`, disabled: !fs.components.length,
          on: { click: () => { try { const r = importReactions(fs, [g]); put(r.fs, r.note); } catch (e) { f.note = e.message; set({}); } } } }, icon("plus", 14), "Add here"),
      h("button", { type: "button", class: "fa-mini", "data-fk": `fs-rx-dropglobal-${k}`, title: "Remove it from the global list (the reactions already added stay)",
        on: { click: () => set({ sharedReactions: shared.filter((_, j) => j !== k) }) } }, icon("trash", 14))))));
  for (const r of list) {
    const chk = reactionCheck(r), coef = r.stoichiometry ?? {};
    const users = fs.blocks.filter(b => REACTION_USERS.includes(b.type) && (b.spec?.reactions ?? []).some(e => (typeof e === "string" ? e : e.reaction) === r.id)).map(blockName);
    const nameInp = h("input", { type: "text", value: r.name ?? "", placeholder: r.id, maxlength: 60, "data-fk": `fs-rx-name-${r.id}`, "aria-label": `Name of reaction ${r.id}`,
      on: { change: ev => put(setReaction(fs, r.id, { name: ev.target.value.trim() || null })) } });
    const chips = side => Object.entries(coef).filter(([, v]) => Math.sign(v) === side).map(([c, v]) =>
      h("span", { class: "fa-rx-chip" }, `${Math.abs(v) === 1 ? "" : `${fmtShort(Math.abs(v), 4)} `}${nameOf(c)}`));
    const status = !Object.keys(coef).length ? h("div", { class: "fa-dof is-bad", role: "status" }, "Give the coefficients below: negative for reactants, positive for products.")
      : chk.ok ? h("div", { class: "fa-dof is-ok", role: "status", "data-fk": `fs-rx-ok-${r.id}` }, icon("check", 14), chk.checked.balance.text.replace(/^balanced: /, "Balanced: "))
        : h("div", { class: "fa-dof is-bad", role: "status", "data-fk": `fs-rx-bad-${r.id}` }, chk.message);
    const p = chk.props;
    const heat = !chk.ok ? null : p ? h("div", { class: "fa-rx-props", "data-fk": `fs-rx-props-${r.id}` },
      h("div", {}, h("b", {}, `ΔrH° = ${fmtShort(p.dH_J_mol / 1000, 5)} kJ/mol`), `, ${p.dH_J_mol < 0 ? "exothermic" : "endothermic"}`),
      h("div", {}, `ΔrG° = ${fmtShort(p.dG_J_mol / 1000, 5)} kJ/mol, K = ${fmtShort(p.K, 4)}`),
      h("div", { class: "fa-in-hint" }, `At 298.15 K; standard state: ${p.standardState}; from the components' formation data.`))
      : warning(`No heat of reaction from formation data: ${chk.missing} Give it below, with its source, to use this reaction in a reactor.`, { attrs: { role: "note" } });
    const given = r.heatOfReaction ?? {};
    const setGiven = patch => {
      const next = { ...given, ...patch };
      for (const k of Object.keys(next)) if (next[k] == null || next[k] === "") delete next[k];
      put(setReaction(fs, r.id, { heatOfReaction: Object.keys(next).length ? next : null }));
    };
    secs.push(inputsSection(`Reaction ${r.name || r.id}`,
      h("label", { class: "fa-field fa-field-stack" }, h("span", {}, "Name"), nameInp),
      h("div", { class: "fa-rx-eq", "aria-label": `Equation: ${equation(r)}` }, ...chips(-1), h("span", { class: "fa-rx-arrow" }, "→"), ...chips(1)),
      status,
      segRow("Phase", [["vapour", "Vapour"], ["liquid", "Liquid"]], r.phase === "liquid" ? "liquid" : "vapour", v => put(setReaction(fs, r.id, { phase: v })), `fs-rx-phase-${r.id}`),
      h("p", { class: "fa-in-hint" }, r.phase === "liquid" ? "Standard state: each pure liquid; K = Π (γ x)^ν." : "Standard state: each ideal gas at 100 kPa; K = Π (f / P°)^ν."),
      h("div", { class: "fa-rx-coefs", role: "group", "aria-label": "Coefficients" },
        h("div", { class: "fa-in-hint" }, "Coefficients (− reactant, + product, empty: not in the reaction)"),
        ...fs.components.map(c => numberField(nameOf(c), coef[c] == null ? "" : String(coef[c]), t => {
          const v = num(t); if (v === undefined) return false;
          put(setReaction(fs, r.id, { stoichiometry: { [c]: v } }));
        }, { id: `rx-${r.id}-${c}`, uid, placeholder: "–" }))),
      heat,
      h("details", { class: "fa-rx-given", ...(given.dH_J_mol != null || (chk.ok && !p) ? { open: true } : {}) },
        h("summary", {}, "Heat of reaction you give (used only where a component has no open enthalpy of formation)"),
        numberField("ΔrH at 298.15 K", given.dH_J_mol == null ? "" : String(given.dH_J_mol / 1000), t => {
          const v = num(t); if (v === undefined) return false; setGiven({ dH_J_mol: v == null ? null : v * 1000 });
        }, { id: `rx-dh-${r.id}`, uid, unit: "kJ/mol", placeholder: "– exothermic" }),
        h("label", { class: "fa-field fa-field-stack" }, h("span", {}, "Its source"),
          h("input", { type: "text", value: given.source ?? "", placeholder: "article, table, page", "data-fk": `fs-rx-src-${r.id}`,
            on: { change: ev => setGiven({ source: ev.target.value.trim() || null }) } }))),
      h("details", { class: "fa-rx-given", ...(r.rate ? { open: true } : {}) },
        h("summary", {}, r.rate ? `Kinetics: ${FORM_LABEL[r.rate.form] ?? r.rate.form}` : "Kinetics (for the CSTR and the plug-flow reactor)"),
        kineticsEditor({ r, uid, numberField, segRow, nameOf, selectField: (label, options, current, onPick, fk) => selectField(label, options, current, onPick, fk, uid),
          setRate: (rate, extra) => put(setReaction(fs, r.id, { rate, ...(extra ?? {}) })) })),
      h("p", { class: "fa-in-hint" }, users.length ? `Used by ${users.join(", ")}.` : "Not used by a reactor yet: choose it in a reactor."),
      h("div", { class: "fa-in-actions" },
        h("button", { type: "button", class: "fa-mini", "data-fk": `fs-rx-global-${r.id}`, disabled: !chk.ok,
          title: "Save it to the global list: the Flowsheet and the Reactor workspace can then add it without writing it again",
          on: { click: () => { f.note = `${r.name || r.id} is saved global: add it on the Reactions page of the other workspace.`; set({ sharedReactions: saveShared(shared, r) }); } } },
          icon("download", 14), shared.some(g => (g.name || g.id) === (r.name || r.id)) ? "Save global again" : "Save global"),
        h("button", { type: "button", class: "fa-mini", "data-fk": `fs-rx-del-${r.id}`,
        on: { click: () => { const x = removeReaction(fs, r.id); put(x.fs, x.note); } } }, icon("trash", 14), `Delete ${r.name || r.id}`))));
  }
  return secs;
}

/** The property method of the whole flowsheet: an activity model with a vapour model, or an equation of state. */
function methodSection({ state, set, fs, eos, setThermo, inputsSection, uid, problem }) {
  // is this the recommended method for these components? (docs/METHOD_SELECTION.md)
  const advice = methodAdvice({ ids: fs.components, names: fs.components.map(nameOf), formulas: fs.components.map(id => byId().get(id)?.formula),
    model: fs.thermo.model, eos });
  return inputsSection("2. Method",
    h("p", { class: "fa-in-hint" }, "One property method for every block and stream."),
    ...advice.map(a => warning(a, { attrs: { role: "note", "data-fk": "fs-method-advice" } })),
    // the same drop-down lists as the workbench's Model group (model-picker.js)
    modelPicker({ model: fs.thermo.model, vapour: fs.thermo.vapour ?? "ideal", id: `fs-model-${uid}`, fk: "fs-model",
      onChange: p => setThermo(p.model === fs.thermo.model ? { vapour: p.vapour } : { model: p.model, vapour: p.vapour }) }),
    problem ? warning(problem, { attrs: { role: "alert", "data-fk": "fs-method-problem" }, details: [usePR(state, set)] }) : null,
    // the pair parameter sets: the same choice as the diagrams and the flash
    PAIR_MODELS.includes(fs.thermo.model) ? h("p", { class: "fa-in-hint", "data-fk": "fs-sets" },
      `Pair parameter sets: ${setsLabel(state)}. The rule for every pair is in the Library; a pair's own set is chosen in the Inputs panel of the phase-equilibrium diagrams. The flowsheet uses the same choice.`) : null,
    // on the roadmap, for other kinds of mixture: locked, with what each is for (other models: in the lists above)
    h("div", { class: "fa-fs-later", role: "note" },
      h("div", { class: "fa-in-hint" }, "Not available yet:"),
      ...[["Ions (electrolytes)", FUTURE_MODELS.electrolyte], ["Polymers", FUTURE_MODELS.polymer]]
        .map(([cap, list]) => h("div", { class: "fa-fs-model" }, h("span", { class: "fa-in-hint" }, cap),
          h("div", { class: "fa-locked-row" }, ...list.map(m => h("span", { class: "fa-locked-chip", title: m.note, "aria-disabled": "true", "data-fk": `fs-later-${m.id}` }, icon("lock", 11), m.label)))))));
}

/** The solver settings of the flowsheet: method, tolerance, maximum iterations. */
function solverSection({ fs, set, uid, inputsSection }) {
  const sv = { method: "broyden", tolerance: 1e-8, maxIterations: 50, ...(fs.solver ?? {}) };
  const put = patch => set({ flowsheet: { ...fs, solver: { ...(fs.solver ?? {}), ...patch } } });
  return [inputsSection("Recycle solver",
    h("p", { class: "fa-in-hint" }, "Recycles are solved by tearing them: the solver picks the fewest streams that break every loop (or the ones you mark as tear streams), guesses them (no flow at first), and calculates around the loop until they stop changing."),
    segRow("Method", [["broyden", "Broyden"], ["wegstein", "Wegstein"], ["direct", "Direct substitution"]], sv.method, m => put({ method: m }), "fs-solver-method"),
    h("p", { class: "fa-in-hint" }, sv.method === "broyden" ? "Broyden: a quasi-Newton method that learns how the recycles act on each other. The fastest and most reliable on the flowsheet test suite."
      : sv.method === "wegstein" ? "Wegstein: two plain steps, then each flow is extrapolated from its last two values (bounded). Fast on simple loops; can oscillate when recycles interact."
      : "Direct substitution: the next guess is the last result. Slowest, but it never overshoots."),
    numberField("Tolerance", String(sv.tolerance), t => { const v = num(t); if (!(v > 0 && v < 0.1)) return false; put({ tolerance: v }); },
      { id: "solver-tol", uid, unit: "relative", title: "Converged when every flow and temperature of the tear streams changes by less than this, relative" }),
    numberField("Maximum iterations", String(sv.maxIterations), t => { const v = num(t); if (!(Number.isInteger(v) && v >= 1 && v <= 1000)) return false; put({ maxIterations: v }); },
      { id: "solver-iter", uid }))];
}

/** A Name field for a stream or a block: a label shown instead of its id, which stays. */
function nameField(o, what, onCommit) {
  return h("label", { class: "fa-field fa-field-stack" }, h("span", {}, "Name"),
    h("input", { type: "text", value: o.label ?? "", placeholder: o.id, maxlength: 40, "data-fk": `fs-name-${o.id}`, "aria-label": `Name of ${what}`,
      title: `A name to show instead of ${o.id}; empty shows ${o.id} again`,
      on: { change: ev => onCommit(ev.target.value), keydown: ev => { if (ev.key === "Enter") ev.target.blur(); } } }));
}

function streamSections({ fs, put, sel, f, inputsSection, back, set, badge }) {
  const s = sel, from = s.from.split("."), end = endOf(fs, s.id), feed = feedOf(fs, s.id);
  const opts = ["", ...openInlets(fs, from[0]), ...(end.kind === "unit" ? [s.to] : [])];
  const goes = h("select", { "data-fk": `fs-to-${s.id}`, "aria-label": "Goes to", on: { change: ev => { try { put(connect(fs, s.id, ev.target.value || null)); } catch (e) { f.note = e.message; set({}); } } } },
    ...[...new Set(opts)].map(o => h("option", { value: o, selected: o === (end.kind === "unit" ? s.to : "") }, o ? o.replace(".", " · ") : "Leaves the flowsheet (product)")));
  return [
    inputsSection(`${feed ? "Feed stream" : "Stream"} ${streamName(s)}`,
      h("p", { class: "fa-in-hint" }, feed ? HINT.feed : `From ${blockName(fs.blocks.find(x => x.id === from[0])) ?? from[0]} (${from[1]}).`),
      nameField(s, `stream ${s.id}`, v => put(setStreamLabel(fs, s.id, v))),
      h("label", { class: "fa-field fa-field-stack" }, h("span", {}, "Goes to"), goes),
      end.kind === "unit" && !feed ? h("label", { class: "fa-field" }, h("span", {}, "Tear stream (recycle)"),
        h("input", { type: "checkbox", checked: !!s.tear, "data-fk": `fs-tear-${s.id}`, on: { change: ev => put(setTear(fs, s.id, ev.target.checked)) } })) : null,
      feed ? badge : h("p", { class: "fa-in-hint" }, "The solver chooses the tear stream of a recycle itself; mark one only to choose it.")),
    inputsSection("Stream", h("div", { class: "fa-in-actions" }, back,
      h("button", { type: "button", class: "fa-mini", "data-fk": `fs-delstream-${s.id}`, on: { click: () => {
        const r = deleteStream(fs, s.id); f.note = r.note;
        if (r.fs !== fs) { if (!r.fs.streams.some(x => x.id === s.id)) f.sel = null; put(r.fs); } else set({});
      } } }, icon("trash", 14), `Delete ${streamName(s)}`))),
  ];
}

// ---------------------------------------------------------------------------------------
// Canvas

/** Port positions of a block: inlets on the left, outlets on the right (drum: vapour up, liquid down). */
function ports(fs, b) {
  const [w, hh] = SIZE[b.type] ?? [40, 40];
  const x = b.x ?? 0, y = b.y ?? 0;
  const at = {};
  const spread = (list, side) => list.forEach((sid, k) => { at[sid] = { x: x + side * w / 2, y: y + (k - (list.length - 1) / 2) * 16, dir: [side, 0] }; });
  const st = streamsOf(fs, b.id);
  if (b.type === "product") { for (const sid of st.in ?? []) at[sid] = { x, y, dir: [1, 0] }; return at; }
  if (b.type === "hx") {
    // inlet and outlet ports share their names (hot, cold): placed by direction
    for (const s of fs.streams) {
      const t = s.to.split("."), f = s.from.split(".");
      if (t[0] === b.id) at[s.id] = { x: x - w / 2, y: y + (PORT_DY[t[1]] ?? 0), dir: [-1, 0] };
      if (f[0] === b.id) at[s.id] = { x: x + w / 2, y: y + (PORT_DY[f[1]] ?? 0), dir: [1, 0] };
    }
    return at;
  }
  spread(st.in ?? [], -1);
  if (b.type === "flash") {
    for (const sid of st.vapour ?? []) at[sid] = { x, y: y - hh / 2, dir: [0, -1] };
    for (const sid of st.liquid ?? []) at[sid] = { x, y: y + hh / 2, dir: [0, 1] };
    for (const sid of st.liquid2 ?? []) at[sid] = { x: x + w / 2, y: y + hh / 2 - 10, dir: [1, 0] };
  } else spread(st.out ?? [], 1);
  return at;
}

/** An orthogonal route from s (leaving in s.dir) to e (entering from the left). */
function route(s, e) {
  const a = { x: s.x + 16 * s.dir[0], y: s.y + 16 * s.dir[1] };
  const b = { x: e.x - 16, y: e.y };
  if (b.x >= a.x) { const mx = (a.x + b.x) / 2; return [s, a, { x: mx, y: a.y }, { x: mx, y: b.y }, b, e]; }
  const yb = Math.max(a.y, e.y, s.y) + 70;   // a recycle: back along the bottom
  return [s, a, { x: a.x, y: yb }, { x: b.x, y: yb }, b, e];
}

function shape(type, w, hh) {
  switch (type) {
    case "feed": return svgEl("rect", { x: -w / 2, y: -hh / 2, width: w, height: hh, rx: 13, class: "fs-shape" });
    case "mixer": return svgEl("path", { d: `M${-w / 2} ${-hh / 2} L${w / 2} 0 L${-w / 2} ${hh / 2} Z`, class: "fs-shape" });
    case "splitter": return svgEl("path", { d: `M${w / 2} ${-hh / 2} L${-w / 2} 0 L${w / 2} ${hh / 2} Z`, class: "fs-shape" });
    case "separator": { const g = svgEl("g", {}); g.append(svgEl("rect", { x: -w / 2, y: -hh / 2, width: w, height: hh, rx: 4, class: "fs-shape" }), svgEl("path", { d: `M${-w / 2} ${hh / 2 - 8} L${w / 2} ${-hh / 2 + 8}`, class: "fs-detail" })); return g; }
    case "flash": return svgEl("rect", { x: -w / 2, y: -hh / 2, width: w, height: hh, rx: w / 2, class: "fs-shape" });
    case "heater": { const g = svgEl("g", {}); g.append(svgEl("circle", { r: w / 2, class: "fs-shape" }), svgEl("path", { d: "M-12 4 L-6 -6 L0 6 L6 -6 L12 4", class: "fs-detail" })); return g; }
    // a shell with two tube lines; a bow tie; a circle with its discharge
    case "hx": { const g = svgEl("g", {}); g.append(svgEl("rect", { x: -w / 2, y: -hh / 2, width: w, height: hh, rx: hh / 2, class: "fs-shape" }), svgEl("path", { d: `M${-w / 2 + 8} -11 H${w / 2 - 8} M${-w / 2 + 8} 11 H${w / 2 - 8}`, class: "fs-detail" })); return g; }
    case "valve": return svgEl("path", { d: `M${-w / 2} ${-hh / 2} L${w / 2} ${hh / 2} L${w / 2} ${-hh / 2} L${-w / 2} ${hh / 2} Z`, class: "fs-shape" });
    case "pump": { const g = svgEl("g", {}); g.append(svgEl("circle", { r: w / 2, class: "fs-shape" }), svgEl("path", { d: "M-8 8 L12 0 L-8 -8", class: "fs-detail" })); return g; }
    // a compressor narrows towards its discharge, an expander widens
    case "compressor": return svgEl("path", { d: `M${-w / 2} ${-hh / 2} L${w / 2} ${-hh / 5} L${w / 2} ${hh / 5} L${-w / 2} ${hh / 2} Z`, class: "fs-shape" });
    case "expander": return svgEl("path", { d: `M${-w / 2} ${-hh / 5} L${w / 2} ${-hh / 2} L${w / 2} ${hh / 2} L${-w / 2} ${hh / 5} Z`, class: "fs-shape" });
    // a vessel with its agitator; the yield reactor's blades are a fan of products
    // the equilibrium reactor carries the two half-arrows of a reversible reaction
    // the Gibbs reactor: the minimum of a curve, the lowest Gibbs energy
    case "conversion-reactor": case "equilibrium-reactor": case "gibbs-reactor": case "yield-reactor": {
      const g = svgEl("g", {});
      const d = type === "conversion-reactor" ? `M0 ${-hh / 2 - 6} V8 M-9 4 L9 12 M-9 12 L9 4`
        : type === "equilibrium-reactor" ? "M-11 -3 H11 L6 -8 M11 4 H-11 L-6 9"
          : type === "gibbs-reactor" ? "M-12 -8 Q0 22 12 -8 M-2 7 H2" : `M0 ${-hh / 2 - 6} V6 M0 6 L-10 14 M0 6 L0 16 M0 6 L10 14`;
      g.append(svgEl("rect", { x: -w / 2, y: -hh / 2, width: w, height: hh, rx: 10, class: "fs-shape" }), svgEl("path", { d, class: "fs-detail" }));
      return g;
    }
    // a stirred tank: its shaft and impeller; a tube: packed, with the flow's arrow
    case "cstr": {
      const g = svgEl("g", {});
      g.append(svgEl("rect", { x: -w / 2, y: -hh / 2, width: w, height: hh, rx: 10, class: "fs-shape" }), svgEl("path", { d: `M0 ${-hh / 2 - 6} V10 M-10 10 H10 M-10 6 V14 M10 6 V14`, class: "fs-detail" }));
      return g;
    }
    case "pfr": {
      const g = svgEl("g", {});
      g.append(svgEl("rect", { x: -w / 2, y: -hh / 2, width: w, height: hh, rx: hh / 2, class: "fs-shape" }), svgEl("path", { d: `M${-w / 2 + 12} 0 H${w / 2 - 14} M${w / 2 - 20} -5 L${w / 2 - 14} 0 L${w / 2 - 20} 5`, class: "fs-detail" }));
      return g;
    }
    default: return svgEl("g", {});
  }
}

/** Draw the flowsheet (canvas, results panel and stream table). ctx from app-views renderView. */
export function flowsheetView(ctx) {
  const { state, set, plot, side, below, notes, ui } = ctx;
  enter(state);
  const f = ensureUi(ui), fs = state.flowsheet, u = state.units;
  feedSel(f, fs);
  // nothing written before the components are chosen: the Components page is open in the Inputs panel
  if (!fs.components.length) {
    plot.replaceChildren();
    side.replaceChildren();
    return { data: "Setup: choose the components" };
  }
  const sol = solution(state, ui);
  const res = sol.result;
  if (sol.method) notes.append(warning(sol.error, { title: summaryOf(sol.error), attrs: { role: "alert", "data-fk": "fs-canvas-method" }, open: true,
    details: [usePR(state, set)] }));
  else if (sol.error) notes.append(warning(sol.error, { title: `Not solved: ${summaryOf(sol.error)}`, attrs: { role: "alert" },
    details: [sol.loop ? h("p", { class: "fa-in-hint" }, "The blocks of that recycle are outlined in red. The solver settings are in the Inputs panel (with nothing selected): 4. Recycle solver.") : null] }));
  if (sol.stale) notes.append(warning("The results are not up to date: press Solve.", { attrs: { role: "note" } }));

  // ---- the drawing
  const pos = new Map(fs.blocks.map(b => [b.id, b]));
  // focusable (and kept focused across redraws by its data-fk), so that the keys (Ctrl + Z) reach the workbench after a click
  const wrap = h("div", { class: "fs-wrap", tabindex: -1, "data-fk": "fs-canvas" });
  const xs = fs.blocks.length ? fs.blocks.map(b => b.x ?? 0) : [120], ys = fs.blocks.length ? fs.blocks.map(b => b.y ?? 0) : [160];
  // the view fits the drawing (with room for labels and recycles), at least 520 x 300
  let minX = Math.min(...xs) - 90, maxX = Math.max(...xs) + 110, minY = Math.min(...ys) - 80, maxY = Math.max(...ys) + 120;
  if (maxX - minX < 520) { const c = (maxX + minX) / 2; minX = c - 260; maxX = c + 260; }
  if (maxY - minY < 300) { const c = (maxY + minY) / 2; minY = c - 150; maxY = c + 150; }
  // a fixed scale (one drawing unit = one pixel times the zoom) in a box that scrolls: a larger flowsheet gets
  // scrollbars, not smaller blocks; "Fit" in the toolbar sets the zoom that shows all of it
  const zoom = f.zoom ?? 1;
  const svg = svgEl("svg", { class: "fs-canvas", viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`, role: "group", "aria-label": "Flowsheet drawing",
    width: Math.round((maxX - minX) * zoom), height: Math.round((maxY - minY) * zoom) });
  // Ctrl + mouse wheel zooms
  svg.addEventListener("wheel", ev => {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    f.zoom = Math.min(3, Math.max(0.4, zoom * (ev.deltaY < 0 ? 1.15 : 1 / 1.15)));
    set({});
  }, { passive: false });
  const defs = svgEl("defs", {});
  const mk = (id, cls) => { const m = svgEl("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }); m.append(svgEl("path", { d: "M0 0 L10 5 L0 10 z", class: cls })); return m; };
  const uidM = `fsm-${ctx.uid}`;
  defs.append(mk(`${uidM}-a`, "fs-arrow"), mk(`${uidM}-q`, "fs-qarrow"));
  svg.append(defs);
  const layer = svgEl("g", {});
  svg.append(layer);
  const selected = (kind, id) => f.sel?.kind === kind && f.sel.id === id;
  const select = (kind, id) => { f.sel = kind ? { kind, id } : null; set({}); };

  const draw = doc => {
    layer.replaceChildren();
    const P = new Map();
    for (const b of doc.blocks) for (const [sid, p] of Object.entries(ports(doc, b))) P.set(`${sid}@${b.id}`, p);
    // streams
    for (const s of doc.streams) {
      const fb = s.from.split(".")[0], tb = s.to.split(".")[0];
      const a = P.get(`${s.id}@${fb}`), e = P.get(`${s.id}@${tb}`);
      if (!a && !e) continue;
      if (!a || !e) {
        // one end names a block that is not in the flowsheet (a document written or changed outside the
        // editor): drawn from the end that exists, in red, so the person sees it and can fix it; nothing is changed
        const at = a ?? e, d = a ? a.dir : [-1, 0];
        const mid = { x: at.x + 24 * d[0], y: at.y + 24 * d[1] }, end = { x: mid.x + (a ? 40 : -40), y: mid.y };
        const g = svgEl("g", { class: "fs-stream is-broken", "data-stream": s.id });
        g.append(svgEl("path", { d: `M${at.x} ${at.y} L${mid.x} ${mid.y} L${end.x} ${end.y}`, class: "fs-line" }));
        const t = svgEl("text", { x: end.x + (a ? 6 : -6), y: end.y + 4, class: "fs-label fs-broken", "text-anchor": a ? "start" : "end" });
        t.textContent = a ? `${s.id} → ${tb} is missing` : `${fb} is missing → ${s.id}`;
        const tip = svgEl("title", {});
        tip.textContent = `${s.id} ${a ? `goes to ${tb}` : `comes from ${fb}`}, which is not a block of the flowsheet. Delete the stream, or connect it again.`;
        g.append(tip, t);
        layer.append(g);
        continue;
      }
      const pts = route(a, e), src = doc.blocks.find(b => b.id === fb);
      const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
      const g = svgEl("g", { class: "fs-stream" + (selected("stream", s.id) ? " is-sel" : "") + (s.tear ? " is-tear" : ""), "data-stream": s.id,
        tabindex: 0, role: "button", "aria-label": `${src?.type === "feed" ? "Feed stream" : "Stream"} ${streamName(s)}` });
      g.append(svgEl("path", { d, class: "fs-hit" }), svgEl("path", { d, class: "fs-line", "marker-end": `url(#${uidM}-a)` }));
      // label on the longest segment
      let best = 1, len = 0;
      for (let i = 1; i < pts.length; i++) { const l = Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y); if (l > len) { len = l; best = i; } }
      const lx = (pts[best].x + pts[best - 1].x) / 2, ly = (pts[best].y + pts[best - 1].y) / 2;
      // the name on the drawing; flow and temperature on hover and in the stream table
      const st = res?.streams?.[s.id];
      const t = svgEl("text", { x: lx, y: ly - 6, class: "fs-label", "text-anchor": "middle" });
      t.textContent = streamName(s);
      const tip = svgEl("title", {});
      tip.textContent = st ? `${streamName(s)}${s.label ? ` (${s.id})` : ""}: ${fmtShort(st.F_kmol_h, 5)} kmol/h${st.T_K != null ? `, ${fmtTemp(st.T_K, u, 2)}` : ""}${st.VF != null ? `, VF ${fmtShort(st.VF, 3)}` : ""}` : `${streamName(s)} (not calculated)`;
      g.append(tip);
      g.append(t);
      // the end of every stream is a handle: drag it onto another inlet to reconnect, or into
      // empty space to disconnect (the stream then leaves the flowsheet)
      const leaves = doc.blocks.find(b => b.id === tb)?.type === "product";
      const hnd = svgEl("circle", { cx: leaves ? e.x : e.x - 9, cy: e.y, r: leaves ? 7 : 4.5, class: "fs-handle" + (leaves ? "" : " is-end"), "data-handle": s.id, "data-end": "1" });
      const tt = svgEl("title", {});
      tt.textContent = leaves ? `${s.id} leaves the flowsheet. Drag this end onto a block to connect it.`
        : `${s.id} goes into ${tb}. Drag this end onto another inlet to reconnect it, or into empty space to disconnect it.`;
      hnd.append(tt);
      g.append(hnd);
      // a feed stream starts at a tab: drag it to move the start, click it (or the line) for the flows and state
      if (src?.type === "feed") {
        const bad = sol.status?.blocks?.[fb] && !sol.status.blocks[fb].ok;
        const tab = svgEl("rect", { x: a.x - 14, y: a.y - 7, width: 14, height: 14, rx: 3, class: "fs-source" + (bad ? " is-incomplete" : ""), "data-feed": fb, "data-sid": s.id });
        const ft = svgEl("title", {});
        ft.textContent = `Feed stream ${streamName(s)}${bad ? `: ${sol.status.blocks[fb].message.replace(/^[^:]+: /, "")}` : ""}. Click to fill in its flows, T and P; drag to move its start.`;
        tab.append(ft); g.append(tab);
      }
      layer.append(g);
    }
    // blocks
    for (const b of doc.blocks) {
      if (b.type === "product" || (b.type === "feed" && feedStreamOf(doc, b.id))) continue;
      const [w, hh] = b.type === "feed" ? [44, 26] : SIZE[b.type];   // a feed without a stream: the old oval, so it can be deleted
      const g = svgEl("g", { class: `fs-block fs-${b.type}` + (selected("block", b.id) ? " is-sel" : "") + (sol.loop?.includes(b.id) ? " is-failed" : "") + (sol.status?.blocks?.[b.id] && !sol.status.blocks[b.id].ok ? " is-incomplete" : ""),
        transform: `translate(${b.x ?? 0} ${b.y ?? 0})`, "data-block": b.id, tabindex: 0, role: "button",
        "aria-label": `${LABEL[b.type]} ${blockName(b)}${sol.status?.blocks?.[b.id]?.ok === false ? ", not fully specified" : ""}` });
      g.append(shape(b.type, w, hh));
      if (b.type === "pfr") g.addEventListener("dblclick", () => { f.sel = { kind: "block", id: b.id }; f.below = "profile"; set({}); });
      // inlet ports: a ring on the left; an open one takes another stream
      for (const ip of unitType(b.type).inlets) {
        const key = `${b.id}.${ip.port}`, n = doc.streams.filter(x => x.to === key).length;
        if (n >= ip.max) continue;   // full: nothing more to drop here
        // empty: at the middle (an exchanger: its hot or cold port); with streams in (a mixer, a drum): just below the last one
        const ring = svgEl("circle", { cx: -w / 2, cy: b.type === "hx" ? PORT_DY[ip.port] : n ? ((n - 1) / 2) * 16 + 16 : 0, r: 5, class: "fs-port-in is-open", "data-inlet": key });
        const tt = svgEl("title", {}); tt.textContent = `${b.type === "hx" ? `${ip.label} inlet` : "Inlet"} of ${b.id}${n ? ` (${n} stream${n > 1 ? "s" : ""} in)` : ""}${n < ip.max ? ": drop a stream here" : ": full"}`; ring.append(tt);
        g.append(ring);
      }
      // the drum's liquid leaves at the bottom: its name goes on the right
      const t = b.type === "flash" ? svgEl("text", { x: w / 2 + 6, y: 4, class: "fs-name", "text-anchor": "start" })
        : svgEl("text", { y: hh / 2 + 15, class: "fs-name", "text-anchor": "middle" });
      t.textContent = blockName(b); g.append(t);
      if (sol.status?.blocks?.[b.id] && !sol.status.blocks[b.id].ok) {
        const warn = svgEl("circle", { cx: w / 2, cy: -hh / 2, r: 5, class: "fs-warn-dot" });
        const tt = svgEl("title", {}); tt.textContent = sol.status.blocks[b.id].message; warn.append(tt); g.append(warn);
      }
      // energy stream: its own (an energy feed, or heat from or to another block), else the block's duty (a pump: its power)
      // (a block whose energy stream was taken out of the drawing, energy: false, shows none)
      if (unitType(b.type).duty && b.energy !== false) {
        const conn = energyOf(doc, b.id);
        const name = conn?.stream.id || b.energy || `${unitType(b.type).energy === "work" ? "W" : "Q"}-${b.id}`;
        const q = conn?.role === "out" ? (res?.energy?.[name]?.duty_kW == null ? null : -res.energy[name].duty_kW) : res?.energy?.[name]?.duty_kW;
        const x0 = -w / 2 - 6, y0 = hh / 2 + 2, x1 = x0 - 26, y1 = y0 + 30;
        const into = q == null || q >= 0;
        // an energy feed placed on the drawing carries its own label at its tab
        const placed = conn?.role === "in" && !conn.stream.from && conn.stream.x != null;
        const d = into ? `M${x1} ${y1} L${x0} ${y0}` : `M${x0} ${y0} L${x1} ${y1}`;
        const qg = svgEl("g", { class: "fs-qstub" + (selected("energy", name) ? " is-sel" : ""), "data-qstub": b.id, "data-qname": name, tabindex: 0, role: "button",
          "aria-label": `Energy stream ${name}${q == null ? "" : `, ${kWText(q, u, 4)}`}` });
        const ln = svgEl("path", { d, class: "fs-q", "marker-end": `url(#${uidM}-q)` });
        const qtip = svgEl("title", {});
        qtip.textContent = conn ? `${name}: click for its form` : `${name}: the ${unitType(b.type).energy === "work" ? "power" : "duty"} of ${b.id}. Click for its form (it can be taken out of the drawing).`;
        qg.append(svgEl("path", { d, class: "fs-hit" }), ln, qtip);
        if (!placed) {
          const qt = svgEl("text", { x: x1 - 4, y: y1 + 4, class: "fs-qlabel", "text-anchor": "end" });
          qt.textContent = q == null ? name : `${name} ${q >= 0 ? "+" : "−"}${kWText(Math.abs(q), u, 4)}`;
          qg.append(qt);
        }
        g.append(qg);
      }
      layer.append(g);
    }
    // energy feeds placed on the drawing: a tab with the duty, and a dashed line to the end of their block's stub
    for (const q of doc.energyStreams ?? []) {
      if (q.from || q.x == null) continue;
      const g = svgEl("g", { class: "fs-qfeed" + (selected("energy", q.id) ? " is-sel" : "") + (q.to ? "" : " is-incomplete"), "data-qfeed": q.id, tabindex: 0, role: "button",
        "aria-label": `Energy feed ${q.id}, ${fmtShort(q.duty_kW ?? 0, 4)} kW${q.to ? `, into ${q.to}` : ", not connected"}` });
      const tb = q.to && doc.blocks.find(x => x.id === q.to);
      if (tb) {
        const [w, hh] = SIZE[tb.type] ?? [40, 40];
        const ex = (tb.x ?? 0) - w / 2 - 32, ey = (tb.y ?? 0) + hh / 2 + 32;
        g.append(svgEl("path", { d: `M${q.x + 12} ${q.y} L${ex} ${q.y} L${ex} ${ey}`, class: "fs-q" }));
      }
      g.append(svgEl("rect", { x: q.x - 12, y: q.y - 9, width: 24, height: 18, rx: 4, class: "fs-qsource" }),
        svgEl("path", { d: `M${q.x + 1.5} ${q.y - 6} L${q.x - 4} ${q.y + 1} h4 L${q.x - 1.5} ${q.y + 6} L${q.x + 4} ${q.y - 1} h-4z`, class: "fs-qbolt" }));
      const t = svgEl("text", { x: q.x, y: q.y + 22, class: "fs-qlabel", "text-anchor": "middle" });
      const v = Number(q.duty_kW ?? 0);
      t.textContent = `${q.id} ${v >= 0 ? "+" : "−"}${fmtShort(Math.abs(v), 4)} kW${q.to ? "" : " (not connected)"}`;
      const tip = svgEl("title", {});
      tip.textContent = `Energy feed ${q.id}${q.to ? ` into ${q.to}` : ""}: drag it onto a heater/cooler or a flash drum to connect it; click for its duty.`;
      g.append(t, tip);
      layer.append(g);
    }
    // energy streams between two blocks: a dashed line from the end of one block's energy stub to the other's
    for (const q of doc.energyStreams ?? []) {
      if (!q.from) continue;
      const end = id => { const b = doc.blocks.find(x => x.id === id); if (!b) return null; const [w, hh] = SIZE[b.type] ?? [40, 40]; return { x: (b.x ?? 0) - w / 2 - 32, y: (b.y ?? 0) + hh / 2 + 32 }; };
      const a = end(q.from), e = end(q.to);
      if (!a || !e) continue;
      const yb = Math.max(a.y, e.y) + 26;
      const d = `M${a.x} ${a.y} L${a.x} ${yb} L${e.x} ${yb} L${e.x} ${e.y}`;
      const g = svgEl("g", { class: "fs-qlink", "data-energy": q.id });
      g.append(svgEl("path", { d, class: "fs-q", "marker-end": `url(#${uidM}-q)` }));
      const t = svgEl("text", { x: (a.x + e.x) / 2, y: yb - 5, class: "fs-qlabel", "text-anchor": "middle" });
      const v = res?.energy?.[q.id]?.duty_kW;
      t.textContent = v == null ? `${q.id}: ${q.from} → ${q.to}` : `${q.id} ${fmtShort(Math.abs(v), 4)} kW, ${q.from} → ${q.to}`;
      g.append(t);
      layer.append(g);
    }
    // outlet ports (drawn last, on top of the blocks): a dot where each stream leaves a unit; drag it onto an inlet to connect
    const OUT_LABEL = { vapour: "vapour", liquid: "liquid", liquid2: "liquid 2", hot: "hot", cold: "cold" };
    for (const st of doc.streams) {
      const [fb, port] = st.from.split(".");
      const src = doc.blocks.find(b => b.id === fb);
      const a = P.get(`${st.id}@${fb}`);
      if (!a || !src || src.type === "product" || src.type === "feed") continue;
      const dot = svgEl("circle", { cx: a.x, cy: a.y, r: 4.5, class: "fs-port-out", "data-handle": st.id });
      const tt = svgEl("title", {}); tt.textContent = `${src.id} ${OUT_LABEL[port] ?? "outlet"} (stream ${st.id}): drag onto an inlet to connect it`; dot.append(tt);
      layer.append(dot);
      if (OUT_LABEL[port]) {
        const lb = svgEl("text", { x: a.x + (a.dir[0] ? 4 : 7), y: a.y + (a.dir[1] < 0 ? -6 : a.dir[1] > 0 ? 13 : -6), class: "fs-port-label" });
        lb.textContent = OUT_LABEL[port]; layer.append(lb);
      }
    }
  };
  draw(fs);

  // ---- interaction: select, move, connect
  const toSvg = ev => { const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 }; const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse()); return { x: p.x, y: p.y }; };
  let drag = null;
  svg.addEventListener("pointerdown", ev => {
    const qf = ev.target.closest?.("[data-qfeed]"), qs = ev.target.closest?.("[data-qstub]");
    if (qf) { const q = fs.energyStreams.find(x => x.id === qf.dataset.qfeed); drag = { kind: "qmove", id: q.id, start: toSvg(ev), x0: q.x ?? 0, y0: q.y ?? 0, moved: false, doc: fs }; svg.setPointerCapture?.(ev.pointerId); ev.preventDefault(); return; }
    if (qs) { const conn = energyOf(fs, qs.dataset.qstub); f.sel = conn ? { kind: "energy", id: conn.stream.id } : { kind: "energy", id: qs.dataset.qname, block: qs.dataset.qstub }; set({}); ev.preventDefault(); return; }
    const hnd = ev.target.closest?.("[data-handle]"), blk = ev.target.closest?.("[data-block]"), str = ev.target.closest?.("[data-stream]"), tab = ev.target.closest?.("[data-feed]");
    if (tab) { const b = pos.get(tab.dataset.feed); drag = { kind: "move", id: b.id, sid: tab.dataset.sid, start: toSvg(ev), x0: b.x ?? 0, y0: b.y ?? 0, moved: false, doc: fs }; svg.setPointerCapture?.(ev.pointerId); ev.preventDefault(); return; }
    if (hnd) { drag = { kind: "connect", sid: hnd.dataset.handle, start: toSvg(ev), moved: false, fromEnd: !!hnd.dataset.end }; svg.setPointerCapture?.(ev.pointerId); ev.preventDefault(); return; }
    if (blk) { const b = pos.get(blk.dataset.block); drag = { kind: "move", id: b.id, start: toSvg(ev), x0: b.x ?? 0, y0: b.y ?? 0, moved: false, doc: fs }; svg.setPointerCapture?.(ev.pointerId); ev.preventDefault(); return; }
    if (str) { select("stream", str.dataset.stream); return; }
    // the empty canvas: drag to move the view (the box scrolls), click to clear the selection
    wrap.focus({ preventScroll: true });
    drag = { kind: "pan", x: ev.clientX, y: ev.clientY, left: wrap.scrollLeft, top: wrap.scrollTop, moved: false };
    svg.setPointerCapture?.(ev.pointerId);
  });
  svg.addEventListener("pointermove", ev => {
    if (!drag) return;
    if (drag.kind === "pan") {
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true; svg.classList.add("is-panning");
      wrap.scrollLeft = drag.left - dx; wrap.scrollTop = drag.top - dy;
      return;
    }
    const p = toSvg(ev), dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    if (drag.kind === "move") { drag.doc = moveBlock(fs, drag.id, drag.x0 + dx, drag.y0 + dy); draw(drag.doc); }
    else if (drag.kind === "qmove") { drag.doc = moveEnergy(fs, drag.id, drag.x0 + dx, drag.y0 + dy); draw(drag.doc); }
    else {
      draw(fs);
      svg.classList.add("is-connecting");
      const src = fs.streams.find(x => x.id === drag.sid)?.from.split(".")[0];
      const valid = new Set(openInlets(fs, src));
      for (const el of svg.querySelectorAll("[data-inlet]")) el.classList.toggle("is-target", valid.has(el.dataset.inlet));
      const ln = svgEl("path", { d: `M${drag.start.x} ${drag.start.y} L${p.x} ${p.y}`, class: "fs-drag", "marker-end": `url(#${uidM}-a)` });
      layer.append(ln);
    }
  });
  svg.addEventListener("pointerup", ev => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === "pan") { svg.classList.remove("is-panning"); if (!d.moved && f.sel) select(null); return; }
    if (d.kind === "qmove") {
      if (!d.moved) { select("energy", d.id); return; }
      // dropped on a heater/cooler or a flash drum: connected to it
      const p = toSvg(ev);
      const on = fs.blocks.find(b => ENERGY_TARGETS.includes(b.type) && (() => { const [w, hh] = SIZE[b.type]; return Math.abs(p.x - (b.x ?? 0)) <= w / 2 + 12 && Math.abs(p.y - (b.y ?? 0)) <= hh / 2 + 12; })());
      f.sel = { kind: "energy", id: d.id };
      if (on && fs.energyStreams.find(x => x.id === d.id)?.to !== on.id) {
        // the tab stays where it was picked up, linked to the block it now feeds
        try { set({ flowsheet: connectEnergyFeed(fs, d.id, on.id) }); } catch (e) { f.note = e.message; set({ flowsheet: d.doc }); }
        return;
      }
      set({ flowsheet: d.doc });
      return;
    }
    if (d.kind === "move") {
      if (d.moved) { if (d.sid) f.sel = { kind: "stream", id: d.sid }; set({ flowsheet: d.doc }); } else d.sid ? select("stream", d.sid) : select("block", d.id);
      return;
    }
    svg.classList.remove("is-connecting");
    if (!d.moved) { select("stream", d.sid); return; }
    const hit = document.elementFromPoint(ev.clientX, ev.clientY);
    const valid = openInlets(fs, fs.streams.find(s => s.id === d.sid)?.from.split(".")[0]);
    const ring = hit?.closest?.("[data-inlet]");
    if (ring && valid.includes(ring.dataset.inlet)) { f.sel = { kind: "stream", id: d.sid }; set({ flowsheet: connect(fs, d.sid, ring.dataset.inlet) }); return; }
    const under = hit?.closest?.("[data-block]");
    if (under) {
      const inlet = valid.find(x => x.startsWith(`${under.dataset.block}.`));
      if (inlet) { f.sel = { kind: "stream", id: d.sid }; set({ flowsheet: connect(fs, d.sid, inlet) }); return; }
      f.note = under.dataset.block === fs.streams.find(s => s.id === d.sid)?.from.split(".")[0]
        ? "A stream cannot go back into the block it leaves; send it through another block (a recycle goes back to an earlier block, for example a mixer)."
        : `${under.dataset.block} takes no more streams: its inlet is full.`;
      set({});
      return;
    }
    // dropped in the open: a product end moves there; a connected stream is disconnected there
    const p = toSvg(ev), end = endOf(fs, d.sid);
    if (end?.kind === "product") set({ flowsheet: moveBlock(fs, end.block, p.x, p.y) });
    else if (end?.kind === "unit" && d.fromEnd) {
      const out = connect(fs, d.sid, null), e2 = endOf(out, d.sid);
      f.sel = { kind: "stream", id: d.sid };
      f.note = `${d.sid} no longer goes to ${end.block}: it now leaves the flowsheet. Drag its end onto another inlet to connect it again.`;
      set({ flowsheet: moveBlock(out, e2.block, p.x, p.y) });
    } else draw(fs);
  });
  svg.addEventListener("keydown", ev => {
    const qf = ev.target.closest?.("[data-qfeed]"), qs = ev.target.closest?.("[data-qstub]");
    if (qf || qs) {
      const conn = qs && energyOf(fs, qs.dataset.qstub);
      const sel = qf ? { kind: "energy", id: qf.dataset.qfeed } : conn ? { kind: "energy", id: conn.stream.id } : { kind: "energy", id: qs.dataset.qname, block: qs.dataset.qstub };
      const step = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[ev.key];
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); f.sel = sel; set({}); }
      else if (step && qf) { ev.preventDefault(); const q = fs.energyStreams.find(x => x.id === qf.dataset.qfeed); f.sel = sel; set({ flowsheet: moveEnergy(fs, q.id, (q.x ?? 0) + step[0], (q.y ?? 0) + step[1]) }); }
      else if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); f.sel = sel; deleteSelected(state, set, ui); }
      return;
    }
    const str = ev.target.closest?.("[data-stream]");
    if (str) {
      const step = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[ev.key], fd = feedOf(fs, str.dataset.stream);
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select("stream", str.dataset.stream); }
      else if (step && fd) { ev.preventDefault(); f.sel = { kind: "stream", id: str.dataset.stream }; set({ flowsheet: moveBlock(fs, fd.id, (fd.x ?? 0) + step[0], (fd.y ?? 0) + step[1]) }); }
      else if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); f.sel = { kind: "stream", id: str.dataset.stream }; deleteSelected(state, set, ui); }
      return;
    }
    const blk = ev.target.closest?.("[data-block]");
    if (!blk) return;
    const b = pos.get(blk.dataset.block);
    const step = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[ev.key];
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select("block", b.id); }
    else if (step) { ev.preventDefault(); f.sel = { kind: "block", id: b.id }; set({ flowsheet: moveBlock(fs, b.id, (b.x ?? 0) + step[0], (b.y ?? 0) + step[1]) }); }
    else if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); f.sel = { kind: "block", id: b.id }; deleteSelected(state, set, ui); }
  });

  const units = fs.blocks.filter(b => b.type !== "product");
  // the canvas is drawn after the workbench restores the focus: a focused canvas stays focused
  const hadFocus = plot.contains(document.activeElement) && document.activeElement?.dataset?.fk === "fs-canvas";
  plot.replaceChildren(wrap);
  if (hadFocus) wrap.focus({ preventScroll: true });
  wrap.append(svg);
  // what "Fit" in the toolbar measures: the box shown and the drawing's extent; the view stays where it was scrolled
  f.view = { wrap, w: maxX - minX, h: maxY - minY };
  if (f.scroll) { wrap.scrollLeft = f.scroll.left; wrap.scrollTop = f.scroll.top; }
  wrap.addEventListener("scroll", () => { f.scroll = { left: wrap.scrollLeft, top: wrap.scrollTop }; }, { passive: true });

  // ---- results panel
  side.replaceChildren(...resultsPanel({ state, f, sol, u, set }));
  // ---- stream table
  // a selected plug-flow reactor shows its profiles in place of the stream table (the maintainer, 2026-10-28)
  const kin = f.sel?.kind === "block" ? res?.blocks?.[f.sel.id]?.reaction?.kinetic : null;
  const toggle = label => h("button", { type: "button", class: "fa-mini", "data-fk": "fs-below-toggle", on: { click: () => { f.below = f.below === "streams" ? "profile" : "streams"; set({}); } } }, label);
  if (res && kin?.profile && f.below !== "streams") {
    const b = fs.blocks.find(x => x.id === f.sel.id);
    below.replaceChildren(h("div", { class: "fs-tables" }, h("h3", {}, `Profiles along ${blockName(b)}`),
      profilePanel({ kin, ids: fs.components, names: fs.components.map(nameOf), units: u, sel: f.profileVar, onSel: k => { f.profileVar = k; set({}); },
        reactions: Object.keys(res.blocks[f.sel.id].reaction.extents_kmol_h).map(id => ({ id, name: (fs.reactions ?? []).find(r => r.id === id)?.name || id, units: res.blocks[f.sel.id].reaction.rates[id].units })) }),
      toggle("Show the stream table")));
  } else if (res) below.replaceChildren(streamTable({ fs, res, u, state }), ...(kin?.profile ? [toggle("Show the profiles")] : []), ...csvTools(ctx, fs, res, u));
  const it = res?.loops?.reduce((a, l) => a + l.iterations, 0);
  if (sol.error) return { data: "Not solved: see the message above the drawing" };
  return { data: res ? `Solved${res.loops.length ? `, ${res.loops.length} recycle${res.loops.length > 1 ? "s" : ""} in ${it} iterations` : ""}` : sol.status.message };
}

/** An approach to equilibrium in words. */
const approachText = a => (a?.dT_K != null ? `K at T ${a.dT_K < 0 ? "−" : "+"} ${fmtShort(Math.abs(a.dT_K), 4)} K` : a?.fraction != null ? `${fmtShort(a.fraction, 4)} of the equilibrium extent` : "at equilibrium");

/** A conversion or equilibrium reactor's reactions, one line each (the table under the streams has the columns). */
function reactionList(fs, rx) {
  const byId = new Map([...(fs.reactions ?? []), ...(rx.generated ?? [])].map(r => [r.id, r]));
  if (rx.kinetic) {
    return h("ul", { class: "fa-rx-list" }, ...Object.entries(rx.extents_kmol_h).map(([id, xi]) => h("li", {}, h("b", {}, byId.get(id)?.name || id),
      `: extent ${fmtShort(xi, 5)} kmol/h, rate at the outlet ${fmtShort(rx.rates[id].r, 4)} ${rx.rates[id].units}, ΔrH ${fmtShort(rx.heats[id].dH_J_mol / 1000, 5)} kJ/mol`)));
  }
  if (rx.equilibrium) {
    return h("ul", { class: "fa-rx-list" }, ...Object.entries(rx.extents_kmol_h).map(([id, xi]) => {
      const q = rx.equilibrium.reactions[id];
      return h("li", {}, h("b", {}, byId.get(id)?.name || id),
        `: extent ${fmtShort(xi, 5)} kmol/h (${approachText(q.approach)}), K = ${fmtShort(q.K, 5)} at ${fmtShort(q.T_K, 6)} K (${q.from}), ΔrH ${fmtShort(rx.heats[id].dH_J_mol / 1000, 5)} kJ/mol`);
    }));
  }
  return h("ul", { class: "fa-rx-list" }, ...Object.entries(rx.extents_kmol_h).map(([id, xi]) => h("li", {},
    h("b", {}, byId.get(id)?.name || id), `: ${fmtShort(rx.conversions[id]?.conversion, 4)} of ${nameOf(rx.conversions[id]?.key)}, extent ${fmtShort(xi, 5)} kmol/h, ΔrH ${fmtShort(rx.heats[id].dH_J_mol / 1000, 5)} kJ/mol`)));
}

/** A duty or heat flow (kW in the engine) in the unit of Settings. */
const kWText = (v, u, d = 5) => `${fmtShort(dutyToDisplay(v, u), d)} ${u.duty ?? "kW"}`;

function kvList(rows) {
  return h("table", { class: "fa-kv" }, h("tbody", {}, ...rows.filter(Boolean).map(([k, v]) =>
    h("tr", {}, h("th", { scope: "row" }, k), h("td", { class: "fug-num" }, v ?? "–")))));
}

export function resultsPanel({ state, f, sol, u, set }) {
  const res = sol.result, fs = state.flowsheet;
  const out = [];
  if (f.sel?.kind === "block") {
    const b = fs.blocks.find(x => x.id === f.sel.id), r = res?.blocks?.[f.sel.id];
    out.push(h("div", { class: "fug-eyebrow" }, `${LABEL[b?.type] ?? ""} ${blockName(b) ?? f.sel.id}`));
    if (r) {
      const conn = energyOf(fs, b.id), work = unitType(b.type).energy === "work";
      const qName = conn?.stream.id || b.energy || `${work ? "W" : "Q"}-${b.id}`;
      const z = r.sizing;
      out.push(kvList([
        unitType(b.type).duty ? [`${work ? "Power" : "Duty"} (${qName})`, kWText(r.duty_kW, u, 5)] : null,
        r.state?.T_K != null ? ["Temperature", fmtTemp(r.state.T_K, u, 2)] : null,
        r.state?.P_kPa != null ? ["Pressure", fmtP(r.state.P_kPa, u)] : null,
        r.state?.VF != null ? ["Vapour fraction", fmtShort(r.state.VF, 4)] : null,
        r.state?.efficiency != null ? ["Efficiency", `${fmtShort(100 * r.state.efficiency, 4)} %`] : null,
        r.state?.volume_m3_h != null ? ["Volume flow", `${fmtShort(r.state.volume_m3_h, 5)} m³/h`] : null,
        b.type === "hx" && r.state?.duty_kW != null ? ["Heat exchanged", kWText(r.state.duty_kW, u, 5)] : null,
        z?.area_m2 != null ? [z.rating ? "Area (given)" : "Area", `${fmtShort(z.rating?.area_m2 ?? z.area_m2, 4)} m²`] : null,
        z?.rating ? ["Effectiveness", fmtShort(z.rating.effectiveness, 4)] : null,
        z?.U_W_m2K != null ? ["U", `${fmtShort(z.U_W_m2K, 4)} W/(m² K)`] : null,
        z?.dT_min_K != null ? ["Smallest ΔT", `${fmtShort(z.dT_min_K, 4)} K`] : null,
        z?.utility?.flow_kg_h != null ? ["Utility", `${fmtShort(z.utility.flow_kg_h, 5)} kg/h`] : null,
        r.reaction ? ["Heat of the reactions at 298.15 K (− released)", kWText(r.reaction.heat_kW, u, 5)] : null,
        r.reaction?.kinetic?.V_m3 != null ? ["Reactor volume", `${fmtShort(r.reaction.kinetic.V_m3, 5)} m³`] : null,
        r.reaction?.kinetic?.residence_s != null ? ["Residence time (V / outlet volume flow)", `${fmtShort(r.reaction.kinetic.residence_s, 5)} s`] : null,
        r.reaction?.kinetic?.profile ? ["Outlet temperature, pressure", `${fmtTemp(r.reaction.kinetic.profile.at(-1).T_K, u, 2)}, ${fmtP(r.reaction.kinetic.profile.at(-1).P_kPa, u)}`] : null,
        r.reaction?.equilibrium?.phases === 2 ? ["Phases", "vapour and liquid at chemical and phase equilibrium"] : null,
        ...(r.reaction ? Object.entries(r.reaction.keyConversion ?? {}).map(([c, x]) => [`Conversion of ${nameOf(c)}`, fmtShort(x, 5)]) : []),
        r.reaction?.heat ? ["ΔrH at 298.15 K, per mol of key", `${fmtShort(r.reaction.heat.dH_J_mol / 1000, 5)} kJ/mol`] : null,
        r.reaction ? ["Element balance", r.balance.elements ? (Object.values(r.balance.elements).every(d => d < 1e-9) ? "closed" : "check")
          : Object.keys(r.reaction.elementImbalance ?? {}).length ? "not closed (see the note)" : "closed"] : null,
        r.balance.material != null ? ["Material balance", r.balance.material < 1e-9 ? "closed" : r.balance.material.toExponential(1)]
          : ["Mass balance", r.balance.mass < 1e-9 ? "closed" : r.balance.mass.toExponential(1)],
      ]), ...(r.reaction?.extents_kmol_h ? [reactionList(fs, r.reaction)] : []),
      ...(r.reaction?.kinetic?.profile ? [h("button", { type: "button", class: "fa-mini", "data-fk": "fs-show-profile", on: { click: () => { f.below = "profile"; set({}); } } }, icon("curves", 14), "Profiles along the tube (under the drawing)")] : []),
      ...(r.reaction ? [h("div", { class: "fug-foot" }, "The duty is the enthalpy out minus in plus the heat of the reactions at 298.15 K (the enthalpies are against each ideal gas at 298.15 K), so at another temperature it differs from that heat.")] : []),
      ...(r.reaction?.heat ? [h("div", { class: "fug-foot" }, `Heat of reaction: ${r.reaction.heat.from}.`)] : []),
      ...(z?.utility?.describe ? [h("div", { class: "fug-foot" }, `Utility: ${z.utility.describe}.`)] : []), ...(z?.note ? [h("div", { class: "fug-foot" }, z.note)] : []),
      ...(z?.rating ? [h("div", { class: "fug-foot" }, z.rating.summary)] : []), ...(z?.notes ?? []).map(n => h("div", { class: "fug-foot" }, n)), ...r.notes.map(n => warning(n)));
    } else out.push(h("div", { class: "fa-empty" }, sol.status.blocks?.[f.sel.id]?.ok === false ? sol.status.blocks[f.sel.id].message : "Not calculated yet."));
  } else if (f.sel?.kind === "energy") {
    const q = res?.energy?.[f.sel.id];
    out.push(h("div", { class: "fug-eyebrow" }, `Energy stream ${f.sel.id}`));
    out.push(q ? kvList([[q.kind === "work" ? "Power" : "Duty", `${q.duty_kW >= 0 ? "+" : "−"}${kWText(Math.abs(q.duty_kW), u)}`],
      ["Block", q.from ? `${q.from} → ${q.to}` : q.block ?? q.to], ["Kind", q.kind === "work" ? "work" : q.internal ? "heat between blocks" : q.from === null ? "energy feed" : "heat"]])
      : h("div", { class: "fa-empty" }, "Not calculated yet."));
  } else if (f.sel?.kind === "stream") {
    const s = res?.streams?.[f.sel.id];
    out.push(h("div", { class: "fug-eyebrow" }, `Stream ${streamName(fs.streams.find(x => x.id === f.sel.id)) ?? f.sel.id}`));
    if (s) {
      out.push(kvList([
        ["Temperature", s.T_K == null ? "–" : fmtTemp(s.T_K, u, 2)], ["Pressure", s.P_kPa == null ? "–" : fmtP(s.P_kPa, u)],
        ["Vapour fraction", s.VF == null ? "–" : fmtShort(s.VF, 4)], ["Molar flow", `${fmtShort(flowToDisplay(s.F_kmol_h, u), 5)} ${u.flow ?? "kmol/h"}`],
        ["Mass flow", `${fmtShort(massFlowToDisplay(s.mass_kg_h, u), 5)} ${u.massFlow ?? "kg/h"}`], ["Enthalpy flow", kWText(s.H_kW, u, 5)],
        ...fs.components.map(c => [nameOf(c), `${fmtShort(flowToDisplay(s.flow_kmol_h[c], u), 5)} ${u.flow ?? "kmol/h"}`]),
      ]));
    } else out.push(h("div", { class: "fa-empty" }, "Not calculated yet."));
  } else {
    out.push(h("div", { class: "fug-eyebrow" }, "Flowsheet"),
      h("div", { class: `fa-dof ${sol.status.ready ? "is-ok" : "is-bad"}` }, sol.status.message));
    if (res) {
      // heat that crosses the flowsheet's boundary: the energy streams between two blocks stay inside; a pump's power is work
      const ext = Object.values(res.energy).filter(q => !q.internal && q.kind !== "work");
      const qin = ext.filter(q => q.duty_kW > 0).reduce((a, q) => a + q.duty_kW, 0);
      const qout = ext.filter(q => q.duty_kW < 0).reduce((a, q) => a + q.duty_kW, 0);
      const wk = Object.values(res.energy).filter(q => q.kind === "work").reduce((a, q) => a + q.duty_kW, 0);
      const inner = Object.values(res.energy).filter(q => q.internal).reduce((a, q) => a + Math.abs(q.duty_kW), 0);
      out.push(kvList([
        ["Recycles", res.loops.length ? res.loops.map(l => `${l.tears.join(", ")}: ${l.iterations} iterations`).join("; ") : "none"],
        ["Heat in", kWText(qin, u, 5)], ["Heat out", kWText(-qout, u, 5)],
        wk ? ["Work (pumps and compressors in, expanders out)", `${wk >= 0 ? "+" : "−"}${kWText(Math.abs(wk), u)}`] : null,
        inner ? ["Heat recovered (energy streams)", kWText(inner, u, 5)] : null,
        res.balance.reaction_kW != null ? ["Heat of the reactions", kWText(res.balance.reaction_kW, u, 5)] : null,
        ["Material balance", Object.values(res.balance.material_kmol_h).every(v => Math.abs(v) < 1e-6) ? "closed" : "check"],
        ["Energy balance", kWText(res.balance.energy_kW, u, 3)],
      ]), h("div", { class: "fug-foot" }, `Model: ${fs.thermo.model}${["PR", "SRK"].includes(fs.thermo.model) ? "" : `, ${fs.thermo.vapour} vapour`}${PAIR_MODELS.includes(fs.thermo.model) ? `; parameter sets (Library): ${setsLabel(state)}` : ""}. Model predictions, not measurements; the parameter sources are in Sources.`));
    }
  }
  return out;
}

function streamRows(fs, res, u, state) {
  const ids = fs.streams.map(s => s.id);
  const S = ids.map(id => res.streams[id]);
  const mass = state.basis === "mass";
  const nameOfBlock = bid => blockName(fs.blocks.find(b => b.id === bid)) ?? bid;
  const rows = [
    ["From", "", ids.map(id => { const [bid, port] = fs.streams.find(s => s.id === id).from.split("."); return feedOf(fs, id) ? "feed" : `${nameOfBlock(bid)} ${port}`; }), "text"],
    ["To", "", ids.map(id => { const e = endOf(fs, id); return e.kind === "product" ? "product" : `${nameOfBlock(e.block)} ${e.port}`; }), "text"],
    ["Temperature", tLabel(u), S.map(s => (s.T_K == null ? null : tToDisplay(s.T_K, u)))],
    ["Pressure", u.P, S.map(s => (s.P_kPa == null ? null : pToDisplay(s.P_kPa, u)))],
    ["Vapour fraction", "mol/mol", S.map(s => s.VF)],
    ["Molar flow", u.flow ?? "kmol/h", S.map(s => flowToDisplay(s.F_kmol_h, u))],
    ["Mass flow", u.massFlow ?? "kg/h", S.map(s => massFlowToDisplay(s.mass_kg_h, u))],
    ["Enthalpy flow", u.duty ?? "kW", S.map(s => (s.H_kW == null ? null : dutyToDisplay(s.H_kW, u)))],
    ...fs.components.map(c => [`Flow ${nameOf(c)}`, u.flow ?? "kmol/h", S.map(s => flowToDisplay(s.flow_kmol_h[c], u))]),
    ...fs.components.map((c, i) => [mass ? `Mass fraction ${nameOf(c)}` : `Mole fraction ${nameOf(c)}`, mass ? "kg/kg" : "mol/mol",
      S.map(s => (s.F_kmol_h > 0 ? (mass ? s.flows[i] * molarMassOf(c) / s.mass_kg_h : s.z[i]) : null))]),
  ];
  return { ids, rows };
}
const molarMassOf = c => byId().get(c)?.MW ?? NaN;

function streamTable({ fs, res, u, state }) {
  const { ids, rows } = streamRows(fs, res, u, state);
  const fmt = v => (v == null || Number.isNaN(v) ? "–" : typeof v === "string" ? v : fmtShort(v, 5));
  const qs = Object.values(res.energy);
  return h("div", { class: "fs-tables" },
    h("h3", {}, "Streams"),
    h("div", { class: "fug-scroll" }, h("table", { class: "fa-table fa-stream" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Stream"), h("th", { scope: "col" }, "Unit"), ...ids.map(id => h("th", { scope: "col", class: "fug-num" }, streamName(fs.streams.find(s => s.id === id)))))),
      h("tbody", {}, ...rows.map(([label, unit, vals]) => h("tr", {}, h("th", { scope: "row" }, label), h("td", {}, unit), ...vals.map(v => h("td", { class: "fug-num" }, fmt(v)))))))),
    ...reactorRows(fs, res),
    qs.length ? h("h3", {}, "Energy streams") : null,
    qs.length ? h("table", { class: "fa-table" }, h("thead", {}, h("tr", {}, h("th", {}, "Stream"), h("th", {}, "Block"), h("th", {}, "Kind"), h("th", { class: "fug-num" }, u.duty ?? "kW"))),
      h("tbody", {}, ...qs.map(q => h("tr", {}, h("th", { scope: "row" }, q.id), h("td", {}, q.from ? `${q.from} → ${q.to}` : q.block),
        h("td", {}, q.kind === "work" ? "work" : q.internal ? "heat between blocks" : q.from === null ? "energy feed" : fs.blocks.find(b => b.id === q.block)?.energy === false ? "heat (not drawn)" : "heat"),
        h("td", { class: "fug-num" }, `${q.duty_kW >= 0 ? "+" : "−"}${fmtShort(dutyToDisplay(Math.abs(q.duty_kW), u), 5)}`))))) : null,
    h("p", { class: "fug-foot" }, "Duty: + heat into the block, − heat out; between two blocks, the heat the first gives up and the second takes. The power of a pump, compressor or expander is work (an expander's is negative: it gives power). Enthalpy reference: each component as an ideal gas at 298.15 K."));
}

/** Under the stream table: each reactor's conversions, extents and heat (proposal 0010, step 7). */
function reactorRows(fs, res) {
  const rx = fs.blocks.filter(b => REACTORS.includes(b.type) && res.blocks[b.id]?.reaction);
  if (!rx.length) return [];
  const byId = new Map((fs.reactions ?? []).map(r => [r.id, r]));
  const rows = rx.flatMap(b => {
    const r = res.blocks[b.id].reaction;
    const name = id => byId.get(id)?.name || r.generated?.find(g => g.id === id)?.name || id;
    if (r.kinetic) return Object.entries(r.extents_kmol_h).map(([id, xi]) => [blockName(b), name(id), "kinetics", "–", xi, r.heats[id].dH_J_mol / 1000, xi * r.heats[id].dH_J_mol / 3600]);
    // an equilibrium reactor has no key: its "key" column says the approach, the conversion column stays empty
    if (r.equilibrium && r.generated) return Object.entries(r.extents_kmol_h).map(([id, xi]) => [blockName(b), name(id), "Gibbs", "–", xi, r.heats[id].dH_J_mol / 1000, xi * r.heats[id].dH_J_mol / 3600]);
    if (r.equilibrium) return Object.entries(r.extents_kmol_h).map(([id, xi]) => [blockName(b), byId.get(id)?.name || id, approachText(r.equilibrium.reactions[id].approach), "–", xi, r.heats[id].dH_J_mol / 1000, xi * r.heats[id].dH_J_mol / 3600]);
    if (r.extents_kmol_h) return Object.entries(r.extents_kmol_h).map(([id, xi]) => [blockName(b), byId.get(id)?.name || id, nameOf(r.conversions[id].key), r.conversions[id].conversion, xi, r.heats[id].dH_J_mol / 1000, xi * r.heats[id].dH_J_mol / 3600]);
    const [key, X] = Object.entries(r.keyConversion)[0];
    return [[blockName(b), "yields", nameOf(key), X, r.converted_kmol_h[key], r.heat.dH_J_mol / 1000, r.heat_kW]];
  });
  return [h("h3", {}, "Reactors"), h("table", { class: "fa-table" },
    h("thead", {}, h("tr", {}, ...["Reactor", "Reaction", "Key", "Conversion", "Extent, kmol/h", "ΔrH (298.15 K), kJ/mol", "Heat (298.15 K), kW"].map((t, k) => h("th", { class: k > 2 ? "fug-num" : null }, t)))),
    h("tbody", {}, ...rows.map(row => h("tr", {}, ...row.map((v, k) => (k === 0 ? h("th", { scope: "row" }, v) : h("td", { class: k > 2 ? "fug-num" : null }, typeof v === "number" ? fmtShort(v, 5) : v)))))))];
}

function csvTools(ctx, fs, res, u) {
  const { ids, rows } = streamRows(fs, res, u, ctx.state);
  const q = v => (v == null || Number.isNaN(v) ? "" : typeof v === "string" ? (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v) : String(Number(v.toPrecision(10))));
  const lines = [["Stream", "Unit", ...ids.map(id => q(streamName(fs.streams.find(s => s.id === id))))].join(","), ...rows.map(([l, unit, vals]) => [q(l), q(unit), ...vals.map(q)].join(",")), "",
    "Energy stream,Block,From,To,Kind,kW", ...Object.values(res.energy).map(e => [e.id, e.block, e.from ?? "", e.to ?? "", e.kind === "work" ? "work" : e.internal ? "heat between blocks" : "heat", q(e.duty_kW)].join(","))];
  const csv = lines.join("\r\n") + "\r\n";
  const status = h("div", { class: "fug-foot", "aria-live": "polite" }), box = h("div");
  const excel = concept => () => {
    try {
      const bytes = flowsheetXlsx(calculatedFlowsheet(ctx.state), res, { version: pkg.version, concept, userData: drawing });
      const name = `${(ctx.state.title || "flowsheet").replace(/[\\/:*?"<>|]+/g, "-")}${concept ? " - concept model" : ""}.xlsx`;
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = h("a", { href: url, download: name, style: "display:none" });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      status.textContent = concept
        ? `Saved ${name}: every flow is a formula, the flash drums included (an approximation for concept design: constant activity coefficients at the drum's T and P; see its About sheet). If nothing was downloaded, the page does not allow downloads.`
        : `Saved ${name}: blue cells are inputs, black cells formulas, grey cells values from CHEPTA (see its About sheet). If nothing was downloaded, the page does not allow downloads.`;
    } catch (e) { status.textContent = `The Excel file could not be made: ${e.message}`; }
  };
  return [h("div", { class: "fa-in-actions" },
    h("button", { type: "button", class: "fa-mini", "data-fk": "fs-xlsx", title: "An Excel workbook with the balances as formulas; the flash drum outlets as values from CHEPTA", on: { click: excel(false) } }, icon("table", 15), "Download Excel"),
    h("button", { type: "button", class: "fa-mini", "data-fk": "fs-xlsx-concept",
      title: "An Excel workbook where the flash drums are formulas too (K = γ·Psat/P, Rachford-Rice), so the whole mass balance recalculates when you change feeds, splits, or a drum's T and P: an approximation for concept design",
      on: { click: excel(true) } }, icon("table", 15), "Excel concept model"),
    h("button", { type: "button", class: "fa-mini", "data-fk": "fs-csv", on: { click: () => ctx.saveText(csv, "chepta-flowsheet-streams.csv", "text/csv;charset=utf-8", status) } }, icon("download", 15), "Download CSV"),
    h("button", { type: "button", class: "fa-mini", "data-fk": "fs-csv-copy", on: { click: () => ctx.copyText(csv, status, box) } }, icon("copy", 15), "Copy CSV")), status, box];
}
