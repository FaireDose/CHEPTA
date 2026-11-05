// The Crystallizer block (proposal 0015, M3, step 10; src/units/crystallizer.js): against the independent reference
// (validation/python/reference_crystallizer.py, validation/fixtures/crystallizer.json), its yield against the measured
// solubility curve of succinic acid in water (six articles, NIST TRC ThermoML Archive, validation/data/sle/), the
// crystals as a solid in equilibrium (stream v2), and its refusals.
// Method (docs/METHOD_SELECTION.md): water + succinic acid, a polar liquid below 10 bar with fitted parameters: NRTL,
// with the set fitted to the measured solubilities (fitted-sle-thermoml, validation/python/fit_sle.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { system, stream, runUnit, runFlowsheet, specStatus } from "../src/index.js";
import { run as request } from "../src/api/dispatcher.js";
import { hasCrystals } from "../src/stream/stream.js";
import { readProject, projectOf, stateFromProject } from "../src/ui/project.js";
import { initialState } from "../src/ui/app-logic.js";
import { addBlock, addFeedTo, setSpec, PALETTE, SEPARATORS } from "../src/ui/flowsheet-logic.js";

const fixture = JSON.parse(readFileSync(new URL("../validation/fixtures/crystallizer.json", import.meta.url)));
const measured = JSON.parse(readFileSync(new URL("../validation/data/sle/succinic-acid.json", import.meta.url)));
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const sys = system({ components: ["water", "succinic-acid"], model: "NRTL" });
const feedOf = c => stream(sys, { flow_kg_h: c.feed_kg_h, T_K: c.feed_T_K, P_kPa: 101.325 });
const specOf = c => ({ solute: "succinic-acid", ...(c.T_K != null ? { T_K: c.T_K } : {}), ...(c.P_kPa != null ? { P_kPa: c.P_kPa } : {}),
  ...(c.evaporated_kg_h ? { evaporated_kg_h: c.evaporated_kg_h } : {}) });
const crystallizer = (spec, feed, outletCount = spec.evaporated_kg_h ? 3 : 2) => runUnit("crystallizer", { sys, inlets: { in: feed }, spec, outletCount });

test("the crystallizer agrees with the independent reference: T, P, solubility, yield, crystals, duty", () => {
  for (const c of fixture.cases) {
    const r = crystallizer(specOf(c), feedOf(c)), ref = c.result;
    assert.ok(Math.abs(r.state.T_K - ref.T_K) < 1e-6, `${c.name}: T ${r.state.T_K} vs ${ref.T_K}`);
    assert.ok(rel(r.state.P_kPa, ref.P_kPa) < 1e-7, `${c.name}: P`);
    assert.ok(rel(r.state.solubility_x, ref.solubility_x) < 1e-7, `${c.name}: x ${r.state.solubility_x} vs ${ref.solubility_x}`);
    assert.ok(Math.abs(r.state.yield - ref.yield) < 1e-7, `${c.name}: yield`);
    assert.ok(rel(r.state.crystals_kmol_h, ref.crystals_kmol_h) < 1e-7, `${c.name}: crystals`);
    assert.ok(Math.abs(r.duty_kW - ref.duty_kW) < 1e-5 * Math.max(1, Math.abs(ref.duty_kW)), `${c.name}: duty ${r.duty_kW} vs ${ref.duty_kW} kW`);
    assert.ok(r.balance.material < 1e-12 && Math.abs(r.balance.energy_kW) < 1e-9);
  }
});

test("the yield against the measured solubility curve of succinic acid in water (six open articles)", () => {
  // the measured mole fractions within 0.6 K of the crystallizer's temperature; the fitted set's stated median
  // deviation is 8.6 % (10.5 % for left-out articles): the solubility is held to 10 % of each article's value, and the
  // yield to 0.03 of the yield those values give
  const sets = measured.sets.filter(s => s.solvent === "water");
  for (const T of [283.15, 298.15]) {
    const near = sets.flatMap(s => s.rows.filter(r => Math.abs(r.T_K - T) <= 0.6).map(r => ({ doi: s.doi, x: r.x_solute })));
    assert.ok(new Set(near.map(n => n.doi)).size >= 2, `${T} K: measured values from ${near.length} rows`);
    const c = { feed_kg_h: { water: 800, "succinic-acid": 200 }, feed_T_K: 343.15 };
    const r = crystallizer({ solute: "succinic-acid", T_K: T }, feedOf(c));
    for (const n of near) assert.ok(rel(r.state.solubility_x, n.x) < 0.10, `${T} K: x ${r.state.solubility_x} vs ${n.x} (${n.doi})`);
    const xs = near.map(n => n.x).sort((a, b) => a - b), xm = xs[Math.floor(xs.length / 2)];
    const nw = 800 / 18.015, ns = 200 / 118.09;
    const yMeasured = (ns - xm * nw / (1 - xm)) / ns;
    assert.ok(Math.abs(r.state.yield - yMeasured) < 0.03, `${T} K: yield ${r.state.yield} vs ${yMeasured} from the measured solubility`);
  }
});

test("the crystals are a solid in equilibrium: h = h_liquid − ΔH_fus; only a Product takes them", () => {
  const c = fixture.cases[0];
  const r = crystallizer(specOf(c), feedOf(c));
  const cr = r.outlets.crystals;
  assert.ok(hasCrystals(cr));
  assert.equal(cr.phases[0].type, "solid");
  assert.ok(cr.flow_kmol_h.water === 0 && cr.F_kmol_h > 0);
  const hL = stream(sys, { flow_kmol_h: cr.flows, T_K: cr.T_K, P_kPa: cr.P_kPa }).h_J_mol;
  assert.ok(Math.abs(cr.h_J_mol - (hL - sys.fusion[1].Hfus_J_mol)) < 1e-6);
  assert.ok(r.outlets.liquor.VF === 0 && r.outlets.vapour.F_kmol_h === 0);
  assert.throws(() => runUnit("heater", { sys, inlets: { in: cr }, spec: { T_K: 300 } }), e => e.code === "NOT_AVAILABLE" && /crystals from a crystallizer/.test(e.message));
  assert.equal(runUnit("product", { sys, inlets: { in: cr }, spec: {} }).duty_kW, 0);
});

test("the crystallizer says what it does not do, and refuses what it cannot", () => {
  const feed = feedOf({ feed_kg_h: { water: 800, "succinic-acid": 200 }, feed_T_K: 343.15 });
  // undersaturated: nothing crystallizes, with a note
  const u = crystallizer({ solute: "succinic-acid", T_K: 340 }, feed);
  assert.equal(u.state.crystals_kmol_h, 0);
  assert.ok(u.notes.some(n => /not saturated/.test(n)));
  // a mother liquor also saturated in a second solid (past a eutectic): warned. The ideal solution on purpose (no
  // fitted pairs of water with sorbitol or xylitol): the code path, not the numbers, is checked
  const two = system({ components: ["water", "sorbitol", "xylitol"], model: "ideal" });
  const tf = stream(two, { flow_kmol_h: { water: 50, sorbitol: 20, xylitol: 10 }, T_K: 330, P_kPa: 101.325 });
  const w2 = runUnit("crystallizer", { sys: two, inlets: { in: tf }, spec: { solute: "sorbitol", T_K: 290 }, outletCount: 2 });
  assert.ok(w2.warnings?.some(w => w.code === "SECOND_SOLID" && /Xylitol/.test(w.message)), JSON.stringify(w2.warnings));
  assert.throws(() => crystallizer({ solute: "succinic-acid", T_K: 460 }, feed), /melts at 458/);
  assert.throws(() => crystallizer({ T_K: 300 }, feed), /name the component that crystallizes/);
  assert.throws(() => crystallizer({ solute: "succinic-acid", evaporated_kg_h: 100 }, feed), /one of T_K or P_kPa/);
  assert.throws(() => crystallizer({ solute: "succinic-acid", T_K: 330, evaporated_kg_h: 100 }, feed, 2), /connect it/);
  assert.throws(() => crystallizer({ solute: "succinic-acid", T_K: 330, evaporated_kg_h: 900 }, feed), /more than the feed's solvent/);
  // a solute without open melting data (fumaric acid; Modified UNIFAC 2.0 on purpose: it has no fitted pair)
  const fum = system({ components: ["water", "fumaric-acid"], model: "MOD-UNIFAC-2" });
  const ff = stream(fum, { flow_kg_h: { water: 900, "fumaric-acid": 10 }, T_K: 330, P_kPa: 101.325 });
  assert.throws(() => runUnit("crystallizer", { sys: fum, inlets: { in: ff }, spec: { solute: "fumaric-acid", T_K: 290 }, outletCount: 2 }), e => e.code === "MISSING_DATA");
});

const CASE = { components: ["water", "succinic-acid"], thermo: { model: "NRTL" },
  feed: { flow_kg_h: { water: 800, "succinic-acid": 200 }, T_K: 343.15, P_kPa: 101.325 }, crystallizer: { solute: "succinic-acid", T_K: 288.15 } };

test("solve_crystallizer (CHEPTA.run and the command line), cooling and evaporative", () => {
  const r = request({ capability: "solve_crystallizer", input: CASE });
  assert.equal(r.outcome, "ok", JSON.stringify(r.error));
  assert.ok(Math.abs(r.value.crystallizer.yield - fixture.cases[0].result.yield) < 1e-7);
  assert.equal(r.value.crystals.phases[0].type, "solid");
  const e = request({ capability: "solve_crystallizer", input: { ...CASE, crystallizer: { solute: "succinic-acid", P_kPa: 20, evaporated_kg_h: 300 } } });
  assert.equal(e.outcome, "ok", JSON.stringify(e.error));
  assert.ok(Math.abs(e.value.vapour.mass_kg_h - 300) < 1e-6 && Math.abs(e.value.crystallizer.T_K - fixture.cases[3].result.T_K) < 1e-6);
  const f = join(mkdtempSync(join(tmpdir(), "chepta-cr-")), "cr.json");
  writeFileSync(f, JSON.stringify({ capability: "solve_crystallizer", input: CASE }));
  const p = spawnSync(process.execPath, [join(fileURLToPath(new URL("..", import.meta.url)), "bin", "chepta.mjs"), "request", f], { encoding: "utf8", timeout: 60000 });
  assert.equal(p.status, 0, p.stderr);
  assert.ok(Math.abs(JSON.parse(p.stdout).value.crystallizer.yield - r.value.crystallizer.yield) < 1e-12);
});

test("the workbench: Crystallizer under the Separator button, placed with its products, saved and reopened in format 6", () => {
  assert.ok(PALETTE.includes("crystallizer") && SEPARATORS.includes("crystallizer"));
  let fs = { components: CASE.components, thermo: CASE.thermo, blocks: [], streams: [] };
  const r = addBlock(fs, "crystallizer"); fs = r.fs;
  assert.equal(r.id, "CR1");
  assert.equal(specStatus("crystallizer", fs.blocks.find(b => b.id === "CR1").spec).status, "missing", "the solute is the person's choice");
  ({ fs } = addFeedTo(fs, "CR1.in"));
  const feed = fs.blocks.find(b => b.type === "feed");
  fs = setSpec(fs, feed.id, CASE.feed);
  fs = setSpec(fs, "CR1", CASE.crystallizer);
  const res = runFlowsheet(fs);
  assert.ok(Math.abs(res.blocks.CR1.state.yield - fixture.cases[0].result.yield) < 1e-7, JSON.stringify(res.blocks.CR1));
  const state = { ...initialState({ components: [] }), flowsheet: fs };
  const doc = projectOf(state, { version: "9.9.9", now: new Date("2026-11-05T12:00:00Z") });
  assert.equal(doc.fugacity_project, 6);
  const back = stateFromProject(readProject(JSON.stringify(doc)));
  assert.deepEqual(back.flowsheet.blocks.find(b => b.id === "CR1").spec, fs.blocks.find(b => b.id === "CR1").spec);
  assert.throws(() => readProject(JSON.stringify({ ...doc, fugacity_project: 5 })), /crystallizer, evaporator, extraction and membrane blocks need format 6/);
});
