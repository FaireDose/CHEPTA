/**
 * Pair parameters and Modified UNIFAC 2.0 groups of one's own, side by side with the databank's (proposal 0012, step 5;
 * the maintainer, 2026-10-16: "the coefficients side by side, the ones from the database and the empty table where i
 * can add mine. for unifac also side by side the parameters and the selection of the groups").
 *
 * DOM-free: what the My data panel shows (src/ui/my-data-panel.js). The parameters are those of the library
 * (src/thermo/library.js, data/binaries.json) and of Modified UNIFAC 2.0 (src/data/mod-unifac-2.json), shown as they are
 * used: NRTL tau_ij = a_ij + b_ij / T and G_ij = exp(-alpha tau_ij) (src/thermo/activity/nrtl.js); UNIQUAC
 * tau_ij = exp(a_ij + b_ij / T) (src/thermo/activity/uniquac.js); k_ij of Peng-Robinson and SRK; Modified UNIFAC 2.0
 * Psi_nm = exp(-(a_nm + b_nm T) / T) between main groups n and m (src/thermo/activity/mod-unifac.js).
 */
import { library } from "../thermo/library.js";
import { componentRecord, findComponent } from "../thermo/components.js";
import { checkUserData } from "../thermo/user-data.js";
import modUnifac from "../data/mod-unifac-2.json" with { type: "json" };
import { parseFormula, atomBalance } from "../thermo/formula.js";
export { parseFormula, atomBalance };

/** The parameters of each pair model, in the order shown, with their units and meaning. */
export const PAIR_MODELS = {
  NRTL: { label: "NRTL", params: [["a_ij", "-"], ["a_ji", "-"], ["b_ij", "K"], ["b_ji", "K"], ["alpha", "-"]],
    equation: "τij = aij + bij/T, Gij = exp(−α τij)" },
  UNIQUAC: { label: "UNIQUAC", params: [["a_ij", "-"], ["a_ji", "-"], ["b_ij", "K"], ["b_ji", "K"]],
    equation: "τij = exp(aij + bij/T)" },
  PR: { label: "Peng–Robinson k_ij", params: [["kij", "-"]], equation: "binary interaction parameter of the mixing rule" },
  SRK: { label: "SRK k_ij", params: [["kij", "-"]], equation: "binary interaction parameter of the mixing rule" },
};

// a set's parameters seen from the order (a, b): i = a, j = b
const oriented = (params, flip) => (flip
  ? { ...params, a_ij: params.a_ji, a_ji: params.a_ij, b_ij: params.b_ji, b_ji: params.b_ij }
  : { ...params });

/**
 * The databank's sets of a pair and the user's own, as columns of one table.
 * @param {string} a, b       component ids (the order of the table: i = a, j = b)
 * @param {string} model      NRTL, UNIQUAC, PR or SRK
 * @param {object|null} userData  as entered
 * @returns {{params: [string, string][], databank: {set, tier, default, source, valid, values}[], mine: {values, source, valid, use}|null,
 *            mineKey: string|null}}
 */
export function pairColumns(a, b, model, userData = null) {
  const spec = PAIR_MODELS[model];
  if (!spec) throw new Error(`Unknown pair model "${model}". Use ${Object.keys(PAIR_MODELS).join(", ")}.`);
  const user = a.startsWith("user:") || b.startsWith("user:");
  const databank = user ? [] : library.sets(a, b, model).filter(s => s.tier !== "user").map(s => ({
    set: s.set, tier: s.tier, default: !!s.default, source: s.source ?? "", valid: s.valid ?? (s.T_range_K ? { T_K: s.T_range_K } : null),
    values: oriented(s.params, s.i !== a),
  }));
  // the user's own set, from the data as entered (its key may name the pair in either order)
  const ud = checkUserData(userData ?? {});
  let mine = null, mineKey = null, entryKey = null, entryFirst = null;
  for (const [key, p] of Object.entries(userData?.pairs ?? {})) {
    const [x, y] = key.split("+").map(k => findComponent(k.trim(), ud));
    if (!((x === a && y === b) || (x === b && y === a))) continue;
    entryKey = key; entryFirst = x;   // the person's entry of this pair, whatever models it holds
    if (!p?.[model]) continue;
    const given = p[model];
    const values = model === "PR" || model === "SRK" ? { kij: given.kij } : oriented({ a_ij: given.a_ij ?? 0, a_ji: given.a_ji ?? 0, b_ij: given.b_ij, b_ji: given.b_ji, ...(model === "NRTL" ? { alpha: given.alpha ?? 0.3 } : {}) }, x !== a);
    mine = { values, source: typeof p.source === "string" ? p.source : p.source?.name ?? "", valid: p.valid ?? null, use: p.use !== false };
    mineKey = key;
  }
  return { params: spec.params, databank, mine, mineKey, entryKey, entryFirst };
}

/**
 * The person's pairs with one model's values for (a, b) written in: into the pair's existing entry (in that entry's
 * order of the components, keeping its other models), or as a new entry "a+b". The source and validity range belong
 * to the pair's entry.
 */
export function withPairValues(userData, a, b, model, typed, source, valid = null) {
  const cols = pairColumns(a, b, model, userData);
  const entry = pairEntry(a, b, model, typed, source, valid);
  const [k] = Object.keys(entry);
  const pairs = { ...(userData?.pairs ?? {}) };
  if (cols.entryKey) {
    const v = entry[k][model];
    pairs[cols.entryKey] = { ...pairs[cols.entryKey], [model]: cols.entryFirst === a ? v : oriented(v, true), source: entry[k].source,
      ...(valid ? { valid } : {}) };
    if (!valid) delete pairs[cols.entryKey].valid;
    delete pairs[cols.entryKey].use;   // saved again: used again
  } else pairs[k] = entry[k];
  return { ...(userData ?? {}), pairs };
}

/**
 * The user's pair entry for user data, from the values typed for (a, b): { "<a>+<b>": { [model]: values, source } }.
 * Empty fields are refused with the name of the parameter.
 */
export function pairEntry(a, b, model, typed, source, valid = null) {
  const spec = PAIR_MODELS[model];
  const values = {};
  for (const [k] of spec.params) {
    const t = String(typed[k] ?? "").trim().replace(",", ".");
    if (t === "" && (k === "a_ij" || k === "a_ji")) { values[k] = 0; continue; }
    if (t === "" && k === "alpha") { values[k] = 0.3; continue; }
    const v = Number(t);
    if (t === "" || !Number.isFinite(v)) throw new Error(`${k}: give a number${t ? ` (got "${t}")` : ""}.`);
    values[k] = v;
  }
  return { [`${a}+${b}`]: { [model]: values, source: typeof source === "string" ? { name: source } : source, ...(valid ? { valid } : {}) } };
}

// ---------------------------------------------------------------------------------------------------------------
// Modified UNIFAC 2.0 groups

const SUB = modUnifac.subgroups;
const MAIN_NAME = modUnifac.mainGroups;

/** Rows of a group table: each subgroup with its count, main group, R and Q. */
export function groupRows(groups) {
  return Object.entries(groups ?? {}).map(([id, n]) => {
    const s = SUB[id];
    return { id, count: n, name: s?.name ?? `unknown subgroup ${id}`, main: s?.main ?? null, mainName: MAIN_NAME[s?.main] ?? "", R: s?.R ?? null, Q: s?.Q ?? null };
  }).sort((x, y) => (x.main ?? 0) - (y.main ?? 0) || Number(x.id) - Number(y.id));
}

/** The interaction parameters (a_nm in K, b_nm) between the main groups of these groups, both directions. */
export function mainGroupInteractions(groups) {
  const mains = [...new Set(Object.keys(groups ?? {}).map(id => SUB[id]?.main).filter(m => m != null))].sort((x, y) => x - y);
  const idx = new Map(modUnifac.main.map((m, i) => [m, i]));
  const out = [];
  for (let p = 0; p < mains.length; p++) for (let q = p + 1; q < mains.length; q++) {
    const n = mains[p], m = mains[q], i = idx.get(n), j = idx.get(m);
    if (i == null || j == null) { out.push({ n, m, nName: MAIN_NAME[n], mName: MAIN_NAME[m], missing: true }); continue; }
    out.push({ n, m, nName: MAIN_NAME[n], mName: MAIN_NAME[m], a_nm: modUnifac.a[i][j], b_nm: modUnifac.b[i][j], a_mn: modUnifac.a[j][i], b_mn: modUnifac.b[j][i] });
  }
  return out;
}

/** Subgroups matching a search (name or main group, case-insensitive), for the picker; all when the query is empty. */
export function searchSubgroups(query = "") {
  const q = String(query).trim().toLowerCase();
  return Object.entries(SUB).map(([id, s]) => ({ id, name: s.name, main: s.main, mainName: MAIN_NAME[s.main] ?? "", R: s.R, Q: s.Q }))
    .filter(s => !q || s.name.toLowerCase().includes(q) || s.mainName.toLowerCase().includes(q) || s.id === q)
    .sort((x, y) => x.main - y.main || Number(x.id) - Number(y.id));
}

/**
 * The database's groups of a component and the user's own (if any), for the two columns.
 * @returns {{formula: string|null, database: {groups, source, note}|null, mine: {groups, source, use}|null}}
 */
export function groupColumns(id, userData = null) {
  const ud = checkUserData(userData ?? {});
  const rec = componentRecord(id, null);   // the database's, without the user's overlay
  const own = id.startsWith("user:") ? componentRecord(id, ud) : null;
  const database = id.startsWith("user:") ? null
    : rec?.modUnifac?.groups ? { groups: { ...rec.modUnifac.groups }, source: rec.modUnifac.source ?? "", note: null }
      : { groups: null, source: "", note: rec?.modUnifac?.note ?? "no Modified UNIFAC 2.0 groups in the database" };
  let mine = null;
  if (id.startsWith("user:")) {
    const g = userData?.components?.[id]?.groups;
    if (g) mine = { groups: { ...g.subgroups }, source: typeof g.source === "string" ? g.source : g.source?.name ?? "", use: true };
  } else {
    for (const [key, g] of Object.entries(userData?.groups ?? {})) {
      if (findComponent(key, ud) !== id) continue;
      mine = { groups: { ...g.subgroups }, source: typeof g.source === "string" ? g.source : g.source?.name ?? "", use: g.use !== false };
    }
  }
  return { formula: (own ?? rec)?.formula ?? null, database, mine };
}
