/**
 * The My data panel (proposal 0012, step 3): the user's own property records and components, kept with the project.
 * Docked like the other supporting panels. It lists what the project holds, adds a property (a pasted table of points
 * fitted by the repository's equation forms, with the fit's deviation and a plot over the databank's record, or typed
 * coefficients) and a component of the person's own, saves and opens the data as a file of its own (merging with the
 * choice on conflicts), and drafts a contribution package from an entry.
 *
 * Everything the person types stays in `ui.mydata` until it is saved, so redrawing the panel loses nothing; saving
 * goes through set({ userData }), which checks it (checkUserData) and recalculates every view that uses it.
 *
 * A view (layer 6): the fit is src/thermo/user-fit.js, the checks src/thermo/user-data.js, the files
 * src/ui/user-data-file.js.
 */
import { h, s as svgEl, ticks } from "./dom.js";
import { icon } from "./icons.js";
import { componentPicker } from "./component-picker.js";
import { saveText, copyText } from "./app-views.js";
import { userOverlay } from "./app-logic.js";
import { listComponents } from "../thermo/system.js";
import { pure, PROPERTIES } from "../thermo/pure.js";
import { evaluate, CORRELATION_EQUATIONS } from "../thermo/correlations.js";
import { RECORD_UNITS } from "../thermo/user-data.js";
import { USER_PREFIX } from "../thermo/components.js";
import { FIT_EQUATION, INPUT_UNITS, T_UNITS, parseTable, toRecordUnits, fitPoints, autoFit, recordFromFit } from "../thermo/user-fit.js";
import { userDataDoc, userDataText, userDataFileName, readUserDataFile, mergeUserData, userDataPackage, removeUserDataEntry, putUserData, userDataList } from "./user-data-file.js";
import { fmtShort } from "./properties-logic.js";
import pkg from "../../package.json" with { type: "json" };

/** Property labels, the vapour pressure included. */
export const PROPERTY_LABEL = { ...Object.fromEntries(Object.entries(PROPERTIES).map(([k, p]) => [k, p.label])), vapourPressure: "Vapour pressure" };
const PROPERTY_ORDER = ["vapourPressure", "liquidDensity", "liquidHeatCapacity", "heatOfVaporization", "idealGasHeatCapacity", "liquidViscosity",
  "vapourViscosity", "liquidThermalConductivity", "vapourThermalConductivity", "surfaceTension"];
const T_LABEL = { K: "K", "°C": "°C", "°F": "°F" };
const fromK = { K: T => T, "°C": T => T - 273.15, "°F": T => (T - 273.15) * 9 / 5 + 32 };

const blankPub = () => ({ citation: "", doi: "", open_copy: "", access: "", tables: "" });
const blankProperty = () => ({ comp: null, property: "liquidDensity", mode: "table", text: "", Tunit: "°C", unit: null, terms: null, source: "", pub: blankPub(),
  coef: { equation: "DIPPR100", A: "", B: "", C: "", D: "", E: "", Tc_K: "", Tmin: "", Tmax: "" }, fit: null, error: "" });
const blankComponent = () => ({ name: "", formula: "", MW: "", kind: "volatile", vpText: "", vpTunit: "°C", vpUnit: "kPa", cpText: "", cpTunit: "°C", cpUnit: "J/mol/K",
  Tc: "", Pc: "", omega: "", why: "", cas: "", source: "", pub: blankPub(), error: "", preview: null });

/** The source of an entry: the person's line, and the published source's fields when given (for a contribution). */
const sourceOf = d => ({ name: d.source.trim(), ...Object.fromEntries(Object.entries(d.pub ?? {}).map(([k, v]) => [k, String(v).trim()]).filter(([, v]) => v)) });

/** Optional fields of the published source, which a contribution draft needs (citation, open copy, access). */
function pubFields(env, d, prefix) {
  const field = (k, label, placeholder) => {
    const id = `fa-md-${prefix}${k}-${env.uid}`;
    return h("label", { class: "fa-field fa-field-wide", for: id }, h("span", {}, label),
      h("input", { type: "text", id, value: d.pub[k], placeholder, style: "width:100%", "data-fk": `mydata-${prefix}${k}`, on: { input: ev => { d.pub[k] = ev.target.value; } } }));
  };
  return h("details", { class: "fa-paste" }, h("summary", { "data-fk": `mydata-${prefix}pub` }, "Published source (optional; for a contribution to CHEPTA)"),
    h("p", { class: "fa-in-hint" }, "Only if the numbers come from a source anyone can read for free: then a contribution draft made from this entry has what the Data form needs."),
    field("citation", "Citation", "Authors, title, journal volume (year) pages"),
    field("doi", "DOI", "10.xxxx/xxxx"),
    field("open_copy", "Link to a free copy", "https://…"),
    field("access", "Why it is open", "Open access, CC BY 4.0"),
    field("tables", "Table or figure", "Table 2"));
}

/**
 * The panel. `get()` returns the workbench state as it is now; `set(patch)` changes it (throws with the reason).
 * @param {{get:()=>object, set:(patch:object)=>void, ui:object, uid:string, section:(title:string, ...children)=>Node, units:object}} env
 */
export function myDataPanel(env) {
  const { ui, uid } = env;
  const m = (ui.mydata ??= { prop: blankProperty(), comp: blankComponent(), pending: null, note: "", open: {} });
  const wrap = h("div", { class: "fa-dgrid fa-mydata" });
  const draw = () => wrap.replaceChildren(...sections(env, m, draw).filter(Boolean));
  draw();
  return wrap;
}

function sections(env, m, draw) {
  const { get, section } = env;
  const state = get();
  const note = m.note; m.note = "";
  return [
    note ? h("div", { class: "fa-restore", role: "status" }, note) : null,
    section("In this project", ...entryList(env, m, draw)),
    section("Add a property", ...propertyForm(env, m, draw)),
    section("Add a component of your own", ...componentForm(env, m, draw)),
    section("My data as a file", ...filesSection(env, m, draw)),
    section("What your data is",
      h("p", { class: "fa-in-hint" }, "Your numbers are used only in this project, labelled \"user\" wherever a result uses them. A record of yours replaces the databank's for that property; the databank's stays in CHEPTA, so you can compare by removing yours."),
      h("p", { class: "fa-in-hint" }, "They are not open data and are never added to CHEPTA's databank. To share them with everyone, make a contribution draft (in the list above) and submit it with the Data form, where it is checked like any other contribution."),
      state.userData ? null : h("p", { class: "fa-in-hint" }, "From code: CHEPTA.system({ …, userData }), CHEPTA.pure(id, { userData }); the format is in docs/models/thermodynamics.md.")),
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// the list of entries

function entryList(env, m, draw) {
  const state = env.get();
  const list = userDataList(state.userData);
  if (!list.length) return [h("p", { class: "fa-empty", "data-fk": "mydata-empty" }, "No data of your own yet. Add a property of a databank component, or a component of your own, below; or open a My data file.")];
  const names = new Map(listComponents({ userData: userOverlay(state) }).map(c => [c.id, c.name]));
  const label = e => {
    if (e.part === "properties") return `${names.get(e.component) ?? e.component}: ${PROPERTY_LABEL[e.key.split(".").slice(2).join(".")] ?? e.key.split(".").slice(2).join(".")}`;
    if (e.part === "components") return `${e.value.name} (your component${e.value.class === "nonvolatile" ? ", nonvolatile" : ""})`;
    return e.what;
  };
  const range = v => (v.Tmin_K != null ? `${fmtShort(v.Tmin_K, 5)}-${fmtShort(v.Tmax_K, 5)} K` : "");
  return [h("ul", { class: "fa-mydata-list" }, ...list.map(e => {
    const status = h("div", { class: "fug-foot", "aria-live": "polite" }), box = h("div");
    const draft = h("div", { class: "fa-mydata-draft" });
    const showDraft = () => {
      let r;
      try { r = userDataPackage(env.get().userData, e.key, { prepared_with: `CHEPTA ${pkg.version} (My data)` }); } catch (err) { draft.replaceChildren(h("div", { class: "fug-err" }, err.message)); return; }
      const text = JSON.stringify(r.package, null, 2) + "\n";
      draft.replaceChildren(
        r.problems.length
          ? h("div", { class: "fug-warn", role: "note" }, h("b", {}, "Not ready to submit yet:"), h("ul", {}, ...r.problems.map(p => h("li", {}, p))),
            h("p", { class: "fa-in-hint" }, "Give the source's citation, a link anyone can open (open_copy) and why it is open (access) in the entry's source, or edit the draft before you submit it."))
          : h("p", { class: "fa-in-hint" }, "The draft has what the Data form needs. Before you submit it, compare every number with the source."),
        h("div", { class: "fa-in-actions" },
          h("button", { type: "button", class: "fa-mini", "data-fk": `mydata-draft-save-${e.key}`, on: { click: () => saveText(text, `${e.key.replace(/[^\w.+-]+/g, "-")}.package.json`, "application/json", status, { copyLabel: "Copy", bom: false }) } }, icon("download", 15), "Save the draft"),
          h("button", { type: "button", class: "fa-mini", "data-fk": `mydata-draft-copy-${e.key}`, on: { click: () => copyText(text, status, box, { what: "contribution draft", done: "Draft copied." }) } }, icon("copy", 15), "Copy")),
        h("p", { class: "fa-in-hint" }, h("a", { href: "https://github.com/FaireDose/CHEPTA/issues/new?template=ai-contribution.yml", target: "_blank", rel: "noopener" }, "The Data form"), " (a free GitHub account is needed)."),
        status, box);
    };
    return h("li", { class: "fa-mydata-item", "data-key": e.key },
      h("div", { class: "fa-mydata-head" },
        h("b", {}, label(e)), h("span", { class: "fa-tier fa-tier-user", title: "Tier: user (your own data)" }, "user"),
        h("span", { class: "fa-mydata-actions" },
          h("button", { type: "button", class: "fa-mini", "data-fk": `mydata-draft-${e.key}`, title: "A contribution package for the Data form, from this entry",
            on: { click: () => { if (draft.childElementCount) draft.replaceChildren(); else showDraft(); } } }, icon("book", 14), "Contribution draft"),
          h("button", { type: "button", class: "fa-mini", "aria-label": `Remove ${label(e)}`, "data-fk": `mydata-rm-${e.key}`,
            on: { click: () => {
              try { env.set({ userData: removeUserDataEntry(env.get().userData, e.key) }); m.note = `Removed ${label(e)}.`; } catch (err) { m.note = `Not removed: ${err.message}`; }
              draw();
            } } }, icon("trash", 14), "Remove"))),
      h("div", { class: "fa-in-hint" }, [e.source && `Source: ${e.source}`, e.fit, e.part === "properties" ? range(e.value) : null].filter(Boolean).join(" · ")),
      draft);
  }))];
}

// ---------------------------------------------------------------------------------------------------------------
// add a property: a table of points (fitted) or coefficients

function propertyForm(env, m, draw) {
  const state = env.get(), ud = userOverlay(state), p = m.prop;
  const comps = listComponents({ userData: ud }).filter(c => c.id !== "water");
  const record = comps.find(c => c.id === p.comp);
  const isUser = p.comp?.startsWith(USER_PREFIX);
  const nonvolatile = p.comp ? pure(p.comp, { userData: ud }).nonvolatile : false;
  const props = PROPERTY_ORDER.filter(k => !(k === "vapourPressure" && nonvolatile));
  if (!props.includes(p.property)) p.property = props[0];
  const units = Object.keys(INPUT_UNITS[p.property]);
  if (!units.includes(p.unit)) p.unit = units[0];
  const reset = () => { p.fit = null; p.error = ""; };
  const picker = componentPicker({
    id: `fa-md-comp-${env.uid}`, label: "Component", components: comps, value: p.comp, placeholder: "Name, formula or CAS number",
    fk: "mydata-comp", onPick: id => { p.comp = id; reset(); draw(); },
  });
  const select = (fk, label, value, options, onChange) => {
    const id = `fa-md-${fk}-${env.uid}`;
    return h("label", { class: "fa-field", for: id }, h("span", {}, label),
      h("select", { id, "data-fk": `mydata-${fk}`, on: { change: ev => { onChange(ev.target.value); draw(); } } },
        ...options.map(([v, t]) => h("option", { value: v, selected: v === value }, t))));
  };
  const out = [
    picker,
    h("p", { class: "fa-in-hint" }, "Any component of the databank, or one of your own; not water, which is calculated from IAPWS-IF97, the international standard."),
    h("div", { class: "fa-in-row" },
      select("prop", "Property", p.property, props.map(k => [k, PROPERTY_LABEL[k]]), v => { p.property = v; reset(); }),
      select("mode", "Enter", p.mode, [["table", "a table of measured points"], ["coef", "the coefficients of an equation"]], v => { p.mode = v; reset(); })),
  ];
  if (p.mode === "table") {
    const ta = h("textarea", { class: "fa-csv-text", rows: 6, id: `fa-md-text-${env.uid}`, "data-fk": "mydata-table",
      placeholder: "T\tvalue\n20\t1.2091\n40\t1.1935\n60\t1.1772", on: { input: ev => { p.text = ev.target.value; p.fit = null; } } });
    ta.value = p.text;
    out.push(
      h("div", { class: "fa-in-row" },
        select("tunit", "Temperature in", p.Tunit, Object.keys(T_UNITS).map(u => [u, T_LABEL[u]]), v => { p.Tunit = v; p.fit = null; }),
        select("unit", `${PROPERTY_LABEL[p.property]} in`, p.unit, units.map(u => [u, u]), v => { p.unit = v; p.fit = null; })),
      h("label", { class: "fa-field fa-field-wide", for: ta.id }, h("span", {}, "Points: temperature and value on each line (paste two columns from a spreadsheet)"), ta));
  } else {
    const c = p.coef;
    const eqs = p.property === "vapourPressure" ? ["DIPPR101"] : CORRELATION_EQUATIONS.filter(e => /^DIPPR10[0-7]$/.test(e));
    if (!eqs.includes(c.equation)) c.equation = eqs[0];
    const num = (k, label) => {
      const id = `fa-md-c${k}-${env.uid}`;
      return h("label", { class: "fa-field", for: id }, h("span", {}, label),
        h("input", { type: "text", inputmode: "decimal", id, value: c[k], style: "width:8em", "data-fk": `mydata-c${k}`, on: { input: ev => { c[k] = ev.target.value; p.fit = null; } } }));
    };
    out.push(
      select("eq", "Equation", c.equation, eqs.map(e => [e, e]), v => { c.equation = v; p.fit = null; }),
      h("p", { class: "fa-in-hint" }, `The equations of src/thermo/correlations.js, with T in K and the value in ${RECORD_UNITS[p.property]}; missing coefficients are 0.`),
      h("div", { class: "fa-in-row fa-wrap" }, ...["A", "B", "C", "D", "E"].map(k => num(k, k)), c.equation === "DIPPR106" ? num("Tc_K", "Tc, K") : null),
      h("div", { class: "fa-in-row" }, num("Tmin", "From, K"), num("Tmax", "To, K")));
  }
  const src = h("input", { type: "text", id: `fa-md-src-${env.uid}`, value: p.source, style: "width:100%", "data-fk": "mydata-source",
    placeholder: "own measurement, lab book 12, 2026", on: { input: ev => { p.source = ev.target.value; } } });
  out.push(
    h("label", { class: "fa-field fa-field-wide", for: src.id }, h("span", {}, "Source (where these numbers come from)"), src),
    pubFields(env, p, "p"),
    h("div", { class: "fa-in-actions" },
      h("button", { type: "button", class: "fa-mini", "data-fk": "mydata-fit", disabled: !p.comp, on: { click: () => { preview(env, p, record); draw(); } } },
        icon("calc", 15), p.mode === "table" ? "Fit and show" : "Show")));
  if (p.error) out.push(h("div", { class: "fug-err", role: "alert", "data-fk": "mydata-error" }, p.error));
  if (p.fit) {
    const f = p.fit;
    out.push(h("div", { class: "fa-mydata-fit", "data-fk": "mydata-fit-result" },
      f.fit ? h("p", {}, `${f.fit.equation} with ${f.fit.terms} coefficient${f.fit.terms > 1 ? "s" : ""}: largest deviation from your points ${(100 * f.fit.maxDev).toPrecision(2)} %.`) : h("p", {}, `${f.record.equation}, ${fmtShort(f.record.Tmin_K, 5)}-${fmtShort(f.record.Tmax_K, 5)} K.`),
      f.fit ? termsChoice(env, p, draw) : null,
      plot(f, state.units?.T === "K" ? "K" : "°C"),
      f.databank ? h("p", { class: "fa-in-hint" }, `Dashed: the databank's record (${f.databank.tier ?? "databank"}), which yours replaces in this project.`) : h("p", { class: "fa-in-hint" }, "The databank has no record of this property for this component: yours fills the gap."),
      h("div", { class: "fa-in-actions" },
        h("button", { type: "button", class: "fa-mini", "data-fk": "mydata-save", disabled: !p.source.trim(), title: p.source.trim() ? "" : "Write where the numbers come from first",
          on: { click: () => {
            try {
              const rec = { ...f.record, source: { ...f.record.source, ...sourceOf(p) } };
              env.set({ userData: putUserData(env.get().userData, isUser ? componentPiece(env.get().userData, p.comp, p.property, rec) : { properties: { [p.comp]: { [p.property]: rec } } }) });
              m.note = `Saved: ${record?.name ?? p.comp}, ${PROPERTY_LABEL[p.property].toLowerCase()}. Every view that uses it is calculated again.`;
              m.prop = { ...blankProperty(), comp: p.comp, property: p.property, Tunit: p.Tunit };
            } catch (err) { p.error = `Not saved: ${err.message}`; }
            draw();
          } } }, icon("check", 15), "Save to my data"))));
  }
  return out;
}

/** The user's component with one property record added (a vapour pressure as its top-level record). */
function componentPiece(userData, id, property, rec) {
  const c = JSON.parse(JSON.stringify(userData.components[id]));
  if (property === "vapourPressure") { c.vapourPressure = rec; if (c.properties) delete c.properties.vapourPressure; }
  else c.properties = { ...(c.properties ?? {}), [property]: rec };
  return { components: { [id]: c } };
}

function termsChoice(env, p, draw) {
  const max = Math.min(p.fit.points.length, p.fit.fit.equation === "DIPPR100" ? 5 : 3);
  if (max < 2) return null;
  const id = `fa-md-terms-${env.uid}`;
  return h("label", { class: "fa-field", for: id }, h("span", {}, "Coefficients"),
    h("select", { id, "data-fk": "mydata-terms", on: { change: ev => { p.terms = +ev.target.value; preview(env, p); draw(); } } },
      ...Array.from({ length: max }, (_, k) => k + 1).map(n => h("option", { value: n, selected: n === p.fit.fit.terms }, `${n}${n === 1 ? " (a constant)" : ""}`))));
}

/** Fit the table (or take the coefficients) into p.fit = { record, fit?, points, databank } or set p.error. */
function preview(env, p, record) {
  const state = env.get(), ud = userOverlay(state);
  p.error = ""; p.fit = null;
  try {
    const comp = pure(p.comp, { userData: ud });
    let databank = null;
    try { databank = pure(p.comp).record(p.property); } catch { /* no record, or a component of the user's own */ }
    if (p.comp.startsWith(USER_PREFIX)) databank = null;
    if (p.mode === "table") {
      const { rows } = parseTable(p.text);
      if (rows.length < 2) throw new Error("Give at least two points (two lines of temperature and value).");
      if (rows.some(r => r.length < 2)) throw new Error("Each line needs a temperature and a value.");
      const points = rows.map(([t, v]) => [T_UNITS[p.Tunit](t), toRecordUnits(p.property, p.unit, v, comp.MW)]).sort((a, b) => a[0] - b[0]);
      if (new Set(points.map(q => q[0])).size < points.length) throw new Error("Two lines have the same temperature.");
      const fit = p.terms ? fitPoints(points, { equation: FIT_EQUATION[p.property], terms: Math.min(p.terms, points.length) }) : autoFit(p.property, points);
      p.fit = { fit, points, record: recordFromFit(p.property, fit, points, { name: p.source.trim() || "your data" }), databank };
    } else {
      const c = p.coef, n = v => (String(v).trim() === "" ? null : Number(String(v).replace(",", ".")));
      const coefficients = {};
      for (const k of ["A", "B", "C", "D", "E"]) { const v = n(c[k]); if (v != null) { if (!Number.isFinite(v)) throw new Error(`Coefficient ${k} is not a number.`); coefficients[k] = v; } }
      const Tmin_K = n(c.Tmin), Tmax_K = n(c.Tmax);
      if (!(Tmin_K > 0 && Tmax_K > Tmin_K)) throw new Error("Give the range of the equation in K: From below To, both positive.");
      const rec = { equation: c.equation, coefficients, units: RECORD_UNITS[p.property], Tmin_K, Tmax_K, source: { name: p.source.trim() || "your data" } };
      if (c.equation === "DIPPR106") rec.Tc_K = n(c.Tc_K);
      for (const T of [Tmin_K, (Tmin_K + Tmax_K) / 2, Tmax_K]) {
        const v = evaluate(rec, T);
        if (!(Number.isFinite(v) && v > 0)) throw new Error(`The equation gives ${v} at ${fmtShort(T, 5)} K; check the coefficients.`);
      }
      p.fit = { record: rec, points: [], databank };
    }
  } catch (e) { p.error = e.message; }
}

/** A small plot of the points, the record and the databank's record (log scale for vapour pressure and viscosity). */
function plot(f, Tunit) {
  const W = 340, H = 190, L = 54, R = 10, T = 10, B = 34;
  const rec = f.record, log = rec.equation === "DIPPR101";
  const lo = Math.min(rec.Tmin_K, f.databank?.Tmin_K ?? Infinity), hi = Math.max(rec.Tmax_K, f.databank?.Tmax_K ?? -Infinity);
  const t0 = f.databank ? Math.max(lo, Math.min(rec.Tmin_K, f.databank.Tmax_K) - 0.25 * (rec.Tmax_K - rec.Tmin_K)) : rec.Tmin_K;
  const t1 = f.databank ? Math.min(hi, Math.max(rec.Tmax_K, f.databank.Tmin_K) + 0.25 * (rec.Tmax_K - rec.Tmin_K)) : rec.Tmax_K;
  const curve = (r, a, b) => Array.from({ length: 41 }, (_, k) => a + (b - a) * k / 40).map(t => { try { return [t, evaluate(r, t)]; } catch { return null; } }).filter(q => q && q[1] > 0);
  const mine = curve(rec, rec.Tmin_K, rec.Tmax_K);
  const theirs = f.databank ? curve(f.databank, Math.max(t0, f.databank.Tmin_K), Math.min(t1, f.databank.Tmax_K)) : [];
  const all = [...mine, ...theirs, ...f.points];
  const ys = all.map(q => (log ? Math.log10(q[1]) : q[1]));
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y1 - y0 < 1e-12 * Math.max(1, Math.abs(y1))) { y0 -= 1; y1 += 1; }
  const pad = 0.06 * (y1 - y0); y0 -= pad; y1 += pad;
  const xa = Math.min(t0, rec.Tmin_K), xb = Math.max(t1, rec.Tmax_K);
  const X = t => L + (W - L - R) * (t - xa) / (xb - xa || 1), Y = v => T + (H - T - B) * (1 - ((log ? Math.log10(v) : v) - y0) / (y1 - y0));
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "fa-mydata-plot", role: "img", "aria-label": `Your ${log ? "points and fit (logarithmic scale)" : "points and fit"}` });
  svgEl("path", { d: `M${L} ${T}V${H - B}H${W - R}`, fill: "none", stroke: "var(--fug-muted)", "stroke-width": 1 }, svg);
  for (const v of ticks(fromK[Tunit](xa), fromK[Tunit](xb), 4).values) {
    const x = X(v + (Tunit === "K" ? 0 : 273.15));
    if (x < L - 0.5 || x > W - R + 0.5) continue;
    const t = svgEl("text", { x, y: H - B + 14, "font-size": 10, fill: "var(--fug-muted)", "text-anchor": "middle" }, svg); t.textContent = fmtShort(v, 4);
  }
  const yl = svgEl("text", { x: W / 2, y: H - 4, "font-size": 10, fill: "var(--fug-muted)", "text-anchor": "middle" }, svg); yl.textContent = `T, ${Tunit}`;
  for (const v of ticks(y0, y1, 4).values) {
    const t = svgEl("text", { x: L - 4, y: T + (H - T - B) * (1 - (v - y0) / (y1 - y0)) + 3, "font-size": 10, fill: "var(--fug-muted)", "text-anchor": "end" }, svg);
    t.textContent = log ? `1e${fmtShort(v, 3)}` : fmtShort(v, 4);
  }
  const line = (pts, attrs) => pts.length > 1 && svgEl("path", { d: pts.map((q, k) => `${k ? "L" : "M"}${X(q[0]).toFixed(1)} ${Y(q[1]).toFixed(1)}`).join(""), fill: "none", ...attrs }, svg);
  line(theirs, { stroke: "var(--fug-muted)", "stroke-width": 1.5, "stroke-dasharray": "4 3" });
  line(mine, { stroke: "var(--fug-accent, currentColor)", "stroke-width": 2 });
  for (const [t, v] of f.points) svgEl("circle", { cx: X(t).toFixed(1), cy: Y(v).toFixed(1), r: 3, fill: "var(--fug-bg, #fff)", stroke: "currentColor", "stroke-width": 1.5 }, svg);
  return h("figure", { class: "fa-mydata-fig" }, svg, h("figcaption", { class: "fa-in-hint" }, `${rec.units}${log ? ", logarithmic scale" : ""}. ${f.points.length ? "Circles: your points; line: the fit." : "Line: your equation."}`));
}

// ---------------------------------------------------------------------------------------------------------------
// add a component of the user's own

function componentForm(env, m, draw) {
  const c = m.comp, id = k => `fa-md-n${k}-${env.uid}`;
  const text = (k, label, { width = "100%", placeholder = "", mode } = {}) => h("label", { class: "fa-field", for: id(k) }, h("span", {}, label),
    h("input", { type: "text", id: id(k), value: c[k], style: `width:${width}`, placeholder, inputmode: mode, "data-fk": `mydata-n${k}`, on: { input: ev => { c[k] = ev.target.value; c.preview = null; } } }));
  const sel = (k, label, opts) => h("label", { class: "fa-field", for: id(k) }, h("span", {}, label),
    h("select", { id: id(k), "data-fk": `mydata-n${k}`, on: { change: ev => { c[k] = ev.target.value; c.preview = null; draw(); } } }, ...opts.map(([v, t]) => h("option", { value: v, selected: v === c[k] }, t))));
  const area = (k, label, placeholder) => {
    const ta = h("textarea", { class: "fa-csv-text", rows: 4, id: id(k), placeholder, "data-fk": `mydata-n${k}`, on: { input: ev => { c[k] = ev.target.value; c.preview = null; } } });
    ta.value = c[k];
    return h("label", { class: "fa-field fa-field-wide", for: ta.id }, h("span", {}, label), ta);
  };
  const out = [
    h("p", { class: "fa-in-hint" }, "A component the databank does not have: an intermediate of your process, an oligomer, a proprietary solvent. Its id starts with \"user:\". More records (density, viscosity, …) can be added with Add a property once it is saved."),
    h("div", { class: "fa-in-row fa-wrap" }, text("name", "Name", { width: "14em" }), text("formula", "Formula (optional)", { width: "8em" }), text("MW", "Molar mass, g/mol", { width: "7em", mode: "decimal" })),
    sel("kind", "It", [["volatile", "evaporates (give its vapour pressure)"], ["nonvolatile", "does not evaporate (nonvolatile: it stays in the liquid)"]]),
  ];
  if (c.kind === "volatile") {
    out.push(
      h("div", { class: "fa-in-row" }, sel("vpTunit", "Temperature in", Object.keys(T_UNITS).map(u => [u, u])), sel("vpUnit", "Vapour pressure in", Object.keys(INPUT_UNITS.vapourPressure).map(u => [u, u]))),
      area("vpText", "Vapour pressure: temperature and pressure on each line (fitted with DIPPR 101)", "50\t12.3\n80\t47.4\n110\t140.2"),
      h("details", { class: "fa-paste" }, h("summary", { "data-fk": "mydata-ncrit" }, "Critical constants (optional, for Peng–Robinson and SRK)"),
        h("div", { class: "fa-in-row fa-wrap" }, text("Tc", "Tc, K", { width: "7em", mode: "decimal" }), text("Pc", "Pc, bar", { width: "7em", mode: "decimal" }), text("omega", "Acentric factor", { width: "7em", mode: "decimal" }))));
  } else {
    out.push(text("why", "Why it does not evaporate (optional)", { placeholder: "decomposes before it boils" }));
  }
  out.push(
    h("div", { class: "fa-in-row" }, sel("cpTunit", "Temperature in", Object.keys(T_UNITS).map(u => [u, u])), sel("cpUnit", "Heat capacity in", Object.keys(INPUT_UNITS.liquidHeatCapacity).map(u => [u, u]))),
    area("cpText", "Liquid heat capacity (needed for energy balances): temperature and value on each line", "25\t210\n60\t228\n100\t247"),
    text("cas", "CAS number (optional)", { width: "10em", placeholder: "50-21-5" }),
    text("source", "Source (where these numbers come from)", { placeholder: "own measurement, lab book 12, 2026" }),
    pubFields(env, c, "n"),
    h("div", { class: "fa-in-actions" }, h("button", { type: "button", class: "fa-mini", "data-fk": "mydata-nsave", on: { click: () => { saveComponent(env, m); draw(); } } }, icon("plus", 15), "Add the component")));
  if (c.error) out.push(h("div", { class: "fug-err", role: "alert", "data-fk": "mydata-nerror" }, c.error));
  return out;
}

const slug = name => String(name).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "component";

function saveComponent(env, m) {
  const c = m.comp;
  c.error = "";
  try {
    const name = c.name.trim(), MW = Number(String(c.MW).replace(",", ".")), source = c.source.trim();
    if (!name) throw new Error("Give the component a name.");
    if (!(MW > 0)) throw new Error("Give the molar mass in g/mol.");
    if (!source) throw new Error("Write where the numbers come from (the source).");
    const fitTable = (text, property, Tunit, unit) => {
      const { rows } = parseTable(text);
      if (rows.length < 2) throw new Error(`${PROPERTY_LABEL[property]}: give at least two points.`);
      const pts = rows.map(([t, v]) => [T_UNITS[Tunit](t), toRecordUnits(property, unit, v, MW)]).sort((a, b) => a[0] - b[0]);
      return recordFromFit(property, autoFit(property, pts), pts, sourceOf(c));
    };
    const entry = { name, MW, source: sourceOf(c) };
    if (c.formula.trim()) entry.formula = c.formula.trim();
    if (c.cas.trim()) entry.cas = c.cas.trim();
    if (c.kind === "nonvolatile") { entry.class = "nonvolatile"; if (c.why.trim()) entry.why = c.why.trim(); }
    else {
      if (!c.vpText.trim()) throw new Error("A component that evaporates needs its vapour pressure (or choose \"does not evaporate\").");
      entry.vapourPressure = fitTable(c.vpText, "vapourPressure", c.vpTunit, c.vpUnit);
      const crit = [c.Tc, c.Pc, c.omega].map(v => String(v).trim());
      if (crit.some(Boolean)) {
        if (!crit.every(Boolean)) throw new Error("Give Tc, Pc and the acentric factor together, or none of them.");
        const [Tc, Pc, w] = crit.map(v => Number(v.replace(",", ".")));
        Object.assign(entry, { Tc_K: Tc, Pc_Pa: Pc * 1e5, omega: w });
      }
    }
    if (c.cpText.trim()) entry.properties = { liquidHeatCapacity: fitTable(c.cpText, "liquidHeatCapacity", c.cpTunit, c.cpUnit) };
    const ud = env.get().userData;
    let id = `${USER_PREFIX}${slug(name)}`;
    for (let k = 2; ud?.components?.[id]; k++) id = `${USER_PREFIX}${slug(name)}-${k}`;
    env.set({ userData: putUserData(ud, { components: { [id]: entry } }) });
    m.note = `Added ${name} (${id}). Choose it like any other component; add more of its properties with Add a property.`;
    m.comp = blankComponent();
  } catch (e) { c.error = `Not added: ${e.message}`; }
}

// ---------------------------------------------------------------------------------------------------------------
// files: save, copy, open (merge with the choice on conflicts), paste

function filesSection(env, m, draw) {
  const state = env.get();
  const status = h("div", { class: "fug-foot", "aria-live": "polite" }), box = h("div");
  const has = !!state.userData;
  const title = state.title ? `${state.title}, my data` : "My data";
  const text = () => userDataText(userDataDoc(env.get().userData ?? {}, { title, version: pkg.version }));
  const open = (input, from) => {
    try {
      const { user_data } = readUserDataFile(input);
      const r = mergeUserData(env.get().userData, user_data);
      if (r.conflicts.length) { m.pending = { incoming: user_data, conflicts: r.conflicts, choose: {}, from, added: r.added.length }; }
      else {
        env.set({ userData: r.userData });
        m.note = `Opened ${from}: ${r.added.length} entr${r.added.length === 1 ? "y" : "ies"} added${r.same.length ? `, ${r.same.length} already here with the same numbers` : ""}.`;
      }
    } catch (e) { m.note = `Not opened: ${e.message}`; }
    draw();
  };
  const fileId = `fa-md-file-${env.uid}`;
  const file = h("input", { type: "file", id: fileId, accept: ".json,application/json", class: "fa-visually-hidden", "data-fk": "mydata-file",
    on: { change: ev => { const f = ev.target.files?.[0]; if (f) f.text().then(t => open(t, f.name), e => { m.note = `Not opened: ${e.message}`; draw(); }); } } });
  const paste = h("textarea", { class: "fa-csv-text", rows: 4, "aria-label": "The text of a My data file", placeholder: '{ "chepta_user_data": 1, "user_data": { … } }', "data-fk": "mydata-paste" });
  const out = [
    h("p", {}, "The project keeps its own copy of your data, so it always opens with the numbers it was calculated with. Save it also as a file of its own to use it in other projects (a personal or company library)."),
    h("div", { class: "fa-in-actions" },
      h("button", { type: "button", class: "fa-mini", disabled: !has, "data-fk": "mydata-save-file", on: { click: () => saveText(text(), userDataFileName(title), "application/json", status, { copyLabel: "Copy", bom: false }) } }, icon("download", 15), "Save my data…"),
      h("button", { type: "button", class: "fa-mini", disabled: !has, "data-fk": "mydata-copy", on: { click: () => copyText(text(), status, box, { what: "My data file", done: "My data copied: paste it into a file or another workbench." }) } }, icon("copy", 15), "Copy"),
      h("label", { class: "fa-mini", for: fileId, role: "button", tabindex: "0", "data-fk": "mydata-open",
        on: { keydown: ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); file.click(); } } } }, icon("file", 15), "Open my data…"), file),
    status, box,
    h("details", { class: "fa-paste" },
      h("summary", { "data-fk": "mydata-paste-toggle" }, "Paste a My data file's text instead (from Copy)"),
      paste,
      h("div", { class: "fa-in-actions" }, h("button", { type: "button", class: "fa-mini", "data-fk": "mydata-paste-open", on: { click: () => { if (paste.value.trim()) open(paste.value, "the pasted data"); } } }, icon("check", 15), "Add the pasted data"))),
    h("p", { class: "fa-in-hint" }, "Opening adds the file's entries to this project. A project file (.chepta.json) with data of its own can be opened here too, to take its data."),
  ];
  if (m.pending) out.push(conflicts(env, m, draw));
  return out;
}

function conflicts(env, m, draw) {
  const pd = m.pending;
  const show = v => {
    const r = v.coefficients ? v : null;
    if (v.name) return `${v.name}, M = ${v.MW} g/mol${v.class === "nonvolatile" ? ", nonvolatile" : ""}; source: ${v.source?.name ?? v.source}`;
    let mid = "";
    if (r) {
      const T = (r.Tmin_K + r.Tmax_K) / 2;
      try { mid = `${fmtShort(evaluate(r, T), 5)} ${r.units} at ${fmtShort(T, 5)} K; `; } catch { /* shown without it */ }
    }
    return `${mid}${r ? `${r.equation}, ${fmtShort(r.Tmin_K, 5)}-${fmtShort(r.Tmax_K, 5)} K; ` : ""}source: ${v.source?.name ?? v.source ?? ""}${v.source?.fit ? `; ${v.source.fit}` : ""}`;
  };
  return h("div", { class: "fug-warn fa-mydata-conflicts", role: "group", "aria-label": "Entries with other numbers", "data-fk": "mydata-conflicts" },
    h("p", {}, h("b", {}, `${pd.from}: ${pd.conflicts.length} entr${pd.conflicts.length === 1 ? "y is" : "ies are"} already in this project with other numbers.`), ` Choose which to keep${pd.added ? `; ${pd.added} new entr${pd.added === 1 ? "y is" : "ies are"} added either way` : ""}.`),
    h("ul", {}, ...pd.conflicts.map((c, k) => {
      const name = `fa-md-cf${k}-${env.uid}`, keep = pd.choose[c.key] ?? "current";
      const radio = (v, label, detail) => h("label", { class: "fa-radio" },
        h("input", { type: "radio", name, value: v, checked: keep === v, "data-fk": `mydata-cf-${k}-${v}`, on: { change: () => { pd.choose[c.key] = v; } } }),
        h("span", {}, h("b", {}, label), ` ${detail}`));
      return h("li", {}, h("div", {}, h("b", {}, c.what.replace(/, (\w+)$/, (_, q) => `: ${PROPERTY_LABEL[q] ?? q}`))), radio("current", "Keep this project's:", show(c.current)), radio("incoming", "Take the file's:", show(c.incoming)));
    })),
    h("div", { class: "fa-in-actions" },
      h("button", { type: "button", class: "fa-mini", "data-fk": "mydata-cf-apply", on: { click: () => {
        try {
          const r = mergeUserData(env.get().userData, pd.incoming, pd.choose);
          env.set({ userData: r.userData });
          const taken = r.conflicts.filter(x => x.kept === "incoming").length;
          m.note = `Opened ${pd.from}: ${r.added.length} added, ${taken} replaced by the file's, ${r.conflicts.length - taken} kept as they were.`;
          m.pending = null;
        } catch (e) { m.note = `Not opened: ${e.message}`; }
        draw();
      } } }, icon("check", 15), "Add with these choices"),
      h("button", { type: "button", class: "fa-mini", "data-fk": "mydata-cf-cancel", on: { click: () => { m.pending = null; m.note = "Nothing was opened."; draw(); } } }, icon("close", 15), "Cancel")));
}
