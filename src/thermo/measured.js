/**
 * The measured vapour-liquid sets of a pair, for the views (proposal 0021, answer 7): the rows of the data files of
 * validation/data/ as scripts/vle-points.mjs wrote them into src/data/vle-points.json, each with the source that
 * src/data/sources.json lists the file under. Read only: nothing is calculated, fitted or filled in here, and a pair
 * without a data file has no set (the views then say "no measured data").
 *
 * No thermodynamics here.
 */
import data from "../data/vle-points.json" with { type: "json" };
import sourcesData from "../data/sources.json" with { type: "json" };

const key = (a, b) => [a, b].sort().join("|");
let byPair = null, byFile = null;

function index() {
  if (byPair) return;
  byPair = new Map(); byFile = new Map();
  for (const [id, s] of Object.entries(sourcesData.sources)) for (const f of s.files ?? []) if (!byFile.has(f)) byFile.set(f, { id, ...s });
  for (const set of data.sets) {
    const k = key(...set.components);
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k).push(set);
  }
}

/** "Kamihama, Matsuda et al., J. Chem. Eng. Data 57 (2012) 339": the authors (shortened after two) and where it was published. */
function citationOf(s) {
  if (!s) return null;
  const authors = String(s.authors ?? "").split(/,\s*|\s+and\s+/).filter(Boolean);
  const who = authors.length > 2 ? `${authors.slice(0, 2).join(", ")} et al.` : authors.join(", ");
  return [who, s.published ?? s.title ?? (s.year ? String(s.year) : "")].filter(Boolean).join(", ");
}

/**
 * The measured vapour-liquid sets of the pair (a, b), compositions as mole fractions of `a`.
 * @returns {{file:string, kind:string, P_kPa:number|null, T_K:number|null,
 *   points:{T:number, P:number, x:number|null, y:number|null}[],
 *   source:{id:string|null, citation:string|null, doi:string|null, url:string|null, tables:string|null}}[]}
 *   `kind`: "isobaric-txy", "isobaric-tx", "isothermal-px", "isothermal-pxy" or "tpx" (points at several temperatures
 *   and pressures); `P_kPa` or `T_K`: the pressure or temperature of a whole set, else null; `points`: one per row of
 *   the file, in its order, T in K, P in kPa, x and y of component `a` (null where the row has none).
 */
export function measuredVle(a, b) {
  index();
  return (byPair.get(key(a, b)) ?? []).map(set => {
    const flip = set.components[0] !== a;
    const at = c => set.columns.indexOf(c);
    const iT = at("T_K"), iP = at("P_kPa"), ix = at("x_1"), iy = at("y_1");
    const frac = v => (v == null ? null : flip ? 1 - v : v);
    const src = byFile.get(`validation/data/${set.file}`);
    return {
      file: set.file, kind: set.kind, P_kPa: set.P_kPa ?? null, T_K: set.T_K ?? null,
      points: set.rows.map(r => ({ T: iT < 0 ? set.T_K : r[iT], P: iP < 0 ? set.P_kPa : r[iP], x: ix < 0 ? null : frac(r[ix]), y: iy < 0 ? null : frac(r[iy]) })),
      source: { id: src?.id ?? null, citation: citationOf(src), doi: src?.doi ?? null, url: src?.url ?? null, tables: set.tables ?? null },
    };
  });
}

/** How many pairs have a measured set, and how many sets and points there are (for the documentation and the tests). */
export function measuredVleCounts() {
  index();
  return { pairs: byPair.size, sets: data.sets.length, points: data.sets.reduce((n, s) => n + s.rows.length, 0) };
}
