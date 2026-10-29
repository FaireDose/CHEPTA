// Proposal 0015, milestone M1 (W2): the shortcut column (src/units/columns/shortcut.js, column.js) against W7's cases
// (validation/data/columns/) and the independent reference validation/python/reference_fug.py (fixture
// validation/fixtures/columns.json), with the cases' own tolerances; and the Column block end to end: a flowsheet, the
// request path, a project file.
//
// Which cases apply to the shortcut: A1 and A2 (constant relative volatility, the fixture's shortcut numbers), E1
// (below the minimum reflux), C1 (missing data), E2 (the boil-up guard), E3 (a purity: refused until milestone M4).
// A3, B1 and D1 are rigorous columns (M2a): of them the shortcut takes B1's mixture, where it must say that the relative
// volatility changes along the column, and A3's partial condenser, here on a real mixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, stream, runUnit, specStatus, solveFlowsheet } from "../src/index.js";
import { run, capabilities } from "../src/api/dispatcher.js";
import { fug, boilup, wholeStages } from "../src/units/columns/shortcut.js";
import { COLUMN_MODES } from "../src/units/columns/column.js";
import { readProject, projectOf, stateFromProject } from "../src/ui/project.js";
import { initialState } from "../src/ui/app-logic.js";

const caseOf = id => JSON.parse(readFileSync(new URL(`../validation/data/columns/${id}.json`, import.meta.url)));
const fixture = JSON.parse(readFileSync(new URL("../validation/fixtures/columns.json", import.meta.url)));

/** The shortcut of a constant-alpha case, with its recoveries (A1: from its rigorous solution, as the fixture). */
function shortcutOf(c, ref) {
  const s = c.shortcut, f = c.column.feed, lk = c.components.indexOf(s.light_key), hk = c.components.indexOf(s.heavy_key);
  const rec = s.recovery_light_key_in_distillate != null
    ? [s.recovery_light_key_in_distillate, s.recovery_heavy_key_in_bottoms]
    : [ref.d_mol_s[lk] / (f.flow_mol_s * f.z[lk]), ref.b_mol_s[hk] / (f.flow_mol_s * f.z[hk])];
  return fug({ alpha: c.thermo.alpha, z: f.z, F: f.flow_mol_s, q: f.q, lk, hk, recoveryLK: rec[0], recoveryHK: rec[1],
    R: s.reflux_ratio ?? null, refluxOverMinimum: s.reflux_over_minimum ?? null, names: c.components });
}

for (const id of ["A1-binary-alpha", "A2-ternary-alpha-fug"]) {
  test(`shortcut ${id}: Fenske, Underwood and Gilliland as reference_fug.py`, () => {
    const c = caseOf(id), ref = fixture.cases[id].shortcut;
    // A2 states its tolerance (1e-9 relative: closed formulas and one root); A1's shortcut is the same calculation
    const tol = c.tolerances.numerical.engine_against_reference.relative ?? 1e-9;
    const r = shortcutOf(c, ref);
    const close = (u, v, what) => assert.ok(Math.abs(u - v) <= tol * Math.max(1, Math.abs(v)), `${id}: ${what} ${u} vs ${v}`);
    for (const k of ["N_min", "theta", "R_min", "R", "gilliland_X", "gilliland_Y", "N", "N_min_stripping", "N_below_feed"]) close(r[k], ref[k], k);
    close(r.D, ref.D_mol_s, "D"); close(r.B, ref.B_mol_s, "B");
    r.d.forEach((v, i) => close(v, ref.d_mol_s[i], `d of ${c.components[i]}`));
    r.b.forEach((v, i) => close(v, ref.b_mol_s[i], `b of ${c.components[i]}`));
    r.x_D.forEach((v, i) => close(v, ref.x_D[i], `x_D of ${c.components[i]}`));
  });
}

test("shortcut E1: a reflux ratio below Underwood's minimum is refused, naming R_min; no stages", () => {
  const c = caseOf("E1-shortcut-below-minimum-reflux"), a2 = fixture.cases["A2-ternary-alpha-fug"].shortcut;
  assert.throws(() => shortcutOf(c, null), e => {
    assert.equal(e.code, c.expected.code);
    for (const w of c.expected.message_names) assert.match(e.message, new RegExp(w));
    // the R_min it names agrees with the fixture to 1e-9 relative (the case's tolerance)
    assert.ok(Math.abs(e.details.R_min - a2.R_min) <= 1e-9 * a2.R_min, `${e.details.R_min} vs ${a2.R_min}`);
    return true;
  });
  // and through the request path: invalid_input (the outcome the case expects)
  const r = run({ capability: "solve_column", input: { components: ["benzene", "toluene"], thermo: { model: "ideal" },
    feed: { flow_kmol_h: { benzene: 50, toluene: 50 }, P_kPa: 101.325, VF: 0 },
    column: { light_key: "benzene", heavy_key: "toluene", recovery_light_key_in_distillate: 0.95, recovery_heavy_key_in_bottoms: 0.95, reflux_ratio: 0.5 } } });
  assert.equal(r.outcome, c.expected.outcome);
  assert.match(r.error.message, /minimum reflux/);
  assert.equal(r.value, undefined);
});

test("shortcut E2: a boil-up of zero or less is refused and says which specification to change", () => {
  const c = caseOf("E2-negative-boilup"), { flow_mol_s: F, q } = c.column.feed;
  const R = c.specs.find(s => s.kind === "reflux_ratio").value, D = c.specs.find(s => s.kind === "distillate_flow_mol_s").value;
  assert.throws(() => boilup({ R, D, F, q }), e => {
    assert.ok(c.expected.outcome_one_of.includes("invalid_input") && e.code === "BAD_INPUT");
    assert.ok(Math.abs(e.details.V_below_feed - fixture.cases["E2-negative-boilup"].checks.boilup.V_below_feed_mol_s) < 1e-12);
    assert.match(e.message, /larger distillate or a larger reflux ratio/);
    return true;
  });
  assert.ok(boilup({ R: 2, D: 50, F: 100, q: 1 }).V_below_feed > 0);
});

test("shortcut: the guards on keys and recoveries", () => {
  const base = { alpha: [4, 2, 1], z: [0.3, 0.3, 0.4], F: 100, q: 1, recoveryLK: 0.98, recoveryHK: 0.98, refluxOverMinimum: 1.3, names: ["A", "B", "C"] };
  assert.throws(() => fug({ ...base, lk: 1, hk: 0 }), e => e.code === "BAD_INPUT" && /more volatile/.test(e.message));
  assert.throws(() => fug({ ...base, lk: 0, hk: 2 }), e => e.code === "NOT_AVAILABLE" && /B is between the keys/.test(e.message));
  assert.throws(() => fug({ ...base, lk: 0, hk: 1, recoveryLK: 0.4, recoveryHK: 0.5 }), e => e.code === "BAD_INPUT" && /add up to more than 1/.test(e.message));
  assert.throws(() => fug({ ...base, lk: 0, hk: 1, recoveryLK: 1 }), e => e.code === "BAD_INPUT");
  // whole stages: numbered from the top, a total condenser counted; the feed between the condenser and the reboiler
  assert.deepEqual(wholeStages(22.286, 11.143, true), { equilibrium_stages: 23, stages: 24, feed_stage: 14 });
  assert.deepEqual(wholeStages(22.286, 11.143, false), { equilibrium_stages: 23, stages: 23, feed_stage: 13 });
});

// The Column block on CHEPTA's own mixtures. Methods by docs/METHOD_SELECTION.md: benzene, toluene, o-xylene, near-ideal
// hydrocarbons at 1 atm: the ideal solution; ethanol + water, polar below 10 bar: NRTL with an ideal-gas vapour (rule 3).
const BTX = () => system({ components: ["benzene", "toluene", "o-xylene"], model: "ideal" });
const btxFeed = sys => stream(sys, { flow_kmol_h: { benzene: 30, toluene: 30, "o-xylene": 40 }, P_kPa: 101.325, VF: 0 });
const SPEC = { light_key: "benzene", heavy_key: "toluene", recovery_light_key_in_distillate: 0.98, recovery_heavy_key_in_bottoms: 0.98, reflux_over_minimum: 1.3 };

test("Column block (shortcut): balances closed, saturated products, the duties, the minimal profile", () => {
  const sys = BTX(), feed = btxFeed(sys);
  for (const condenser of ["total", "partial"]) {
    const r = runUnit("column", { sys, inlets: { in: feed }, spec: { ...SPEC, condenser } });
    const s = r.state, { distillate: D, bottoms: B } = r.outlets;
    assert.ok(r.balance.material <= 1e-12, `material ${r.balance.material}`);
    assert.ok(Math.abs(r.balance.energy_kW) <= 1e-9 * s.reboiler_kW, `energy ${r.balance.energy_kW}`);
    assert.equal(D.VF, condenser === "total" ? 0 : 1);
    assert.equal(B.VF, 0);
    assert.ok(Math.abs(r.duty_kW - (s.reboiler_kW - s.condenser_kW)) < 1e-9 && s.condenser_kW > 0 && s.reboiler_kW > 0);
    // the same numbers as the equations on the block's own volatilities and q
    const i = sys.ids, alpha = i.map(id => s.alpha[id]);
    const ref = fug({ alpha, z: feed.z, F: feed.F_kmol_h, q: s.q, lk: 0, hk: 1, recoveryLK: 0.98, recoveryHK: 0.98, refluxOverMinimum: 1.3 });
    for (const k of ["N_min", "R_min", "N", "theta"]) assert.ok(Math.abs(s[k] - ref[k]) <= 1e-12 * Math.abs(ref[k]), k);
    assert.ok(Math.abs(s.q - 1) < 1e-6, "a saturated-liquid feed: q = 1");
    assert.ok(Math.abs(D.flows[0] - 0.98 * 30) < 1e-9 && Math.abs(B.flows[1] - 0.98 * 30) < 1e-9, "the recoveries");
    assert.ok(D.flows[2] / 40 < 1e-3, "the heavy non-key stays in the bottoms");
    // the profile: condenser, feed, reboiler; constant molar overflow
    assert.deepEqual(r.profile.map(p => p.name), ["condenser", "feed", "reboiler"]);
    assert.equal(r.profile[0].stage, 1);
    assert.equal(r.profile[2].stage, s.stages);
    assert.ok(r.profile[1].stage > 1 && r.profile[1].stage < s.stages);
    assert.ok(Math.abs(r.profile[0].L_kmol_h - s.R * s.D_kmol_h) < 1e-9 && Math.abs(r.profile[2].V_kmol_h - (s.R + 1) * s.D_kmol_h) < 1e-9);
    assert.ok(r.profile[0].T_K < r.profile[1].T_K && r.profile[1].T_K < r.profile[2].T_K);
    assert.match(r.notes[0], /constant relative volatility/);
    assert.equal(s.stages, s.equilibrium_stages + (condenser === "total" ? 1 : 0));
  }
});

test("Column block (shortcut) on B1's mixture: the relative volatility changes along the column, and the shortcut says so", () => {
  const c = caseOf("B1-ethanol-water-nrtl"), chk = fixture.cases["B1-ethanol-water-nrtl"].checks;
  const sys = system({ components: c.components, model: c.thermo.model });
  const f = c.column.feed;
  const feed = stream(sys, { flow_kmol_h: f.z.map(v => v * f.flow_mol_s), T_K: f.T_K, P_kPa: c.pressure_kPa });
  const r = runUnit("column", { sys, inlets: { in: feed }, spec: { light_key: "ethanol", heavy_key: "water", recovery_light_key_in_distillate: 0.8,
    recovery_heavy_key_in_bottoms: 0.8, reflux_ratio: 2 } });
  assert.equal(r.warnings[0].code, "VOLATILITY_VARIES");
  assert.ok(r.state.alpha_keys.bottom > 2 * r.state.alpha_keys.top, JSON.stringify(r.state.alpha_keys));
  // the same trend as the rigorous reference's stages (top 1.13, reboiler 2.41)
  assert.ok(chk.relative_volatility.reboiler > 2 * chk.relative_volatility.stage_2);
  assert.ok(r.state.q > 1, "350 K is below the feed's bubble point: a subcooled feed");
});

test("Column block (shortcut): a distillate beyond the azeotrope (E3's purity, reached by recoveries) is refused, naming the azeotrope", () => {
  const sys = system({ components: ["ethanol", "water"], model: "NRTL" });
  const feed = stream(sys, { flow_kmol_h: { ethanol: 50, water: 50 }, T_K: 350, P_kPa: 101.325 });
  // 99 % of each key: the distillate would hold 0.99 ethanol, above the model's azeotrope (0.8805, fixture B1)
  assert.throws(() => runUnit("column", { sys, inlets: { in: feed }, spec: { light_key: "ethanol", heavy_key: "water",
    recovery_light_key_in_distillate: 0.99, recovery_heavy_key_in_bottoms: 0.99, reflux_ratio: 5 } }),
  e => e.code === "BAD_INPUT" && /azeotrope/.test(e.message) && e.details.relative_volatility.top < 1);
});

test("Column E3: a purity, in either mode, refused as not built yet (unsupported), never a column", () => {
  const c = caseOf("E3-purity-above-azeotrope");
  const input = { components: c.components, thermo: { model: c.thermo.model },
    feed: { flow_kmol_h: { ethanol: 50, water: 50 }, T_K: c.column.feed.T_K, P_kPa: c.pressure_kPa },
    column: { light_key: "ethanol", heavy_key: "water", distillate_purity: c.specs[1].value, recovery_heavy_key_in_bottoms: 0.9, reflux_ratio: c.specs[0].value } };
  const r = run({ capability: "solve_column", input });
  assert.equal(r.outcome, c.expected.outcome_before_M4);
  assert.match(r.error.message, /purity specifications come with milestone M4/);
  assert.equal(r.value, undefined);
  // the rigorous mode landed with milestone M2a (this test refused it before; test/columns-rigorous.test.js tests it)
  const rig = run({ capability: "solve_column", input: { ...input, column: { mode: "rigorous", stages: 20, feed_stage: 10, reflux_ratio: 2, distillate_purity: c.specs[1].value } } });
  assert.equal(rig.outcome, c.expected.outcome_before_M4);
  assert.match(rig.error.message, /purity specifications come with milestone M4/);
  assert.deepEqual(COLUMN_MODES.map(m => [m.mode, m.status]), [["shortcut", "available"], ["rigorous", "available"]]);
});

test("Column C1: the pair without NRTL parameters is missing data, named; no column", () => {
  const c = caseOf("C1-missing-pair");
  const r = run({ capability: "solve_column", input: { components: c.components, thermo: { model: c.thermo.model },
    feed: { flow_kmol_h: Object.fromEntries(c.components.map((id, i) => [id, c.column.feed.z[i] * 100])), P_kPa: c.pressure_kPa, VF: 0 },
    column: { light_key: "methanol", heavy_key: "water", recovery_light_key_in_distillate: 0.95, recovery_heavy_key_in_bottoms: 0.95, reflux_over_minimum: 1.3 } } });
  assert.equal(r.outcome, c.expected.outcome);
  assert.equal(r.error.code, c.expected.code);
  for (const n of c.expected.message_names) assert.match(r.error.message, new RegExp(n));
  assert.equal(r.value, undefined);
});

test("Column through the request path: solve_column gives the flowsheet's numbers, with checks and qualifications", () => {
  assert.equal(capabilities().find(c => c.name === "solve_column").status, "available");
  const input = { components: ["benzene", "toluene", "o-xylene"], thermo: { model: "ideal" },
    feed: { flow_kmol_h: { benzene: 30, toluene: 30, "o-xylene": 40 }, P_kPa: 101.325, VF: 0 }, column: SPEC };
  const r = run({ capability: "solve_column", input });
  assert.equal(r.outcome, "ok");
  const u = runUnit("column", { sys: BTX(), inlets: { in: btxFeed(BTX()) }, spec: SPEC });
  assert.equal(r.value.column.N, u.state.N);
  assert.equal(r.value.distillate.F_kmol_h, u.outlets.distillate.F_kmol_h);
  assert.equal(r.value.column.profile.length, 3);
  assert.ok(Math.abs(r.checks.energy_kW) < 1e-6 && r.checks.material_kmol_h < 1e-9);
  // benzene to toluene: 2.60 at the top, 2.25 at the bottom (15 %), within the 20 % of VOLATILITY_TOLERANCE: no warning
  assert.deepEqual(r.qualifications.warnings, []);
  assert.ok(r.value.column.alpha_keys.top / r.value.column.alpha_keys.bottom - 1 < 0.2);
  assert.ok(r.qualifications.notes.some(n => /Gilliland/.test(n.note)));
  // too few specifications: the degrees of freedom name what is missing
  const st = specStatus("column", { light_key: "benzene" }, { sys: BTX() });
  assert.equal(st.status, "missing");
  assert.match(st.message, /heavy key/);
  assert.equal(run({ capability: "solve_column", input: { ...input, column: { light_key: "benzene" } } }).outcome, "invalid_input");
});

/** A flowsheet with a feed, a column and its two products. */
const columnFlowsheet = () => ({
  components: ["benzene", "toluene", "o-xylene"], thermo: { model: "ideal", vapour: "ideal" },
  blocks: [
    { id: "F1", type: "feed", x: 40, y: 160, spec: { flow_kmol_h: { benzene: 30, toluene: 30, "o-xylene": 40 }, P_kPa: 101.325, VF: 0 } },
    { id: "C1", type: "column", x: 200, y: 160, spec: { ...SPEC } },
    { id: "P1", type: "product", x: 360, y: 80 }, { id: "P2", type: "product", x: 360, y: 240 }],
  streams: [{ id: "S1", from: "F1.out", to: "C1.in" }, { id: "S2", from: "C1.distillate", to: "P1.in" }, { id: "S3", from: "C1.bottoms", to: "P2.in" }],
});

test("Column in a project: written as format 6, reopened with the same flowsheet; older formats still open", () => {
  const fs = columnFlowsheet();
  const doc = projectOf(initialState({ components: [], flowsheet: fs }), { version: "test" });
  assert.equal(doc.fugacity_project, 6);
  const back = stateFromProject(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(back.flowsheet.blocks.find(b => b.id === "C1").spec, fs.blocks[1].spec);
  const res = solveFlowsheet(BTX(), back.flowsheet);
  assert.ok(res.blocks.C1.state.N > res.blocks.C1.state.N_min);
  // a column in a file that says an older format is refused, naming format 6
  assert.throws(() => readProject({ ...doc, fugacity_project: 5 }), /format 6/);
  // a project without a column is written as before (format 2 here)
  assert.equal(projectOf(initialState({ components: [], flowsheet: { ...fs, blocks: fs.blocks.filter(b => b.type !== "column"), streams: [] } })).fugacity_project, 2);
});
