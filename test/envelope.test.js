// The phase envelope of a mixture with an equation of state (src/equilibrium/envelope.js; proposal 0013, step 7):
// against CoolProp 8.0.0's Peng-Robinson (validation/python/reference_envelope.py, validation/fixtures/envelope.json,
// k_ij = 0 on both sides, so the algorithm is compared, not the parameters), and against the measured dew points of
// three natural gases (Zhang et al., ACS Omega 5 (2020) 8463, validation/data/envelope/zhang2020_natural_gas.json), with
// CHEPTA's own k_ij.
// Method (docs/METHOD_SELECTION.md): light hydrocarbons, nitrogen and CO2 at pressure: Peng-Robinson or SRK.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, phaseEnvelope } from "../src/index.js";

const ref = JSON.parse(readFileSync(new URL("../validation/fixtures/envelope.json", import.meta.url), "utf8"));
const zhang = JSON.parse(readFileSync(new URL("../validation/data/envelope/zhang2020_natural_gas.json", import.meta.url), "utf8"));
const zeros = n => Array.from({ length: n }, () => new Array(n).fill(0));
/** Distance from point p to segment a-b (in ln T, ln P). */
const seg = (p, a, b) => {
  const ax = b[0] - a[0], ay = b[1] - a[1], L = ax * ax + ay * ay;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * ax, p[1] - a[1] - t * ay);
};
const lnTP = p => [Math.log(p.T_K), Math.log(p.P_kPa)];
/** The temperatures where a branch of the line crosses pressure P (linear in ln P). */
function crossings(points, P) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if ((a.P_kPa - P) * (b.P_kPa - P) <= 0 && a.P_kPa !== b.P_kPa) {
      const t = (Math.log(P) - Math.log(a.P_kPa)) / (Math.log(b.P_kPa) - Math.log(a.P_kPa));
      out.push(a.T_K + t * (b.T_K - a.T_K));
    }
  }
  return out;
}

test("methane + n-butane: the whole line, its critical point and cricondenbar as CoolProp's Peng-Robinson", () => {
  const c = ref.cases.find(x => x.name === "methane + n-butane");
  const sys = system({ components: c.components, model: "PR", kij: zeros(2) });
  const r = phaseEnvelope(sys, c.z);
  assert.equal(r.complete, true, r.notes.join(" "));
  assert.equal(r.points[0].branch, "dew");
  assert.equal(r.points.at(-1).branch, "bubble");
  // every CoolProp point above the starting pressure lies on CHEPTA's line (0.4 % in T or P)
  const mine = r.points.map(lnTP);
  for (const [T, P] of c.points.filter(([, P]) => P > 55)) {
    const d = Math.min(...mine.slice(1).map((q, i) => seg([Math.log(T), Math.log(P)], mine[i], q)));
    assert.ok(d < 0.004, `CoolProp point ${T} K, ${P} kPa is ${d} from the line`);
  }
  const cp = c.critical[0];
  assert.ok(Math.abs(r.critical.T_K - cp.T_K) < 0.05 && Math.abs(r.critical.P_kPa / cp.P_kPa - 1) < 1e-3, JSON.stringify(r.critical));
  assert.ok(Math.abs(r.cricondenbar.T_K - c.cricondenbar.T_K) < 0.2 && Math.abs(r.cricondenbar.P_kPa / c.cricondenbar.P_kPa - 1) < 1e-4, JSON.stringify(r.cricondenbar));
  assert.ok(Math.abs(r.cricondentherm.T_K - c.cricondentherm.T_K) < 0.05, JSON.stringify(r.cricondentherm));
});

test("a natural gas of ten components: bubble and dew temperatures as CoolProp's saturation solver, the critical point where they meet", () => {
  const c = ref.cases.find(x => x.name.startsWith("natural gas SNG27"));
  const sys = system({ components: c.components, model: "PR", kij: zeros(c.components.length) });
  const r = phaseEnvelope(sys, c.z);
  assert.equal(r.complete, true, r.notes.join(" "));
  const dew = r.points.filter(p => p.branch === "dew"), bub = r.points.filter(p => p.branch === "bubble");
  // (the dew flash at 7000 kPa is left out: CoolProp's Q = 1 there converges at 219.4 K, next to the bubble point at
  // 218.8 K, where no dew point can be: the dew curve comes below 7000 kPa only at 270.5 K, since the critical
  // point is above 7600 kPa)
  for (const f of c.flashes.filter(x => x.P_kPa <= (x.Q ? 6000 : 7000))) {
    const Ts = crossings(f.Q === 0 ? bub : dew, f.P_kPa);
    assert.ok(Ts.length, `no ${f.Q ? "dew" : "bubble"} point at ${f.P_kPa} kPa`);
    const d = Math.min(...Ts.map(T => Math.abs(T - f.T_K)));
    // dew temperatures 0.04-0.06 K above CoolProp's; bubble temperatures within 0.003 K
    assert.ok(d < (f.Q ? 0.1 : 0.01), `${f.Q ? "dew" : "bubble"} at ${f.P_kPa} kPa: ${Ts} against ${f.T_K}`);
  }
  // CoolProp's flashes: the bubble temperature below the dew temperature at 7600 kPa and above it at 7700 kPa, so the
  // critical point lies between (its separate critical-point solver gives 7724 kPa, 0.2 K off its own flashes)
  const at = (P, Q) => c.flashes.find(x => x.P_kPa === P && x.Q === Q).T_K;
  assert.ok(at(7600, 0) < at(7600, 1) && at(7700, 0) > at(7700, 1));
  assert.ok(r.critical.P_kPa > 7600 && r.critical.P_kPa < 7700, JSON.stringify(r.critical));
  assert.ok(Math.abs(r.cricondenbar.P_kPa / c.cricondenbar.P_kPa - 1) < 2e-3 && Math.abs(r.cricondenbar.T_K - c.cricondenbar.T_K) < 0.5, JSON.stringify(r.cricondenbar));
});

test("four natural gases: the dew curve against the measured dew points, with CHEPTA's k_ij (Zhang et al. 2020)", () => {
  // the paper's own averages for these gases (Tables 4 and 5): Peng-Robinson 4.66, 3.41, 3.45 K and 1.58 K (RG14);
  // SRK 2.81, 1.93, 1.41 K and 2.12 K
  const found = {};
  for (const m of zhang.mixtures.filter(x => x.chepta_mole_fractions)) {
    const ids = Object.keys(m.chepta_mole_fractions), z = Object.values(m.chepta_mole_fractions);
    for (const model of ["PR", "SRK"]) {
      const r = phaseEnvelope(system({ components: ids, model }), z);
      assert.equal(r.complete, true, `${m.id} ${model}: ${r.notes.join(" ")}`);
      const dew = r.points.filter(p => p.branch === "dew");
      const dev = m.dew_points.rows.map(([P_MPa, T_C]) => {
        const Ts = crossings(dew, P_MPa * 1000);
        return Ts.length ? Math.min(...Ts.map(T => Math.abs(T - (T_C + 273.15)))) : null;
      }).filter(v => v != null);
      found[`${m.id} ${model}`] = dev.reduce((a, v) => a + v, 0) / dev.length;
      // most measured points lie at a pressure the calculated dew curve reaches (above the cricondenbar it does not)
      assert.ok(dev.length >= m.dew_points.rows.length - 5, `${m.id} ${model}: ${dev.length} of ${m.dew_points.rows.length}`);
    }
  }
  // what CHEPTA gives (2026-10-21; neopentane, helium and methylcyclohexane in the databank): PR 4.61, 3.14, 3.24, 2.72 K;
  // SRK 2.47, 1.82, 1.79, 1.26 K: held to 5 K (PR) and 3 K (SRK)
  for (const [k, v] of Object.entries(found)) assert.ok(v < (k.endsWith("PR") ? 5 : 3), `${k}: mean deviation ${v} K`);
});

test("refused with the reason: an activity model, one component", () => {
  // (NRTL on ethanol + water on purpose: the envelope refuses an activity model)
  assert.throws(() => phaseEnvelope(system({ components: ["ethanol", "water"], model: "NRTL" }), [0.5, 0.5]), /needs an equation of state/);
  assert.throws(() => phaseEnvelope(system({ components: ["methane"], model: "PR" }), [1]), /two components or more/);
  assert.throws(() => phaseEnvelope(system({ components: ["methane", "ethane"], model: "PR" }), [0.5]), /Give 2 mole fractions/);
});
