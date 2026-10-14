// One component: a pure substance heated, cooled, boiled or let down (the maintainer, 2026-10-14: "in the flowsheet of
// the workbench should be able to put only one component as well, not minimum 2"). A pure substance has two phases only
// on its saturation curve, at one temperature for a given pressure; between the saturated liquid and vapour the
// enthalpy sets the vapour fraction.
// References:
//  - equations of state: the saturation temperature and enthalpy of vaporization of CoolProp's own Peng-Robinson and
//    SRK backends (validation/python/reference_pure_flash.py -> validation/fixtures/pure-flash.json), with the same
//    critical constants and acentric factors;
//  - activity models: with one component the activity coefficient is 1, so the saturation temperature is the
//    vapour-pressure record's (pure().Tb_K at 101.325 kPa) and the enthalpy of vaporization the record's.
// Method (docs/METHOD_SELECTION.md): a cubic equation of state for the light hydrocarbons and, here on purpose to test
// the code path, for water; an activity model (any one, they all reduce to the pure component) for liquid water.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, pure, solveFlowsheet } from "../src/index.js";
import { checkInputs } from "../src/ui/workspaces.js";

const ref = JSON.parse(readFileSync(new URL("../validation/fixtures/pure-flash.json", import.meta.url)));
const comps = JSON.parse(readFileSync(new URL("../src/data/components.json", import.meta.url))).components;

test("equations of state: saturation temperature and enthalpy of vaporization of a pure component, as CoolProp", () => {
  for (const c of ref.cases) {
    // the same constants as the reference
    assert.equal(comps[c.component].Tc_K, c.Tc_K);
    assert.equal(comps[c.component].Pc_Pa, c.Pc_Pa);
    assert.ok(Math.abs(comps[c.component].omega - c.omega) < 1e-6);
    const s = system({ components: [c.component], model: c.model });
    const L = s.flash({ z: [1], P: c.P_kPa, VF: 0 }), V = s.flash({ z: [1], P: c.P_kPa, VF: 1 });
    const what = `${c.component} ${c.model} ${c.P_kPa} kPa`;
    assert.ok(Math.abs(L.T - c.Tsat_K) < 1e-3 && Math.abs(V.T - c.Tsat_K) < 1e-3, `${what}: Tsat ${L.T}`);
    assert.ok(Math.abs((V.H_J_mol - L.H_J_mol) / c.dHvap_J_mol - 1) < 1e-4, `${what}: dHvap ${V.H_J_mol - L.H_J_mol}`);
    // T-VF at the saturation temperature gives back the pressure
    const tv = s.flash({ z: [1], T: c.Tsat_K, VF: 0.5 });
    assert.ok(Math.abs(tv.P / c.P_kPa - 1) < 1e-5, `${what}: Psat ${tv.P}`);
  }
});

test("a P-H flash of a pure component: on the saturation curve between liquid and vapour, one phase outside", () => {
  for (const model of ["PR", "NRTL", "ideal"]) {
    const s = system({ components: ["water"], model });
    const P = 101.325;
    const L = s.flash({ z: [1], P, VF: 0 }), V = s.flash({ z: [1], P, VF: 1 });
    for (const f of [0.1, 0.5, 0.9]) {
      const r = s.flash({ z: [1], P, H: L.H_J_mol + f * (V.H_J_mol - L.H_J_mol) });
      assert.ok(Math.abs(r.T - L.T) < 1e-6, `${model}: T ${r.T} on the saturation curve`);
      assert.ok(Math.abs(r.VF - f) < 1e-6, `${model}: VF ${r.VF} for ${f}`);
    }
    const sub = s.flash({ z: [1], P, H: L.H_J_mol - 2000 }), sup = s.flash({ z: [1], P, H: V.H_J_mol + 2000 });
    assert.ok(sub.VF === 0 && sub.T < L.T - 1, `${model}: subcooled liquid at ${sub.T}`);
    assert.ok(sup.VF === 1 && sup.T > V.T + 1, `${model}: superheated vapour at ${sup.T}`);
    // the T-P flash at the T found gives back the same enthalpy
    assert.ok(Math.abs(s.flash({ z: [1], T: sub.T, P }).H_J_mol - sub.H_J_mol) < 1e-3);
    assert.ok(Math.abs(s.flash({ z: [1], T: sup.T, P }).H_J_mol - sup.H_J_mol) < 1e-3);
  }
  // activity models: the saturation temperature is the vapour-pressure record's
  const Tb = pure("water").Tb_K;
  assert.ok(Math.abs(system({ components: ["water"], model: "NRTL" }).flash({ z: [1], P: 101.325, VF: 0.5 }).T - Tb) < 0.01);
});

test("above the critical point a pure component has one phase, and says so when asked for a vapour fraction", () => {
  const s = system({ components: ["water"], model: "PR" });
  assert.throws(() => s.flash({ z: [1], P: 30000, VF: 0.5 }), /no vapour fraction above its critical point/);
  const at = s.flash({ z: [1], P: 30000, T: 700 });
  assert.ok(Math.abs(s.flash({ z: [1], P: 30000, H: at.H_J_mol }).T - 700) < 1e-4);
});

test("a flowsheet of one component: water heated to half vapour, then superheated, then flashed", () => {
  for (const model of ["NRTL", "PR"]) {
    const sys = system({ components: ["water"], model });
    const r = solveFlowsheet(sys, {
      blocks: [
        { id: "F1", type: "feed", spec: { flow_kmol_h: { water: 100 }, T_K: 300, P_kPa: 101.325 } },
        { id: "H1", type: "heater", spec: { P_kPa: 101.325, VF: 0.5 } },
        { id: "H2", type: "heater", spec: { P_kPa: 101.325, T_K: 420 } },
        { id: "D1", type: "flash", spec: { P_kPa: 101.325, VF: 0.3 } },
        { id: "P1", type: "product" }, { id: "P2", type: "product" },
      ],
      streams: [
        { id: "S1", from: "F1.out", to: "H1.in" }, { id: "S2", from: "H1.out", to: "H2.in" },
        { id: "S3", from: "H2.out", to: "D1.in" }, { id: "S4", from: "D1.vapour", to: "P1.in" },
        { id: "S5", from: "D1.liquid", to: "P2.in" },
      ],
    });
    const Tsat = sys.flash({ z: [1], P: 101.325, VF: 0 }).T;
    assert.ok(Math.abs(r.streams.S2.T_K - Tsat) < 1e-6 && Math.abs(r.streams.S2.VF - 0.5) < 1e-9, `${model}: heater 1 outlet`);
    assert.equal(r.streams.S3.VF, 1);
    // each heater's duty is the enthalpy rise of its stream
    for (const [b, a, c] of [["H1", "S1", "S2"], ["H2", "S2", "S3"], ["D1", "S3", null]]) {
      const out = c ? r.streams[c].H_kW : r.streams.S4.H_kW + r.streams.S5.H_kW;
      assert.ok(Math.abs(r.blocks[b].duty_kW - (out - r.streams[a].H_kW)) < 1e-6, `${model} ${b}: duty`);
    }
  }
});

test("the workbench's flash takes one component with an activity model as with an equation of state", () => {
  assert.deepEqual(checkInputs("flash", ["water"], "NRTL").problems, []);
  assert.deepEqual(checkInputs("flash", ["water"], "PR").problems, []);
});

test("the workbench's flowsheet: one component chosen, a heater placed with the canvas edits, solved", async () => {
  const { emptyFlowsheet } = await import("../src/flowsheet/document.js");
  const { flowsheetDocStatus, runFlowsheet } = await import("../src/index.js");
  const { addBlock, addFeedTo, setSpec } = await import("../src/ui/flowsheet-logic.js");
  let { fs } = addBlock({ ...emptyFlowsheet(), components: ["water"] }, "heater");
  ({ fs } = addFeedTo(fs, "E1.in"));
  fs = setSpec(fs, "F1", { flow_kmol_h: { water: 10 }, T_K: 300, P_kPa: 101.325 });
  fs = setSpec(fs, "E1", { P_kPa: 101.325, VF: 1 });
  const st = flowsheetDocStatus(fs);
  assert.ok(st.ready, st.message);
  const r = runFlowsheet(fs);
  assert.ok(r.blocks.E1.duty_kW > 0, "heating to saturated vapour takes heat");
});
