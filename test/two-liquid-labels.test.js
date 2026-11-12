// The labels of proposal 0019 (two liquids) are reproducible: validation/python/two_liquid_labels.py writes them with
// numpy; this test recomputes the predicted splits of every labelled NRTL and UNIQUAC set with the engine's own activity
// coefficients (src/thermo/system.js, JavaScript Math.exp and Math.log instead of numpy's), on the same composition grid
// and with the same lower-convex-hull test (fit_parameters.phase_splits), and compares them with the stored splits, to
// the stored 4 decimals in x and 0.01 K in T. It then derives each label's evidence class from the splits and
// validation/data/two_liquids/classes.json by the script's rule, and checks the Wilson labels and the "phase-split"
// known issues (decision 2026-11-11-02). A different numerical library giving the same stored file is what "the labels
// are reproducible on another machine" means here.
// Method (docs/METHOD_SELECTION.md): the sets' own models, NRTL and UNIQUAC, which describe two liquids; Wilson only as
// the script labels it (it cannot split).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSystem } from "../src/index.js";
import binaries from "../src/data/binaries.json" with { type: "json" };
import known from "../src/data/known-issues.json" with { type: "json" };

const classes = JSON.parse(readFileSync(new URL("../validation/data/two_liquids/classes.json", import.meta.url))).pairs;

// numpy.linspace and numpy.logspace as numpy computes them (start + i * step, the last point set to stop)
const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => (i === n - 1 ? b : i * ((b - a) / (n - 1)) + a));
const logspace = (a, b, n) => linspace(a, b, n).map(e => 10 ** e);
const GRID = [...new Set([...logspace(-9, -1, 300), ...linspace(0.1, 0.9, 1500), ...logspace(-1, -9, 300).map(v => 1 - v)])]
  .sort((p, q) => p - q);
const TS = linspace(273.15, 373.15, 11);
const r4 = v => Number(v.toFixed(4));
const r2 = v => Number(v.toFixed(2));

/** fit_parameters.phase_splits: the composition ranges the lower convex hull of g_mix/RT bridges, wider than 0.01. */
function phaseSplits(gammas, T) {
  const hull = [];
  for (const x of GRID) {
    const g = gammas([x, 1 - x], T);
    const p = [x, x * Math.log(x * g[0]) + (1 - x) * Math.log((1 - x) * g[1])];
    while (hull.length >= 2) {
      const [a, b] = [hull.at(-2), hull.at(-1)];
      if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) <= 0) hull.pop(); else break;
    }
    hull.push(p);
  }
  const out = [];
  for (let k = 1; k < hull.length; k++) if (hull[k][0] - hull[k - 1][0] > 0.01) out.push([hull[k - 1][0], hull[k][0]]);
  return out;
}

const keyOf = p => [p.i, p.j].sort().join("+");
function splitsOf(p) {
  const c = classes[keyOf(p)];
  const temps = [...TS, ...c.evidence.filter(e => e.kind === "two-liquid" && e.T_K).flatMap(e => e.T_K)];
  const sys = createSystem({ components: [p.i, p.j], model: p.model, sets: { [`${p.i}+${p.j}`]: p.set } });
  return [...new Set(temps.map(r2))].sort((a, b) => a - b)
    .flatMap(T => phaseSplits(sys.gammas, T).map(([a, b]) => [T, r4(a), r4(b)]));
}

// two_liquid_labels.contradicted_by: a split covers part of a one-liquid entry's x range within its T range (+-1 K)
function contradictedBy(splits, e, flip) {
  if (!e.T_K || !e.x) return false;
  const [x0, x1] = flip ? [r4(1 - e.x[1]), r4(1 - e.x[0])] : e.x;
  return splits.some(([T, a, b]) => e.T_K[0] - 1 <= T && T <= e.T_K[1] + 1 && a < x1 - 0.01 && b > x0 + 0.01);
}

const labelled = binaries.pairs.filter(p => p.two_liquids && p.model !== "WILSON");

test("every stored split of a labelled NRTL or UNIQUAC set is recomputed exactly by the engine (another numerical library)", () => {
  assert.ok(labelled.length >= 100, `${labelled.length} labelled sets`);
  const differ = [];
  for (const p of labelled) {
    const got = splitsOf(p);
    if (JSON.stringify(got) !== JSON.stringify(p.two_liquids.splits)) differ.push(`${p.model} ${p.i} + ${p.j} (${p.set})`);
  }
  assert.deepEqual(differ, [], "splits that the engine does not reproduce");
});

test("sets without a label do not split: a few pairs whose other set is labelled", () => {
  // benzene + methanol: the ChemSep NRTL set (the default since 2026-11-10) and the fitted UNIQUAC set; furfural +
  // water and 2-propanol + water have no unlabelled NRTL or UNIQUAC set, so the pairs below are the ones with both
  const pairs = ["benzene+methanol", "1-butanol+isooctane", "cumene+sulfolane"];
  const sets = binaries.pairs.filter(p => pairs.includes(keyOf(p)) && ["NRTL", "UNIQUAC"].includes(p.model) && !p.two_liquids);
  assert.ok(sets.length >= 2, `${sets.length} unlabelled sets`);
  for (const p of sets) assert.deepEqual(splitsOf(p), [], `${p.model} ${p.i} + ${p.j} (${p.set})`);
});

test("each label's evidence class follows from its splits and the class of the pair", () => {
  for (const p of labelled) {
    const key = keyOf(p), c = classes[key], tl = p.two_liquids, flip = p.i !== key.split("+")[0];
    const one = c.evidence.filter(e => e.kind === "one-liquid");
    const want = c.class === "partly miscible" ? "measured"
      : c.class === "miscible" && one.some(e => contradictedBy(tl.splits, e, flip)) ? "predicted-contradicted"
        : "predicted-unvalidated";
    assert.equal(tl.evidence, want, `${p.model} ${p.i} + ${p.j} (${p.set})`);
    assert.equal(tl.class, c.class);
    const sources = want === "measured" ? c.evidence.filter(e => e.kind === "two-liquid").map(e => e.doi)
      : want === "predicted-contradicted" ? one.filter(e => contradictedBy(tl.splits, e, flip)).map(e => e.doi) : [];
    assert.deepEqual(tl.sources, [...new Set(sources)].sort(), `${p.model} ${p.i} + ${p.j}: sources`);
  }
});

test("a Wilson set carries the label of its pair's default NRTL (else UNIQUAC) set, and only then", () => {
  for (const w of binaries.pairs.filter(p => p.model === "WILSON" && classes[keyOf(p)])) {
    const pred = ["NRTL", "UNIQUAC"].map(m => binaries.pairs.find(p => p.model === m && keyOf(p) === keyOf(w)
      && p.default !== false && p.two_liquids)).find(Boolean);
    if (!pred) { assert.equal(w.two_liquids, undefined, `Wilson ${w.i} + ${w.j} (${w.set}): no labelled default`); continue; }
    assert.equal(w.two_liquids?.wilson, true, `Wilson ${w.i} + ${w.j} (${w.set})`);
    assert.equal(w.two_liquids.evidence, pred.two_liquids.evidence);
    assert.equal(w.two_liquids.predicted_by, `${pred.model} set "${pred.set ?? "default"}"`);
  }
});

test("one phase-split known issue per labelled set, in the script's place in the file, with the set's sources", () => {
  const issues = known.issues.filter(k => k.origin === "two_liquid_labels.py");
  const first = known.issues.findIndex(k => k.origin === "two_liquid_labels.py");
  assert.deepEqual(known.issues.slice(first, first + issues.length), issues, "the script's issues stand together");
  const unchecked = new Set(known.issues.filter(k => k.kind === "miscibility-unchecked").map(k => [...k.components].sort().join("+") + "|" + k.model));
  const sets = binaries.pairs.filter(p => p.two_liquids && !(p.model === "WILSON" && unchecked.has(keyOf(p) + "|WILSON")));
  assert.equal(issues.length, sets.length);
  for (const p of sets) {
    const k = issues.find(q => q.model === p.model && q.components[0] === p.i && q.components[1] === p.j
      && q.message.includes(`"${p.model === "WILSON" ? p.two_liquids.predicted_by.split('"')[1] : p.set}"`)
      && JSON.stringify(q.source_ids) === JSON.stringify([...new Set([...(p.source_ids ?? []), "nist-thermoml-archive"])].sort()));
    assert.ok(k, `${p.model} ${p.i} + ${p.j} (${p.set}): its known issue`);
  }
});
