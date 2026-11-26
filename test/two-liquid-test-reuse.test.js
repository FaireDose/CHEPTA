// Cheaper second-liquid tests on the column's stages (proposal 0028, item 2; docs/decisions/2026-11-26-01-column-specs-
// in-mesh.md): src/units/columns/two-liquids.js keeps a second memo slot per stage for the base point of a Jacobian, and
// reuses a clearly stable verdict (every nontrivial stationary point of the tangent-plane test at tm >= TM_MARGIN) at
// the perturbed points next to the stage's last full test; src/units/columns/engine.js repeats the full test on every
// stage at the answer, the reuse off. The answer is the same as with a full test at every point.
//
// Water + ethanol + cyclohexane with NRTL and the default sets (docs/METHOD_SELECTION.md rules 3 and 7, as F4, F6, F9).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system } from "../src/index.js";
import { cascadeThermo, solveCascade } from "../src/units/columns/engine.js";
import { twoLiquidThermo, TM_MARGIN, REUSE_LN_X } from "../src/units/columns/two-liquids.js";
import { liquidTangentPlane } from "../src/equilibrium/stability.js";

const sys = system({ components: ["water", "ethanol", "cyclohexane"], model: "NRTL" });

test("the tangent-plane test reports the margin of its verdict (tmMin); a clearly stable liquid is reused only next to its test", () => {
  const x = [0.1, 0.85, 0.05], T = 350;
  const st = liquidTangentPlane(sys, x, T);
  assert.equal(st.stable, true);
  assert.ok(st.tmMin === Infinity || st.tmMin >= TM_MARGIN, `tmMin ${st.tmMin}`);
  const split = liquidTangentPlane(sys, [0.3, 0.2, 0.5], 330);
  assert.equal(split.stable, false);
  assert.ok(split.tmMin <= split.tm, "tmMin is the smallest tm found");
  const th = twoLiquidThermo(cascadeThermo(sys, 101.325), sys);
  assert.equal(th.split(x, T, 3), null);
  assert.deepEqual(th.reuseCounts(), { reused: 0, tests: 1 });
  // a perturbed point of the stage's Jacobian: the verdict reused
  const xp = [x[0] * (1 + 1e-5), x[1], x[2]].map((v, i, a) => v / a.reduce((s, w) => s + w, 0));
  assert.equal(th.split(xp, T + 1e-4, 3), null);
  assert.deepEqual(th.reuseCounts(), { reused: 1, tests: 1 });
  // the base point again: from its memo, no test
  assert.equal(th.split(x, T, 3), null);
  assert.deepEqual(th.reuseCounts(), { reused: 1, tests: 1 });
  // another stage, or a point farther than REUSE_LN_X: a full test
  th.split(xp, T, 4);
  th.split([x[0] * (1 + 10 * REUSE_LN_X), x[1], x[2]], T, 3);
  assert.deepEqual(th.reuseCounts(), { reused: 1, tests: 3 });
  // the reuse off (as at a column's answer): every call a full test
  th.setReuse(false);
  th.split(xp, T + 1e-4, 3);
  assert.deepEqual(th.reuseCounts(), { reused: 1, tests: 4 });
  // a liquid that splits is never reused: the next point is split in full
  const th2 = twoLiquidThermo(cascadeThermo(sys, 101.325), sys);
  const z = [0.3, 0.2, 0.5];
  assert.ok(th2.split(z, 330, 1)?.beta > 0);
  assert.ok(th2.split([z[0] * (1 + 1e-6), z[1], z[2]], 330, 1)?.beta > 0);
  assert.equal(th2.reuseCounts().reused, 0);
});

test("F9's column (20 stages, two liquids on some of them): the same answer with the verdicts reused and with a full test at every point", () => {
  const id = "F9-ethanol-dehydration-bottoms-purity-20-stages";
  const c = JSON.parse(readFileSync(new URL(`../validation/data/columns/vll/${id}.json`, import.meta.url)));
  const H = JSON.parse(readFileSync(new URL("../validation/fixtures/columns-vll-purity.json", import.meta.url))).cases[id].three_phase.feed_enthalpy_J_mol[0];
  const f = c.column.feed, sys9 = system({ components: c.components, model: c.thermo.model, vapour: c.thermo.vapour });
  const inp = { sys: sys9, P_kPa: c.pressure_kPa, stages: c.column.stages, phases: "VLL", ends: { condenser: c.column.condenser },
    feeds: [{ stage: f.stage, flows: f.z.map(z => z * f.flow_mol_s), H_W: f.flow_mol_s * H }], specs: c.specs.map(q => ({ ...q })) };
  const a = solveCascade(inp), b = solveCascade({ ...inp, stableReuse: false });
  assert.ok(a.converged && b.converged);
  a.stages.forEach((s, j) => {
    assert.ok(Math.abs(s.T_K - b.stages[j].T_K) <= 1e-9, `stage ${j + 1}`);
    s.l.forEach((v, i) => assert.ok(Math.abs(v - b.stages[j].l[i]) <= 1e-9 * Math.max(v, 1e-12), `stage ${j + 1} l ${i}`));
  });
});
