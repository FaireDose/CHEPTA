/**
 * Modified UNIFAC (Dortmund) activity coefficients, with the parameters of Modified UNIFAC 2.0.
 *
 * Equations: U. Weidlich, J. Gmehling, Ind. Eng. Chem. Res. 26 (1987) 1372; J. Gmehling, J. Li, M. Schiller,
 * Ind. Eng. Chem. Res. 32 (1993) 178; as kept by Modified UNIFAC 2.0 (N. Hayer, H. Hasse, F. Jirasek, Ind. Eng. Chem.
 * Res. 64 (2025) 10304, open copy arXiv:2412.12962, CC BY 4.0, eq 1 with c_nm = 0), and as implemented in the
 * open-source thermo library (MIT; thermo.unifac.UNIFAC, version 1), which the tests compare with.
 *
 *   combinatorial: ln gC_i = 1 - V'_i + ln V'_i - 5 q_i (1 - V_i/F_i + ln(V_i/F_i)),
 *                  V_i = r_i / sum_j x_j r_j, V'_i = r_i^(3/4) / sum_j x_j r_j^(3/4), F_i = q_i / sum_j x_j q_j,
 *                  r_i = sum_k nu_ki R_k, q_i = sum_k nu_ki Q_k;
 *   residual:      ln gR_i = sum_k nu_ki (ln Gamma_k - ln Gamma_k^(i)),
 *                  ln Gamma_k = Q_k (1 - ln(sum_m Theta_m Psi_mk) - sum_m Theta_m Psi_km / sum_n Theta_n Psi_nm),
 *                  Theta_m = Q_m X_m / sum_n Q_n X_n (X: group mole fractions; for Gamma_k^(i) those of pure i),
 *                  Psi_nm = exp(-(a_nm + b_nm T) / T), n and m the main groups of the subgroups.
 */

/**
 * @param {{groups: Object<string,number>[], tables: {subgroups: Object, main: number[], a: number[][], b: number[][]}}} p
 *        groups: per component, subgroup id -> count; tables: src/data/mod-unifac-2.json
 * @returns {(x:number[], T:number)=>number[]}
 */
export function modUnifac(p) {
  const { tables } = p;
  const n = p.groups.length;
  // the subgroups present, with their R, Q and main-group index
  const ids = [...new Set(p.groups.flatMap(g => Object.keys(g)))];
  const K = ids.length;
  const mainIndex = new Map(tables.main.map((m, i) => [m, i]));
  const R = ids.map(id => tables.subgroups[id].R);
  const Q = ids.map(id => tables.subgroups[id].Q);
  const mi = ids.map(id => mainIndex.get(tables.subgroups[id].main));
  const nu = p.groups.map(g => ids.map(id => g[id] ?? 0));
  const r = nu.map(v => v.reduce((s, c, k) => s + c * R[k], 0));
  const q = nu.map(v => v.reduce((s, c, k) => s + c * Q[k], 0));
  const r34 = r.map(v => v ** 0.75);

  const psiAt = T => {
    const psi = [];
    for (let m = 0; m < K; m++) {
      psi.push([]);
      for (let k = 0; k < K; k++) psi[m].push(Math.exp(-(tables.a[mi[m]][mi[k]] + tables.b[mi[m]][mi[k]] * T) / T));
    }
    return psi;
  };
  // ln Gamma_k for group counts X (any scale)
  const lnGamma = (X, psi) => {
    const qx = X.map((v, k) => Q[k] * v);
    const sq = qx.reduce((s, v) => s + v, 0);
    const th = qx.map(v => v / sq);
    const s1 = new Array(K).fill(0); // s1[k] = sum_m Theta_m Psi_mk
    for (let k = 0; k < K; k++) for (let m = 0; m < K; m++) s1[k] += th[m] * psi[m][k];
    const out = new Array(K);
    for (let k = 0; k < K; k++) {
      let s2 = 0;
      for (let m = 0; m < K; m++) s2 += th[m] * psi[k][m] / s1[m];
      out[k] = Q[k] * (1 - Math.log(s1[k]) - s2);
    }
    return out;
  };
  let cacheT = NaN, psi, pureLn;

  return function gammas(xIn, T) {
    let x = xIn.map(v => Math.max(v, 1e-12));
    const sx = x.reduce((a, b) => a + b, 0);
    x = x.map(v => v / sx);
    if (T !== cacheT) {
      psi = psiAt(T);
      pureLn = nu.map(v => lnGamma(v, psi));
      cacheT = T;
    }
    let rx = 0, qx = 0, r34x = 0;
    for (let i = 0; i < n; i++) { rx += x[i] * r[i]; qx += x[i] * q[i]; r34x += x[i] * r34[i]; }
    const X = new Array(K).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k < K; k++) X[k] += x[i] * nu[i][k];
    const mixLn = lnGamma(X, psi);
    const g = new Array(n);
    for (let i = 0; i < n; i++) {
      const V = r[i] / rx, Vp = r34[i] / r34x, F = q[i] / qx;
      const lnC = 1 - Vp + Math.log(Vp) - 5 * q[i] * (1 - V / F + Math.log(V / F));
      let lnR = 0;
      for (let k = 0; k < K; k++) if (nu[i][k]) lnR += nu[i][k] * (mixLn[k] - pureLn[i][k]);
      g[i] = Math.exp(lnC + lnR);
    }
    return g;
  };
}
