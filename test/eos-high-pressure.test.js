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

function aadP(pair, model, k, pts) {
  const s = system({ components: pair, model, kij: [[0, k], [k, 0]] });
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
  for (const e of hp.entries) assert.ok(kij.pairs.some(p => p.model === e.model && p.i === e.i && p.j === e.j && p.kij === e.kij && p.tier === "fitted"), `${e.model} ${e.i}-${e.j}`);
  for (const r of hp.results.filter(r => !r.ok)) {
    assert.ok(!kij.pairs.some(p => p.model === r.model && p.tier === "fitted" && new Set([p.i, p.j]).has(r.pair[0]) && new Set([p.i, p.j]).has(r.pair[1])),
      `${r.model} ${r.pair.join("-")} was not kept and has no fitted k_ij`);
  }
});

for (const e of hp.entries) {
  test(`${e.model} ${e.i} + ${e.j}, k_ij = ${e.kij}: within the gate on ${e.source.data.length} ThermoML article(s)`, () => {
    const set = kij.pairs.find(p => p.model === e.model && p.i === e.i && p.j === e.j);
    const { aad, missing } = aadP([e.i, e.j], e.model, set.kij, points(set.source.data));
    assert.equal(missing, 0);
    assert.ok(aad <= hp.gate.P_pct * SLACK, `AAD ${aad.toFixed(2)} % in P`);
  });
}

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
      const s = system({ components: p.pair, model: p.model, kij: [[0, p.kij], [p.kij, 0]] });
      const P = s.bubbleP([p.x_1, 1 - p.x_1], p.T_K).P;
      assert.ok(Math.abs(P / p.P_reference_kPa - 1) < 0.005, `${p.model} ${p.pair.join("-")} T = ${p.T_K}: ${P.toFixed(2)} vs ${p.P_reference_kPa} kPa`);
    }
  }
});
