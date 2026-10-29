// Proposal 0015, milestones M1 and M2a (W7): the benchmark cases of the column engine (validation/data/columns/) and their
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
const feedsOf = c => c.column.feeds ?? [c.column.feed];

test("column cases: every file is well formed and has its reference", () => {
  assert.ok(files.length >= 14, "the cases (a) to (e) of proposal 0015, W7, and those of M2a");
  for (const [id, c] of Object.entries(cases)) {
    assert.equal(c.chepta_column_case, 1, id);
    assert.equal(c.id, id, `${id}: the id is the file name`);
    for (const k of ["title", "purpose", "method_choice", "thermo", "components", "pressure_kPa", "column", "specs", "expected", "tolerances"]) assert.ok(k in c, `${id}: ${k}`);
    assert.ok(("feed" in c.column) !== ("feeds" in c.column), `${id}: column.feed or column.feeds`);
    for (const feed of feedsOf(c)) {
      assert.equal(feed.z.length, c.components.length, `${id}: feed composition`);
      assert.ok(Math.abs(sum(feed.z) - 1) < 1e-12, `${id}: z sums to 1`);
      assert.ok(feed.flow_mol_s > 0 && ("q" in feed) !== ("T_K" in feed), `${id}: feed flow, and q or T_K`);
      if (c.thermo.kind === "chepta" && "q" in feed) assert.ok(feed.q === 0 || feed.q === 1, `${id}: a real mixture's feed q is 0 or 1 (saturated)`);
      if (c.column.stages != null) assert.ok(feed.stage > 1 && feed.stage < c.column.stages, `${id}: the feed enters between the condenser and the reboiler`);
    }
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
    }
    for (const s of c.specs) assert.ok(SPECS.includes(s.kind), `${id}: specification ${s.kind}`);
    const outs = [c.expected.outcome, ...(c.expected.outcome_one_of ?? []), c.expected.outcome_before_M4, c.expected.outcome_from_M4].filter(Boolean);
    assert.ok(outs.length && outs.every(o => OUTCOMES.includes(o)), `${id}: expected outcome ${outs}`);
    assert.ok(fixture.cases[id], `${id}: no reference in validation/fixtures/columns.json (run reference_mesh.py)`);
  }
});

/** K-values and molar enthalpies of a case's thermodynamics: the closed forms of a constant-alpha model system, or
 * CHEPTA's own system (gammas, vapour pressures, enthalpies). */
function thermoOf(c, feedT) {
  const P = c.pressure_kPa;
  if (c.thermo.kind === "constant-alpha") {
    const { alpha, reference_vapour_pressure: rp, latent_heat_J_mol: lam } = c.thermo;
    return { K: (x, T) => alpha.map(a => a * Math.exp(rp.A - rp.B_K / T) / P), hL: () => 0, hV: () => lam,
      hF: k => (1 - feedsOf(c)[k].q) * lam, enthalpyTol: () => 0 };
  }
  const s = system({ components: c.components, model: c.thermo.model });
  const K = (x, T) => kValues(s, x, T, P);
  // a saturated feed (q = 1 or 0) at the temperature the reference found; it must be the bubble (dew) point here too
  const hF = k => {
    const f = feedsOf(c)[k];
    if (!("q" in f)) return s.enthalpy("liquid", f.T_K, P, f.z);
    const T = feedT[k], Kz = K(f.z, T);
    if (f.q === 1) {
      assert.ok(Math.abs(sum(Kz.map((v, i) => v * f.z[i])) - 1) < 1e-9, `${c.id}: the feed's bubble point`);
      return s.enthalpy("liquid", T, P, f.z);
    }
    const x = f.z.map((v, i) => v / Kz[i]);
    assert.ok(Math.abs(sum(x) - 1) < 1e-6, `${c.id}: the feed's dew point`);
    return s.enthalpy("vapour", T, P, f.z);
  };
  return { K, hL: (x, T) => s.enthalpy("liquid", T, P, x), hV: (y, T) => s.enthalpy("vapour", T, P, y), hF,
    // the two enthalpy implementations agree within 0.05 J/mol (test/enthalpy.test.js): per mole of each stream
    enthalpyTol: flows => 0.05 * flows };
}

/** K-values of CHEPTA's own system: gamma p_sat / P (activity model, ideal-gas vapour), or phi_L(x) / phi_V(y) with
 * y = K x by successive substitution (equation of state). */
function kValues(s, x, T, P) {
  if (s.kind !== "eos") { const g = s.gammas(x, T), p = s.psat(T); return g.map((gi, i) => gi * p[i] / P); }
  const lnL = s.lnPhi(T, P, x, "liquid");
  let y = x.slice(), K;
  for (let k = 0; k < 200; k++) {
    const ys = sum(y), lnV = s.lnPhi(T, P, y.map(v => v / ys), "vapour");
    K = lnL.map((l, i) => Math.exp(l - lnV[i]));
    const yn = K.map((v, i) => v * x[i]), step = Math.max(...yn.map((v, i) => Math.abs(v - y[i])));
    y = yn;
    if (step < 1e-15) break;
  }
  return K;
}

/** ln of the liquid's fugacity over its pressure-independent part, for the tangent-plane distance. */
function lnFugLiquid(s, x, T, P) {
  if (s.kind === "eos") { const l = s.lnPhi(T, P, x, "liquid"); return x.map((v, i) => Math.log(v) + l[i]); }
  const g = s.gammas(x, T);
  return x.map((v, i) => Math.log(v) + Math.log(g[i]));
}

/** Every stage's residuals of the reference profile, recomputed from its stage values. */
function residuals(c, prof, feedT) {
  const th = thermoOf(c, feedT), st = prof.stages, N = st.length, n = c.components.length;
  const feeds = feedsOf(c).map((f, k) => ({ j: f.stage - 1, F: f.flow_mol_s, z: f.z, h: th.hF(k) })), total = c.column.condenser === "total";
  const D = prof.D_mol_s;
  const y = st.map((s, j) => (j === 0 && total ? th.K(s.x, s.T_K).map((k, i) => k * s.x[i]) : s.y));
  const hL = st.map(s => th.hL(s.x, s.T_K)), hV = st.map((s, j) => th.hV(y[j], s.T_K));
  return st.map((s, j) => {
    const m = new Array(n).fill(0);
    let e = 0, flows = 0;
    const add = (flow, comp, h) => { comp.forEach((v, i) => { m[i] += flow * v; }); e += flow * h; flows += Math.abs(flow); };
    if (j > 0) add(st[j - 1].L_mol_s, st[j - 1].x, hL[j - 1]);
    if (j < N - 1) add(st[j + 1].V_mol_s, y[j + 1], hV[j + 1]);
    for (const f of feeds) if (j === f.j) add(f.F, f.z, f.h);
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
    const c = cases[id], prof = rec.rigorous, F = sum(feedsOf(c).map(f => f.flow_mol_s));
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
    for (const r of residuals(c, prof, rec.checks.feed_T_K)) {
      assert.ok(r.material <= lim.material, `${id} stage ${r.stage}: material ${r.material} mol/s`);
      assert.ok(r.summation <= lim.summation, `${id} stage ${r.stage}: summation ${r.summation}`);
      // CHEPTA's K-values against the Python reference's (the same records and formulas, written twice)
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
    c.components.forEach((name, i) => assert.ok(Math.abs(sum(feedsOf(c).map(f => f.flow_mol_s * f.z[i])) - prof.D_mol_s * prof.x_D[i] - prof.B_mol_s * prof.x_B[i]) <= 10 * lim.material, `${id}: overall balance of ${name}`));
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

// ---- Milestone M2a (W7): the complete benchmark and the further cases ----

test("column case B2: the transcribed ChemSep Book numbers are consistent with each other (a check of the transcription)", () => {
  const c = cases["B2-chemsep-benzene-toluene"], p = c.published, F = c.column.feed.flow_mol_s, R = c.specs[0].value;
  const D = p.D_mol_s, B = p.B_mol_s, xD = p.x_D[0], xB = p.x_B[0], f = c.column.feed.stage;
  const near = (u, v, tol, what) => assert.ok(Math.abs(u - v) <= tol, `${what}: ${u} against ${v}`);
  // the figures print six significant digits: the checks hold to that rounding
  near(D + B, F, 2e-4, "D + B = F");
  near(p.d_mol_s[0] + p.b_mol_s[0], F * 0.5, 2e-5, "benzene balance"); near(p.d_mol_s[1] + p.b_mol_s[1], F * 0.5, 2e-5, "toluene balance");
  near(p.d_mol_s[0] / D, xD, 2e-6, "x_D from the flows"); near(p.b_mol_s[0] / B, xB, 2e-6, "x_B from the flows");
  near(p.x_D[0] + p.x_D[1], 1, 2e-6, "x_D sums to 1"); near(p.x_B[0] + p.x_B[1], 1, 2e-6, "x_B sums to 1");
  near(p.x_benzene[0], xD, 0, "the condenser's liquid is the distillate"); near(p.x_benzene[9], xB, 0, "the reboiler's liquid is the bottoms");
  near(p.L_mol_s[0], R * D, 2e-4, "reflux ratio"); near(p.V_mol_s[1], p.L_mol_s[0] + D, 2e-4, "V_2 = L_1 + D");
  near(p.L_mol_s[f - 1] - p.L_mol_s[f - 2], F, 2e-4, "a saturated-liquid feed adds F to the liquid");
  near(p.V_mol_s[9] / B, p.boilup_ratio, 1e-4, "boil-up ratio");
  // the K column is not y/x of the same figure (0.03 % to 2.8 % above it; the case's published.notes): not compared
  for (let j = 0; j < 10; j++) assert.ok(p.K_benzene[j] / (p.y_benzene[j] / p.x_benzene[j]) - 1 < 0.03, `K and y/x, stage ${j + 1}`);
  // constant molar overflow: the operating lines carry each stage's liquid to the vapour of the stage below
  for (let j = 1; j < 10; j++) {
    const y = j < f ? (p.L_mol_s[j - 1] * p.x_benzene[j - 1] + D * xD) / p.V_mol_s[j] : (p.L_mol_s[j - 1] * p.x_benzene[j - 1] - B * xB) / p.V_mol_s[j];
    near(y, p.y_benzene[j], 2e-5, `operating line into stage ${j + 1}`);
  }
  for (let j = 1; j < 10; j++) assert.ok(p.T_C[j] > p.T_C[j - 1], "the temperature rises downwards");
});

test("column case B2: CHEPTA's method agrees with the published example within the agreement tolerances", () => {
  const c = cases["B2-chemsep-benzene-toluene"], p = c.published, rec = fixture.cases["B2-chemsep-benzene-toluene"];
  const tol = c.tolerances.agreement_with_published_example, prof = rec.rigorous;
  prof.stages.forEach((s, j) => {
    assert.ok(Math.abs(s.T_K - 273.15 - p.T_C[j]) <= tol.T_K_absolute, `stage ${s.stage}: T ${s.T_K - 273.15} against ${p.T_C[j]} degC`);
    assert.ok(Math.abs(s.x[0] - p.x_benzene[j]) <= tol.mole_fractions_absolute, `stage ${s.stage}: x ${s.x[0]} against ${p.x_benzene[j]}`);
  });
  assert.ok(Math.abs(prof.x_D[0] - p.x_D[0]) <= tol.mole_fractions_absolute && Math.abs(prof.x_B[0] - p.x_B[0]) <= tol.mole_fractions_absolute);
  // the K-values of CHEPTA's own method at the published stage compositions and temperatures, as the fixture has them
  const s = system({ components: c.components, model: c.thermo.model });
  p.x_benzene.forEach((x, j) => {
    const T = p.T_C[j] + 273.15, K = kValues(s, [x, 1 - x], T, c.pressure_kPa)[0];
    assert.ok(Math.abs(K - rec.checks.published.K_benzene_chepta_at_published_x_T[j]) < 1e-9, `K of benzene, stage ${j + 1}`);
  });
});

/** The tangent-plane distance of liquid x at T and P for trial w, with CHEPTA's own system. */
function tpd(s, x, w, T, P) {
  const fx = lnFugLiquid(s, x, T, P), fw = lnFugLiquid(s, w, T, P);
  return sum(w.map((wi, i) => wi * (fw[i] - fx[i])));
}

test("column case F1 (1-butanol + water): a second liquid on stages 1 and 2 of the one-liquid solution, none below", () => {
  const c = cases["F1-butanol-water-two-liquids"], rec = fixture.cases["F1-butanol-water-two-liquids"], lim = c.tolerances.stability;
  assert.equal(c.expected.outcome, "unsupported"); assert.equal(c.expected.code, "PHASE_SPLIT");
  const s = system({ components: c.components, model: c.thermo.model });
  rec.checks.stability.forEach((r, j) => {
    const st = rec.rigorous.stages[j];
    if (r.stage <= 2) {
      assert.ok(r.tpd_min < lim.tpd_unstable_below, `stage ${r.stage}: ${r.tpd_min}`);
      assert.ok(tpd(s, st.x, r.trial_x, st.T_K, c.pressure_kPa) < lim.tpd_unstable_below, `stage ${r.stage}: CHEPTA's tpd at the reference's trial liquid`);
    } else {
      assert.ok(r.tpd_min > lim.tpd_stable_above, `stage ${r.stage}: ${r.tpd_min}`);
      // recomputed here on a grid of trial liquids
      for (let k = 1; k < 2000; k++) { const w = k / 2000; assert.ok(tpd(s, st.x, [w, 1 - w], st.T_K, c.pressure_kPa) > lim.tpd_stable_above, `stage ${r.stage}, trial ${w}`); }
    }
  });
});

test("column cases B2, B3, P1: one liquid on every stage (the phase check passes)", () => {
  for (const id of ["B2-chemsep-benzene-toluene", "B3-acetone-methanol-azeotrope", "P1-performance-alcohols-water"]) {
    const c = cases[id], rec = fixture.cases[id], s = system({ components: c.components, model: c.thermo.model });
    rec.checks.stability.forEach((r, j) => {
      const st = rec.rigorous.stages[j];
      assert.ok(r.tpd_min > -1e-9, `${id} stage ${r.stage}: ${r.tpd_min}`);
      assert.ok(tpd(s, st.x, r.trial_x, st.T_K, c.pressure_kPa) > -1e-9, `${id} stage ${r.stage}: CHEPTA's tpd at the reference's trial liquid`);
    });
  }
});

test("column case B3 (acetone + methanol): the distillate pinches just below the model's azeotrope", () => {
  const c = cases["B3-acetone-methanol-azeotrope"], { checks, rigorous: p } = fixture.cases["B3-acetone-methanol-azeotrope"];
  const xa = checks.azeotrope.model_x_acetone;
  assert.ok(p.x_D[0] < xa && xa - p.x_D[0] < 0.005, `x_D ${p.x_D[0]} against the azeotrope ${xa}`);
  p.stages.forEach(st => assert.ok(st.x[0] <= xa, `stage ${st.stage} beyond the azeotrope`));
  assert.ok(p.stages[4].T_K - p.stages[0].T_K < 0.01, "the pinch: the top five stages within 0.01 K");
  const s = system({ components: c.components, model: c.thermo.model }), x = [xa, 1 - xa], T = checks.azeotrope.model_T_K;
  const g = s.gammas(x, T), ps = s.psat(T), P = x[0] * g[0] * ps[0] + x[1] * g[1] * ps[1];
  assert.ok(Math.abs(P - 101.325) < 1e-6 && Math.abs(x[0] * g[0] * ps[0] / P - x[0]) < 1e-8, `azeotrope in CHEPTA's NRTL: P ${P}`);
});

test("column case A4 (two feeds): McCabe-Thiele with three operating lines equals the profile", () => {
  const c = cases["A4-binary-two-feeds"], { checks, rigorous: p } = fixture.cases["A4-binary-two-feeds"];
  assert.ok(checks.mccabe_thiele.max_deviation_from_profile <= checks.mccabe_thiele.tolerance);
  const R = c.specs[0].value, D = c.specs[1].value, [f1, f2] = c.column.feeds;
  p.stages.slice(1, -1).forEach(s => {
    const L = R * D + (s.stage >= f1.stage ? f1.q * f1.flow_mol_s : 0) + (s.stage >= f2.stage ? f2.q * f2.flow_mol_s : 0);
    const V = (R + 1) * D - (s.stage > f1.stage ? (1 - f1.q) * f1.flow_mol_s : 0) - (s.stage > f2.stage ? (1 - f2.q) * f2.flow_mol_s : 0);
    assert.ok(Math.abs(s.L_mol_s - L) < 1e-9 && Math.abs(s.V_mol_s - V) < 1e-9, `stage ${s.stage}`);
  });
});

test("column cases E4, P1: the iteration limit is below what the column needs; the warm-start reference closes its balances", () => {
  const e4 = cases["E4-iteration-limit"], r = fixture.cases["E4-iteration-limit"].checks;
  assert.equal(e4.expected.outcome, "not_converged");
  assert.ok(r.reference_iterations.newton_steps > e4.solver.max_iterations, "the reference needs more Newton steps, from a better start");
  assert.deepEqual(e4.column, cases["B1-ethanol-water-nrtl"].column); assert.deepEqual(e4.specs, cases["B1-ethanol-water-nrtl"].specs);
  const p1 = cases["P1-performance-alcohols-water"], rec = fixture.cases["P1-performance-alcohols-water"];
  const warm = { ...p1, specs: p1.performance.warm_specs }, F = p1.column.feed.flow_mol_s, tol = p1.tolerances.numerical.balances_on_every_stage;
  for (const q of residuals(warm, rec.rigorous_warm, rec.checks.feed_T_K)) {
    assert.ok(q.material <= tol.material_relative_to_feed * F && q.summation <= tol.summation && q.equilibrium <= 1e-9
      && q.energy <= tol.energy_relative_to_feed_times_10kJ_mol * F * H_SCALE + q.energyTol, `P1 warm stage ${q.stage}: ${JSON.stringify(q)}`);
  }
  assert.ok(Math.abs(rec.rigorous_warm.stages[0].L_mol_s - 3.3 * rec.rigorous_warm.D_mol_s) < 1e-7, "the warm specs");
});
