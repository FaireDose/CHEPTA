/**
 * The property method as drop-down lists, the same in the workbench and on the flowsheet's Method page:
 *   1. the kind: an activity model (liquid) with a vapour model, or an equation of state (both phases);
 *   2. the model of that kind (the models on the roadmap are listed too, disabled, "not available yet");
 *   3. for an activity model only, the vapour model: an ideal gas unless chosen otherwise.
 * Switching the kind goes back to the model last used of that kind (NRTL and Peng–Robinson the first time).
 */
import { h } from "./dom.js";
import { FUTURE_MODELS } from "./future-models.js";

export const ACTIVITY_CHOICES = [["NRTL", "NRTL"], ["UNIQUAC", "UNIQUAC"], ["MOD-UNIFAC-2", "Mod. UNIFAC 2.0 (predicted)"], ["ideal", "Ideal solution"]];
export const EOS_CHOICES = [["PR", "Peng–Robinson"], ["SRK", "SRK"]];
export const VAPOUR_CHOICES = [["ideal", "Ideal gas"], ["PR", "Peng–Robinson"], ["SRK", "SRK"]];
const isEos = m => EOS_CHOICES.some(([v]) => v === m);
const last = { activity: "NRTL", eos: "PR" };

/** A labelled drop-down list; `later`: disabled entries with what each is for. */
function dropdown({ id, label, value, choices, later = [], onPick, fk }) {
  const sel = h("select", { id, "data-fk": fk, on: { change: ev => onPick(ev.target.value) } },
    ...choices.map(([v, text]) => h("option", { value: v, selected: v === value }, text)),
    ...(later.length ? [h("optgroup", { label: "Not available yet" },
      ...later.map(m => h("option", { value: `later-${m.id}`, disabled: true, title: m.note }, m.label)))] : []));
  return h("label", { class: "fa-model-field", for: id }, h("span", {}, label), sel);
}

/**
 * @param {{model:string, vapour?:string, onChange:(p:{model:string, vapour:string})=>void, id:string, fk?:string}} o
 *        id: a unique prefix for the element ids; fk: prefix of the data-fk attributes (tests, focus keeping)
 * @returns {HTMLElement}
 */
export function modelPicker({ model, vapour = "ideal", onChange, id, fk = "model" }) {
  const eos = isEos(model);
  last[eos ? "eos" : "activity"] = model;
  const kind = dropdown({ id: `${id}-kind`, label: "Method", fk: `${fk}-kind`, value: eos ? "eos" : "activity",
    choices: [["activity", "Activity model"], ["eos", "Equation of state"]],
    onPick: k => onChange({ model: k === "eos" ? last.eos : last.activity, vapour }) });
  const which = dropdown({ id: `${id}-model`, label: eos ? "Equation" : "Liquid", fk: `${fk}-model`, value: model,
    choices: eos ? EOS_CHOICES : ACTIVITY_CHOICES, later: eos ? FUTURE_MODELS.eos : FUTURE_MODELS.activity,
    onPick: m => onChange({ model: m, vapour }) });
  const vap = eos ? null : dropdown({ id: `${id}-vapour`, label: "Vapour", fk: `${fk}-vapour`, value: vapour,
    choices: VAPOUR_CHOICES, onPick: v => onChange({ model, vapour: v }) });
  return h("div", { class: "fa-model-picker" }, kind, which, vap);
}

/** The liquid model alone, for views that need an activity model (solubility of solids): one drop-down list. */
export function liquidPicker({ model, onChange, id, fk = "liquid" }) {
  return h("div", { class: "fa-model-picker" }, dropdown({ id, label: "Liquid", fk, value: isEos(model) ? "" : model,
    choices: [...(isEos(model) ? [["", "Choose an activity model"]] : []), ...ACTIVITY_CHOICES], later: FUTURE_MODELS.activity,
    onPick: m => m && onChange(m) }));
}
