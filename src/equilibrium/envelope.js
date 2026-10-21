/**
 * Phase envelope of a mixture with an equation of state (layer 3; proposal 0013, step 7): the dew curve and the
 * bubble curve as one line, traced through the mixture critical point, with the critical point, the cricondenbar
 * (the highest pressure) and the cricondentherm (the highest temperature).
 *
 *   CHEPTA.phaseEnvelope(sys, z) → { points: [{ T_K, P_kPa, branch: "dew" | "bubble" }], critical: { T_K, P_kPa } | null,
 *     cricondenbar: { T_K, P_kPa }, cricondentherm: { T_K, P_kPa }, complete, notes }
 *
 * Method: the continuation of M. L. Michelsen, "Calculation of phase envelopes and critical points for
 * multicomponent mixtures", Fluid Phase Equilibria 4 (1980) 1-10 (paywalled: named for the method only), with its
 * equations as an open implementation writes them: thermopack (SINTEF Energy Research, Apache License 2.0,
 * https://github.com/thermotools/thermopack), src/saturation.f90, sat_fun_newton (the unknowns ln K, ln T, ln P and
 * the residuals below), and src/saturation_curve.f90, newton_extrapolate (the sensitivities dX/dS). The independent
 * check is CoolProp's cubic backend, which traces the envelope its own way (in the vapour density;
 * validation/python/reference_envelope.py). The unknowns are ln K_i (K_i = y_i / x_i), ln T and ln P; the
 * equations, for a saturated parent phase of composition z and an incipient phase:
 *   F_i     = ln K_i + ln phi_i(y, T, P) - ln phi_i(x, T, P) = 0      (equal fugacities)
 *   F_(n+1) = sum(y_i - x_i) = 0
 *   F_(n+2) = X_s - S = 0                                            (one unknown specified)
 * with y = z on the dew curve (x = z / K the incipient liquid). The curve is followed from a low-pressure dew point:
 * after each point, the sensitivities dX/dS (from J dX/dS = -dF/dS) give the next point's first guess, and the
 * unknown that changes fastest becomes the specified one, so that the steps pass the cricondentherm, the
 * cricondenbar and the critical point, where every ln K changes sign: there the parent phase becomes the liquid and
 * the line continues as the bubble curve, down to the starting pressure. The side of the critical point is read from
 * the ln K farthest from zero at the start (the heaviest component's), and the critical point is where it passes zero
 * (cubic interpolation between the points around it). Newton with a Jacobian by
 * finite differences; the liquid root of the cubic for the liquid-like phase, the vapour root for the other.
 * A step that fails is halved; the line ends, with a note saying where, when the steps become too small.
 * Units: K, kPa.
 */
import { fail } from "../util/errors.js";

const MAX_POINTS = 600;

/** Solve the linear system A x = b (Gaussian elimination with partial pivoting); null when singular. */
function solveLinear(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (!(Math.abs(M[p][c]) > 1e-300)) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x.every(Number.isFinite) ? x : null;
}

/**
 * The phase envelope of feed z (mole fractions) for an equation-of-state system.
 * @param {object} sys  a system with an equation of state (model PR or SRK)
 * @param {number[]} z  feed mole fractions, two components or more
 * @param {{P0_kPa?: number, maxPoints?: number}} [opts]  P0_kPa: the pressure where the line starts and ends (default 50)
 */
export function phaseEnvelope(sys, z, opts = {}) {
  if (sys?.kind !== "eos") throw fail("BAD_INPUT", "phaseEnvelope needs an equation of state (Peng–Robinson or SRK): the curves of an activity model end below the critical region.");
  const n = sys.n;
  if (n < 2) throw fail("BAD_INPUT", "A phase envelope needs two components or more; one component has a vapour-pressure curve (sys.psatEos).");
  if (!Array.isArray(z) || z.length !== n || z.some(v => !(v >= 0))) throw fail("BAD_INPUT", `Give ${n} mole fractions, none negative.`);
  const sz = z.reduce((a, v) => a + v, 0);
  if (!(sz > 0)) throw fail("BAD_INPUT", "The mole fractions must have a positive sum.");
  const zz = z.map(v => v / sz);
  const P0 = opts.P0_kPa ?? 50, maxPoints = opts.maxPoints ?? MAX_POINTS;
  const eos = sys.eos, N = n + 2;
  // a component with no feed takes no part: its K is fixed at 1 and left out of the unknowns' effect (tiny z instead)
  const zs = zz.map(v => Math.max(v, 1e-14));
  // ref: the component whose ln K is farthest from zero at the start (the heaviest): every ln K changes sign at the
  // critical point, and this one's sign is unambiguous everywhere else (set after the first point)
  let ref = 0, refSign = 1;

  /** The residuals at X = [ln K..., ln T, ln P]; the phase roles swap past the critical point. */
  const residuals = X => {
    const T = Math.exp(X[n]), P = Math.exp(X[n + 1]);
    const K = X.slice(0, n).map(Math.exp);
    const x = zs.map((v, i) => v / K[i]);
    // before the critical point the incipient phase (x) is the liquid; past it (ln K_ref of the other sign), the vapour
    const past = refSign * X[ref] < 0;
    const sx = x.reduce((a, v) => a + v, 0);
    const xn = x.map(v => v / sx);
    const L = eos.state(T, P, xn, past ? "vapour" : "liquid"), V = eos.state(T, P, zs, past ? "liquid" : "vapour");
    const F = new Array(N);
    for (let i = 0; i < n; i++) F[i] = X[i] + V.lnPhi[i] - L.lnPhi[i];
    F[n] = 1 - sx;
    return F;
  };
  const jacobian = (X, F0) => {
    const J = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let k = 0; k < N; k++) {
      const h = 1e-7 * Math.max(1, Math.abs(X[k]));
      const Xp = X.slice(); Xp[k] += h;
      const Fp = residuals(Xp);
      for (let r = 0; r < n + 1; r++) J[r][k] = (Fp[r] - F0[r]) / h;
    }
    return J;
  };
  /** Newton at the specification X_s = S, from the guess X; { X, J, it } or null. */
  const newton = (X, s, S) => {
    X = X.slice(); X[s] = S;
    for (let it = 1; it <= 30; it++) {
      let F, J;
      try { F = residuals(X); J = jacobian(X, F); } catch { return null; }
      F[n + 1] = X[s] - S;
      J[n + 1] = new Array(N).fill(0); J[n + 1][s] = 1;
      const d = solveLinear(J, F.map(v => -v));
      if (!d) return null;
      // limit a step to 0.5 in the logarithms (a factor of 1.65 in K, T or P)
      const big = Math.max(...d.map(Math.abs)), f = big > 0.5 ? 0.5 / big : 1;
      for (let k = 0; k < N; k++) X[k] += f * d[k];
      if (!X.every(Number.isFinite)) return null;
      // converged: the residuals at round-off, or a correction below 1e-8 in the logarithms (the finite-difference
      // Jacobian leaves corrections of about 1e-9 that do not shrink further)
      if (f === 1 && (Math.max(...F.map(Math.abs)) < 1e-11 || Math.max(...d.map(Math.abs)) < 1e-8)) {
        // the trivial solution (every K = 1) is not a point of the envelope
        if (Math.max(...X.slice(0, n).map(Math.abs)) < 1e-8) return null;
        return { X, J, it };
      }
    }
    return null;
  };

  // ---- the first point: a dew point at P0 (the parent phase is the feed as a vapour)
  let start;
  try { start = sys.dewT(zz, P0); } catch (e) {
    throw fail("NO_CONVERGENCE", `Phase envelope: no dew point of this feed at ${P0} kPa to start from (${e.message})`);
  }
  const xs = start.x ?? start.liquid ?? null;
  if (!xs) throw fail("NO_CONVERGENCE", "Phase envelope: the starting dew point gave no liquid composition.");
  let X = [...zs.map((v, i) => Math.log(v / Math.max(xs[i], 1e-300))), Math.log(start.T), Math.log(P0)];
  ref = X.slice(0, n).reduce((b, v, i) => (zz[i] > 0 && Math.abs(v) > Math.abs(X[b]) ? i : b), zz.findIndex(v => v > 0));
  refSign = Math.sign(X[ref]) || 1;
  let sol = newton(X, n + 1, Math.log(P0));
  if (!sol) throw fail("NO_CONVERGENCE", `Phase envelope: the starting dew point at ${P0} kPa did not converge.`);
  X = sol.X;

  const pts = [{ X: X.slice() }];
  let s = n + 1, dS = 0.05, notes = [], complete = false;
  const sign0 = refSign;
  let bubMin = { P: Infinity, T: null };
  while (pts.length < maxPoints) {
    // sensitivities at the current point: J dX/dS = e_(n+2)
    const e = new Array(N).fill(0); e[n + 1] = 1;
    const J = sol.J.map(r => r.slice()); J[n + 1] = new Array(N).fill(0); J[n + 1][s] = 1;
    const dX = solveLinear(J, e);
    if (!dX) { notes.push("The line stops where its equations become singular."); break; }
    // the fastest-changing unknown becomes the specified one (steps in it keep their direction along the line);
    // near the critical point (every ln K small) the largest ln K, whatever changes fastest: with T or P specified
    // there, Newton can wander towards the trivial solution K = 1 (thermopack's saturation_curve.f90 does the same)
    const lnKmax = Math.max(...X.slice(0, n).map(Math.abs));
    const nearCrit = lnKmax < 0.1;
    const ns = nearCrit ? X.slice(0, n).reduce((b, v, k) => (Math.abs(v) > Math.abs(X[b]) ? k : b), 0)
      : dX.reduce((b, v, k) => (Math.abs(v) > Math.abs(dX[b]) ? k : b), 0);
    if (ns !== s) { dS *= dX[ns] / dX[s]; s = ns; }
    const Js = sol.J.map(r => r.slice()); Js[n + 1] = new Array(N).fill(0); Js[n + 1][s] = 1;
    const dXs = solveLinear(Js, e);
    if (!dXs) { notes.push("The line stops where its equations become singular."); break; }
    const heading = nearCrit && s < n && Math.sign(dS) !== Math.sign(X[s]);
    if (heading && Math.abs(X[s]) <= 0.03) {
      // close to the critical point: the step over it, to the mirror point where this ln K has the other sign
      dS = -2 * X[s];
    } else {
      // (heading for it from farther: no closer than 0.025 in this ln K, so that the next step is the jump)
      if (heading) dS = Math.sign(dS) * Math.min(Math.abs(dS), Math.abs(X[s]) - 0.025);
      // a step of at most 0.25 in ln K, 0.02 in ln T (2 %) and 0.1 in ln P (10 %), so that the line drawn and read
      // between its points stays within about 0.05 K of the equations near the cricondentherm
      const lims = dXs.map((v, k) => (k < n ? 0.25 : k === n ? 0.02 : 0.1) / Math.max(Math.abs(v), 1e-300));
      const lim = Math.min(...lims);
      if (Math.abs(dS) > lim) dS = Math.sign(dS) * lim;
    }
    let next = null;
    // a jump over the critical point that fails lands further on the other side (3, 5, 9 times the remaining ln K),
    // before the step is halved: close to the critical point Newton cannot creep up to it
    const jump = heading && Math.abs(X[s]) <= 0.03;
    const farther = jump ? [3, 5, 9].map(f => -f * X[s]) : [];
    for (let tries = 0; tries < 16 && !next; tries++) {
      // the first try of a jump starts from the mirror point (every ln K negated, the same T and P), as thermopack's
      // change of formulation: near the critical point the line is symmetric to first order, while the sensitivities
      // of T and P can be too large for the linear prediction
      const guess = jump && tries === 0 ? X.map((v, k) => (k < n ? -v : v)) : X.map((v, k) => v + dXs[k] * dS);
      next = newton(guess, s, X[s] + dS);
      // a point far from its prediction has jumped to another part of the line (as thermopack's "excessive jump"):
      // refused, and the step halved
      if (next && (Math.abs(next.X[n] - guess[n]) > 0.02 + 0.5 * Math.abs(guess[n] - X[n]) || Math.abs(next.X[n + 1] - guess[n + 1]) > 0.05 + 0.5 * Math.abs(guess[n + 1] - X[n + 1]))) next = null;
      if (!next) dS = farther.length ? farther.shift() : dS / 2;
    }
    if (!next) { notes.push(`The line stops at ${(+Math.exp(X[n]).toFixed(2))} K, ${+Math.exp(X[n + 1]).toPrecision(5)} kPa, where the steps could not continue.`); break; }
    X = next.X; sol = next;
    pts.push({ X: X.slice() });
    if (next.it <= 3) dS *= 1.5; else if (next.it > 6) dS /= 1.5;
    // back down at the starting pressure: on the other side of the critical point the line is closed; on the same
    // side it has turned back (a dew curve that returns to low pressure), and it stops there, said
    if (Math.exp(X[n + 1]) < P0 * 0.999) {
      if (Math.sign(X[ref]) !== sign0) complete = true;
      else notes.push("The dew curve returns below the starting pressure before the critical point; the line stops there.");
      break;
    }
    if (Math.exp(X[n]) < 20) { notes.push("The bubble curve is followed down to 20 K."); complete = true; break; }
    // a bubble curve that turns back up: with light gases (hydrogen, helium) the bubble pressure has a lowest point and
    // rises again as the temperature falls, since they dissolve less in the cold liquid; the line ends there
    if (Math.sign(X[ref]) !== sign0) {
      const P = Math.exp(X[n + 1]);
      if (P < bubMin.P) bubMin = { P, T: Math.exp(X[n]) };
      else if (P > 3 * bubMin.P && X[n] < pts.at(-2).X[n]) {
        notes.push(`The bubble pressure is lowest at ${+bubMin.T.toFixed(1)} K, ${+bubMin.P.toPrecision(3)} kPa and rises again as the temperature falls (light gases such as hydrogen and helium dissolve less in the cold liquid): the bubble curve is drawn to three times that pressure and does not return to the starting pressure.`);
        complete = true; break;
      }
    }
    if (Math.exp(X[n + 1]) > 1e6) { notes.push("The line stops above 1000 MPa."); break; }
  }
  if (pts.length >= maxPoints) notes.push(`The line stops after ${maxPoints} points.`);

  const points = pts.map(p => ({ T_K: Math.exp(p.X[n]), P_kPa: Math.exp(p.X[n + 1]), branch: Math.sign(p.X[ref]) === sign0 ? "dew" : "bubble", lnKref: p.X[ref] }));
  // the critical point: where ln K_ref passes zero, cubic interpolation in it between the points around the crossing
  // (near the critical point every ln K is linear along the line). Solving the equations themselves at ln K_ref = 0
  // +- 0.001 does not converge: so close to the critical point the Jacobian with ln K specified is nearly singular.
  let critical = null;
  const k = points.findIndex((p, i) => i > 0 && p.branch !== points[i - 1].branch);
  if (k > 0) {
    const idx = [k - 2, k - 1, k, k + 1].filter(i => i >= 0 && i < points.length);
    const lag = key => idx.reduce((acc, i) => {
      let w = 1;
      for (const j of idx) if (j !== i) w *= (0 - points[j].lnKref) / (points[i].lnKref - points[j].lnKref);
      return acc + w * Math.log(points[i][key]);
    }, 0);
    critical = { T_K: Math.exp(lag("T_K")), P_kPa: Math.exp(lag("P_kPa")) };
  } else notes.push("No critical point on the line traced.");
  const peak = key => {
    let i = points.reduce((b, p, j) => (p[key] > points[b][key] ? j : b), 0);
    if (i === 0 || i === points.length - 1) return { T_K: points[i].T_K, P_kPa: points[i].P_kPa };
    // a parabola through the three points around the highest: its top
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const other = key === "P_kPa" ? "T_K" : "P_kPa";
    const t = [-1, 0, 1], v = [a[key], b[key], c[key]], w = [a[other], b[other], c[other]];
    const A2 = (v[0] + v[2] - 2 * v[1]) / 2, A1 = (v[2] - v[0]) / 2;
    const u = A2 < 0 ? Math.max(-1, Math.min(1, -A1 / (2 * A2))) : 0;
    const top = v[1] + A1 * u + A2 * u * u;
    const W2 = (w[0] + w[2] - 2 * w[1]) / 2, W1 = (w[2] - w[0]) / 2;
    const o = w[1] + W1 * u + W2 * u * u;
    return key === "P_kPa" ? { T_K: o, P_kPa: top } : { T_K: top, P_kPa: o };
  };
  // the critical point lies on the line: the highest pressure and temperature are at least its own (near-ideal
  // mixtures have the cricondenbar within the interpolation error of the critical point)
  let cricondenbar = peak("P_kPa"), cricondentherm = peak("T_K");
  if (critical && critical.P_kPa > cricondenbar.P_kPa) cricondenbar = { ...critical };
  if (critical && critical.T_K > cricondentherm.T_K) cricondentherm = { ...critical };
  return { points: points.map(({ T_K, P_kPa, branch }) => ({ T_K, P_kPa, branch })), critical, cricondenbar, cricondentherm, complete, notes };
}
