// Proposal 0027 (CHEPTA-Lab's priority 1 for 0.6.3 and its request 18): the rigorous columns restarted from their last
// answer in the next recycle pass and design-specification solve ((a), solver.columnRestart), the timing of a run ((b))
// and its own time limit ((c), solver.timeLimit_s).
//
// Independent check: the same flowsheet solved with every column started cold ("cold", the path of 0.6.2) gives the
// same streams within the recycle's tolerance; a restart changes the path, never the equations or their tolerances.
// Method (docs/METHOD_SELECTION.md): NRTL with an ideal vapour for methanol + water at 101.325 kPa (polar liquids at
// low pressure).
import { test } from "node:test";
import assert from "node:assert/strict";
import { system, solveFlowsheet } from "../src/index.js";
import { run } from "../src/api/dispatcher.js";
import { progressText } from "../src/runtime/worker.js";

const sys = system({ components: ["methanol", "water"], model: "NRTL" });

/** F1 -> M1 -> C1 (rigorous column); its distillate split, 40 % back to M1 (the tear R). */
const loop = (column, solver = {}, extra = {}) => ({
  components: ["methanol", "water"], thermo: { model: "NRTL", vapour: "ideal" },
  blocks: [
    { id: "F1", type: "feed", spec: { flow_kmol_h: { methanol: 40, water: 60 }, T_K: 340, P_kPa: 101.325 } },
    { id: "M1", type: "mixer" },
    { id: "C1", type: "column", spec: { mode: "rigorous", stages: 10, feed_stage: 5, P_kPa: 101.325, condenser: "total", ...column } },
    { id: "S1", type: "splitter", spec: { fractions: [0.4, "rest"] } },
    { id: "P1", type: "product" }, { id: "P2", type: "product" },
  ],
  streams: [
    { id: "A", from: "F1.out", to: "M1.in" }, { id: "B", from: "M1.out", to: "C1.in" }, { id: "D", from: "C1.distillate", to: "S1.in" },
    { id: "R", from: "S1.out", to: "M1.in", tear: true }, { id: "D2", from: "S1.out", to: "P1.in" }, { id: "W", from: "C1.bottoms", to: "P2.in" },
  ],
  solver: { tolerance: 1e-9, ...solver },
  ...extra,
});

const largest = (a, b) => Math.max(...Object.keys(a.streams).map(id => {
  const s = a.streams[id], t = b.streams[id], F = Math.max(s.F_kmol_h, 1e-12);
  return Math.max(...s.flows.map((v, i) => Math.abs(v - t.flows[i]))) / F;
}));

test("0027 (a): a column in a recycle is restarted from its last answer; the same streams as from cold starts", () => {
  const spec = { reflux_ratio: 2, distillate_kmol_h: 45 };
  const warm = solveFlowsheet(sys, loop(spec));
  const cold = solveFlowsheet(sys, loop(spec, { columnRestart: "cold" }));
  assert.ok(warm.loops[0].iterations >= 3, "the loop takes several passes");
  assert.equal(warm.blocks.C1.state.solver.start, "previous solution");
  assert.notEqual(cold.blocks.C1.state.solver.start, "previous solution");
  assert.ok(largest(warm, cold) < 1e-6, `streams differ by ${largest(warm, cold)} of their flow`);
  // the restart is not part of the answer: nothing new among the block's keys
  assert.deepEqual(Object.keys(warm.blocks.C1).sort(), Object.keys(cold.blocks.C1).sort());
  assert.equal(JSON.stringify(warm).includes("restart"), false);
});

test("0027 (a): a column on a purity is restarted with the distillate found last; the same answer, fewer column solves", () => {
  const spec = { reflux_ratio: 2, bottoms_purity: { component: "water", value: 0.995 } };
  const warm = solveFlowsheet(sys, loop(spec));
  const cold = solveFlowsheet(sys, loop(spec, { columnRestart: "cold" }));
  assert.ok(largest(warm, cold) < 1e-6, `streams differ by ${largest(warm, cold)} of their flow`);
  const w = warm.blocks.C1.state.solver.specifications, c = cold.blocks.C1.state.solver.specifications;
  assert.match(w.tried[0], /from the last answer/);
  assert.ok(w.column_solves < c.column_solves, `restarted ${w.column_solves} column solves, cold ${c.column_solves}`);
  assert.ok(Math.abs(warm.blocks.C1.state.design_specifications[0].achieved - 0.995) < 1e-6);
});

test("0027 (b): the timing per block, loop pass and design-specification solve; not part of the answer", () => {
  const r = solveFlowsheet(sys, loop({ reflux_ratio: 2, distillate_kmol_h: 45 }));
  const t = r.timing;
  assert.ok(t && t.total_s >= 0);
  assert.equal(Object.keys(r).includes("timing"), false, "not enumerable");
  assert.equal(t.columnRestart, "previous");
  assert.equal(t.blocks.C1.calls, r.loops[0].iterations);
  assert.equal(t.loops[0].passes.length, r.loops[0].iterations);
  assert.ok(t.loops[0].passes.every(p => p.s >= 0 && p.slowest?.block));
  // a design specification: one entry per solve
  const ds = solveFlowsheet(sys, loop({ reflux_ratio: 2, distillate_kmol_h: 45 }, {}, {
    designSpecs: [{ id: "DS1", vary: { block: "F1", key: "flow_kmol_h", component: "methanol", min: 30, max: 50, guess: 40 },
      target: { stream: "W", quantity: "component_flow_kmol_h", component: "methanol", value: 18 }, tolerance: 1e-6 }] }));
  const ev = ds.timing.designSpecs.evaluations;
  assert.equal(ev.length, ds.designSpecs[0].solves);
  assert.ok(ev.every(e => e.outcome === "solved" && e.s >= 0 && Number.isFinite(e.at.DS1) && e.passes.length === 1));
  // the request path: in run.timing, outside the value and the reproduction
  const req = run({ capability: "solve_flowsheet", input: { flowsheet: loop({ reflux_ratio: 2, distillate_kmol_h: 45 }) } });
  assert.equal(req.outcome, "ok", req.error?.message);
  assert.ok(req.run.timing.blocks.C1.calls >= 3);
  const saved = JSON.parse(JSON.stringify(req));
  assert.equal(saved.value.timing, undefined, "not in the value as passed on");
  assert.equal(saved.reproduction.timing, undefined);
  assert.ok(saved.run.timing.loops[0].passes.length >= 3);
});

test("0027 (a): with a design specification the columns' answers carry over from solve to solve; the same answer cold", () => {
  const fs = solver => loop({ reflux_ratio: 2, distillate_kmol_h: 45 }, solver, {
    designSpecs: [{ id: "DS1", vary: { block: "F1", key: "flow_kmol_h", component: "methanol", min: 30, max: 50, guess: 40 },
      target: { stream: "W", quantity: "component_flow_kmol_h", component: "methanol", value: 18 }, tolerance: 1e-6 }] });
  const warm = solveFlowsheet(sys, fs({})), cold = solveFlowsheet(sys, fs({ columnRestart: "cold" }));
  assert.ok(Math.abs(warm.designSpecs[0].varied.value - cold.designSpecs[0].varied.value) < 1e-6);
  assert.ok(warm.designSpecs[0].met && cold.designSpecs[0].met);
  // the first pass of every solve after the first starts the column from the solve before
  assert.equal(warm.blocks.C1.state.solver.start, "previous solution");
});

test("0027 (c): solver.timeLimit_s stops with OUT_OF_TIME, naming the design specification's solve, its value and the best point", () => {
  const fs = loop({ reflux_ratio: 2, bottoms_purity: { component: "water", value: 0.995 } }, { timeLimit_s: 0.3 }, {
    designSpecs: [{ id: "DS1", vary: { block: "F1", key: "flow_kmol_h", component: "methanol", min: 30, max: 50, guess: 40 },
      target: { stream: "D2", quantity: "flow_kmol_h", value: 20 }, tolerance: 1e-9 }] });
  let err = null;
  try { solveFlowsheet(sys, fs); } catch (e) { err = e; }
  assert.ok(err, "stopped");
  assert.equal(err.code, "OUT_OF_TIME", err.message);
  assert.match(err.message, /The time limit of 0\.3 s \(solver\.timeLimit_s\) passed/);
  assert.match(err.message, /Design specification DS1: in solve \d+/);
  assert.match(err.message, /The time went to C1 /);
  assert.ok(Number.isFinite(err.details.at.DS1));
  assert.ok(err.details.timing.blocks.C1.calls >= 1);
  if (err.details.solve > 1) assert.ok(err.details.best && Number.isFinite(err.details.best.at.DS1), "the best point so far");
  // the request path: outcome out_of_time, the timing in the run record, no value
  const req = run({ capability: "solve_flowsheet", input: { flowsheet: fs } });
  assert.equal(req.outcome, "out_of_time");
  assert.equal(req.error.code, "OUT_OF_TIME");
  assert.equal(req.value, undefined);
  assert.ok(req.run.timing.total_s > 0);
});

test("0027 (c): a time limit inside a recycle loop names the block and the loop's iteration", () => {
  let err = null;
  try { solveFlowsheet(sys, loop({ reflux_ratio: 2, bottoms_purity: { component: "water", value: 0.995 } }, { timeLimit_s: 0.05, columnRestart: "cold" })); } catch (e) { err = e; }
  assert.ok(err);
  assert.equal(err.code, "OUT_OF_TIME", err.message);
  assert.match(err.message, /It was calculating \w+/);
  assert.ok(err.details.where.block);
});

test("0027: solver.columnRestart and solver.timeLimit_s are checked", () => {
  for (const solver of [{ columnRestart: "warm" }, { timeLimit_s: 0 }, { timeLimit_s: "60" }]) {
    let err = null;
    try { solveFlowsheet(sys, loop({ reflux_ratio: 2, distillate_kmol_h: 45 }, solver)); } catch (e) { err = e; }
    assert.equal(err?.code, "BAD_INPUT", JSON.stringify(solver));
  }
});

test("0027 (c), request 18: the worker's own time limit names the design specification's solve from the progress reports", () => {
  const text = progressText({ kind: "flowsheet", designSpec: { ids: ["DS1"], solve: 3, at: "the flow of Ethanol in F1 = 6505 kg/h", bracket: [6503.5, 6507.5],
    best: { at: { DS1: 6506 }, reached: { DS1: 0.00041 }, asked: { DS1: 0.0004 } } },
  loops: [{ blocks: ["A", "B"], tears: ["S1"], iterations: 4, residual: 1e-3, tolerance: 1e-5, converged: false, maxIterations: 200, recent: [1e-2, 1e-3] }] });
  assert.match(text, /design specification DS1 was in solve 3, at the flow of Ethanol in F1 = 6505 kg\/h/);
  assert.match(text, /bracketed between 6503\.5 and 6507\.5/);
  assert.match(text, /the best so far at DS1 6506, reaching 0\.00041 \(asked 0\.0004\)/);
  assert.match(text, /In that solve, the loop through A, B/);
});
