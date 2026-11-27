/**
 * Proposal 0029, step 1 (CHEPTA-Lab M6, 2026-11-26): the vapour + liquid condenser given by its temperature, where the
 * cold starts and the continuation in the volatilities fail, is reached from the same column at a vapour share (the
 * share from a flash of the start's top vapour at the given temperature), then the condenser's temperature brought to
 * the one asked for (src/units/columns/engine.js, viaShare).
 *
 * Against the independent reference (validation/python/reference_mesh_condenser.py, case H4; validation/fixtures/
 * columns-vapour-liquid.json): CHEPTA-Lab's methanol column fed with its converged plant's column feed (CO2 0.2425 %),
 * Peng-Robinson for both phases (Lab's choice, docs/METHOD_SELECTION.md: a polar liquid with light gases at 100 kPa).
 * The reference also solves the column with the vapour share of that answer given in place of the temperature: the same
 * column, at the same temperature.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "../src/api/dispatcher.js";
import { solveH3 } from "../validation/columns_vapour_liquid_engine_start.mjs";

const KMOL_H = 1000 / 3600;
const caseOf = id => JSON.parse(readFileSync(new URL(`../validation/data/columns/vapour-liquid/${id}.json`, import.meta.url)));
const REF = JSON.parse(readFileSync(new URL("../validation/fixtures/columns-vapour-liquid.json", import.meta.url))).cases;
const H4 = "H4-methanol-a6feed-pr-condenser-temperature";

test("H4: the condenser at 326.15 K is reached by way of a vapour share, and the column is the reference's", () => {
  const c = caseOf(H4), ref = REF[H4], tol = c.tolerances.engine_against_reference;
  const r = solveH3(c, ref.rigorous.feed.h_J_mol);
  assert.match(r.solver.start, /the condenser's temperature reached from a column at a vapour share/);
  assert.ok(r.solver.tried.some(t => /continuation in the relative volatilities \(stopped at 0 % of the way/.test(t)), "the continuation still fails first");
  assert.ok(Math.abs(r.stages[0].T_K - 326.15) < 1e-9);
  r.stages.forEach((s, j) => {
    const q = ref.rigorous.stages[j], at = `stage ${s.stage}`;
    assert.ok(Math.abs(s.T_K - q.T_K) <= tol.T_K_absolute, `${at}: T ${s.T_K} vs ${q.T_K}`);
    assert.ok(Math.abs(s.L_mol_s - q.L_mol_s) <= tol.flows_relative * q.L_mol_s, `${at}: L ${s.L_mol_s} vs ${q.L_mol_s}`);
    assert.ok(Math.abs(s.V_mol_s - q.V_mol_s) <= tol.flows_relative * Math.max(q.V_mol_s, 1e-300) || (q.V_mol_s === 0 && s.V_mol_s === 0), `${at}: V ${s.V_mol_s} vs ${q.V_mol_s}`);
    s.x.forEach((v, i) => assert.ok(Math.abs(v - q.x[i]) <= tol.mole_fractions_absolute, `${at}: x ${i} ${v} vs ${q.x[i]}`));
  });
  const U = r.stages[0].U_mol_s;
  assert.ok(Math.abs(U - ref.rigorous.U_liquid_distillate_mol_s) <= tol.flows_relative * ref.rigorous.U_liquid_distillate_mol_s);
  // the reference's column at the vapour share of this answer is at the same temperature
  const share = r.stages[0].V_mol_s / (r.stages[0].V_mol_s + U);
  assert.ok(Math.abs(share - ref.at_vapour_share.vapour_share) < 1e-6 * share, `share ${share} vs ${ref.at_vapour_share.vapour_share}`);
  assert.ok(Math.abs(ref.at_vapour_share.condenser_T_K - 326.15) < 1e-6);
});

test("H3 (the paper's feed, CO2 1.285 %) keeps its path: it never needs the vapour share", () => {
  const c = caseOf("H3-methanol-co2-pr-vapour-liquid"), ref = REF[c.id];
  const r = solveH3(c, ref.rigorous.feed.h_J_mol);
  assert.doesNotMatch(r.solver.start, /vapour share/);
  assert.ok(Math.abs(r.stages[0].V_mol_s - ref.rigorous.V_vapour_distillate_mol_s) <= 1e-6 * ref.rigorous.V_vapour_distillate_mol_s);
});

test("M6: CHEPTA-Lab's request (copied unchanged) converges; the balance closes; the vapour distillate as the other two condenser specifications give", () => {
  const req = JSON.parse(readFileSync(new URL("../validation/data/columns/lab-requests-main-415da41/vl-column-a6feed-T53.request.json", import.meta.url)));
  const r = run(req);
  assert.equal(r.outcome, "ok", r.error?.message);
  const st = r.value.streams, s = r.value.blocks.COLUMN.state;
  for (const comp of Object.keys(st["in0-29"].flow_kmol_h)) {
    const a = st["in0-29"].flow_kmol_h[comp], b = st["31-MEOH"].flow_kmol_h[comp] + st["32"].flow_kmol_h[comp] + st["30-WATER"].flow_kmol_h[comp];
    assert.ok(Math.abs(a - b) <= 1e-9 * st["in0-29"].F_kmol_h, `${comp}: in ${a}, out ${b}`);
  }
  assert.ok(Math.abs(s.condenser_T_K - 326.15) < 1e-9);
  // the reference's H4 has the same feed and specifications; the flowsheet's feed enthalpy is its own flash, so the
  // agreement is to the feed's enthalpy, not the solvers' tolerance
  assert.ok(Math.abs(s.D_vapour_kmol_h / REF[H4].kmol_h.vapour_distillate - 1) < 1e-3, `${s.D_vapour_kmol_h} vs ${REF[H4].kmol_h.vapour_distillate}`);
  assert.ok(s.vapour_share < 0.01);
});

test("a vapour + liquid condenser that fails does not blame a large vapour share where the share is small", () => {
  const c = caseOf(H4);
  // one iteration per attempt: every attempt stops, so the message is the failure's (the column itself exists, H4)
  assert.throws(() => solveH3({ ...c }, REF[H4].rigorous.feed.h_J_mol, { maxIterations: 1 }), e => {
    assert.equal(e.code, "NO_CONVERGENCE");
    assert.doesNotMatch(e.message, /a large vapour share/);
    assert.doesNotMatch(e.message, /most of the distillate leaves as vapour/);
    assert.match(e.message, /given by its vapour share \(vapour_share\) or its vapour distillate's flow/);
    return true;
  });
});

test("M6 with PR + gE (MHV1) (decision 2026-11-25-01 moves Lab's methanol separator to it): the same request converges; the balance closes", () => {
  // the start's first sweeps put a CO2-rich liquid on the condenser whose bubble point MHV1 splits into two liquids:
  // a start value only, taken without the stability test; the answer's own test of every stage is unchanged
  // (no independent column reference with MHV1 exists yet: the check is the balance, the condenser's temperature and
  // the engine's own stability test of the answer)
  const req = JSON.parse(readFileSync(new URL("../validation/data/columns/lab-requests-main-415da41/vl-column-a6feed-T53.request.json", import.meta.url)));
  req.input.flowsheet.thermo = { ...req.input.flowsheet.thermo, mixing: "MHV1" };
  const r = run(req);
  assert.equal(r.outcome, "ok", r.error?.message);
  const st = r.value.streams, s = r.value.blocks.COLUMN.state;
  for (const comp of Object.keys(st["in0-29"].flow_kmol_h)) {
    const a = st["in0-29"].flow_kmol_h[comp], b = st["31-MEOH"].flow_kmol_h[comp] + st["32"].flow_kmol_h[comp] + st["30-WATER"].flow_kmol_h[comp];
    assert.ok(Math.abs(a - b) <= 1e-9 * st["in0-29"].F_kmol_h, `${comp}: in ${a}, out ${b}`);
  }
  assert.ok(Math.abs(s.condenser_T_K - 326.15) < 1e-9);
  assert.ok(s.D_vapour_kmol_h > 0 && s.vapour_share < 0.01);
});
