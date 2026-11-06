// Peng-Robinson and SRK k_ij of gases in polar liquids at high pressure (CO2, H2, CO, CH4 + methanol; CO2 + water),
// fitted by validation/fit_kij_high_pressure.mjs to the open data of the NIST TRC ThermoML Archive
// (validation/data/eos/thermoml_*.json, written by validation/python/hp_gas_solubility.py).
// Method (docs/METHOD_SELECTION.md): a light gas with a polar liquid in Peng-Robinson or SRK, offered with a warning
// where the pair has a k_ij (the maintainer, 2026-11-04: "PR and SRK should be ok for now"). This test compares the
// engine with the data at the recorded k_ij: a kept k_ij must meet the gate it was kept by, and the errors recorded for
// the fits that were not kept must be the engine's, so the decision on proposal 0018 rests on reproducible numbers.
// The independent check is the Python equation of state (validation/python/eos_check_literature.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { system } from "../src/index.js";
import kij from "../src/data/kij.json" with { type: "json" };
import known from "../src/data/known-issues.json" with { type: "json" };

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const hp = load("validation/data/eos/high_pressure_fits.json");
const check = load("validation/data/eos/literature_check.json");
const FILES = readdirSync(new URL("../validation/data/eos/", import.meta.url)).filter(f => f.startsWith("thermoml_"));
const SLACK = 1.02;

test("every ThermoML gas-solubility file has a complete source block and readable rows", () => {
  assert.ok(FILES.length >= 50, `${FILES.length} files`);
  for (const f of FILES) {
    const d = load(`validation/data/eos/${f}`);
    for (const k of ["citation", "doi", "open_copy", "access", "tables", "transcription"]) assert.ok(d.source[k], `${f}: source.${k}`);
    assert.deepEqual(d.columns, ["T_K", "P_kPa", "p_1_kPa", "x_1", "y_1", "U_P_kPa", "U_x_1"], f);
    for (const r of d.rows) {
      assert.ok(r[0] > 150 && r[0] < 700, `${f}: T ${r[0]}`);
      assert.ok((r[1] ?? r[2]) > 0, `${f}: a pressure`);
      assert.ok(r[3] != null || r[4] != null, `${f}: x or y`);
      for (const v of [r[3], r[4]]) if (v != null) assert.ok(v >= 0 && v <= 1, `${f}: mole fraction ${v}`);
    }
  }
});

const points = files => files.flatMap(f => {
  const d = load(f);
  return d.rows.filter(r => r[3] != null && r[3] > 0 && r[3] < 1 && r[0] <= hp.window.T_K && (r[1] ?? r[2]) <= hp.window.P_kPa)
    .map(r => ({ T: r[0], P: r[1], p1: r[2], x: r[3] }));
});

/** AAD in P of the bubble points at constant k (a number), or with the default set of src/data/kij.json (k null). */
function aadP(pair, model, k, pts) {
  const s = system({ components: pair, model, ...(k == null ? {} : { kij: [[0, k], [k, 0]] }) });
  let missing = 0;
  const dev = [];
  for (const p of pts) {
    try {
      const b = s.bubbleP([p.x, 1 - p.x], p.T);
      dev.push(Math.abs((p.P != null ? b.P / p.P : b.y[0] * b.P / p.p1) - 1) * 100);
    } catch { missing++; }
  }
  return { aad: dev.reduce((a, v) => a + v, 0) / dev.length, missing };
}

test("the kept k_ij are in kij.json, and the fits outside the gate are not", () => {
  for (const e of hp.entries) {
    assert.ok(kij.pairs.some(p => p.model === e.model && p.i === e.i && p.j === e.j && p.kij === e.kij && p.kij_b_K === e.kij_b_K && p.tier === "fitted"), `${e.model} ${e.i}-${e.j}`);
  }
  // a pair whose constant k_ij was not kept has no fitted set, unless its a + b / T set was written
  const writtenT = r => hp.temperature_study.some(t => t.model === r.model && t.pair.join() === r.pair.join() && t.warned);
  for (const r of hp.results.filter(r => !r.ok && !r.warned && !writtenT(r))) {
    assert.ok(!kij.pairs.some(p => p.model === r.model && p.tier === "fitted" && new Set([p.i, p.j]).has(r.pair[0]) && new Set([p.i, p.j]).has(r.pair[1])),
      `${r.model} ${r.pair.join("-")} was not kept and has no fitted k_ij`);
  }
});

for (const e of hp.entries) {
  // the result the entry was written from: a constant fit, or the temperature study (a + b / T)
  const r = e.kij_b_K != null
    ? (t => ({ warned: t.warned, errors: { pooled: t.errors } }))(hp.temperature_study.find(q => q.model === e.model && q.pair.join() === [e.i, e.j].join()))
    : hp.results.find(q => q.model === e.model && q.pair.join() === [e.i, e.j].join());
  test(`${e.model} ${e.i} + ${e.j}, k_ij = ${e.kij}${e.kij_b_K != null ? ` + ${e.kij_b_K} K / T` : ""}: ${r.warned ? "outside the gate, with its fit-quality warning" : "within the gate"} on ${e.source.data.length} ThermoML article(s)`, () => {
    const set = kij.pairs.find(p => p.model === e.model && p.i === e.i && p.j === e.j);
    // the engine with the default set of kij.json (for a + b / T: the engine's temperature-dependent k_ij)
    const { aad, missing } = aadP([e.i, e.j], e.model, null, points(set.source.data));
    assert.equal(missing, r.errors.pooled.no_bubble_pressure);
    if (!r.warned) return assert.ok(aad <= hp.gate.P_pct * SLACK, `AAD ${aad.toFixed(2)} % in P`);
    // written outside the gate by the maintainer's decision (WARNED): the record and the workbench say so
    assert.match(set.quality_warning, /outside the gate/);
    assert.ok(known.issues.some(k => k.kind === "fit-quality" && k.model === e.model && k.components.join() === [e.i, e.j].join()), "fit-quality known issue");
    assert.ok(Math.abs(aad - r.errors.pooled.P_pct.aad) < 0.1);
  });
}

test("k_ij = a + b / T (the temperature study): its recorded errors are the engine's, and none meets the gate yet", () => {
  assert.ok(hp.temperature_study.length >= 4);
  for (const t of hp.temperature_study) {
    const r = hp.results.find(q => q.model === t.model && q.pair.join() === t.pair.join());
    const files = r.errors.articles.filter(a => a.points).map(a => `validation/data/eos/${a.file}`);
    const pts = points(files);
    let dev = [], missing = 0;
    for (const p of pts) {
      const k = t.a + t.b_K / p.T;
      try {
        const b = system({ components: t.pair, model: t.model, kij: [[0, k], [k, 0]] }).bubbleP([p.x, 1 - p.x], p.T);
        dev.push(Math.abs((p.P != null ? b.P / p.P : b.y[0] * b.P / p.p1) - 1) * 100);
      } catch { missing++; }
    }
    const aad = dev.reduce((a, v) => a + v, 0) / dev.length;
    assert.equal(missing, t.errors.no_bubble_pressure, `${t.model} ${t.pair}`);
    assert.ok(Math.abs(aad - t.errors.P_pct.aad) < 0.1, `${t.model} ${t.pair}: AAD ${aad.toFixed(2)} % against ${t.errors.P_pct.aad} %`);
    // a form that met the gate would be added to the engine (the maintainer, 2026-11-05): this fails to say so
    assert.equal(t.ok, false, `${t.model} ${t.pair.join(" + ")}: a + b / T meets the gate; add it to the engine`);
  }
});

test("carbon dioxide + water: the default is the a + b / T set (2026-11-06); ChemSep's set is not usable in a liquid (2026-11-05)", () => {
  for (const model of ["PR", "SRK"]) {
    // the default: the temperature-dependent set, with its fit-quality warning
    const s = system({ components: ["carbon-dioxide", "water"], model });
    const p = s.info.pairs[0];
    assert.ok(p.kij_b_K < 0 && p.tier === "fitted", `${model}: ${JSON.stringify(p)}`);
    assert.ok(s.bubbleP([0.01, 0.99], 320).P > 0);
    assert.ok(known.issues.some(k => k.kind === "fit-quality" && k.model === model && k.components.join() === "carbon-dioxide,water"));
    // ChemSep's set, chosen by name: refused wherever a liquid holds both
    const c = system({ components: ["carbon-dioxide", "water"], model, sets: { "carbon-dioxide+water": "chemsep" } });
    const refused = e => e.code === "NOT_AVAILABLE" && /Carbon dioxide \+ Water in the liquid is refused/.test(e.message) && /Henry's law/.test(e.message);
    assert.throws(() => c.bubbleP([0.01, 0.99], 320), refused, model);
    assert.throws(() => c.dewT([0.9, 0.1], 5000), refused, model);
    assert.throws(() => c.flash({ z: [0.5, 0.5], T: 300, P: 5000 }), refused, model);
    // ... but not for a gas alone
    const v = c.flash({ z: [0.5, 0.5], T: 600, P: 500 });
    assert.equal(v.phases.length, 1);
    assert.equal(v.phases[0].type, "vapour");
    // the user's own k_ij carries no mark; a + b / T is accepted in My data too
    const u = system({ components: ["carbon-dioxide", "water"], model, kij: [[0, -0.11], [-0.11, 0]] });
    assert.ok(u.bubbleP([0.01, 0.99], 320).P > 0);
    const ud = { pairs: { "carbon-dioxide+water": { [model]: { kij: p.kij, kij_b_K: p.kij_b_K }, source: "test" } } };
    const m = system({ components: ["carbon-dioxide", "water"], model, userData: ud });
    assert.ok(Math.abs(m.bubbleP([0.01, 0.99], 320).P / s.bubbleP([0.01, 0.99], 320).P - 1) < 1e-9);
    // the mark and its numbers are in the data
    const e = kij.pairs.find(q => q.model === model && new Set([q.i, q.j]).has("carbon-dioxide") && new Set([q.i, q.j]).has("water"));
    assert.match(e.replaced.not_usable.reason, /dissolves about a tenth of the measured CO2/);
    assert.match(e.replaced.not_usable.decided, /2026-11-05/);
  }
});

test("k_ij = a + b / T: at one temperature the same as the constant k_ij a + b / T, and its enthalpy derivative is exact", () => {
  const T = 313.15, a = 0.1883, b = -40.62, k = a + b / T, x = [0.2, 0.8];
  const t = system({ components: ["carbon-dioxide", "methanol"], model: "PR", userData: { pairs: { "carbon-dioxide+methanol": { PR: { kij: a, kij_b_K: b }, source: "test" } } } });
  const c = system({ components: ["carbon-dioxide", "methanol"], model: "PR", kij: [[0, k], [k, 0]] });
  assert.ok(Math.abs(t.bubbleP(x, T).P / c.bubbleP(x, T).P - 1) < 1e-12);
  // h_R = -R T^2 d(sum x_i ln phi_i)/dT at constant P and x, and cp_R = dh_R/dT
  const R = 8.314462618, P = 5000, g = u => t.state(u, P, x, "liquid").lnPhi.reduce((s, v, i) => s + x[i] * v, 0), h = 1e-3;
  const st = t.state(T, P, x, "liquid");
  assert.ok(Math.abs(st.hR_J_mol + R * T * T * (g(T + h) - g(T - h)) / (2 * h)) < 1e-3);
  assert.ok(Math.abs(st.cpR_J_molK - (t.state(T + h, P, x, "liquid").hR_J_mol - t.state(T - h, P, x, "liquid").hR_J_mol) / (2 * h)) < 1e-3);
  // and it is not the constant k_ij's enthalpy (dk_ij/dT is not 0)
  assert.ok(Math.abs(st.hR_J_mol - c.state(T, P, x, "liquid").hR_J_mol) > 100);
});


for (const r of hp.results) {
  test(`${r.model} ${r.pair.join(" + ")}: the recorded error in P at k_ij = ${r.kij} (${r.errors.pooled.P_pct.aad} %, ${r.ok ? "kept" : "not kept"}) is the engine's`, () => {
    const files = r.errors.articles.filter(a => a.points).map(a => `validation/data/eos/${a.file}`);
    const pts = points(files);
    assert.equal(pts.length, r.points);
    const { aad, missing } = aadP(r.pair, r.model, r.kij, pts);
    assert.equal(missing, r.errors.pooled.no_bubble_pressure);
    assert.ok(Math.abs(aad - r.errors.pooled.P_pct.aad) < 0.1, `AAD ${aad.toFixed(2)} % against ${r.errors.pooled.P_pct.aad} % recorded`);
    assert.equal(r.ok, missing === 0 && r.errors.pooled.P_pct.aad <= hp.gate.P_pct);
  });
}

test("the engine's bubble pressures agree with the independent Python equation of state at the kept high-pressure k_ij", () => {
  for (const e of hp.entries) {
    const pts = check.points.filter(p => p.model === e.model && p.pair.join() === [e.i, e.j].join());
    assert.equal(pts.length, 4, `${e.model} ${e.i}-${e.j}`);
    for (const p of pts) {
      // the default set of kij.json: for a + b / T, the engine's temperature-dependent mixing rule
      const s = system({ components: p.pair, model: p.model });
      assert.equal(s.info.pairs[0].kij, p.kij);
      const P = s.bubbleP([p.x_1, 1 - p.x_1], p.T_K).P;
      assert.ok(Math.abs(P / p.P_reference_kPa - 1) < 0.005, `${p.model} ${p.pair.join("-")} T = ${p.T_K}: ${P.toFixed(2)} vs ${p.P_reference_kPa} kPa`);
      if (p.kij_b_K) {
        // the residual enthalpy carries dk_ij/dT: analytic in the engine, a numerical derivative in the reference
        const h = s.state(p.T_K, p.P_reference_kPa, [p.x_1, 1 - p.x_1], "liquid").hR_J_mol;
        assert.ok(Math.abs(h - p.hR_liquid_reference_J_mol) < 1e-4 * Math.abs(p.hR_liquid_reference_J_mol) + 0.05, `${p.model} ${p.pair.join("-")}: h_R ${h} vs ${p.hR_liquid_reference_J_mol} J/mol`);
      }
    }
  }
});

test("CO2 + water with the a + b / T k_ij: its heat of absorption against Henry's law (IAPWS G7-04), and ChemSep's set has the wrong sign", async () => {
  // dk_ij/dT carries the heat of solution. Its reference: -R T^2 d ln H / dT of the Henry's law constant of IAPWS
  // G7-04 (src/data/henry.json; within 3.5 % of Carroll et al. 1991 in test/henry-components.test.js). The k_ij was
  // fitted to solubilities, not to this heat, so the comparison is a check of the temperature dependence, held to 20 %.
  const { henry } = await import("../src/thermo/henry.js");
  const T = 313.15, P = 2000, R = 8.314462618, d = 0.01;
  const ref = -R * T * T * (Math.log(henry("carbon-dioxide", "water", T + d)) - Math.log(henry("carbon-dioxide", "water", T - d))) / (2 * d);
  const absorption = cfg => {
    const s = system({ components: ["carbon-dioxide", "water"], model: "PR", ...cfg });
    const H = n => (n[0] + n[1]) * s.state(T, P, [n[0] / (n[0] + n[1]), n[1] / (n[0] + n[1])], "liquid").hR_J_mol;
    const e = 1e-6;   // partial molar residual enthalpy of CO2 at infinite dilution in the liquid, minus pure CO2 gas
    return (H([e, 1]) - H([0, 1])) / e - s.state(T, P, [1, 0], "vapour").hR_J_mol;
  };
  const t = absorption({}), c = absorption({ sets: { "carbon-dioxide+water": "chemsep" } });
  assert.ok(ref < -10000, `reference ${ref}`);
  assert.ok(Math.abs(t / ref - 1) < 0.2, `a + b / T: ${t.toFixed(0)} J/mol against ${ref.toFixed(0)} J/mol`);
  assert.ok(c > 0, `ChemSep: ${c.toFixed(0)} J/mol (endothermic)`);
});
