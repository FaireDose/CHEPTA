/**
 * The Charts workspace (proposal 0013, step 7): temperature-entropy, pressure-enthalpy and enthalpy-entropy (Mollier)
 * charts, of water and steam (IAPWS-IF97) or of any fluid or mixture with an equation of state
 * (src/equilibrium/charts.js), with the two-phase dome, isobars or isotherms, lines of constant vapour fraction and a
 * compression drawn on it. Per kg, as steam charts are: kJ/kg and kJ/(kg K); a fluid's molar values are divided by
 * its molar mass. Drawing only (layer 6): every number comes from the engine.
 */
import { h } from "./dom.js";
import { drawPlot } from "./plot.js";
import { steam, steamSat } from "../thermo/iapws/steam.js";
import { propertyChart } from "../equilibrium/charts.js";
import { flash } from "../equilibrium/flash.js";
import { icon } from "./icons.js";
import { tToDisplay, pToDisplay, tFromDisplay, pFromDisplay, fmtNum, fmtShort, linspace } from "./properties-logic.js";
import { fmtP, fmtTemp } from "./app-logic.js";

const SERIES = n => `var(--fug-s${(n % 6) + 1})`;
const tU = u => (u.T === "K" ? "K" : "°C");
/** The charts, as the ribbon names them. */
export const CHART_KINDS = [["TS", "T-s"], ["PH", "P-h"], ["HS", "h-s"]];
export const CHART_TITLE = { TS: "Temperature-entropy chart", PH: "Pressure-enthalpy chart", HS: "Enthalpy-entropy (Mollier) chart" };
const T_TRIPLE = 273.16, T_CRIT = 647.096, P_CRIT = 22064;

/**
 * Water and steam from IAPWS-IF97 in the shape of propertyChart (per kg: h kJ/kg, s kJ/(kg K)): the dome from the
 * triple point to the critical point, isobars from 273.16 to 1073.15 K, isotherms from 1 kPa to 100 MPa, and lines of
 * constant vapour fraction by the lever rule.
 */
export function waterChart({ P_kPa = [], T_K = [], VF = [] } = {}) {
  const pt = (T, P, st, VF) => ({ T_K: T, P_kPa: P, h: st.h_kJ_kg, s: st.s_kJ_kgK, VF });
  const domeT = linspace(0, 1, 70).map(f => T_TRIPLE + (T_CRIT - 0.01 - T_TRIPLE) * (1 - (1 - f) ** 2));
  const sat = domeT.map(T => steamSat({ T_K: T }));
  const liquid = sat.map(r => pt(r.T_K, r.P_kPa, r.liquid, 0)), vapour = sat.map(r => pt(r.T_K, r.P_kPa, r.vapour, 1));
  const safe = (T, P) => { try { return steam(T, P); } catch { return null; } };
  const isobars = P_kPa.map(P => {
    const pts = linspace(T_TRIPLE, 1073.15, 120).map(T => { const st = safe(T, P); return st ? pt(T, P, st, null) : null; }).filter(Boolean);
    if (P < P_CRIT) { const r = steamSat({ P_kPa: P }); pts.push(pt(r.T_K, P, r.liquid, 0), pt(r.T_K, P, r.vapour, 1)); }
    return { P_kPa: P, points: pts.sort((a, b) => a.s - b.s) };
  });
  const isotherms = T_K.map(T => {
    const pts = linspace(0, 1, 90).map(f => 1 * (1e5) ** f).map(P => { const st = safe(T, P); return st ? pt(T, P, st, null) : null; }).filter(Boolean);
    if (T < T_CRIT) { const r = steamSat({ T_K: T }); pts.push(pt(T, r.P_kPa, r.liquid, 0), pt(T, r.P_kPa, r.vapour, 1)); }
    return { T_K: T, points: pts.sort((a, b) => a.s - b.s) };
  });
  const quality = VF.map(q => ({ VF: q, points: liquid.map((L, k) => ({ T_K: L.T_K, P_kPa: L.P_kPa, VF: q, h: L.h + q * (vapour[k].h - L.h), s: L.s + q * (vapour[k].s - L.s) })) }));
  const c = steamSat({ T_K: T_CRIT - 0.01 });
  return { dome: { liquid, vapour, critical: pt(T_CRIT, P_CRIT, { h_kJ_kg: (c.liquid.h_kJ_kg + c.vapour.h_kJ_kg) / 2, s_kJ_kgK: (c.liquid.s_kJ_kgK + c.vapour.s_kJ_kgK) / 2 }, null) },
    isobars, isotherms, quality, compression: null, notes: [], perKg: true };
}

/** A fluid's chart (propertyChart) per kg: MW in g/mol, so J/mol / MW = kJ/kg. */
export function fluidChart(sys, z, chart, MW) {
  const c = propertyChart(sys, z, { P_kPa: chart.P_kPa, T_K: chart.T_K, VF: [0.25, 0.5, 0.75], compression: chart.compression ?? undefined });
  const kg = p => (p ? { ...p, h: p.h_J_mol / MW, s: p.s_J_molK / MW } : p);
  const lines = list => list.map(l => ({ ...l, points: l.points.map(kg) }));
  return {
    dome: { liquid: c.dome.liquid.map(kg), vapour: c.dome.vapour.map(kg), critical: c.dome.critical?.h_J_mol != null ? kg(c.dome.critical) : null },
    isobars: lines(c.isobars), isotherms: lines(c.isotherms), quality: lines(c.quality), notes: c.notes, perKg: true,
    compression: c.compression ? { ...c.compression, inlet: kg(c.compression.inlet), isentropic: kg(c.compression.isentropic), outlet: kg(c.compression.outlet),
      w_s_kJ_kg: c.compression.w_s_J_mol / MW, w_kJ_kg: c.compression.w_J_mol / MW } : null,
  };
}

// ---------------------------------------------------------------------------------------
// State points: placed by a click on the chart or typed, each a state from two of T, P, h, s, VF (h and s per kg)

/** The specifications of a state point, as the form offers them: [id, label, the two keys]. */
export const POINT_SPECS = [["TP", "T and P", ["T_K", "P_kPa"]], ["Ph", "P and h", ["P_kPa", "h_kJ_kg"]], ["Ps", "P and s", ["P_kPa", "s_kJ_kgK"]],
  ["PVF", "P and vapour fraction", ["P_kPa", "VF"]], ["TVF", "T and vapour fraction", ["T_K", "VF"]]];
/** At most this many points on a chart. */
export const MAX_POINTS = 12;
const specKind = spec => POINT_SPECS.find(([, , keys]) => keys.every(k => spec?.[k] != null) && Object.keys(spec).filter(k => spec[k] != null).length === 2);

/** A fluid's state point (per kg; MW in g/mol) from its specification: a flash of the feed with its entropy. */
export function fluidPoint(sys, z, MW, spec) {
  const kind = specKind(spec);
  if (!kind) throw new Error("A point needs two of T, P, h, s and VF: T and P, P and h, P and s, P and VF, or T and VF.");
  const f = { T_K: "T", P_kPa: "P", VF: "VF" };
  const fs = { z };
  for (const k of kind[2]) {
    if (k === "h_kJ_kg") fs.H = spec.h_kJ_kg * MW;
    else if (k === "s_kJ_kgK") fs.S = spec.s_kJ_kgK * MW;
    else fs[f[k]] = spec[k];
  }
  const r = flash(sys, fs, { entropy: true });
  return { T_K: r.T, P_kPa: r.P, h: r.H_J_mol / MW, s: r.S_J_molK / MW, VF: r.VF };
}

/** Water's state point from IAPWS-IF97 (per kg): T and P, or P (or T) with a vapour fraction, or P with h or s. */
export function waterPoint(spec) {
  const kind = specKind(spec);
  if (!kind) throw new Error("A point needs two of T, P, h, s and VF: T and P, P and h, P and s, P and VF, or T and VF.");
  const fromState = (T, P, st, VF) => ({ T_K: T, P_kPa: P, h: st.h_kJ_kg, s: st.s_kJ_kgK, VF });
  const lever = (r, q) => ({ T_K: r.T_K, P_kPa: r.P_kPa, VF: q, h: r.liquid.h_kJ_kg + q * (r.vapour.h_kJ_kg - r.liquid.h_kJ_kg), s: r.liquid.s_kJ_kgK + q * (r.vapour.s_kJ_kgK - r.liquid.s_kJ_kgK) });
  const id = kind[0];
  if (id === "TP") { const st = steam(spec.T_K, spec.P_kPa); return fromState(spec.T_K, spec.P_kPa, st, st.phase === "liquid" ? 0 : /vapour/.test(st.phase) ? 1 : null); }
  if (id === "PVF" || id === "TVF") {
    if (!(spec.VF >= 0 && spec.VF <= 1)) throw new Error(`The vapour fraction is between 0 and 1 (got ${spec.VF}).`);
    return lever(steamSat(id === "PVF" ? { P_kPa: spec.P_kPa } : { T_K: spec.T_K }), spec.VF);
  }
  // P and h, or P and s: in the dome by the lever rule, else the temperature where the one phase has it (bisection)
  const key = id === "Ph" ? "h_kJ_kg" : "s_kJ_kgK", X = spec[key], P = spec.P_kPa;
  const r = P < P_CRIT ? steamSat({ P_kPa: P }) : null;
  if (r && X >= r.liquid[key] && X <= r.vapour[key]) return lever(r, (X - r.liquid[key]) / (r.vapour[key] - r.liquid[key]));
  let lo = r && X > r.vapour[key] ? r.T_K + 1e-9 : T_TRIPLE, hi = r && X < r.liquid[key] ? r.T_K - 1e-9 : 1073.15;
  const f = T => steam(T, P)[key] - X;
  if (f(lo) * f(hi) > 0) throw new Error(`No state of water at ${P} kPa has ${id === "Ph" ? "h" : "s"} = ${X} (IAPWS-IF97 covers 273.16 to 1073.15 K).`);
  for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; }
  const T = (lo + hi) / 2;
  return fromState(T, P, steam(T, P), r ? (T > r.T_K ? 1 : 0) : null);
}

/** Compute the stored point specifications: [{ label, spec, point | null, error | null }]. */
export function statePoints(specs, compute) {
  return (specs ?? []).map((spec, k) => {
    const label = String.fromCharCode(65 + k);
    try { return { label, spec, point: compute(spec), error: null }; } catch (e) { return { label, spec, point: null, error: e.message }; }
  });
}

/** The coordinates of a point on a chart: x = s (T-s, h-s) or h (P-h); y = T, P or h, in the display units. */
function axes(kind, u) {
  if (kind === "PH") return { x: p => p.h, y: p => pToDisplay(p.P_kPa, u), xLabel: "h, kJ/kg", yLabel: `P, ${u.P}`, log: true, lines: "isotherms" };
  if (kind === "HS") return { x: p => p.s, y: p => p.h, xLabel: "s, kJ/(kg·K)", yLabel: "h, kJ/kg", log: false, lines: "isobars" };
  return { x: p => p.s, y: p => tToDisplay(p.T_K, u), xLabel: "s, kJ/(kg·K)", yLabel: `T, ${tU(u)}`, log: false, lines: "isobars" };
}

/** The y values where a line (points in its order) crosses x; the first one, or null. */
function yAt(points, x) {
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k];
    if ((a.x - x) * (b.x - x) <= 0 && a.x !== b.x) return a.y + (x - a.x) / (b.x - a.x) * (b.y - a.y);
  }
  return null;
}

/**
 * Draw a chart into `plot` and its readout into `side`. data: waterChart or fluidChart; kind "TS", "PH" or "HS".
 * @returns {{move:function, series:object[]}}
 */
export function drawChart({ plot, side, compact, data, kind, units: u, name, points = [], onPick }) {
  const A = axes(kind, u);
  const xy = p => ({ x: A.x(p), y: A.y(p) });
  const domePts = [...data.dome.liquid.map(xy), ...(data.dome.critical ? [xy(data.dome.critical)] : []), ...data.dome.vapour.slice().reverse().map(xy)];
  const lines = data[A.lines].map((l, i) => ({
    name: A.lines === "isotherms" ? fmtTemp(l.T_K, u) : fmtP(l.P_kPa, u), color: SERIES(i), raw: l,
    segments: [{ points: l.points.map(xy) }],
  }));
  // unlabelled (the legend names them): their ends meet at the critical point, where labels would pile up
  const quality = data.quality.map(q => ({ name: "", color: "var(--fug-muted)", width: 1, dash: "3 4", raw: q, segments: [{ points: q.points.map(xy) }] }));
  const series = [{ name: "", color: "var(--fug-fg)", width: 1.6, segments: [{ points: domePts }],
    markers: data.dome.critical ? [{ ...xy(data.dome.critical), label: "Critical point", shape: "dot" }] : [] }, ...lines, ...quality];
  const k = data.compression;
  if (k) {
    series.push({ name: "", color: "var(--fug-accent, var(--fug-s1))", width: 2.6, segments: [{ points: [xy(k.inlet), xy(k.outlet)] }],
      markers: [{ ...xy(k.inlet), label: "1", shape: "dot" }, { ...xy(k.outlet), label: "2", shape: "dot" }] });
    series.push({ name: "", color: "var(--fug-accent, var(--fug-s1))", width: 1.4, dash: "5 4", segments: [{ points: [xy(k.inlet), xy(k.isentropic)] }],
      markers: [{ ...xy(k.isentropic), label: "2s", shape: "open", place: "below" }] });
  }
  // the state points, as labelled dots (A, B, ...) joined in order
  const placed = points.filter(p => p.point);
  if (placed.length) {
    series.push({ name: "", color: "var(--fug-fg)", width: 1, dash: "1 3", segments: [{ points: placed.map(p => xy(p.point)) }],
      markers: placed.map(p => ({ ...xy(p.point), label: p.label, shape: "dot" })) });
  }
  const xs = series.flatMap(sr => sr.segments.flatMap(g => g.points.map(p => p.x))).filter(Number.isFinite);
  const span = Math.max(...xs) - Math.min(...xs) || 1;
  const x0 = Math.min(...xs) - 0.02 * span, x1 = Math.max(...xs) + 0.02 * span;
  const read = h("div", { class: "fa-read" });
  const xUnit = kind === "PH" ? "kJ/kg" : "kJ/(kg·K)", yUnit = kind === "PH" ? u.P : kind === "HS" ? "kJ/kg" : tU(u);
  const show = x => {
    const vals = series.map((sr, i) => (i === 0 || sr.dash ? null : yAt(sr.segments[0].points, x)));
    read.replaceChildren(h("div", { class: "fug-eyebrow" }, `At ${kind === "PH" ? "h" : "s"} = ${fmtNum(x, 4)} ${xUnit}`),
      ...lines.map((sr, i) => h("div", { class: "fa-row" }, h("span", {}, h("span", { class: "sw", style: `border-color:${sr.color}` }), sr.name),
        h("b", { class: "fug-num" }, vals[i + 1] == null ? "–" : `${fmtNum(vals[i + 1], 4)} ${yUnit}`))));
    return vals;
  };
  // a click places a state point: on the P-h chart where it is clicked (P and h), on the T-s and h-s charts on the
  // isobar nearest to the click at that entropy (P and s)
  const pick = onPick && (({ x, y }) => {
    if (kind === "PH") return onPick({ P_kPa: pFromDisplay(y, u), h_kJ_kg: x });
    let best = null;
    lines.forEach(sr => { const yl = yAt(sr.segments[0].points, x); if (yl != null && (!best || Math.abs(yl - y) < best.d)) best = { d: Math.abs(yl - y), P: sr.raw.P_kPa }; });
    if (best) onPick({ P_kPa: best.P, s_kJ_kgK: x });
  });
  const move = drawPlot(plot, { compact, series, x0, x1, xLabel: A.xLabel, yLabel: A.yLabel, log: A.log, show, labels: kind === "PH" ? "end" : "top", onPick: pick,
    aria: `${CHART_TITLE[kind]} of ${name} with the two-phase dome and ${A.lines}` });
  plot.append(h("div", { class: "fug-legend" },
    h("span", { class: "fug-key", style: "color:var(--fug-fg)" }, h("i"), h("span", { style: "color:var(--fug-fg2)" }, data.dome.liquid.length && data.dome.critical ? "Two-phase dome" : "Saturation")),
    h("span", {}, `Coloured lines: ${A.lines === "isotherms" ? "isotherms" : "isobars"}; dashed grey: vapour fraction 0.25, 0.5, 0.75.`),
    k ? h("span", {}, `${k.kind === "compression" ? "Compression" : "Expansion"} 1 → 2 at ${fmtShort(k.efficiency * 100, 3)} % isentropic efficiency (2s: isentropic); the path between is drawn straight.`) : null));
  const info = [];
  if (k) {
    info.push(h("div", { class: "fug-eyebrow" }, k.kind === "compression" ? "Compression" : "Expansion"),
      ...[["Inlet 1", k.inlet], ["Isentropic outlet 2s", k.isentropic], ["Outlet 2", k.outlet]].map(([lab, p]) => h("div", { class: "fa-row" }, h("span", {}, lab),
        h("b", { class: "fug-num" }, `${fmtTemp(p.T_K, u)}, ${fmtP(p.P_kPa, u)}${p.VF != null && p.VF < 1 - 1e-6 ? `, VF ${fmtNum(p.VF, 3)}` : ""}`))),
      h("div", { class: "fa-row" }, h("span", {}, "Isentropic work"), h("b", { class: "fug-num" }, `${fmtNum(k.w_s_kJ_kg, 4)} kJ/kg`)),
      h("div", { class: "fa-row" }, h("span", {}, k.kind === "compression" ? "Work in" : "Work out"), h("b", { class: "fug-num" }, `${fmtNum(Math.abs(k.w_kJ_kg), 4)} kJ/kg`)));
  }
  side.replaceChildren(read, ...info, ...data.notes.map(n => h("div", { class: "fug-sub" }, n)));
  return { move, series, x0, x1 };
}

/** The tables of a chart for the Excel export (diagram-export.js): the dome and every line, per kg. */
export function chartTables({ data, kind, units: u, name }) {
  const A = axes(kind, u);
  const rows = pts => pts.map(p => [+tToDisplay(p.T_K, u).toFixed(4), +pToDisplay(p.P_kPa, u).toPrecision(8), +p.h.toFixed(4), +p.s.toFixed(6), p.VF ?? ""]);
  const cols = [{ label: "T", unit: tU(u) }, { label: "P", unit: u.P }, { label: "h", unit: "kJ/kg" }, { label: "s", unit: "kJ/(kg·K)" }, { label: "VF" }];
  const out = [{ name: "Dome", note: `Saturated liquid, then saturated vapour, of ${name}.`, columns: cols, rows: [...rows(data.dome.liquid), ...rows(data.dome.vapour)] }];
  for (const l of data[A.lines]) {
    out.push({ name: A.lines === "isotherms" ? `Isotherm ${fmtShort(+tToDisplay(l.T_K, u).toFixed(2))} ${tU(u)}` : `Isobar ${fmtShort(pToDisplay(l.P_kPa, u), 5)} ${u.P}`,
      note: `${l.points.length} points, ordered by entropy as drawn.`, columns: cols, rows: rows(l.points) });
  }
  if (data.compression) {
    const k = data.compression;
    out.push({ name: k.kind === "compression" ? "Compression" : "Expansion", note: `Isentropic efficiency ${k.efficiency}; isentropic work ${fmtNum(k.w_s_kJ_kg, 5)} kJ/kg, work ${fmtNum(k.w_kJ_kg, 5)} kJ/kg.`,
      columns: [{ label: "Point" }, ...cols], rows: [["1 inlet", ...rows([k.inlet])[0]], ["2s isentropic", ...rows([k.isentropic])[0]], ["2 outlet", ...rows([k.outlet])[0]]] });
  }
  return out;
}

const csvOf = (head, rows) => [head.join(","), ...rows.map(r => r.map(v => (typeof v === "string" && /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(","))].join("\n");
const lineRows = (pts, u) => pts.map(p => [+tToDisplay(p.T_K, u).toFixed(4), +pToDisplay(p.P_kPa, u).toPrecision(8), +p.h.toFixed(4), +p.s.toFixed(6), p.VF ?? ""]);
const lineHead = u => [`T (${tU(u)})`, `P (${u.P})`, "h (kJ/kg)", "s (kJ/(kg K))", "VF"];

/**
 * The state points under Results: a table (T, P, h, s, VF, and the change of h and s from the point before), a form
 * to add one, and the table as CSV. tools: { save, copy } (app-views.js saveText, copyText); onChange(specs).
 */
export function pointsSection({ points, specs, units: u, kind, name, uid, onChange, tools }) {
  const status = h("div", { class: "fug-foot", "aria-live": "polite" }), box = h("div");
  const rows = points.map((p, k) => {
    const prev = k ? points[k - 1].point : null, q = p.point;
    const del = h("button", { type: "button", class: "fa-icon-btn", title: `Remove point ${p.label}`, "aria-label": `Remove point ${p.label}`, "data-fk": `pt-del-${k}`,
      on: { click: () => onChange(specs.filter((_, i) => i !== k)) } }, icon("close", 14));
    if (!q) return h("tr", { class: "is-err" }, h("td", {}, p.label), h("td", { colspan: 7 }, p.error), h("td", {}, del));
    return h("tr", {}, h("td", {}, p.label), h("td", {}, fmtShort(+tToDisplay(q.T_K, u).toFixed(2))), h("td", {}, fmtNum(pToDisplay(q.P_kPa, u), 5)),
      h("td", {}, fmtNum(q.h, 5)), h("td", {}, fmtNum(q.s, 5)), h("td", {}, q.VF == null ? "" : fmtNum(q.VF, 4)),
      h("td", {}, prev ? fmtNum(q.h - prev.h, 5) : ""), h("td", {}, prev ? fmtNum(q.s - prev.s, 5) : ""), h("td", {}, del));
  });
  const th = (a, b) => h("th", { scope: "col" }, a, b ? h("span", { class: "u" }, b) : null);
  const table = points.length ? h("div", { class: "fug-scroll", tabindex: "0", role: "region", "aria-label": "State points" }, h("table", { class: "fa-table fa-num-table" },
    h("thead", {}, h("tr", {}, th("Point"), th("T", tU(u)), th("P", u.P), th("h", "kJ/kg"), th("s", "kJ/(kg·K)"), th("VF"), th("Δh", "kJ/kg"), th("Δs", "kJ/(kg·K)"), th(""))),
    h("tbody", { class: "fug-num" }, ...rows))) : null;
  // the form: a specification and its two values, in the display units
  let pick = POINT_SPECS[0];
  const LABEL = { T_K: `T, ${tU(u)}`, P_kPa: `P, ${u.P}`, h_kJ_kg: "h, kJ/kg", s_kJ_kgK: "s, kJ/(kg·K)", VF: "VF" };
  const read = { T_K: v => tFromDisplay(v, u), P_kPa: v => pFromDisplay(v, u), h_kJ_kg: v => v, s_kJ_kgK: v => v, VF: v => v };
  const inA = h("input", { type: "text", inputmode: "decimal", id: `fa-pa-${uid}`, "data-fk": "pt-a" }), inB = h("input", { type: "text", inputmode: "decimal", id: `fa-pb-${uid}`, "data-fk": "pt-b" });
  const labA = h("span", {}, LABEL[pick[2][0]]), labB = h("span", {}, LABEL[pick[2][1]]);
  const sel = h("select", { id: `fa-ps-${uid}`, "data-fk": "pt-spec", on: { change: ev => { pick = POINT_SPECS.find(x => x[0] === ev.target.value); labA.textContent = LABEL[pick[2][0]]; labB.textContent = LABEL[pick[2][1]]; } } },
    ...POINT_SPECS.map(([id, label]) => h("option", { value: id }, label)));
  const add = () => {
    const a = Number(String(inA.value).replace(",", ".")), b = Number(String(inB.value).replace(",", "."));
    if (!Number.isFinite(a) || !Number.isFinite(b) || String(inA.value).trim() === "" || String(inB.value).trim() === "") { status.textContent = "Enter both values."; return; }
    if (specs.length >= MAX_POINTS) { status.textContent = `At most ${MAX_POINTS} points: remove one first.`; return; }
    onChange([...specs, { [pick[2][0]]: read[pick[2][0]](a), [pick[2][1]]: read[pick[2][1]](b) }]);
  };
  const csv = () => csvOf(["Point", ...lineHead(u), "dh (kJ/kg)", "ds (kJ/(kg K))"], points.filter(p => p.point).map((p, k, arr) => [p.label, ...lineRows([p.point], u)[0],
    k ? +(p.point.h - arr[k - 1].point.h).toFixed(4) : "", k ? +(p.point.s - arr[k - 1].point.s).toFixed(6) : ""]));
  const file = `chepta-points-${kind}-${name.replace(/[^\w]+/g, "-").toLowerCase()}.csv`;
  return h("section", { class: "fa-sec" }, h("h3", {}, "State points"),
    h("p", { class: "fa-in-hint" }, kind === "PH" ? "Click the chart to place a point where you click, or type one below." : "Click the chart to place a point on the nearest isobar, or type one below."),
    table,
    h("div", { class: "fa-form" }, h("label", { for: sel.id }, h("span", {}, "Given"), sel), h("label", { for: inA.id }, labA, inA), h("label", { for: inB.id }, labB, inB)),
    h("div", { class: "fa-in-actions" },
      h("button", { type: "button", class: "fa-mini", "data-fk": "pt-add", on: { click: add } }, icon("plus", 15), "Add point"),
      points.length ? h("button", { type: "button", class: "fa-mini", "data-fk": "pt-csv", on: { click: () => tools.save(csv(), file, "text/csv;charset=utf-8", status) } }, icon("download", 15), "Download CSV") : null,
      points.length ? h("button", { type: "button", class: "fa-mini", "data-fk": "pt-copy", on: { click: () => tools.copy(csv(), status, box) } }, icon("copy", 15), "Copy") : null,
      points.length ? h("button", { type: "button", class: "fa-mini", "data-fk": "pt-clear", on: { click: () => onChange([]) } }, icon("close", 15), "Clear") : null),
    status, box,
    h("div", { class: "fug-foot" }, "Δh and Δs: from the point before. Per kg; the work of an adiabatic machine between two points is Δh."));
}

/** Every line of the chart, each to download or copy as CSV on its own (T, P, h, s, VF per point, as drawn). */
export function linesSection({ data, kind, units: u, name, tools }) {
  const A = axes(kind, u);
  const status = h("div", { class: "fug-foot", "aria-live": "polite" }), box = h("div");
  const slug = name.replace(/[^\w]+/g, "-").toLowerCase();
  const items = [
    ["Dome: saturated liquid", data.dome.liquid, "dome-liquid"], ["Dome: saturated vapour", data.dome.vapour, "dome-vapour"],
    ...data[A.lines].map(l => (A.lines === "isotherms" ? [`Isotherm ${fmtTemp(l.T_K, u)}`, l.points, `T-${+tToDisplay(l.T_K, u).toFixed(2)}`] : [`Isobar ${fmtP(l.P_kPa, u)}`, l.points, `P-${fmtShort(pToDisplay(l.P_kPa, u), 6)}`])),
    ...data.quality.map(q => [`Vapour fraction ${q.VF}`, q.points, `VF-${q.VF}`]),
  ];
  return h("section", { class: "fa-sec" }, h("h3", {}, "Lines as data"),
    h("ul", { class: "fa-lines" }, ...items.map(([label, pts, key]) => {
      const text = () => csvOf(lineHead(u), lineRows(pts, u));
      return h("li", {}, h("span", {}, label, h("small", {}, ` ${pts.length} points`)),
        h("button", { type: "button", class: "fa-icon-btn", title: `Download ${label} as CSV`, "aria-label": `Download ${label} as CSV`, "data-fk": `ln-save-${key}`,
          on: { click: () => tools.save(text(), `chepta-${slug}-${kind}-${key}.csv`, "text/csv;charset=utf-8", status) } }, icon("download", 15)),
        h("button", { type: "button", class: "fa-icon-btn", title: `Copy ${label}`, "aria-label": `Copy ${label}`, "data-fk": `ln-copy-${key}`,
          on: { click: () => tools.copy(text(), status, box) } }, icon("copy", 15)));
    })),
    status, box,
    h("div", { class: "fug-foot" }, "Each line as its points were calculated (not interpolated); the Excel download has every line."));
}
