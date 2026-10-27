// Normal boiling points from a vapour-pressure curve extended beyond the measured values (the maintainer, 2026-10-25;
// docs/DATA_RULES.md section 3). The curve is extended to 101.325 kPa only from a last measured value at 50 kPa or
// more; validation/python/tb_extrapolation_check.py measured the error of such an extension on CoolProp's reference
// curves (validation/data/pure/tb_extrapolation_check.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pure } from "../src/index.js";

const C = JSON.parse(readFileSync(new URL("../src/data/components.json", import.meta.url))).components;
const check = JSON.parse(readFileSync(new URL("../validation/data/pure/tb_extrapolation_check.json", import.meta.url)));
const row = (kPa, scatter) => check.summary.find(r => r.last_kPa === kPa && r.scatter === scatter);

test("the check behind the rule: from 50 kPa or more the extended boiling point is within 2.6 K, below 20 kPa it is not", () => {
  for (const s of [0.005, 0.01]) {
    for (const kPa of [95, 80, 50]) assert.ok(row(kPa, s).error95_K_worst_fluid <= 2.6, `${kPa} kPa, ${s}`);
    for (const kPa of [20, 7, 3]) assert.ok(row(kPa, s).error95_K_worst_fluid > 4, `${kPa} kPa, ${s}`);
    // the error grows as the last measured value moves away from 101.325 kPa
    const med = check.summary.filter(r => r.scatter === s).map(r => r.error95_K_median_fluid);
    for (let i = 1; i < med.length; i++) assert.ok(med[i] >= med[i - 1], `median error not growing at ${s}`);
  }
});

test("an extended curve starts from 50 kPa or more, reaches 101.325 kPa at Tb, and states the check's error", () => {
  const ext = Object.entries(C).filter(([, c]) => c.vapourPressure?.extended_to_Tb);
  assert.deepEqual(ext.map(([id]) => id).sort(), ["2-3-butanediol", "limonene"]);
  for (const [id, c] of ext) {
    const e = c.vapourPressure.extended_to_Tb;
    assert.ok(e.from_kPa >= 50, id);
    assert.ok(c.vapourPressure.Tmax_K >= c.Tb_K && c.vapourPressure.Tmax_K - c.Tb_K < 0.01, id);
    assert.ok(Math.abs(pure(id).tsat(101.325) - c.Tb_K) < 1e-3, id);
    assert.ok(c.Tb_K - e.from_K < 2, `${id}: extended by ${c.Tb_K - e.from_K} K`);
    assert.ok(Math.abs(pure(id).psat(c.Tb_K) - 101.325) < 1e-3, id);
    const r = check.summary.filter(x => x.scatter === 0.01 && x.last_kPa <= e.from_kPa)
      .sort((a, b) => b.last_kPa - a.last_kPa)[0];
    assert.equal(e.error_K, r.error95_K_worst_fluid, id);
    assert.match(c.vapourPressure.source, /Extended by [\d.]+ K beyond the last measured value/, id);
  }
});

test("a curve whose measured values stop below 50 kPa is not extended, and its note says how far it would have to go", () => {
  for (const id of ["solketal", "glycerol-carbonate", "levoglucosenone"]) {
    const c = C[id];
    assert.equal(c.Tb_K, null, id);
    assert.ok(pure(id).psat(c.vapourPressure.Tmax_K) < 50, id);
    assert.match(c.Tb_note, /not extended from below 50 kPa.*an indication only/, id);
  }
});
