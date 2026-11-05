/**
 * The Extraction block's view (proposal 0015, Part I, section 6, item 2, and milestone M3, step 8): a ternary diagram
 * of the block's two liquids, with the binodal curve and the tie lines of the block's liquid method, every stage's tie
 * line (its raffinate and its extract), the paths of the two liquids through the stages, the feed and the solvent; and
 * the profile, stage by stage.
 *
 * The binodal is traced by liquid-liquid flashes (src/equilibrium/flash.js, splitLL) of overall compositions on the
 * line from the middle of the binary edge of the two liquids' main components towards the third component's corner,
 * until the two liquids become one (near the plait point): the ends of each tie line are two points of the binodal.
 * First component at the top, second bottom-left, third bottom-right, in mole fractions (as the Ternary view).
 */
import { s, h, text } from "./dom.js";
import { system } from "../system.js";
import { splitLL } from "../equilibrium/flash.js";

const V = [[300, 52], [64, 460], [536, 460]];
const toXY = x => [0, 1].map(d => x[0] * V[0][d] + x[1] * V[1][d] + x[2] * V[2][d]);
const pt = x => toXY(x).map(q => q.toFixed(1)).join(",");
const FONT = "font-family:inherit";

/**
 * The binodal of the block's liquid method at T: tie lines [{ a, b }] (mole fractions), from the edge of the two main
 * components (i, k: richest in the raffinate and in the extract) towards the solute j.
 */
export function binodal(sys, T, i, j, k, steps = 60) {
  const ties = [];
  let K = null;
  for (let q = 0; q <= steps; q++) {
    const sj = 0.9 * q / steps;
    const z = [0, 0, 0];
    z[i] = (1 - sj) / 2; z[k] = (1 - sj) / 2; z[j] = sj;
    const zz = z.map(v => Math.max(v, 1e-9));
    const K0 = K ?? zz.map((_, c) => (c === i ? 0.05 : c === k ? 20 : 1));
    let ll = null;
    try { ll = splitLL(sys, zz, T, K0.slice()); } catch (e) { if (!(e && e.code)) throw e; }
    if (!ll || Math.max(...ll.x1.map((v, c) => Math.abs(v - ll.x2[c]))) < 1e-4) break;
    const [a, b] = ll.x1[i] > ll.x2[i] ? [ll.x1, ll.x2] : [ll.x2, ll.x1];
    ties.push({ a, b });
    K = b.map((v, c) => v / a[c]);
  }
  return ties;
}

/** The ternary diagram of an extraction result r (the block's result) with the flowsheet's components ids. */
export function extractionTernary({ ids, names, r, feed, solvent }) {
  const svg = s("svg", { viewBox: "0 0 600 540", role: "img", class: "fs-ex-ternary", "data-fk": "fs-extraction-ternary",
    "aria-label": `Ternary diagram of ${names.join(", ")}: the binodal curve, the tie line of every stage and the paths of the raffinate and the extract` });
  s("polygon", { points: V.map(v => v.join(",")).join(" "), fill: "none", stroke: "var(--fug-fg)", "stroke-width": 1.2 }, svg);
  // grid every 0.1
  const g = s("g", { class: "fug-bg-layer" }, svg);
  for (let t = 1; t < 10; t++) for (let c = 0; c < 3; c++) {
    const a = [0, 0, 0], b = [0, 0, 0];
    a[c] = t / 10; b[c] = t / 10;
    a[(c + 1) % 3] = 1 - t / 10; b[(c + 2) % 3] = 1 - t / 10;
    s("line", { x1: toXY(a)[0], y1: toXY(a)[1], x2: toXY(b)[0], y2: toXY(b)[1], stroke: "var(--fug-rule)", "stroke-width": 0.6 }, g);
  }
  text(svg, V[0][0], V[0][1] - 14, names[0], { "text-anchor": "middle", "font-size": 15, "font-weight": 600, fill: "var(--fug-fg)", style: FONT });
  text(svg, V[1][0] - 6, V[1][1] + 22, names[1], { "text-anchor": "start", "font-size": 15, "font-weight": 600, fill: "var(--fug-fg)", style: FONT });
  text(svg, V[2][0] + 6, V[2][1] + 22, names[2], { "text-anchor": "end", "font-size": 15, "font-weight": 600, fill: "var(--fug-fg)", style: FONT });

  const p = r.profile, N = p.length;
  // the main components: richest in the raffinate leaving the last stage and in the extract leaving stage 1; the solute
  // the third
  const argmax = v => v.indexOf(Math.max(...v));
  const i = argmax(p[N - 1].x_raffinate), k = argmax(p[0].x_extract);
  const j = [0, 1, 2].find(c => c !== i && c !== k);
  let ties = [];
  let why = null;
  if (i === k) why = "the raffinate and the extract are rich in the same component";
  else {
    try {
      const sys = system({ components: ids, model: r.state.model, ...(r.state.sets ? { sets: r.state.sets } : {}) });
      ties = binodal(sys, r.state.T_K, i, j, k);
    } catch (e) { if (!(e && e.code)) throw e; why = e.message; }
  }
  if (ties.length >= 2) {
    const gb = s("g", { "data-fk": "fs-ex-binodal" }, svg);
    for (const t of ties.filter((_, q) => q % 6 === 0)) s("line", { x1: toXY(t.a)[0], y1: toXY(t.a)[1], x2: toXY(t.b)[0], y2: toXY(t.b)[1], stroke: "var(--fug-muted)", "stroke-width": 0.8, "stroke-dasharray": "3 3" }, gb);
    const curve = [...ties.map(t => t.a), ...ties.slice().reverse().map(t => t.b)];
    s("path", { d: "M" + curve.map(pt).join("L"), fill: "none", stroke: "var(--fug-muted)", "stroke-width": 1.6 }, gb);
  }
  // every stage's tie line, then the two liquids' paths
  const gs = s("g", { "data-fk": "fs-ex-stages" }, svg);
  for (const st of p) {
    s("line", { x1: toXY(st.x_raffinate)[0], y1: toXY(st.x_raffinate)[1], x2: toXY(st.x_extract)[0], y2: toXY(st.x_extract)[1], stroke: "var(--fug-fg)", "stroke-width": 1 }, gs);
  }
  const path = (xs, color, label, anchor) => {
    s("path", { d: "M" + xs.map(pt).join("L"), fill: "none", stroke: "var(--fug-halo)", "stroke-width": 4 }, gs);
    s("path", { d: "M" + xs.map(pt).join("L"), fill: "none", stroke: color, "stroke-width": 2 }, gs);
    xs.forEach((x, q) => {
      const [cx, cy] = toXY(x);
      s("circle", { cx, cy, r: 3.5, fill: color, stroke: "var(--fug-halo)", "stroke-width": 1 }, gs);
      if (q === 0 || q === xs.length - 1) text(gs, cx + (anchor === "end" ? -7 : 7), cy + (q === 0 ? -6 : 14), String(q + 1), { "text-anchor": anchor, "font-size": 11, fill: "var(--fug-fg2)", style: FONT });
    });
    // the series' name beside its first point, kept inside the drawing
    const [lx, ly] = toXY(xs[0]);
    const right = anchor === "start";
    text(gs, Math.min(Math.max(lx + (right ? 14 : -14), 70), 530), ly + 4, label, { "text-anchor": right ? "start" : "end", fill: color, "font-size": 12, "font-weight": 600, style: FONT });
  };
  path(p.map(st => st.x_raffinate), "var(--fug-s1)", "raffinate", "start");
  path(p.map(st => st.x_extract), "var(--fug-s2)", "extract", "end");
  for (const [z, label] of [[feed, "feed"], [solvent, "solvent"]]) {
    if (!z) continue;
    const [cx, cy] = toXY(z);
    s("rect", { x: cx - 4, y: cy - 4, width: 8, height: 8, fill: "var(--fug-fg)" }, gs);
    text(gs, cx + (label === "feed" ? -8 : 8), cy + 4, label, { "font-size": 12, fill: "var(--fug-fg)", style: FONT, "text-anchor": label === "feed" ? "end" : "start" });
  }
  const legend = h("p", { class: "fa-in-hint" }, `Mole fractions at ${(r.state.T_K - 273.15).toFixed(2)} °C. Grey: the binodal curve and tie lines of the block's liquid method${ties.length < 2 ? ` (not traced: ${why ?? "no two liquids found on the edge"})` : ""}; thin lines: the tie line of each stage, from its raffinate to its extract; the two coloured paths join the stages' raffinates and extracts (stage 1 and the last are numbered); squares: the feed and the solvent.`);
  return h("div", { class: "fs-ex-view" }, svg, legend);
}

/** The profile, stage by stage: both liquids' flows and compositions and the distribution coefficients. */
export function extractionTable({ ids, names, r, title }) {
  const cell = v => h("td", { class: "fug-num" }, v);
  const frac = v => (v == null ? "–" : v < 1e-12 ? "0" : v < 5e-5 ? v.toExponential(1) : v.toFixed(4));
  const sumv = a => a.reduce((x, y) => x + y, 0);
  return h("div", { class: "fug-scroll" }, h("table", { class: "fug-table", "data-fk": "fs-extraction-table", "aria-label": title },
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Stage"), h("th", { scope: "col" }, "Raffinate, kmol/h"), h("th", { scope: "col" }, "Extract, kmol/h"),
      ...ids.map((_, c) => h("th", { scope: "col" }, `x ${names[c]} (raffinate)`)), ...ids.map((_, c) => h("th", { scope: "col" }, `y ${names[c]} (extract)`)),
      ...ids.map((_, c) => h("th", { scope: "col" }, `K ${names[c]} = y/x`)))),
    h("tbody", {}, ...r.profile.map(st => h("tr", {}, h("th", { scope: "row" }, String(st.stage)),
      cell(sumv(st.raffinate_kmol_h).toFixed(3)), cell(sumv(st.extract_kmol_h).toFixed(3)),
      ...st.x_raffinate.map(v => cell(frac(v))), ...st.x_extract.map(v => cell(frac(v))),
      ...st.K.map(v => cell(v == null ? "–" : v.toPrecision(4))))))));
}
