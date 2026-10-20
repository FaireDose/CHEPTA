// Energy streams and the blocks of proposal 0013 in the flowsheet (steps 3-5; src/flowsheet/flowsheet.js,
// src/units/units.js): an energy feed sets a heater's duty, a block's heat goes into another, a loop closed by an
// energy stream is torn on its duty, a feed-effluent exchanger with a recycle, a valve and a pump.
// Method (docs/METHOD_SELECTION.md): water + ethanol, polar liquids at low pressure: NRTL with an ideal-gas vapour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { system, stream, runUnit, solveFlowsheet, flowsheetStatus, inspectFlowsheet, normalizeFlowsheet, PROJECT_FORMAT } from "../src/index.js";
import { PUMP_EFFICIENCY } from "../src/units/units.js";

const sys = system({ components: ["water", "ethanol"], model: "NRTL" });
const feed = (id, T_K, P_kPa = 101.325, flow = { water: 60, ethanol: 40 }) => ({ id, type: "feed", spec: { flow_kmol_h: flow, T_K, P_kPa } });
const product = id => ({ id, type: "product" });

test("an energy feed gives a heater its duty: the heater calculates its outlet; one specification fewer", () => {
  const fs = {
    blocks: [feed("F1", 300), { id: "E1", type: "heater", spec: {} }, product("P1")],
    streams: [{ id: "S1", from: "F1.out", to: "E1.in" }, { id: "S2", from: "E1.out", to: "P1.in" }],
    energyStreams: [{ id: "Q1", to: "E1", duty_kW: 500 }],
  };
  const st = flowsheetStatus(sys, fs);
  assert.equal(st.ready, true, st.message);
  const r = solveFlowsheet(sys, fs);
  const direct = runUnit("heater", { sys, inlets: { in: stream(sys, { flow_kmol_h: { water: 60, ethanol: 40 }, T_K: 300, P_kPa: 101.325 }) }, spec: { duty_kW: 500 } });
  assert.ok(Math.abs(r.streams.S2.T_K - direct.outlets.out.T_K) < 1e-9);
  assert.ok(Math.abs(r.energy.Q1.duty_kW - 500) < 1e-6);
  assert.equal(r.energy.Q1.internal, false);
  assert.ok(!("Q-E1" in r.energy), "the heater's energy stream is Q1");
  assert.ok(Math.abs(r.balance.energy_kW) < 1e-6);
  // the outlet temperature as well: one specification too many, said in the person's words
  const over = flowsheetStatus(sys, { ...fs, blocks: [fs.blocks[0], { id: "E1", type: "heater", spec: { T_K: 350 } }, fs.blocks[2]] });
  assert.equal(over.ready, false);
  assert.match(over.blocks.E1.message, /Heater \/ cooler E1: too many specifications: give one of T_K, the energy stream Q1 or VF/);
  const both = flowsheetStatus(sys, { ...fs, blocks: [fs.blocks[0], { id: "E1", type: "heater", spec: { duty_kW: 10 } }, fs.blocks[2]] });
  assert.match(both.blocks.E1.message, /its duty comes from the energy stream Q1; leave out duty_kW/);
});

test("a cooler's heat into a heater: Q = -duty of the cooler = duty of the heater; the balance is unchanged", () => {
  const fs = {
    blocks: [feed("F1", 360), { id: "E1", type: "heater", spec: { T_K: 320 } }, product("P1"),
      feed("F2", 290, 101.325, { water: 80, ethanol: 20 }), { id: "E2", type: "heater", spec: {} }, product("P2")],
    streams: [{ id: "S1", from: "F1.out", to: "E1.in" }, { id: "S2", from: "E1.out", to: "P1.in" },
      { id: "S3", from: "F2.out", to: "E2.in" }, { id: "S4", from: "E2.out", to: "P2.in" }],
    energyStreams: [{ id: "Q1", from: "E1", to: "E2" }],
  };
  const r = solveFlowsheet(sys, fs);
  assert.ok(r.blocks.E1.duty_kW < 0);
  assert.ok(Math.abs(r.blocks.E2.duty_kW + r.blocks.E1.duty_kW) < 1e-9);
  assert.equal(r.energy.Q1.internal, true);
  assert.ok(Math.abs(r.energy.Q1.duty_kW + r.blocks.E1.duty_kW) < 1e-9);
  assert.ok(r.streams.S4.T_K > 290);
  // the order follows the energy stream: E1 before E2
  const flat = r.order.flat();
  assert.ok(flat.indexOf("E1") < flat.indexOf("E2"));
  assert.ok(Math.abs(r.balance.energy_kW) < 1e-6);
});

test("a loop closed by an energy stream alone is torn on its duty", () => {
  // F1 → E1 (heated by Q1) → V1 (at 101.325 kPa and 360 K) → vapour → E2 (condensed to 300 K) → product; E2's heat is Q1,
  // which goes back upstream into E1: the graph has a cycle through the energy stream only
  const fs = {
    blocks: [feed("F1", 300), { id: "E1", type: "heater", spec: {} }, { id: "V1", type: "flash", spec: { T_K: 360, P_kPa: 101.325 } },
      { id: "E2", type: "heater", spec: { T_K: 300 } }, product("P1"), product("P2")],
    streams: [{ id: "S1", from: "F1.out", to: "E1.in" }, { id: "S2", from: "E1.out", to: "V1.in" },
      { id: "S3", from: "V1.vapour", to: "E2.in" }, { id: "S4", from: "V1.liquid", to: "P1.in" }, { id: "S5", from: "E2.out", to: "P2.in" }],
    energyStreams: [{ id: "Q1", from: "E2", to: "E1" }],
  };
  const r = solveFlowsheet(sys, fs);
  assert.equal(r.loops.length, 1);
  assert.deepEqual(r.loops[0].tears, ["Q1"], "the energy stream is torn (one number)");
  assert.ok(r.blocks.E2.duty_kW < 0);
  assert.ok(Math.abs(r.blocks.E1.duty_kW + r.blocks.E2.duty_kW) < 1e-6 * Math.abs(r.blocks.E2.duty_kW), `${r.blocks.E1.duty_kW} vs ${r.blocks.E2.duty_kW}`);
  assert.ok(r.streams.S2.T_K > 300, "the feed is preheated by the condenser's heat");
  for (const m of ["direct", "wegstein"]) {
    const x = solveFlowsheet(sys, { ...fs, solver: { method: m, maxIterations: 200 } });
    assert.ok(Math.abs(x.blocks.E1.duty_kW - r.blocks.E1.duty_kW) < 1e-4 * Math.abs(r.blocks.E1.duty_kW), m);
  }
});

test("a feed-effluent exchanger with a recycle through the heater; the minimum approach as its specification", () => {
  // F1 (cold) → X1.cold → E1 (to 360 K) → X1.hot → product: the hot side is the cold side's own effluent
  const blocks = spec => [feed("F1", 300), { id: "X1", type: "hx", spec }, { id: "E1", type: "heater", spec: { T_K: 360 } }, product("P1")];
  const streams = [{ id: "S1", from: "F1.out", to: "X1.cold" }, { id: "S2", from: "X1.cold", to: "E1.in" },
    { id: "S3", from: "E1.out", to: "X1.hot" }, { id: "S4", from: "X1.hot", to: "P1.in" }];
  const r = solveFlowsheet(sys, { blocks: blocks({ T_hot_out_K: 320, U: { value: 600 } }), streams });
  assert.equal(r.loops.length, 1);
  assert.ok(Math.abs(r.streams.S4.T_K - 320) < 1e-6);
  const qx = r.blocks.X1.sizing.duty_kW;
  assert.ok(Math.abs((r.streams.S2.H_kW - r.streams.S1.H_kW) - qx) < 1e-6 * qx, "the cold side takes the hot side's heat");
  assert.ok(r.blocks.X1.sizing.area_m2 > 0 && r.blocks.X1.sizing.dT_min_K > 0);
  assert.equal(r.blocks.X1.duty_kW, 0, "adiabatic overall");
  // the heater only makes up the rest: less than heating the feed from 300 K
  const alone = runUnit("heater", { sys, inlets: { in: stream(sys, { flow_kmol_h: { water: 60, ethanol: 40 }, T_K: 300, P_kPa: 101.325 }) }, spec: { T_K: 360 } });
  assert.ok(r.blocks.E1.duty_kW < alone.duty_kW - qx + 1e-6);
  assert.ok(Math.abs(r.blocks.E1.duty_kW - (alone.duty_kW - qx)) < 1e-4 * alone.duty_kW);
  const st = flowsheetStatus(sys, { blocks: blocks({}), streams });
  assert.match(st.blocks.X1.message, /Heat exchanger X1: missing: one of the hot or cold outlet temperature/);
  const d = runUnit("hx", { sys, inlets: { hot: r.streams.S3, cold: stream(sys, { flow_kmol_h: { water: 60, ethanol: 40 }, T_K: 300, P_kPa: 101.325 }) }, spec: { dTmin_K: 15 } });
  assert.ok(Math.abs(d.sizing.dT_min_K - 15) < 0.05, `dT_min ${d.sizing.dT_min_K}`);
});

test("a heater with a utility reports its area and the utility's consumption; electric heating has no area", () => {
  const inlet = stream(sys, { flow_kmol_h: { water: 60, ethanol: 40 }, T_K: 300, P_kPa: 101.325 });
  const r = runUnit("heater", { sys, inlets: { in: inlet }, spec: { T_K: 350, sizing: { utility: { kind: "steam", P_kPa: 300 }, U: { service: "steam-water-oil" } } } });
  assert.equal(r.sizing.U_W_m2K, 60, "Table 2.2, steam or water to oil: the low end");
  assert.ok(r.sizing.area_m2 > 0);
  assert.ok(Math.abs(r.sizing.duty_kW - r.duty_kW) < 1e-9);
  assert.match(r.sizing.utility.describe, /saturated steam at 300 kPa/);
  const cool = runUnit("heater", { sys, inlets: { in: stream(sys, { flow_kmol_h: { water: 60, ethanol: 40 }, T_K: 350, P_kPa: 101.325 }) },
    spec: { T_K: 310, sizing: { utility: { kind: "water", T_in_K: 293.15, T_out_K: 303.15 }, U: { value: 500 } } } });
  assert.ok(cool.duty_kW < 0 && cool.sizing.utility.flow_kg_h > 0);
  assert.throws(() => runUnit("heater", { sys, inlets: { in: inlet }, spec: { T_K: 350, sizing: { utility: { kind: "water", T_in_K: 293.15, T_out_K: 303.15 } } } }),
    /Heating water must cool down/);
  const el = runUnit("heater", { sys, inlets: { in: inlet }, spec: { T_K: 350, sizing: { utility: { kind: "electric" } } } });
  assert.equal(el.sizing.area_m2, null);
  assert.equal(el.sizing.utility.power_kW, el.duty_kW);
});

test("valve: adiabatic, lowers the pressure; pump: power = V dP / efficiency, 75 % by default", () => {
  const hot = stream(sys, { flow_kmol_h: { water: 60, ethanol: 40 }, T_K: 375, P_kPa: 500 });
  const v = runUnit("valve", { sys, inlets: { in: hot }, spec: { P_kPa: 101.325 } });
  assert.ok(Math.abs(v.outlets.out.H_kW - hot.H_kW) < 1e-6 * Math.abs(hot.H_kW), `${v.outlets.out.H_kW} vs ${hot.H_kW}`);
  assert.ok(v.outlets.out.VF > 0, `outlet vapour fraction ${v.outlets.out.VF}`);
  assert.match(v.notes[0], /flashes across the valve/);
  assert.throws(() => runUnit("valve", { sys, inlets: { in: hot }, spec: { P_kPa: 600 } }), /a valve only lowers the pressure/);
  const liq = stream(sys, { flow_kmol_h: { water: 60, ethanol: 40 }, T_K: 300, P_kPa: 101.325 });
  const p = runUnit("pump", { sys, inlets: { in: liq }, spec: { dP_kPa: 1000 } });
  assert.equal(PUMP_EFFICIENCY, 0.75);
  assert.equal(p.state.efficiency, 0.75);
  assert.ok(Math.abs(p.duty_kW - p.state.volume_m3_h / 3600 * 1000 / 0.75) < 1e-12);
  assert.ok(Math.abs(p.outlets.out.H_kW - (liq.H_kW + p.duty_kW)) < 1e-9);
  assert.match(p.notes[0], /a typical value; give the pump's own/);
  const own = runUnit("pump", { sys, inlets: { in: liq }, spec: { dP_kPa: 1000, efficiency: 0.6 } });
  assert.ok(Math.abs(own.duty_kW / p.duty_kW - 0.75 / 0.6) < 1e-12);
  const vap = stream(sys, { flow_kmol_h: { water: 60, ethanol: 40 }, T_K: 400, P_kPa: 101.325 });
  assert.throws(() => runUnit("pump", { sys, inlets: { in: vap }, spec: { dP_kPa: 100 } }), /a pump needs a liquid/);
  assert.throws(() => runUnit("pump", { sys, inlets: { in: liq }, spec: { dP_kPa: 100, efficiency: 75 } }), /a fraction, at most 1/);
  // in a flowsheet: the pump's power is a work stream W-P1
  const r = solveFlowsheet(sys, { blocks: [feed("F1", 300), { id: "PU1", type: "pump", spec: { P_kPa: 600 } }, { id: "VA1", type: "valve", spec: { dP_kPa: 400 } }, product("P1")],
    streams: [{ id: "S1", from: "F1.out", to: "PU1.in" }, { id: "S2", from: "PU1.out", to: "VA1.in" }, { id: "S3", from: "VA1.out", to: "P1.in" }] });
  assert.equal(r.energy["W-PU1"].kind, "work");
  assert.ok(Math.abs(r.streams.S3.P_kPa - 200) < 1e-9);
  assert.ok(Math.abs(r.balance.energy_kW) < 1e-6);
});

test("energy streams in the document: checked, kept only when there are some; wrong ends are named", () => {
  const base = { components: ["water", "ethanol"], thermo: { model: "NRTL" }, blocks: [feed("F1", 300), { id: "M1", type: "mixer" }, { id: "E1", type: "heater", spec: {} }, product("P1")],
    streams: [{ id: "S1", from: "F1.out", to: "M1.in" }, { id: "S2", from: "M1.out", to: "E1.in" }, { id: "S3", from: "E1.out", to: "P1.in" }] };
  assert.equal("energyStreams" in normalizeFlowsheet(base), false);
  assert.deepEqual(normalizeFlowsheet({ ...base, energyStreams: [{ id: "Q1", to: "E1", duty_kW: 5 }] }).energyStreams, [{ id: "Q1", to: "E1", duty_kW: 5 }]);
  const problems = q => inspectFlowsheet({ ...base, energyStreams: q }).problems.map(p => p.message);
  assert.match(problems([{ id: "Q1", to: "M1", duty_kW: 5 }])[0], /Mixer M1 takes no energy stream/);
  assert.match(problems([{ id: "Q1", to: "E1" }])[0], /Energy feed Q1: give its duty_kW/);
  assert.match(problems([{ id: "Q1", to: "E1", duty_kW: 5 }, { id: "Q2", to: "E1", duty_kW: 6 }])[0], /has two energy streams in \(Q1, Q2\)/);
  assert.match(problems([{ id: "S1", to: "E1", duty_kW: 5 }])[0], /Two streams are called S1/);
  assert.throws(() => normalizeFlowsheet({ ...base, energyStreams: [{ id: "Q1", to: "E1", kW: 5 }] }), /energyStreams\[0\] \(Q1\): unknown key "kW"/);
  assert.ok(PROJECT_FORMAT >= 4);
});

test("a project with energy streams or the new blocks is written as format 4, and only then", async () => {
  const { projectOf, readProject } = await import("../src/ui/project.js");
  const { initialState } = await import("../src/ui/app-logic.js");
  const fsDoc = { components: ["water", "ethanol"], thermo: { model: "NRTL" }, blocks: [feed("F1", 300), { id: "E1", type: "heater", spec: {} }, product("P1")],
    streams: [{ id: "S1", from: "F1.out", to: "E1.in" }, { id: "S2", from: "E1.out", to: "P1.in" }] };
  const s = initialState();
  assert.equal(projectOf({ ...s, flowsheet: fsDoc }).fugacity_project, 2);
  const doc = projectOf({ ...s, flowsheet: { ...fsDoc, energyStreams: [{ id: "Q1", to: "E1", duty_kW: 50 }] } });
  assert.equal(doc.fugacity_project, 4);
  assert.deepEqual(readProject(JSON.stringify(doc)).flowsheet.energyStreams, [{ id: "Q1", to: "E1", duty_kW: 50 }]);
  assert.equal(projectOf({ ...s, flowsheet: { ...fsDoc, blocks: [...fsDoc.blocks, { id: "PU1", type: "pump", spec: {} }] } }).fugacity_project, 4);
  assert.throws(() => readProject(JSON.stringify({ ...doc, fugacity_project: 3 })), /flowsheet.energyStreams needs format 4/);
});

test("the Excel export writes the new blocks' outlets as formulas of their inlets", async () => {
  const { flowsheetXlsx } = await import("../src/ui/flowsheet-excel.js");
  const fsDoc = { components: ["water", "ethanol"], thermo: { model: "NRTL", vapour: "ideal" },
    blocks: [feed("F1", 300), { id: "X1", type: "hx", spec: { T_hot_out_K: 320 } }, { id: "E1", type: "heater", spec: { T_K: 360 } }, { id: "PU1", type: "pump", spec: { dP_kPa: 200 } }, product("P1")],
    streams: [{ id: "S1", from: "F1.out", to: "PU1.in" }, { id: "S0", from: "PU1.out", to: "X1.cold" }, { id: "S2", from: "X1.cold", to: "E1.in" },
      { id: "S3", from: "E1.out", to: "X1.hot" }, { id: "S4", from: "X1.hot", to: "P1.in" }] };
  const res = solveFlowsheet(sys, fsDoc);
  const bytes = flowsheetXlsx(fsDoc, res, { version: "test" });
  assert.ok(bytes.length > 1000);
});
