// The splitter by flow (CHEPTA-Lab's request 7, 2026-11-13): an outlet given by its total flow (flow_kmol_h or
// flow_kg_h, one per outlet, one "rest"), with the fraction specification unchanged.
// Independent check: the splitter keeps the inlet's composition and state, so the only thing to check is the mass
// balance and the asked flow; in the recycle cases, the steady state of the linear separator loop is found here by
// bisection on the purge fraction (a different calculation from the solver's Broyden iterations on the tear flows).
// Method: the separator and the splitter are balances without thermodynamics; NRTL for methanol + water only sets the
// streams' state (docs/METHOD_SELECTION.md: an activity model for this polar pair at low pressure).
import { test } from "node:test";
import assert from "node:assert/strict";
import { system, stream, runUnit, solveFlowsheet, flowsheetStatus } from "../src/index.js";
import { run } from "../src/api/dispatcher.js";

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const sys = system({ components: ["methanol", "water"], model: "NRTL" });
const inlet = stream(sys, { flow_kmol_h: [10, 30], T_K: 320, P_kPa: 101.325 });

test("splitter by flow: the asked outlet gets its flow, the rest outlet the remainder, same composition", () => {
  const r = runUnit("splitter", { sys, inlets: { in: inlet }, spec: { flow_kmol_h: [12, "rest"] }, outletCount: 2 });
  const [a, b] = r.outlets.out;
  close(a.F_kmol_h, 12, 1e-12, "asked outlet");
  close(b.F_kmol_h, 28, 1e-12, "rest outlet");
  a.z.forEach((v, i) => close(v, inlet.z[i], 1e-15, "same composition"));
  close(a.T_K, inlet.T_K, 1e-12, "same temperature");
  assert.ok(r.balance.material < 1e-12);
  close(r.balance.energy_kW, 0, 1e-9, "energy");
  assert.deepEqual(r.state.fractions.map(f => +f.toFixed(12)), [0.3, 0.7]);
  // three outlets, the rest in the middle
  const t = runUnit("splitter", { sys, inlets: { in: inlet }, spec: { flow_kmol_h: [5, "rest", 15] }, outletCount: 3 });
  assert.deepEqual(t.outlets.out.map(s => +s.F_kmol_h.toFixed(9)), [5, 20, 15]);
  // the whole inlet asked: the rest outlet is empty
  const all = runUnit("splitter", { sys, inlets: { in: inlet }, spec: { flow_kmol_h: [40, "rest"] }, outletCount: 2 });
  assert.equal(all.outlets.out[1].F_kmol_h, 0);
});

test("splitter by mass flow", () => {
  const r = runUnit("splitter", { sys, inlets: { in: inlet }, spec: { flow_kg_h: ["rest", 100] }, outletCount: 2 });
  close(r.outlets.out[1].mass_kg_h, 100, 1e-9, "asked mass flow");
  close(r.outlets.out[0].mass_kg_h + 100, inlet.mass_kg_h, 1e-9, "rest");
});

test("splitter by flow fails loudly: above the inlet, negative, no rest, both specifications", () => {
  const go = spec => () => runUnit("splitter", { sys, inlets: { in: inlet }, spec, outletCount: 2 });
  assert.throws(go({ flow_kmol_h: [41, "rest"] }), e => e.code === "BAD_INPUT" && /41 kmol\/h, more than the inlet's 40 kmol\/h/.test(e.message));
  assert.throws(go({ flow_kmol_h: [-1, "rest"] }), e => e.code === "BAD_INPUT" && /at least 0/.test(e.message));
  assert.throws(go({ flow_kmol_h: [12, 28] }), e => e.code === "BAD_INPUT" && /exactly one outlet takes "rest"/.test(e.message));
  assert.throws(go({ flow_kmol_h: { methanol: 3 } }), e => e.code === "BAD_INPUT" && /one total flow per outlet/.test(e.message));
  assert.throws(go({ flow_kmol_h: [12, "rest"], fractions: [0.5, "rest"] }), e => e.code === "BAD_INPUT" && /one of fractions, flow_kmol_h or flow_kg_h/.test(e.message));
  assert.throws(go({ flow_kmol_h: [1, 2, "rest"] }), e => e.code === "BAD_INPUT" && /3 flows for 2 outlets/.test(e.message));
  // the fraction specification is unchanged
  const f = runUnit("splitter", { sys, inlets: { in: inlet }, spec: { fractions: [0.25, "rest"] }, outletCount: 2 });
  close(f.outlets.out[0].F_kmol_h, 10, 1e-12, "fractions");
  assert.equal(f.state, undefined);
});

/** feed -> mixer -> separator (a_i to the top) -> bottoms -> splitter (outlet 1 purge, outlet 2 back to the mixer) */
const Fd = [20, 80], a = [0.9, 0.15];
function loop(splitSpec, guess) {
  return {
    blocks: [
      { id: "F1", type: "feed", spec: { flow_kmol_h: Fd, T_K: 320, P_kPa: 101.325 } },
      { id: "M1", type: "mixer" },
      { id: "X1", type: "separator", spec: { fractions: { methanol: [a[0], "rest"], water: [a[1], "rest"] } } },
      { id: "SP1", type: "splitter", spec: splitSpec },
      { id: "TOP", type: "product" }, { id: "PURGE", type: "product" },
    ],
    streams: [
      { id: "S1", from: "F1.out", to: "M1.in" }, { id: "S2", from: "M1.out", to: "X1.in" },
      { id: "S3", from: "X1.out", to: "TOP.in" }, { id: "S4", from: "X1.out", to: "SP1.in" },
      { id: "S5", from: "SP1.out", to: "PURGE.in" }, { id: "S6", from: "SP1.out", to: "M1.in", ...(guess ? { tear: true, guess } : {}) },
    ],
  };
}
// steady state at purge fraction p: M_i = F_i / (1 - (1 - p)(1 - a_i)), bottoms B_i = (1 - a_i) M_i
const bottoms = p => Fd.map((f, i) => (1 - a[i]) * f / (1 - (1 - p) * (1 - a[i])));
const bisect = (g, lo, hi) => { for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (g(lo) * g(m) <= 0) hi = m; else lo = m; } return (lo + hi) / 2; };
const total = v => v.reduce((s, x) => s + x, 0);

test("splitter by flow in a recycle: a purge of 5 kmol/h reaches the independent steady state", () => {
  const r = solveFlowsheet(sys, loop({ flow_kmol_h: [5, "rest"] }));
  const p = bisect(q => q * total(bottoms(q)) - 5, 1e-9, 1);
  close(r.streams.S5.F_kmol_h, 5, 1e-7, "purge flow");
  bottoms(p).forEach((b, i) => close(r.streams.S5.flows[i], p * b, 1e-6, `purge ${i}`));
  bottoms(p).forEach((b, i) => close(r.streams.S6.flows[i], (1 - p) * b, 1e-6, `recycle ${i}`));
  for (const v of Object.values(r.balance.material_kmol_h)) close(v, 0, 1e-6, "flowsheet balance");
});

test("splitter by flow in a recycle: an inlet short of the asked flow in the first pass is allowed while the loop iterates", () => {
  // the recycle asked at 100 kmol/h; the first pass (empty tear) brings only 70 kmol/h of bottoms to the splitter
  const r = solveFlowsheet(sys, loop({ flow_kmol_h: ["rest", 100] }));
  close(r.streams.S6.F_kmol_h, 100, 1e-6, "recycle flow");
  const p = bisect(q => (1 - q) * total(bottoms(q)) - 100, 1e-9, 1 - 1e-9);
  bottoms(p).forEach((b, i) => close(r.streams.S5.flows[i], p * b, 1e-5, `purge ${i}`));
  assert.equal(r.blocks.SP1.state.limited, undefined);
  // a purge the converged loop cannot give (more than the 70 kmol/h of bottoms at a purge of everything) is refused
  assert.throws(() => solveFlowsheet(sys, loop({ flow_kmol_h: [75, "rest"] })),
    e => e.code === "BAD_INPUT" && /SP1/.test(e.message) && /more than its inlet/.test(e.message));
});

test("splitter by flow: status and the solve_flowsheet request", () => {
  const ok = flowsheetStatus(sys, loop({ flow_kmol_h: [5, "rest"] }));
  assert.equal(ok.blocks.SP1.status, "ok");
  const two = flowsheetStatus(sys, loop({ flow_kmol_h: [5, "rest"], fractions: [0.1, "rest"] }));
  assert.equal(two.blocks.SP1.status, "extra");
  const short = flowsheetStatus(sys, loop({ flow_kmol_h: [5] }));
  assert.equal(short.blocks.SP1.status, "missing");
  assert.match(short.blocks.SP1.message, /1 more flow for the outlets/);
  const fs = { components: ["methanol", "water"], thermo: { model: "NRTL" }, ...loop({ flow_kmol_h: [5, "rest"] }) };
  const r = run({ capability: "solve_flowsheet", input: { flowsheet: fs } });
  assert.equal(r.outcome, "ok", r.error?.message);
  close(r.value.streams.S5.F_kmol_h, 5, 1e-7, "purge through the request");
  const bad = run({ capability: "solve_flowsheet", input: { flowsheet: { ...fs, blocks: fs.blocks.map(b => (b.id === "SP1" ? { ...b, spec: { flow_kmol_h: [-2, "rest"] } } : b)) } } });
  assert.equal(bad.outcome, "invalid_input");
  assert.equal(bad.error.code, "BAD_INPUT");
});

test("project files: a splitter by flow is written as format 9, opens and solves again; format 8 refuses it, naming the format", async () => {
  const { initialState, applyPatch } = await import("../src/ui/app-logic.js");
  const { projectOf, projectText, stateFromProject, readProject } = await import("../src/ui/project.js");
  const { runFlowsheet } = await import("../src/index.js");
  const fs = { components: ["methanol", "water"], thermo: { model: "NRTL", vapour: "ideal" }, ...loop({ flow_kmol_h: [5, "rest"] }) };
  let s = applyPatch(initialState({ components: ["methanol", "water"] }), { workspace: "flowsheet" });
  s = applyPatch(s, { flowsheet: fs });
  const doc = projectOf(s);
  assert.equal(doc.fugacity_project, 9);
  const back = stateFromProject(projectText(doc));
  assert.deepEqual(back.flowsheet.blocks.find(b => b.id === "SP1").spec, { flow_kmol_h: [5, "rest"] });
  close(runFlowsheet(back.flowsheet).streams.S5.F_kmol_h, 5, 1e-7, "solved from the file");
  assert.throws(() => readProject({ ...doc, fugacity_project: 8 }), /splitter given by flow.*needs format 9 \(this file says format 8\)/);
  // a splitter by fractions keeps the format it had
  const plain = projectOf(applyPatch(s, { flowsheet: { ...fs, blocks: fs.blocks.map(b => (b.id === "SP1" ? { ...b, spec: { fractions: [0.1, "rest"] } } : b)) } }));
  assert.equal(plain.fugacity_project, 2);
});

test("the workbench's outlet tools keep the splitter's basis", async () => {
  const { addOutlet, removeOutlet, splitKey } = await import("../src/ui/flowsheet-logic.js");
  const fs = { components: ["methanol", "water"], thermo: { model: "NRTL" }, ...loop({ flow_kg_h: [50, "rest"] }) };
  assert.equal(splitKey(fs.blocks.find(b => b.id === "SP1").spec), "flow_kg_h");
  const more = addOutlet(fs, "SP1");
  assert.deepEqual(more.blocks.find(b => b.id === "SP1").spec, { flow_kg_h: [50, 0, "rest"] });
  assert.deepEqual(removeOutlet(more, "SP1").blocks.find(b => b.id === "SP1").spec, { flow_kg_h: [50, "rest"] });
});
