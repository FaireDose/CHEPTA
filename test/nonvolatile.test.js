// Nonvolatile components (proposal 0009, step 5; the maintainer, 2026-10-14): no vapour pressure, they stay in the
// liquid, and where no open measured liquid heat capacity exists it is predicted by group additivity (Ruzicka and
// Domalski 1993, tier "predicted") instead of refusing the energy balance. The maintainer's example: heat lactic acid
// and water, then evaporate the water.
// Method (docs/METHOD_SELECTION.md): an activity model for an aqueous solution of a polar solute at 1 atm (Modified
// UNIFAC 2.0, the only one with parameters for this pair, and the ideal solution); Peng-Robinson only to check that it
// refuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, pure, solveFlowsheet, listComponents } from "../src/index.js";

const load = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const comps = load("../src/data/components.json").components;
const gc = load("../validation/data/gc/ruzicka_domalski_1993.json");

test("lactic acid is nonvolatile, with its liquid heat capacity predicted by Ruzicka-Domalski and labelled so", () => {
  const c = comps["lactic-acid"];
  assert.equal(c.class, "nonvolatile");
  assert.equal(c.vapourPressure, undefined);
  assert.equal(c.Tc_K, null);
  const cp = c.properties.liquidHeatCapacity;
  assert.equal(cp.tier, "predicted");
  assert.match(cp.source.name, /Ruzicka and Domalski 1993/);
  // the record is exactly the group sum (Cp/R = sum n (a + b T/100 + d (T/100)^2)), recomputed here from the transcribed
  // table with the groups the record names
  const groups = Object.fromEntries(cp.source.groups.split(", ").map(s => { const [n, ...g] = s.split(" "); return [g.join(" "), +n]; }));
  for (const T of [250, 298.15, 350, 400, 440]) {
    let sum = 0;
    for (const [g, n] of Object.entries(groups)) { const p = gc.groups[g]; sum += n * (p.a + p.b * T / 100 + p.d * (T / 100) ** 2); }
    const rec = cp.coefficients.A + cp.coefficients.B * T + cp.coefficients.C * T * T;
    assert.ok(Math.abs(rec / (gc.R * sum) - 1) < 1e-9, `Cp at ${T} K: ${rec} vs ${gc.R * sum}`);
  }
  // usable with activity models in the workbench
  assert.equal(listComponents().find(x => x.id === "lactic-acid").activity, true);
});

test("pure lactic acid: always a liquid, no vapour pressure, enthalpy from its heat capacity", () => {
  const p = pure("lactic-acid");
  assert.throws(() => p.psat(350), /nonvolatile/);
  const L = p.props(350, 101.325);
  assert.equal(L.phase, "liquid");
  assert.equal(L.psat_kPa, null);
  // h(350 K) = integral of cp from 298.15 K (trapezoid check)
  let h = 0; const N = 400;
  for (let k = 0; k < N; k++) { const a = 298.15 + k * (350 - 298.15) / N, b = a + (350 - 298.15) / N; h += (p.property("liquidHeatCapacity", a) + p.property("liquidHeatCapacity", b)) / 2 * (b - a); }
  assert.ok(Math.abs(L.h_J_mol - h) < 0.01, `h ${L.h_J_mol} vs ${h}`);
});

test("water + lactic acid: lactic acid stays in the liquid, raises the boiling point, and caps the vapour fraction", () => {
  for (const model of ["MOD-UNIFAC-2", "ideal"]) {
    const s = system({ components: ["water", "lactic-acid"], model });
    const z = [0.9, 0.1];
    const Tw = pure("water").Tb_K;
    const b = s.bubbleT(z, 101.325);
    assert.ok(b.T > Tw && b.T < Tw + 10, `${model}: bubble point ${b.T} K above water's ${Tw} K`);
    assert.ok(b.y[1] < 1e-15, `${model}: lactic acid in the vapour ${b.y[1]}`);
    const f = s.flash({ z, P: 101.325, VF: 0.6 });
    const vap = f.phases.find(p => p.type === "vapour"), liq = f.phases.find(p => p.type === "liquid");
    assert.ok(vap.composition[1] < 1e-15 && Math.abs(liq.composition[1] - 0.25) < 1e-9, `${model}: liquid ${liq.composition}`);
    // the P-H flash at the T-P flash's enthalpy gives the T-P state back
    const tp = s.flash({ z, T: 380, P: 101.325 });
    const ph = s.flash({ z, P: 101.325, H: tp.H_J_mol });
    assert.ok(Math.abs(ph.T - 380) < 1e-5 && Math.abs(ph.VF - tp.VF) < 1e-7, `${model}: P-H ${ph.T} ${ph.VF}`);
    // more vapour than the water in the feed, a dew point, a vapour with lactic acid: refused with the reason
    assert.throws(() => s.flash({ z, P: 101.325, VF: 0.95 }), /nonvolatile and stays in the liquid.*below 0\.9000/);
    assert.throws(() => s.flash({ z, P: 101.325, VF: 1 }), /nonvolatile/);
    assert.throws(() => s.dewT(z, 101.325), /no dew point/);
  }
  // nonvolatile components alone make a system too (the maintainer, 2026-10-16: heat a nonvolatile chemical, then cool
  // it); this replaces the earlier refusal. Tested below.
  // Peng-Robinson needs critical constants, which a nonvolatile component does not have (on purpose: the refusal)
  assert.throws(() => system({ components: ["water", "lactic-acid"], model: "PR" }), /Lactic acid is nonvolatile.*cannot be used/);
});

test("the maintainer's example: heat a lactic acid solution, then evaporate water; every duty closes the energy balance", () => {
  const sys = system({ components: ["water", "lactic-acid"], model: "MOD-UNIFAC-2" });
  const r = solveFlowsheet(sys, {
    blocks: [
      { id: "F1", type: "feed", spec: { flow_kmol_h: { water: 90, "lactic-acid": 10 }, T_K: 298.15, P_kPa: 101.325 } },
      { id: "E1", type: "heater", spec: { P_kPa: 101.325, T_K: 360 } },
      { id: "V1", type: "flash", spec: { P_kPa: 101.325, VF: 0.6 } },
      { id: "P1", type: "product" }, { id: "P2", type: "product" },
    ],
    streams: [
      { id: "S1", from: "F1.out", to: "E1.in" }, { id: "S2", from: "E1.out", to: "V1.in" },
      { id: "S3", from: "V1.vapour", to: "P1.in" }, { id: "S4", from: "V1.liquid", to: "P2.in" },
    ],
  });
  const S = r.streams;
  assert.ok(Math.abs(r.blocks.E1.duty_kW - (S.S2.H_kW - S.S1.H_kW)) < 1e-6);
  assert.ok(Math.abs(r.blocks.V1.duty_kW - (S.S3.H_kW + S.S4.H_kW - S.S2.H_kW)) < 1e-6);
  assert.ok(S.S3.flow_kmol_h["lactic-acid"] < 1e-12 && Math.abs(S.S4.flow_kmol_h["lactic-acid"] - 10) < 1e-9, "all lactic acid in the liquid");
  assert.ok(Math.abs(S.S3.flow_kmol_h.water - 60) < 1e-6, "60 kmol/h of water evaporated");
  // the evaporation duty is about the heat of vaporization of the water evaporated (40-41 kJ/mol near 100 degC), plus
  // the sensible heat to the drum temperature: between 60 x 38 and 60 x 46 kJ/mol
  const q = r.blocks.V1.duty_kW * 3.6 / 60;   // kJ per mol of water evaporated
  assert.ok(q > 38 && q < 46, `evaporation duty per mol of water ${q.toFixed(1)} kJ/mol`);
});

// proposal 0009, batch 4: sugars, sugar alcohols, polyacids and HMF, all nonvolatile
const BATCH4 = ["hmf", "glucose", "fructose", "sorbitol", "xylitol", "erythritol", "succinic-acid", "itaconic-acid", "fumaric-acid",
  "malic-acid", "citric-acid", "glycolic-acid", "glucaric-acid", "3-hydroxypropionic-acid", "fdca", "bhet", "diphenolic-acid"];

test("batch 4: each liquid heat capacity is measured, or exactly the group sum over the range the rules give", () => {
  for (const id of ["lactic-acid", ...BATCH4]) {
    const c = comps[id];
    assert.equal(c.class, "nonvolatile", id);
    assert.ok(c.nonvolatile.why.length > 20, `${id}: why it is nonvolatile`);
    const cp = c.properties.liquidHeatCapacity;
    // the enthalpy is integrated from 298.15 K, so every record reaches it
    assert.ok(cp.Tmin_K <= 298.15 && cp.Tmax_K > 340, `${id}: ${cp.Tmin_K}-${cp.Tmax_K} K`);
    if (id === "fructose") {
      // measured liquid heat capacities (stated about 2 %, above the 1 % target) beat the prediction, which is far off
      assert.equal(cp.tier, "fitted");
      assert.match(cp.source.name, /stated uncertainties up to 2\.\d %, above the 1 % target/);
      assert.match(cp.source.notes, /prediction .* would be [+-]\d+ to [+-]\d+ % from this record/);
      continue;
    }
    assert.equal(cp.tier, "predicted", id);
    assert.match(cp.source.notes, /Accuracy of the method on 20 CHEPTA liquids/);
    const groups = Object.fromEntries(cp.source.groups.split(", ").map(s => { const [n, ...g] = s.split(" "); return [g.join(" "), +n]; }));
    for (const g of Object.keys(groups)) assert.ok(gc.groups[g], `${id}: group ${g} transcribed`);
    for (let k = 0; k <= 8; k++) {
      const T = cp.Tmin_K + (cp.Tmax_K - cp.Tmin_K) * k / 8;
      let sum = 0;
      for (const [g, n] of Object.entries(groups)) { const p = gc.groups[g]; sum += n * (p.a + p.b * T / 100 + p.d * (T / 100) ** 2); }
      const rec = cp.coefficients.A + cp.coefficients.B * T + cp.coefficients.C * T * T;
      assert.ok(Math.abs(rec / (gc.R * sum) - 1) < 1e-9, `${id} at ${T} K`);
    }
    // the range: where every group was fitted, the upper end raised by 100 K (part II, p. 620), except for polyols
    const hi = Math.min(...Object.keys(groups).map(g => gc.groups[g].T_K[1]));
    const polyol = (groups["O-(H)(C) (diol)"] ?? 0) >= 2;
    assert.equal(cp.Tmax_K, polyol ? hi : hi + gc.extrapolation_K, id);
  }
});

test("batch 4 in water: the solute stays in the liquid and raises the boiling point; FDCA has no Mod. UNIFAC 2.0 groups", () => {
  // Method (docs/METHOD_SELECTION.md): an activity model for aqueous solutions of polar solutes at 1 atm; Modified
  // UNIFAC 2.0 is the only one with parameters for these pairs
  const Tw = pure("water").Tb_K;
  for (const id of ["sorbitol", "glucose", "hmf", "succinic-acid", "citric-acid"]) {
    const s = system({ components: ["water", id], model: "MOD-UNIFAC-2" });
    const z = [0.95, 0.05];
    const b = s.bubbleT(z, 101.325);
    assert.ok(b.T > Tw && b.T < Tw + 5, `${id}: bubble point ${b.T} K`);
    assert.ok(b.y[1] < 1e-15, `${id} in the vapour ${b.y[1]}`);
    const tp = s.flash({ z, T: 380, P: 101.325 });
    const ph = s.flash({ z, P: 101.325, H: tp.H_J_mol });
    assert.ok(Math.abs(ph.T - 380) < 1e-5 && Math.abs(ph.VF - tp.VF) < 1e-7, `${id}: P-H ${ph.T} ${ph.VF}`);
  }
  assert.throws(() => system({ components: ["water", "fdca"], model: "MOD-UNIFAC-2" }), /no Modified UNIFAC 2\.0 groups/);
  // with the ideal solution it works (on purpose: the model that needs no groups)
  const s = system({ components: ["water", "fdca"], model: "ideal" });
  assert.ok(s.bubbleT([0.99, 0.01], 101.325).T > Tw);
});

test("nonvolatile components alone: heated and cooled as a liquid; no boiling point, no vapour fraction", () => {
  // the maintainer's case (2026-10-16): 2,5-furandicarboxylic acid alone, heated, then cooled in a flowsheet
  for (const model of ["NRTL", "ideal"]) {
    const sys = system({ components: ["fdca"], model });
    const r = solveFlowsheet(sys, {
      blocks: [
        { id: "F1", type: "feed", spec: { flow_kmol_h: { fdca: 1 }, T_K: 300, P_kPa: 101.325 } },
        { id: "H1", type: "heater", spec: { T_K: 380 } },
        { id: "C1", type: "heater", spec: { duty_kW: -2 } },
        { id: "P1", type: "product" },
      ],
      streams: [{ id: "S1", from: "F1.out", to: "H1.in" }, { id: "S2", from: "H1.out", to: "C1.in" }, { id: "S3", from: "C1.out", to: "P1.in" }],
    });
    const S = r.streams;
    for (const s of Object.values(S)) assert.equal(s.VF, 0, `${model}: always liquid`);
    // the duties are the enthalpy changes, and the liquid enthalpy is the integral of the liquid heat capacity
    const p = pure("fdca");
    const cp = T => p.property("liquidHeatCapacity", T);
    let integral = 0;
    for (let k = 0; k < 800; k++) { const T = 300 + (k + 0.5) * 0.1; integral += cp(T) * 0.1; }
    assert.ok(Math.abs(r.blocks.H1.duty_kW - integral / 3600) < 1e-4, `${model}: heater ${r.blocks.H1.duty_kW} kW, integral ${integral / 3600} kW`);
    assert.ok(Math.abs(r.blocks.C1.duty_kW + 2) < 1e-9 && Math.abs(S.S3.H_kW - S.S2.H_kW + 2) < 1e-6, `${model}: cooler`);
    assert.ok(S.S3.T_K > 300 && S.S3.T_K < 380, `${model}: cooled to ${S.S3.T_K} K`);
    // more cooling than the heat-capacity record covers: refused with the reason
    assert.throws(() => sys.flash({ z: [1], P: 101.325, H: -1e5 }), /starts at 298\.15 K, so its liquid enthalpy below it cannot be calculated/);
  }
  const two = system({ components: ["fdca", "lactic-acid"], model: "ideal" });
  const z = [0.5, 0.5];
  assert.equal(two.flash({ z, T: 350, P: 101.325 }).VF, 0);
  const tp = two.flash({ z, T: 350, P: 101.325 });
  assert.ok(Math.abs(two.flash({ z, P: 101.325, H: tp.H_J_mol }).T - 350) < 1e-6, "P-H gives the T-P state back");
  assert.throws(() => two.flash({ z, P: 101.325, VF: 0 }), /nothing in this feed evaporates.*vapour fraction cannot be specified/);
  assert.throws(() => two.bubbleT(z, 101.325), /nothing in this liquid evaporates.*no bubble point/);
  assert.throws(() => two.bubbleP(z, 350), /no bubble point/);
  assert.throws(() => two.dewT(z, 101.325), /no dew point/);
});
