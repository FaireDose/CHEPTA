/**
 * SVG and PNG export of a chart drawn in the page (roadmap B1; proposal 0015, workstream W6). The chart's SVG is
 * copied with its colours, fonts and sizes as the page shows them (the CSS tokens of docs/UI_GUIDE.md resolved, so the
 * file looks the same outside the page, in the current light or dark theme), on the page's background colour. PNG: the
 * same SVG drawn on a canvas at twice its size. No library; where a page does not allow downloads (some AI chats),
 * nothing is saved and the caller says so.
 */
import { h } from "./dom.js";
import { icon } from "./icons.js";

const PAINT = ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "fill-opacity", "font-family", "font-size", "font-weight", "text-anchor"];

/** The SVG's text, standalone: every colour and font written on the element, and a background. */
export function svgText(svg) {
  const copy = svg.cloneNode(true);
  const from = [svg, ...svg.querySelectorAll("*")], to = [copy, ...copy.querySelectorAll("*")];
  from.forEach((el, k) => {
    const cs = getComputedStyle(el), out = to[k];
    for (const p of PAINT) {
      const v = cs.getPropertyValue(p);
      if (v && (out.hasAttribute(p) || el.tagName === "text" || p === "fill" || p === "stroke")) out.setAttribute(p, v);
    }
    out.removeAttribute("class");
  });
  const box = svg.viewBox.baseVal, bg = getComputedStyle(svg).getPropertyValue("--fug-bg").trim() || "#ffffff";
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(box.width));
  copy.setAttribute("height", String(box.height));
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  for (const [k, v] of [["x", box.x], ["y", box.y], ["width", box.width], ["height", box.height], ["fill", bg]]) rect.setAttribute(k, String(v));
  copy.insertBefore(rect, copy.firstChild);
  return new XMLSerializer().serializeToString(copy);
}

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: name, style: "display:none" });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Save the chart as an .svg file. */
export function saveSvg(svg, name) {
  save(new Blob([svgText(svg)], { type: "image/svg+xml" }), `${name}.svg`);
}

/** Save the chart as a .png file, at `scale` times its drawing size. */
export function savePng(svg, name, scale = 2) {
  const text = svgText(svg), box = svg.viewBox.baseVal;
  const img = new Image();
  return new Promise((resolve, reject) => {
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = Math.round(box.width * scale); c.height = Math.round(box.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => { if (!b) return reject(new Error("the page could not make the image")); save(b, `${name}.png`); resolve(); }, "image/png");
    };
    img.onerror = () => reject(new Error("the page could not draw the chart as an image"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  });
}

/** Two small buttons, SVG and PNG, for the chart in `holder` (its first svg); `note` gets what happened. */
export function imageButtons(holder, name, fk) {
  const note = h("span", { class: "fa-in-hint", role: "status" });
  const svgOf = () => holder.querySelector("svg");
  const run = async (kind) => {
    const svg = svgOf();
    if (!svg) return;
    try {
      if (kind === "svg") saveSvg(svg, name); else await savePng(svg, name);
      note.textContent = `Saved ${name}.${kind}. If nothing was downloaded, the page does not allow downloads.`;
    } catch (e) { note.textContent = `The image could not be made: ${e.message}.`; }
  };
  return h("div", { class: "fa-in-actions" },
    h("button", { type: "button", class: "fa-mini", "data-fk": `${fk}-svg`, title: "Download the chart as an SVG drawing", on: { click: () => run("svg") } }, icon("download", 14), "SVG"),
    h("button", { type: "button", class: "fa-mini", "data-fk": `${fk}-png`, title: "Download the chart as a PNG image", on: { click: () => run("png") } }, icon("download", 14), "PNG"),
    note);
}
