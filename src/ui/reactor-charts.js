/**
 * Reactor charts (proposal 0010, step 5 views; the maintainer, 2026-10-28): the profiles along a plug-flow reactor, as
 * the profile plots of desktop simulators show them (molar flows, mole fractions, temperature, pressure, conversion,
 * rates and vapour fraction against the length), and the curves of the Reactor workspace (a result against a swept
 * input). Drawing only: every value comes from the engine's result (src/units/kinetic-reactors.js).
 */
import { h } from "./dom.js";
import { drawPlot } from "./plot.js";
import { tToDisplay, pToDisplay, fmtShort } from "./properties-logic.js";

const color = n => `var(--fug-s${(n % 6) + 1})`;

/** The variables of a PFR profile: [key, label]. */
export const PROFILE_VARS = [["flows", "Molar flows"], ["y", "Mole fractions"], ["T", "Temperature"], ["P", "Pressure"], ["X", "Conversion"], ["r", "Rates"], ["VF", "Vapour fraction"]];

/**
 * The curves of one profile variable.
 * @param {object} kin    reaction.kinetic of a PFR result (its profile)
 * @param {string} key    a PROFILE_VARS key
 * @param {{ids:string[], names:string[], reactions:{id:string, name:string, units:string}[], units:object}} o
 */
export function profileSeries(kin, key, { ids, names, reactions, units: u }) {
  const pr = kin.profile, xs = pr.map(p => p.z_m);
  const line = (name, ys, n) => ({ name, color: color(n), segments: [{ points: xs.map((x, k) => ({ x, y: ys[k] })).filter(p => Number.isFinite(p.y)) }] });
  const fin = pr[0].flows_kmol_h;
  switch (key) {
    case "flows": return { yLabel: "F, kmol/h", series: ids.map((id, i) => line(names[i], pr.map(p => p.flows_kmol_h[i]), i)) };
    case "y": return { yLabel: "y, mol/mol", series: ids.map((id, i) => line(names[i], pr.map(p => p.flows_kmol_h[i] / p.flows_kmol_h.reduce((a, b) => a + b, 0)), i)) };
    case "T": return { yLabel: `T, ${u.T === "K" ? "K" : "°C"}`, series: [line("T", pr.map(p => tToDisplay(p.T_K, u)), 0)] };
    case "P": return { yLabel: `P, ${u.P}`, series: [line("P", pr.map(p => pToDisplay(p.P_kPa, u)), 1)] };
    case "X": return { yLabel: "Conversion", series: ids.map((id, i) => (fin[i] > 0 && pr.at(-1).flows_kmol_h[i] < fin[i] ? line(names[i], pr.map(p => 1 - p.flows_kmol_h[i] / fin[i]), i) : null)).filter(Boolean) };
    case "r": return { yLabel: `r, ${reactions[0]?.units ?? "mol/(m3 s)"}`, series: reactions.map((rx, k) => line(rx.name, pr.map(p => p.rates[k]), k)) };
    default: return { yLabel: "Vapour fraction", series: [line("VF", pr.map(p => p.VF ?? (null)), 2)] };
  }
}

/**
 * A chart with a readout under it.
 * @param {{series:object[], xLabel:string, yLabel:string, x0:number, x1:number, aria:string, compact?:boolean, fk?:string}} o
 */
export function chartBox({ series, xLabel, yLabel, x0, x1, aria, compact = false, fk }) {
  const plot = h("div", { class: "fug-plot", "data-fk": fk ?? null });
  const read = h("div", { class: "fug-foot", "aria-live": "polite" });
  const shown = series.filter(s => s.segments[0].points.length);
  if (!shown.length || !(x1 > x0)) return h("div", { class: "fa-empty" }, "Nothing to draw.");
  const at = (pts, x) => {
    let k = pts.findIndex(p => p.x >= x);
    if (k <= 0) return pts[Math.max(k, 0)]?.y ?? null;
    const a = pts[k - 1], b = pts[k];
    return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
  };
  const show = x => {
    const ys = shown.map(s => at(s.segments[0].points, x));
    read.textContent = `${xLabel} ${fmtShort(x, 4)}: ${shown.map((s, k) => `${s.name} ${ys[k] == null ? "–" : fmtShort(ys[k], 4)}`).join(", ")}`;
    return ys;
  };
  const move = drawPlot(plot, { compact, series: shown, xLabel, yLabel, x0, x1, show, aria });
  move(x1);
  return h("div", { class: "fa-rx-chart" }, plot, read);
}

/** The profile of a PFR: a choice of variable and its chart. sel: the chosen key; onSel(key) redraws. */
export function profilePanel({ kin, ids, names, reactions, units, sel = "flows", onSel, compact, fk = "rx-profile" }) {
  const key = PROFILE_VARS.some(([k]) => k === sel) ? sel : "flows";
  const { series, yLabel } = profileSeries(kin, key, { ids, names, reactions, units });
  return h("div", { class: "fa-rx-profile" },
    h("div", { class: "fug-seg fa-seg", role: "group", "aria-label": "Profile" }, ...PROFILE_VARS.map(([k, label]) =>
      h("button", { type: "button", "aria-pressed": String(k === key), "data-fk": `${fk}-${k}`, on: { click: () => onSel(k) } }, label))),
    chartBox({ series, xLabel: "z, m", yLabel, x0: 0, x1: kin.L_m, aria: `${PROFILE_VARS.find(([k]) => k === key)[1]} along the reactor`, compact, fk }));
}
