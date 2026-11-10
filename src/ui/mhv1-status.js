/**
 * What the MHV1 mixing rule does for a set of components (proposal 0018; "PR + gE (MHV1)", "SRK + gE (MHV1)"): the
 * system is built by the engine itself and its answer is reported, never decided here. Where the engine refuses (a
 * light gas with a polar liquid and no NRTL set fitted inside the rule or in the databank) the message is the engine's;
 * otherwise each pair's source is listed, and the engine's warnings (a pair with g^E = 0).
 */
import { system } from "../system.js";

/**
 * @param {string[]} ids    component ids
 * @param {"PR"|"SRK"} model
 * @param {object} [userData]
 * @returns {{ok:boolean, method:string, message:string|null, pairs:{pair:string, source:string}[], warnings:string[]}}
 */
export function mhv1Status(ids, model, userData = null) {
  const method = `${model} + gE (MHV1)`;
  if (!Array.isArray(ids) || ids.length < 2) return { ok: true, method, message: null, pairs: [], warnings: [] };
  try {
    const sys = system({ components: ids, model, mixing: "MHV1", ...(userData ? { userData } : {}) });
    const pairs = (sys.info.pairs ?? []).map(p => ({ pair: (p.pair ?? []).join(" + "), source: p.tier === "none" ? "none: g^E = 0" : `${p.tier ?? ""}${p.set ? ` (${p.set})` : ""}`.trim() || (p.note ?? "") }));
    return { ok: true, method, message: null, pairs, warnings: sys.warnings(298.15, 101.325).filter(w => w.includes("g^E = 0")) };
  } catch (e) {
    return { ok: false, method, message: e.message, pairs: [], warnings: [] };
  }
}
