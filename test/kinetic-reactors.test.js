// The kinetic reactors, the reactive flash, the Gibbs mode and the user's own rate formula (proposal 0010, steps 5, 6
// and 9; the maintainer, 2026-10-28), against validation/python/reference_kinetics.py (scipy), the Cantera fixture of
// the equilibrium reactor, and the worked examples of Rawlings and Ekerdt (2nd ed., 6th printing, free from the
// authors). The cases are defined here and in the Python reference (CHEPTA ships no reactions).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, checkReaction, runUnit, stream } from "../src/index.js";
import { reactionEquilibrium, gibbsReactions } from "../src/equilibrium/reaction-equilibrium.js";
import { integrateStiff } from "../src/util/ode.js";
import { parseExpression } from "../src/reactions/expression.js";
import { pure } from "../src/thermo/pure.js";

const fixture = name => JSON.parse(readFileSync(new URL(`../validation/fixtures/${name}.json`, import.meta.url)));
const kin = fixture("kinetics"), eqRef = fixture("equilibrium");
const rel = (a, b) => Math.abs(a / b - 1);

test("ode23s: Robertson's stiff problem matches scipy's Radau", () => {
  const F = y => [-0.04 * y[0] + 1e4 * y[1] * y[2], 0.04 * y[0] - 1e4 * y[1] * y[2] - 3e7 * y[1] * y[1], 3e7 * y[1] * y[1]];
  const r = integrateStiff(F, [1, 0, 0], 0, kin.robertson.t, { rtol: 1e-6, atol: [1e-8, 1e-12, 1e-8], h0: 1e-6 });
  r.y.forEach((v, i) => assert.ok(rel(v, kin.robertson.y[i]) < 1e-5, `y${i + 1}: ${v} vs ${kin.robertson.y[i]}`));
});

test("reactive flash: esterification with vapour and liquid at equilibrium together matches scipy", () => {
  // NRTL with the ideal-gas vapour (acetic acid's dimers): the method of the esterification benchmark
  const ids = Object.keys(kin.reactive_flash.stoichiometry);
  const sys = system({ components: ids, model: "NRTL" });
  const rx = checkReaction({ id: "E", stoichiometry: kin.reactive_flash.stoichiometry, phase: "liquid", reversible: true });
  for (const c of kin.reactive_flash.cases) {
    const eq = reactionEquilibrium(sys, { reactions: [rx], feed: ids.map(id => c.feed[id]), T_K: c.T_K, P_kPa: c.P_kPa, phases: 2 });
    assert.ok(Math.abs(eq.extents[0] - c.extent) < 1e-6, `${c.T_K} K: extent ${eq.extents[0]} vs ${c.extent}`);
    assert.ok(Math.abs(eq.lnK[0] - c.lnK) < 1e-6);
    // the block: the same extent, and its outlet boils as the reference's
    const feed = stream(sys, { flow_kmol_h: ids.map(id => c.feed[id]), T_K: c.T_K, P_kPa: c.P_kPa });
    const r = runUnit("equilibrium-reactor", { sys, inlets: { in: feed }, spec: { reactions: ["E"], T_K: c.T_K, P_kPa: c.P_kPa, phases: 2 }, reactions: [rx] });
    assert.ok(Math.abs(r.reaction.extents_kmol_h.E - c.extent) < 1e-6);
    assert.ok(Math.abs(r.outlets.out.VF - c.VF) < 1e-4, `${c.T_K} K: VF ${r.outlets.out.VF} vs ${c.VF}`);
    assert.ok(!r.notes.some(n => /partly vapour/.test(n)));
  }
});

test("Gibbs reactor: the generated reactions give Cantera's Gibbs minimum", () => {
  // the ideal gas of the Cantera fixture (the solver needs no flash); the block below with Peng-Robinson
  const c = eqRef.gas["methanol-from-co2"];
  const ids = Object.keys(c.feed);
  const sys = system({ components: ids, model: "ideal" });
  const G = gibbsReactions(sys, ids, "vapour");
  assert.equal(G.length, ids.length - 3);   // five species, three elements
  for (const r of c.results) {
    const eq = reactionEquilibrium(sys, { reactions: G, feed: ids.map(id => c.feed[id]), T_K: r.T_K, P_kPa: r.P_kPa });
    const N = eq.flows.reduce((a, b) => a + b, 0);
    ids.forEach((id, i) => assert.ok(Math.abs(eq.flows[i] / N - r.y[id]) < 2e-4 * Math.max(r.y[id], 0.01), `${r.T_K} K ${id}`));
  }
  const pr = system({ components: ids, model: "PR" });
  const feed = stream(pr, { flow_kmol_h: ids.map(id => c.feed[id]), T_K: 523.15, P_kPa: 5000 });
  const b = runUnit("gibbs-reactor", { sys: pr, inlets: { in: feed }, spec: { T_K: 523.15, P_kPa: 5000 } });
  assert.equal(b.reaction.generated.length, 2);
  assert.ok(Object.values(b.balance.elements).every(d => d < 1e-9));
  // a species left out stays inert
  const noCO = runUnit("gibbs-reactor", { sys: pr, inlets: { in: feed }, spec: { species: ids.filter(id => id !== "carbon-monoxide"), T_K: 523.15, P_kPa: 5000 } });
  assert.equal(noCO.outlets.out.flows[ids.indexOf("carbon-monoxide")], 0);
  assert.throws(() => gibbsReactions(sys, ["carbon-dioxide", "water"], "vapour"), /cannot react/);
});

// ethanol to ethylene and diethyl ether, power-law rates with Arrhenius constants; an ideal gas at 600 K and 200 kPa
// (far above the boiling points, so the ideal-gas vapour of the "ideal" method is the reference's own)
const gasSetup = (form = "power-law") => {
  const g = kin.gas;
  const sys = system({ components: g.ids, model: "ideal" });
  const conc = (o) => Object.entries(o).map(([s, a]) => `C['${s}']^${a}`).join(" * ");
  const reactions = g.reactions.map(r => checkReaction({ id: r.id, stoichiometry: r.stoichiometry, phase: "vapour", reversible: true,
    rate: form === "power-law"
      ? { form, forward: { k: { k0: r.forward.k0, Ea_J_mol: r.forward.Ea_J_mol }, orders: r.forward.orders }, reverse: { k: { k0: r.reverse.k0, Ea_J_mol: r.reverse.Ea_J_mol }, orders: r.reverse.orders } }
      : { form: "expression", rate: `kf * ${conc(r.forward.orders)} - kr * ${conc(r.reverse.orders)}`,
        constants: { kf: { k0: r.forward.k0, Ea_J_mol: r.forward.Ea_J_mol }, kr: { k0: r.reverse.k0, Ea_J_mol: r.reverse.Ea_J_mol } } } }));
  const feed = stream(sys, { flow_kmol_h: g.ids.map(id => g.feed_kmol_h[id]), T_K: g.T_K, P_kPa: g.P_kPa });
  return { g, sys, reactions, feed };
};

test("PFR: isothermal profile and outlet match scipy's Radau; your own formula gives the same", () => {
  for (const form of ["power-law", "expression"]) {
    const { g, sys, reactions, feed } = gasSetup(form);
    const r = runUnit("pfr", { sys, inlets: { in: feed }, spec: { reactions: ["R1", "R2"], ...g.pfr, T_K: g.T_K }, reactions });
    for (const p of g.pfr_results) {
      // the profile at the reference's points, by linear interpolation between the kept steps (close at the outlet)
      const prof = r.reaction.kinetic.profile, k = prof.findIndex(q => q.z_m >= p.z_m - 1e-12);
      const a = prof[Math.max(k - 1, 0)], b = prof[k], w = b.z_m === a.z_m ? 1 : (p.z_m - a.z_m) / (b.z_m - a.z_m);
      g.ids.forEach((id, i) => {
        const v = a.flows_kmol_h[i] + w * (b.flows_kmol_h[i] - a.flows_kmol_h[i]);
        assert.ok(rel(v, p.flows_kmol_h[id]) < (p.z_m === g.pfr.L_m ? 2e-5 : 3e-3), `${form} z ${p.z_m} ${id}: ${v} vs ${p.flows_kmol_h[id]}`);
      });
    }
    assert.ok(Math.abs(r.balance.energy_kW) < 1e-6);
  }
});

test("CSTR: matches scipy's fsolve, and X = kτ/(1 + kτ) for a first-order reaction (Rawlings and Ekerdt, Example 4.2)", () => {
  const { g, sys, reactions, feed } = gasSetup();
  const r = runUnit("cstr", { sys, inlets: { in: feed }, spec: { reactions: ["R1", "R2"], ...g.cstr, T_K: g.T_K }, reactions });
  g.ids.forEach((id, i) => assert.ok(rel(r.outlets.out.flows[i], g.cstr_results[id]) < 1e-8, id));
  // Example 4.2's balance, X = kτ / (1 + kτ) with τ = V / Q at the outlet, holds exactly for any first-order rate
  const s = system({ components: ["ethane", "ethylene", "hydrogen"], model: "PR" });
  const rx = checkReaction({ id: "A", stoichiometry: { ethane: -1, ethylene: 1, hydrogen: 1 }, phase: "vapour", rate: { form: "power-law", forward: { k: 0.05, orders: { ethane: 1 } } } });
  const f = stream(s, { flow_kmol_h: [1, 0, 0], T_K: 791.15, P_kPa: 202.65 });
  const c = runUnit("cstr", { sys: s, inlets: { in: f }, spec: { reactions: ["A"], V_m3: 3, T_K: 791.15 }, reactions: [rx] });
  const kt = 0.05 * c.reaction.kinetic.residence_s;
  assert.ok(Math.abs(c.reaction.keyConversion.ethane - kt / (1 + kt)) < 1e-9);
});

test("PFR: Rawlings and Ekerdt Example 4.4, 35 % conversion in a 12.2 m tube", () => {
  // A -> B + C, first order, k = 0.05 1/s, 518 °C, 2.0 atm, 35 L/min, 2.5 cm tube; ethane -> ethylene + hydrogen as
  // A, B and C (Peng-Robinson for the hydrogen; Z differs from 1 by less than 1e-3 there)
  const s = system({ components: ["ethane", "ethylene", "hydrogen"], model: "PR" });
  const rx = checkReaction({ id: "A", stoichiometry: { ethane: -1, ethylene: 1, hydrogen: 1 }, phase: "vapour", rate: { form: "power-law", forward: { k: 0.05, orders: { ethane: 1 } } } });
  const T = 791.15, P = 2 * 101.325, Qf = 35e-3 / 60;
  const f = stream(s, { flow_kmol_h: [P * 1000 * Qf / (8.314462618 * T) * 3.6, 0, 0], T_K: T, P_kPa: P });
  const r = runUnit("pfr", { sys: s, inlets: { in: f }, spec: { reactions: ["A"], L_m: 12.2, D_m: 0.025, T_K: T }, reactions: [rx] });
  assert.ok(Math.abs(r.reaction.keyConversion.ethane - 0.35) < 0.002, `X ${r.reaction.keyConversion.ethane}`);
});

test("PFR: adiabatic with the Ergun pressure drop closes its balances; the drop at the inlet is eqn 7.69", () => {
  const s = system({ components: ["ethane", "ethylene", "hydrogen"], model: "PR" });
  const T = 791.15, Ea = 200000;
  const rx = checkReaction({ id: "A", stoichiometry: { ethane: -1, ethylene: 1, hydrogen: 1 }, phase: "vapour",
    rate: { form: "power-law", forward: { k: { k0: 0.05 * Math.exp(Ea / (8.314462618 * T)), Ea_J_mol: Ea }, orders: { ethane: 1 } } } });
  const f = stream(s, { flow_kmol_h: [0.0632, 0, 0], T_K: T, P_kPa: 202.65 });
  const drop = { particle_m: 0.02, voidage: 0.4, viscosity_Pa_s: 2e-5 };
  const r = runUnit("pfr", { sys: s, inlets: { in: f }, spec: { reactions: ["A"], L_m: 12, D_m: 0.025, duty_kW: 0, pressureDrop: drop }, reactions: [rx] });
  assert.ok(Math.abs(r.balance.energy_kW) < 1e-6 && Object.values(r.balance.elements).every(d => d < 1e-9));
  const prof = r.reaction.kinetic.profile;
  assert.ok(prof.every((p, k) => k === 0 || (p.T_K < prof[k - 1].T_K && p.P_kPa < prof[k - 1].P_kPa)), "an endothermic reaction cools; the pressure falls");
  // a short tube without reaction: ΔP = L (1-ε) u / (D_p ε³) [150 (1-ε) μ / D_p + 1.75 ρ u]
  const none = checkReaction({ id: "A", stoichiometry: { ethane: -1, ethylene: 1, hydrogen: 1 }, phase: "vapour", rate: { form: "power-law", forward: { k: 0, orders: { ethane: 1 } } } });
  const L = 0.01, e = 0.4, dp = 0.02, mu = 2e-5, A = Math.PI * 0.025 ** 2 / 4;
  const st = s.phase("vapour", T, 202.65, [1, 0, 0]);
  const v = st.Z * 8.314462618 * T / 202650, u = 0.0632 / 3.6 * v / A, rho = 30.069 / 1000 / v;
  const short = runUnit("pfr", { sys: s, inlets: { in: f }, spec: { reactions: ["A"], L_m: L, D_m: 0.025, T_K: T, pressureDrop: drop }, reactions: [none] });
  const dP = L * (1 - e) * u / (dp * e ** 3) * (150 * (1 - e) * mu / dp + 1.75 * rho * u) / 1000;
  assert.ok(rel(202.65 - short.outlets.out.P_kPa, dP) < 1e-3, `${202.65 - short.outlets.out.P_kPa} vs ${dP}`);
});

test("your own formula: errors name the position and what is known", () => {
  assert.throws(() => parseExpression("k1 * conc", { constants: ["k1"] }), /unknown name 'conc' at character 6.*Known: T, P, R, K, C\['component'\]/);
  assert.throws(() => parseExpression("exp(1, 2)"), /takes 1 argument/);
  assert.throws(() => parseExpression("2 * (T + 1"), /expected '\)'/);
  assert.throws(() => checkReaction({ id: "X", stoichiometry: { ethane: -1, ethylene: 1, hydrogen: 1 }, phase: "vapour", rate: { form: "expression", rate: "k * C['nonsense']", constants: { k: 1 } } }), /unknown component 'nonsense'/);
  assert.throws(() => checkReaction({ id: "X", stoichiometry: { ethane: -1, ethylene: 1, hydrogen: 1 }, phase: "vapour", rate: { form: "expression", rate: "T * 2", constants: { T: 1 } } }), /name of the formula itself/);
});

// Worked examples of proposal 0010, step 8 (docs/BENCHMARKS.md, "Reactions"): defined here with their sources, for a
// user to copy; CHEPTA ships no reactions.
test("worked example: ethanol to ethylene and diethyl ether over ZSM-5 (Aali and Hadi 2023), against scipy", () => {
  // Diyala J. Eng. Sci. 16(2) (2023) 30-49, doi:10.24237/djes.2023.16203, CC BY 4.0: eqns 4 and 14 with Table 9 at
  // 573.15 K (k in mol/(g_cat h), K_A in 1/atm) and Table 8 (K_eq). Written as your own formulas: partial pressures
  // in atm (p in kPa / 101.325), rates per kg of catalyst in mol/(kg s) (mol/(g h) x 1000 / 3600). Peng-Robinson for
  // the gas (docs/METHOD_SELECTION.md); the rates read y P only, so the reference's ideal gas gives the same flows.
  const e = kin.ethanol_zsm5;
  const sys = system({ components: e.ids, model: "PR" });
  const atm = n => `(p['${n}'] / 101.325)`;
  const c = { k1: e.k1 / 3.6, k2: e.k2 / 3.6, KA1: e.KA1, KA2: e.KA2, Keq1: e.Keq1, Keq2: e.Keq2 };
  const r1 = `k1 * (${atm("ethanol")} - ${atm("ethylene")} * ${atm("water")} / Keq1) / (1 + ${atm("ethanol")} * KA1)`;
  const r2 = `k2 * KA2^2 * (${atm("ethanol")}^2 - ${atm("water")} * ${atm("diethyl-ether")} / Keq2) / (1 + ${atm("ethanol")} * KA2)^2`;
  const rate = text => ({ form: "expression", rate: text, constants: c, per: "catalyst-mass", basis: "partial-pressure" });
  const reactions = [checkReaction({ id: "E1", stoichiometry: e.stoichiometry[0], phase: "vapour", rate: rate(r1) }),
    checkReaction({ id: "E2", stoichiometry: e.stoichiometry[1], phase: "vapour", rate: rate(r2) })];
  const feed = stream(sys, { flow_kmol_h: [e.feed_kmol_h, 0, 0, 0], T_K: e.T_K, P_kPa: e.P_kPa });
  // the bed: 1.166 g of catalyst (the article's largest W/F, 1.166 g_cat h/mol, for 1 mol/h); its density and the tube
  // only place it (assumed: 700 kg/m3 in a 1 cm tube)
  const D = 0.01, bed = 700, L = e.W_kg / bed / (Math.PI * D * D / 4);
  const r = runUnit("pfr", { sys, inlets: { in: feed }, spec: { reactions: ["E1", "E2"], L_m: L, D_m: D, bed_kg_m3: bed, T_K: e.T_K }, reactions });
  e.ids.forEach((id, i) => assert.ok(rel(r.outlets.out.flows[i], e.outlet_kmol_h[id]) < 1e-5, `${id}: ${r.outlets.out.flows[i]} vs ${e.outlet_kmol_h[id]}`));
  // the inlet rates, in the article's units
  const r0 = r.reaction.kinetic.profile[0].rates;
  r0.forEach((v, k) => assert.ok(rel(v * 3.6, e.rates_inlet[k]) < 1e-9, `r${k + 1} at the inlet: ${v * 3.6} vs ${e.rates_inlet[k]}`));
  assert.ok(Object.values(r.balance.elements).every(d => d < 1e-9));
});

test("worked example: phenol from cumene hydroperoxide in a CSTR (Rawlings and Ekerdt, Example 4.2): 85 % in 37 m3", () => {
  // 85 °C, Q_f = 26.9 m3/h, r = k c_CHP with k = 4.12 1/h; the book neglects the change of volume. Pure CHP fed (the
  // book names no solvent), at 5 bar so that the acetone stays liquid ("the reactants and products are liquids at
  // 85 °C"). The "ideal" model on purpose: no NRTL or UNIQUAC pairs and no Mod. UNIFAC groups for CHP, and a rate in
  // concentrations reads the liquid volume, not the activities.
  const sys = system({ components: ["cumene-hydroperoxide", "phenol", "acetone"], model: "ideal" });
  const rx = checkReaction({ id: "D", stoichiometry: { "cumene-hydroperoxide": -1, phenol: 1, acetone: 1 }, phase: "liquid",
    rate: { form: "power-law", forward: { k: 4.12 / 3600, orders: { "cumene-hydroperoxide": 1 } } } });
  const T = 358.15, P = 500;
  // the feed's molar flow from Q_f and CHP's liquid density record (ChemSep), in kg/m3
  const chp = pure("cumene-hydroperoxide");
  const f = stream(sys, { flow_kmol_h: [26.9 * chp.property("liquidDensity", T) / chp.MW, 0, 0], T_K: T, P_kPa: P });
  const r = runUnit("cstr", { sys, inlets: { in: f }, spec: { reactions: ["D"], V_m3: 37, T_K: T, P_kPa: P }, reactions: [rx] });
  const X = r.reaction.keyConversion["cumene-hydroperoxide"], kt = 4.12 / 3600 * r.reaction.kinetic.residence_s;
  assert.ok(Math.abs(X - kt / (1 + kt)) < 1e-9);
  // the book's 85 % holds with Q = Q_f; here Q is the outlet's: phenol and acetone take about 10 % more volume than
  // the CHP they come from (the liquid density records), so the same 37 m3 converts 83.8 %
  assert.ok(Math.abs(4.12 * 37 / 26.9 / (1 + 4.12 * 37 / 26.9) - 0.85) < 0.001);
  const Q = r.reaction.kinetic.Q_m3_h;
  assert.ok(Math.abs(Q / 26.9 - 1.099) < 0.005, `Q ${Q} m3/h`);
  assert.ok(Math.abs(X - 0.8376) < 0.0005, `X ${X}`);
  assert.equal(r.outlets.out.VF, 0);
});

test("Ergun without a typed viscosity: the gas mixture's from the vapour viscosity records by Wilke's rule (chemicals.viscosity.Wilke)", async () => {
  const { wilke, gasViscosity } = await import("../src/units/kinetic-reactors.js");
  const w = kin.wilke;
  assert.ok(rel(wilke(w.y, w.mu_Pa_s, w.MW), w.mix_Pa_s) < 1e-12);
  // a short tube without reaction: the drop is that of the given viscosity equal to the mixture's at the inlet
  const s = system({ components: ["ethane", "ethylene", "hydrogen"], model: "PR" });
  const none = checkReaction({ id: "A", stoichiometry: { ethane: -1, ethylene: 1, hydrogen: 1 }, phase: "vapour", rate: { form: "power-law", forward: { k: 0, orders: { ethane: 1 } } } });
  const T = 600, f = stream(s, { flow_kmol_h: [0.04, 0.02, 0.01], T_K: T, P_kPa: 202.65 });
  const run = mu => runUnit("pfr", { sys: s, inlets: { in: f }, spec: { reactions: ["A"], L_m: 0.01, D_m: 0.025, T_K: T,
    pressureDrop: { particle_m: 0.003, voidage: 0.4, viscosity_Pa_s: mu } }, reactions: [none] }).outlets.out.P_kPa;
  const mu = gasViscosity(s, [4 / 7, 2 / 7, 1 / 7], T);
  assert.ok(Math.abs(run(null) - run(mu)) < 1e-9 && run(null) < 202.65);
  // outside a record's range: refused with the remedy
  assert.throws(() => gasViscosity(s, [1, 0, 0], 2000), /viscosity_Pa_s/);
});
