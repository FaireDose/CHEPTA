/**
 * The numbered steps of a unit model in the reorganized layout (proposal 0021, section 2 and step 3): the Flash, the
 * Heat exchanger and the Pipe are set up as the Column, the Reactor and the Flowsheet are, in numbered steps
 * (1. Components, 2. Feed, 3. the unit), each a section of the Inputs panel that folds when it is complete and shows
 * what it holds in one line. Not pages that replace each other: a wide screen still shows them all.
 *
 * The sections of the Inputs panel stay the ones app.js, hx-view.js and pipe-view.js build (the classic layout shows
 * them as they are); this file says which step each belongs to, by its title, and, DOM-free:
 *  - unitSteps(state, titles, check, nameOf): the steps of the workspace, numbered, with the sections they gather,
 *    whether each is complete, and the line a folded step shows;
 *  - stepOpen(step, o): whether a step is open (the person's choice, else open while it needs something or while the
 *    person works in it; an optional step starts folded).
 * The second part builds the steps around the sections (DOM). A view (layer 6); tested in test/unit-steps.test.js.
 */
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { FLASH_DEFAULTS } from "./flash-logic.js";
import { HX_DEFAULTS, UTILITY_KINDS, TWO_SPECS } from "./hx-logic.js";
import { PIPE_DEFAULTS, PIPE_HEAT } from "./pipe-logic.js";
import { tLabel, tToDisplay, pToDisplay, fmtShort } from "./properties-logic.js";
import { hxSetups } from "./app-logic.js";

/** The workspaces set up in numbered steps by this file (the Column, the Reactor and the Flowsheet have their own). */
export const STEP_WORKSPACES = ["flash", "hx", "pipe"];

/**
 * The steps of each workspace: id, title, the titles of the Inputs sections it gathers (a pattern), and whether it
 * is optional (a step whose defaults serve, folded from the start). A section no step names (the parameter sets of
 * the pairs) stays after the steps, as it is.
 */
const PLANS = {
  flash: () => [
    { id: "components", title: "Components", match: /^Components$/ },
    { id: "feed", title: "Feed", match: /^Feed\b/ },
    { id: "unit", title: "Flash", match: /^Specification\b/ },
  ],
  hx: hx => (hx.mode === "two"
    ? [
      { id: "hot", title: "Hot stream", match: /^Hot stream$/ },
      { id: "cold", title: "Cold stream", match: /^Cold stream$/ },
      { id: "unit", title: "Exchanger", match: /^(Specification|Exchanger|Heat transfer coefficient U|Arrangement)$/ },
      { id: "wall", title: "Wall thickness", match: /^Wall thickness/, optional: true },
    ]
    : [
      { id: "components", title: "Components", match: /^Components$/ },
      { id: "feed", title: "Process stream", match: /^Process stream$/ },
      { id: "unit", title: "Exchanger", match: /^(Process outlet|Exchanger|Utility|Heat transfer coefficient U|Arrangement)$/ },
      { id: "wall", title: "Wall thickness", match: /^Wall thickness/, optional: true },
    ]),
  pipe: () => [
    { id: "components", title: "Components", match: /^Components$/ },
    { id: "feed", title: "Inlet", match: /^Inlet$/ },
    { id: "unit", title: "Pipe", match: /^(Pipe|Fittings|Heat)$/ },
    { id: "options", title: "Options", match: /^Options$/, optional: true },
  ],
};

const T = (K, u) => `${fmtShort(+tToDisplay(K, u).toFixed(3), 6)} ${tLabel(u)}`;
const P = (kPa, u) => `${fmtShort(pToDisplay(kPa, u), 6)} ${u.P}`;
const zText = (z, n) => (!Array.isArray(z) || z.length !== n ? "equimolar" : `z ${z.map(v => fmtShort(+(v / z.reduce((a, b) => a + b, 0)).toPrecision(3), 3)).join(" / ")}`);
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);

/** The line a folded step shows: what it holds, in the display units. */
function summaryOf(ws, id, state, ids, nameOf) {
  const u = state.units, names = ids.map(nameOf).join(", ");
  if (id === "components") return names;
  if (ws === "flash") {
    const f = { ...FLASH_DEFAULTS, ...(state.flash ?? {}) };
    if (id === "feed") return [`${fmtShort(f.flow, 6)} ${f.flowUnit}`, zText(f.z, ids.length), f.spec === "PH" || f.duty ? `from ${T(f.feedT_K, u)}, ${P(f.feedP_kPa, u)}` : null].filter(Boolean).join("; ");
    const c = { TP: [`T ${T(f.T_K, u)}`, `P ${P(f.P_kPa, u)}`], PVF: [`P ${P(f.P_kPa, u)}`, `VF ${f.VF}`], TVF: [`T ${T(f.T_K, u)}`, `VF ${f.VF}`], PH: [`P ${P(f.P_kPa, u)}`, `Q ${fmtShort(f.Q_J_mol, 6)} J/mol`] }[f.spec] ?? [];
    return c.join(", ");
  }
  if (ws === "hx") {
    const hx = state.hx ?? HX_DEFAULTS;
    const side = s => [`${fmtShort(s.flow, 6)} kmol/h`, T(s.T_K, u), P(s.P_kPa, u)];
    if (id === "feed") return side(hx.process).join(", ");
    if (id === "hot" || id === "cold") return [names || "no components", ...side(hx[id])].join("; ");
    if (id === "wall") return hx.wall.S_MPa == null ? "allowable stress not given" : `${P(hx.wall.P_kPa, u)}, ${fmtShort(hx.wall.D_in_mm, 6)} mm, ${fmtShort(hx.wall.S_MPa, 6)} MPa`;
    const parts = [];
    if (hx.task === "rating") parts.push(`area ${fmtShort(hx.rating.area_m2, 6)} m²`);
    else if (hx.mode === "two") {
      const sp = hx.spec, label = TWO_SPECS.find(([k]) => k === sp.kind)?.[1] ?? sp.kind;
      parts.push(`${label} ${sp.kind.endsWith("_K") ? T(sp.value, u) : sp.kind === "duty_kW" ? `${fmtShort(sp.value, 6)} kW` : `${fmtShort(sp.value, 6)} K`}`);
    } else parts.push(hx.process.out === "T" ? `outlet ${T(hx.process.T_out_K, u)}` : `outlet VF ${hx.process.VF_out}`);
    if (hx.mode !== "two") parts.push(lower(UTILITY_KINDS.find(([k]) => k === hx.utility.kind)?.[1] ?? hx.utility.kind));
    if (!(hx.mode !== "two" && hx.utility.kind === "electric")) {
      parts.push(hx.U.source === "value" ? `U ${fmtShort(hx.U.value, 6)} W/(m² K)` : hx.U.source === "film" ? "U from films and wall" : `U from service, ${hx.U.pick}`);
      parts.push(hx.arrangement === "shell-and-tube" ? `shell and tube, ${hx.shells} shell${hx.shells === 1 ? "" : "s"}` : hx.arrangement.replace(/-/g, " "));
    }
    return parts.join("; ");
  }
  if (ws === "pipe") {
    const p = { ...PIPE_DEFAULTS, ...(state.pipe ?? {}) };
    if (id === "feed") return [`${fmtShort(p.feed.flow, 6)} ${p.feed.basis}`, T(p.feed.T_K, u), P(p.feed.P_kPa, u)].join(", ");
    if (id === "unit") {
      const n = p.fittings.reduce((a, f) => a + (f.count ?? 1), 0);
      return [`${fmtShort(p.length_m, 6)} m`, `${fmtShort(p.diameter_m * 1000, 6)} mm`, n ? `${n} fitting${n === 1 ? "" : "s"}` : "no fittings",
        lower(PIPE_HEAT.find(([k]) => k === p.heat)?.[1] ?? p.heat)].join("; ");
    }
    const own = [p.friction_factor != null ? "your friction factor" : null, p.viscosity_Pa_s != null ? "your viscosity" : null].filter(Boolean);
    return [`${p.segments} segments`, ...own].join("; ");
  }
  return "";
}

/**
 * The steps of a unit model's Inputs panel.
 * @param {object} state  the workbench's state (workspace "flash", "hx" or "pipe")
 * @param {string[]} titles  the titles of the Inputs sections, in order
 * @param {{ok:boolean, problems:{stream?:string, message:string}[]}} check  viewCheck of the state
 * @param {(id:string)=>string} [nameOf]  a component's name
 * @returns {{id:string, n:number, title:string, sections:number[], optional:boolean, status:"done"|"todo"|"optional",
 *   summary:string, problems:number}[]}  only the steps that have a section; `sections`: indexes into `titles`
 */
export function unitSteps(state, titles, check, nameOf = id => id) {
  const ws = state.workspace;
  if (!STEP_WORKSPACES.includes(ws)) return [];
  const plan = PLANS[ws](state.hx ?? HX_DEFAULTS);
  const two = ws === "hx" && (state.hx ?? HX_DEFAULTS).mode === "two";
  const out = [];
  for (const st of plan) {
    const sections = titles.map((t, i) => (st.match.test(t) ? i : -1)).filter(i => i >= 0);
    if (!sections.length) continue;
    // the problems of the inputs belong to the components (to their stream in a process exchanger); the other steps
    // are filled with values that serve from the start, so they are complete once the components are
    const mine = two ? check.problems.filter(p => p.stream === st.id) : st.id === "components" ? check.problems : [];
    const ids = two ? (st.id === "hot" || st.id === "cold" ? streamIds(state, st.id) : []) : state.inputs?.[ws] ?? [];
    const status = mine.length ? "todo" : st.optional ? "optional" : st.id === "components" || st.id === "hot" || st.id === "cold" || check.ok ? "done" : "todo";
    out.push({ id: st.id, n: out.length + 1, title: st.title, sections, optional: !!st.optional, status,
      summary: status === "todo" && !mine.length ? "after the components" : mine.length && !ids.length ? "nothing chosen yet" : summaryOf(ws, st.id, state, ids, nameOf),
      problems: mine.length });
  }
  return out;
}
/** A process exchanger stream's components (app-logic.js hxSetups: its own, else the workbench's). */
const streamIds = (state, key) => hxSetups(state)[key].ids;

/**
 * Whether a step is open: the person's own choice when they made one (pressed its heading), else open while it needs
 * something, and open while the person works in it (the last step they focused), so a step never folds under their
 * hands; a complete or optional step is folded, its line saying what it holds.
 * @param {{id:string, status:string}} step
 * @param {{choice?:boolean|null, active?:string|null}} [o]
 */
export function stepOpen(step, { choice = null, active = null } = {}) {
  if (choice === true || choice === false) return choice;
  return step.status === "todo" || active === step.id;
}

/** The words a screen reader says after a step's title. */
export const stepState = s => (s.status === "done" ? "complete" : s.status === "optional" ? "optional" : s.problems ? `${s.problems} problem${s.problems === 1 ? "" : "s"}` : "to do");

// ---------------------------------------------------------------------------------------------------------------------
// the steps (DOM)

/**
 * Gather the sections of the Inputs panel into numbered steps. `secs`: the panel's sections (an element whose
 * first child is its h3; a <div> of sections is opened up); returns the steps, then the sections no step takes.
 * @param {Node[]} secs
 * @param {{state:object, check:object, nameOf:(id:string)=>string, uid:string, open:(step:object)=>boolean,
 *   onToggle:(step:object, open:boolean)=>void, onWork:(id:string)=>void}} o
 */
export function stepSections(secs, { state, check, nameOf, uid, open, onToggle, onWork }) {
  const flat = secs.filter(Boolean).flatMap(s => (s.matches?.("div:not(.fa-in-sec)") && s.querySelector(":scope > .fa-in-sec") ? [...s.children] : [s]));
  const titleOf = s => s.querySelector?.(":scope > h3")?.textContent.trim() ?? "";
  const steps = unitSteps(state, flat.map(titleOf), check, nameOf);
  if (!steps.length) return flat;
  const taken = new Set(steps.flatMap(s => s.sections));
  const out = steps.map(s => {
    const bodyId = `fa-step-${s.id}-${uid}`, on = open(s);
    const body = h("div", { class: "fa-step-body", id: bodyId });
    for (const i of s.sections) {
      const sec = flat[i], head = sec.querySelector(":scope > h3");
      // the step's own title is not repeated; the other sections keep theirs, one level down
      if (head && (head.textContent.trim() === s.title || s.sections.length === 1)) head.remove();
      else if (head) head.replaceWith(h("h4", {}, ...head.childNodes));
      sec.classList.add("fa-step-sec");
      body.append(sec);
    }
    body.hidden = !on;
    const line = h("span", { class: "fa-step-line" }, s.summary);
    const btn = h("button", { type: "button", class: "fa-step-btn", "aria-expanded": String(on), "aria-controls": bodyId, "data-fk": `step-${s.id}`,
      on: { click: () => { const now = btn.getAttribute("aria-expanded") !== "true"; set(now); onToggle(s, now); } } },
      h("span", { class: "fa-step-n", "aria-hidden": "true" }, s.status === "done" ? icon("check", 12) : String(s.n)),
      h("span", { class: "fa-step-title" }, `${s.n}. ${s.title}`, h("span", { class: "fa-visually-hidden" }, `, ${stepState(s)}`), s.optional ? h("small", {}, "optional") : null),
      line, h("span", { class: "fa-step-chev", "aria-hidden": "true" }, icon("chevronDown", 14)));
    const sec = h("section", { class: `fa-in-sec fa-step is-${s.status}${on ? " is-open" : ""}`, "data-step": s.id }, h("h3", {}, btn), body);
    function set(v) { btn.setAttribute("aria-expanded", String(v)); body.hidden = !v; sec.classList.toggle("is-open", v); }
    sec.addEventListener("focusin", ev => { if (body.contains(ev.target)) onWork(s.id); });
    return sec;
  });
  return [...out, ...flat.filter((_, i) => !taken.has(i))];
}

export const UNIT_STEPS_CSS = `
.fa-step{padding:0}
.fa-in-sec + .fa-step{padding-top:0}
.fa-step>h3{margin:0}
.fa-step-btn{display:grid; grid-template-columns:20px minmax(0, 1fr) 14px; column-gap:8px; align-items:center; width:100%; border:0; background:transparent; color:inherit; font:inherit; text-align:left; padding:10px 12px; cursor:pointer}
.fa-step-btn:hover{background:var(--fa-hover)}
.fa-step-btn:focus-visible{outline:2px solid var(--fug-accent); outline-offset:-2px}
.fa-step-n{grid-row:1 / span 2; align-self:start; display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; background:var(--fug-accent); color:var(--fug-bg); font-size:11px; font-weight:600}
.fa-step.is-done .fa-step-n{background:var(--fa-ok)}
.fa-step.is-optional .fa-step-n{background:transparent; color:var(--fug-fg2); border:1px solid var(--fug-rule)}
.fa-step-title{font-size:12.5px; font-weight:600; color:var(--fug-fg)}
.fa-step-title small{font-weight:400; color:var(--fug-muted); font-size:11px; margin-left:6px}
.fa-step-line{grid-column:2; font-size:11.5px; font-weight:400; color:var(--fug-fg2); overflow:hidden; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-clamp:2}
.fa-step.is-open .fa-step-line{display:none}
.fa-step-chev{grid-column:3; grid-row:1; display:inline-flex; color:var(--fug-fg2); transition:transform .15s}
.fa-step.is-open .fa-step-chev{transform:rotate(180deg)}
.fa-step-body{padding:0 12px 10px}
.fa-step-body[hidden]{display:none}
.fa-step-sec{padding:0}
.fa-step-sec + .fa-step-sec{border-top:0; padding-top:6px}
.fa-step-sec h4{font-size:12px; font-weight:600; margin:6px 0 6px; color:var(--fug-fg2)}
@media (prefers-reduced-motion: reduce){ .fa-step-chev{transition:none} }
`;
