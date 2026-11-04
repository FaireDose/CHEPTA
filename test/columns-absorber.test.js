// Proposal 0015, Part II, step 7 (milestone M3, W2): the absorber and the stripper on the rigorous column engine (no
// condenser; no reboiler, or a reboiler alone), with stage duties, and columns with nonvolatile components (proposal
// 0009, step 5), against the cases of validation/data/columns/absorber-stripper/cases.json and the independent
// reference validation/python/reference_mesh_absorber.py (fixture validation/fixtures/columns_absorber.json).
// The property methods are the cases' (method_choice in each): the model systems and The ChemSep Book's polynomials need
// none; NRTL for methanol + water (docs/METHOD_SELECTION.md rule 3); Peng-Robinson for the hydrocarbons (rules 1 and 2);
// the ideal solution for lactic acid, which has no NRTL or UNIQUAC pair (Modified UNIFAC 2.0 as well, without a
// reference). The refusals use other methods on purpose: they test that an absorber refuses a method that cannot
// describe a gas dissolved in the liquid.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, solveFlowsheet } from "../src/index.js";
import { run } from "../src/api/dispatcher.js";
import { anyBubbleT } from "../src/equilibrium/bubble-any.js";
import { solveCascade, DRY_FRACTION } from "../src/units/columns/engine.js";
import { readProject, projectOf, stateFromProject } from "../src/ui/project.js";
import { initialState } from "../src/ui/app-logic.js";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const load = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const CASES = load("../validation/data/columns/absorber-stripper/cases.json").cases;
const FIX = load("../validation/fixtures/columns_absorber.json").cases;
const caseOf = id => CASES.find(c => c.id === id);
const sum = v => v.reduce((a, b) => a + b, 0);
const SPEC_OF = { reflux_ratio: "reflux_ratio", distillate_flow_mol_s: "distillate_rate", bottoms_flow_mol_s: "bottoms_rate", boilup_ratio: "boilup_ratio" };

/** The case's thermodynamics as the engine's adapter (model systems), or CHEPTA's system. */
function thermoOf(c) {
  const th = c.thermo === "as H2" ? caseOf("H2-chemsep-ammonia-absorber").thermo : c.thermo, P = c.pressure_kPa;
  if (th.kind === "kremser-model") {
    const { alpha, K_solute: KA, reference_vapour_pressure: rp, latent_heat_J_mol: lam } = th;
    const lnK = T => [...alpha.map(a => Math.log(a) + rp.A - rp.B_K / T - Math.log(P)), Math.log(KA)];
    return { lam, adapter: { n: 3, names: c.components, P_kPa: P, lnK: (x, y, T) => lnK(T), hL: () => 0, hV: () => lam,
      bubbleT: x => { let T = 300; for (let k = 0; k < 100; k++) { const K = lnK(T).map(Math.exp), f = sum(K.map((k, i) => k * x[i])) - 1, d = sum(K.slice(0, 2).map((k, i) => k * x[i])) * rp.B_K / T / T; T -= f / d; } return T; } } };
  }
  if (th.kind === "polynomial") {
    const k = v => v.map(a => a / 1000);
    const [Av, Bv, aL, bL] = [k(th.A_J_kmol), k(th.B_J_kmol_K), k(th.a_J_kmol), k(th.b_J_kmol_K)];
    const hL = (x, T) => sum(x.map((v, i) => v * (aL[i] + bL[i] * T))), hV = (y, T) => sum(y.map((v, i) => v * (Av[i] + Bv[i] * T)));
    const Kof = T => th.alpha.map((a, i) => a + th.beta[i] * T);
    return { hL, hV, adapter: { n: 3, names: c.components, P_kPa: P, lnK: (x, y, T) => Kof(T).map(Math.log), hL, hV,
      bubbleT: x => { let lo = 290, hi = 450; for (let n = 0; n < 100; n++) { const m = (lo + hi) / 2; if (sum(Kof(m).map((K, i) => K * x[i])) > 1) hi = m; else lo = m; } return (lo + hi) / 2; } } };
  }
  const sys = system({ components: c.components, model: th.model, ...(th.vapour && !["PR", "SRK"].includes(th.model) ? { vapour: th.vapour } : {}) });
  return { sys, hL: (x, T) => sys.enthalpy("liquid", T, P, x), hV: (y, T) => sys.enthalpy("vapour", T, P, y) };
}

function feedsOf(c, t) {
  return c.column.feeds.map(f => {
    const flows = f.z.map(z => z * f.flow_mol_s);
    if ("q" in f) return { stage: f.stage, flows, H_W: (1 - f.q) * t.lam * f.flow_mol_s, q: f.q };
    let T = f.T_K, phase = f.phase;
    if (phase === "saturated vapour") { T = anyBubbleT(t.sys, f.z, c.pressure_kPa).T; phase = "vapour"; }
    const h = phase === "liquid" ? t.hL(f.z, T) : t.hV(f.z, T);
    return { stage: f.stage, flows, H_W: h * f.flow_mol_s, T_K: T, q: phase === "liquid" ? 1 : 0 };
  });
}

function engineOf(c, extra = {}) {
  const t = thermoOf(c);
  return solveCascade({ ...(t.adapter ? { thermo: t.adapter } : { sys: t.sys, P_kPa: c.pressure_kPa }), stages: c.column.stages,
    ends: { condenser: c.column.condenser, reboiler: c.column.reboiler }, feeds: feedsOf(c, t),
    duties: c.column.duties_W ?? [], specs: c.specs.map(s => ({ kind: SPEC_OF[s.kind], value: s.value })), ...extra });
}

function againstReference(c, r) {
  const ref = FIX[c.id].profile, tol = c.tolerances.engine_against_reference;
  assert.equal(r.converged, true);
  assert.equal(r.stages.length, ref.stages.length);
  r.stages.forEach((s, j) => {
    const q = ref.stages[j], where = `${c.id} stage ${s.stage}`;
    assert.ok(Math.abs(s.T_K - q.T_K) <= tol.T_K_absolute, `${where}: T ${s.T_K} vs ${q.T_K}`);
    assert.ok(Math.abs(s.L_mol_s - q.L_mol_s) <= tol.flows_relative * q.L_mol_s, `${where}: L ${s.L_mol_s} vs ${q.L_mol_s}`);
    assert.ok(Math.abs(s.V_mol_s - q.V_mol_s) <= tol.flows_relative * Math.max(q.V_mol_s, 1e-300) || (q.V_mol_s === 0 && s.V_mol_s === 0), `${where}: V ${s.V_mol_s} vs ${q.V_mol_s}`);
    s.x.forEach((v, i) => assert.ok(Math.abs(v - q.x[i]) <= tol.mole_fractions_absolute, `${where}: x${i} ${v} vs ${q.x[i]}`));
  });
  for (const k of ["material", "equilibrium", "summation", "energy", "specifications"]) assert.ok(r.residuals[k] <= r.tolerances[k], `${c.id}: ${k} ${r.residuals[k]}`);
}

test("H1: a model absorber meets the Kremser equation exactly, and the reference", () => {
  const c = caseOf("H1-kremser-absorber"), r = engineOf(c), k = FIX[c.id].kremser;
  againstReference(c, r);
  const notAbsorbed = r.products.distillate.flows[2] / (c.column.feeds[1].flow_mol_s * c.column.feeds[1].z[2]);
  assert.ok(Math.abs(notAbsorbed / k.fraction_not_absorbed_kremser - 1) < c.tolerances.kremser_fraction_relative, `${notAbsorbed} vs Kremser ${k.fraction_not_absorbed_kremser}`);
  // the model keeps the flows constant on every stage, which the Kremser equation assumes
  for (const s of r.stages) { assert.ok(Math.abs(s.L_mol_s - 120) < 1e-9 && Math.abs(s.V_mol_s - 100) < 1e-9); }
  assert.equal(r.products.distillate.phase, "vapour");
  assert.deepEqual([r.stages[0].name, r.stages[5].name], ["top", "bottom"]);
  assert.deepEqual(r.duties, { condenser_W: 0, reboiler_W: 0 });
  assert.match(r.solver.start, /sum-rates/);
});

for (const id of ["H2-chemsep-ammonia-absorber", "H3-chemsep-ammonia-absorber-cooled", "H4-steam-stripper-methanol-water",
  "H5-reboiled-stripper-methanol-water", "H6-lean-oil-absorber-pr", "H7-nonvolatile-distillation"]) {
  test(`${id}: the reference's profile within the case's tolerances; balances closed`, () => {
    const c = caseOf(id), r = engineOf(c), ref = FIX[id].profile;
    againstReference(c, r);
    assert.deepEqual(r.warnings.map(w => w.code), c.expected.warnings.map(w => w.code));
    // the overall balances: every component, and the energy with the stage duties and the reboiler's
    const t = thermoOf(c), feeds = feedsOf(c, t), F = sum(feeds.map(f => sum(f.flows)));
    c.components.forEach((_, i) => assert.ok(Math.abs(sum(feeds.map(f => f.flows[i])) - r.products.distillate.flows[i] - r.products.bottoms.flows[i]) < 1e-9 * F));
    const Hin = sum(feeds.map(f => f.H_W)) + sum((c.column.duties_W ?? []).map(d => d.Q_W)) + r.duties.reboiler_W - r.duties.condenser_W;
    const Hout = r.products.distillate.H_W + r.products.bottoms.H_W;
    assert.ok(Math.abs(Hin - Hout) < 1e-7 * F * 1e4, `${id}: energy in ${Hin} W, out ${Hout} W`);
    if (c.column.duties_W) for (const d of c.column.duties_W) assert.equal(r.stages[d.stage - 1].duty_W, d.Q_W);
    if (c.column.reboiler === "partial") {
      const Qref = ref.Q_reboiler_W;
      assert.ok(Math.abs(r.duties.reboiler_W - Qref) <= c.tolerances.engine_against_reference.duties_relative * Math.abs(Qref), `${id}: reboiler ${r.duties.reboiler_W} vs ${Qref}`);
    }
  });
}

test("H2: the absorber's temperature bulge, and the stage duty of H3 lowers it", () => {
  const h2 = engineOf(caseOf("H2-chemsep-ammonia-absorber")), h3 = engineOf(caseOf("H3-chemsep-ammonia-absorber-cooled"));
  const T2 = h2.stages.map(s => s.T_K), T3 = h3.stages.map(s => s.T_K);
  const peak = T2.indexOf(Math.max(...T2));
  assert.ok(peak > 0 && peak < T2.length - 1, `the hottest stage is inside the column (${peak + 1})`);
  assert.ok(Math.max(...T3) < Math.max(...T2));
  // ammonia leaves the top far below its 33.3 mol/s fed
  assert.ok(h2.products.distillate.flows[0] < 0.01 * 33.28);
});

test("H7: lactic acid stays in the liquid and leaves with the bottoms; also with Modified UNIFAC 2.0", () => {
  const c = caseOf("H7-nonvolatile-distillation"), r = engineOf(c);
  assert.ok(r.products.distillate.flows[2] < 1e-15, `lactic acid in the distillate ${r.products.distillate.flows[2]}`);
  assert.ok(r.stages.every(s => s.y == null || s.y[2] < 1e-15));
  const m = engineOf({ ...c, thermo: { kind: "chepta", model: "MOD-UNIFAC-2" } });
  assert.equal(m.converged, true);
  assert.ok(Math.abs(m.products.bottoms.flows[2] - 1) < 1e-12);
});

test("H8: a stripper boiled nearly dry warns DRY_STAGE on the reboiler; a bottoms at or below the nonvolatile flow is refused", () => {
  const c = caseOf("H8-nonvolatile-stripper-dry"), r = engineOf(c);
  againstReference(c, r);
  const w = r.warnings.filter(x => x.code === "DRY_STAGE");
  assert.equal(w.length, 1);
  assert.equal(w[0].phase, "volatile liquid");
  assert.deepEqual(w[0].stages, [c.column.stages]);
  const Vmax = Math.max(...r.stages.map(s => s.V_mol_s));
  assert.ok(r.products.bottoms.flows[0] < DRY_FRACTION * Vmax);
  for (const B of [1.0, 0.8]) {
    assert.throws(() => engineOf({ ...c, specs: [{ kind: "bottoms_flow_mol_s", value: B }] }), e => e.code === "BAD_INPUT" && /nonvolatile/.test(e.message) && /dry/.test(e.message));
  }
});

test("the engine's input checks for columns without a condenser", () => {
  const c = caseOf("H1-kremser-absorber");
  assert.throws(() => engineOf(c, { specs: [{ kind: "boilup_ratio", value: 1 }] }), /takes no specification/);
  assert.throws(() => engineOf(caseOf("H5-reboiled-stripper-methanol-water"), { specs: [{ kind: "reflux_ratio", value: 1 }] }), /needs a condenser/);
  assert.throws(() => engineOf(c, { ends: { condenser: "total", reboiler: "none" }, specs: [] }), e => e.code === "NOT_AVAILABLE");
  assert.throws(() => engineOf(c, { duties: [{ stage: 9, Q_W: 1 }] }), /stage duty 1/);
  assert.throws(() => engineOf(caseOf("H5-reboiled-stripper-methanol-water"), { duties: [{ stage: 10, Q_W: 1 }] }), /is the reboiler/);
});

// ---- the Column block: configuration "absorber" or "stripper", through the request path, the command line and a project

const KMOL_H = 3.6;   // kmol/h per mol/s
/** A case's feeds as solve_column's feed (the liquid, on the top) and gas_feed (on the bottom). */
function columnRequest(c, column) {
  const feedSpec = f => ({ flow_kmol_h: Object.fromEntries(c.components.map((id, i) => [id, f.z[i] * f.flow_mol_s * KMOL_H]).filter(([, v]) => v > 0)),
    P_kPa: c.pressure_kPa, ...(f.phase === "saturated vapour" ? { VF: 1 } : { T_K: f.T_K }) });
  const [liq, gas] = c.column.feeds;
  return { capability: "solve_column", input: { components: c.components, thermo: { model: c.thermo.model, ...(c.thermo.vapour ? { vapour: c.thermo.vapour } : {}) },
    feed: feedSpec(liq), ...(gas ? { gas_feed: feedSpec(gas) } : {}), column } };
}

test("the absorber block (H6, Peng-Robinson) through solve_column: the engine's reference profile, the outlets by phase", () => {
  const c = caseOf("H6-lean-oil-absorber-pr"), ref = FIX[c.id].profile, tol = c.tolerances.engine_against_reference;
  const r = run(columnRequest(c, { configuration: "absorber", stages: 6 }));
  assert.equal(r.outcome, "ok");
  const col = r.value.column;
  assert.equal(col.configuration, "absorber");
  assert.deepEqual(col.feed_stages, [1, 6]);
  col.profile.forEach((s, j) => {
    assert.ok(Math.abs(s.T_K - ref.stages[j].T_K) <= tol.T_K_absolute, `stage ${s.stage}: ${s.T_K} vs ${ref.stages[j].T_K}`);
    assert.ok(Math.abs(s.L_kmol_h / KMOL_H - ref.stages[j].L_mol_s) <= tol.flows_relative * ref.stages[j].L_mol_s);
  });
  // the gas leaves the top as a vapour, the liquid the bottom; methane mostly passes, n-butane is mostly absorbed
  assert.equal(r.value.distillate.VF, 1);
  assert.equal(r.value.bottoms.VF, 0);
  c.components.forEach((id, i) => assert.ok(Math.abs(r.value.distillate.flow_kmol_h[id] / KMOL_H - ref.top_flows_mol_s[i]) <= 1e-6 * Math.max(ref.top_flows_mol_s[i], 1e-3)));
  assert.equal(col.duty_kW, 0);
  assert.match(col.notes[0], /Rigorous absorber/);
});

test("a stripper with live steam and a stage duty (H4 with 50 kW on stage 5): the flowsheet's energy balance closes", () => {
  const c = caseOf("H4-steam-stripper-methanol-water");
  const r = run(columnRequest(c, { configuration: "stripper", stages: 10, stage_duties_kW: [{ stage: 5, duty_kW: 50 }] }));
  assert.equal(r.outcome, "ok");
  const v = r.value, col = v.column;
  assert.equal(col.duty_kW, 50);
  assert.equal(col.profile[4].duty_kW, 50);
  const Hin = v.feed.H_kW + v.gas_feed.H_kW + col.duty_kW, Hout = v.distillate.H_kW + v.bottoms.H_kW;
  assert.ok(Math.abs(Hin - Hout) < 1e-6 * Math.abs(Hin), `in ${Hin} kW, out ${Hout} kW`);
  // without the duty, the case's reference
  const ref = FIX[c.id].profile, b = run(columnRequest(c, { configuration: "stripper", stages: 10 }));
  b.value.column.profile.forEach((s, j) => assert.ok(Math.abs(s.T_K - ref.stages[j].T_K) <= c.tolerances.engine_against_reference.T_K_absolute));
});

test("a reboiled stripper (H5) through solve_column: one specification, the reference's reboiler duty", () => {
  const c = caseOf("H5-reboiled-stripper-methanol-water"), ref = FIX[c.id].profile;
  const r = run(columnRequest(c, { configuration: "stripper", stages: 10, reboiler: "partial", boilup_ratio: 0.25 }));
  assert.equal(r.outcome, "ok");
  assert.ok(Math.abs(r.value.column.reboiler_kW * 1000 - ref.Q_reboiler_W) <= 1e-6 * ref.Q_reboiler_W, `${r.value.column.reboiler_kW} kW`);
  assert.ok(Math.abs(r.value.column.boilup_ratio - 0.25) < 1e-9);
  assert.equal(r.value.column.profile.at(-1).name, "reboiler");
});

test("an absorber refuses a method that cannot describe a gas dissolving in its liquid (docs/METHOD_SELECTION.md, step 2)", () => {
  // these methods are used on purpose: they are the ones to refuse
  const pr = run({ capability: "solve_column", input: { components: ["carbon-dioxide", "water"], thermo: { model: "PR" },
    feed: { flow_kmol_h: { water: 360 }, T_K: 300, P_kPa: 2000 }, gas_feed: { flow_kmol_h: { "carbon-dioxide": 72 }, T_K: 300, P_kPa: 2000 },
    column: { configuration: "absorber", stages: 5 } } });
  assert.equal(pr.outcome, "unsupported");
  assert.match(pr.error.message, /polar liquid/);
  assert.match(pr.error.message, /Henry's law/);
  const ideal = run({ capability: "solve_column", input: { components: ["carbon-dioxide", "methanol"], thermo: { model: "ideal" },
    feed: { flow_kmol_h: { methanol: 100 }, T_K: 250, P_kPa: 2000 }, gas_feed: { flow_kmol_h: { "carbon-dioxide": 20 }, T_K: 310, P_kPa: 2000 },
    column: { configuration: "absorber", stages: 4 } } });
  assert.equal(ideal.outcome, "unsupported");
  assert.match(ideal.error.message, /above its critical temperature/);
});

test("the absorber's and stripper's input checks", () => {
  const c = caseOf("H6-lean-oil-absorber-pr");
  const bad = (column, re) => { const r = run(columnRequest(c, column)); assert.equal(r.outcome, "invalid_input", JSON.stringify(column)); assert.match(r.error.message, re); };
  bad({ configuration: "absorber", mode: "shortcut", stages: 6 }, /stage by stage/);
  bad({ configuration: "absorber", stages: 6, reboiler: "partial", boilup_ratio: 1 }, /no reboiler/);
  bad({ configuration: "absorber", stages: 6, reflux_ratio: 2 }, /needs a condenser/);
  bad({ configuration: "absorber", stages: 6, bottoms_kmol_h: 100 }, /takes none|takes no specification/);
  bad({ configuration: "stripper", stages: 6, reboiler: "partial" }, /one specification/);
  bad({ configuration: "absorber", stages: 6, feed_stage: [1, 7] }, /from 1 \(the top\) to 6/);
  bad({ configuration: "absorber", stages: 6, stage_duties_kW: [{ stage: 0, duty_kW: 1 }] }, /stage_duties_kW\[0\]/);
  bad({ configuration: "distillation", mode: "rigorous", stages: 6, feed_stage: 3, reflux_ratio: 1, distillate_kmol_h: 10, reboiler: "none" }, /absorber's or a stripper's/);
  bad({ configuration: "decanter", stages: 6 }, /not one of distillation, absorber, stripper/);
  assert.equal(run(columnRequest(c, { configuration: "absorber", stages: 6, phases: "VLL" })).outcome, "unsupported");
});

test("chepta request: the absorber from the command line gives the library's numbers", () => {
  const c = caseOf("H6-lean-oil-absorber-pr"), req = columnRequest(c, { configuration: "absorber", stages: 6 });
  const dir = mkdtempSync(join(tmpdir(), "chepta-absorber-")), f = join(dir, "absorber.json");
  writeFileSync(f, JSON.stringify(req));
  const p = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/chepta.mjs", import.meta.url)), "request", f], { encoding: "utf8", timeout: 60000 });
  assert.equal(p.status, 0, p.stderr);
  const out = JSON.parse(p.stdout);
  assert.equal(out.outcome, "ok");
  assert.deepEqual(out.value.column.profile, run(req).value.column.profile);
});

test("an absorber in a project: written, reopened, solved again with the same numbers", () => {
  const c = caseOf("H6-lean-oil-absorber-pr"), { input } = columnRequest(c, { configuration: "absorber", stages: 6, stage_duties_kW: [{ stage: 3, duty_kW: -20 }] });
  const fs = { components: input.components, thermo: input.thermo,
    blocks: [{ id: "F1", type: "feed", x: 40, y: 80, spec: input.feed }, { id: "F2", type: "feed", x: 40, y: 240, spec: input.gas_feed },
      { id: "C1", type: "column", x: 200, y: 160, spec: input.column }, { id: "P1", type: "product", x: 360, y: 80 }, { id: "P2", type: "product", x: 360, y: 240 }],
    streams: [{ id: "S1", from: "F1.out", to: "C1.in" }, { id: "S2", from: "F2.out", to: "C1.in" }, { id: "S3", from: "C1.distillate", to: "P1.in" }, { id: "S4", from: "C1.bottoms", to: "P2.in" }] };
  const doc = projectOf(initialState({ components: [], flowsheet: fs }), { version: "test" });
  const back = stateFromProject(readProject(JSON.parse(JSON.stringify(doc))));
  assert.deepEqual(back.flowsheet.blocks.find(b => b.id === "C1").spec, input.column);
  const sys = system({ components: input.components, model: "PR" });
  const a = solveFlowsheet(sys, fs), b = solveFlowsheet(sys, back.flowsheet);
  assert.equal(a.blocks.C1.state.configuration, "absorber");
  assert.equal(a.blocks.C1.duty_kW, -20);
  assert.deepEqual(b.blocks.C1.profile, a.blocks.C1.profile);
});

test("the absorber's and stripper's outlets are named \"gas out\" and \"liquid out\"; the stored port ids stay (the maintainer, 2026-11-04)", async () => {
  const { outletName } = await import("../src/ui/flowsheet-view.js");
  for (const configuration of ["absorber", "stripper"]) {
    const b = { type: "column", spec: { configuration } };
    assert.equal(outletName(b, "distillate"), "gas out");
    assert.equal(outletName(b, "bottoms"), "liquid out");
  }
  assert.equal(outletName({ type: "column", spec: {} }, "distillate"), null);
  assert.equal(outletName({ type: "flash", spec: {} }, "vapour"), null);
});
