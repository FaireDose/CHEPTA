/**
 * The Column workspace of the Unit models (proposal 0015, Part II, step 4; milestone M2b; workstream W5). A flowsheet
 * of its own (state.column: a feed, one column, its distillate and bottoms), solved by the same engine and edited with
 * the same panels as the Flowsheet workspace (flowsheet-view.js, through `asFlowsheet`), as the Reactor workspace is.
 * It is solved through the request path in the Web Worker where the page allows one (contract 7), with the Stop button.
 * The canvas shows:
 *   - the profile of a rigorous column: temperature, liquid and vapour flows, and the compositions, stage by stage;
 *   - McCabe-Thiele's diagram for a binary (column-mccabe.js): the equilibrium curve from the column's own property
 *     method, the q-line, the operating lines, the stages stepped off and the minimum-reflux pinch, beside the shortcut's
 *     or the rigorous column's own numbers;
 *   - the column's table (flowsheet-view.js columnTable), and the SVG and PNG of each chart (export-image.js).
 * A view (layer 6): every number comes from the engine.
 */
import { h, ticks } from "./dom.js";
import { icon } from "./icons.js";
import { emptyFlowsheet, flowsheetSystem } from "../flowsheet/document.js";
import { addBlock, addFeedTo } from "./flowsheet-logic.js";
import { flowsheetInputs, ensureUi, solution, resultsPanel, flowsheetKey, columnTable } from "./flowsheet-view.js";
import { chartBox } from "./reactor-charts.js";
import { drawPlot } from "./plot.js";
import { calculatedFlowsheet, userOverlay } from "./app-logic.js";
import { listComponents } from "../thermo/system.js";
import { tLabel, tToDisplay, fmtShort } from "./properties-logic.js";
import { warning } from "./warning.js";
import { columnBinary, equilibriumCurve, mccabeThiele } from "./column-mccabe.js";
import { imageButtons } from "./export-image.js";

const cid = fs => fs.blocks.find(b => b.type === "column")?.id;

/** The workspace's document with its column: a feed, the column and its two products. */
export function columnDocument(doc) {
  const fs = doc ?? emptyFlowsheet();
  if (cid(fs)) return fs;
  const r = addBlock({ ...fs, blocks: [], streams: [] }, "column", { x: 260, y: 160 });
  const out = addFeedTo(r.fs, `${r.id}.in`).fs;
  return { ...fs, blocks: out.blocks, streams: out.streams };
}

/** A worked example to start from: benzene + toluene, half and half, saturated liquid at 101.325 kPa, with Peng-Robinson
 *  for both phases (nonpolar hydrocarbons: docs/METHOD_SELECTION.md rules 2 and 6, as W7's case B2). */
export function columnExample() {
  const fs = columnDocument({ ...emptyFlowsheet(), components: ["benzene", "toluene"], thermo: { model: "PR" } });
  return { ...fs, blocks: fs.blocks.map(b => (b.type === "feed" ? { ...b, spec: { flow_kmol_h: { benzene: 50, toluene: 50 }, P_kPa: 101.325, VF: 0 } }
    : b.type === "column" ? { ...b, spec: { mode: "shortcut", light_key: "benzene", heavy_key: "toluene", recovery_light_key_in_distillate: 0.95,
      recovery_heavy_key_in_bottoms: 0.95, reflux_over_minimum: 1.3, condenser: "total" } } : b)) };
}

/** The workspace seen as the Flowsheet workspace: its own document, history-free, and its own selection. */
export function asFlowsheet(state, set, ui) {
  const fs = columnDocument(state.column);
  const st = { ...state, flowsheet: fs };
  const put = patch => {
    if (!("flowsheet" in patch)) return set(patch);
    const { flowsheet, ...rest } = patch;
    set({ ...rest, column: flowsheet });
  };
  const cui = (ui.col ??= {});
  ensureUi(cui);
  return { state: st, set: put, ui: cui };
}

/** The column's spec in the other mode: switching to rigorous starts from the shortcut's stages, feed, reflux and distillate. */
export function switchMode(spec, mode, done) {
  if (mode !== "rigorous") return { ...spec, mode };
  const s = done?.state;
  return { ...spec, mode, stages: spec.stages ?? s?.stages ?? 20, feed_stage: spec.feed_stage ?? s?.feed_stage ?? 10,
    ...(spec.reflux_ratio == null ? { reflux_ratio: +(s?.R ?? 2).toPrecision(3) } : {}),
    ...(spec.distillate_kmol_h == null && spec.bottoms_kmol_h == null && s?.D_kmol_h != null ? { distillate_kmol_h: +s.D_kmol_h.toPrecision(4) } : {}) };
}

/** The ribbon: the setup, the column's method, and what the Inputs panel shows. */
export function columnRibbon({ state, set, ui, group, smallButton }) {
  const a = asFlowsheet(state, set, ui), f = a.ui.fs, fs = a.state.flowsheet;
  const CID = cid(fs), b = fs.blocks.find(x => x.id === CID), feed = fs.streams.find(s => s.to === `${CID}.in`);
  const ready = fs.components.length > 0;
  const page = (ico, label, p, fk) => smallButton({ ico, label, fk, pressed: !f.sel && (f.setup ?? "components") === p, onClick: () => { f.sel = null; f.setup = p; set({}); } });
  const pick = (ico, label, sel, fk) => { const x = smallButton({ ico, label, fk, pressed: f.sel?.id === sel.id, onClick: () => { f.sel = sel; set({}); } }); x.disabled = !ready; return x; };
  const mode = b.spec?.mode ?? "shortcut";
  const done = f.cache?.result?.blocks?.[CID];
  return [
    group("Setup", h("div", { class: "fa-rows2" },
      page("flask", `Components${ready ? ` (${fs.components.length})` : ""}`, "components", "col-setup"),
      page("cubic", `Method: ${fs.thermo.model}`, "method", "col-method"))),
    group("Column", h("div", { class: "fug-seg fa-seg", role: "group", "aria-label": "Column method" }, ...[["shortcut", "Shortcut"], ["rigorous", "Rigorous"]].map(([m, l]) =>
      h("button", { type: "button", "aria-pressed": String(mode === m), "data-fk": `col-mode-${m}`, disabled: !ready,
        on: { click: () => { if (mode !== m) { f.sel = { kind: "block", id: CID }; a.set({ flowsheet: { ...fs, blocks: fs.blocks.map(x => (x.id === CID ? { ...x, spec: switchMode(x.spec ?? {}, m, done) } : x)) } }); } } } }, l)))),
    group("Edit", h("div", { class: "fa-rows2" },
      pick("feed", "Feed", { kind: "stream", id: feed?.id }, "col-feed"),
      pick("column", "Column", { kind: "block", id: CID }, "col-block"))),
  ];
}

/** The Inputs panel: the Flowsheet workspace's own, on this document. */
export function columnInputs({ state, set, ui, uid, inputsSection }) {
  const a = asFlowsheet(state, set, ui);
  return flowsheetInputs({ ...a, uid, inputsSection });
}

/** The key that redraws the view. */
export const columnKey = (state, ui) => { const a = asFlowsheet(state, () => {}, ui); return [flowsheetKey(a.state), a.ui.fs.sel, a.ui.chart, !!a.ui.fs.pending, a.ui.fs.cache?.key ?? null]; };

const CHARTS = { mccabe: "McCabe-Thiele", T: "Temperature", flows: "Flows", x: "Compositions" };
const nameOf = (id, ud) => listComponents({ userData: ud }).find(c => c.id === id)?.name ?? id;

/** The canvas: the column's results beside, the charts and the profile table. */
export function columnView(ctx) {
  const { state, set, plot, side, below, notes, ui, compact } = ctx;
  const a = asFlowsheet(state, set, ui), fs = a.state.flowsheet, cui = a.ui, u = state.units, f = cui.fs;
  if (!fs.components.length) {
    plot.replaceChildren(h("div", { class: "fa-empty fa-need" },
      h("p", {}, "Choose the components (Setup, Components), then give the feed and the column (Edit)."),
      h("button", { type: "button", class: "fa-mini", "data-fk": "col-example", on: { click: () => { f.sel = { kind: "block", id: "C1" }; a.set({ flowsheet: columnExample() }); } } },
        icon("column", 14), "Start from an example: benzene and toluene")));
    side.replaceChildren();
    below?.replaceChildren();
    return { data: "Setup: choose the components" };
  }
  const sol = solution(a.state, cui, () => { ui.drawnKey = null; set({}); });
  const CID = cid(fs), shown = f.sel ? f.sel : { kind: "block", id: CID };
  side.replaceChildren(...resultsPanel({ state: a.state, f: { ...f, sel: shown }, sol, u, set: a.set }));
  if (sol.pending) {
    notes.append(h("div", { class: "fa-in-hint", role: "status", "data-fk": "col-solving" }, "Solving in the background… ",
      h("button", { type: "button", class: "fa-mini", "data-fk": "col-stop", on: { click: () => f.pending?.cancel("Stopped from the workbench.") } }, "Stop")));
  }
  const res = sol.result, r = res?.blocks?.[CID] ?? null, b = fs.blocks.find(x => x.id === CID);
  below?.replaceChildren(...(r?.profile ? [columnTable({ fs, b, r, u })] : []));
  if (!r) {
    const why = sol.pending ? "Solving…" : sol.error ?? sol.status?.message ?? "Give the feed and the column's specifications (Edit).";
    plot.replaceChildren(sol.error ? warning(sol.error, { attrs: { role: "alert", "data-fk": "col-error" }, open: true }) : h("div", { class: "fa-empty fa-need" }, why));
    return { data: sol.error ? "Not solved" : why, error: sol.error ?? null };
  }
  const rigorous = r.state?.mode === "rigorous";
  const avail = Object.keys(CHARTS).filter(k => k === "mccabe" ? fs.components.length === 2 : rigorous);
  const chart = avail.includes(cui.chart) ? cui.chart : avail[0];
  const pickChart = avail.length > 1 ? h("div", { class: "fug-seg fa-seg", role: "group", "aria-label": "Chart" }, ...avail.map(k =>
    h("button", { type: "button", "aria-pressed": String(k === chart), "data-fk": `col-chart-${k}`, on: { click: () => { cui.chart = k; set({}); } } }, CHARTS[k]))) : null;
  let body;
  if (!chart) {
    body = h("div", { class: "fa-empty" }, "The shortcut gives the condenser, the feed stage and the reboiler (the table below). The rigorous method gives every stage, drawn here; McCabe-Thiele's diagram is drawn for two components.");
  } else {
    try {
      body = chart === "mccabe" ? mccabePanel({ st0: a.state, fs, res, r, cui, u, ud: userOverlay(state), compact })
        : profileChart(chart, { fs, r, u, ud: userOverlay(state), compact });
    } catch (e) { body = warning(e.message, { attrs: { "data-fk": "col-chart-error" }, open: true }); }
  }
  plot.replaceChildren(h("div", { class: "fa-rx-ws" }, ...(pickChart ? [pickChart] : []), body));
  const exp = () => columnExport({ fs, r, mt: cui.mt?.mt ?? null, curve: cui.mt?.curve ?? null, ud: userOverlay(state) });
  return { export: exp, data: rigorous ? `${r.state.stages} stages, R ${fmtShort(r.state.reflux_ratio, 4)}` : `N ${fmtShort(r.state.N, 4)}, R ${fmtShort(r.state.R, 4)} (R_min ${fmtShort(r.state.R_min, 4)})` };
}

/** A chart in a box with its SVG and PNG buttons. */
function withImage(box, name, fk) {
  return h("div", {}, box, imageButtons(box, name, fk));
}

/** The end of the stage axis from 0: N, or a little more, so that its ticks fall on whole stages (phone and desktop). */
const stageAxisEnd = N => { for (let e = N; e < N + 6; e++) if ([4, 6].every(n => Number.isInteger(ticks(0, e, n).step))) return e; return N; };

/** The rigorous column's profile: T, the flows, or the compositions against the stage. */
function profileChart(kind, { fs, r, u, ud, compact }) {
  const p = r.profile, N = p.length, names = fs.components.map(c => nameOf(c, ud));
  const pts = f => p.map(s => ({ x: s.stage, y: f(s) })).filter(q => Number.isFinite(q.y));
  let series, yLabel, aria;
  if (kind === "T") {
    series = [{ name: "T", color: "var(--fug-s1)", segments: [{ points: pts(s => tToDisplay(s.T_K, u)) }], markers: [] }];
    yLabel = `T, ${tLabel(u)}`; aria = "Temperature on each stage";
  } else if (kind === "flows") {
    series = [{ name: "Liquid", color: "var(--fug-liq)", segments: [{ points: pts(s => s.L_kmol_h) }] },
      { name: "Vapour", color: "var(--fug-vap)", segments: [{ points: pts(s => s.V_kmol_h) }] }];
    yLabel = "Flow leaving the stage, kmol/h"; aria = "Liquid and vapour flows on each stage";
  } else {
    series = fs.components.flatMap((c, i) => [
      { name: `x ${names[i]}`, color: `var(--fug-s${(i % 6) + 1})`, segments: [{ points: pts(s => s.x?.[c]) }] },
      { name: `y ${names[i]}`, color: `var(--fug-s${(i % 6) + 1})`, dash: "5 4", segments: [{ points: pts(s => s.y?.[c] ?? NaN) }] }]);
    yLabel = "Mole fraction"; aria = "Liquid (x) and vapour (y) mole fractions on each stage";
  }
  // a legend under the chart: direct labels at the curves' ends would be cut at a phone's width
  const box = chartBox({ series: series.map(sr => ({ ...sr, label: false })), xLabel: "Stage (1 the condenser)", yLabel, x0: 0, x1: stageAxisEnd(N), aria, compact, fk: `col-${kind}` });
  if (series.length > 1) {
    box.append(h("div", { class: "fug-legend" }, ...series.map(sr => h("span", { class: "fug-key", style: `color:${sr.color}` },
      h("i", { style: sr.dash ? "border-top-style:dashed" : "" }), h("span", { style: "color:var(--fug-fg2)" }, sr.name)))));
  }
  return h("div", {}, withImage(box, `column ${kind === "T" ? "temperature" : kind === "flows" ? "flows" : "compositions"}`, `col-img-${kind}`),
    h("p", { class: "fug-foot" }, kind === "x" ? "Solid lines: the liquid leaving each stage; dashed: the vapour. Stage 1 is the condenser, the last stage the reboiler."
      : `Stage 1 is the ${r.state.condenser} condenser, stage ${N} the reboiler; the feed enters stage ${r.state.feed_stages.join(", ")}.`));
}

/** McCabe-Thiele's diagram for the solved binary column, with its numbers beside the column's own. */
function mccabePanel({ st0, fs, res, r, cui, u, ud, compact }) {
  // the method as the column was solved with it: the parameter sets chosen in the Library included
  const sys = flowsheetSystem(calculatedFlowsheet(st0), ud);
  const CID = cid(fs), b = fs.blocks.find(x => x.id === CID);
  const inp = columnBinary(sys, fs, res, CID);
  if (!inp.ok) return h("div", { class: "fa-empty" }, inp.why);
  const st = r.state, rigorous = st.mode === "rigorous";
  const key = JSON.stringify([calculatedFlowsheet(st0), res.blocks[CID].state, ud]);
  if (cui.mt?.key !== key) {
    const curve = equilibriumCurve(sys, inp.i, inp.P_kPa);
    let mt = null, err = null, best = null;
    try {
      mt = mccabeThiele({ sys, ...inp, curve, feedStage: rigorous && st.feed_stages.length === 1 ? st.feed_stages[0] : null });
      best = rigorous ? mccabeThiele({ sys, ...inp, curve }) : null;
    } catch (e) { err = e.message; }
    cui.mt = { key, curve, mt, err, best };
  }
  const { curve, mt, err, best } = cui.mt;
  const light = nameOf(sys.ids[inp.i], ud);
  if (err) return warning(err, { attrs: { "data-fk": "col-mt-error" }, open: true });
  // the drawing: diagonal, equilibrium curve, q-line, operating lines, steps, pinch, products, the rigorous stages
  const steps = [{ x: inp.xD, y: inp.xD }];
  for (const s of mt.steps) {
    steps.push({ x: s.x, y: s.y });
    steps.push({ x: s.x, y: s.y_next ?? s.x });
  }
  // a legend under the chart instead of direct labels: the curves meet near the pinch, where labels would overlap
  const many = mt.steps.length > 12;
  const series = [
    { name: "", label: false, color: "var(--fug-rule)", width: 1.5, segments: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] },
    { name: "Equilibrium", label: false, color: "var(--fug-s1)", segments: [{ points: curve.map(p => ({ x: p.x, y: p.y })) }] },
    { name: "q-line", label: false, color: "var(--fug-muted)", dash: "4 3", segments: [{ points: [{ x: inp.z, y: inp.z }, { x: mt.pinch.x_q, y: mt.pinch.y_q }] }] },
    { name: "Operating", label: false, color: "var(--fug-s2)", segments: [{ points: [{ x: inp.xB, y: inp.xB }, { x: mt.cross.x, y: mt.cross.y }, { x: inp.xD, y: inp.xD }] }] },
    { name: "Stages", label: false, color: "var(--fug-s3)", width: 1.5, segments: [{ points: steps }],
      markers: mt.steps.map(s => ({ x: s.x, y: s.y, shape: "dot", label: s.stage === mt.feedStep ? `${s.stage}, feed` : !many || s.stage % 5 === 0 || s.stage === mt.steps.length ? String(s.stage) : undefined })) },
    { name: "", label: false, color: "var(--fa-mark)", segments: [{ points: [] }],
      markers: [{ x: mt.pinch.x, y: mt.pinch.y, shape: "open" }, { x: inp.xD, y: inp.xD, shape: "dot" }, { x: inp.xB, y: inp.xB, shape: "dot" }, { x: inp.z, y: inp.z, shape: "dot" }] },
  ];
  if (rigorous) {
    // the rigorous column's own operating points: the liquid leaving stage n against the vapour rising from n + 1
    const ops = r.profile.slice(0, -1).map((s, k) => ({ x: s.x[sys.ids[inp.i]], y: r.profile[k + 1].y?.[sys.ids[inp.i]] })).filter(q => Number.isFinite(q.y));
    series.push({ name: "", label: false, color: "var(--fug-s4)", segments: [{ points: [] }], markers: ops.map(q => ({ ...q, shape: "cross" })) });
  }
  const holder = h("div", { class: "fug-plot", "data-fk": "col-mccabe" });
  const read = h("div", { class: "fug-foot", "aria-live": "polite" });
  const at = x => { let k = curve.findIndex(p => p.x >= x); if (k <= 0) return curve[Math.max(k, 0)]; const p0 = curve[k - 1], p1 = curve[k], t = (x - p0.x) / (p1.x - p0.x); return { y: p0.y + t * (p1.y - p0.y), T: p0.T_K + t * (p1.T_K - p0.T_K) }; };
  const move = drawPlot(holder, { compact, series: series.map(s => (s.segments[0].points.length ? s : { ...s, segments: [{ points: [{ x: NaN, y: NaN }] }] })),
    xLabel: `x, ${light} in the liquid`, yLabel: `y, ${light} in the vapour`, x0: 0, x1: 1, y: [0, 1], aria: `McCabe-Thiele diagram of ${light}`,
    show: x => { const p = at(x); read.textContent = `x ${fmtShort(x, 3)}: y* ${fmtShort(p.y, 4)}, bubble point ${fmtShort(tToDisplay(p.T ?? p.T_K, u), 4)} ${tLabel(u)}`; return series.map((_, k) => (k === 1 ? p.y : null)); } });
  move(inp.z);
  const stagesCol = rigorous ? st.stages - (inp.partial ? 0 : 1) : st.N;
  const rows = [
    ["Equilibrium stages (reboiler included, a total condenser not)", fmtShort(mt.stages, 4), fmtShort(stagesCol, 4)],
    ...(rigorous ? [["With the best feed stage", fmtShort(best.stages, 4), "–"]] : []),
    ["Feed stage (from the top, 1 the condenser)", String(mt.feedStep + (inp.partial ? 0 : 1)), rigorous ? st.feed_stages.join(", ") : String(st.feed_stage)],
    ["Minimum reflux ratio", fmtShort(mt.pinch.R_min, 4), rigorous ? "–" : fmtShort(st.R_min, 4)],
    ["Minimum stages (total reflux)", mt.total == null ? "–" : fmtShort(mt.total, 4), rigorous ? "–" : fmtShort(st.N_min, 4)],
    ["Reflux ratio", fmtShort(inp.R, 4), fmtShort(inp.R, 4)],
    ["Feed liquid fraction q", fmtShort(inp.q, 4), rigorous ? "–" : fmtShort(st.q, 4)],
  ];
  const table = h("table", { class: "fug-table", "data-fk": "col-mt-table" },
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, ""), h("th", { scope: "col" }, "McCabe-Thiele"), h("th", { scope: "col" }, rigorous ? "Rigorous column" : "Shortcut"))),
    h("tbody", {}, ...rows.map(([l, m, c]) => h("tr", {}, h("th", { scope: "row" }, l), h("td", { class: "fug-num" }, m), h("td", { class: "fug-num" }, c)))));
  const legendKey = (color, label, style = "") => h("span", { class: "fug-key", style: `color:${color}` }, h("i", { style }), h("span", { style: "color:var(--fug-fg2)" }, label));
  const legend = h("div", { class: "fug-legend" }, legendKey("var(--fug-s1)", "Equilibrium curve"), legendKey("var(--fug-s2)", "Operating lines"),
    legendKey("var(--fug-muted)", "q-line", "border-top-style:dashed"), legendKey("var(--fug-s3)", `Stages, ${fmtShort(mt.stages, 3)}`),
    legendKey("var(--fa-mark)", `Pinch (ring), R min ${fmtShort(mt.pinch.R_min, 3)}; dots: x_B, z, x_D`),
    ...(rigorous ? [legendKey("var(--fug-s4)", "Rigorous column (crosses)")] : []));
  const box = h("div", { class: "fa-rx-chart" }, holder, legend, read);
  return h("div", {}, withImage(box, `mccabe-thiele ${sys.ids.join(" ")}`, "col-img-mt"),
    h("div", { class: "fug-scroll" }, table),
    h("p", { class: "fug-foot" }, `The equilibrium curve from ${fs.thermo.model} at ${fmtShort(inp.P_kPa, 5)} kPa (the bubble point of each liquid); straight operating lines by constant molar overflow, as McCabe and Thiele drew them (The ChemSep Book, 2nd ed., section 1.3.3, public domain). ${mt.pinch.kind === "tangent" ? "The pinch is a tangent: the curve bends towards the diagonal before the feed." : "The pinch is where the q-line meets the curve."} ${rigorous ? "Crosses: the rigorous column's own liquid and vapour between stages; where they leave the straight lines, the flows are not constant (heats of vaporization differ) and the step count differs from the column's." : "The shortcut takes a constant relative volatility and Gilliland's correlation, so its stages are an estimate; McCabe-Thiele steps on the method's own curve."}`));
}

/** The numbers behind the canvas for the Excel download (diagram-export.js): the profile and McCabe-Thiele's construction. */
export function columnExport({ fs, r, mt, curve, ud }) {
  const names = fs.components.map(c => nameOf(c, ud)), st = r.state, p = r.profile;
  const tables = [{ name: "Profile", note: st.mode === "rigorous" ? "Every stage of the rigorous column: the liquid and vapour leaving it." : "The shortcut's condenser, feed stage and reboiler; flows by constant molar overflow.",
    columns: [{ label: "Stage" }, { label: "Name" }, { label: "T", unit: "K" }, { label: "P", unit: "kPa" }, { label: "Liquid", unit: "kmol/h" }, { label: "Vapour", unit: "kmol/h" }, { label: "Duty", unit: "kW" },
      ...names.map(n => ({ label: `x ${n}`, unit: "mol/mol" })), ...names.map(n => ({ label: `y ${n}`, unit: "mol/mol" }))],
    rows: p.map(s => [s.stage, s.name, s.T_K, s.P_kPa, s.L_kmol_h, s.V_kmol_h, s.duty_kW, ...fs.components.map(c => s.x?.[c] ?? null), ...fs.components.map(c => s.y?.[c] ?? null)]) }];
  if (mt && curve) {
    tables.push({ name: "Equilibrium curve", note: `The bubble point of each liquid at the column's pressure, ${fs.thermo.model}.`,
      columns: [{ label: "x", unit: "mol/mol" }, { label: "y*", unit: "mol/mol" }, { label: "T", unit: "K" }], rows: curve.map(q => [q.x, q.y, q.T_K]) });
    tables.push({ name: "McCabe-Thiele stages", note: `Stepped off from the distillate: ${+mt.stages.toPrecision(4)} equilibrium stages; minimum reflux ${+mt.pinch.R_min.toPrecision(4)} (pinch at x ${+mt.pinch.x.toPrecision(4)}, ${mt.pinch.kind}).`,
      columns: [{ label: "Step" }, { label: "x leaving", unit: "mol/mol" }, { label: "y leaving", unit: "mol/mol" }, { label: "y rising from below", unit: "mol/mol" }],
      rows: mt.steps.map(s => [s.stage, s.x, s.y, s.y_next ?? null]) });
  }
  return { title: `Column of ${names.join(" and ")} (${st.mode})`, file: `column ${fs.components.join(" ")}`,
    about: [["Method", fs.thermo.model], ["Column", st.mode === "rigorous" ? `rigorous, ${st.stages} stages, feed on ${st.feed_stages.join(", ")}` : `shortcut, N ${+st.N.toPrecision(4)}`],
      ["Pressure, kPa", st.P_kPa], ["McCabe-Thiele", "The ChemSep Book, 2nd ed. (Kooijman and Taylor, 2006; public domain), section 1.3.3"]],
    tables };
}
