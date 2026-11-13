/**
 * PROTOTYPE of the reorganized workbench (proposal 0021): CHEPTA.app(target, { layout: "next" }).
 *
 * It is a shell around the workbench of app.js, not a second workbench: the engine, the views, the Inputs and
 * Results panels, the drawers and the project files are the ones of app.js, mounted inside the shell. The shell
 * replaces only how they are reached and arranged:
 *  - the Flowsheet has a place of its own, first in the top bar at every width (the maintainer, 2026-11-11: "flowsheet
 *    is in fact encompassing all the other tabs so should deserve something on its own"); the other workspaces are the
 *    calculations beside it, every one a press away: a rail at the left when the workbench is wide, a menu in the top
 *    bar otherwise (the two rows of sections and tabs of app.js are hidden). A calculation can take the flowsheet's
 *    components and method with one press ("From the flowsheet");
 *  - the context row, the same in every workspace: the property method (pressed, it opens the method choice of
 *    model-picker.js, or the workspace's own Method page), the data behind the result (pressed, the canvas's Data
 *    tab), and the units (pressed, the Settings);
 *  - the supporting tools in four places instead of seven: Project, Data (Library, My data, Sources), Settings,
 *    Help (AI chat, Feedback);
 *  - the canvas in tabs, Plot, Table, Data and Warnings, in every workspace (step 2; canvas-tabs.js, built by app.js
 *    when this shell asks for them);
 *  - when narrow (a phone, a chat panel): one pane at a time, Inputs or Results, instead of one long page, and the
 *    toolbar as one row that scrolls sideways.
 * What the shell shows about the calculation (method, data, units, what is missing) comes from the workbench's
 * contract (shell-contract.js, through app()'s `shell`): the same functions fill the status bar of the classic layout,
 * so the two can never disagree, and the shell reads nothing off the workbench's page. Nothing here calculates.
 *
 * A view (layer 6). The public interface is the one of app(): { state, update, save, load }.
 */
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { brandLogo } from "./brand.js";
import { app } from "./app.js";
import { WORKSPACES, SECTIONS, UTILITIES } from "./workspaces.js";
import { modelPicker, liquidPicker, equationPicker, workbenchPatch } from "./model-picker.js";
import { OWN_METHOD } from "./shell-contract.js";
import { CANVAS_TABS_CSS } from "./canvas-tabs.js";
import { UNIT_STEPS_CSS } from "./unit-steps.js";

/** The workspaces whose method is the workbench's own (state.model), for "From the flowsheet". */
export const PICKER_WORKSPACES = ["equilibrium", "flash", "hx", "pipe"];
/** The workspaces with a Method page of their own in the Inputs panel, and the button of app.js that opens it. */
export const METHOD_PAGE = OWN_METHOD;
/** What the Method button does for each kind of method choice (shell-contract.js methodOf().choice). */
export const METHOD_ACTION = { workbench: "picker", liquid: "picker", equation: "picker", own: "page", streams: "inputs", fixed: "none" };

/**
 * Move the focus inside a menu with the arrow keys (WAI-ARIA menu pattern, without wrapping the menu in a role):
 * Down and Up to the next and the previous item (round), Home and End to the first and the last. DOM-free.
 * @param {string} key  the key pressed
 * @param {number} at   the index of the item that has the focus (-1: none, e.g. the menu's button)
 * @param {number} n    how many items
 * @returns {number|null}  the index to focus, or null when the key does not move
 */
export function menuMove(key, at, n) {
  if (!n) return null;
  if (key === "ArrowDown") return at < 0 ? 0 : (at + 1) % n;
  if (key === "ArrowUp") return at < 0 ? n - 1 : (at - 1 + n) % n;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  return null;
}
/** The supporting tools, grouped: what each button of the top bar opens. */
export const TOOLS = [
  { id: "project", label: "Project", icon: "file", items: ["project"] },
  { id: "data", label: "Data", icon: "book", items: ["library", "mydata", "sources"] },
  { id: "settings", label: "Settings", icon: "units", items: ["settings"] },
  { id: "help", label: "Help", icon: "chat", items: ["aichat", "feedback"] },
];
/** The calculations beside the flowsheet, by section: [{ label, workspaces }] (every workspace but the flowsheet). */
export const calculations = () => SECTIONS.filter(sec => sec.id !== "flowsheet").map(sec => ({
  label: sec.short === "Prop. & eq." ? "Properties" : sec.short ?? sec.label, workspaces: sec.workspaces.map(id => WORKSPACES.find(w => w.id === id)) }));
const utility = id => UTILITIES.find(u => u.id === id);

const NEXT_CSS = `
.fn-shell.fug.fug-app{display:flex; flex-direction:column}
.fn-top{display:flex; align-items:center; gap:0 12px; background:var(--fa-bar); color:var(--fa-bar-fg); padding:0 8px 0 14px; min-height:44px}
.fn-top .chepta-logo{display:block; color:var(--fa-bar-strong); flex:none}
.fn-top button:focus-visible{outline:2px solid var(--fa-bar-accent); outline-offset:-2px}
.fn-tools{display:flex; align-items:center; gap:2px; margin-left:auto; flex:none}
.fn-ctx-row{display:flex; background:var(--fa-bar); padding:0 10px 8px}
.fn-ctx-row:empty{display:none}
.fn-tool{display:flex; align-items:center; gap:6px; border:1px solid transparent; background:transparent; color:var(--fa-bar-fg); font:inherit; font-size:12.5px; padding:4px 8px; border-radius:6px; cursor:pointer; white-space:nowrap}
.fn-tool .fug-ico .a{stroke:var(--fa-bar-accent)}
.fn-tool:hover,.fn-tool[aria-expanded="true"]{color:var(--fa-bar-strong); background:var(--fn-bar-hover)}
.fn-flow{display:flex; align-items:center; gap:6px; border:1px solid var(--fn-bar-edge); background:transparent; color:var(--fa-bar-strong); font:inherit; font-size:13px; font-weight:600; padding:4px 10px 4px 8px; border-radius:6px; cursor:pointer; flex:none}
.fn-flow:hover{background:var(--fn-bar-hover)}
.fn-flow[aria-current="page"]{background:var(--fug-accent); border-color:var(--fug-accent); color:var(--fug-bg)}
.fn-flow .fug-ico .a{stroke:currentColor}
.fn-ws{display:flex; align-items:center; gap:6px; border:1px solid var(--fn-bar-edge); background:var(--fn-bar-hover); color:var(--fa-bar-strong); font:inherit; font-size:13px; font-weight:600; padding:4px 8px; border-radius:6px; cursor:pointer; min-width:0}
.fn-ws span{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.fn-ws small{font-weight:400; font-size:11.5px; color:var(--fa-bar-fg)}
.fn-menu-wrap{display:flex; min-width:0}
.fn-context .fn-menu-wrap{flex:none}
.fn-shell.fug.fug-app{position:relative; overflow:visible}
.fn-menu{position:absolute; z-index:60; min-width:232px; max-width:min(320px, 92vw); background:var(--fug-bg); color:var(--fug-fg); border:1px solid var(--fug-rule); border-radius:8px; padding:6px; box-shadow:0 6px 24px var(--fn-shadow)}
.fn-menu h3{margin:6px 8px 2px; font-size:11px; font-weight:400; color:var(--fug-muted)}
.fn-item{display:flex; align-items:flex-start; gap:8px; width:100%; border:0; background:transparent; color:inherit; font:inherit; font-size:13px; text-align:left; padding:6px 8px; border-radius:6px; cursor:pointer}
.fn-item:hover{background:var(--fa-hover)}
.fn-item[aria-current="page"]{background:var(--fa-pressed); color:var(--fa-pressed-fg); font-weight:600}
.fn-item .fug-ico{flex:none; margin-top:1px; color:var(--fug-accent)}
.fn-item small{display:block; font-size:11.5px; font-weight:400; color:var(--fug-fg2)}
.fn-context{display:flex; align-items:center; gap:6px; min-width:0; overflow-x:auto; scrollbar-width:none}
.fn-chip{display:inline-flex; align-items:center; gap:6px; border:1px solid var(--fn-bar-edge); background:transparent; color:var(--fa-bar-strong); font:inherit; font-size:12px; padding:2px 8px; border-radius:6px; white-space:nowrap; cursor:pointer; min-height:26px; flex:none}
.fn-chip small{font-size:11px; color:var(--fa-bar-fg)}
.fn-chip:hover:not(:disabled),.fn-chip[aria-expanded="true"]{background:var(--fn-bar-hover)}
.fn-chip:disabled{cursor:default; border-style:dashed}
.fn-method-pop{padding:12px; min-width:280px}
.fn-method-pop p{margin:8px 0 0; font-size:11.5px; color:var(--fug-fg2)}
.fn-main{display:flex; flex:1; min-height:0; min-width:0}
.fn-host{flex:1; min-width:0; display:flex; flex-direction:column}
.fn-host>.fug.fug-app{border-radius:0; flex:1}
.fn-rail{flex:none; width:76px; background:var(--fa-ribbon); border-right:1px solid var(--fa-edge); display:flex; flex-direction:column; padding:6px 4px 12px; gap:2px}
.fn-rail h3{margin:8px 0 2px; font-size:11px; font-weight:400; color:var(--fug-muted); text-align:center}
.fn-rail h3:first-child{margin-top:2px}
.fn-rail-btn{display:flex; flex-direction:column; align-items:center; gap:2px; border:0; background:transparent; color:var(--fug-fg2); font:inherit; font-size:11px; padding:6px 2px; border-radius:6px; cursor:pointer}
.fn-rail-btn:hover{background:var(--fa-hover); color:var(--fug-fg)}
.fn-rail-btn[aria-current="page"]{background:var(--fa-pressed); color:var(--fa-pressed-fg); font-weight:600}
.fn-rail-btn[aria-current="page"] .fug-ico{color:var(--fug-accent)}
.fn-panes{display:none; background:var(--fa-ribbon); border-bottom:1px solid var(--fa-edge); padding:6px 8px; gap:4px}
.fn-pane-btn{flex:1; display:flex; align-items:center; justify-content:center; gap:6px; border:1px solid var(--fug-rule); background:var(--fug-bg); color:var(--fug-fg2); font:inherit; font-size:12.5px; padding:6px 8px; border-radius:6px; cursor:pointer}
.fn-pane-btn[aria-pressed="true"]{background:var(--fa-pressed); color:var(--fa-pressed-fg); border-color:var(--fa-pressed-edge); font-weight:600}
.fn-dot{width:6px; height:6px; border-radius:50%; background:var(--fa-busy)}

/* what the shell replaces in the workbench of app.js */
.fn-shell .fn-host .fa-titlebar,.fn-shell .fn-host .fa-subnav{display:none}
.fn-shell[data-picker] .fn-host .fa-ribbon .fa-group:is([aria-label="Model"],[aria-label="Liquid model"],[aria-label="Equation"]){display:none}
.fn-shell .fn-host .fa-ribbon .fa-group[aria-label="Composition"]{display:none}
.fn-shell .fn-host [data-fk="fs-method"],.fn-shell .fn-host [data-fk="col-method"],.fn-shell .fn-host [data-fk="rx-method"]{display:none}
.fn-shell .fn-host .fa-status .fa-cell:not(.fa-state):not(:last-child){display:none}
.fn-shell .fn-host .fa-ribbon{min-height:0; padding-bottom:4px}

/* with the rail (a wide workbench): the workspace menu is not needed */
.fn-shell[data-rail] .fn-ws-wrap{display:none}
.fn-shell:not([data-rail]) .fn-rail{display:none}
.fn-shell:not([data-rail]) .fn-tool span{display:none}

/* narrow: one pane at a time, the toolbar as one row that scrolls sideways */
.fn-shell[data-nsize="narrow"] .fn-top{padding:0 6px 0 10px; gap:0 8px}
.fn-shell[data-nsize="narrow"] .fn-tool{padding:6px 4px}
.fn-shell[data-nsize="narrow"] .fn-flow span{display:none}
.fn-shell[data-nsize="narrow"] .fn-flow{padding:4px 6px}
.fn-shell[data-nsize="narrow"] .fn-panes{display:flex}
.fn-shell[data-strip] .fn-host .fa-group{margin-left:0; border-left:0}
.fn-shell[data-strip] .fn-host .fa-ribbon{flex-direction:row; flex-wrap:nowrap; overflow-x:auto; padding:6px 8px; align-items:center; row-gap:0}
.fn-shell[data-strip] .fn-host .fa-group{flex-direction:row; border-bottom:0; border-right:1px solid var(--fa-edge); padding:0 8px; flex:none}
.fn-shell[data-strip] .fn-host .fa-group:first-child{padding-left:0}
.fn-shell[data-strip] .fn-host .fa-group:last-child{border-right:0}
.fn-shell[data-strip] .fn-host .fa-group-label{display:none}
.fn-shell[data-strip] .fn-host .fa-group-body{flex-wrap:nowrap}
.fn-shell[data-strip] .fn-host .fa-cols,.fn-shell[data-strip] .fn-host .fa-rows2{display:flex; flex-wrap:nowrap; width:auto}
.fn-shell[data-strip] .fn-host .fa-cols .fa-small,.fn-shell[data-strip] .fn-host .fa-rows2 .fa-small{white-space:nowrap}
.fn-shell[data-strip] .fn-host .fa-stack{flex-wrap:nowrap}
.fn-shell[data-strip] .fn-host .fa-big{white-space:nowrap}
.fn-shell[data-strip] .fn-host .fa-ribbon small{display:none}
.fn-shell[data-nsize="narrow"] .fn-host .fa-canvas-tools{display:none}
.fn-shell[data-nsize="narrow"][data-pane="inputs"] .fn-host .fa-canvas,.fn-shell[data-nsize="narrow"][data-pane="inputs"] .fn-host .fa-right{display:none}
.fn-shell[data-nsize="narrow"][data-pane="results"] .fn-host .fa-left{display:none}
.fn-shell[data-nsize="narrow"][data-pane="results"] .fn-host .fa-right{order:0; border-top:0; border-bottom:1px solid var(--fug-rule)}
.fn-shell[data-nsize="narrow"][data-pane="results"] .fn-host .fa-canvas{order:1}
.fn-shell[data-nsize="narrow"][data-pane="results"][data-ws="flowsheet"] .fn-host .fa-canvas{order:0}
.fn-shell[data-nsize="narrow"][data-pane="results"][data-ws="flowsheet"] .fn-host .fa-right{order:1; border-bottom:0; border-top:1px solid var(--fug-rule)}
`;
const TOKENS_LIGHT = "--fn-bar-hover:rgba(255,255,255,.08); --fn-bar-edge:rgba(255,255,255,.22); --fn-shadow:rgba(21,25,29,.18);";
const TOKENS_DARK = "--fn-bar-hover:rgba(255,255,255,.08); --fn-bar-edge:rgba(255,255,255,.2); --fn-shadow:rgba(0,0,0,.5);";

function injectNextStyles(doc) {
  if (doc.getElementById("chepta-styles-next")) return;
  const el = doc.createElement("style");
  el.id = "chepta-styles-next";
  el.textContent = `.fn-shell{${TOKENS_LIGHT}}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]) .fn-shell{${TOKENS_DARK}} }
:root[data-theme="dark"] .fn-shell{${TOKENS_DARK}}
${NEXT_CSS}${CANVAS_TABS_CSS}${UNIT_STEPS_CSS}`;
  doc.head.appendChild(el);
}

/**
 * The workbench in the reorganized layout (a prototype; proposal 0021). Same arguments and same return value as
 * app(); `cfg.layout` is ignored here.
 * @param {string|HTMLElement} target
 * @param {object} [cfg]  as app()
 * @returns {{state:object, update:(patch:object)=>void, save:()=>object, load:(project:object|string)=>void}}
 */
export function appNext(target, cfg = {}) {
  const root = typeof target === "string" ? document.querySelector(target) : target;
  if (!root) throw new Error(`CHEPTA.app: no element matches "${target}".`);
  const doc = root.ownerDocument;
  const uid = Math.random().toString(36).slice(2, 7);

  const top = h("header", { class: "fn-top" });
  const ctxRow = h("div", { class: "fn-ctx-row" });
  const panes = h("div", { class: "fn-panes", role: "group", "aria-label": "What to show" });
  const rail = h("nav", { class: "fn-rail", "aria-label": "Workspaces" });
  const host = h("div", { class: "fn-host" });
  const shell = h("div", { class: "fug fug-app fn-shell" }, top, ctxRow, panes, h("div", { class: "fn-main" }, rail, host));
  root.replaceChildren(shell);

  const { layout: _layout, ...inner } = cfg;
  // the workbench with its canvas in tabs (Plot, Table, Data, Warnings: proposal 0021, step 2); it injects its
  // styles, the shell's come after them
  const api = app(host, { ...inner, canvasTabs: true, unitSteps: true });
  injectNextStyles(doc);

  const ui = { pane: "results", menu: null, lastWs: null, auto: true, popup: null };
  const st = () => api.state;
  const go = patch => { ui.menu = null; api.update(patch); };

  // ---- menus: one open at a time; Escape and a press outside close it
  function menuButton(id, button, build, side = "is-right") {
    const open = ui.menu === id;
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-haspopup", "true");
    button.dataset.fn = id;
    // the bar is redrawn, so the focus is put back on the button that was pressed
    // the bar is redrawn, so the focus is put back on the button that was pressed; opened from the keyboard (a click
    // with no pointer, or the Down key), the focus goes into the menu, on its current item
    const toggle = intoMenu => { ui.menu = open ? null : id; render(); if (ui.menu && intoMenu) focusItem(null); else shell.querySelector(`[data-fn="${id}"]`)?.focus(); };
    button.addEventListener("click", ev => toggle(ev.detail === 0));
    button.addEventListener("keydown", ev => { if (!open && (ev.key === "ArrowDown" || ev.key === "ArrowUp")) { ev.preventDefault(); toggle(true); } });
    if (open) ui.popup = { button, side, node: h("div", { class: "fn-menu", role: "group", "aria-label": button.getAttribute("aria-label") ?? "" }, ...build()) };
    return h("div", { class: "fn-menu-wrap" + (id === "ws" ? " fn-ws-wrap" : "") }, button);
  }
  /** The items of the open menu that the arrow keys move between (a menu of lists, the method, keeps its own keys). */
  const menuItems = () => [...(shell.querySelector(":scope > .fn-menu")?.querySelectorAll(".fn-item") ?? [])];
  /** Focus an item of the open menu: by index, or (null) the current one, else the first. */
  function focusItem(i) {
    const items = menuItems();
    if (!items.length) { shell.querySelector(":scope > .fn-menu select, :scope > .fn-menu button")?.focus(); return; }
    (items[i ?? Math.max(0, items.findIndex(b => b.getAttribute("aria-current") === "page"))] ?? items[0]).focus();
  }
  /** Put the open menu under its button, inside the shell (not inside a row that scrolls, which would cut it). */
  function placePopup() {
    shell.querySelector(":scope > .fn-menu")?.remove();
    const p = ui.popup;
    if (!p || !ui.menu) return;
    shell.append(p.node);
    p.node.addEventListener("keydown", ev => {
      const items = menuItems(), to = menuMove(ev.key, items.indexOf(doc.activeElement), items.length);
      if (to != null && items.includes(doc.activeElement)) { ev.preventDefault(); items[to].focus(); }
      // Tab leaves the menu: it closes, and the focus goes on from its button
      if (ev.key === "Tab") { const id = ui.menu; ui.menu = null; render(); shell.querySelector(`[data-fn="${id}"]`)?.focus(); }
    });
    const b = p.button.getBoundingClientRect(), s0 = shell.getBoundingClientRect(), w = p.node.offsetWidth;
    const left = p.side === "is-left" ? b.left - s0.left : b.right - s0.left - w;
    p.node.style.top = `${b.bottom - s0.top + 4}px`;
    p.node.style.left = `${Math.max(4, Math.min(left, s0.width - w - 4))}px`;
  }
  doc.addEventListener("keydown", ev => {
    if (ev.key === "Escape" && ui.menu) { const id = ui.menu; ui.menu = null; render(); shell.querySelector(`[data-fn="${id}"]`)?.focus(); ev.preventDefault(); }
  });
  doc.addEventListener("click", ev => { if (ui.menu && !ev.target.closest?.(".fn-menu-wrap, .fn-menu")) { ui.menu = null; render(); } });

  const wsItem = (w, cls) => h("button", { type: "button", class: cls, "aria-current": st().workspace === w.id ? "page" : undefined,
    title: w.label, on: { click: () => go({ workspace: w.id, utility: null }) } },
    icon(w.icon, cls === "fn-item" ? 17 : 20), h("span", {}, cls === "fn-item" ? w.label : w.short));
  const wsGroups = cls => calculations().flatMap(g => [h("h3", {}, g.label), ...g.workspaces.map(w => wsItem(w, cls))]);

  // ---- the context row: method, data, units, from the workbench's contract (shell-contract.js)
  const ctx = () => api.shell.context();
  function methodChip(c) {
    const m = c.method, action = METHOD_ACTION[m.choice];
    const chip = (attrs, ...more) => h("button", { type: "button", class: "fn-chip", "data-fk": "fn-method", ...attrs }, h("small", {}, "Method"), m.label, ...more);
    if (action === "none") return chip({ disabled: true, title: m.note });
    if (action === "page") {
      return chip({ title: `${m.note} The button opens it in the Inputs panel.`,
        on: { click: () => { ui.pane = "inputs"; ui.auto = false; api.shell.openMethod(); render(); } } });
    }
    if (action === "inputs") return chip({ title: m.note, on: { click: () => { ui.pane = "inputs"; ui.auto = false; api.update({ panels: { left: true } }); render(); } } });
    const b = chip({ "aria-label": `Property method: ${m.label}` }, icon("chevronDown", 14));
    const s = st();
    const picker = m.choice === "liquid"
      ? liquidPicker({ model: s.model, id: `fn-liq-${uid}`, fk: "fn-liquid", onChange: model => api.update({ model }) })
      : m.choice === "equation"
        ? equationPicker({ model: s.model, vapour: s.vapour ?? "ideal", mixing: s.mixing ?? null, id: `fn-eq-${uid}`, fk: "fn-equation",
          onChange: p => api.update(workbenchPatch(p, s)) })
        : modelPicker({ model: s.model, vapour: s.vapour, mixing: s.mixing ?? null, id: `fn-model-${uid}`, fk: "fn-model",
          onChange: p => api.update(workbenchPatch(p, st())) });
    return menuButton("method", b, () => [h("div", { class: "fn-method-pop" }, picker, h("p", {}, m.note))], "is-left");
  }
  function dataChip(c) {
    const text = [c.data.pairs, c.data.sets].filter(Boolean).join("; ");
    // one door to the sources (the maintainer, 2026-11-12, answer 4 of the canvas tabs): the Data tab of the canvas,
    // which keeps a button to the Sources panel; on a phone the canvas is in the Results pane
    return h("button", { type: "button", class: "fn-chip", "data-fk": "fn-data", title: "What this result rests on: the Data tab of the canvas",
      on: { click: () => {
        ui.menu = null;
        if (st().utility) api.update({ utility: null });
        api.shell.tab("data");
        ui.pane = "results"; ui.auto = false; render();
        shell.querySelector('[data-fk="tab-data"]')?.focus();
      } } },
      h("small", {}, "Data"), text || "Sources used here");
  }
  /** In a calculation: take the flowsheet's components and method (one press), when it has some and they differ. */
  function fromFlowsheetChip() {
    const s = st(), fs = s.flowsheet, ids = fs?.components ?? [];
    if (s.workspace === "flowsheet" || !PICKER_WORKSPACES.includes(s.workspace) || !ids.length) return null;
    const same = ids.length === s.components.length && ids.every(id => s.components.includes(id)) && fs.thermo.model === s.model;
    if (same) return null;
    const names = ids.join(", ");
    return h("button", { type: "button", class: "fn-chip", title: `Use the flowsheet's components (${names}) and its method (${fs.thermo.model}) in this calculation`,
      on: { click: () => api.update({ components: ids, model: fs.thermo.model, vapour: fs.thermo.vapour ?? "ideal", mixing: fs.thermo.mixing ?? null }) } },
      icon("flowsheet", 14), "From the flowsheet");
  }
  const unitsChip = c => h("button", { type: "button", class: "fn-chip", "data-fk": "fn-units", title: "Units and composition basis, for every workspace (Settings)",
    on: { click: () => go({ utility: "settings" }) } }, h("small", {}, "Units"), c.units.text);

  function toolButton(t) {
    const b = h("button", { type: "button", class: "fn-tool", "aria-label": t.label, title: t.items.map(i => utility(i).label).join(", ") },
      icon(t.icon, 17), h("span", {}, t.label));
    if (t.items.length === 1) {
      b.title = utility(t.items[0]).intro;
      b.setAttribute("aria-expanded", String(st().utility === t.items[0]));
      b.addEventListener("click", () => go({ utility: st().utility === t.items[0] ? null : t.items[0] }));
      return b;
    }
    return menuButton(t.id, b, () => t.items.map(i => h("button", { type: "button", class: "fn-item", on: { click: () => go({ utility: i }) } },
      icon(utility(i).icon, 17), h("span", {}, utility(i).label, h("small", {}, utility(i).intro)))));
  }

  function render() {
    ui.popup = null;
    const s = st(), ws = WORKSPACES.find(w => w.id === s.workspace), c = ctx();
    const nsize = c.size, narrow = nsize === "narrow";
    shell.dataset.nsize = nsize;
    shell.dataset.ws = s.workspace;
    shell.dataset.pane = ui.pane;
    // the toolbar as one row that scrolls sideways: when narrow, and for the flowsheet's long palette at mid width
    if (narrow || (nsize === "mid" && s.workspace === "flowsheet")) shell.dataset.strip = ""; else delete shell.dataset.strip;
    // the Method button holds the method choice: the ribbon's own lists are hidden
    if (METHOD_ACTION[c.method.choice] === "picker") shell.dataset.picker = ""; else delete shell.dataset.picker;
    const sec = SECTIONS.find(x => x.workspaces.includes(s.workspace));
    const onFlow = s.workspace === "flowsheet";
    const flowButton = h("button", { type: "button", class: "fn-flow", "aria-current": onFlow ? "page" : undefined, "aria-label": "Flowsheet",
      title: "The flowsheet: streams, blocks and recycles", on: { click: () => go({ workspace: "flowsheet", utility: null }) } }, icon("flowsheet", 17), h("span", {}, "Flowsheet"));
    const wsButton = h("button", { type: "button", class: "fn-ws", "aria-label": onFlow ? "Calculations: choose one" : `Calculation: ${ws.label}. Choose another` },
      icon(onFlow ? "calc" : ws.icon, 17), h("span", {}, onFlow ? "Calculations" : ws.label), narrow || onFlow ? null : h("small", {}, sec.label), icon("chevronDown", 14));
    // the context row: in the top bar beside the rail, on a row of its own otherwise
    const context = h("div", { class: "fn-context", role: "group", "aria-label": "Method, data and units of this calculation" }, methodChip(c), dataChip(c), unitsChip(c), fromFlowsheetChip());
    const railed = "rail" in shell.dataset;
    ctxRow.replaceChildren(...(railed ? [] : [context]));
    top.replaceChildren(
      brandLogo({ width: narrow ? 64 : 84 }),
      flowButton,
      menuButton("ws", wsButton, () => wsGroups("fn-item"), "is-left"),
      ...(railed ? [context] : []),
      h("div", { class: "fn-tools", role: "group", "aria-label": "Supporting tools" }, ...TOOLS.map(toolButton)));
    rail.replaceChildren(...wsGroups("fn-rail-btn"));
    const need = !c.missing.complete;
    const pane = (id, label, ico) => h("button", { type: "button", class: "fn-pane-btn", "aria-pressed": String(ui.pane === id),
      on: { click: () => { ui.pane = id; ui.auto = false; render(); } } }, icon(ico, 16), label,
      id === "inputs" && need && ui.pane !== "inputs" ? h("span", { class: "fn-dot", title: "Inputs are missing" }) : null);
    placePopup();
    panes.replaceChildren(pane("inputs", "Inputs", "panelL"), pane("results", s.workspace === "flowsheet" ? "Drawing and results" : "Results", "panelR"));
  }

  // ---- follow the workbench: it tells the shell after every change it shows (its state, its size, a calculation)
  let queued = false;
  const refresh = () => {
    if (queued) return;
    queued = true;
    Promise.resolve().then(() => {
      queued = false;
      // a workspace opened without its inputs starts on the Inputs pane, a complete one on its results, until the
      // person chooses a pane
      if (st().workspace !== ui.lastWs) { ui.lastWs = st().workspace; ui.auto = true; ui.pane = "results"; }
      if (ui.auto && !ctx().missing.complete) { ui.pane = "inputs"; ui.auto = false; }
      // a menu holds live controls (the method lists): it is not rebuilt under the person's hands
      if (ui.menu !== "method" || !shell.querySelector(".fn-method-pop")?.contains(doc.activeElement)) render();
    });
  };
  api.shell.subscribe(refresh);
  // the rail needs room beside a wide workbench (1080 px, the workbench's own limit, and the rail's 76 px)
  const fit = () => { const was = "rail" in shell.dataset; if ((shell.clientWidth || 1280) >= 1156) shell.dataset.rail = ""; else delete shell.dataset.rail; if (was !== ("rail" in shell.dataset)) refresh(); };
  fit();
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(fit).observe(shell);
  ui.lastWs = st().workspace;
  ui.pane = ctx().missing.complete ? "results" : "inputs";
  render();

  return {
    get state() { return api.state; },
    update: patch => api.update(patch),
    save: () => api.save(),
    load: project => api.load(project),
  };
}
