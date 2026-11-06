// Solids in equilibrium in every stream (proposal 0015, Part I, section 5; src/equilibrium/solid-flash.js) and measured
// solubility curves (src/thermo/solubility-curve.js): terephthalic acid recrystallized from hot water, against the
// independent reference (validation/python/reference_solid_flash.py, validation/fixtures/solid_flash.json) and the
// measured solubilities of Takebayashi et al. 2012 (NIST TRC ThermoML Archive, validation/data/sle/terephthalic-acid.json).
// Method (docs/METHOD_SELECTION.md): water and a nonvolatile acid, a polar liquid; no fitted pairs exist, so Modified
// UNIFAC 2.0 (predicted) in the example. The reference cases use the ideal solution on purpose: the reference writes it
// independently, and TPA's solubility comes from its measured curve either way (the activity model sets only the vapour).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, stream, runUnit, runFlowsheet } from "../src/index.js";
import { curveSolubility, curveSolutionEnthalpy } from "../src/thermo/solubility-curve.js";
import { normalizeFlowsheet } from "../src/flowsheet/document.js";
import { readProject, projectOf, stateFromProject } from "../src/ui/project.js";
import { initialState } from "../src/ui/app-logic.js";

const ref = JSON.parse(readFileSync(new URL("../validation/fixtures/solid_flash.json", import.meta.url)));
const measured = JSON.parse(readFileSync(new URL("../validation/data/sle/terephthalic-acid.json", import.meta.url)));
const components = JSON.parse(readFileSync(new URL("../src/data/components.json", import.meta.url))).components;
const CURVE = components["terephthalic-acid"].solubility.find(c => c.solvent === "water");
const TAKE = measured.sets.find(s => s.doi === "10.1021/je300263z").rows;
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
const solidOf = s => s.phases.filter(p => p.type === "solid").reduce((a, p) => a + p.fraction * s.F_kmol_h, 0);
const vapourOf = s => s.phases.filter(p => p.type === "vapour").reduce((a, p) => a + p.fraction * s.F_kmol_h, 0);

/** The example: a 20 % TPA slurry pumped to 8 MPa, heated until it dissolves, three letdown drums, a crystallizer. */
export const tpaFlowsheet = model => ({ components: ["water", "terephthalic-acid"], thermo: { model, solids: ["terephthalic-acid"] },
  blocks: [{ id: "F1", type: "feed", spec: { flow_kg_h: { water: 800, "terephthalic-acid": 200 }, T_K: 360, P_kPa: 101.325 } },
    { id: "PU1", type: "pump", spec: { P_kPa: 8000 } },
    { id: "E1", type: "heater", spec: { T_K: 547 } },
    { id: "D1", type: "flash", spec: { P_kPa: 4000, duty_kW: 0 } }, { id: "D2", type: "flash", spec: { P_kPa: 2000, duty_kW: 0 } },
    { id: "D3", type: "flash", spec: { P_kPa: 800, duty_kW: 0 } },
    { id: "CR1", type: "crystallizer", spec: { solute: "terephthalic-acid", T_K: 373.15 } },
    ...["P1", "P2", "P3", "P4", "P5"].map(id => ({ id, type: "product" }))],
  streams: [{ id: "S0", from: "F1.out", to: "PU1.in" }, { id: "S1", from: "PU1.out", to: "E1.in" }, { id: "S2", from: "E1.out", to: "D1.in" }, { id: "V1", from: "D1.vapour", to: "P1.in" },
    { id: "L1", from: "D1.liquid", to: "D2.in" }, { id: "V2", from: "D2.vapour", to: "P2.in" }, { id: "L2", from: "D2.liquid", to: "D3.in" },
    { id: "V3", from: "D3.vapour", to: "P3.in" }, { id: "L3", from: "D3.liquid", to: "CR1.in" },
    { id: "CRYSTALS", from: "CR1.crystals", to: "P4.in" }, { id: "LIQUOR", from: "CR1.liquor", to: "P5.in" }] });

test("the solubility curve of terephthalic acid in water follows the measured values it was fitted to, and only inside them", () => {
  assert.equal(CURVE.equation, "apelblat");
  for (const r of TAKE) assert.ok(rel(curveSolubility(CURVE, r.T_K), r.x_solute) < 0.05, `${r.T_K} K: ${curveSolubility(CURVE, r.T_K)} vs ${r.x_solute}`);
  assert.match(CURVE.source, /largest deviation 4\.8 %/);
  assert.throws(() => curveSolubility(CURVE, 340, "Terephthalic acid"), e => e.code === "OUT_OF_RANGE" && /348\.8-547\.4 K/.test(e.message));
  assert.throws(() => curveSolubility(CURVE, 560), e => e.code === "OUT_OF_RANGE");
  // the apparent enthalpy of solution from the slope: positive (the solubility rises with T), tens of kJ/mol
  for (const T of [360, 450, 540]) { const h = curveSolutionEnthalpy(CURVE, T); assert.ok(h > 2e4 && h < 1.5e5, `${T} K: ${h}`); }
  // the set left out, and why
  assert.equal(CURVE.left_out[0].doi, "10.1016/j.fluid.2012.11.023");
  assert.match(CURVE.left_out[0].reason, /held for the maintainer's decision/);
  // the engine takes the curve in water, and refuses a solvent it has no curve for (TPA has no open melting data)
  const sys = system({ components: ["water", "terephthalic-acid"], model: "MOD-UNIFAC-2" });
  const r = sys.solidSolubility("terephthalic-acid", 500);
  assert.equal(r.route, "curve");
  assert.ok(rel(r.xSolute, curveSolubility(CURVE, 500)) < 1e-12);
  const eth = system({ components: ["ethanol", "terephthalic-acid"], model: "MOD-UNIFAC-2" });
  // (since 2026-11-05 TPA also has curves in acetic acid, cyclohexanone and THF: the message lists them all)
  assert.throws(() => eth.solidSolubility("terephthalic-acid", 400), e => e.code === "MISSING_DATA" && /known in water, .* only/i.test(e.message));
});

test("the TPA recrystallization chain agrees with the independent reference: every state's T, vapour, solid, the duties, the yield", () => {
  const r = runFlowsheet(tpaFlowsheet("ideal"));
  const S = r.streams;
  const st = Object.fromEntries(ref.states.map(s => [s.name, s]));
  const pairs = [["S0", "feed"], ["S1", "pumped"], ["S2", "heated"], ["L1", "drum at 4 MPa"], ["L2", "drum at 2 MPa"], ["L3", "drum at 0.8 MPa"]];
  for (const [sid, name] of pairs) {
    const s = S[sid], e = st[name];
    assert.ok(Math.abs(s.T_K - e.T_K) < 1e-5, `${name}: T ${s.T_K} vs ${e.T_K}`);
    assert.ok(Math.abs(solidOf(s) - e.solid_kmol_h) < 1e-7 * Math.max(1, e.solid_kmol_h), `${name}: solid ${solidOf(s)} vs ${e.solid_kmol_h}`);
  }
  for (const [vid, name] of [["V1", "drum at 4 MPa"], ["V2", "drum at 2 MPa"], ["V3", "drum at 0.8 MPa"]]) {
    assert.ok(rel(S[vid].F_kmol_h, st[name].vapour_kmol_h) < 1e-7, `${name}: vapour ${S[vid].F_kmol_h} vs ${st[name].vapour_kmol_h}`);
  }
  assert.ok(rel(r.blocks.E1.duty_kW, st.heated.duty_kW) < 1e-7, `heater ${r.blocks.E1.duty_kW} vs ${st.heated.duty_kW}`);
  // the pump takes the slurry: its power from the liquid's volume only (the solid rides along, as in DWSIM's pump; the
  // dilute dissolved TPA, without a liquid density, left out), with both warnings (the maintainer, 2026-11-06)
  assert.ok(rel(r.blocks.PU1.duty_kW, st.pumped.power_kW) < 1e-9, `pump ${r.blocks.PU1.duty_kW} vs ${st.pumped.power_kW}`);
  assert.ok(rel(r.blocks.PU1.state.volume_m3_h, st.pumped.volume_m3_h) < 1e-9);
  assert.deepEqual(r.blocks.PU1.warnings.map(w => w.code), ["SLURRY", "DENSITY_MISSING"]);
  assert.match(r.blocks.PU1.warnings[0].message, /liquid's density .* ignores the slurry's rheology/);
  const cr = st["crystallizer at 373.15 K"];
  assert.ok(rel(r.blocks.CR1.duty_kW, cr.duty_kW) < 1e-6, `crystallizer ${r.blocks.CR1.duty_kW} vs ${cr.duty_kW}`);
  assert.ok(Math.abs(r.blocks.CR1.state.yield - ref.yield) < 1e-8);
  assert.ok(Math.abs(r.balance.energy_kW) < 1e-6 && Object.values(r.balance.material_kmol_h).every(v => Math.abs(v) < 1e-9), JSON.stringify(r.balance));
  for (const b of Object.values(r.blocks)) if (b.balance) assert.ok(Math.abs(b.balance.energy_kW) < 1e-6 && (b.balance.material ?? 0) < 1e-9);
});

test("the example (Modified UNIFAC 2.0): each drum's liquid is saturated at the measured solubility, the balances close", () => {
  const r = runFlowsheet(tpaFlowsheet("MOD-UNIFAC-2"));
  const S = r.streams;
  assert.equal(solidOf(S.S2), 0, "all dissolved at 547 K under 8 MPa");
  assert.ok(solidOf(S.S0) > 0.99 * S.S0.flow_kmol_h["terephthalic-acid"] && solidOf(S.S1) > 0.99 * S.S1.flow_kmol_h["terephthalic-acid"], "the cold slurry, pumped: nearly all solid");
  // the measured solubility near each drum's temperature: interpolated in ln x against 1/T between Takebayashi's points
  const pts = TAKE.map(p => [p.T_K, p.x_solute]).sort((a, b) => a[0] - b[0]);
  const meas = T => { const k = pts.findIndex((p, j) => j + 1 < pts.length && p[0] <= T && pts[j + 1][0] >= T); const [a, b] = [pts[k], pts[k + 1]];
    return Math.exp(Math.log(a[1]) + (Math.log(b[1]) - Math.log(a[1])) * (1 / T - 1 / a[0]) / (1 / b[0] - 1 / a[0])); };
  for (const sid of ["L1", "L2", "L3"]) {
    const s = S[sid], L = s.phases.find(p => p.type === "liquid");
    assert.ok(solidOf(s) > 0, `${sid}: crystals form in the letdown`);
    assert.ok(rel(L.composition[1], meas(s.T_K)) < 0.06, `${sid} at ${s.T_K} K: liquid x ${L.composition[1]} vs measured ${meas(s.T_K)}`);
  }
  assert.ok(solidOf(S.L1) < solidOf(S.L2) && solidOf(S.L2) < solidOf(S.L3), "more crystals at each lower pressure");
  assert.ok(r.blocks.CR1.state.yield > 0.99 && S.CRYSTALS.phases[0].type === "solid");
  assert.ok(Math.abs(r.balance.energy_kW) < 1e-6 && Object.values(r.balance.material_kmol_h).every(v => Math.abs(v) < 1e-9));
});

test("every block dissolves or crystallizes the solid: water added, heating, a letdown; a compressor refuses", () => {
  const sys = system({ components: ["water", "terephthalic-acid"], model: "MOD-UNIFAC-2", solids: ["terephthalic-acid"] });
  const slurry = stream(sys, { flow_kg_h: { water: 100, "terephthalic-acid": 5 }, T_K: 500, P_kPa: 8000 });
  assert.ok(solidOf(slurry) > 0);
  // water added at the same temperature: the solid dissolves
  const water = stream(sys, { flow_kg_h: { water: 400 }, T_K: 500, P_kPa: 8000 });
  const m = runUnit("mixer", { sys, inlets: { in: [slurry, water] }, spec: {} });
  assert.equal(solidOf(m.outlets.out), 0);
  assert.ok(Math.abs(m.balance.energy_kW) < 1e-9);
  // heated: it dissolves; cooled: it crystallizes again
  const hot = runUnit("heater", { sys, inlets: { in: slurry }, spec: { T_K: 540 } });
  assert.equal(solidOf(hot.outlets.out), 0);
  const cold = runUnit("heater", { sys, inlets: { in: hot.outlets.out }, spec: { T_K: 450 } });
  assert.ok(solidOf(cold.outlets.out) > solidOf(slurry));
  // a pressure letdown: the liquid boils, cools and concentrates, and crystals form
  const v = runUnit("valve", { sys, inlets: { in: hot.outlets.out }, spec: { P_kPa: 1000 } });
  assert.ok(solidOf(v.outlets.out) > 0 && vapourOf(v.outlets.out) > 0);
  assert.ok(Math.abs(v.balance.energy_kW) < 1e-9);
  // the solid's enthalpy rule is named
  assert.ok(cold.outlets.out.phases.find(p => p.type === "solid").equilibrium);
  assert.throws(() => runUnit("compressor", { sys, inlets: { in: slurry }, spec: { P_kPa: 9000 } }), /solid|liquid/i);
  // without solids, a heater refuses the crystals of a crystallizer as before
  const plain = system({ components: ["water", "terephthalic-acid"], model: "MOD-UNIFAC-2" });
  const f = stream(plain, { flow_kg_h: { water: 100, "terephthalic-acid": 5 }, T_K: 500, P_kPa: 5000 });
  const cr = runUnit("crystallizer", { sys: plain, inlets: { in: f }, spec: { solute: "terephthalic-acid", T_K: 400 }, outletCount: 2 });
  assert.throws(() => runUnit("heater", { sys: plain, inlets: { in: cr.outlets.crystals }, spec: { T_K: 450 } }), e => e.code === "NOT_AVAILABLE");
});

test("a solubility curve of one's own (My data): points, tier user, inside its temperatures only", () => {
  // Takebayashi's own measured points as the person's table (the same numbers, entered as user data)
  const points = TAKE.filter((_, k) => k % 2 === 0).map(r => [r.T_K, r.x_solute]);
  const userData = { properties: { "terephthalic-acid": { solubility: [{ solvent: "water", points, source: { name: "Takebayashi et al. 2012, Table 1" } }] } } };
  const sys = system({ components: ["water", "terephthalic-acid"], model: "MOD-UNIFAC-2", userData });
  const r = sys.solidSolubility("terephthalic-acid", points[2][0]);
  assert.equal(r.curve.tier, "user");
  assert.ok(rel(r.xSolute, points[2][1]) < 1e-12, "a measured point is reproduced");
  assert.throws(() => sys.solidSolubility("terephthalic-acid", points.at(-1)[0] + 1), e => e.code === "OUT_OF_RANGE" && /your own curve/.test(e.message));
  assert.throws(() => system({ components: ["water", "terephthalic-acid"], model: "ideal",
    userData: { properties: { "terephthalic-acid": { solubility: [{ solvent: "water", points: [[400, 0.001]], source: "x" }] } } } }), /at least two points/);
  assert.throws(() => system({ components: ["water", "terephthalic-acid"], model: "ideal",
    userData: { properties: { "terephthalic-acid": { solubility: [{ solvent: "water", points }] } } } }), /needs a source/);
});

test("the flowsheet's solids: normalized, refused where they cannot work, saved and reopened in format 6", () => {
  const fs = tpaFlowsheet("MOD-UNIFAC-2");
  assert.deepEqual(normalizeFlowsheet(fs).thermo.solids, ["terephthalic-acid"]);
  assert.throws(() => normalizeFlowsheet({ ...fs, thermo: { model: "NRTL", solids: "terephthalic-acid" } }), /must be a list/);
  assert.throws(() => system({ components: ["water", "terephthalic-acid"], model: "PR", solids: ["terephthalic-acid"] }), e => e.code === "NOT_AVAILABLE" || e.code === "BAD_INPUT");
  // a solid with neither a curve nor melting data is refused (fumaric acid served here until it had curves, 2026-11-05);
  // itaconic acid has curves in seven solvents but none in water, so its solubility in water is not known
  assert.throws(() => system({ components: ["water", "glucaric-acid"], model: "MOD-UNIFAC-2", solids: ["glucaric-acid"] }), e => e.code === "MISSING_DATA");
  assert.throws(() => system({ components: ["water", "itaconic-acid"], model: "MOD-UNIFAC-2", solids: ["itaconic-acid"] }).solidSolubility("itaconic-acid", 300), e => e.code === "MISSING_DATA");
  const doc = projectOf({ ...initialState({ components: [] }), flowsheet: fs }, { version: "9.9.9", now: new Date("2026-11-05T12:00:00Z") });
  assert.equal(doc.fugacity_project, 6);
  const back = stateFromProject(readProject(JSON.stringify(doc)));
  assert.deepEqual(back.flowsheet.thermo.solids, ["terephthalic-acid"]);
});

test("the Crystallizer takes its solute's solubility from the set fitted to solubilities, where the flowsheet chose another set", () => {
  // a pair set of one's own for water + succinic acid becomes the flowsheet's choice; its numbers here are the ideal
  // solution (b = 0) on purpose, to check the code path: the crystallizer still uses fitted-sle-thermoml
  const userData = { pairs: { "water+succinic-acid": { NRTL: { b_ij: 0, b_ji: 0, alpha: 0.3 }, source: { name: "code-path check (ideal)" } } } };
  const own = system({ components: ["water", "succinic-acid"], model: "NRTL", userData });
  const fitted = system({ components: ["water", "succinic-acid"], model: "NRTL" });
  const feed = stream(own, { flow_kg_h: { water: 800, "succinic-acid": 200 }, T_K: 343.15, P_kPa: 101.325 });
  const r = runUnit("crystallizer", { sys: own, inlets: { in: feed }, spec: { solute: "succinic-acid", T_K: 298.15 }, outletCount: 2 });
  assert.ok(rel(r.state.solubility_x, fitted.solidSolubility("succinic-acid", 298.15).xSolute) < 1e-12, `${r.state.solubility_x}`);
  assert.ok(Math.abs(r.state.solubility_x - own.solidSolubility("succinic-acid", 298.15).xSolute) > 1e-4, "not the flowsheet's own set");
});

test("a cooler or a flash drum, then the solid taken apart, gives exactly the Crystallizer's crystals, mother liquor and duty", () => {
  // the two routes must never drift apart (the coordinating session, 2026-11-05): the same feed and conditions through
  // the solid flash of every block, and through the Crystallizer's own balance. TPA (the measured curve) and succinic
  // acid (the melting-point equation with its fitted NRTL set) for cooling; TPA for the evaporative case, as a flash
  // drum at the Crystallizer's temperature and vapour fraction.
  const solidPart = s => s.phases.filter(p => p.type === "solid").reduce((a, p) => a + p.fraction * s.F_kmol_h, 0);
  const liquidPart = s => s.phases.filter(p => p.type === "liquid").map(p => p.composition.map(x => x * p.fraction * s.F_kmol_h))
    .reduce((a, v) => a.map((y, k) => y + v[k]), new Array(s.flows.length).fill(0));
  const cases = [
    { components: ["water", "terephthalic-acid"], model: "MOD-UNIFAC-2", solute: "terephthalic-acid", feed: { flow_kg_h: { water: 800, "terephthalic-acid": 20 }, T_K: 540, P_kPa: 8000 }, T_K: 400, P_kPa: 8000 },
    { components: ["water", "succinic-acid"], model: "NRTL", solute: "succinic-acid", feed: { flow_kg_h: { water: 800, "succinic-acid": 200 }, T_K: 343.15, P_kPa: 101.325 }, T_K: 288.15, P_kPa: 101.325 },
  ];
  for (const c of cases) {
    const sys = system({ components: c.components, model: c.model, solids: [c.solute] });
    const feed = stream(sys, c.feed);
    const cr = runUnit("crystallizer", { sys, inlets: { in: feed }, spec: { solute: c.solute, T_K: c.T_K, P_kPa: c.P_kPa }, outletCount: 2 });
    const cool = runUnit("heater", { sys, inlets: { in: feed }, spec: { T_K: c.T_K, P_kPa: c.P_kPa } }).outlets.out;
    const i = sys.ids.indexOf(c.solute);
    assert.ok(rel(solidPart(cool), cr.state.crystals_kmol_h) < 1e-8, `${c.solute}: crystals ${solidPart(cool)} vs ${cr.state.crystals_kmol_h}`);
    const ml = liquidPart(cool);
    cr.outlets.liquor.flows.forEach((v, k) => assert.ok(Math.abs(ml[k] - v) < 1e-9 * Math.max(1, v), `${c.solute}: mother liquor ${k}: ${ml[k]} vs ${v}`));
    assert.ok(Math.abs(cool.H_kW - (cr.outlets.crystals.H_kW + cr.outlets.liquor.H_kW)) < 1e-6, `${c.solute}: enthalpy ${cool.H_kW} vs ${cr.outlets.crystals.H_kW + cr.outlets.liquor.H_kW}`);
    assert.ok(Math.abs(cool.T_K - cr.state.T_K) < 1e-12 && i >= 0);
  }
  // evaporative: TPA at 450 K with 300 kg/h of steam taken off, against a flash drum at that T and vapour fraction
  // (this T-VF flash of water with a little of the nonvolatile acid needed the fix of 2026-11-05 in flash.js: no dew point)
  const sys = system({ components: ["water", "terephthalic-acid"], model: "MOD-UNIFAC-2", solids: ["terephthalic-acid"] });
  const feed = stream(sys, { flow_kg_h: { water: 800, "terephthalic-acid": 20 }, T_K: 540, P_kPa: 8000 });
  const cr = runUnit("crystallizer", { sys, inlets: { in: feed }, spec: { solute: "terephthalic-acid", T_K: 450, evaporated_kg_h: 300 }, outletCount: 3 });
  const VF = cr.outlets.vapour.F_kmol_h / feed.F_kmol_h;
  const d = runUnit("flash", { sys, inlets: { in: feed }, spec: { T_K: 450, VF } });
  assert.ok(rel(d.outlets.vapour.mass_kg_h, 300) < 1e-8, `vapour ${d.outlets.vapour.mass_kg_h} kg/h`);
  assert.ok(rel(d.state.P_kPa, cr.state.P_kPa) < 1e-8, `pressure ${d.state.P_kPa} vs ${cr.state.P_kPa}`);
  assert.ok(rel(solidPart(d.outlets.liquid), cr.state.crystals_kmol_h) < 1e-8, `crystals ${solidPart(d.outlets.liquid)} vs ${cr.state.crystals_kmol_h}`);
  assert.ok(Math.abs(d.duty_kW - cr.duty_kW) < 1e-6 * Math.max(1, Math.abs(cr.duty_kW)), `duty ${d.duty_kW} vs ${cr.duty_kW}`);
});

test("every automatic solubility curve follows the measured values it was fitted to, as its record states, and only in its range", () => {
  // validation/python/solubility_curves.py, docs/SOLUBILITY_CURVES.md: each record states its largest deviation over the
  // articles it was fitted to; the engine's curve must give the same number from the data files
  let n = 0;
  for (const [id, c] of Object.entries(components)) {
    for (const rec of c.solubility ?? []) {
      if (id === "terephthalic-acid" && rec.solvent === "water") continue;   // chosen by hand (the first test)
      const data = JSON.parse(readFileSync(new URL(`../validation/data/sle/${id}.json`, import.meta.url)));
      const dois = [...rec.source.matchAll(/doi:(10\.[^\s;,)]+)/g)].map(m => m[1].replace(/\.$/, ""));
      assert.ok(dois.length >= 1, `${id} in ${rec.solvent}: the articles are named`);
      let worst = 0;
      for (const s of data.sets.filter(s => s.solvent === rec.solvent && dois.includes(s.doi))) {
        for (const r of s.rows) worst = Math.max(worst, Math.abs(curveSolubility(rec, r.T_K) / r.x_solute - 1));
      }
      const stated = Number(rec.source.match(/Largest deviation ([\d.]+) %/)[1]) / 100;
      assert.ok(Math.abs(worst - stated) < 6e-4, `${id} in ${rec.solvent}: largest deviation ${worst} vs the record's ${stated}`);
      assert.throws(() => curveSolubility(rec, rec.Tmax_K + 1), e => e.code === "OUT_OF_RANGE");
      n++;
    }
  }
  assert.ok(n >= 20, `${n} automatic curves`);
});

test("the pump: a dissolved component without a liquid density is left out only while dilute (1 % in the liquid)", () => {
  // the maintainer, 2026-11-06: the power from the liquid only, a dilute component without a density left out, stated
  const sys = system({ components: ["water", "terephthalic-acid"], model: "MOD-UNIFAC-2", solids: ["terephthalic-acid"] });
  const hot = stream(sys, { flow_kg_h: { water: 800, "terephthalic-acid": 200 }, T_K: 547, P_kPa: 8000 });   // all dissolved, x 0.026
  assert.ok(!hot.phases.some(p => p.type === "solid"));
  assert.throws(() => runUnit("pump", { sys, inlets: { in: hot }, spec: { P_kPa: 9000 } }), e => /liquid density of Terephthalic acid/.test(e.message));
  const water = stream(sys, { flow_kg_h: { water: 800 }, T_K: 360, P_kPa: 101.325 });
  const r = runUnit("pump", { sys, inlets: { in: water }, spec: { P_kPa: 8000 } });
  assert.equal(r.warnings, undefined, "no warning without a solid or a missing density");
});
