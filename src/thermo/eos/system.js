/**
 * Systems described by a cubic equation of state (model "PR" or "SRK"), with binary k_ij
 * from src/data/kij.json (ChemSep, Artistic License 2.0, or fitted to open data). Pairs
 * without a k_ij use 0 and are reported in info.pairs (tier "none") and info.missingPairs;
 * bubble and dew points also return them in `warnings`, with temperatures outside the
 * data range of a stored k_ij.
 *
 * Equations: see cubic.js. Units: T in K, P in kPa, mole fractions.
 */
import { methodAdvice } from "../method-advice.js";
import { componentRecord } from "../components.js";
import { userDataUsed } from "../user-data.js";
import { cubicEos, CUBICS } from "./cubic.js";
import { RANGE_MARGIN_K, selection, choosePair, describePair, pairWarnings } from "../library.js";
import { fail } from "../../util/errors.js";
import { eosPhaseMethods } from "../enthalpy.js";
import { requireCritical } from "../critical.js";

export const EOS_MODELS = Object.keys(CUBICS);

/** A k_ij is used without a warning up to this far (K) outside its data range. */
export { RANGE_MARGIN_K };

/**
 * The binary k_ij matrix of a cubic equation of state for components `ids`: the user's
 * matrix if given, else the databank sets chosen by `sel` (library.js), else 0.
 * Also used for the vapour of activity-coefficient systems with vapour "PR" or "SRK".
 * K holds k_ij, or the constant part a of k_ij = a + b / T, and KB the b (K) of the sets that have one (null when none).
 * @returns {{K:number[][], KB:number[][]|null, pairs:object[], missing:string[][]}}
 */
export function kijMatrix(ids, model, kij, sel = selection({}), userData = null) {
  const comps = ids.map(id => componentRecord(id, userData));
  const n = ids.length;
  const K = Array.from({ length: n }, () => new Array(n).fill(0));
  const KB = Array.from({ length: n }, () => new Array(n).fill(0));
  const pairs = [], missing = [];
  if (kij !== undefined) {
    const u = kij;
    if (!Array.isArray(u) || u.length !== n || u.some(r => !Array.isArray(r) || r.length !== n || r.some(v => !Number.isFinite(v)))) {
      throw fail("BAD_INPUT", `kij must be an ${n} x ${n} matrix of numbers.`);
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (u[i][j] !== u[j][i]) throw fail("BAD_INPUT", `kij must be symmetric (k_${i}${j} = ${u[i][j]}, k_${j}${i} = ${u[j][i]}).`);
    }
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const pair = [comps[i].name, comps[j].name];
    if (kij !== undefined) {
      K[i][j] = K[j][i] = kij[i][j];
      pairs.push({ pair, kij: kij[i][j], tier: "user", source: "given in the system's setup" });
      continue;
    }
    const choice = choosePair(model, ids[i], ids[j], sel, userData?.pairs ?? []);
    if (choice) {
      const k = choice.chosen.params.kij, b = choice.chosen.params.kij_b_K ?? 0;
      K[i][j] = K[j][i] = k;
      KB[i][j] = KB[j][i] = b;
      pairs.push({ kij: k, ...(b ? { kij_b_K: b } : {}), ...describePair(choice, pair) });
    } else {
      missing.push(pair);
      pairs.push({ pair, kij: 0, tier: "none", source: `no ${model} k_ij in the databank; k_ij = 0 used` });
    }
  }
  return { K, KB: KB.some(r => r.some(v => v)) ? KB : null, pairs, missing };
}

/** A pair's k_ij as text: "0.05", or "0.1883 - 40.62 K / T" for a temperature-dependent set. */
export const kijText = p => (p.kij_b_K ? `${p.kij} ${p.kij_b_K < 0 ? "-" : "+"} ${Math.abs(p.kij_b_K)} K / T` : `${p.kij}`);

/**
 * Refuse a liquid that holds both components of a pair whose chosen k_ij is marked not usable in src/data/kij.json
 * (`not_usable`: carbon dioxide + water, the maintainer, 2026-11-05). Vapour-only work (fugacities of a gas, a
 * flash whose result is all vapour) is not refused: the mark is about the gas's solubility in the liquid. The user's
 * own k_ij (cfg.kij, or My data) carries no mark.
 * @param {object} sys   an equation-of-state system
 * @param {number[]} x   a liquid composition
 * @param {string} what  the calculation, for the message
 */
export function refuseNotUsableLiquid(sys, x, what) {
  for (const p of sys.info?.pairs ?? []) {
    if (!p.not_usable) continue;
    const [i, j] = p.pair.map(name => sys.names.indexOf(name));
    if (i < 0 || j < 0 || !(x[i] > 0 && x[j] > 0)) continue;
    throw fail("NOT_AVAILABLE", `${what}: ${sys.model} with ${p.pair.join(" + ")} in the liquid is refused: ${p.not_usable.reason} (${p.not_usable.decided}). `
      + `For a gas in water use an activity model (NRTL, UNIQUAC, Wilson or ideal), where ${p.pair[0].toLowerCase()} dissolves by Henry's law (proposal 0017), `
      + `or give a k_ij of your own fitted to data (My data).`);
  }
}

/**
 * @param {string[]} ids        component ids (already resolved)
 * @param {object} cfg
 * @param {"PR"|"SRK"} cfg.model
 * @param {number[][]} [cfg.kij] user k_ij matrix (n x n, symmetric); overrides the databank
 * @param {object} [cfg.sets]    k_ij set per pair, and [cfg.prefer] tiers in order (see library.js)
 * @param {object} [cfg.userData]  the user's own data, checked (user-data.js)
 * @param {object} [sel]  cfg.sets and cfg.prefer as checked by library.selection()
 */
export function createEosSystem(ids, cfg, sel = selection(cfg)) {
  const model = String(cfg.model).toUpperCase();
  const comps = ids.map(id => componentRecord(id, cfg.userData));
  requireCritical(comps, `the ${model === "SRK" ? "SRK" : "Peng-Robinson"} equation of state`);
  const n = ids.length;
  const { K, KB, pairs, missing } = kijMatrix(ids, model, cfg.kij, sel, cfg.userData);
  const eos = cubicEos(model, comps.map(c => ({ name: c.name, Tc_K: c.Tc_K, Pc_Pa: c.Pc_Pa, omega: c.omega })), K, KB);
  const MW = comps.map(c => c.MW);

  const gammaPhiOnly = what => () => {
    throw fail("NOT_AVAILABLE", `${what} belongs to activity-coefficient (gamma-phi) systems; this is a ${model} equation-of-state system. Use bubbleT, bubbleP, dewT, dewP, flash, the diagrams (txy, pxy, ternaryGrid, residueCurve, azeotropes), Z, lnPhi or density.`);
  };

  // Accept (x, T, P, phase) as well as (T, P, x, phase).
  const args = (a, b, c, d) => Array.isArray(a) ? { x: a, T: b, P: c, phase: d } : { T: a, P: b, x: c, phase: d };

  /** Full state of one phase (see cubic.js state()). Arguments (T, P, x, phase) or (x, T, P, phase). */
  function state(a, b, c, d) {
    const q = args(a, b, c, d);
    return eos.state(q.T, q.P, q.x, q.phase ?? "vapour");
  }

  const info = {
    components: comps.map((c, i) => ({ id: ids[i], name: c.name, formula: c.formula, Tc_K: c.Tc_K, Pc_kPa: c.Pc_Pa / 1000, omega: c.omega })),
    model, equation: eos.name, pairs, missingPairs: missing,
    vapour: eos.name, liquid: eos.name,
    // is this the recommended method for these components? (method-advice.js, docs/METHOD_SELECTION.md)
    advice: methodAdvice({ ids, names: comps.map(c => c.name), formulas: comps.map(c => c.formula), model, eos: true }),
    // the user's own data this system uses (proposal 0012)
    userData: userDataUsed(ids, cfg.userData ?? null, pairs),
    notes: [
      "No volume translation: liquid densities from a cubic equation of state are typically 5-20 % off.",
      "Root choice: smallest Z for the liquid, largest for the vapour; with one real root the same root is used for both and labelled liquid-like or vapour-like.",
    ],
  };

  /**
   * Warnings that apply to a calculation at T (K) and P (kPa): pairs with k_ij = 0 (no data),
   * temperatures more than RANGE_MARGIN_K outside the data range of a stored k_ij, pressures
   * outside a set's pressure range, and notes on the choice of sets.
   */
  function warnings(T, P) {
    const w = [];
    for (const p of pairs) {
      if (p.tier === "none") w.push(`No ${model} k_ij for ${p.pair.join(" + ")}: k_ij = 0 used; results for this pair are a prediction without binary data.`);
      else w.push(...pairWarnings([p], T, P, q => `k_ij of ${q.pair.join(" + ")} (${kijText(q)}) comes`));
    }
    return [...w, ...info.advice];
  }

  return {
    ids, names: comps.map(c => c.name), n, model, kind: "eos", eos, kij: K, info,
    state, warnings, MW, userData: cfg.userData ?? null,
    ...eosPhaseMethods({ ids, comps, n, model, eos, warnings, userData: cfg.userData }),
    /** Compressibility factor Z. Arguments (T, P, x, phase) or (x, T, P, phase); phase defaults to "vapour". */
    Z: (a, b, c, d) => state(a, b, c, d).Z,
    /** ln phi_i. Arguments (T, P, x, phase) or (x, T, P, phase). */
    lnPhi: (a, b, c, d) => state(a, b, c, d).lnPhi,
    /** Mass density, kg/m3. Arguments (x, T, P, phase) or (T, P, x, phase). */
    density(a, b, c, d) {
      const q = args(a, b, c, d);
      const s = eos.state(q.T, q.P, q.x, q.phase ?? "vapour");
      const sum = q.x.reduce((u, v) => u + v, 0);
      const mw = q.x.reduce((u, v, i) => u + v / sum * MW[i], 0) / 1000;
      return mw / s.v_m3_mol;
    },
    /** Residual enthalpy H - H_ideal-gas at the same T and P, J/mol. */
    hResidual: (a, b, c, d) => state(a, b, c, d).hR_J_mol,
    gammas: gammaPhiOnly("gammas"),
    psat: gammaPhiOnly("psat (Raoult vapour pressures)"),
    equilibrium: gammaPhiOnly("equilibrium(x, T)"),
  };
}
