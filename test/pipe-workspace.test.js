// The Pipe workspace of the Unit models (proposal 0020; src/ui/pipe-logic.js; the maintainer, 2026-11-07: "put it in
// the model tab so I can check a pipe without doing a flowsheet"): its settings, the request it sends to the Pipe block,
// the open worked example through the workspace, the refusals as refusals (not errors), the rows of the Results panel,
// and its place in the navigation and the state.
// Method (docs/METHOD_SELECTION.md): water alone, a liquid, is the ideal solution of one component (no mixture, so the
// activity model plays no part); methane, a gas at 3 MPa, Peng-Robinson.
import { test } from "node:test";
import assert from "node:assert/strict";
import { system, stream, runUnit } from "../src/index.js";
import { PIPE_DEFAULTS, normalizePipe, pipeCalc, pipeSpec, pipeInlet, pressureSplit, pipeTables, regimeText } from "../src/ui/pipe-logic.js";
import { initialState, applyPatch, viewCheck } from "../src/ui/app-logic.js";
import { projectOf } from "../src/ui/project.js";
import { SECTIONS, sectionOf } from "../src/ui/workspaces.js";

const water = system({ components: ["water"], model: "ideal" });
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);

test("the defaults: the workspace sends the Pipe block what a direct call sends, and gets the same answer", () => {
  const c = pipeCalc(water, PIPE_DEFAULTS);
  assert.equal(c.ok, true);
  const feed = stream(water, { flow_kmol_h: [100], T_K: 298.15, P_kPa: 500 });
  const direct = runUnit("pipe", { sys: water, inlets: { in: feed }, spec: { length_m: 100, diameter_m: 0.05, roughness_m: 5e-5, elevation_m: 0, fittings: [], heat: "adiabatic", segments: 20 } });
  assert.ok(rel(c.result.state.dP_kPa, direct.state.dP_kPa) < 1e-12);
  assert.deepEqual(pipeSpec(PIPE_DEFAULTS), { length_m: 100, diameter_m: 0.05, roughness_m: 5e-5, elevation_m: 0, fittings: [], heat: "adiabatic", segments: 20 });
  // the parts add up to the total
  const split = pressureSplit(c.result.state);
  assert.deepEqual(split.map(r => r[0]), ["Friction", "Fittings", "Elevation", "Acceleration", "Total"]);
  const sum = split.slice(0, 4).reduce((a, r) => a + r[1], 0);
  assert.ok(Math.abs(sum - split[4][1]) < 1e-9 * split[4][1]);
  assert.ok(Math.abs(split.slice(0, 4).reduce((a, r) => a + r[2], 0) - 1) < 1e-9);
  // the profile table: one row per node
  const tb = pipeTables(c.result, { tFmt: K => K, tUnit: "K", pFmt: x => x, pUnit: "kPa" })[0];
  assert.equal(tb.rows.length, 21);
  assert.equal(tb.rows[0][0], 0);
  assert.ok(Math.abs(tb.rows.at(-1)[0] - 100) < 1e-9);
  assert.equal(regimeText("laminar and transition"), "laminar and transition");
});

test("the open worked example through the workspace: water at 10 °C, 0.0100 m³/s in 100 m of a 5 cm pipe (Cimbala, ME 320 Lecture 21)", () => {
  // the solution's eps/D = 0.001 (eps = 0.05 mm, the workspace's default): f = 0.02107 and dP = 546 kPa (pp. 3-4)
  const p = normalizePipe({ feed: { flow: 0.0100 * 999.7 * 3600, basis: "kg/h", T_K: 283.15, P_kPa: 700 } });
  const inlet = pipeInlet(water, p);
  assert.ok(rel(inlet.mass_kg_h, 0.0100 * 999.7 * 3600) < 1e-12, "kg/h: the molar flow from the molar mass");
  const s = pipeCalc(water, p).result.state;
  assert.ok(rel(s.friction_factor_in, 0.02107) < 1e-3, `f ${s.friction_factor_in}`);
  assert.ok(rel(s.dP_kPa, 546) < 2e-3, `dP ${s.dP_kPa}`);
  assert.equal(s.regime, "turbulent");
});

test("fittings, elevation and heat reach the block; a gas shows its acceleration", () => {
  const p = normalizePipe({ fittings: [{ fitting: "elbow-90", count: 4 }, { K: 0.5, count: 1 }], elevation_m: 20 });
  const s = pipeCalc(water, p).result.state;
  assert.ok(s.dP_fittings_kPa > 0 && s.dP_elevation_kPa > 0);
  assert.equal(s.fittings.L_D, 120);
  assert.equal(s.fittings.K, 0.5);
  // the elevation: rho g dz, about 20 m of water
  assert.ok(Math.abs(s.dP_elevation_kPa - s.rho_in_kg_m3 * 9.80665 * 20 / 1000) < 1e-3 * s.dP_elevation_kPa);
  const methane = system({ components: ["methane"], model: "PR" });
  const gas = heat => pipeCalc(methane, normalizePipe({ feed: { flow: 3600, basis: "kg/h", T_K: 300, P_kPa: 3000 }, length_m: 1000, diameter_m: 0.1, heat, U_W_m2K: 5, T_ambient_K: 280 }));
  const ad = gas("adiabatic"), cooled = gas("U");
  assert.equal(ad.ok, true);
  assert.equal(ad.result.state.phase, "vapour");
  assert.ok(ad.result.state.dP_acceleration_kPa > 0, "adiabatic: the gas speeds up as its pressure, and so its density, falls");
  assert.ok(cooled.result.state.heat_kW < 0, "heat lost to colder surroundings");
  assert.ok(cooled.result.state.T_out_K < ad.result.state.T_out_K);
  // cooled by 10 K, the gas becomes denser along the pipe despite its lower pressure: its acceleration term turns negative
  assert.ok(cooled.result.state.dP_acceleration_kPa < 0);
});

test("refusals come back as refusals, with the engine's reason; settings are checked", () => {
  // the pressure falls to zero: a long, narrow pipe
  const zero = pipeCalc(water, normalizePipe({ feed: { flow: 2000 }, length_m: 5000, diameter_m: 0.02 }));
  assert.equal(zero.ok, false);
  assert.equal(zero.refused.code, "BAD_INPUT");
  assert.match(zero.refused.message, /pressure falls to zero/);
  // water just below its boiling point at 101.325 kPa flashes as its pressure falls: a phase change in the pipe
  const flashing = pipeCalc(water, normalizePipe({ feed: { flow: 1000, T_K: 372.9, P_kPa: 101.325 } }));
  assert.equal(flashing.ok, false);
  assert.equal(flashing.refused.code, "NOT_AVAILABLE");
  assert.match(flashing.refused.message, /phase change|two-phase/);
  // the settings
  assert.throws(() => normalizePipe({ heat: "radiant" }), /pipe.heat/);
  assert.throws(() => normalizePipe({ fittings: [{ fitting: "butterfly" }] }), /butterfly/);
  assert.throws(() => normalizePipe({ diameter_m: 0 }), /diameter_m/);
  const merged = normalizePipe({ fittings: [{ fitting: "gate-valve" }] }, normalizePipe({ fittings: [{ fitting: "elbow-90", count: 2 }], length_m: 50 }));
  assert.deepEqual(merged.fittings, [{ fitting: "gate-valve" }], "a list replaces the list");
  assert.equal(merged.length_m, 50);
});

test("the workspace sits in Unit models; its settings live in the state; the project file does not carry it yet", () => {
  assert.ok(SECTIONS.find(s => s.id === "units").workspaces.includes("pipe"));
  assert.equal(sectionOf("pipe"), "units");
  const s0 = initialState({ components: ["water"], start: "pipe" });
  assert.equal(s0.workspace, "pipe");
  assert.equal(s0.pipe, null, "null until a setting is changed");
  assert.deepEqual(viewCheck(s0, "pipe").use, ["water"]);
  const s1 = applyPatch(s0, { pipe: { length_m: 250 } });
  assert.equal(s1.pipe.length_m, 250);
  assert.equal(s1.pipe.diameter_m, PIPE_DEFAULTS.diameter_m);
  const empty = applyPatch(s0, { inputs: { pipe: [] } });
  assert.equal(viewCheck(empty, "pipe").ok, false);
  // not saved: the project format stays as it was (a decision for the maintainer, docs/decisions/2026-11-10-02-pipe-block.md)
  const doc = projectOf(s1);
  assert.equal(doc.workbench.pipe, undefined);
  assert.equal(doc.workbench.inputs.pipe, undefined);
});
