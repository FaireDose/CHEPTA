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
import { tToDisplay, pToDisplay, fmtNum, fmtShort, linspace } from "./properties-logic.js";
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
export function drawChart({ plot, side, compact, data, kind, units: u, name }) {
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
  const move = drawPlot(plot, { compact, series, x0, x1, xLabel: A.xLabel, yLabel: A.yLabel, log: A.log, show, labels: kind === "PH" ? "end" : "top",
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
