/**
 * The shell's contract (proposal 0021, step 1): what the workbench says about the calculation in front of the person,
 * as functions of its state, DOM-free. The status bar of the classic layout (app.js) and the top bar of the
 * reorganized one (app-next.js) both read these, so the two layouts can never disagree, and neither reads the other's
 * page. Each function answers one question:
 *
 *  - methodOf(state):          the property method in use, and how it is chosen in this workspace;
 *  - dataOf(state, result):    what the result rests on: the tiers of the pair parameters, the rule of the sets;
 *  - unitsOf(state):           the display units and the composition basis;
 *  - missingOf(state):         what the calculation still needs (the problems of the inputs), or nothing;
 *  - sourcesOf(state):         the sources the calculation uses (the "Sources used here" list);
 *  - statusOf(status):         the state of the last calculation ("Ready, 9 ms", "Inputs needed", "Error");
 *  - shellContext(state, status): all of them at once, for a shell.
 *
 * Later steps of proposal 0021 build on these: the canvas tabs (step 2) take their Data tab from sourcesOf and their
 * count of warnings from the result; the numbered steps (step 3) take what is missing from missingOf.
 *
 * No thermodynamics here beyond asking the engine which parameter sets a mixture uses (system().info, the same call
 * as the Inputs panel's list of pairs), and no DOM. A view (layer 6), DOM-free part.
 */
import { system } from "../system.js";
import { library } from "../thermo/library.js";
import { listComponents } from "../thermo/system.js";
import { WORKSPACES, isEosModel } from "./workspaces.js";
import { tLabel } from "./properties-logic.js";
import {
  VIEWS, modelLabel, viewCheck, hxSetups, setsFor, ruleOf, RULES, tierCounts, tierSummary, sourceUsedFor, userOverlay,
} from "./app-logic.js";

/** The workspaces whose method is a document's own (state.flowsheet, state.column, state.reactor), with the button of
 *  app.js that opens its Method page in the Inputs panel. */
export const OWN_METHOD = { flowsheet: "fs-method", column: "col-method", reactor: "rx-method" };

/** The views with one method only, nothing to choose: their method's name. */
const FIXED_METHOD = { steam: "IAPWS-IF97", henry: "Henry's law", properties: "Pure-component data" };
/** The views that need an activity model for the liquid (the solubility of solids): only the liquid model is chosen. */
const LIQUID_ONLY = ["solid", "sle"];
/** The views whose phases both need an equation of state (the fluid charts). */
const EQUATION_ONLY = ["charts"];

/** The thermo of a document (flowsheet, column, reactor) as a phrase: "NRTL with a PR vapour", "PR + gE (MHV1)". */
const thermoLabel = t => modelLabel({ model: t.model, vapour: t.vapour ?? "ideal", mixing: t.mixing ?? null });

/** The document a workspace keeps its own method in (state.flowsheet, state.column or state.reactor), or null. */
export const ownDocument = state => (state.workspace in OWN_METHOD ? state[state.workspace] ?? null : null);

/**
 * The property method of the current calculation, and how the shell lets the person change it.
 * @returns {{label:string, choice:"workbench"|"liquid"|"equation"|"own"|"streams"|"fixed", model:string|null,
 *   vapour:string|null, mixing:string|null, page?:string, note:string}}
 *   choice: "workbench" the full method choice (model-picker.js modelPicker, with the MHV1 rule); "liquid" an activity
 *   model only (liquidPicker); "equation" an equation of state only (the Charts' list, equationChoices(true));
 *   "own" the workspace's own Method page (`page`: the data-fk of its button); "streams" each stream of a process
 *   exchanger has its own, in the Inputs panel; "fixed" one method, nothing to choose.
 */
export function methodOf(state) {
  const v = state.view, ws = state.workspace;
  const own = ownDocument(state);
  if (own) {
    const t = own.thermo;
    return { label: thermoLabel(t), choice: "own", model: t.model, vapour: t.vapour ?? "ideal", mixing: t.mixing ?? null, page: OWN_METHOD[ws],
      note: `The ${WORKSPACES.find(w => w.id === ws).label.toLowerCase()} keeps its own method, for every block and stream; it is chosen on its Method page.` };
  }
  if (FIXED_METHOD[v]) {
    return { label: FIXED_METHOD[v], choice: "fixed", model: null, vapour: null, mixing: null,
      note: v === "steam" ? "Water and steam: the IAPWS-IF97 standard, nothing to choose." : `${VIEWS[v].label}: one method, nothing to choose.` };
  }
  if (v === "hx" && state.hx?.mode === "two") {
    const s = hxSetups(state), one = x => modelLabel({ model: x.model, vapour: x.vapour, mixing: x.mixing });
    return { label: `Hot: ${one(s.hot)}; cold: ${one(s.cold)}`, choice: "streams", model: null, vapour: null, mixing: null,
      note: "A process exchanger: each stream has its own method, chosen with the stream in the Inputs panel." };
  }
  const base = { model: state.model, vapour: state.vapour ?? "ideal", mixing: state.mixing ?? null };
  if (LIQUID_ONLY.includes(v)) {
    return { ...base, label: isEosModel(state.model) ? "Choose an activity model" : modelLabel(state), choice: "liquid",
      note: "The solubility of a solid needs an activity model for the liquid." };
  }
  if (EQUATION_ONLY.includes(v)) {
    return { ...base, label: isEosModel(state.model) ? modelLabel(state) : "Choose an equation of state", choice: "equation",
      note: "The fluid charts use an equation of state for the gas and the liquid." };
  }
  return { ...base, label: modelLabel(state), choice: "workbench",
    note: "The method of every diagram and unit model of Properties and Unit models. The flowsheet, the column and the reactor keep their own." };
}

/** The rule of the pair parameter sets, as the status bar shows it ("Sets: Databank only (ChemSep), 1 by hand"), or
 *  null when every pair takes its default set. */
export function setsRuleOf(state) {
  const rule = ruleOf(state.prefer), hand = Object.keys(state.sets ?? {}).length;
  if (rule === "best" && !hand) return null;
  return `Sets: ${rule === "best" ? "defaults" : RULES.find(r => r.id === rule)?.label ?? state.prefer.join(", ")}${hand ? `, ${hand} by hand` : ""}`;
}

/** The components and the method whose pairs the calculation uses, or null where it has no pairs. */
function pairBasis(state) {
  const own = ownDocument(state);
  if (own) return own.components?.length > 1 ? { ids: own.components, model: own.thermo.model, mixing: own.thermo.mixing ?? null } : null;
  const v = state.view;
  if (FIXED_METHOD[v] || (v === "hx" && state.hx?.mode === "two")) return null;
  const check = viewCheck(state, v);
  if (!check.ok || check.use.length < 2) return null;
  return { ids: check.use, model: state.model, mixing: state.mixing ?? null };
}

/**
 * What the result rests on: the tiers of the pair parameters of the calculation (the same counts as the Inputs panel's
 * list of pairs and the readouts), the rule of the sets, and the result's own data line.
 * @param {object} state
 * @param {{data?:string}|null} [result]  what the view returned when it last drew (renderView's info), if any
 * @returns {{pairs:string|null, tiers:{tier:string,count:number}[], sets:string|null, result:string|null, text:string}}
 *   text: one line for a button or a status bar ("3 pairs: 3 fitted; Sets: defaults, 1 by hand"); pairs: the tiers
 *   alone; result: the view's own line (a duty, a pressure drop, "IAPWS-IF97 (Standard)").
 */
export function dataOf(state, result = null) {
  const sets = setsRuleOf(state);
  let pairs = null, tiers = [];
  const basis = pairBasis(state);
  if (basis) {
    const eos = isEosModel(basis.model);
    if (basis.model === "ideal") pairs = "Ideal solution, no pair parameters";
    else {
      try {
        // a missing pair is estimated (decision 2026-11-13-05) and counted as "predicted"; where the system refuses it (a
        // light gas), as "no data"
        const make = extra => system({ components: basis.ids, model: basis.model, ...extra,
          ...setsFor({ ...state, mixing: eos ? basis.mixing : null }, basis.model) });
        let sys;
        try { sys = make({}); } catch (e) { if (e?.code !== "MISSING_DATA") throw e; sys = make({ allowMissingPairs: true }); }
        tiers = tierCounts(sys.info.pairs, eos ? [] : sys.info.missingPairs ?? []);
        pairs = eos ? tierSummary(tiers, "k_ij pair") : tierSummary(tiers);
      } catch { pairs = null; }
    }
  }
  const own = result?.data ?? null;
  const text = [pairs ?? own, sets].filter(Boolean).join("; ");
  return { pairs, tiers, sets, result: own, text };
}

/** The display units and the composition basis: { T: "°C", P: "kPa", basis: "mol frac", text: "°C, kPa, mol frac" }. */
export function unitsOf(state) {
  const u = state.units, T = tLabel(u), basis = state.basis === "mass" ? "wt %" : "mol frac";
  return { T, P: u.P, basis, text: `${T}, ${u.P}, ${basis}` };
}

/**
 * True while no component is chosen for a view that takes them (the workbench opened empty): the Inputs panel then
 * shows what to choose, and nothing is reported as a problem yet.
 */
export function isBlank(state, view = state.view) {
  if (view === "hx" && state.hx?.mode === "two") { const s = hxSetups(state); return !s.hot.ids.length && !s.cold.ids.length; }
  const value = state.inputs[view];
  return Array.isArray(value) && view !== "steam" && !value.some(Boolean);
}

/**
 * What the calculation still needs: { complete, blank, problems: [{message}] }. complete: it can be calculated; blank:
 * nothing chosen yet (a start, not an error). The same check as the canvas's "needs" warning (viewCheck); for the
 * flowsheet, the column and the reactor, whether their document has components.
 */
export function missingOf(state) {
  // the flowsheet, the column and the reactor: their own document, which starts with its components (step 1 of its
  // set-up); the rest of a document is checked by its own solver, and named on its drawing
  const own = ownDocument(state);
  if (own) {
    const none = !own.components?.length;
    return { complete: !none, blank: none, problems: none ? [{ message: "Choose the components (set-up step 1)." }] : [] };
  }
  const check = viewCheck(state, state.view);
  return { complete: check.ok, blank: !check.ok && isBlank(state), problems: check.problems.map(p => ({ message: p.message })) };
}

/** The components of the calculation (ids), for its sources: the document's for the flowsheet, the column and the
 *  reactor, the inputs in use otherwise; none while the inputs are incomplete. */
export function componentsOf(state) {
  const own = ownDocument(state);
  if (own) return own.components ?? [];
  const check = viewCheck(state, state.view);
  return check.ok ? check.use : [];
}

/**
 * The sources the calculation uses: those of the library whose users include its components or one of its pairs (the
 * "Sources used here" filter of the Sources panel).
 * @returns {{ids:string[], sources:object[]}}
 */
export function sourcesOf(state) {
  const ids = componentsOf(state);
  const byId = new Map(listComponents({ userData: userOverlay(state) }).map(c => [c.id, c.name]));
  const names = ids.map(id => byId.get(id) ?? id);
  return { ids, sources: ids.length ? library.sources().filter(s => sourceUsedFor(s, ids, names)) : [] };
}

/** The state of the last calculation, as one word or two: "Ready, 9 ms", "Calculating", "Error", "Inputs needed".
 *  status: the workbench's { busy, ms, error, waiting }. */
export function statusOf(status = {}) {
  const st = status ?? {};
  const kind = st.waiting ? "waiting" : st.busy ? "busy" : st.error ? "error" : "ready";
  const text = kind === "waiting" ? "Inputs needed" : kind === "busy" ? "Calculating" : kind === "error" ? "Error"
    : st.ms != null ? `Ready, ${st.ms < 1000 ? `${Math.max(1, Math.round(st.ms))} ms` : `${(st.ms / 1000).toFixed(1)} s`}` : "Ready";
  return { kind, text, error: st.error ?? null };
}

/**
 * Everything a shell shows about the current calculation, at once. `sources` is left out (it reads the whole source
 * list): call sourcesOf when the person asks for them.
 */
export function shellContext(state, status = null) {
  return {
    workspace: state.workspace, view: state.view,
    method: methodOf(state),
    data: dataOf(state, status?.info ?? null),
    units: unitsOf(state),
    missing: missingOf(state),
    status: statusOf(status ?? {}),
  };
}
