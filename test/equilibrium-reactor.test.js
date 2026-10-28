// The equilibrium reactor (proposal 0010, step 4): src/equilibrium/reaction-equilibrium.js and the
// "equilibrium-reactor" block of src/units/reactors.js, against independent references
// (validation/python/reference_equilibrium.py -> validation/fixtures/equilibrium.json):
//   gas: Cantera's Gibbs minimization of an ideal-gas phase with the same species, built from the same records;
//   liquid: scipy with the NRTL of reference_model.py.
// Methods: the comparison with Cantera uses the "ideal" model on purpose (an ideal gas, the state Cantera's reference
// is in), through the equilibrium solver alone: a stream of hydrogen with the "ideal" model is refused (its extrapolated
// vapour pressure overflows; Raoult's law cannot hold it). The reactor block is run with Peng-Robinson, the method of
// docs/METHOD_SELECTION.md for light gases with polar components, and checked for its approach to the ideal gas at low
// pressure. The liquid case uses NRTL with the databank's fitted pairs, as for the esterification of test/benchmarks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, checkReaction, runUnit, stream, reactionProperties } from "../src/index.js";
import { reactionEquilibrium } from "../src/equilibrium/reaction-equilibrium.js";

const ref = JSON.parse(readFileSync(new URL("../validation/fixtures/equilibrium.json", import.meta.url)));
const rx = (id, st, phase) => checkReaction({ id, stoichiometry: st, phase });

test("gas equilibria agree with Cantera's Gibbs minimization (ideal gas)", () => {
  for (const [name, c] of Object.entries(ref.gas)) {
    const ids = Object.keys(c.feed);
    const sys = system({ components: ids, model: "ideal" });
    const reactions = Object.entries(c.reactions).map(([id, st]) => rx(id, st, "vapour"));
    for (const r of c.results) {
      const eq = reactionEquilibrium(sys, { reactions, feed: ids.map(i => 100 * c.feed[i]), T_K: r.T_K, P_kPa: r.P_kPa });
      const F = eq.flows.reduce((a, v) => a + v, 0);
      ids.forEach((id, i) => {
        const y = eq.flows[i] / F, yr = r.y[id];
        assert.ok(Math.abs(y - yr) <= Math.max(2e-4 * yr, 2e-7), `${name} ${r.T_K} K ${r.P_kPa} kPa ${id}: ${y} vs Cantera ${yr}`);
      });
      assert.ok(Math.abs(F - 100 * r.total) < 2e-4 * F, `${name}: total ${F} vs ${100 * r.total}`);
    }
  }
});

test("the reactor block keeps the elements and the energy (Peng-Robinson, every gas case)", () => {
  for (const [name, c] of Object.entries(ref.gas)) {
    const ids = Object.keys(c.feed);
    const sys = system({ components: ids, model: "PR" });
    const reactions = Object.entries(c.reactions).map(([id, st]) => rx(id, st, "vapour"));
    for (const r of c.results) {
      const feed = stream(sys, { flow_kmol_h: ids.map(i => 100 * c.feed[i]), T_K: r.T_K, P_kPa: r.P_kPa });
      const u = runUnit("equilibrium-reactor", { sys, inlets: { in: feed }, reactions,
        spec: { reactions: reactions.map(x => ({ reaction: x.id })), T_K: r.T_K, P_kPa: r.P_kPa } });
      assert.ok(Math.max(...Object.values(u.balance.elements).map(Math.abs)) < 1e-9, `${name} ${r.T_K} K: elements`);
      assert.ok(Math.abs(u.balance.energy_kW) < 1e-6 * Math.max(1, Math.abs(u.duty_kW)), `${name} ${r.T_K} K: energy`);
      assert.ok(u.reaction.equilibrium.residual < 1e-8);
    }
  }
});

test("hydrogen with the ideal (Raoult) model is refused with the remedy, not iterated on forever", () => {
  const sys = system({ components: ["carbon-dioxide", "hydrogen", "methanol", "water", "carbon-monoxide"], model: "ideal" });
  assert.throws(() => stream(sys, { flow_kmol_h: [100, 300, 0, 0, 0], T_K: 523.15, P_kPa: 5000 }),
    e => e.code === "OUT_OF_RANGE" && /Hydrogen/.test(e.message) && /Peng-Robinson or SRK/.test(e.message));
});

test("liquid esterification with NRTL agrees with the scipy reference", () => {
  const c = ref.liquid["ethyl-acetate-esterification"];
  const ids = Object.keys(c.feeds[0]);
  const sys = system({ components: ids, model: "NRTL" });
  const r = rx("esterification", c.reactions.esterification, "liquid");
  for (const row of c.results) {
    assert.ok(Math.abs(reactionProperties(r, row.T_K).lnK - row.lnK) < 1e-6, `lnK at ${row.T_K} K`);
    const eq = reactionEquilibrium(sys, { reactions: [r], feed: ids.map(i => row.feed[i]), T_K: row.T_K, P_kPa: 101.325 });
    assert.ok(Math.abs(eq.extents[0] - row.extent) < 1e-6 * row.extent, `${row.T_K} K ${JSON.stringify(row.feed)}: ${eq.extents[0]} vs ${row.extent}`);
  }
});

const methanolSys = model => system({ components: ["carbon-dioxide", "hydrogen", "methanol", "water", "carbon-monoxide"], model });
const methanolRx = () => [rx("m", { "carbon-dioxide": -1, hydrogen: -3, methanol: 1, water: 1 }, "vapour"),
  rx("s", { "carbon-dioxide": -1, hydrogen: -1, "carbon-monoxide": 1, water: 1 }, "vapour")];

test("the duty given: the adiabatic outlet, and the duty of a given temperature brings back that temperature", () => {
  const sys = methanolSys("PR"), reactions = methanolRx();
  const feed = stream(sys, { flow_kmol_h: [100, 300, 0, 0, 0], T_K: 523.15, P_kPa: 5000 });
  const spec = { reactions: [{ reaction: "m" }, { reaction: "s" }] };
  const isoT = runUnit("equilibrium-reactor", { sys, inlets: { in: feed }, reactions, spec: { ...spec, T_K: 523.15 } });
  assert.ok(isoT.duty_kW < 0, "methanol synthesis is exothermic: heat is removed at constant T");
  const back = runUnit("equilibrium-reactor", { sys, inlets: { in: feed }, reactions, spec: { ...spec, duty_kW: isoT.duty_kW } });
  assert.ok(Math.abs(back.outlets.out.T_K - 523.15) < 1e-5);
  const adiabatic = runUnit("equilibrium-reactor", { sys, inlets: { in: feed }, reactions, spec: { ...spec, duty_kW: 0 } });
  assert.ok(adiabatic.outlets.out.T_K > 523.15, "the adiabatic outlet is hotter");
  assert.ok(adiabatic.reaction.extents_kmol_h.m < isoT.reaction.extents_kmol_h.m, "and goes less far for an exothermic reaction");
  assert.ok(Math.abs(adiabatic.balance.energy_kW) < 1e-6);
});

test("an approach to equilibrium: a fraction of the extent, or K at T + dT", () => {
  const sys = methanolSys("PR"), reactions = methanolRx();
  const feed = stream(sys, { flow_kmol_h: [100, 300, 0, 0, 0], T_K: 523.15, P_kPa: 5000 });
  const full = runUnit("equilibrium-reactor", { sys, inlets: { in: feed }, reactions, spec: { reactions: ["m", "s"], T_K: 523.15 } });
  const part = runUnit("equilibrium-reactor", { sys, inlets: { in: feed }, reactions,
    spec: { reactions: [{ reaction: "m", approach: { dT_K: 25 } }, { reaction: "s", approach: { fraction: 0.5 } }], T_K: 523.15 } });
  const e = part.reaction.equilibrium.reactions;
  assert.equal(e.m.T_K, 548.15);
  assert.ok(Math.abs(e.m.lnK - reactionProperties(reactions[0], 548.15).lnK) < 1e-12);
  assert.ok(Math.abs(part.reaction.extents_kmol_h.s - 0.5 * e.s.equilibriumExtent) < 1e-12);
  assert.ok(part.reaction.extents_kmol_h.m < full.reaction.extents_kmol_h.m, "K at a higher T: less methanol");
});

test("Peng-Robinson tends to the ideal gas at low pressure, and differs at 50 bar", () => {
  const reactions = methanolRx();
  const go = (model, P) => reactionEquilibrium(methanolSys(model), { reactions, feed: [1, 3, 0, 0, 0], T_K: 523.15, P_kPa: P }).extents;
  const [a, b] = [go("ideal", 10), go("PR", 10)];
  a.forEach((v, k) => assert.ok(Math.abs(v - b[k]) < 2e-3 * Math.abs(v), `10 kPa: ${v} vs ${b[k]}`));
  const [c, d] = [go("ideal", 5000), go("PR", 5000)];
  assert.ok(Math.abs(c[0] - d[0]) > 1e-2 * c[0], "50 bar: the fugacity coefficients matter");
});

test("what cannot be computed is refused with the reason; a reaction that cannot run has no extent", () => {
  const sys = methanolSys("PR");
  const feed = stream(sys, { flow_kmol_h: [100, 300, 0, 0, 0], T_K: 523.15, P_kPa: 5000 });
  const reactions = [...methanolRx(), rx("co", { "carbon-monoxide": -1, hydrogen: -2, methanol: 1 }, "vapour"),
    rx("liq", { "carbon-dioxide": -1, hydrogen: -3, methanol: 1, water: 1 }, "liquid")];
  // three reactions of which one is the sum of the other two
  assert.throws(() => runUnit("equilibrium-reactor", { sys, inlets: { in: feed }, reactions, spec: { reactions: ["m", "s", "co"], T_K: 523.15 } }),
    e => e.code === "NO_CONVERGENCE" && /not independent/.test(e.message));
  assert.throws(() => runUnit("equilibrium-reactor", { sys, inlets: { in: feed }, reactions, spec: { reactions: ["m", "liq"], T_K: 523.15 } }),
    e => e.code === "BAD_INPUT" && /all be vapour reactions or all liquid/.test(e.message));
  assert.throws(() => runUnit("equilibrium-reactor", { sys, inlets: { in: feed }, reactions, spec: { reactions: ["m"], VF: 1 } }),
    e => e.code === "BAD_INPUT" && /vapour fraction is not a specification/.test(e.message));
  // no hydrogen fed: methanol synthesis cannot run, the shift neither; extents 0, said
  const dry = stream(sys, { flow_kmol_h: [100, 0, 0, 50, 0], T_K: 523.15, P_kPa: 5000 });
  const u = runUnit("equilibrium-reactor", { sys, inlets: { in: dry }, reactions, spec: { reactions: ["m"], T_K: 523.15 } });
  assert.equal(u.reaction.extents_kmol_h.m, 0);
  assert.match(u.notes.join(" "), /neither fed nor formed/);
  // no Gibbs energy of formation for a species: no K, unless a correlation is given
  const s2 = system({ components: ["glycolic-acid", "formaldehyde", "formic-acid"], model: "ideal" });
  const r2 = rx("ga", { "glycolic-acid": -1, formaldehyde: 1, "formic-acid": 1 }, "liquid");
  const f2 = stream(s2, { flow_kmol_h: [1, 0, 0], T_K: 320, P_kPa: 101.325 });
  assert.throws(() => runUnit("equilibrium-reactor", { sys: s2, inlets: { in: f2 }, reactions: [r2], spec: { reactions: ["ga"], T_K: 320 } }),
    e => e.code === "MISSING_DATA" && /Glycolic acid/.test(e.message));
});

test("a liquid reaction whose outlet is partly vapour says so", () => {
  const c = ref.liquid["ethyl-acetate-esterification"];
  const ids = Object.keys(c.feeds[0]);
  const sys = system({ components: ids, model: "NRTL" });
  const r = rx("esterification", c.reactions.esterification, "liquid");
  const feed = stream(sys, { flow_kmol_h: [10, 10, 0, 0], T_K: 345, P_kPa: 101.325 });
  const cool = runUnit("equilibrium-reactor", { sys, inlets: { in: feed }, reactions: [r], spec: { reactions: ["esterification"], T_K: 330 } });
  assert.ok(!cool.notes.some(n => /partly vapour/.test(n)), "at 330 K and 1 atm the mixture is liquid");
  const hot = runUnit("equilibrium-reactor", { sys, inlets: { in: feed }, reactions: [r], spec: { reactions: ["esterification"], T_K: 380 } });
  assert.match(hot.notes.join(" "), /partly vapour .* computed for the whole mixture as liquid/);
});
