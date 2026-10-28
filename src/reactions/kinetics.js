/**
 * Rate laws of a reaction (proposal 0010, section 1; the maintainer, 2026-10-22: kinetics are written with the
 * reaction). checkRate() checks the `rate` of a reaction; reactionRate() evaluates it at a temperature and a set of
 * concentrations (or mole fractions, activities, partial pressures, fugacities: the `basis`).
 *
 * The forms, as printed in Rawlings and Ekerdt, Chemical Reactor Analysis and Design Fundamentals, 2nd ed., 6th
 * printing (full text free to read from the authors, https://sites.engineering.ucsb.edu/~jbraw/chemreacfun/; used
 * for the equation forms only):
 *   power-law         r = k Π c_j^α_j  (eqn 5.38, p. 204, with any orders; simple rate laws, section 4.2.1, p. 111)
 *   reversible        r = k Π c_j^α_j - k_r Π c_j^β_j  (eqn 5.38); k_r = k / K for `"reverse": "from-equilibrium"`,
 *                     which needs β_j - α_j = ν_j, so that r = 0 exactly where Π a_j^ν_j = K
 *   LHHW              r = (k Π c_j^α_j - k_r Π c_j^β_j) / (1 + Σ (K_j c_j)^m_j)^n, m_j = 1, or 1/2 for dissociative
 *                     adsorption (Hougen-Watson, section 5.6, pp. 237-255; eqn 5.148, p. 251, where n = 2 and O2
 *                     adsorbs dissociatively; section 7.4.4, p. 376, where n = 1)
 *   michaelis-menten  r = k c_S / (1 + K c_S)  (Exercise 9.15, p. 569)
 *   monod             r = μ c_X, μ = μm S / (Ks + S); with substrate inhibition μm S / (Ks + S + K1 S^2), with
 *                     product inhibition μm S / (Ks (1 + P/Kp) + S)  (section 10.5, p. 596)
 *   growth            r = μ c_X with the Blackman (μ = μm for S >= 2 Ks, μm S / (2 Ks) below), Tessier
 *                     (μm (1 - exp(-Ks S))), Moser (μm S^n / (Ks + S^n)) or Contois (μm S / (Ksx X + S)) equation (p. 596)
 * Every constant (k, K, μm, Ks, ...) is a number or follows Arrhenius, k = k0 T^B exp(-Ea/RT) (eqn 5.37, p. 204,
 * with k0 = A T^B; written there with Boltzmann's constant per molecule, here with R per mole).
 *
 * Units (SI inside the engine): concentrations in mol/m3, partial pressures and fugacities in kPa, mole fractions and
 * activities without units; the rate in mol/(m3 s) per reactor volume or mol/(kg s) per catalyst mass (`per`). The
 * units of each constant follow from these; the user enters them so. The rate r is that of the reaction: component j
 * is formed at ν_j r.
 *
 *   expression        the user's own formula (src/reactions/expression.js; proposal 0010, section 4 and step 9):
 *                     { "form": "expression", "rate": "k1 * C['ethanol'] - ...", "constants": { "k1": { k0, Ea_J_mol } } }
 *
 * Eley-Rideal and Mars-van Krevelen forms are not in the book; no open source with their forms was found in step 2
 * (docs/decisions/2026-10-22-05-reactions.md). Until one is, they can be written as an expression (step 9).
 */
import { componentRecord, findComponent } from "../thermo/components.js";
import { fail } from "../util/errors.js";
import { equilibriumConstant, R, P_STANDARD_KPA } from "./reaction.js";
import { parseExpression, expressionSpecies, evaluate } from "./expression.js";

export const RATE_FORMS = Object.freeze({
  "power-law": "r = k Π c_j^α_j, optionally minus a reverse term (Rawlings and Ekerdt, eqn 5.38)",
  LHHW: "Langmuir-Hinshelwood-Hougen-Watson: (k Π c^α - k_r Π c^β) / (1 + Σ (K_j c_j)^m_j)^n (section 5.6)",
  "michaelis-menten": "r = k c_S / (1 + K c_S) (Exercise 9.15)",
  monod: "r = μ c_X, μ = μm S / (Ks + S), with substrate or product inhibition (section 10.5)",
  growth: "r = μ c_X with the Blackman, Tessier, Moser or Contois equation (section 10.5)",
  expression: "your own formula of T, P, K, C['…'], x['…'], p['…'], f['…'], a['…'] and your constants",
});
/** The rate bases as the names of a formula (expression.js) and of the values a reactor supplies. */
export const BASIS_KEY = Object.freeze({ concentration: "C", "mole-fraction": "x", "partial-pressure": "p", fugacity: "f", activity: "a" });
const EXPRESSION_KEYS = ["form", "rate", "constants", "per", "T_K", "source", "basis"];
export const RATE_BASES = Object.freeze({
  concentration: "mol/m3", "mole-fraction": "-", activity: "-", "partial-pressure": "kPa", fugacity: "kPa",
});
const PER = { volume: "mol/(m3 s)", "catalyst-mass": "mol/(kg s)" };
const GROWTH_LAWS = ["blackman", "tessier", "moser", "contois"];

/** A rate constant: a number, or { k0, Ea_J_mol, B } for k = k0 T^B exp(-Ea/RT). */
function checkConstant(v, what) {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw fail("BAD_INPUT", `${what} must be a finite number.`);
    return { k0: v, Ea_J_mol: 0, B: 0 };
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const unknown = Object.keys(v).filter(k => !["k0", "Ea_J_mol", "B"].includes(k));
    if (unknown.length) throw fail("BAD_INPUT", `${what}: unknown field ${unknown.map(k => `"${k}"`).join(", ")}; a constant is a number or { "k0", "Ea_J_mol", "B" } (k = k0 T^B exp(-Ea/RT)).`);
    const { k0, Ea_J_mol = 0, B = 0 } = v;
    for (const [n, x] of [["k0", k0], ["Ea_J_mol", Ea_J_mol], ["B", B]]) {
      if (typeof x !== "number" || !Number.isFinite(x)) throw fail("BAD_INPUT", `${what}: "${n}" must be a number, found ${JSON.stringify(x)}.`);
    }
    return { k0, Ea_J_mol, B };
  }
  throw fail("BAD_INPUT", `${what} must be a number or { "k0": ..., "Ea_J_mol": ..., "B": ... } (k = k0 T^B exp(-Ea/RT)), found ${JSON.stringify(v)}.`);
}

/** The value of a constant at T: k0 T^B exp(-Ea/RT). */
export const constantAt = (c, T) => c.k0 * (c.B ? T ** c.B : 1) * (c.Ea_J_mol ? Math.exp(-c.Ea_J_mol / (R * T)) : 1);

function orders(o, what, ud, fallback) {
  if (o === undefined) return fallback;
  if (!o || typeof o !== "object" || Array.isArray(o)) throw fail("BAD_INPUT", `${what} must be { component: order }.`);
  const out = {};
  for (const [key, a] of Object.entries(o)) {
    if (typeof a !== "number" || !Number.isFinite(a)) throw fail("BAD_INPUT", `${what}: the order of ${key} must be a number.`);
    const id = findComponent(key, ud);
    if (id in out) throw fail("BAD_INPUT", `${what}: ${key} is listed twice.`);
    if (a !== 0) out[id] = a;
  }
  return out;
}

const fromStoich = (st, sign) => Object.fromEntries(Object.entries(st).filter(([, n]) => Math.sign(n) === sign).map(([id, n]) => [id, Math.abs(n)]));

/** The power-law part (forward, and the reverse term) of power-law and LHHW rates. */
function checkDriving(rate, rx, label, ud) {
  const fw = rate.forward;
  if (!fw || typeof fw !== "object") throw fail("BAD_INPUT", `${label}: "forward" must give the rate constant "k" and the "orders" (default: the reactants' coefficients, as for an elementary reaction).`);
  const forward = { k: checkConstant(fw.k, `${label}: forward "k"`), orders: orders(fw.orders, `${label}: forward "orders"`, ud, fromStoich(rx.stoichiometry, -1)) };
  let reverse = null;
  if (rate.reverse != null) {
    if (!rx.reversible) throw fail("BAD_INPUT", `${label}: the rate has a reverse term, but the reaction is not "reversible": true.`);
    const back = rate.reverse === "from-equilibrium" ? {} : rate.reverse;
    if (!back || typeof back !== "object") throw fail("BAD_INPUT", `${label}: "reverse" must be "from-equilibrium" or { "k", "orders" }.`);
    // default reverse orders: β = α + ν, the only orders consistent with K
    const consistent = {};
    for (const id of new Set([...Object.keys(forward.orders), ...Object.keys(rx.stoichiometry)])) {
      const b = (forward.orders[id] ?? 0) + (rx.stoichiometry[id] ?? 0);
      if (Math.abs(b) > 1e-12) consistent[id] = b;
    }
    if (rate.reverse === "from-equilibrium") {
      if (!["activity", "partial-pressure", "fugacity"].includes(rate.basis)) {
        throw fail("BAD_INPUT", `${label}: "reverse": "from-equilibrium" needs the basis "activity", "fugacity" or "partial-pressure", in which K is defined (found "${rate.basis}"); give the reverse rate constant instead, or change the basis.`);
      }
      if (rate.basis !== "activity" && rx.phase !== "vapour") {
        throw fail("BAD_INPUT", `${label}: a ${rate.basis} basis with "reverse": "from-equilibrium" is for vapour reactions; a liquid reaction uses "activity".`);
      }
      reverse = { fromEquilibrium: true, orders: consistent };
    } else {
      reverse = { fromEquilibrium: false, k: checkConstant(back.k, `${label}: reverse "k"`), orders: orders(back.orders, `${label}: reverse "orders"`, ud, consistent) };
    }
  } else if (rx.reversible) {
    throw fail("BAD_INPUT", `${label}: the reaction is reversible, so the rate needs a "reverse" term: "from-equilibrium" (k_r = k/K) or { "k", "orders" }.`);
  }
  return { forward, reverse };
}

function speciesId(key, what, ud) {
  if (typeof key !== "string") throw fail("BAD_INPUT", `${what} must name a component.`);
  return findComponent(key, ud);
}

/**
 * Check the `rate` of a reaction (already checked by checkReaction) and return it normalized.
 * @param {object} rate
 * @param {object} rx  the checked reaction (stoichiometry with ids, phase, reversible)
 */
export function checkRate(rate, rx, opts = {}) {
  const ud = opts.userData ?? null;
  const label = `${rx.name}: rate`;
  if (!rate || typeof rate !== "object" || Array.isArray(rate)) throw fail("BAD_INPUT", `${label} must be an object with a "form".`);
  const form = rate.form === "lhhw" ? "LHHW" : rate.form;
  if (!RATE_FORMS[form]) {
    const hint = rate.form === "expression" ? " Your own formula (\"expression\") comes in a later step (proposal 0010, step 9)." : "";
    throw fail("BAD_INPUT", `${label}: unknown form ${JSON.stringify(rate.form)}; known: ${Object.keys(RATE_FORMS).join(", ")}.${hint}`);
  }
  if (form === "expression") return checkExpression(rate, rx, label, ud);
  const bio = form === "monod" || form === "growth" || form === "michaelis-menten";
  const basis = rate.basis ?? "concentration";
  if (!RATE_BASES[basis]) throw fail("BAD_INPUT", `${label}: unknown basis ${JSON.stringify(basis)}; known: ${Object.keys(RATE_BASES).join(", ")}.`);
  if (bio && basis !== "concentration") throw fail("BAD_INPUT", `${label}: the ${form} form is written in concentrations ("basis": "concentration").`);
  const per = rate.per ?? "volume";
  if (!PER[per]) throw fail("BAD_INPUT", `${label}: "per" must be "volume" or "catalyst-mass", found ${JSON.stringify(per)}.`);
  let range = null;
  if (rate.T_K !== undefined) {
    if (!(Array.isArray(rate.T_K) && rate.T_K.length === 2 && rate.T_K.every(Number.isFinite) && rate.T_K[0] < rate.T_K[1])) {
      throw fail("BAD_INPUT", `${label}: "T_K" must be [lowest, highest] in K, the range of the data the rate law was fitted to.`);
    }
    range = rate.T_K;
  }
  const out = { form, basis, per, units: PER[per], basisUnits: RATE_BASES[basis], T_K: range, source: rate.source ?? null };
  const reactant = (key, what) => {
    const id = speciesId(key, what, ud);
    if (!(rx.stoichiometry[id] < 0)) throw fail("BAD_INPUT", `${what}: ${componentRecord(id, ud).name} is not a reactant of ${rx.name}.`);
    return id;
  };
  if (form === "power-law" || form === "LHHW") Object.assign(out, checkDriving({ ...rate, basis }, rx, label, ud));
  if (form === "LHHW") {
    const ads = rate.adsorption ?? [];
    if (!Array.isArray(ads) || !ads.length) throw fail("BAD_INPUT", `${label}: LHHW needs "adsorption": [{ "species", "K", "dissociative": false }, ...], the terms of the denominator 1 + Σ (K_j c_j)^m_j.`);
    out.adsorption = ads.map((a, i) => {
      const what = `${label}: adsorption term ${i + 1}`;
      const id = speciesId(a?.species, `${what} "species"`, ud);
      if (a.dissociative !== undefined && typeof a.dissociative !== "boolean") throw fail("BAD_INPUT", `${what}: "dissociative" must be true or false.`);
      return { species: id, K: checkConstant(a.K, `${what} "K"`), exponent: a.dissociative ? 0.5 : 1 };
    });
    const n = rate.exponent ?? 1;
    if (!(Number.isFinite(n) && n > 0)) throw fail("BAD_INPUT", `${label}: the "exponent" of the denominator must be a positive number (1, or 2 for two adsorbed reactants).`);
    out.exponent = n;
  }
  if (form === "michaelis-menten") {
    if (rx.reversible) throw fail("BAD_INPUT", `${label}: Michaelis-Menten kinetics are irreversible ("reversible": false).`);
    out.substrate = reactant(rate.substrate, `${label}: "substrate"`);
    out.k = checkConstant(rate.k, `${label}: "k"`);
    out.K = checkConstant(rate.K, `${label}: "K"`);
  }
  if (form === "monod" || form === "growth") {
    if (rx.reversible) throw fail("BAD_INPUT", `${label}: growth kinetics are irreversible ("reversible": false).`);
    out.substrate = reactant(rate.substrate, `${label}: "substrate"`);
    out.biomass = speciesId(rate.biomass, `${label}: "biomass" (the component whose concentration X multiplies μ)`, ud);
    out.mu_max = checkConstant(rate.mu_max, `${label}: "mu_max"`);
  }
  if (form === "monod") {
    out.Ks = checkConstant(rate.Ks, `${label}: "Ks"`);
    if (rate.K1 !== undefined && rate.Kp !== undefined) throw fail("BAD_INPUT", `${label}: give substrate inhibition ("K1") or product inhibition ("product", "Kp"), not both: the book's forms have one at a time.`);
    if (rate.K1 !== undefined) out.K1 = checkConstant(rate.K1, `${label}: "K1"`);
    if (rate.Kp !== undefined || rate.product !== undefined) {
      out.product = speciesId(rate.product, `${label}: "product" (the inhibiting product)`, ud);
      out.Kp = checkConstant(rate.Kp, `${label}: "Kp"`);
    }
  }
  if (form === "growth") {
    const law = String(rate.law ?? "").toLowerCase();
    if (!GROWTH_LAWS.includes(law)) throw fail("BAD_INPUT", `${label}: "law" must be one of ${GROWTH_LAWS.join(", ")} (Rawlings and Ekerdt, p. 596; Monod is "form": "monod").`);
    out.law = law;
    if (law === "contois") out.Ksx = checkConstant(rate.Ksx, `${label}: "Ksx"`);
    else out.Ks = checkConstant(rate.Ks, `${label}: "Ks"`);
    if (law === "moser") {
      if (!(Number.isFinite(rate.n) && rate.n > 0)) throw fail("BAD_INPUT", `${label}: the Moser equation needs the exponent "n" (a positive number).`);
      out.n = rate.n;
    }
  }
  return out;
}

/** A formula rate (form "expression"): its text parsed, its constants checked. */
function checkExpression(rate, rx, label, ud) {
  if (typeof rate.rate !== "string" || !rate.rate.trim()) throw fail("BAD_INPUT", `${label}: write the formula in "rate", e.g. "k1 * C['ethanol'] * C['acetic-acid']".`);
  const per = rate.per ?? "volume";
  if (!PER[per]) throw fail("BAD_INPUT", `${label}: "per" must be "volume" or "catalyst-mass", found ${JSON.stringify(per)}.`);
  const given = { ...(rate.constants ?? {}) };
  for (const [k, v] of Object.entries(rate)) if (!EXPRESSION_KEYS.includes(k)) given[k] = v;
  const constants = {};
  for (const [k, v] of Object.entries(given)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw fail("BAD_INPUT", `${label}: the constant name "${k}" must start with a letter and hold only letters, digits and _.`);
    if (["T", "P", "R", "K", "C", "x", "p", "f", "a", "exp", "ln", "log10", "sqrt", "abs", "min", "max"].includes(k)) throw fail("BAD_INPUT", `${label}: "${k}" is a name of the formula itself; call the constant otherwise.`);
    constants[k] = checkConstant(v, `${label}: constant "${k}"`);
  }
  let range = null;
  if (rate.T_K !== undefined) {
    if (!(Array.isArray(rate.T_K) && rate.T_K.length === 2 && rate.T_K.every(Number.isFinite) && rate.T_K[0] < rate.T_K[1])) {
      throw fail("BAD_INPUT", `${label}: "T_K" must be [lowest, highest] in K, the range of the data the rate law was fitted to.`);
    }
    range = rate.T_K;
  }
  let tree;
  try {
    tree = parseExpression(rate.rate, { constants: Object.keys(constants), species: (key, at) => {
      try { return speciesId(key, "", ud); } catch { throw fail("BAD_INPUT", `unknown component '${key}' at character ${at}.`); }
    } });
  } catch (e) { e.message = `${label}: ${e.message}`; throw e; }
  return { form: "expression", text: rate.rate, tree, constants, per, units: PER[per], basis: "expression", basisUnits: "", T_K: range, source: rate.source ?? null,
    reads: expressionSpecies(tree) };
}

/** The species a rate reads, so that a reactor can supply their values. */
export function rateSpecies(rate) {
  const s = new Set();
  for (const r of rate.reads ?? []) s.add(r.id);
  for (const o of [rate.forward?.orders, rate.reverse?.orders]) for (const id of Object.keys(o ?? {})) s.add(id);
  for (const a of rate.adsorption ?? []) s.add(a.species);
  for (const id of [rate.substrate, rate.biomass, rate.product]) if (id) s.add(id);
  return [...s];
}

/**
 * The rate of a checked reaction at T and the given values (in the rate's basis: mol/m3, kPa or dimensionless), in
 * mol/(m3 s) or mol/(kg s).
 * @param {object} rx  a reaction from checkReaction, with a rate
 * @param {{T_K: number, values: Object<string, number>}} state  values keyed by component id (names are looked up)
 * @returns {{r: number, units: string, forward: number|null, reverse: number|null, K: number|null, warnings: string[]}}
 */
export function reactionRate(rx, state, opts = {}) {
  const ud = opts.userData ?? null;
  const rate = rx?.rate;
  if (!rate) throw fail("MISSING_DATA", `${rx?.name ?? "The reaction"} has no rate law: a CSTR or plug-flow reactor needs one (a conversion, yield, equilibrium or Gibbs reactor does not).`);
  const T = state?.T_K;
  if (!(Number.isFinite(T) && T > 0)) throw fail("BAD_INPUT", `${rx.name}: the temperature must be a positive number in K, found ${T}.`);
  const warnings = [];
  if (rate.T_K && (T < rate.T_K[0] || T > rate.T_K[1])) warnings.push(`${rx.name}: ${T.toFixed(2)} K is outside the range of its rate law (${rate.T_K[0]}-${rate.T_K[1]} K)`);
  if (rate.form === "expression") return expressionRate(rx, rate, state, T, warnings, ud);
  const vals = {};
  for (const [key, v] of Object.entries(state.values ?? state.bases?.[BASIS_KEY[rate.basis]] ?? {})) vals[findComponent(key, ud)] = v;
  const val = id => {
    const v = vals[id];
    const name = componentRecord(id, ud).name;
    if (v === undefined) throw fail("BAD_INPUT", `${rx.name}: the rate needs the ${rate.basis} of ${name}.`);
    if (!(Number.isFinite(v) && v >= 0)) throw fail("BAD_INPUT", `${rx.name}: the ${rate.basis} of ${name} is ${v}; it must be zero or positive.`);
    return v;
  };
  const prod = o => {
    let p = 1;
    for (const [id, a] of Object.entries(o)) {
      const v = val(id);
      if (v === 0 && a < 0) throw fail("BAD_INPUT", `${rx.name}: ${componentRecord(id, ud).name} has a negative order (${a}) and a ${rate.basis} of 0: the rate is infinite.`);
      p *= v ** a;
    }
    return p;
  };
  const k = c => constantAt(c, T);
  let r, forward = null, reverse = null, K = null;
  if (rate.form === "power-law" || rate.form === "LHHW") {
    forward = k(rate.forward.k) * prod(rate.forward.orders);
    reverse = 0;
    if (rate.reverse) {
      let kr;
      if (rate.reverse.fromEquilibrium) {
        const eq = equilibriumConstant(rx, T, { userData: ud });
        warnings.push(...eq.warnings);
        K = eq.K;
        // K is for activities; in kPa (partial pressure, fugacity) each species carries P°: K_p = K P°^Σν
        const sumNu = Object.values(rx.stoichiometry).reduce((s, n) => s + n, 0);
        const Kb = rate.basis === "activity" ? K : K * P_STANDARD_KPA ** sumNu;
        kr = k(rate.forward.k) / Kb;
      } else {
        kr = k(rate.reverse.k);
      }
      reverse = kr * prod(rate.reverse.orders);
    }
    r = forward - reverse;
    if (rate.form === "LHHW") {
      let d = 1;
      for (const a of rate.adsorption) d += (k(a.K) * val(a.species)) ** a.exponent;
      const den = d ** rate.exponent;
      r /= den; forward /= den; reverse /= den;
    }
  } else if (rate.form === "michaelis-menten") {
    const S = val(rate.substrate);
    r = k(rate.k) * S / (1 + k(rate.K) * S);
  } else {
    const S = val(rate.substrate), X = val(rate.biomass), mm = k(rate.mu_max);
    let mu;
    if (rate.form === "monod") {
      if (rate.K1) mu = mm * S / (k(rate.Ks) + S + k(rate.K1) * S * S);
      else if (rate.Kp) mu = mm * S / (k(rate.Ks) * (1 + val(rate.product) / k(rate.Kp)) + S);
      else mu = mm * S / (k(rate.Ks) + S);
    } else if (rate.law === "blackman") {
      const Ks = k(rate.Ks);
      mu = S >= 2 * Ks ? mm : mm * S / (2 * Ks);
    } else if (rate.law === "tessier") {
      mu = mm * (1 - Math.exp(-k(rate.Ks) * S));
    } else if (rate.law === "moser") {
      mu = mm * S ** rate.n / (k(rate.Ks) + S ** rate.n);
    } else {
      mu = mm * S / (k(rate.Ksx) * X + S);
    }
    r = mu * X;
  }
  if (!Number.isFinite(r)) throw fail("NO_CONVERGENCE", `${rx.name}: the rate is ${r} at ${T.toFixed(2)} K; check the constants and the ${rate.basis} values (a 0/0 in the denominator, or an overflow).`);
  return { r, units: rate.units, forward, reverse, K, warnings };
}

/** The rate of a formula: state.bases holds C, x, p, f and a by component id; state.P_kPa the pressure. */
function expressionRate(rx, rate, state, T, warnings, ud) {
  const constants = Object.fromEntries(Object.entries(rate.constants).map(([k, c]) => [k, constantAt(c, T)]));
  let K;
  if (/\bK\b/.test(rate.text)) {
    const eq = equilibriumConstant(rx, T, { userData: ud });
    warnings.push(...eq.warnings);
    K = eq.K;
  }
  let r;
  try { r = evaluate(rate.tree, { T, P: state.P_kPa, R, K, constants, values: state.bases ?? {} }); }
  catch (e) { e.message = `${rx.name}: ${e.message}`; throw e; }
  if (!Number.isFinite(r)) throw fail("NO_CONVERGENCE", `${rx.name}: your formula gives ${r} at ${T.toFixed(2)} K; check it for a division by zero, a logarithm or root of a negative number, or an overflow.`);
  return { r, units: rate.units, forward: null, reverse: null, K: K ?? null, warnings };
}
