// "SRK/PR + gE (MHV1)" (proposal 0018, reopened by the maintainer on 2026-11-06): the MHV1 mixing rule in its PSRK form
// with NRTL (src/thermo/eos/mhv1.js), and its NRTL parameters fitted to the ThermoML high-pressure data
// (validation/fit_mhv1_high_pressure.mjs). Method: SRK and PR with a gE mixing rule are the method under test here,
// for gases dissolved in polar liquids at high pressure (docs/METHOD_SELECTION.md).
// The independent checks: validation/python/reference_mhv1.py (CHEPTA's Python cubic with the rule, fugacities by
// numerical differentiation, thermo's NRTL) and thermo's PSRK class for SRK (validation/data/eos/mhv1_check.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system } from "../src/index.js";
import { mhv1A } from "../src/thermo/eos/mhv1.js";
import data from "../src/data/mhv1.json" with { type: "json" };
import known from "../src/data/known-issues.json" with { type: "json" };
import { henry } from "../src/thermo/henry.js";
import { henryOf, written, WARNED } from "../validation/fit_mhv1_high_pressure.mjs";

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const fits = load("validation/data/eos/mhv1_fits.json");
const check = load("validation/data/eos/mhv1_check.json");
const GATE = fits.gate;

const sysOf = (pair, model, q) => system({ components: pair, model,
  mixing: { rule: "MHV1", nrtl: { a: [[0, q.a_ij], [q.a_ji, 0]], b: [[0, q.b_ij], [q.b_ji, 0]], alpha: [[0, q.alpha], [q.alpha, 0]] } } });
const rel = (a, b) => Math.abs(a / b - 1);

test("the PSRK constant A: SRK's is thermo's ln(1.1 / 2.1); PR's comes from the same expression", () => {
  assert.ok(Math.abs(mhv1A(1, 0) - Math.log(1.1 / 2.1)) < 1e-15);
  assert.ok(Math.abs(mhv1A(1 + Math.SQRT2, 1 - Math.SQRT2) + 0.57771) < 1e-5);
});

test("a pure component is the plain cubic: the rule adds nothing without a second component", () => {
  for (const model of ["SRK", "PR"]) {
    // the CO2 + methanol fit of mhv1_fits.json (outside the gate, so not in src/data/mhv1.json)
    const m = sysOf(["carbon-dioxide", "methanol"], model, fits.results.find(r => r.model === model && r.pair.join() === "carbon-dioxide,methanol").NRTL);
    const c = system({ components: ["carbon-dioxide", "methanol"], model, kij: [[0, 0], [0, 0]] });
    for (const x of [[1, 0], [0, 1]]) {
      const a = m.state(300, 1000, x, "liquid"), b = c.state(300, 1000, x, "liquid");
      assert.ok(Math.abs(a.Z - b.Z) < 1e-12 && Math.abs(a.hR_J_mol - b.hR_J_mol) < 1e-6, `${model} ${x}`);
    }
  }
});

test("the engine against the independent references (Python MHV1 cubic; thermo's PSRK for SRK)", () => {
  assert.ok(check.points.length >= 3 * fits.results.length);
  for (const p of check.points.filter(q => q.variant === "henry")) {
    // the rule's Henry's law constant: water's saturation pressure and ln phi of the gas at infinite dilution
    const s = sysOf(p.pair, p.model, p.NRTL), what = `${p.model} ${p.pair.join("-")} T = ${p.T_K} K`;
    assert.ok(rel(s.eos.psat(1, p.T_K), p.P_sat_reference_kPa) < 1e-6, `${what}: P_sat`);
    assert.ok(rel(henryOf(s, p.T_K), p.H_reference_kPa) < 1e-4, `${what}: H ${henryOf(s, p.T_K)} vs ${p.H_reference_kPa} kPa`);
  }
  for (const p of check.points.filter(q => q.variant !== "henry")) {
    const s = sysOf(p.pair, p.model, p.NRTL), x = [p.x_1, 1 - p.x_1], what = `${p.model} ${p.pair.join("-")} T = ${p.T_K} K, x = ${p.x_1}`;
    const P = s.bubbleP(x, p.T_K).P;
    assert.ok(rel(P, p.P_reference_kPa) < 1e-4, `${what}: P ${P} vs ${p.P_reference_kPa} kPa`);
    const st = s.state(p.T_K, p.P_reference_kPa, x, "liquid");
    st.lnPhi.forEach((v, i) => assert.ok(Math.abs(v - p.lnphi_liquid[i]) < 1e-5, `${what}: ln phi_${i} ${v} vs ${p.lnphi_liquid[i]}`));
    assert.ok(Math.abs(st.hR_J_mol - p.hR_liquid_J_mol) < 1e-4 * Math.abs(p.hR_liquid_J_mol) + 0.05, `${what}: h_R ${st.hR_J_mol} vs ${p.hR_liquid_J_mol}`);
    if (p.thermo_psrk) {
      const m = s.eos.mix(p.T_K, x), t = p.thermo_psrk;
      assert.ok(rel(m.a, t.a_alpha) < 1e-6 && rel(m.da, t.da_alpha_dT) < 1e-5 && rel(m.d2a, t.d2a_alpha_dT2) < 1e-4, `${what}: a and its T derivatives against thermo's PSRK`);
      assert.ok(Math.abs(st.Z - t.Z_l) < 1e-6 * t.Z_l, `${what}: Z_L`);
      assert.ok(Math.abs(st.hR_J_mol - t.H_dep_l) < 1e-4 * Math.abs(t.H_dep_l) + 0.05, `${what}: h_R ${st.hR_J_mol} vs thermo ${t.H_dep_l}`);
    }
  }
});

const points = files => files.flatMap(f => load(`validation/data/eos/${f}`).rows
  .filter(r => r[3] != null && r[3] > 0 && r[3] < 1 && r[0] <= fits.window.T_K && (r[1] ?? r[2]) <= fits.window.P_kPa)
  .map(r => ({ T: r[0], P: r[1], p1: r[2], x: r[3] })));

/** The set of a result in src/data/mhv1.json, if it was written there. */
const entryOf = r => data.pairs.find(q => q.model === r.model && q.i === r.pair[0] && q.j === r.pair[1] && q.NRTL.alpha === r.NRTL.alpha && q.NRTL.b_ji === r.NRTL.b_ji);

function checkWritten(r) {
  // written exactly when within the gate, or by the maintainer's decision (WARNED; alpha fitted and better than
  // k_ij = a + b / T), then with a quality warning and a fit-quality known issue; the default system then uses it
  const e = entryOf(r);
  assert.equal(Boolean(e), written(r), `${r.model} ${r.pair} ${r.variant ?? ""}`);
  if (!e) return;
  assert.deepEqual(e.NRTL, r.NRTL);
  assert.equal(Boolean(e.quality_warning), !r.ok);
  if (!r.ok) assert.ok(known.issues.some(k => k.kind === "fit-quality" && k.model === r.model && k.mixing === "MHV1" && k.components.join() === r.pair.join()));
  const d = system({ components: r.pair, model: r.model, mixing: "MHV1" });
  assert.equal(d.info.pairs[0].set, "mhv1-fitted");
  assert.equal(d.info.method, `${r.model} + gE (MHV1)`);
}

for (const r of fits.results.filter(q => q.variant === "henry")) {
  test(`${r.model} + gE (MHV1) ${r.pair.join(" + ")}: the recorded error in H against IAPWS G7-04 (${r.errors.henry_pct.aad} %) is the engine's`, () => {
    const s = sysOf(r.pair, r.model, r.NRTL);
    const d = r.errors.henry_pct.deviations.map((v, k) => [v, 100 * (henryOf(s, 278.15 + 10 * k) / henry(r.pair[0], "water", 278.15 + 10 * k) - 1)]);
    for (const [rec, now] of d) assert.ok(Math.abs(rec - now) < 0.01, `${rec} vs ${now}`);
    assert.equal(r.ok, r.errors.henry_pct.aad <= GATE.P_pct);
    checkWritten(r);
  });
}

for (const r of fits.results.filter(q => q.variant !== "henry")) {
  test(`${r.model} + gE (MHV1) ${r.pair.join(" + ")}${r.variant === "alpha" ? " (alpha fitted)" : ""}: the recorded error in P (${r.errors.pooled.P_pct.aad} %, ${r.ok ? "within" : "outside"} the gate) is the engine's`, () => {
    const s = sysOf(r.pair, r.model, r.NRTL), pts = points(r.files);
    assert.equal(pts.length, r.points);
    const dev = []; let missing = 0;
    for (const p of pts) {
      try { const b = s.bubbleP([p.x, 1 - p.x], p.T); dev.push(Math.abs((p.P != null ? b.P / p.P : b.y[0] * b.P / p.p1) - 1) * 100); } catch { missing++; }
    }
    const aad = dev.reduce((a, v) => a + v, 0) / dev.length;
    assert.equal(missing, r.errors.pooled.no_bubble_pressure);
    assert.ok(Math.abs(aad - r.errors.pooled.P_pct.aad) < 0.1, `AAD ${aad.toFixed(2)} % against ${r.errors.pooled.P_pct.aad} %`);
    assert.equal(r.ok, missing === 0 && r.errors.pooled.P_pct.aad <= GATE.P_pct);
    checkWritten(r);
  });
}

test("the maintainer's answers of 2026-11-07: H2, CO2 and CH4 + methanol written with warnings; CO2 + water's alpha tried; CH4 + water held", () => {
  for (const pair of ["hydrogen+methanol", "carbon-dioxide+methanol", "methane+methanol"]) assert.ok(WARNED[pair], pair);
  const alpha = fits.results.filter(r => r.variant === "alpha");
  assert.equal(alpha.length, 2);
  for (const r of alpha) {
    // written only if it beats k_ij = a + b / T in P and in solubility, with no more points without a bubble pressure
    const t = r.beats_kij_T.against, q = r.errors.pooled;
    assert.equal(r.beats_kij_T.beats, q.P_pct.aad < t.P_pct && q.x_pct.aad <= t.x_pct && q.no_bubble_pressure <= t.no_bubble_pressure);
  }
  // CH4 + water (2026-11-07): fitted to IAPWS G7-04, not to its disputed ThermoML articles, which are kept as a check;
  // Campos et al. (2010) and Kim et al. (2008) are the outliers
  const ch4 = fits.results.filter(r => r.pair.join() === "methane,water");
  assert.ok(ch4.filter(r => !r.variant).every(r => !written(r)), "the ThermoML fit of CH4 + water is not written");
  for (const r of ch4.filter(q => q.variant === "henry")) {
    assert.ok(written(r) && r.check_thermoml.articles.length === 9, r.model);
    const worst = [...r.check_thermoml.articles].sort((u, v) => v.P_pct.aad - u.P_pct.aad).slice(0, 2).map(a => a.cite.split(" ")[0]).sort();
    assert.deepEqual(worst, ["Campos", "Kim"]);
  }
});

test("CHEPTA-Lab's separator (CO2, H2, CO, methanol, water at 313 K and 5 MPa) under PR + gE (MHV1)", () => {
  // the method on purpose: the comparison of docs/decisions/2026-11-06-02-mhv1.md
  const c = ["carbon-dioxide", "hydrogen", "carbon-monoxide", "methanol", "water"], z = [0.2, 0.5, 0.05, 0.15, 0.1];
  const s = system({ components: c, model: "PR", mixing: "MHV1" });
  // every pair has NRTL parameters except the three gas + gas pairs (g^E = 0, with a warning)
  const none = s.info.pairs.filter(p => p.tier === "none").map(p => p.pair.join("+")).sort();
  assert.deepEqual(none, ["Carbon dioxide+Carbon monoxide", "Carbon dioxide+Hydrogen", "Hydrogen+Carbon monoxide"]);
  const r = s.flash({ z, T: 313, P: 5000 });
  const L = r.phases.find(p => p.type !== "vapour"), V = r.phases.find(p => p.type === "vapour");
  assert.ok(L.fraction > 0.2 && L.fraction < 0.3, `liquid fraction ${L.fraction}`);
  // the balance closes, and the gases are dilute in the liquid
  c.forEach((_, i) => assert.ok(Math.abs(L.fraction * L.composition[i] + V.fraction * V.composition[i] - z[i]) < 1e-8));
  assert.ok(L.composition[0] < 0.05 && L.composition[1] < 0.01 && L.composition[2] < 0.002, `x ${L.composition}`);
});

test("a pair without NRTL parameters is g^E = 0, said in the pairs and the warnings; an unknown rule is refused", () => {
  const s = system({ components: ["hydrogen", "carbon-dioxide"], model: "SRK", mixing: "MHV1" });
  assert.equal(s.info.pairs[0].tier, "none");
  assert.ok(s.warnings(300, 5000).some(w => /No NRTL parameters for Hydrogen \+ Carbon dioxide in SRK \+ gE \(MHV1\)/.test(w)));
  assert.throws(() => system({ components: ["carbon-dioxide", "water"], model: "SRK", mixing: "PSRK" }), e => e.code === "BAD_INPUT" && /MHV1/.test(e.message));
  // a light gas with a polar liquid needs a set fitted inside the rule (proposal 0018): without one it is refused
  const inGate = new Set(data.pairs.map(p => `${p.model}|${p.i}|${p.j}`));
  if (!inGate.has("SRK|carbon-dioxide|water")) {
    assert.throws(() => system({ components: ["carbon-dioxide", "water"], model: "SRK", mixing: "MHV1" }), e => e.code === "NOT_AVAILABLE" && /no NRTL parameters fitted inside the rule/.test(e.message));
  }
});
