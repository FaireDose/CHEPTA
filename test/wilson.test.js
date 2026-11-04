// The Wilson activity model (proposal 0016, roadmap item M1): against the thermo library's Wilson with ChemSep's set,
// the independent Python model and open isobaric data (validation/fixtures/wilson.json, made by
// validation/python/reference_wilson.py); the two liquids it cannot predict; Wilson pairs of one's own.
// Method (docs/METHOD_SELECTION.md): Wilson is the method under test here, on mixtures with one liquid at 101.3 kPa
// (alcohols, ketones, esters, chloroform: polar non-electrolytes, step 2); 1-butanol + water, which splits, is used on
// purpose to check the warning and the refusal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSystem, bubbleT, library } from "../src/index.js";
import { run } from "../src/api/dispatcher.js";
import { liquidTangentPlane } from "../src/equilibrium/stability.js";

const ref = JSON.parse(readFileSync(new URL("../validation/fixtures/wilson.json", import.meta.url)));

test("activity coefficients match the thermo library's Wilson with ChemSep's set", () => {
  const cache = new Map();
  for (const c of ref.gamma) {
    const key = c.components.join("+");
    if (!cache.has(key)) cache.set(key, createSystem({ components: c.components, model: "WILSON" }));
    const g = cache.get(key).gammas(c.x, c.T_K);
    g.forEach((v, i) => assert.ok(Math.abs(v / c.gamma[i] - 1) < 1e-10, `${key} x=${c.x} T=${c.T_K}: ${v} vs ${c.gamma[i]}`));
  }
  // the example printed in thermo's documentation of its Wilson class (ethanol + water, 70 degC, ChemSep set)
  const e = ref.thermo_doc_example;
  const g = createSystem({ components: e.components, model: "Wilson" }).gammas(e.x, e.T_K);
  g.forEach((v, i) => assert.ok(Math.abs(v - e.gamma_printed[i]) < 1e-7, `printed example: ${v} vs ${e.gamma_printed[i]}`));
});

test("bubble points at 101.3 kPa match the independent Python model (ChemSep's set and the default set)", () => {
  for (const set of ref.vle) {
    const sys = createSystem({ components: set.components, model: "WILSON", sets: { [set.components.join("+")]: set.set } });
    for (const r of set.rows) {
      const b = bubbleT(sys, [r.x_1, 1 - r.x_1], set.P_kPa);
      assert.ok(Math.abs(b.T - r.T_K) < 1e-4, `${set.file} (${set.set}) x=${r.x_1}: T ${b.T} vs ${r.T_K}`);
      assert.ok(Math.abs(b.y[0] - r.y_1) < 1e-6, `${set.file} (${set.set}) x=${r.x_1}: y ${b.y[0]} vs ${r.y_1}`);
    }
  }
});

test("ChemSep's Wilson set and the fitted default against open isobaric data (ThermoML Archive)", () => {
  // the limits are those a fitted set must meet in CHEPTA (docs/DATA_RULES.md section 5: 0.5 K and 0.012 in y)
  const files = ["ethanol_water_101kPa.json", "acetone_methanol_101kPa.json", "acetone_chloroform_101kPa.json",
    "chloroform_methanol_101kPa.json", "ethyl-acetate_ethanol_101kPa.json", "ethanol_ethylene-glycol_101kPa.json"];
  const pick = (f, chosen) => ref.vle.find(v => v.file === f && v.chosen === chosen);
  // the default sets are the fits of proposal 0016, step 2, to these data: within the limits
  for (const f of files) {
    const s = pick(f, "default");
    assert.match(s.set, /^fitted-/, `${f}: default set ${s.set}`);
    assert.ok(s.mean_abs_dT_K < 0.5 && s.mean_abs_dy < 0.012, `${f} (${s.set}): ${s.mean_abs_dT_K} K, ${s.mean_abs_dy}`);
  }
  // ChemSep's set, not fitted to these data, stays selectable: within the same limits for the first five pairs
  for (const f of files.slice(0, 5)) {
    const s = pick(f, "chemsep");
    assert.ok(s.mean_abs_dT_K < 0.5 && s.mean_abs_dy < 0.012, `${f} (chemsep): ${s.mean_abs_dT_K} K, ${s.mean_abs_dy}`);
  }
  // ethanol + ethylene glycol: ChemSep's set misses the measured boiling temperatures (Kamihama et al. 2012) by about 5 K
  // on average, as ChemSep's NRTL set does (about 6 K); kept here so that the deviation is seen, not hidden, and the
  // workbench says so (src/data/known-issues.json; the maintainer, 2026-11-04)
  assert.ok(pick(files[5], "chemsep").mean_abs_dT_K > 2.5, `ethanol + ethylene glycol (chemsep): ${pick(files[5], "chemsep").mean_abs_dT_K} K`);
  const note = JSON.parse(readFileSync(new URL("../src/data/known-issues.json", import.meta.url))).issues
    .find(k => k.model === "WILSON" && k.kind === "databank-deviation" && k.components.join("+") === "ethanol+ethylene-glycol");
  assert.match(note.message, /set "chemsep"[\s\S]*5\.3 K[\s\S]*default/);
});

test("Wilson cannot predict two liquids: the liquid stays stable, the system warns, the column refuses VLL", () => {
  const nrtl = createSystem({ components: ["1-butanol", "water"], model: "NRTL" });
  const wil = createSystem({ components: ["1-butanol", "water"], model: "WILSON" });
  const z = [0.1, 0.9];
  assert.equal(liquidTangentPlane(nrtl, z, 300).stable, false);   // NRTL: two liquids, as measured
  assert.equal(liquidTangentPlane(wil, z, 300).stable, true);     // Wilson: one liquid, always
  const w = wil.warnings(300, 101.325).join(" ");
  assert.match(w, /Wilson cannot predict two liquids, but the NRTL set "\S+" of 1-Butanol \+ Water predicts them at 300 K/);
  // a pair with one liquid gives no such warning
  assert.equal(createSystem({ components: ["ethanol", "water"], model: "WILSON" }).warnings(350, 101.325).some(s => /two liquids/.test(s)), false);
  const col = run({ capability: "solve_column", input: { components: ["1-butanol", "water"], thermo: { model: "WILSON" },
    feed: { flow_kmol_h: { "1-butanol": 20, water: 80 }, P_kPa: 101.325, VF: 0 },
    column: { mode: "rigorous", stages: 6, feed_stage: 3, phases: "VLL", reflux_ratio: 2, distillate_kmol_h: 20 } } });
  assert.equal(col.outcome, "unsupported");
  assert.match(col.error.message, /cannot be looked for with Wilson/);
});

test("a rigorous column with Wilson through the request path (CHEPTA.run)", () => {
  const r = run({ capability: "solve_column", input: { components: ["methanol", "water"], thermo: { model: "WILSON" },
    feed: { flow_kmol_h: { methanol: 50, water: 50 }, P_kPa: 101.325, VF: 0 },
    column: { mode: "rigorous", stages: 12, feed_stage: 6, reflux_ratio: 1.5, distillate_kmol_h: 50 } } });
  assert.equal(r.outcome, "ok", JSON.stringify(r.error));
});

test("Wilson pairs of one's own: user data and library.add", () => {
  // a pair without a databank Wilson set refuses and says how to add one
  assert.throws(() => createSystem({ components: ["water", "gvl"], model: "WILSON" }), /No Wilson parameters for: Water \+ .*WILSON: \{ a_ij, a_ji, b_ij, b_ji \}/s);
  const userData = { pairs: { "water+gvl": { WILSON: { a_ij: -1.2, a_ji: 1.2, b_ij: -300, b_ji: -200 }, source: { name: "test values, not data" } } } };
  const s = createSystem({ components: ["water", "gvl"], model: "WILSON", userData });
  assert.equal(s.info.pairs[0].tier, "user");
  const L12 = Math.exp(-1.2 - 300 / 320), L21 = Math.exp(1.2 - 200 / 320);
  const x = [0.4, 0.6], S1 = x[0] + x[1] * L12, S2 = x[0] * L21 + x[1];
  const g1 = Math.exp(1 - Math.log(S1) - x[0] / S1 - x[1] * L21 / S2);
  assert.ok(Math.abs(s.gammas(x, 320)[0] / g1 - 1) < 1e-12);
  assert.throws(() => createSystem({ components: ["water", "gvl"], model: "WILSON",
    userData: { pairs: { "water+gvl": { WILSON: { b_ij: 1, b_ji: 1, alpha: 0.3 }, source: { name: "x" } } } } }), /unknown parameter "alpha"/);
  const set = library.add({ model: "WILSON", i: "ethanol", j: "water", set: "wilson-test", params: { a_ij: 0, a_ji: 0, b_ij: -100, b_ji: -300 },
    source: { title: "Test set", url: "https://example.org" } });
  assert.equal(set.tier, "user");
  assert.ok(library.sets("ethanol", "water", "WILSON").some(c => c.set === "chemsep" && c.tier === "databank"));
});

test("a project with Wilson and a Wilson pair of one's own is saved and reopened", async () => {
  const { initialState } = await import("../src/ui/app-logic.js");
  const { projectOf, stateFromProject } = await import("../src/ui/project.js");
  const userData = { pairs: { "water+gvl": { WILSON: { b_ij: -300, b_ji: -200 }, source: { name: "test values, not data" } } } };
  const st = { ...initialState({ components: ["water", "gvl"], model: "Wilson" }), userData };
  const back = stateFromProject(JSON.stringify(projectOf(st)));
  assert.equal(back.model, "WILSON");
  assert.deepEqual(back.userData.pairs["water+gvl"].WILSON, { b_ij: -300, b_ji: -200 });
});
