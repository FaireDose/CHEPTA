// The drum and decanter sizes (proposal 0015, milestone M1; src/sizing/sizing.js): the formulas against the independent
// reference (validation/python/reference_sizing.py -> validation/fixtures/sizing.json), the K fit against its chart, the
// worked examples of the open sources (Bagajewicz 2018, University of Oklahoma; Al-Bayati, University of Baghdad), and
// the flash block's result end to end, through the dispatcher too.
// Method (docs/METHOD_SELECTION.md): ethanol + water with NRTL and an ideal-gas vapour at 101.3 kPa (the example project
// heater-flash.chepta.json); ethyl acetate + water with NRTL for the two liquids, as test/benchmark-ethyl-acetate.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, stream } from "../src/index.js";
import { runUnit } from "../src/units/units.js";
import { run } from "../src/api/dispatcher.js";
import { flowsheetRun } from "../src/flowsheet/document.js";
import { R } from "../src/thermo/pure.js";
import { sizeDrum, sizeDecanter, drumGeometry, decanterGeometry, kDrum, K_DRUM_FIT, flashBlockResult, segmentArea } from "../src/sizing/sizing.js";

const ref = JSON.parse(readFileSync(new URL("../validation/fixtures/sizing.json", import.meta.url)));
const project = JSON.parse(readFileSync(new URL("../examples/heater-flash.chepta.json", import.meta.url), "utf8"));
const close = (a, b, rel, what) => assert.ok(Math.abs(a / b - 1) <= rel, `${what}: ${a} vs ${b} (${((a / b - 1) * 100).toFixed(3)} %)`);
const FT = 0.3048;

test("the drum and decanter formulas agree with the independent Python reference (1e-9)", () => {
  for (const [id, c] of Object.entries(ref.drums)) {
    const r = drumGeometry(c.input, c.input.options ?? {}), e = c.result;
    close(r.basis.flowParameter, e.F, 1e-9, `${id} F`);
    close(r.basis.K_m_s, e.K_m_s, 1e-9, `${id} K`);
    close(r.basis.u_m_s, e.u_m_s, 1e-9, `${id} u`);
    close(r.dimensions.D_m, e.D_m, 1e-9, `${id} D`);
    if (e.H_m != null) { close(r.dimensions.H_m, e.H_m, 1e-9, `${id} H`); close(r.dimensions.hL_m, e.hL_m, 1e-9, `${id} hL`); close(r.dimensions.feedLine_m, e.feedLine_m, 1e-9, `${id} feed line`); }
    else { close(r.dimensions.L_m, e.L_m, 1e-9, `${id} L`); close(r.dimensions.vapourSpace_m, e.vapourSpace_m, 1e-6, `${id} vapour space`); }
  }
  for (const [id, c] of Object.entries(ref.decanters)) {
    const r = decanterGeometry(c.input, c.input.options ?? {}), e = c.result;
    close(r.basis.settling_m_s, e.settling_m_s, 1e-9, `${id} u_d`);
    close(r.dimensions.interfaceArea_m2, e.interfaceArea_m2, 1e-9, `${id} A_i`);
    close(r.dimensions.D_m, e.D_m, 1e-9, `${id} D`);
    close(r.dimensions.L_m ?? r.dimensions.H_m, e.L_m ?? e.H_m, 1e-9, `${id} L or H`);
    close(r.basis.bandResidence_s, e.band_residence_s, 1e-9, `${id} band`);
    close(r.basis.entrainedDrop_m, e.entrainedDrop_m, 1e-9, `${id} entrained drop`);
  }
});

test("the K fit follows the chart it was fitted to (Fermeglia 2021, slide 83), and refuses outside it", () => {
  // read off the chart of slide 83 by pixel position (a 300 dpi rendering of the slide; log axes calibrated on the ticks
  // 0.4, 0.2, 0.04 and 0.01, 1.0), so within the reading's accuracy, a few per cent
  const read = [[0.01, 0.312], [0.02, 0.400], [0.05, 0.437], [0.1, 0.417], [0.2, 0.361], [0.5, 0.235], [1, 0.143], [2, 0.075], [4, 0.031], [5, 0.023]];
  for (const [F, K] of read) close(kDrum(F).K_ft_s, K, 0.08, `K at F = ${F}`);
  assert.equal(+kDrum(1).K_ft_s.toFixed(6), +Math.exp(K_DRUM_FIT.A).toFixed(6));
  for (const F of [0.004, 6]) assert.throws(() => kDrum(F), e => e.code === "OUT_OF_RANGE" && /K_m_s/.test(e.message));
});

test("Bagajewicz (2018), Oklahoma flash drum example: v_perm = 6.823 ft/s from its K; its two slips", () => {
  // the example's data: QL = 0.001179 m3/s, QV = 0.14157 m3/s, rhoL = 999.552, rhoV = 1.20139 kg/m3, 2 min of liquid
  const inp = { WL_kg_s: 0.001179 * 999.552, WV_kg_s: 0.14157 * 1.20139, rhoL: 999.552, rhoV: 1.20139 };
  // its K = 0.2365 comes from the fit with log10 in place of ln; with ln (the chart above) K is 0.347 ft/s
  const c = K_DRUM_FIT, l = Math.log10(0.2402), Klog = Math.exp(c.A + c.B * l + c.C * l ** 2 + c.D * l ** 3 + c.E * l ** 4);
  assert.equal(+Klog.toFixed(4), 0.2366);
  const r = drumGeometry(inp, { fraction: 1, K_m_s: Klog * FT });
  assert.equal(+r.basis.flowParameter.toFixed(4), 0.2402);
  assert.equal(+kDrum(r.basis.flowParameter).K_ft_s.toFixed(3), 0.347);
  close(r.basis.u_permitted_m_s / FT, 6.823, 5e-4, "v_perm, ft/s");   // 6.8205 (the example rounds K)
  // its area 0.0689 m2 and pool height 2.05 m used 0.30103 m per ft; with 0.3048: 0.0681 m2 and 2.08 m
  close(r.dimensions.area_m2 * FT / 0.30103, 0.0689, 2e-3, "area with 0.30103 m per ft");
  assert.equal(+r.dimensions.area_m2.toFixed(4), 0.0681);
  assert.equal(+(0.001179 * 120 / 0.0689).toFixed(2), 2.05);
  assert.equal(+r.dimensions.hL_m.toFixed(2), 2.08);
});

test("Al-Bayati, examples 1 and 2: a vertical (H = 2D) and a horizontal (L = 4D) decanter for oil in water", () => {
  const oil = q => ({ Q_m3_s: q / 900 / 3600, rho: 900, mu: 3e-3 }), water = q => ({ Q_m3_s: q / 1000 / 3600, rho: 1000, mu: 1e-3 });
  const v = decanterGeometry({ light: oil(1000), heavy: water(5000) }, { dispersed: "light" });
  // the lecture rounds u_d to 1.2e-3 m/s (Stokes gives 1.226e-3 with g = 9.81, 1.225e-3 with 9.80665); A_i 1.16 m2 with it
  assert.equal(+v.basis.settling_m_s.toFixed(4), 0.0012);
  assert.equal(+(v.dimensions.interfaceArea_m2 * v.basis.settling_m_s / 1.2e-3).toFixed(2), 1.16);
  assert.equal(+v.dimensions.D_m.toFixed(1), 1.2);
  assert.equal(+v.dimensions.H_m.toFixed(1), 2.4);
  assert.equal(+v.dimensions.band_m.toFixed(2), 0.24);
  assert.equal(Math.round(v.dimensions.band_m / 1.2e-3 / 10) * 10, 200);   // "200 s = 3.3 min"
  assert.equal(+v.basis.entrainedDrop_m.toExponential(1), 1.2e-4);
  close(v.dimensions.inlet_m, 0.047, 0.015, "inlet pipe");   // 0.0465 m (the lecture rounds the flow to 1.7e-3 m3/s)
  assert.equal(+v.dimensions.lightOverflow_m.toFixed(1), 2.2);   // 2.16 m
  // H2 = H3 + (H1 - H3) rho1/rho2 = 1.2 + 0.96 x 0.9 = 2.06 m ("= 2 m" in the lecture)
  assert.equal(+v.dimensions.heavyOverflow_m.toFixed(0), 2);
  const hz = decanterGeometry({ light: oil(5000), heavy: water(25000) }, { dispersed: "light", orientation: "horizontal" });
  // with the lecture's u_d = 1.2e-3: A_i = 5.787 m2, D = 1.2028 m, L = 4.8112 m; D scales with u_d^-1/2
  close(hz.dimensions.interfaceArea_m2 * hz.basis.settling_m_s / 1.2e-3, 5.787, 2e-4, "A_i");
  close(hz.dimensions.D_m * Math.sqrt(hz.basis.settling_m_s / 1.2e-3), 1.2028, 2e-4, "D");
  assert.equal(hz.dimensions.L_m, 4 * hz.dimensions.D_m);
  // the lecture writes the inlet flow as 2.932e-3 m3/s (0.061 m), but (5000/900 + 25000/1000)/3600 = 8.49e-3 m3/s: 0.104 m
  assert.equal(+hz.dimensions.inlet_m.toFixed(3), 0.104);
  assert.ok(hz.notes.some(n => /below the 2 min/.test(n)), "1.7 min in the band: 'unsatisfactory'");
});

test("geometry: a circular segment; the horizontal drum's vapour space and length", () => {
  assert.ok(Math.abs(segmentArea(2, 1) - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(segmentArea(2, 2) - Math.PI) < 1e-12);
  const r = drumGeometry({ WL_kg_s: 40, WV_kg_s: 12, rhoL: 800, rhoV: 3 }, { orientation: "horizontal" });
  close(r.basis.K_m_s, 1.25 * r.basis.K_vertical_m_s, 1e-12, "K_H = 1.25 K_V");
  close(segmentArea(r.dimensions.D_m, r.dimensions.vapourSpace_m), 0.2 * r.dimensions.area_m2, 1e-9, "20 % of the area");
  assert.ok(r.dimensions.LD >= 3 - 1e-12);
});

test("a flash drum's result end to end: the vapour density of the system, the liquid's from the records; refusals", () => {
  const { sys, result } = flowsheetRun(project);
  const r = flashBlockResult(project.flowsheet, result, "V1");
  const d = sizeDrum(r, { sys });
  const v = r.outlets.vapour, T = r.state.T_K, P = r.state.P_kPa;
  close(d.basis.rhoV_kg_m3, v.MW / 1000 * P * 1000 / (R * T), 1e-12, "ideal-gas vapour");
  close(d.basis.QV_m3_s, v.mass_kg_h / 3600 / d.basis.rhoV_kg_m3, 1e-12, "vapour volume flow");
  assert.ok(d.basis.rhoL_kg_m3 > 780 && d.basis.rhoL_kg_m3 < 1000, `liquid density ${d.basis.rhoL_kg_m3}`);
  assert.equal(d.basis.fraction, 0.85);
  assert.equal(d.basis.residence_s, 120);
  assert.deepEqual(d.source, ["fermeglia-flash-2021", "ou-che4253-flash"]);
  assert.ok(d.dimensions.HD >= 3 - 1e-9);
  // the same through the dispatcher
  const q = run({ capability: "size_drum", input: { project, block: "V1", drum: { orientation: "horizontal" } } });
  assert.equal(q.outcome, "ok", JSON.stringify(q.error));
  close(q.value.drum.dimensions.D_m, sizeDrum(r, { sys, orientation: "horizontal" }).dimensions.D_m, 1e-12, "dispatcher");
  assert.equal(q.value.decanter, undefined);
  assert.equal(run({ capability: "size_drum", input: { project, block: "E1" } }).outcome, "invalid_input");
  assert.equal(run({ capability: "size_drum", input: { project, block: "V1", drum: { colour: "red" } } }).outcome, "invalid_input");
  assert.throws(() => sizeDrum(r, {}), e => e.code === "BAD_INPUT" && /sys/.test(e.message));
  assert.throws(() => sizeDrum(r, { sys, orientation: "sideways" }), e => e.code === "BAD_INPUT");
  assert.throws(() => sizeDecanter(r, { sys }), e => e.code === "BAD_INPUT" && /one liquid/.test(e.message));
});

test("a three-phase drum: the decanter of ethyl acetate and water from the flash's two liquids", () => {
  const sys = system({ components: ["ethyl acetate", "water"], model: "NRTL" });
  const feed = stream(sys, { flow_kmol_h: { "ethyl acetate": 30, water: 70 }, T_K: 300, P_kPa: 101.325 });
  const r = runUnit("flash", { sys, inlets: { in: feed }, spec: { T_K: 300, P_kPa: 101.325 }, outletCount: 3 });
  const d = sizeDecanter(r, { sys });
  const { light, heavy } = d.basis;
  assert.ok(light.rho < heavy.rho && heavy.rho > 950 && light.rho > 850, `${light.rho}, ${heavy.rho}`);
  assert.ok(d.basis.compositions.light["ethyl-acetate"] > 0.5 && d.basis.compositions.heavy.water > 0.9);
  // the volume flows close the liquid mass balance
  const mass = r.outlets.liquid.mass_kg_h + r.outlets.liquid2.mass_kg_h;
  close((light.Q_m3_s * light.rho + heavy.Q_m3_s * heavy.rho) * 3600, mass, 1e-9, "liquid mass");
  // the heavy (water-rich) liquid has the smaller volume flow here, so it is the dispersed phase by default
  assert.equal(d.basis.dispersed, heavy.Q_m3_s < light.Q_m3_s ? "heavy" : "light");
  close(d.dimensions.interfaceArea_m2, (d.basis.dispersed === "heavy" ? light : heavy).Q_m3_s / d.basis.settling_m_s, 1e-12, "A_i");
  assert.throws(() => sizeDrum(r, { sys }), e => e.code === "BAD_INPUT" && /no vapour/.test(e.message));
  assert.throws(() => sizeDecanter(r, { sys, droplet_um: -1 }), e => e.code === "BAD_INPUT");
});
