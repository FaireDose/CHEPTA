// Columns with a dimerizing acid in the vapour (acetic acid; docs/decisions/2026-11-11-08-acetic-acid-columns.md): the
// rigorous column's stages with the chemical theory of src/thermo/vapour.js (true species monomer and dimer, apparent
// mole fractions on the stage; sys.lnKAssociation) and the vapour's enthalpy with the dimerization enthalpy, as the
// flash has them.
//
// Against the independent reference validation/python/reference_mesh_acid.py (fixture
// validation/fixtures/columns_acid.json; the cases: validation/data/columns/acid/cases.json), which takes the vapour's
// species from the liquid (the bubble-point form) where the engine takes the fugacity coefficients of the apparent
// vapour; against the measured vapour-liquid equilibria the pair was fitted to and checked with (Chang et al. 2005,
// Calvar et al. 2005, the ThermoML Archive); and against an open worked example, the direct distillation column of
// Pirola et al. (Chem. Eng. Trans. 32 (2013) 1897; PRO/II, modified UNIFAC with Hayden-O'Connell), as an agreement
// between two property methods, kept apart from the numerical tolerances.
//
// The property method, by docs/METHOD_SELECTION.md rule 3: polar, no electrolytes, below 10 bar, with fitted pairs:
// NRTL with an ideal-gas vapour, and for acetic acid the chemical theory (CHEPTA's default for a dimerizing acid).
// Tests that switch the chemical theory off (association: false) do it on purpose, to show what it changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, stream, runUnit } from "../src/index.js";
import { solveCascade, cascadeThermo, TOLERANCES } from "../src/units/columns/engine.js";
import { dimerK, dimerSplit, dimerEnthalpy } from "../src/thermo/vapour.js";
import { componentRecord } from "../src/thermo/components.js";

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const doc = read("../validation/data/columns/acid/cases.json");
const fixture = read("../validation/fixtures/columns_acid.json");
const caseOf = id => doc.cases.find(c => c.id === id);
const sum = v => v.reduce((a, b) => a + b, 0);
const P0 = 101.325;
const SPEC_OF = { reflux_ratio: "reflux_ratio", distillate_flow_mol_s: "distillate_rate" };
const WA = () => system({ components: ["water", "acetic-acid"], model: "NRTL" });

/** A case on the engine: CHEPTA's system with the case's method, the feed a saturated liquid (q = 1). */
function engineRun(c, extra = {}, sysOpts = {}) {
  const sys = system({ components: c.components, model: c.thermo.model, ...sysOpts }), P = c.pressure_kPa, f = c.column.feed;
  return solveCascade({ sys, P_kPa: P, stages: c.column.stages, ends: { condenser: c.column.condenser },
    feeds: [{ stage: f.stage, flows: f.z.map(z => z * f.flow_mol_s), H_W: sys.enthalpy("liquid", sys.bubbleT(f.z, P).T, P, f.z) * f.flow_mol_s }],
    specs: c.specs.map(s => (SPEC_OF[s.kind] ? { kind: SPEC_OF[s.kind], value: s.value } : { ...s })), ...extra });
}

/** The engine's column against the reference's, within the case's numerical tolerances; every stage's balances closed. */
function againstReference(c, r) {
  const ref = fixture.cases[c.id].rigorous, tol = c.tolerances.numerical.engine_against_reference, bal = c.tolerances.numerical.balances_on_every_stage;
  const F = c.column.feed.flow_mol_s;
  assert.equal(r.converged, true);
  assert.equal(r.stages.length, ref.stages.length);
  r.stages.forEach((s, j) => {
    const q = ref.stages[j], where = `${c.id} stage ${s.stage}`;
    assert.ok(Math.abs(s.T_K - q.T_K) <= tol.T_K_absolute, `${where}: T ${s.T_K} vs ${q.T_K}`);
    assert.ok(Math.abs(s.L_mol_s - q.L_mol_s) <= tol.flows_relative * q.L_mol_s, `${where}: L`);
    if (q.V_mol_s > 0) assert.ok(Math.abs(s.V_mol_s - q.V_mol_s) <= tol.flows_relative * q.V_mol_s, `${where}: V`);
    s.x.forEach((v, i) => assert.ok(Math.abs(v - q.x[i]) <= tol.mole_fractions_absolute, `${where}: x ${i} ${v} vs ${q.x[i]}`));
    if (q.y) s.y.forEach((v, i) => assert.ok(Math.abs(v - q.y[i]) <= tol.mole_fractions_absolute, `${where}: y ${i} ${v} vs ${q.y[i]}`));
    if (bal) {
      assert.ok(s.residuals.material_mol_s <= bal.material_relative_to_feed * F && s.residuals.equilibrium <= bal.equilibrium
        && s.residuals.summation <= bal.summation && s.residuals.energy_W <= bal.energy_relative_to_feed_times_10kJ_mol * F * 1e4, `${where}: ${JSON.stringify(s.residuals)}`);
    }
  });
  const dutyTol = tol.duties_relative ?? 10 * tol.flows_relative;
  assert.ok(Math.abs(sum(r.products.distillate.flows) - ref.D_mol_s) <= tol.flows_relative * ref.D_mol_s, `${c.id}: D`);
  assert.ok(Math.abs(r.duties.condenser_W - ref.Q_condenser_W) <= dutyTol * Math.abs(ref.Q_condenser_W), `${c.id}: condenser duty`);
  assert.ok(Math.abs(r.duties.reboiler_W - ref.Q_reboiler_W) <= dutyTol * Math.abs(ref.Q_reboiler_W), `${c.id}: reboiler duty`);
  return ref;
}

// ---------------------------------------------------------------------------------------------------------------
// The stage's K-values

test("the stage K-values of the chemical theory are the bubble point's: y = K x at the liquid's bubble temperature, as the flash and the bubble point give it", () => {
  for (const [ids, xs] of [[["water", "acetic-acid"], [[0.5, 0.5], [0.05, 0.95], [0.98, 0.02], [1e-9, 1 - 1e-9], [1 - 1e-9, 1e-9]]],
    [["ethanol", "water", "acetic-acid"], [[0.3, 0.4, 0.3], [0.01, 0.01, 0.98], [0.6, 0.39, 0.01]]]]) {
    const sys = system({ components: ids, model: "NRTL" });
    assert.equal(sys.lnKValues, null, "the flash keeps its own path (the bubble pressure of the liquid)");
    for (const P of [P0, 20, 300]) for (const x of xs) {
      const b = sys.bubbleT(x, P), K = sys.lnKAssociation(x, b.y, b.T, P).map(Math.exp);
      K.forEach((k, i) => assert.ok(Math.abs(k * x[i] - b.y[i]) <= 1e-8 * Math.max(b.y[i], 1e-6), `${ids.join("+")} ${JSON.stringify(x)} at ${P} kPa: K x = ${k * x[i]} vs y = ${b.y[i]}`));
      assert.ok(Math.abs(sum(K.map((k, i) => k * x[i])) - 1) < 1e-8);
    }
  }
});

test("the K-values are the ratio of the fugacities the enthalpy routines report (liquid over vapour), and stay finite without the acid in the vapour", () => {
  const sys = WA(), x = [0.4, 0.6], y = [0.55, 0.45], T = 380, P = P0;
  const L = sys.phase("liquid", T, P, x), V = sys.phase("vapour", T, P, y), K = sys.lnKAssociation(x, y, T, P);
  K.forEach((k, i) => assert.ok(Math.abs(k - (L.lnFugacity[i] - Math.log(x[i]) - (V.lnFugacity[i] - Math.log(y[i])))) < 1e-12, `component ${i}`));
  // no acid in the vapour: its fugacity coefficient is the others', 1 / N = 1 (no dimers); the limit of a small y
  const K0 = sys.lnKAssociation(x, [1, 0], T, P), Ks = sys.lnKAssociation(x, [1 - 1e-12, 1e-12], T, P);
  K0.forEach((k, i) => assert.ok(Number.isFinite(k) && Math.abs(k - Ks[i]) < 1e-9));
  // a system without a dimerizing acid has no such function, and one with the chemical theory switched off neither
  assert.equal(system({ components: ["ethanol", "water"], model: "NRTL" }).lnKAssociation, undefined);
  assert.equal(system({ components: ["water", "acetic-acid"], model: "NRTL", association: false }).lnKAssociation, undefined);
});

test("the column's adapter against the measured vapour-liquid equilibria of water + acetic acid at 101.3 kPa: within the fit the pair states", () => {
  // the stated quality of the default NRTL set (src/data/binaries.json, fitted-chang2005): Chang et al. 2005, AAD
  // 0.24 K and 0.0085 in y (max 0.67 K, 0.0236); checked against Calvar et al. 2005: AAD 0.45 K, 0.0327 (max 1.47 K,
  // 0.0865). The adapter must give the same, from its bubble temperature and its K-values at the vapour it finds.
  const sys = WA();
  for (const [file, lim] of [["chang2005", { T: 0.25, y: 0.009, Tmax: 0.68, ymax: 0.024 }], ["calvar2005", { T: 0.46, y: 0.033, Tmax: 1.48, ymax: 0.087 }]]) {
    const d = read(`../validation/data/water_acetic-acid_101kPa_${file}.json`), th = cascadeThermo(sys, d.P_kPa);
    const iT = d.columns.findIndex(c => c === "T_K" || c === "T_C"), ix = d.columns.indexOf("x_1"), iy = d.columns.indexOf("y_1");
    assert.deepEqual(d.components.map(c => c.id ?? c), ["water", "acetic-acid"]);
    let aT = 0, ay = 0, mT = 0, my = 0, n = 0;
    for (const row of d.rows) {
      const x1 = row[ix]; if (!(x1 > 0 && x1 < 1)) continue;
      const x = [x1, 1 - x1], Tm = row[iT] + (d.columns[iT] === "T_C" ? 273.15 : 0), T = th.bubbleT(x);
      let y = x.slice();
      for (let k = 0; k < 200; k++) { const K = th.lnK(x, y, T).map(Math.exp), yn = K.map((v, i) => v * x[i]), s = sum(yn); const e = Math.abs(yn[0] / s - y[0]); y = yn.map(v => v / s); if (e < 1e-13) break; }
      const dT = Math.abs(T - Tm), dy = Math.abs(y[0] - row[iy]);
      aT += dT; ay += dy; mT = Math.max(mT, dT); my = Math.max(my, dy); n++;
    }
    assert.ok(n >= 15, `${file}: ${n} points`);
    assert.ok(aT / n <= lim.T && ay / n <= lim.y && mT <= lim.Tmax && my <= lim.ymax, `${file}: AAD ${aT / n} K, ${ay / n} in y; max ${mT} K, ${my}`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// The rigorous column against the independent reference

test("K1: water + acetic acid, 20 stages: every stage as the reference, the balances closed, the true pressure the column's", () => {
  const c = caseOf("K1-water-acetic-acid"), r = engineRun(c), ref = againstReference(c, r);
  assert.deepEqual(r.warnings, c.expected.warnings);
  for (const g of Object.keys(TOLERANCES)) assert.ok(r.residuals[g] <= r.tolerances[g], g);
  // each stage's vapour, split into its true species at the stage's T and P: the monomer's partial pressure is the
  // liquid's fugacity (x gamma p_M,sat), and the vapour's enthalpy holds the dimers' (xi dH_dim)
  const sys = WA(), acid = componentRecord("acetic-acid").association, dH = dimerEnthalpy(acid);
  assert.ok(dH < -50e3 && dH > -70e3, `the dimerization enthalpy from the record's B: ${dH} J/mol of dimer`);
  r.stages.slice(1).forEach(s => {
    const Kd = dimerK(acid, s.T_K), { xi, N } = dimerSplit(s.y, [null, Kd], P0);
    assert.ok(xi[1] > 0 && xi[1] < s.y[1] / 2 && Math.abs(N - (1 - xi[1])) < 1e-15);
    assert.ok(Math.abs(xi[1] / N * P0 - Kd * ((s.y[1] - 2 * xi[1]) / N * P0) ** 2) < 1e-10, `stage ${s.stage}: p_D = K p_M^2`);
    const noDimers = system({ components: ["water", "acetic-acid"], model: "ideal", association: false });
    const hV = sys.enthalpy("vapour", s.T_K, P0, s.y);
    assert.ok(hV < sys.enthalpy("vapour", s.T_K, 1e-6, s.y) && Number.isFinite(noDimers.enthalpy("vapour", s.T_K, 1e-6, s.y)));
    // against the same vapour at a vanishing pressure (no dimers left): the difference is the dimers' enthalpy
    assert.ok(Math.abs(hV - sys.enthalpy("vapour", s.T_K, 1e-9, s.y) - xi[1] * dH) < 1e-3, `stage ${s.stage}: h_V holds xi dH_dim`);
  });
  ref.stages.forEach((q, j) => assert.ok(Math.abs(fixture.cases[c.id].checks.true_pressure_kPa_by_stage[j] - P0) < 1e-8, `reference stage ${j + 1}: P_true`));
  // the overall energy balance: feed + reboiler = condenser + products
  const f = c.column.feed, hF = sys.enthalpy("liquid", sys.bubbleT(f.z, P0).T, P0, f.z) * f.flow_mol_s;
  const D = r.stages[0], B = r.stages.at(-1);
  const out = sum(r.products.distillate.flows) * sys.enthalpy("liquid", D.T_K, P0, D.x) + B.L_mol_s * sys.enthalpy("liquid", B.T_K, P0, B.x);
  assert.ok(Math.abs(hF + r.duties.reboiler_W - r.duties.condenser_W - out) <= 1e-8 * f.flow_mol_s * 1e4, "overall energy balance");
});

test("K1 without the dimers in the phase equilibrium (association: false, on purpose): another column, as the reference's; ignoring them is not harmless", () => {
  const c = caseOf("K1-water-acetic-acid"), plain = fixture.cases[c.id].checks.without_dimers_in_the_equilibrium;
  const r = engineRun(c, {}, { association: false }), ref = fixture.cases[c.id].rigorous;
  assert.ok(Math.abs(r.stages[0].x[0] - plain.x_D[0]) < 1e-7 && Math.abs(r.stages.at(-1).x[0] - plain.x_B[0]) < 1e-7);
  assert.ok(Math.abs(r.duties.reboiler_W - plain.Q_reboiler_W) <= 1e-6 * plain.Q_reboiler_W);
  // the NRTL set was fitted with the chemical theory; without it the same column gives a distillate 9 mol % poorer
  assert.ok(ref.x_D[0] - plain.x_D[0] > 0.05, `water in the distillate ${ref.x_D[0]} with the dimers, ${plain.x_D[0]} without`);
});

test("K3: ethanol + water + acetic acid with a partial condenser (a vapour distillate): as the reference", () => {
  const c = caseOf("K3-ethanol-water-acetic-acid"), r = engineRun(c), ref = againstReference(c, r);
  assert.deepEqual(r.warnings, c.expected.warnings);
  r.products.distillate.flows.forEach((v, i) => assert.ok(Math.abs(v / ref.D_mol_s - ref.x_D[i]) < 1e-7, `vapour distillate, component ${i}`));
});

test("K2: the direct column of Pirola et al. (2013): as the reference; the published products within the stated agreement", () => {
  const c = caseOf("K2-pirola2013-direct-column"), r = engineRun(c);
  againstReference(c, r);
  // the case's numbers are the article's, converted (kmol/h to mol/s)
  const pub = c.published, f = c.column.feed;
  assert.ok(Math.abs(f.flow_mol_s * 3.6 - pub.feed_kmol_h) < 1e-9 && Math.abs(c.specs[1].value * 3.6 - pub.distillate_kmol_h) < 1e-9 && c.specs[0].value === pub.reflux_ratio && c.column.stages === pub.stages);
  // the article's own balance: the products add up to the feed within its rounding
  assert.ok(Math.abs(pub.distillate_kmol_h + pub.residue_kmol_h - pub.feed_kmol_h) < 0.05);
  assert.ok(Math.abs(pub.distillate_kmol_h * pub.distillate_x_water + pub.residue_kmol_h * pub.residue_x_water - pub.feed_kmol_h * pub.feed_x_water) < 0.05);
  // agreement between two property methods (not a numerical tolerance): the best feed stage of the 8-stage reading
  const chk = fixture.cases[c.id].checks.published, lim = c.tolerances.agreement_with_published.x_water_absolute;
  const miss = q => Math.max(Math.abs(q.x_D_water - pub.distillate_x_water), Math.abs(q.x_B_water - pub.residue_x_water));
  const best8 = Math.min(...Object.values(chk.by_feed_stage_8_stages).map(miss)), best10 = Math.min(...Object.values(chk.by_feed_stage_10_stages).map(miss));
  assert.ok(best8 <= lim, `8 stages counted with the condenser and the reboiler: ${best8}`);
  // read as 8 stages between a condenser and a reboiler, CHEPTA's method gives the published products within 0.005
  assert.ok(best10 <= 0.005, `10 stages: ${best10}`);
  assert.ok(miss({ x_D_water: r.stages[0].x[0], x_B_water: r.stages.at(-1).x[0] }) <= lim);
});

// ---------------------------------------------------------------------------------------------------------------
// Design specifications (purity, recovery) with the dimerizing vapour

test("K4: the article's two purities (water 0.74 in the distillate, 0.02 in the residue): the reflux ratio as the reference, and near the published 5.7", () => {
  const c = caseOf("K4-pirola2013-purities"), r = engineRun(c), ref = againstReference(c, r), tol = c.tolerances.numerical.engine_against_reference;
  const R = r.stages[0].L_mol_s / sum(r.products.distillate.flows);
  assert.ok(Math.abs(R - ref.reflux_ratio) <= tol.adjusted_relative * ref.reflux_ratio, `reflux ratio ${R} vs ${ref.reflux_ratio}`);
  assert.ok(Math.abs(r.stages[0].x[0] - 0.74) < 2e-6 && Math.abs(r.stages.at(-1).x[0] - 0.02) < 2e-6);
  for (const g of ["material", "energy", "equilibrium", "summation"]) assert.ok(r.residuals[g] <= r.tolerances[g], g);
  // agreement between two property methods: the article needs 5.7
  assert.ok(Math.abs(R - c.published.reflux_ratio) <= c.tolerances.agreement_with_published.reflux_ratio_relative * c.published.reflux_ratio, `reflux ratio ${R} vs the published ${c.published.reflux_ratio}`);
});

test("K5: a purity and a recovery (97 mol % water overhead, 97 % of the acid in the bottoms): as the reference", () => {
  const c = caseOf("K5-water-acetic-acid-recovery"), r = engineRun(c), ref = againstReference(c, r), tol = c.tolerances.numerical.engine_against_reference;
  const R = r.stages[0].L_mol_s / sum(r.products.distillate.flows), F = c.column.feed;
  assert.ok(Math.abs(R - ref.reflux_ratio) <= tol.adjusted_relative * ref.reflux_ratio, `reflux ratio ${R} vs ${ref.reflux_ratio}`);
  assert.ok(Math.abs(r.products.bottoms.flows[1] / (F.flow_mol_s * F.z[1]) - 0.97) < 2e-6);
});

// ---------------------------------------------------------------------------------------------------------------
// The Column block, and the refusals

const feedOf = sys => stream(sys, { flow_kmol_h: { water: 50, "acetic-acid": 50 }, P_kPa: P0, VF: 0 });

test("Column block, rigorous, with the flowsheet's NRTL and the dimerizing vapour: solved, balances closed, the method named", () => {
  const sys = WA(), feed = feedOf(sys);
  const r = runUnit("column", { sys, inlets: { in: feed }, spec: { mode: "rigorous", stages: 20, feed_stage: 10, reflux_ratio: 3, distillate_kmol_h: 50 } });
  const ref = fixture.cases["K1-water-acetic-acid"].rigorous;
  assert.ok(r.balance.material <= 1e-10 && Math.abs(r.balance.energy_kW) <= 1e-6 * r.state.reboiler_kW, JSON.stringify(r.balance));
  assert.ok(Math.abs(r.outlets.distillate.z[0] - ref.x_D[0]) < 1e-7 && Math.abs(r.outlets.bottoms.z[0] - ref.x_B[0]) < 1e-7);
  // the reference column has 100 mol/s of feed, the block 100 kmol/h: W / 3.6 / 1000 = kW
  assert.ok(Math.abs(r.state.reboiler_kW - ref.Q_reboiler_W / 3600) <= 1e-6 * ref.Q_reboiler_W / 3600, "the reboiler duty");
  assert.match(sys.info.vapour, /chemical theory \(dimerization\) for Acetic acid/);
  assert.ok(r.notes.some(n => /chemical theory/.test(n) && /Acetic acid/.test(n)), "a note says the vapour's dimers are in the stage equilibrium and the enthalpy");
});

test("Column block: a purity and a recovery on water + acetic acid, asked and reached", () => {
  const sys = WA(), feed = feedOf(sys);
  const r = runUnit("column", { sys, inlets: { in: feed }, spec: { mode: "rigorous", stages: 20, feed_stage: 10,
    distillate_purity: { component: "water", value: 0.97 },
    specifications: [{ kind: "recovery", product: "bottoms", component: "acetic-acid", value: 0.97 }] } });
  const ref = fixture.cases["K5-water-acetic-acid-recovery"].rigorous;
  assert.ok(Math.abs(r.outlets.distillate.z[0] - 0.97) < 2e-6);
  assert.ok(Math.abs(r.state.adjusted.reflux_ratio - ref.reflux_ratio) <= 2e-5 * ref.reflux_ratio, `reflux ratio ${r.state.adjusted.reflux_ratio}`);
  assert.ok(r.balance.material <= 1e-10 && Math.abs(r.balance.energy_kW) <= 1e-6 * r.state.reboiler_kW);
});

test("Column block, shortcut: the relative volatility is the chemical theory's (the bubble point's), not gamma p_sat alone", () => {
  const sys = WA(), feed = feedOf(sys);
  const r = runUnit("column", { sys, inlets: { in: feed }, spec: { light_key: "water", heavy_key: "acetic-acid", recovery_light_key_in_distillate: 0.95, recovery_heavy_key_in_bottoms: 0.95, reflux_over_minimum: 1.3 } });
  const b = sys.bubbleT([0.5, 0.5], P0), alpha = (b.y[0] / 0.5) / (b.y[1] / 0.5);
  assert.ok(Math.abs(r.state.alpha_keys.feed - alpha) < 1e-9);
  const ps = sys.psat(b.T), naive = b.gamma[0] * ps[0] / (b.gamma[1] * ps[1]);
  assert.ok(Math.abs(alpha - naive) > 0.1, `with the dimers ${alpha}, without ${naive}`);
  assert.ok(r.balance.material <= 1e-12 && Math.abs(r.balance.energy_kW) <= 1e-9 * r.state.reboiler_kW);
});

test("refusals with the reason: no convergence in the iterations allowed; a purity beyond what the stages reach; two liquids on the stages with a dimerizing acid", () => {
  const c = caseOf("K1-water-acetic-acid");
  assert.throws(() => engineRun(c, { maxIterations: 1 }), e => e.code === "NO_CONVERGENCE" && /did not converge/.test(e.message) && /iteration limit/.test(e.message));
  const sys = WA(), feed = feedOf(sys);
  // 99.99 mol % water overhead and 99.99 % acid below from 6 stages: no reflux ratio reaches it (the tangent pinch at the water end)
  assert.throws(() => runUnit("column", { sys, inlets: { in: feed }, spec: { mode: "rigorous", stages: 6, feed_stage: 3,
    distillate_purity: { component: "water", value: 0.9999 }, bottoms_purity: { component: "acetic-acid", value: 0.9999 } } }),
  e => e.code === "OUT_OF_RANGE" && /cannot be met together on 6 stages/.test(e.message) && /What would make it feasible/.test(e.message));
  assert.throws(() => runUnit("column", { sys, inlets: { in: feed }, spec: { mode: "rigorous", stages: 10, feed_stage: 5, reflux_ratio: 3, distillate_kmol_h: 50, phases: "VLL" } }),
    e => e.code === "NOT_AVAILABLE" && /dimerizing acids' chemical theory/.test(e.message) && /chemical theory \(dimerization\) for Acetic acid/.test(e.message));
});
