/**
 * My data in a window of its own (proposal 0012, step 4; only My data for now, the maintainer, 2026-10-16). The main
 * window keeps all the data: the new window only shows the panel and edits through the main window's state, so every
 * change appears in both at once, and closing it loses nothing.
 *
 * The main window opens an empty window (window.open with no address) and builds the panel into it with its own code
 * and styles, so no second file has to load: it works offline and from a file on disk. Where no window can open
 * (pages inside AI chats usually block new windows, and phones have none) the panel stays docked, and a note says why.
 *
 * A view helper (layer 6).
 */
import { injectAppStyles } from "./app-styles.js";

/** Can My data open in a window of its own here? Not on a narrow screen (a phone), and only where window.open exists. */
export function canOpenWindow({ size, win }) {
  return size !== "narrow" && !!win && typeof win.open === "function";
}

/** Why a window did not open, for the note in the docked panel. */
export const BLOCKED_NOTE = "This page could not open a new window (pages inside AI chats, and browsers that block pop-ups, do not allow it), so My data stays here. Allow pop-ups for this page to open it in its own window.";

/**
 * Open My data in a window of its own.
 * @param {object} o
 * @param {Window} o.win            the main window
 * @param {string} o.name           the window's name (one per workbench)
 * @param {(root: Element, focus: (fk: string) => void) => void} o.render  draws the panel into root
 * @param {() => void} o.onClose    called when the person closes the window
 * @param {string} [o.title]
 * @returns {{ok: true, window: Window, redraw: () => void, focus: () => void, close: () => void} | {ok: false, reason: string}}
 */
export function openDataWindow({ win, name, render, onClose, title = "My data – CHEPTA" }) {
  let w = null;
  try { w = win.open("", name, "popup,width=600,height=820"); } catch { w = null; }
  if (!w || w.closed || !w.document) return { ok: false, reason: BLOCKED_NOTE };
  const d = w.document;
  d.title = title;
  d.documentElement.lang = win.document?.documentElement?.lang || "en";
  // the theme follows the main page (data-theme="light|dark" on <html>, else the system's)
  const theme = win.document?.documentElement?.getAttribute("data-theme");
  if (theme) d.documentElement.setAttribute("data-theme", theme);
  if (!d.querySelector('meta[name="viewport"]')) {
    const m = d.createElement("meta");
    m.name = "viewport"; m.content = "width=device-width, initial-scale=1";
    d.head.appendChild(m);
  }
  injectAppStyles(d);
  d.body.style.margin = "0";
  d.body.replaceChildren();
  const box = d.createElement("div");
  box.className = "fug fug-app fa-window";
  box.dataset.size = "mid";
  const root = d.createElement("div");
  root.className = "fa-window-body";
  box.appendChild(root);
  d.body.appendChild(box);
  let closing = false;
  const focus = fk => {
    const el = root.querySelector(`[data-fk="${String(fk).replace(/["\\]/g, "\\$&")}"]`);
    if (el) el.focus();
  };
  const redraw = () => { if (!w.closed) render(root, focus); };
  redraw();
  // closed by the person (or the main page left): the main window docks the panel again
  w.addEventListener("pagehide", () => { if (!closing) onClose(); });
  win.addEventListener?.("pagehide", () => { try { w.close(); } catch { /* already gone */ } });
  return {
    ok: true, window: w, redraw,
    focus: () => { try { w.focus(); } catch { /* the browser may refuse */ } },
    close: () => { closing = true; try { w.close(); } catch { /* already gone */ } },
  };
}
