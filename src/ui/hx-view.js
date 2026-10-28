/**
 * Heat exchanger workspace (proposal 0013, step 2): the Inputs panel. The settings live in `state.hx` (hx-logic.js;
 * null until one is changed, then HX_DEFAULTS merged with the changes); the canvas and the results are drawn by
 * app-views.js (hxView). A view (layer 6): no calculation here.
 */
import { problemsWarning } from "./warning.js";
import { h } from "./dom.js";
import { HX_DEFAULTS, HX_STREAM_MAX, UTILITY_KINDS, TWO_SPECS, streamZ } from "./hx-logic.js";
import { modelPicker } from "./model-picker.js";
import { HEAT_TRANSFER, ARRANGEMENTS } from "../units/heat-exchange.js";
import { tLabel, tToDisplay, pToDisplay, fmtShort } from "./properties-logic.js";
import { parseT, parseP } from "./app-logic.js";

const ARR_LABEL = { counterflow: "Counterflow", cocurrent: "Cocurrent (parallel flow)", "shell-and-tube": "Shell and tube (2 tube passes per shell)", "crossflow-unmixed": "Crossflow, neither stream mixed" };
const num = t => { const v = Number(String(t).trim().replace(",", ".")); return Number.isFinite(v) ? v : null; };
const rangeText = r => (r.bound ? r.bound : `${r.U[0]}-${r.U[1]}`);


/**
 * The sections of the Inputs panel. env: { state, set, uid, inputsSection, field, seg, listInput, problemsBox, check, nameOf,
 * streamList, setups } (setups: each stream's components and method in two-stream mode, app-logic.js hxSetups).
 * The task (design or rating) and the mode (utility or process exchanger) are in the ribbon.
 */
export function hxInputs({ state, set, uid, inputsSection, field, seg, listInput, problemsBox, check, nameOf, streamList, setups }) {
  const hx = state.hx ?? HX_DEFAULTS, u = state.units, two = hx.mode === "two", rating = hx.task === "rating";
  const put = patch => set({ hx: patch });
  const tU = tLabel(u);
  const tField = (label, value, onT, id, title) => field(`${label}, ${tU}`, value == null ? "" : String(+tToDisplay(value, u).toFixed(3)),
    t => { const v = parseT(t, u); if (v == null) return false; onT(v); }, { id, title });
  const pField = (label, value, onP, id, title) => field(`${label}, ${u.P}`, value == null ? "" : fmtShort(pToDisplay(value, u), 6),
    t => { const v = parseP(t, u); if (v == null) return false; onP(v); }, { id, title });
  const nField = (label, value, onV, id, { min = -Infinity, max = Infinity, empty = false, title, width } = {}) => field(label, value == null ? "" : String(value),
    t => { if (empty && String(t).trim() === "") { onV(null); return; } const v = num(t); if (v == null || v < min || v > max) return false; onV(v); }, { id, title, width });
  const select = (label, options, current, onPick, fk) => {
    const id = `fa-${fk}-${uid}`;
    return h("label", { class: "fa-field fa-field-stack", for: id }, h("span", {}, label),
      h("select", { id, "data-fk": fk, on: { change: ev => onPick(ev.target.value) } },
        ...options.map(([v, text]) => h("option", { value: v, selected: v === current }, text))));
  };
  const secs = [];

  // a utility exchanger: the process stream's components and the ribbon's model; a process exchanger: each stream its own
  if (!two) {
    secs.push(inputsSection("Components",
      h("p", { class: "fa-in-hint" }, "The components of the process stream."),
      listInput("hx"), problemsBox(check)));
  }

  /** A stream's components and method (process exchanger), flow, state, composition and pressure drop. */
  const streamSec = (title, key) => {
    const s = hx[key], own = two ? setups[key] : null;
    const ids = two ? own.ids : check.ok ? check.use : [];
    const z = streamZ(s.z, ids.length);
    const mine = two ? check.problems.filter(p => p.stream === key) : [];
    return inputsSection(title,
      ...(two ? [
        h("p", { class: "fa-in-hint" }, `Up to ${HX_STREAM_MAX} components and the stream's own method: the two streams never mix.`),
        streamList({ key, ids: own.ids, model: own.model, onChange: next => put({ [key]: { components: next, z: null } }) }),
        modelPicker({ model: own.model, vapour: own.vapour, id: `fa-hx-${key}-m-${uid}`, fk: `hx-${key}-m`, onChange: m => put({ [key]: { model: m.model, vapour: m.vapour } }) }),
        mine.length ? h("div", { class: "fa-problems", "aria-live": "polite" }, problemsWarning(mine.map(p => p.message), { what: "problems with this stream" })) : null,
      ] : []),
      nField("Flow, kmol/h", s.flow, v => put({ [key]: { flow: v } }), `hx-${key}-flow`, { min: 1e-12 }),
      tField("Inlet temperature", s.T_K, v => put({ [key]: { T_K: v } }), `hx-${key}-t`),
      pField("Inlet pressure", s.P_kPa, v => put({ [key]: { P_kPa: v } }), `hx-${key}-p`),
      ids.length > 1 ? h("div", { class: "fa-feed" }, ...ids.map((id, k) => nField(nameOf(id), +z[k].toPrecision(6), v => {
        const next = z.slice(); next[k] = v; if (!(next.reduce((a, b) => a + b, 0) > 0)) return false;
        put({ [key]: { z: next } });
      }, `hx-${key}-z${k}`, { min: 0, width: "6em" }))) : null,
      ids.length > 1 ? h("p", { class: "fa-in-hint" }, "Mole fractions, normalized to 1.") : null,
      pField("Pressure drop", s.dP_kPa ?? 0, v => put({ [key]: { dP_kPa: v } }), `hx-${key}-dp`, "Spread evenly along the exchanger"));
  };

  // rating: the exchanger's area replaces the outlet (utility mode) or the specification (two-stream mode)
  const areaSec = () => inputsSection("Exchanger",
    nField("Heat-transfer area, m²", hx.rating.area_m2, v => put({ rating: { area_m2: v } }), "hx-area", { min: 1e-9 }),
    h("p", { class: "fa-in-hint" }, "The duty and both outlets follow from the area, U and the arrangement below."));
  if (hx.mode === "utility") {
    const p = hx.process;
    secs.push(streamSec("Process stream", "process"));
    if (rating) secs.push(areaSec());
    else secs.push(inputsSection("Process outlet",
      seg("Outlet", [["T", "Temperature"], ["VF", "Vapour fraction"]], p.out, o => put({ process: { out: o } })),
      p.out === "T" ? tField("Outlet temperature", p.T_out_K, v => put({ process: { T_out_K: v } }), "hx-tout")
        : nField("Outlet vapour fraction", p.VF_out, v => put({ process: { VF_out: v } }), "hx-vfout", { min: 0, max: 1 }),
      h("p", { class: "fa-in-hint" }, "Heating or cooling follows from the outlet; the utility must fit (steam only heats).")));
    const ut = hx.utility;
    const fields = [];
    if (ut.kind === "steam") fields.push(pField("Steam pressure", ut.P_kPa, v => put({ utility: { P_kPa: v } }), "hx-steam-p", "Saturated steam, condensing at the saturation temperature (IAPWS-IF97)"));
    if (ut.kind === "water" || ut.kind === "fluid") {
      fields.push(tField("Inlet", ut.T_in_K, v => put({ utility: { T_in_K: v } }), "hx-ut-in"),
        rating ? nField("Flow, kg/h", ut.flow_kg_h, v => put({ utility: { flow_kg_h: v } }), "hx-ut-flow", { min: 1e-9, title: "In rating the outlet follows from the heat" })
          : tField("Outlet", ut.T_out_K, v => put({ utility: { T_out_K: v } }), "hx-ut-out"));
    }
    if (ut.kind === "water") fields.push(pField("Water pressure", ut.water_P_kPa, v => put({ utility: { water_P_kPa: v } }), "hx-ut-p"));
    if (ut.kind === "fluid") fields.push(nField("Heat capacity, J/(kg K)", ut.cp_J_kgK, v => put({ utility: { cp_J_kgK: v } }), "hx-ut-cp", { min: 1e-9 }));
    if (ut.kind === "fluid-T") fields.push(tField("Temperature", ut.T_K, v => put({ utility: { T_K: v } }), "hx-ut-t"));
    secs.push(inputsSection("Utility",
      select("Utility", UTILITY_KINDS, ut.kind, k => put({ utility: { kind: k } }), "hx-ut-kind"), ...fields,
      h("p", { class: "fa-in-hint" }, ut.kind === "electric" ? `Electric heating: the power is the duty; there is no heat-transfer area${rating ? " to rate" : ""}.`
        : `Temperatures and prices of utilities are yours: no open table was found.${rating ? " The utility heats when it enters hotter than the process stream, else it cools." : ""}`)));
  } else {
    secs.push(streamSec("Hot stream", "hot"), streamSec("Cold stream", "cold"));
    if (rating) secs.push(areaSec());
    const sp = hx.spec, isT = sp.kind === "T_hot_out_K" || sp.kind === "T_cold_out_K";
    if (!rating) secs.push(inputsSection("Specification",
      seg("Specification", TWO_SPECS, sp.kind, k => put({ spec: { kind: k, value: k === "duty_kW" ? 100 : k === "dTmin_K" ? 10 : k === "T_cold_out_K" ? hx.cold.T_K + 20 : hx.hot.T_K - 20 } })),
      isT ? tField(sp.kind === "T_hot_out_K" ? "Hot outlet" : "Cold outlet", sp.value, v => put({ spec: { value: v } }), "hx-spec-t")
        : nField(sp.kind === "duty_kW" ? "Duty, kW" : "Minimum ΔT, K", sp.value, v => put({ spec: { value: v } }), "hx-spec-v", { min: 1e-9 }),
      h("p", { class: "fa-in-hint" }, "The other outlet follows from the energy balance.")));
  }

  // one side at a constant temperature (condensing steam, a fluid of one temperature): R = 0, so F = 1 whatever the arrangement
  const isothermal = !two && (hx.utility.kind === "steam" || hx.utility.kind === "fluid-T");
  if (!(hx.mode === "utility" && hx.utility.kind === "electric")) {
    const U = hx.U, srv = HEAT_TRANSFER.services.rows, row = srv.find(r => r.id === U.service);
    const filmRows = [["", "Your own"], ...HEAT_TRANSFER.film.rows.map(r => [r.id, `${r.label} (${r.h})`])];
    const foulRows = [["", "None"], ...HEAT_TRANSFER.fouling.rows.map(r => [r.id, `${r.label} (${r.bound ?? (r.Rf[0] === r.Rf[1] ? r.Rf[0] : `${r.Rf[0]}-${r.Rf[1]}`)})`])];
    const filmSide = which => {
      const f = U.film[which];
      return h("div", { class: "fa-hx-film" }, h("div", { class: "fa-frac-name" }, which === "hot" ? "Hot side" : "Cold side"),
        select("Film coefficient h, W/(m² K)", filmRows, f.h != null ? "" : f.hId, v => put({ U: { film: { [which]: v ? { hId: v, h: null } : { h: f.h ?? 1000 } } } }), `hx-h-${which}`),
        f.h != null ? nField("Your h, W/(m² K)", f.h, v => put({ U: { film: { [which]: { h: v } } } }), `hx-hval-${which}`, { min: 1e-9 }) : null,
        select("Fouling, m² K/W (high end)", foulRows, f.Rf != null ? "" : f.RfId ?? "", v => put({ U: { film: { [which]: { RfId: v || null, Rf: null } } } }), `hx-rf-${which}`));
    };
    const metals = [["", "Your own conductivity"], ...HEAT_TRANSFER.metals.rows.map(m => [m.id, m.label])];
    const w = U.film.wall;
    secs.push(inputsSection("Heat transfer coefficient U",
      seg("U from", [["service", "Service"], ["film", "Films and wall"], ["value", "Your own"]], U.source, s => put({ U: { source: s } })),
      ...(U.source === "service" ? [
        select("Service (Lienhard and Lienhard, Table 2.2)", srv.map(r => [r.id, `${r.label}: ${rangeText(r)}`]), U.service, v => put({ U: { service: v } }), "hx-service"),
        seg("Value in the range", [["low", "Low"], ["mid", "Middle"], ["high", "High"]], U.pick, pk => put({ U: { pick: pk } })),
        h("p", { class: "fa-in-hint" }, `${row.label}: ${rangeText(row)} W/(m² K). The low end gives the larger, safer area.`),
      ] : U.source === "film" ? [
        filmSide("hot"), filmSide("cold"),
        select("Wall material (Table A.1)", metals, w.k_W_mK != null ? "" : w.material, v => put({ U: { film: { wall: v ? { material: v, k_W_mK: null } : { k_W_mK: w.k_W_mK ?? 16 } } } }), "hx-metal"),
        w.k_W_mK != null ? nField("Your conductivity, W/(m K)", w.k_W_mK, v => put({ U: { film: { wall: { k_W_mK: v } } } }), "hx-kval", { min: 1e-9 }) : null,
        nField("Wall thickness, mm", w.t_mm, v => put({ U: { film: { wall: { t_mm: v } } } }), "hx-twall", { min: 0 }),
        h("p", { class: "fa-in-hint" }, "1/U = 1/h hot + fouling + wall + fouling + 1/h cold (a plane wall). The metal's conductivity is taken at the mean temperature of the two sides."),
        h("p", { class: "fa-in-hint" }, "Not a more rigorous design: the h of Table 1.1 are single examples of their order of magnitude (water at 10 m/s, an aniline-alcohol mixture at 3 m/s), not values for your stream, so U from them can lie far from the service ranges of Table 2.2. Choose the rows closest to your fluids and compare with a service."),
      ] : [nField("U, W/(m² K)", U.value, v => put({ U: { value: v } }), "hx-uval", { min: 1e-9 })])));
    secs.push(inputsSection("Arrangement",
      select("Flow arrangement", ARRANGEMENTS.map(a => [a, ARR_LABEL[a]]), hx.arrangement, a => put({ arrangement: a }), "hx-arr"),
      hx.arrangement === "shell-and-tube" ? nField("Shells in series", hx.shells, v => { if (!Number.isInteger(v)) return false; put({ shells: v }); }, "hx-shells", { min: 1, max: 10 }) : null,
      isothermal && (hx.arrangement === "shell-and-tube" || hx.arrangement === "crossflow-unmixed")
        ? h("p", { class: "fa-in-hint" }, `The ${hx.utility.kind === "steam" ? "condensing steam stays at one temperature" : "utility stays at one temperature"}, so the LMTD correction F is 1 for every arrangement ("If one flow remains at constant temperature … F must go to one", Lienhard and Lienhard, section 3.2, p. 116): the area is that of counterflow. F matters when both temperatures change (water, a fluid with inlet and outlet, or a process exchanger).`) : null,
      nField("Zones along the exchanger", hx.zones, v => { if (!Number.isInteger(v)) return false; put({ zones: v }); }, "hx-zones", { min: 2, max: 200, title: "Equal heat steps; each side's temperature from its own curve" })));
  }

  const wl = hx.wall;
  secs.push(inputsSection("Wall thickness for the pressure",
    pField("Design pressure (inside minus outside)", wl.P_kPa, v => put({ wall: { P_kPa: v } }), "hx-wp"),
    nField("Inside diameter, mm", wl.D_in_mm, v => put({ wall: { D_in_mm: v } }), "hx-wd", { min: 1e-9 }),
    nField("Allowable stress, MPa", wl.S_MPa, v => put({ wall: { S_MPa: v } }), "hx-ws", { min: 1e-9, empty: true, title: "Yours: the material's allowable stress at the design temperature" }),
    nField("Joint efficiency", wl.E, v => put({ wall: { E: v } }), "hx-we", { min: 1e-9, max: 1, title: "1 for a seamless tube" }),
    nField("Corrosion allowance, mm", wl.c_mm, v => put({ wall: { c_mm: v } }), "hx-wc", { min: 0 }),
    h("p", { class: "fa-in-hint" }, "Lamé's thick cylinder (1852). The allowable stress is yours: the values designers use (ASME Section II, Part D) are paywalled, and no open table of them was found. No material is recommended from the pressure.")));
  return secs;
}
