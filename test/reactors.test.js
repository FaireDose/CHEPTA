// Conversion and yield reactors (proposal 0010, step 3; src/units/reactors.js), alone and in a flowsheet with a
// recycle. Method (docs/METHOD_SELECTION.md): the gas-phase cases (methanol from CO2, furfural to 2-methylfuran) use
// Peng-Robinson, as gases above their critical temperature (hydrogen, CO2) need an equation of state; at 1 kPa its
// vapour is the ideal gas within about 1e-5, so the reactor's duty can be compared with Cantera's ideal-gas heat of
// reaction (validation/fixtures/reactions.json, validation/python/reference_reactions.py). The liquid case (HMF
// rehydration) uses the ideal solution: the test is about the yields and the energy balance, not the activities.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, stream, runUnit, checkReactions, runFlowsheet, formationReference } from "../src/index.js";

const fixtures = JSON.parse(readFileSync(new URL("../validation/fixtures/reactions.json", import.meta.url)));
const cantera = fixtures.vapour["methanol-from-co2"].cantera;

const MEOH = { id: "meoh", name: "Methanol from CO2", stoichiometry: { "carbon-dioxide": -1, hydrogen: -3, methanol: 1, water: 1 }, phase: "vapour" };
const RWGS = { id: "rwgs", name: "Reverse water-gas shift", stoichiometry: { "carbon-dioxide": -1, hydrogen: -1, "carbon-monoxide": 1, water: 1 }, phase: "vapour" };
const gas = system({ components: ["carbon-dioxide", "hydrogen", "methanol", "water", "carbon-monoxide"], model: "PR" });
const reactions = checkReactions([MEOH, RWGS]);
const feed = (T_K, P_kPa = 1, f = { "carbon-dioxide": 100, hydrogen: 300 }) => stream(gas, { flow_kmol_h: f, T_K, P_kPa });

test("an isothermal conversion reactor needs the heat of reaction: duty = ξ ΔrH(T), as Cantera gives it", () => {
  for (const ref of cantera.filter(r => [350, 550, 700].includes(r.T_K))) {
    const r = runUnit("conversion-reactor", { sys: gas, inlets: { in: feed(ref.T_K) }, reactions,
      spec: { reactions: [{ reaction: "meoh", key: "carbon-dioxide", conversion: 0.5 }], T_K: ref.T_K } });
    assert.equal(r.reaction.extents_kmol_h.meoh, 50);
    const expect = 50 * ref.dH_J_mol / 3600;   // kmol/h x J/mol -> kW
    assert.ok(Math.abs(r.duty_kW / expect - 1) < 1e-4, `${ref.T_K} K: duty ${r.duty_kW} kW, Cantera ${expect} kW`);
    // the element and energy balances close; the components do not (they react)
    for (const d of Object.values(r.balance.elements)) assert.ok(d < 1e-12);
    assert.ok(Math.abs(r.balance.energy_kW) < 1e-9 * Math.abs(r.duty_kW));
    const out = r.outlets.out;
    assert.ok(Math.abs(out.flows[gas.ids.indexOf("methanol")] - 50) < 1e-9);
    assert.ok(Math.abs(out.flows[gas.ids.indexOf("hydrogen")] - 150) < 1e-9);
  }
});

test("an adiabatic conversion reactor heats up by the heat of reaction, and the same outlet needs no duty", () => {
  const spec = { reactions: [{ reaction: "meoh", key: "carbon-dioxide", conversion: 0.3 }] };
  const ad = runUnit("conversion-reactor", { sys: gas, inlets: { in: feed(500) }, reactions, spec: { ...spec, duty_kW: 0 } });
  assert.ok(ad.outlets.out.T_K > 520, `the exothermic reaction heats the gas: ${ad.outlets.out.T_K} K`);
  assert.ok(Math.abs(ad.balance.energy_kW) < 1e-6);
  const iso = runUnit("conversion-reactor", { sys: gas, inlets: { in: feed(500) }, reactions, spec: { ...spec, T_K: ad.outlets.out.T_K } });
  assert.ok(Math.abs(iso.duty_kW) < 1e-6 * Math.abs(iso.reaction.heat_kW), `duty ${iso.duty_kW} kW`);
});

test("reactions in parallel convert the key's inlet flow; in series, what the reactions before them left", () => {
  const two = [{ reaction: "meoh", key: "carbon-dioxide", conversion: 0.3 }, { reaction: "rwgs", key: "carbon-dioxide", conversion: 0.2 }];
  const co2 = gas.ids.indexOf("carbon-dioxide");
  const par = runUnit("conversion-reactor", { sys: gas, inlets: { in: feed(550) }, reactions, spec: { reactions: two, T_K: 550 } });
  assert.ok(Math.abs(par.outlets.out.flows[co2] - 50) < 1e-9);
  assert.ok(Math.abs(par.reaction.keyConversion["carbon-dioxide"] - 0.5) < 1e-12);
  const ser = runUnit("conversion-reactor", { sys: gas, inlets: { in: feed(550) }, reactions, spec: { reactions: two, order: "series", T_K: 550 } });
  assert.ok(Math.abs(ser.outlets.out.flows[co2] - 100 * 0.7 * 0.8) < 1e-9);
  assert.ok(Math.abs(ser.reaction.extents_kmol_h.rwgs - 0.2 * 70) < 1e-9);
  // more than all of the key in parallel, a co-reactant that runs out, a reaction that is not written, a key that is a product
  assert.throws(() => runUnit("conversion-reactor", { sys: gas, inlets: { in: feed(550) }, reactions,
    spec: { reactions: [{ reaction: "meoh", key: "carbon-dioxide", conversion: 0.7 }, { reaction: "rwgs", key: "carbon-dioxide", conversion: 0.5 }], T_K: 550 } }),
  /conversions of Carbon dioxide add up to 1\.2/);
  assert.throws(() => runUnit("conversion-reactor", { sys: gas, inlets: { in: feed(550, 1, { "carbon-dioxide": 100, hydrogen: 150 }) }, reactions,
    spec: { reactions: [{ reaction: "meoh", key: "carbon-dioxide", conversion: 0.8 }], T_K: 550 } }), /needs 240(\.0+)? kmol\/h of Hydrogen, but only 150(\.0+)? kmol\/h come in/);
  assert.throws(() => runUnit("conversion-reactor", { sys: gas, inlets: { in: feed(550) }, reactions,
    spec: { reactions: [{ reaction: "R9", key: "carbon-dioxide", conversion: 0.5 }], T_K: 550 } }), /no reaction "R9".*meoh, rwgs/);
  assert.throws(() => runUnit("conversion-reactor", { sys: gas, inlets: { in: feed(550) }, reactions,
    spec: { reactions: [{ reaction: "meoh", key: "methanol", conversion: 0.5 }], T_K: 550 } }), /must be a reactant/);
});

test("without an open enthalpy of formation, a reactor refuses unless the heat of reaction is given with its source", () => {
  // 2-methylfuran has no open enthalpy of formation (docs/missing-properties/MISSING_PROPERTIES_*.md)
  const sys = system({ components: ["furfural", "hydrogen", "2-methylfuran", "water"], model: "PR" });
  const hdo = { id: "hdo", name: "Furfural to 2-methylfuran", stoichiometry: { furfural: -1, hydrogen: -2, "2-methylfuran": 1, water: 1 }, phase: "vapour" };
  const inlet = stream(sys, { flow_kmol_h: { furfural: 1, hydrogen: 6 }, T_K: 298.15, P_kPa: 1 });
  const spec = { reactions: [{ reaction: "hdo", key: "furfural", conversion: 1 }], T_K: 298.15 };
  assert.throws(() => runUnit("conversion-reactor", { sys, inlets: { in: inlet }, reactions: checkReactions([hdo]), spec }),
    /2-Methylfuran has no open enthalpy of formation.*heatOfReaction/s);
  // a made-up heat of reaction, for this test only: at 298.15 K in the ideal gas (the vapour reaction's standard state)
  const given = checkReactions([{ ...hdo, heatOfReaction: { dH_J_mol: -100000, source: "made-up value for the test" } }]);
  const r = runUnit("conversion-reactor", { sys, inlets: { in: inlet }, reactions: given, spec });
  assert.ok(Math.abs(r.duty_kW / (1 * -100000 / 3600) - 1) < 1e-4, `duty ${r.duty_kW} kW`);
  assert.match(r.reaction.heats.hdo.from, /the heat of reaction given.*made-up value/);
});

test("a yield reactor converts its key into the yields given, closes the mass, and reports the elements", () => {
  // esterification, acetic acid + ethanol -> ethyl acetate + water, written as yields on the mass basis (the yield
  // reactor's use: a product spectrum measured in a laboratory). HMF rehydration to levulinic acid was the first
  // choice; levulinic acid melts above 298.15 K and has no open ideal-gas heat capacity, so its liquid enthalpy cannot
  // be anchored to the reference state (docs/missing-properties/MISSING_PROPERTIES_*.md).
  const sys = system({ components: ["acetic-acid", "ethanol", "ethyl-acetate", "water"], model: "ideal" });
  const MW = id => sys.MW[sys.ids.indexOf(id)];
  const per = id => MW(id) / MW("acetic-acid");
  const yields = { ethanol: -per("ethanol"), "ethyl-acetate": per("ethyl-acetate"), water: per("water") };
  const inlet = stream(sys, { flow_kmol_h: { "acetic-acid": 1, ethanol: 3 }, T_K: 298.15, P_kPa: 101.325 });
  const base = { key: "acetic-acid", conversion: 0.6, T_K: 298.15, P_kPa: 101.325 };
  const r = runUnit("yield-reactor", { sys, inlets: { in: inlet }, spec: { ...base, yields } });
  const out = r.outlets.out;
  assert.ok(Math.abs(out.flows[sys.ids.indexOf("ethyl-acetate")] - 0.6) < 1e-9);
  assert.ok(Math.abs(out.flows[sys.ids.indexOf("ethanol")] - 2.4) < 1e-9);
  assert.deepEqual(r.reaction.elementImbalance, {});
  assert.ok(r.balance.mass < 1e-12 && Math.abs(r.balance.energy_kW) < 1e-9);
  assert.equal(r.reaction.heat.from, "formation data");
  // isothermal at 298.15 K, all liquid, ideal solution: the duty is the heat of reaction of the pure liquids,
  // sum of nu (Hf,gas + h_L) at 298.15 K, h_L each pure liquid's enthalpy against its ideal gas (for acetic acid
  // it includes the dimers of its saturated vapour, so it is not -dHvap alone)
  const liq = ["acetic-acid", "ethanol", "ethyl-acetate", "water"].map(id =>
    formationReference(id).Hf_J_mol + stream(sys, { flow_kmol_h: { [id]: 1 }, T_K: 298.15, P_kPa: 101.325 }).h_J_mol);
  const dHliq = -liq[0] - liq[1] + liq[2] + liq[3];
  assert.ok(Math.abs(r.duty_kW / (0.6 * dHliq / 3600) - 1) < 1e-3, `duty ${r.duty_kW} kW, expected ${0.6 * dHliq / 3600} kW`);
  // the mole basis gives the same
  const m = runUnit("yield-reactor", { sys, inlets: { in: inlet }, spec: { ...base, basis: "mole", yields: { ethanol: -1, "ethyl-acetate": 1, water: 1 } } });
  assert.ok(Math.abs(m.outlets.out.flows[sys.ids.indexOf("water")] - 0.6) < 1e-9);
  assert.ok(Math.abs(m.duty_kW - r.duty_kW) < 1e-9 * Math.abs(r.duty_kW));
  // a closure component takes the rest; yields that do not close the mass are refused
  const c = runUnit("yield-reactor", { sys, inlets: { in: inlet }, spec: { ...base, yields: { ethanol: yields.ethanol, "ethyl-acetate": yields["ethyl-acetate"] }, closure: "water" } });
  assert.ok(Math.abs(c.reaction.closure.water - 1) < 1e-4, `closure ${c.reaction.closure.water} mol per mol of acetic acid`);
  assert.throws(() => runUnit("yield-reactor", { sys, inlets: { in: inlet }, spec: { ...base, yields: { "ethyl-acetate": 0.9, water: 0.3 } } }),
    /do not close the mass: they make 1\.2/);
  // lumped yields that close the mass but not the elements are reported, not refused
  const lumped = runUnit("yield-reactor", { sys, inlets: { in: inlet }, spec: { ...base, yields: { "ethyl-acetate": 1 } } });
  assert.ok(Object.keys(lumped.reaction.elementImbalance).length > 0);
  assert.ok(lumped.notes.some(n => /do not balance the elements/.test(n)));
});

test("a yield reactor without an open enthalpy of formation refuses unless the heat of reaction is given", () => {
  const sys = system({ components: ["furfural", "hydrogen", "2-methylfuran", "water"], model: "PR" });
  const MW = id => sys.MW[sys.ids.indexOf(id)];
  const per = id => MW(id) / MW("furfural");
  const yields = { hydrogen: -2 * per("hydrogen"), "2-methylfuran": per("2-methylfuran"), water: per("water") };
  const inlet = stream(sys, { flow_kmol_h: { furfural: 1, hydrogen: 6 }, T_K: 298.15, P_kPa: 1 });
  const spec = { key: "furfural", conversion: 0.9, T_K: 298.15, yields };
  assert.throws(() => runUnit("yield-reactor", { sys, inlets: { in: inlet }, spec }), /2-Methylfuran has no open enthalpy of formation.*heatOfReaction/s);
  // a made-up heat of reaction, for this test only: per mol of furfural, at 298.15 K, every species as the ideal gas
  const r = runUnit("yield-reactor", { sys, inlets: { in: inlet }, spec: { ...spec, heatOfReaction: { dH_J_mol: -100000, phase: "vapour", source: "made-up value for the test" } } });
  assert.ok(Math.abs(r.duty_kW / (0.9 * -100000 / 3600) - 1) < 1e-4, `duty ${r.duty_kW} kW`);
  assert.match(r.reaction.heat.from, /the heat of reaction given.*made-up value/);
});

test("a reactive recycle: methanol loop with a purge balances the elements, the components with generation, and the energy", () => {
  const doc = {
    components: ["carbon-dioxide", "hydrogen", "methanol", "water"],
    thermo: { model: "PR" },
    reactions: [MEOH],
    blocks: [
      { id: "F1", type: "feed", spec: { flow_kmol_h: { "carbon-dioxide": 100, hydrogen: 300 }, T_K: 550, P_kPa: 5000 } },
      { id: "M1", type: "mixer" },
      { id: "R1", type: "conversion-reactor", spec: { reactions: [{ reaction: "meoh", key: "carbon-dioxide", conversion: 0.25 }], T_K: 550 } },
      { id: "S1", type: "separator", spec: { fractions: { "carbon-dioxide": [1, 0], hydrogen: [1, 0], methanol: [0, 1], water: [0, 1] } } },
      { id: "P1", type: "splitter", spec: { fractions: [0.05, "rest"] } },
      { id: "G1", type: "product" }, { id: "L1", type: "product" },
    ],
    streams: [
      { id: "S1", from: "F1.out", to: "M1.in" }, { id: "S2", from: "M1.out", to: "R1.in" }, { id: "S3", from: "R1.out", to: "S1.in" },
      { id: "S4", from: "S1.out", to: "P1.in" }, { id: "S5", from: "S1.out", to: "L1.in" },
      { id: "S6", from: "P1.out", to: "G1.in" }, { id: "S7", from: "P1.out", to: "M1.in", tear: true },
    ],
  };
  const r = runFlowsheet(doc);
  assert.equal(r.loops.length, 1);
  // the whole flowsheet: feeds + generation = products for every component, and the energy balance with the heat of reaction
  for (const d of Object.values(r.balance.material_kmol_h)) assert.ok(Math.abs(d) < 1e-4, JSON.stringify(r.balance));
  assert.ok(Math.abs(r.balance.energy_kW) < 1e-3 * Math.abs(r.balance.reaction_kW), JSON.stringify(r.balance));
  // by hand: with c the CO2 into the reactor, c = 100 + 0.95 (1 - 0.25) c, so c = 100 / 0.2875 and the methanol made is
  // 0.25 c; hydrogen h = 300 + 0.95 (h - 0.75 c)
  const c = 100 / (1 - 0.95 * 0.75);
  assert.ok(Math.abs(r.streams.S2.flows[0] - c) < 1e-4 * c, `CO2 into the reactor ${r.streams.S2.flows[0]}, by hand ${c}`);
  assert.ok(Math.abs(r.streams.S2.flows[1] - (300 - 0.95 * 0.75 * c) / 0.05) < 1e-4 * c);
  // the methanol made leaves with the liquid, and the carbon that comes in leaves either as methanol or with the purge
  const meoh = r.streams.S5.flows[2];
  assert.ok(Math.abs(meoh - 0.25 * c) < 1e-4 * c);
  assert.ok(Math.abs(meoh - r.balance.generation_kmol_h.methanol) < 1e-4);
  const carbonOut = r.streams.S5.flows[2] + r.streams.S6.flows[0];
  assert.ok(Math.abs(carbonOut - 100) < 1e-4, `carbon out ${carbonOut} kmol/h`);
  // the recycle raises the overall conversion of CO2 far above the reactor's 25 % per pass
  assert.ok(meoh / 100 > 0.7, `overall conversion ${meoh / 100}`);
  assert.ok(r.blocks.R1.reaction.heat_kW < 0);
});

test("methanol from CO (CO + 2 H2): the duty as Cantera's heat of reaction; at 50 bar with PR and SRK; activity models refuse, naming the light gases", () => {
  // the maintainer's case (2026-10-23). The gases above their critical temperatures (hydrogen, carbon monoxide) need an
  // equation of state (docs/METHOD_SELECTION.md, step 1); an activity model is tried here on purpose, for its message
  const CO = { id: "co", name: "Methanol from CO", stoichiometry: { "carbon-monoxide": -1, hydrogen: -2, methanol: 1 }, phase: "vapour" };
  const comps = ["carbon-monoxide", "hydrogen", "methanol"];
  const sys = system({ components: comps, model: "PR" });
  for (const ref of fixtures.vapour["methanol-from-co"].cantera.filter(r => [350, 550, 700].includes(r.T_K))) {
    const r = runUnit("conversion-reactor", { sys, inlets: { in: stream(sys, { flow_kmol_h: { "carbon-monoxide": 100, hydrogen: 200 }, T_K: ref.T_K, P_kPa: 1 }) },
      reactions: checkReactions([CO]), spec: { reactions: [{ reaction: "co", key: "carbon-monoxide", conversion: 0.5 }], T_K: ref.T_K } });
    assert.ok(Math.abs(r.duty_kW / (50 * ref.dH_J_mol / 3600) - 1) < 1e-4, `${ref.T_K} K: duty ${r.duty_kW} kW, Cantera ${50 * ref.dH_J_mol / 3600} kW`);
  }
  const doc = model => ({
    components: comps, thermo: { model }, reactions: [CO],
    blocks: [
      { id: "F1", type: "feed", spec: { flow_kmol_h: { "carbon-monoxide": 100, hydrogen: 200 }, T_K: 523.15, P_kPa: 5000 } },
      { id: "R1", type: "conversion-reactor", spec: { reactions: [{ reaction: "co", key: "carbon-monoxide", conversion: 0.5 }], T_K: 523.15 } },
      { id: "P1", type: "product" },
    ],
    streams: [{ id: "S1", from: "F1.out", to: "R1.in" }, { id: "S2", from: "R1.out", to: "P1.in" }],
  });
  for (const model of ["PR", "SRK"]) {
    const r = runFlowsheet(doc(model));
    assert.ok(Math.abs(r.balance.generation_kmol_h.methanol - 50) < 1e-9);
    assert.ok(Math.abs(r.balance.energy_kW) < 1e-6 * Math.abs(r.blocks.R1.duty_kW));
    assert.ok(r.blocks.R1.duty_kW < 0, `${model}: the exothermic reactor is cooled`);
  }
  for (const model of ["MOD-UNIFAC-2", "NRTL"]) {
    assert.throws(() => runFlowsheet(doc(model)), /Carbon monoxide, Hydrogen are gases at room temperature: .*use Peng–Robinson or SRK/);
  }
});
