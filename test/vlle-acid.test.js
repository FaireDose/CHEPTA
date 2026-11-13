// Vapour + two liquids with acetic acid's dimerizing vapour (the chemical theory; decision
// docs/decisions/2026-11-12-02-acid-chemical-theory-vlle.md): the three-phase flash, and two liquids on the stages of a
// distillation column and of an absorber.
//
// Against the independent reference validation/python/reference_vlle_acid.py (fixture validation/fixtures/vlle_acid.json;
// the cases: validation/data/columns/acid/vlle-cases.json), which takes the vapour's species from liquid 1 (the
// liquid-side form, P_true(x') = P) where the engine iterates with the fugacity coefficients of the apparent vapour
// (sys.lnKAssociation); and against the measured liquid-liquid tie lines of water + acetic acid + ethyl acetate (Roque
// et al. 2018 and Toikka et al. 2014, the ThermoML Archive), which the flash's two liquids must follow as the
// pairs' parameters do (the vapour model does not enter them).
//
// The property method, by docs/METHOD_SELECTION.md rule 3: polar, no electrolytes, 1 atm, two liquids possible, fitted
// pairs: NRTL (default sets) with an ideal-gas vapour; acetic acid's vapour by the chemical theory, CHEPTA's default.
// Tests that switch the chemical theory off (association: false) do it on purpose, to show what it changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, stream, runUnit } from "../src/index.js";

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const doc = read("../validation/data/columns/acid/vlle-cases.json");
const FIX = read("../validation/fixtures/vlle_acid.json");
const KMOL_H = 3.6;   // kmol/h per mol/s
const sum = v => v.reduce((a, b) => a + b, 0);
const maxDiff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

/** The phases of an answer as { vapour, liquids: [two or one, in a fixed order: richest in water first] }. */
function arrange(phases) {
  const v = phases.find(p => p.type === "vapour");
  const liquids = phases.filter(p => p.type === "liquid").map(p => ({ fraction: p.fraction, x: p.composition ?? p.x }))
    .sort((a, b) => b.x[0] - a.x[0]);
  return { vapour: v ? { fraction: v.fraction, x: v.composition ?? v.x } : null, liquids };
}

for (const f of doc.flashes) {
  test(`flash ${f.id}: the engine's phases equal the reference's`, () => {
    const tol = doc.tolerances.flash_against_reference, ref = FIX.flashes[f.id];
    const sys = system({ components: f.components, model: f.model });
    assert.match(sys.info.vapour, /chemical theory \(dimerization\) for Acetic acid/);
    const r = f.VF != null ? sys.flash({ z: f.z, P: f.P_kPa, VF: f.VF }) : sys.flash({ z: f.z, T: f.T_K, P: f.P_kPa });
    assert.ok(Math.abs(r.T - ref.T_K) <= tol.T_K_absolute, `T ${r.T} vs ${ref.T_K}`);
    const a = arrange(r.phases), b = arrange(ref.phases);
    assert.equal(a.liquids.length, b.liquids.length, `${f.id}: number of liquids`);
    assert.equal(!!a.vapour, !!b.vapour, `${f.id}: vapour`);
    if (a.vapour && a.vapour.fraction > 0) {
      assert.ok(Math.abs(a.vapour.fraction - b.vapour.fraction) <= tol.fractions_absolute, `vapour fraction ${a.vapour.fraction} vs ${b.vapour.fraction}`);
      assert.ok(maxDiff(a.vapour.x, b.vapour.x) <= tol.mole_fractions_absolute, `vapour ${a.vapour.x} vs ${b.vapour.x}`);
    }
    a.liquids.forEach((l, k) => {
      assert.ok(Math.abs(l.fraction - b.liquids[k].fraction) <= tol.fractions_absolute, `liquid ${k} fraction`);
      assert.ok(maxDiff(l.x, b.liquids[k].x) <= tol.mole_fractions_absolute, `liquid ${k}: ${l.x} vs ${b.liquids[k].x}`);
    });
    // the reference found each liquid stable against a further liquid
    b.liquids.forEach((_, k) => assert.ok(ref.phases.filter(p => p.type === "liquid")[k].tpd > -1e-9));
    // material balance of the engine's answer
    const back = f.z.map((_, i) => sum(r.phases.map(p => p.fraction * p.composition[i])));
    assert.ok(maxDiff(back, f.z) < 1e-9);
    // two liquids without a vapour: the liquids' bubble pressure (their true pressure) is below P, so no vapour forms
    if (f.expect === "LL") assert.ok(ref.true_pressure_over_the_liquids_kPa < f.P_kPa);
  });
}

test("flash: the vapour with the dimers differs from the vapour without them (association: false on purpose)", () => {
  const f = doc.flashes.find(q => q.id === "F2-VLL");
  const on = arrange(system({ components: f.components, model: f.model }).flash({ z: f.z, T: f.T_K, P: f.P_kPa }).phases);
  const off = arrange(system({ components: f.components, model: f.model, association: false }).flash({ z: f.z, T: f.T_K, P: f.P_kPa }).phases);
  // the dimers hold the acid back in the vapour: about half the acid of the vapour without them, here
  assert.ok(on.vapour.x[1] < 0.7 * off.vapour.x[1], `acid in the vapour ${on.vapour.x[1]} with the dimers, ${off.vapour.x[1]} without`);
});

test("flash: two liquids against the measured tie lines of water + acetic acid + ethyl acetate (ThermoML Archive)", () => {
  // The flash's two liquids at each tie line's mid-point, with the chemical theory on. The liquids' equilibrium does not
  // involve the vapour, so the flash must give the liquids of the parameters: with the joint set fitted to Roque et al.'s
  // tie lines (fitted-lle-roque2018, src/data/binaries.json), the largest deviations its source states, 0.0587 against
  // Roque et al. 2018 and 0.1877 against the check set of Toikka et al. 2014 (rounded there to 4 decimals). The default
  // sets follow the binary data alone and miss these tie lines by more (stated in the decision file); they are not
  // tested against them.
  const ROQUE = "fitted-lle-roque2018";
  const sys = system({ components: ["water", "acetic-acid", "ethyl-acetate"], model: "NRTL",
    sets: { "water+acetic-acid": ROQUE, "water+ethyl-acetate": ROQUE, "ethyl-acetate+acetic-acid": ROQUE } });
  assert.match(sys.info.vapour, /chemical theory/);
  for (const [file, stated] of [["water_acetic-acid_ethyl-acetate_lle_roque2018.json", 0.0587], ["water_acetic-acid_ethyl-acetate_lle_toikka2014.json", 0.1877]]) {
    const d = read(`../validation/data/lle/${file}`);
    let worst = 0;
    for (const row of d.rows) {
      const [T, w1, a1, e1, w2, a2, e2] = row;
      const xI = [w1, a1, e1], xII = [w2, a2, e2];
      const a = arrange(sys.flash({ z: xI.map((v, i) => 0.5 * (v + xII[i])), T, P: d.P_kPa }).phases);
      assert.equal(a.vapour, null, `${file} ${T} K: no vapour at ${d.P_kPa} kPa`);
      assert.equal(a.liquids.length, 2, `${file} ${T} K: two liquids`);
      worst = Math.max(worst, maxDiff(a.liquids[0].x, xI), maxDiff(a.liquids[1].x, xII));
    }
    assert.ok(Math.abs(worst - stated) <= 1e-4, `${file}: largest deviation ${worst}, the set states ${stated}`);
  }
});

/** A case's feeds as streams of the engine. */
function streams(sys, c) {
  const col = c.column, P = c.pressure_kPa;
  if (col.feed) return [stream(sys, { flow_kmol_h: col.feed.z.map(z => z * col.feed.flow_mol_s * KMOL_H), P_kPa: P, VF: col.feed.q === 1 ? 0 : 1 })];
  return col.feeds.map(f => stream(sys, { flow_kmol_h: f.z.map(z => z * f.flow_mol_s * KMOL_H), P_kPa: P, T_K: f.T_K }));
}

function runCase(c, association = true) {
  const sys = system({ components: c.components, model: c.thermo.model, association });
  const col = c.column;
  const spec = col.configuration === "absorber"
    ? { mode: "rigorous", configuration: "absorber", stages: col.stages, phases: "VLL" }
    : col.condenser === "decanter"
      ? { mode: "rigorous", stages: col.stages, feed_stage: col.feed.stage, condenser: "decanter", reflux_liquid: col.reflux_liquid,
        distillate_kmol_h: c.specs[0].value * KMOL_H, phases: "VLL" }
      : { mode: "rigorous", stages: col.stages, feed_stage: col.feed.stage, reflux_ratio: c.specs[0].value,
        distillate_kmol_h: c.specs[1].value * KMOL_H, phases: "VLL" };
  return { sys, r: runUnit("column", { sys, inlets: { in: streams(sys, c) }, spec }) };
}

function againstReference(c, r, ref) {
  const tol = doc.tolerances.columns_against_reference;
  assert.equal(r.profile.length, ref.stages.length);
  r.profile.forEach((s, j) => {
    const q = ref.stages[j], where = `${c.id} stage ${s.stage}`;
    assert.ok(Math.abs(s.T_K - q.T_K) <= tol.T_K_absolute, `${where}: T ${s.T_K} vs ${q.T_K}`);
    assert.ok(Math.abs(s.L_kmol_h / KMOL_H - q.L_mol_s) <= tol.flows_relative * q.L_mol_s, `${where}: L`);
    assert.ok(maxDiff(Object.values(s.x), q.x) <= tol.mole_fractions_absolute, `${where}: x`);
    // which stages hold two liquids, and their liquids
    const refLiquids = q.liquids ? (q.liquids.x_I ? [q.liquids.x_I, q.liquids.x_II] : [q.liquids.x1, q.liquids.x2]) : null;
    assert.equal(!!s.liquids, !!refLiquids, `${where}: two liquids`);
    if (refLiquids) {
      const mine = [s.liquids.light.x, s.liquids.heavy.x].map(Object.values).sort((a, b) => b[0] - a[0]);
      refLiquids.slice().sort((a, b) => b[0] - a[0]).forEach((x, k) => assert.ok(maxDiff(mine[k], x) <= 1e3 * tol.mole_fractions_absolute, `${where}: liquid ${k}`));
    }
  });
}

for (const c of doc.columns) {
  test(`column ${c.id}: the reference's profile, two liquids on the same stages, the dimers' note`, () => {
    const { r } = runCase(c);
    againstReference(c, r, FIX.columns[c.id].rigorous);
    assert.ok(r.notes.some(n => /Vapour by the chemical theory for Acetic acid/.test(n)));
    assert.ok(r.notes.some(n => /^Two liquids on stage/.test(n)));
  });
  // (the reference records the column without the dimers where it solved it)
  if (FIX.columns[c.id]?.without_dimers_in_the_equilibrium) test(`column ${c.id}: without the dimers (association: false on purpose), the reference's other profile`, () => {
    const { r } = runCase(c, false);
    againstReference(c, r, FIX.columns[c.id].without_dimers_in_the_equilibrium);
  });
}

test("refusals that stay: two liquids with Wilson, and two liquids without a vapour on an absorber", () => {
  const c = doc.columns.find(q => q.id === "C1-distillation-VLL");
  const sys = system({ components: c.components, model: "WILSON" });
  assert.throws(() => runUnit("column", { sys, inlets: { in: streams(sys, c) }, spec: { mode: "rigorous", stages: 12, feed_stage: 6, reflux_ratio: 2, distillate_kmol_h: 144, phases: "VLL" } }),
    e => e.code === "NOT_AVAILABLE" && /Wilson/.test(e.message));
  const a = doc.columns.find(q => q.id === "C2-absorber-VLL"), s2 = system({ components: a.components, model: "NRTL" });
  assert.throws(() => runUnit("column", { sys: s2, inlets: { in: streams(s2, a) }, spec: { mode: "rigorous", configuration: "absorber", stages: 6, phases: "LL" } }),
    e => e.code === "NOT_AVAILABLE" && /Extraction block/.test(e.message));
});

test("heater: through vapour + two liquids with the dimers; the duty closes the energy balance, the outlet is the flash's", () => {
  const sys = system({ components: ["water", "acetic-acid", "ethyl-acetate"], model: "NRTL" });
  const feed = stream(sys, { flow_kmol_h: [50, 10, 40], P_kPa: 101.325, T_K: 300 });
  const r = runUnit("heater", { sys, inlets: { in: [feed] }, spec: { duty_kW: 300 } });
  const out = Object.values(r.outlets)[0];
  assert.ok(Math.abs(out.H_kW - feed.H_kW - 300) < 1e-6 * 300, `H ${out.H_kW} - ${feed.H_kW}`);
  const a = arrange(out.phases);
  assert.ok(a.vapour && a.vapour.fraction > 0 && a.liquids.length === 2, "vapour and two liquids");
  const z = [50, 10, 40].map(v => v / 100), b = arrange(sys.flash({ z, T: out.T_K, P: 101.325 }).phases);
  assert.ok(Math.abs(a.vapour.fraction - b.vapour.fraction) < 1e-6);
  a.liquids.forEach((l, k) => assert.ok(maxDiff(l.x, b.liquids[k].x) < 1e-6));
});

test("measured VLLE of cyclohexane + acetic acid + water at 101.3 kPa (Liu et al. 2013, ThermoML Archive): Modified UNIFAC 2.0 with the dimers, predicted", () => {
  // CHEPTA has no fitted acetic acid + cyclohexane pair, so the method is Modified UNIFAC 2.0 (predicted tier,
  // docs/DATA_RULES.md section 7) with the chemical theory. For each measured point with acid, the feed at the mid-point
  // of the two measured liquids, its bubble point at 101.3 kPa (VF = 0): the flash must find vapour + two liquids there,
  // and the deviations are the prediction's, recorded in the decision file (2026-11-12-02): the three-phase temperature
  // 1.0 to 7.6 K above the measured (mean 4.28 K; 3.27 K without the dimers), the incipient vapour within 0.040 in mole
  // fraction (0.041 without). These figures are checked here so that a change of the flash or of the model shows.
  const d = read("../validation/data/lle/cyclohexane_acetic-acid_water_vlle_liu2013.json");
  const stats = {};
  for (const association of [true, false]) {
    const sys = system({ components: d.components, model: "MOD-UNIFAC-2", association });
    const dT = [], dy = [];
    for (const [T, w2, c2, c1, w1, wy, cy] of d.rows.slice(1)) {
      const aq = [c2, 1 - w2 - c2, w2], org = [c1, 1 - c1 - w1, w1], y = [cy, 1 - wy - cy, wy];
      const r = sys.flash({ z: aq.map((v, i) => 0.5 * (v + org[i])), P: d.P_kPa, VF: 0 });
      assert.equal(r.phases.filter(p => p.type === "liquid").length, 2, `${T} K: two liquids at the bubble point`);
      dT.push(r.T - T);
      dy.push(maxDiff(r.incipient.composition, y));
    }
    stats[association] = { meanT: sum(dT.map(Math.abs)) / dT.length, minT: Math.min(...dT), maxT: Math.max(...dT), maxY: Math.max(...dy) };
  }
  const on = stats.true, off = stats.false;
  assert.ok(Math.abs(on.meanT - 4.28) < 0.01 && Math.abs(on.minT - 1.0) < 0.05 && Math.abs(on.maxT - 7.6) < 0.05, JSON.stringify(on));
  assert.ok(Math.abs(on.maxY - 0.040) < 0.001, JSON.stringify(on));
  assert.ok(Math.abs(off.meanT - 3.27) < 0.01 && Math.abs(off.maxY - 0.041) < 0.001, JSON.stringify(off));
});

test("measured VLLE of cyclohexane + acetic acid + water at 101.3 kPa (Liu et al. 2013): NRTL with the acetic acid + cyclohexane pair fitted to Yang et al. 2010, with the dimers", () => {
  // The independent test the fit was made for (docs/decisions/2026-11-13-04-acetic-acid-cyclohexane.md): Liu 2013 is not
  // in the fit. NRTL with the default sets of the three pairs: water + acetic acid (fitted, Chang 2005), water +
  // cyclohexane, and acetic acid + cyclohexane (fitted-yang2010, one T-x-y set at 101.3 kPa, point test 0.0118, within the wider
  // gates, quality warning). The same feeds as the Modified UNIFAC 2.0 test above: the mid-point of the two measured
  // liquids, bubble point at 101.3 kPa. The deviations are stated, not tuned: three-phase T 0.15 to 1.85 K above the
  // measured (mean 0.94 K; Modified UNIFAC 2.0 had 4.28 K), the incipient vapour within 0.049 in mole fraction
  // (Modified UNIFAC 2.0: 0.040, so the vapour is not better), vapour + two liquids at every point.
  const d = read("../validation/data/lle/cyclohexane_acetic-acid_water_vlle_liu2013.json");
  const sys = system({ components: d.components, model: "NRTL", association: true });
  const dT = [], dy = [];
  for (const [T, w2, c2, c1, w1, wy, cy] of d.rows.slice(1)) {
    const aq = [c2, 1 - w2 - c2, w2], org = [c1, 1 - c1 - w1, w1], y = [cy, 1 - wy - cy, wy];
    const r = sys.flash({ z: aq.map((v, i) => 0.5 * (v + org[i])), P: d.P_kPa, VF: 0 });
    assert.equal(r.phases.filter(p => p.type === "liquid").length, 2, `${T} K: two liquids at the bubble point`);
    dT.push(r.T - T);
    dy.push(maxDiff(r.incipient.composition, y));
  }
  assert.equal(dT.length, 13);
  const meanT = sum(dT.map(Math.abs)) / dT.length;
  assert.ok(Math.abs(meanT - 0.94) < 0.01 && Math.abs(Math.min(...dT) - 0.15) < 0.02 && Math.abs(Math.max(...dT) - 1.85) < 0.02, JSON.stringify({ meanT, dT }));
  assert.ok(Math.abs(Math.max(...dy) - 0.049) < 0.001, String(Math.max(...dy)));
});
