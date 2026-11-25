// CHEPTA-Lab's requests 17 and 19 and the column purity found inside the scanned range (EA-13, M2), from the check of
// CHEPTA main 415da41 (FaireDose/CHEPTA-Lab, cases/ethyl-acetate-piotrowski-2021/capability-requests-main-415da41/
// README.md and cases/methanol-co2-campos-2022/CAPABILITY_REQUESTS.md; decision 2026-11-20-02):
//   EA-17  the strict range mode inside a recycle loop refused only once the loop had an answer: a block outside every
//          loop (Lab's 15 degC feed F3) is now refused at once, and a loop that stops without an answer names the
//          records its last pass used outside their ranges;
//   EA-19  a column purity that every solved column exceeds was refused with "the reflux ratio is too low": the scan
//          now goes on toward the end of the distillate's range, and the refusal says the specification is exceeded
//          (and, where it is so, that the feed itself is already purer than asked).
// Methods: Lab's own (UNIQUAC with an ideal-gas vapour for ethanol + water + ethyl acetate + acetic acid at 100 kPa),
// as in docs/METHOD_SELECTION.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "../src/api/dispatcher.js";
import { progressText } from "../src/runtime/worker.js";

const clone = o => JSON.parse(JSON.stringify(o));

const load = name => JSON.parse(readFileSync(new URL(`../validation/data/columns/lab-requests-main-415da41/${name}.request.json`, import.meta.url)));
// Lab's R17 input: the 15 degC feed F3 of acid and ethanol, a heater and a 50 % recycle, strictRanges, 2 iterations
const R17 = load("R17-strict-loop-not-converged");

test("EA-17: a block outside every loop is refused at once in the strict mode, before the loop is solved", () => {
  for (const req of [R17, load("R17-strict-loop-converged-control")]) {
    const r = run(req);
    assert.equal(r.outcome, "invalid_input");
    assert.equal(r.error.code, "OUT_OF_RANGE");
    assert.match(r.error.message, /Feed F3, outside every recycle loop, is calculated once from its final inlets/);
    assert.match(r.error.message, /Acetic acid: vapour pressure at 288\.15 K is 1\.85 K below its range/);
    assert.deepEqual(r.error.where.map(w => w.block), ["F3"]);
  }
  // lenient: the same flowsheet is not refused for its ranges (the loop of 2 iterations does not converge)
  const req = clone(R17); delete req.options;
  const r = run(req);
  assert.equal(r.error.code, "NO_CONVERGENCE");
  assert.doesNotMatch(r.error.message, /strict range mode/);
});

test("EA-17: inside a loop the answer is judged, and a loop that stops says what its last pass used outside the ranges", () => {
  // a construction, not Lab's: the feed at 300 K (inside acetic acid's records), the loop's heater at 288.15 K
  const req = clone(R17);
  req.input.flowsheet.blocks[0].spec.T_K = 300;
  req.input.flowsheet.blocks[2].spec.T_K = 288.15;
  const r = run(req);
  assert.equal(r.error.code, "NO_CONVERGENCE");
  assert.match(r.error.message, /In its last pass the loop used \d+ records outside their ranges \(.*Acetic acid: vapour pressure extrapolated 1\.85 K below its range/);
  assert.match(r.error.message, /judges the loop's answer, not its passes/);
  assert.equal(r.error.details.strictRanges, true);
  assert.ok(r.error.details.extrapolations.some(e => e.where.includes("HTXR2")));
  // converged, the answer is refused as before (decision 2026-11-14-06)
  const conv = clone(req); conv.input.flowsheet.solver = { maxIterations: 200, tolerance: 1e-8 };
  const c = run(conv);
  assert.equal(c.error.code, "OUT_OF_RANGE");
  assert.match(c.error.message, /refuses this answer: it uses \d+ records outside their ranges/);
  // lenient: no note
  delete req.options;
  assert.doesNotMatch(run(req).error.message, /strict range mode/);
});

test("EA-17: an OUT_OF_TIME report names the records the loop's last pass used outside their ranges", () => {
  const text = progressText({ kind: "flowsheet", loops: [{ blocks: ["MIX1", "HTXR2", "SPLIT3"], tears: ["S7"], iterations: 9, maxIterations: 200,
    residual: 2.2e-4, tolerance: 1e-8, converged: false, strictOutside: ["Acetic acid: vapour pressure extrapolated 1.85 K below its range"] }] });
  assert.match(text, /its last pass used a record outside its range, which the strict range mode \(strictRanges\) will refuse in the answer if they remain \(Acetic acid: vapour pressure/);
  // without the field, the text of before
  assert.doesNotMatch(progressText({ kind: "flowsheet", loops: [{ blocks: ["A"], tears: ["S"], iterations: 1, residual: 1, tolerance: 1, converged: false }] }), /strict/);
});

// Lab's R19 input: column 15 alone, fed the settled plant's stream 28 with its organics cut to 0.0002 of their flows (a
// constructed feed, 0.99996 mass fraction water), 99.99 mass % water asked in the bottoms
const R19 = load("R19-column-purity-always-exceeded");

test("EA-19: a purity every column exceeds is refused as exceeded, with the feed's own purity, not as a reflux too low", () => {
  const r = run(R19);
  assert.equal(r.outcome, "invalid_input");
  assert.equal(r.error.code, "OUT_OF_RANGE");
  const m = r.error.message;
  assert.match(m, /Every column solved is purer than asked/);
  assert.match(m, /the specification is exceeded, not out of reach/);
  assert.match(m, /The column's feed itself is 0\.99996 Water \(mass fraction\), already purer than asked/);
  assert.doesNotMatch(m, /too low|larger reflux_ratio/);
  // the scan went below 1 % of the feed as distillate (main 415da41 stopped at 18.07 mol/s)
  assert.ok(r.error.details.range.lowest.at < 18, JSON.stringify(r.error.details.range));
  assert.ok(r.error.details.range.lowest.value > 0.9999);
});
