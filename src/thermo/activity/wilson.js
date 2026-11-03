/**
 * Wilson activity coefficients (proposal 0016).
 *
 * G. M. Wilson, "Vapor-liquid equilibrium. XI. A new expression for the excess free energy of mixing",
 * J. Am. Chem. Soc. 86 (1964) 127-130, doi:10.1021/ja01056a002 (paywalled; not used for numbers). The equations as
 * used here are printed in The ChemSep Book, 2nd ed. (Kooijman and Taylor 2006, public domain,
 * http://www.chemsep.org/downloads/docs/book2.pdf), chapter 10, eqs. 10.13-10.15 (PDF p. 133), and in the open
 * thermo library (C. Bell et al., MIT licence), thermo.wilson.Wilson, whose documentation gives
 *   g^E / RT = -sum_i x_i ln(sum_j x_j Lambda_ij),
 *   Lambda_ij = exp(a_ij + b_ij / T)   (the further terms c ln T, d T, e / T^2, f T^2 are not used here);
 * and ChemSep's Wilson databank (wilson.json, as shipped with thermo, Artistic License 2.0), whose a_ij is
 * ln(V_j / V_i) of the pure liquids and b_ij = -lambda_ij / R in K. Lambda_ii = 1.
 *
 *   ln gamma_i = 1 - ln(sum_j x_j Lambda_ij) - sum_k x_k Lambda_ki / sum_j x_j Lambda_kj
 *
 * The Wilson equation cannot predict two liquid phases (Wilson 1964; thermo's documentation: "not recommended for
 * liquid-liquid equilibria"): with Lambda > 0 the mixture it describes is always stable as one liquid. createSystem
 * (system.js) warns where another model's set of a pair predicts two liquids, and the two-liquid calculations refuse it.
 *
 * @param {{a:number[][], b:number[][]}} p  n x n matrices (diagonal 0)
 * @returns {(x:number[], T:number)=>number[]}  activity coefficients gamma_i
 */
export function wilson(p) {
  const n = p.a.length;
  const lambdas = T => p.a.map((row, i) => row.map((aij, j) => (i === j ? 1 : Math.exp(aij + p.b[i][j] / T))));
  function gammas(x, T) {
    const L = lambdas(T);
    // S_i = sum_j x_j Lambda_ij
    const S = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) S[i] += x[j] * L[i][j];
    const g = new Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += x[k] * L[k][i] / S[k];
      g[i] = Math.exp(1 - Math.log(S[i]) - s);
    }
    return g;
  }
  gammas.lambdas = lambdas;
  return gammas;
}
