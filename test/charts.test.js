// Property charts of a fluid or a mixture with an equation of state (src/equilibrium/charts.js; proposal 0013, step 7):
// the dome and isobars of pure fluids against an independent Peng-Robinson (validation/python/reference_charts.py,
// validation/fixtures/charts.json: CoolProp's ideal-gas cp0 plus the thermo library's departures, CHEPTA's Tc, Pc and
// omega), within 0.5 %; a mixture's dome from its phase envelope; the compression drawn on the chart.
// Method (docs/METHOD_SELECTION.md): light hydrocarbons and carbon dioxide: Peng-Robinson.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, propertyChart } from "../src/index.js";

const ref = JSON.parse(readFileSync(new URL("../validation/fixtures/charts.json", import.meta.url), "utf8"));
const at = (pts, T) => {
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    if ((a.T_K - T) * (b.T_K - T) <= 0 && a.T_K !== b.T_K) {
      const t = (T - a.T_K) / (b.T_K - a.T_K);
      return { h: a.h_J_mol + t * (b.h_J_mol - a.h_J_mol), s: a.s_J_molK + t * (b.s_J_molK - a.s_J_molK) };
    }
  }
  return null;
};

test("pure fluids: the dome and the isobars as the independent Peng-Robinson, within 0.5 %", () => {
  for (const f of ref.fluids) {
    const sys = system({ components: [f.component], model: "PR" });
    for (const d of f.dome) {
      const P = sys.psatEos(d.T_K)[0];
      assert.ok(Math.abs(P / d.Psat_kPa - 1) < 5e-3, `${f.component} ${d.T_K} K: Psat ${P} against ${d.Psat_kPa}`);
      const L = sys.phase("liquid", d.T_K, P, [1], { entropy: true }), V = sys.phase("vapour", d.T_K, P, [1], { entropy: true });
      // 0.5 % of the heat of vaporization (h) and of the entropy of vaporization (s): the scale of the chart
      const dh = d.vapour.h_J_mol - d.liquid.h_J_mol, ds = d.vapour.s_J_molK - d.liquid.s_J_molK;
      for (const [mine, want, scale, what] of [[L.h_J_mol, d.liquid.h_J_mol, dh, "h liquid"], [V.h_J_mol, d.vapour.h_J_mol, dh, "h vapour"],
        [L.s_J_molK, d.liquid.s_J_molK, ds, "s liquid"], [V.s_J_molK, d.vapour.s_J_molK, ds, "s vapour"]]) {
        assert.ok(Math.abs(mine - want) < 5e-3 * Math.abs(scale), `${f.component} ${d.T_K} K ${what}: ${mine} against ${want}`);
      }
    }
    const c = propertyChart(sys, [1], { P_kPa: f.isobars.map(b => b.P_kPa), Tmax_K: 1.7 * f.isobars[0].points.at(-1).T_K / 1.6 });
    f.isobars.forEach((b, k) => {
      const line = c.isobars[k].points;
      for (const p of b.points) {
        const q = at(line, p.T_K);
        assert.ok(q, `${f.component} ${b.P_kPa} kPa: no point at ${p.T_K} K`);
        // the chart's points are 48 per line: interpolated between them, within 0.5 % of the line's span
        const spanH = Math.max(...line.map(x => x.h_J_mol)) - Math.min(...line.map(x => x.h_J_mol));
        const spanS = Math.max(...line.map(x => x.s_J_molK)) - Math.min(...line.map(x => x.s_J_molK));
        assert.ok(Math.abs(q.h - p.h_J_mol) < 5e-3 * spanH, `${f.component} ${b.P_kPa} kPa ${p.T_K} K h: ${q.h} against ${p.h_J_mol}`);
        assert.ok(Math.abs(q.s - p.s_J_molK) < 5e-3 * spanS, `${f.component} ${b.P_kPa} kPa ${p.T_K} K s: ${q.s} against ${p.s_J_molK}`);
      }
    });
    // inside the dome a pure fluid's isobar is flat: its saturated ends are on the line, at the same temperature
    const Ts = sys.flash({ z: [1], P: f.isobars[0].P_kPa, VF: 0 }).T;
    const sat = c.isobars[0].points.filter(p => Math.abs(p.T_K - Ts) < 1e-6);
    assert.ok(sat.length === 2 && sat[1].s_J_molK - sat[0].s_J_molK > 10, `${f.component}: ${JSON.stringify(sat)}`);
  }
});

test("carbon dioxide's dome starts at its melting point; quality lines lie between the liquid and the vapour", () => {
  const sys = system({ components: ["carbon-dioxide"], model: "PR" });
  const c = propertyChart(sys, [1], { VF: [0.5] });
  assert.ok(c.dome.liquid[0].T_K > 216 && c.dome.liquid[0].T_K < 217.5, `${c.dome.liquid[0].T_K}`);
  assert.match(c.notes.join(" "), /starts at the melting point/);
  c.quality[0].points.forEach((q, k) => {
    assert.ok(q.h_J_mol > c.dome.liquid[k].h_J_mol && q.h_J_mol < c.dome.vapour[k].h_J_mol);
  });
  assert.ok(Math.abs(c.dome.critical.T_K - sys.eos.comps[0].Tc_K) < 1e-9);
});

test("a mixture: its dome is the feed at its bubble and dew points, meeting at the mixture critical point", () => {
  const sys = system({ components: ["methane", "ethane"], model: "PR" });
  const z = [0.8, 0.2];
  const c = propertyChart(sys, z, { P_kPa: [2000], VF: [0.5], compression: { T_K: 300, P_kPa: 2000, P_out_kPa: 6000, efficiency: 0.75 } });
  assert.ok(c.dome.liquid.length > 5 && c.dome.vapour.length > 5);
  // a bubble point is a liquid with less entropy than the dew point at the same pressure
  const b = sys.flash({ z, P: 2000, VF: 0 }, { entropy: true }), d = sys.flash({ z, P: 2000, VF: 1 }, { entropy: true });
  assert.ok(b.S_J_molK < d.S_J_molK && b.H_J_mol < d.H_J_mol);
  const iso = c.isobars[0].points;
  assert.ok(iso.some(p => Math.abs(p.T_K - b.T) < 1e-6) && iso.some(p => Math.abs(p.T_K - d.T) < 1e-6), "the isobar has its bubble and dew points");
  // the compression: the isentropic outlet keeps the inlet's entropy; the real one has more, and the same pressure
  const k = c.compression;
  assert.ok(Math.abs(k.isentropic.s_J_molK - k.inlet.s_J_molK) < 1e-6 && k.outlet.s_J_molK > k.inlet.s_J_molK);
  assert.ok(Math.abs(k.w_J_mol * 0.75 - k.w_s_J_mol) < 1e-6 && k.kind === "compression");
  assert.ok(c.quality[0].points.length > 5 && c.quality[0].points.every(p => Math.abs(p.VF - 0.5) < 1e-6));
});

test("refused with the reason: an activity model", () => {
  // (NRTL on purpose: the charts need an equation of state)
  assert.throws(() => propertyChart(system({ components: ["ethanol", "water"], model: "NRTL" }), [0.5, 0.5]), /need an equation of state/);
});

test("the Charts workspace: a fluid chart in the workbench, saved as project format 5 and opened again", async () => {
  const { initialState, applyPatch } = await import("../src/ui/app-logic.js");
  const { projectOf, stateFromProject } = await import("../src/ui/project.js");
  let s = initialState({ components: ["methane", "ethane"], model: "PR" });
  // without the charts a project stays in its older format (here 2)
  assert.equal(projectOf(s).fugacity_project, 2);
  s = applyPatch(s, { view: "charts", chart: { kind: "PH", T_K: [200, 250], compression: { T_K: 300, P_kPa: 2000, P_out_kPa: 6000 } } });
  s = applyPatch(s, { z: [0.8, 0.2] });
  assert.equal(s.workspace, "steam");
  assert.deepEqual(s.components, ["methane", "ethane"]);
  assert.equal(s.chart.compression.efficiency, 0.75);
  const doc = projectOf(s);
  assert.equal(doc.fugacity_project, 5);
  assert.deepEqual(doc.workbench.chart.components, ["methane", "ethane"]);
  assert.equal("charts" in doc.workbench.inputs, false);
  const back = stateFromProject(JSON.stringify(doc));
  assert.equal(back.view, "charts");
  assert.deepEqual(back.chart, s.chart);
  assert.deepEqual(back.inputs.charts, ["methane", "ethane"]);
  assert.deepEqual(back.z.charts, [0.8, 0.2]);
  // a format 4 file cannot hold the charts
  assert.throws(() => stateFromProject(JSON.stringify({ ...doc, fugacity_project: 4 })), /workbench.chart needs format 5/);
  assert.throws(() => applyPatch(s, { chart: { kind: "PV" } }), /chart.kind must be one of TS, PH, HS/);
  assert.throws(() => applyPatch(s, { chart: { compression: { efficiency: 1.5 } } }), /at most 1/);
});
