/**
 * Chemical formulas as atom counts, and the atoms of Modified UNIFAC 2.0 subgroups (src/data/mod-unifac-2.json, from
 * the thermo library's DOUFSG with the corrections of validation/python/mod_unifac_2.py): the atom balance that groups
 * must pass against a component's formula (docs/DATA_RULES.md section 7; proposal 0012, step 5).
 */
import modUnifac from "../data/mod-unifac-2.json" with { type: "json" };

/** A chemical formula as atom counts ("C6H6O3" -> { C: 6, H: 6, O: 3 }); parentheses allowed. Throws on what it cannot read. */
export function parseFormula(formula) {
  const s = String(formula ?? "").replace(/\s+/g, "");
  if (!s) return null;
  let i = 0;
  const group = () => {
    const out = {};
    while (i < s.length && s[i] !== ")") {
      let part;
      if (s[i] === "(") { i++; part = group(); if (s[i] !== ")") throw new Error(`Formula "${formula}": a ( is not closed.`); i++; }
      else {
        const m = /^[A-Z][a-z]?/.exec(s.slice(i));
        if (!m) throw new Error(`Formula "${formula}": cannot read "${s.slice(i)}".`);
        i += m[0].length;
        part = { [m[0]]: 1 };
      }
      const n = /^\d+/.exec(s.slice(i));
      const k = n ? Number(n[0]) : 1;
      if (n) i += n[0].length;
      for (const [el, c] of Object.entries(part)) out[el] = (out[el] ?? 0) + c * k;
    }
    return out;
  };
  const out = group();
  if (i < s.length) throw new Error(`Formula "${formula}": a ) has no (.`);
  return out;
}

const show = o => Object.entries(o).sort().map(([el, k]) => `${el}${k === 1 ? "" : k}`).join("");

/**
 * The atom balance of Modified UNIFAC 2.0 subgroups against a formula.
 * @param {Object<string, number>} groups  subgroup id -> count
 * @param {string|null} formula
 * @returns {{atoms, formula, diff, ok, oneHOver, unknown: string[], text: string}}  ok is null when there is nothing to
 *          check against; oneHOver: H above the formula, one per ring, as when a substituted ring carbon is counted in
 *          the ring's subgroup (the way DDBST counts it; allowed): one H, or as many as the groups have whole-ring
 *          subgroups (THF, (CH2)2CB, FURFURAL; isosorbide's two THF rings: two H)
 */
// the subgroups that stand for a whole ring (or most of one), in which DDBST counts a substituted ring carbon
const RING_SUBGROUPS = new Set(["THF", "(CH2)2CB", "FURFURAL"]);

export function atomBalance(groups, formula) {
  const sub = modUnifac.subgroups;
  const atoms = {}, unknown = [];
  for (const [id, n] of Object.entries(groups ?? {})) {
    const a = sub[id]?.atoms;
    if (!a) { unknown.push(id); continue; }
    for (const [el, k] of Object.entries(a)) atoms[el] = (atoms[el] ?? 0) + n * k;
  }
  let want = null;
  try { want = parseFormula(formula); } catch { want = null; }
  if (!want) return { atoms, formula: null, diff: null, ok: null, oneHOver: false, unknown, text: "no formula to check against" };
  const els = [...new Set([...Object.keys(atoms), ...Object.keys(want)])].sort();
  const diff = Object.fromEntries(els.map(el => [el, (atoms[el] ?? 0) - (want[el] ?? 0)]).filter(([, d]) => d !== 0));
  const ok = !unknown.length && !Object.keys(diff).length;
  const rings = Object.entries(groups ?? {}).filter(([id]) => RING_SUBGROUPS.has(sub[id]?.name)).reduce((a, [, n]) => a + n, 0);
  const oneHOver = !unknown.length && Object.keys(diff).length === 1 && diff.H >= 1 && diff.H <= Math.max(1, rings);
  const text = unknown.length ? `cannot check: no atoms known for ${unknown.map(id => sub[id]?.name ?? id).join(", ")}`
    : ok ? `the groups add up to ${show(atoms)}, the formula`
      : `the groups add up to ${show(atoms) || "nothing"}; the formula is ${show(want)} (${Object.entries(diff).map(([el, d]) => `${d > 0 ? "+" : ""}${d} ${el}`).join(", ")})${oneHOver ? (diff.H === 1 ? ": one H over, as when a substituted ring carbon is counted in the ring's subgroup" : `: ${diff.H} H over, as when a substituted ring carbon is counted in each ring's subgroup`) : ""}`;
  return { atoms, formula: want, diff, ok, oneHOver, unknown, text };
}
