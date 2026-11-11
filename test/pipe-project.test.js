// The Pipe in the flowsheet drawing's palette and in the project file (proposal 0020, steps 1-2; the maintainer,
// 2026-11-10: "add the Pipe to the flowsheet drawing's palette", "save the Pipe workspace in the project file").
// Method (docs/METHOD_SELECTION.md): water alone, a liquid, is the ideal solution of one component (no mixture, so the
// activity model plays no part); methane, a gas at 3 MPa, Peng-Robinson; the choked two-phase refusal uses water at its
// boiling point, also ideal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { system, stream, runUnit, runFlowsheet, flowsheetDocStatus } from "../src/index.js";
import { emptyFlowsheet } from "../src/flowsheet/document.js";
import { addBlock, addFeedTo, setSpec, setBlockType, PALETTE, PREFIX } from "../src/ui/flowsheet-logic.js";
import { initialState, applyPatch } from "../src/ui/app-logic.js";
import { projectOf, projectText, readProject, stateFromProject, checkProject, PROJECT_FORMAT } from "../src/ui/project.js";
import { pipeSpec, PIPE_DEFAULTS } from "../src/ui/pipe-logic.js";
import { pipeBlockRows } from "../src/ui/pipe-view.js";

const water = system({ components: ["water"], model: "ideal" });
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const base = () => ({ ...emptyFlowsheet(), components: ["water"], thermo: { model: "ideal" } });

/** A feed, a pipe (placed from the palette) and a product, specified like the workspace's example. */
function drawn(feedSpec = { flow_kmol_h: { water: 100 }, T_K: 298.15, P_kPa: 500 }, pipe = {}) {
  let { fs, id } = addBlock(base(), "pipe");
  ({ fs } = addFeedTo(fs, `${id}.in`));
  fs = setSpec(fs, "F1", feedSpec);
  if (Object.keys(pipe).length) fs = setSpec(fs, id, pipe);
  return { fs, id };
}

test("the Pipe is in the palette with its prefix and a starting specification that is complete", () => {
  assert.ok(PALETTE.includes("pipe"));
  assert.equal(PREFIX.pipe, "PI");
  const { fs, id } = drawn();
  assert.equal(id, "PI1");
  const b = fs.blocks.find(x => x.id === id);
  assert.deepEqual(b.spec, { length_m: 100, diameter_m: 0.05, roughness_m: 5e-5, heat: "adiabatic" });
  assert.deepEqual(flowsheetDocStatus(fs).structure, []);
  assert.ok(flowsheetDocStatus(fs).ready, "feed and pipe are specified: it solves");
  // a block can be changed into a pipe too (same ports as a valve)
  const asPipe = setBlockType(addBlock(base(), "valve").fs, "VLV1", "pipe");
  assert.equal(asPipe.blocks.find(x => x.type === "pipe").id, "PI1");
});

test("the palette block gives the same result as runUnit('pipe') called directly", () => {
  const spec = { length_m: 250, diameter_m: 0.04, roughness_m: 4.5e-5, elevation_m: 5, fittings: [{ fitting: "elbow-90", count: 3 }, { K: 0.5, count: 1 }], heat: "adiabatic", segments: 40 };
  const { fs, id } = drawn(undefined, spec);
  const r = runFlowsheet(fs);
  const viaFlowsheet = r.blocks[id];
  const direct = runUnit("pipe", { sys: water, inlets: { in: stream(water, { flow_kmol_h: [100], T_K: 298.15, P_kPa: 500 }) }, spec });
  for (const k of ["dP_kPa", "dP_friction_kPa", "dP_fittings_kPa", "dP_elevation_kPa", "Re_in", "friction_factor_in", "velocity_out_m_s", "T_out_K"]) {
    assert.ok(rel(viaFlowsheet.state[k], direct.state[k]) < 1e-12, `${k}: ${viaFlowsheet.state[k]} vs ${direct.state[k]}`);
  }
  // the workspace sends the same spec for the same settings
  const p = { ...PIPE_DEFAULTS, ...spec };
  assert.deepEqual(pipeSpec(p), spec);
  // the rows of the Results panel come from that state, and the parts of the drop are listed
  const rows = pipeBlockRows(viaFlowsheet.state, { u: { P: "kPa", T: "K" }, fmtP: (v, u) => `${v} ${u.P}`, fmtTemp: v => `${v} K` });
  assert.deepEqual(rows.map(x => x[0]), ["Outlet temperature", "Outlet pressure", "Pressure drop", "  Friction", "  Fittings", "  Elevation", "  Acceleration",
    "Velocity, inlet to outlet", "Reynolds number, inlet", "Flow regime", "Friction factor (Darcy), inlet"]);
});

test("a refusal reaches the block with the engine's reason: a two-phase inlet that chokes", () => {
  // water at its normal boiling point with a vapour fraction of 0.5: two phases. Refused as two-phase when this test was
  // written; since the two-phase step of proposal 0020 (Lockhart-Martinelli, docs/decisions/2026-11-10-06-pipe-two-phase.md)
  // gas-liquid flow is computed, but this one (half steam at 1 atm, 255 kg/(m² s) in the 5 cm default pipe) reaches
  // critical (choked) flow within the pipe, which is refused with the reason
  const { fs, id } = drawn({ flow_kmol_h: { water: 100 }, P_kPa: 101.325, VF: 0.5 });
  const direct = (() => { try { runUnit("pipe", { sys: water, inlets: { in: stream(water, { flow_kmol_h: [100], P_kPa: 101.325, VF: 0.5 }) }, spec: fs.blocks.find(b => b.id === id).spec }); } catch (e) { return e; } })();
  assert.equal(direct?.code, "NOT_AVAILABLE");
  let msg = "";
  try { const r = runFlowsheet(fs); msg = JSON.stringify(r.blocks?.[id]?.error ?? r.message ?? r); } catch (e) { msg = e.message; }
  assert.ok(msg.includes("gas-liquid"), msg);
  assert.ok(msg.includes("choked"), msg);
});

// ---- the project file: format 8 --------------------------------------------------------------------------------------

test("format 8 is the format of a project with a pipe; every other project keeps its format", () => {
  assert.equal(PROJECT_FORMAT, 8);
  const plain = initialState({ components: ["ethanol", "water"] });
  assert.equal(projectOf(plain).fugacity_project, 2);
  assert.equal(projectOf(plain).workbench.pipe, undefined);
  // opening the Pipe view or changing a setting is a pipe in use
  assert.equal(projectOf(initialState({ components: ["water"], start: "pipe" })).fugacity_project, 8);
  assert.equal(projectOf(applyPatch(plain, { pipe: { length_m: 10 } })).fugacity_project, 8);
});

test("round trip: the Pipe workspace's settings and components are saved and opened again", () => {
  let s = initialState({ components: ["ethanol", "water"], start: "pipe" });
  s = applyPatch(s, { inputs: { pipe: ["methane"] } });
  s = applyPatch(s, { pipe: { feed: { flow: 12.5, basis: "kg/h", T_K: 310.15, P_kPa: 3000, z: null }, length_m: 321.5, diameter_m: 0.0525, roughness_m: 0, elevation_m: -4,
    fittings: [{ fitting: "gate-valve", count: 2 }, { K: 0.75, count: 1 }, { L_D: 25, count: 3 }], heat: "U", U_W_m2K: 12.5, T_ambient_K: 288.15, segments: 40,
    friction_factor: 0.02, viscosity_Pa_s: 1.1e-5 } });
  const doc = projectOf(s, { version: "test" });
  assert.equal(doc.fugacity_project, 8);
  assert.deepEqual(doc.workbench.pipe.components, ["methane"]);
  assert.equal(doc.workbench.inputs.pipe, undefined, "the components are saved with the pipe, not twice");
  const back = stateFromProject(projectText(doc));
  assert.deepEqual(back.pipe, s.pipe);
  assert.deepEqual(back.inputs.pipe, ["methane"]);
  assert.equal(back.view, "pipe");
  // and again: the file is stable
  assert.deepEqual(projectOf(back, { version: "test", now: new Date(doc.saved_at) }).workbench.pipe, doc.workbench.pipe);
  assert.ok(checkProject(projectText(doc)).ok);
});

test("round trip: a project that opened on the Pipe with the defaults gets the defaults back", () => {
  const s = initialState({ components: ["water"], start: "pipe" });
  const back = stateFromProject(projectText(projectOf(s)));
  assert.deepEqual(back.pipe, PIPE_DEFAULTS);
  assert.deepEqual(back.inputs.pipe, ["water"]);
});

test("round trip: a flowsheet with a pipe block is written as format 8 and solves again from the file", () => {
  const { fs, id } = drawn(undefined, { fittings: [{ fitting: "elbow-90", count: 2 }], elevation_m: 3 });
  let s = applyPatch(initialState({ components: ["water"] }), { workspace: "flowsheet" });
  s = applyPatch(s, { flowsheet: fs });
  const doc = projectOf(s);
  assert.equal(doc.fugacity_project, 8);
  const back = stateFromProject(projectText(doc));
  assert.deepEqual(back.flowsheet.blocks.find(b => b.id === id).spec, fs.blocks.find(b => b.id === id).spec);
  assert.ok(rel(runFlowsheet(back.flowsheet).blocks[id].state.dP_kPa, runFlowsheet(fs).blocks[id].state.dP_kPa) < 1e-12);
  assert.ok(checkProject(projectText(doc)).ok);
});

test("an older format cannot hold a pipe: the reader says so, naming the format", () => {
  const s = applyPatch(initialState({ components: ["water"] }), { pipe: { length_m: 10 } });
  const doc = projectOf(s);
  assert.throws(() => readProject({ ...doc, fugacity_project: 7 }), /Pipe.*needs format 8 \(this file says format 7\)/);
  const withBlock = projectOf(applyPatch(applyPatch(initialState({ components: ["water"] }), { workspace: "flowsheet" }), { flowsheet: drawn().fs }));
  assert.throws(() => readProject({ ...withBlock, fugacity_project: 7 }), /needs format 8/);
  // a wrong value in the saved settings is named, not ignored
  const bad = JSON.parse(projectText(doc)); bad.workbench.pipe.length_m = -3;
  assert.throws(() => stateFromProject(bad), /pipe\.length_m must be a positive number/);
  bad.workbench.pipe = "no";
  assert.throws(() => stateFromProject(bad), /workbench\.pipe must be an object/);
});
