// The entropy of a phase, the P-S flash, the compressor and the expander (proposal 0013, step 6;
// src/thermo/enthalpy.js, src/equilibrium/flash.js, src/units/units.js).
// References: the cubic equation's own residual entropy (src/thermo/eos/cubic.js, a separate formula from the Gibbs-
// energy route of enthalpy.js); IAPWS-IF97 for water (src/thermo/iapws, the standard); and an independent Peng-Robinson
// in Python (validation/python/reference_compressor.py, validation/fixtures/compressor.json: CoolProp's ideal-gas cp0
// plus the departure functions of the thermo library, with CHEPTA's Tc, Pc, omega and k_ij = 0).
// Method (docs/METHOD_SELECTION.md): light gases and hydrocarbons at pressure: Peng-Robinson (SRK alike); ethanol + water
// and water near 1 atm: NRTL with the ideal-gas vapour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, stream, runUnit, steam } from "../src/index.js";

const R = 8.314462618, P0 = 101.325;
const ref = JSON.parse(readFileSync(new URL("../validation/fixtures/compressor.json", import.meta.url), "utf8"));
const zeros = n => Array.from({ length: n }, () => new Array(n).fill(0));
const S = (sys, ph, T, P, z) => sys.phase(ph, T, P, z, { entropy: true }).s_J_molK;

test("equation of state: s = sum z s_IG - R sum z ln(z P/P0) + s_R, with the cubic's own residual entropy", () => {
  for (const model of ["PR", "SRK"]) {
    const sys = system({ components: ["methane", "ethane"], model });
    const z = [0.7, 0.3];
    const sIG = T => z.map((_, i) => S(system({ components: [["methane", "ethane"][i]], model }), "vapour", T, 1e-3, [1]) + R * Math.log(1e-3 / P0));
    for (const [T, P, ph] of [[300, 5000, "vapour"], [250, 3000, "vapour"], [150, 3000, "liquid"]]) {
      const st = sys.eos.state(T, P, z, ph);
      const ig = sIG(T);
      // the pure ideal gases at 1e-3 kPa stand for s_IG,i(T) (their residual there is below 1e-6 J/(mol K))
      const want = z.reduce((a, zi, i) => a + zi * (ig[i] - R * Math.log(zi * P / P0)), 0) + st.sR_J_molK;
      assert.ok(Math.abs(S(sys, ph, T, P, z) - want) < 1e-5, `${model} ${ph} ${T} K ${P} kPa: ${S(sys, ph, T, P, z)} against ${want}`);
    }
  }
});

test("entropy and enthalpy agree: (ds/dT)_P = (dh/dT)_P / T in one phase, for every model", () => {
  const cases = [
    [system({ components: ["methane", "ethane"], model: "PR" }), "vapour", 300, 4000, [0.8, 0.2]],
    [system({ components: ["methane", "ethane"], model: "SRK" }), "liquid", 160, 3000, [0.6, 0.4]],
    [system({ components: ["ethanol", "water"], model: "NRTL" }), "vapour", 400, 100, [0.5, 0.5]],
    [system({ components: ["ethanol", "water"], model: "NRTL", vapour: "PR" }), "vapour", 420, 300, [0.5, 0.5]],
  ];
  const d = 0.01;
  for (const [sys, ph, T, P, z] of cases) {
    const ds = (S(sys, ph, T + d, P, z) - S(sys, ph, T - d, P, z)) / (2 * d);
    const dh = (sys.phase(ph, T + d, P, z).h_J_mol - sys.phase(ph, T - d, P, z).h_J_mol) / (2 * d);
    assert.ok(Math.abs(ds - dh / T) < 1e-5 * Math.abs(dh / T), `${sys.model} ${ph}: ${ds} against ${dh / T}`);
  }
});

test("the activity model's liquid: its entropy follows the vapour-pressure record (water against IAPWS-IF97, 300-370 K)", () => {
  // s = (h - g)/T with g from the fugacity x gamma Psat: dS/dT is cp_L/T only as far as the vapour-pressure record and
  // the heat-capacity and heat-of-vaporization records agree (Clausius-Clapeyron); on water's records the entropy rise
  // from 300 K is within 0.8 % of IAPWS-IF97's
  const w = system({ components: ["water"], model: "NRTL" });
  const at = T => S(w, "liquid", T, 101.325, [1]);
  const if97 = T => steam(T, 101.325).s_kJ_kgK * 18.015268;
  for (const T of [330, 350, 370]) {
    const mine = at(T) - at(300), std = if97(T) - if97(300);
    assert.ok(Math.abs(mine / std - 1) < 0.01, `${T} K: ${mine} against ${std}`);
  }
});

test("at a boiling point the vapour and liquid entropies differ by the latent heat over T (pure water, NRTL)", () => {
  const w = system({ components: ["water"], model: "NRTL" });
  const b = w.flash({ z: [1], P: 101.325, VF: 0 });
  const L = w.phase("liquid", b.T, 101.325, [1], { entropy: true }), V = w.phase("vapour", b.T, 101.325, [1], { entropy: true });
  assert.ok(Math.abs((V.s_J_molK - L.s_J_molK) - (V.h_J_mol - L.h_J_mol) / b.T) < 1e-6 * (V.s_J_molK - L.s_J_molK));
});

test("P-S flash: the entropy of a T-P flash gives back its temperature and vapour fraction, two-phase included", () => {
  const cases = [
    [system({ components: ["methane", "ethane"], model: "PR" }), [0.8, 0.2], 200, 3000],
    [system({ components: ["methane", "ethane"], model: "PR" }), [0.8, 0.2], 300, 3000],
    [system({ components: ["ethanol", "water"], model: "NRTL" }), [0.3, 0.7], 365, 101.325],
    [system({ components: ["ethanol", "water"], model: "NRTL" }), [0.3, 0.7], 330, 101.325],
    [system({ components: ["propane"], model: "PR" }), [1], 300, 500],
  ];
  for (const [sys, z, T, P] of cases) {
    const tp = sys.flash({ z, T, P }, {});
    const s = tp.phases.reduce((a, p) => a + p.fraction * S(sys, p.type, T, P, p.composition), 0);
    const r = sys.flash({ z, P, S: s });
    assert.equal(r.spec, "PS");
    assert.ok(Math.abs(r.T - T) < 1e-5, `${sys.model} ${sys.ids} ${T} K: ${r.T}`);
    assert.ok(Math.abs(r.VF - tp.VF) < 1e-6, `${sys.model} ${sys.ids} ${T} K: VF ${r.VF} against ${tp.VF}`);
    assert.ok(Math.abs(r.S_J_molK - s) < 1e-5);
  }
  // a pure fluid inside its dome: the lever rule on the saturated entropies (propane at 500 kPa)
  const p = system({ components: ["propane"], model: "PR" });
  const sat = p.flash({ z: [1], P: 500, VF: 0.4 }, {});
  const s = sat.phases.reduce((a, q) => a + q.fraction * S(p, q.type, sat.T, 500, q.composition), 0);
  const r = p.flash({ z: [1], P: 500, S: s });
  assert.ok(Math.abs(r.T - sat.T) < 1e-6 && Math.abs(r.VF - 0.4) < 1e-6, JSON.stringify([r.T, r.VF]));
  assert.throws(() => p.flash({ z: [1], P: 500, S: "x" }), /S must be a number of J\/\(mol K\)/);
});

test("compressor and expander against the independent Peng-Robinson (validation/fixtures/compressor.json)", () => {
  for (const c of ref.cases) {
    const n = c.components.length;
    const sys = system({ components: c.components, model: "PR", kij: zeros(n) });
    const flows = c.z.map(v => v * 100);
    const inlet = n === 1 && !Number.isInteger(c.P_in_kPa)
      ? stream(sys, { flow_kmol_h: flows, P_kPa: c.P_in_kPa, VF: 1 })     // saturated vapour (propane)
      : stream(sys, { flow_kmol_h: flows, T_K: c.T_in_K, P_kPa: c.P_in_kPa });
    const type = c.P_out_kPa > c.P_in_kPa ? "compressor" : "expander";
    const r = runUnit(type, { sys, inlets: { in: inlet }, spec: { P_kPa: c.P_out_kPa, efficiency: c.efficiency } });
    const tag = `${type} ${c.components.join("+")}`;
    // isentropic outlet: within 0.15 K (methane+ethane 0.10 K: CHEPTA's ethane ideal-gas record is 0.6 % below
    // CoolProp's cp0 at 300 K, the rest within 0.08 K), vapour fraction within 0.002, isentropic work within 0.1 %
    assert.ok(Math.abs(r.state.isentropic_T_K - c.PR.T_s_K) < 0.15, `${tag}: T_s ${r.state.isentropic_T_K} against ${c.PR.T_s_K}`);
    assert.ok(Math.abs(r.state.isentropic_VF - c.PR.VF_s) < 0.002, `${tag}: VF_s ${r.state.isentropic_VF} against ${c.PR.VF_s}`);
    const ws = r.state.isentropic_power_kW * 3600 / 100;
    assert.ok(Math.abs(ws / c.PR.w_s_J_mol - 1) < 1e-3, `${tag}: w_s ${ws} against ${c.PR.w_s_J_mol}`);
    // the outlet at the efficiency, and the energy balance
    const o = r.outlets.out;
    assert.ok(Math.abs(o.T_K - c.PR.T_out_K) < 0.15, `${tag}: T_out ${o.T_K} against ${c.PR.T_out_K}`);
    assert.ok(Math.abs(o.VF - c.PR.VF_out) < 0.002, `${tag}: VF_out ${o.VF} against ${c.PR.VF_out}`);
    assert.ok(Math.abs(o.H_kW - inlet.H_kW - r.duty_kW) < 1e-6 * Math.abs(r.duty_kW));
    assert.ok(type === "compressor" ? r.duty_kW > 0 : r.duty_kW < 0, `${tag}: power ${r.duty_kW} kW`);
    assert.ok(!r.notes.some(x => /typical/.test(x)));
  }
  // the wet expansion says that liquid forms
  const p = ref.cases.find(c => c.components[0] === "propane");
  const sys = system({ components: ["propane"], model: "PR", kij: zeros(1) });
  const r = runUnit("expander", { sys, inlets: { in: stream(sys, { flow_kmol_h: [100], P_kPa: p.P_in_kPa, VF: 1 }) }, spec: { P_kPa: 200 } });
  assert.match(r.notes.join(" "), /Isentropic efficiency 80 % \(a typical value/);
  assert.match(r.notes.join(" "), /Liquid forms along the isentropic path/);
});

test("compressor and expander: a pressure ratio, the typical efficiency, and refusals with the reason", () => {
  const sys = system({ components: ["methane", "ethane"], model: "PR" });
  const gas = stream(sys, { flow_kmol_h: { methane: 80, ethane: 20 }, T_K: 300, P_kPa: 2000 });
  const a = runUnit("compressor", { sys, inlets: { in: gas }, spec: { ratio: 3 } });
  const b = runUnit("compressor", { sys, inlets: { in: gas }, spec: { P_kPa: 6000, efficiency: 0.75 } });
  assert.ok(Math.abs(a.outlets.out.T_K - b.outlets.out.T_K) < 1e-9 && Math.abs(a.duty_kW - b.duty_kW) < 1e-9);
  assert.match(a.notes.join(" "), /Isentropic efficiency 75 % \(a typical value/);
  const c = runUnit("compressor", { sys, inlets: { in: gas }, spec: { dP_kPa: 4000, efficiency: 1 } });
  assert.ok(Math.abs(c.state.power_kW - c.state.isentropic_power_kW) < 1e-9);
  assert.throws(() => runUnit("compressor", { sys, inlets: { in: gas }, spec: { P_kPa: 1000 } }), /a compressor raises the pressure/);
  assert.throws(() => runUnit("expander", { sys, inlets: { in: gas }, spec: { ratio: 2 } }), /at most 1/);
  assert.throws(() => runUnit("compressor", { sys, inlets: { in: gas }, spec: { P_kPa: 6000, ratio: 3 } }), /give one of/);
  assert.throws(() => runUnit("compressor", { sys, inlets: { in: gas }, spec: { P_kPa: 6000, efficiency: 75 } }), /at most 1/);
  const liquid = stream(sys, { flow_kmol_h: { methane: 30, ethane: 70 }, T_K: 150, P_kPa: 2000 });
  assert.throws(() => runUnit("compressor", { sys, inlets: { in: liquid }, spec: { P_kPa: 6000 } }), /takes a gas; its inlet is .* liquid.*use a pump/);
  // an activity model with the ideal-gas vapour: the compression is that of an ideal gas, and the block says so
  const ew = system({ components: ["ethanol", "water"], model: "NRTL" });
  const v = stream(ew, { flow_kmol_h: { ethanol: 50, water: 50 }, T_K: 400, P_kPa: 100 });
  const r = runUnit("compressor", { sys: ew, inlets: { in: v }, spec: { ratio: 2, efficiency: 1 } });
  assert.match(r.notes.join(" "), /ideal gas in this method/);
  // ideal gas: integral of cp/T from T1 to T2 = R ln(P2/P1); with the same records' cp (ds = dh / T at constant P)
  const s1 = S(ew, "vapour", 400, 100, [0.5, 0.5]), s2 = S(ew, "vapour", r.state.isentropic_T_K, 200, [0.5, 0.5]);
  assert.ok(Math.abs(s2 - s1) < 1e-6);
  assert.ok(Math.abs(S(ew, "vapour", r.state.isentropic_T_K, 100, [0.5, 0.5]) - s1 - R * Math.log(2)) < 1e-6);
});

test("a flowsheet with a compressor, a cooler and an expander: work streams and the energy balance", async () => {
  const { solveFlowsheet } = await import("../src/index.js");
  const sys = system({ components: ["methane", "ethane"], model: "PR" });
  const r = solveFlowsheet(sys, {
    blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { methane: 80, ethane: 20 }, T_K: 300, P_kPa: 2000 } },
      { id: "K1", type: "compressor", spec: { ratio: 3 } }, { id: "E1", type: "heater", spec: { T_K: 310 } },
      { id: "EX1", type: "expander", spec: { P_kPa: 1500 } }, { id: "P1", type: "product", spec: {} }],
    streams: [{ id: "S1", from: "F1.out", to: "K1.in" }, { id: "S2", from: "K1.out", to: "E1.in" }, { id: "S3", from: "E1.out", to: "EX1.in" }, { id: "S4", from: "EX1.out", to: "P1.in" }],
  });
  assert.equal(r.energy["W-K1"].kind, "work");
  assert.ok(r.energy["W-K1"].duty_kW > 0 && r.energy["W-EX1"].duty_kW < 0);
  const sum = Object.values(r.energy).reduce((a, q) => a + q.duty_kW, 0);
  assert.ok(Math.abs(r.streams.S4.H_kW - r.streams.S1.H_kW - sum) < 1e-6, "energy balance");
  assert.ok(r.streams.S2.T_K > 395 && r.streams.S4.T_K < r.streams.S3.T_K);
});
