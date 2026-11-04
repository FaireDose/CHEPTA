// Proposal 0015, milestone M3, step 7 (W2): columns without a condenser (the absorber; the stripper, with a reboiler or
// none) and columns with nonvolatile components.
// Against: W2's independent reference validation/python/reference_mesh_open.py (fixture
// validation/fixtures/columns-open.json; W7's M3 cases were not on main when this was written), within the
// tolerances W7's cases use for the engine against a reference; and the Kremser equation, exact for an absorber with
// constant K-values and constant flows (here a dilute solute, so the flows change by about 1e-6).
// The property methods: Peng-Robinson for the lean-oil absorber (docs/METHOD_SELECTION.md rule 1: hydrocarbons at
// 28 bar); NRTL for ethanol + water (rule 3); Modified UNIFAC 2.0 for the columns with glucose, the only open method
// with glucose's pairs (predicted tier; glucose is nonvolatile and has no NRTL pairs in the databank).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { system, solveFlowsheet, flowsheetStatus } from "../src/index.js";
import { run } from "../src/api/dispatcher.js";
import { solveCascade } from "../src/units/columns/engine.js";
import { readProject, projectOf, stateFromProject } from "../src/ui/project.js";
import { initialState } from "../src/ui/app-logic.js";
import { runInNodeWorker, closeNodeWorkers } from "../src/runtime/node-worker.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const fixture = JSON.parse(readFileSync(new URL("../validation/fixtures/columns-open.json", import.meta.url)));
// the tolerances of W7's cases for the engine against an independent reference (validation/data/columns/*.json)
const TOL = JSON.parse(readFileSync(new URL("../validation/data/columns/B1-ethanol-water-nrtl.json", import.meta.url))).tolerances.numerical.engine_against_reference;
const KMOL_H = 3.6;
const sum = v => v.reduce((a, b) => a + b, 0);

for (const [id, { case: c, rigorous: ref }] of Object.entries(fixture.cases)) {
  test(`${id} (${c.reboiler === "partial" ? "a reboiler" : "no reboiler"}): the reference's profile and duties within the cases' tolerances`, () => {
    const sys = system({ components: c.components, model: c.model });
    const r = solveCascade({ sys, P_kPa: c.pressure_kPa, stages: c.stages, ends: { condenser: "none", reboiler: c.reboiler },
      feeds: c.feeds.map((f, k) => ({ stage: f.stage, flows: f.flows_mol_s, H_W: ref.feed_enthalpy_J_mol[k] * sum(f.flows_mol_s), q: f.phase === "liquid" ? 1 : 0, T_K: f.T_K })),
      specs: c.specs.map(s => ({ kind: s.kind, value: s.value })) });
    assert.match(r.solver.start, /sum-rates|continuation/);
    r.stages.forEach((s, j) => {
      const q = ref.stages[j], where = `${id} stage ${s.stage}`;
      assert.ok(Math.abs(s.T_K - q.T_K) <= TOL.T_K_absolute, `${where}: T ${s.T_K} vs ${q.T_K}`);
      assert.ok(Math.abs(s.L_mol_s - q.L_mol_s) <= TOL.flows_relative * q.L_mol_s, `${where}: L`);
      assert.ok(Math.abs(s.V_mol_s - q.V_mol_s) <= TOL.flows_relative * q.V_mol_s, `${where}: V`);
      s.x.forEach((v, i) => assert.ok(Math.abs(v - q.x[i]) <= TOL.mole_fractions_absolute, `${where}: x ${i}`));
    });
    assert.equal(r.duties.condenser_W, 0);
    if (c.reboiler === "none") assert.equal(r.duties.reboiler_W, 0);
    else assert.ok(Math.abs(r.duties.reboiler_W / ref.Q_reboiler_W - 1) <= TOL.duties_relative);
    assert.equal(r.products.distillate.phase, "vapour");
    assert.equal(r.stages[0].name, "top");
  });
}

test("the Kremser equation: an absorber with constant K-values and a dilute solute absorbs (A^(N+1) - A)/(A^(N+1) - 1) of it", () => {
  // a model system: a carrier gas (K = 1e6), the solute (K = 0.8), a solvent (K = 1e-8); one heat capacity for every
  // component and phase (no heat of absorption), so every stage stays at the feeds' 300 K
  const K = [1e6, 0.8, 1e-8], cp = 30;
  const thermo = { n: 3, names: ["carrier", "solute", "solvent"], P_kPa: 100, lnK: () => K.map(Math.log),
    hL: (x, T) => cp * (T - 300), hV: (y, T) => cp * (T - 300), bubbleT: () => 300 };
  const L = 120, V = 100, ys = 1e-6, N = 8;
  const r = solveCascade({ thermo, stages: N, ends: { condenser: "none", reboiler: "none" },
    feeds: [{ stage: 1, flows: [0, 0, L], H_W: 0, q: 1, T_K: 300 }, { stage: N, flows: [V * (1 - ys), V * ys, 0], H_W: 0, q: 0, T_K: 300 }], specs: [] });
  const A = L / (K[1] * V);
  const kremser = (A ** (N + 1) - A) / (A ** (N + 1) - 1);
  const absorbed = 1 - r.products.distillate.flows[1] / (V * ys);
  assert.ok(Math.abs(absorbed - kremser) < 1e-5, `absorbed ${absorbed}, Kremser ${kremser}`);
  r.stages.forEach(s => assert.ok(Math.abs(s.T_K - 300) < 1e-9));
});

/** An absorber or a stripper through the request path, its feeds a list (kmol/h). */
const LEAN_OIL = () => {
  const { case: c } = fixture.cases["W2-ABS1-lean-oil"];
  return { components: c.components, thermo: { model: "PR" },
    feed: c.feeds.map(f => ({ flow_kmol_h: Object.fromEntries(c.components.map((id, i) => [id, f.flows_mol_s[i] * KMOL_H]).filter(([, v]) => v > 0)), T_K: f.T_K, P_kPa: c.pressure_kPa })),
    column: { configuration: "absorber", stages: c.stages, feed_stage: c.feeds.map(f => f.stage) } };
};

test("the absorber through solve_column (two feeds): the reference's profile, a vapour top product, no reflux or boil-up, no specification", () => {
  const input = LEAN_OIL(), ref = fixture.cases["W2-ABS1-lean-oil"].rigorous;
  const r = run({ capability: "solve_column", input });
  assert.equal(r.outcome, "ok", r.error?.message);
  const col = r.value.column;
  assert.equal(col.configuration, "absorber");
  assert.equal(col.mode, "rigorous");
  assert.equal(col.reflux_ratio, null);
  assert.equal(col.boilup_ratio, null);
  assert.equal(r.value.distillate.VF, 1);
  assert.equal(r.value.feed.length, 2);
  col.profile.forEach((s, j) => assert.ok(Math.abs(s.T_K - ref.stages[j].T_K) <= TOL.T_K_absolute));
  assert.match(col.notes[0], /Rigorous absorber: 6 stages \(1 the top stage, without a condenser, 6 the bottom stage, without a reboiler\)/);
  assert.equal(r.checks.columns.C1.converged, true);
});

test("refusals and degrees of freedom: an absorber takes no specification, a reboiled stripper one; the shortcut is for distillation", () => {
  const input = LEAN_OIL();
  const bad = column => run({ capability: "solve_column", input: { ...input, column: { ...input.column, ...column } } });
  for (const [column, re] of [[{ reflux_ratio: 2 }, /reflux_ratio: the absorber takes no specification/], [{ boilup_ratio: 0.2 }, /boilup_ratio: the absorber takes no specification/],
    [{ mode: "shortcut" }, /solved stage by stage/], [{ reboiler: "partial" }, /an absorber has no reboiler/], [{ feed_stage: [0, 6] }, /from 1 to 6/],
    [{ configuration: "kettle" }, /configuration must be one of/]]) {
    const r = bad(column);
    assert.equal(r.outcome, "invalid_input", JSON.stringify(column));
    assert.match(r.error.message, re, JSON.stringify(column));
  }
  assert.equal(bad({ configuration: "extraction" }).outcome, "unsupported");
  assert.match(run({ capability: "solve_column", input: { ...input, column: { configuration: "distillation", mode: "rigorous", reboiler: "none", stages: 6, feed_stage: 3, reflux_ratio: 2, distillate_kmol_h: 100 } } }).error.message, /a distillation column has a partial reboiler/);
  // the degrees of freedom: the stages and the feed stages, and one specification with a reboiler
  const sys = system({ components: ["ethanol", "water"], model: "NRTL" });
  const fs = column => ({ components: ["ethanol", "water"], blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { ethanol: 7.2, water: 352.8 }, T_K: 360, P_kPa: 101.325 } },
    { id: "C1", type: "column", spec: column }, { id: "P1", type: "product" }, { id: "P2", type: "product" }],
    streams: [{ id: "S1", from: "F1.out", to: "C1.in" }, { id: "D", from: "C1.distillate", to: "P1.in" }, { id: "B", from: "C1.bottoms", to: "P2.in" }] });
  const st = flowsheetStatus(sys, fs({ configuration: "stripper", reboiler: "partial", stages: 8, feed_stage: 1 })).blocks.C1;
  assert.equal(st.needed, 3);
  assert.equal(st.given, 2);
  assert.equal(flowsheetStatus(sys, fs({ configuration: "stripper", stages: 8, feed_stage: 1 })).blocks.C1.needed, 2);
});

test("a reboiled stripper by its bottoms flow, and through the request path with a boil-up ratio: the reference's", () => {
  const { case: c, rigorous: ref } = fixture.cases["W2-STR2-reboiled-stripper"];
  const f = c.feeds[0];
  const input = { components: c.components, thermo: { model: "NRTL" },
    feed: { flow_kmol_h: Object.fromEntries(c.components.map((id, i) => [id, f.flows_mol_s[i] * KMOL_H])), T_K: f.T_K, P_kPa: c.pressure_kPa },
    column: { configuration: "stripper", reboiler: "partial", stages: c.stages, feed_stage: 1, boilup_ratio: c.specs[0].value } };
  const r = run({ capability: "solve_column", input });
  assert.equal(r.outcome, "ok", r.error?.message);
  assert.ok(Math.abs(r.value.column.reboiler_kW * 1000 / ref.Q_reboiler_W - 1) <= TOL.duties_relative);
  assert.ok(Math.abs(r.value.column.boilup_ratio - c.specs[0].value) < 1e-9);
  // the same column given by the bottoms flow the boil-up ratio gave
  const { boilup_ratio: _b, ...rest } = input.column;
  const byB = run({ capability: "solve_column", input: { ...input, column: { ...rest, bottoms_kmol_h: ref.B_mol_s * KMOL_H } } });
  assert.equal(byB.outcome, "ok", byB.error?.message);
  assert.ok(Math.abs(byB.value.column.boilup_ratio - c.specs[0].value) < 1e-6);
});

// ---- nonvolatile components (proposal 0009, step 5)

const BEER = { components: ["ethanol", "water", "glucose"], thermo: { model: "MOD-UNIFAC-2" },
  feed: [{ flow_kmol_h: { ethanol: 14.4, water: 338.4, glucose: 7.2 }, T_K: 360, P_kPa: 101.325 }, { flow_kmol_h: { water: 72 }, T_K: 385, P_kPa: 101.325 }],
  column: { configuration: "stripper", stages: 10, feed_stage: [1, 10] } };

test("a nonvolatile component in a column: glucose stays in the liquid and leaves with the bottoms; the balances close on every stage", () => {
  const r = run({ capability: "solve_column", input: BEER });
  assert.equal(r.outcome, "ok", r.error?.message);
  const col = r.value.column;
  assert.equal(r.value.distillate.flow_kmol_h.glucose, 0, "the top vapour carries no glucose");
  assert.ok(Math.abs(r.value.bottoms.flow_kmol_h.glucose - 7.2) < 1e-12);
  col.profile.forEach(s => { if (s.y) assert.ok(s.y.glucose < 1e-15, `stage ${s.stage}: y glucose ${s.y.glucose}`); });
  const chk = r.checks.columns.C1;
  for (const g of ["material", "equilibrium", "summation", "energy"]) assert.ok(chk.residuals[g] <= chk.tolerances[g], g);
  // the ethanol is stripped: almost all of it in the top vapour
  assert.ok(r.value.distillate.flow_kmol_h.ethanol / 14.4 > 0.99);
  // and in a distillation column with a total condenser: no glucose in the distillate
  const dist = run({ capability: "solve_column", input: { ...BEER, feed: BEER.feed[0], column: { mode: "rigorous", stages: 12, feed_stage: 5, reflux_ratio: 3, distillate_kmol_h: 43.2 } } });
  assert.equal(dist.outcome, "ok", dist.error?.message);
  assert.ok(dist.value.distillate.flow_kmol_h.glucose < 1e-20);
});

test("the dew point of a vapour without its nonvolatile component (its mole fraction 0) is the one of the volatile components", () => {
  // the boiling point of glucose is not a number: it no longer spoils the dew point's search range
  const sys = system({ components: ["ethanol", "water", "glucose"], model: "MOD-UNIFAC-2" });
  const two = system({ components: ["ethanol", "water"], model: "MOD-UNIFAC-2" });
  assert.ok(Math.abs(sys.dewT([0.226, 0.774, 0], 101.325).T - two.dewT([0.226, 0.774], 101.325).T) < 1e-6);
});

test("an absorber in a project: format 6, reopened, the same numbers; the command line and the worker agree", async () => {
  const input = LEAN_OIL();
  const fs = { components: input.components, thermo: input.thermo,
    blocks: [{ id: "F1", type: "feed", x: 40, y: 60, spec: input.feed[0] }, { id: "F2", type: "feed", x: 40, y: 260, spec: input.feed[1] },
      { id: "C1", type: "column", x: 220, y: 160, spec: input.column }, { id: "P1", type: "product", x: 400, y: 80 }, { id: "P2", type: "product", x: 400, y: 240 }],
    streams: [{ id: "OIL", from: "F1.out", to: "C1.in" }, { id: "GAS", from: "F2.out", to: "C1.in" }, { id: "LEAN", from: "C1.distillate", to: "P1.in" }, { id: "RICH", from: "C1.bottoms", to: "P2.in" }] };
  const doc = projectOf(initialState({ components: [], flowsheet: fs }), { version: "test" });
  assert.equal(doc.fugacity_project, 6);
  const back = stateFromProject(readProject(JSON.parse(JSON.stringify(doc))));
  assert.deepEqual(back.flowsheet.blocks.find(b => b.id === "C1").spec, input.column);
  const sys = system({ components: input.components, model: "PR" });
  assert.deepEqual(solveFlowsheet(sys, back.flowsheet).blocks.C1.profile, solveFlowsheet(sys, fs).blocks.C1.profile);
  const dir = mkdtempSync(join(tmpdir(), "chepta-abs-")), file = join(dir, "absorber.chepta.json");
  writeFileSync(file, JSON.stringify(doc));
  const cli = spawnSync(process.execPath, [join(ROOT, "bin", "chepta.mjs"), "run", file], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
  assert.equal(cli.status, 0, cli.stderr);
  const lib = run({ capability: "solve_flowsheet", input: { project: doc } });
  assert.deepEqual(JSON.parse(cli.stdout).value.blocks.C1.profile, lib.value.blocks.C1.profile);
  const there = await runInNodeWorker({ capability: "solve_column", input });
  assert.equal(there.outcome, "ok");
  assert.deepEqual(there.value.column.profile, run({ capability: "solve_column", input }).value.column.profile);
  closeNodeWorkers();
});

test("the absorber's start is robust: pressures a last digit to 1e-6 apart give the same profile (the start's liquid from the liquid feeds)", () => {
  // from the overall feed, mostly gas, the equation of state found one root and K = 1 on the stages (the trivial
  // solution); a last-digit difference, such as between two JavaScript engines, then decided which branch Newton reached
  const { case: c, rigorous: ref } = fixture.cases["W2-ABS1-lean-oil"];
  const sys = system({ components: c.components, model: c.model });
  for (const eps of [0, 1e-15, 1e-12, -1e-9, 1e-6]) {
    const P = c.pressure_kPa * (1 + eps);
    const r = solveCascade({ sys, P_kPa: P, stages: c.stages, ends: { condenser: "none", reboiler: "none" },
      feeds: c.feeds.map(f => { const F = sum(f.flows_mol_s), z = f.flows_mol_s.map(v => v / F);
        return { stage: f.stage, flows: f.flows_mol_s, H_W: F * sys.enthalpy(f.phase, f.T_K, P, z), q: f.phase === "liquid" ? 1 : 0, T_K: f.T_K }; }),
      specs: [] });
    r.stages.forEach((s, j) => assert.ok(Math.abs(s.T_K - ref.stages[j].T_K) < 1e-3, `P x (1 + ${eps}), stage ${s.stage}: ${s.T_K} vs ${ref.stages[j].T_K}`));
  }
});
