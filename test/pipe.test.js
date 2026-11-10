// The Pipe block (proposal 0020; src/units/pipe.js): against the independent reference
// (validation/python/reference_pipe.py, validation/fixtures/pipe.json: 2000 segments, CoolProp's states), the open worked
// examples for a liquid (J. M. Cimbala, ME 320 Lecture 21, Penn State, 2015; DOE-HDBK-1012/3-92, module HT-03, pp. 32-33)
// and for a gas (G. Bar-Meir, Fundamentals of Compressible Fluid Mechanics v0.5.0, 2021, Example 9.2, pp. 248-249),
// in a flowsheet, and its refusals.
// Method (docs/METHOD_SELECTION.md): water alone, a liquid, is the ideal solution of one component (no mixture, so the
// activity model plays no part); methane, a gas at 3 MPa, Peng-Robinson. The worked examples with their own fluid
// properties go through pipeProfile with a fluid of their own (no property method).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, stream, runUnit, specStatus, solveFlowsheet } from "../src/index.js";
import { pipeProfile, colebrook, frictionFactor, FITTINGS } from "../src/units/pipe.js";

const fixture = JSON.parse(readFileSync(new URL("../validation/fixtures/pipe.json", import.meta.url)));
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const MODEL = { water: "ideal", methane: "PR" };

function runCase(c) {
  const sys = system({ components: [c.component], model: MODEL[c.component] });
  const feed = stream(sys, { flow_kg_h: { [c.component]: c.mass_kg_s * 3600 }, T_K: c.T_K, P_kPa: c.P_kPa });
  const spec = { length_m: c.length_m, diameter_m: c.diameter_m, roughness_m: c.roughness_m, elevation_m: c.elevation_m,
    fittings: c.fittings, heat: c.heat, viscosity_Pa_s: c.viscosity_Pa_s };
  if (c.heat === "U") Object.assign(spec, { U_W_m2K: c.U_W_m2K, T_ambient_K: c.T_ambient_K });
  return runUnit("pipe", { sys, inlets: { in: feed }, spec });
}

test("the pipe agrees with the independent reference: pressure drop and its parts, outlet temperature, heat", () => {
  for (const c of fixture.cases) {
    const r = runCase(c), s = r.state, ref = c.result;
    // the engine's 20 segments against 2000, and CHEPTA's states against CoolProp's (water: the liquid-density record
    // against IAPWS-95 at pressure, a few 0.01 %)
    assert.ok(Math.abs(s.dP_kPa - ref.dP_kPa) < 2e-3 * Math.abs(ref.dP_kPa) + 1e-4, `${c.name}: dP ${s.dP_kPa} vs ${ref.dP_kPa}`);
    for (const k of ["dP_friction_kPa", "dP_fittings_kPa", "dP_elevation_kPa"]) {
      assert.ok(Math.abs(s[k] - ref[k]) < 2e-3 * Math.abs(ref[k]) + 1e-4, `${c.name}: ${k} ${s[k]} vs ${ref[k]}`);
    }
    assert.ok(Math.abs(s.dP_acceleration_kPa - ref.dP_acceleration_kPa) < 0.02 * Math.abs(ref.dP_acceleration_kPa) + 2e-3, `${c.name}: acceleration`);   // a liquid: 0 here (no pressure in its density), 1e-3 kPa in IAPWS-95
    assert.ok(rel(s.Re_in, ref.Re_in) < 1e-9, `${c.name}: Re ${s.Re_in} vs ${ref.Re_in}`);
    assert.ok(rel(s.friction_factor_in, ref.friction_factor_in) < 1e-6, `${c.name}: f`);
    assert.ok(rel(s.velocity_out_m_s, ref.velocity_out_m_s) < 2e-3, `${c.name}: outlet velocity`);
    // a liquid's enthalpy has no pressure term in CHEPTA, so its friction does not warm it (IAPWS-95: < 0.1 K here)
    assert.ok(Math.abs(s.T_out_K - ref.T_out_K) < (c.component === "water" ? 0.1 : 0.05), `${c.name}: T out ${s.T_out_K} vs ${ref.T_out_K}`);
    if (c.heat === "U") assert.ok(rel(-r.duty_kW, ref.heat_lost_kW) < 5e-3, `${c.name}: heat lost ${-r.duty_kW} vs ${ref.heat_lost_kW}`);
    if (c.heat === "adiabatic") assert.equal(r.duty_kW, 0);
    assert.ok(Math.abs(r.balance.energy_kW) < 1e-6, `${c.name}: energy balance`);
    assert.equal(r.balance.material, 0);
  }
});

test("worked example, liquid: water at 10 °C in a 5 cm pipe, 100 m (Cimbala, ME 320 Lecture 21, pp. 3-4)", () => {
  // Given: 0.0100 m3/s, D = 5.00 cm, L = 100 m; the notes take rho = 999.7 kg/m3, mu = 1.307e-3 kg/(m s) (their
  // textbook's table) and give V = 5.092958 m/s, Re = 1.9477e5; (a) eps/D = 0.001: Colebrook f = 0.02107, dP = 546 kPa;
  // (b) smooth: f = 0.0157, dP = 408 kPa. The problem states eps = 0.00050 cm but the solution uses
  // 0.0050 cm / 5.00 cm = 0.001: the solution's roughness, 5e-5 m, is used here. CHEPTA's water at 10 °C:
  // rho = 999.65 kg/m3 (record), mu = 1.3060e-3 Pa s (IAPWS 2008).
  const sys = system({ components: ["water"], model: "ideal" });
  const feed = stream(sys, { flow_kg_h: { water: 0.0100 * 999.7 * 3600 }, T_K: 283.15, P_kPa: 700 });
  const pipe = roughness_m => runUnit("pipe", { sys, inlets: { in: feed }, spec: { length_m: 100, diameter_m: 0.05, roughness_m } }).state;
  const a = pipe(5e-5), b = pipe(0);
  assert.ok(rel(a.velocity_in_m_s, 5.092958) < 1e-4, `V ${a.velocity_in_m_s}`);
  assert.ok(rel(a.Re_in, 1.9477e5) < 2e-3, `Re ${a.Re_in}`);
  assert.ok(rel(a.friction_factor_in, 0.02107) < 1e-3, `f ${a.friction_factor_in}`);
  assert.ok(rel(a.dP_kPa, 546) < 2e-3, `dP ${a.dP_kPa}`);
  assert.ok(rel(b.friction_factor_in, 0.0157) < 3e-3, `smooth f ${b.friction_factor_in}`);
  assert.ok(rel(b.dP_kPa, 408) < 2e-3, `smooth dP ${b.dP_kPa}`);
  assert.equal(a.regime, "turbulent");
});

test("worked example, liquid: Darcy's head loss, water at 200 °F (DOE-HDBK-1012/3-92, HT-03, pp. 32-33)", () => {
  // 100 ft of 20 in pipe, 700 lbm/s, rho = 60 lbm/ft3, mu = 1.978e-7 lbf s/ft2, eps/D = 0.00008: v = 5.35 ft/s,
  // N_R = 8.4e7, f = 0.012 from the Moody chart, H_f = 0.32 ft. (The handbook's viscosity is about 30 times below
  // water's at 200 °F; the example is followed as printed.)
  const FT = 0.3048, LB = 0.45359237, LBF = 4.4482216152605;
  const rho = 60 * LB / FT ** 3, mu = 1.978e-7 * LBF / FT ** 2, D = 20 * 0.0254, L = 100 * FT, m = 700 * LB;
  const fluid = P => ({ P_kPa: P, T_K: 366.48, rho, mu });
  const run = f => pipeProfile({ geometry: { L, D, roughness: 0.00008 * D }, mass_kg_s: m, start: fluid(1000), end: P => fluid(P), segments: 1, friction_factor: f });
  const chart = run(0.012), own = run(null);
  const v = chart.nodes[0].velocity_m_s / FT, Re = chart.nodes[0].Re;
  assert.ok(Math.abs(v - 5.35) < 0.005, `v ${v} ft/s`);
  assert.ok(rel(Re, 8.4e7) < 5e-3, `Re ${Re}`);
  const Hf = f => f * L / D * (v * FT) ** 2 / (2 * 9.80665) / FT;
  const head = r => r.split.friction * 1000 / (rho * 9.80665) / FT;
  assert.ok(Math.abs(head(chart) - 0.32) < 0.005, `H_f ${head(chart)} ft with the chart's f`);
  assert.ok(Math.abs(head(chart) - Hf(0.012)) < 1e-9);
  // Colebrook against the chart reading (two significant figures): 0.01151
  assert.ok(Math.abs(own.nodes[0].friction_factor - 0.012) < 0.0006, `Colebrook f ${own.nodes[0].friction_factor} vs the chart's 0.012`);
});

test("worked example, gas: isothermal flow in a 5 km pipe (Bar-Meir, Example 9.2, pp. 248-249)", () => {
  // D = 0.25 m, L = 5000 m, Fanning f = 0.005 (Darcy 0.02), exit 1 bar, R = 290 J/(kg K), T = 300 K, k = 1.31. The
  // book finds M2 = 0.103, M1 = 0.04014 and the entrance pressure P1 = 2.566 bar. Its own formula, M2 = mdot c / (P2 A k)
  // with c = 337.59 m/s, gives 0.1050 for mdot = 2 kg/s; M2 = 0.103 is the flow 1.962 kg/s. So: with the book's Mach
  // numbers (1.962 kg/s) the pipe from 2.566 bar ends at 1 bar; with 2 kg/s, at the entrance pressure of the isothermal
  // relation P1^2 - P2^2 = G^2 R T [f L/D + 2 ln(P1/P2)] (eq. 9.9 integrated), 2.609 bar.
  const Rg = 290, T = 300, k = 1.31, D = 0.25, L = 5000, A = Math.PI * D * D / 4, c = Math.sqrt(k * Rg * T);
  const fluid = P => ({ P_kPa: P, T_K: T, rho: P * 1000 / (Rg * T), mu: 1.8e-5, phase: "vapour" });
  const P2 = (P1, m) => pipeProfile({ geometry: { L, D }, mass_kg_s: m, start: fluid(P1), end: P => fluid(P), friction_factor: 0.02 }).last.P_kPa;
  const mBook = 100e3 * A * k * 0.103 / c;
  assert.ok(Math.abs(mBook - 1.962) < 1e-3);
  assert.ok(Math.abs(P2(256.6, mBook) - 100) < 0.1, `exit ${P2(256.6, mBook)} kPa`);
  const G = 2 / A;
  let P1 = 2.6e5;
  for (let i = 0; i < 100; i++) P1 = Math.sqrt(1e10 + G * G * Rg * T * (0.02 * L / D + 2 * Math.log(P1 / 1e5)));
  assert.ok(Math.abs(P1 / 1000 - 260.86) < 0.01);
  assert.ok(Math.abs(P2(P1 / 1000, 2) - 100) < 0.01, `exit ${P2(P1 / 1000, 2)} kPa`);
});

test("friction factors: laminar 64/Re, Colebrook, Churchill in the transition", () => {
  assert.equal(frictionFactor(1000, 1e-3).f, 0.064);
  assert.equal(frictionFactor(1000, 1e-3).regime, "laminar");
  assert.equal(frictionFactor(3000, 1e-3).regime, "transition");
  const f = colebrook(1e5, 1e-3);
  assert.ok(Math.abs(1 / Math.sqrt(f) + 2 * Math.log10(1e-3 / 3.7 + 2.51 / (1e5 * Math.sqrt(f)))) < 1e-12);
  assert.equal(Object.keys(FITTINGS).length, 11);
  assert.equal(FITTINGS["elbow-90"][1], 30);
});

test("the pipe refuses what it does not model, with the reason", () => {
  const sys = system({ components: ["water"], model: "ideal" });
  const spec = { length_m: 100, diameter_m: 0.05, roughness_m: 4.5e-5 };
  // Gas-liquid flow is computed since the two-phase step of proposal 0020 (Lockhart-Martinelli; test/pipe-two-phase.test.js,
  // which also holds its refusals). These two streams were refused as two-phase before; at these flows they now reach
  // critical (choked) flow, which is refused: wet steam at 1 atm, 30 % vapour, at 141 kg/(m² s) chokes after some 20 m,
  // and a saturated liquid at 120 kPa flashing at 2830 kg/(m² s) chokes at once (by hand, the no-slip critical mass
  // flux of saturated water near 1 bar is about 1100 kg/(m² s)).
  const two = stream(sys, { flow_kg_h: { water: 1000 }, P_kPa: 101.325, VF: 0.3 });
  assert.throws(() => runUnit("pipe", { sys, inlets: { in: two }, spec }), e => e.code === "NOT_AVAILABLE" && /choked/.test(e.message));
  const sat = stream(sys, { flow_kg_h: { water: 20000 }, P_kPa: 120, VF: 0 });
  assert.throws(() => runUnit("pipe", { sys, inlets: { in: sat }, spec }), e => e.code === "NOT_AVAILABLE" && /choked/.test(e.message) && /starts to boil/.test(e.message));
  const cold = stream(sys, { flow_kg_h: { water: 36000 }, T_K: 293.15, P_kPa: 200 });
  assert.throws(() => runUnit("pipe", { sys, inlets: { in: cold }, spec: { ...spec, length_m: 1000 } }), e => e.code === "BAD_INPUT" && /pressure falls to zero/.test(e.message));
  assert.throws(() => runUnit("pipe", { sys, inlets: { in: cold }, spec: { ...spec, fittings: [{ fitting: "butterfly" }] } }), e => e.code === "BAD_INPUT" && /elbow-90/.test(e.message));
  assert.throws(() => runUnit("pipe", { sys, inlets: { in: cold }, spec: { ...spec, heat: "U" } }), e => e.code === "BAD_INPUT" && /U_W_m2K/.test(e.message));
  assert.throws(() => runUnit("pipe", { sys, inlets: { in: cold }, spec: { ...spec, length: 3 } }), e => e.code === "BAD_INPUT" && /unknown specification key/.test(e.message));
  const g = system({ components: ["methane"], model: "PR" });
  const gas = stream(g, { flow_kg_h: { methane: 20000 }, T_K: 300, P_kPa: 500 });
  assert.throws(() => runUnit("pipe", { sys: g, inlets: { in: gas }, spec: { length_m: 500, diameter_m: 0.1, roughness_m: 4.5e-5 } }),
    e => ["NOT_AVAILABLE", "NO_CONVERGENCE", "BAD_INPUT"].includes(e.code) && /chok|zero/.test(e.message));
  const st = specStatus("pipe", { length_m: 10 }, { sys });
  assert.equal(st.status, "missing");
  assert.match(st.message, /diameter/);
  assert.match(st.message, /roughness/);
});

test("a pipe in a flowsheet: feed, pipe, product; the warning of the transition reaches the block's result", () => {
  const sys = system({ components: ["water"], model: "ideal" });
  const r = solveFlowsheet(sys, {
    blocks: [
      { id: "F1", type: "feed", spec: { flow_kg_h: { water: 180 }, T_K: 293.15, P_kPa: 300 } },
      { id: "PIPE1", type: "pipe", spec: { length_m: 30, diameter_m: 0.02, roughness_m: 4.5e-5, fittings: [{ fitting: "elbow-90", count: 2 }] } },
      { id: "P1", type: "product" },
    ],
    streams: [{ id: "S1", from: "F1.out", to: "PIPE1.in" }, { id: "S2", from: "PIPE1.out", to: "P1.in" }],
  });
  const b = r.blocks.PIPE1;
  assert.ok(b.state.dP_kPa > 0 && b.state.dP_fittings_kPa > 0);
  assert.ok(Math.abs(r.streams.S2.P_kPa - (300 - b.state.dP_kPa)) < 1e-9);
  assert.ok(b.warnings.some(w => w.code === "FLOW_TRANSITION"));
  assert.equal(b.profile.length, 21);
});
