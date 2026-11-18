/**
 * Proposal 0024, parts (a) and (b) (the maintainer's answers of 2026-11-14; docs/decisions/2026-11-14-07-two-liquids-in-columns.md):
 *  (a) a column feed that holds a second liquid above 1 mol % of the column's feed gets a warning that recommends a
 *      decanter first; the column is still calculated; the limit can be changed per column;
 *  (b) feed_second_liquid "top" or "bottom": a small second liquid goes around the stages into the distillate (with a
 *      decanter: into the decanter) or the bottoms; refused above the limit, naming both ways out.
 * The method: NRTL for 1-butanol + water (docs/METHOD_SELECTION.md rules 3 and 7: polar, two liquids possible; the
 * flash's three-phase split decides what the feed holds). The feed: 50 kmol/h of 1-butanol with water just past the
 * water-rich edge of the butanol-rich liquid at 300 K, so that a small water-rich second liquid forms; the shares
 * asserted are those of the model's own flash (state.feed_second_liquid), not data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/api/dispatcher.js";

const mk = (water, spec = {}) => ({ capability: "solve_flowsheet", input: { flowsheet: {
  components: ["1-butanol", "water"], thermo: { model: "NRTL" },
  blocks: [{ id: "F", type: "feed", spec: { flow_kmol_h: { "1-butanol": 50, water }, T_K: 300, P_kPa: 101.325 } },
    { id: "C", type: "column", spec: Object.fromEntries(Object.entries({ mode: "rigorous", stages: 10, feed_stage: 3, reflux_ratio: 2, bottoms_kmol_h: 45, phases: "VLL", ...spec }).filter(([, v]) => v !== null)) },
    { id: "D", type: "product" }, { id: "B", type: "product" }],
  streams: [{ id: "s1", from: "F.out", to: "C.in" }, { id: "s2", from: "C.distillate", to: "D.in" }, { id: "s3", from: "C.bottoms", to: "B.in" }] } } });
/** Each component's flow in equals its flow out, to rounding. */
function balanced(v) {
  const s = v.streams;
  for (const c of Object.keys(s.s1.flow_kmol_h)) {
    const a = s.s1.flow_kmol_h[c], b = s.s2.flow_kmol_h[c] + s.s3.flow_kmol_h[c];
    assert.ok(Math.abs(a - b) <= 1e-9 * s.s1.F_kmol_h, `${c}: in ${a}, out ${b}`);
  }
}

test("(a) a feed whose second liquid is above 1 mol % of the column's feed: a warning recommending a decanter; the column is still calculated", () => {
  const r = run(mk(76.2));
  assert.equal(r.outcome, "ok", r.error?.message);
  const w = (r.value.blocks.C.warnings ?? []).filter(x => x.code === "FEED_TWO_LIQUIDS");
  assert.equal(w.length, 1);
  assert.match(w[0].message, /holds two liquids at its own temperature and pressure \(the second, Water-rich, 1\.0\d+ % of the column's feed in mol, 0\.4\d+ % by mass\)/);
  assert.match(w[0].message, /put a decanter before the column/);
  const st = r.value.blocks.C.state.feed_second_liquid;
  assert.equal(st.mode, "stages");
  assert.ok(st.feeds[0].mol_share > 0.01 && st.feeds[0].mol_share < 0.011, `${st.feeds[0].mol_share}`);
  balanced(r.value);
});

test("(a) at 1 mol % or less no warning; the limit is the column's own (feed_second_liquid_limit)", () => {
  const r = run(mk(75.9));
  assert.equal(r.outcome, "ok", r.error?.message);
  assert.equal((r.value.blocks.C.warnings ?? []).filter(x => x.code === "FEED_TWO_LIQUIDS").length, 0);
  const share = r.value.blocks.C.state.feed_second_liquid.feeds[0].mol_share;
  assert.ok(share > 0.007 && share < 0.01, `${share}`);
  const r2 = run(mk(75.9, { feed_second_liquid_limit: 0.005 }));
  assert.equal((r2.value.blocks.C.warnings ?? []).filter(x => x.code === "FEED_TWO_LIQUIDS").length, 1);
  for (const bad of [-0.1, 1, "x"]) assert.equal(run(mk(75.9, { feed_second_liquid_limit: bad })).outcome, "invalid_input");
  assert.equal(run(mk(75.9, { feed_second_liquid: "middle" })).outcome, "invalid_input");
});

test("(b) top and bottom: the second liquid goes around the stages into the product; the balance closes; the duties leave it out", () => {
  const full = run(mk(75.9));
  for (const mode of ["top", "bottom"]) {
    const r = run(mk(75.9, { feed_second_liquid: mode }));
    assert.equal(r.outcome, "ok", r.error?.message);
    balanced(r.value);
    const st = r.value.blocks.C.state.feed_second_liquid;
    assert.equal(st.mode, mode);
    assert.equal(st.into, mode === "top" ? "distillate" : "bottoms");
    assert.ok(Math.abs(st.bypassed_kmol_h - st.feeds[0].F_kmol_h) < 1e-12);
    assert.ok(r.value.blocks.C.notes.some(n => /bypasses the stages \(feed_second_liquid "(top|bottom)", the user's choice\).*The duties do not include heating or vaporizing it/.test(n)));
    // the stages see less feed: the duties change by no more than the bypassed liquid's share would explain
    const q = r.value.blocks.C.state, q0 = full.value.blocks.C.state;
    assert.ok(Math.abs(q.reboiler_kW - q0.reboiler_kW) < 0.05 * q0.reboiler_kW);
  }
});

test("(b) with a 0.1 mol % second liquid the bypassed column agrees with the full VLL column within that share", () => {
  const water = 75.05;
  const full = run(mk(water)), byp = run(mk(water, { feed_second_liquid: "top" }));
  assert.equal(full.outcome, "ok", full.error?.message);
  assert.equal(byp.outcome, "ok", byp.error?.message);
  const st = byp.value.blocks.C.state.feed_second_liquid;
  assert.ok(st.feeds[0].mol_share > 0.0005 && st.feeds[0].mol_share < 0.002, `${st.feeds[0].mol_share}`);
  for (const s of ["s2", "s3"]) {
    for (const [c, v] of Object.entries(full.value.streams[s].flow_kmol_h)) {
      assert.ok(Math.abs(byp.value.streams[s].flow_kmol_h[c] - v) <= st.bypassed_kmol_h, `${s} ${c}: ${byp.value.streams[s].flow_kmol_h[c]} vs ${v}`);
    }
  }
});

test("(b) refused above the limit, naming a decanter, \"stages\", top and bottom; a feed without a second liquid bypasses nothing", () => {
  for (const mode of ["top", "bottom"]) {
    const r = run(mk(76.2, { feed_second_liquid: mode }));
    assert.equal(r.outcome, "invalid_input");
    assert.match(r.error.message, /too much second liquid for a bypass/);
    assert.match(r.error.message, /Put a decanter before the column, or use feed_second_liquid: "stages"/);
    assert.match(r.error.message, /feed_second_liquid "top" and "bottom" are for a small second liquid only/);
  }
  const r = run(mk(60, { feed_second_liquid: "bottom" }));
  assert.equal(r.outcome, "ok", r.error?.message);
  assert.ok(r.value.blocks.C.notes.some(n => /no feed holds a second liquid .* so nothing bypasses the stages/.test(n)));
});

test("(b) top with a decanter: the second liquid is the decanter's feed, split there; the balance closes", () => {
  const spec = { condenser: "decanter", reflux_ratio: null, bottoms_kmol_h: 52 };
  const r = run(mk(75.9, { ...spec, feed_second_liquid: "top" }));
  const base = run(mk(75.9, spec));
  assert.equal(r.outcome, "ok", r.error?.message);
  assert.equal(base.outcome, "ok", base.error?.message);
  balanced(r.value);
  assert.equal(r.value.blocks.C.state.feed_second_liquid.into, "decanter");
  assert.ok(r.value.blocks.C.notes.some(n => /joins the decanter's feed, where it is split with the condensate/.test(n)));
  // the water-rich liquid leaves with the water-rich distillate either way; the stages are spared its heating
  assert.ok(r.value.blocks.C.state.reboiler_kW < base.value.blocks.C.state.reboiler_kW);
});
