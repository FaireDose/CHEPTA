// Lab requests 2-4 (CHEPTA-Lab#5, 2026-11-11): thermo.sets "default" (the form of validation/data/columns/B2-*.json), a
// refusal that names the key, and the MHV1 warnings that name their pair. Method: PR + gE (MHV1) for a gas with a polar
// liquid (docs/METHOD_SELECTION.md); methanol + water on purpose, for the databank NRTL set used inside the rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { system, run, normalizeFlowsheet } from "../src/index.js";

const sheet = thermo => ({ components: ["carbon dioxide", "methanol"], thermo,
  blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { "carbon dioxide": 30, methanol: 70 }, T_K: 323.15, P_kPa: 2000 } }, { id: "V1", type: "flash", spec: { P_kPa: 2000, duty_kW: 0 } },
    { id: "P1", type: "product" }, { id: "P2", type: "product" }],
  streams: [{ id: "S1", from: "F1.out", to: "V1.in" }, { id: "S2", from: "V1.vapour", to: "P1.in" }, { id: "S3", from: "V1.liquid", to: "P2.in" }] });

test('sets: "default" means the default sets; any other string is refused naming the key and the form', () => {
  const plain = system({ components: ["benzene", "toluene"], model: "PR" });
  const dflt = system({ components: ["benzene", "toluene"], model: "PR", sets: "default" });
  assert.deepEqual(dflt.info.pairs, plain.info.pairs);
  const f = normalizeFlowsheet(sheet({ model: "PR", sets: "default" }));
  assert.equal(f.thermo.sets, undefined);
  assert.equal(run({ capability: "solve_flowsheet", input: { flowsheet: sheet({ model: "PR", sets: "default" }) } }).outcome, run({ capability: "solve_flowsheet", input: { flowsheet: sheet({ model: "PR" }) } }).outcome);
  for (const bad of ["chemsep", ["a"], 3]) {
    assert.throws(() => normalizeFlowsheet(sheet({ model: "PR", sets: bad })), e => e.code === "BAD_INPUT" && /flowsheet\.thermo\.sets must be an object/.test(e.message) && /"default"/.test(e.message));
    assert.throws(() => system({ components: ["benzene", "toluene"], model: "PR", sets: bad }), e => e.code === "BAD_INPUT" && /^sets must be an object/.test(e.message));
  }
});

test("MHV1: the fit-quality warning of a set fitted inside the rule and the databank set's note name their pair", () => {
  const w = system({ components: ["carbon dioxide", "methanol"], model: "PR", mixing: "MHV1" }).warnings(323.15, 2000);
  assert.ok(w.some(m => /^Fit quality of the MHV1 set for Carbon dioxide \+ Methanol: AAD/i.test(m)), w.join("\n"));
  const n = system({ components: ["methanol", "water"], model: "PR", mixing: "MHV1" }).warnings(350, 200);
  assert.ok(n.some(m => /^Methanol \+ Water: an NRTL set of the databank/.test(m)), n.join("\n"));
});

test("MHV1: the result's qualifications carry the fit-quality warning of each set used, with its pair", () => {
  const r = run({ capability: "solve_flowsheet", input: { flowsheet: sheet({ model: "PR", mixing: "MHV1" }) } });
  const p = r.qualifications.pairs.find(q => q.set === "mhv1-fitted");
  assert.deepEqual(p.pair, ["Carbon dioxide", "Methanol"]);
  assert.match(p.quality_warning, /^AAD /);
});
