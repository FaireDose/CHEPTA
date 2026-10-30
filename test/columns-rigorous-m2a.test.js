// Proposal 0015, milestone M2a: the rigorous column on W7's M2a cases (validation/data/columns/ A4, B2, B3, E4, F1,
// P1; reference validation/python/reference_mesh.py, fixture validation/fixtures/columns.json), each with the
// tolerances it states. B2 is the complete benchmark: the worked example of The ChemSep Book (2nd ed., 2006, public
// domain), against the reference (numerical) and against the published stages (agreement between two property
// methods, kept apart). The property method of each case is the case's (its method_choice, docs/METHOD_SELECTION.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system } from "../src/index.js";
import { run } from "../src/api/dispatcher.js";
import { solveCascade, TOLERANCES } from "../src/units/columns/engine.js";

const caseOf = id => JSON.parse(readFileSync(new URL(`../validation/data/columns/${id}.json`, import.meta.url)));
const fixture = JSON.parse(readFileSync(new URL("../validation/fixtures/columns.json", import.meta.url)));
const sum = v => v.reduce((a, b) => a + b, 0);
const KMOL_H = 3.6;
const SPEC_OF = { reflux_ratio: "reflux_ratio", distillate_flow_mol_s: "distillate_rate", bottoms_flow_mol_s: "bottoms_rate" };
const feedsOf = c => c.column.feeds ?? [c.column.feed];

/** A case on the engine: the model system's closed forms, or CHEPTA's system; a feed with q = 1 at its bubble point. */
function engineRun(c, extra = {}) {
  const P = c.pressure_kPa;
  let thermo = null, sys = null, H;
  if (c.thermo.kind === "constant-alpha") {
    const { alpha, reference_vapour_pressure: rp, latent_heat_J_mol: lam } = c.thermo;
    thermo = { n: alpha.length, names: c.components, P_kPa: P, lnK: (x, y, T) => alpha.map(a => Math.log(a) + rp.A - rp.B_K / T - Math.log(P)),
      hL: () => 0, hV: () => lam, bubbleT: x => rp.B_K / (rp.A - Math.log(P / sum(alpha.map((a, i) => a * x[i])))) };
    H = f => (1 - f.q) * lam * f.flow_mol_s;
  } else {
    sys = system({ components: c.components, model: c.thermo.model });
    H = f => sys.enthalpy("liquid", f.q === 1 ? sys.bubbleT(f.z, P).T : f.T_K, P, f.z) * f.flow_mol_s;
  }
  return solveCascade({ sys, thermo, P_kPa: P, stages: c.column.stages, ends: { condenser: c.column.condenser },
    feeds: feedsOf(c).map(f => ({ stage: f.stage, flows: f.z.map(z => z * f.flow_mol_s), H_W: H(f) })),
    specs: c.specs.map(s => ({ kind: SPEC_OF[s.kind], value: s.value })), ...extra });
}

/** The engine's column against the reference's, within the case's numerical tolerances; every stage's balances closed. */
function againstReference(c, r, ref) {
  const tol = c.tolerances.numerical.engine_against_reference, bal = c.tolerances.numerical.balances_on_every_stage;
  const F = sum(feedsOf(c).map(f => f.flow_mol_s));
  assert.equal(r.stages.length, ref.stages.length);
  r.stages.forEach((s, j) => {
    const q = ref.stages[j], where = `${c.id} stage ${s.stage}`;
    assert.ok(Math.abs(s.T_K - q.T_K) <= tol.T_K_absolute, `${where}: T ${s.T_K} vs ${q.T_K}`);
    assert.ok(Math.abs(s.L_mol_s - q.L_mol_s) <= tol.flows_relative * q.L_mol_s, `${where}: L`);
    assert.ok(Math.abs(s.V_mol_s - q.V_mol_s) <= tol.flows_relative * Math.max(q.V_mol_s, 1e-300) || (s.V_mol_s === 0 && q.V_mol_s === 0), `${where}: V`);
    s.x.forEach((v, i) => assert.ok(Math.abs(v - q.x[i]) <= tol.mole_fractions_absolute, `${where}: x ${i} ${v} vs ${q.x[i]}`));
    assert.ok(s.residuals.material_mol_s <= bal.material_relative_to_feed * F && s.residuals.equilibrium <= bal.equilibrium
      && s.residuals.summation <= bal.summation && s.residuals.energy_W <= bal.energy_relative_to_feed_times_10kJ_mol * F * 1e4, `${where}: ${JSON.stringify(s.residuals)}`);
  });
  assert.ok(Math.abs(sum(r.products.distillate.flows) - ref.D_mol_s) <= tol.flows_relative * ref.D_mol_s, `${c.id}: D`);
  assert.ok(Math.abs(r.duties.condenser_W - ref.Q_condenser_W) <= tol.duties_relative * Math.abs(ref.Q_condenser_W), `${c.id}: condenser duty`);
  assert.ok(Math.abs(r.duties.reboiler_W - ref.Q_reboiler_W) <= tol.duties_relative * Math.abs(ref.Q_reboiler_W), `${c.id}: reboiler duty`);
}

test("rigorous A4: two feeds (a liquid on stage 4, a half-vaporized one on stage 9) as the reference; the flows jump as q says", () => {
  const c = caseOf("A4-binary-two-feeds"), r = engineRun(c);
  againstReference(c, r, fixture.cases[c.id].rigorous);
  assert.deepEqual(r.warnings, c.expected.warnings);
  const L = r.stages.map(s => s.L_mol_s), V = r.stages.map(s => s.V_mol_s);
  assert.ok(Math.abs(L[3] - L[2] - 40) < 1e-9 && Math.abs(L[8] - L[7] - 30) < 1e-9 && Math.abs(V[8] - V[9] - 30) < 1e-9);
});

test("rigorous B2, the complete benchmark (The ChemSep Book, benzene + toluene) through solve_column: the reference within its tolerances, the published stages within the agreement tolerances", t => {
  const c = caseOf("B2-chemsep-benzene-toluene"), f = c.column.feed, ref = fixture.cases[c.id].rigorous, pub = c.published;
  const r = run({ capability: "solve_column", input: { components: c.components, thermo: { model: c.thermo.model, vapour: c.thermo.vapour },
    feed: { flow_kmol_h: Object.fromEntries(c.components.map((id, i) => [id, f.z[i] * f.flow_mol_s * KMOL_H])), P_kPa: c.pressure_kPa, VF: 0 },
    column: { mode: "rigorous", stages: c.column.stages, feed_stage: f.stage, condenser: c.column.condenser, reflux_ratio: c.specs[0].value,
      bottoms_kmol_h: c.specs[1].value * KMOL_H } } });
  assert.equal(r.outcome, c.expected.outcome);
  const col = r.value.column;
  assert.deepEqual(col.warnings, c.expected.warnings);
  // numerical: the engine against the reference (the same method), stage by stage
  const tol = c.tolerances.numerical.engine_against_reference;
  col.profile.forEach((s, j) => {
    const q = ref.stages[j];
    assert.ok(Math.abs(s.T_K - q.T_K) <= tol.T_K_absolute, `stage ${s.stage}: T`);
    assert.ok(Math.abs(s.L_kmol_h / KMOL_H - q.L_mol_s) <= tol.flows_relative * q.L_mol_s, `stage ${s.stage}: L`);
    c.components.forEach((id, i) => assert.ok(Math.abs(s.x[id] - q.x[i]) <= tol.mole_fractions_absolute, `stage ${s.stage}: x ${id}`));
  });
  assert.ok(Math.abs(col.condenser_kW * 1000 - ref.Q_condenser_W) <= tol.duties_relative * Math.abs(ref.Q_condenser_W));
  // agreement with the published example (another property method): T and benzene's x on every stage, x_D and x_B
  const agree = c.tolerances.agreement_with_published_example;
  let dT = 0, dx = 0;
  col.profile.forEach((s, j) => {
    dT = Math.max(dT, Math.abs(s.T_K - (pub.T_C[j] + 273.15)));
    dx = Math.max(dx, Math.abs(s.x.benzene - pub.x_benzene[j]));
  });
  dx = Math.max(dx, Math.abs(r.value.distillate.z[0] - pub.x_D[0]), Math.abs(r.value.bottoms.z[0] - pub.x_B[0]));
  t.diagnostic(`B2 against the published stages (The ChemSep Book, Figures 1.19 to 1.21): at most ${dT.toFixed(3)} K and ${dx.toFixed(4)} in benzene's mole fraction`);
  assert.ok(dT <= agree.T_K_absolute, `T: ${dT} K`);
  assert.ok(dx <= agree.mole_fractions_absolute, `x: ${dx}`);
  assert.ok(Math.abs(col.reflux_ratio - pub.reflux_ratio) < 1e-9 && Math.abs(col.B_kmol_h / KMOL_H - pub.B_mol_s) < 1e-9);
});

test("rigorous B3: acetone + methanol near the azeotrope: the reference's profile; the distillate stays below the model's azeotrope; the pinch", () => {
  const c = caseOf("B3-acetone-methanol-azeotrope"), r = engineRun(c), fx = fixture.cases[c.id];
  againstReference(c, r, fx.rigorous);
  assert.ok(r.products.distillate.flows[0] / sum(r.products.distillate.flows) < fx.checks.azeotrope.model_x_acetone, "never beyond the azeotrope");
  const top = r.stages.slice(0, 5).map(s => s.T_K);
  assert.ok(Math.max(...top) - Math.min(...top) < 0.01, "the top five stages pinch");
  assert.ok(r.iterations >= 1, "the engine reports its iterations");
});

test("rigorous E4: an iteration limit of 1 from a cold start: not converged, the residuals and tolerances reported, the limit named; no profile", () => {
  const c = caseOf("E4-iteration-limit");
  assert.equal(c.solver.start, "cold");
  assert.throws(() => engineRun(c, { maxIterations: c.solver.max_iterations }), e => {
    assert.equal(e.code, c.expected.code);
    assert.match(e.message, /iteration limit/);
    assert.match(e.message, /does not show that the column has no solution/);
    for (const k of ["material", "equilibrium", "summation", "energy", "specifications"]) assert.ok(k in e.details.residuals && k in e.details.tolerances, k);
    return true;
  });
  // through the request path: the block's max_iterations, and the outcome
  const f = c.column.feed;
  const input = { components: c.components, thermo: { model: c.thermo.model },
    feed: { flow_kmol_h: Object.fromEntries(c.components.map((id, i) => [id, f.z[i] * f.flow_mol_s * KMOL_H])), T_K: f.T_K, P_kPa: c.pressure_kPa },
    column: { mode: "rigorous", stages: c.column.stages, feed_stage: f.stage, reflux_ratio: c.specs[0].value, bottoms_kmol_h: c.specs[1].value * KMOL_H, max_iterations: 1 } };
  const r = run({ capability: "solve_column", input });
  assert.equal(r.outcome, c.expected.outcome);
  assert.equal(r.value, undefined);
  // with the default limit the same column converges (B1)
  const { max_iterations: _m, ...column } = input.column;
  assert.equal(run({ capability: "solve_column", input: { ...input, column } }).outcome, "ok");
});

test("rigorous F1: 1-butanol + water, the one-liquid solution is unstable on stages 1 and 2: refused (PHASE_SPLIT), the stages named, never returned", () => {
  const c = caseOf("F1-butanol-water-two-liquids"), fx = fixture.cases[c.id];
  const unstable = fx.checks.stability.filter(s => s.tpd_min < c.tolerances.stability.tpd_unstable_below).map(s => s.stage);
  assert.throws(() => engineRun(c), e => {
    assert.equal(e.code, c.expected.code);
    assert.deepEqual(e.details.stages.map(s => s.stage), unstable);
    // the remedy: since M2b, the option "look for two liquids on the stages" (test/columns-vll.test.js solves F1 with it)
    assert.match(e.message, /look for two liquids on the stages/);
    return true;
  });
  const f = c.column.feed;
  const r = run({ capability: "solve_column", input: { components: c.components, thermo: { model: c.thermo.model },
    feed: { flow_kmol_h: Object.fromEntries(c.components.map((id, i) => [id, f.z[i] * f.flow_mol_s * KMOL_H])), P_kPa: c.pressure_kPa, VF: 0 },
    column: { mode: "rigorous", stages: c.column.stages, feed_stage: f.stage, reflux_ratio: c.specs[0].value, distillate_kmol_h: c.specs[1].value * KMOL_H } } });
  assert.equal(r.outcome, c.expected.outcome);
  assert.equal(r.value, undefined);
});

test("rigorous P1, the performance benchmark (methanol, ethanol, 1-propanol, water; NRTL; 40 stages): cold and warm against the reference, timed", t => {
  const c = caseOf("P1-performance-alcohols-water"), fx = fixture.cases[c.id];
  let t0 = performance.now();
  const cold = engineRun(c);
  const msCold = performance.now() - t0;
  againstReference(c, cold, fx.rigorous);
  assert.deepEqual(cold.warnings, c.expected.warnings);
  t0 = performance.now();
  const warm = engineRun(c, { start: cold, specs: c.performance.warm_specs.map(s => ({ kind: SPEC_OF[s.kind], value: s.value })) });
  const msWarm = performance.now() - t0;
  assert.equal(warm.solver.start, "previous solution");
  againstReference(c, warm, fx.rigorous_warm);
  for (const r of [cold, warm]) for (const k of Object.keys(TOLERANCES)) assert.ok(r.residuals[k] <= r.tolerances[k], k);
  t.diagnostic(`P1: cold ${Math.round(msCold)} ms (${cold.iterations} Newton iterations, ${cold.solver.start}); warm ${Math.round(msWarm)} ms (${warm.iterations} iterations); the phase check on every stage included`);
  // W9 sets the budget and the machine; until then a generous bound so that a regression is seen
  assert.ok(msCold < 60000 && msWarm < 60000);
});
