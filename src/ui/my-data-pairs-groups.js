/**
 * The My data panel's sections for pair parameters and Modified UNIFAC 2.0 groups (proposal 0012, step 5), side by
 * side with the databank's (the maintainer, 2026-10-16): for a pair, a table with one column per databank set and an
 * empty column for one's own (with the bubble point each gives, to compare); for a component, the database's groups
 * with their R, Q and main groups next to one's own selection, with the atom balance and the interaction parameters
 * between the main groups.
 *
 * A view (layer 6): the tables come from src/ui/pairs-groups-logic.js, the checks from src/thermo/user-data.js.
 */
import { warning, summaryOf, problemsWarning } from "./warning.js";
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { componentPicker } from "./component-picker.js";
import { userOverlay } from "./app-logic.js";
import { listComponents } from "../thermo/system.js";
import { system } from "../system.js";
import { tLabel, tToDisplay, fmtShort } from "./properties-logic.js";
import { putUserData } from "./user-data-file.js";
import { PAIR_MODELS, pairColumns, pairEntry, withPairValues, groupColumns, groupRows, atomBalance, mainGroupInteractions, searchSubgroups } from "./pairs-groups-logic.js";

const num = v => (v == null || v === "" ? "–" : typeof v === "number" ? fmtShort(v, 6) : String(v));
const fmtT = (T, units) => `${fmtShort(tToDisplay(T, units ?? { T: "C" }), 5)} ${tLabel(units ?? { T: "C" })}`;

// ---------------------------------------------------------------------------------------------------------------
// pair parameters

export function pairSection(env, m, draw) {
  const state = env.get(), ud = userOverlay(state);
  const p = (m.pair ??= { a: null, b: null, model: "NRTL", typed: {}, source: "", Tmin: "", Tmax: "", loaded: null, error: "" });
  const comps = listComponents({ userData: ud }).filter(c => !c.solid);
  const pick = (k, label) => componentPicker({ id: `fa-md-pair-${k}-${env.uid}`, label, components: comps, value: p[k], placeholder: "Name, formula or CAS number",
    fk: `mydata-pair-${k}`, onPick: id => { p[k] = id; p.loaded = null; p.error = ""; draw(); } });
  const modelSel = h("label", { class: "fa-field", for: `fa-md-pm-${env.uid}` }, h("span", {}, "Model"),
    h("select", { id: `fa-md-pm-${env.uid}`, "data-fk": "mydata-pair-model", on: { change: ev => { p.model = ev.target.value; p.loaded = null; p.error = ""; draw(); } } },
      ...Object.entries(PAIR_MODELS).map(([k, s]) => h("option", { value: k, selected: k === p.model }, s.label))));
  const out = [
    h("p", { class: "fa-in-hint" }, "Your own coefficients for a pair, next to the databank's. Yours become the pair's default in this project; the databank's sets stay selectable (Library, and the Inputs panel)."),
    h("div", { class: "fa-in-row fa-wrap" }, pick("a", "Component i"), pick("b", "Component j")), modelSel,
  ];
  if (!p.a || !p.b) return out;
  if (p.a === p.b) { out.push(warning("Choose two different components.", { attrs: { role: "alert" } })); return out; }
  let cols;
  try { cols = pairColumns(p.a, p.b, p.model, state.userData); } catch (e) { out.push(warning(e.message, { attrs: { role: "alert" } })); return out; }
  const key = JSON.stringify([p.a, p.b, p.model]);
  if (p.loaded !== key) {
    // the person's own set, when there is one, fills the empty column
    p.typed = cols.mine ? Object.fromEntries(Object.entries(cols.mine.values).map(([k, v]) => [k, String(v)])) : {};
    p.source = cols.mine?.source ?? "";
    p.Tmin = cols.mine?.valid?.T_K?.[0] != null ? String(cols.mine.valid.T_K[0]) : "";
    p.Tmax = cols.mine?.valid?.T_K?.[1] != null ? String(cols.mine.valid.T_K[1]) : "";
    p.loaded = key;
  }
  const names = new Map(comps.map(c => [c.id, c.name]));
  out.push(h("p", { class: "fa-in-hint" }, `i = ${names.get(p.a)}, j = ${names.get(p.b)}. ${PAIR_MODELS[p.model].equation}.`));
  // the table: one column per databank set, then mine
  const input = k => h("input", { type: "text", inputmode: "decimal", value: p.typed[k] ?? "", "aria-label": `Your ${k}`, "data-fk": `mydata-pair-v-${k}`, style: "width:8em",
    placeholder: k === "alpha" ? "0.3" : k.startsWith("a_") ? "0" : "", on: { input: ev => { p.typed[k] = ev.target.value; } } });
  const head = h("tr", {}, h("th", { scope: "col" }, "Parameter"),
    ...cols.databank.map(d => h("th", { scope: "col" }, d.set, h("br", {}), h("span", { class: `fa-tier fa-tier-${d.tier}` }, d.tier), d.default ? h("small", {}, " default") : null)),
    h("th", { scope: "col", class: "fa-mine-col" }, "Mine", h("br", {}), h("span", { class: "fa-tier fa-tier-user" }, "user")));
  const rows = cols.params.map(([k, u]) => h("tr", {}, h("th", { scope: "row" }, k, u !== "-" ? h("small", {}, ` ${u}`) : null),
    ...cols.databank.map(d => h("td", { class: "fug-num" }, num(d.values[k]))), h("td", { class: "fa-mine-col" }, input(k))));
  const copyRow = cols.databank.length ? h("tr", {}, h("td", {}),
    ...cols.databank.map(d => h("td", {}, h("button", { type: "button", class: "fa-mini", "data-fk": `mydata-pair-copy-${d.set}`, title: "Start your column from this set",
      on: { click: () => { p.typed = Object.fromEntries(Object.entries(d.values).map(([k, v]) => [k, String(v)])); draw(); } } }, icon("copy", 13), "Copy"))), h("td", {})) : null;
  out.push(h("div", { class: "fug-scroll fa-side-table", tabindex: "0", role: "region", "aria-label": "Coefficients side by side" },
    h("table", {}, h("thead", {}, head), h("tbody", {}, ...rows, copyRow))));
  if (!cols.databank.length) out.push(h("p", { class: "fa-in-hint" }, `The databank has no ${PAIR_MODELS[p.model].label} set for this pair: yours fills the gap.`));
  if (cols.databank.length) out.push(h("details", { class: "fa-paste" }, h("summary", {}, "Sources of the databank's sets"),
    ...cols.databank.map(d => h("p", { class: "fa-in-hint" }, h("b", {}, `${d.set}: `), d.source || "no source text"))));
  // the bubble point each column gives, to compare
  out.push(comparison(env, p, cols));
  const field = (k, label, width = "8em", placeholder = "") => h("label", { class: "fa-field", for: `fa-md-p${k}-${env.uid}` }, h("span", {}, label),
    h("input", { type: "text", id: `fa-md-p${k}-${env.uid}`, value: p[k], placeholder, style: `width:${width}`, "data-fk": `mydata-pair-${k}`, on: { input: ev => { p[k] = ev.target.value; } } }));
  out.push(
    h("div", { class: "fa-in-row fa-wrap" }, field("Tmin", "Valid from, K (optional)"), field("Tmax", "to, K")),
    h("label", { class: "fa-field fa-field-wide", for: `fa-md-psource-${env.uid}` }, h("span", {}, "Source (where these coefficients come from)"),
      h("input", { type: "text", id: `fa-md-psource-${env.uid}`, value: p.source, style: "width:100%", placeholder: "fit to our VLE data, 2026", "data-fk": "mydata-pair-source",
        on: { input: ev => { p.source = ev.target.value; } } })),
    h("div", { class: "fa-in-actions" },
      h("button", { type: "button", class: "fa-mini", "data-fk": "mydata-pair-compare", on: { click: () => { p.error = ""; draw(); } } }, icon("calc", 15), "Compare"),
      h("button", { type: "button", class: "fa-mini", "data-fk": "mydata-pair-save", on: { click: () => { savePair(env, m, p, names); draw(); } } }, icon("check", 15), "Add to this project")));
  if (p.error) out.push(warning(p.error, { attrs: { role: "alert", "data-fk": "mydata-pair-error" } }));
  return out;
}

function validOf(p) {
  const lo = String(p.Tmin).trim(), hi = String(p.Tmax).trim();
  if (!lo && !hi) return null;
  const a = Number(lo.replace(",", ".")), b = Number(hi.replace(",", "."));
  if (!(a > 0 && b >= a)) throw new Error("The validity range: give From and To in K, From below To.");
  return { T_K: [a, b] };
}

function savePair(env, m, p, names) {
  p.error = "";
  if (!p.source.trim()) { p.error = "Write where these coefficients come from in Source, then add them."; return; }
  try {
    // into the person's entry of this pair when there is one (its other models kept), else a new entry
    const next = withPairValues(env.get().userData, p.a, p.b, p.model, p.typed, p.source.trim(), validOf(p));
    env.set({ userData: next });
    m.note = `Added to this project: ${names.get(p.a)} + ${names.get(p.b)}, ${PAIR_MODELS[p.model].label}. It is the pair's default now; switch back with Databank's in the list above.`;
    p.loaded = null;
  } catch (e) { p.error = `Not added: ${e.message}`; }
}

/** The bubble point of an equimolar liquid at 1 atm with each databank set and with the person's column. */
function comparison(env, p, cols) {
  const state = env.get();
  if (!cols.databank.length && !Object.keys(p.typed).length) return null;
  const P = 101.325, z = [0.5, 0.5];
  const bubble = cfg => { try { return system(cfg).bubbleT(z, P).T; } catch { return null; } };
  const base = { components: [p.a, p.b], model: p.model, ...(state.vapour && !["PR", "SRK"].includes(p.model) ? { vapour: state.vapour } : {}) };
  const ud = state.userData;
  // the databank's sets without the person's data (it would put their own set first); theirs with it
  const items = cols.databank.map(d => [d.set, bubble({ ...base, sets: { [`${p.a}+${p.b}`]: d.set } })]);
  let mine = null;
  try { mine = bubble({ ...base, userData: withPairValues(ud, p.a, p.b, p.model, p.typed, "comparison only") }); } catch { mine = null; }
  items.push(["mine", mine]);
  return h("p", { class: "fa-in-hint", "data-fk": "mydata-pair-bubble" }, h("b", {}, "Bubble point of an equimolar liquid at 1 atm: "),
    items.map(([k, T]) => `${k} ${T == null ? "–" : fmtT(T, state.units)}`).join("; "), ".");
}

// ---------------------------------------------------------------------------------------------------------------
// Modified UNIFAC 2.0 groups

export function groupsSection(env, m, draw) {
  const state = env.get(), ud = userOverlay(state);
  const g = (m.grp ??= { comp: null, sel: {}, query: "", source: "", loaded: null, error: "" });
  const comps = listComponents({ userData: ud }).filter(c => !c.solid);
  const out = [
    h("p", { class: "fa-in-hint" }, "The groups Modified UNIFAC 2.0 uses for a component: the database's, with how they were found, next to your own selection. Yours replace the database's in this project."),
    componentPicker({ id: `fa-md-grp-${env.uid}`, label: "Component", components: comps, value: g.comp, placeholder: "Name, formula or CAS number",
      fk: "mydata-grp-comp", onPick: id => { g.comp = id; g.loaded = null; g.error = ""; draw(); } }),
  ];
  if (!g.comp) return out;
  const cols = groupColumns(g.comp, state.userData);
  if (g.loaded !== g.comp) {
    g.sel = { ...(cols.mine?.groups ?? {}) };
    g.source = cols.mine?.source ?? "";
    g.loaded = g.comp;
  }
  const table = (rows, editable) => h("table", {},
    h("thead", {}, h("tr", {}, ...["Subgroup (main group)", "Count", "R", "Q"].map(t => h("th", { scope: "col" }, t)), editable ? h("th", {}) : null)),
    h("tbody", {}, ...rows.map(r => h("tr", {},
      h("td", {}, h("span", {}, r.name), h("small", { class: "fa-sub-main" }, `${r.id} · ${r.mainName} (${r.main})`)),
      h("td", { class: "fug-num" }, editable
        ? h("input", { type: "number", min: "1", step: "1", value: String(r.count), style: "width:3.6em", "aria-label": `Count of ${r.name}`, "data-fk": `mydata-grp-n-${r.id}`,
          on: { change: ev => { const n = Math.round(Number(ev.target.value)); if (n >= 1) g.sel[r.id] = n; else delete g.sel[r.id]; draw(); } } })
        : String(r.count)),
      h("td", { class: "fug-num" }, num(r.R)), h("td", { class: "fug-num" }, num(r.Q)),
      editable ? h("td", {}, h("button", { type: "button", class: "fa-mini", "aria-label": `Remove ${r.name}`, "data-fk": `mydata-grp-rm-${r.id}`,
        on: { click: () => { delete g.sel[r.id]; draw(); } } }, "×")) : null))));
  const sums = groups => {
    const rows = groupRows(groups);
    return `r = ${fmtShort(rows.reduce((s, r) => s + r.count * (r.R ?? 0), 0), 5)}, q = ${fmtShort(rows.reduce((s, r) => s + r.count * (r.Q ?? 0), 0), 5)}`;
  };
  const balance = groups => {
    const b = atomBalance(groups, cols.formula);
    return h("p", { class: b.ok || b.oneHOver || b.ok === null ? "fa-in-hint" : "fug-warn", "data-fk": "mydata-grp-balance" }, h("b", {}, "Atom balance: "), b.text, ".");
  };
  // the database's column
  const left = h("div", { class: "fa-side-col" }, h("h4", {}, "The database's"),
    cols.database?.groups
      ? [h("div", { class: "fug-scroll", tabindex: "0", role: "region", "aria-label": "The database's groups" }, table(groupRows(cols.database.groups), false)),
        h("p", { class: "fa-in-hint" }, sums(cols.database.groups)), balance(cols.database.groups),
        h("details", { class: "fa-paste" }, h("summary", {}, "How they were found"), h("p", { class: "fa-in-hint" }, cols.database.source)),
        h("button", { type: "button", class: "fa-mini", "data-fk": "mydata-grp-start", on: { click: () => { g.sel = { ...cols.database.groups }; draw(); } } }, icon("copy", 14), "Start mine from these")]
      : h("p", { class: "fa-in-hint" }, cols.database ? `None: ${cols.database.note}.` : "Your own component: the database has none."));
  // mine
  const found = searchSubgroups(g.query).slice(0, 60);
  const addSel = h("select", { "aria-label": "Subgroup to add", "data-fk": "mydata-grp-pick" }, ...found.map(s => h("option", { value: s.id }, `${s.name} (${s.mainName}) · R ${fmtShort(s.R, 4)}, Q ${fmtShort(s.Q, 4)}`)));
  const right = h("div", { class: "fa-side-col" }, h("h4", {}, "Mine"),
    Object.keys(g.sel).length
      ? [h("div", { class: "fug-scroll", tabindex: "0", role: "region", "aria-label": "Your groups" }, table(groupRows(g.sel), true)),
        h("p", { class: "fa-in-hint" }, sums(g.sel)), balance(g.sel)]
      : h("p", { class: "fa-in-hint" }, "No groups chosen yet: add subgroups below, or start from the database's."),
    h("div", { class: "fa-in-row fa-wrap" },
      h("label", { class: "fa-field", for: `fa-md-gq-${env.uid}` }, h("span", {}, "Find a subgroup"),
        h("input", { type: "search", id: `fa-md-gq-${env.uid}`, value: g.query, placeholder: "OH, CH3, ring, …", style: "width:10em", "data-fk": "mydata-grp-q",
          on: { change: ev => { g.query = ev.target.value; draw(); } } })),
      h("label", { class: "fa-field" }, h("span", {}, `${found.length} subgroup${found.length === 1 ? "" : "s"}`), addSel),
      h("button", { type: "button", class: "fa-mini", "data-fk": "mydata-grp-add", disabled: !found.length,
        on: { click: () => { const id = addSel.value; if (id) g.sel[id] = (g.sel[id] ?? 0) + 1; draw(); } } }, icon("plus", 14), "Add")));
  out.push(h("div", { class: "fa-side2" }, left, right));
  // the interaction parameters between the main groups of mine (or the database's)
  const forInter = Object.keys(g.sel).length ? g.sel : cols.database?.groups;
  const inter = forInter ? mainGroupInteractions(forInter) : [];
  if (inter.length) {
    out.push(h("details", { class: "fa-paste", open: true }, h("summary", {}, `Interaction parameters between these main groups (Ψnm = exp(−(anm + bnm T)/T); ${Object.keys(g.sel).length ? "your groups" : "the database's groups"})`),
      h("div", { class: "fug-scroll", tabindex: "0", role: "region", "aria-label": "Interaction parameters" }, h("table", {},
        h("thead", {}, h("tr", {}, ...["n", "m", "anm, K", "bnm", "amn, K", "bmn"].map(t => h("th", { scope: "col" }, t)))),
        h("tbody", {}, ...inter.map(r => h("tr", {}, h("td", {}, r.nName), h("td", {}, r.mName),
          ...(r.missing ? [h("td", { colspan: "4" }, "no parameters in Modified UNIFAC 2.0")] : [r.a_nm, r.b_nm, r.a_mn, r.b_mn].map(v => h("td", { class: "fug-num" }, num(v)))))))))));
  }
  out.push(
    h("label", { class: "fa-field fa-field-wide", for: `fa-md-gsource-${env.uid}` }, h("span", {}, "Source (where this assignment comes from)"),
      h("input", { type: "text", id: `fa-md-gsource-${env.uid}`, value: g.source, style: "width:100%", placeholder: "my assignment from the structure", "data-fk": "mydata-grp-source",
        on: { input: ev => { g.source = ev.target.value; } } })),
    h("div", { class: "fa-in-actions" }, h("button", { type: "button", class: "fa-mini", "data-fk": "mydata-grp-save", on: { click: () => { saveGroups(env, m, g, comps); draw(); } } }, icon("check", 15), "Add to this project")));
  if (g.error) out.push(warning(g.error, { attrs: { role: "alert", "data-fk": "mydata-grp-error" } }));
  return out;
}

function saveGroups(env, m, g, comps) {
  g.error = "";
  if (!Object.keys(g.sel).length) { g.error = "Choose at least one subgroup."; return; }
  if (!g.source.trim()) { g.error = "Write where this assignment comes from in Source, then add it."; return; }
  const name = comps.find(c => c.id === g.comp)?.name ?? g.comp;
  try {
    const ud = env.get().userData ?? {};
    const groups = { subgroups: { ...g.sel }, source: { name: g.source.trim() } };
    const piece = g.comp.startsWith("user:") ? { components: { [g.comp]: { ...JSON.parse(JSON.stringify(ud.components[g.comp])), groups } } } : { groups: { [g.comp]: groups } };
    env.set({ userData: putUserData(ud, piece) });
    m.note = `Added to this project: Modified UNIFAC 2.0 groups of ${name}. Mod. UNIFAC 2.0 now uses them${g.comp.startsWith("user:") ? "" : "; switch back with Database's groups in the list above"}.`;
    g.loaded = null;
  } catch (e) { g.error = `Not added: ${e.message}`; }
}
