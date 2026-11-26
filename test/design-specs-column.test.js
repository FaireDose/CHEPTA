// CHEPTA-Lab's request 16 (docs/decisions/2026-11-26-03-column-design-specs.md): a flowsheet's design specification
// (src/flowsheet/design-specs.js) varies a column's numbers: its distillate flow, reflux ratio, a side draw's flow. Each
// answer is checked against the column's own design specifications (src/units/columns/specifications.js), a different
// algorithm (Newton's method on the column's equations with the specification inside), and against a solve with the
// found value fixed. Methanol + water, NRTL with an ideal vapour at 101.325 kPa: polar liquids at low pressure
// (docs/METHOD_SELECTION.md rules 3 and 7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { system, solveFlowsheet, flowsheetStatus } from "../src/index.js";

const sys = system({ components: ["methanol", "water"], model: "NRTL" });
const plant = (column, designSpecs, extra = {}) => ({
  blocks: [
    { id: "F1", type: "feed", spec: { flow_kmol_h: { methanol: 50, water: 50 }, T_K: 340, P_kPa: 101.325 } },
    { id: "C1", type: "column", spec: { mode: "rigorous", stages: 12, feed_stage: 6, condenser: "total", P_kPa: 101.325, ...column } },
    { id: "D", type: "product" }, { id: "B", type: "product" }, ...(extra.blocks ?? []),
  ],
  streams: [{ id: "S1", from: "F1.out", to: "C1.in" }, { id: "S2", from: "C1.distillate", to: "D.in" }, { id: "S3", from: "C1.bottoms", to: "B.in" }, ...(extra.streams ?? [])],
  ...(designSpecs ? { designSpecs } : {}), ...(extra.solver ? { solver: extra.solver } : {}),
});
const bottoms2 = { stream: "S3", quantity: "mole_fraction", component: "methanol", value: 0.02 };
const distillateDS = { id: "DS1", vary: { block: "C1", key: "distillate_kmol_h", min: 40, max: 50 }, target: bottoms2 };
const xMeOH = s => s.flows[0] / s.F_kmol_h;

test("the distillate flow varied for 2 mol % methanol in the bottoms: the flow the column's own purity specification finds", () => {
  const r = solveFlowsheet(sys, plant({ reflux_ratio: 3, distillate_kmol_h: 45 }, [distillateDS]));
  const d = r.designSpecs[0];
  assert.equal(d.met, true);
  assert.ok(Math.abs(xMeOH(r.streams.S3) - 0.02) <= 1e-6);
  // the column's own specification: the same reflux ratio, 98 mol % water in the bottoms
  const own = solveFlowsheet(sys, plant({ reflux_ratio: 3, specifications: [{ kind: "purity", product: "bottoms", component: "water", value: 0.98 }] }));
  assert.ok(Math.abs(d.varied.value - own.streams.S2.F_kmol_h) <= 1e-4, `${d.varied.value} vs ${own.streams.S2.F_kmol_h}`);
  // the found value fixed: the same bottoms, and the column's specification in the answer holds it
  assert.equal(r.blocks.C1.spec.distillate_kmol_h, d.varied.value);
  const fixed = solveFlowsheet(sys, plant({ reflux_ratio: 3, distillate_kmol_h: d.varied.value }));
  assert.ok(Math.abs(xMeOH(fixed.streams.S3) - 0.02) <= 1e-6);
});

test("the same answer whether each solve restarts the column from its last answer or from its own start", () => {
  const warm = solveFlowsheet(sys, plant({ reflux_ratio: 3, distillate_kmol_h: 45 }, [distillateDS], { solver: { columnRestart: "previous" } }));
  const cold = solveFlowsheet(sys, plant({ reflux_ratio: 3, distillate_kmol_h: 45 }, [distillateDS], { solver: { columnRestart: "cold" } }));
  assert.ok(Math.abs(warm.designSpecs[0].varied.value - cold.designSpecs[0].varied.value) <= 1e-5);
});

test("a side draw's flow varied: the flow the column finds for the same purity with the draw's flow free", () => {
  const side = { blocks: [{ id: "SD", type: "product" }], streams: [{ id: "S4", from: "C1.side", to: "SD.in" }] };
  const r = solveFlowsheet(sys, plant({ reflux_ratio: 3, distillate_kmol_h: 40, side_draws: [{ stage: 4, phase: "liquid", flow_kmol_h: 5 }] },
    [{ id: "DS1", vary: { block: "C1", key: "side_draws", index: 0, min: 1, max: 15 }, target: bottoms2 }], side));
  assert.equal(r.designSpecs[0].met, true);
  const own = solveFlowsheet(sys, plant({ reflux_ratio: 3, distillate_kmol_h: 40, side_draws: [{ stage: 4, phase: "liquid" }],
    specifications: [{ kind: "purity", product: "bottoms", component: "water", value: 0.98 }] }, null, side));
  assert.ok(Math.abs(r.designSpecs[0].varied.value - own.streams.S4.F_kmol_h) <= 1e-4, `${r.designSpecs[0].varied.value} vs ${own.streams.S4.F_kmol_h}`);
  assert.equal(r.blocks.C1.spec.side_draws[0].flow_kmol_h, r.designSpecs[0].varied.value);
});

test("two specifications at once (Broyden): the distillate flow and the reflux ratio the column's two purities find", () => {
  const r = solveFlowsheet(sys, plant({ reflux_ratio: 2, distillate_kmol_h: 48 }, [
    { ...distillateDS, vary: { ...distillateDS.vary, max: 52 } },
    { id: "DS2", vary: { block: "C1", key: "reflux_ratio", min: 1, max: 6 }, target: { stream: "S2", quantity: "mole_fraction", component: "methanol", value: 0.98 } }]));
  assert.ok(r.designSpecs.every(d => d.met && d.method === "broyden"));
  const own = solveFlowsheet(sys, plant({ specifications: [{ kind: "purity", product: "bottoms", component: "water", value: 0.98 }, { kind: "purity", product: "distillate", component: "methanol", value: 0.98 }] }));
  assert.ok(Math.abs(r.designSpecs[0].varied.value - own.streams.S2.F_kmol_h) <= 1e-3, `${r.designSpecs[0].varied.value} vs ${own.streams.S2.F_kmol_h}`);
  assert.ok(Math.abs(r.designSpecs[1].varied.value - own.blocks.C1.state.adjusted.reflux_ratio) <= 1e-3, `${r.designSpecs[1].varied.value} vs ${own.blocks.C1.state.adjusted.reflux_ratio}`);
});

test("a target out of reach: said after the start, one step and the two bounds, with the nearest value", () => {
  // with 12 stages and a reflux ratio of 1.5 the distillate stays below 97.6 mol % methanol at every flow
  const e = (() => { try { solveFlowsheet(sys, plant({ reflux_ratio: 1.5, distillate_kmol_h: 48 }, [{ id: "DS1", vary: { block: "C1", key: "distillate_kmol_h", min: 40, max: 50 }, target: { stream: "S2", quantity: "mole_fraction", component: "methanol", value: 0.99 } }])); } catch (err) { return err; } })();
  assert.equal(e?.code, "NO_CONVERGENCE");
  assert.equal(e.details.reason, "unreachable");
  assert.match(e.message, /0\.99 is not reachable with the distillate flow of C1 between 40 and 50 kmol\/h \(the target stays below it at every value tried; the nearest it came is 0\.975\d*, at 50 kmol\/h\)/);
  assert.equal(e.details.solves, 4);
  assert.deepEqual(e.details.trail.map(t => t.x[0]), [48, 48.1, 50, 40]);
  assert.equal(e.details.nearest.x, 50);
});

test("a column's number that is not given, or that its mode does not use, is refused before anything is solved", () => {
  const refused = (column, vary) => flowsheetStatus(sys, plant(column, [{ id: "DS1", vary: { block: "C1", ...vary }, target: bottoms2 }]));
  const msg = st => [...(st.structure ?? []), ...(st.problems ?? [])].map(p => p.message).join(" ") || st.message;
  // boilup_ratio is not one of the column's two specifications here: varying it would make three
  let st = refused({ reflux_ratio: 3, distillate_kmol_h: 45 }, { key: "boilup_ratio", min: 1, max: 5 });
  assert.equal(st.ready, false);
  assert.match(msg(st), /Column C1 gives no boilup_ratio; a design specification varies a number the column's specification already gives \(here: reflux_ratio, distillate_kmol_h\)/);
  // the shortcut's reflux_over_minimum is kept but not used by the rigorous mode
  st = refused({ reflux_ratio: 3, distillate_kmol_h: 45, reflux_over_minimum: 1.3 }, { key: "reflux_over_minimum", min: 1.1, max: 2 });
  assert.match(msg(st), /"reflux_over_minimum" cannot be varied by a design specification \(Column: reflux_ratio, boilup_ratio, distillate_kmol_h/);
  // a side draw whose flow the column finds
  st = refused({ reflux_ratio: 3, side_draws: [{ stage: 4 }], specifications: [{ kind: "purity", product: "bottoms", component: "water", value: 0.98 }] }, { key: "side_draws", index: 0, min: 1, max: 10 });
  assert.match(msg(st), /side_draws\[0\] of Column C1 gives no flow_kmol_h/);
  st = refused({ reflux_ratio: 3, distillate_kmol_h: 45 }, { key: "distillate_kmol_h", min: 0, max: 50 });
  assert.match(msg(st), /vary\.min of Column C1's distillate_kmol_h must be above 0/);
});

test("the vapour + liquid condenser's own number may be varied; a share above 1 is refused", () => {
  const col = { condenser: "vapour_liquid", vapour_share: 0.3, reflux_ratio: 3, distillate_kmol_h: 45 };
  const vap = { blocks: [{ id: "V", type: "product" }], streams: [{ id: "S5", from: "C1.vapour_distillate", to: "V.in" }] };
  const st = max => flowsheetStatus(sys, plant(col, [{ id: "DS1", vary: { block: "C1", key: "vapour_share", min: 0.1, max }, target: bottoms2 }], vap));
  assert.equal(st(0.9).ready, true, st(0.9).message);
  assert.equal(st(1.2).ready, false);
  assert.match(st(1.2).message + JSON.stringify(st(1.2)), /vary\.max of Column C1's vapour_share cannot be above 1/);
});
