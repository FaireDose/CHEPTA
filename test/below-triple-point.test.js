// A PURE component below its triple point (the maintainer, 2026-11-13; docs/decisions/2026-11-13-07-below-triple-point.md):
// the stable phase is the solid, the liquid value is a supercooled extrapolation, a normal boiling point below the triple
// point is "none: sublimes". Mixtures are unchanged (METHOD_SELECTION.md rule 8: the supercooled liquid is the reference
// state of a component below its melting point in a liquid mixture).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pure, system } from "../src/index.js";
import { compare, runCases, severity, renderMarkdown, classify, NoValue } from "../scripts/engineering-report.mjs";

test("carbon dioxide has no normal boiling point: it sublimes at 101.325 kPa", () => {
  const p = pure("carbon-dioxide");
  assert.equal(p.Tb_K, null);
  const nb = p.normalBoilingPoint();
  assert.equal(nb.T_K, null);
  assert.equal(nb.sublimes, true);
  assert.equal(nb.Tsub_K, null, "no open sublimation record: never estimated");
  assert.match(nb.message, /Carbon dioxide: none, the component sublimes at 101\.325 kPa/);
  assert.match(nb.message, /triple point \(216\.58 K\)/);
  // the curve continued below the triple point is still what tsat() gives (about 185 K), not a boiling point
  assert.ok(Math.abs(p.tsat(101.325) - 185.07) < 0.05);
});

test("components that boil above their triple point keep their normal boiling point", () => {
  for (const [id, Tb] of [["water", 373.12], ["ethanol", 351.57], ["benzene", 353.22]]) {
    const nb = pure(id).normalBoilingPoint();
    assert.equal(nb.sublimes, false, id);
    assert.ok(Math.abs(nb.T_K - Tb) < 0.1, id);
  }
});

test("pure props of the liquid below the triple point say the solid is stable", () => {
  const s = pure("carbon-dioxide").props(185.07, 101.4);
  assert.equal(s.phase, "liquid");
  assert.deepEqual(s.belowTriplePoint, { T_K: 216.58, label: "triple point" });
  assert.match(s.notes[0], /Carbon dioxide: the state at 185.07 K is below its triple point \(216\.58 K\): the stable phase there is the solid, and the liquid value is a supercooled extrapolation, not data\./);
});

test("no triple-point warning above it, or for a vapour", () => {
  const above = pure("carbon-dioxide").props(250, 3000);
  assert.equal(above.belowTriplePoint, undefined);
  assert.ok(!above.notes.some(n => /stable phase there is the solid/.test(n)));
  const gas = pure("carbon-dioxide").props(200, 50);
  assert.equal(gas.phase, "vapour");
  assert.equal(gas.belowTriplePoint, undefined);
});

test("a saturation state below the triple point carries the warning", () => {
  const sat = pure("carbon-dioxide").saturation(200);
  assert.match(sat.warning, /the saturation state at 200 K is below its triple point/);
  assert.equal(pure("carbon-dioxide").saturation(250).warning, undefined);
});

test("mixtures are unchanged: a liquid mixture below a component's melting point adds no triple-point warning", () => {
  // acetic acid melts at 289.81 K; 285 K in water is the supercooled reference state (decision 2026-11-12-05)
  const s = system({ components: ["acetic acid", "water"], model: "NRTL" });
  const r = s.flash({ T: 285, P: 101.325, z: [0.5, 0.5] });
  const text = JSON.stringify([r.warnings ?? [], r.notes ?? [], s.warnings ?? []]);
  assert.doesNotMatch(text, /stable phase there is the solid/);
  assert.doesNotMatch(text, /below its triple point/);
});

// --- the engineering report
const tolerances = { abs05: { abs: 0.5, unit: "K" }, rel1: { rel: 0.01 } };
const ok = (value, extra = {}) => ({ status: "ok", value, ...extra });

test("report: a normal boiling point that is 'none (sublimes)' is neither a failure nor lost", () => {
  const cases = { tolerances, groups: [{ id: "g", title: "G", cases: [
    { id: "tb", type: "normalBoilingPoint", component: "carbon-dioxide", P_kPa: 101.325, quantities: [{ key: "T_C", tol: "abs05" }] },
  ] }] };
  const refs = { values: { tb: { T_C: { value: -88.05 } } } };
  const base = { results: { tb: { T_C: ok(-88.05) } } };
  const head = { results: { tb: { T_C: { status: "none", text: "none (sublimes)", reason: "sublimes" } } } };
  const { groups, summary } = compare(cases, refs, base, head);
  const row = groups[0].rows[0];
  assert.equal(row.status, "none");
  assert.equal(row.lost, false);
  assert.equal(row.changed, true, "shown as a change from main");
  assert.equal(severity(row), null, "not a red failure");
  assert.equal(summary.lost, 0);
  assert.match(renderMarkdown({ groups, summary }), /none \(sublimes\)/);
});

test("report: a value continued outside its record's range is report only, not a red failure", () => {
  const cases = { tolerances, groups: [{ id: "g", title: "G", cases: [
    { id: "cp", type: "pureProperty", component: "carbon-dioxide", property: "liquidHeatCapacity", T_K: 185, quantities: [{ key: "cp_kJ_kgK", tol: "rel1" }] },
  ] }] };
  const refs = { values: { cp: { cp_kJ_kgK: { value: 1.9336 } } } };
  const far = 2.195;   // 13.5 % off, more than twice the tolerance
  const plain = compare(cases, refs, null, { results: { cp: { cp_kJ_kgK: ok(far) } } }).groups[0].rows[0];
  assert.equal(plain.status, "out");
  assert.equal(severity(plain), "large");
  const marked = compare(cases, refs, null, { results: { cp: { cp_kJ_kgK: ok(far, { extrapolated: true }) } } }).groups[0].rows[0];
  assert.equal(marked.status, "outInfo");
  assert.equal(severity(marked), "small");
  assert.equal(marked.extrapolated, true);
  assert.match(renderMarkdown({ groups: [{ id: "g", title: "G", rows: [marked] }], summary: { total: 1, ok: 0, out: 0, outInfo: 1, noRef: 0, na: 0, none: 0, error: 0, newer: 1, changed: 0, lost: 0 } }), /extrapolated outside the record's range/);
  // inside the tolerance an extrapolated value is simply ok
  const fine = compare(cases, refs, null, { results: { cp: { cp_kJ_kgK: ok(1.935, { extrapolated: true }) } } }).groups[0].rows[0];
  assert.equal(fine.status, "ok");
});

test("report: runCases gives carbon dioxide's normal boiling point as none and flags the continued liquid properties", () => {
  const cases = { tolerances, groups: [{ id: "g", title: "G", cases: [
    { id: "tb", type: "normalBoilingPoint", component: "carbon-dioxide", P_kPa: 101.325, quantities: [{ key: "T_C", tol: "abs05" }] },
    { id: "cp", type: "pureProperty", component: "carbon-dioxide", property: "liquidHeatCapacity", T_K: 185.07, P_kPa: 101.325, state: "saturated liquid", quantities: [{ key: "cp_kJ_kgK", tol: "rel1" }] },
  ] }] };
  const { results } = runCases({ ...CHEPTA_NS() }, cases, { curves: false });
  assert.equal(results.tb.T_C.status, "none");
  assert.equal(results.tb.T_C.text, "none (sublimes)");
  assert.equal(results.cp.cp_kJ_kgK.status, "ok");
  assert.equal(results.cp.cp_kJ_kgK.extrapolated, true);
  assert.equal(classify(new NoValue("none (sublimes)", "why")).status, "none");
});

import * as NS from "../src/index.js";
function CHEPTA_NS() { return NS; }
