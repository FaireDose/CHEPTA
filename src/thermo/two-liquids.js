/**
 * What stands behind two liquids in a result (proposal 0019, section 3): for each pair of a two-liquid result, whether
 * its split was measured at these conditions, only predicted by the set, or predicted where the pair was measured as
 * one liquid.
 *
 * The evidence is src/data/two-liquids.json, written by validation/python/two_liquid_labels.py from the classes of
 * validation/data/two_liquids/classes.json (two_liquid_survey.py, NIST TRC ThermoML Archive): per pair its class
 * ("partly miscible", "miscible", "not known", "miscible below the measured temperature, not known above it"), the
 * evidence entries (kind, doi, T_K, P_kPa and x ranges; x of the first component of the pair key, alphabetical) and,
 * for partly miscible pairs, the measured tie lines [T_K, x in liquid I, x in liquid II]. Each NRTL, UNIQUAC or Wilson
 * set of a classed pair carries its label in binaries.json ("two_liquids": { class, evidence, splits, sources }).
 *
 * A split is called **measured** only where the state lies inside the conditions of the pair's two-liquid evidence:
 * the temperature within an entry's range (1 K), the pressure within its range (10 %) where it gives one, and the
 * composition of both liquids (as the binary of the pair) within its composition range (0.02). Anywhere else, even for
 * a partly miscible pair, it is "predicted, without liquid-liquid validation at these conditions".
 */
import data from "../data/two-liquids.json" with { type: "json" };
import { fail } from "../util/errors.js";

const PAIRS = data.pairs;
const keyOf = (a, b) => [a, b].sort().join("+");

/** The pair's class record, or null. */
export function pairClass(a, b) {
  return PAIRS[keyOf(a, b)] ?? null;
}

const within = (v, r, tol) => r == null || (v >= r[0] - tol && v <= r[1] + tol);

/** The binary composition (mole fraction of a, in a + b) of a liquid x of the system. */
const binary = (x, i, j) => x[i] / Math.max(x[i] + x[j], 1e-300);

/**
 * The two-liquid statements of a result: liquids x1 and x2 (mole fractions in the system's order) at T (K) and P (kPa).
 * Pairs whose two components are both in both liquids and whose binary compositions differ (0.01) are stated.
 * @returns {{pair:string[], set:string|null, two_liquids:"measured"|"predicted-unvalidated"|"predicted-contradicted",
 *           class:string|null, evidence:string[], conditions:{T_K:number, P_kPa:number, x:number[]}, message:string}[]}
 */
export function twoLiquidStatements(sys, x1, x2, T, P) {
  const out = [];
  const n = sys.ids.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (Math.min(x1[i], x1[j], x2[i], x2[j]) < 1e-6) continue;
    const b1 = binary(x1, i, j), b2 = binary(x2, i, j);
    if (Math.abs(b1 - b2) < 0.01) continue;
    const a = sys.ids[i], b = sys.ids[j], names = [sys.names[i], sys.names[j]];
    const cls = pairClass(a, b);
    const p = (sys.info?.pairs ?? []).find(q => q.pair[0] === names[0] && q.pair[1] === names[1]);
    const label = p?.two_liquids ?? null;
    if (!cls && !label) continue;
    // x of the first component of the key, as the evidence states it
    const flip = keyOf(a, b).split("+")[0] !== a;
    const xs = flip ? [1 - b1, 1 - b2] : [b1, b2];
    const set = p?.set ?? null;
    const who = `the ${sys.model === "MOD-UNIFAC-2" ? "Mod. UNIFAC 2.0 prediction" : `${sys.model} set${set ? ` "${set}"` : ""}`} of ${names.join(" + ")}`;
    let status, evidence = [], message;
    const measured = (cls?.evidence ?? []).filter(e => e.kind === "two-liquid" && e.T_K && within(T, e.T_K, 1)
      && (e.P_kPa == null || within(P, [e.P_kPa[0] * 0.9, e.P_kPa[1] * 1.1], 0))
      && (e.x == null || (within(xs[0], e.x, 0.02) && within(xs[1], e.x, 0.02))));
    if (cls?.class === "partly miscible" && measured.length) {
      status = "measured";
      evidence = [...new Set(measured.map(e => e.doi))];
      const fitted = label?.fitted ?? false;
      message = `Two liquids measured for ${names.join(" + ")} at these conditions (partly miscible, ${evidence.length} article${evidence.length > 1 ? "s" : ""}: ${evidence.slice(0, 3).map(d => `doi ${d}`).join(", ")}${evidence.length > 3 ? ", ..." : ""})${fitted ? "; the set was fitted to them" : ""}.`;
    } else if (label?.evidence === "predicted-contradicted") {
      status = "predicted-contradicted";
      evidence = label.sources ?? [];
      message = `Two liquids predicted by ${who} where the pair was measured as one liquid (${evidence.slice(0, 3).map(d => `doi ${d}`).join(", ")}): the split is probably wrong; choose another set or another model.`;
    } else {
      status = "predicted-unvalidated";
      message = cls?.class === "partly miscible"
        ? `Two liquids predicted by ${who}, without liquid-liquid validation at these conditions (the pair is partly miscible, but no measured split covers ${T.toFixed(1)} K and these compositions).`
        : `Two liquids predicted by ${who}, not checked against liquid-liquid data (${cls?.class === "not known" || !cls ? "no open data found" : cls.class}).`;
    }
    out.push({ pair: names, set, two_liquids: status, class: cls?.class ?? null, evidence,
      conditions: { T_K: T, P_kPa: P, x: [xs[0], xs[1]] }, message });
  }
  return out;
}

/**
 * The measured split of a partly miscible pair at T (K): [lo, hi] in x of the first component of the key, by linear
 * interpolation between the measured tie lines that bracket T (within 5 K of a measured one); null where none does.
 */
export function measuredSplitAt(a, b, T) {
  const tl = pairClass(a, b)?.tie_lines;
  if (!tl?.length) return null;
  const rows = tl.map(([t, u, v]) => [t, Math.min(u, v), Math.max(u, v)]).sort((p, q) => p[0] - q[0]);
  const near = rows.filter(r => Math.abs(r[0] - T) <= 0.5);
  if (near.length) return [Math.min(...near.map(r => r[1])), Math.max(...near.map(r => r[2]))];
  const below = rows.filter(r => r[0] < T).pop(), above = rows.find(r => r[0] > T);
  if (below && above && above[0] - below[0] <= 30) {
    const w = (T - below[0]) / (above[0] - below[0]);
    return [below[1] + w * (above[1] - below[1]), below[2] + w * (above[2] - below[2])];
  }
  const one = below && T - below[0] <= 5 ? below : above && above[0] - T <= 5 ? above : null;
  return one ? [one[1], one[2]] : null;
}

/**
 * Wilson cannot show two liquids (proposal 0019, section 4): refuse a liquid x at T that lies, for a pair classed partly
 * miscible, inside the measured split at that temperature (NOT_AVAILABLE, naming NRTL and UNIQUAC).
 */
export function refuseWilsonInsideMeasuredSplit(sys, x, T) {
  if (sys.model !== "WILSON") return;
  const n = sys.ids.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (x[i] < 1e-6 || x[j] < 1e-6) continue;
    const a = sys.ids[i], b = sys.ids[j];
    if (pairClass(a, b)?.class !== "partly miscible") continue;
    const sp = measuredSplitAt(a, b, T);
    if (!sp) continue;
    const flip = keyOf(a, b).split("+")[0] !== a;
    const xb = flip ? 1 - binary(x, i, j) : binary(x, i, j);
    if (xb > sp[0] + 0.01 && xb < sp[1] - 0.01) {
      const first = keyOf(a, b).split("+")[0] === a ? sys.names[i] : sys.names[j];
      throw fail("NOT_AVAILABLE", `Wilson cannot show two liquids, and ${sys.names[i]} + ${sys.names[j]} is measured to split at ${T.toFixed(1)} K: this liquid (mole fraction of ${first} ${xb.toFixed(3)} in the pair) lies inside the measured split (${sp[0].toFixed(3)}-${sp[1].toFixed(3)}; validation/data/two_liquids/classes.json). Use NRTL or UNIQUAC, which describe the two liquids.`, { x, T });
    }
  }
}
