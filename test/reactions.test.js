// Reactions (proposal 0010, step 2; src/reactions/): the checks of a reaction the user writes, ΔrH°, ΔrG° and K(T)
// from the components' formation data, and the rate forms.
//
// K(T) is compared with validation/fixtures/reactions.json (validation/python/reference_reactions.py): the vapour
// reactions with Cantera, from NASA polynomials fitted to the same ideal-gas heat capacities, and with an
// enthalpy-and-entropy integration in scipy; the liquid reactions with that scipy integration. The reactions are
// examples written here (CHEPTA ships none); the property method is not involved (standard states only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  checkReaction, checkReactions, reactionBalance, reactionProperties, speciesProperties, reactionRate, rateSpecies, RATE_FORMS, isCheptaError,
} from "../src/index.js";

const ref = JSON.parse(readFileSync(new URL("../validation/fixtures/reactions.json", import.meta.url)));
const R = 8.314462618;

const throwsCode = (fn, code, re) => assert.throws(fn, e => isCheptaError(e) && e.code === code && (!re || re.test(e.message)), String(re));

test("element balance: a balanced reaction passes, an unbalanced one is refused with the imbalance named", () => {
  const r = checkReaction({ id: "meoh", stoichiometry: { CO2: -1, hydrogen: -3, methanol: 1, water: 1 }, phase: "vapour" });
  assert.deepEqual(r.stoichiometry, { "carbon-dioxide": -1, hydrogen: -3, methanol: 1, water: 1 });
  assert.equal(r.balance.ok, true);
  assert.equal(r.balance.text, "balanced: C H O");
  const b = reactionBalance({ ethanol: -1, ethylene: 1 });
  assert.equal(b.ok, false);
  assert.deepEqual(b.imbalance, { H: -2, O: -1 });
  throwsCode(() => checkReaction({ id: "x", stoichiometry: { ethanol: -1, ethylene: 1 }, phase: "vapour" }), "BAD_INPUT", /not balanced: H -2 \(more in the reactants\), O -1/);
  // fractional coefficients are fine
  assert.equal(checkReaction({ id: "h2", stoichiometry: { hydrogen: -1, oxygen: -0.5, water: 1 }, phase: "vapour" }).balance.ok, true);
});

test("the reaction's checks: names, coefficients, phase, reactants and products, ids", () => {
  const base = { id: "e", stoichiometry: { ethanol: -1, ethylene: 1, water: 1 }, phase: "vapour" };
  throwsCode(() => checkReaction({ ...base, stoichiometry: { ethanol: -1, ethene2: 1, water: 1 } }), "BAD_INPUT", /Unknown component "ethene2"/);
  throwsCode(() => checkReaction({ ...base, phase: "solid" }), "BAD_INPUT", /"phase" must be "vapour" or "liquid"/);
  throwsCode(() => checkReaction({ ...base, id: "" }), "BAD_INPUT", /give the reaction an "id"/);
  throwsCode(() => checkReaction({ ...base, stoichiometry: { ethanol: 1, ethylene: 1, water: 1 } }), "BAD_INPUT", /at least one reactant/);
  throwsCode(() => checkReaction({ ...base, stoichiometry: { ethanol: -1, "64-17-5": -1, ethylene: 2, water: 2 } }), "BAD_INPUT", /listed twice/);
  throwsCode(() => checkReaction({ ...base, stoichiometry: { ethanol: -1, ethylene: 1, water: 1, methanol: 0 } }), "BAD_INPUT", /coefficient of methanol is 0/);
  throwsCode(() => checkReactions([base, base]), "BAD_INPUT", /Two reactions have the id "e"/);
  assert.equal(checkReaction({ ...base, phase: "gas" }).phase, "vapour");
});

test("K(T) of vapour reactions from formation data agrees with Cantera to 1e-6 (relative), ΔrH° to 1e-6", () => {
  for (const [name, r] of Object.entries(ref.vapour)) {
    const rx = checkReaction({ id: name, stoichiometry: r.stoichiometry, phase: "vapour", reversible: true });
    for (const c of r.cantera) {
      const p = reactionProperties(rx, c.T_K);
      assert.equal(p.from, "formation data");
      assert.equal(p.standardState, "ideal gas at 100 kPa");
      assert.ok(Math.abs(p.K / Math.exp(c.lnK) - 1) < 1e-6, `${name} ${c.T_K} K: K ${p.K} vs Cantera ${Math.exp(c.lnK)}`);
      assert.ok(Math.abs(p.dH_J_mol - c.dH_J_mol) <= 1e-6 * Math.abs(c.dH_J_mol), `${name} ${c.T_K} K: ΔH ${p.dH_J_mol} vs ${c.dH_J_mol}`);
    }
    // and with the second, scipy route of the reference
    for (const s of r.scipy) assert.ok(Math.abs(reactionProperties(rx, s.T_K).lnK - s.lnK) < 1e-6, `${name} ${s.T_K} K (scipy)`);
  }
});

test("outside a heat-capacity record the result says so", () => {
  const rx = checkReaction({ id: "rwgs", stoichiometry: ref.vapour["reverse-water-gas-shift"].stoichiometry, phase: "vapour", reversible: true });
  assert.deepEqual(reactionProperties(rx, 450).warnings, []);
  const w = reactionProperties(rx, 700).warnings;
  assert.ok(w.some(s => /Carbon monoxide: 700\.00 K is outside the range of its ideal-gas heat capacity \(68\.16-500 K\)/.test(s)), w.join("; "));
});

test("K(T) of liquid reactions (pure-liquid standard state) agrees with the scipy reference to 1e-6", () => {
  for (const [name, r] of Object.entries(ref.liquid)) {
    const rx = checkReaction({ id: name, stoichiometry: r.stoichiometry, phase: "liquid", reversible: true });
    for (const s of r.scipy) {
      const p = reactionProperties(rx, s.T_K);
      assert.equal(p.standardState, "pure liquid at T (pressure effect neglected)");
      assert.ok(Math.abs(p.lnK - s.lnK) < 1e-6, `${name} ${s.T_K} K: ln K ${p.lnK} vs ${s.lnK}`);
      assert.ok(Math.abs(p.dH_J_mol - s.dH_J_mol) < 1e-3, `${name} ${s.T_K} K: ΔH ${p.dH_J_mol} vs ${s.dH_J_mol}`);
    }
  }
  // the paths are stated: through the saturated vapour, and crystal to liquid with the melting data
  const ether = reactionProperties(checkReaction({ id: "e", stoichiometry: ref.liquid["diethyl-ether-from-ethanol"].stoichiometry, phase: "liquid" }), 320);
  assert.ok(ether.notes.some(n => /Diethyl ether: ideal gas to pure liquid through the saturated vapour/.test(n)));
  const iso = reactionProperties(checkReaction({ id: "i", stoichiometry: ref.liquid["glucose-isomerization"].stoichiometry, phase: "liquid" }), 298.15);
  assert.ok(iso.notes.some(n => /D-Glucose: crystal to liquid at 298\.15 K with ΔHfus 40\.00 kJ\/mol at Tm 448 K/.test(n)), iso.notes.join("; "));
});

test("acetic acid (dimerizing in the vapour) in a liquid reaction: its monomer record reaches the liquid through the dimer equilibrium", () => {
  const ester = checkReaction({ id: "ester", stoichiometry: { "acetic-acid": -1, ethanol: -1, "ethyl-acetate": 1, water: 1 }, phase: "liquid", reversible: true });
  const p = reactionProperties(ester, 323.15);
  assert.ok(p.notes.some(n => /Acetic acid: ideal gas to pure liquid .* monomers and dimers .* dimerization enthalpy -60\.6 kJ\/mol/.test(n)), p.notes.join("; "));
  assert.ok(Number.isFinite(p.K) && p.K > 1);
  // in the vapour, the standard state is the ideal-gas monomer of the record
  assert.ok(Number.isFinite(reactionProperties({ ...ester, phase: "vapour", standardState: "ideal gas at 100 kPa" }, 340).K));
});

test("the liquid path from the ideal-gas records meets measured liquid values (NIST WebBook) within 2 kJ/mol", () => {
  // validation/data/reactions/liquid_formation_webbook.json: the most recent article's liquid ΔfH° (or ΔcH°) and S°;
  // ΔfG° from them with the CODATA entropies of the elements. Acetic acid tests the dimer path (without it, its
  // liquid enthalpy would be about 28 kJ/mol off).
  const wb = JSON.parse(readFileSync(new URL("../validation/data/reactions/liquid_formation_webbook.json", import.meta.url)));
  // the species' values are read from a balanced reaction that holds them all (a species alone is no reaction)
  const rx = checkReaction({ id: "e", stoichiometry: { "acetic-acid": -1, ethanol: -1, "ethyl-acetate": 1, water: 1 }, phase: "liquid" });
  assert.deepEqual(Object.keys(rx.stoichiometry).sort(), Object.keys(wb.components).sort());
  const p = reactionProperties(rx, 298.15);
  for (const s of p.species) {
    const m = wb.components[s.id];
    assert.ok(Math.abs(s.H_J_mol - m.Hf_J_mol) < 2000, `${s.id}: H ${s.H_J_mol} vs WebBook ${m.Hf_J_mol} (${m.Hf_from})`);
    assert.ok(Math.abs(s.G_J_mol - m.Gf_J_mol) < 2000, `${s.id}: G ${s.G_J_mol} vs WebBook ${m.Gf_J_mol} (${m.S_from})`);
  }
});

test("the vapour and liquid standard states of one reaction differ by the species' saturation terms", () => {
  const st = { ethanol: -2, "diethyl-ether": 1, water: 1 };
  const T = 330;
  const g = reactionProperties(checkReaction({ id: "g", stoichiometry: st, phase: "vapour" }), T);
  const l = reactionProperties(checkReaction({ id: "l", stoichiometry: st, phase: "liquid" }), T);
  // ΔrG°(liquid) - ΔrG°(vapour) = RT Σ ν ln(phi_sat psat / P°): positive here, the ether being the most volatile
  assert.ok(l.dG_J_mol - g.dG_J_mol > 0);
  assert.ok(Math.abs((l.dG_J_mol - g.dG_J_mol) / (R * T)) < 10);
});

test("what cannot be computed is refused with the reason, and a cited K correlation takes over", () => {
  // no open formation data (HMF): refused; with a correlation, K is the correlation's and ΔrH° unknown
  const st = { hmf: -1, water: -2, "levulinic-acid": 1, "formic-acid": 1 };
  const rx = checkReaction({ id: "hmf", stoichiometry: st, phase: "liquid" });
  throwsCode(() => reactionProperties(rx, 400), "MISSING_DATA", /5-Hydroxymethylfurfural|HMF/i);
  const withK = checkReaction({ id: "hmf", stoichiometry: st, phase: "liquid", reversible: true,
    equilibrium: { lnK: { A: 1, B: 100, C: 0 }, T_K: [350, 450], source: "a test value, not data" } });
  const p = reactionProperties(withK, 400);
  assert.ok(Math.abs(p.lnK - (1 + 100 / 400)) < 1e-12);
  assert.equal(p.dH_J_mol, null);
  assert.match(p.from, /correlation .*a test value, not data/);
  assert.match(reactionProperties(withK, 500).warnings.join(), /outside the range of its K correlation \(350-450 K\)/);
  // a nonvolatile species in a vapour reaction
  throwsCode(() => reactionProperties(checkReaction({ id: "iso", stoichiometry: { glucose: -1, fructose: 1 }, phase: "vapour" }), 300), "MISSING_DATA", /nonvolatile/);
});

test("power law: the rate, elementary orders by default, Arrhenius with k0 T^B", () => {
  const rx = checkReaction({ id: "d", stoichiometry: { ethanol: -1, ethylene: 1, water: 1 }, phase: "vapour",
    rate: { form: "power-law", forward: { k: { k0: 2.5e6, Ea_J_mol: 8e4, B: 0.5 }, orders: { ethanol: 1.5 } }, per: "catalyst-mass", T_K: [500, 700] } });
  assert.equal(rx.rate.units, "mol/(kg s)");
  assert.deepEqual(rateSpecies(rx.rate), ["ethanol"]);
  const T = 600, c = 12.3;
  const r = reactionRate(rx, { T_K: T, values: { ethanol: c } });
  const k = 2.5e6 * Math.sqrt(T) * Math.exp(-8e4 / (R * T));
  assert.ok(Math.abs(r.r / (k * c ** 1.5) - 1) < 1e-14);
  assert.deepEqual(r.warnings, []);
  assert.match(reactionRate(rx, { T_K: 450, values: { ethanol: c } }).warnings[0], /outside the range of its rate law \(500-700 K\)/);
  // default orders: the reactants' coefficients (eqn 5.38)
  const el = checkReaction({ id: "a", stoichiometry: { nitrogen: -1, hydrogen: -3, ammonia: 2 }, phase: "vapour", rate: { form: "power-law", forward: { k: 1 } } });
  assert.deepEqual(el.rate.forward.orders, { nitrogen: 1, hydrogen: 3 });
  throwsCode(() => reactionRate(el, { T_K: 500, values: { nitrogen: 1 } }), "BAD_INPUT", /needs the concentration of Hydrogen/);
  throwsCode(() => reactionRate(el, { T_K: 500, values: { nitrogen: -1, hydrogen: 1 } }), "BAD_INPUT", /must be zero or positive/);
});

test("reversible power law from equilibrium: the rate is zero where the activities meet K, and has the right sign", () => {
  const rx = checkReaction({ id: "ether", stoichiometry: { ethanol: -2, "diethyl-ether": 1, water: 1 }, phase: "liquid", reversible: true,
    rate: { form: "power-law", basis: "activity", forward: { k: { k0: 3e5, Ea_J_mol: 6e4 } }, reverse: "from-equilibrium" } });
  assert.deepEqual(rx.rate.reverse.orders, { "diethyl-ether": 1, water: 1 });
  const T = 340, K = reactionProperties(rx, T).K;
  const a = { ethanol: 0.3, "diethyl-ether": 0.5 };
  const atEq = reactionRate(rx, { T_K: T, values: { ...a, water: K * 0.09 / 0.5 } });
  assert.ok(Math.abs(atEq.r) < 1e-12 * atEq.forward, `${atEq.r}`);
  assert.ok(Math.abs(atEq.K / K - 1) < 1e-14);
  assert.ok(reactionRate(rx, { T_K: T, values: { ...a, water: 0.5 * K * 0.09 / 0.5 } }).r > 0, "below equilibrium: forward");
  assert.ok(reactionRate(rx, { T_K: T, values: { ...a, water: 2 * K * 0.09 / 0.5 } }).r < 0, "beyond equilibrium: backward");
  // in kPa (vapour, partial pressures): K_p = K P°^Σν; Σν = 0 here, so try ammonia (Σν = -2)
  const nh3 = checkReaction({ id: "nh3", stoichiometry: { nitrogen: -1, hydrogen: -3, ammonia: 2 }, phase: "vapour", reversible: true,
    rate: { form: "power-law", basis: "partial-pressure", forward: { k: 1e-3 }, reverse: "from-equilibrium" } });
  const T2 = 600, K2 = reactionProperties(nh3, T2).K;
  const pN2 = 2500, pH2 = 7500, pNH3 = Math.sqrt(K2 * (pN2 / 100) * (pH2 / 100) ** 3) * 100;
  assert.ok(Math.abs(reactionRate(nh3, { T_K: T2, values: { nitrogen: pN2, hydrogen: pH2, ammonia: pNH3 } }).r) < 1e-9 * 1e-3 * pN2 * pH2 ** 3);
  // orders that are not consistent with K are refused, and so is a basis without K
  // the reverse orders follow from the forward ones and the coefficients, β = α + ν (first order in ethanol: β = -1)
  assert.deepEqual(checkReaction({ id: "x", stoichiometry: { ethanol: -2, "diethyl-ether": 1, water: 1 }, phase: "liquid", reversible: true,
    rate: { form: "power-law", basis: "activity", forward: { k: 1, orders: { ethanol: 1 } }, reverse: "from-equilibrium" } }).rate.reverse.orders,
  { ethanol: -1, "diethyl-ether": 1, water: 1 });
  throwsCode(() => checkReaction({ id: "x", stoichiometry: { ethanol: -2, "diethyl-ether": 1, water: 1 }, phase: "liquid", reversible: true,
    rate: { form: "power-law", basis: "concentration", forward: { k: 1 }, reverse: "from-equilibrium" } }), "BAD_INPUT", /needs the basis "activity", "fugacity" or "partial-pressure"/);
  throwsCode(() => checkReaction({ id: "x", stoichiometry: { ethanol: -2, "diethyl-ether": 1, water: 1 }, phase: "liquid", reversible: true,
    rate: { form: "power-law", forward: { k: 1 } } }), "BAD_INPUT", /needs a "reverse" term/);
  throwsCode(() => checkReaction({ id: "x", stoichiometry: { ethanol: -2, "diethyl-ether": 1, water: 1 }, phase: "liquid",
    rate: { form: "power-law", forward: { k: 1 }, reverse: { k: 1 } } }), "BAD_INPUT", /not "reversible": true/);
});

test("LHHW: the form of Rawlings and Ekerdt eqn 5.148 (CO oxidation, dissociative O2, squared denominator)", () => {
  // R = k3 cm^2 K1 cCO sqrt(K2 cO2) / (1 + K1 cCO + sqrt(K2 cO2))^2, written as k = k3 cm^2 K1 sqrt(K2) with orders 1 and 1/2
  const k3cm2 = 0.7, K1 = 3.1, K2 = 0.45;
  const rx = checkReaction({ id: "co", stoichiometry: { "carbon-monoxide": -1, oxygen: -0.5, "carbon-dioxide": 1 }, phase: "vapour",
    rate: { form: "LHHW", forward: { k: k3cm2 * K1 * Math.sqrt(K2), orders: { "carbon-monoxide": 1, oxygen: 0.5 } },
      adsorption: [{ species: "carbon-monoxide", K: K1 }, { species: "oxygen", K: K2, dissociative: true }], exponent: 2 } });
  const cCO = 0.8, cO2 = 1.7;
  const book = k3cm2 * K1 * cCO * Math.sqrt(K2 * cO2) / (1 + K1 * cCO + Math.sqrt(K2 * cO2)) ** 2;
  assert.ok(Math.abs(reactionRate(rx, { T_K: 500, values: { "carbon-monoxide": cCO, oxygen: cO2 } }).r / book - 1) < 1e-14);
  throwsCode(() => checkReaction({ id: "co", stoichiometry: { "carbon-monoxide": -1, oxygen: -0.5, "carbon-dioxide": 1 }, phase: "vapour",
    rate: { form: "LHHW", forward: { k: 1 } } }), "BAD_INPUT", /LHHW needs "adsorption"/);
});

test("Michaelis-Menten, Monod with inhibition, and the Blackman, Tessier, Moser and Contois equations (p. 596)", () => {
  const st = { glucose: -1, ethanol: 2, "carbon-dioxide": 2 };
  const mk = rate => checkReaction({ id: "f", stoichiometry: st, phase: "liquid", rate });
  const S = 40, X = 3, P = 12, T = 303.15;
  const at = (rx, v = {}) => reactionRate(rx, { T_K: T, values: { glucose: S, ethanol: X, ...v } }).r;
  // Michaelis-Menten, r = k cS / (1 + K cS)
  assert.ok(Math.abs(at(mk({ form: "michaelis-menten", substrate: "glucose", k: 0.2, K: 0.05 })) - 0.2 * S / (1 + 0.05 * S)) < 1e-15);
  // Monod and its inhibitions (the "biomass" here is ethanol only to have a component to read; the forms do not care)
  const base = { substrate: "glucose", biomass: "ethanol", mu_max: 0.4, Ks: 5 };
  assert.ok(Math.abs(at(mk({ form: "monod", ...base })) - 0.4 * S / (5 + S) * X) < 1e-15);
  assert.ok(Math.abs(at(mk({ form: "monod", ...base, K1: 0.01 })) - 0.4 * S / (5 + S + 0.01 * S * S) * X) < 1e-15);
  assert.ok(Math.abs(at(mk({ form: "monod", ...base, product: "carbon-dioxide", Kp: 20 }), { "carbon-dioxide": P }) - 0.4 * S / (5 * (1 + P / 20) + S) * X) < 1e-15);
  throwsCode(() => mk({ form: "monod", ...base, K1: 0.01, product: "carbon-dioxide", Kp: 20 }), "BAD_INPUT", /not both/);
  // the growth laws
  assert.equal(at(mk({ form: "growth", law: "blackman", ...base })), 0.4 * X, "S >= 2 Ks: μm");
  assert.ok(Math.abs(at(mk({ form: "growth", law: "blackman", ...base }), { glucose: 4 }) - 0.4 * 4 / 10 * X) < 1e-15, "S < 2 Ks");
  assert.ok(Math.abs(at(mk({ form: "growth", law: "tessier", ...base, Ks: 0.05 })) - 0.4 * (1 - Math.exp(-0.05 * S)) * X) < 1e-15);
  assert.ok(Math.abs(at(mk({ form: "growth", law: "moser", ...base, n: 1.7 })) - 0.4 * S ** 1.7 / (5 + S ** 1.7) * X) < 1e-15);
  assert.ok(Math.abs(at(mk({ form: "growth", law: "contois", substrate: "glucose", biomass: "ethanol", mu_max: 0.4, Ksx: 2 })) - 0.4 * S / (2 * X + S) * X) < 1e-15);
  throwsCode(() => mk({ form: "growth", law: "haldane", ...base }), "BAD_INPUT", /"law" must be one of blackman, tessier, moser, contois/);
  throwsCode(() => mk({ form: "michaelis-menten", substrate: "ethanol", k: 1, K: 1 }), "BAD_INPUT", /is not a reactant/);
  throwsCode(() => mk({ form: "monod", ...base, basis: "activity" }), "BAD_INPUT", /written in concentrations/);
});

test("unknown forms and constants are refused with what is known; your own formula is a later step", () => {
  const st = { ethanol: -1, ethylene: 1, water: 1 };
  const mk = rate => checkReaction({ id: "d", stoichiometry: st, phase: "vapour", rate });
  throwsCode(() => mk({ form: "expression", rate: "k*C" }), "BAD_INPUT", /comes in a later step \(proposal 0010, step 9\)/);
  throwsCode(() => mk({ form: "second-order" }), "BAD_INPUT", new RegExp(`known: ${Object.keys(RATE_FORMS).join(", ")}`));
  throwsCode(() => mk({ form: "power-law", forward: { k: { k0: 1, Ea: 5 } } }), "BAD_INPUT", /unknown field "Ea"/);
  throwsCode(() => mk({ form: "power-law", forward: { k: "fast" } }), "BAD_INPUT", /must be a number or/);
  throwsCode(() => mk({ form: "power-law", forward: { k: 1 }, per: "area" }), "BAD_INPUT", /"per" must be "volume" or "catalyst-mass"/);
  throwsCode(() => reactionRate(checkReaction({ id: "d", stoichiometry: st, phase: "vapour" }), { T_K: 500, values: {} }), "MISSING_DATA", /has no rate law/);
  // a negative order at zero concentration
  const inh = mk({ form: "power-law", forward: { k: 1, orders: { ethanol: 1, water: -1 } } });
  throwsCode(() => reactionRate(inh, { T_K: 500, values: { ethanol: 1, water: 0 } }), "BAD_INPUT", /negative order .* the rate is infinite/);
});

test("one species alone (speciesProperties): an acid solid at 25 °C has a liquid where its records start, and says why not below", () => {
  const a = speciesProperties("adipic acid", "liquid", 480);
  assert.equal(a.record, "ideal gas");
  assert.ok(Number.isFinite(a.H_J_mol) && Number.isFinite(a.G_J_mol));
  assert.ok(a.notes.some(n => /Adipic acid: ideal gas to pure liquid/.test(n)));
  assert.throws(() => speciesProperties("adipic acid", "liquid", 298.15), e => isCheptaError(e) && /^Adipic acid, pure liquid at 298\.15 K: /.test(e.message));
  // a crystal record without open melting data cannot reach the liquid
  assert.throws(() => speciesProperties("fumaric acid", "liquid", 320), /formation record is for the crystal, and without melting data/);
});
