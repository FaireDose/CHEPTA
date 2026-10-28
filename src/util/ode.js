/**
 * A stiff ODE integrator with error control: the modified Rosenbrock pair of ode23s (L. F. Shampine and M. W. Reichelt,
 * "The MATLAB ODE Suite", SIAM J. Sci. Comput. 18 (1997) 1-22, section 3.1, p. 6-7; free copy from MathWorks,
 * https://www.mathworks.com/help/pdf_doc/otherdocs/ode_suite.pdf). For an autonomous system y' = F(y), a step of h:
 *   W = I - h d J,  d = 1/(2 + √2),  e32 = 6 + √2,  J = ∂F/∂y at y_n (here by forward differences)
 *   k1 = W⁻¹ F0,  F1 = F(y_n + h k1 / 2),  k2 = W⁻¹ (F1 - k1) + k1,  y_n+1 = y_n + h k2,  F2 = F(y_n+1)
 *   k3 = W⁻¹ [F2 - e32 (k2 - F1) - 2 (k1 - F0)],  error ≈ h (k1 - 2 k2 + k3) / 6
 * The second-order result is kept (no local extrapolation, as ode23s); the step grows or shrinks with the error
 * (factor 0.8 err^(-1/3), within 0.2 and 5). F may throw for a y outside its domain (a negative flow): the step is
 * then halved, as for a rejected error.
 */
import { fail } from "./errors.js";

const D = 1 / (2 + Math.SQRT2), E32 = 6 + Math.SQRT2;

/** Solve A x = b by LU with partial pivoting; A is not changed. Null if singular. */
function luSolver(A) {
  const n = A.length, M = A.map(r => r.slice()), piv = [...Array(n).keys()];
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (!(Math.abs(M[p][c]) > 1e-300)) return null;
    [M[c], M[p]] = [M[p], M[c]]; [piv[c], piv[p]] = [piv[p], piv[c]];
    for (let r = c + 1; r < n; r++) {
      const f = (M[r][c] /= M[c][c]);
      for (let k = c + 1; k < n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return b => {
    const x = piv.map(i => b[i]);
    for (let r = 0; r < n; r++) for (let k = 0; k < r; k++) x[r] -= M[r][k] * x[k];
    for (let r = n - 1; r >= 0; r--) { for (let k = r + 1; k < n; k++) x[r] -= M[r][k] * x[k]; x[r] /= M[r][r]; }
    return x;
  };
}

/**
 * Integrate y' = F(y) from t0 to t1.
 * @param {(y:number[]) => number[]} F
 * @param {number[]} y0
 * @param {number} t0
 * @param {number} t1
 * @param {{rtol?:number, atol?:number|number[], h0?:number, maxSteps?:number, onStep?:(t:number, y:number[]) => void}} [o]
 * @returns {{y:number[], steps:number, rejected:number, evaluations:number}}
 */
export function integrateStiff(F, y0, t0, t1, o = {}) {
  const rtol = o.rtol ?? 1e-6, n = y0.length;
  const atol = Array.isArray(o.atol) ? o.atol : new Array(n).fill(o.atol ?? 1e-9);
  const maxSteps = o.maxSteps ?? 5000;
  let evals = 0;
  const f = y => { evals++; const v = F(y); if (!v.every(Number.isFinite)) throw fail("NO_CONVERGENCE", "the derivatives are not finite numbers."); return v; };
  let t = t0, y = y0.slice(), F0 = f(y);
  let h = o.h0 ?? (t1 - t0) / 100;
  let steps = 0, rejected = 0, refusal = null;
  o.onStep?.(t, y);
  while (t < t1 - 1e-12 * Math.abs(t1)) {
    if (steps + rejected > maxSteps) throw fail("NO_CONVERGENCE", `the integration needed more than ${maxSteps} steps (it stopped at ${t.toPrecision(6)} of ${t1}); the system is very stiff or a rate changes abruptly.`);
    h = Math.min(h, t1 - t);
    if (h < 1e-14 * Math.max(1, Math.abs(t1))) throw fail("NO_CONVERGENCE", `the step size fell below ${h.toExponential(1)} at ${t.toPrecision(6)} (of ${t1}): a rate changes abruptly there, or a flow is driven below zero${refusal ? ` (the last refusal: ${refusal})` : ""}.`);
    // Jacobian by forward differences
    const J = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let k = 0; k < n; k++) {
      const d = 1e-7 * Math.max(Math.abs(y[k]), atol[k] * 1e3, 1e-12);
      const yp = y.slice(); yp[k] += d;
      let Fp;
      try { Fp = f(yp); } catch { yp[k] = y[k] - d; Fp = f(yp).map((v, i) => 2 * F0[i] - v); }
      for (let i = 0; i < n; i++) J[i][k] = (Fp[i] - F0[i]) / d;
    }
    let ok = false, yNew, F2, err = Infinity;
    try {
      const solve = luSolver(J.map((row, i) => row.map((v, k) => (i === k ? 1 : 0) - h * D * v)));
      if (!solve) throw fail("NO_CONVERGENCE", "singular iteration matrix.");
      const k1 = solve(F0);
      const F1 = f(y.map((v, i) => v + 0.5 * h * k1[i]));
      const k2 = solve(F1.map((v, i) => v - k1[i])).map((v, i) => v + k1[i]);
      yNew = y.map((v, i) => v + h * k2[i]);
      F2 = f(yNew);
      const k3 = solve(F2.map((v, i) => v - E32 * (k2[i] - F1[i]) - 2 * (k1[i] - F0[i])));
      err = 0;
      for (let i = 0; i < n; i++) {
        const sc = Math.max(atol[i], rtol * Math.max(Math.abs(y[i]), Math.abs(yNew[i])));
        err = Math.max(err, Math.abs(h * (k1[i] - 2 * k2[i] + k3[i]) / 6) / sc);
      }
      ok = err <= 1;
    } catch (e) {
      if (e.code !== "NO_CONVERGENCE" && e.code !== "BAD_INPUT" && e.code !== "OUT_OF_RANGE") throw e;
      err = Infinity;
      refusal = e.message;
    }
    if (ok) {
      t += h; y = yNew; F0 = F2; steps++;
      o.onStep?.(t, y);
      h *= Math.min(5, Math.max(0.2, 0.8 * Math.cbrt(1 / Math.max(err, 1e-12))));
    } else {
      rejected++;
      h *= Number.isFinite(err) ? Math.max(0.2, 0.8 * Math.cbrt(1 / err)) : 0.5;
    }
  }
  return { y, steps, rejected, evaluations: evals };
}
