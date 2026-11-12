/**
 * The canvas tabs of the reorganized layout (proposal 0021, section 2 and step 2): Plot, Table, Data, Warnings, the
 * same in every workspace.
 *
 *  - Plot: the diagram or the drawing;
 *  - Table: the numbers behind it (the view's own table, else the tables of its Excel export), with the downloads;
 *  - Data: what the result rests on: the pair parameters (shell-contract.js dataOf), the measured sets drawn on a
 *    binary diagram, the user's own data, and the sources the calculation uses (shell-contract.js sourcesOf);
 *  - Warnings: every warning and refusal of this calculation in one list, with a count on the tab.
 *
 * The workbench of app.js builds the tabs only when the new layout asks for them (app-next.js); the classic layout
 * keeps its canvas as it is. The first part of this file is DOM-free (tested in test/canvas-tabs.test.js); the
 * second builds the Table and the Data panes. A view (layer 6).
 */
import { h } from "./dom.js";
import { icon } from "./icons.js";

/** The four tabs, in order. */
export const CANVAS_TABS = [
  { id: "plot", label: "Plot" },
  { id: "table", label: "Table" },
  { id: "data", label: "Data" },
  { id: "warnings", label: "Warnings" },
];
/** The workspaces whose Plot is a drawing of blocks and streams. */
const DRAWINGS = ["flowsheet"];

/** The label of a tab in a view: "Drawing" for the flowsheet's Plot. */
export function tabLabel(id, view) {
  if (id === "plot" && DRAWINGS.includes(view)) return "Drawing";
  return CANVAS_TABS.find(t => t.id === id)?.label ?? id;
}

/** A known tab id, else "plot" (the tab that is open is not saved in a project: a page starts on the Plot). */
export const tabOf = id => (CANVAS_TABS.some(t => t.id === id) ? id : "plot");

/**
 * Move between the tabs with the keys (WAI-ARIA tabs pattern): Right and Left to the next and the previous (round),
 * Home and End to the first and the last.
 * @returns {number|null}  the index of the tab to select, or null when the key does not move
 */
export function tabMove(key, at, n = CANVAS_TABS.length) {
  if (!n) return null;
  if (key === "ArrowRight") return (at + 1) % n;
  if (key === "ArrowLeft") return (at - 1 + n) % n;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  return null;
}

/**
 * Whether a note of the canvas stays above the tabs, seen whatever tab is open, instead of moving to the Warnings
 * tab: what the person must see now (an error that stopped the calculation, role "alert"; "Solving in the
 * background", role "status"). Known deviations, model notes and other warnings (role "note" or none) move.
 * @param {{role?:string|null}} note  the note's role attribute
 */
export function staysOnCanvas({ role = null } = {}) {
  return role === "alert" || role === "status";
}

/**
 * The count on the Warnings tab: the warnings of the result, the error that stopped it, and the problems of the
 * inputs (not while nothing is chosen yet: a start, not a problem; shell-contract.js missingOf).
 * @param {{warnings?:number, error?:string|null, missing?:{complete:boolean, blank:boolean, problems:object[]}}} o
 */
export function warningCount({ warnings = 0, error = null, missing = null } = {}) {
  const problems = missing && !missing.complete && !missing.blank ? missing.problems.length : 0;
  return warnings + (error ? 1 : 0) + problems;
}

/** The rows of a table shown on the Table tab: at most `max`, the rest in the Excel file. */
export const TABLE_ROWS = 300;
export function tablePreview(table, max = TABLE_ROWS) {
  const rows = table.rows ?? [];
  return { rows: rows.slice(0, max), cut: Math.max(0, rows.length - max), total: rows.length };
}

/** A cell of an export table as text: six significant digits, no trailing zeros, "–" where the engine found none. */
export function cellText(v) {
  if (v == null || v === "") return "–";
  if (typeof v !== "number") return String(v);
  if (!Number.isFinite(v)) return "–";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e-4 && a < 1e7) return String(+v.toPrecision(6));
  return v.toExponential(4).replace(/\.?0+e/, "e");
}

// ---------------------------------------------------------------------------------------------------------------------
// the panes (DOM)

/**
 * The tables of a view's Excel export (diagram-export.js), as HTML tables: title, note, labels with units, rows.
 * @param {{tables:object[]}} desc
 */
export function exportTables(desc) {
  return h("div", { class: "fa-tab-tables" }, ...desc.tables.map(t => {
    const p = tablePreview(t);
    return h("section", { class: "fa-sec" },
      h("h3", {}, t.title ?? t.name),
      t.note ? h("p", { class: "fug-foot" }, t.note) : null,
      h("div", { class: "fug-scroll fa-tab-scroll" }, h("table", { class: "fa-table" },
        h("thead", {}, h("tr", {}, ...t.columns.map(c => h("th", { scope: "col", class: "fug-num" }, c.label, c.unit ? h("small", {}, c.unit) : null)))),
        h("tbody", {}, ...p.rows.map(r => h("tr", {}, ...r.map(v => h("td", { class: "fug-num" }, cellText(v)))))))),
      p.cut ? h("p", { class: "fug-foot" }, `The first ${p.rows.length} of ${p.total} rows; every row is in the Excel file.`) : null);
  }));
}

const KIND = {
  "standard": "Standard", "open-source library": "Open-source library", "databank": "Databank", "thermoml": "ThermoML Archive",
  "open-access article": "Open-access article", "free supplement": "Free supplement", "free copy": "Free copy (preprint or manuscript)",
  "free book": "Free book", "handbook via open compilation": "Handbook, open compilation", "user": "Given in this page", "supplier": "Supplier data",
};

/**
 * The Data pane: what the result rests on (the pair parameters and the rule of the sets: dataOf), the view's own
 * data (the measured sets of a binary diagram, the user's own data, moved here by the workbench), then the sources
 * the calculation uses (sourcesOf), each with its link, kind and why it is open, and the button that opens them in the
 * Sources panel.
 * @param {{data:{pairs:string|null, sets:string|null, result:string|null}, sources:{sources:object[]}, own:Node,
 *   onOpen:()=>void}} o
 */
export function dataPane({ data, sources, own, onOpen }) {
  const lines = [data.pairs ?? data.result, data.sets].filter(Boolean);
  const list = sources.sources;
  return h("div", { class: "fa-tab-data" },
    lines.length ? h("section", { class: "fa-sec" }, h("h3", {}, "What the result rests on"), ...lines.map(l => h("p", { class: "fa-tab-line" }, l))) : null,
    own,
    h("section", { class: "fa-sec" }, h("h3", {}, `Sources used here${list.length ? ` (${list.length})` : ""}`),
      list.length
        ? h("ul", { class: "fa-libsrc" }, ...list.map(s => {
          const href = s.url || (s.doi ? `https://doi.org/${s.doi}` : null);
          return h("li", {},
            href ? h("a", { href, target: "_blank", rel: "noopener", title: s.id }, s.title) : h("span", { title: s.id }, s.title),
            h("div", { class: "fa-libsrc-meta" }, [[s.authors, s.published ?? s.year].filter(Boolean).join(", "), KIND[s.kind] ?? s.kind].filter(Boolean).join(" · ")),
            s.access ? h("div", { class: "fa-libsrc-why" }, s.access) : null);
        }))
        : h("p", { class: "fug-foot" }, "No source to list until the inputs are complete."),
      h("div", { class: "fa-in-actions" }, h("button", { type: "button", class: "fa-mini", "data-fk": "tab-sources", on: { click: onOpen } },
        icon("book", 15), "Open in the Sources panel"))));
}

export const CANVAS_TABS_CSS = `
.fa-tabs{display:flex; gap:2px; border-bottom:1px solid var(--fug-rule); margin:-4px 0 0; overflow-x:auto; scrollbar-width:none; flex:none}
.fa-tabs[hidden]{display:none}
.fa-tab{display:inline-flex; align-items:center; gap:6px; border:0; border-bottom:2px solid transparent; background:transparent; color:var(--fug-fg2); font:inherit; font-size:13px; padding:6px 10px 5px; cursor:pointer; white-space:nowrap; margin-bottom:-1px}
.fa-tab:hover{color:var(--fug-fg)}
.fa-tab[aria-selected="true"]{color:var(--fug-fg); border-bottom-color:var(--fug-accent); font-weight:600}
.fa-tab:focus-visible{outline:2px solid var(--fug-accent); outline-offset:-2px}
.fa-tab-count{min-width:18px; padding:0 5px; border-radius:9px; background:var(--fa-busy); color:var(--fug-bg); font-size:11px; font-weight:600; line-height:18px; text-align:center}
.fa-tabpanel{display:flex; flex-direction:column; gap:12px; min-width:0}
.fa-tabpanel>*{min-width:0}
.fa-tabpanel .fa-canvas-foot{padding:0; border-top:0; margin-top:0}
.fa-tabpanel[hidden]{display:none}
.fa-tab-scroll{max-height:60vh; overflow:auto}
.fa-tab-scroll th small{display:block; font-weight:400; color:var(--fug-muted)}
.fa-tab-data,.fa-tab-tables,.fa-tab-warn{display:grid; grid-template-columns:minmax(0, 1fr); gap:12px; max-width:760px}
.fa-tab-data .fa-meas{margin-top:0; padding-top:0; border-top:0}
.fa-tab-line{margin:2px 0 0; font-size:12.5px}
.fa-tab-none{color:var(--fug-fg2); font-size:12.5px}
`;
