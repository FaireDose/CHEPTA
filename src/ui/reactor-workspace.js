/**
 * The Reactor workspace of the Unit models (the maintainer, 2026-10-28: "a reactor block where i can select a reactor
 * type and define reactions and i get there independently of the flowsheet a preliminary curve or kinetics analysis or
 * enthalpy of reaction ... use same models like in the flowsheet"). It is a flowsheet of its own (state.reactor: a
 * feed, one reactor, its product), solved by the same engine and edited with the same panels as the Flowsheet
 * workspace (flowsheet-view.js, through `asFlowsheet`), and adds the curves of a preliminary study:
 *   - the profiles along a plug-flow reactor;
 *   - the conversion (or the outlet's mole fractions, or the duty) against the reactor temperature, the reactor
 *     recalculated at each temperature (isothermal there);
 *   - the conversion against the volume of a CSTR;
 *   - ΔrH and ln K of each reaction against temperature (src/reactions/reaction.js);
 *   - each rate against temperature at the feed's composition (src/reactions/kinetics.js).
 * A view (layer 6): every number comes from the engine.
 */
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { emptyFlowsheet, runFlowsheet, flowsheetSystem } from "../flowsheet/document.js";
import { checkReaction, reactionProperties } from "../reactions/reaction.js";
import { reactionRate } from "../reactions/kinetics.js";
import { phaseStates } from "../units/kinetic-reactors.js";
import { addBlock, addFeedTo, setBlockType, REACTORS, KINETIC, usedReactions } from "./flowsheet-logic.js";
import { flowsheetInputs, ensureUi, solution, resultsPanel, flowsheetKey } from "./flowsheet-view.js";
import { profilePanel, chartBox } from "./reactor-charts.js";
import { calculatedFlowsheet, userOverlay } from "./app-logic.js";
import { listComponents } from "../thermo/system.js";
import { tToDisplay, fmtShort } from "./properties-logic.js";
import { warning } from "./warning.js";

export const REACTOR_SHORT = { "conversion-reactor": "Conversion", "yield-reactor": "Yield", "equilibrium-reactor": "Equilibrium", cstr: "CSTR", pfr: "Plug flow" };
/** The id of the workspace's reactor (its type's prefix: RE1, CS1, PF1, ...). */
const rid = fs => fs.blocks.find(b => REACTORS.includes(b.type))?.id;

/** The workspace's document with its reactor: a feed, the reactor and its product. */
export function reactorDocument(doc, type = "equilibrium-reactor") {
  const fs = doc ?? emptyFlowsheet();
  if (rid(fs)) return fs;
  const r = addBlock({ ...fs, blocks: [], streams: [] }, type, { x: 260, y: 160 });
  const out = addFeedTo(r.fs, `${r.id}.in`).fs;
  return { ...fs, blocks: out.blocks, streams: out.streams };
}

/** The workspace seen as the Flowsheet workspace: its own document, history-free, and its own selection. */
export function asFlowsheet(state, set, ui) {
  const fs = reactorDocument(state.reactor);
  const st = { ...state, flowsheet: fs };
  const put = patch => {
    if (!("flowsheet" in patch)) return set(patch);
    const { flowsheet, ...rest } = patch;
    set({ ...rest, reactor: flowsheet });
  };
  const rui = (ui.rx ??= {});
  ensureUi(rui);
  return { state: st, set: put, ui: rui };
}

/** The ribbon: the setup, the type of reactor, and what the Inputs panel shows. */
export function reactorRibbon({ state, set, ui, group, smallButton }) {
  const a = asFlowsheet(state, set, ui), f = a.ui.fs, fs = a.state.flowsheet;
  const RID = rid(fs), b = fs.blocks.find(x => x.id === RID), feed = fs.streams.find(s => s.to === `${RID}.in`);
  const ready = fs.components.length > 0;
  const page = (ico, label, p, fk) => smallButton({ ico, label, fk, pressed: !f.sel && (f.setup ?? "components") === p, onClick: () => { f.sel = null; f.setup = p; set({}); } });
  const pick = (ico, label, sel, fk) => { const x = smallButton({ ico, label, fk, pressed: f.sel?.id === sel.id, onClick: () => { f.sel = sel; set({}); } }); x.disabled = !ready; return x; };
  return [
    group("Setup", h("div", { class: "fa-rows2" },
      page("flask", `Components${ready ? ` (${fs.components.length})` : ""}`, "components", "rx-setup"),
      page("cubic", `Method: ${fs.thermo.model}`, "method", "rx-method"),
      page("spark", `Reactions${fs.reactions?.length ? ` (${fs.reactions.length})` : ""}`, "reactions", "rx-reactions"))),
    group("Reactor", h("div", { class: "fug-seg fa-seg", role: "group", "aria-label": "Reactor type" }, ...REACTORS.map(t =>
      h("button", { type: "button", "aria-pressed": String(b.type === t), "data-fk": `rx-type-${t}`,
        on: { click: () => { if (b.type !== t) { const next = setBlockType(fs, RID, t); f.sel = { kind: "block", id: rid(next) }; a.set({ flowsheet: next }); } } } }, REACTOR_SHORT[t])))),
    group("Edit", h("div", { class: "fa-rows2" },
      pick("feed", "Feed", { kind: "stream", id: feed?.id }, "rx-feed"),
      pick("reactor", "Reactor", { kind: "block", id: RID }, "rx-block"))),
  ];
}

/** The Inputs panel: the Flowsheet workspace's own, on this document. */
export function reactorInputs({ state, set, ui, uid, inputsSection }) {
  const a = asFlowsheet(state, set, ui);
  return flowsheetInputs({ ...a, uid, inputsSection });
}

/** The key that redraws the view. */
export const reactorKey = (state, ui) => { const a = asFlowsheet(state, () => {}, ui); return [flowsheetKey(a.state), a.ui.fs.sel, a.ui.chart, a.ui.profileVar, a.ui.sweepVar, a.ui.sweepRun ?? false]; };

const CHARTS = { profile: "Profiles", temperature: "Against temperature", volume: "Against volume", reaction: "ΔrH and K", rate: "Rates" };

/** The canvas: the reactor's results beside, the chosen curves in the drawing area. */
export function reactorView(ctx) {
  const { state, set, plot, side, ui } = ctx;
  const a = asFlowsheet(state, set, ui), fs = a.state.flowsheet, rui = a.ui, u = state.units;
  if (!fs.components.length) { plot.replaceChildren(h("div", { class: "fa-empty" }, "Choose the components (Setup), then the reactions and the reactor.")); side.replaceChildren(); return { data: "Setup: choose the components" }; }
  const sol = solution(a.state, rui);
  const f = rui.fs, RID = rid(fs);
  const shown = f.sel ? f.sel : { kind: "block", id: RID };
  side.replaceChildren(...resultsPanel({ state: a.state, f: { ...f, sel: shown }, sol, u, set: a.set }));
  const b = fs.blocks.find(x => x.id === RID), res = sol.result?.blocks?.[RID] ?? null;
  const kinetic = KINETIC.includes(b.type);
  const avail = Object.keys(CHARTS).filter(k => (k !== "profile" || b.type === "pfr") && (k !== "volume" || b.type === "cstr") && (k !== "rate" || kinetic));
  const chart = avail.includes(rui.chart) ? rui.chart : avail[0];
  const pickChart = h("div", { class: "fug-seg fa-seg", role: "group", "aria-label": "Curves" }, ...avail.map(k =>
    h("button", { type: "button", "aria-pressed": String(k === chart), "data-fk": `rx-chart-${k}`, on: { click: () => { rui.chart = k; set({}); } } }, CHARTS[k])));
  let body;
  try { body = drawChart(chart, { fs: calculatedFlowsheet(a.state), sol, res, rui, set, u, ud: userOverlay(state) }); }
  catch (e) { body = warning(e.message); }
  plot.replaceChildren(h("div", { class: "fa-rx-ws" }, pickChart, body));
  return { data: sol.error ? "Not solved" : res ? "Solved" : sol.status.message };
}

const nameOf = (id, ud) => listComponents({ userData: ud }).find(c => c.id === id)?.name ?? id;
const linspace = (a, b, n) => Array.from({ length: n }, (_, k) => a + (b - a) * k / (n - 1));

/** The reactor recalculated with a changed spec; null where it does not solve (that point is left out). */
function rerun(fs, ud, patch) {
  const RID = rid(fs);
  const doc = { ...fs, blocks: fs.blocks.map(x => (x.id === RID ? { ...x, spec: { ...x.spec, ...patch } } : x)) };
  for (const k of Object.keys(patch)) if (patch[k] == null) delete doc.blocks.find(x => x.id === RID).spec[k];
  try { return runFlowsheet(doc, ud).blocks[RID]; } catch { return null; }
}

function drawChart(chart, { fs, sol, res, rui, set, u, ud }) {
  const RID = rid(fs);
  const b = fs.blocks.find(x => x.id === RID), names = fs.components.map(c => nameOf(c, ud));
  const rxs = (usedReactions(fs).reactions ?? []).map(r => { try { return checkReaction(r, { userData: ud }); } catch { return null; } }).filter(Boolean);
  const feedT = sol.result?.streams?.[fs.streams.find(s => s.to === `${RID}.in`)?.id]?.T_K;
  const T0 = res?.reaction?.equilibrium?.T_K ?? res?.reaction?.kinetic?.T_K ?? b.spec.T_K ?? feedT ?? 500;
  const tU = u.T === "K" ? "K" : "°C";
  if (chart === "profile") {
    if (!res?.reaction?.kinetic?.profile) return h("div", { class: "fa-empty" }, sol.error ?? "Solve the reactor first: its inputs are not complete.");
    return profilePanel({ kin: res.reaction.kinetic, ids: fs.components, names, units: u, sel: rui.profileVar, onSel: k => { rui.profileVar = k; set({}); },
      reactions: Object.keys(res.reaction.extents_kmol_h).map(id => ({ id, name: rxs.find(r => r.id === id)?.name ?? id, units: res.reaction.rates[id].units })) });
  }
  if (chart === "reaction") {
    if (!rxs.length) return h("div", { class: "fa-empty" }, "Write a reaction on the Reactions page (Setup).");
    const Ts = linspace(250, 1000, 61);
    const props = rxs.map(r => Ts.map(T => { try { return reactionProperties(r, T, { userData: ud }); } catch { return null; } }));
    const line = (k, pick) => ({ name: rxs[k].name, color: `var(--fug-s${(k % 6) + 1})`, segments: [{ points: Ts.map((T, i) => ({ x: tToDisplay(T, u), y: props[k][i] ? pick(props[k][i]) : NaN })).filter(p => Number.isFinite(p.y)) }] });
    return h("div", { class: "fa-rx-pair" },
      chartBox({ series: rxs.map((_, k) => line(k, p => p.dH_J_mol / 1000)), xLabel: `T, ${tU}`, yLabel: "ΔrH, kJ/mol", x0: tToDisplay(250, u), x1: tToDisplay(1000, u), aria: "Heat of reaction against temperature", fk: "rx-dh" }),
      chartBox({ series: rxs.map((_, k) => line(k, p => p.lnK ?? NaN)), xLabel: `T, ${tU}`, yLabel: "ln K", x0: tToDisplay(250, u), x1: tToDisplay(1000, u), aria: "ln K against temperature", fk: "rx-lnk" }),
      h("p", { class: "fug-foot" }, "In each reaction's standard state (ideal gases at 100 kPa, or pure liquids), from the components' formation data and heat capacities; a curve stops where a record's range ends."));
  }
  if (chart === "rate") {
    const sys = flowsheetSystem(fs, ud);
    const feed = sol.result?.streams?.[fs.streams.find(s => s.to === `${RID}.in`)?.id];
    if (!feed) return h("div", { class: "fa-empty" }, "Give the feed (Edit, Feed) to see the rates at its composition.");
    const n = fs.components.map(c => feed.flow_kmol_h[c]), P = feed.P_kPa;
    const kin = rxs.filter(r => r.rate);
    if (!kin.length) return h("div", { class: "fa-empty" }, "Give the reactions' kinetics on the Reactions page.");
    const Ts = linspace(Math.max(200, T0 - 150), T0 + 150, 41);
    const series = kin.map((r, k) => ({ name: r.name, color: `var(--fug-s${(k % 6) + 1})`, segments: [{ points: Ts.map(T => {
      try { const st = phaseStates(sys, n, T, P, [r.phase], false); const ph = st.phases[r.phase]; return { x: tToDisplay(T, u), y: reactionRate(r, { T_K: T, P_kPa: P, bases: ph.bases }, { userData: ud }).r }; }
      catch { return { x: 0, y: NaN }; }
    }).filter(p => Number.isFinite(p.y)) }] }));
    return h("div", {}, chartBox({ series, xLabel: `T, ${tU}`, yLabel: `r, ${kin[0].rate.units}`, x0: tToDisplay(Ts[0], u), x1: tToDisplay(Ts.at(-1), u), aria: "Rates against temperature at the feed's composition", fk: "rx-rate" }),
      h("p", { class: "fug-foot" }, "Each rate at the feed's composition and pressure, the whole feed in the reaction's phase: how fast each reaction starts at each temperature."));
  }
  // sweeps: the reactor recalculated at each temperature (isothermal) or volume
  const vary = chart === "temperature" ? "T" : "V";
  const xs = vary === "T" ? linspace(Math.max(200, T0 - 150), T0 + 150, 13) : linspace((b.spec.V_m3 ?? 1) / 12, (b.spec.V_m3 ?? 1) * 3, 13);
  const key = JSON.stringify([fs, vary]);
  if (rui.sweep?.key !== key) {
    if (!rui.sweepRun) {
      return h("div", { class: "fa-empty" }, h("p", {}, `The reactor is calculated ${xs.length} times, ${vary === "T" ? `at temperatures from ${fmtShort(tToDisplay(xs[0], u), 4)} to ${fmtShort(tToDisplay(xs.at(-1), u), 4)} ${tU} (isothermal at each)` : "at volumes up to three times the given one"}.`),
        h("button", { type: "button", class: "fa-mini", "data-fk": "rx-sweep-run", on: { click: () => { rui.sweepRun = true; set({}); } } }, icon("solve", 14), "Calculate the curves"));
    }
    rui.sweepRun = false;
    const pts = xs.map(x => ({ x, r: rerun(fs, ud, vary === "T" ? { T_K: x, duty_kW: null, coolant: null } : { V_m3: x }) }));
    rui.sweep = { key, pts };
  }
  const pts = rui.sweep.pts.filter(p => p.r);
  if (!pts.length) return warning("The reactor did not solve at any point of the curve: check its inputs.");
  const sel = ["X", "y", "duty"].includes(rui.sweepVar) ? rui.sweepVar : "X";
  const px = p => (vary === "T" ? tToDisplay(p.x, u) : p.x);
  const line = (name, k, f) => ({ name, color: `var(--fug-s${(k % 6) + 1})`, segments: [{ points: pts.map(p => ({ x: px(p), y: f(p.r) })).filter(q => Number.isFinite(q.y)) }] });
  const series = sel === "X" ? fs.components.map((c, i) => (pts.some(p => p.r.reaction.keyConversion?.[c] != null) ? line(names[i], i, r => r.reaction.keyConversion?.[c] ?? NaN) : null)).filter(Boolean)
    : sel === "y" ? fs.components.map((c, i) => line(names[i], i, r => { const o = r.outlets.out; const F = o.flows.reduce((s, v) => s + v, 0); return o.flows[i] / F; }))
      : [line("Duty", 0, r => r.duty_kW)];
  return h("div", {},
    h("div", { class: "fug-seg fa-seg", role: "group", "aria-label": "Quantity" }, ...[["X", "Conversion"], ["y", "Outlet mole fractions"], ["duty", "Duty"]].map(([k, l]) =>
      h("button", { type: "button", "aria-pressed": String(k === sel), "data-fk": `rx-sweep-${k}`, on: { click: () => { rui.sweepVar = k; set({}); } } }, l))),
    chartBox({ series, xLabel: vary === "T" ? `T, ${tU}` : "V, m³", yLabel: sel === "X" ? "Conversion" : sel === "y" ? "y, mol/mol" : "Duty, kW",
      x0: px(pts[0]), x1: px(pts.at(-1)), aria: `The reactor against ${vary === "T" ? "temperature" : "volume"}`, fk: "rx-sweep" }),
    h("p", { class: "fug-foot" }, `${pts.length} of ${xs.length} points solved. ${vary === "T" ? "At each temperature the reactor is isothermal; an equilibrium reactor gives the equilibrium conversion." : "The CSTR at each volume, at its given temperature or duty."}`));
}
