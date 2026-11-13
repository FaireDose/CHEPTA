// Missing pairs estimated from Modified UNIFAC 2.0 (src/thermo/activity/estimate-pairs.js; decision
// 2026-11-13-05) and the pair sets used outside their data range gathered in result.extrapolations (decision
// 2026-11-13-03, question 3).
//  1. the engine's estimate against an independent calculation: scipy's least squares with the thermo library's NRTL,
//     UNIQUAC, Wilson and modified UNIFAC (validation/python/reference_estimate_pairs.py ->
//     validation/fixtures/estimated_pairs.json), at check points the regression did not use;
//  2. how it is labelled and warned, the strict mode's refusal, the ideal fallback, two liquids;
//  3. for pairs that DO have fitted sets, how an estimate would compare with the fitted set and the measured data
//     (information, not a target: the bounds are the deviations found when the estimate was added, 2026-11-13).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, runFlowsheet, withRangePolicy } from "../src/index.js";
import { estimatePair, binaryModel, estimateTemperatures } from "../src/thermo/activity/estimate-pairs.js";
import { modUnifac } from "../src/thermo/activity/mod-unifac.js";

const load = p => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const comps = load("../src/data/components.json").components;
const tables = load("../src/data/mod-unifac-2.json");
const fixture = load("../validation/fixtures/estimated_pairs.json");

test("the estimate agrees with the independent regression (scipy + thermo) at points it was not fitted to", () => {
  assert.equal(fixture.cases.length, 6);
  for (const c of fixture.cases) {
    const what = `${c.model} ${c.components.join(" + ")}`;
    const e = estimatePair(c.model, c.components.map(id => comps[id]), tables);
    assert.deepEqual(e.T_K, c.T_K, what);
    assert.ok(Math.abs(e.rms_ln_gamma - c.rms_ln_gamma) <= 5e-3 * c.rms_ln_gamma + 1e-6, `${what}: rms ${e.rms_ln_gamma} vs ${c.rms_ln_gamma}`);
    const g = binaryModel(c.model, e.b_ij, e.b_ji, c.model === "UNIQUAC" ? c.components.map(id => comps[id].uniquac) : null);
    const ref = modUnifac({ groups: c.components.map(id => comps[id].modUnifac.groups), tables });
    for (const k of c.checks) {
      const lnE = g([k.x, 1 - k.x], k.T_K).map(Math.log), lnU = ref([k.x, 1 - k.x], k.T_K).map(Math.log);
      // the same parameters: the same ln gamma as scipy's estimate (thermo's models)
      lnE.forEach((v, i) => assert.ok(Math.abs(v - k.lnGamma_estimate[i]) < 2e-5, `${what} at ${k.T_K} K, x ${k.x}: ${v} vs ${k.lnGamma_estimate[i]}`));
      // the reference itself: the engine's Modified UNIFAC 2.0 is thermo's
      lnU.forEach((v, i) => assert.ok(Math.abs(v - k.lnGamma_mod_unifac_2[i]) < 1e-9, `${what}: Mod. UNIFAC 2.0`));
      // how closely the estimate follows Modified UNIFAC 2.0 between the regression points: within the largest residual
      // at the regression points (it interpolates; it does not add error of its own)
      lnE.forEach((v, i) => assert.ok(Math.abs(v - lnU[i]) <= c.max_ln_gamma + 1e-9, `${what} at ${k.T_K} K, x ${k.x}: ${Math.abs(v - lnU[i])}`));
    }
  }
  // the nearly ideal pair is followed closely
  assert.ok(fixture.cases[0].rms_ln_gamma < 0.002);
});

test("the regression temperatures: the boiling points and their mean, 250-550 K, at least 30 K wide", () => {
  assert.deepEqual(estimateTemperatures(320, 360), [320, 340, 360]);
  assert.deepEqual(estimateTemperatures(340, 350), [330, 345, 360]);
  assert.deepEqual(estimateTemperatures(null, null), [298.15, 335.65, 373.15]);
  assert.deepEqual(estimateTemperatures(200, 600), [250, 400, 550]);
});

test("a missing pair is estimated, labelled predicted, and warned about in every result; never stored", () => {
  const s = system({ components: ["acetone", "ethyl acetate"], model: "NRTL" });
  const p = s.info.pairs[0];
  assert.deepEqual([p.set, p.tier, p.chosenBy, p.source_ids], ["estimated-mod-unifac-2", "predicted", "estimate", ["hayer2025-mod-unifac-2"]]);
  assert.match(p.sources[0].title, /Modified UNIFAC 2\.0/);
  assert.match(p.source, /^Estimated when the system was built: NRTL b_ij, b_ji regressed to the activity coefficients of Modified UNIFAC 2\.0 .*not stored as data$/);
  assert.equal(p.estimated.params.alpha, 0.3);
  assert.deepEqual(s.info.missingPairs, []);
  const msg = "Acetone + Ethyl acetate: no measured NRTL parameters; estimated from Modified UNIFAC 2.0 (predicted, not data).";
  assert.deepEqual(s.info.estimatedPairs.map(e => e.warning), [msg]);
  assert.ok(s.bubbleT([0.5, 0.5], 101.325).warnings.includes(msg));
  assert.ok(s.flash({ z: [0.5, 0.5], T: 330, P: 101.325 }).warnings.includes(msg));
  // the gammas are the estimate's
  const g = binaryModel("NRTL", p.estimated.params.b_ij, p.estimated.params.b_ji);
  assert.deepEqual(s.gammas([0.3, 0.7], 340), g([0.3, 0.7], 340));
  // nothing in the databank
  assert.ok(!readFileSync(new URL("../src/data/binaries.json", import.meta.url), "utf8").includes("estimated-mod-unifac-2"));
});

test("the strict range mode, missingPairs: \"refuse\" and allowMissingPairs restore the behaviour of before", () => {
  const cfg = { components: ["acetone", "ethyl acetate"], model: "NRTL" };
  assert.throws(() => withRangePolicy({ strictRanges: true }, () => system(cfg)), e => e.code === "MISSING_DATA"
    && /^No NRTL parameters for: Acetone \+ Ethyl acetate\./.test(e.message) && /strict range mode/.test(e.message));
  assert.throws(() => system({ ...cfg, missingPairs: "refuse" }), e => e.code === "MISSING_DATA" && !/strict range mode/.test(e.message));
  // an explicit choice holds in the strict mode too
  assert.equal(withRangePolicy({ strictRanges: true }, () => system({ ...cfg, missingPairs: "estimate" })).info.pairs[0].set, "estimated-mod-unifac-2");
  for (const s of [system({ ...cfg, allowMissingPairs: true }), system({ ...cfg, missingPairs: "ideal" })]) {
    assert.deepEqual(s.info.missingPairs, [["Acetone", "Ethyl acetate"]]);
    assert.deepEqual(s.info.estimatedPairs, []);
    assert.deepEqual(s.gammas([0.5, 0.5], 330), [1, 1]);
  }
  assert.throws(() => system({ ...cfg, missingPairs: "guess" }), e => e.code === "BAD_INPUT");
  // a flowsheet's solver.strictRanges decides it as well
  const doc = strict => ({ components: ["acetone", "ethyl-acetate"], thermo: { model: "NRTL" }, ...(strict ? { solver: { strictRanges: true } } : {}),
    blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { acetone: 50, "ethyl-acetate": 50 }, T_K: 300, P_kPa: 101.325 } }, { id: "P1", type: "product" }],
    streams: [{ id: "S1", from: "F1.out", to: "P1.in" }] });
  assert.throws(() => runFlowsheet(doc(true)), e => e.code === "MISSING_DATA");
  const r = runFlowsheet(doc(false));
  const notes = r.extrapolations.filter(e => e.kind === "estimatedPair");
  assert.equal(notes.length, 1);
  assert.deepEqual(notes[0].where, ["F1"]);
  assert.equal(notes[0].short, "Acetone + Ethyl acetate: NRTL parameters estimated from Modified UNIFAC 2.0");
  assert.equal(notes[0].message, "Acetone + Ethyl acetate: no measured NRTL parameters; estimated from Modified UNIFAC 2.0 (predicted, not data). Where: F1.");
});

test("no Modified UNIFAC 2.0 groups: the pair is ideal, loudly; a light gas stays refused (the wrong method)", () => {
  const s = system({ components: ["maleic-anhydride", "toluene"], model: "NRTL" });
  assert.deepEqual(s.info.missingPairs, [["Maleic anhydride", "Toluene"]]);
  assert.deepEqual(s.gammas([0.5, 0.5], 400), [1, 1]);
  const w = s.info.estimatedPairs[0].warning;
  assert.equal(s.info.estimatedPairs[0].ideal, true);
  assert.match(w, /Modified UNIFAC 2\.0 cannot estimate them \(Maleic anhydride has no groups\): the pair is taken as IDEAL .* \(My data\), or choose another method\.$/);
  assert.ok(s.warnings(400, 101.325).includes(w));
  // carbon dioxide (no groups, critical temperature 304 K) with water but without Henry's law; helium with water
  assert.throws(() => system({ components: ["carbon-dioxide", "water"], model: "NRTL", henry: false }), e => e.code === "MISSING_DATA"
    && /Carbon dioxide is a gas without Modified UNIFAC 2\.0 groups, .*use Peng–Robinson or SRK, or Henry's law/.test(e.message));
  assert.throws(() => system({ components: ["helium", "water"], model: "NRTL" }), e => e.code === "MISSING_DATA" && /is a gas at room temperature/.test(e.message));
});

test("two liquids predicted from an estimate are said so; Wilson says when Modified UNIFAC 2.0 splits the pair", () => {
  const s = system({ components: ["benzene", "ethylene glycol"], model: "NRTL" });
  assert.match(s.info.estimatedPairs[0].warning, /Two liquids predicted from an estimate, not checked against data \(at 353\.22 K, from x\(Benzene\) about 0\.\d+ to 0\.9\d+\)\./);
  assert.equal(s.info.pairs[0].two_liquids.evidence, "predicted-unvalidated");
  assert.equal(s.isLiquidStable([0.5, 0.5], 353.22), false);
  const w = system({ components: ["water", "toluene"], model: "WILSON" });
  assert.match(w.info.estimatedPairs[0].warning, /Modified UNIFAC 2\.0 predicts two liquids for this pair at 363\.44 K .*which Wilson cannot give: use NRTL or UNIQUAC\./);
});

test("UNIQUAC and Wilson estimates; one stored pair and one estimated in a ternary", () => {
  const u = system({ components: ["ethyl acetate", "toluene"], model: "UNIQUAC" });
  assert.equal(u.info.pairs[0].set, "estimated-mod-unifac-2");
  const t = system({ components: ["ethanol", "water", "glycerol", "benzene"], model: "NRTL" });
  const est = t.info.pairs.filter(p => p.set === "estimated-mod-unifac-2").map(p => p.pair.join(" + "));
  const stored = t.info.pairs.filter(p => p.set !== "estimated-mod-unifac-2").map(p => p.pair.join(" + "));
  assert.ok(est.length >= 1 && stored.length >= 1, `${est} | ${stored}`);
  assert.equal(est.length + stored.length, 6);
  assert.deepEqual(t.info.estimatedPairs.map(e => e.pair.join(" + ")), est);
  const r = t.bubbleT([0.25, 0.25, 0.25, 0.25], 101.325);
  assert.ok(Number.isFinite(r.T));
});

// open isobaric T-x-y sets (ThermoML Archive) of pairs that have a fitted NRTL set: mean |dT| (K) and |dy| of the
// fitted set and of the estimate (found 2026-11-13: fitted 0.12 K / 0.004, estimate 1.08 K / 0.018; acetone + methanol
// 0.12 / 0.002 and 0.50 / 0.007; ethyl acetate + ethanol 0.09 / 0.003 and 0.40 / 0.009): the estimate is close to
// Modified UNIFAC 2.0 itself and several times worse than a fit to data, which is why a fitted set always comes first
const COMPARE = [
  ["ethanol_water_101kPa.json", 0.15, 0.005, 1.15, 0.020],
  ["acetone_methanol_101kPa.json", 0.15, 0.003, 0.55, 0.008],
  ["ethyl-acetate_ethanol_101kPa.json", 0.15, 0.004, 0.45, 0.010],
];
for (const [file, fitT, fitY, estT, estY] of COMPARE) {
  test(`${file}: the NRTL estimate against the fitted set and the measured data (information)`, () => {
    const d = load(`../validation/data/${file}`);
    const col = Object.fromEntries(d.columns.map((c, k) => [c, k]));
    const pts = d.rows.map(r => ({ x: r[col.x_1], T: r[col.T_K], y: r[col.y_1] })).filter(p => p.x > 0 && p.x < 1);
    const e = estimatePair("NRTL", d.components.map(id => comps[id]), tables);
    const ud = { pairs: { [d.components.join("+")]: { NRTL: { b_ij: e.b_ij, b_ji: e.b_ji, alpha: 0.3 }, source: { name: "the Modified UNIFAC 2.0 estimate (test)" } } } };
    const aad = s => {
      const dev = pts.map(p => { const b = s.bubbleT([p.x, 1 - p.x], d.P_kPa); return [Math.abs(b.T - p.T), Math.abs(b.y[0] - p.y)]; });
      return [dev.reduce((a, v) => a + v[0], 0) / dev.length, dev.reduce((a, v) => a + v[1], 0) / dev.length];
    };
    const fitted = system({ components: d.components, model: "NRTL" });
    assert.equal(fitted.info.pairs[0].tier, "fitted");
    const [fT, fY] = aad(fitted), [eT, eY] = aad(system({ components: d.components, model: "NRTL", userData: ud }));
    assert.ok(fT < fitT && fY < fitY, `fitted: ${fT.toFixed(3)} K, ${fY.toFixed(4)}`);
    assert.ok(eT < estT && eY < estY, `estimate: ${eT.toFixed(3)} K, ${eY.toFixed(4)}`);
    assert.ok(eT > fT, "a fit to data is closer to the data than the estimate");
  });
}

test("pair sets used outside their data range: in result.extrapolations once per pair, with no margin", () => {
  // water + ethyl acetate: the default NRTL set was fitted at 273.35-343.55 K; at 350 K it is 6.45 K above, inside the
  // old 10 K margin of the warnings (unchanged), but listed in the flowsheet's extrapolations
  const s = system({ components: ["water", "ethyl acetate"], model: "NRTL" });
  const ex = s.extrapolations(350).filter(e => e.kind === "pairSet");
  assert.equal(ex.length, 1);
  assert.equal(ex[0].message, "Water + Ethyl acetate: NRTL set at 350 K is 6.45 K above its range (273.35-343.55 K): the set's temperature dependence is used as it is (fitted to data at 273.35-343.55 K). This is an extrapolation, not data.");
  assert.ok(!s.warnings(350, 300).some(w => /NRTL set at/.test(w)), "the warnings keep their 10 K margin");
  assert.equal(s.extrapolations(340).filter(e => e.kind === "pairSet").length, 0);
  const r = runFlowsheet({ components: ["water", "ethyl-acetate"], thermo: { model: "NRTL" },
    blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { water: 98, "ethyl-acetate": 2 }, T_K: 300, P_kPa: 300 } },
      { id: "H1", type: "heater", spec: { T_K: 350, P_kPa: 300 } }, { id: "H2", type: "heater", spec: { T_K: 355, P_kPa: 300 } }, { id: "P1", type: "product" }],
    streams: [{ id: "S1", from: "F1.out", to: "H1.in" }, { id: "S2", from: "H1.out", to: "H2.in" }, { id: "S3", from: "H2.out", to: "P1.in" }] });
  const pair = r.extrapolations.filter(e => e.kind === "pairSet");
  assert.equal(pair.length, 1, JSON.stringify(pair));
  assert.deepEqual(pair[0].where, ["H1", "H2"]);
  assert.ok(Math.abs(pair[0].distance - 11.45) < 1e-9);
  assert.equal(pair[0].short, "Water + Ethyl acetate: NRTL set extrapolated 11.45 K above its range");
  // an equation of state's k_ij set
  const pr = system({ components: ["methane", "ethane"], model: "PR" });
  const kij = pr.info.pairs[0];
  const r0 = kij.valid?.T_K ?? kij.T_range_K;
  if (r0) {
    const ek = pr.extrapolations(r0[1] + 5).filter(e => e.kind === "pairSet");
    assert.equal(ek.length, 1);
    assert.match(ek[0].message, /^Methane \+ Ethane: PR k_ij set at .* is 5 K above its range/);
  }
});
