// Proposal 0015, milestone M1 (W7): the benchmark cases of the column engine (validation/data/columns/) and their
// independent references (validation/python/reference_mesh.py, reference_fug.py; fixture validation/fixtures/columns.json).
// These tests pass before any column code exists: they check that the case files are well formed and that the
// references close their material, equilibrium, summation and energy balances on every stage, recomputed here
// (for the NRTL case with CHEPTA's own activity coefficients, vapour pressures and enthalpies). Comparing the
// JavaScript column with these cases is W2's, when it lands (test/columns*.test.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { system, pure } from "../src/index.js";
import { OUTCOMES } from "../src/api/dispatcher.js";

const dir = new URL("../validation/data/columns/", import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith(".json")).sort();
const cases = Object.fromEntries(files.map(f => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(new URL(f, dir)))]));
const fixture = JSON.parse(readFileSync(new URL("../validation/fixtures/columns.json", import.meta.url)));
const H_SCALE = fixture.H_scale_J_mol;
const SPECS = ["reflux_ratio", "distillate_flow_mol_s", "bottoms_flow_mol_s", "distillate_purity"];
const sum = v => v.reduce((a, b) => a + b, 0);

test("column cases: every file is well formed and has its reference", () => {
  assert.ok(files.length >= 9, "the cases (a) to (e) of proposal 0015, W7");
  for (const [id, c] of Object.entries(cases)) {
    assert.equal(c.chepta_column_case, 1, id);
    assert.equal(c.id, id, `${id}: the id is the file name`);
    for (const k of ["title", "purpose", "method_choice", "thermo", "components", "pressure_kPa", "column", "specs", "expected", "tolerances"]) assert.ok(k in c, `${id}: ${k}`);
    const { feed } = c.column;
    assert.equal(feed.z.length, c.components.length, `${id}: feed composition`);
    assert.ok(Math.abs(sum(feed.z) - 1) < 1e-12, `${id}: z sums to 1`);
    assert.ok(feed.flow_mol_s > 0 && ("q" in feed) !== ("T_K" in feed), `${id}: feed flow, and q or T_K`);
    assert.ok(["total", "partial"].includes(c.column.condenser), `${id}: condenser`);
    if (c.thermo.kind === "constant-alpha") {
      assert.equal(c.thermo.alpha.length, c.components.length, id);
      assert.ok(c.thermo.latent_heat_J_mol > 0, id);
    } else {
      assert.equal(c.thermo.kind, "chepta", id);
      for (const cid of c.components) assert.ok(pure(cid), `${id}: ${cid} is a CHEPTA component`);
    }
    if (c.column.stages != null) {
      assert.equal(c.specs.length, 2, `${id}: two specifications (degrees of freedom)`);
      assert.ok(feed.stage > 1 && feed.stage < c.column.stages, `${id}: the feed enters between the condenser and the reboiler`);
    }
    for (const s of c.specs) assert.ok(SPECS.includes(s.kind), `${id}: specification ${s.kind}`);
    const outs = [c.expected.outcome, ...(c.expected.outcome_one_of ?? []), c.expected.outcome_before_M4, c.expected.outcome_from_M4].filter(Boolean);
    assert.ok(outs.length && outs.every(o => OUTCOMES.includes(o)), `${id}: expected outcome ${outs}`);
    assert.ok(fixture.cases[id], `${id}: no reference in validation/fixtures/columns.json (run reference_mesh.py)`);
  }
});

/** K-values and molar enthalpies of a case's thermodynamics: the closed forms of a constant-alpha model system, or
 * CHEPTA's own system (gammas, vapour pressures, enthalpies). */
function thermoOf(c) {
  const P = c.pressure_kPa;
  if (c.thermo.kind === "constant-alpha") {
    const { alpha, reference_vapour_pressure: rp, latent_heat_J_mol: lam } = c.thermo;
    return { K: (x, T) => alpha.map(a => a * Math.exp(rp.A - rp.B_K / T) / P), hL: () => 0, hV: () => lam,
      hF: () => (1 - c.column.feed.q) * lam, enthalpyTol: () => 0 };
  }
  const s = system({ components: c.components, model: c.thermo.model });
  return { K: (x, T) => { const g = s.gammas(x, T), p = s.psat(T); return g.map((gi, i) => gi * p[i] / P); },
    hL: (x, T) => s.enthalpy("liquid", T, P, x), hV: (y, T) => s.enthalpy("vapour", T, P, y),
    hF: () => s.enthalpy("liquid", c.column.feed.T_K, P, c.column.feed.z),
    // the two enthalpy implementations agree within 0.05 J/mol (test/enthalpy.test.js): per mole of each stream
    enthalpyTol: flows => 0.05 * flows };
}

/** Every stage's residuals of the reference profile, recomputed from its stage values. */
function residuals(c, prof) {
  const th = thermoOf(c), st = prof.stages, N = st.length, n = c.components.length;
  const f = c.column.feed.stage - 1, F = c.column.feed.flow_mol_s, z = c.column.feed.z, total = c.column.condenser === "total";
  const D = prof.D_mol_s, hF = th.hF();
  const y = st.map((s, j) => (j === 0 && total ? th.K(s.x, s.T_K).map((k, i) => k * s.x[i]) : s.y));
  const hL = st.map(s => th.hL(s.x, s.T_K)), hV = st.map((s, j) => th.hV(y[j], s.T_K));
  return st.map((s, j) => {
    const m = new Array(n).fill(0);
    let e = 0, flows = 0;
    const add = (flow, comp, h) => { comp.forEach((v, i) => { m[i] += flow * v; }); e += flow * h; flows += Math.abs(flow); };
    if (j > 0) add(st[j - 1].L_mol_s, st[j - 1].x, hL[j - 1]);
    if (j < N - 1) add(st[j + 1].V_mol_s, y[j + 1], hV[j + 1]);
    if (j === f) add(F, z, hF);
    if (j === 0 && total) add(-(s.L_mol_s + D), s.x, hL[0]);
    else { add(-s.L_mol_s, s.x, hL[j]); add(-s.V_mol_s, y[j], hV[j]); }
    if (j === 0) e -= prof.Q_condenser_W;
    if (j === N - 1) e += prof.Q_reboiler_W;
    const K = th.K(s.x, s.T_K);
    return { stage: j + 1, material: Math.max(...m.map(Math.abs)), energy: Math.abs(e), energyTol: th.enthalpyTol(flows),
      summation: Math.max(Math.abs(sum(s.x) - 1), Math.abs(sum(y[j]) - 1)),
      equilibrium: j === 0 && total ? 0 : Math.max(...K.map((k, i) => Math.abs(y[j][i] - k * s.x[i]))) };
  });
}

for (const [id, rec] of Object.entries(fixture.cases).filter(([, r]) => r.rigorous)) {
  test(`column reference ${id}: material, equilibrium, summation and energy balances closed on every stage`, () => {
    const c = cases[id], prof = rec.rigorous, F = c.column.feed.flow_mol_s;
    const tol = c.tolerances.numerical.balances_on_every_stage;
    const lim = { material: tol.material_relative_to_feed * F, summation: tol.summation, equilibrium: tol.equilibrium,
      energy: tol.energy_relative_to_feed_times_10kJ_mol * F * H_SCALE };
    assert.equal(prof.stages.length, c.column.stages);
    // the reference's own residuals, as it wrote them
    for (const s of prof.stages) {
      assert.ok(s.residuals.material_mol_s <= lim.material && s.residuals.summation <= lim.summation && s.residuals.equilibrium <= lim.equilibrium
        && s.residuals.energy_W <= lim.energy, `${id} stage ${s.stage}: ${JSON.stringify(s.residuals)}`);
      assert.ok(s.L_mol_s >= 0 && s.V_mol_s >= 0 && s.x.every(v => v >= 0), `${id} stage ${s.stage}: negative flow or mole fraction`);
    }
    // recomputed here, from the stage values alone
    for (const r of residuals(c, prof)) {
      assert.ok(r.material <= lim.material, `${id} stage ${r.stage}: material ${r.material} mol/s`);
      assert.ok(r.summation <= lim.summation, `${id} stage ${r.stage}: summation ${r.summation}`);
      // NRTL: CHEPTA's K-values against the Python reference's (the same records and formulas, written twice)
      assert.ok(r.equilibrium <= Math.max(lim.equilibrium, c.thermo.kind === "chepta" ? 1e-9 : 0), `${id} stage ${r.stage}: equilibrium ${r.equilibrium}`);
      assert.ok(r.energy <= lim.energy + r.energyTol, `${id} stage ${r.stage}: energy ${r.energy} W (allowed ${lim.energy + r.energyTol})`);
    }
    // the specifications
    const R = c.specs.find(s => s.kind === "reflux_ratio")?.value;
    assert.ok(Math.abs(prof.stages[0].L_mol_s - R * prof.D_mol_s) <= lim.material, `${id}: reflux ratio`);
    for (const s of c.specs) {
      if (s.kind === "distillate_flow_mol_s") assert.ok(Math.abs(prof.D_mol_s - s.value) <= lim.material, `${id}: D`);
      if (s.kind === "bottoms_flow_mol_s") assert.ok(Math.abs(prof.B_mol_s - s.value) <= lim.material, `${id}: B`);
    }
    // overall component balance
    c.column.feed.z.forEach((zi, i) => assert.ok(Math.abs(F * zi - prof.D_mol_s * prof.x_D[i] - prof.B_mol_s * prof.x_B[i]) <= 10 * lim.material, `${id}: overall balance of ${c.components[i]}`));
  });
}

test("column reference A1: McCabe-Thiele, the total-reflux limit (Fenske) and constant molar overflow", () => {
  const { checks, rigorous: p } = fixture.cases["A1-binary-alpha"];
  assert.ok(checks.mccabe_thiele.max_deviation_from_profile <= checks.mccabe_thiele.tolerance);
  assert.ok(Math.abs(checks.total_reflux.relative_deviation) <= checks.total_reflux.tolerance);
  const c = cases["A1-binary-alpha"], R = c.specs[0].value, D = c.specs[1].value, { stage: f, q, flow_mol_s: F } = c.column.feed;
  p.stages.slice(1, -1).forEach(s => assert.ok(Math.abs(s.L_mol_s - (s.stage < f ? R * D : R * D + q * F)) < 1e-9 && Math.abs(s.V_mol_s - (R + 1) * D) < 1e-9, `stage ${s.stage}`));
  p.stages.slice(1).forEach((s, j) => assert.ok(s.T_K > p.stages[j].T_K, "the temperature rises downwards"));
});

/** The shortcut's defining equations, evaluated at the fixture's numbers (reference_fug.py). */
function checkShortcut(c, r, recoveries) {
  const a = c.thermo.alpha, z = c.column.feed.z, q = c.column.feed.q, F = c.column.feed.flow_mol_s;
  const lk = c.components.indexOf(c.shortcut.light_key), hk = c.components.indexOf(c.shortcut.heavy_key);
  const close = (u, v, what) => assert.ok(Math.abs(u - v) <= 1e-9 * Math.max(1, Math.abs(v)), `${c.id}: ${what} ${u} vs ${v}`);
  if (recoveries) {
    close(r.d_mol_s[lk], recoveries[0] * F * z[lk], "light key in the distillate");
    close(r.b_mol_s[hk], recoveries[1] * F * z[hk], "heavy key in the bottoms");
  }
  close(r.N_min, Math.log((r.d_mol_s[lk] / r.b_mol_s[lk]) * (r.b_mol_s[hk] / r.d_mol_s[hk])) / Math.log(a[lk] / a[hk]), "Fenske N_min");
  a.forEach((ai, i) => { if (i !== lk && i !== hk) close(r.d_mol_s[i] / r.b_mol_s[i], (r.d_mol_s[hk] / r.b_mol_s[hk]) * (ai / a[hk]) ** r.N_min, `Fenske distribution of ${c.components[i]}`); });
  assert.ok(r.theta > a[hk] && r.theta < a[lk], "Underwood's root between the keys");
  close(sum(a.map((ai, i) => ai * z[i] / (ai - r.theta))), 1 - q, "Underwood's first equation");
  close(r.R_min, sum(a.map((ai, i) => ai * r.x_D[i] / (ai - r.theta))) - 1, "Underwood's minimum reflux");
  const X = (r.R - r.R_min) / (r.R + 1), Y = 0.75 * (1 - X ** 0.5668);
  close(r.gilliland_X, X, "Gilliland X"); close(r.gilliland_Y, Y, "Gilliland Y (Eduljee)");
  close((r.N - r.N_min) / (r.N + 1), Y, "Gilliland N");
}

test("shortcut reference A1, A2: Fenske, Underwood and Gilliland (Eduljee) hold at the fixture's numbers", () => {
  const a2 = cases["A2-ternary-alpha-fug"], r2 = fixture.cases["A2-ternary-alpha-fug"].shortcut;
  assert.equal(r2.outcome, "ok");
  checkShortcut(a2, r2, [a2.shortcut.recovery_light_key_in_distillate, a2.shortcut.recovery_heavy_key_in_bottoms]);
  assert.ok(Math.abs(r2.R / r2.R_min - a2.shortcut.reflux_over_minimum) < 1e-12);
  assert.ok(r2.d_mol_s[2] / (a2.column.feed.flow_mol_s * a2.column.feed.z[2]) < 1e-4, "the heavy non-key stays in the bottoms");
  checkShortcut(cases["A1-binary-alpha"], fixture.cases["A1-binary-alpha"].shortcut, null);
  const m = fixture.cases["A2-ternary-alpha-fug"].checks.rmin_against_rigorous;
  assert.ok(m.ratio >= m.tolerance[0] && m.ratio <= m.tolerance[1], `rigorous reflux at ${m.stages} stages over Underwood's R_min: ${m.ratio}`);
});

test("column reference B1 (ethanol + water, NRTL): below the model's azeotrope, a subcooled feed, a varying relative volatility", () => {
  const { checks, rigorous: p } = fixture.cases["B1-ethanol-water-nrtl"];
  assert.ok(p.x_D[0] < checks.azeotrope.model_x_ethanol, "the distillate stays below the azeotrope");
  assert.ok(checks.feed_stage_liquid_rise_mol_s > cases["B1-ethanol-water-nrtl"].column.feed.flow_mol_s, "a subcooled feed condenses vapour on the feed stage");
  assert.ok(checks.relative_volatility.reboiler > 2 * checks.relative_volatility.stage_2, "alpha changes along the column");
  // the model's azeotrope is an azeotrope in CHEPTA's own NRTL too: y = x at its bubble point
  const s = system({ components: ["ethanol", "water"], model: "NRTL" }), x = [checks.azeotrope.model_x_ethanol, 1 - checks.azeotrope.model_x_ethanol];
  const T = checks.azeotrope.model_T_K, g = s.gammas(x, T), ps = s.psat(T), P = x[0] * g[0] * ps[0] + x[1] * g[1] * ps[1];
  assert.ok(Math.abs(P - 101.325) < 1e-6 && Math.abs(x[0] * g[0] * ps[0] / P - x[0]) < 1e-8, `azeotrope: P ${P}`);
  assert.ok(cases["E3-purity-above-azeotrope"].specs[1].value > checks.azeotrope.model_x_ethanol, "E3 asks for a purity above it");
});

test("column case C1: the pair without NRTL parameters is refused as missing data, not treated as ideal", () => {
  const c = cases["C1-missing-pair"];
  assert.deepEqual(fixture.cases["C1-missing-pair"].checks.missing_pairs, [["methanol", "ethylene-glycol"]]);
  assert.throws(() => system({ components: c.components, model: c.thermo.model }),
    e => e.code === c.expected.code && c.expected.message_names.every(n => e.message.includes(n)));
});

test("column case D1: the dry stages are the ones the case names, for any threshold between its two ratios", () => {
  const c = cases["D1-dry-stage"], ratio = fixture.cases["D1-dry-stage"].checks.liquid_over_max_vapour;
  const dry = c.expected.warnings[0].stages;
  for (const k of dry) assert.ok(ratio[k] <= 0.001, `stage ${k}: ${ratio[k]}`);
  for (const k of c.expected.no_warning_on_stages.filter(k => k > 1)) assert.ok(ratio[k] >= 2 / 3, `stage ${k}: ${ratio[k]}`);
  // the control, A1 (reflux ratio 2): no stage below the threshold's upper end
  const a1 = fixture.cases["A1-binary-alpha"].rigorous.stages, vmax = Math.max(...a1.map(s => s.V_mol_s));
  for (const s of a1.slice(1, -1)) assert.ok(s.L_mol_s / vmax >= 2 / 3 - 1e-12, `A1 stage ${s.stage}`);
});

test("column cases E1, E2: below the minimum reflux, and a negative boil-up, have no column", () => {
  const e1 = fixture.cases["E1-shortcut-below-minimum-reflux"].shortcut, a2 = fixture.cases["A2-ternary-alpha-fug"].shortcut;
  assert.equal(e1.outcome, "refused");
  assert.equal(e1.code, cases["E1-shortcut-below-minimum-reflux"].expected.code);
  assert.ok(cases["E1-shortcut-below-minimum-reflux"].shortcut.reflux_ratio < a2.R_min && /minimum reflux/.test(e1.message));
  assert.ok(fixture.cases["E2-negative-boilup"].checks.boilup.V_below_feed_mol_s < 0);
});
