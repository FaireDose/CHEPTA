// Proposal 0015, milestone M3, step 9 (W3, W4): the Membrane block (src/units/membrane.js) against the independent
// reference validation/python/reference_membrane.py (fixture validation/fixtures/membrane.json) and the worked example
// of Binous, Chem. Eng. Educ. 40 (2006) 140-144 (free to read); the block end to end: a flowsheet, the sizing
// (membraneArea), the request path, a project file, the workbench's palette.
//
// Property method: the gas feeds here are CO2, O2 and N2 at 303 K and up to 1.6 MPa, gases far above their critical
// temperatures but CO2: Peng-Robinson, as docs/METHOD_SELECTION.md advises for gases at pressure; the membrane model
// itself uses Dalton's partial pressures (Aziaba et al. 2022), whatever the method. The tests of the refusals use the
// ideal solution on purpose: they test a code path, not a property.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, stream, runUnit, specStatus, membraneArea } from "../src/index.js";
import { run } from "../src/api/dispatcher.js";
import { membraneCells, membraneAreaFor, GPU, PERMEANCE_UNITS } from "../src/units/membrane.js";
import { readProject, projectOf, stateFromProject } from "../src/ui/project.js";
import { initialState } from "../src/ui/app-logic.js";
import { addBlock, addFeedTo, setSpec, PALETTE, SEPARATORS } from "../src/ui/flowsheet-logic.js";
import { runFlowsheet } from "../src/index.js";

const fixture = JSON.parse(readFileSync(new URL("../validation/fixtures/membrane.json", import.meta.url)));
const caseOf = name => fixture.cases.find(c => c.name === name);
const sum = a => a.reduce((s, v) => s + v, 0);

/** The engine on a fixture case, in the case's own units (each case solved once). */
const solved = new Map();
const engine = c => solved.get(c.name) ?? solved.set(c.name, solve(c)).get(c.name);
function solve(c) {
  const o = { F: c.feed, Q: c.permeance, P: c.P_feed, p: c.P_permeate, cells: c.cells, flow: c.flow };
  const t = c.target;
  if (!t) return { A: c.A, ...membraneCells({ ...o, A: c.A }) };
  return membraneAreaFor({ ...o, target: t.stage_cut != null ? { stage_cut: t.stage_cut } : { recovery: [t.recovery.component, t.recovery.value] } });
}

test("membrane cells: the engine against the independent reference (scipy), every case of the fixture", () => {
  for (const c of fixture.cases) {
    const r = engine(c), F = sum(c.feed);
    assert.ok(Math.abs(r.A / c.A - 1) < 1e-9, `${c.name}: area ${r.A} vs ${c.A}`);
    r.permeate.forEach((v, i) => assert.ok(Math.abs(v - c.permeate[i]) < 1e-9 * F, `${c.name}: permeate ${i} ${v} vs ${c.permeate[i]}`));
    // every cell's retentate
    r.R.forEach((row, k) => row.forEach((v, i) => assert.ok(Math.abs(v - c.retentate_by_cell[k][i]) < 1e-9 * F, `${c.name}: cell ${k + 1}, ${i}`)));
  }
});

test("Binous 2006, ternary mixture by complete mixing (one cell): the printed area and compositions", () => {
  // p. 141: y_P = 0.455281, 0.450286, 0.0944335; A_m = 3.54176e6 cm2; x_o = 0.181573, 0.583238, 0.235189 (six
  // figures printed; one cell is the complete-mixing model exactly)
  const c = caseOf("binous-ternary-complete-mixing"), pub = c.published, r = engine(c);
  assert.ok(Math.abs(r.A / pub.A_cm2 - 1) < 2e-6, `area ${r.A}`);
  const y = r.permeate.map(v => v / sum(r.permeate)), x = r.retentate.map(v => v / sum(r.retentate));
  y.forEach((v, i) => assert.ok(Math.abs(v - pub.y_permeate[i]) < 1e-6, `y ${i} ${v}`));
  x.forEach((v, i) => assert.ok(Math.abs(v - pub.x_retentate[i]) < 1e-6, `x ${i} ${v}`));
});

test("Binous 2006, oxygen from air: complete mixing, and 200 cells against the plug-flow co- and counter-current results", () => {
  // the printed values have four figures; 200 cells approach plug flow (the cells' area is within 0.15 % of the plug-flow
  // area; Binous notes his numerical integration is the less exact the later value). Complete mixing: the printed area
  // 3.228e8 cm2 is 0.1 % below the model's 3.2314e8, the permeate 0.5067 against 0.5068: the tolerance 0.2 % and 2e-4
  // covers the printed rounding of Geankoplis's example he reproduces
  for (const [name, tolA] of [["binous-air-complete-mixing", 2e-3], ["binous-air-counter-current", 2e-3], ["binous-air-co-current", 2e-3]]) {
    const c = caseOf(name), pub = c.published, r = engine(c);
    const y = r.permeate[0] / sum(r.permeate), x = r.retentate[0] / sum(r.retentate);
    assert.ok(Math.abs(r.A / pub.A_cm2 - 1) < tolA, `${name}: area ${r.A} vs ${pub.A_cm2}`);
    assert.ok(Math.abs(y - pub.y_permeate_O2) < 5e-4, `${name}: y ${y} vs ${pub.y_permeate_O2}`);
    assert.ok(Math.abs(x - pub.x_retentate_O2) < 2e-4, `${name}: x ${x} vs ${pub.x_retentate_O2}`);
  }
  // the order of the areas Binous finds: counter-current < co-current < complete mixing
  const A = n => engine(caseOf(n)).A;
  assert.ok(A("binous-air-counter-current") < A("binous-air-co-current") && A("binous-air-co-current") < A("binous-air-complete-mixing"));
});

test("one cell is the hand calculation of complete mixing: the permeate composition solves the local flux equations", () => {
  // n_i = A Q_i (P x_i - p y_i) with x, y the outlet compositions: checked directly on the result
  const F = [3, 5, 2], Q = [2e-3, 5e-4, 1e-4], P = 1000, p = 100, A = 20;   // a stage cut of 0.75
  const r = membraneCells({ F, Q, P, p, A, cells: 1, flow: "co-current" });
  const x = r.retentate.map(v => v / sum(r.retentate)), y = r.permeate.map(v => v / sum(r.permeate));
  r.permeate.forEach((v, i) => assert.ok(Math.abs(v - A * Q[i] * (P * x[i] - p * y[i])) < 1e-12 * sum(F)));
  // with one cell the flow pattern makes no difference
  const r2 = membraneCells({ F, Q, P, p, A, cells: 1, flow: "counter-current" });
  r2.permeate.forEach((v, i) => assert.ok(Math.abs(v - r.permeate[i]) < 1e-12));
  // complete mixing permeates the whole feed at a finite area (about 35 here): above it there is no solution, and the
  // engine says so
  assert.throws(() => membraneCells({ F, Q, P, p, A: 40, cells: 1, flow: "co-current" }), e => e.code === "OUT_OF_RANGE" && /whole feed/.test(e.message));
});

test("permeance units: GPU from its definition, mol/(m2 s bar)", () => {
  // 1 GPU = 1e-6 cm3(STP)/(cm2 s cmHg); cm3(STP) at 273.15 K and 101.325 kPa (22.414 L/mol); 1 cmHg = 1333.22 Pa
  assert.ok(Math.abs(GPU / 3.3463e-10 - 1) < 1e-4, String(GPU));
  assert.equal(PERMEANCE_UNITS["mol/(m2 s bar)"], 1e-5);
});

// Aziaba et al. 2022, Table 1, test case 2 (Sada et al. 1992; module 31): CO2, O2, N2 50.0, 10.5, 39.5 %; 303 K; the
// feed 15.7 to 5.9 bar, the permeate 1013.25 mbar; permeances 204.2, 60.2, 13.1 x 1e-10 mol/(s m2 Pa); counter-current;
// 270 fibres of 125 um inner diameter and 63 cm. The feed flow is this test's choice (the article varies it).
const SADA = { components: ["carbon-dioxide", "oxygen", "nitrogen"], thermo: { model: "PR" },
  feed: { flow_kmol_h: { "carbon-dioxide": 0.005, oxygen: 0.00105, nitrogen: 0.00395 }, T_K: 303.15, P_kPa: 1570 },
  membrane: { permeances: { "carbon-dioxide": 204.2e-10, oxygen: 60.2e-10, nitrogen: 13.1e-10 }, permeate_P_kPa: 101.325, flow: "counter-current", cells: 20,
    stage_cut: 0.3, fibre: { inner_diameter_m: 125e-6, length_m: 0.63 } } };

test("the Membrane block through solve_membrane: the area for a stage cut, its fibres, the balances; the same area given back gives the same outlets", () => {
  const r = run({ capability: "solve_membrane", input: SADA });
  assert.equal(r.outcome, "ok", r.error?.message);
  const m = r.value.membrane;
  assert.ok(Math.abs(m.stage_cut - 0.3) < 1e-9);
  assert.ok(Math.abs(r.value.permeate.F_kmol_h / r.value.feed.F_kmol_h - 0.3) < 1e-9);
  // the fibres: A = n d pi l (Aziaba et al., Equation (2))
  assert.ok(Math.abs(m.sizing.dimensions.fibres * Math.PI * 125e-6 * 0.63 - m.A_m2) < 1e-12);
  // isothermal: both outlets at the feed's temperature, at their own pressures
  assert.equal(r.value.permeate.T_K, 303.15);
  assert.equal(r.value.retentate.P_kPa, 1570);
  assert.equal(r.value.permeate.P_kPa, 101.325);
  assert.ok(r.checks.blocks.MB1.material < 1e-12 && Math.abs(r.checks.blocks.MB1.energy_kW) < 1e-9);
  // CO2 is enriched in the permeate, nitrogen in the retentate
  assert.ok(r.value.permeate.z[0] > 0.5 && r.value.retentate.z[2] > 0.395);
  // the area found, given as the area: the same separation
  const { stage_cut, ...rest } = SADA.membrane;
  const r2 = run({ capability: "solve_membrane", input: { ...SADA, membrane: { ...rest, A_m2: m.A_m2 } } });
  assert.equal(r2.outcome, "ok");
  r2.value.permeate.flows.forEach((v, i) => assert.ok(Math.abs(v - r.value.permeate.flows[i]) < 1e-9 * 0.01));
  assert.equal(r2.value.membrane.target, undefined);
  // the units: the same permeances in GPU
  const gpu = Object.fromEntries(Object.entries(SADA.membrane.permeances).map(([k, v]) => [k, v / GPU]));
  const r3 = run({ capability: "solve_membrane", input: { ...SADA, membrane: { ...SADA.membrane, permeances: gpu, permeance_unit: "GPU" } } });
  assert.ok(Math.abs(r3.value.membrane.A_m2 / m.A_m2 - 1) < 1e-9);
});

test("membraneArea (sizing, contract 4): from a block's result; fibres from options; refuses another block", () => {
  const sys = system({ components: SADA.components, model: "PR" });
  const feed = stream(sys, SADA.feed);
  const res = runUnit("membrane", { sys, inlets: { in: feed }, spec: { ...SADA.membrane, fibre: undefined } });
  const z = membraneArea(res);
  assert.equal(z.dimensions.A_m2, res.state.A_m2);
  assert.equal(z.dimensions.fibres, undefined);
  assert.deepEqual(z.basis.target, { stage_cut: 0.3 });
  assert.match(z.source[0], /Aziaba/);
  const z2 = membraneArea(res, { inner_diameter_m: 125e-6, length_m: 0.63 });
  assert.ok(Math.abs(z2.dimensions.fibres - res.state.A_m2 / (Math.PI * 125e-6 * 0.63)) < 1e-9);
  assert.throws(() => membraneArea({ type: "flash", state: { A_m2: 1 } }), e => e.code === "BAD_INPUT");
  assert.throws(() => membraneArea(res, { diameter: 1 }), /unknown option/);
});

test("a recovery target: the area that sends that fraction of a component to the permeate", () => {
  const { stage_cut, ...rest } = SADA.membrane;
  const r = run({ capability: "solve_membrane", input: { ...SADA, membrane: { ...rest, recovery: { "carbon-dioxide": 0.8 } } } });
  assert.equal(r.outcome, "ok", r.error?.message);
  assert.ok(Math.abs(r.value.membrane.recoveries["carbon-dioxide"] - 0.8) < 1e-9);
  assert.deepEqual(r.value.membrane.target, { recovery: { "carbon-dioxide": 0.8 } });
  // a component that does not pass stays in the retentate
  const r0 = run({ capability: "solve_membrane", input: { ...SADA, membrane: { ...SADA.membrane, permeances: { ...SADA.membrane.permeances, nitrogen: 0 } } } });
  assert.equal(r0.outcome, "ok", r0.error?.message);
  assert.equal(r0.value.permeate.flow_kmol_h.nitrogen, 0);
});

test("refusals: a liquid feed (pervaporation, not built), missing permeances, two targets, the permeate pressure above the feed's", () => {
  const sys = system({ components: ["ethanol", "water"], model: "ideal" });   // a code path, not a property
  const liquid = stream(sys, { flow_kmol_h: { ethanol: 1, water: 1 }, T_K: 330, P_kPa: 101.325 });
  const spec = { permeances: { ethanol: 1e-9, water: 1e-7 }, permeate_P_kPa: 3, A_m2: 1 };
  assert.throws(() => runUnit("membrane", { sys, inlets: { in: liquid }, spec }), e => e.code === "NOT_AVAILABLE" && /pervaporation/.test(e.message));
  const gas = stream(sys, { flow_kmol_h: { ethanol: 1, water: 1 }, T_K: 420, P_kPa: 101.325 });
  assert.throws(() => runUnit("membrane", { sys, inlets: { in: gas }, spec: { ...spec, permeances: { water: 1e-7 } } }), /missing: Ethanol/);
  assert.throws(() => runUnit("membrane", { sys, inlets: { in: gas }, spec: { ...spec, stage_cut: 0.2 } }), /give one of/);
  assert.throws(() => runUnit("membrane", { sys, inlets: { in: gas }, spec: { ...spec, permeate_P_kPa: 200 } }), /must be below the feed pressure/);
  assert.throws(() => runUnit("membrane", { sys, inlets: { in: gas }, spec: { ...spec, cells: 0 } }), /cells must be/);
  assert.throws(() => runUnit("membrane", { sys, inlets: { in: gas }, spec: { ...spec, area: 1 } }), /unknown specification key "area"/);
  // the degrees of freedom
  assert.equal(specStatus("membrane", {}).status, "missing");
  assert.equal(specStatus("membrane", { ...spec, stage_cut: 0.2 }).status, "extra");
  assert.equal(specStatus("membrane", spec, { sys }).status, "ok");
  // through the request path: unsupported, with the code
  const r = run({ capability: "solve_membrane", input: { components: ["ethanol", "water"], thermo: { model: "ideal" },
    feed: { flow_kmol_h: { ethanol: 1, water: 1 }, T_K: 330, P_kPa: 101.325 }, membrane: spec } });
  assert.equal(r.outcome, "unsupported");
  assert.equal(r.error.code, "NOT_AVAILABLE");
});

test("a retentate that would condense is warned (CONDENSATION)", () => {
  // water vapour near its dew point with nitrogen: the dry gas permeates, the water stays behind and condenses
  const sys = system({ components: ["water", "nitrogen"], model: "PR" });
  const feed = stream(sys, { flow_kmol_h: { water: 0.5, nitrogen: 0.5 }, T_K: 400, P_kPa: 300 });
  const res = runUnit("membrane", { sys, inlets: { in: feed }, spec: { permeances: { water: 0, nitrogen: 1e-8 }, permeate_P_kPa: 10, stage_cut: 0.45, cells: 5 } });
  assert.ok(res.warnings?.some(w => w.code === "CONDENSATION" && /retentate/.test(w.message)), JSON.stringify(res.warnings));
});

test("the workbench: Membrane under the Separator button, placed with its products, saved and reopened in format 6", () => {
  assert.ok(PALETTE.includes("membrane") && SEPARATORS.includes("membrane") && SEPARATORS.includes("flash"));
  let fs = { components: SADA.components, thermo: { model: "PR" }, blocks: [], streams: [] };
  let r = addBlock(fs, "membrane"); fs = r.fs;
  assert.equal(r.id, "MB1");
  ({ fs } = addFeedTo(fs, "MB1.in"));
  const feed = fs.blocks.find(b => b.type === "feed");
  fs = setSpec(fs, feed.id, SADA.feed);
  fs = setSpec(fs, "MB1", { ...SADA.membrane, permeance_unit: "mol/(m2 s Pa)" });
  const res = runFlowsheet(fs);
  assert.ok(Math.abs(res.blocks.MB1.state.stage_cut - 0.3) < 1e-9);
  const state = { ...initialState({ components: [] }), flowsheet: fs };
  const doc = projectOf(state, { version: "9.9.9", now: new Date("2026-11-03T12:00:00Z") });
  assert.equal(doc.fugacity_project, 6);
  const back = stateFromProject(readProject(JSON.stringify(doc)));
  assert.deepEqual(back.flowsheet.blocks.find(b => b.id === "MB1").spec, fs.blocks.find(b => b.id === "MB1").spec);
  assert.throws(() => readProject(JSON.stringify({ ...doc, fugacity_project: 5 })), /membrane blocks need format 6/);
});
