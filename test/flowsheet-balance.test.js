// The plant's balance on its own tolerance (decision 2026-11-18-02; question 3 of decision 2026-11-14-08).
//
// Until then the whole flowsheet's component balance was held to 1000 times the recycle tolerance (relative to the
// feed), so at a loose recycle tolerance a plant whose specification cannot balance passed as converged: CHEPTA-Lab's
// ethyl acetate plant, 0.42 kmol/h of ester out of balance in a feed of 1250 kmol/h, at a tolerance of 1e-5. Now each
// component's |feeds + generated - products| is also held to solver.balanceTolerance (1e-4 by default) times the
// fresh feed, whatever the recycle tolerance, as COFE keeps a "Mass balance relative tolerance" beside its "Recycle
// relative tolerance". Beyond it the strict mode (strictRanges) refuses and the lenient mode warns.
//
// The plant: a feed of 10 kmol/h, a mixer and a splitter whose product outlet is given by its flow, the rest recycled.
// With the product at 10.4 kmol/h the loop drains 0.4 kmol/h per pass; with a large recycle (5000 kmol/h guessed) one
// pass changes the tear by 8e-5 (relative), within a recycle tolerance of 1e-4, so the loop stops at once, 4 % of the
// feed out of balance. The method is NRTL (ethanol + water, a liquid at 300 K: docs/METHOD_SELECTION.md); the blocks
// here use only the flows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { system, solveFlowsheet } from "../src/index.js";
import { run } from "../src/api/dispatcher.js";

const sys = system({ components: ["ethanol", "water"], model: "NRTL" });
const at = { T_K: 300, P_kPa: 101.325 };
const plant = ({ product, solver = {} }) => ({
  blocks: [
    { id: "F1", type: "feed", spec: { flow_kmol_h: [5, 5], ...at } },
    { id: "M", type: "mixer" },
    { id: "S", type: "splitter", spec: { flow_kmol_h: [product, "rest"] } },
    { id: "P", type: "product" },
  ],
  streams: [
    { id: "S1", from: "F1.out", to: "M.in" },
    { id: "S2", from: "M.out", to: "S.in" },
    { id: "S3", from: "S.out", to: "P.in" },
    { id: "R", from: "S.out", to: "M.in", tear: true, guess: { flow_kmol_h: [2500, 2500], ...at } },
  ],
  solver: { tolerance: 1e-4, ...solver },
});

test("a product taken above the feed passes a loose recycle tolerance, and the balance check warns, naming what and how much", () => {
  const r = solveFlowsheet(sys, plant({ product: 10.4 }));
  assert.equal(r.loops[0].iterations, 1);
  assert.ok(r.loops[0].residual < 1e-4);
  // the old check (1000 times the recycle tolerance: 1 kmol/h here) lets 0.2 kmol/h per component through
  for (const d of Object.values(r.balance.material_kmol_h)) assert.ok(Math.abs(d + 0.2) < 1e-9, `imbalance ${d}`);
  assert.equal(r.balance.balanceTolerance, 1e-4);
  assert.ok(Math.abs(r.balance.limit_kmol_h - 1e-3) < 1e-15);
  assert.equal(r.balance.warnings?.length, 1);
  const w = r.balance.warnings[0];
  assert.equal(w.code, "BALANCE");
  assert.deepEqual(w.components, ["ethanol", "water"]);
  assert.match(w.message, /Ethanol out exceeds in by 0\.2 kmol\/h, Water out exceeds in by 0\.2 kmol\/h/);
  assert.match(w.message, /Check the specifications first/);
  assert.match(w.message, /recycle tolerance \(0\.0001\)/);
  assert.match(w.message, /not a steady state/);
});

test("a feed with too small a way out (material accumulates) is named the other way", () => {
  const r = solveFlowsheet(sys, plant({ product: 9.6 }));
  assert.equal(r.balance.warnings?.length, 1);
  assert.match(r.balance.warnings[0].message, /Ethanol in exceeds out by 0\.2 kmol\/h/);
});

test("the strict mode refuses the plant out of balance", () => {
  assert.throws(() => solveFlowsheet(sys, plant({ product: 10.4, solver: { strictRanges: true } })), e => {
    assert.equal(e.code, "NO_CONVERGENCE");
    assert.match(e.message, /does not balance within 0\.0001 of its feed \(0\.001 kmol\/h\)/);
    assert.match(e.message, /Check the specifications first/);
    assert.match(e.message, /strict mode \(strictRanges\) refuses/);
    assert.equal(e.details.strictRanges, true);
    assert.ok(Math.abs(e.details.balance.ethanol + 0.2) < 1e-9);
    return true;
  });
});

test("the request path: the warning reaches the qualifications, and the limit the checks", () => {
  const flowsheet = { components: ["ethanol", "water"], thermo: { model: "NRTL" }, ...plant({ product: 10.4 }) };
  const out = run({ capability: "solve_flowsheet", input: { flowsheet } });
  assert.equal(out.outcome, "ok", JSON.stringify(out.error));
  assert.equal(out.checks.balance_tolerance, 1e-4);
  const w = out.qualifications.warnings.filter(x => x.code === "BALANCE");
  assert.equal(w.length, 1);
  assert.match(w[0].message, /Check the specifications first/);
  const strict = run({ capability: "solve_flowsheet", input: { flowsheet }, options: { strictRanges: true } });
  assert.equal(strict.outcome, "not_converged");
  assert.equal(strict.error.code, "NO_CONVERGENCE");
});

test("a balanced loop at the same loose recycle tolerance gets no warning; solver.balanceTolerance sets the limit", () => {
  // the product takes the rest, the recycle a fixed flow: the plant balances whatever the recycle
  const fs = plant({ product: 10.4 });
  fs.blocks[2].spec = { flow_kmol_h: ["rest", 5000] };
  const r = solveFlowsheet(sys, fs);
  assert.equal(r.balance.warnings, undefined);
  // a wider limit, given: the drain of 4 % of the feed is within 0.05
  const wide = solveFlowsheet(sys, plant({ product: 10.4, solver: { balanceTolerance: 0.05 } }));
  assert.equal(wide.balance.warnings, undefined);
  assert.equal(wide.balance.balanceTolerance, 0.05);
  for (const bad of [0, -1, 0.5, "x"]) {
    assert.throws(() => solveFlowsheet(sys, plant({ product: 10.4, solver: { balanceTolerance: bad } })), /solver\.balanceTolerance must be between 0 and 0\.1/);
  }
});
