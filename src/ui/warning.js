/**
 * Errors and problems of the workbench as small warnings (the maintainer, 2026-10-21: "make every error just a small
 * warning and the user needs to press on it to see more details"): one line with a warning sign and the message's
 * first sentence; pressed (or Enter / Space), it opens the whole message and any details. A native <details> element,
 * so it works with the keyboard and screen readers without script. A message of one short sentence is shown whole.
 * A view helper (layer 6).
 */
import { h } from "./dom.js";
import { icon } from "./icons.js";

const MAX = 64;

/** The first sentence of a message (a full stop, colon or semicolon followed by a space), at most 64 characters (one line in the Inputs panel, two at most). */
export function summaryOf(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  const m = t.match(/^(.+?)[.:;](\s|$)/);
  let s = m ? m[1] : t;
  if (s.length > MAX) s = `${s.slice(0, MAX - 1).replace(/\s+\S*$/, "")}…`;
  return s;
}

/**
 * A small warning. message: the text; title: the line shown closed (default: the message's first sentence);
 * details: more nodes for the open state (a list, a button); attrs: attributes for the element (id, data-fk, role).
 * @returns {HTMLElement}
 */
export function warning(message, { title, details = [], attrs = {}, open = false } = {}) {
  const text = String(message ?? "").trim();
  const head = title ?? summaryOf(text);
  const extra = details.filter(Boolean);
  const whole = !extra.length && (text === head || text === `${head}.` || !text);
  const sign = h("span", { class: "fa-warn-sign", "aria-hidden": "true" }, icon("warn", 14));
  if (whole) return h("div", { class: "fa-warn is-whole", role: "status", ...attrs }, sign, h("span", { class: "fa-warn-head" }, head));
  return h("details", { class: "fa-warn", ...attrs, ...(open ? { open: true } : {}) },
    h("summary", {}, sign, h("span", { class: "fa-warn-head" }, head), h("span", { class: "fa-warn-more" }, "Details")),
    h("div", { class: "fa-warn-body" }, text && text !== head ? h("p", {}, text) : null, ...extra));
}

/** Several problems as one warning: "2 problems: …" closed, the list open; one problem: that problem's warning. */
export function problemsWarning(messages, { what = "problems", attrs = {}, details = [] } = {}) {
  const list = messages.filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return warning(list[0], { attrs, details });
  return warning("", { title: `${list.length} ${what}: ${summaryOf(list[0])}`, attrs, details: [h("ul", {}, ...list.map(m => h("li", {}, m))), ...details] });
}

/** The styles of the warnings (app-styles.js and mount.js include them). */
export const WARNING_CSS = `
.fa-warn{display:block; background:var(--fug-warn-bg); color:var(--fug-warn-fg); border-radius:6px; font-size:12px; line-height:1.4; margin:4px 0; max-width:100%}
.fa-warn>summary,.fa-warn.is-whole{display:flex; align-items:flex-start; gap:6px; padding:4px 8px; cursor:pointer; list-style:none}
.fa-warn.is-whole{cursor:default}
.fa-warn>summary::-webkit-details-marker{display:none}
.fa-warn-sign{flex:none; display:inline-flex; margin-top:1px}
.fa-warn-head{flex:1; min-width:0}
.fa-warn-more{flex:none; text-decoration:underline; opacity:.8}
.fa-warn[open] .fa-warn-more{display:none}
.fa-warn>summary:focus-visible{outline:2px solid currentColor; outline-offset:-2px; border-radius:6px}
.fa-warn-body{padding:0 8px 7px 28px}
.fa-warn-body p{margin:0 0 4px}
.fa-warn-body ul{margin:0 0 4px; padding-left:16px}
`;
