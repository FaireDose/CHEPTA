// Safeguards of the recycle solver (decision 2026-11-14-07; CHEPTA-Lab's closed ethyl acetate plant, request 14).
//
// A hard multi-tear loop: two separators in a loop with two recycles of 99 % and 99.5 % (the loop gain is close to
// one, so direct substitution creeps at a change of about 1e-3 per pass, as Lab's plant does), each separator's split
// a sharp function of its inlet's composition, and each refusing an inlet that lacks a component (as the conversion
// reactor of Lab's plant refuses an inlet short of ethanol after an extrapolated guess put a flow at zero). Before the
// safeguards, Broyden stopped on every variant below with the block's error after an extrapolated guess; with them it
// converges at the default tolerance. The answer is checked without the solver's own claims: started from its own
// tear streams the loop changes by less than the tolerance in one pass, every variant reaches the same answer from
// guesses three times apart, and the flowsheet balances.
//
// The separator is a test block (registered here only), not a model of a unit: its split is a smooth sigmoid of
// the mole fraction, chosen to make the loop nonlinear.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { system, solveFlowsheet } from "../src/index.js";
import { registerUnit } from "../src/units/units.js";
import { stream } from "../src/stream/stream.js";
import { fail } from "../src/util/errors.js";
import { run } from "../src/api/dispatcher.js";

registerUnit({
  type: "test-sharp-separator", label: "Sharp separator", inlets: [{ port: "in", min: 1, max: 3 }], outlets: [{ port: "top" }, { port: "bottom" }],
  specKeys: ["k", "min", "max"],
  solve({ sys, inlets, spec }) {
    const fl = new Array(sys.n).fill(0);
    for (const s of inlets.in) s.flows.forEach((v, i) => { fl[i] += v; });
    const F = fl.reduce((a, b) => a + b, 0);
    if (F > (spec.max ?? Infinity)) throw fail("NO_CONVERGENCE", `cannot solve an inlet of ${F.toFixed(1)} kmol/h (above ${spec.max})`);
    if (F > 0 && fl.some(v => v < spec.min * F)) throw fail("BAD_INPUT", `needs every component in its inlet, at least ${spec.min} of it`);
    const top = fl.map((v, i) => (F > 0 ? v * (0.5 + 0.45 * Math.tanh(spec.k * (v / F - 0.4) * (i === 0 ? 1 : -1))) : 0));
    const { T_K, P_kPa } = inlets.in[0];
    return { outlets: { top: stream(sys, { flow_kmol_h: top, T_K, P_kPa }), bottom: stream(sys, { flow_kmol_h: fl.map((v, i) => v - top[i]), T_K, P_kPa }) }, duty_kW: 0 };
  },
});

// any three components serve: the test block uses only the flows, the streams their enthalpies (NRTL, ideal vapour)
const sys = system({ components: ["ethanol", "water", "methanol"], model: "NRTL" });
const at = { T_K: 300, P_kPa: 101.325 };
function hardLoop({ k, min = 1e-3, max, guess = 1, recycle = 0.99, extra = {} }) {
  return {
    blocks: [
      { id: "F1", type: "feed", spec: { flow_kmol_h: [40, 50, 10], ...at } },
      { id: "A", type: "test-sharp-separator", spec: { k, min, ...(max ? { max } : {}) } },
      { id: "B", type: "test-sharp-separator", spec: { k, min, ...(max ? { max } : {}) } },
      { id: "SA", type: "splitter", spec: { fractions: [recycle, "rest"] } },
      { id: "SB", type: "splitter", spec: { fractions: [recycle, "rest"] } },
      { id: "P1", type: "product" }, { id: "P2", type: "product" },
    ],
    streams: [
      { id: "S1", from: "F1.out", to: "A.in" },
      { id: "S2", from: "A.top", to: "SA.in", tear: true, guess: { flow_kmol_h: [5000 * guess, 1000 * guess, 1500 * guess], ...at } },
      { id: "R1", from: "SA.out", to: "B.in" }, { id: "S3", from: "SA.out", to: "P1.in" },
      { id: "S4", from: "A.bottom", to: "B.in", tear: true, guess: { flow_kmol_h: [3000 * guess, 6000 * guess, 3000 * guess], ...at } },
      { id: "S5", from: "B.bottom", to: "SB.in" }, { id: "R2", from: "SB.out", to: "A.in" }, { id: "S6", from: "SB.out", to: "P2.in" },
      { id: "R3", from: "B.top", to: "A.in" },
    ],
    solver: { maxIterations: 200, ...extra },
  };
}

const VARIANTS = [{ k: 8, recycle: 0.99 }, { k: 20, recycle: 0.99 }, { k: 40, recycle: 0.995 }];

test("a hard two-tear loop converges at the default tolerance where Broyden used to stop on a block's error", () => {
  for (const v of VARIANTS) {
    const answers = [];
    for (const guess of [0.3, 1, 3]) {
      const fs = hardLoop({ ...v, guess });
      const r = solveFlowsheet(sys, fs);
      const loop = r.loops[0];
      assert.ok(loop.residual < 1e-8, `k ${v.k}, guess ${guess}: residual ${loop.residual}`);
      assert.deepEqual(loop.tears, ["S2", "S4"]);
      // the safeguards acted, and say what they did
      assert.ok(loop.safeguards?.length > 0, `k ${v.k}, guess ${guess}: no safeguard used`);
      for (const s of loop.safeguards) assert.ok(s.iteration >= 1 && s.action && s.reason, JSON.stringify(s));
      // the flowsheet balances
      for (const d of Object.values(r.balance.material_kmol_h)) assert.ok(Math.abs(d) < 1e-6 * 100, `balance ${d}`);
      // started from its own answer, one pass changes the tears by less than the tolerance
      const again = hardLoop({ ...v, guess });
      for (const s of again.streams) if (s.tear) s.guess = { flow_kmol_h: r.streams[s.id].flows, T_K: r.streams[s.id].T_K, P_kPa: r.streams[s.id].P_kPa };
      const r2 = solveFlowsheet(sys, again);
      assert.equal(r2.loops[0].iterations, 1, `k ${v.k}, guess ${guess}: the answer is not a fixed point`);
      answers.push(r.streams.S3.flows.concat(r.streams.S6.flows));
    }
    // the same answer from guesses three times apart (kmol/h; the products are about 10-50 kmol/h)
    for (const a of answers.slice(1)) a.forEach((f, i) => assert.ok(Math.abs(f - answers[0][i]) < 1e-5, `k ${v.k}: ${f} vs ${answers[0][i]}`));
  }
});

test("a block's failure on an extrapolated guess goes back to the last accepted pass and tries a shorter step", () => {
  const r = solveFlowsheet(sys, hardLoop({ k: 8, guess: 0.3 }));
  const failed = r.loops[0].safeguards.filter(s => /block failed/.test(s.action));
  assert.ok(failed.length > 0, "no failed block was retried");
  assert.match(failed[0].reason, /Sharp separator [AB]: needs every component/);
  assert.ok(failed.every(s => s.limit >= 0 && Number.isFinite(s.limit)));
});

test("fail loudly: a block that fails on the direct-substitution step itself still stops the loop with its error", () => {
  // the separators cannot take more than 3000 kmol/h, and the answer needs about 10000: no step reaches it
  assert.throws(() => solveFlowsheet(sys, hardLoop({ k: 8, guess: 0.1, max: 3000 })), e => {
    assert.equal(e.code, "NO_CONVERGENCE");
    assert.match(e.message, /Sharp separator [AB]: cannot solve an inlet/);
    assert.match(e.message, /did not converge/);
    return true;
  });
});

test("a loop that does not reach the tolerance in maxIterations is refused, safeguards or not", () => {
  assert.throws(() => solveFlowsheet(sys, hardLoop({ k: 8, guess: 1, extra: { maxIterations: 12 } })), e => {
    assert.equal(e.code, "NO_CONVERGENCE");
    assert.match(e.message, /in 12 iterations/);
    assert.ok(Array.isArray(e.details.safeguards));
    return true;
  });
});

test("direct substitution and Wegstein are not changed on a loop where no block fails", () => {
  // the recycle of test/flowsheet.test.js's fixed-fraction case: linear, no block fails, no safeguard acts
  const fs = hardLoop({ k: 8, recycle: 0.5, guess: 0.001 });
  for (const method of ["direct", "wegstein", "broyden"]) {
    const r = solveFlowsheet(sys, { ...fs, solver: { method, maxIterations: 200 } });
    assert.equal(r.loops[0].safeguards, undefined, `${method}: ${JSON.stringify(r.loops[0].safeguards)}`);
  }
});

// CHEPTA-Lab's closed ethyl acetate plant (Piotrowski et al. 2021), its three inputs of decision 2026-11-14-05, copied
// unchanged into validation/data/flowsheets/lab-plant-0.6.2/. One run takes 20-60 minutes, so they run only with
// CHEPTA_SLOW_TESTS=1; their results are recorded in the decision. Without the variable the files are checked to be
// ready to solve.
const LAB = new URL("../validation/data/flowsheets/lab-plant-0.6.2/", import.meta.url);
const LAB_RUNS = ["plant62-R-bottoms-warm", "plant62-R-bottoms-warm-col5iter100", "plant62-W-dist"];
test("Lab's closed-plant inputs are present and well formed", () => {
  for (const name of LAB_RUNS) {
    const req = JSON.parse(readFileSync(new URL(`${name}.request.json`, LAB)));
    assert.equal(req.capability, "solve_flowsheet", name);
    assert.equal(req.input.flowsheet.streams.filter(s => s.tear).length, 5, name);
  }
});
for (const name of LAB_RUNS) {
  test(`Lab's closed plant ${name} (slow; CHEPTA_SLOW_TESTS=1)`, { skip: !process.env.CHEPTA_SLOW_TESTS && "set CHEPTA_SLOW_TESTS=1 to run" }, () => {
    const file = new URL(`${name}.request.json`, LAB);
    assert.ok(existsSync(file));
    const out = run(JSON.parse(readFileSync(file)));
    // the outcome is recorded, not asserted to be "ok": decision 2026-11-14-07 says which converge and why
    assert.ok(["ok", "not_converged"].includes(out.outcome), `${name}: ${out.outcome} ${out.error?.message}`);
    if (out.outcome !== "ok") assert.equal(out.error.code, "NO_CONVERGENCE");
  });
}
