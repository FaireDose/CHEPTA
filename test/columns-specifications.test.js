// Design specifications and side draws of the rigorous column (proposal 0015, Part II, step 11; milestone M4):
// src/units/columns/specifications.js (an outer loop around the stage solver) and the side draws of engine.js.
//
// Against the independent reference validation/python/reference_mesh_specifications.py (fixture
// validation/fixtures/column_specifications.json), which writes the specifications among the equations of its Newton
// system and finds a draw rate by Brent's method: other routes to the same column. The cases:
// validation/data/columns/specifications/cases.json. S4 is the worked example of The ChemSep Book (case B2) asked
// the other way round: its published distillate purity is given, its published reflux ratio is compared.
//
// The property methods are the cases' (method_choice in each: Peng-Robinson for benzene + toluene, NRTL with an
// ideal-gas vapour for ethanol + water, docs/METHOD_SELECTION.md rules 2, 3 and 6); the model systems (constant
// relative volatility) are not real mixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, solveFlowsheet, stream } from "../src/index.js";
import { run } from "../src/api/dispatcher.js";
import { solveCascade } from "../src/units/columns/engine.js";
import { SPEC_TOLERANCE, DESIGN_SPECS } from "../src/units/columns/specifications.js";
import { anyBubbleT } from "../src/equilibrium/bubble-any.js";

const doc = JSON.parse(readFileSync(new URL("../validation/data/columns/specifications/cases.json", import.meta.url)));
const fixture = JSON.parse(readFileSync(new URL("../validation/fixtures/column_specifications.json", import.meta.url)));
const caseOf = id => doc.cases.find(c => c.id === id);
const tol = doc.tolerances.numerical.engine_against_reference;
const sum = v => v.reduce((a, b) => a + b, 0);
const SPEC_OF = { reflux_ratio: "reflux_ratio", distillate_flow_mol_s: "distillate_rate", bottoms_flow_mol_s: "bottoms_rate" };

/** A case as the engine takes it: the model system as an adapter, or CHEPTA's system. */
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
  // the feed: saturated liquid at the column's pressure (q = 1), or at its temperature
  const T = f.T_K ?? anyBubbleT(sys, f.z, P).T;
  return { sys, P_kPa: P, feeds: [{ stage: f.stage, flows, H_W: f.flow_mol_s * sys.enthalpy("liquid", T, P, f.z) }], ...common };
}

/** The engine's column against the reference's. */
function againstReference(c, r) {
  const ref = fixture.cases[c.id].rigorous;
  const rel = (a, b, t, what) => assert.ok(Math.abs(a - b) <= t * Math.abs(b), `${c.id}: ${what}: ${a} vs ${b}`);
  assert.equal(r.stages.length, ref.stages.length);
  r.stages.forEach((s, j) => {
    const q = ref.stages[j];
    assert.ok(Math.abs(s.T_K - q.T_K) <= tol.T_K_absolute, `${c.id} stage ${s.stage}: T ${s.T_K} vs ${q.T_K}`);
    rel(s.L_mol_s, q.L_mol_s, tol.flows_relative, `stage ${s.stage} L`);
    if (q.V_mol_s > 0) rel(s.V_mol_s, q.V_mol_s, tol.flows_relative, `stage ${s.stage} V`);
    s.x.forEach((v, i) => assert.ok(Math.abs(v - q.x[i]) <= tol.mole_fractions_absolute, `${c.id} stage ${s.stage}: x ${i} ${v} vs ${q.x[i]}`));
  });
  const D = sum(r.products.distillate.flows), B = sum(r.products.bottoms.flows);
  rel(D, ref.D_mol_s, tol.flows_relative, "D"); rel(B, ref.B_mol_s, tol.flows_relative, "B");
  rel(r.stages[0].L_mol_s / D, ref.reflux_ratio, tol.adjusted_relative, "reflux ratio");
  rel(r.duties.condenser_W, ref.Q_condenser_W, 10 * tol.flows_relative, "condenser duty");
  rel(r.duties.reboiler_W, ref.Q_reboiler_W, 10 * tol.flows_relative, "reboiler duty");
  r.products.draws.forEach((d, k) => {
    const q = ref.draws[k];
    assert.equal(d.stage, q.stage); assert.equal(d.phase, q.phase);
    rel(d.rate, q.rate_mol_s, tol.adjusted_relative, `side draw ${k + 1} rate`);
    d.flows.forEach((v, i) => assert.ok(Math.abs(v / d.rate - q.x[i]) <= tol.mole_fractions_absolute, `${c.id}: side draw ${k + 1} x ${i}`));
  });
  return ref;
}

/** Every design specification is reported as asked and as reached, within the tolerance. */
function specificationsMet(c, r) {
  const wanted = c.specs.filter(s => DESIGN_SPECS.includes(s.kind));
  assert.equal(r.specifications.length, wanted.length);
  r.specifications.forEach((q, k) => {
    assert.equal(q.asked, wanted[k].value, `${c.id}: specification ${k + 1} asked`);
    assert.ok(q.met && Math.abs(q.scaled_residual) <= SPEC_TOLERANCE, `${c.id}: ${q.label}: scaled residual ${q.scaled_residual}`);
    assert.ok(Math.abs(q.error - (q.achieved - q.asked)) < 1e-15);
    // for a fraction x the scaled residual is the difference of logits: |dx| <= 1e-6 x (1 - x)
    if (q.unit.endsWith("fraction") || q.unit === "fraction of the feed") assert.ok(Math.abs(q.error) <= 1.01 * SPEC_TOLERANCE * q.asked * (1 - q.asked), `${c.id}: ${q.label}: ${q.error}`);
  });
  assert.deepEqual(r.adjusted.map(a => a.variable), c.expected.adjusted, `${c.id}: the variables found`);
  assert.equal(r.tolerances.design_specifications, SPEC_TOLERANCE);
  assert.ok(r.residuals.design_specifications <= SPEC_TOLERANCE);
  // the column itself is converged as any other: every group of residuals within its tolerance
  for (const g of ["material", "equilibrium", "summation", "energy", "specifications"]) assert.ok(r.residuals[g] <= r.tolerances[g], `${c.id}: ${g} ${r.residuals[g]}`);
}

test("specification cases: each has its reference, its start and what it expects", () => {
  assert.equal(doc.chepta_column_specification_cases, 1);
  for (const c of doc.cases) {
    assert.ok(fixture.cases[c.id]?.rigorous, `${c.id}: no reference (run reference_mesh_specifications.py)`);
    const free = (c.draws ?? []).filter(d => d.rate_mol_s == null).length;
    assert.equal(c.specs.length, 2 + free, `${c.id}: two specifications, and one more for each side draw without a rate`);
    assert.ok(c.thermo.kind === "constant-alpha" || c.method_choice, `${c.id}: a real mixture names its method choice`);
    // the reference meets the specifications to its own tolerance
    assert.ok(fixture.cases[c.id].rigorous.residuals.specifications_mol_s < 1e-9, c.id);
  }
});

test("S1 (model binary): the purities of both products; the reflux ratio and the distillate flow are found, the distillate also by the component balance", () => {
  const c = caseOf("S1-binary-two-purities");
  const r = solveCascade(inputOf(c));
  specificationsMet(c, r);
  againstReference(c, r);
  const D = sum(r.products.distillate.flows), exact = fixture.cases[c.id].checks.distillate_by_component_balance_mol_s;
  assert.ok(Math.abs(D - exact) < 1e-5 * exact, `D ${D} vs the component balance ${exact}`);
  assert.match(r.solver.specifications.method, /outer loop around the stage solver/);
  assert.ok(r.solver.specifications.column_solves >= 2 && r.solver.specifications.column_solves < 30);
  assert.equal(r.sensitivities, undefined, "the solver's own tools do not leave with the result");
});

test("S2 (model ternary): a recovery with a given reflux ratio; the distillate flow is found", () => {
  const c = caseOf("S2-ternary-recovery-with-reflux");
  const r = solveCascade(inputOf(c));
  specificationsMet(c, r);
  const ref = againstReference(c, r);
  assert.ok(Math.abs(ref.recovery_in_distillate[1] - 0.9) < 1e-10, "the reference meets the recovery");
  assert.ok(Math.abs(r.stages[0].L_mol_s / sum(r.products.distillate.flows) - 3) < 1e-9, "the reflux ratio stays as given");
});

test("S3 (model ternary): a stage temperature inside the column and a component's flow in the bottoms", () => {
  const c = caseOf("S3-ternary-stage-temperature-component-flow");
  const r = solveCascade(inputOf(c));
  specificationsMet(c, r);
  againstReference(c, r);
  assert.ok(Math.abs(r.stages[11].T_K - 335) < 1e-4);
  assert.ok(Math.abs(r.products.bottoms.flows[0] - 0.5) < 1e-6);
});

test("S4 (The ChemSep Book's benzene + toluene column): asked for its published distillate purity, the reflux ratio is found", () => {
  const c = caseOf("S4-chemsep-benzene-toluene-purity");
  const r = solveCascade(inputOf(c));
  specificationsMet(c, r);
  const ref = againstReference(c, r);
  const R = r.stages[0].L_mol_s / sum(r.products.distillate.flows);
  // against the published column (another property method): agreement, not a test of the solver
  const lim = c.agreement_with_published_example.reflux_ratio_relative;
  assert.ok(Math.abs(R - c.published.reflux_ratio) <= lim * c.published.reflux_ratio, `reflux ratio ${R} vs the published ${c.published.reflux_ratio}`);
  assert.ok(Math.abs(ref.x_D[0] - c.specs[0].value) < 1e-10);
  // the same column with that reflux ratio given returns the purity asked for (the specification both ways)
  const back = solveCascade({ ...inputOf(c), specs: [{ kind: "reflux_ratio", value: R }, { kind: "bottoms_rate", value: c.specs[1].value }] });
  const d = back.products.distillate.flows;
  assert.ok(Math.abs(d[0] / sum(d) - c.specs[0].value) < 1e-7);
});

test("S5 (benzene + toluene): mass fractions of both products", () => {
  const c = caseOf("S5-benzene-toluene-mass-purities");
  const r = solveCascade(inputOf(c));
  specificationsMet(c, r);
  const ref = againstReference(c, r);
  assert.ok(Math.abs(ref.w_D[0] - 0.95) < 1e-10 && Math.abs(ref.w_B[1] - 0.95) < 1e-10, "the reference meets the mass fractions");
  assert.equal(r.specifications[0].basis, "mass");
  // a mass fraction of benzene (the lighter molecule) is a larger mole fraction
  const d = r.products.distillate.flows;
  assert.ok(d[0] / sum(d) > 0.95);
});

test("S6 (ethanol + water, NRTL): a purity below the azeotrope with a recovery", () => {
  const c = caseOf("S6-ethanol-water-purity-recovery");
  const r = solveCascade(inputOf(c));
  specificationsMet(c, r);
  const ref = againstReference(c, r);
  assert.ok(Math.abs(ref.D_mol_s - 0.95 * 50 / 0.8) < 1e-8, "the purity and the recovery fix the distillate flow");
});

test("S7 (model ternary): a liquid and a vapour side draw of given rates; the balances close with them", () => {
  const c = caseOf("S7-ternary-side-draws");
  const r = solveCascade(inputOf(c));
  const ref = againstReference(c, r);
  assert.equal(r.specifications, undefined);
  assert.equal(r.products.draws.length, 2);
  const out = r.products.distillate.flows.map((v, i) => v + r.products.bottoms.flows[i] + sum(r.products.draws.map(d => d.flows[i])));
  [30, 30, 40].forEach((f, i) => assert.ok(Math.abs(out[i] - f) < 1e-8, `component ${i}: ${out[i]}`));
  assert.ok(Math.abs(sum(r.products.bottoms.flows) - (100 - 28 - 30)) < 1e-8, "the bottoms: the feed less the distillate and the draws");
  assert.equal(r.stages[4].U_mol_s, 20); assert.equal(r.stages[11].W_mol_s, 10);
  assert.ok(ref.overall_component_balance_mol_s < 1e-9);
  // the energy balance with the draws: feed + reboiler = condenser + products
  const H = r.products.distillate.H_W + r.products.bottoms.H_W + sum(r.products.draws.map(d => d.H_W));
  assert.ok(Math.abs(0 + r.duties.reboiler_W - r.duties.condenser_W - H) < 1e-6 * r.duties.reboiler_W);
  // a liquid draw leaves less liquid below it, a vapour draw asks for more vapour from below
  const plain = solveCascade({ ...inputOf(c), draws: [] });
  assert.ok(r.stages[5].L_mol_s < plain.stages[5].L_mol_s);
});

test("S8 (model ternary): the rate of a side draw found for a recovery in it", () => {
  const c = caseOf("S8-ternary-side-draw-recovery");
  const r = solveCascade(inputOf(c));
  specificationsMet(c, r);
  const ref = againstReference(c, r);
  assert.equal(r.adjusted[0].draw, 1);
  assert.ok(Math.abs(r.adjusted[0].value - ref.found.rate_mol_s) <= tol.adjusted_relative * ref.found.rate_mol_s);
  assert.ok(Math.abs(r.products.draws[0].flows[1] / 30 - 0.5) < 1e-6);
});

// ---------------------------------------------------------------------------------------------------------------
// Refusals: an infeasible specification is refused with the reason and what would make it feasible

const refused = (c, patch, code, re) => assert.throws(() => solveCascade({ ...inputOf(c), ...patch }), e => {
  assert.equal(e.code, code, e.message);
  for (const r of [].concat(re)) assert.match(e.message, r);
  return true;
});

test("refused before anything is solved: the arithmetic of the specifications", () => {
  const c = caseOf("S1-binary-two-purities"), R = { kind: "reflux_ratio", value: 2 };
  refused(c, { specs: [R, { kind: "recovery", product: "distillate", component: "A", value: 1.2 }] }, "BAD_INPUT", [/between 0 and 1/, /more than was fed/]);
  refused(c, { specs: [R, { kind: "recovery", product: "distillate", component: "A", value: 1 }] }, "BAD_INPUT", /ask for 0\.99 or 0\.999/);
  refused(c, { specs: [R, { kind: "purity", product: "distillate", component: "A", value: 1 }] }, "BAD_INPUT", /infinitely many stages/);
  refused(c, { specs: [R, { kind: "purity", product: "top", component: "A", value: 0.9 }] }, "BAD_INPUT", /product must be/);
  refused(c, { specs: [R, { kind: "purity", product: "distillate", component: "Z", value: 0.9 }] }, "BAD_INPUT", /give its component, one of A, B/);
  refused(c, { specs: [R, { kind: "purity", product: "side_draw", component: "A", value: 0.9 }] }, "BAD_INPUT", /the column has none/);
  refused(c, { specs: [R, { kind: "stage_temperature", stage: 40, value: 330 }] }, "BAD_INPUT", /1 to 12/);
  refused(c, { specs: [R, { kind: "component_flow", product: "bottoms", component: "A", value: 60 }] }, "BAD_INPUT", /below its feed, 50 mol\/s/);
  refused(c, { specs: [R, { kind: "purity", product: "distillate", component: "A", value: 0.9, basis: "mass" }] }, "BAD_INPUT", /molar masses/);
  // a given product flow that cannot hold the purity: 0.99 of A in 60 mol/s needs 59.4 mol/s of A, and 50 are fed
  refused(c, { specs: [{ kind: "distillate_rate", value: 60 }, { kind: "purity", product: "distillate", component: "A", value: 0.99 }] }, "BAD_INPUT", [/0\.8333 at most/, /50\.51 mol\/s or less/]);
  refused(c, { specs: [{ kind: "purity", product: "distillate", component: "A", value: 0.7 }, { kind: "purity", product: "distillate", component: "B", value: 0.4 }] }, "BAD_INPUT", /add up to 1\.1/);
  refused(c, { specs: [{ kind: "purity", product: "distillate", component: "A", value: 0.9 }, { kind: "distillate_purity", component: "A", value: 0.9 }] }, "BAD_INPUT", /specified twice/);
  // the count of the degrees of freedom
  refused(c, { specs: [R, { kind: "distillate_rate", value: 50 }, { kind: "distillate_purity", component: "A", value: 0.9 }] }, "BAD_INPUT", /3 specifications given.*the column takes 2/);
  refused(c, { specs: [{ kind: "distillate_purity", component: "A", value: 0.9 }] }, "BAD_INPUT", /1 specification given/);
  refused(c, { specs: [R, { kind: "distillate_rate", value: 50 }], draws: [{ stage: 4, phase: "liquid" }] }, "BAD_INPUT", /side draw given without a rate/);
  // an absorber has no degree of freedom for a specification; side draws are distillation's
  refused(c, { ends: { condenser: "none", reboiler: "none" }, specs: [{ kind: "purity", product: "bottoms", component: "A", value: 0.1 }] }, "BAD_INPUT", /degrees of freedom are none/);
  refused(c, { ends: { condenser: "none", reboiler: "none" }, specs: [], draws: [{ stage: 4, phase: "liquid", rate: 5 }] }, "NOT_AVAILABLE", /side draws are built for a column with a condenser and a reboiler/);
  // side draws: their stage, phase and rate
  const two = c.specs.map(s => ({ ...s }));
  refused(c, { specs: [R, { kind: "distillate_rate", value: 50 }], draws: [{ stage: 1, phase: "liquid", rate: 5 }] }, "BAD_INPUT", /2 to 11/);
  refused(c, { specs: [R, { kind: "distillate_rate", value: 50 }], draws: [{ stage: 4, phase: "gas", rate: 5 }] }, "BAD_INPUT", /"liquid" or "vapour"/);
  refused(c, { specs: [R, { kind: "distillate_rate", value: 50 }], draws: [{ stage: 4, phase: "liquid", rate: 120 }] }, "BAD_INPUT", /nothing is left/);
  refused(c, { specs: [R, { kind: "distillate_rate", value: 60 }], draws: [{ stage: 4, phase: "liquid", rate: 50 }] }, "BAD_INPUT", /less the side draws, 50 mol\/s/);
  assert.equal(two.length, 2);
});

test("refused: a purity beyond a binary azeotrope, named with its composition and what would make it feasible (case E3)", () => {
  const e3 = JSON.parse(readFileSync(new URL("../validation/data/columns/E3-purity-above-azeotrope.json", import.meta.url)));
  const b1 = JSON.parse(readFileSync(new URL("../validation/fixtures/columns.json", import.meta.url))).cases["B1-ethanol-water-nrtl"].checks.azeotrope;
  const sys = system({ components: e3.components, model: e3.thermo.model, vapour: e3.thermo.vapour });
  const f = e3.column.feed, P = e3.pressure_kPa;
  const input = { sys, P_kPa: P, stages: e3.column.stages, feeds: [{ stage: f.stage, flows: f.z.map(z => z * f.flow_mol_s), H_W: f.flow_mol_s * sys.enthalpy("liquid", f.T_K, P, f.z) }] };
  let err;
  try { solveCascade({ ...input, specs: e3.specs.map(s => ({ ...s })) }); } catch (e) { err = e; }
  assert.equal(err?.code, "OUT_OF_RANGE");
  for (const word of e3.expected.message_names_from_M4) assert.ok(err.message.includes(word), word);
  assert.match(err.message, /does not cross an azeotrope at any reflux or number of stages/);
  assert.match(err.message, /What would make it feasible/);
  // the azeotrope named is the model's (the reference's own search, case B1)
  assert.ok(Math.abs(err.details.azeotrope.x[0] - b1.model_x_ethanol) < 1e-4, `${err.details.azeotrope.x[0]} vs ${b1.model_x_ethanol}`);
  assert.ok(Math.abs(err.details.azeotrope.T_K - b1.model_T_K) < 0.01);
  // on the mass basis too: 0.95 by mass is 0.88 by mole, just above the azeotrope; 0.9 by mass (0.78) is below it
  assert.throws(() => solveCascade({ ...input, specs: [{ kind: "reflux_ratio", value: 2 }, { kind: "distillate_purity", component: "ethanol", value: 0.96, basis: "mass" }] }), e => e.code === "OUT_OF_RANGE" && /azeotrope/.test(e.message));
  // a bottoms of nearly pure water is on the feed's side: not refused by the azeotrope
  const ok = solveCascade({ ...input, specs: [{ kind: "reflux_ratio", value: 2 }, { kind: "bottoms_purity", component: "water", value: 0.99 }] });
  assert.ok(Math.abs(ok.specifications[0].achieved - 0.99) < 1e-7);
});

test("refused: a reflux ratio too low for the purity; the message gives what the column reaches and where", () => {
  const c = caseOf("S4-chemsep-benzene-toluene-purity");
  let err;
  try { solveCascade({ ...inputOf(c), specs: [{ kind: "reflux_ratio", value: 0.3 }, { kind: "distillate_purity", component: "benzene", value: 0.99 }] }); } catch (e) { err = e; }
  assert.equal(err?.code, "OUT_OF_RANGE");
  assert.match(err.message, /cannot be 0\.99 in this column with reflux_ratio 0\.3 given/);
  assert.match(err.message, /below the minimum reflux for it/);
  assert.match(err.message, /What would make it feasible: a larger reflux_ratio/);
  const { lowest, highest } = err.details.range;
  assert.equal(err.details.range.variable, "distillate_rate");
  assert.ok(highest.value < 0.99 && highest.value > 0.7 && lowest.value < highest.value);
  // a purity inside the range the message gives is met
  const ok = solveCascade({ ...inputOf(c), specs: [{ kind: "reflux_ratio", value: 0.3 }, { kind: "distillate_purity", component: "benzene", value: 0.7 }] });
  assert.ok(Math.abs(ok.specifications[0].achieved - 0.7) < 1e-6);
});

test("refused: two purities that the stages cannot give even near total reflux; more stages make them feasible", () => {
  const c = caseOf("S4-chemsep-benzene-toluene-purity");
  const specs = [{ kind: "distillate_purity", component: "benzene", value: 0.9999 }, { kind: "bottoms_purity", component: "toluene", value: 0.9999 }];
  let err;
  try { solveCascade({ ...inputOf(c), specs }); } catch (e) { err = e; }
  assert.equal(err?.code, "OUT_OF_RANGE");
  assert.match(err.message, /cannot be met together on 10 stages/);
  assert.match(err.message, /at a reflux ratio of 100 it reaches 0\.99\d+ at most/);
  assert.match(err.message, /What would make it feasible: more stages/);
  // what the message advises works: 30 stages meet both
  const inp = inputOf(c);
  const more = solveCascade({ ...inp, stages: 30, feeds: [{ ...inp.feeds[0], stage: 15 }], specs });
  assert.ok(more.specifications.every(q => q.met));
});

// ---------------------------------------------------------------------------------------------------------------
// The Column block, the flowsheet and the request path (CHEPTA.run, the command line and MCP go through it)

const B2 = extra => ({ components: ["benzene", "toluene"], thermo: { model: "PR" },
  feed: { flow_kmol_h: { benzene: 180, toluene: 180 }, P_kPa: 111.4575, VF: 0 }, column: { mode: "rigorous", stages: 10, feed_stage: 5, ...extra } });

test("solve_column: design specifications through the request path, reported as asked and as reached", () => {
  const r = run({ capability: "solve_column", input: B2({ specifications: [
    { kind: "purity", product: "distillate", component: "benzene", value: 0.95, basis: "mass" },
    { kind: "component_flow", product: "bottoms", component: "benzene", flow_kmol_h: 6 }] }) });
  assert.equal(r.outcome, "ok", r.error?.message);
  const col = r.checks.columns.C1;
  assert.equal(col.specifications.length, 2);
  assert.deepEqual(col.specifications.map(q => [q.kind, q.product, q.component, q.basis, q.unit]),
    [["purity", "distillate", "benzene", "mass", "mass fraction"], ["component_flow", "bottoms", "benzene", "mole", "kmol/h"]]);
  assert.ok(Math.abs(col.specifications[0].achieved - 0.95) < 1e-7 && Math.abs(col.specifications[1].achieved - 6) < 1e-4);
  assert.ok(col.specifications.every(q => q.met));
  assert.deepEqual(Object.keys(col.adjusted), ["reflux_ratio", "distillate_kmol_h"]);
  // the streams carry what was asked
  assert.ok(Math.abs(r.value.bottoms.flows[0] - 6) < 1e-4);
  const d = r.value.distillate, w = d.flows[0] * 78.11184 / d.mass_kg_h;
  assert.ok(Math.abs(w - 0.95) < 1e-5, `mass fraction ${w}`);
  assert.equal(r.value.column.reflux_ratio, col.adjusted.reflux_ratio);
  assert.ok(r.value.column.notes.some(n => /Design specifications: .*asked 0\.95, reached 0\.95/.test(n)));
  assert.ok(Math.abs(r.checks.energy_kW) < 1e-5 && r.checks.material_kmol_h < 1e-8);
  // the short form of a purity, with a specification of the engine's own
  const s = run({ capability: "solve_column", input: B2({ bottoms_kmol_h: 180, distillate_purity: { component: "benzene", value: 0.93 } }) });
  assert.equal(s.outcome, "ok", s.error?.message);
  assert.ok(Math.abs(s.value.distillate.z[0] - 0.93) < 1e-6);
});

test("solve_column: what is wrong in a specification is said, and an infeasible one is invalid input with the reason", () => {
  const bad = (extra, re, outcome = "invalid_input") => { const r = run({ capability: "solve_column", input: B2(extra) }); assert.equal(r.outcome, outcome, JSON.stringify(extra)); assert.match(r.error.message, re); assert.equal(r.value, undefined); };
  bad({ reflux_ratio: 2, distillate_purity: 0.95 }, /name the component/);
  bad({ reflux_ratio: 2, specifications: [{ kind: "purity", product: "distillate", component: "benzene", value: 0.9, fraction: "mole" }] }, /unknown key fraction/);
  bad({ reflux_ratio: 2, specifications: [{ kind: "cleanliness", value: 1 }] }, /kind must be one of purity, recovery, component_flow, stage_temperature/);
  bad({ reflux_ratio: 2, specifications: [{ kind: "component_flow", product: "bottoms", component: "benzene" }] }, /flow_kmol_h or flow_kg_h/);
  bad({ reflux_ratio: 2, distillate_kmol_h: 180, distillate_purity: { component: "benzene", value: 0.9 } }, /too many specifications/);
  bad({ reflux_ratio: 2 }, /one more specification/);
  bad({ reflux_ratio: 0.3, distillate_purity: { component: "benzene", value: 0.99 } }, /below the minimum reflux/);
  bad({ reflux_ratio: 2, specifications: [{ kind: "recovery", product: "distillate", component: "benzene", value: 1.5 }] }, /between 0 and 1/);
  // the shortcut takes recoveries: a purity there is said to be the rigorous column's
  bad({ mode: "shortcut", stages: undefined, feed_stage: undefined, light_key: "benzene", heavy_key: "toluene", distillate_purity: { component: "benzene", value: 0.9 }, recovery_heavy_key_in_bottoms: 0.9, reflux_ratio: 2 },
    /the shortcut takes the recoveries of its two keys/);
  // a stripper with a side draw: not built
  const r = run({ capability: "solve_column", input: { ...B2({}), column: { configuration: "stripper", stages: 5, reboiler: "partial", boilup_ratio: 1, side_draws: [{ stage: 3, flow_kmol_h: 5 }] } } });
  assert.equal(r.outcome, "unsupported");
});

test("solve_column: side draws leave as streams, and the balances close; the rate of one is found for a specification", () => {
  const r = run({ capability: "solve_column", input: B2({ reflux_ratio: 3, distillate_kmol_h: 150, side_draws: [{ stage: 4, phase: "liquid", flow_kmol_h: 40 }, { stage: 7, phase: "vapour", flow_kmol_h: 30 }] }) });
  assert.equal(r.outcome, "ok", r.error?.message);
  assert.equal(r.value.side_draws.length, 2);
  const [a, b] = r.value.side_draws;
  assert.ok(Math.abs(a.F_kmol_h - 40) < 1e-9 && Math.abs(b.F_kmol_h - 30) < 1e-9);
  assert.ok(a.VF < 1e-9 && Math.abs(b.VF - 1) < 1e-9, "a liquid at its bubble point, a vapour at its dew point");
  // each draw has its stage's composition and temperature
  const p4 = r.value.column.profile[3], p7 = r.value.column.profile[6];
  assert.ok(Math.abs(a.z[0] - p4.x.benzene) < 1e-9 && Math.abs(a.T_K - p4.T_K) < 1e-4);
  assert.ok(Math.abs(b.z[0] - p7.y.benzene) < 1e-9 && Math.abs(b.T_K - p7.T_K) < 1e-4);
  assert.equal(p4.side_liquid_kmol_h, 40); assert.equal(p7.side_vapour_kmol_h, 30);
  assert.ok(Math.abs(r.value.bottoms.F_kmol_h - (360 - 150 - 70)) < 1e-8);
  assert.ok(r.checks.material_kmol_h < 1e-8 && Math.abs(r.checks.energy_kW) < 1e-4, `energy ${r.checks.energy_kW}`);
  assert.deepEqual(r.value.column.side_draws.map(d => [d.stage, d.phase]), [[4, "liquid"], [7, "vapour"]]);
  // without a flow: found for one more specification
  const f = run({ capability: "solve_column", input: B2({ reflux_ratio: 3, distillate_kmol_h: 150, side_draws: [{ stage: 4 }],
    specifications: [{ kind: "recovery", product: "side_draw", component: "toluene", value: 0.2 }] }) });
  assert.equal(f.outcome, "ok", f.error?.message);
  assert.ok(Math.abs(f.value.side_draws[0].flows[1] / 180 - 0.2) < 1e-6);
  assert.ok(f.checks.columns.C1.adjusted.side_draw_1_kmol_h > 0);
});

test("flowsheet: a side draw needs its stream on the outlet \"side\", and a stream there needs its side draw", () => {
  const base = (colSpec, side) => ({ components: ["benzene", "toluene"], thermo: { model: "PR" },
    blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { benzene: 180, toluene: 180 }, P_kPa: 111.4575, VF: 0 } }, { id: "C1", type: "column", spec: { mode: "rigorous", stages: 10, feed_stage: 5, reflux_ratio: 3, distillate_kmol_h: 150, ...colSpec } },
      { id: "P1", type: "product" }, { id: "P2", type: "product" }, ...(side ? [{ id: "P3", type: "product" }] : [])],
    streams: [{ id: "S1", from: "F1.out", to: "C1.in" }, { id: "S2", from: "C1.distillate", to: "P1.in" }, { id: "S3", from: "C1.bottoms", to: "P2.in" }, ...(side ? [{ id: "S4", from: "C1.side", to: "P3.in" }] : [])] });
  const ok = solveFlowsheet(base({ side_draws: [{ stage: 6, flow_kmol_h: 25 }] }, true));
  assert.ok(Math.abs(ok.streams.S4.F_kmol_h - 25) < 1e-9);
  assert.throws(() => solveFlowsheet(base({ side_draws: [{ stage: 6, flow_kmol_h: 25 }] }, false)), /1 side draw and 0 streams on the side outlet/);
  assert.throws(() => solveFlowsheet(base({}, true)), /1 stream on the side outlet and 0 side draws/);
  // a column without side draws is as before: two outlets
  assert.ok(solveFlowsheet(base({}, false)).streams.S2.F_kmol_h > 0);
  void stream;
});
