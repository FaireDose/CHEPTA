/**
 * The Membrane block (proposal 0015, Part I, section 4; milestone M3, step 9; workstreams W3 and W4): gas permeation by
 * the solution-diffusion model, over well-mixed cells in co-current or counter-current flow.
 *
 * The model: K. Aziaba, C. Jordan, B. Haddadi and M. Harasek, "Design of a gas permeation and pervaporation membrane
 * model for an open source process simulation tool", Membranes 12 (2022) 1186, doi:10.3390/membranes12121186 (CC BY
 * 4.0; its open full text at Europe PMC, PMC9784710):
 *  - the local flux of each component is its permeance times its partial-pressure difference across the membrane,
 *    d(x n) = −Q A (x P − y p) (Equation (1)), with Dalton's partial pressures on both sides (section 2.3.3, "The
 *    algorithm for gas permeation implements the law of Dalton");
 *  - the stage cut is the permeate flow over the feed flow (Equation (3)); the area of a hollow-fibre module is
 *    A = ε d_fibre π l_fibre (Equation (2); src/sizing/sizing.js, membraneArea);
 *  - "perfect mixing in every compartment", no pressure variation along the module, pure-component permeances
 *    independent of feed composition, temperature and pressure (section 1.3); the module divided into cells, whose
 *    results stop changing above about five cells (section 4.1.3).
 *
 * Cell k (k = 1..N along the feed side, area A/N each) is well mixed on both sides. With n_k the flows permeated in it,
 *
 *   n_k,i = (A/N) Q_i (P x_k,i − p y_k,i),   x_k = R_k / ΣR_k,  R_k = F − Σ_{j≤k} n_j   (the retentate leaving cell k)
 *
 * and y_k the composition of the permeate gathered there: from cells 1..k (co-current: the permeate flows along with
 * the feed and leaves after cell N) or from cells k..N (counter-current: against the feed, leaving at cell 1). One cell
 * is the complete-mixing model; many cells approach the plug-flow co- and counter-current models (checked against H.
 * Binous, "Gas permeation computations with Mathematica", Chem. Eng. Educ. 40 (2006) 140-144, free to read on the
 * journal's archive, https://journals.flvc.org/cee/article/view/122538; test/membrane.test.js). All N·c equations are
 * solved together by Newton's method with the analytic Jacobian, steps kept inside positive retentate and permeate
 * flows, and a continuation in the area from 0.1 % of it when the direct start fails.
 *
 * What you give: the permeances (each component's, 0 for one that does not pass; the person's values with their
 * source: CHEPTA has no databank of permeances), the permeate pressure, the flow pattern and the cells, and either the
 * area A_m2 or a target: the stage cut, or the recovery of one component into the permeate. With a target the area is
 * found (Brent's method on ln A) and returned with the result, as the block's sizing.
 *
 * Assumptions, stated in the result's notes: a gas feed (a feed with liquid is pervaporation, not built here:
 * NOT_AVAILABLE); isothermal, both outlets at the feed's temperature (the duty that keeps it so is reported); the feed
 * side at the feed's pressure and the permeate side at the permeate pressure throughout; no sweep gas. An outlet that
 * would partly condense at its pressure is warned (CONDENSATION).
 *
 * Units: K, kPa, kmol/h, m²; permeances in mol/(m² s Pa) (the article's unit), mol/(m² s bar) (its Table 2) or GPU
 * (1 GPU = 1e-6 cm³(STP)/(cm² s cmHg), with cm³(STP) at 273.15 K and 101.325 kPa and 1 cmHg = 101.325/76 kPa).
 */
import { fail } from "../util/errors.js";
import { brent } from "../util/solve.js";
import { stream } from "../stream/stream.js";
import { findComponent } from "../thermo/components.js";
import { registerUnit } from "./units.js";

const R_GAS = 8.314462618;   // J/(mol K), the 2018 CODATA value (exact since the SI of 2019)
/** mol/(m² s Pa) per GPU: 1e-6 cm³(STP)/(cm² s cmHg). */
export const GPU = 1e-12 / (R_GAS * 273.15 / 101325) / 1e-4 / (101325 / 76);
/** The permeance units accepted, in mol/(m² s Pa). */
export const PERMEANCE_UNITS = Object.freeze({ "mol/(m2 s Pa)": 1, "mol/(m2 s bar)": 1e-5, GPU });
/** kmol/(h m² kPa) per mol/(m² s Pa). */
const TO_ENGINE = 3.6 * 1000;
export const FLOWS = Object.freeze(["counter-current", "co-current"]);
export const MAX_CELLS = 200;
const MAX_UNKNOWNS = 1200;   // N·c: one dense Newton system

const SPEC_KEYS = ["permeances", "permeance_unit", "permeate_P_kPa", "flow", "cells", "A_m2", "stage_cut", "recovery", "fibre"];
const has = (spec, k) => spec?.[k] !== undefined && spec?.[k] !== null && spec?.[k] !== "";
const TARGETS = ["A_m2", "stage_cut", "recovery"];
const fmt = v => +Number(v).toPrecision(4);

/** Gaussian elimination with partial pivoting; A (n × n, rows) and b are overwritten. */
function solveLinear(A, b) {
  const n = b.length;
  for (let k = 0; k < n; k++) {
    let p = k, big = Math.abs(A[k][k]);
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > big) { big = Math.abs(A[i][k]); p = i; }
    if (!(big > 0)) return null;
    if (p !== k) { [A[k], A[p]] = [A[p], A[k]]; [b[k], b[p]] = [b[p], b[k]]; }
    const rk = A[k], piv = rk[k];
    for (let i = k + 1; i < n; i++) {
      const ri = A[i], f = ri[k] / piv;
      if (f === 0) continue;
      for (let j = k; j < n; j++) ri[j] -= f * rk[j];
      b[i] -= f * b[k];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    const ri = A[i];
    for (let j = i + 1; j < n; j++) s -= ri[j] * x[j];
    x[i] = s / ri[i];
  }
  return x;
}

/**
 * The cells of a membrane at a given area, in any consistent units (flows, permeance × pressure × area = flow).
 * @param {{F:number[], Q:number[], P:number, p:number, A:number, cells:number, flow:string, start?:number[][]}} o
 * @returns {{ n:number[][], R:number[][], S:number[][], permeate:number[], retentate:number[], iterations:number }}
 *   n: permeated in each cell; R: the retentate leaving each cell; S: the permeate gathered in each cell
 */
export function membraneCells({ F, Q, P, p, A, cells: N, flow, start = null }) {
  const c = F.length, co = flow === "co-current";
  const Ft = F.reduce((s, v) => s + v, 0);
  const passes = Q.map(q => q > 0);
  const state = (n, a) => {
    const R = [], S = [];
    let cum = F.slice();
    for (let k = 0; k < N; k++) { cum = cum.map((v, i) => v - n[k][i]); R.push(cum); }
    if (co) for (let k = 0; k < N; k++) S.push(F.map((v, i) => v - R[k][i]));
    else {
      let acc = new Array(c).fill(0);
      const rev = [];
      for (let k = N - 1; k >= 0; k--) { acc = acc.map((v, i) => v + n[k][i]); rev.push(acc); }
      S.push(...rev.reverse());
    }
    const r = [];
    for (let k = 0; k < N; k++) {
      const sr = R[k].reduce((s, v) => s + v, 0), ss = S[k].reduce((s, v) => s + v, 0);
      for (let i = 0; i < c; i++) r.push((n[k][i] - a * Q[i] * (P * R[k][i] / sr - p * S[k][i] / ss)) / Ft);
    }
    return { R, S, r };
  };
  const norm = r => r.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const admissible = (R, S) => R.every(row => row.every((v, i) => v > 0 || (!passes[i] && v >= 0) || F[i] === 0))
    && S.every(row => row.every((v, i) => v >= 0 || !passes[i]) && row.reduce((s, v) => s + v, 0) > 0);

  const newton = (n0, a) => {
    let n = n0.map(row => row.slice()), st = state(n, a);
    if (!admissible(st.R, st.S)) return null;
    for (let it = 1; it <= 60; it++) {
      if (norm(st.r) < 1e-13) return { n, ...st, iterations: it - 1 };
      // the Jacobian, d r_(k,i) / d n_(m,l)
      const M = N * c, J = Array.from({ length: M }, () => new Float64Array(M));
      for (let k = 0; k < N; k++) {
        const sr = st.R[k].reduce((s, v) => s + v, 0), ss = st.S[k].reduce((s, v) => s + v, 0);
        for (let i = 0; i < c; i++) {
          const row = J[k * c + i], x = st.R[k][i] / sr, y = st.S[k][i] / ss, aq = a * Q[i] / Ft;
          row[k * c + i] += 1 / Ft;
          if (aq === 0) continue;
          for (let m = 0; m < N; m++) {
            const inR = m <= k, inS = co ? m <= k : m >= k;
            if (!inR && !inS) continue;
            for (let l = 0; l < c; l++) {
              const d = l === i ? 1 : 0;
              row[m * c + l] += (inR ? aq * P * (d - x) / sr : 0) + (inS ? aq * p * (d - y) / ss : 0);
            }
          }
        }
      }
      const dx = solveLinear(J.map(r => Array.from(r)), st.r.map(v => -v));
      if (!dx || dx.some(v => !Number.isFinite(v))) return null;
      // the largest step that keeps the flows positive, then halved until the residual falls
      let t = 1;
      for (let back = 0; back < 40; back++, t /= 2) {
        const m = n.map((row, k) => row.map((v, i) => v + t * dx[k * c + i]));
        const s2 = state(m, a);
        if (!admissible(s2.R, s2.S)) continue;
        if (norm(s2.r) < norm(st.r) || norm(s2.r) < 1e-13) { n = m; st = s2; break; }
      }
      if (t < 1e-12) return null;
    }
    return norm(st.r) < 1e-11 ? { n, ...st, iterations: 60 } : null;
  };

  let sol = start ? newton(start, A / N) : null;
  let iterations = sol?.iterations ?? 0;
  if (!sol) {
    // continuation in the area from 0.1 % of it, each step started from the last solution (its flows scaled with the
    // area, or as they are where scaling leaves the admissible flows); a failed step is halved, down to 1/256 of a decade
    let e = -3, step = 0.25, n = null, a = A * 1e-3 / N;
    n = Array.from({ length: N }, (_, k) => F.map((v, i) => a * Q[i] * P * v / Ft * (1 - 0.5 * k / N)));
    sol = newton(n, a);
    let lastOk = sol;
    while (sol && e < 0) {
      const e2 = Math.min(0, e + step), a2 = A * 10 ** e2 / N;
      const scaled = sol.n.map(row => row.map(v => v * a2 / a));
      const r = newton(scaled, a2) ?? newton(sol.n, a2);
      if (r) { sol = lastOk = r; e = e2; a = a2; iterations += r.iterations; step = Math.min(0.25, step * 2); }
      else if ((step /= 2) < 1 / 256) { sol = null; break; }
    }
    const cut = last => last ? (co ? last.S[N - 1] : last.S[0]).reduce((s, v) => s + v, 0) / Ft : 0;
    if (!sol && cut(lastOk) > 0.95) throw fail("OUT_OF_RANGE", `Membrane: at ${fmt(A)} m² the membrane would permeate the whole feed: at ${fmt(A * 10 ** e)} m² the stage cut is already ${fmt(cut(lastOk))}, and the area that permeates everything is finite. Give a smaller area, or a stage cut or recovery to find the area.`);
    if (!sol) throw fail("NO_CONVERGENCE", `Membrane: the cells did not converge at ${fmt(10 ** e * 100)} % of the area (${fmt(A * 10 ** e)} m²); Newton's method with a continuation in the area was tried. A smaller area or fewer cells may help.`);
  }
  const permeate = co ? sol.S[N - 1] : sol.S[0];
  return { n: sol.n, R: sol.R, S: sol.S, permeate: permeate.slice(), retentate: sol.R[N - 1].slice(), iterations };
}

/**
 * The area for a target, by Brent's method on ln A, each cell solution started from the last one.
 * @param {object} o  as membraneCells without A, and target: { stage_cut } or { recovery: [index, fraction] }
 */
export function membraneAreaFor({ F, Q, P, p, cells, flow, target }) {
  const Ft = F.reduce((s, v) => s + v, 0);
  const goal = target.stage_cut ?? target.recovery[1];
  const measure = r => target.stage_cut != null ? r.permeate.reduce((s, v) => s + v, 0) / Ft : r.permeate[target.recovery[0]] / F[target.recovery[0]];
  let last = null, lastA = null, evals = 0;
  const at = A => {
    const start = last ? last.n.map(row => row.map(v => v * A / lastA)) : null;
    const r = membraneCells({ F, Q, P, p, A, cells, flow, start });
    last = r; lastA = A; evals++;
    return r;
  };
  const A0 = goal * Ft / Q.reduce((s, q, i) => s + q * P * F[i] / Ft, 0);
  let lo = A0 / 4, hi = A0, vhi = measure(at(hi));
  for (let k = 0; vhi < goal; k++) {
    if (k > 60) throw fail("OUT_OF_RANGE", `Membrane: the ${target.stage_cut != null ? `stage cut ${goal}` : `recovery ${goal}`} is not reached: at ${fmt(hi)} m² it is only ${fmt(vhi)}.`);
    lo = hi; hi *= 2; vhi = measure(at(hi));
  }
  while (measure(at(lo)) > goal) lo /= 2;
  const lnA = brent(x => measure(at(Math.exp(x))) - goal, Math.log(lo), Math.log(hi), { xtol: 1e-12, ftol: 1e-12 });
  const A = Math.exp(lnA);
  return { A, ...at(A), evaluations: evals };
}

// ---------------------------------------------------------------------------------------
// The block

function componentIndex(sys, key, what) {
  let id;
  try { id = findComponent(key, sys.userData); } catch (e) { throw fail("BAD_INPUT", `Membrane: ${what}: ${e.message}`); }
  const i = sys.ids.indexOf(id);
  if (i < 0) throw fail("BAD_INPUT", `Membrane: ${what}: ${key} is not a component of this system (${sys.ids.join(", ")}).`);
  return i;
}

const positive = (v, what) => {
  const x = Number(v);
  if (!(Number.isFinite(x) && x > 0)) throw fail("BAD_INPUT", `Membrane: ${what} must be a positive number (got ${JSON.stringify(v)}).`);
  return x;
};

function checkSpec(spec, { sys }) {
  const unit = spec.permeance_unit ?? "mol/(m2 s Pa)";
  if (!(unit in PERMEANCE_UNITS)) throw fail("BAD_INPUT", `Membrane: permeance_unit must be one of ${Object.keys(PERMEANCE_UNITS).map(u => `"${u}"`).join(", ")} (got ${JSON.stringify(unit)}).`);
  const pm = spec.permeances;
  if (!pm || typeof pm !== "object" || Array.isArray(pm)) throw fail("BAD_INPUT", "Membrane: give the permeance of every component, e.g. { permeances: { \"carbon-dioxide\": 204.2e-10, oxygen: 60.2e-10, nitrogen: 13.1e-10 } } in mol/(m2 s Pa); 0 for one that does not pass.");
  const Q = new Array(sys.n).fill(null);
  for (const [key, v] of Object.entries(pm)) {
    const i = componentIndex(sys, key, "permeances");
    const x = Number(v);
    if (v === null || v === "" || !Number.isFinite(x) || x < 0) throw fail("BAD_INPUT", `Membrane: the permeance of ${sys.names[i]} must be a number of at least 0 (got ${JSON.stringify(v)}).`);
    Q[i] = x * PERMEANCE_UNITS[unit];
  }
  const missing = sys.ids.filter((_, i) => Q[i] == null);
  if (missing.length) throw fail("BAD_INPUT", `Membrane: give a permeance for every component (0 for one that does not pass); missing: ${missing.map(id => sys.names[sys.ids.indexOf(id)]).join(", ")}.`);
  if (!Q.some(q => q > 0)) throw fail("BAD_INPUT", "Membrane: at least one permeance must be above 0.");
  if (!has(spec, "permeate_P_kPa")) throw fail("BAD_INPUT", "Membrane: give the permeate pressure, permeate_P_kPa.");
  const p = positive(spec.permeate_P_kPa, "permeate_P_kPa");
  const flow = spec.flow ?? "counter-current";
  if (!FLOWS.includes(flow)) throw fail("BAD_INPUT", `Membrane: flow must be "counter-current" or "co-current" (got ${JSON.stringify(flow)}).`);
  const cells = spec.cells ?? 20;
  if (!(Number.isInteger(cells) && cells >= 1 && cells <= MAX_CELLS)) throw fail("BAD_INPUT", `Membrane: cells must be a whole number from 1 to ${MAX_CELLS} (got ${JSON.stringify(spec.cells)}).`);
  if (cells * sys.n > MAX_UNKNOWNS) throw fail("BAD_INPUT", `Membrane: ${cells} cells for ${sys.n} components make ${cells * sys.n} unknowns; at most ${MAX_UNKNOWNS} (use at most ${Math.floor(MAX_UNKNOWNS / sys.n)} cells).`);
  const given = TARGETS.filter(k => has(spec, k));
  if (given.length !== 1) throw fail("BAD_INPUT", `Membrane: give one of the area A_m2, the stage cut stage_cut or the recovery of one component into the permeate, recovery: { component: fraction } (got ${given.join(", ") || "none"}).`);
  const out = { Q, unit, p, flow, cells };
  if (has(spec, "A_m2")) out.A_m2 = positive(spec.A_m2, "A_m2");
  if (has(spec, "stage_cut")) {
    const t = Number(spec.stage_cut);
    if (!(t > 0 && t < 1)) throw fail("BAD_INPUT", `Membrane: the stage cut must be between 0 and 1 (got ${JSON.stringify(spec.stage_cut)}).`);
    out.stage_cut = t;
  }
  if (has(spec, "recovery")) {
    const r = spec.recovery;
    if (!r || typeof r !== "object" || Array.isArray(r) || Object.keys(r).length !== 1) throw fail("BAD_INPUT", "Membrane: recovery names one component and the fraction of its feed flow that leaves in the permeate, e.g. { hydrogen: 0.9 }.");
    const [key, v] = Object.entries(r)[0];
    const i = componentIndex(sys, key, "recovery");
    const t = Number(v);
    if (!(t > 0 && t < 1)) throw fail("BAD_INPUT", `Membrane: the recovery of ${sys.names[i]} must be between 0 and 1 (got ${JSON.stringify(v)}).`);
    if (!(Q[i] > 0)) throw fail("BAD_INPUT", `Membrane: ${sys.names[i]} has a permeance of 0, so none of it reaches the permeate.`);
    out.recovery = [i, t];
  }
  if (has(spec, "fibre")) {
    const f = spec.fibre;
    if (!f || typeof f !== "object" || Array.isArray(f)) throw fail("BAD_INPUT", "Membrane: fibre is { inner_diameter_m, length_m }, for the number of hollow fibres of the area.");
    const bad = Object.keys(f).filter(k => !["inner_diameter_m", "length_m"].includes(k));
    if (bad.length) throw fail("BAD_INPUT", `Membrane: fibre: unknown key${bad.length > 1 ? "s" : ""} ${bad.join(", ")}. Known: inner_diameter_m, length_m.`);
    out.fibre = { inner_diameter_m: positive(f.inner_diameter_m, "fibre.inner_diameter_m"), length_m: positive(f.length_m, "fibre.length_m") };
  }
  return out;
}

function dof(spec) {
  const out = { needed: 3, given: 0, missing: [], extra: [] };
  if (has(spec, "permeances")) out.given++; else out.missing.push("the permeances");
  if (has(spec, "permeate_P_kPa")) out.given++; else out.missing.push("the permeate pressure");
  const g = TARGETS.filter(k => has(spec, k));
  if (g.length) out.given++;
  if (!g.length) out.missing.push("the area, or a target: the stage cut or a recovery");
  if (g.length > 1) out.extra.push(`${g.join(", ")}: give one`);
  return out;
}

/** The number of hollow fibres of an area, A = ε d π l (Aziaba et al. 2022, Equation (2)). */
export function fibreCount(A_m2, { inner_diameter_m, length_m }) {
  return A_m2 / (Math.PI * inner_diameter_m * length_m);
}

function solve({ sys, inlets, spec }) {
  const s = inlets.in[0];
  if (!(s.F_kmol_h > 0)) throw fail("BAD_INPUT", "Membrane: the feed has no flow.");
  if (s.VF == null || s.VF < 1 - 1e-9) throw fail("NOT_AVAILABLE", `Membrane: the feed is not all gas (vapour fraction ${s.VF == null ? "unknown" : fmt(s.VF)} at ${fmt(s.T_K)} K and ${fmt(s.P_kPa)} kPa). This block is gas permeation; a liquid feed (pervaporation) is a later step of proposal 0015. Heat the feed or lower its pressure so that it is all vapour.`);
  const P = s.P_kPa, p = spec.p;
  if (!(p < P)) throw fail("BAD_INPUT", `Membrane: the permeate pressure (${fmt(p)} kPa) must be below the feed pressure (${fmt(P)} kPa).`);
  const Q = spec.Q.map(q => q * TO_ENGINE);   // kmol/(h m² kPa)
  const base = { F: s.flows.slice(), Q, P, p, cells: spec.cells, flow: spec.flow };
  const target = spec.stage_cut != null ? { stage_cut: spec.stage_cut } : spec.recovery ? { recovery: spec.recovery } : null;
  const r = target ? membraneAreaFor({ ...base, target }) : { A: spec.A_m2, ...membraneCells({ ...base, A: spec.A_m2 }) };
  const A = r.A;
  // round-off: a component that does not pass leaves entirely in the retentate
  const perm = r.permeate.map((v, i) => (Q[i] > 0 ? Math.max(0, v) : 0));
  const ret = s.flows.map((v, i) => v - perm[i]);
  const permeate = stream(sys, { flow_kmol_h: perm, T_K: s.T_K, P_kPa: p });
  const retentate = stream(sys, { flow_kmol_h: ret, T_K: s.T_K, P_kPa: P });
  const theta = perm.reduce((a, v) => a + v, 0) / s.F_kmol_h;
  const warnings = [];
  for (const [o, name, at] of [[permeate, "permeate", p], [retentate, "retentate", P]]) {
    if (o.F_kmol_h > 0 && o.VF != null && o.VF < 1 - 1e-9) warnings.push({ code: "CONDENSATION", message: `The ${name} would partly condense at ${fmt(s.T_K)} K and ${fmt(at)} kPa (vapour fraction ${fmt(o.VF)}); the model takes a gas on both sides.`,
      remedy: name === "retentate" ? "Raise the feed temperature, or take a smaller stage cut." : "Lower the permeate pressure, or raise the temperature." });
  }
  const area = A / spec.cells;
  const profile = r.R.map((Rk, k) => ({ cell: k + 1, A_m2: area * (k + 1), retentate_kmol_h: Rk.slice(), permeate_side_kmol_h: r.S[k].slice(), permeated_kmol_h: r.n[k].slice() }));
  const dims = { A_m2: A, ...(spec.fibre ? { fibres: fibreCount(A, spec.fibre), fibre: spec.fibre } : {}) };
  const notes = [
    `Gas permeation by the solution-diffusion model (Aziaba et al. 2022): ${spec.flow}, ${spec.cells} well-mixed cell${spec.cells > 1 ? "s" : ""}; Dalton's partial pressures, the feed side at ${fmt(P)} kPa and the permeate side at ${fmt(p)} kPa throughout; permeances held constant.`,
    "Isothermal: both outlets at the feed's temperature; the duty is the heat that keeps them there (a real module cools as the permeate expands).",
  ];
  if (target) notes.push(`The area for the ${target.stage_cut != null ? `stage cut ${target.stage_cut}` : `recovery ${target.recovery[1]} of ${sys.names[target.recovery[0]]}`}: ${fmt(A)} m².`);
  const recoveries = Object.fromEntries(sys.ids.map((id, i) => [id, s.flows[i] > 0 ? perm[i] / s.flows[i] : null]));
  return {
    outlets: { permeate, retentate },
    duty_kW: (permeate.H_kW ?? 0) + (retentate.H_kW ?? 0) - (s.H_kW ?? 0),
    notes, warnings, profile,
    state: { A_m2: A, stage_cut: theta, recoveries, flow: spec.flow, cells: spec.cells, T_K: s.T_K, P_feed_kPa: P, permeate_P_kPa: p,
      permeance_unit: spec.unit, iterations: r.iterations, ...(target ? { target: target.stage_cut != null ? { stage_cut: target.stage_cut } : { recovery: { [sys.ids[target.recovery[0]]]: target.recovery[1] } } } : {}) },
    sizing: { dimensions: dims, basis: target ? `the area for the ${target.stage_cut != null ? "stage cut" : "recovery"} given, by the cells of the solution-diffusion model` : "the area given",
      source: "Aziaba et al., Membranes 12 (2022) 1186, Equations (1)-(3)" },
  };
}

registerUnit({
  type: "membrane", label: "Membrane", duty: true,
  inlets: [{ port: "in", label: "feed" }],
  outlets: [{ port: "permeate" }, { port: "retentate" }],
  specKeys: SPEC_KEYS,
  checkSpec, dof, solve,
});
