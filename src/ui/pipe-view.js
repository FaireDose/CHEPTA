/**
 * Pipe workspace (proposal 0020): the Inputs panel. The settings live in `state.pipe` (pipe-logic.js; null until one is
 * changed, then PIPE_DEFAULTS merged with the changes); the canvas and the results are drawn by app-views.js
 * (pipeView). A view (layer 6): no calculation here.
 */
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { PIPE_DEFAULTS, PIPE_HEAT, FITTING_CHOICES, ROUGHNESS_NOTE, pipeZ, pressureSplit, regimeText } from "./pipe-logic.js";
import { FITTINGS_SOURCE } from "../units/pipe.js";
import { tLabel, tToDisplay, pToDisplay, fmtShort } from "./properties-logic.js";
import { parseT, parseP } from "./app-logic.js";

const num = t => { const v = Number(String(t).trim().replace(",", ".")); return Number.isFinite(v) ? v : null; };

/**
 * The sections of the Inputs panel. env: { state, set, uid, inputsSection, field, seg, listInput, problemsBox, check, nameOf }.
 */
export function pipeInputs({ state, set, uid, inputsSection, field, seg, listInput, problemsBox, check, nameOf }) {
  const p = state.pipe ?? PIPE_DEFAULTS, u = state.units;
  const put = patch => set({ pipe: patch });
  const tU = tLabel(u);
  const tField = (label, value, onT, id, title) => field(`${label}, ${tU}`, String(+tToDisplay(value, u).toFixed(3)),
    t => { const v = parseT(t, u); if (v == null) return false; onT(v); }, { id, title });
  const pField = (label, value, onP, id, title) => field(`${label}, ${u.P}`, fmtShort(pToDisplay(value, u), 6),
    t => { const v = parseP(t, u); if (v == null) return false; onP(v); }, { id, title });
  const nField = (label, value, onV, id, { min = -Infinity, max = Infinity, empty = false, above = false, title, width } = {}) => field(label, value == null ? "" : String(value),
    t => { if (empty && String(t).trim() === "") { onV(null); return; } const v = num(t); if (v == null || v < min || v > max || (above && !(v > min))) return false; onV(v); }, { id, title, width });
  const secs = [];

  secs.push(inputsSection("Components",
    h("p", { class: "fa-in-hint" }, "The components of the fluid in the pipe; the method is in the ribbon."),
    listInput("pipe"), problemsBox(check)));

  const ids = check.ok ? check.use : [];
  const z = pipeZ(p.feed.z, ids.length);
  secs.push(inputsSection("Inlet",
    h("div", { class: "fa-row-fields" },
      nField(`Flow, ${p.feed.basis}`, p.feed.flow, v => put({ feed: { flow: v } }), "pipe-flow", { min: 0, above: true }),
      seg("Flow basis", [["kmol/h", "kmol/h"], ["kg/h", "kg/h"]], p.feed.basis, b => put({ feed: { basis: b } }))),
    tField("Temperature", p.feed.T_K, v => put({ feed: { T_K: v } }), "pipe-t"),
    pField("Pressure", p.feed.P_kPa, v => put({ feed: { P_kPa: v } }), "pipe-p"),
    ids.length > 1 ? h("div", { class: "fa-feed" }, ...ids.map((id, k) => nField(nameOf(id), +z[k].toPrecision(6), v => {
      const next = z.slice(); next[k] = v; if (!(next.reduce((a, b) => a + b, 0) > 0)) return false;
      put({ feed: { z: next } });
    }, `pipe-z${k}`, { min: 0, width: "6em" }))) : null,
    ids.length > 1 ? h("p", { class: "fa-in-hint" }, "Mole fractions, normalized to 1.") : null,
    h("p", { class: "fa-in-hint" }, "One fluid phase, or gas and liquid (Lockhart-Martinelli: horizontal pipes, about a factor of 3 in the friction; no fittings in gas-liquid flow). Two liquid phases and choked flow are refused.")));

  secs.push(inputsSection("Pipe",
    nField("Length, m", p.length_m, v => put({ length_m: v }), "pipe-l", { min: 0, above: true }),
    nField("Inner diameter, mm", +(p.diameter_m * 1000).toPrecision(8), v => put({ diameter_m: v / 1000 }), "pipe-d", { min: 0, above: true }),
    nField("Wall roughness, mm", +(p.roughness_m * 1000).toPrecision(8), v => put({ roughness_m: v / 1000 }), "pipe-eps", { min: 0 }),
    h("p", { class: "fa-in-hint" }, ROUGHNESS_NOTE),
    nField("Elevation change, m", p.elevation_m, v => put({ elevation_m: v }), "pipe-dz", { title: "Outlet height minus inlet height: positive uphill, negative downhill" }),
    h("p", { class: "fa-in-hint" }, "Outlet height minus inlet height (negative downhill); at most the length.")));

  // fittings: one row each, a type of Table 1 (DOE handbook) or the person's own K or Leq/D, and how many
  const fits = p.fittings;
  const kindOf = f => (f.fitting ?? (f.K != null ? "K" : "L_D"));
  const setRow = (i, row) => put({ fittings: fits.map((f, j) => (j === i ? row : f)) });
  const rows = fits.map((f, i) => {
    const kind = kindOf(f), id = `fa-pipe-fit-${i}-${uid}`;
    return h("div", { class: "fa-pipe-fit" },
      h("label", { class: "fa-field fa-field-stack", for: id }, h("span", {}, `Fitting ${i + 1}`),
        h("select", { id, "data-fk": `pipe-fit-${i}`, on: { change: ev => {
          const k = ev.target.value, count = f.count ?? 1;
          setRow(i, k === "K" ? { K: 0.5, count } : k === "L_D" ? { L_D: 30, count } : { fitting: k, count });
        } } }, ...FITTING_CHOICES.map(([v, text]) => h("option", { value: v, selected: v === kind }, text)))),
      h("div", { class: "fa-row-fields" },
        kind === "K" ? nField("K", f.K, v => setRow(i, { ...f, K: v }), `pipe-fit-k-${i}`, { min: 0, width: "5em" })
          : kind === "L_D" ? nField("Leq/D", f.L_D, v => setRow(i, { ...f, L_D: v }), `pipe-fit-ld-${i}`, { min: 0, width: "5em" }) : null,
        nField("Count", f.count ?? 1, v => { if (!Number.isInteger(v)) return false; setRow(i, { ...f, count: v }); }, `pipe-fit-n-${i}`, { min: 1, width: "4em" }),
        h("button", { type: "button", class: "fa-mini", "aria-label": `Remove fitting ${i + 1}`, "data-fk": `pipe-fit-rm-${i}`,
          on: { click: () => put({ fittings: fits.filter((_, j) => j !== i) }) } }, icon("close", 14), "Remove")));
  });
  secs.push(inputsSection("Fittings",
    ...rows,
    h("div", { class: "fa-in-actions" }, h("button", { type: "button", class: "fa-mini", "data-fk": "pipe-fit-add",
      on: { click: () => put({ fittings: [...fits, { fitting: "elbow-90", count: 1 }] }) } }, "Add a fitting")),
    h("p", { class: "fa-in-hint" }, `Each fitting adds K + f Leq/D velocity heads. Leq/D: ${FITTINGS_SOURCE}. These values are for turbulent flow.`)));

  secs.push(inputsSection("Heat",
    seg("Heat", PIPE_HEAT, p.heat, m => put({ heat: m })),
    p.heat === "U" ? nField("U, W/(m² K)", p.U_W_m2K, v => put({ U_W_m2K: v }), "pipe-u", { min: 0, title: "Referred to the inner surface of the pipe" }) : null,
    p.heat === "U" ? tField("Surroundings", p.T_ambient_K, v => put({ T_ambient_K: v }), "pipe-ta") : null,
    h("p", { class: "fa-in-hint" }, p.heat === "adiabatic" ? "No heat to or from the surroundings: the enthalpy stays constant, so a gas cools as its pressure falls."
      : p.heat === "isothermal" ? "The fluid stays at its inlet temperature; the heat this takes is shown with the results."
        : "Q = U A ΔT (log mean) over each segment, A the inner surface. U is yours: no open table of U for pipes was found.")));

  secs.push(inputsSection("Options",
    nField("Segments", p.segments, v => { if (!Number.isInteger(v)) return false; put({ segments: v }); }, "pipe-n", { min: 1, max: 1000, title: "The pipe is solved in this many equal segments" }),
    nField("Your friction factor (Darcy)", p.friction_factor, v => put({ friction_factor: v }), "pipe-f", { min: 0, above: true, empty: true, title: "Leave empty: from the Reynolds number and the roughness" }),
    nField("Your viscosity, mPa s", p.viscosity_Pa_s == null ? null : +(p.viscosity_Pa_s * 1000).toPrecision(8), v => put({ viscosity_Pa_s: v == null ? null : v / 1000 }), "pipe-mu",
      { min: 0, above: true, empty: true, title: "Leave empty: from the components' records" }),
    h("p", { class: "fa-in-hint" }, "Leave the friction factor and the viscosity empty to take them from the Reynolds number, the roughness and the components' records.")));
  return secs;
}

/**
 * The Pipe as a block of the flowsheet drawing (proposal 0020): the sections of its Inputs panel. The settings are the
 * block's spec (the keys of src/units/pipe.js, SI units: m, K), the same ones the Pipe workspace sends; the values a new
 * block starts with are the workspace's (flowsheet-logic.js defaultSpec). env: the helpers of flowsheet-view.js.
 */
export function pipeBlockSections({ b, spec, setS, inputsSection, uid, u, T, plain, numberField, segRow, selectField }) {
  const heat = spec.heat ?? "adiabatic";
  const mm = (key, label, { empty = false } = {}) => numberField(label, spec[key] == null ? "" : String(+(spec[key] * 1000).toPrecision(8)),
    t => { const v = num(t); if (v == null) { if (empty) { setS({ [key]: null }); return; } return false; } if (v < 0 || (key !== "roughness_m" && v === 0)) return false; setS({ [key]: v / 1000 }); },
    { id: `${b.id}-${key}`, uid, unit: "mm" });
  const secs = [];
  secs.push(inputsSection("Pipe",
    plain("length_m", "Length", "m", "required"),
    mm("diameter_m", "Inner diameter"),
    mm("roughness_m", "Wall roughness"),
    h("p", { class: "fa-in-hint" }, ROUGHNESS_NOTE),
    plain("elevation_m", "Elevation change", "m", "0"),
    h("p", { class: "fa-in-hint" }, "Outlet height minus inlet height (negative downhill); at most the length. The inlet is the stream that enters the block: one fluid phase, or gas and liquid (Lockhart-Martinelli: horizontal pipes, about a factor of 3 in the friction; no fittings in gas-liquid flow). Two liquid phases and choked flow are refused with the reason.")));
  const fits = spec.fittings ?? [];
  const kindOf = f => (f.fitting ?? (f.K != null ? "K" : "L_D"));
  const setRow = (i, row) => setS({ fittings: fits.map((f, j) => (j === i ? row : f)) });
  const rows = fits.map((f, i) => {
    const kind = kindOf(f);
    return h("div", { class: "fa-pipe-fit" },
      selectField(`Fitting ${i + 1}`, FITTING_CHOICES, kind, k => { const count = f.count ?? 1; setRow(i, k === "K" ? { K: 0.5, count } : k === "L_D" ? { L_D: 30, count } : { fitting: k, count }); }, `${b.id}-fit-${i}`, uid),
      h("div", { class: "fa-row-fields" },
        kind === "K" ? numberField("K", String(f.K), t => { const v = num(t); if (v == null || v < 0) return false; setRow(i, { ...f, K: v }); }, { id: `${b.id}-fit-k-${i}`, uid })
          : kind === "L_D" ? numberField("Leq/D", String(f.L_D), t => { const v = num(t); if (v == null || v < 0) return false; setRow(i, { ...f, L_D: v }); }, { id: `${b.id}-fit-ld-${i}`, uid }) : null,
        numberField("Count", String(f.count ?? 1), t => { const v = num(t); if (!Number.isInteger(v) || v < 1) return false; setRow(i, { ...f, count: v }); }, { id: `${b.id}-fit-n-${i}`, uid }),
        h("button", { type: "button", class: "fa-mini", "aria-label": `Remove fitting ${i + 1}`, "data-fk": `fs-pipe-fit-rm-${b.id}-${i}`,
          on: { click: () => setS({ fittings: fits.filter((_, j) => j !== i) }) } }, icon("close", 14), "Remove")));
  });
  secs.push(inputsSection("Fittings", ...rows,
    h("div", { class: "fa-in-actions" }, h("button", { type: "button", class: "fa-mini", "data-fk": `fs-pipe-fit-add-${b.id}`,
      on: { click: () => setS({ fittings: [...fits, { fitting: "elbow-90", count: 1 }] }) } }, "Add a fitting")),
    h("p", { class: "fa-in-hint" }, `Each fitting adds K + f Leq/D velocity heads. Leq/D: ${FITTINGS_SOURCE}. These values are for turbulent flow.`)));
  secs.push(inputsSection("Heat",
    segRow("Heat", PIPE_HEAT, heat, m => setS(m === "U" ? { heat: "U", U_W_m2K: spec.U_W_m2K ?? PIPE_DEFAULTS.U_W_m2K, T_ambient_K: spec.T_ambient_K ?? PIPE_DEFAULTS.T_ambient_K }
      : { heat: m, U_W_m2K: null, T_ambient_K: null }), `fs-pipe-heat-${b.id}`),
    heat === "U" ? plain("U_W_m2K", "U", "W/(m² K)") : null,
    heat === "U" ? T("T_ambient_K", "Surroundings") : null,
    h("p", { class: "fa-in-hint" }, heat === "adiabatic" ? "No heat to or from the surroundings: the enthalpy stays constant, so a gas cools as its pressure falls."
      : heat === "isothermal" ? "The fluid stays at its inlet temperature; the heat this takes is the block's duty."
        : "Q = U A ΔT (log mean) over each segment, A the inner surface. U is yours: no open table of U for pipes was found.")));
  secs.push(inputsSection("Options",
    plain("segments", "Segments", "", "20"),
    plain("friction_factor", "Your friction factor (Darcy)", "", "from Re and roughness"),
    numberField("Your viscosity", spec.viscosity_Pa_s == null ? "" : String(+(spec.viscosity_Pa_s * 1000).toPrecision(8)),
      t => { const v = num(t); if (v == null) { setS({ viscosity_Pa_s: null }); return; } if (!(v > 0)) return false; setS({ viscosity_Pa_s: v / 1000 }); }, { id: `${b.id}-viscosity_Pa_s`, uid, unit: "mPa s", placeholder: "from the records" })));
  return secs;
}

/** The results of a Pipe block for the flowsheet's Results panel: rows [label, text] from the engine's `state`. */
export function pipeBlockRows(s, { u, fmtP, fmtTemp }) {
  if (s?.dP_kPa == null) return [];
  const split = pressureSplit(s);
  return [
    ["Outlet temperature", fmtTemp(s.T_out_K, u, 2)],
    ["Outlet pressure", fmtP(s.P_out_kPa, u)],
    ["Pressure drop", `${fmtShort(pToDisplay(s.dP_kPa, u), 5)} ${u.P}`],
    ...split.slice(0, 4).map(([k, v]) => [`  ${k}`, `${fmtShort(pToDisplay(v, u), 4)} ${u.P}`]),
    ["Velocity, inlet to outlet", `${fmtShort(s.velocity_in_m_s, 4)} to ${fmtShort(s.velocity_out_m_s, 4)} m/s`],
    ["Reynolds number, inlet", fmtShort(s.Re_in, 4)],
    ["Flow regime", regimeText(s.regime)],
    ["Friction factor (Darcy), inlet", fmtShort(s.friction_factor_in, 4)],
  ];
}
