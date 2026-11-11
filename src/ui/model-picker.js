/**
 * The property method as drop-down lists, the same in the workbench and on the flowsheet's Method page:
 *   1. the kind: an activity model (liquid) with a vapour model, or an equation of state (both phases);
 *   2. the model of that kind (the models on the roadmap are listed too, disabled, "not available yet");
 *   3. for an activity model only, the vapour model: an ideal gas unless chosen otherwise.
 * Switching the kind goes back to the model last used of that kind (NRTL and Peng–Robinson the first time).
 * Where the view supports it (`mixing` given), the equations are also offered with the gE mixing rule MHV1: "PR + gE (MHV1)"
 * and "SRK + gE (MHV1)" (proposal 0018). A choice is { model, vapour, mixing }: mixing is "MHV1" or null.
 */
import { h } from "./dom.js";
import { FUTURE_MODELS } from "./future-models.js";

export const ACTIVITY_CHOICES = [["NRTL", "NRTL"], ["UNIQUAC", "UNIQUAC"], ["WILSON", "Wilson (one liquid)"], ["MOD-UNIFAC-2", "Mod. UNIFAC 2.0 (predicted)"], ["ideal", "Ideal solution"]];
export const EOS_CHOICES = [["PR", "Peng–Robinson"], ["SRK", "SRK"]];
export const VAPOUR_CHOICES = [["ideal", "Ideal gas"], ["PR", "Peng–Robinson"], ["SRK", "SRK"]];
/** The equations with the MHV1 mixing rule, named as in the engine's info.method: "PR + gE (MHV1)", "SRK + gE (MHV1)". Never "PSRK". */
export const MHV1_CHOICES = [["PR|MHV1", "PR + gE (MHV1)"], ["SRK|MHV1", "SRK + gE (MHV1)"]];
const isEos = m => EOS_CHOICES.some(([v]) => v === m);
const last = { activity: "NRTL", eos: "PR", mixing: null };

/** The equations a view offers: with `withMixing`, the MHV1 ones too. */
export const equationChoices = withMixing => (withMixing ? [...EOS_CHOICES, ...MHV1_CHOICES] : EOS_CHOICES);
/** The value of the equation list for a model and a mixing rule: "PR", "SRK", "PR|MHV1" or "SRK|MHV1". */
export const equationValue = (model, mixing) => (mixing ? `${model}|${mixing}` : model);
/** The inverse: { model, mixing } of a value of the equation list. */
export function parseEquation(value) {
  const [model, mixing = null] = String(value).split("|");
  return { model, mixing };
}
/** The method a picker reports for a pick of the kind: the model last used of that kind, with its mixing rule. */
export const kindChoice = (kind, vapour) => (kind === "eos" ? { model: last.eos, vapour, mixing: last.mixing } : { model: last.activity, vapour, mixing: null });

/** The workbench patch (app-logic.js applyPatch) for a pick: the model only when it changed, the vapour and the mixing rule always. */
export const workbenchPatch = (p, state) => ({ ...(p.model === state.model ? {} : { model: p.model }), vapour: p.vapour, mixing: p.mixing ?? null });
/** The patch of a flowsheet's thermo for a pick; no mixing rule is left out of the document. */
export const thermoPatch = (p, thermo) => ({ ...(p.model === thermo.model ? {} : { model: p.model }), vapour: p.vapour, mixing: p.mixing ?? undefined });

/** The patch of a heat exchanger stream's own method (hx.hot or hx.cold) for a pick: model, vapour and mixing rule. */
export const hxMethodPatch = p => ({ model: p.model, vapour: p.vapour, mixing: isEos(p.model) ? p.mixing ?? null : null });
/** The Charts workspace's equation list (an equation of state only), with the MHV1 rule: the workbench patch for a value. */
export const chartEquationPatch = (value, state) => { const { model, mixing } = parseEquation(value); return workbenchPatch({ model, vapour: state.vapour ?? "ideal", mixing }, state); };

/** The column's own method for a pick of its list ("", "NRTL", ..., "PR", "PR|MHV1"): { model, vapour?, mixing? } or null. */
export function columnMethod(v, was) {
  if (!v) return null;
  const { model, mixing } = parseEquation(v);
  return { model, ...(["PR", "SRK"].includes(model) ? (mixing ? { mixing } : {}) : { vapour: was?.vapour ?? "ideal" }) };
}
/** A labelled drop-down list; `later`: disabled entries with what each is for. */
function dropdown({ id, label, value, choices, later = [], onPick, fk }) {
  const sel = h("select", { id, "data-fk": fk, on: { change: ev => onPick(ev.target.value) } },
    ...choices.map(([v, text]) => h("option", { value: v, selected: v === value }, text)),
    ...(later.length ? [h("optgroup", { label: "Not available yet" },
      ...later.map(m => h("option", { value: `later-${m.id}`, disabled: true, title: m.note }, m.label)))] : []));
  return h("label", { class: "fa-model-field", for: id }, h("span", {}, label), sel);
}

/**
 * @param {{model:string, vapour?:string, mixing?:string|null, onChange:(p:{model:string, vapour:string, mixing:string|null})=>void, id:string, fk?:string}} o
 *        id: a unique prefix for the element ids; fk: prefix of the data-fk attributes (tests, focus keeping);
 *        mixing: given (null or "MHV1") by the views that support the MHV1 rule, which then lists it with the equations
 * @returns {HTMLElement}
 */
export function modelPicker({ model, vapour = "ideal", mixing, onChange, id, fk = "model" }) {
  const eos = isEos(model);
  const withMixing = mixing !== undefined;
  const mix = eos && withMixing ? mixing ?? null : null;
  last[eos ? "eos" : "activity"] = model;
  if (eos && withMixing) last.mixing = mix;
  const kind = dropdown({ id: `${id}-kind`, label: "Method", fk: `${fk}-kind`, value: eos ? "eos" : "activity",
    choices: [["activity", "Activity model"], ["eos", "Equation of state"]],
    onPick: k => onChange(kindChoice(k, vapour)) });
  const which = dropdown({ id: `${id}-model`, label: eos ? "Equation" : "Liquid", fk: `${fk}-model`, value: eos ? equationValue(model, mix) : model,
    choices: eos ? equationChoices(withMixing) : ACTIVITY_CHOICES, later: eos ? FUTURE_MODELS.eos : FUTURE_MODELS.activity,
    onPick: m => { const p = parseEquation(m); onChange({ model: p.model, vapour, mixing: eos ? p.mixing : null }); } });
  const vap = eos ? null : dropdown({ id: `${id}-vapour`, label: "Vapour", fk: `${fk}-vapour`, value: vapour,
    choices: VAPOUR_CHOICES, onPick: v => onChange({ model, vapour: v, mixing: null }) });
  return h("div", { class: "fa-model-picker" }, kind, which, vap);
}

/** The liquid model alone, for views that need an activity model (solubility of solids): one drop-down list. */
export function liquidPicker({ model, onChange, id, fk = "liquid" }) {
  return h("div", { class: "fa-model-picker" }, dropdown({ id, label: "Liquid", fk, value: isEos(model) ? "" : model,
    choices: [...(isEos(model) ? [["", "Choose an activity model"]] : []), ...ACTIVITY_CHOICES], later: FUTURE_MODELS.activity,
    onPick: m => m && onChange(m) }));
}
