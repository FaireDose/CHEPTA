// Product specifications among the column's MESH equations, from a restart profile (proposal 0028, item 1;
// docs/decisions/2026-11-26-01-column-specs-in-mesh.md): src/units/columns/specifications.js and engine.js
// (product_spec). A column on design specifications that has a profile to start from (a flowsheet's next pass, a design
// specification's next solve, a start given) writes its specifications in place of the energy balances of the ends
// they free, one Newton solve; without a profile, or where that does not converge, the outer loop as before.
//
// Against the independent reference validation/python/reference_mesh_specifications.py (its specifications among its own
// equations): the cases of validation/data/columns/specifications/mesh-cases.json (fixture
// validation/fixtures/column_specifications_mesh.json) and those of cases.json that the MESH form takes (fixture
// column_specifications.json). Each case is solved cold (the outer loop) and from its own profile, perturbed (the MESH
// form): both must give the reference's column. The vapour + liquid condenser and the decanter's distillate purity are
// not in that reference: there the MESH form is compared with the outer loop.
//
// Property methods: the cases' (method_choice; Peng-Robinson for benzene + toluene, docs/METHOD_SELECTION.md rules 2 and
// 6); the constant relative volatility systems are not real mixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system } from "../src/index.js";
import { solveCascade } from "../src/units/columns/engine.js";
import { SPEC_TOLERANCE } from "../src/units/columns/specifications.js";
import { anyBubbleT } from "../src/equilibrium/bubble-any.js";

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const meshDoc = read("../validation/data/columns/specifications/mesh-cases.json");
const meshFx = read("../validation/fixtures/column_specifications_mesh.json");
const oldDoc = read("../validation/data/columns/specifications/cases.json");
const oldFx = read("../validation/fixtures/column_specifications.json");
const sum = v => v.reduce((a, b) => a + b, 0);
const SPEC_OF = { reflux_ratio: "reflux_ratio", distillate_flow_mol_s: "distillate_rate", bottoms_flow_mol_s: "bottoms_rate" };

function inputOf(c) {
  const f = c.column.feed, P = c.pressure_kPa, flows = f.z.map(z => z * f.flow_mol_s);
  const specs = c.specs.map(s => (SPEC_OF[s.kind] ? { kind: SPEC_OF[s.kind], value: s.value } : { ...s }));
  const draws = (c.draws ?? []).map(d => ({ stage: d.stage, phase: d.phase, ...(d.rate_mol_s != null ? { rate: d.rate_mol_s } : {}) }));
  const common = { stages: c.column.stages, ends: { condenser: c.column.condenser }, specs, ...(draws.length ? { draws } : {}) };
  if (c.thermo.kind === "constant-alpha") {
    const { alpha, reference_vapour_pressure: rp, latent_heat_J_mol: lam } = c.thermo;
    const thermo = { n: alpha.length, names: c.components, P_kPa: P, lnK: (x, y, T) => alpha.map(a => Math.log(a) + rp.A - rp.B_K / T - Math.log(P)),
      hL: () => 0, hV: () => lam, bubbleT: x => rp.B_K / (rp.A - Math.log(P / sum(alpha.map((a, i) => a * x[i])))) };
    return { thermo, feeds: [{ stage: f.stage, flows, H_W: (1 - f.q) * lam * f.flow_mol_s }], ...common };
  }
  const sys = system({ components: c.components, model: c.thermo.model, ...(c.thermo.vapour ? { vapour: c.thermo.vapour } : {}) });
  const T = f.T_K ?? anyBubbleT(sys, f.z, P).T;
  return { sys, P_kPa: P, feeds: [{ stage: f.stage, flows, H_W: f.flow_mol_s * sys.enthalpy("liquid", T, P, f.z) }], ...common };
}

/** A start: the column's profile with every flow and temperature moved (as a flowsheet's next pass would). */
const perturbed = (r, f = 0.03) => ({ stages: r.stages.map((s, j) => ({ l: s.l.map(a => a * (j % 2 ? 1 + f : 1 - f)), v: s.v.map(a => a * (1 + f / 2)), T_K: s.T_K + 0.5, L_mol_s: s.L_mol_s, ...(s.U_mol_s != null ? { U_mol_s: s.U_mol_s } : {}) })) });

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
}
// the MESH form meets its rows to 1e-10 and the reference to 1e-12: far tighter than the outer loop's SPEC_TOLERANCE
const TIGHT = { flows_relative: 1e-7, mole_fractions_absolute: 1e-8, T_K_absolute: 1e-6 };
const isMesh = r => /^among the MESH equations from (the last answer's profile|the start profile given)/.test(r.solver.specifications.method);

const MESH_OLD = ["S1-binary-two-purities", "S2-ternary-recovery-with-reflux", "S4-chemsep-benzene-toluene-purity", "S5-benzene-toluene-mass-purities", "S6-ethanol-water-purity-recovery"];
for (const [doc, fx, ids] of [[meshDoc, meshFx, meshDoc.cases.map(c => c.id)], [oldDoc, oldFx, MESH_OLD]]) {
  for (const id of ids) {
    test(`${id}: cold by the outer loop, from a profile among the MESH equations; both the reference's column`, () => {
      const c = doc.cases.find(q => q.id === id), inp = inputOf(c), ref = fx.cases[id].rigorous;
      const cold = solveCascade(inp);
      assert.ok(!isMesh(cold), `${id}: without a profile the outer loop (${cold.solver.specifications.method})`);
      againstReference(id, cold, ref, doc.tolerances.numerical.engine_against_reference);
      const warm = solveCascade({ ...inp, start: perturbed(cold) });
      assert.ok(isMesh(warm), `${id}: ${warm.solver.specifications.method}; ${warm.solver.specifications.tried.join("; ")}`);
      assert.equal(warm.solver.specifications.column_solves, 1);
      againstReference(id, warm, ref, TIGHT);
      warm.specifications.forEach(q => assert.ok(q.met && Math.abs(q.scaled_residual) <= 1e-8, `${id}: ${q.label} ${q.scaled_residual}`));
      // the free variables are reported as the outer loop reports them, for the next restart
      assert.deepEqual(warm.adjusted.map(a => a.variable), cold.adjusted.map(a => a.variable));
      warm.adjusted.forEach((a, k) => assert.ok(Math.abs(a.value - cold.adjusted[k].value) <= 1e-4 * Math.abs(cold.adjusted[k].value), `${id}: ${a.variable} ${a.value} vs ${cold.adjusted[k].value}`));
    });
  }
}

test("a profile far from the answer: the MESH form gives up and the outer loop meets the specifications (its tried says so)", () => {
  const c = meshDoc.cases.find(q => q.id === "M1-ternary-partial-two-purities"), inp = inputOf(c);
  // the profile of another column: a reflux ratio of 0.3 and a distillate of 80 mol/s
  const far = solveCascade({ ...inp, specs: [{ kind: "reflux_ratio", value: 0.3 }, { kind: "distillate_rate", value: 80 }] });
  const r = solveCascade({ ...inp, start: far });
  assert.ok(r.specifications.every(q => q.met && Math.abs(q.scaled_residual) <= SPEC_TOLERANCE));
  againstReference(c.id, r, meshFx.cases[c.id].rigorous, meshDoc.tolerances.numerical.engine_against_reference);
  if (!isMesh(r)) assert.match(r.solver.specifications.tried[0], /among the MESH equations from the start profile given: (not converged|converged, but)/);
});

test("the vapour + liquid condenser: the liquid distillate's purity and a bottoms recovery among the MESH equations, the outer loop's column", () => {
  const c = meshDoc.cases.find(q => q.id === "M1-ternary-partial-two-purities"), inp = inputOf(c);
  const ends = { condenser: "vapour_liquid", condenser_spec: { kind: "vapour_share", value: 0.3 } };
  // the values asked: those of the column at a reflux ratio of 3 and a distillate of 34 mol/s, rounded
  const fixed = solveCascade({ ...inp, ends, specs: [{ kind: "reflux_ratio", value: 3 }, { kind: "distillate_rate", value: 34 }] });
  const lq = fixed.products.distillate.flows, bt = fixed.products.bottoms.flows;
  const specs = [{ kind: "purity", product: "distillate", component: "A", value: +(lq[0] / sum(lq)).toFixed(3) }, { kind: "recovery", product: "bottoms", component: "C", value: +(bt[2] / 40).toFixed(3) }];
  const cold = solveCascade({ ...inp, ends, specs });
  assert.ok(!isMesh(cold));
  const warm = solveCascade({ ...inp, ends, specs, start: perturbed(cold) });
  assert.ok(isMesh(warm), warm.solver.specifications.tried.join("; "));
  const D = r => sum(r.products.distillate.flows), V = r => sum(r.products.vapour_distillate.flows);
  assert.ok(Math.abs(D(warm) - D(cold)) <= 1e-4 * D(cold) && Math.abs(V(warm) - V(cold)) <= 1e-4 * V(cold), `${D(warm)} ${D(cold)} ${V(warm)} ${V(cold)}`);
  warm.stages.forEach((s, j) => assert.ok(Math.abs(s.T_K - cold.stages[j].T_K) <= 1e-3, `stage ${j + 1}`));
  // a purity of the vapour distillate, the condenser's own vapour
  const vs = [{ kind: "purity", product: "vapour_distillate", component: "A", value: +(warm.products.vapour_distillate.flows[0] / V(warm)).toFixed(4) }, specs[1]];
  const w2 = solveCascade({ ...inp, ends, specs: vs, start: warm });
  assert.ok(isMesh(w2), w2.solver.specifications.tried.join("; "));
  assert.ok(Math.abs(w2.products.vapour_distillate.flows[0] / V(w2) - vs[0].value) <= 1e-9);
});

test("bad product specifications for the engine are refused before anything is solved", () => {
  const c = meshDoc.cases.find(q => q.id === "M1-ternary-partial-two-purities"), inp = inputOf(c);
  assert.throws(() => solveCascade({ ...inp, specs: [{ kind: "reflux_ratio", value: 3 }, { kind: "product_spec", target: "fraction", product: "side_draw", draw: 0, i: 1, value: 0.4 }] }), /side draw of given rate/);
  assert.throws(() => solveCascade({ ...inp, specs: [{ kind: "reflux_ratio", value: 3 }, { kind: "product_spec", target: "fraction", product: "bottoms", i: 1, value: 1.2 }] }), /below 1 for a fraction/);
  // only from a start
  assert.throws(() => solveCascade({ ...inp, specs: [{ kind: "reflux_ratio", value: 3 }, { kind: "product_spec", target: "fraction", product: "bottoms", i: 2, value: 0.58 }] }), /no start profile was given/);
});

test("a decanter (F9's column, VLL): the decanter's distillate purity and the bottoms recovery among the MESH equations, from the column's profile, give the same column", async () => {
  const { solveCase } = await import("../validation/columns_vll_engine_starts.mjs");
  const id = "F9-ethanol-dehydration-bottoms-purity-20-stages";
  const c = JSON.parse(readFileSync(new URL(`../validation/data/columns/vll/${id}.json`, import.meta.url)));
  const H = read("../validation/fixtures/columns-vll-purity.json").cases[id].three_phase.feed_enthalpy_J_mol[0];
  const r0 = solveCase(c, undefined, H);
  const d = r0.products.distillate.flows, b = r0.products.bottoms.flows, feed = c.column.feed.z.map(z => z * c.column.feed.flow_mol_s);
  const sys = system({ components: c.components, model: c.thermo.model, vapour: c.thermo.vapour });
  const f = c.column.feed;
  const base = { sys, P_kPa: c.pressure_kPa, stages: c.column.stages, phases: "VLL", ends: { condenser: "decanter" }, feeds: [{ stage: f.stage, flows: feed, H_W: f.flow_mol_s * H }] };
  for (const spec of [{ kind: "purity", product: "distillate", component: 0, value: d[0] / sum(d) }, { kind: "recovery", product: "bottoms", component: 1, value: b[1] / feed[1] }]) {
    const r = solveCascade({ ...base, specs: [spec], start: r0 });
    assert.ok(isMesh(r), `${spec.kind}: ${r.solver.specifications.tried.join("; ")}`);
    assert.ok(Math.abs(sum(r.products.bottoms.flows) - sum(b)) <= 1e-6 * sum(b), `${spec.kind}: B ${sum(r.products.bottoms.flows)} vs ${sum(b)}`);
    r.stages.forEach((s, j) => assert.ok(Math.abs(s.T_K - r0.stages[j].T_K) <= 1e-5, `${spec.kind}: stage ${j + 1}`));
  }
});

test("F13, CHEPTA-Lab's column SCDS15 at its phase boundary (VLL, total condenser, a reflux ratio of 2, 99.99 mass % water in the bottoms): the MESH form from the profile, the outer loop cold, and the three-phase reference agree", async () => {
  const { solveCase } = await import("../validation/columns_vll_engine_starts.mjs");
  const id = "F13-scds15-water-column-lab-boundary";
  const c = JSON.parse(readFileSync(new URL(`../validation/data/columns/vll/${id}.json`, import.meta.url)));
  const q = read("../validation/fixtures/columns-vll-mesh.json").cases[id].three_phase, tol = c.tolerances.numerical.engine_against_reference;
  const H = q.feed_enthalpy_J_mol[0], f = c.column.feed;
  const cold = solveCase(c, undefined, H);
  assert.ok(!isMesh(cold), cold.solver.specifications.method);
  const sys = system({ components: c.components, model: c.thermo.model, vapour: c.thermo.vapour });
  const inp = { sys, P_kPa: c.pressure_kPa, stages: c.column.stages, phases: "VLL", ends: { condenser: "total" },
    feeds: [{ stage: f.stage, flows: f.z.map(z => z * f.flow_mol_s), H_W: f.flow_mol_s * H }], specs: [{ kind: "reflux_ratio", value: 2 }, { ...c.specs[1] }] };
  const warm = solveCascade({ ...inp, start: perturbed(cold, 0.01) });
  assert.ok(isMesh(warm), warm.solver.specifications.tried.join("; "));
  assert.equal(warm.solver.specifications.column_solves, 1);
  // (the outer loop meets the purity to its SPEC_TOLERANCE only: the specification cases' wider tolerances)
  const loose = meshDoc.tolerances.numerical.engine_against_reference;
  for (const [name, r, t] of [["MESH form", warm, tol], ["outer loop", cold, { ...loose, duties_relative: 10 * loose.flows_relative }]]) {
    const tol = t;
    r.stages.forEach((s, j) => {
      const p = q.stages[j];
      assert.ok(Math.abs(s.T_K - p.T_K) <= tol.T_K_absolute, `${name} stage ${j + 1}: T ${s.T_K} vs ${p.T_K}`);
      assert.ok(Math.abs(s.L_mol_s - p.L_mol_s) <= tol.flows_relative * p.L_mol_s, `${name} stage ${j + 1}: L`);
      s.x.forEach((v, i) => assert.ok(Math.abs(v - p.x[i]) <= tol.mole_fractions_absolute, `${name} stage ${j + 1}: x ${i}`));
    });
    assert.ok(Math.abs(sum(r.products.distillate.flows) - q.D_mol_s) <= tol.flows_relative * q.D_mol_s, `${name}: D`);
    assert.ok(Math.abs(r.duties.reboiler_W - q.Q_reboiler_W) <= tol.duties_relative * Math.abs(q.Q_reboiler_W), `${name}: reboiler duty`);
  }
  const w = warm.products.bottoms.flows.map((v, i) => v * sys.MW[i]);
  assert.ok(Math.abs(w[1] / sum(w) - 0.9999) <= 1e-12, `bottoms water ${w[1] / sum(w)}`);
});
