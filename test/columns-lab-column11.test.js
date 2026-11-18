/**
 * CHEPTA-Lab's product column 11 of the ethyl acetate plant with a trace of acetic acid (EA-9, acetic acid;
 * docs/decisions/2026-11-14-05-column-fixes-lab-062.md; proposal 0024): on chepta 0.6.2, 0.001 to 0.01 mass % of acid
 * in feed 13 stopped the column near the paper's product flow (141.5 kmol/h): the continuation in the relative
 * volatilities stopped at 90.92 %. The inputs are Lab's, copied unchanged (validation/data/columns/lab-requests-0.6.2/).
 * Found on 2026-11-17: the continuation's mean of ln K over the components weighs the trace acid as much as the main
 * components, so the acid changes the whole path whatever its amount; the column converges with the mean weighted by
 * the liquid (engine.js, CONTINUATION_MEANS), and also with the smooth two-liquid stage (two_liquid_stage "smooth").
 * These are checks of the solver reaching the MESH solution (balances, the acid's path); the column's equations are
 * validated in columns-vll.test.js and columns-heteroazeotropic.test.js against independent references.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "../src/api/dispatcher.js";

const load = name => JSON.parse(readFileSync(new URL(`../validation/data/columns/lab-requests-0.6.2/${name}.request.json`, import.meta.url)));
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const withColumn = (req, patch) => {
  const r = structuredClone(req);
  Object.assign(r.input.flowsheet.blocks.find(x => x.id === "SCDS11").spec, patch);
  return r;
};
function checks(r) {
  assert.equal(r.outcome, "ok", r.error?.message);
  const st = r.value.streams;
  for (const c of Object.keys(st.S13.flow_kmol_h)) {
    const a = st.S13.flow_kmol_h[c], b = st.S14.flow_kmol_h[c] + st.S16.flow_kmol_h[c];
    assert.ok(Math.abs(a - b) <= 1e-8 * sum(st.S13.flow_kmol_h), `${c}: in ${a}, out ${b}`);
  }
  // the acid is the heaviest component: all of it leaves in the product (Lab: 0.022 mass %, not the paper's 0.01 %)
  assert.ok(st.S16.flow_kmol_h["acetic-acid"] >= (1 - 1e-9) * st.S13.flow_kmol_h["acetic-acid"]);
  const m = st.S16.mass_kg_h, acid = st.S16.flow_kmol_h["acetic-acid"] * 60.052;
  return { acid_mass_pct: 100 * acid / m, state: r.value.blocks.SCDS11.state };
}

test("Lab's column 11 with 0.01 mass % acetic acid at the paper's product flow (141.5 kmol/h): converges (0.6.2: NO_CONVERGENCE at 90.92 %)", () => {
  const { acid_mass_pct, state } = checks(run(load("iso-scds11-acid0.01-bottoms141.5")));
  assert.match(state.solver.start, /continuation in the relative volatilities, the mean weighted by the liquid/);
  assert.ok(Math.abs(acid_mass_pct - 0.022) < 0.0005, `${acid_mass_pct}`);
  assert.ok(state.two_liquid_stages.length >= 25, `${state.two_liquid_stages}`);
});

test("Lab's column 11 with acid and the smooth two-liquid stage: 139 kmol/h converges (from the bubble-point start, eps 1e-3 to 1e-5)", () => {
  const { state } = checks(run(withColumn(load("iso-scds11-acid0.01-bottoms139"), { two_liquid_stage: "smooth" })));
  const t = state.solver.two_liquid_stage;
  assert.equal(t.eps, 1e-5);
  assert.deepEqual(t.steps.map(q => q.eps), [1e-3, 1e-4, 1e-5]);
  assert.equal(t.check.passed, true);
});
