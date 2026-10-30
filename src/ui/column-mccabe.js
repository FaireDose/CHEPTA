/**
 * McCabe-Thiele's construction for a binary column (the Column workspace, proposal 0015 step 4, milestone M2b), DOM-free.
 *
 * The construction as The ChemSep Book, 2nd ed. (H. A. Kooijman, R. Taylor, 2006; public domain), section 1.3.3,
 * pp. 26-31, writes it (eqs. 1.8 to 1.17):
 *   - the equilibrium curve y*(x) of the light component, here from CHEPTA's own property method: the bubble point of
 *     the liquid x at the column's pressure (anyBubbleT), not a constant relative volatility;
 *   - the q-line z = q x + (1 − q) y (eq. 1.9), q the feed's liquid fraction (eq. 1.17: q > 1 subcooled, q < 0
 *     superheated);
 *   - the rectifying line y = R/(R + 1) x + x_D/(R + 1) (eq. 1.15), and the stripping line through (x_B, x_B) and the
 *     point where the rectifying line meets the q-line (eq. 1.16), constant molar overflow assumed;
 *   - the stages stepped off from (x_D, x_D) down to x_B, each a horizontal step to the equilibrium curve and a vertical
 *     one to the operating line, changing to the stripping line at the first step past the lines' intersection (the
 *     best feed stage);
 *   - the minimum reflux where an operating line touches the equilibrium curve (the "pinch-point", p. 31): at the
 *     q-line's intersection with the curve, or, for a curve that bends towards the diagonal (ethanol + water), where a
 *     line from (x_D, x_D) or (x_B, x_B) is tangent to it;
 *   - the minimum number of stages at total reflux (both lines on the diagonal).
 *
 * Stage counting as the column block's (docs/models/columns.md): a total condenser is not an equilibrium stage, a
 * partial one is; the reboiler is. `steps` counts the equilibrium stages stepped off (the reboiler and a partial
 * condenser included), so the rigorous column's stages are steps + 1 with a total condenser and steps with a partial
 * one, and the shortcut's N is steps.
 *
 * A view helper (layer 6): every equilibrium point comes from the engine; this file only intersects lines.
 */
import { anyBubbleT } from "../equilibrium/bubble-any.js";
import { stream } from "../stream/stream.js";

const EPS = 1e-9;

/** The equilibrium curve: y*(x) of component `i` of a binary at P, by the bubble point of each liquid. */
export function equilibriumCurve(sys, i, P_kPa, n = 101) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const x = k / (n - 1);
    const xs = i === 0 ? [x, 1 - x] : [1 - x, x];
    const r = anyBubbleT(sys, xs, P_kPa);
    pts.push({ x, y: r.y[i], T_K: r.T });
  }
  return pts;
}

/** y*(x) from the curve, refined by the bubble point itself (so stepping does not carry the grid's error). */
function eqY(sys, i, P, x) {
  const xs = i === 0 ? [x, 1 - x] : [1 - x, x];
  return anyBubbleT(sys, xs, P).y[i];
}

/** x on the curve with y*(x) = y: bracketed on the grid, then bisection on the bubble point. */
function eqX(sys, i, P, curve, y) {
  let k = curve.findIndex(p => p.y >= y);
  if (k < 0) return null;
  if (k === 0) return 0;
  let a = curve[k - 1].x, b = curve[k].x;
  for (let it = 0; it < 40 && b - a > 1e-12; it++) {
    const m = (a + b) / 2;
    if (eqY(sys, i, P, m) < y) a = m; else b = m;
  }
  return (a + b) / 2;
}

/** The feed's liquid fraction q from its enthalpy between its saturated liquid and vapour at P (as the shortcut). */
export function feedQuality(sys, feed, P_kPa) {
  const hL = stream(sys, { flow_kmol_h: feed.flows, P_kPa, VF: 0 }).H_kW;
  const hV = stream(sys, { flow_kmol_h: feed.flows, P_kPa, VF: 1 }).H_kW;
  return (hV - feed.H_kW) / (hV - hL);
}

/** Where y = m x + c meets the q-line z = q x + (1 − q) y. */
function onQLine(m, c, z, q) {
  const x = (z - (1 - q) * c) / (q + (1 - q) * m);
  return { x, y: m * x + c };
}

/**
 * The construction. x_D, x_B, z: mole fractions of the light component; q: the feed's liquid fraction; R: the reflux
 * ratio L/D; curve: equilibriumCurve(); partial: a partial condenser (its first step is a stage of the column);
 * feedStage: the column's feed stage, numbered from the top (default: the best one, where the lines meet).
 * Throws, saying why, where the construction does not hold (a reflux at or below the minimum, an azeotrope between the
 * products, a product purer than the curve reaches).
 */
export function mccabeThiele({ sys, i, P_kPa, xD, xB, z, q, R, curve, partial = false, feedStage = null, maxSteps = 200 }) {
  if (!(xD > z && z > xB)) throw new Error(`McCabe-Thiele: the light component must be richer in the distillate than in the feed, and in the feed than in the bottoms (x_D ${fmt(xD)}, z ${fmt(z)}, x_B ${fmt(xB)}).`);
  if (!(R > 0)) throw new Error("McCabe-Thiele: the reflux ratio must be above 0.");
  // the equilibrium curve must stay above the diagonal between the products: otherwise an azeotrope lies between them
  const inside = curve.filter(p => p.x > xB + EPS && p.x < xD - EPS);
  const azeo = inside.find(p => p.y <= p.x);
  if (azeo) throw new Error(`McCabe-Thiele: the equilibrium curve meets the diagonal near x = ${fmt(azeo.x)} (an azeotrope) between the bottoms and the distillate, so no column reaches these products.`);
  const m = R / (R + 1), c = xD / (R + 1);
  const cross = onQLine(m, c, z, q);   // where the operating lines meet
  const s = (cross.y - xB) / (cross.x - xB);
  const rect = { x0: cross.x, y0: cross.y, x1: xD, y1: xD, slope: m };
  const strip = { x0: xB, y0: xB, x1: cross.x, y1: cross.y, slope: s };
  const pinch = minimumReflux({ sys, i, P_kPa, xD, xB, z, q, curve });
  if (R <= pinch.R_min * (1 + 1e-9)) {
    throw new Error(`McCabe-Thiele: the reflux ratio ${fmt(R)} is at or below the minimum, ${fmt(pinch.R_min)} (the operating lines touch the equilibrium curve at x = ${fmt(pinch.x)}): give a larger reflux.`);
  }
  // the operating line at x: rectifying above the lines' intersection, stripping below
  const steps = [];
  let x = xD, y = xD, feedStep = null, stripping = false;
  for (let k = 1; k <= maxSteps; k++) {
    const xn = eqX(sys, i, P_kPa, curve, y);
    if (xn == null) throw new Error(`McCabe-Thiele: no liquid on the equilibrium curve is in equilibrium with y = ${fmt(y)}.`);
    const step = { stage: k, x_from: x, y, x: xn };
    if (xn <= xB + EPS) {
      step.fraction = (x - xB) / (x - xn);
      steps.push(step);
      return { steps, stages: k - 1 + step.fraction, whole: k, feedStep: feedStep ?? k, rectifying: rect, stripping: strip, cross, pinch, total: totalReflux({ sys, i, P_kPa, xD, xB, curve }) };
    }
    // the best feed stage: the first step past the lines' intersection; or the column's own feed stage (numbered from
    // the top, 1 the condenser: step k is stage k + 1 below a total condenser, stage k with a partial one)
    const stage = partial ? k : k + 1;
    if (!stripping && (feedStage != null ? stage >= feedStage : xn < cross.x)) { stripping = true; feedStep = k; }
    const yn = stripping ? xB + s * (xn - xB) : m * xn + c;
    step.y_next = yn;
    steps.push(step);
    x = xn; y = yn;
  }
  throw new Error(`McCabe-Thiele: more than ${maxSteps} stages: the reflux is too close to the minimum (${fmt(pinch.R_min)}) for this drawing.`);
}

/** Minimum reflux: the steepest rectifying line that still meets the curve only at or beyond the pinch. */
export function minimumReflux({ sys, i, P_kPa, xD, xB, z, q, curve }) {
  // where the q-line meets the curve: z = q x + (1 − q) y*(x), bracketed on the grid nearest the feed, then bisection
  const g = x => q * x + (1 - q) * eqY(sys, i, P_kPa, x) - z;
  const gs = curve.map(p => q * p.x + (1 - q) * p.y - z);
  let best = null;
  for (let k = 1; k < curve.length; k++) {
    if (gs[k - 1] * gs[k] <= 0 && (best == null || Math.abs(curve[k].x - z) < Math.abs(curve[best].x - z))) best = k;
  }
  if (best == null) throw new Error("McCabe-Thiele: the q-line does not meet the equilibrium curve.");
  let a = curve[best - 1].x, b = curve[best].x, ga = gs[best - 1];
  for (let it = 0; it < 40 && b - a > 1e-12; it++) {
    const mid = (a + b) / 2, gm = g(mid);
    if (ga * gm <= 0) b = mid; else { a = mid; ga = gm; }
  }
  const xq = (a + b) / 2, yq = eqY(sys, i, P_kPa, xq);
  // the rectifying line through (x_D, x_D) must stay on or under the curve between x_q and x_D
  let mR = (xD - yq) / (xD - xq), at = { x: xq, y: yq, kind: "feed" };
  for (const p of curve) {
    if (p.x <= xq || p.x >= xD - 1e-6) continue;
    const mm = (xD - p.y) / (xD - p.x);
    if (mm > mR) { mR = mm; at = { x: p.x, y: p.y, kind: "tangent" }; }
  }
  // the stripping line through (x_B, x_B) must stay under the curve between x_B and x_q: its largest slope
  let sMax = (yq - xB) / (xq - xB), sAt = null;
  for (const p of curve) {
    if (p.x <= xB + 1e-6 || p.x >= xq) continue;
    const ss = (p.y - xB) / (p.x - xB);
    if (ss < sMax) { sMax = ss; sAt = { x: p.x, y: p.y, kind: "tangent" }; }
  }
  if (sAt) {
    // that stripping line meets the q-line; the rectifying line through that point
    const pt = onQLine(sMax, xB * (1 - sMax), z, q);
    const mS = (xD - pt.y) / (xD - pt.x);
    if (mS > mR) { mR = mS; at = sAt; }
  }
  if (!(mR < 1)) throw new Error("McCabe-Thiele: the minimum reflux is infinite (the curve meets the diagonal between the products).");
  return { R_min: mR / (1 - mR), slope: mR, x: at.x, y: at.y, kind: at.kind, x_q: xq, y_q: yq };
}

/** Total reflux: steps between the curve and the diagonal from x_D to x_B (Fenske's limit). */
export function totalReflux({ sys, i, P_kPa, xD, xB, curve, maxSteps = 400 }) {
  let y = xD, x = xD;
  for (let k = 1; k <= maxSteps; k++) {
    const xn = eqX(sys, i, P_kPa, curve, y);
    if (xn == null) return null;
    if (xn <= xB + EPS) return k - 1 + (x - xB) / (x - xn);
    x = xn; y = xn;
  }
  return null;
}

const fmt = v => (Number.isFinite(v) ? +v.toPrecision(4) : String(v));

/**
 * The inputs of the construction from a solved column (the shortcut's or the rigorous column's result) in a flowsheet
 * result: the light component (the shortcut's light key, else the one richer in the distillate), x_D, x_B, z, q, R and
 * P. Returns { ok: false, why } where the construction does not apply (not a binary, one feed only).
 */
export function columnBinary(sys, fs, res, colId) {
  const r = res?.blocks?.[colId];
  if (!r?.state) return { ok: false, why: "Solve the column first." };
  if (sys.ids.length !== 2) return { ok: false, why: `McCabe-Thiele is drawn for two components; this column has ${sys.ids.length}. The profile charts show every component.` };
  const feeds = fs.streams.filter(s => s.to === `${colId}.in`).map(s => res.streams[s.id]).filter(Boolean);
  if (feeds.length !== 1) return { ok: false, why: "McCabe-Thiele is drawn here for a column with one feed." };
  const D = res.streams[fs.streams.find(s => s.from === `${colId}.distillate`)?.id];
  const B = res.streams[fs.streams.find(s => s.from === `${colId}.bottoms`)?.id];
  if (!D || !B) return { ok: false, why: "The column's products are not calculated." };
  const st = r.state, P = st.P_kPa;
  const i = st.light_key ? sys.ids.indexOf(st.light_key) : D.z[0] >= B.z[0] ? 0 : 1;
  const feed = feeds[0];
  const q = st.q ?? feedQuality(sys, feed, P);
  const R = st.mode === "rigorous" ? st.reflux_ratio : st.R;
  return { ok: true, i, P_kPa: P, xD: D.z[i], xB: B.z[i], z: feed.z[i], q, R, partial: st.condenser === "partial" };
}
