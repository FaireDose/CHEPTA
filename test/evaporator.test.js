// The Evaporator block (proposal 0015, M3, step 10; src/units/evaporator.js): against the independent reference
// (validation/python/reference_evaporator.py, validation/fixtures/evaporator.json), the open worked example of
// M. Subramanian, Heat Transfer: Evaporation (SSN College of Engineering, 2019; free to read), Example 1, the same
// chain of flash drums and condensers placed as blocks in a flowsheet, and its refusals.
// Method (docs/METHOD_SELECTION.md): water and a nonvolatile acid at low pressure, a polar liquid: an activity model.
// The reference cases use the ideal solution (Raoult's law) on purpose: the worked example has no boiling-point rise
// beyond the solution's dilution, and the reference needs a model it can write independently. The flowsheet check and
// the boiling-point rise use Modified UNIFAC 2.0, the predicted tier for these pairs (no fitted pairs exist).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { system, stream, runUnit, solveFlowsheet, runFlowsheet, specStatus } from "../src/index.js";
import { run as request } from "../src/api/dispatcher.js";
import { readProject, projectOf, stateFromProject } from "../src/ui/project.js";
import { initialState } from "../src/ui/app-logic.js";
import { addBlock, addFeedTo, setSpec, PALETTE, SEPARATORS } from "../src/ui/flowsheet-logic.js";

const fixture = JSON.parse(readFileSync(new URL("../validation/fixtures/evaporator.json", import.meta.url)));
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);

function run(c, model = "ideal") {
  const sys = system({ components: c.components, model });
  const feed = stream(sys, { flow_kg_h: c.feed_kg_h, T_K: c.feed_T_K, P_kPa: 101.325 });
  const spec = { P_kPa: c.P_kPa, steam_P_kPa: c.steam_P_kPa };
  if (c.product_mass_fraction != null) spec.product_mass_fraction = { [c.components[1]]: c.product_mass_fraction };
  else spec.steam_kg_h = c.steam_kg_h;
  if (c.U_W_m2K) spec.U_W_m2K = c.U_W_m2K;
  return { sys, feed, r: runUnit("evaporator", { sys, inlets: { in: feed }, spec }) };
}

test("the evaporator agrees with the independent reference: steam, economy, every effect's T, duty, vapour, BPR, area", () => {
  for (const c of fixture.cases) {
    const { r } = run(c), ref = c.result;
    assert.ok(rel(r.state.steam_kg_h, ref.steam_kg_h) < 1e-7, `${c.name}: steam ${r.state.steam_kg_h} vs ${ref.steam_kg_h}`);
    assert.ok(rel(r.state.steam_economy, ref.steam_economy) < 1e-7, `${c.name}: economy`);
    assert.ok(rel(r.state.steam_hfg_kJ_kg, ref.steam_hfg_kJ_kg) < 1e-9, `${c.name}: latent heat of the steam`);
    assert.ok(rel(r.outlets.product.mass_kg_h, ref.product_kg_h) < 1e-7, `${c.name}: product`);
    ref.effects.forEach((e, k) => {
      const p = r.profile[k];
      assert.ok(Math.abs(p.T_K - e.T_K) < 1e-6, `${c.name}, effect ${k + 1}: T ${p.T_K} vs ${e.T_K}`);
      assert.ok(Math.abs(p.BPR_K - e.BPR_K) < 1e-6, `${c.name}, effect ${k + 1}: BPR ${p.BPR_K} vs ${e.BPR_K}`);
      assert.ok(rel(p.duty_kW, e.duty_kW) < 1e-7, `${c.name}, effect ${k + 1}: duty`);
      assert.ok(rel(p.vapour_kg_h, e.vapour_kg_h) < 1e-7, `${c.name}, effect ${k + 1}: vapour`);
      if (e.A_m2 != null) assert.ok(rel(p.A_m2, e.A_m2) < 1e-6, `${c.name}, effect ${k + 1}: area`);
    });
    assert.equal(r.balance.material < 1e-12, true);
    assert.ok(Math.abs(r.balance.energy_kW) < 1e-9 * r.duty_kW, `${c.name}: energy balance ${r.balance.energy_kW} kW`);
    // the vapour is water: the solute is nonvolatile
    assert.ok(r.outlets.vapour.flow_kmol_h[c.components[1]] < 1e-15);
  }
});

test("Subramanian 2019, Example 1 (slides 16-20): steam, economy and area within the example's simplifications", () => {
  // printed: feed at 293 K, steam 27708.4 kg/h, economy 0.87, area 83.5 m²; at 308 K, 26786.1 kg/h, 0.896, 80.7 m².
  // The example takes c_p = 3.98 kJ/(kg K), latent heats of 2202 and 2383 kJ/kg and no boiling-point rise; the records
  // give the steam within 0.3 %, and the area within 2.5 % (the solution boils 1.8 K above water by Raoult's law, so
  // the temperature difference is 68.5 K, not 70 K).
  const printed = [{ T: 293, S: 27708.4, E: 0.87, A: 83.5 }, { T: 308, S: 26786.1, E: 0.896, A: 80.7 }];
  for (const p of printed) {
    const c = fixture.cases.find(k => k.feed_T_K === p.T && k.P_kPa.length === 1);
    const { r } = run(c);
    assert.ok(rel(r.state.steam_kg_h, p.S) < 0.003, `feed at ${p.T} K: steam ${r.state.steam_kg_h} vs ${p.S}`);
    assert.ok(Math.abs(r.state.steam_economy - p.E) < 0.005, `feed at ${p.T} K: economy ${r.state.steam_economy} vs ${p.E}`);
    assert.ok(rel(r.sizing.dimensions.A_m2[0], p.A) < 0.025, `feed at ${p.T} K: area ${r.sizing.dimensions.A_m2[0]} vs ${p.A}`);
    assert.ok(Math.abs(r.outlets.product.mass_kg_h - 6000) < 1e-6 && Math.abs(r.state.evaporated_kg_h - 24000) < 1e-6, "L = 6000, V = 24000 kg/h");
    assert.ok(Math.abs(r.state.steam_hfg_kJ_kg - 2202) < 0.5, `latent heat at 0.2 MPa ${r.state.steam_hfg_kJ_kg} vs the printed 2202 kJ/kg`);
  }
});

test("the evaporator is the same chain of flash drums and condensers placed as blocks, heated by energy streams", () => {
  // Modified UNIFAC 2.0 (predicted), water + lactic acid: two effects with the steam given
  const components = ["water", "lactic-acid"], model = "MOD-UNIFAC-2";
  const sys = system({ components, model });
  const feedSpec = { flow_kg_h: { water: 9000, "lactic-acid": 1000 }, T_K: 330, P_kPa: 101.325 };
  const feed = stream(sys, feedSpec);
  const ev = runUnit("evaporator", { sys, inlets: { in: feed }, spec: { P_kPa: [60, 15], steam_P_kPa: 300, steam_kg_h: 4000 } });
  const Q1 = ev.duty_kW;
  const fs = {
    blocks: [{ id: "F1", type: "feed", spec: feedSpec }, { id: "V1", type: "flash", spec: { P_kPa: 60 } }, { id: "C1", type: "heater", spec: { P_kPa: 60, VF: 0 } },
      { id: "V2", type: "flash", spec: { P_kPa: 15 } }, { id: "PV", type: "product" }, { id: "PC", type: "product" }, { id: "PL", type: "product" }],
    streams: [{ id: "S1", from: "F1.out", to: "V1.in" }, { id: "V1V", from: "V1.vapour", to: "C1.in" }, { id: "V1L", from: "V1.liquid", to: "V2.in" },
      { id: "COND", from: "C1.out", to: "PC.in" }, { id: "V2V", from: "V2.vapour", to: "PV.in" }, { id: "PROD", from: "V2.liquid", to: "PL.in" }],
    energyStreams: [{ id: "STEAM", to: "V1", duty_kW: Q1 }, { id: "Q12", from: "C1", to: "V2" }],
  };
  const r = solveFlowsheet(sys, fs);
  assert.ok(rel(ev.outlets.product.F_kmol_h, r.streams.PROD.F_kmol_h) < 1e-9, "product flow");
  assert.ok(Math.abs(ev.outlets.product.T_K - r.streams.PROD.T_K) < 1e-7, "product temperature");
  assert.ok(rel(ev.outlets.vapour.F_kmol_h, r.streams.V2V.F_kmol_h) < 1e-9, "last vapour");
  assert.ok(rel(ev.profile[1].duty_kW, r.blocks.V2.duty_kW) < 1e-9, "the second effect's heat");
  assert.ok(rel(ev.outlets.condensate.F_kmol_h, r.streams.COND.F_kmol_h) < 1e-9, "condensate");
  assert.ok(Math.abs(ev.profile[0].BPR_K - (r.streams.V1V.T_K - r.streams.COND.T_K)) < 1e-7, "boiling-point rise of effect 1");
  // the acid raises the boiling point, more in the more concentrated second effect
  assert.ok(ev.profile[0].BPR_K > 0 && ev.profile[1].BPR_K > ev.profile[0].BPR_K, `BPR ${ev.state.BPR_K}`);
  assert.ok(ev.state.steam_economy > 1 && ev.state.steam_economy < 2, `economy ${ev.state.steam_economy}`);
});

test("the evaporator refuses what it cannot do, and says why", () => {
  const sys = system({ components: ["water", "citric-acid"], model: "ideal" });
  const feed = stream(sys, { flow_kg_h: { water: 900, "citric-acid": 100 }, T_K: 300, P_kPa: 101.325 });
  const go = spec => runUnit("evaporator", { sys, inlets: { in: feed }, spec });
  assert.throws(() => go({ P_kPa: [20, 50], steam_P_kPa: 200, steam_kg_h: 100 }), /below the pressure of the one before/);
  assert.throws(() => go({ P_kPa: [20], steam_P_kPa: 200 }), /one of the steam flow steam_kg_h or the product's concentration/);
  assert.throws(() => go({ P_kPa: [20], steam_P_kPa: 200, steam_T_K: 390, steam_kg_h: 1 }), /by its pressure steam_P_kPa or its temperature steam_T_K, one of them/);
  assert.throws(() => go({ P_kPa: [20], steam_P_kPa: 200, product_mass_fraction: { "citric-acid": 0.05 } }), /must be above it/);
  // a second effect only 0.1 kPa below the first: the acid's boiling-point rise is larger than the 0.03 K by which
  // water's boiling point falls, so the first effect's vapour cannot heat it
  assert.throws(() => go({ P_kPa: [101, 100.9], steam_P_kPa: 200, steam_kg_h: 300 }), /effect 2 boils at .* not below the temperature at which the vapour of effect 1 condenses/);
  assert.throws(() => go({ P_kPa: [300], steam_P_kPa: 200, steam_kg_h: 1000 }), /effect 1 boils at .* the steam cannot heat it/);
  assert.throws(() => go({ P_kPa: [20], steam_P_kPa: 200, steam_kg_h: 100, U: 3 }), /unknown|Known/i);
});

// Modified UNIFAC 2.0 (predicted; no fitted pairs of water with lactic acid), a 10 % solution to 30 % in two effects
const LACTIC = { components: ["water", "lactic-acid"], feed: { flow_kg_h: { water: 9000, "lactic-acid": 1000 }, T_K: 330, P_kPa: 101.325 },
  evaporator: { P_kPa: [60, 15], steam_P_kPa: 300, product_mass_fraction: { "lactic-acid": 0.3 }, U_W_m2K: 2000 } };

test("solve_evaporator (CHEPTA.run and the command line): the steam for a product concentration; that steam given back gives the same product", () => {
  const r = request({ capability: "solve_evaporator", input: LACTIC });
  assert.equal(r.outcome, "ok", JSON.stringify(r.error));
  const e = r.value.evaporator;
  assert.equal(e.effects, 2);
  assert.deepEqual(e.target, { "lactic-acid": 0.3 });
  assert.equal(e.sizing.dimensions.A_m2.length, 2);
  assert.ok(Math.abs(e.steam_economy - e.evaporated_kg_h / e.steam_kg_h) < 1e-12);
  assert.ok(Math.abs(r.value.product.mass_kg_h - 1000 / 0.3) < 1e-4, `product ${r.value.product.mass_kg_h} kg/h`);
  const { product_mass_fraction: _w, ...rest } = LACTIC.evaporator;
  const r2 = request({ capability: "solve_evaporator", input: { ...LACTIC, evaporator: { ...rest, steam_kg_h: e.steam_kg_h } } });
  assert.ok(rel(r2.value.product.mass_kg_h, r.value.product.mass_kg_h) < 1e-8);
  // the command line gives the same numbers
  const f = join(mkdtempSync(join(tmpdir(), "chepta-ev-")), "ev.json");
  writeFileSync(f, JSON.stringify({ capability: "solve_evaporator", input: LACTIC }));
  const p = spawnSync(process.execPath, [join(fileURLToPath(new URL("..", import.meta.url)), "bin", "chepta.mjs"), "request", f], { encoding: "utf8", timeout: 60000 });
  assert.equal(p.status, 0, p.stderr);
  assert.ok(rel(JSON.parse(p.stdout).value.evaporator.steam_kg_h, e.steam_kg_h) < 1e-12);
});

test("the workbench: Evaporator under the Separator button, placed with its products, saved and reopened in format 6", () => {
  assert.ok(PALETTE.includes("evaporator") && SEPARATORS.includes("evaporator"));
  let fs = { components: LACTIC.components, thermo: { model: "MOD-UNIFAC-2" }, blocks: [], streams: [] };
  const r = addBlock(fs, "evaporator"); fs = r.fs;
  assert.equal(r.id, "EV1");
  assert.equal(specStatus("evaporator", fs.blocks.find(b => b.id === "EV1").spec).status, "ok", "the starting specification is complete");
  assert.equal(specStatus("evaporator", { P_kPa: [50] }).status, "missing");
  ({ fs } = addFeedTo(fs, "EV1.in"));
  const feed = fs.blocks.find(b => b.type === "feed");
  fs = setSpec(fs, feed.id, LACTIC.feed);
  fs = setSpec(fs, "EV1", { ...LACTIC.evaporator, steam_kg_h: null });   // setSpec merges: the starting steam flow removed
  const res = runFlowsheet(fs);
  assert.ok(res.blocks.EV1.state.steam_kg_h > 0, JSON.stringify(res.blocks.EV1));
  const state = { ...initialState({ components: [] }), flowsheet: fs };
  const doc = projectOf(state, { version: "9.9.9", now: new Date("2026-11-04T12:00:00Z") });
  assert.equal(doc.fugacity_project, 6);
  const back = stateFromProject(readProject(JSON.stringify(doc)));
  assert.deepEqual(back.flowsheet.blocks.find(b => b.id === "EV1").spec, fs.blocks.find(b => b.id === "EV1").spec);
  assert.throws(() => readProject(JSON.stringify({ ...doc, fugacity_project: 5 })), /evaporator and membrane blocks need format 6/);
});
