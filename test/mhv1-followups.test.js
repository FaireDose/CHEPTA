// The MHV1 rule ("PR + gE (MHV1)", proposal 0018) in the places added on 2026-11-10 (docs/decisions/2026-11-10-04-mhv1-followups.md):
// a heat exchanger stream's own method, the Charts workspace's equation list, and the Library's view of the MHV1 sets.
// Each test checks the choice against the engine called directly (system({ model, mixing: "MHV1" })) and against the
// classical rule with k_ij, so a choice dropped on the way would fail. The property method of the cases follows
// docs/METHOD_SELECTION.md: CO2 + methanol, a light gas with a polar liquid at 2-5 MPa, with a set fitted inside the rule;
// water alone (the hot side of the exchanger) with NRTL, a pure liquid.
// The method advisor's MHV1 note is tested in test/method-advice.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { system, stream, library } from "../src/index.js";
import { initialState, applyPatch, hxSetups, setsFor, pairRowNotes } from "../src/ui/app-logic.js";
import { hxCalc, normalizeHx, hxStreamSetup } from "../src/ui/hx-logic.js";
import { hxMethodPatch, chartEquationPatch, equationChoices, equationValue } from "../src/ui/model-picker.js";
import { fluidChart } from "../src/ui/charts-view.js";
import { projectOf, stateFromProject } from "../src/ui/project.js";
import mhv1Data from "../src/data/mhv1.json" with { type: "json" };

const COMPS = ["carbon-dioxide", "methanol"];

test("heat exchanger: a stream's own method can be PR + gE (MHV1); the duty and outlet are the engine's", () => {
  let st = initialState({ start: "hx", components: ["water"] });
  // the cold stream: CO2 + methanol at 2 MPa, its own method picked in the list as "PR|MHV1"
  const pick = hxMethodPatch({ model: "PR", vapour: "ideal", mixing: "MHV1" });
  assert.deepEqual(pick, { model: "PR", vapour: "ideal", mixing: "MHV1" });
  assert.equal(hxMethodPatch({ model: "NRTL", vapour: "ideal", mixing: "MHV1" }).mixing, null, "an activity model takes no mixing rule");
  st = applyPatch(st, { hx: { mode: "two", hot: { components: ["water"], model: "NRTL", T_K: 393.15, P_kPa: 300 },
    cold: { components: COMPS, ...pick, z: [0.2, 0.8], T_K: 298.15, P_kPa: 2000 }, spec: { kind: "T_hot_out_K", value: 353.15 } } });
  const S = hxSetups(st);
  assert.deepEqual([S.cold.model, S.cold.mixing, S.hot.mixing], ["PR", "MHV1", null]);
  // the system the view builds (app-views.js hxView streamSys) against the engine's directly
  const viewSys = system({ components: S.cold.ids, model: S.cold.model, ...setsFor({ ...st, vapour: S.cold.vapour, mixing: S.cold.mixing }, S.cold.model) });
  assert.equal(viewSys.info.method, "PR + gE (MHV1)");
  const sh = system({ components: ["water"], model: "NRTL" });
  const direct = system({ components: COMPS, model: "PR", mixing: "MHV1" }), kij = system({ components: COMPS, model: "PR" });
  const r = hxCalc(sh, st.hx, { hot: sh, cold: viewSys }).result;
  const rd = hxCalc(sh, st.hx, { hot: sh, cold: direct }).result;
  const rk = hxCalc(sh, st.hx, { hot: sh, cold: kij }).result;
  assert.equal(r.cold.T_out_K, rd.cold.T_out_K);
  // the cold outlet closes the engine's own energy balance
  const f = [20, 80], cin = stream(direct, { flow_kmol_h: f, T_K: 298.15, P_kPa: 2000 });
  assert.ok(Math.abs(stream(direct, { flow_kmol_h: f, T_K: r.cold.T_out_K, P_kPa: 2000 }).H_kW - cin.H_kW - r.duty_kW) < 1e-6 * r.duty_kW);
  assert.ok(Math.abs(r.cold.T_out_K - rk.cold.T_out_K) > 1e-4, `differs from k_ij: ${r.cold.T_out_K} vs ${rk.cold.T_out_K}`);
  // a stream that takes the workspace's method takes its rule too; a stream with its own model its own rule
  assert.equal(hxStreamSetup({ hot: {} }, "hot", { model: "SRK", mixing: "MHV1" }).mixing, "MHV1");
  assert.equal(hxStreamSetup({ hot: { model: "PR" } }, "hot", { model: "SRK", mixing: "MHV1" }).mixing, null);
  assert.throws(() => normalizeHx({ cold: { model: "NRTL", mixing: "MHV1" } }), /goes with the stream's own model "PR" or "SRK"/);
  assert.throws(() => normalizeHx({ cold: { model: "PR", mixing: "PSRK" } }), /must be "MHV1"/);
  // project files: format 7 for the rule, read back
  const doc = projectOf(st);
  assert.equal(doc.fugacity_project, 7);
  assert.equal(stateFromProject(JSON.parse(JSON.stringify(doc))).hx.cold.mixing, "MHV1");
  const plain = applyPatch(st, { hx: { cold: { mixing: null } } });
  assert.ok(projectOf(plain).fugacity_project < 7, "without the rule the format stays lower");
});

test("Charts: the equation list offers PR + gE (MHV1); the chart is the engine's", () => {
  let st = initialState({ start: "charts", components: COMPS, model: "PR" });
  assert.deepEqual(equationChoices(true).map(c => c[0]), ["PR", "SRK", "PR|MHV1", "SRK|MHV1"]);
  st = applyPatch(st, chartEquationPatch("PR|MHV1", st));
  assert.deepEqual([st.model, st.mixing, equationValue(st.model, st.mixing)], ["PR", "MHV1", "PR|MHV1"]);
  const z = [0.3, 0.7];
  const chart = { ...st.chart, P_kPa: [2000], T_K: [], compression: null };
  const viewSys = system({ components: COMPS, model: st.model, ...setsFor(st, st.model) });   // app-views.js modelSystem
  const MW = z[0] * viewSys.MW[0] + z[1] * viewSys.MW[1];   // the component records' molar masses
  const a = fluidChart(viewSys, z, chart, MW), b = fluidChart(system({ components: COMPS, model: "PR", mixing: "MHV1" }), z, chart, MW);
  const c = fluidChart(system({ components: COMPS, model: "PR" }), z, chart, MW);
  assert.deepEqual(a.isobars[0].points.map(p => p.h), b.isobars[0].points.map(p => p.h));
  assert.ok(a.isobars[0].points.some((p, k) => Math.abs(p.h - c.isobars[0].points[k]?.h) > 1e-3), "differs from k_ij");
  // back to the classical rule
  st = applyPatch(st, chartEquationPatch("SRK", st));
  assert.deepEqual([st.model, st.mixing], ["SRK", null]);
});

test("Library: every MHV1 set with its source, tier and fit quality, as the engine uses it", () => {
  for (const p of mhv1Data.pairs) {
    const [s, ...more] = library.sets(p.i, p.j, p.model, { mixing: "MHV1" });
    assert.equal(more.length, 0);
    assert.deepEqual([s.method, s.set, s.tier, s.gE], [`${p.model} + gE (MHV1)`, "mhv1-fitted", p.tier, "NRTL"]);
    assert.equal(s.source, p.source.fit);
    assert.match(s.source, /AAD/);
    assert.equal(s.quality_warning, p.quality_warning ?? null);
    assert.deepEqual(s.params, p.NRTL);
    assert.ok(s.sources.length === s.source_ids.length && s.sources.length > 0);
    // the source shows what uses it
    for (const id of s.source_ids) assert.ok(library.usedBy(id).some(u => u.type === "mhv1" && u.model === p.model && u.pair.join() === s.pair.join()));
    // the engine uses this set: the same source and fit-quality warning in info.pairs
    const info = system({ components: [p.i, p.j], model: p.model, mixing: "MHV1" }).info.pairs[0];
    assert.equal(info.source, s.source);
    assert.equal(info.quality_warning ?? null, s.quality_warning);
    // and the Inputs panel's list shows the source and the fit quality under the pair
    const notes = pairRowNotes(info, true);
    assert.ok(notes.includes(s.source));
    assert.equal(notes.some(n => n.startsWith("Fit quality: ")), !!s.quality_warning);
  }
  // not among the k_ij sets; SRK has no CO2 + water set in the rule (the engine refuses it)
  assert.ok(!library.sets("carbon-dioxide", "methanol", "PR").some(s => s.mixing));
  assert.deepEqual(library.sets("carbon-dioxide", "water", "SRK", { mixing: "MHV1" }), []);
  assert.throws(() => system({ components: ["carbon-dioxide", "water"], model: "SRK", mixing: "MHV1" }), e => e.code === "NOT_AVAILABLE");
  assert.equal(library.sets("carbon-dioxide", "water", null, { mixing: "MHV1" }).length, 1);
  assert.throws(() => library.sets("carbon-dioxide", "water", "NRTL", { mixing: "MHV1" }), /goes with an equation of state/);
  assert.throws(() => library.sets("carbon-dioxide", "water", "PR", { mixing: "PSRK" }), /not a mixing rule/);
});
