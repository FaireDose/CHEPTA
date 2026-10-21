// Rating of a given exchanger (proposal 0013, step 8; src/units/heat-exchange.js exchangerRating): the area, U and
// the arrangement give the duty and both outlets. Checked against Lienhard and Lienhard's Example 3.5 (A Heat Transfer
// Textbook, 6th ed., 2024, free from https://ahtt.mit.edu/) and against the effectiveness-NTU relations of section 3.3
// (independent of the zone search), then on real curves: a rated exchanger sized back by exchangerArea gives its own
// area. The flowsheet block "hx" with A_m2, the Heat exchanger workspace's Rating task, and the refusals.
// Method (docs/METHOD_SELECTION.md): ethanol + water, polar liquids at low pressure: NRTL with an ideal-gas vapour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { system, stream, runUnit, exchangerArea, exchangerRating } from "../src/index.js";
import { effectiveness, ARRANGEMENTS } from "../src/units/heat-exchange.js";
import { normalizeHx, hxCalc } from "../src/ui/hx-logic.js";

const C = t => t + 273.15;
const close = (a, b, rel, what) => assert.ok(Math.abs(a / b - 1) <= rel, `${what}: ${a} vs ${b} (${((a / b - 1) * 100).toFixed(4)} %)`);
// a fluid of constant heat capacity 1000 J/(kg K): flow_kg_h = C (W/K) × 3.6
const fluid = (T_in_C, C_W_K) => ({ utility: { kind: "fluid", T_in_K: C(T_in_C), flow_kg_h: C_W_K * 3.6, cp_J_kgK: 1000 } });
const sys = system({ components: ["ethanol", "water"], model: "NRTL" });

test("Lienhard Example 3.5 rated: 30 m², U = 500, Ch = 10,000, Cc = 20,000 W/K, parallel flow: ε 0.596, 655.6 kW, 84.4 and 72.8 °C", () => {
  const r = exchangerRating(null, { area_m2: 30, U: { value: 500 }, arrangement: "cocurrent", hot: fluid(150, 10000), cold: fluid(40, 20000) });
  // the example rounds ε to 0.596 (Q = 655.6 kW); unrounded, eqn. 3.20 gives the duty the search must find
  const eps = effectiveness("cocurrent", 1.5, 0.5);
  close(r.duty_kW, eps * 10 * 110, 1e-6, "duty");
  close(r.rating.effectiveness, eps, 1e-6, "effectiveness");
  assert.equal(+r.rating.effectiveness.toFixed(3), 0.596);
  assert.ok(Math.abs(r.duty_kW - 655.6) < 0.5, `${r.duty_kW} kW`);
  assert.equal(+(r.hot.T_out_K - 273.15).toFixed(1), 84.4);
  assert.equal(+(r.cold.T_out_K - 273.15).toFixed(1), 72.8);
  close(r.rating.duty_max_kW, 1100, 1e-9, "largest duty: Cmin (150 - 40 °C)");
  close(r.area_m2, 30, 2e-3, "sized back with all zones");
  assert.match(r.rating.summary, /^Rated: 30 m² with U = 500 W\/\(m² K\) transfers 656\.04 kW, 59\.6 % of the most these inlets allow \(1100 kW\)/);
});

test("every arrangement against its effectiveness-NTU relation (constant heat capacities), R below and above 1", () => {
  for (const arrangement of ARRANGEMENTS) for (const shells of arrangement === "shell-and-tube" ? [1, 2] : [1]) {
    for (const [Ch, Cc] of [[8000, 12000], [15000, 6000]]) {
      const A = 20, U = 400, Cmin = Math.min(Ch, Cc), R = Cmin / Math.max(Ch, Cc), NTU = U * A / Cmin;
      const eps = effectiveness(arrangement, NTU, R, shells);
      const r = exchangerRating(null, { area_m2: A, U: { value: U }, arrangement, shells, zones: 40, hot: fluid(140, Ch), cold: fluid(30, Cc) });
      close(r.rating.effectiveness, eps, 2e-3, `${arrangement}, ${shells} shell(s), Ch ${Ch}, Cc ${Cc}`);
      // the energy balance of the two sides
      close((C(140) - r.hot.T_out_K) * Ch, (r.cold.T_out_K - C(30)) * Cc, 1e-9, `${arrangement}: energy balance`);
    }
  }
});

test("one side at a constant temperature: ε = 1 - exp(-NTU) whatever the arrangement; cooling water with IAPWS-IF97", () => {
  for (const arrangement of ARRANGEMENTS) {
    const r = exchangerRating(null, { area_m2: 10, U: { value: 800 }, arrangement, hot: { utility: { kind: "fluid", T_K: C(120) } }, cold: fluid(20, 12000) });
    close(r.rating.effectiveness, 1 - Math.exp(-800 * 10 / 12000), 1e-5, arrangement);
  }
  // water: its heat capacity changes a little with temperature (IF97), so within 1 % of the constant-cp relation
  const w = exchangerRating(null, { area_m2: 10, U: { value: 800 }, hot: { utility: { kind: "fluid", T_K: C(80) } },
    cold: { utility: { kind: "water", T_in_K: C(20), flow_kg_h: 10000, P_kPa: 300 } } });
  const Cw = 10000 / 3600 * 4180;
  close(w.rating.effectiveness, 1 - Math.exp(-8000 / Cw), 0.01, "water");
  assert.ok(Math.abs(w.cold.flow_kg_h - 10000) < 1e-6 * 10000, "the water flow stays the one given");
});

test("a process stream heated by steam, then cooled by water: sized back by pre-sizing, the area is the one given", () => {
  const feed = stream(sys, { flow_kmol_h: [50, 50], T_K: 298.15, P_kPa: 101.325 });
  const r = exchangerRating(sys, { area_m2: 5, U: { value: 500 }, hot: { utility: { kind: "steam", P_kPa: 300 } }, cold: { stream: feed } });
  assert.ok(r.cold.T_out_K > 298.15 && r.cold.T_out_K < 406.7, `outlet ${r.cold.T_out_K} K`);
  const back = exchangerArea(sys, { U: { value: 500 }, hot: { utility: { kind: "steam", P_kPa: 300 } }, cold: { stream: feed, T_out_K: r.cold.T_out_K } });
  close(back.area_m2, 5, 3e-3, "steam heating: area");
  close(r.outlets.cold.H_kW - feed.H_kW, r.duty_kW, 1e-6, "steam heating: duty is the stream's enthalpy change");
  const hot = stream(sys, { flow_kmol_h: [50, 50], T_K: 350, P_kPa: 101.325 });
  const c = exchangerRating(sys, { area_m2: 8, U: { value: 600 }, arrangement: "shell-and-tube", hot: { stream: hot }, cold: { utility: { kind: "water", T_in_K: C(20), flow_kg_h: 20000 } } });
  const back2 = exchangerArea(sys, { U: { value: 600 }, arrangement: "shell-and-tube", hot: { stream: hot, T_out_K: c.hot.T_out_K },
    cold: { utility: { kind: "water", T_in_K: C(20), T_out_K: c.cold.T_out_K } } });
  close(back2.area_m2, 8, 3e-3, "water cooling: area");
  close(back2.cold.flow_kg_h, 20000, 3e-3, "water cooling: the water flow");
});

test("the flowsheet block hx with A_m2 (rating): the outlets of the area given; U is required", () => {
  const hot = stream(sys, { flow_kmol_h: { water: 60, ethanol: 40 }, T_K: 360, P_kPa: 101.325 });
  const cold = stream(sys, { flow_kmol_h: { water: 60, ethanol: 40 }, T_K: 300, P_kPa: 101.325 });
  const r = runUnit("hx", { sys, inlets: { hot, cold }, spec: { A_m2: 15, U: { value: 600 } } });
  const direct = exchangerRating(sys, { area_m2: 15, U: { value: 600 }, hot: { stream: hot }, cold: { stream: cold } });
  close(r.outlets.hot.T_K, direct.hot.T_out_K, 1e-9, "hot outlet");
  close(r.sizing.rating.effectiveness, direct.rating.effectiveness, 1e-9, "effectiveness");
  assert.equal(r.duty_kW, 0, "adiabatic overall");
  // the same exchanger designed for the rated hot outlet has the area given
  const d = runUnit("hx", { sys, inlets: { hot, cold }, spec: { T_hot_out_K: r.outlets.hot.T_K, U: { value: 600 } } });
  close(d.sizing.area_m2, 15, 3e-3, "designed back");
  assert.throws(() => runUnit("hx", { sys, inlets: { hot, cold }, spec: { A_m2: 15 } }), /rating an exchanger of a given area \(A_m2\) needs U/);
  assert.throws(() => runUnit("hx", { sys, inlets: { hot, cold }, spec: { A_m2: 15, duty_kW: 50, U: { value: 600 } } }), /give one of/);
});

test("the Heat exchanger workspace's Rating task: utility and process exchanger", () => {
  const s = normalizeHx({ task: "rating", rating: { area_m2: 4 }, U: { source: "value", value: 500 } });
  const r = hxCalc(sys, s).result;
  const feed = stream(sys, { flow_kmol_h: [50, 50], T_K: 298.15, P_kPa: 101.325 });
  const direct = exchangerRating(sys, { area_m2: 4, U: { value: 500 }, arrangement: "counterflow", shells: 1, zones: 20, hot: { utility: { kind: "steam", P_kPa: 300 } }, cold: { stream: feed } });
  close(r.duty_kW, direct.duty_kW, 1e-9, "steam heats the process stream");
  // cooling water with a given flow cools a hot stream (the utility enters colder)
  const cool = hxCalc(sys, normalizeHx({ task: "rating", process: { T_K: 350 }, utility: { kind: "water", T_in_K: C(20), flow_kg_h: 8000 }, U: { source: "value", value: 500 } })).result;
  assert.equal(cool.hot.kind, "process");
  assert.ok(cool.hot.T_out_K < 350 && Math.abs(cool.cold.flow_kg_h - 8000) < 1e-6);
  const two = hxCalc(sys, normalizeHx({ mode: "two", task: "rating", rating: { area_m2: 6 }, U: { source: "value", value: 400 } })).result;
  assert.ok(two.rating.effectiveness > 0 && two.rating.effectiveness < 1);
  assert.throws(() => hxCalc(sys, normalizeHx({ task: "rating", utility: { kind: "electric" } })), /Electric heating has no heat-transfer area to rate/);
  assert.throws(() => normalizeHx({ task: "rate" }), /hx.task must be "design" or "rating"/);
  assert.throws(() => normalizeHx({ rating: { area_m2: 0 } }), /hx.rating.area_m2 must be a positive area/);
});

test("refusals: no U, an outlet or a duty given, water without a flow, two constant temperatures, an area no duty fits", () => {
  const two = { hot: fluid(150, 10000), cold: fluid(40, 20000) };
  assert.throws(() => exchangerRating(null, { area_m2: 30, ...two }), /Rating needs U/);
  assert.throws(() => exchangerRating(null, { area_m2: 30, U: { value: 500 }, duty_kW: 100, ...two }), /leave the duty out/);
  assert.throws(() => exchangerRating(null, { area_m2: 30, U: { value: 500 }, hot: { ...two.hot, T_out_K: 360 }, cold: two.cold }), /leave out the hot side's outlet/);
  assert.throws(() => exchangerRating(null, { area_m2: 30, U: { value: 500 }, hot: two.hot, cold: { utility: { kind: "water", T_in_K: C(20), T_out_K: C(30) } } }),
    /gives its flow \(flow_kg_h\) instead of its outlet temperature/);
  assert.throws(() => exchangerRating(null, { area_m2: 30, U: { value: 500 }, hot: { utility: { kind: "steam", P_kPa: 300 } }, cold: { utility: { kind: "fluid", T_K: C(40) } } }),
    /the duty has no bound/);
  assert.throws(() => exchangerRating(null, { area_m2: -1, U: { value: 500 }, ...two }), /area_m2/);
  assert.throws(() => exchangerRating(null, { area_m2: 30, U: { value: 500 }, hot: fluid(40, 10000), cold: fluid(150, 20000) }), /must enter hotter/);
  // design refuses a utility with a flow and no duty: its outlet would be unknown
  const hot = stream(sys, { flow_kmol_h: [50, 50], T_K: 350, P_kPa: 101.325 });
  assert.throws(() => exchangerArea(sys, { U: { value: 500 }, hot: { stream: hot, T_out_K: 320 }, cold: { utility: { kind: "water", T_in_K: C(20), flow_kg_h: 8000 } } }),
    /give the duty, or rate the exchanger/);
});
