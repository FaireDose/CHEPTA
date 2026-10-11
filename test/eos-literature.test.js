// Peng-Robinson and SRK k_ij fitted to open literature beyond the NIST TRC ThermoML Archive:
// isothermal P-x(-y) tables (validation/fit_kij_literature.mjs) and isobaric T-x-y tables
// (validation/python/eos_fit_kij.py, Rodrigues et al. 2005), data in validation/data/eos/.
// Method (docs/METHOD_SELECTION.md): light gases and hydrocarbons with heavier hydrocarbons, at
// pressures up to 9 MPa, and hydrocarbon isomers at 1 atm: cubic equations of state.
// Like test/vle-batch.test.js this guards the fit quality against regressions, within the limits
// the fit had to meet to be kept; the independent check is the comparison with the Python
// equation of state (validation/python/eos_check_literature.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system } from "../src/index.js";
import kij from "../src/data/kij.json" with { type: "json" };

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const fits = load("validation/data/eos/literature_fits.json");
const check = load("validation/data/eos/literature_check.json");
const SLACK = 1.02;
const LIT = /^validation\/data\/eos\/(goni2024|gonzalez2017|bae1981|inomata1986|noda1975|nitta1976|sebastian1980|sokolov1977|rodrigues2005)_/;
const sets = kij.pairs.filter(p => p.tier === "fitted" && p.source.data?.some(f => LIT.test(f)));
const FILES = ["goni2024_ethane_n-decane", "goni2024_ethane_n-undecane", "goni2024_ethane_n-dodecane", "goni2024_propane_n-decane",
  "goni2024_propane_n-undecane", "goni2024_propane_n-dodecane", "gonzalez2017_argon_hydrogen-sulfide", "rodrigues2005_cyclohexane_n-heptane",
  "rodrigues2005_p-xylene_m-xylene", "rodrigues2005_p-xylene_o-xylene", "rodrigues2005_m-xylene_o-xylene", "bae1981_ethylene_propylene",
  "bae1981_ethylene_1-butene", "inomata1986_carbon-dioxide_n-decane", "noda1975_ammonia_benzene", "nitta1976_sulfur-dioxide_isooctane",
  "sebastian1980_hydrogen_n-decane", "sokolov1977_hydrogen_n-decane"];

test("every literature data file has a complete source block, and every excluded row a reason", () => {
  for (const f of FILES) {
    const d = load(`validation/data/eos/${f}.json`);
    for (const k of ["citation", "open_copy", "access", "tables", "transcription"]) assert.ok(d.source[k], `${f}: source.${k}`);
    assert.ok(["isothermal-pxy", "isobaric-txy"].includes(d.kind), f);
    for (const e of d.excluded ?? []) assert.ok(Number.isInteger(e.row) && e.row < d.rows.length && e.reason.length > 20, `${f}: excluded row ${e.row}`);
  }
});

test("the kept fits are in kij.json and the rejected ones are not", () => {
  for (const e of fits.entries) assert.ok(sets.some(p => p.model === e.model && p.i === e.i && p.j === e.j && p.kij === e.kij), `${e.model} ${e.i}-${e.j}`);
  for (const r of fits.rejected) {
    assert.ok(!kij.pairs.some(p => p.model === r.model && new Set([p.i, p.j]).has(r.pair[0]) && new Set([p.i, p.j]).has(r.pair[1])),
      `${r.model} ${r.pair.join("-")} was not kept and has no k_ij`);
  }
  assert.ok(sets.length >= fits.entries.length);
});

function rowsOf(file) {
  const d = load(file);
  const c = Object.fromEntries(d.columns.map((k, n) => [k, n]));
  const skip = new Set((d.excluded ?? []).map(e => e.row));
  return { d, c, rows: d.rows.filter((r, n) => !skip.has(n) && r[c.x_1] != null && r[c.x_1] > 0 && r[c.x_1] < 1) };
}

for (const set of sets) {
  test(`${set.model} ${set.i} + ${set.j}, k_ij = ${set.kij}: follows ${set.source.data.map(f => f.split("/").pop()).join(", ")}`, () => {
    const s = system({ components: [set.i, set.j], model: set.model });
    const files = set.source.data.map(f => rowsOf(f));
    if (files[0].d.kind === "isobaric-txy") {
      const { d, c, rows } = files[0];
      const dT = [], dy = [];
      for (const r of rows) {
        const b = s.bubbleT([r[c.x_1], 1 - r[c.x_1]], d.P_kPa);
        dT.push(Math.abs(b.T - r[c.T_K]));
        dy.push(Math.abs(b.y[0] - r[c.y_1]));
      }
      const mean = a => a.reduce((p, v) => p + v, 0) / a.length;
      assert.ok(mean(dT) <= 0.5 * SLACK, `AAD ${mean(dT).toFixed(3)} K`);
      assert.ok(mean(dy) <= 0.012 * SLACK, `AAD ${mean(dy).toFixed(4)} in y`);
    } else {
      const dev = files.flatMap(({ c, rows }) => rows.map(r => Math.abs(s.bubbleP([r[c.x_1], 1 - r[c.x_1]], r[c.T_K]).P / r[c.P_kPa] - 1) * 100));
      const aad = dev.reduce((a, v) => a + v, 0) / dev.length;
      assert.ok(aad <= fits.gate.P_pct * SLACK, `AAD ${aad.toFixed(2)} % in P`);
    }
  });
}

test("the engine's bubble pressures agree with the independent Python equation of state at the fitted k_ij", () => {
  assert.ok(check.points.length >= 4 * fits.entries.length);
  for (const p of check.points) {
    const s = system({ components: p.pair, model: p.model, kij: [[0, p.kij], [p.kij, 0]] });
    const P = s.bubbleP([p.x_1, 1 - p.x_1], p.T_K).P;
    assert.ok(Math.abs(P / p.P_reference_kPa - 1) < 0.005, `${p.model} ${p.pair.join("-")} T = ${p.T_K} x = ${p.x_1}: ${P.toFixed(2)} vs ${p.P_reference_kPa} kPa`);
  }
});
