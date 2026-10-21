// Heat-exchanger pre-sizing (proposal 0013, step 1; src/units/heat-exchange.js): the zone method against Lienhard and
// Lienhard's worked examples (A Heat Transfer Textbook, 6th ed., 2024, free from https://ahtt.mit.edu/) and against an
// independent calculation with CoolProp (validation/python/reference_heat_exchange.py -> validation/fixtures/
// heat-exchange.json); the effectiveness-NTU relations, U from its three sources, and Lamé's wall thickness.
// Method (docs/METHOD_SELECTION.md): n-butane alone, a hydrocarbon at 500-1000 kPa, with Peng-Robinson.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, stream } from "../src/index.js";
import {
  exchangerArea, effectiveness, ntuFor, overallU, serviceU, foulingRf, filmH, metalConductivity, wallThickness, HEAT_TRANSFER, ARRANGEMENTS,
} from "../src/units/heat-exchange.js";

const ref = JSON.parse(readFileSync(new URL("../validation/fixtures/heat-exchange.json", import.meta.url)));
const C = t => t + 273.15;
const close = (a, b, rel, what) => assert.ok(Math.abs(a / b - 1) <= rel, `${what}: ${a} vs ${b} (${((a / b - 1) * 100).toFixed(3)} %)`);

test("Lienhard Example 3.6 (parallel flow, as Example 3.5): 150 to 90 °C against 40 to 70 °C, U = 500: LMTD 52.79 K, A = 22.73 m²", () => {
  // Ch = 10,000 W/K, Cc = 20,000 W/K: Q = 600 kW; constant heat capacities, so the zones give the single LMTD
  const r = exchangerArea(null, { duty_kW: 600, U: { value: 500 }, arrangement: "cocurrent",
    hot: { utility: { kind: "fluid", T_in_K: C(150), T_out_K: C(90), cp_J_kgK: 1000 } },
    cold: { utility: { kind: "fluid", T_in_K: C(40), T_out_K: C(70), cp_J_kgK: 1000 } } });
  const lmtd = (110 - 20) / Math.log(110 / 20);
  assert.ok(Math.abs(r.dT_mean_K - lmtd) < 1e-9 * lmtd, `zones give the LMTD: ${r.dT_mean_K} vs ${lmtd}`);
  assert.equal(+r.dT_mean_K.toFixed(2), 52.79);
  assert.equal(+r.area_m2.toFixed(2), 22.73);
  assert.equal(r.dT_min_K.toFixed(6), (20).toFixed(6));
});

test("Lienhard section 3.2: water from 20 to 40 °C by steam condensing at 60 °C: LMTD 28.85 K", () => {
  const r = exchangerArea(null, { duty_kW: 983, hot: { utility: { kind: "fluid", T_K: C(60) } },
    cold: { utility: { kind: "fluid", T_in_K: C(20), T_out_K: C(40), cp_J_kgK: 4180 } } });
  assert.equal(+r.dT_mean_K.toFixed(2), 28.85);
  assert.equal(r.area_m2, null, "no U, no area");
  // one side at constant temperature: the arrangement does not matter (F = 1)
  for (const arrangement of ARRANGEMENTS.filter(a => a !== "cocurrent")) {
    const x = exchangerArea(null, { duty_kW: 983, arrangement, shells: 1, hot: { utility: { kind: "fluid", T_K: C(60) } },
      cold: { utility: { kind: "fluid", T_in_K: C(20), T_out_K: C(40), cp_J_kgK: 4180 } } });
    assert.ok(Math.abs(x.F - 1) < 1e-9, `${arrangement}: F = ${x.F}`);
  }
});

test("Lienhard Example 3.5 (parallel flow): UA = 500 × 30 W/K, Ch = 10,000, Cc = 20,000 W/K: 655.6 kW, 84.44 and 72.78 °C; sized back, A = 30 m²", () => {
  // the example reads ε = 0.596 (eqn. 3.20, NTU 1.5, R 0.5); with ε unrounded the outlets are a little different
  const eps = effectiveness("cocurrent", 1.5, 0.5);
  assert.equal(+eps.toFixed(3), 0.596);
  const Q = eps * 10000 * (150 - 40) / 1000;
  assert.ok(Math.abs(Q - 655.6) < 0.5, `${Q} kW`);
  const r = exchangerArea(null, { duty_kW: Q, arrangement: "cocurrent", U: { value: 500 },
    hot: { utility: { kind: "fluid", T_in_K: C(150), T_out_K: C(150 - Q * 1000 / 10000), cp_J_kgK: 1000 } },
    cold: { utility: { kind: "fluid", T_in_K: C(40), T_out_K: C(40 + Q * 1000 / 20000), cp_J_kgK: 1000 } } });
  close(r.area_m2, 30, 1e-9, "area");
  assert.equal(+(150 - Q * 1000 / 10000).toFixed(1), 84.4);
  assert.equal(+(40 + Q * 1000 / 20000).toFixed(1), 72.8);
});

test("effectiveness-NTU: every arrangement inverts its own relation; R = 0 is 1 - exp(-NTU); limits are refused", () => {
  for (const arr of ARRANGEMENTS) for (const R of [0, 0.25, 0.5, 0.8, 1]) for (const NTU of [0.2, 1, 2.5]) for (const shells of arr === "shell-and-tube" ? [1, 2, 3] : [1]) {
    const e = effectiveness(arr, NTU, R, shells);
    const n = ntuFor(arr, e, R, shells);
    assert.ok(Math.abs(n - NTU) < 1e-6 * NTU, `${arr}${shells > 1 ? ` ${shells} shells` : ""}, R ${R}, NTU ${NTU}: ${n}`);
    // counterflow is the best arrangement (not tested for the crossflow correlations, which are approximate, ≃)
    if (arr !== "counterflow" && arr !== "crossflow-unmixed") assert.ok(e <= effectiveness("counterflow", NTU, R) + 1e-12, `${arr}: counterflow is the best (R ${R}, NTU ${NTU})`);
  }
  assert.equal(effectiveness("counterflow", 1.5, 0), 1 - Math.exp(-1.5));
  // one shell pass with two tube passes cannot pass ε = 2/(1 + R + √(1 + R²))
  const R = 0.8, lim = 2 / (1 + R + Math.sqrt(1 + R * R));
  assert.equal(ntuFor("shell-and-tube", lim * 1.001, R, 1), null);
  assert.ok(ntuFor("shell-and-tube", lim * 1.001, R, 3) > 0, "three shells in series reach it");
  assert.equal(ntuFor("cocurrent", 0.6, 1), null, "cocurrent with R = 1 stops at ε = 0.5");
});

test("a 1-2 shell-and-tube exchanger that would need more shells is refused with the reason", () => {
  const o = shells => ({ duty_kW: 100, arrangement: "shell-and-tube", shells, U: { value: 500 },
    hot: { utility: { kind: "fluid", T_in_K: C(150), T_out_K: C(60), cp_J_kgK: 1000 } },
    cold: { utility: { kind: "fluid", T_in_K: C(40), T_out_K: C(130), cp_J_kgK: 1000 } } });
  assert.throws(() => exchangerArea(null, o(1)), /A one-shell exchanger \(two tube passes per shell\) cannot reach these temperatures .*Put more shells in series/);
  const r = exchangerArea(null, o(4));
  assert.ok(r.F < 1 && r.F > 0.5 && r.area_m2 > exchangerArea(null, { ...o(4), arrangement: "counterflow" }).area_m2, `F ${r.F}`);
  // F from the terminal temperatures: ε and R of the whole exchanger in the relation of Table 3.1
  const eps = 90 / 110, NTUcf = ntuFor("counterflow", eps, 1), NTU4 = ntuFor("shell-and-tube", eps, 1, 4);
  assert.ok(Math.abs(r.F - NTUcf / NTU4) < 1e-12);
});

test("a temperature cross is an error, never an area", () => {
  assert.throws(() => exchangerArea(null, { duty_kW: 100, hot: { utility: { kind: "fluid", T_in_K: C(100), T_out_K: C(50), cp_J_kgK: 1000 } },
    cold: { utility: { kind: "fluid", T_in_K: C(40), T_out_K: C(110), cp_J_kgK: 1000 } } }), /Temperature cross: .*Heat cannot flow there/);
  assert.throws(() => exchangerArea(null, { duty_kW: 100, arrangement: "cocurrent", hot: { utility: { kind: "fluid", T_in_K: C(150), T_out_K: C(80), cp_J_kgK: 1000 } },
    cold: { utility: { kind: "fluid", T_in_K: C(40), T_out_K: C(90), cp_J_kgK: 1000 } } }), /Temperature cross: .*\(cocurrent\).*use counterflow/);
});

test("zones along the real curves against CoolProp (Peng-Robinson n-butane, IAPWS-IF97 water and steam), within 0.5 %", () => {
  const [cond, boil] = ref.cases;
  let sys = system({ components: [cond.component], model: cond.model });
  let r = exchangerArea(sys, { zones: ref.zones, U: { value: cond.U_W_m2K },
    hot: { stream: stream(sys, { flow_kmol_h: { [cond.component]: cond.flow_kmol_h }, T_K: cond.T_in_K, P_kPa: cond.P_kPa }), T_out_K: cond.T_out_K },
    cold: { utility: { kind: "water", ...cond.water } } });
  close(r.duty_kW, cond.duty_kW, 0.005, `${cond.name}: duty`);
  close(r.area_m2, cond.area_m2, 0.005, `${cond.name}: area`);
  close(r.cold.flow_kg_h, cond.water_kg_h, 0.005, `${cond.name}: cooling water`);
  r.zones.forEach((z, k) => assert.ok(Math.abs(z.Th0_K - cond.Th_K[k]) < 0.2, `${cond.name}: hot side at zone ${k}: ${z.Th0_K} vs ${cond.Th_K[k]}`));
  // the condensing zones sit at the saturation temperature: the curve is not one LMTD
  assert.ok(r.zones.filter(z => Math.abs(z.Th0_K - z.Th1_K) < 1e-6).length >= 5);
  sys = system({ components: [boil.component], model: boil.model });
  r = exchangerArea(sys, { zones: ref.zones, U: { value: boil.U_W_m2K }, hot: { utility: { kind: "steam", P_kPa: boil.steam_P_kPa } },
    cold: { stream: stream(sys, { flow_kmol_h: { [boil.component]: boil.flow_kmol_h }, T_K: boil.T_in_K, P_kPa: boil.P_kPa }), VF_out: boil.VF_out } });
  close(r.duty_kW, boil.duty_kW, 0.005, `${boil.name}: duty`);
  close(r.area_m2, boil.area_m2, 0.005, `${boil.name}: area`);
  close(r.hot.flow_kg_h, boil.steam_kg_h, 0.005, `${boil.name}: steam`);
  assert.match(r.hot.describe, /saturated steam at 500 kPa condensing at 151\.8\d °C/);
  // two process streams of one system: butane condensing at 500 kPa heats butane boiling at 300 kPa
  const two = exchangerArea(sys, { U: { value: 600 },
    hot: { stream: stream(sys, { flow_kmol_h: { "n-butane": 10 }, T_K: 360, P_kPa: 500 }), T_out_K: 315 },
    cold: { stream: stream(sys, { flow_kmol_h: { "n-butane": 10 }, T_K: 280, P_kPa: 150 }) } });
  const hin = stream(sys, { flow_kmol_h: { "n-butane": 10 }, T_K: 360, P_kPa: 500 }), cin = stream(sys, { flow_kmol_h: { "n-butane": 10 }, T_K: 280, P_kPa: 150 });
  assert.ok(two.outlets.cold.T_K > 280 && Math.abs((two.outlets.cold.H_kW - cin.H_kW) - (hin.H_kW - two.outlets.hot.H_kW)) < 1e-6, "the cold outlet closes the energy balance");
});

test("U from a service (low end), from film coefficients with a wall metal, or your own", () => {
  assert.equal(serviceU("steam-condensers").U_W_m2K, 1500);
  assert.equal(serviceU("steam-condensers", "high").U_W_m2K, 5000);
  assert.equal(serviceU("air-heavy-oils").U_W_m2K, 45, "a single bound: as low as 45");
  assert.equal(foulingRf("seawater").Rf_m2K_W, 0.0004, "fouling: the high end");
  assert.equal(filmH("cond-steam").h_W_m2K, 15000);
  // 1/U = 1/15000 + 0.0001 + 0.002/k(304 at 100 °C = 15) + 0.0002 + 1/2600
  const u = overallU({ film: { hot: { hId: "cond-steam", RfId: "steam-clean" }, cold: { hId: "forced-organic-tube", RfId: "industrial-liquids" },
    wall: { material: "stainless-304", t_mm: 2 } } }, { T_wall_K: C(100) });
  const expect = 1 / (1 / 15000 + 0.0001 + 0.002 / 15 + 0.0002 + 1 / 2600);
  assert.ok(Math.abs(u.U_W_m2K - expect) < 1e-9 * expect, `${u.U_W_m2K} vs ${expect}`);
  assert.equal(u.parts.length, 5);
  assert.equal(overallU({ value: 850 }).U_W_m2K, 850);
  // Table A.1: 316 at 450 °C between 19 (400 °C) and 21 (600 °C); refused outside the table
  assert.ok(Math.abs(metalConductivity("stainless-316", C(450)).k_W_mK - 19.5) < 1e-9);
  assert.equal(metalConductivity("copper-pure", C(20)).k_W_mK, 398, "the 20 °C value of the table");
  assert.throws(() => metalConductivity("stainless-304", C(-50)), /tabulated from 20 to 600 °C .*Give your own conductivity/);
  assert.throws(() => serviceU("water-to-water"), /Unknown service "water-to-water"/);
  // the data file: every range is ordered and every metal's temperatures increase
  for (const r of HEAT_TRANSFER.services.rows) if (r.U[0] != null && r.U[1] != null) assert.ok(r.U[0] < r.U[1], r.id);
  for (const r of HEAT_TRANSFER.fouling.rows) if (r.Rf[0] != null) assert.ok(r.Rf[0] <= r.Rf[1], r.id);
  for (const m of HEAT_TRANSFER.metals.rows) m.k.forEach((p, i) => i && assert.ok(p[0] > m.k[i - 1][0], m.id));
});

test("Lamé's thick cylinder: the hoop stress at the inner wall equals S E; thin walls tend to P r / (S E)", () => {
  const w = wallThickness({ P_kPa: 2000, D_in_mm: 20, S_MPa: 100, E: 1, c_mm: 1 });
  const R = 10, Ro = R + w.t_pressure_mm, P = 2;
  const hoop = P * (R * R + Ro * Ro) / (Ro * Ro - R * R);
  assert.ok(Math.abs(hoop - 100) < 1e-9, `hoop stress ${hoop} MPa`);
  assert.equal(w.t_mm, w.t_pressure_mm + 1);
  assert.ok(Math.abs(w.t_pressure_mm / w.thin_wall_mm - 1) < 0.011, "thin wall: within 1 % at P/S = 0.02");
  assert.throws(() => wallThickness({ P_kPa: 90000, D_in_mm: 20, S_MPa: 100, E: 0.85 }), /not below the allowable stress times the joint efficiency/);
});
