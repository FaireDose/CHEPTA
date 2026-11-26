// Proposal 0028, items 3 and 4 (docs/decisions/2026-11-26-01-column-specs-in-mesh.md): the design specification's search
// (src/flowsheet/design-specs.js) takes one secant step after its first two solves, and starts every solve from the
// nearest one solved; the tolerance warning for a fraction is relative to the target's value. The separator loop of
// test/design-specs.test.js (methanol + water, NRTL with an ideal vapour: polar liquids at low pressure,
// docs/METHOD_SELECTION.md rules 3 and 7; its balances do not depend on the method).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, solveFlowsheet, flowsheetStatus } from "../src/index.js";

const ref = JSON.parse(readFileSync(new URL("../validation/fixtures/design_specs.json", import.meta.url), "utf8"));
const sys = system({ components: ["methanol", "water"], model: "NRTL" });
const loop = (designSpecs, solver) => ({
  blocks: [
    { id: "F1", type: "feed", spec: { flow_kmol_h: { methanol: ref.feed_kmol_h[0], water: ref.feed_kmol_h[1] }, T_K: 320, P_kPa: 101.325 } },
    { id: "F2", type: "feed", spec: { flow_kmol_h: { water: 5 }, T_K: 320, P_kPa: 101.325 } },
    { id: "M1", type: "mixer" },
    { id: "X1", type: "separator", spec: { fractions: { methanol: [ref.top_shares[0], "rest"], water: [ref.top_shares[1], "rest"] } } },
    { id: "SP1", type: "splitter", spec: { fractions: [0.1, "rest"] } },
    { id: "TOP", type: "product" }, { id: "PURGE", type: "product" },
  ],
  streams: [
    { id: "S1", from: "F1.out", to: "M1.in" }, { id: "S0", from: "F2.out", to: "M1.in" }, { id: "S2", from: "M1.out", to: "X1.in" },
    { id: "S3", from: "X1.out", to: "TOP.in" }, { id: "S4", from: "X1.out", to: "SP1.in" },
    { id: "S5", from: "SP1.out", to: "PURGE.in" }, { id: "S6", from: "SP1.out", to: "M1.in" },
  ],
  designSpecs, ...(solver ? { solver } : {}),
});
const ds = extra => ({ id: "DS1", vary: { block: "F2", key: "flow_kmol_h", component: "water", min: 0, max: 500 }, target: { stream: "S6", quantity: "flow_kmol_h", value: 300 }, ...extra });

test("item 3: on the linear loop the secant step brackets the target at once: four solves, the third the secant step", () => {
  const r = solveFlowsheet(sys, loop([ds()]));
  const d = r.designSpecs[0];
  assert.equal(d.met, true);
  assert.ok(Math.abs(r.streams.S6.F_kmol_h - 300) <= 300 * 1e-6);
  const ev = r.timing.designSpecs.evaluations;
  assert.equal(ev[2].step, "bracketing (secant)");
  // the guess, 1 % of the range, the secant step aimed a tenth beyond the root, then Brent inside that bracket
  assert.ok(d.solves <= 4, `solves: ${d.solves}`);
  assert.deepEqual(d.bracket.map(v => +v.toFixed(6)).length, 2);
});

test("item 3: the same answer as the bracketing by doubling steps would give (scipy's brentq in the fixture)", () => {
  const r = solveFlowsheet(sys, loop([ds()]));
  assert.ok(Math.abs(r.designSpecs[0].varied.value - ref.one.makeup_water_kmol_h) <= 1e-6, `${r.designSpecs[0].varied.value} vs ${ref.one.makeup_water_kmol_h}`);
});
