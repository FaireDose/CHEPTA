// The authoring contract (proposal 0015, W8): a key CHEPTA does not read is refused, not ignored. An unknown key of a
// flowsheet's `thermo` or of a block's `spec` is BAD_INPUT naming it and the known keys, and through the request path
// the outcome invalid_input with `where`; the missing-pair message names the remedies of a user or an assistant (the
// user's own data, another method), not only the programming option allowMissingPairs. The flowsheets are ethanol +
// water with NRTL and an ideal-gas vapour (docs/METHOD_SELECTION.md for this pair near 1 atm); benzene + glycerol with
// NRTL is used on purpose for its missing pair (as in test/api.test.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "../src/api/dispatcher.js";
import { normalizeFlowsheet, runFlowsheet } from "../src/flowsheet/document.js";
import { unitTypes, runUnit, specStatus, registerUnit } from "../src/units/units.js";
import { system } from "../src/system.js";
import "../src/index.js";   // every block type registered (reactors, column)

const project = JSON.parse(readFileSync(new URL("../examples/heater-flash.chepta.json", import.meta.url), "utf8"));
const withFlowsheet = f => ({ ...project, flowsheet: f(JSON.parse(JSON.stringify(project.flowsheet))) });

test("an unknown key of thermo is refused, naming it and the known keys", () => {
  const f = { ...project.flowsheet, thermo: { model: "NRTL", method: "PR" } };
  assert.throws(() => normalizeFlowsheet(f), e => e.code === "BAD_INPUT" && /thermo: unknown key "method"\. Known: model, vapour, sets, prefer\./.test(e.message)
    && /The property method is "model"/.test(e.message));
  const r = run({ capability: "solve_flowsheet", input: { project: withFlowsheet(fs => ({ ...fs, thermo: { ...fs.thermo, method: "PR" } })) } });
  assert.equal(r.outcome, "invalid_input");
  assert.equal(r.value, undefined);
  assert.deepEqual(r.error.where, [{ field: "flowsheet.thermo.method" }]);
  // check_project too: the same error, before any calculation
  assert.equal(run({ capability: "check_project", input: { flowsheet: f } }).outcome, "invalid_input");
});

test("every block type lists its spec keys, and refuses any other", () => {
  const sys = system({ components: ["ethanol", "water"], model: "NRTL" });
  for (const u of unitTypes()) {
    assert.ok(Array.isArray(u.specKeys), `${u.type} has its specKeys`);
    const spec = { not_a_key: 1 };
    const known = u.specKeys.length ? u.specKeys.join(", ") : "none";
    assert.throws(() => runUnit(u.type, { sys, spec }), e => e.code === "BAD_INPUT" && e.message.includes(`unknown specification key "not_a_key". Known: ${known}`), u.type);
    const st = specStatus(u.type, spec, { sys });
    assert.equal(st.status, "invalid", u.type);
    assert.match(st.message, /unknown specification key "not_a_key"/);
  }
});

test("a block's known keys are still accepted (the example projects open, a heater keeps its design)", () => {
  for (const name of ["heater-flash", "flowsheet-recycle"]) {
    const p = JSON.parse(readFileSync(new URL(`../examples/${name}.chepta.json`, import.meta.url), "utf8"));
    assert.equal(run({ capability: "solve_flowsheet", input: { project: p } }).outcome, "ok", name);
  }
  const sys = system({ components: ["ethanol", "water"], model: "NRTL" });
  assert.equal(specStatus("heater", { T_K: 350, design: { T_K: 350 } }, { sys }).status, "ok");
  assert.equal(specStatus("column", { light_key: "ethanol", heavy_key: "water", recovery_light_key_in_distillate: 0.9,
    recovery_heavy_key_in_bottoms: 0.9, reflux_over_minimum: 1.3 }, { sys }).status, "ok");
});

test("an unknown spec key through the request path: invalid_input naming the block", () => {
  const p = withFlowsheet(fs => { const h = fs.blocks.find(b => b.type === "heater"); h.spec.outlet_T = 360; return fs; });
  const id = p.flowsheet.blocks.find(b => b.type === "heater").id;
  assert.throws(() => runFlowsheet(p), e => e.code === "BAD_INPUT" && /unknown specification key "outlet_T"/.test(e.message));
  const r = run({ capability: "solve_flowsheet", input: { project: p } });
  assert.equal(r.outcome, "invalid_input");
  assert.equal(r.value, undefined);
  const w = r.error.where.find(x => x.block === id);
  assert.ok(w, JSON.stringify(r.error.where));
  assert.match(w.message, /unknown specification key "outlet_T"\. Known: T_K, duty_kW, VF, A_m2, P_kPa, dP_kPa, sizing, design\./);
});

test("a block type registered without specKeys keeps its own check only; malformed specKeys are refused", () => {
  assert.throws(() => registerUnit({ type: "test-bad-keys", specKeys: "T_K", solve: () => ({}) }), /specKeys must be a list/);
});

test("the missing-pair message names the user's data and another method, not only allowMissingPairs", () => {
  const MISSING = { components: ["benzene", "glycerol"], thermo: { model: "NRTL", vapour: "ideal" },
    blocks: [{ id: "F1", type: "feed", x: 0, y: 0, spec: { flow_kmol_h: { benzene: 50, glycerol: 50 }, T_K: 300, P_kPa: 101.325 } },
      { id: "P1", type: "product", x: 100, y: 0, spec: {} }],
    streams: [{ id: "S1", from: "F1.out", to: "P1.in" }] };
  const r = run({ capability: "solve_flowsheet", input: { flowsheet: MISSING } });
  assert.equal(r.outcome, "missing_data");
  assert.equal(r.value, undefined);
  const m = r.error.message;
  assert.match(m, /No NRTL parameters for: Benzene \+ Glycerol\./);
  assert.match(m, /as your own data, with their source \(My data; in a project or a request: user_data\.pairs\["benzene\+glycerol"\]/);
  assert.match(m, /or choose another method/);
  assert.ok(m.indexOf("user_data.pairs") < m.indexOf("allowMissingPairs"), "the user's data comes before the programming option");
  assert.deepEqual(r.error.details, { missing_pairs: ["benzene+glycerol"] });
  // the remedy the message names works: the pair as the user's data
  const ud = { pairs: { "benzene+glycerol": { NRTL: { b_ij: 500, b_ji: 1500, alpha: 0.3 }, source: { name: "authoring-contract test, not data" } } } };
  assert.equal(run({ capability: "solve_flowsheet", input: { flowsheet: MISSING, user_data: ud } }).outcome, "ok");
});
