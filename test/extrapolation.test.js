// Records used outside their range: continued with a warning, or refused in the strict range mode (the maintainer,
// 2026-11-13; docs/decisions/2026-11-13-03-extrapolation-policy.md; src/util/ranges.js, src/thermo/correlations.js).
// Each continuation form is checked against an independent calculation made here: the record's equation written out
// in the test (DIPPR forms of the ChemSep documentation) and its slope at the end taken analytically or by a central
// difference inside the record, not the engine's one-sided step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pure, system, solveFlowsheet, withRangePolicy, collectExtrapolations } from "../src/index.js";
import { evaluate } from "../src/thermo/correlations.js";
import { run } from "../src/api/dispatcher.js";
import { mergeExtrapolations } from "../src/util/ranges.js";

const components = JSON.parse(readFileSync(new URL("../src/data/components.json", import.meta.url))).components;
const strictly = fn => withRangePolicy({ strictRanges: true }, fn);
const rel = (a, b) => Math.abs(a / b - 1);
const co = r => ({ A: 0, B: 0, C: 0, D: 0, E: 0, ...r.coefficients });
// the DIPPR forms, written out independently of correlations.js
const eq100 = (r, T) => { const c = co(r); return c.A + c.B * T + c.C * T ** 2 + c.D * T ** 3 + c.E * T ** 4; };
const eq101 = (r, T) => { const c = co(r); return Math.exp(c.A + c.B / T + c.C * Math.log(T) + c.D * T ** c.E); };
const eq106 = (r, T) => { const c = co(r), t = T / r.Tc_K; return c.A * (1 - t) ** (c.B + c.C * t + c.D * t * t + c.E * t ** 3); };
const eq107 = (r, T) => { const c = co(r); const s = (c.C / T) / Math.sinh(c.C / T), h = (c.E / T) / Math.cosh(c.E / T); return c.A + c.B * s * s + c.D * h * h; };
const dcentral = (f, x, d = 1e-4) => (f(x + d) - f(x - d)) / (2 * d);

test("heat capacity (DIPPR100): linear from the record's end, through its value and slope (derivative of the polynomial)", () => {
  const r = components.benzene.properties.liquidHeatCapacity, b = pure("benzene");
  const c = co(r), slope = T => c.B + 2 * c.C * T + 3 * c.D * T ** 2 + 4 * c.E * T ** 3;
  for (const [T, end] of [[250, r.Tmin_K], [540, r.Tmax_K]]) {
    const got = collectExtrapolations(() => b.property("liquidHeatCapacity", T));
    const want = eq100(r, end) + slope(end) * (T - end);
    assert.ok(rel(got.value, want) < 1e-5, `${T} K: ${got.value} vs ${want}`);
    assert.match(got.extrapolations[0].message, /^Benzene: liquid heat capacity at \d+ K is [\d.]+ K (below|above) its range \(278\.68-521\.14 K\): the value is continued linearly/);
  }
});

test("liquid viscosity (DIPPR101): ln mu linear in 1/T from the end (Arrhenius), the slope d ln mu / d(1/T) taken analytically", () => {
  const r = components.benzene.properties.liquidViscosity, c = co(r), b = pure("benzene");
  // d ln mu / d(1/T) = -T^2 d ln mu / dT, d ln mu / dT = -B/T^2 + C/T + D E T^(E-1)
  const s = T => -T * T * (-c.B / T ** 2 + c.C / T + c.D * c.E * T ** (c.E - 1));
  const end = r.Tmin_K, T = 260;
  const want = Math.exp(Math.log(eq101(r, end)) + s(end) * (1 / T - 1 / end));
  assert.ok(rel(b.property("liquidViscosity", T), want) < 1e-4, `${b.property("liquidViscosity", T)} vs ${want}`);
});

test("vapour pressure: the record's own equation where it stays finite and rising; else Clausius-Clapeyron from its end", () => {
  // benzene below its record: the equation rises with T, so it is the equation itself
  const b = pure("benzene"), vp = components.benzene.vapourPressure;
  const rec = { equation: "DIPPR101", coefficients: { A: vp.A, B: vp.B, C: vp.C, D: vp.D, E: vp.E } };
  assert.ok(rel(b.psat(270), eq101(rec, 270) / 1000) < 1e-12);
  // a made-up record whose equation turns over beyond its end (D T^E with D < 0 overtakes): Clausius-Clapeyron there,
  // its slope d ln P / d(1/T) at the end computed here by a central difference inside the curve
  const turn = { equation: "DIPPR101", units: "Pa", coefficients: { A: 20, B: -3000, C: 0, D: -1e-6, E: 2.5 }, Tmin_K: 250, Tmax_K: 350 };
  const lnP = T => Math.log(eq101(turn, T));
  assert.ok(lnP(600) < lnP(590), "the test record turns over below 600 K");
  const s = dcentral(u => lnP(1 / u), 1 / 350, 1e-9);
  const got = collectExtrapolations(() => evaluate(turn, 600, { component: "X", property: "Vapour pressure", kind: "vapourPressure" }));
  assert.ok(rel(got.value, Math.exp(lnP(350) + s * (1 / 600 - 1 / 350))) < 1e-3, `${got.value}`);
  assert.match(got.extrapolations[0].message, /Clausius-Clapeyron/);
  // above the critical temperature it is not continued by Clausius-Clapeyron: refused
  assert.throws(() => evaluate(turn, 600, { kind: "vapourPressure", Tc_K: 500 }), e => e.code === "OUT_OF_RANGE" && /critical temperature/.test(e.message));
});

test("heat of vaporization (DIPPR106) and ideal-gas heat capacity (DIPPR107, Aly-Lee): the record's own equation", () => {
  const t = pure("toluene"), h = components.toluene.properties.heatOfVaporization, g = components.toluene.properties.idealGasHeatCapacity;
  assert.ok(rel(t.property("heatOfVaporization", 170), eq106(h, 170)) < 1e-12);
  assert.ok(rel(t.property("heatOfVaporization", 580), eq106(h, 580)) < 1e-12);
  assert.ok(rel(t.property("idealGasHeatCapacity", 900), eq107(g, 900)) < 1e-12);
  // at its critical temperature the heat of vaporization has no value
  assert.throws(() => t.property("heatOfVaporization", 600), e => e.code === "OUT_OF_RANGE");
});

test("a continuation that becomes non-physical is refused, not returned", () => {
  // cp = -200 + T: 100 J/(mol K) at the record's start (300 K), continued linearly it reaches 0 at 200 K
  const r = { equation: "DIPPR100", units: "J/mol/K", coefficients: { A: -200, B: 1 }, Tmin_K: 300, Tmax_K: 400 };
  assert.ok(Math.abs(evaluate(r, 250) - 50) < 1e-9);
  assert.throws(() => evaluate(r, 150), e => e.code === "OUT_OF_RANGE" && /not physical/.test(e.message));
});

test("the strict range mode refuses every continued record, and the default is lenient", () => {
  const b = pure("benzene");
  assert.ok(Number.isFinite(b.property("liquidHeatCapacity", 250)));
  assert.throws(() => strictly(() => b.property("liquidHeatCapacity", 250)), e => e.code === "OUT_OF_RANGE" && /outside the range/.test(e.message));
  assert.ok(Number.isFinite(b.property("liquidHeatCapacity", 250)), "the policy is restored after the strict call");
});

test("notes are kept once per component, property and side, at the farthest distance, with the places", () => {
  const got = collectExtrapolations(() => { for (const T of [270, 260, 265]) pure("benzene").property("liquidHeatCapacity", T); });
  assert.equal(got.extrapolations.length, 1);
  assert.equal(got.extrapolations[0].at, 260);
  const m = mergeExtrapolations([{ where: "H1", notes: got.extrapolations }, { where: "H2", notes: got.extrapolations.map(n => ({ ...n, at: 255, distance: 23.68 })) }]);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].where, ["H1", "H2"]);
  assert.equal(m[0].at, 255);
  assert.match(m[0].short, /^Benzene: liquid heat capacity extrapolated 23\.68 K below its range$/);
  assert.match(m[0].message, /Where: H1, H2\.$/);
});

// a cold benzene + toluene feed (NRTL, METHOD_SELECTION.md: a near-ideal hydrocarbon pair, any activity model) cooled
// below benzene's liquid heat-capacity record (278.68 K) in a heater
const coldSheet = solver => ({ blocks: [
  { id: "F1", type: "feed", spec: { flow_kmol_h: [5, 5], T_K: 300, P_kPa: 101.325 } },
  { id: "H1", type: "heater", spec: { T_K: 265, P_kPa: 101.325 } },
  { id: "H2", type: "heater", spec: { T_K: 260, P_kPa: 101.325 } },
  { id: "P1", type: "product" }],
streams: [{ id: "S1", from: "F1.out", to: "H1.in" }, { id: "S2", from: "H1.out", to: "H2.in" }, { id: "S3", from: "H2.out", to: "P1.in" }],
...(solver ? { solver } : {}) });

test("a flowsheet gathers its extrapolations once per component and property, with the farthest distance and the blocks", () => {
  const sys = system({ components: ["benzene", "toluene"], model: "NRTL" });
  const r = solveFlowsheet(sys, coldSheet());
  const cp = r.extrapolations.filter(e => e.component === "Benzene" && e.property === "Liquid heat capacity");
  assert.equal(cp.length, 1, JSON.stringify(r.extrapolations.map(e => e.short)));
  assert.equal(cp[0].at, 260);
  assert.deepEqual(cp[0].where, ["H1", "H2"]);
  assert.match(cp[0].message, /^Benzene: liquid heat capacity at 260 K is 18\.68 K below its range \(278\.68-521\.14 K\).*Where: H1, H2\.$/);
  // solver.strictRanges: the refusals of before 2026-11-13
  assert.throws(() => solveFlowsheet(sys, coldSheet({ strictRanges: true })), e => e.code === "OUT_OF_RANGE");
  assert.throws(() => solveFlowsheet(sys, coldSheet({ strictRanges: "yes" })), e => e.code === "BAD_INPUT");
});

test("the request option strictRanges of CHEPTA.run", () => {
  const flowsheet = { components: ["benzene", "toluene"], thermo: { model: "NRTL" }, ...coldSheet() };
  const ok = run({ capability: "solve_flowsheet", input: { flowsheet } });
  assert.equal(ok.outcome, "ok", ok.error?.message);
  assert.ok(ok.value.extrapolations.length >= 1);
  const strict = run({ capability: "solve_flowsheet", options: { strictRanges: true }, input: { flowsheet } });
  assert.equal(strict.outcome, "invalid_input");
  assert.equal(strict.error.code, "OUT_OF_RANGE");
  assert.equal(run({ capability: "solve_flowsheet", options: { strict: true }, input: { flowsheet } }).error.code, "BAD_INPUT");
});
