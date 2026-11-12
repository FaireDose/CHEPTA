/**
 * The binary diagrams' additions (proposal 0021, answer 7), drawn for the T-x-y and the P-x-y views of the workbench:
 * the switch between the phase diagram and the x-y, activity-coefficient and relative-volatility plots, those three
 * plots, the marks of the measured points and the list of the measured sets under the plot. Drawing only: the model
 * values are binaryCurve's (the engine's bubble points), the measured ones the rows of the data files
 * (binary-logic.js, src/thermo/measured.js).
 */
import { s, h, fmt, basisView } from "./dom.js";
import { drawPlot } from "./plot.js";
import { warning } from "./warning.js";
import { BINARY_PLOTS, binaryCurve, plotCurves, modelDeviation, roleText } from "./binary-logic.js";
import { tToDisplay, pToDisplay, tLabel } from "./properties-logic.js";

const SHAPE = { fitted: "dot", check: "open", unused: "cross" };
const sig = (v, n = 3) => (v == null || !Number.isFinite(v) ? "–" : Math.abs(v) >= 1000 || (v !== 0 && Math.abs(v) < 0.001) ? v.toExponential(n - 1) : String(+v.toPrecision(n)));

/** The switch above a binary diagram: the phase diagram (`phaseLabel`: "T-x-y" or "P-x-y"), x-y, γ, α. */
export function plotSwitch(current, phaseLabel, onPick) {
  return h("div", { class: "fa-plot-switch" },
    h("div", { class: "fug-seg fa-seg", role: "group", "aria-label": "Plot" },
      ...BINARY_PLOTS.map(p => h("button", { type: "button", "aria-pressed": String(current === p.id), "data-fk": `plot-${p.id}`,
        title: p.title ?? "Bubble and dew curves", on: { click: () => onPick(p.id) } }, p.label ?? phaseLabel))));
}

/** One mark of a measured point in an SVG: a filled dot (fitted), a ring (compared) or a cross (not used), with what
 *  it is as its title. */
export function drawMark(parent, X, Y, role, color, title) {
  const shape = SHAPE[role] ?? "cross";
  const m = shape === "cross"
    ? s("path", { d: `M${X - 3.5},${Y - 3.5}L${X + 3.5},${Y + 3.5}M${X - 3.5},${Y + 3.5}L${X + 3.5},${Y - 3.5}`, stroke: color, "stroke-width": 1.6, fill: "none" }, parent)
    : s("circle", { cx: X, cy: Y, r: 3.5, fill: shape === "dot" ? color : "var(--fug-bg)", stroke: color, "stroke-width": 1.5 }, parent);
  if (title) s("title", {}, m).textContent = title;
  return m;
}

/** "Kamihama et al., J. Chem. Eng. Data 57 (2012) 339 (ThermoML record ...)": a set's source in one line. */
const sourceLine = set => [set.source.citation ?? set.file, set.source.tables].filter(Boolean).join(". ");
/** The title of a measured point: its values as measured, then its set. */
export function pointTitle(set, p, names) {
  return [`Measured: x ${names[0]} ${p.x == null ? "–" : p.x}${p.y == null ? "" : `, y ${p.y}`}, ${p.T} K, ${p.P} kPa`, sourceLine(set), `(${set.role === "unused" ? "not fitted" : set.role === "check" ? "compared, not fitted" : "fitted"})`].join("\n");
}

export function roleMark(role, color = "var(--fug-fg2)") {
  const svg = s("svg", { viewBox: "0 0 12 12", width: 12, height: 12, "aria-hidden": "true", class: "fa-meas-mark" });
  drawMark(svg, 6, 6, role, color);
  return svg;
}

/** The legend entries of the measured points drawn: one per role. */
export function roleKeys(measured) {
  return [...new Set(measured.map(d => d.role))].map(r => h("span", { class: "fug-key" }, roleMark(r),
    h("span", {}, r === "fitted" ? "measured, fitted" : r === "check" ? "measured, compared" : "measured, not fitted")));
}

/**
 * The list of the measured sets under a binary diagram: each drawn set with its mark, its source and table, what the
 * parameter set in use did with it and the model's deviation from it; then the sets measured at other conditions,
 * each with a button that draws the diagram there; or the note that the pair has no measured data.
 * @param {{drawn:object[], elsewhere:object[], total:number}} m  measuredFor()
 * @param {object} o  { sys, isobaric, fittedModel, shown (false: the points are switched off), set (the workbench's
 *   patch function), units, names }
 */
export function measuredList(m, { sys, isobaric, fittedModel, shown = true, set, units }) {
  const box = h("div", { class: "fa-meas", "data-fk": "measured-list" });
  const pair = sys.names.join(" + ");
  if (!m.total) {
    box.append(h("div", { class: "fa-meas-none", role: "note" }, `No measured data: CHEPTA's data files hold no open vapour-liquid set of ${pair}. Nothing is drawn but the model.`));
    return box;
  }
  box.append(h("div", { class: "fa-meas-head" }, `Measured data of ${pair}`));
  if (!m.drawn.length) {
    box.append(h("div", { class: "fa-meas-none", role: "note" }, isobaric
      ? `No measured set at this pressure (within 0.5 %); ${m.elsewhere.length === 1 ? "the set of this pair is" : "the sets of this pair are"} listed below.`
      : `No measured point at this temperature (within 0.5 K); ${m.elsewhere.length === 1 ? "the set of this pair is" : "the sets of this pair are"} listed below.`));
  } else if (!shown) {
    box.append(h("div", { class: "fa-meas-none", role: "note" }, "The measured points are switched off (Display, Measured data)."));
  }
  if (m.drawn.length) {
    box.append(h("ul", { class: "fa-meas-list" }, ...m.drawn.map(d => {
      const dev = modelDeviation(sys, d.points, isobaric);
      const devText = dev.n ? `Model here: mean |Δ${isobaric ? "T" : "P"}| ${isobaric ? `${fmt(dev.dT_K, 2)} K` : `${fmt(dev.dP_percent, 1)} %`}${dev.ny ? `, mean |Δy| ${fmt(dev.dy, 4)}` : ""} over ${dev.n} point${dev.n === 1 ? "" : "s"}${dev.failed ? ` (${dev.failed} without a bubble point)` : ""}.`
        : "Model here: no bubble point found at these points.";
      return h("li", { "data-role": d.role },
        roleMark(d.role),
        h("div", {},
          h("div", { class: "fa-meas-src" }, d.source.url ? h("a", { href: d.source.url, target: "_blank", rel: "noopener" }, d.source.citation ?? d.file) : (d.source.citation ?? d.file)),
          h("div", { class: "fa-meas-what" }, `${d.points.length}${d.points.length < d.of ? ` of ${d.of}` : ""} point${d.of === 1 ? "" : "s"} at ${d.condition}${d.source.tables ? `. ${d.source.tables}` : ""}`),
          h("div", { class: "fa-meas-what" }, `${roleText(d.role, fittedModel).replace(/^./, c => c.toUpperCase())}.${d.record ? ` The fit's record: ${d.record}.` : ""} ${devText}`)));
    })));
  }
  if (m.elsewhere.length) {
    const cond = e => {
      const g = e.go;
      if (!g) return e.condition;
      return g.P_kPa != null ? `${sig(pToDisplay(g.P_kPa, units), 5)} ${units.P}` : `${sig(tToDisplay(g.T_K, units), 5)} ${tLabel(units)}`;
    };
    box.append(h("div", { class: "fa-meas-head" }, m.drawn.length ? "Measured at other conditions" : "Measured at"),
      h("ul", { class: "fa-meas-else" }, ...m.elsewhere.map(e => h("li", {},
        e.go ? h("button", { type: "button", class: "fa-mini", "data-fk": `meas-go-${e.go.view}-${e.go.P_kPa ?? e.go.T_K}`,
          title: `Draw the ${e.go.view === "txy" ? "T-x-y" : "P-x-y"} diagram there, with these points`,
          on: { click: () => set({ ...e.go, measured: true }) } }, `${e.go.view === "txy" ? "T-x-y" : "P-x-y"} at ${cond(e)}`) : h("span", { class: "fa-meas-cond" }, e.condition),
        h("span", { class: "fa-meas-what" }, `${e.of} point${e.of === 1 ? "" : "s"}; ${e.source.citation ?? e.file}`)))));
  }
  return box;
}

/**
 * The x-y, activity-coefficient or relative-volatility plot of a binary system, at a pressure or a temperature.
 * @param {HTMLElement} plot, side  the canvas and the Results panel's readout
 * @param {object} sys             the system (two components)
 * @param {{P_kPa?:number, T_K?:number}} at
 * @param {object} o  { kind: "xy"|"gamma"|"alpha", basis, MW, units, compact, measured: measuredFor().drawn or [] }
 * @returns {{points, missed}}  binaryCurve's points (for the export)
 */
export function renderBinaryPlot(plot, side, sys, at, { kind, basis, MW, units, compact, measured = [] }) {
  const isobaric = at.P_kPa != null;
  const bv = basisView(basis, MW);
  const scale = bv.mass ? 100 : 1;
  const X = x1 => scale * bv.conv([x1, 1 - x1])[0];
  const fromX = v => bv.inv([v / scale, 1 - v / scale])[0];
  const curve = binaryCurve(sys, at);
  if (curve.points.filter(Boolean).length < 2) throw curve.error ?? new Error("No bubble point found.");
  const curves = plotCurves(kind, curve.points);
  if (kind === "gamma" && !curves.length) {
    throw new Error(`Activity coefficients belong to an activity model; ${sys.info.equation ?? "an equation of state"} has none. Choose NRTL, UNIQUAC, Wilson or Modified UNIFAC 2.0 as the method, or read the x-y and relative-volatility plots.`);
  }
  const [n1, n2] = sys.names;
  const segs = pts => { const out = []; let cur = null; for (const p of pts) { if (!p) { cur = null; continue; } if (!cur) { cur = { points: [] }; out.push(cur); } cur.points.push({ x: X(p.x), y: kind === "xy" ? X(p.y) : p.y }); } return out; };
  const where = isobaric ? `${sig(pToDisplay(at.P_kPa, units), 6)} ${units.P}` : `${sig(tToDisplay(at.T_K, units), 6)} ${tLabel(units)}`;
  let series, yLabel, aria, log = false, yRange;
  if (kind === "xy") {
    series = [
      { name: "y = x", color: "var(--fug-muted)", dash: "4 4", width: 1.5, label: false, segments: [{ points: [{ x: 0, y: 0 }, { x: scale, y: scale }] }] },
      { name: "Model", color: "var(--fug-vap)", label: false, segments: segs(curves[0].points) },
      ...measured.map(d => ({ name: null, color: "var(--fug-fg)", segments: [], fit: true,
        markers: d.points.filter(p => p.x != null && p.y != null).map(p => ({ x: X(p.x), y: X(p.y), shape: SHAPE[d.role], r: 3.5, title: pointTitle(d, p, sys.names) })) })),
    ];
    yLabel = `y  ${n1} (${bv.axis})`; yRange = [0, scale];
    aria = `x-y diagram of ${n1} and ${n2} at ${where}`;
  } else if (kind === "gamma") {
    const all = curves.flatMap(c => c.points.filter(Boolean).map(p => p.y));
    log = Math.max(...all) / Math.max(1e-300, Math.min(...all)) > 30;
    series = [
      { name: `γ ${n1}`, color: "var(--fug-s1)", label: false, segments: segs(curves[0].points) },
      { name: `γ ${n2}`, color: "var(--fug-s2)", dash: "6 4", label: false, segments: segs(curves[1].points) },
      { name: null, color: "var(--fug-muted)", dash: "2 4", width: 1, label: false, segments: [{ points: [{ x: 0, y: 1 }, { x: scale, y: 1 }] }] },
    ];
    yLabel = "γ"; aria = `Activity coefficients of ${n1} and ${n2} at ${where}`;
  } else {
    const all = curves[0].points.filter(Boolean).map(p => p.y);
    log = Math.max(...all) / Math.max(1e-300, Math.min(...all)) > 30;
    series = [
      { name: "α", color: "var(--fug-s1)", label: false, segments: segs(curves[0].points) },
      { name: null, color: "var(--fug-muted)", dash: "2 4", width: 1, label: false, segments: [{ points: [{ x: 0, y: 1 }, { x: scale, y: 1 }] }] },
    ];
    yLabel = `α  ${n1} / ${n2}`; aria = `Relative volatility of ${n1} to ${n2} at ${where}`;
  }

  const head = h("div", { class: "fug-big" }), eyebrow = h("div", { class: "fug-eyebrow" }), comp = h("div", { class: "fug-num" }), rows = h("div", { class: "fa-read" });
  const show = zx => {
    const x1 = Math.min(1, Math.max(0, fromX(zx)));
    let r, alpha = null;
    try {
      const solve = x => (isobaric ? sys.bubbleT([x, 1 - x], at.P_kPa) : sys.bubbleP([x, 1 - x], at.T_K));
      r = solve(x1);
      const xe = Math.min(1 - 1e-6, Math.max(1e-6, x1)), ye = xe === x1 ? r.y[0] : solve(xe).y[0];
      alpha = (ye / xe) / ((1 - ye) / (1 - xe));
    } catch (e) {
      if (!(e && e.code)) throw e;
      head.textContent = "none"; comp.textContent = e.message; rows.replaceChildren(); return [];
    }
    const xb = bv.conv([x1, 1 - x1]), yb = bv.conv(r.y);
    const unit = bv.mass ? " wt %" : "";
    comp.textContent = `Liquid: ${n1} ${bv.f(xb[0])} · ${n2} ${bv.f(xb[1])}${bv.mass ? " (wt %)" : ""}`;
    eyebrow.textContent = kind === "xy" ? `Vapour, ${n1}${bv.mass ? " (wt %)" : " (mole fraction)"}` : kind === "gamma" ? `Activity coefficients, ${n1} · ${n2}` : `Relative volatility, ${n1} to ${n2}`;
    head.textContent = kind === "xy" ? bv.f(yb[0]) : kind === "gamma" ? `${sig(r.gamma[0], 4)} · ${sig(r.gamma[1], 4)}` : sig(alpha, 4);
    const row = (k, v) => h("div", { class: "fa-row" }, h("span", {}, k), h("b", {}, v));
    rows.replaceChildren(...[
      row(isobaric ? "Bubble temperature" : "Bubble pressure", isobaric ? `${fmt(tToDisplay(r.T, units), 2)} ${tLabel(units)}` : `${sig(pToDisplay(r.P, units), 5)} ${units.P}`),
      kind === "xy" ? null : row(`Vapour, ${n1}`, `${bv.f(yb[0])}${unit}`),
      kind === "gamma" || !r.gamma ? null : row(`γ ${n1} · γ ${n2}`, `${sig(r.gamma[0], 4)} · ${sig(r.gamma[1], 4)}`),
      kind === "alpha" ? null : row(`Relative volatility α`, sig(alpha, 4)),
      x1 > 0 && x1 < 1 ? row(`K ${n1} · K ${n2}`, `${sig(r.y[0] / x1, 4)} · ${sig(r.y[1] / (1 - x1), 4)}`) : null].filter(Boolean));
    return kind === "xy" ? [zx, scale * yb[0]] : kind === "gamma" ? [r.gamma[0], r.gamma[1]] : [alpha];
  };
  const move = drawPlot(plot, { compact, series, x0: 0, x1: scale, xLabel: `x  ${n1} (${bv.axis})`, yLabel, show, aria, log, y: yRange });
  const key = (color, dashed, label) => h("span", { class: "fug-key", style: `color:${color}` }, h("i", dashed ? { style: "border-top-style:dashed" } : {}), h("span", { style: "color:var(--fug-fg2)" }, label));
  plot.append(h("div", { class: "fug-legend" },
    ...(kind === "xy" ? [key("var(--fug-vap)", false, "Model"), key("var(--fug-muted)", true, "y = x")]
      : kind === "gamma" ? [key("var(--fug-s1)", false, `γ ${n1}`), key("var(--fug-s2)", true, `γ ${n2}`)]
        : [key("var(--fug-s1)", false, `α = (y/x of ${n1}) / (y/x of ${n2})`)]),
    ...(kind === "xy" ? roleKeys(measured) : []),
    h("span", {}, `at ${where}`)));
  const notes = [
    curve.missed ? warning(`${curve.missed} of ${curve.points.length} points not drawn: no bubble point found there. ${curve.error.message}`) : null,
    h("div", { class: "fug-foot" }, kind === "alpha" ? "Where α crosses 1 the pair has an azeotrope. At the two ends α is read at a mole fraction of 0.000001 from the pure component."
      : kind === "gamma" ? `From the ${isobaric ? "bubble temperature at each composition (the temperature changes along the curve)" : "liquid at this temperature"}; γ = 1 is the ideal solution.`
        : "Where the curve crosses the diagonal the pair has an azeotrope."),
  ].filter(Boolean);
  side.replaceChildren(h("div", {}, eyebrow, head), comp, rows, ...notes);
  move(0.5 * scale);
  return curve;
}
