/**
 * Reactions (proposal 0010, step 2): the description of a reaction the user writes, its checks, and its
 * thermodynamics from the components' formation data.
 *
 * CHEPTA ships no reactions: the user writes them in the project or flowsheet file (proposal 0010, section 1).
 * checkReaction() checks one and returns it with the component ids resolved:
 *   - the element balance against the components' formulas (C, H, O, N, ...), refused with the imbalance named;
 *   - the phase, and with it the standard state of every species: the ideal gas at P° = 100 kPa for a vapour
 *     reaction, the pure liquid at T for a liquid reaction;
 *   - the equilibrium constant: from the formation data (`{ "from": "formation" }`) or a correlation the user cites,
 *     ln K = A + B/T + C ln T (`{ "lnK": { "A", "B", "C" }, "T_K": [lo, hi], "source" }`);
 *   - the rate law, if any (kinetics.js).
 *
 * reactionProperties(reaction, T) gives ΔrH°(T), ΔrG°(T) and K(T). Each species' standard Gibbs energy follows from
 * its formation record at T0 = 298.15 K by the Gibbs-Helmholtz equation, d(G/T)/dT = -H/T^2:
 *   G(T)/T = G(T0)/T0 - integral from T0 to T of H(t)/t^2 dt,   H(t) = H(T0) + h(t) - h(T0),
 * with h the enthalpy of the species in its standard state from the property records (src/thermo/pure.js): the
 * ideal-gas heat capacity, or the liquid heat capacity. The elements' terms cancel in a balanced reaction, so the formation basis
 * (elements at 298.15 K) can be used for each species. Then ΔrG° = Σ ν G, ΔrH° = Σ ν H and ln K = -ΔrG°/(RT).
 * Rawlings and Ekerdt, Chemical Reactor Analysis and Design Fundamentals, 2nd ed., 6th printing (full text free to
 * read from the authors, https://sites.engineering.ucsb.edu/~jbraw/chemreacfun/), section 3.2: K = exp(-ΔG°/RT) and
 * K = Π a_j^ν_j (eqns 3.10 and 3.11, p. 66), and the temperature dependence d ln K / dT = ΔH°/(RT^2) (eqn 3.47,
 * p. 78), which is the Gibbs-Helmholtz equation above summed over the species.
 *
 * A formation record is for one state (src/data/components.json: the ideal gas for ChemSep's, the liquid or the
 * crystal for the measured ones, docs/DATA_RULES.md section 11). It is taken to the reaction's standard state by
 * these paths, each stated in the result:
 *   ideal gas -> pure liquid:  G_L = G_IG + RT ln(phi_sat psat / P°), and
 *       H_L(T) = H_IG(T0) + h_R,sat(T0) - ΔHvap(T0) + integral from T0 to T of cp_L, the liquid-heat-capacity basis of
 *       the mixture enthalpies (src/thermo/enthalpy.js); phi_sat and h_R,sat of the saturated vapour from
 *       Peng-Robinson where the component has critical constants, else 1 and 0 (as src/thermo/pure.js does); the
 *       Poynting factor is neglected;
 *   pure liquid -> ideal gas:  the same equation the other way;
 *   crystal -> pure liquid:  H_L(T0) = H_S(T0) + ΔHfus, G_L(T0) = G_S(T0) + ΔHfus (1 - T0/Tm), with the melting data
 *       of the component; the difference of the heat capacities of liquid and crystal is neglected.
 */
import { pure } from "../thermo/pure.js";
import { componentRecord, findComponent } from "../thermo/components.js";
import { checkUserData } from "../thermo/user-data.js";
import { parseFormula } from "../thermo/formula.js";
import { cubicEos } from "../thermo/eos/cubic.js";
import { hasCritical } from "../thermo/critical.js";
import { fail } from "../util/errors.js";
import { checkRate } from "./kinetics.js";

export const R = 8.314462618;      // J/(mol K)
export const T0 = 298.15;          // K
export const P_STANDARD_KPA = 100; // the standard pressure of the formation data (CODATA: 1 bar)

const PHASES = { vapour: "vapour", gas: "vapour", vapor: "vapour", liquid: "liquid" };
const STANDARD_STATE = {
  vapour: "ideal gas at 100 kPa",
  liquid: "pure liquid at T (pressure effect neglected)",
};

const num = (v, what) => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw fail("BAD_INPUT", `${what} must be a number, found ${JSON.stringify(v)}.`);
  return v;
};

/**
 * The element balance of a stoichiometry {component id: ν} against the components' formulas.
 * @returns {{ok: boolean, elements: string[], imbalance: Object<string, number>, text: string}}
 */
export function reactionBalance(stoichiometry, opts = {}) {
  const ud = checkUserData(opts.userData);
  const sums = {}, scale = {};
  for (const [id, nu] of Object.entries(stoichiometry)) {
    const c = componentRecord(id, ud);
    let atoms;
    try { atoms = parseFormula(c.formula); } catch (e) { atoms = null; }
    if (!atoms) throw fail("MISSING_DATA", `${c.name} has no formula that CHEPTA can read ("${c.formula ?? ""}"), so the element balance of the reaction cannot be checked.`);
    for (const [el, n] of Object.entries(atoms)) {
      sums[el] = (sums[el] ?? 0) + nu * n;
      scale[el] = (scale[el] ?? 0) + Math.abs(nu * n);
    }
  }
  const elements = Object.keys(sums).sort((a, b) => (a === "C" ? -1 : b === "C" ? 1 : a === "H" ? -1 : b === "H" ? 1 : a.localeCompare(b)));
  const imbalance = {};
  for (const el of elements) if (Math.abs(sums[el]) > 1e-9 * scale[el]) imbalance[el] = sums[el];
  const ok = Object.keys(imbalance).length === 0;
  const text = ok
    ? `balanced: ${elements.join(" ")}`
    : `not balanced: ${Object.entries(imbalance).map(([el, d]) => `${el} ${d > 0 ? "+" : ""}${+d.toPrecision(6)} (${d > 0 ? "more in the products" : "more in the reactants"})`).join(", ")}`;
  return { ok, elements, imbalance, text };
}

/**
 * Check a reaction and return it with its component ids resolved and its defaults filled in. Throws BAD_INPUT
 * (or MISSING_DATA) with the reason.
 * @param {object} r  { id, name, stoichiometry: {component: ν}, phase: "vapour"|"liquid", reversible, equilibrium, rate, source }
 * @param {object} [opts]  { userData }
 */
export function checkReaction(r, opts = {}) {
  const ud = checkUserData(opts.userData);
  if (!r || typeof r !== "object" || Array.isArray(r)) throw fail("BAD_INPUT", "A reaction must be an object with an id, a stoichiometry and a phase.");
  const label = r.name || r.id || "the reaction";
  if (typeof r.id !== "string" || !r.id.trim()) throw fail("BAD_INPUT", `${label}: give the reaction an "id" (a short name used by the reactors).`);
  const st = r.stoichiometry;
  if (!st || typeof st !== "object" || Array.isArray(st) || !Object.keys(st).length) {
    throw fail("BAD_INPUT", `${label}: "stoichiometry" must list the components with their coefficients, negative for reactants and positive for products, e.g. { "acetic-acid": -1, "ethanol": -1, "ethyl-acetate": 1, "water": 1 }.`);
  }
  const stoichiometry = {};
  for (const [key, nu] of Object.entries(st)) {
    const id = findComponent(key, ud);
    num(nu, `${label}: the coefficient of ${key}`);
    if (nu === 0) throw fail("BAD_INPUT", `${label}: the coefficient of ${key} is 0; leave the component out instead.`);
    if (id in stoichiometry) throw fail("BAD_INPUT", `${label}: ${key} is listed twice (both are ${componentRecord(id, ud).name}).`);
    stoichiometry[id] = nu;
  }
  const nus = Object.values(stoichiometry);
  if (!nus.some(v => v < 0) || !nus.some(v => v > 0)) throw fail("BAD_INPUT", `${label}: a reaction needs at least one reactant (negative coefficient) and one product (positive coefficient).`);
  const balance = reactionBalance(stoichiometry, { userData: ud });
  if (!balance.ok) {
    throw fail("BAD_INPUT", `${label}: the reaction is ${balance.text}. Check the coefficients and the components' formulas. A schematic reaction that does not balance (cell growth, a lumped product) belongs in a yield reactor.`);
  }
  const phase = PHASES[String(r.phase ?? "").toLowerCase()];
  if (!phase) throw fail("BAD_INPUT", `${label}: "phase" must be "vapour" or "liquid", found ${JSON.stringify(r.phase)}.`);
  const reversible = r.reversible ?? false;
  if (typeof reversible !== "boolean") throw fail("BAD_INPUT", `${label}: "reversible" must be true or false.`);

  let equilibrium = null;
  const eq = r.equilibrium ?? (reversible ? { from: "formation" } : null);
  if (eq) {
    if (eq.from === "formation") equilibrium = { from: "formation" };
    else if (eq.lnK) {
      const { A = 0, B = 0, C = 0 } = eq.lnK;
      [A, B, C].forEach((v, i) => num(v, `${label}: lnK coefficient ${"ABC"[i]}`));
      const range = eq.T_K;
      if (range !== undefined && !(Array.isArray(range) && range.length === 2 && range.every(Number.isFinite) && range[0] < range[1])) {
        throw fail("BAD_INPUT", `${label}: the range of the lnK correlation "T_K" must be [lowest, highest] in K.`);
      }
      equilibrium = { lnK: { A, B, C }, T_K: range ?? null, source: eq.source ?? null };
    } else {
      throw fail("BAD_INPUT", `${label}: "equilibrium" must be { "from": "formation" } or a correlation { "lnK": { "A": ..., "B": ..., "C": ... }, "T_K": [lo, hi], "source": "..." } (ln K = A + B/T + C ln T).`);
    }
  }
  const out = {
    id: r.id, name: r.name ?? r.id, stoichiometry, phase, standardState: STANDARD_STATE[phase],
    reversible, equilibrium, rate: null, source: r.source ?? null, balance,
  };
  if (r.rate != null) out.rate = checkRate(r.rate, out, { userData: ud });
  return out;
}

/** Check a list of reactions: each one, and that their ids differ. */
export function checkReactions(list, opts = {}) {
  if (!Array.isArray(list)) throw fail("BAD_INPUT", "The reactions must be a list.");
  const seen = new Set();
  return list.map(r => {
    const c = checkReaction(r, opts);
    if (seen.has(c.id)) throw fail("BAD_INPUT", `Two reactions have the id "${c.id}".`);
    seen.add(c.id);
    return c;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Standard states
// ---------------------------------------------------------------------------------------------------------------

const GL_X = [0.0950125098376374, 0.2816035507792589, 0.4580167776572274, 0.6178762444026438,
  0.7554044083550030, 0.8656312023878318, 0.9445750230732326, 0.9894009349916499];
const GL_W = [0.1894506104550685, 0.1826034150449236, 0.1691565193950025, 0.1495959888165767,
  0.1246289712555339, 0.0951585116824928, 0.0622535239386479, 0.0271524594117541];
/** The integral of f from a to b, 16-point Gauss-Legendre on pieces of at most 25 K. */
function integrate(f, a, b) {
  if (a === b) return 0;
  const n = Math.max(1, Math.ceil(Math.abs(b - a) / 25)), w = (b - a) / n;
  let s = 0;
  for (let k = 0; k < n; k++) {
    const m = a + (k + 0.5) * w, r = w / 2;
    let p = 0;
    for (let i = 0; i < GL_X.length; i++) p += GL_W[i] * (f(m + r * GL_X[i]) + f(m - r * GL_X[i]));
    s += p * r;
  }
  return s;
}

/**
 * One species in a standard state: H(T) and G(T) on the formation basis (J/mol), with the path from its formation
 * record. G is null when the record has no Gibbs energy of formation.
 */
function speciesState(id, state, ud) {
  const c = componentRecord(id, ud);
  const p = pure(id, { userData: ud });
  const f = p.formation;
  if (!f || f.available === false) {
    throw fail("MISSING_DATA", `${c.name} has no open enthalpy of formation (searched: ${(f?.searched ?? []).join("; ") || "-"}), so the heat of reaction and K cannot be computed from formation data. Give K as a correlation, or use a conversion or yield reactor with a given duty.`);
  }
  const notes = [];
  const lnPhiSat = T => {
    if (!hasCritical(c)) return 0;
    return eos().state(T, p.psat(T), [1], "vapour").lnPhi[0];
  };
  let pr = null;
  const eos = () => pr ?? (pr = cubicEos("PR", [{ name: c.name, Tc_K: c.Tc_K, Pc_Pa: c.Pc_Pa, omega: c.omega }]));
  // the liquid enthalpy on the liquid-heat-capacity basis of the mixtures (src/thermo/enthalpy.js):
  // h_L(T) = h_L(T0) + integral from T0 to T of cp_L; h_L(T0) = h_R,sat(T0) - ΔHvap(T0) from the ideal gas
  const cpL = T => integrate(t => p.property("liquidHeatCapacity", t), T0, T);
  const hResSat = T => (hasCritical(c) ? eos().state(T, p.psat(T), [1], "vapour").hR_J_mol : 0);
  const needPsat = () => {
    if (c.class === "nonvolatile") throw fail("MISSING_DATA", `${c.name} is nonvolatile in CHEPTA (no vapour pressure), so its formation record for the ${f.state} cannot be taken to the ${state === "vapour" ? "ideal gas" : "pure liquid"}.`);
  };
  // the record's own state, at T0
  let H0 = f.Hf_J_mol, G0 = f.Gf_J_mol, from = f.state;
  if (from === "solid") {
    const fu = p.fusion;
    if (!fu) throw fail("MISSING_DATA", `${c.name}: its formation record is for the crystal, and without melting data it cannot be taken to the liquid.`);
    H0 += fu.Hfus_J_mol;
    if (G0 !== null) G0 += fu.Hfus_J_mol * (1 - T0 / fu.Tm_K);
    notes.push(`${c.name}: crystal to liquid at 298.15 K with ΔHfus ${(fu.Hfus_J_mol / 1000).toFixed(2)} kJ/mol at Tm ${fu.Tm_K} K (heat capacities of liquid and crystal taken equal)`);
    from = "liquid";
  }
  if (from === "ideal gas") {
    const hIG = T => p.hIdealGas(T);
    const H = T => H0 + hIG(T);
    const Gig = G0 === null ? null : T => T * (G0 / T0 - integrate(t => H(t) / (t * t), T0, T));
    if (state === "vapour") return { H, G: Gig, notes, record: f.state };
    needPsat();
    if (c.association) throw fail("NOT_AVAILABLE", `${c.name} dimerizes in the vapour: taking its formation record (the ideal-gas monomer) to the liquid needs the association enthalpy, which is not modelled yet. Give K as a correlation (equilibrium.lnK).`);
    notes.push(`${c.name}: ideal gas to pure liquid through the saturated vapour (vapour pressure${hasCritical(c) ? ", Peng-Robinson fugacity coefficient" : ""}; Poynting factor neglected)`);
    const hL0 = hResSat(T0) - p.property("heatOfVaporization", T0);
    return {
      H: T => H0 + hL0 + cpL(T),
      G: Gig && (T => Gig(T) + R * T * (Math.log(p.psat(T) / P_STANDARD_KPA) + lnPhiSat(T))),
      notes, record: f.state,
    };
  }
  // the liquid at T0
  const HL = T => H0 + cpL(T);
  const GL = G0 === null ? null : T => T * (G0 / T0 - integrate(t => HL(t) / (t * t), T0, T));
  if (state === "liquid") return { H: HL, G: GL, notes, record: f.state };
  needPsat();
  notes.push(`${c.name}: pure liquid to ideal gas through the saturated vapour (vapour pressure${hasCritical(c) ? ", Peng-Robinson fugacity coefficient" : ""}; Poynting factor neglected)`);
  const hL0 = hResSat(T0) - p.property("heatOfVaporization", T0);
  return {
    H: T => H0 - hL0 + p.hIdealGas(T),
    G: GL && (T => GL(T) - R * T * (Math.log(p.psat(T) / P_STANDARD_KPA) + lnPhiSat(T))),
    notes, record: f.state,
  };
}

/** The temperature ranges of the records a species' standard state uses, for the warnings. */
function rangeWarnings(id, state, T, ud) {
  const p = pure(id, { userData: ud });
  const out = [];
  const check = (name, label) => {
    const rec = p.record(name);
    if (rec && Number.isFinite(rec.Tmin_K) && (T < rec.Tmin_K - 1e-9 || T > rec.Tmax_K + 1e-9)) {
      out.push(`${componentRecord(id, ud).name}: ${T.toFixed(2)} K is outside the range of its ${label} (${rec.Tmin_K}-${rec.Tmax_K} K); extrapolated`);
    }
  };
  if (state === "vapour" || p.formation.state === "ideal gas") check("idealGasHeatCapacity", "ideal-gas heat capacity");
  return out;
}

/**
 * ΔrH°, ΔrG° and K of a reaction at T, in its standard state (the ideal gas at 100 kPa for a vapour reaction, the
 * pure liquid for a liquid reaction): K = exp(-ΔrG°/RT), so that K = Π a_j^ν_j at equilibrium, a_j = f_j / P° in a
 * vapour and a_j = γ_j x_j in a liquid.
 * @param {object} reaction  a reaction (checked here if it was not)
 * @param {number} T_K
 * @returns {{T_K, phase, standardState, dH_J_mol, dG_J_mol, lnK, K, from, notes, warnings, species}}
 */
export function reactionProperties(reaction, T_K, opts = {}) {
  const ud = checkUserData(opts.userData);
  const r = reaction?.balance ? reaction : checkReaction(reaction, { userData: ud });
  if (!(Number.isFinite(T_K) && T_K > 0)) throw fail("BAD_INPUT", `${r.name}: the temperature must be a positive number in K, found ${T_K}.`);
  const state = r.phase;
  const notes = [], warnings = [], species = [];
  let dH = 0, dG = 0, haveG = true, formationError = null;
  try {
    for (const [id, nu] of Object.entries(r.stoichiometry)) {
      const s = speciesState(id, state, ud);
      const H = s.H(T_K), G = s.G ? s.G(T_K) : null;
      dH += nu * H;
      if (G === null) haveG = false; else dG += nu * G;
      notes.push(...s.notes);
      warnings.push(...rangeWarnings(id, state, T_K, ud));
      species.push({ id, nu, record: s.record, H_J_mol: H, G_J_mol: G });
    }
  } catch (e) {
    if (!r.equilibrium?.lnK) throw e;
    formationError = e.message;   // a correlation gives K; ΔrH° then stays unknown
  }
  const out = { T_K, phase: state, standardState: r.standardState, dH_J_mol: formationError ? null : dH, dG_J_mol: null, lnK: null, K: null,
    from: null, notes, warnings, species };
  if (r.equilibrium?.lnK) {
    const { A, B, C } = r.equilibrium.lnK, rg = r.equilibrium.T_K;
    out.lnK = A + B / T_K + C * Math.log(T_K);
    out.dG_J_mol = -R * T_K * out.lnK;
    out.from = `correlation ln K = A + B/T + C ln T${r.equilibrium.source ? ` (${r.equilibrium.source})` : ""}`;
    if (rg && (T_K < rg[0] || T_K > rg[1])) warnings.push(`${r.name}: ${T_K.toFixed(2)} K is outside the range of its K correlation (${rg[0]}-${rg[1]} K)`);
    if (formationError) notes.push(`no heat of reaction from formation data: ${formationError}`);
  } else if (haveG) {
    out.dG_J_mol = dG;
    out.lnK = -dG / (R * T_K);
    out.from = "formation data";
  } else {
    out.from = "formation data (no Gibbs energy of formation for every species: no K)";
    const none = species.filter(s => s.G_J_mol === null).map(s => componentRecord(s.id, ud).name);
    notes.push(`no open Gibbs energy of formation for ${none.join(", ")}: ΔrH° only`);
  }
  if (out.lnK !== null) {
    if (out.lnK > 700 || out.lnK < -700) warnings.push(`${r.name}: ln K = ${out.lnK.toPrecision(5)}; K is beyond floating-point range and given as ${out.lnK > 0 ? "Infinity" : "0"}`);
    out.K = Math.exp(out.lnK);
  }
  return out;
}

/** The equilibrium constant of a checked reaction at T, or a MISSING_DATA error that says why there is none. */
export function equilibriumConstant(reaction, T_K, opts = {}) {
  const p = reactionProperties(reaction, T_K, opts);
  if (p.lnK === null) throw fail("MISSING_DATA", `${reaction.name ?? reaction.id}: no equilibrium constant (${p.notes.at(-1) ?? "no data"}). Give K as a correlation (equilibrium.lnK).`);
  return p;
}

