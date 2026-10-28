// The Heat exchanger workspace (proposal 0013, step 2; src/ui/hx-logic.js): its settings, the calculation it asks the
// engine for, and the project file (format 4, only when the workspace was used).
// Method (docs/METHOD_SELECTION.md): ethanol + water, polar liquids at low pressure: NRTL with an ideal-gas vapour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { system, stream, exchangerArea } from "../src/index.js";
import { HX_DEFAULTS, normalizeHx, hxCalc, streamZ, uRequest } from "../src/ui/hx-logic.js";
import { initialState, applyPatch, hxSetups, viewCheck } from "../src/ui/app-logic.js";
import { projectOf, stateFromProject } from "../src/ui/project.js";
import { WORKSPACES, SECTIONS } from "../src/ui/workspaces.js";

const sys = system({ components: ["ethanol", "water"], model: "NRTL" });

test("the defaults: a liquid heated from 25 to 60 °C by steam at 300 kPa, U of Table 2.2 at its low end", () => {
  const { result: r, wall } = hxCalc(sys, HX_DEFAULTS);
  const feed = stream(sys, { flow_kmol_h: [50, 50], T_K: 298.15, P_kPa: 101.325 });
  const direct = exchangerArea(sys, { hot: { utility: { kind: "steam", P_kPa: 300 } }, cold: { stream: feed, T_out_K: 333.15 }, U: { service: "steam-water-oil", pick: "low" } });
  assert.ok(Math.abs(r.area_m2 - direct.area_m2) < 1e-9 * direct.area_m2);
  assert.equal(r.U_W_m2K, 60);
  assert.equal(wall, null, "no allowable stress given: no wall thickness");
  assert.match(r.hot.describe, /saturated steam at 300 kPa/);
});

test("settings: merged, checked; two streams, electric heating, a wall, U from films", () => {
  const two = normalizeHx({ mode: "two", spec: { kind: "duty_kW", value: 100 }, U: { source: "value", value: 400 } });
  const r = hxCalc(sys, two).result;
  assert.ok(Math.abs(r.duty_kW - 100) < 1e-9 && Math.abs(r.area_m2 - r.UA_kW_K * 1000 / 400) < 1e-9);
  const el = hxCalc(sys, normalizeHx({ utility: { kind: "electric" } }));
  assert.equal(el.result, null);
  assert.ok(el.electric.power_kW > 0);
  const w = hxCalc(sys, normalizeHx({ wall: { S_MPa: 100 } })).wall;
  assert.ok(w.t_mm > 0 && /Lamé/.test(w.method));
  const film = normalizeHx({ U: { source: "film" } });
  assert.deepEqual(uRequest(film.U).film.wall, { material: "stainless-316", t_mm: 2 });
  assert.ok(hxCalc(sys, film).result.U_W_m2K > 60);
  assert.throws(() => normalizeHx({ mode: "rating" }), /hx.mode must be "utility" or "two"/);
  assert.throws(() => normalizeHx({ U: { service: "glass-lined" } }), /not a row of Table 2.2/);
  assert.throws(() => hxCalc(sys, normalizeHx({ utility: { kind: "water", T_in_K: 303.15, T_out_K: 313.15 } })), /Heating water must cool down/);
  assert.deepEqual(streamZ(null, 3), [1 / 3, 1 / 3, 1 / 3]);
  assert.deepEqual(streamZ([1, 3], 2), [0.25, 0.75]);
});

test("the workspace sits in Unit models; it is saved (format 4) only once it was used, with its components", () => {
  assert.ok(WORKSPACES.some(w => w.id === "hx"));
  // the Reactor workspace follows it since 2026-10-28
  assert.deepEqual(SECTIONS.find(s => s.id === "units").workspaces, ["flash", "hx", "reactor"]);
  const s0 = initialState({ components: ["ethanol", "water"], start: "hx" });
  assert.equal(s0.workspace, "hx");
  assert.equal(s0.hx, null);
  assert.equal(projectOf(s0).fugacity_project, 2);
  const s1 = applyPatch(applyPatch(s0, { hx: { process: { T_out_K: 340 } } }), { inputs: { hx: ["water"] } });
  const doc = projectOf(s1);
  assert.equal(doc.fugacity_project, 4);
  assert.deepEqual(doc.workbench.hx.components, ["water"]);
  assert.equal("hx" in doc.workbench.inputs, false, "the inputs of format 3 stay as they were");
  const back = stateFromProject(JSON.parse(JSON.stringify(doc)));
  assert.equal(back.hx.process.T_out_K, 340);
  assert.deepEqual(back.inputs.hx, ["water"]);
});

test("a process exchanger: each stream with its own components (at most 3) and method, as the two never mix", () => {
  // Methods (docs/METHOD_SELECTION.md): water alone, a pure liquid: an activity model reduces to its vapour pressure
  // (NRTL, ideal-gas vapour); n-hexane, a hydrocarbon: Peng–Robinson
  let st = initialState({ start: "hx", components: ["water", "ethanol"] });
  st = applyPatch(st, { hx: { mode: "two", hot: { components: ["water"], T_K: 393.15, P_kPa: 300 }, cold: { components: ["n-hexane"], model: "PR", T_K: 298.15 },
    spec: { kind: "T_hot_out_K", value: 333.15 } } });
  const S = hxSetups(st);
  assert.deepEqual([S.hot.ids, S.hot.model, S.cold.ids, S.cold.model], [["water"], "NRTL", ["n-hexane"], "PR"]);
  assert.deepEqual(viewCheck(st), { ok: true, use: ["water", "n-hexane"], problems: [] });
  assert.deepEqual(st.components, ["water", "n-hexane"]);
  const sh = system({ components: ["water"], model: "NRTL" }), sc = system({ components: ["n-hexane"], model: "PR" });
  const r = hxCalc(sh, st.hx, { hot: sh, cold: sc }).result;
  // the duty from the hot stream alone (its own system), the cold outlet from the hexane's own
  const hot = stream(sh, { flow_kmol_h: [100], T_K: 393.15, P_kPa: 300 }), hotOut = stream(sh, { flow_kmol_h: [100], T_K: 333.15, P_kPa: 300 });
  assert.ok(Math.abs(r.duty_kW - (hot.H_kW - hotOut.H_kW)) < 1e-9);
  const cold = stream(sc, { flow_kmol_h: [100], T_K: 298.15, P_kPa: 101.325 });
  assert.ok(Math.abs(stream(sc, { flow_kmol_h: [100], T_K: r.cold.T_out_K, P_kPa: 101.325 }).H_kW - cold.H_kW - r.duty_kW) < 1e-6 * r.duty_kW);
  // the minimum approach with the two systems
  const a = hxCalc(sh, { ...st.hx, spec: { kind: "dTmin_K", value: 10 } }, { hot: sh, cold: sc }).result;
  assert.ok(Math.abs(a.dT_min_K - 10) < 0.05, `${a.dT_min_K}`);
  // a stream's problems are named by stream; until chosen, a stream takes the workspace's components and model
  const gas = applyPatch(st, { hx: { cold: { model: "NRTL", components: ["n-hexane", "methane"] } } });
  assert.equal(viewCheck(gas).ok, false);
  assert.ok(viewCheck(gas).problems.every(p => p.stream === "cold" && /^Cold stream: /.test(p.message)), JSON.stringify(viewCheck(gas).problems));
  assert.deepEqual(hxSetups(applyPatch(initialState({ start: "hx", components: ["water", "ethanol"] }), { hx: { mode: "two" } })).hot.ids, ["water", "ethanol"]);
  assert.throws(() => normalizeHx({ hot: { components: ["water", "ethanol", "methanol", "acetone"] } }), /at most 3 components/);
});
