// Pairs with two liquids, fitted and used by class (proposal 0019, step 2): the jointly fitted sets against the
// independent Python reference (validation/fixtures/two_liquids.json, reference_two_liquids.py) and the measured tie
// lines of the ThermoML Archive (validation/data/two_liquids/lle/), within the solubility gates of 0019 (answer 2:
// 0.04 in mole fraction, or 50 % for a minor component below 0.05, the wider gate the fits are written within); what a
// two-liquid result says about its evidence; Wilson refused inside a measured split.
// Method (docs/METHOD_SELECTION.md, rule 7): NRTL and UNIQUAC describe two liquids; Wilson is used on purpose where it
// is refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, createSystem, bubbleT } from "../src/index.js";
import { twoLiquidStatements, pairClass, measuredSplitAt } from "../src/thermo/two-liquids.js";
import binaries from "../src/data/binaries.json" with { type: "json" };

const load = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const ref = load("../validation/fixtures/two_liquids.json");
const classes = load("../validation/data/two_liquids/classes.json").pairs;

/** The two liquids the engine gives for a pair at T: a flash of the middle of the reference split, well above its
 *  bubble pressure (an activity-model liquid does not depend on pressure). */
function engineSplit(c) {
  const s = system({ components: c.pair, model: c.model, sets: { [c.pair.join("+")]: c.set } });
  const z = 0.5 * (c.x_I + c.x_II);
  const P = 20 * s.bubbleP([z, 1 - z], c.T_K).P;
  const r = s.flash({ z: [z, 1 - z], T: c.T_K, P });
  const liq = r.phases.filter(p => p.type === "liquid").map(p => p.composition[0]);
  return { liq, r };
}

test("the jointly fitted sets: the engine's two liquids equal the Python reference's", () => {
  assert.ok(ref.cases.length > 0, "at least one jointly fitted set");
  for (const c of ref.cases) {
    const { liq } = engineSplit(c);
    assert.equal(liq.length, 2, `${c.pair.join(" + ")} ${c.model} at ${c.T_K} K: two liquids`);
    const [lo, hi] = [Math.min(...liq), Math.max(...liq)], [rlo, rhi] = [Math.min(c.x_I, c.x_II), Math.max(c.x_I, c.x_II)];
    assert.ok(Math.abs(lo - rlo) < 1e-4 && Math.abs(hi - rhi) < 1e-4, `${c.pair.join(" + ")} ${c.model} at ${c.T_K} K: [${lo}, ${hi}] vs [${rlo}, ${rhi}]`);
  }
});

test("the jointly fitted sets meet the measured mutual solubilities within the wider gate of proposal 0019", () => {
  const bySet = new Map();
  for (const c of ref.cases) {
    const k = `${c.pair.join("+")}|${c.model}`;
    if (!bySet.has(k)) bySet.set(k, []);
    bySet.get(k).push(c);
  }
  for (const [k, cs] of bySet) {
    const abs = [], rel = [];
    for (const c of cs) {
      const model = [Math.min(c.x_I, c.x_II), Math.max(c.x_I, c.x_II)], meas = [Math.min(...c.measured), Math.max(...c.measured)];
      for (let n = 0; n < 2; n++) {
        const m = meas[n] < 0.5 ? model[n] : 1 - model[n], d = meas[n] < 0.5 ? meas[n] : 1 - meas[n];
        if (d < 0.05) rel.push(Math.abs(m / d - 1)); else abs.push(Math.abs(m - d));
      }
    }
    const mean = a => a.reduce((p, v) => p + v, 0) / a.length;
    if (abs.length) assert.ok(mean(abs) <= 0.04, `${k}: AAD ${mean(abs).toFixed(3)} in mole fraction`);
    if (rel.length) assert.ok(mean(rel) <= 0.5, `${k}: mean relative deviation ${(mean(rel) * 100).toFixed(0)} %`);
  }
});

test("every class names its sources and the ranges they cover; a predicted split is never recorded as measured", () => {
  for (const [k, c] of Object.entries(classes)) {
    assert.ok(["partly miscible", "miscible", "not known", "miscible below the measured temperature, not known above it"].includes(c.class), k);
    for (const e of c.evidence) {
      assert.ok(["two-liquid", "one-liquid"].includes(e.kind) && e.doi && e.citation, `${k}: an evidence entry names its article`);
    }
    if (c.class === "partly miscible") assert.ok(c.evidence.some(e => e.kind === "two-liquid"), `${k}: two-liquid evidence`);
    if (c.class === "miscible") assert.ok(c.contradicted && !c.evidence.some(e => e.kind === "two-liquid"), `${k}: one liquid measured inside a split`);
  }
  // the labels on the sets agree with the classes
  for (const p of binaries.pairs) {
    if (!p.two_liquids) continue;
    const c = classes[[p.i, p.j].sort().join("+")];
    assert.equal(p.two_liquids.class, c.class, `${p.model} ${p.i} + ${p.j}`);
    if (p.two_liquids.evidence === "measured") assert.equal(c.class, "partly miscible");
  }
});

test("a two-liquid result says what stands behind it: measured, predicted only, or contradicted", () => {
  // furfural + water (partly miscible, two liquids measured at 369 K; the set fitted to them)
  const fw = ref.cases.find(c => c.pair.includes("furfural") && c.pair.includes("water"));
  if (fw) {
    const { r } = engineSplit(fw);
    const t = r.two_liquids.find(q => q.pair.includes("Furfural"));
    assert.equal(t.two_liquids, "measured", JSON.stringify(t));
    assert.ok(t.evidence.length > 0);
  }
  // a pair measured as one liquid where its databank set splits (proposal 0019's survey: 1-propanol + water, ChemSep
  // UNIQUAC, 264 one-liquid points inside the split)
  const contradicted = binaries.pairs.find(p => p.two_liquids?.evidence === "predicted-contradicted" && p.model !== "WILSON");
  assert.ok(contradicted, "at least one contradicted set");
  const sys = createSystem({ components: [contradicted.i, contradicted.j], model: contradicted.model, sets: { [`${contradicted.i}+${contradicted.j}`]: contradicted.set } });
  const [T, a, b] = contradicted.two_liquids.splits[0];
  const st = twoLiquidStatements(sys, [a, 1 - a], [b, 1 - b], T, 101.325);
  assert.equal(st[0].two_liquids, "predicted-contradicted");
  assert.match(st[0].message, /measured as one liquid[\s\S]*probably wrong/);
  // a not-known pair: predicted, not checked
  const unk = binaries.pairs.find(p => p.two_liquids?.evidence === "predicted-unvalidated" && p.model !== "WILSON");
  if (unk) {
    const s2 = createSystem({ components: [unk.i, unk.j], model: unk.model, sets: { [`${unk.i}+${unk.j}`]: unk.set } });
    const [T2, a2, b2] = unk.two_liquids.splits[0];
    const st2 = twoLiquidStatements(s2, [a2, 1 - a2], [b2, 1 - b2], T2, 101.325);
    assert.equal(st2[0].two_liquids, "predicted-unvalidated");
    assert.match(st2[0].message, /not checked against liquid-liquid data|without liquid-liquid validation/);
  }
});

test("Wilson is refused inside a measured split, and only there", () => {
  // 1-butanol + water: partly miscible (proposal 0019's survey: 51 two-liquid sets of 27 articles, 278-366 K)
  assert.equal(pairClass("1-butanol", "water").class, "partly miscible");
  const sp = measuredSplitAt("1-butanol", "water", 323.15);
  assert.ok(sp && sp[1] - sp[0] > 0.2, `measured split at 323 K: ${sp}`);
  const sys = createSystem({ components: ["1-butanol", "water"], model: "WILSON" });
  const mid = 0.5 * (sp[0] + sp[1]);   // x of 1-butanol, the first component of the key
  assert.throws(() => sys.flash({ z: [mid, 1 - mid], T: 323.15, P: 101.325 }), /Wilson cannot show two liquids[\s\S]*inside the measured split/);
  // a water-rich liquid outside the split is calculated
  const r = sys.flash({ z: [0.005, 0.995], T: 323.15, P: 101.325 });
  assert.ok(r.phases.length >= 1);
  assert.ok(bubbleT(sys, [0.005, 0.995], 101.325).T > 360);
});

test("CHEPTA.run: the flash drum's two liquids in the qualifications", async () => {
  const fw = ref.cases.find(c => c.pair.includes("furfural") && c.pair.includes("water"));
  if (!fw) return;
  const { run } = await import("../src/api/dispatcher.js");
  const z = 0.5 * (fw.x_I + fw.x_II);
  const r = run({ capability: "solve_flowsheet", input: { flowsheet: {
    components: fw.pair, thermo: { model: fw.model, vapour: "ideal", sets: { [fw.pair.join("+")]: fw.set } },
    blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { [fw.pair[0]]: 100 * z, [fw.pair[1]]: 100 * (1 - z) }, T_K: fw.T_K, P_kPa: 2000 } },
      { id: "D", type: "flash", spec: { T_K: fw.T_K, P_kPa: 2000 } }, { id: "P1", type: "product" }, { id: "P2", type: "product" }, { id: "P3", type: "product" }],
    streams: [{ id: "S1", from: "F1.out", to: "D.in" }, { id: "V", from: "D.vapour", to: "P1.in" }, { id: "L1", from: "D.liquid", to: "P2.in" },
      { id: "L2", from: "D.liquid2", to: "P3.in" }] } } });
  assert.equal(r.outcome, "ok", JSON.stringify(r.error));
  const q = r.qualifications.two_liquids;
  assert.ok(q && q.length && q[0].block === "D", JSON.stringify(r.qualifications));
  assert.ok(["measured", "predicted-unvalidated", "predicted-contradicted"].includes(q[0].two_liquids));
});
