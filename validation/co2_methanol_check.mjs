/**
 * How much CO2 dissolves in the condensate of a methanol plant's high-pressure separator: CHEPTA's methods against the
 * measured open data (CHEPTA-Lab, case methanol-co2-campos-2022, 2026-11-20; docs/decisions/2026-11-20-01-co2-methanol-water.md).
 *
 * The case: the flash at 30 degC and 6925 kPa of the reactor gas (stream 23; mol %: H2 59.631, CO 1.776, CO2 18.136,
 * methanol 7.485, water 7.273, N2 5.698, as CHEPTA-Lab's COMPARISON.md lists it on main 415da41). CHEPTA's PR gives
 * 3.4 mol % CO2 in the liquid; the paper's simulation (Campos et al. 2022, supplement Table S10, stream 24) 18.5 %.
 *
 * The measured data (validation/data/eos/multicomponent/, hp_ternary_solubility.py, NIST TRC ThermoML Archive):
 *   - Xia et al. 2004 (doi 10.1021/je049803i): CO2 + methanol + water, total pressure at a known CO2 molality,
 *     313.75, 354.35 and 395 K, solvent methanol mole fraction 0.05-1;
 *   - Bezanehtak et al. 2004 (doi 10.1021/je0301491): CO2 + H2 + methanol, both phases, 278-298 K, 2-20 MPa;
 *   - Xie et al. 2005 (doi 10.1021/je0498614): CO2 + H2 + methanol bubble pressures at 313.2 K.
 *
 * For each method (PR and SRK with the k_ij of src/data/kij.json; PR and SRK with the gE rule MHV1 and the NRTL sets of
 * src/data/mhv1.json and the databank), the bubble pressure of every measured liquid at its measured T, against the
 * measured P (the deviation ln(P_calc / P_exp) as a percentage of P_exp); for Xia et al. also the CO2 mole fraction at
 * the measured T and P with the solvent's ratio held (the solubility the method predicts), against the measured one.
 * A method that the engine refuses for a mixture is listed with the refusal.
 *
 *     node validation/co2_methanol_check.mjs            # prints the tables
 *     node validation/co2_methanol_check.mjs --write    # also writes validation/data/eos/multicomponent/co2_methanol_check.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { system } from "../src/index.js";

const DIR = new URL("./data/eos/multicomponent/", import.meta.url);
const load = f => JSON.parse(readFileSync(new URL(f, DIR), "utf8"));
const rowsOf = d => d.rows.map(r => Object.fromEntries(d.columns.map((c, i) => [c, r[i]])));

export const METHODS = [
  { label: "PR (k_ij)", model: "PR" },
  { label: "SRK (k_ij)", model: "SRK" },
  { label: "PR + gE (MHV1)", model: "PR", mixing: "MHV1" },
  { label: "SRK + gE (MHV1)", model: "SRK", mixing: "MHV1" },
];

export const LAB_FEED = {
  components: ["hydrogen", "carbon-monoxide", "carbon-dioxide", "methanol", "water", "nitrogen"],
  z_pct: [59.631, 1.776, 18.136, 7.485, 7.273, 5.698],
  T: 303.15, P: 6925,
};

function sysOf(m, components) {
  try {
    return { sys: system({ components, model: m.model, ...(m.mixing ? { mixing: m.mixing } : {}) }) };
  } catch (e) {
    return { refused: e.message };
  }
}

const pct = (a, b) => 100 * (a - b) / b;

/** The CO2 mole fraction that gives the bubble pressure P at T, with methanol : water held at s : (1 - s). */
export function solubility(sys, T, P, s, x0) {
  const xOf = x1 => [x1, s * (1 - x1), (1 - s) * (1 - x1)];
  const f = x1 => Math.log(sys.bubbleP(xOf(x1), T).P / P);
  let a = x0 * 0.7, b = x0 * 1.3, fa = f(a), fb = f(b);
  for (let k = 0; k < 40 && Math.abs(b - a) > 1e-9; k++) {
    const c = Math.min(0.95, Math.max(1e-7, b - fb * (b - a) / (fb - fa)));
    a = b; fa = fb; b = c; fb = f(b);
  }
  if (!(Math.abs(fb) < 1e-6)) throw new Error(`no CO2 mole fraction found for T ${T} K, P ${P} kPa, s ${s}`);
  return b;
}

function stats(devs) {
  const v = devs.filter(Number.isFinite);
  if (!v.length) return null;
  const r = x => Math.round(x * 10) / 10;
  return { n: v.length, AAD_pct: r(v.reduce((s, d) => s + Math.abs(d), 0) / v.length), bias_pct: r(v.reduce((s, d) => s + d, 0) / v.length),
    max_pct: r(v.reduce((m, d) => Math.abs(d) > Math.abs(m) ? d : m, 0)) };
}

/** Xia et al. 2004 for one method: P deviations and solubility deviations per (T, s) series. */
export function xiaCheck(m, filter = () => true) {
  const d = load("thermoml_carbon-dioxide_methanol_water_10-1021-je049803i.json");
  const { sys, refused } = sysOf(m, d.components);
  if (refused) return { refused };
  const series = {};
  for (const r of rowsOf(d).filter(filter)) {
    const k = `${r.T_K} K, s = ${r.s_methanol_CO2_free}`;
    const e = series[k] ??= { T_K: r.T_K, s: r.s_methanol_CO2_free, dP: [], dx: [], points: [] };
    const x = [r.x_1, r.x_2, 1 - r.x_1 - r.x_2];
    let Pc = NaN, xc = NaN;
    try { Pc = sys.bubbleP(x, r.T_K).P; } catch { /* no bubble pressure: counted as missing */ }
    try { xc = solubility(sys, r.T_K, r.P_kPa, r.s_methanol_CO2_free, r.x_1); } catch { /* not found */ }
    e.dP.push(pct(Pc, r.P_kPa)); e.dx.push(pct(xc, r.x_1));
    e.points.push({ P_kPa: r.P_kPa, x_1: r.x_1, P_calc: Math.round(Pc), x_1_calc: Math.round(xc * 1e5) / 1e5 });
  }
  const out = {};
  for (const [k, e] of Object.entries(series)) out[k] = { T_K: e.T_K, s: e.s, P: stats(e.dP), x_CO2: stats(e.dx), missing: e.dP.filter(v => !Number.isFinite(v)).length, points: e.points };
  return { series: out, all_P: stats(Object.values(series).flatMap(e => e.dP)), all_x: stats(Object.values(series).flatMap(e => e.dx)) };
}

/** CO2 + H2 + methanol: bubble pressure (and y_CO2 where measured) at the measured liquid. */
export function h2Check(m, file) {
  const d = load(file);
  const { sys, refused } = sysOf(m, d.components);
  if (refused) return { refused };
  const dP = [], dy = [], dyH2 = [];
  for (const r of rowsOf(d)) {
    const x = [r.x_1, r.x_2, 1 - r.x_1 - r.x_2];
    try {
      const b = sys.bubbleP(x, r.T_K);
      dP.push(pct(b.P, r.P_kPa));
      if (r.y_1 != null) dy.push(b.y[0] - r.y_1);
    } catch { dP.push(NaN); }
  }
  const r3 = v => Math.round(v * 1000) / 1000;
  return { P: stats(dP), missing: dP.filter(v => !Number.isFinite(v)).length,
    y_CO2: dy.length ? { n: dy.length, AAD: r3(dy.reduce((s, v) => s + Math.abs(v), 0) / dy.length), bias: r3(dy.reduce((s, v) => s + v, 0) / dy.length) } : null };
}

/** The separator itself: CHEPTA-Lab's stream 23 at 30 degC and 6925 kPa; without nitrogen where a method lacks its pairs. */
export function labFlash(m, dropNitrogen = false) {
  let { components, z_pct } = LAB_FEED;
  if (dropNitrogen) { components = components.slice(0, 5); z_pct = z_pct.slice(0, 5); }
  const { sys, refused } = sysOf(m, components);
  if (refused) return { components, refused };
  const z = z_pct.map(v => v / z_pct.reduce((s, w) => s + w, 0));
  try {
    const r = sys.flash({ T: LAB_FEED.T, P: LAB_FEED.P, z });
    const L = r.phases.find(p => p.type === "liquid"), V = r.phases.find(p => p.type === "vapour");
    const p3 = a => a.map(v => Math.round(v * 1e5) / 1e3);
    return { components, liquid_mol_pct: L && p3(L.composition), vapour_mol_pct: V && p3(V.composition), liquid_fraction: L && Math.round(L.fraction * 1e4) / 1e4 };
  } catch (e) { return { components, refused: e.message }; }
}

export function run() {
  const out = { _about: "CHEPTA's methods against the measured CO2 solubility in methanol + water and in methanol with H2 "
    + "(validation/co2_methanol_check.mjs). Deviations are (calc - exp) / exp in %; P at the measured liquid, x_CO2 at the measured T and P.",
  methods: {} };
  for (const m of METHODS) {
    out.methods[m.label] = {
      xia2004_313K: xiaCheck(m, r => r.T_K < 320),
      xia2004_all: (({ all_P, all_x, refused }) => ({ all_P, all_x, refused }))(xiaCheck(m)),
      bezanehtak2004: h2Check(m, "thermoml_carbon-dioxide_hydrogen_methanol_10-1021-je0301491.json"),
      xie2005: h2Check(m, "thermoml_carbon-dioxide_hydrogen_methanol_10-1021-je0498614.json"),
      lab_flash: labFlash(m),
      lab_flash_without_N2: labFlash(m, true),
    };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = run();
  for (const [label, r] of Object.entries(out.methods)) {
    console.log(`\n== ${label}`);
    const x = r.xia2004_313K;
    if (x.refused) console.log("  Xia 2004: refused:", x.refused.slice(0, 160));
    else for (const [k, s] of Object.entries(x.series)) console.log(`  Xia 2004 ${k}: P ${JSON.stringify(s.P)}  x_CO2 ${JSON.stringify(s.x_CO2)}`);
    console.log("  Xia 2004 all T:", JSON.stringify(r.xia2004_all));
    console.log("  Bezanehtak 2004:", JSON.stringify(r.bezanehtak2004).slice(0, 300));
    console.log("  Xie 2005:", JSON.stringify(r.xie2005).slice(0, 300));
    console.log("  Lab flash:", JSON.stringify(r.lab_flash).slice(0, 400));
    console.log("  Lab flash without N2:", JSON.stringify(r.lab_flash_without_N2).slice(0, 400));
  }
  if (process.argv.includes("--write")) writeFileSync(new URL("co2_methanol_check.json", DIR), JSON.stringify(out, null, 1) + "\n");
}
