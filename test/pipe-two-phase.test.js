// The Pipe block in gas-liquid flow (proposal 0020, the two-phase step; src/units/pipe.js): Lockhart and Martinelli's
// frictional gradient in Chisholm's form (A. Filip, F. Baltaretu, R.-M. Damian, Math. Model. Civ. Eng. 10(4) (2014)
// 19-27, eqs. (10)-(17), pp. 21-22, open access; the same C in ANL/CP-74646, 1992, Table 1, p. 20), the elevation and
// acceleration with the homogeneous (no-slip) density (Filip et al., eqs. (5)-(6)). Checked against the independent
// reference validation/python/reference_pipe.py (validation/fixtures/pipe-two-phase.json: 2000 segments; its
// Lockhart-Martinelli checked against the open fluids library), with fluids of their own through pipeProfile and with
// steam and water through the whole block (CoolProp's IAPWS-95 in the reference, CHEPTA's records here). No open worked
// example with numbers was found (docs/decisions/2026-11-10-06-pipe-two-phase.md lists the search).
// Method (docs/METHOD_SELECTION.md): water alone is the ideal solution of one component (no mixture, so the activity
// model plays no part) with an ideal-gas vapour; the test that needs two liquids (water and 1-butanol, which split)
// takes NRTL, the method guide's choice for a liquid-liquid split.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, stream, runUnit, solveFlowsheet } from "../src/index.js";
import { pipeProfile, lockhartMartinelli, homogeneous, CHISHOLM_C, RE_CHISHOLM, frictionFactor } from "../src/units/pipe.js";

const fixture = JSON.parse(readFileSync(new URL("../validation/fixtures/pipe-two-phase.json", import.meta.url)));
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const R = 8.314462618;
const water = () => system({ components: ["water"], model: "ideal" });

test("Chisholm's C and the form of the multiplier, as the open sources print them", () => {
  // Filip et al. (2014), eq. (17): 5 (vv), 10 (tv), 12 (vt), 20 (tt), "v" below Re 1500; ANL/CP-74646, Table 1, p. 20
  assert.deepEqual({ ...CHISHOLM_C }, { vv: 5, tv: 10, vt: 12, tt: 20 });
  assert.equal(RE_CHISHOLM, 1500);
  const base = { G: 1000, D: 0.05, relRough: 1e-3, rhoL: 998, rhoG: 4.7, muG: 1.8e-5 };
  const cases = [[{ x: 0.01, muL: 1e-3 }, "tt"], [{ x: 0.01, muL: 0.2 }, "vt"], [{ x: 1e-5, muL: 1e-3 }, "tv"], [{ x: 1e-5, muL: 0.2 }, "vv"]];
  for (const [c, key] of cases) {
    const lm = lockhartMartinelli({ ...base, ...c });
    assert.equal(lm.regimes, key);
    assert.equal(lm.C, CHISHOLM_C[key]);
    // phi_L^2 = 1 + C/X + 1/X^2 (eq. 13), X^2 = (dp/dz)_L / (dp/dz)_G (eq. 15), the gradient phi_L^2 (dp/dz)_L (eq. 10)
    const X = Math.sqrt(lm.dpdz_L / lm.dpdz_G);
    assert.ok(rel(lm.X, X) < 1e-12);
    assert.ok(rel(lm.phi_L2, 1 + lm.C / X + 1 / (X * X)) < 1e-12);
    assert.ok(rel(lm.gradient_Pa_m, lm.phi_L2 * lm.dpdz_L) < 1e-12);
    // each phase alone (eqs. 11, 12, 16), here with the block's own Darcy factor and the wall's roughness
    const GL = base.G * (1 - c.x), GG = base.G * c.x;
    assert.ok(rel(lm.Re_L, GL * base.D / c.muL) < 1e-12 && rel(lm.Re_G, GG * base.D / base.muG) < 1e-12);
    assert.ok(rel(lm.dpdz_L, frictionFactor(lm.Re_L, 1e-3).f * GL * GL / (2 * base.rhoL * base.D)) < 1e-12);
  }
  // the limits: as the quality goes to 0 the gradient becomes the liquid's alone, at the total flow
  const lm0 = lockhartMartinelli({ ...base, x: 1e-12, muL: 1e-3 });
  const liquidAlone = frictionFactor(base.G * base.D / 1e-3, 1e-3).f * base.G ** 2 / (2 * base.rhoL * base.D);
  assert.ok(rel(lm0.gradient_Pa_m, liquidAlone) < 1e-4);
  assert.throws(() => lockhartMartinelli({ ...base, x: 0, muL: 1e-3 }), /between 0 and 1/);
  // the no-slip density and holdup (Filip et al., eqs. 5-6)
  const h = homogeneous(0.01, 998, 4.7);
  assert.ok(rel(h.rho, 1 / (0.01 / 4.7 + 0.99 / 998)) < 1e-12);
  assert.ok(rel(h.holdup_L, (0.99 / 998) / (0.01 / 4.7 + 0.99 / 998)) < 1e-12);
});

test("two-component flow against the independent reference (fluids of their own, 20 segments against 2000)", () => {
  assert.match(fixture._about, /agrees with fluids/, "the reference's Lockhart-Martinelli was checked against the fluids library");
  for (const c of fixture.two_component) {
    const D = c.diameter_m, G = c.mass_kg_s / (Math.PI * D * D / 4);
    // a liquid of constant density and viscosity, an ideal gas of constant viscosity, one temperature, no mass transfer
    const fluid = P => {
      const rhoG = c.M_gas / 1000 * P * 1000 / (R * c.T_K), hm = homogeneous(c.x, c.rhoL, rhoG);
      return { P_kPa: P, T_K: c.T_K, rho: hm.rho, mu: null, tp: { x: c.x, rhoL: c.rhoL, rhoG, muL: c.muL, muG: c.muG, holdup_L: hm.holdup_L } };
    };
    const r = pipeProfile({ geometry: { L: c.length_m, D, roughness: c.roughness_m, dz: c.elevation_m }, mass_kg_s: c.mass_kg_s,
      start: fluid(c.P_kPa), end: P => fluid(P), segments: 20 });
    const ref = c.result, dP = c.P_kPa - r.last.P_kPa;
    assert.ok(Math.abs(dP - ref.dP_kPa) < 2e-3 * Math.abs(ref.dP_kPa) + 1e-3, `${c.name}: dP ${dP} vs ${ref.dP_kPa}`);
    assert.ok(Math.abs(r.split.friction - ref.dP_friction_kPa) < 2e-3 * ref.dP_friction_kPa, `${c.name}: friction`);
    assert.ok(Math.abs(r.split.elevation - ref.dP_elevation_kPa) < 2e-3 * Math.abs(ref.dP_elevation_kPa) + 1e-6, `${c.name}: elevation`);
    assert.ok(Math.abs(r.split.acceleration - ref.dP_acceleration_kPa) < 0.02 * Math.abs(ref.dP_acceleration_kPa) + 1e-4, `${c.name}: acceleration`);
    assert.equal(r.split.fittings, 0);
    const n0 = r.nodes[0].two_phase;
    assert.equal(r.nodes[0].regime, `two-phase (${ref.inlet.regimes})`);
    assert.equal(n0.C, ref.inlet.C);
    assert.ok(rel(n0.X, ref.inlet.X) < 1e-9 && rel(n0.phi_L2, ref.inlet.phi_L2) < 1e-9, `${c.name}: X, phi_L^2 at the inlet`);
    assert.ok(rel(n0.holdup_L, ref.inlet.holdup_L) < 1e-9);
    assert.deepEqual(r.twoPhase.regimes, [ref.inlet.regimes]);
  }
});

test("steam and water through the block against the reference (CoolProp's IAPWS-95; CHEPTA's own records here)", () => {
  const sys = water();
  for (const c of fixture.steam) {
    const feed = stream(sys, { flow_kg_h: { water: c.mass_kg_s * 3600 }, ...c.inlet });
    const r = runUnit("pipe", { sys, inlets: { in: feed }, spec: { length_m: c.length_m, diameter_m: c.diameter_m, roughness_m: c.roughness_m, elevation_m: c.elevation_m } });
    const s = r.state, ref = c.result;
    // CHEPTA's water: an ideal-gas vapour (4.5 % lighter than IAPWS-95's saturated steam at 500 kPa, below) and the
    // liquid's density and viscosity records. On these cases the drops and their friction agree within 2.6 %; the
    // no-slip density, nearly proportional to the vapour's at 5 % quality, makes the elevation term 4.2 % lower
    assert.ok(rel(s.dP_kPa, ref.dP_kPa) < 0.03, `${c.name}: dP ${s.dP_kPa} vs ${ref.dP_kPa}`);
    assert.ok(rel(s.dP_friction_kPa, ref.dP_friction_kPa) < 0.03, `${c.name}: friction ${s.dP_friction_kPa} vs ${ref.dP_friction_kPa}`);
    if (c.elevation_m) assert.ok(rel(s.dP_elevation_kPa, ref.dP_elevation_kPa) < 0.05, `${c.name}: elevation ${s.dP_elevation_kPa} vs ${ref.dP_elevation_kPa}`);
    assert.ok(rel(s.two_phase.quality_out, ref.quality_out) < 0.03, `${c.name}: outlet quality ${s.two_phase.quality_out} vs ${ref.quality_out}`);
    // the properties at the inlet (when gas-liquid) and the outlet nodes, against IAPWS-95
    for (const [n, f] of [[r.profile[0], ref.inlet_node], [r.profile.at(-1), ref.outlet_node]]) {
      if (!f) { assert.equal(n.two_phase, undefined, `${c.name}: one phase at the inlet`); continue; }
      assert.equal(n.two_phase.C, f.C, `${c.name}: C`);
      assert.ok(rel(n.two_phase.Re_L, f.Re_L) < 0.03, `${c.name}: Re_L ${n.two_phase.Re_L} vs ${f.Re_L}`);
      // the phases' densities, from the holdup and the no-slip density: rho_H = 1/(x/rho_G + (1 - x)/rho_L)
      const q = n.two_phase.quality, hl = n.two_phase.holdup_L;
      const rhoL = n.rho_kg_m3 * (1 - q) / hl, rhoG = n.rho_kg_m3 * q / (1 - hl);
      assert.ok(rel(rhoL, f.rhoL) < 0.002, `${c.name}: liquid density ${rhoL} vs ${f.rhoL}`);
      assert.ok(rhoG < f.rhoG && rel(rhoG, f.rhoG) < 0.05, `${c.name}: vapour density ${rhoG} vs ${f.rhoG} (ideal gas against IAPWS-95)`);
    }
    assert.ok(Math.abs(r.balance.energy_kW) < 1e-6 && r.balance.material === 0);
    assert.equal(r.duty_kW, 0);
    assert.ok(r.notes.some(t => /Lockhart-Martinelli/.test(t) && /factor of 3/.test(t)), "the method and its accuracy are stated");
    if (c.elevation_m) assert.ok(r.warnings.some(w => w.code === "TWO_PHASE_ELEVATION"));
  }
  // the flashing liquid: one phase, then gas-liquid; the note says the correlation is applied at each node's quality
  const flash = fixture.steam.find(c => /flashing/.test(c.name));
  const r = runUnit("pipe", { sys, inlets: { in: stream(sys, { flow_kg_h: { water: 3600 }, ...flash.inlet }) }, spec: { length_m: flash.length_m, diameter_m: flash.diameter_m, roughness_m: flash.roughness_m } });
  assert.equal(r.state.phase, "liquid and vapour-liquid");
  assert.equal(r.profile[0].regime, "turbulent");
  assert.ok(r.profile.at(-1).two_phase.quality > 0);
  assert.ok(r.notes.some(t => /boils/.test(t)) && r.notes.some(t => /each node's quality/.test(t)));
});

test("a gas that condenses as it loses heat; a liquid that flashes in a flowsheet after a valve", () => {
  const sys = water();
  const steam = stream(sys, { flow_kg_h: { water: 720 }, P_kPa: 300, VF: 1 });
  const r = runUnit("pipe", { sys, inlets: { in: steam }, spec: { length_m: 100, diameter_m: 0.05, roughness_m: 4.5e-5, heat: "U", U_W_m2K: 20, T_ambient_K: 290 } });
  assert.ok(r.duty_kW < 0 && r.state.two_phase.quality_out < 1, "heat lost, part of the steam condensed");
  assert.ok(Math.abs(r.balance.energy_kW) < 1e-6);
  // condensing at its saturation temperature: the outlet is the saturation temperature at the outlet pressure
  const sat = stream(sys, { flow_kg_h: { water: 720 }, P_kPa: r.state.P_out_kPa, VF: 0.5 });
  assert.ok(Math.abs(r.state.T_out_K - sat.T_K) < 1e-6);
  const f = solveFlowsheet(sys, {
    blocks: [
      { id: "F1", type: "feed", spec: { flow_kg_h: { water: 3600 }, T_K: 400, P_kPa: 400 } },
      { id: "V1", type: "valve", spec: { P_kPa: 250 } },
      { id: "PIPE1", type: "pipe", spec: { length_m: 150, diameter_m: 0.05, roughness_m: 4.5e-5 } },
      { id: "P1", type: "product" },
    ],
    streams: [{ id: "S1", from: "F1.out", to: "V1.in" }, { id: "S2", from: "V1.out", to: "PIPE1.in" }, { id: "S3", from: "PIPE1.out", to: "P1.in" }],
  });
  assert.ok(f.streams.S3.VF > 0, "the water leaves the pipe partly flashed");
  assert.ok(f.blocks.PIPE1.state.two_phase);
});

test("gas-liquid flow: the refusals and the warnings, with the reason", () => {
  const sys = water();
  const wet = stream(sys, { flow_kg_h: { water: 3600 }, P_kPa: 500, VF: 0.05 });
  const spec = { length_m: 50, diameter_m: 0.08, roughness_m: 4.5e-5 };
  const run = extra => runUnit("pipe", { sys, inlets: { in: wet }, spec: { ...spec, ...extra } });
  assert.throws(() => run({ fittings: [{ fitting: "elbow-90" }] }), e => e.code === "NOT_AVAILABLE" && /fittings/.test(e.message) && /gas-liquid/.test(e.message));
  assert.throws(() => run({ friction_factor: 0.02 }), e => e.code === "NOT_AVAILABLE" && /friction factor/.test(e.message));
  assert.throws(() => run({ viscosity_Pa_s: 1e-3 }), e => e.code === "NOT_AVAILABLE" && /viscosity/.test(e.message));
  // the same fittings on a pipe whose water stays liquid are computed as before
  const cold = stream(sys, { flow_kg_h: { water: 3600 }, T_K: 300, P_kPa: 500 });
  assert.ok(runUnit("pipe", { sys, inlets: { in: cold }, spec: { ...spec, fittings: [{ fitting: "elbow-90" }] } }).state.dP_fittings_kPa > 0);
  // critical (choked) flow: wet steam at 300 kPa, 2 kg/s in 5 cm
  const fast = stream(sys, { flow_kg_h: { water: 7200 }, P_kPa: 300, VF: 0.1 });
  assert.throws(() => runUnit("pipe", { sys, inlets: { in: fast }, spec: { length_m: 50, diameter_m: 0.05, roughness_m: 4.5e-5 } }),
    e => e.code === "NOT_AVAILABLE" && /choked/.test(e.message) && /singular/.test(e.message));
  // the warnings: uphill (the no-slip holdup), and a phase alone that is viscous (C other than 20)
  assert.ok(run({ elevation_m: 10 }).warnings.some(w => w.code === "TWO_PHASE_ELEVATION" && /Beggs-Brill/.test(w.message)));
  const flashing = runUnit("pipe", { sys, inlets: { in: stream(sys, { flow_kg_h: { water: 3600 }, T_K: 400, P_kPa: 250 }) }, spec: { length_m: 150, diameter_m: 0.05, roughness_m: 4.5e-5 } });
  assert.ok(flashing.warnings.some(w => w.code === "TWO_PHASE_VISCOUS"), "just after the flash the vapour alone is viscous (tv, C = 10)");
  // two liquid phases are not gas-liquid flow (water and 1-butanol split; NRTL)
  const ll = system({ components: ["water", "1-butanol"], model: "NRTL" });
  const two = stream(ll, { flow_kmol_h: { water: 80, "1-butanol": 20 }, T_K: 298.15, P_kPa: 300 });
  assert.equal(two.phases.filter(p => p.type === "liquid" && p.fraction > 1e-12).length, 2, "the feed splits into two liquids");
  assert.throws(() => runUnit("pipe", { sys: ll, inlets: { in: two }, spec }), e => e.code === "NOT_AVAILABLE" && /two liquids/.test(e.message));
});
