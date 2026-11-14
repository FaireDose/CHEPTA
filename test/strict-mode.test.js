// The strict range mode and its companions (decision 2026-11-14-06), on CHEPTA-Lab's inputs from chepta 0.6.2
// (FaireDose/CHEPTA-Lab, cases/ethyl-acetate-piotrowski-2021/README.md, "Capability requests to CHEPTA from 0.6.2"):
//   EA-10  strictRanges: true refused nothing: the answer's extrapolations were gathered afterwards, in the lenient
//          mode, and the strict mode kept the margins of before 2026-11-13 (a vapour-pressure equation used beyond its
//          record, a heat capacity continued 10 K, a pair set used 10 K outside its data). It now refuses an answer
//          that would carry an extrapolation, through options.strictRanges and solver.strictRanges alike;
//   EA-11  thermo.missingPairs is accepted in a flowsheet;
//   EA-14  a run stopped by its time limit says where its recycle loops were;
//   B2     solve_column (and the other single-block requests) keep the flowsheet's extrapolations;
//   and the Settings switch of the workbench (the maintainer, 2026-11-13), DOM-free as in test/app-next.test.js.
// Methods: Lab's own (UNIQUAC with an ideal-gas vapour for ethanol + water + ethyl acetate + acetic acid at 100 kPa;
// Peng-Robinson for the methanol separator at 5 MPa; Peng-Robinson for benzene + toluene, B2), as in docs/METHOD_SELECTION.md;
// the missing-pair checks use NRTL with benzene + glycerol, which has no stored set (on purpose: the code path).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { run } from "../src/api/dispatcher.js";
import { superviseRun, progressText } from "../src/runtime/worker.js";
import { setProgressSink } from "../src/util/progress.js";
import { normalizeFlowsheet } from "../src/flowsheet/document.js";
import { RANGE_MODES, RANGE_MODE_QUESTION, rangeModeOf, withRangeMode, rangeModePatch, rangeModeNote } from "../src/ui/flowsheet-logic.js";
import { initialState, applyPatch } from "../src/ui/app-logic.js";
import { projectOf, stateFromProject } from "../src/ui/project.js";

const clone = o => JSON.parse(JSON.stringify(o));

// Lab: results-chepta-0.6.1/u-htxr2-15C.request.json (the feed F3 at 15 degC, below the records of acetic acid)
const HTXR2 = { capability: "solve_flowsheet", input: { flowsheet: {
  components: ["ethanol", "water", "ethyl acetate", "acetic acid"], thermo: { model: "UNIQUAC", vapour: "ideal" },
  blocks: [{ id: "HTXR2", type: "heater", spec: { T_K: 343.15, P_kPa: 100.0 } },
    { id: "F3", type: "feed", spec: { flow_kg_h: { ethanol: 6511.611800000001, "acetic acid": 8471.3882 }, P_kPa: 100.0, T_K: 288.15 } },
    { id: "P4", type: "product" }],
  streams: [{ id: "S3", from: "F3.out", to: "HTXR2.in" }, { id: "S4", from: "HTXR2.out", to: "P4.in" }],
  solver: { maxIterations: 200 } } } };

// Lab PR #21: cases/methanol-separator-flash/results-chepta-0.6.2-kij0-strict/pr-kij-strict.request.json
const METHANOL = { capability: "solve_flowsheet", input: { flowsheet: {
  components: ["carbon-dioxide", "hydrogen", "carbon-monoxide", "methanol", "water"], thermo: { model: "PR" },
  blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { "carbon-dioxide": 20.0, hydrogen: 50.0, "carbon-monoxide": 5.0, methanol: 15.0, water: 10.0 }, T_K: 313, P_kPa: 5000 } },
    { id: "V1", type: "flash", spec: { T_K: 313, P_kPa: 5000 } }, { id: "P1", type: "product" }, { id: "P2", type: "product" }],
  streams: [{ id: "S1", from: "F1.out", to: "V1.in" }, { id: "S2", from: "V1.vapour", to: "P1.in" }, { id: "S3", from: "V1.liquid", to: "P2.in" }] } } };

// Lab: cases/benzene-toluene-chemsep-b2/results-chepta-0.6.2/b2-record-thermo-literal.request.json
const B2 = { capability: "solve_column", input: { components: ["benzene", "toluene"], thermo: { model: "PR", sets: "default" },
  feed: { flow_kmol_h: { benzene: 21.14478, toluene: 21.14478 }, P_kPa: 111.4575, VF: 0 },
  column: { mode: "rigorous", stages: 10, feed_stage: 5, condenser: "total", P_kPa: 111.4575, reflux_ratio: 2.0, bottoms_kmol_h: 21.1464 } } };

test("EA-10: lenient by default, the answer lists the records used outside their range and says so", () => {
  const r = run(HTXR2);
  assert.equal(r.outcome, "ok");
  assert.equal(r.value.rangeMode, "lenient");
  const kinds = r.value.extrapolations.map(e => `${e.component}|${e.kind}`).sort();
  assert.ok(kinds.includes("Acetic acid|vapourPressure") && kinds.includes("Acetic acid|liquidHeatCapacity"), kinds.join(", "));
  assert.ok(r.value.extrapolations.every(e => e.where.includes("F3")));
  // ethyl acetate is not in this flowsheet's streams (no flow): its records are not used, so not listed (before
  // 2026-11-14 its vapour pressure and ideal-gas heat capacity were)
  assert.ok(!kinds.some(k => k.startsWith("Ethyl acetate|")), kinds.join(", "));
});

test("EA-10: the strict mode refuses Lab's 15 degC feed, through the request's options and the flowsheet's solver", () => {
  const viaOptions = run({ ...clone(HTXR2), options: { strictRanges: true } });
  const viaSolver = clone(HTXR2);
  viaSolver.input.flowsheet.solver.strictRanges = true;
  for (const r of [viaOptions, run(viaSolver)]) {
    assert.equal(r.outcome, "invalid_input");
    assert.equal(r.error.code, "OUT_OF_RANGE");
    assert.equal(r.value, undefined);
    assert.match(r.error.message, /^The strict range mode \(strictRanges\) refuses this answer: it uses 4 records outside their ranges\./);
    assert.match(r.error.message, /Acetic acid: vapour pressure at 288\.15 K is 1\.85 K below its range/);
    assert.match(r.error.message, /Ethanol \+ Acetic acid: UNIQUAC set at 288\.15 K is 10 K below its range/);
    assert.equal(r.error.details.strictRanges, true);
    assert.equal(r.error.details.extrapolations.length, 4);
    assert.deepEqual(r.error.where.map(w => w.block), ["F3"]);
  }
  // inside every range, the strict mode solves, and says it did
  const warm = clone(HTXR2);
  warm.input.flowsheet.blocks[1].spec.T_K = 300;
  const ok = run({ ...warm, options: { strictRanges: true } });
  assert.equal(ok.outcome, "ok", ok.error?.message);
  assert.equal(ok.value.rangeMode, "strict");
  assert.deepEqual(ok.value.extrapolations, []);
});

test("EA-10: the methanol separator (Lab PR #21) is refused in the strict mode for the H2 + CO k_ij used at 313 K", () => {
  const lenient = run(METHANOL);
  assert.equal(lenient.outcome, "ok");
  assert.ok(lenient.value.extrapolations.some(e => e.kind === "pairSet" && e.component === "Hydrogen + Carbon monoxide"));
  const strict = run({ ...clone(METHANOL), options: { strictRanges: true } });
  assert.equal(strict.outcome, "invalid_input");
  assert.equal(strict.error.code, "OUT_OF_RANGE");
  assert.match(strict.error.message, /Hydrogen \+ Carbon monoxide: PR k_ij set at 313 K is 224\.8 K above its range \(68\.2-88\.2 K\)/);
});

const MISSING = { components: ["benzene", "glycerol"], thermo: { model: "NRTL", vapour: "ideal" },
  blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { benzene: 50, glycerol: 50 }, T_K: 310, P_kPa: 101.325 } }, { id: "P1", type: "product" }],
  streams: [{ id: "S1", from: "F1.out", to: "P1.in" }] };
const withPairs = (m, extra = {}) => ({ capability: "solve_flowsheet", input: { flowsheet: { ...clone(MISSING), thermo: { ...MISSING.thermo, ...(m ? { missingPairs: m } : {}) }, ...extra } } });

test("EA-11: thermo.missingPairs in a flowsheet: estimate, ideal or refuse, in either range mode", () => {
  // the default: estimated in the lenient mode, refused in the strict one
  const est = run(withPairs(null));
  assert.equal(est.outcome, "ok");
  assert.equal(est.qualifications.estimated_pairs[0].ideal, false);
  assert.equal(run({ ...withPairs(null), options: { strictRanges: true } }).outcome, "missing_data");
  // asked for: the flowsheet's choice holds in both modes
  const refuse = run(withPairs("refuse"));
  assert.equal(refuse.outcome, "missing_data");
  assert.match(refuse.error.message, /No NRTL parameters for: Benzene \+ Glycerol\./);
  const ideal = run(withPairs("ideal"));
  assert.equal(ideal.outcome, "ok");
  assert.deepEqual(ideal.qualifications.missing_pairs, [["Benzene", "Glycerol"]]);
  assert.equal(ideal.qualifications.estimated_pairs, undefined);
  const strictEstimate = run({ ...withPairs("estimate"), options: { strictRanges: true } });
  assert.equal(strictEstimate.outcome, "ok", strictEstimate.error?.message);
  assert.equal(strictEstimate.value.rangeMode, "strict");
  assert.equal(strictEstimate.qualifications.estimated_pairs.length, 1, "the estimate asked for is not refused again");
  // kept by the document, refused when it is not one of the three
  assert.equal(normalizeFlowsheet(withPairs("ideal").input.flowsheet).thermo.missingPairs, "ideal");
  const bad = run(withPairs("guess"));
  assert.equal(bad.outcome, "invalid_input");
  assert.deepEqual(bad.error.where, [{ field: "flowsheet.thermo.missingPairs" }]);
  assert.match(bad.error.message, /flowsheet\.thermo\.missingPairs "guess" is not one of "estimate", "ideal", "refuse"/);
  // the status request reads it as the solve does
  const st = run({ capability: "flowsheet_status", input: { flowsheet: withPairs("ideal").input.flowsheet } });
  assert.equal(st.outcome, "ok", st.error?.message);
  assert.equal(run({ capability: "flowsheet_status", input: { flowsheet: withPairs("refuse").input.flowsheet } }).outcome, "missing_data");
});

test("B2: solve_column keeps the flowsheet's extrapolations and range mode (they were dropped)", () => {
  const col = run(B2);
  assert.equal(col.outcome, "ok");
  assert.equal(col.value.rangeMode, "lenient");
  const fs = run({ capability: "solve_flowsheet", input: { flowsheet: { components: B2.input.components, thermo: B2.input.thermo,
    blocks: [{ id: "F1", type: "feed", spec: B2.input.feed }, { id: "C1", type: "column", spec: B2.input.column }, { id: "P1", type: "product" }, { id: "P2", type: "product" }],
    streams: [{ id: "FEED", from: "F1.out", to: "C1.in" }, { id: "DISTILLATE", from: "C1.distillate", to: "P1.in" }, { id: "BOTTOMS", from: "C1.bottoms", to: "P2.in" }] } } });
  assert.deepEqual(col.value.extrapolations, fs.value.extrapolations);
  assert.ok(col.value.extrapolations.some(e => e.kind === "pairSet" && e.where.includes("C1")), JSON.stringify(col.value.extrapolations.map(e => e.short)));
  // and the strict mode refuses it, naming the column
  const strict = run({ ...clone(B2), options: { strictRanges: true } });
  assert.equal(strict.outcome, "invalid_input");
  assert.ok(strict.error.where.some(w => w.block === "C1"));
});

const RECYCLE = JSON.parse(readFileSync(new URL("../examples/flowsheet-recycle.chepta.json", import.meta.url), "utf8"));

test("EA-14: the recycle loops report their progress while they iterate", () => {
  const got = [];
  const before = setProgressSink(p => got.push(clone(p)));
  try { assert.equal(run({ capability: "solve_flowsheet", input: { project: RECYCLE } }).outcome, "ok"); } finally { setProgressSink(before); }
  assert.ok(got.length >= 2);
  const last = got.at(-1).loops.at(-1);
  assert.deepEqual(last.tears, ["S2"]);
  assert.deepEqual(last.blocks, ["V1", "SP1", "M1"]);
  assert.equal(got.at(-1).kind, "flowsheet");
  assert.deepEqual(got.map(p => p.loops.at(-1).iterations), got.map((_, k) => k + 1));
  assert.match(progressText(got[1]), /^When it was stopped, the loop through V1, SP1, M1 \(tear stream S2\) was at iteration 2 of 50, the tear stream changing by \S+ per iteration \(tolerance 1\.00e-8; the last 2: /);
});

test("EA-14: an out-of-time result carries the last progress report, in its details and in words", async () => {
  const report = { kind: "flowsheet", loops: [
    { blocks: ["R1", "D1"], tears: ["S5"], iterations: 9, residual: 1e-10, tolerance: 1e-8, converged: true },
    { blocks: ["C1", "M2"], tears: ["S7", "S8"], iterations: 41, residual: 1.5e-3, tolerance: 1e-8, converged: false, maxIterations: 200, recent: [1.6e-3, 1.5e-3] }] };
  const h = superviseRun({ capability: "solve_flowsheet", input: {}, limits: { time_ms: 300 } }, (onResult, onFailure, onProgress) => {
    const w = new Worker(`const { parentPort } = require("node:worker_threads");
      parentPort.on("message", () => { parentPort.postMessage({ chepta_progress: 1, progress: ${JSON.stringify(report)} }); const t = Date.now(); for (;;) { if (Date.now() - t > 1e7) break; } });`, { eval: true });
    w.on("message", m => (m?.chepta_progress === 1 ? onProgress(m.progress) : onResult(m)));
    w.on("error", onFailure);
    return { post: m => w.postMessage(m), terminate: () => w.terminate() };
  });
  const r = await h.result;
  assert.equal(r.outcome, "out_of_time");
  assert.deepEqual(r.error.details.progress, report);
  assert.match(r.error.message, /did not finish within limits\.time_ms = 300 ms/);
  assert.match(r.error.message, /the loop through R1, D1 \(tear stream S5\) had converged in 9 iterations \(residual 1\.00e-10\)/);
  assert.match(r.error.message, /the loop through C1, M2 \(tear streams S7, S8\) was at iteration 41 of 200, the tear streams changing by 1\.50e-3 per iteration/);
});

test("the Settings switch: one question, two answers, stored as the project's solver.strictRanges", () => {
  assert.equal(RANGE_MODE_QUESTION, "Outside a record's range or a missing pair");
  assert.deepEqual(RANGE_MODES.map(m => [m.id, m.label]), [["lenient", "Continue with a warning"], ["strict", "Refuse"]]);
  for (const m of RANGE_MODES) assert.ok(m.hint.length > 40);
  const fs = clone(RECYCLE.flowsheet);
  assert.equal(rangeModeOf(fs), "lenient");
  const strict = withRangeMode(fs, "strict");
  assert.equal(strict.solver.strictRanges, true);
  assert.equal(rangeModeOf(strict), "strict");
  // back to the default: the key is taken out, the other solver settings kept
  const back = withRangeMode({ ...strict, solver: { ...strict.solver, maxIterations: 80 } }, "lenient");
  assert.deepEqual(back.solver, { ...(fs.solver ?? {}), maxIterations: 80 });
  assert.equal(withRangeMode({ components: [] }, "lenient").solver, undefined);
  assert.throws(() => withRangeMode(fs, "maybe"), /not "lenient" or "strict"/);
  // the workbench: the patch reaches every flowsheet document with components, and the project file keeps it
  let state = initialState({ flowsheet: RECYCLE.flowsheet });
  state = applyPatch(state, rangeModePatch(state, "strict"));
  assert.equal(state.flowsheet.solver.strictRanges, true);
  const saved = projectOf(state, { version: "test" });
  assert.equal(saved.flowsheet.solver.strictRanges, true);
  assert.equal(rangeModeOf(stateFromProject(JSON.stringify(saved)).flowsheet), "strict");
  assert.equal(rangeModeOf(applyPatch(state, rangeModePatch(state, "lenient")).flowsheet), "lenient");
});

test("each result view says which mode it ran in: the result's own mode, else the one asked for", () => {
  assert.match(rangeModeNote({ rangeMode: "strict" }, {}), /^Calculated: strict\. Outside a record's range or for a missing pair, CHEPTA refuses/);
  assert.match(rangeModeNote({ rangeMode: "lenient" }, { solver: { strictRanges: true } }), /^Calculated: continue with a warning\./);
  assert.match(rangeModeNote(null, { solver: { strictRanges: true } }), /^Range mode: strict\./);
  assert.match(rangeModeNote(null, {}), /^Range mode: continue with a warning\./);
});
