// The full set of column specifications (proposal 0029, steps 2-6; the maintainer, 2026-11-26: all steps in one go):
// a reflux flow, the distillate as a share of the feed, a total condenser's subcooling, the partial condenser's and the
// reboiler's temperatures, a side heater, side draws by share and found among the MESH equations, pumparounds, the
// ratio of two flows and of two components.
//
// Against the independent reference validation/python/reference_mesh_package.py (the cases of
// validation/data/columns/specifications/package-cases.json; fixture validation/fixtures/column_spec_package.json): every
// case solved cold by the engine; the design specifications also from their own profile, perturbed, among the MESH
// equations (one column solve). Property method: Peng-Robinson for benzene + toluene (docs/METHOD_SELECTION.md rules 2
// and 6), as the cases say.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system } from "../src/index.js";
import { solveCascade } from "../src/units/columns/engine.js";
import { anyBubbleT } from "../src/equilibrium/bubble-any.js";
import { run } from "../src/api/dispatcher.js";

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const doc = read("../validation/data/columns/specifications/package-cases.json");
const fx = read("../validation/fixtures/column_spec_package.json");
const sum = v => v.reduce((a, b) => a + b, 0);
const ENGINE = { reflux_ratio: "reflux_ratio", distillate_flow_mol_s: "distillate_rate", bottoms_flow_mol_s: "bottoms_rate", reflux_flow_mol_s: "reflux_rate", distillate_to_feed: "distillate_to_feed" };

function inputOf(c) {
  const sys = system({ components: c.components, model: c.thermo.model });
  const f = c.column.feed, P = c.pressure_kPa, flows = f.z.map(z => z * f.flow_mol_s);
  const T = anyBubbleT(sys, f.z, P).T;
  const specs = c.specs.map(s => (ENGINE[s.kind] ? { kind: ENGINE[s.kind], value: s.value } : { ...s }));
  const draws = (c.draws ?? []).map(d => ({ stage: d.stage, phase: d.phase, ...(d.rate_mol_s != null ? { rate: d.rate_mol_s } : {}), ...(d.share != null ? { share: d.share } : {}) }));
  return { sys, P_kPa: P, stages: c.column.stages, ends: { condenser: c.column.condenser, ...(c.subcooling_K ? { subcooling_K: c.subcooling_K } : {}) },
    feeds: [{ stage: f.stage, flows, H_W: f.flow_mol_s * sys.enthalpy("liquid", T, P, f.z) }], specs,
    ...(draws.length ? { draws } : {}), ...(c.stage_duties ? { duties: c.stage_duties } : {}),
    ...(c.pumparounds ? { pumparounds: c.pumparounds.map(q => ({ from: q.from, to: q.to, rate: q.rate_mol_s, ...(q.Q_W != null ? { Q_W: q.Q_W } : { return_T_K: q.return_T_K }) })) } : {}) };
}
const perturbed = (r, f = 0.02) => ({ stages: r.stages.map((s, j) => ({ l: s.l.map(a => a * (j % 2 ? 1 + f : 1 - f)), v: s.v.map(a => a * (1 + f / 2)), T_K: s.T_K + 0.3, L_mol_s: s.L_mol_s,
  ...(s.U_mol_s != null ? { U_mol_s: s.U_mol_s } : {}), ...(s.W_mol_s != null ? { W_mol_s: s.W_mol_s } : {}) })) });

function againstReference(id, r, ref, t) {
  const rel = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${id}: ${what}: ${a} vs ${b}`);
  assert.equal(r.stages.length, ref.stages.length);
  r.stages.forEach((s, j) => {
    const q = ref.stages[j];
    assert.ok(Math.abs(s.T_K - q.T_K) <= t.T_K_absolute, `${id} stage ${s.stage}: T ${s.T_K} vs ${q.T_K}`);
    rel(s.L_mol_s, q.L_mol_s, t.flows_relative, `stage ${s.stage} L`);
    s.x.forEach((v, i) => assert.ok(Math.abs(v - q.x[i]) <= t.mole_fractions_absolute, `${id} stage ${s.stage}: x ${i} ${v} vs ${q.x[i]}`));
  });
  rel(sum(r.products.distillate.flows), ref.D_mol_s, t.flows_relative, "D");
  rel(sum(r.products.bottoms.flows), ref.B_mol_s, t.flows_relative, "B");
  rel(r.duties.reboiler_W, ref.Q_reboiler_W, 10 * t.flows_relative, "reboiler duty");
  rel(r.duties.condenser_W, ref.Q_condenser_W, 10 * t.flows_relative, "condenser duty");
  (r.products.draws ?? []).forEach((d, k) => rel(d.rate, ref.draw_rates_mol_s[k], t.flows_relative, `draw ${k + 1} rate`));
  (r.pumparounds ?? []).forEach((q, k) => rel(q.duty_W, ref.pumparounds[k].duty_W, 10 * t.flows_relative, `pumparound ${k + 1} duty`));
}
const TIGHT = { flows_relative: 1e-7, mole_fractions_absolute: 1e-8, T_K_absolute: 1e-6 };
const DESIGN = ["stage_temperature", "flow_ratio", "component_ratio", "purity"];

for (const c of doc.cases) {
  test(`${c.id}: ${c.title}, against the reference`, () => {
    const inp = inputOf(c), ref = fx.cases[c.id].rigorous;
    const r = solveCascade(inp);
    againstReference(c.id, r, ref, doc.tolerances.numerical.engine_against_reference);
    if (c.subcooling_K) {
      assert.ok(Math.abs(r.products.distillate.T_K - (r.stages[0].T_K - c.subcooling_K)) < 1e-12);
      assert.ok(Math.abs(r.products.distillate.T_K - ref.subcooled_T_K) <= doc.tolerances.numerical.engine_against_reference.T_K_absolute);
    }
    if (c.specs.some(s => DESIGN.includes(s.kind))) {
      // from its own profile, perturbed: the specifications among the MESH equations, one solve
      const warm = solveCascade({ ...inp, start: perturbed(r) });
      assert.match(warm.solver.specifications.method, /^among the MESH equations/, `${c.id}: ${warm.solver.specifications.tried.join("; ")}`);
      assert.equal(warm.solver.specifications.column_solves, 1);
      againstReference(c.id, warm, ref, TIGHT);
    } else if (c.pumparounds || c.draws?.some(d => d.share != null)) {
      // the MESH form from a start given, Newton from it
      const warm = solveCascade({ ...inp, start: perturbed(r) });
      againstReference(c.id, warm, ref, TIGHT);
    }
  });
}

test("the same column two ways: a reflux flow and the reflux ratio it gives; a share and the rate it gives", () => {
  const c = doc.cases.find(q => q.id === "P1-reflux-flow"), inp = inputOf(c);
  const a = solveCascade(inp);
  const b = solveCascade({ ...inp, specs: [{ kind: "reflux_ratio", value: a.stages[0].L_mol_s / sum(a.products.distillate.flows) }, inp.specs[1]] });
  a.stages.forEach((s, j) => assert.ok(Math.abs(s.T_K - b.stages[j].T_K) < 1e-6));
  const c5 = doc.cases.find(q => q.id === "P5-stage-duty-share-draw"), i5 = inputOf(c5), s = solveCascade(i5);
  const fixed = solveCascade({ ...i5, draws: [{ stage: 3, phase: "liquid", rate: s.products.draws[0].rate }] });
  fixed.stages.forEach((q, j) => assert.ok(Math.abs(q.T_K - s.stages[j].T_K) < 1e-6 && Math.abs(q.L_mol_s - s.stages[j].L_mol_s) < 1e-6 * q.L_mol_s));
  assert.ok(Math.abs(s.stages[2].U_mol_s / (s.stages[2].U_mol_s + s.stages[2].L_mol_s) - 0.1) < 1e-10);
});

test("refusals: a pumparound returned above its bubble point, subcooling on another condenser, a share outside 0 to 1", () => {
  const c = doc.cases.find(q => q.id === "P7-pumparound-return-temperature"), inp = inputOf(c);
  assert.throws(() => solveCascade({ ...inp, pumparounds: [{ ...inp.pumparounds[0], return_T_K: 420 }] }), e => e.code === "OUT_OF_RANGE" && /above its bubble point/.test(e.message));
  assert.throws(() => solveCascade({ ...inp, pumparounds: undefined, ends: { condenser: "partial", subcooling_K: 5 } }), e => e.code === "NOT_AVAILABLE" && /built for a total condenser/.test(e.message));
  assert.throws(() => solveCascade({ ...inp, pumparounds: undefined, draws: [{ stage: 3, phase: "liquid", share: 1.2 }] }), e => e.code === "BAD_INPUT" && /between 0 and 1/.test(e.message));
  assert.throws(() => solveCascade({ ...inp, pumparounds: [{ from: 3, to: 6, rate: 5, Q_W: -1000 }] }), e => e.code === "BAD_INPUT" && /to < from/.test(e.message));
});

test("the Column block: the new keys in a flowsheet, the energy balance closed with a pumparound and a side heater", () => {
  const req = col => ({ capability: "solve_flowsheet", input: { flowsheet: {
    components: ["benzene", "toluene"], thermo: { model: "PR" },
    blocks: [{ id: "F", type: "feed", spec: { flow_kmol_h: { benzene: 21.15, toluene: 21.15 }, T_K: 368, P_kPa: 111.4575 } },
      { id: "C", type: "column", spec: { mode: "rigorous", stages: 10, feed_stage: 5, ...col } }, { id: "D", type: "product" }, { id: "B", type: "product" }],
    streams: [{ id: "f", from: "F.out", to: "C.in" }, { id: "d", from: "C.distillate", to: "D.in" }, { id: "b", from: "C.bottoms", to: "B.in" }] } } });
  for (const col of [{ reflux_kmol_h: 64.8, distillate_kmol_h: 20.88 }, { reflux_ratio: 3, distillate_to_feed: 0.5, subcooling_K: 8 },
    { condenser: "partial", reflux_ratio: 3, condenser_T_K: 358.6 }, { reflux_ratio: 3, reboiler_T_K: 383.5 },
    { reflux_ratio: 3, distillate_kmol_h: 20.88, stage_duties_kW: [{ stage: 7, duty_kW: 50 }], pumparounds: [{ from_stage: 6, to_stage: 3, flow_kmol_h: 28.8, duty_kW: -80 }] },
    { reflux_ratio: 3, specifications: [{ kind: "flow_ratio", numerator: "distillate", denominator: "feed", value: 0.45 }] }]) {
    const r = run(req(col));
    assert.equal(r.outcome, "ok", `${JSON.stringify(col)}: ${r.error?.message}`);
    assert.ok(Math.abs(r.value.balance.energy_kW) < 1e-6, `${JSON.stringify(col)}: energy ${r.value.balance.energy_kW}`);
    Object.values(r.value.balance.material_kmol_h).forEach(v => assert.ok(Math.abs(v) < 1e-9));
    if (col.subcooling_K) assert.ok(Math.abs(r.value.streams.d.T_K - (r.value.blocks.C.profile[0].T_K - 8)) < 1e-6);
    if (col.pumparounds) assert.ok(Math.abs(r.value.blocks.C.state.pumparounds[0].duty_kW + 80) < 1e-9);
  }
});

test("project files: a column with a key of proposal 0029 is written in format 12, read back, and refused by format 11 naming format 12", async () => {
  const { projectOf, readProject, stateFromProject, PROJECT_FORMAT } = await import("../src/ui/project.js");
  const { initialState } = await import("../src/ui/app-logic.js");
  assert.equal(PROJECT_FORMAT, 12);
  const fs = { components: ["benzene", "toluene"], thermo: { model: "PR" },
    blocks: [{ id: "F", type: "feed", spec: { flow_kmol_h: { benzene: 21.15, toluene: 21.15 }, T_K: 368, P_kPa: 111.4575 } },
      { id: "C", type: "column", spec: { mode: "rigorous", stages: 10, feed_stage: 5, reflux_ratio: 3, distillate_kmol_h: 20.88, pumparounds: [{ from_stage: 6, to_stage: 3, flow_kmol_h: 28.8, duty_kW: -80 }] } },
      { id: "D", type: "product" }, { id: "B", type: "product" }],
    streams: [{ id: "f", from: "F.out", to: "C.in" }, { id: "d", from: "C.distillate", to: "D.in" }, { id: "b", from: "C.bottoms", to: "B.in" }] };
  const doc = projectOf(initialState({ components: [], flowsheet: fs }), { version: "test", now: new Date("2026-11-27T00:00:00Z") });
  assert.equal(doc.fugacity_project, 12);
  const back = stateFromProject(readProject(JSON.parse(JSON.stringify(doc)))).flowsheet;
  assert.deepEqual(back.blocks.find(b => b.id === "C").spec.pumparounds, fs.blocks[1].spec.pumparounds);
  assert.throws(() => readProject({ ...doc, fugacity_project: 11 }), /need format 12 \(this file says format 11\)/);
  // without such a key the format is unchanged
  const plain = { ...fs, blocks: fs.blocks.map(b => (b.id === "C" ? { ...b, spec: { ...b.spec, pumparounds: undefined } } : b)) };
  assert.ok(projectOf(initialState({ components: [], flowsheet: plain }), { version: "test" }).fugacity_project < 12);
});
