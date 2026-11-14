// Design specifications of the flowsheet (proposal 0022, steps 1-3; CHEPTA-Lab's request 15, 2026-11-14): vary one input
// of a block within bounds until a stream's or block's quantity reaches a value, as an outer loop around the recycles.
//
// Independent checks:
//  (1) the separator loop with a make-up feed: its steady state is linear, so the make-up that holds the recycle at
//      300 kmol/h is written by hand here (closed form);
//  (2) the same answers from SciPy (scipy.optimize.brentq for one specification, scipy.optimize.root for two) on the
//      closed-form balance, in validation/python/reference_design_spec.py -> validation/fixtures/design_specs.json;
//  (3) a heater duty that brings a stream to its bubble point, against the heater given VF = 0 (the flash's own bubble
//      point, a different specification path);
//  (4) every failure of section 3 throws with its code;
//  (5) the flowsheet suite is unchanged (test/flowsheet-suite.test.js: flowsheets without designSpecs take no new path).
// Methods (docs/METHOD_SELECTION.md): NRTL for methanol + water and for ethyl acetate + ethanol + water at 101.325 kPa
// (polar liquids at low pressure: an activity model with an ideal vapour). The separator loop's balances do not depend
// on the method (it only sets the streams' states).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, solveFlowsheet, flowsheetStatus, normalizeFlowsheet } from "../src/index.js";
import { run } from "../src/api/dispatcher.js";
import { projectOf, readProject, stateFromProject, PROJECT_FORMAT } from "../src/ui/project.js";

const ref = JSON.parse(readFileSync(new URL("../validation/fixtures/design_specs.json", import.meta.url), "utf8"));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);
const sys = system({ components: ["methanol", "water"], model: "NRTL" });

/** F1 (fixed) and F2 (make-up water) -> M1 -> X1 (a share of each component to the top) -> SP1 (purge, recycle) */
const loop = (designSpecs, { makeup = 5, purge = 0.1, solver } = {}) => ({
  blocks: [
    { id: "F1", type: "feed", spec: { flow_kmol_h: { methanol: ref.feed_kmol_h[0], water: ref.feed_kmol_h[1] }, T_K: 320, P_kPa: 101.325 } },
    { id: "F2", type: "feed", spec: { flow_kmol_h: { water: makeup }, T_K: 320, P_kPa: 101.325 } },
    { id: "M1", type: "mixer" },
    { id: "X1", type: "separator", spec: { fractions: { methanol: [ref.top_shares[0], "rest"], water: [ref.top_shares[1], "rest"] } } },
    { id: "SP1", type: "splitter", spec: { fractions: [purge, "rest"] } },
    { id: "TOP", type: "product" }, { id: "PURGE", type: "product" },
  ],
  streams: [
    { id: "S1", from: "F1.out", to: "M1.in" }, { id: "S0", from: "F2.out", to: "M1.in" }, { id: "S2", from: "M1.out", to: "X1.in" },
    { id: "S3", from: "X1.out", to: "TOP.in" }, { id: "S4", from: "X1.out", to: "SP1.in" },
    { id: "S5", from: "SP1.out", to: "PURGE.in" }, { id: "S6", from: "SP1.out", to: "M1.in" },
  ],
  ...(designSpecs ? { designSpecs } : {}),
  ...(solver ? { solver } : {}),
});
const makeupDS = (extra = {}) => ({ id: "DS1", vary: { block: "F2", key: "flow_kmol_h", component: "water", min: 0, max: 500 },
  target: { stream: "S6", quantity: "flow_kmol_h", value: 300 }, ...extra });
// the closed form: recycle R_i = g_i F_i / (1 - g_i), g_i = (1 - p)(1 - a_i), linear in the make-up water
const byHand = (p, total) => {
  const g = ref.top_shares.map(a => (1 - p) * (1 - a));
  const R0 = ref.feed_kmol_h.reduce((s, f, i) => s + g[i] * f / (1 - g[i]), 0);
  return (total - R0) / (g[1] / (1 - g[1]));
};

test("one specification: the make-up water that holds the recycle at 300 kmol/h, by hand and by scipy.optimize.brentq", () => {
  const r = solveFlowsheet(sys, loop([makeupDS()]));
  const d = r.designSpecs[0];
  assert.equal(d.id, "DS1"); assert.equal(d.method, "brent"); assert.equal(d.met, true);
  close(d.varied.value, byHand(0.1, 300), 1e-6, "make-up, by hand");
  close(d.varied.value, ref.one.makeup_water_kmol_h, 1e-6, "make-up, scipy brentq");
  close(r.streams.S6.F_kmol_h, 300, 300 * 1e-6, "recycle reached");
  r.streams.S6.flows.forEach((v, i) => close(v, ref.one.recycle_flows_kmol_h[i], 1e-4, `recycle flow ${i}`));
  assert.ok(d.solves <= 10, `solves: ${d.solves}`);
  // the varied value is written into the answer's block specification: a plain forward solve reproduces it
  assert.equal(r.blocks.F2.spec.flow_kmol_h.water, d.varied.value);
  const again = solveFlowsheet(sys, { ...loop(), blocks: loop().blocks.map(b => (b.id === "F2" ? { ...b, spec: r.blocks.F2.spec } : b)) });
  close(again.streams.S6.F_kmol_h, 300, 300 * 1e-6, "forward solve with the varied value");
  // the balances of the answer hold
  for (const v of Object.values(r.balance.material_kmol_h)) assert.ok(Math.abs(v) < 1e-6);
});

test("flowsheets without design specifications solve as before (no outer loop, no designSpecs in the answer)", () => {
  const r = solveFlowsheet(sys, loop());
  assert.equal(r.designSpecs, undefined);
  assert.equal(r.blocks.F2.spec, undefined);
  const e = solveFlowsheet(sys, loop([]));
  assert.equal(e.designSpecs, undefined);
  assert.equal(normalizeFlowsheet({ components: ["methanol"], designSpecs: [] }).designSpecs, undefined);
});

test("two specifications together (Broyden with bounds): make-up and purge fraction against scipy.optimize.root", () => {
  const r = solveFlowsheet(sys, loop([makeupDS(), { id: "DS2", vary: { block: "SP1", key: "fractions", index: 0, min: 0.01, max: 0.5 },
    target: { stream: "S5", quantity: "flow_kmol_h", value: 30 } }]));
  const [a, b] = r.designSpecs;
  assert.equal(a.method, "broyden"); assert.ok(a.met && b.met);
  close(a.varied.value, ref.two.makeup_water_kmol_h, 1e-3, "make-up");
  close(b.varied.value, ref.two.purge_fraction, 1e-6, "purge fraction");
  close(r.streams.S6.F_kmol_h, 300, 300 * 1e-6, "recycle");
  close(r.streams.S5.F_kmol_h, 30, 30 * 1e-6, "purge");
  assert.equal(r.blocks.SP1.spec.fractions[0], b.varied.value);
  assert.ok(a.solves <= 30, `solves: ${a.solves}`);
});

test("a ratio target: the ethanol-like make-up held at a tenth of the fixed feed (ratio_of)", () => {
  const r = solveFlowsheet(sys, loop([{ id: "R1", vary: { block: "F2", key: "flow_kmol_h", component: "water", min: 0, max: 100 },
    target: { stream: "S0", quantity: "flow_kmol_h", value: 0.1, ratio_of: { stream: "S1", quantity: "flow_kmol_h" } } }]));
  close(r.designSpecs[0].varied.value, 10, 1e-5, "make-up = 0.1 x 100 kmol/h");
});

test("a feed's total flow is scaled with its composition kept; a mass-basis target", () => {
  const doc = loop([{ id: "DS1", vary: { block: "F1", key: "flow_kmol_h", min: 10, max: 1000 }, target: { stream: "S3", quantity: "flow_kg_h", value: 1000 } }]);
  const r = solveFlowsheet(sys, doc);
  close(r.streams.S3.mass_kg_h, 1000, 1000 * 1e-6, "top product mass flow");
  const f = r.blocks.F1.spec.flow_kmol_h;
  close(f.methanol / f.water, 20 / 80, 1e-12, "composition kept");
});

test("(3) a heater duty that brings a stream to its bubble point, against the heater given VF = 0", () => {
  const s3 = system({ components: ["ethanol", "water"], model: "NRTL" });
  const doc = spec => ({
    blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { ethanol: 30, water: 70 }, T_K: 300, P_kPa: 101.325 } },
      { id: "E1", type: "heater", spec }, { id: "P1", type: "product" }],
    streams: [{ id: "S1", from: "F1.out", to: "E1.in" }, { id: "S2", from: "E1.out", to: "P1.in" }],
  });
  const bubble = solveFlowsheet(s3, doc({ VF: 0 }));
  const Tb = bubble.streams.S2.T_K, Q = bubble.blocks.E1.duty_kW;
  const r = solveFlowsheet(s3, { ...doc({ duty_kW: 100 }), designSpecs: [{ id: "DS1", vary: { block: "E1", key: "duty_kW", min: 0, max: 5000 },
    target: { stream: "S2", quantity: "T_K", value: Tb }, tolerance: 1e-7 }] });
  close(r.streams.S2.T_K, Tb, Tb * 1e-7, "bubble temperature");
  close(r.designSpecs[0].varied.value, Q, Math.abs(Q) * 1e-4, "duty");
  assert.ok(Math.abs(r.streams.S2.VF ?? 0) < 1e-3, `VF ${r.streams.S2.VF}`);
});

// CHEPTA-Lab's request 15 (cases/ethyl-acetate-piotrowski-2021): hold the ethyl acetate product's purity by varying the
// ethanol feed inside a plant with recycles. A small recycle with that kind of target: ethyl acetate and water, an ethanol
// feed, a flash drum whose vapour is the product and whose liquid is recycled with a purge.
const s3 = system({ components: ["ethyl-acetate", "ethanol", "water"], model: "NRTL" });
const plant = (ethanol, designSpecs) => ({
  blocks: [
    { id: "F1", type: "feed", spec: { flow_kmol_h: { "ethyl-acetate": 60, water: 10 }, T_K: 330, P_kPa: 101.325 } },
    { id: "F2", type: "feed", spec: { flow_kmol_h: { ethanol }, T_K: 330, P_kPa: 101.325 } },
    { id: "M1", type: "mixer" },
    { id: "V1", type: "flash", spec: { P_kPa: 101.325, VF: 0.6 } },
    { id: "SP1", type: "splitter", spec: { fractions: [0.3, "rest"] } },
    { id: "PROD", type: "product" }, { id: "PURGE", type: "product" },
  ],
  streams: [
    { id: "S1", from: "F1.out", to: "M1.in" }, { id: "S2", from: "F2.out", to: "M1.in" }, { id: "S3", from: "M1.out", to: "V1.in" },
    { id: "S4", from: "V1.vapour", to: "PROD.in" }, { id: "S5", from: "V1.liquid", to: "SP1.in" },
    { id: "S6", from: "SP1.out", to: "PURGE.in" }, { id: "S7", from: "SP1.out", to: "M1.in" },
  ],
  ...(designSpecs ? { designSpecs } : {}),
});
const MW = s3.MW ?? null;
const purity = s => s.flows[0] * (MW ? MW[0] : 88.106) / s.mass_kg_h;

test("Lab request 15: the ethanol feed that holds the product's ethyl acetate mass fraction, inside a recycle", () => {
  // the asked purity is the one a forward solve gives at 4 kmol/h of ethanol; the specification starts from 12
  const forward = solveFlowsheet(s3, plant(4));
  const asked = forward.designSpecs === undefined && forward.streams.S4.flows[0] * s3.MW[0] / forward.streams.S4.mass_kg_h;
  const r = solveFlowsheet(s3, plant(12, [{ id: "PURITY", vary: { block: "F2", key: "flow_kmol_h", component: "ethanol", min: 0, max: 50 },
    target: { stream: "S4", quantity: "mass_fraction", component: "ethyl-acetate", value: asked } }]));
  const d = r.designSpecs[0];
  assert.ok(d.met);
  close(purity(r.streams.S4), asked, 1e-6, "purity reached");
  close(d.varied.value, 4, 1e-3, "ethanol feed found");
  assert.ok(d.solves <= 12, `solves: ${d.solves}`);
  // a purity no ethanol feed in the bounds reaches: refused with the purity at both bounds
  assert.throws(() => solveFlowsheet(s3, plant(12, [{ id: "PURITY", vary: { block: "F2", key: "flow_kmol_h", component: "ethanol", min: 0, max: 50 },
    target: { stream: "S4", quantity: "mass_fraction", component: "ethyl-acetate", value: 0.999 } }])),
  e => e.code === "NO_CONVERGENCE" && e.details.reason === "unreachable" && /PURITY: the mass fraction of Ethyl acetate in S4 is 0\.96\d* at the flow of Ethanol in F2 = 0 kmol\/h/.test(e.message)
    && /0\.999 is not reachable/.test(e.message));
});

test("(4) failures: unreachable, an inner solve refusing, the limit, a target without value; each with its code", () => {
  // no sign change: the target at both bounds and at the start
  assert.throws(() => solveFlowsheet(sys, loop([makeupDS({ target: { stream: "S6", quantity: "flow_kmol_h", value: 100 } })])),
    e => e.code === "NO_CONVERGENCE" && e.details.reason === "unreachable" && e.details.at_bounds.min.x === 0 && e.details.at_bounds.max.x === 500
      && /262\.404 kmol\/h at the flow of Water in F2 = 0 kmol\/h, 278\.68 kmol\/h at the start value 5 kmol\/h and 1890\.06 kmol\/h at 500 kmol\/h; 100 kmol\/h is not reachable/.test(e.message));
  // an inner solve fails: the splitter refuses fractions above 1 in total; the error keeps its code, names DS1 and the value
  const three = loop([{ id: "DS1", vary: { block: "SP1", key: "fractions", index: 0, min: 0, max: 1, guess: 0.3 }, target: { stream: "S5", quantity: "flow_kmol_h", value: 70 } }]);
  three.blocks.find(b => b.id === "SP1").spec = { fractions: [0.3, 0.4, "rest"] };
  three.blocks.push({ id: "SIDE", type: "product" });
  three.streams.push({ id: "S8", from: "SP1.out", to: "SIDE.in" });
  assert.throws(() => solveFlowsheet(sys, three), e => e.code === "BAD_INPUT" && /^DS1: the flowsheet could not be solved at the fraction of outlet 0 of SP1 = /.test(e.message)
    && /add up to/.test(e.message) && e.details.designSpecs[0] === "DS1");
  // Brent's limit
  // (the recycle's water fraction is hyperbolic in the make-up: one secant step does not land on it)
  assert.throws(() => solveFlowsheet(sys, loop([makeupDS({ target: { stream: "S6", quantity: "mole_fraction", component: "water", value: 0.995 } })], { solver: { designSpecIterations: { bracket: 8, solve: 1 } } })),
    e => e.code === "NO_CONVERGENCE" && e.details.reason === "limit" && /not met in 1 solves of Brent's method/.test(e.message));
  // the make-up stream has no flow at a make-up of 0, so its composition has no value there
  assert.throws(() => solveFlowsheet(sys, loop([makeupDS({ vary: { block: "F2", key: "flow_kmol_h", component: "water", min: 0, max: 50, guess: 0 },
    target: { stream: "S0", quantity: "mole_fraction", component: "water", value: 1 } })])),
  e => e.code === "NO_CONVERGENCE" && e.details.reason === "undefined" && /has no value at the flow of Water in F2 = 0 kmol\/h/.test(e.message));
});

test("(4) malformed or conflicting specifications are refused before anything is solved (BAD_INPUT)", () => {
  const bad = (ds, re, extra = {}) => assert.throws(() => solveFlowsheet(sys, { ...loop(ds), ...extra }), e => e.code === "BAD_INPUT" && re.test(e.message), String(re));
  bad([makeupDS({ vary: { block: "F2", key: "flow_kmol_h", component: "water" } })], /give vary\.min and vary\.max/);
  bad([makeupDS({ vary: { block: "F2", key: "flow_kmol_h", component: "water", min: 5, max: 1 } })], /vary\.min \(5\) must be below vary\.max \(1\)/);
  bad([makeupDS({ vary: { block: "F9", key: "flow_kmol_h", min: 0, max: 1 } })], /"F9" is not a block/);
  bad([makeupDS({ vary: { block: "M1", key: "P_kPa", min: 1, max: 200 } })], /Mixer M1's "P_kPa" cannot be varied/);
  bad([makeupDS({ vary: { block: "F2", key: "flow_kg_h", component: "water", min: 0, max: 1 } })], /Feed F2 gives flow_kmol_h; vary flow_kmol_h/);
  bad([makeupDS({ vary: { block: "F2", key: "flow_kmol_h", component: "water", min: 0, max: 500, guess: 900 } })], /outside the bounds 0 to 500/);
  bad([makeupDS({ target: { stream: "S99", quantity: "flow_kmol_h", value: 1 } })], /"S99" is not a material stream/);
  bad([makeupDS({ target: { stream: "S6", quantity: "pressure", value: 1 } })], /the quantity of a stream is one of/);
  bad([makeupDS({ target: { stream: "S6", quantity: "mole_fraction", value: 0.5 } })], /give the component/);
  bad([makeupDS({ target: { stream: "S6", quantity: "mole_fraction", component: "water", value: 2 } })], /between 0 and 1/);
  bad([makeupDS({ vary: { block: "SP1", key: "fractions", index: 1, min: 0, max: 1 } })], /outlet 1 of Splitter SP1 takes the "rest"/);
  bad([makeupDS(), makeupDS({ id: "DS2" })], /Design specifications DS1 and DS2 both vary the flow of Water in F2/);
  bad([makeupDS(), makeupDS()], /Two design specifications are called DS1/);
  bad([makeupDS({ tolerance: 0.5 })], /tolerance must be between 0 and 0.1/);
  bad([makeupDS({ speed: 1 })], /unknown key "speed"/);
  bad([makeupDS()], /designSpecIterations must be a positive whole number/, { solver: { designSpecIterations: 0 } });
  // an energy stream fixes the duty: it cannot be varied too
  const s3b = system({ components: ["ethanol", "water"], model: "NRTL" });
  assert.throws(() => solveFlowsheet(s3b, {
    blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { ethanol: 30, water: 70 }, T_K: 300, P_kPa: 101.325 } }, { id: "E1", type: "heater", spec: {} }, { id: "P1", type: "product" }],
    streams: [{ id: "S1", from: "F1.out", to: "E1.in" }, { id: "S2", from: "E1.out", to: "P1.in" }],
    energyStreams: [{ id: "Q1", to: "E1", duty_kW: 100 }],
    designSpecs: [{ id: "DS1", vary: { block: "E1", key: "duty_kW", min: 0, max: 500, guess: 10 }, target: { stream: "S2", quantity: "T_K", value: 340 } }],
  }), e => e.code === "BAD_INPUT" && /comes from the energy stream Q1, so it cannot also be varied/.test(e.message));
  // the document refuses an unknown key of a design specification too
  assert.throws(() => normalizeFlowsheet({ components: ["methanol", "water"], designSpecs: [{ vary: {}, target: {}, foo: 1 }] }), e => e.code === "BAD_INPUT" && /unknown key "foo"/.test(e.message));
  assert.throws(() => normalizeFlowsheet({ components: ["methanol", "water"], designSpecs: {} }), e => e.code === "BAD_INPUT" && /must be a list/.test(e.message));
});

test("flowsheet_status: the degrees of freedom are unchanged; a varied input given only as a guess counts; a guess that differs from the given value is noted", () => {
  const st = flowsheetStatus(sys, loop([makeupDS({ vary: { block: "F2", key: "flow_kmol_h", component: "water", min: 0, max: 500, guess: 20 } })]));
  assert.equal(st.ready, true); assert.equal(st.dof, 0);
  assert.equal(st.designSpecs[0].id, "DS1");
  assert.match(st.warnings[0].message, /given as 5 in F2's specification and guessed at 20; the guess is the start/);
  assert.match(st.message, /1 design specification \(DS1\): each varies one input and fixes one target/);
  // a heater temperature left out of its spec and given as the guess: ready, the same count as with T_K given
  const s3b = system({ components: ["ethanol", "water"], model: "NRTL" });
  const doc = {
    blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { ethanol: 30, water: 70 }, T_K: 300, P_kPa: 101.325 } }, { id: "E1", type: "heater", spec: {} }, { id: "P1", type: "product" }],
    streams: [{ id: "S1", from: "F1.out", to: "E1.in" }, { id: "S2", from: "E1.out", to: "P1.in" }],
    designSpecs: [{ id: "DS1", vary: { block: "E1", key: "T_K", min: 300, max: 400, guess: 330 }, target: { block: "E1", quantity: "duty_kW", value: 300 } }],
  };
  const s2 = flowsheetStatus(s3b, doc);
  assert.equal(s2.ready, true);
  const r = solveFlowsheet(s3b, doc);
  close(r.blocks.E1.duty_kW, 300, 300 * 1e-6, "duty target");
  assert.equal(r.blocks.E1.spec.T_K, r.designSpecs[0].varied.value);
  // a malformed specification is a problem of the structure, not ready
  const s3 = flowsheetStatus(sys, loop([makeupDS({ vary: { block: "F2", key: "flow_kmol_h", component: "water" } })]));
  assert.equal(s3.ready, false);
  assert.match(s3.structure.at(-1).message, /give vary\.min and vary\.max/);
});

test("request format: solve_flowsheet lists checks.design_specs; flowsheet_status counts them; an unreachable target is not_converged", () => {
  const doc = { components: ["methanol", "water"], thermo: { model: "NRTL" }, ...loop([makeupDS()]) };
  const r = run({ capability: "solve_flowsheet", input: { flowsheet: doc } });
  assert.equal(r.outcome, "ok", JSON.stringify(r.error));
  const c = r.checks.design_specs[0];
  assert.equal(c.id, "DS1"); assert.equal(c.met, true); assert.equal(c.asked, 300);
  close(c.reached, 300, 3e-4, "reached"); close(c.varied.value, ref.one.makeup_water_kmol_h, 1e-6, "varied");
  const st = run({ capability: "flowsheet_status", input: { flowsheet: doc } });
  assert.equal(st.outcome, "ok"); assert.equal(st.value.ready, true); assert.equal(st.value.designSpecs.length, 1);
  const no = run({ capability: "solve_flowsheet", input: { flowsheet: { ...doc, designSpecs: [makeupDS({ target: { stream: "S6", quantity: "flow_kmol_h", value: 100 } })] } } });
  assert.equal(no.outcome, "not_converged"); assert.equal(no.error.details.reason, "unreachable");
});

test("project files: design specifications are written as format 10 and solve again; format 9 refuses them, naming the format", () => {
  assert.equal(PROJECT_FORMAT, 10);
  const fs = { components: ["methanol", "water"], thermo: { model: "NRTL", vapour: "ideal" }, ...loop([makeupDS()]) };
  const doc = projectOf({ inputs: {}, z: {}, flowsheet: fs }, { version: "test", now: new Date("2026-11-14T00:00:00Z") });
  assert.equal(doc.fugacity_project, 10);
  const back = readProject(JSON.parse(JSON.stringify(doc)));
  assert.equal(back.flowsheet.designSpecs[0].id, "DS1");
  const r = run({ capability: "solve_flowsheet", input: { project: back } });
  assert.equal(r.outcome, "ok", JSON.stringify(r.error));
  assert.throws(() => readProject({ ...doc, fugacity_project: 9 }), /Design specifications \(flowsheet.designSpecs\) need format 10 \(this file says format 9\)/);
  // without a design specification the format is unchanged
  const plain = projectOf({ inputs: {}, z: {}, flowsheet: { ...fs, designSpecs: undefined } }, { version: "test" });
  assert.ok(plain.fugacity_project < 10);
});

test("the tolerance: a default, which the person may change (the maintainer, 2026-11-14); tighter than 100 x the recycle: a warning", () => {
  // default: 1e-6 with the default recycle tolerance (1e-8)
  const a = solveFlowsheet(sys, loop([makeupDS()]));
  assert.equal(a.designSpecs[0].target.tolerance, 1e-6); assert.equal(a.designSpecs[0].target.tolerance_default, true);
  assert.equal(a.designSpecs[0].warnings, undefined);
  // default with a loose recycle tolerance: 100 times it
  const b = solveFlowsheet(sys, loop([makeupDS()], { solver: { tolerance: 1e-5 } }));
  assert.equal(b.designSpecs[0].target.tolerance, 1e-3);
  // a tolerance given tighter than 100 x the recycle tolerance is used, with a warning (here the loop is linear, so it is met)
  const c = solveFlowsheet(sys, loop([makeupDS({ tolerance: 1e-7 })]));
  const d = c.designSpecs[0];
  assert.equal(d.target.tolerance, 1e-7); assert.equal(d.target.tolerance_default, false); assert.ok(d.met);
  close(c.streams.S6.F_kmol_h, 300, 300 * 1e-7, "met to the tolerance given");
  assert.match(d.warnings[0], /tolerance 1e-7 is tighter than 100 times the recycle tolerance \(solver.tolerance 1e-8\)/);
  // the warning reaches flowsheet_status and the request's qualifications
  assert.match(flowsheetStatus(sys, loop([makeupDS({ tolerance: 1e-7 })])).warnings[0].message, /tighter than 100 times/);
  const doc = { components: ["methanol", "water"], thermo: { model: "NRTL" }, ...loop([makeupDS({ tolerance: 1e-7 })]) };
  const r = run({ capability: "solve_flowsheet", input: { flowsheet: doc } });
  assert.equal(r.outcome, "ok");
  assert.ok(r.qualifications.warnings.some(w => w.designSpec === "DS1" && /tighter than 100 times/.test(w.message)));
});

test("examples/design-spec-ethyl-acetate.chepta.json opens in the workbench and its purity is held by the ethanol make-up", () => {
  const doc = readProject(JSON.parse(readFileSync(new URL("../examples/design-spec-ethyl-acetate.chepta.json", import.meta.url), "utf8")));
  assert.equal(doc.fugacity_project, 10);
  const st = stateFromProject(doc);
  assert.equal(st.flowsheet.designSpecs[0].id, "PURITY");
  const r = run({ capability: "solve_flowsheet", input: { project: doc } });
  assert.equal(r.outcome, "ok", JSON.stringify(r.error));
  const c = r.checks.design_specs[0];
  assert.ok(c.met); close(c.reached, 0.95, 1e-6, "95 mass % ethyl acetate");
  assert.ok(c.varied.value > 0 && c.varied.value < 10, `ethanol make-up ${c.varied.value} kmol/h`);
});
