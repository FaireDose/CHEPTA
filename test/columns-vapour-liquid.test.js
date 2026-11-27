/**
 * Proposal 0026, steps 1 and 2 (accepted by the maintainer on 2026-11-18; docs/decisions/2026-11-18-05-vapour-liquid-condenser-proposal.md):
 * the condenser with a vapour and a liquid distillate (condenser "vapour_liquid"). Stage 1 is an equilibrium stage whose
 * vapour leaves as the vapour distillate and whose liquid is split into the reflux and the liquid distillate (The
 * ChemSep Book, section 13.2; DWSIM's Partial_Condenser; IDAES's partial condenser); the condenser takes one
 * specification of its own (its temperature, the vapour distillate's flow or the vapour's share) and the column two.
 *
 * Against the independent reference (validation/python/reference_mesh_condenser.py, the MESH equations of
 * reference_mesh.py with the condenser; validation/fixtures/columns-vapour-liquid.json):
 *  - H1, the constant-alpha column with a light component, with each of the three condenser specifications;
 *  - H2, the limits (a share of 0.001 against the total condenser, 0.999 against the partial one) and a temperature above
 *    the top vapour's dew point, refused;
 *  - H3, CHEPTA-Lab's methanol column (Peng-Robinson, 53 C, reflux ratio 2), and Lab's request file with this condenser.
 * And case 2b: feed_second_liquid "top" mixes the bypassed liquid into the liquid distillate after the column, never into
 * the condenser stage (the maintainer's correction to answer 4). The method of 2b and of the two-liquid refusal: NRTL for
 * 1-butanol + water + methanol (docs/METHOD_SELECTION.md rules 3 and 7: polar, two liquids possible).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { solveCascade } from "../src/units/columns/engine.js";
import { run } from "../src/api/dispatcher.js";
import { solveH3 } from "../validation/columns_vapour_liquid_engine_start.mjs";

const sum = v => v.reduce((a, b) => a + b, 0);
const KMOL_H = 1000 / 3600;
const caseOf = id => JSON.parse(readFileSync(new URL(`../validation/data/columns/vapour-liquid/${id}.json`, import.meta.url)));
const REF = JSON.parse(readFileSync(new URL("../validation/fixtures/columns-vapour-liquid.json", import.meta.url))).cases;

function alphaThermo(c) {
  const { alpha, reference_vapour_pressure: rp, latent_heat_J_mol: lam } = c.thermo, P = c.pressure_kPa;
  return { n: alpha.length, names: c.components, P_kPa: P, lnK: (x, y, T) => alpha.map(a => Math.log(a) + rp.A - rp.B_K / T - Math.log(P)),
    hL: () => 0, hV: () => lam, bubbleT: x => rp.B_K / (rp.A - Math.log(P / sum(alpha.map((a, i) => a * x[i])))) };
}
const ENGINE = { reflux_ratio: "reflux_ratio", distillate_flow_mol_s: "distillate_rate", bottoms_flow_mol_s: "bottoms_rate", boilup_ratio: "boilup_ratio" };
const CONDENSER = { condenser_T_K: "T_K", vapour_flow_mol_s: "vapour_rate", vapour_share: "vapour_share" };
/** The case's column by the engine, with the given condenser and specifications (the reference's names). */
function alphaColumn(c, condenser, specs) {
  const f = c.column.feed, lam = c.thermo.latent_heat_J_mol;
  const cs = specs.find(s => CONDENSER[s.kind]);
  return solveCascade({ thermo: alphaThermo(c), stages: c.column.stages,
    ends: { condenser, ...(cs ? { condenser_spec: { kind: CONDENSER[cs.kind], value: cs.value } } : {}) },
    feeds: [{ stage: f.stage, flows: f.z.map(z => z * f.flow_mol_s), H_W: (1 - f.q) * lam * f.flow_mol_s }],
    specs: specs.filter(s => ENGINE[s.kind]).map(s => ({ kind: ENGINE[s.kind], value: s.value })) });
}
/** The engine's column against the reference's profile, within the tolerances given. */
function againstReference(r, ref, tol, what) {
  assert.equal(r.stages.length, ref.stages.length);
  r.stages.forEach((s, j) => {
    const q = ref.stages[j], at = `${what} stage ${s.stage}`;
    assert.ok(Math.abs(s.T_K - q.T_K) <= tol.T_K_absolute, `${at}: T ${s.T_K} vs ${q.T_K}`);
    assert.ok(Math.abs(s.L_mol_s - q.L_mol_s) <= tol.flows_relative * q.L_mol_s, `${at}: L ${s.L_mol_s} vs ${q.L_mol_s}`);
    assert.ok(Math.abs(s.V_mol_s - q.V_mol_s) <= tol.flows_relative * Math.max(q.V_mol_s, 1e-300) || (q.V_mol_s === 0 && s.V_mol_s === 0), `${at}: V ${s.V_mol_s} vs ${q.V_mol_s}`);
    s.x.forEach((v, i) => assert.ok(Math.abs(v - q.x[i]) <= tol.mole_fractions_absolute, `${at}: x ${i} ${v} vs ${q.x[i]}`));
  });
  if (ref.U_liquid_distillate_mol_s != null) {
    const U = r.stages[0].U_mol_s;
    assert.ok(Math.abs(U - ref.U_liquid_distillate_mol_s) <= tol.flows_relative * ref.U_liquid_distillate_mol_s, `${what}: U1 ${U} vs ${ref.U_liquid_distillate_mol_s}`);
    assert.ok(Math.abs(sum(r.products.distillate.flows) - U) <= 1e-9 * U);
    assert.ok(Math.abs(sum(r.products.vapour_distillate.flows) - r.stages[0].V_mol_s) <= 1e-9 * r.stages[0].V_mol_s);
  }
  assert.ok(Math.abs(r.duties.condenser_W - ref.Q_condenser_W) <= tol.duties_relative * Math.abs(ref.Q_condenser_W), `${what}: condenser ${r.duties.condenser_W} vs ${ref.Q_condenser_W}`);
  assert.ok(Math.abs(r.duties.reboiler_W - ref.Q_reboiler_W) <= tol.duties_relative * Math.abs(ref.Q_reboiler_W), `${what}: reboiler ${r.duties.reboiler_W} vs ${ref.Q_reboiler_W}`);
}

test("H1: each of the three condenser specifications against the reference, and the three give the same column", () => {
  const c = caseOf("H1-alpha-vapour-liquid-condenser"), ref = REF[c.id], tol = c.tolerances.numerical.engine_against_reference;
  const two = c.specs.slice(0, 2);
  const runs = {
    vapour_share: alphaColumn(c, "vapour_liquid", c.specs),
    condenser_T_K: alphaColumn(c, "vapour_liquid", [...two, { kind: "condenser_T_K", value: ref.given.condenser_T_K }]),
    vapour_flow_mol_s: alphaColumn(c, "vapour_liquid", [...two, { kind: "vapour_flow_mol_s", value: ref.given.vapour_flow_mol_s }]),
  };
  for (const [k, r] of Object.entries(runs)) {
    assert.equal(r.converged, true);
    againstReference(r, ref[k], tol, `${c.id} (${k})`);
    // the definitions (the maintainer's answers 2 and 3): reflux over the liquid distillate, the whole distillate
    const s1 = r.stages[0];
    assert.ok(Math.abs(s1.L_mol_s / s1.U_mol_s - 1.5) < 1e-9);
    assert.ok(Math.abs(s1.U_mol_s + s1.V_mol_s - 40) < 1e-8);
  }
  // the same column three times
  for (const k of ["condenser_T_K", "vapour_flow_mol_s"]) {
    runs[k].stages.forEach((s, j) => assert.ok(Math.abs(s.T_K - runs.vapour_share.stages[j].T_K) < 1e-6, `${k} stage ${j + 1}`));
    assert.ok(Math.abs(runs[k].stages[0].V_mol_s - 8) < 1e-7, `${k}: V1 ${runs[k].stages[0].V_mol_s}`);
  }
});

test("H2: a share of 0.001 approaches the total condenser, 0.999 the partial one; both against the reference", () => {
  const c = caseOf("H2-alpha-vapour-liquid-limits"), ref = REF[c.id], lt = c.tolerances.limits, tol = c.tolerances.numerical.engine_against_reference;
  c.limits.forEach((lim, k) => {
    const a = alphaColumn(c, "vapour_liquid", lim.specs), b = alphaColumn(c, lim.against.condenser, lim.against.specs);
    againstReference(a, ref.limits[k].vapour_liquid, tol, `${lim.name} (vapour + liquid)`);
    againstReference(b, ref.limits[k][lim.against.condenser], tol, `${lim.name} (${lim.against.condenser})`);
    a.stages.forEach((s, j) => {
      const q = b.stages[j];
      assert.ok(Math.abs(s.T_K - q.T_K) <= lt.T_K_absolute, `${lim.name} stage ${j + 1}: T ${s.T_K} vs ${q.T_K}`);
      s.x.forEach((v, i) => assert.ok(Math.abs(v - q.x[i]) <= lt.mole_fractions_absolute, `${lim.name} stage ${j + 1}: x ${v} vs ${q.x[i]}`));
      if (j > 0) assert.ok(Math.abs(s.V_mol_s - q.V_mol_s) <= lt.flows_relative * q.V_mol_s, `${lim.name} stage ${j + 1}: V`);
    });
  });
});

test("H2: a condenser temperature above the top vapour's dew point is refused (OUT_OF_RANGE), with the two-phase range", () => {
  const c = caseOf("H2-alpha-vapour-liquid-limits"), dew = REF[c.id]["top_vapour_at_share_0.2"].dew_K;
  assert.ok(c.refused.specs[2].value > dew + 5, "the case's temperature is above the reference's dew point");
  assert.throws(() => alphaColumn(c, "vapour_liquid", c.refused.specs), e => {
    assert.equal(e.code, "OUT_OF_RANGE");
    assert.match(e.message, /has no liquid distillate/);
    assert.match(e.message, /between its bubble point, [\d.]+ K, and its dew point, [\d.]+ K/);
    assert.match(e.message, /For no vapour use a total condenser, for no liquid distillate a partial one/);
    return true;
  });
});

test("H3: CHEPTA-Lab's methanol column (Peng-Robinson, 53 C) against the reference", () => {
  const c = caseOf("H3-methanol-co2-pr-vapour-liquid"), ref = REF[c.id], tol = c.tolerances.engine_against_reference;
  const r = solveH3(c, ref.rigorous.feed.h_J_mol);
  againstReference(r, ref.rigorous, tol, c.id);
  assert.ok(Math.abs(r.stages[0].T_K - 326.15) < 1e-9);
});

// CHEPTA-Lab's request file (validation/data/columns/lab-requests-0.6.2/, unchanged) with this condenser
const labRequest = (patch, vapourOutlet = true) => {
  const req = JSON.parse(readFileSync(new URL("../validation/data/columns/lab-requests-0.6.2/u-column-partial-pr.request.json", import.meta.url)));
  const fs = req.input.flowsheet;
  Object.assign(fs.blocks.find(b => b.id === "COLUMN").spec, patch);
  if (vapourOutlet) { fs.blocks.push({ id: "PV", type: "product" }); fs.streams.push({ id: "out-vapour", from: "COLUMN.vapour_distillate", to: "PV.in" }); }
  return req;
};

test("H3: Lab's request with condenser \"vapour_liquid\" at 53 C runs; the balance closes; the products against the paper for information", () => {
  const r = run(labRequest({ condenser: "vapour_liquid", condenser_T_K: 326.15 }));
  assert.equal(r.outcome, "ok", r.error?.message);
  const st = r.value.streams, c = r.value.blocks.COLUMN.state;
  for (const comp of Object.keys(st["in0-29"].flow_kmol_h)) {
    const a = st["in0-29"].flow_kmol_h[comp], b = st["out-distillate"].flow_kmol_h[comp] + st["out-vapour"].flow_kmol_h[comp] + st["out-bottoms"].flow_kmol_h[comp];
    assert.ok(Math.abs(a - b) <= 1e-9 * st["in0-29"].F_kmol_h, `${comp}: in ${a}, out ${b}`);
  }
  // the column of the reference's H3 (the same equations; the feed's enthalpy from the flowsheet's own flash)
  const ref = REF["H3-methanol-co2-pr-vapour-liquid"].kmol_h;
  assert.ok(Math.abs(c.D_liquid_kmol_h - ref.liquid_distillate) < 1e-4 * ref.liquid_distillate, `${c.D_liquid_kmol_h} vs ${ref.liquid_distillate}`);
  assert.ok(Math.abs(c.D_vapour_kmol_h - ref.vapour_distillate) < 1e-4 * ref.vapour_distillate, `${c.D_vapour_kmol_h} vs ${ref.vapour_distillate}`);
  assert.ok(Math.abs(c.reflux_ratio - 2) < 1e-9 && Math.abs(c.condenser_T_K - 326.15) < 1e-9);
  assert.ok(Math.abs(c.D_kmol_h - c.D_liquid_kmol_h - c.D_vapour_kmol_h) < 1e-9);
  assert.ok(Math.abs(c.reflux_over_distillate - c.reflux_ratio * c.D_liquid_kmol_h / c.D_kmol_h) < 1e-9);
  // the products leave at the condenser's temperature, as a liquid and a vapour
  assert.ok(Math.abs(st["out-distillate"].T_K - 326.15) < 1e-6 && Math.abs(st["out-vapour"].T_K - 326.15) < 1e-6);
  // the paper's Aspen Plus numbers (Lab's reading of Campos et al. 2022): 4542 and 289 kmol/h; for information, within
  // a few per cent (another program, other parameters), not a validation
  assert.ok(Math.abs(c.D_liquid_kmol_h / 4542 - 1) < 0.01 && Math.abs(c.D_vapour_kmol_h / 289 - 1) < 0.05, `${c.D_liquid_kmol_h}, ${c.D_vapour_kmol_h}`);
  assert.ok(r.value.blocks.COLUMN.notes.some(n => /The vapour \+ liquid condenser \(proposal 0026\) at 326\.1\d? K, fixed by condenser_T_K/.test(n)));
});

test("refusals: the condenser's keys, the outlets, the shortcut, the range of the share", () => {
  const bad = (patch, code, re, vapourOutlet = true) => {
    const r = run(labRequest(patch, vapourOutlet));
    assert.equal(r.error?.code, code, `${JSON.stringify(patch)}: ${r.outcome} ${r.error?.message}`);
    assert.match(r.error.message, re);
  };
  bad({ condenser: "vapour_liquid" }, "BAD_INPUT", /missing: the condenser's specification \(its temperature, the vapour distillate's flow or the vapour's share of the distillate\)/);
  bad({ condenser: "vapour_liquid", condenser_T_K: 326.15, vapour_share: 0.1 }, "BAD_INPUT", /condenser_T_K, vapour_share: give one of them/);
  bad({ condenser: "vapour_liquid", vapour_share: 1 }, "BAD_INPUT", /vapour_share is the vapour's share of the distillate, between 0 and 1/);
  // (proposal 0029, accepted by the maintainer on 2026-11-26: condenser_T_K is now also a total or partial condenser's
  // specification, a stage temperature of stage 1; with the reflux ratio and the bottoms flow it is one too many. This
  // assertion changed for that decision, not to make a result pass; docs/decisions/2026-11-26-09-column-spec-package.md)
  bad({ condenser: "partial", condenser_T_K: 326.15 }, "BAD_INPUT", /too many specifications: reflux_ratio, bottoms_kmol_h, condenser_T_K: give two/, false);
  bad({ condenser: "vapour_liquid", condenser_T_K: 326.15 }, "BAD_INPUT", /connect a stream to its outlet "vapour_distillate"/, false);
  bad({ condenser: "partial" }, "BAD_INPUT", /only the vapour \+ liquid condenser has/);
  bad({ condenser: "vapour_liquid", condenser_T_K: 326.15, mode: "shortcut", light_key: "methanol", heavy_key: "water", recovery_light_key_in_distillate: 0.99, recovery_heavy_key_in_bottoms: 0.99, stages: null, feed_stage: null, bottoms_kmol_h: null }, "BAD_INPUT", /rigorous column only/);   // (the block's NOT_AVAILABLE, reported by the flowsheet's check before solving)
  bad({ condenser: "partial", specifications: [{ kind: "purity", product: "vapour_distillate", component: "methanol", value: 0.5 }], bottoms_kmol_h: null }, "BAD_INPUT", /product "vapour_distillate" is the vapour \+ liquid condenser's/, false);
});

test("degrees of freedom: the condenser's own specification counts as one more", async () => {
  const { flowsheetStatus } = await import("../src/flowsheet/flowsheet.js");
  const { system } = await import("../src/index.js");
  const req = labRequest({ condenser: "vapour_liquid" });
  const fs = req.input.flowsheet, sys = system({ components: fs.components, model: "PR" });
  const st = flowsheetStatus(sys, fs).blocks.COLUMN;
  assert.equal(st.needed, 5);
  assert.equal(st.given, 4);
  assert.match(st.message, /the condenser's specification/);
});

test("design specifications on the two distillates (product \"distillate\" the liquid, \"vapour_distillate\" the vapour)", () => {
  const c = caseOf("H1-alpha-vapour-liquid-condenser");
  const r0 = alphaColumn(c, "vapour_liquid", c.specs);
  const yv = r0.products.vapour_distillate.flows, xl = r0.products.distillate.flows;
  const f = c.column.feed, lam = c.thermo.latent_heat_J_mol;
  for (const d of [{ kind: "purity", product: "vapour_distillate", component: 0, value: yv[0] / sum(yv) }, { kind: "purity", product: "distillate", component: 1, value: xl[1] / sum(xl) }]) {
    const r = solveCascade({ thermo: alphaThermo(c), stages: c.column.stages, ends: { condenser: "vapour_liquid", condenser_spec: { kind: "vapour_share", value: 0.2 } },
      feeds: [{ stage: f.stage, flows: f.z.map(z => z * f.flow_mol_s), H_W: (1 - f.q) * lam * f.flow_mol_s }],
      specs: [{ kind: "reflux_ratio", value: 1.5 }, d] });
    // the whole distillate found for it: 40 mol/s, the column it was taken from
    assert.ok(Math.abs(r.adjusted[0].value - 40) < 1e-4, `${d.product}: ${r.adjusted[0].value}`);
    assert.ok(r.specifications.every(q => q.met));
  }
  assert.throws(() => solveCascade({ thermo: alphaThermo(c), stages: 15, ends: { condenser: "total" }, feeds: [{ stage: 8, flows: [5, 30, 30, 35], H_W: 0 }],
    specs: [{ kind: "reflux_ratio", value: 1.5 }, { kind: "purity", product: "vapour_distillate", component: 0, value: 0.4 }] }), /product "vapour_distillate" is the vapour \+ liquid condenser's/);
});

// 1-butanol + water + methanol (NRTL): the feed of case 2b and the column whose condensate splits
const butanolColumn = (flows, spec = {}) => ({ capability: "solve_flowsheet", input: { flowsheet: {
  components: ["1-butanol", "water", "methanol"], thermo: { model: "NRTL" },
  blocks: [{ id: "F", type: "feed", spec: { flow_kmol_h: flows, T_K: 300, P_kPa: 101.325 } },
    { id: "C", type: "column", spec: { mode: "rigorous", stages: 12, feed_stage: 5, reflux_ratio: 2, phases: "VLL", condenser: "vapour_liquid", vapour_share: 0.3, ...spec } },
    { id: "D", type: "product" }, { id: "V", type: "product" }, { id: "B", type: "product" }],
  streams: [{ id: "s1", from: "F.out", to: "C.in" }, { id: "s2", from: "C.distillate", to: "D.in" }, { id: "s4", from: "C.vapour_distillate", to: "V.in" }, { id: "s3", from: "C.bottoms", to: "B.in" }] } } });

test("two liquids in the vapour + liquid condenser are refused, with the advice of a decanter", () => {
  const r = run(butanolColumn({ "1-butanol": 50, water: 76, methanol: 1 }, { stages: 10, feed_stage: 4, bottoms_kmol_h: 45 }));
  assert.equal(r.error?.code, "PHASE_SPLIT", r.error?.message);
  assert.match(r.error.message, /the condensate of the vapour \+ liquid condenser would split into two liquids/);
  assert.match(r.error.message, /this condenser followed by a decanter/);
});

test("2b: feed_second_liquid \"top\" mixes the bypassed liquid into the liquid distillate after the column; \"bottom\" into the bottoms", () => {
  const feed = { "1-butanol": 1.6, water: 100, methanol: 5 }, spec = { bottoms_kmol_h: 98 };
  const top = run(butanolColumn(feed, { ...spec, feed_second_liquid: "top" }));
  assert.equal(top.outcome, "ok", top.error?.message);
  const fsl = top.value.blocks.C.state.feed_second_liquid;
  assert.equal(fsl.into, "distillate");
  assert.ok(fsl.feeds[0].mol_share > 0 && fsl.feeds[0].mol_share < 0.01, `${fsl.feeds[0].mol_share}`);
  // the bypassed liquid: the feed's smaller liquid
  const s1 = top.value.streams.s1, liq = s1.phases.filter(p => p.type === "liquid" && p.fraction > 0);
  const second = liq.reduce((a, b) => (b.fraction < a.fraction ? b : a));
  const F2 = s1.F_kmol_h * second.fraction, by = second.composition.map(v => v * F2), H2 = second.h_J_mol * F2 / 3600;
  const ids = Object.keys(s1.flow_kmol_h);
  // the same column fed without that liquid: the rest of the feed, a liquid at the feed's temperature
  const rest = Object.fromEntries(ids.map((id, i) => [id, s1.flow_kmol_h[id] - by[i]]));
  const alone = run(butanolColumn(rest, spec));
  assert.equal(alone.outcome, "ok", alone.error?.message);
  const a = alone.value, t = top.value;
  // the stages, the condenser and the vapour distillate are those of the column without the bypassed liquid
  t.blocks.C.profile.forEach((s, j) => assert.ok(Math.abs(s.T_K - a.blocks.C.profile[j].T_K) < 1e-6, `stage ${j + 1}`));
  for (const id of ids) {
    assert.ok(Math.abs(t.streams.s4.flow_kmol_h[id] - a.streams.s4.flow_kmol_h[id]) <= 1e-9 * a.streams.s4.F_kmol_h, `vapour distillate ${id}`);
    assert.ok(Math.abs(t.streams.s3.flow_kmol_h[id] - a.streams.s3.flow_kmol_h[id]) <= 1e-9 * a.streams.s3.F_kmol_h, `bottoms ${id}`);
  }
  // the liquid distillate: the column's liquid distillate plus the bypassed liquid (flows and enthalpy flow)
  ids.forEach((id, i) => assert.ok(Math.abs(t.streams.s2.flow_kmol_h[id] - (a.streams.s2.flow_kmol_h[id] + by[i])) <= 1e-9 * t.streams.s2.F_kmol_h, `liquid distillate ${id}`));
  assert.ok(Math.abs(t.streams.s2.H_kW - (a.streams.s2.H_kW + H2)) <= 1e-9 * Math.abs(t.streams.s2.H_kW) + 1e-9, `${t.streams.s2.H_kW} vs ${a.streams.s2.H_kW + H2}`);
  assert.ok(t.blocks.C.notes.some(n => /is mixed into the distillate at the product's pressure \(a P-H flash of the mixture\)/.test(n)));
  // "bottom": the vapour distillate and the liquid distillate stay the column's, the bottoms take the liquid
  const bot = run(butanolColumn(feed, { ...spec, feed_second_liquid: "bottom" }));
  assert.equal(bot.outcome, "ok", bot.error?.message);
  assert.equal(bot.value.blocks.C.state.feed_second_liquid.into, "bottoms");
  for (const id of ids) assert.ok(Math.abs(bot.value.streams.s4.flow_kmol_h[id] - a.streams.s4.flow_kmol_h[id]) <= 1e-7 * a.streams.s4.F_kmol_h, `bottom: vapour distillate ${id}`);
});
