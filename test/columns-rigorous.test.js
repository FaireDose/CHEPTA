// Proposal 0015, milestone M2a (W2): the rigorous column (src/units/columns/engine.js and the Column block's mode
// "rigorous") against W7's cases and independent reference (validation/data/columns/, validation/python/reference_mesh.py,
// fixture validation/fixtures/columns.json), with the tolerances each case states.
// Which cases apply: A1, A3 and D1 (constant relative volatility, the model system run through a test adapter with the
// case's closed-form K-values and enthalpies), A2 (the rigorous reflux at 101 stages that W7 found against Underwood's
// minimum), B1 (ethanol + water, NRTL, through the request path), C1 (missing data), E2 (no column: not converged,
// never a profile). E1 is the shortcut's (test/columns-shortcut.test.js); E3, a purity, is refused until M4 (there).
// The property method of B1 and C1 is the case's (docs/METHOD_SELECTION.md rule 3: NRTL with fitted pairs); the
// butanol + water case uses NRTL because only an activity model can show the second liquid; the propane + n-butane
// case uses Peng-Robinson (rule 1: hydrocarbons at 15 bar).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, solveFlowsheet } from "../src/index.js";
import { run } from "../src/api/dispatcher.js";
import { solveCascade, TOLERANCES, DRY_FRACTION } from "../src/units/columns/engine.js";
import { COLUMN_MODES } from "../src/units/columns/column.js";
import { readProject, projectOf, stateFromProject } from "../src/ui/project.js";
import { initialState } from "../src/ui/app-logic.js";
import { runInNodeWorker, startNodeRun, closeNodeWorkers } from "../src/runtime/node-worker.js";

const caseOf = id => JSON.parse(readFileSync(new URL(`../validation/data/columns/${id}.json`, import.meta.url)));
const fixture = JSON.parse(readFileSync(new URL("../validation/fixtures/columns.json", import.meta.url)));
const sum = v => v.reduce((a, b) => a + b, 0);
const KMOL_H = 3.6;   // kmol/h per mol/s
const SPEC_OF = { reflux_ratio: "reflux_ratio", distillate_flow_mol_s: "distillate_rate", bottoms_flow_mol_s: "bottoms_rate" };

/** The model system of a constant-alpha case as the engine's thermodynamic adapter (README of the cases). */
function alphaThermo(c) {
  const { alpha, reference_vapour_pressure: rp, latent_heat_J_mol: lam } = c.thermo, P = c.pressure_kPa;
  return { n: alpha.length, names: c.components, P_kPa: P, lnK: (x, y, T) => alpha.map(a => Math.log(a) + rp.A - rp.B_K / T - Math.log(P)),
    hL: () => 0, hV: () => lam, bubbleT: x => rp.B_K / (rp.A - Math.log(P / sum(alpha.map((a, i) => a * x[i])))) };
}
function alphaColumn(c, extra = {}) {
  const f = c.column.feed, lam = c.thermo.latent_heat_J_mol;
  return solveCascade({ thermo: alphaThermo(c), stages: c.column.stages, ends: { condenser: c.column.condenser },
    feeds: [{ stage: f.stage, flows: f.z.map(z => z * f.flow_mol_s), H_W: (1 - f.q) * lam * f.flow_mol_s }],
    specs: c.specs.map(s => ({ kind: SPEC_OF[s.kind], value: s.value })), ...extra });
}

/** The engine's profile against the reference's, within the case's numerical tolerances. */
function againstReference(c, stages, { D, Qc, Qr }, ref, scale = 1) {
  const tol = c.tolerances.numerical.engine_against_reference;
  assert.equal(stages.length, ref.stages.length);
  stages.forEach((s, j) => {
    const q = ref.stages[j], where = `${c.id} stage ${s.stage}`;
    assert.ok(Math.abs(s.T_K - q.T_K) <= tol.T_K_absolute, `${where}: T ${s.T_K} vs ${q.T_K}`);
    assert.ok(Math.abs(s.L / scale - q.L_mol_s) <= tol.flows_relative * q.L_mol_s, `${where}: L ${s.L / scale} vs ${q.L_mol_s}`);
    assert.ok(Math.abs(s.V / scale - q.V_mol_s) <= tol.flows_relative * Math.max(q.V_mol_s, 1e-300) || (q.V_mol_s === 0 && s.V === 0), `${where}: V ${s.V / scale} vs ${q.V_mol_s}`);
    s.x.forEach((v, i) => assert.ok(Math.abs(v - q.x[i]) <= tol.mole_fractions_absolute, `${where}: x ${i} ${v} vs ${q.x[i]}`));
  });
  assert.ok(Math.abs(D / scale - ref.D_mol_s) <= tol.flows_relative * ref.D_mol_s, `${c.id}: D`);
  assert.ok(Math.abs(Qc - ref.Q_condenser_W) <= tol.duties_relative * Math.abs(ref.Q_condenser_W), `${c.id}: condenser duty ${Qc} vs ${ref.Q_condenser_W}`);
  assert.ok(Math.abs(Qr - ref.Q_reboiler_W) <= tol.duties_relative * Math.abs(ref.Q_reboiler_W), `${c.id}: reboiler duty ${Qr} vs ${ref.Q_reboiler_W}`);
}

/** Every stage's balances within the case's limits, as the engine reports them. */
function balancesClosed(c, r) {
  const F = c.column.feed.flow_mol_s, tol = c.tolerances.numerical.balances_on_every_stage;
  for (const s of r.stages) {
    assert.ok(s.residuals.material_mol_s <= tol.material_relative_to_feed * F, `${c.id} stage ${s.stage}: material ${s.residuals.material_mol_s}`);
    assert.ok(s.residuals.equilibrium <= tol.equilibrium && s.residuals.summation <= tol.summation, `${c.id} stage ${s.stage}: ${JSON.stringify(s.residuals)}`);
    assert.ok(s.residuals.energy_W <= tol.energy_relative_to_feed_times_10kJ_mol * F * 1e4, `${c.id} stage ${s.stage}: energy ${s.residuals.energy_W}`);
  }
  for (const k of ["material", "equilibrium", "summation", "energy", "specifications"]) assert.ok(r.residuals[k] <= r.tolerances[k], `${c.id}: ${k} ${r.residuals[k]} over ${r.tolerances[k]}`);
}

for (const id of ["A1-binary-alpha", "A3-ternary-partial-condenser", "D1-dry-stage"]) {
  test(`rigorous ${id}: the reference's profile, duties and products within the case's tolerances; balances closed`, () => {
    const c = caseOf(id), ref = fixture.cases[id].rigorous, r = alphaColumn(c);
    assert.equal(r.converged, true);
    balancesClosed(c, r);
    againstReference(c, r.stages.map(s => ({ ...s, L: s.L_mol_s, V: s.V_mol_s })), { D: sum(r.products.distillate.flows), Qc: r.duties.condenser_W, Qr: r.duties.reboiler_W }, ref);
    // the overall component balance
    c.column.feed.z.forEach((z, i) => assert.ok(Math.abs(z * c.column.feed.flow_mol_s - r.products.distillate.flows[i] - r.products.bottoms.flows[i]) < 1e-9 * c.column.feed.flow_mol_s));
    if (id === "D1-dry-stage") {
      // W7's expected warnings: DRY_STAGE on stages 2 to 5 exactly, and nowhere else
      const w = r.warnings.filter(x => x.code === "DRY_STAGE");
      assert.equal(w.length, 1);
      assert.deepEqual(w[0].stages, c.expected.warnings[0].stages);
      assert.match(w[0].message, /too low a reflux/);
      assert.ok(w[0].remedy);
      assert.ok(DRY_FRACTION > 0.001 && DRY_FRACTION < 2 / 3, "the threshold lies between D1's two ratios");
    } else {
      assert.deepEqual(r.warnings, [], `${id}: no warning`);
    }
    if (c.column.condenser === "partial") assert.equal(r.products.distillate.phase, "vapour");
  });
}

test("rigorous: a vapour feed leaves the stripping section with less than 1/5 of the column's vapour: DRY_STAGE (vapour), below the bubble-cap turndown", () => {
  // A1's model column with a saturated-vapour feed: 120 mol/s of vapour above the feed, 20 below it (1/6)
  const c = caseOf("A1-binary-alpha");
  const q0 = { ...c, column: { ...c.column, feed: { ...c.column.feed, q: 0 } }, specs: [{ kind: "reflux_ratio", value: 1 }, { kind: "distillate_flow_mol_s", value: 60 }] };
  const r = alphaColumn(q0);
  const w = r.warnings.find(x => x.code === "DRY_STAGE" && x.phase === "vapour");
  assert.deepEqual(w.stages, [7, 8, 9, 10, 11, 12]);
  assert.match(w.message, /turndown of bubble-cap trays/);
  assert.ok(!r.warnings.some(x => x.phase !== "vapour"), "the liquid does not run dry");
});

test("rigorous A2: at 101 stages and the reflux W7's reference found, the light key's recovery is 0.98 (Underwood's R_min check, the other way round)", () => {
  const c = caseOf("A2-ternary-alpha-fug"), fx = fixture.cases["A2-ternary-alpha-fug"], m = fx.checks.rmin_against_rigorous;
  const lam = c.thermo.latent_heat_J_mol, f = c.column.feed;
  const r = solveCascade({ thermo: alphaThermo(c), stages: m.stages,
    feeds: [{ stage: m.feed_stage, flows: f.z.map(z => z * f.flow_mol_s), H_W: (1 - f.q) * lam * f.flow_mol_s }],
    specs: [{ kind: "reflux_ratio", value: m.reflux_ratio_rigorous }, { kind: "distillate_rate", value: fx.shortcut.D_mol_s }] });
  const recovery = r.products.distillate.flows[0] / (f.flow_mol_s * f.z[0]);
  // the reference solved for the reflux that gives 0.98 to 1e-9 in R; the recovery moves by about 1e-3 per 1e-5 of R
  assert.ok(Math.abs(recovery - c.shortcut.recovery_light_key_in_distillate) < 1e-6, `recovery ${recovery}`);
  // a pinch at 0.99999 of the minimum reflux on 101 stages: the engine needs its continuation here
  assert.match(r.solver.start, /continuation/);
});

/** B1 through the request path (kmol/h, kW). */
const B1 = () => {
  const c = caseOf("B1-ethanol-water-nrtl"), f = c.column.feed;
  return { c, input: { components: c.components, thermo: { model: c.thermo.model, vapour: c.thermo.vapour },
    feed: { flow_kmol_h: Object.fromEntries(c.components.map((id, i) => [id, f.z[i] * f.flow_mol_s * KMOL_H])), T_K: f.T_K, P_kPa: c.pressure_kPa },
    column: { mode: "rigorous", stages: c.column.stages, feed_stage: f.stage, condenser: c.column.condenser, reflux_ratio: c.specs[0].value,
      bottoms_kmol_h: c.specs[1].value * KMOL_H } } };
};

test("rigorous B1 (ethanol + water, NRTL) through solve_column: the reference's profile within its tolerances; checks by group", () => {
  const { c, input } = B1(), ref = fixture.cases["B1-ethanol-water-nrtl"].rigorous;
  const r = run({ capability: "solve_column", input });
  assert.equal(r.outcome, c.expected.outcome);
  const col = r.value.column;
  assert.equal(col.mode, "rigorous");
  assert.equal(col.converged, true);
  assert.deepEqual(col.warnings, c.expected.warnings);
  againstReference(c, col.profile.map(s => ({ ...s, L: s.L_kmol_h, V: s.V_kmol_h, x: c.components.map(id => s.x[id]) })),
    { D: col.D_kmol_h, Qc: col.condenser_kW * 1000, Qr: col.reboiler_kW * 1000 }, ref, KMOL_H);
  // the contract: residuals by group, their tolerances and the iterations, in the result's checks
  const chk = r.checks.columns.C1;
  for (const k of ["material", "equilibrium", "summation", "energy", "specifications"]) {
    assert.ok(chk.residuals[k] <= chk.tolerances[k], `${k}: ${chk.residuals[k]}`);
  }
  assert.ok(chk.iterations >= 0 && chk.converged === true);
  assert.ok(r.checks.material_kmol_h < 1e-9 && Math.abs(r.checks.energy_kW) < 1e-3, JSON.stringify(r.checks));
  // the products: a saturated liquid distillate below the azeotrope, the bottoms at the reboiler's temperature
  assert.ok(r.value.distillate.z[0] < fixture.cases["B1-ethanol-water-nrtl"].checks.azeotrope.model_x_ethanol);
  assert.ok(Math.abs(r.value.bottoms.T_K - col.T_bottoms_K) < 1e-3 && r.value.distillate.VF === 0);
  assert.match(col.notes[0], /not validated against data/);
  assert.deepEqual(COLUMN_MODES.find(m => m.mode === "rigorous").status, "available");
});

test("rigorous B1: other pairs of specifications (reboiler duty, boil-up ratio, distillate flow) reach the same column", () => {
  const { input } = B1();
  const base = run({ capability: "solve_column", input }).value.column;
  const { reflux_ratio: _R, bottoms_kmol_h: _B, ...rest } = input.column;
  for (const specs of [{ reflux_ratio: 2, reboiler_duty_kW: base.reboiler_kW }, { boilup_ratio: base.boilup_ratio, distillate_kmol_h: base.D_kmol_h },
    { condenser_duty_kW: base.condenser_kW, bottoms_kmol_h: base.B_kmol_h }]) {
    const r = run({ capability: "solve_column", input: { ...input, column: { ...rest, ...specs } } });
    assert.equal(r.outcome, "ok", JSON.stringify(specs) + JSON.stringify(r.error));
    const col = r.value.column;
    assert.ok(Math.abs(col.D_kmol_h - base.D_kmol_h) < 1e-6 * base.D_kmol_h, `${JSON.stringify(specs)}: D ${col.D_kmol_h}`);
    assert.ok(Math.abs(col.reflux_ratio - base.reflux_ratio) < 1e-6 * base.reflux_ratio, `${JSON.stringify(specs)}: R ${col.reflux_ratio}`);
    col.profile.forEach((s, j) => assert.ok(Math.abs(s.T_K - base.profile[j].T_K) < 1e-5, `stage ${s.stage}`));
  }
});

test("rigorous B1: two feeds of half the flow on the same stage give B1's column; on two stages, balances closed", () => {
  const { input } = B1();
  const base = run({ capability: "solve_column", input }).value;
  const half = Object.fromEntries(Object.entries(input.feed.flow_kmol_h).map(([k, v]) => [k, v / 2]));
  const fs = (stages) => ({ components: input.components, thermo: input.thermo,
    blocks: [{ id: "F1", type: "feed", spec: { ...input.feed, flow_kmol_h: half } }, { id: "F2", type: "feed", spec: { ...input.feed, flow_kmol_h: half } },
      { id: "C1", type: "column", spec: { ...input.column, feed_stage: stages } }, { id: "P1", type: "product" }, { id: "P2", type: "product" }],
    streams: [{ id: "S1", from: "F1.out", to: "C1.in" }, { id: "S2", from: "F2.out", to: "C1.in" }, { id: "D", from: "C1.distillate", to: "P1.in" }, { id: "B", from: "C1.bottoms", to: "P2.in" }] });
  const one = run({ capability: "solve_flowsheet", input: { flowsheet: fs([10, 10]) } });
  assert.equal(one.outcome, "ok");
  one.value.blocks.C1.profile.forEach((s, j) => assert.ok(Math.abs(s.T_K - base.column.profile[j].T_K) < 1e-6, `stage ${s.stage}`));
  const two = run({ capability: "solve_flowsheet", input: { flowsheet: fs([8, 12]) } });
  assert.equal(two.outcome, "ok");
  assert.ok(two.checks.material_kmol_h < 1e-9 && Math.abs(two.checks.energy_kW) < 1e-3);
  assert.deepEqual(two.value.blocks.C1.state.feed_stages, [8, 12]);
  // one feed stage for two feeds is refused, naming the fix
  const bad = run({ capability: "solve_flowsheet", input: { flowsheet: fs(10) } });
  assert.equal(bad.outcome, "invalid_input");
  assert.match(bad.error.message, /one feed stage per feed/);
});

test("rigorous: a partial condenser with Peng-Robinson (propane + n-butane at 15 bar): vapour distillate, balances closed", () => {
  const r = run({ capability: "solve_column", input: { components: ["propane", "n-butane"], thermo: { model: "PR" },
    feed: { flow_kmol_h: { propane: 40, "n-butane": 60 }, P_kPa: 1500, VF: 0 },
    column: { mode: "rigorous", stages: 15, feed_stage: 8, condenser: "partial", reflux_ratio: 2, distillate_kmol_h: 40 } } });
  assert.equal(r.outcome, "ok");
  const col = r.value.column;
  assert.equal(r.value.distillate.VF, 1);
  assert.ok(col.profile[0].V_kmol_h > 0 && col.profile[0].y);
  assert.ok(Math.abs(col.profile[0].T_K - r.value.distillate.T_K) < 1e-3, "the distillate leaves at the condenser's dew point");
  assert.ok(r.checks.material_kmol_h < 1e-9 && Math.abs(r.checks.energy_kW) < 1e-3, JSON.stringify(r.checks));
  for (const k of Object.keys(TOLERANCES)) assert.ok(col.residuals[k] <= col.tolerances[k], k);
  assert.ok(r.value.distillate.z[0] > 0.9 && col.profile.every((s, j) => j === 0 || s.T_K >= col.profile[j - 1].T_K - 1e-9), "lighter at the top");
});

test("rigorous C1: the pair without NRTL parameters is missing data, named; no column", () => {
  const c = caseOf("C1-missing-pair");
  const r = run({ capability: "solve_column", input: { components: c.components, thermo: { model: c.thermo.model },
    feed: { flow_kmol_h: Object.fromEntries(c.components.map((id, i) => [id, c.column.feed.z[i] * 100])), P_kPa: c.pressure_kPa, VF: 0 },
    column: { mode: "rigorous", stages: 10, feed_stage: 5, reflux_ratio: 2, distillate_kmol_h: 40 } } });
  assert.equal(r.outcome, c.expected.outcome);
  assert.ok(c.expected.message_names.every(n => r.error.message.includes(n)), r.error.message);
  assert.equal(r.value, undefined);
});

test("rigorous E2: a boil-up that would be negative does not converge, says what was tried and which specification to change; never a profile", () => {
  const c = caseOf("E2-negative-boilup");
  assert.throws(() => alphaColumn(c), e => {
    assert.equal(e.code, "NO_CONVERGENCE");
    assert.ok(c.expected.outcome_one_of.includes("not_converged"));
    assert.match(e.message, /Tried: Newton from the bubble-point start/);
    assert.match(e.message, /continuation/);
    assert.match(e.message, /boil-up would be -60/);
    assert.match(e.message, /larger distillate or a larger reflux ratio/);
    assert.match(e.message, /does not show that the column has no solution/);
    assert.ok(e.details.residuals && Array.isArray(e.details.tried));
    return true;
  });
});

test("rigorous: where a second liquid forms on the stages (1-butanol + water), the column is refused (PHASE_SPLIT, unsupported), never returned", () => {
  const r = run({ capability: "solve_column", input: { components: ["1-butanol", "water"], thermo: { model: "NRTL" },
    feed: { flow_kmol_h: { "1-butanol": 30, water: 70 }, T_K: 300, P_kPa: 101.325 },
    column: { mode: "rigorous", stages: 10, feed_stage: 5, reflux_ratio: 1, distillate_kmol_h: 40 } } });
  assert.equal(r.outcome, "unsupported");
  assert.equal(r.error.code, "PHASE_SPLIT");
  assert.match(r.error.message, /a second liquid would form on stages? 1/);
  assert.match(r.error.message, /milestone M2b/);
  assert.ok(r.error.details.stages.length >= 1 && r.error.details.stages[0].trial.length === 2);
  assert.equal(r.value, undefined);
});

test("rigorous: the input is checked, and what comes later is refused as not built yet", () => {
  const c = caseOf("A1-binary-alpha");
  const code = (extra, want, re) => assert.throws(() => alphaColumn(c, extra), e => e.code === want && (!re || re.test(e.message)), JSON.stringify(extra));
  code({ specs: [{ kind: "distillate_rate", value: 50 }, { kind: "bottoms_rate", value: 50 }] }, "BAD_INPUT", /not independent/);
  code({ specs: [{ kind: "reflux_ratio", value: 2 }, { kind: "condenser_duty", value: 1e6 }] }, "BAD_INPUT", /both fix the top/);
  code({ specs: [{ kind: "boilup_ratio", value: 2 }, { kind: "reboiler_duty", value: 1e6 }] }, "BAD_INPUT", /both fix the bottom/);
  code({ specs: [{ kind: "reflux_ratio", value: 2 }] }, "BAD_INPUT", /two specifications/);
  code({ specs: [{ kind: "reflux_ratio", value: 2 }, { kind: "distillate_purity", value: 0.99 }] }, "NOT_AVAILABLE", /M4/);
  code({ stages: 2 }, "BAD_INPUT", /3 or more/);
  code({ feeds: [{ stage: 12, flows: [50, 50], H_W: 0 }] }, "BAD_INPUT", /2 to 11/);
  code({ phases: "LL" }, "NOT_AVAILABLE", /M2b and M3/);
  code({ draws: [{ stage: 3 }] }, "NOT_AVAILABLE", /side draws/);
  code({ ends: { condenser: "total", reboiler: "none" } }, "NOT_AVAILABLE", /partial reboiler/);
  // the block: two specifications, a whole number of stages, the feed stage between the condenser and the reboiler
  const { input } = B1();
  for (const [column, re] of [[{ ...input.column, distillate_kmol_h: 90 }, /give two/], [{ ...input.column, stages: 2.5 }, /whole number/],
    [{ ...input.column, feed_stage: 20 }, /from 2 to 19/]]) {
    const r = run({ capability: "solve_column", input: { ...input, column } });
    assert.equal(r.outcome, "invalid_input");
    assert.match(r.error.message, re);
  }
});

test("rigorous: a previous solution starts the column (warm start), and is only a start: the residuals are checked again", () => {
  const c = caseOf("A3-ternary-partial-condenser"), first = alphaColumn(c);
  const again = alphaColumn(c, { start: first });
  assert.equal(again.solver.start, "previous solution");
  assert.ok(again.iterations <= 1);
  for (const k of Object.keys(TOLERANCES)) assert.ok(again.residuals[k] <= again.tolerances[k]);
  // a start from another column (another number of stages) is not used
  const other = alphaColumn(c, { start: { stages: first.stages.slice(1) } });
  assert.match(other.solver.start, /bubble-point/);
});

test("rigorous column in a project: written as format 6, reopened, solved again with the same numbers", () => {
  const { input } = B1();
  const fs = { components: input.components, thermo: input.thermo,
    blocks: [{ id: "F1", type: "feed", x: 40, y: 160, spec: input.feed }, { id: "C1", type: "column", x: 200, y: 160, spec: input.column },
      { id: "P1", type: "product", x: 360, y: 80 }, { id: "P2", type: "product", x: 360, y: 240 }],
    streams: [{ id: "S1", from: "F1.out", to: "C1.in" }, { id: "S2", from: "C1.distillate", to: "P1.in" }, { id: "S3", from: "C1.bottoms", to: "P2.in" }] };
  const doc = projectOf(initialState({ components: [], flowsheet: fs }), { version: "test" });
  assert.equal(doc.fugacity_project, 6);
  const text = JSON.stringify(doc);
  const back = stateFromProject(readProject(JSON.parse(text)));
  assert.deepEqual(back.flowsheet.blocks.find(b => b.id === "C1").spec, input.column);
  const sys = system({ components: input.components, model: "NRTL" });
  const a = solveFlowsheet(sys, fs), b = solveFlowsheet(sys, back.flowsheet);
  assert.equal(a.blocks.C1.state.mode, "rigorous");
  assert.deepEqual(b.blocks.C1.profile, a.blocks.C1.profile);
});

test("rigorous column in the worker: the same result as on this thread; a time limit stops it (out_of_time); cancel works", async () => {
  const { input } = B1();
  const req = { capability: "solve_column", input };
  const here = run(req), there = await runInNodeWorker(req);
  assert.equal(there.outcome, "ok");
  assert.deepEqual(there.value.column.profile, here.value.column.profile);
  const late = await runInNodeWorker({ ...req, limits: { time_ms: 5 } });
  assert.equal(late.outcome, "out_of_time");
  assert.equal(late.value, undefined, "an unfinished profile is never a result");
  const h = startNodeRun(req);
  h.cancel("stopped by the test");
  const r = await h.result;
  assert.equal(r.outcome, "cancelled");
  assert.equal(r.value, undefined);
  closeNodeWorkers();
});

// The performance budgets (proposal 0015, W9's rule: named benchmarks, time and convergence both counted, never met by
// skipping the phase check or loosening a tolerance). Times measured on the development container (2026-10-29) are in
// docs/models/columns.md; the budgets here are generous for slower CI machines.
const BENCHMARKS = [
  { name: "B1: ethanol + water, NRTL, ideal-gas vapour, 20 stages, R = 2, B given, tolerances of TOLERANCES, cold start", budget_ms: 10000, input: () => B1().input },
  { name: "four alcohols and water: methanol, ethanol, 1-propanol, water, NRTL, 40 stages, R = 3, D given, cold start (needs the continuation)", budget_ms: 60000,
    input: () => ({ components: ["methanol", "ethanol", "1-propanol", "water"], thermo: { model: "NRTL" },
      feed: { flow_kmol_h: { methanol: 20, ethanol: 20, "1-propanol": 10, water: 50 }, P_kPa: 101.325, VF: 0 },
      column: { mode: "rigorous", stages: 40, feed_stage: 20, reflux_ratio: 3, distillate_kmol_h: 40 } }) },
];
for (const bm of BENCHMARKS) {
  test(`performance budget: ${bm.name}`, t => {
    const t0 = performance.now();
    const r = run({ capability: "solve_column", input: bm.input() });
    const ms = performance.now() - t0;
    t.diagnostic(`${bm.name}: ${Math.round(ms)} ms, ${r.value?.column?.iterations} Newton iterations, ${r.value?.column?.solver?.tried?.join("; ")}`);
    assert.equal(r.outcome, "ok");
    for (const k of Object.keys(TOLERANCES)) assert.ok(r.value.column.residuals[k] <= r.value.column.tolerances[k], k);
    assert.ok(ms < bm.budget_ms, `${Math.round(ms)} ms over the budget of ${bm.budget_ms} ms`);
  });
}
