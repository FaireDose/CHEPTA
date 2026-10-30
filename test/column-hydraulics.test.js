// The column's tray hydraulics (proposal 0015, Part I section 2, step 6, milestone M2b; src/units/columns/hydraulics.js
// and columnDiameter in src/sizing/sizing.js): the formulas against the independent reference
// (validation/python/reference_column_diameter.py -> validation/fixtures/hydraulics.json), the chart table against the values
// read off Fair's chart (validation/data/sizing/), the worked example of the open source (Fermeglia 2021, slides 45-47),
// the surface-tension rule against the chemicals library's example, and the rigorous column end to end: the diameter set
// by the largest required area where the tray with the lowest flooding velocity is another one, FLOODING, WEEPING, a
// given diameter checked, through the request path.
// Method (docs/METHOD_SELECTION.md): ethanol + water with NRTL and an ideal-gas vapour at 101.3 kPa, W7's case B1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "../src/api/dispatcher.js";
import { system } from "../src/index.js";
import { runUnit } from "../src/units/units.js";
import { stream } from "../src/stream/stream.js";
import { FAIR_CHART, kFlood, trayHydraulics, HYDRAULICS_DEFAULTS } from "../src/units/columns/hydraulics.js";
import { columnDiameter } from "../src/sizing/sizing.js";

const ref = JSON.parse(readFileSync(new URL("../validation/fixtures/hydraulics.json", import.meta.url)));
const chart = JSON.parse(readFileSync(new URL("../validation/data/sizing/fair_chart_fermeglia2021.json", import.meta.url)));
const B1 = JSON.parse(readFileSync(new URL("../validation/data/columns/B1-ethanol-water-nrtl.json", import.meta.url)));
const close = (a, b, rel, what) => assert.ok(Math.abs(a / b - 1) <= rel, `${what}: ${a} vs ${b} (${((a / b - 1) * 100).toFixed(3)} %)`);
const FT = 0.3048, LB_FT3 = 0.45359237 / FT ** 3, KMOL_H = 1000 / 3600;

test("Fair's chart in the engine is the table read off the graph (validation/data/sizing), and the chart's own nodes come back", () => {
  assert.deepEqual(FAIR_CHART.F, chart.F);
  assert.deepEqual(FAIR_CHART.H_m, chart.H_m);
  assert.deepEqual(FAIR_CHART.K_m_s, chart.K_m_s);
  chart.H_m.forEach((H, i) => chart.F.forEach((F, j) => close(kFlood(F, H), chart.K_m_s[i][j], 1e-12, `K(${F}, ${H})`)));
  // the curves fall with F and rise with H, as on the chart
  for (const row of chart.K_m_s) for (let j = 1; j < row.length; j++) assert.ok(row[j] <= row[j - 1]);
  for (let i = 1; i < chart.H_m.length; i++) chart.F.forEach((_, j) => assert.ok(chart.K_m_s[i][j] > chart.K_m_s[i - 1][j]));
  // outside the chart: refused, never extrapolated
  for (const [F, H] of [[0.009, 0.6], [1.9, 0.6], [0.1, 0.14], [0.1, 0.95]]) assert.throws(() => kFlood(F, H), e => e.code === "OUT_OF_RANGE");
});

test("the hydraulics agree with the independent Python reference (1e-9)", () => {
  for (const [id, c] of Object.entries(ref.cases)) {
    const r = trayHydraulics(c.trays, c.options), e = c.result;
    close(r.dimensions.D_m, e.D_m, 1e-9, `${id} D`);
    assert.equal(r.basis.governing_stage, e.governing_stage, `${id} governing stage`);
    assert.equal(r.basis.lowest_flooding_velocity_stage, e.lowest_flooding_velocity_stage, `${id} slowest stage`);
    e.stages.forEach((s, k) => {
      const g = r.stages[k];
      close(g.flowParameter, s.F, 1e-9, `${id} stage ${s.stage} F`);
      close(g.u_flood_m_s, s.u_flood_m_s, 1e-9, `${id} stage ${s.stage} u_fl`);
      close(g.area_required_m2, s.area_required_m2, 1e-9, `${id} stage ${s.stage} area`);
      close(g.fraction_of_flooding, s.fraction_of_flooding, 1e-9, `${id} stage ${s.stage} fraction`);
    });
    const codes = r.warnings.map(w => w.code);
    assert.equal(codes.includes("FLOODING"), e.flooding_stages.length > 0, `${id} FLOODING`);
    assert.equal(codes.includes("WEEPING"), e.weeping_stages.length > 0, `${id} WEEPING`);
  }
});

test("the diameter comes from the largest required area, not from the tray with the lowest flooding velocity", () => {
  const c = ref.cases["slowest-does-not-set"], r = trayHydraulics(c.trays, c.options);
  const [s2, s3] = r.stages;
  assert.ok(s2.u_flood_m_s < s3.u_flood_m_s, "stage 2 floods first per unit of velocity");
  assert.ok(s3.area_required_m2 > s2.area_required_m2, "stage 3 carries more vapour");
  assert.equal(r.basis.governing_stage, 3);
  close(r.dimensions.D_m, Math.sqrt(4 * s3.area_required_m2 / Math.PI), 1e-12, "D from stage 3");
  // sized on stage 2 alone, the column would run stage 3 above the design fraction
  const D2 = Math.sqrt(4 * s2.area_required_m2 / Math.PI);
  const onD2 = trayHydraulics(c.trays, { diameter_m: D2 });
  assert.ok(onD2.stages[1].fraction_of_flooding > HYDRAULICS_DEFAULTS.design_fraction);
  assert.deepEqual(onD2.warnings.map(w => w.code).filter(k => k === "FLOODING"), ["FLOODING"]);
  close(r.stages[1].fraction_of_flooding, HYDRAULICS_DEFAULTS.design_fraction, 1e-12, "the governing stage at the design fraction");
  assert.match(r.notes[0], /stage 2 has the lowest flooding velocity/);
});

test("Fermeglia (2021) slides 45-47: n-hexane at 342 K, 24 in trays, 75 % of flooding, η = 0.90: D = 11.03 ft with the slide's C_sb", () => {
  const c = ref.cases["trieste-example"], r = trayHydraulics(c.trays, c.options), s = r.stages[0];
  // slide 46: the flow parameter, printed 0.0546
  assert.equal(+s.flowParameter.toFixed(4), 0.0546);
  // slide 46 reads C_sb = 0.36 ft/s off its own drawing of Fair's chart (24 in); the chart of slide 37, read here,
  // gives 0.332 ft/s at 0.61 m: the two drawings differ by 8 % at this point
  const Kchart = kFlood(s.flowParameter, 0.6096) / FT;
  close(Kchart, 0.36, 0.09, "C_sb against slide 46");
  // with the slide's own K = 0.36 (13.2/20)^0.2 = 0.331 ft/s: u_flood = 4.836 ft/s (slide 47) and, as D ∝ u^-1/2,
  // D = 11.03 ft (slide 47); CHEPTA's own D, 11.49 ft, is 4.1 % larger, from the lower K of slide 37's chart
  close(0.36 * (13.2 / 20) ** 0.2, 0.331, 2e-3, "K (slide 46)");
  const uSlide = 0.331 * Math.sqrt((41.12 - 0.1917) / 0.1917);
  close(uSlide, 4.836, 1e-3, "u_flood (slide 47)");
  close(s.u_flood_m_s / FT * (0.331 / (Kchart * (13.2 / 20) ** 0.2)), 4.836, 1e-3, "u_flood with the slide's K");
  close(r.dimensions.D_m / FT * Math.sqrt(s.u_flood_m_s / FT / uSlide), 11.03, 2e-3, "D with the slide's K (slide 47)");
  close(r.dimensions.D_m / FT, 11.03, 0.05, "D with CHEPTA's chart");
  assert.equal(c.trays[0].rhoV, 0.1917 * LB_FT3);
});

test("the liquid's surface tension: Winterfeld, Scriven and Davis, the chemicals library's own example", () => {
  // chemicals.interface.Winterfeld_Scriven_Davis([0.1606, 0.8394], [0.01547, 0.02877], [8610., 15530.]) = 0.02496738845043982
  const { input, sigma_N_m } = ref.surface_tension;
  assert.equal(+sigma_N_m.toPrecision(12), +0.02496738845043982.toPrecision(12));
  const phi = input.xs.map((x, i) => x / input.rhoms[i]), v = phi.reduce((a, b) => a + b, 0);
  const s = phi.reduce((a, p, i) => a + p / v * Math.sqrt(input.sigmas[i]), 0) ** 2;
  close(s, sigma_N_m, 1e-12, "σ by the volume-fraction form used in the engine");
});

test("the options: defaults, refusals, and the corrections K2, K3, K4", () => {
  const t = [{ stage: 2, WL_kg_s: 3, WV_kg_s: 3, rhoL: 800, rhoV: 3, sigma_N_m: 0.02 }];
  const r = trayHydraulics(t, {});
  assert.deepEqual([r.basis.K2, r.basis.K3, r.basis.K4, r.basis.design_fraction, r.basis.net_area_fraction, r.basis.turndown], [1, 1, 1, 0.8, 0.9, 2]);
  const k = trayHydraulics(t, { hole_area_ratio: 0.08, hole_diameter_mm: 8, foaming_factor: 0.9 });
  close(k.basis.K2, 0.8 ** 0.44, 1e-12, "K2");
  assert.equal(k.basis.K3, 0.9);
  close(k.stages[0].u_flood_m_s, r.stages[0].u_flood_m_s * 0.8 ** 0.44 * 0.9 * 0.9, 1e-12, "u_fl with K2 K3 K4");
  close(r.dimensions.downcomerArea_m2 / r.dimensions.area_m2, 0.1, 1e-12, "downcomer share 1 − η");
  for (const bad of [{ design_fraction: 1.2 }, { tray: "packed" }, { tray_spacing_m: -1 }, { unknown: 1 }, { foaming_factor: 1.5 }]) {
    assert.throws(() => trayHydraulics(t, bad), e => e.code === "BAD_INPUT", JSON.stringify(bad));
  }
  assert.throws(() => trayHydraulics([{ ...t[0], WL_kg_s: 0 }], {}), e => e.code === "BAD_INPUT");
  assert.throws(() => trayHydraulics(t, { tray_spacing_m: 1.2 }), e => e.code === "OUT_OF_RANGE" && /stage 2/.test(e.message));
});

/** W7's case B1 (ethanol + water, NRTL, 20 stages) through solve_column, with the column's sizing. */
const solveB1 = (sizing, T_K = B1.column.feed.T_K) => {
  const f = B1.column.feed;
  return run({ capability: "solve_column", input: { components: B1.components, thermo: { model: "NRTL", vapour: "ideal" },
    feed: { flow_kmol_h: Object.fromEntries(B1.components.map((id, i) => [id, f.z[i] * f.flow_mol_s / KMOL_H])), T_K, P_kPa: B1.pressure_kPa },
    column: { mode: "rigorous", stages: B1.column.stages, feed_stage: f.stage, condenser: B1.column.condenser, reflux_ratio: B1.specs[0].value,
      bottoms_kmol_h: B1.specs[1].value / KMOL_H, sizing } } });
};

test("rigorous column end to end: a cold feed loads the stripping section, whose stage sets the diameter, not the slowest", () => {
  const r = solveB1({}, 300), col = r.value.column, z = col.sizing;
  assert.equal(r.outcome, "ok");
  assert.equal(z.stages.length, B1.column.stages - 2, "every tray between the condenser and the reboiler");
  assert.equal(z.basis.mode, "sized");
  const gov = z.stages.find(s => s.stage === z.basis.governing_stage), slow = z.stages.find(s => s.stage === z.basis.lowest_flooding_velocity_stage);
  assert.ok(gov.stage > B1.column.feed.stage && slow.stage < B1.column.feed.stage, `governing ${gov.stage}, slowest ${slow.stage}`);
  close(z.dimensions.D_m, Math.sqrt(4 * Math.max(...z.stages.map(s => s.area_required_m2)) / Math.PI), 1e-12, "D from the largest area");
  assert.ok(z.dimensions.D_m > Math.sqrt(4 * slow.area_required_m2 / Math.PI) * 1.03, "the slowest stage alone gives a smaller column");
  // every tray's fraction of flooding reported, none above the design fraction
  for (const s of z.stages) assert.ok(s.fraction_of_flooding > 0 && s.fraction_of_flooding <= 0.8 + 1e-12);
  assert.ok(!col.warnings.some(w => w.code === "FLOODING"));
  // the properties at stage conditions: the vapour lighter than the liquid, σ between ethanol's and water's
  for (const s of z.stages) assert.ok(s.rhoV_kg_m3 > 0.5 && s.rhoV_kg_m3 < 1.5 && s.rhoL_kg_m3 > 700 && s.rhoL_kg_m3 < 1000 && s.sigma_N_m > 0.015 && s.sigma_N_m < 0.065);
});

test("rigorous column: a given diameter is checked; too small floods (FLOODING), too large weeps (WEEPING)", () => {
  const sized = solveB1({}).value.column.sizing, D = sized.dimensions.D_m;
  const small = solveB1({ diameter_m: 0.8 * D }).value.column, large = solveB1({ diameter_m: 1.6 * D }).value.column;
  assert.equal(small.sizing.basis.mode, "checked");
  close(small.sizing.basis.max_fraction_of_flooding, sized.basis.max_fraction_of_flooding / 0.64, 1e-9, "fraction ∝ 1/D²");
  const fl = small.warnings.find(w => w.code === "FLOODING");
  assert.ok(fl && fl.stage >= 2 && /flood/.test(fl.message) && fl.remedy, JSON.stringify(small.warnings));
  const we = large.warnings.find(w => w.code === "WEEPING");
  assert.ok(we && /turndown of sieve trays/.test(we.message), JSON.stringify(large.warnings));
  // valve trays turn down to 1/4: the same column no longer weeps
  assert.ok(!solveB1({ diameter_m: 1.6 * D, tray: "valve" }).value.column.warnings.some(w => w.code === "WEEPING"));
});

test("columnDiameter on a rigorous column's result gives the block's own sizing; the shortcut and other blocks are refused", () => {
  const f = B1.column.feed, sys = system({ components: B1.components, model: "NRTL", vapour: "ideal" });
  const feed = stream(sys, { flow_kmol_h: f.z.map(z => z * f.flow_mol_s / KMOL_H), T_K: f.T_K, P_kPa: B1.pressure_kPa });
  const spec = { mode: "rigorous", stages: B1.column.stages, feed_stage: f.stage, reflux_ratio: 2, bottoms_kmol_h: B1.specs[1].value / KMOL_H };
  const withSizing = runUnit("column", { sys, inlets: { in: [feed] }, spec: { ...spec, sizing: { tray_spacing_m: 0.45 } } });
  const plain = runUnit("column", { sys, inlets: { in: [feed] }, spec });
  assert.equal(plain.sizing, undefined);
  const d = columnDiameter({ ...plain, type: "column" }, { sys, tray_spacing_m: 0.45 });
  close(d.dimensions.D_m, withSizing.sizing.dimensions.D_m, 1e-12, "same diameter");
  assert.deepEqual(d.source, ["fermeglia-staged-2021", "chemicals-surface-tension-mixture"]);
  assert.throws(() => columnDiameter(plain, {}), e => e.code === "BAD_INPUT" && /options.sys/.test(e.message));
  assert.throws(() => columnDiameter({ ...plain, state: { mode: "shortcut" } }, { sys }), e => e.code === "BAD_INPUT" && /shortcut/.test(e.message));
  assert.throws(() => columnDiameter({ ...plain, type: "flash" }, { sys }), e => e.code === "BAD_INPUT");
  // the shortcut column keeps a sizing key and says it is not used
  const sc = runUnit("column", { sys, inlets: { in: [feed] }, spec: { light_key: "ethanol", heavy_key: "water", recovery_light_key_in_distillate: 0.6,
    recovery_heavy_key_in_bottoms: 0.9, reflux_over_minimum: 1.3, sizing: {} } });
  assert.ok(sc.notes.some(n => /rigorous mode/.test(n)) && sc.sizing === undefined);
});

// ---- W7's hydraulics cases (validation/data/columns/hydraulics/, docs/decisions/2026-10-30-01-m2b-cases.md) ----
const hcase = id => JSON.parse(readFileSync(new URL(`../validation/data/columns/hydraulics/${id}.json`, import.meta.url)));
const hfix = JSON.parse(readFileSync(new URL("../validation/fixtures/column_hydraulics.json", import.meta.url)));

test("W7's case H1 (Fermeglia 2021, slides 45-47): with the slide's C_sb, u_flood = 4.836 ft/s and D = 11.03 ft; CHEPTA's chart stated", () => {
  const c = hcase("H1-fermeglia-hexane-heptane"), g = c.given, p = c.published, tol = c.tolerances.printed_rounding_relative;
  // the case's inputs, converted to SI by definition (1 lb, 1 ft, 1 lbmol/h); ρV by the slide's ideal gas
  const rhoV = g.P_atm * g.MW_V / (g.R_atm_ft3_per_K_lbmol * g.T_K) * LB_FT3, rhoL = g.liquid_specific_gravity_at_20C * g.water_density_lb_ft3 * LB_FT3;
  const WV = g.D_lbmol_h / (1 - g.L_over_V) * 0.45359237 / 3600 * g.MW_V;
  const trays = [{ stage: 2, WL_kg_s: g.L_over_V * WV, WV_kg_s: WV, rhoL, rhoV, sigma_N_m: g.sigma_dyn_cm / 1000 }];
  const opts = { design_fraction: g.fraction_of_flooding, net_area_fraction: g.eta_net_over_total_area, tray_spacing_m: g.tray_spacing_in * 0.0254 };
  const r = trayHydraulics(trays, { ...opts, K_chart_m_s: g.C_sb_ft_s * FT }), s = r.stages[0];
  close(s.flowParameter, p.F_lv, tol, "F_lv");
  close(s.K_chart_m_s * s.K1 / FT, p.K_ft_s, tol, "K");
  close(s.u_flood_m_s / FT, p.u_flood_ft_s, tol, "u_flood");
  close(r.dimensions.D_m / FT, p.diameter_ft, tol, "diameter");
  close(r.dimensions.D_m / FT, hfix.cases[c.id].computed.diameter_ft, 1e-9, "W7's reference");
  assert.ok(r.notes.some(n => /given/.test(n)) && r.basis.chart === "K_n,fl given");
  // with CHEPTA's own reading of slide 37's chart: C_sb 0.332 ft/s against the slide's 0.36 (another drawing of the
  // chart, 8 % apart), D = 11.49 ft, 4.1 % larger
  const own = trayHydraulics(trays, opts);
  close(own.stages[0].K_chart_m_s / FT, 0.332, 0.005, "CHEPTA's C_sb");
  close(own.dimensions.D_m / FT, 11.49, 0.002, "CHEPTA's diameter");
});

test("W7's case H2: stage 15, with the largest required area, sets the diameter; stage 2 has the lowest flooding velocity", () => {
  const c = hcase("H2-largest-area-not-slowest-stage"), ref = hfix.cases[c.id];
  // each stage's mass flows from its volume flow and the case's flow parameter, F_lv = (W_L/W_V)(ρV/ρL)^0.5
  const trays = c.stages.map(s => ({ stage: s.stage, WV_kg_s: s.Vdot_m3_s * s.rho_V_kg_m3, WL_kg_s: s.Vdot_m3_s * s.rho_V_kg_m3 * s.F_lv * Math.sqrt(s.rho_L_kg_m3 / s.rho_V_kg_m3),
    rhoL: s.rho_L_kg_m3, rhoV: s.rho_V_kg_m3, sigma_N_m: s.sigma_mN_m / 1000 }));
  const r = trayHydraulics(trays, { design_fraction: c.design.fraction_of_flooding, tray_spacing_m: c.design.tray_spacing_m });
  assert.equal(r.basis.lowest_flooding_velocity_stage, ref.lowest_flooding_velocity_stage);
  assert.equal(r.basis.governing_stage, ref.largest_area_stage);
  const A = Object.fromEntries(r.stages.map(s => [s.stage, s.area_required_m2]));
  close(Math.sqrt(A[ref.largest_area_stage] / A[ref.lowest_flooding_velocity_stage]), ref.diameter_ratio_largest_over_slowest_stage, 1e-9, "D ratio");
  ref.stages.forEach((e, k) => close(r.stages[k].fraction_of_flooding, e.fraction_of_flooding_at_diameter, 1e-9, `stage ${e.stage} fraction`));
  assert.ok(r.stages.every(s => s.K_chart_m_s === r.stages[0].K_chart_m_s), "the same C_sb on every stage");
  assert.match(r.notes[0], /set by stage 15/);
});
