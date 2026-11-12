import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system, solveFlowsheet } from "../src/index.js";
import { solveCascade } from "../src/units/columns/engine.js";
import { run } from "../src/api/dispatcher.js";
import { jointSets } from "../src/units/extraction.js";

// The Extraction block and the liquid-liquid cascade of the column engine (proposal 0015, milestone M3, step 8;
// src/units/columns/extraction.js, src/units/extraction.js). Checked against:
//  1. an independent implementation (validation/python/reference_extraction.py, scipy, its own start): every stage's
//     two liquids, water + acetic acid + ethyl acetate with the jointly fitted sets (test/ternary-lle.test.js);
//  2. the published worked example of D. J. Glatz and W. Parker, "Troubleshooting liquid-liquid extraction columns:
//     evaluating column efficiency", AIChE Spring National Meeting 2004, paper 232a (free to read in the meeting's
//     proceedings, https://folk.ntnu.no/skoge/prost/proceedings/aiche-2004/pdffiles/papers/232a.pdf): the Kremser
//     equation for a constant distribution coefficient m = 1.06 and S/F = 1.24, feed 14.2 %, solvent 0.07 %, 10.6
//     theoretical stages for a raffinate of 0.26 % (Run 1); 13.0 stages for 0.1 % with pure solvent (Run 3). The
//     Kremser equation is exact for a cascade with a straight equilibrium line and constant flows: here an algebraic
//     stand-in for the activity coefficients (not a chemical system; no parameters of any substance) whose two
//     liquids follow Y = m X exactly in solute ratios, with the carrier and the solvent immiscible.
const load = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const IDS = ["water", "acetic-acid", "ethyl-acetate"];
const SET = "fitted-lle-roque2018";
const SETS = { "water+acetic-acid": SET, "water+ethyl-acetate": SET, "ethyl-acetate+acetic-acid": SET };
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);

test("the liquid-liquid cascade equals the independent Python reference on every stage", () => {
  const fx = load("../validation/fixtures/extraction.json");
  assert.ok(fx.cases.length >= 6);
  for (const c of fx.cases) {
    const sys = system({ components: c.components, model: c.model, sets: SETS });
    const r = solveCascade({ sys, phases: "LL", stages: c.stages, T_K: c.T_K, feeds: [{ stage: 1, flows: c.feed_mol_s }, { stage: c.stages, flows: c.solvent_mol_s }] });
    assert.ok(r.converged && r.residuals.material < 1e-10 && r.residuals.equilibrium < 1e-10);
    r.stages.forEach((st, j) => {
      for (let i = 0; i < 3; i++) {
        for (const [eng, ref, what] of [[st.down.flows[i], c.raffinate_mol_s[j][i], "raffinate"], [st.up.flows[i], c.extract_mol_s[j][i], "extract"]]) {
          // relative where the flow is not a trace; absolute (of the feed) below 1e-9 mol/s
          assert.ok(ref < 1e-9 ? Math.abs(eng - ref) < 1e-12 : rel(eng, ref) < 1e-7, `${c.model} N=${c.stages} stage ${j + 1} ${what} ${IDS[i]}: ${eng} vs ${ref}`);
        }
      }
    });
  }
});

// the stand-in: carrier 0, solute 1, solvent 2. The carrier-rich liquid has activity X = x1/x0 of the solute and 1 of the
// carrier, the solvent-rich one Y/m = x1/(m x2) and 1 of the solvent; the other liquid's main component is held out by
// an activity coefficient of 1e8 (immiscible to 1e-8)
const M = 1.06;
const kremserGammas = x => (x[0] > x[2] ? [1 / x[0], 1 / x[0], 1e8] : [1e8, 1 / (M * x[2]), 1 / x[2]]);
// X_N from the Kremser equation as Glatz and Parker write it, N = ln[(x_F - y_S/m)/(x_N - y_S/m)(1 - 1/E) + 1/E] / ln E
const kremserXN = (N, E, xF, yS) => yS / M + (xF - yS / M) * (1 - 1 / E) / (E ** N - 1 / E);
const kremserN = (xN, E, xF, yS) => Math.log((xF - yS / M) / (xN - yS / M) * (1 - 1 / E) + 1 / E) / Math.log(E);
function standIn(N, SF, xF, yS) {
  const r = solveCascade({ gammas: kremserGammas, n: 3, phases: "LL", stages: N, T_K: 298.15,
    feeds: [{ stage: 1, flows: [1, xF, 0] }, { stage: N, flows: [0, SF * yS, SF] }] });
  return r.products.down[1] / r.products.down[0];
}

test("Glatz and Parker (2004): the cascade gives the Kremser equation exactly for a straight equilibrium line", () => {
  // the paper's own numbers through the Kremser equation (its Run 1 and Run 3)
  assert.ok(Math.abs(kremserN(0.26, M * 1.24, 14.2, 0.07) - 10.6) < 0.05);
  assert.ok(Math.abs(kremserN(0.1, M * 1.24, 14.2, 0) - 13.0) < 0.05);
  for (const [N, SF, yS] of [[10, 1.24, 0.0007], [11, 1.24, 0.0007], [13, 1.24, 0], [11, 1.52, 0.0007], [1, 1.24, 0.0007], [3, 0.5, 0]]) {
    const X = standIn(N, SF, 0.142, yS), K = kremserXN(N, M * SF, 0.142, yS);
    assert.ok(rel(X, K) < 1e-6, `N=${N}, S/F=${SF}: ${X} vs Kremser ${K}`);
  }
  // Run 1: 10.6 stages give 0.26 %; the whole stages around it bracket it
  assert.ok(standIn(10, 1.24, 0.142, 0.0007) > 0.0026 && standIn(11, 1.24, 0.142, 0.0007) < 0.0026);
  // Run 3: with pure solvent 13.0 stages give 0.1 %
  assert.ok(Math.abs(standIn(13, 1.24, 0.142, 0) - 0.001) < 0.00002);
});

const FS = (spec = { stages: 4 }, thermo = { model: "NRTL" }) => ({
  components: IDS, thermo,
  blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { water: 90, "acetic-acid": 10 }, T_K: 298.15, P_kPa: 101.325 } },
    { id: "F2", type: "feed", spec: { flow_kmol_h: { "ethyl-acetate": 100 }, T_K: 298.15, P_kPa: 101.325 } },
    { id: "EX1", type: "extraction", spec }, { id: "P1", type: "product" }, { id: "P2", type: "product" }],
  streams: [{ id: "FEED", from: "F1.out", to: "EX1.feed" }, { id: "SOLV", from: "F2.out", to: "EX1.solvent" },
    { id: "EXT", from: "EX1.extract", to: "P1.in" }, { id: "RAF", from: "EX1.raffinate", to: "P2.in" }],
});
const solveFs = (fs, sets) => solveFlowsheet(system({ components: fs.components, model: fs.thermo.model, ...(sets ? { sets } : {}) }), fs);

test("the Extraction block: the joint sets by default for this ternary, balances, profile, the warning where the flowsheet's sets split an outlet", () => {
  assert.deepEqual(Object.values(jointSets(IDS, "NRTL")).sort(), [SET, SET, SET]);
  assert.deepEqual(jointSets(["water", "ethanol", "ethyl-acetate"], "NRTL"), {});
  const r = solveFs(FS());
  const b = r.blocks.EX1;
  assert.deepEqual(Object.values(b.state.sets), [SET, SET, SET]);
  assert.ok(b.balance.material < 1e-9);
  assert.equal(b.profile.length, 4);
  // the extract leaves stage 1, the raffinate stage 4
  const ext = r.streams.EXT.flows, raf = r.streams.RAF.flows;
  b.profile[0].extract_kmol_h.forEach((v, i) => assert.ok(rel(v, ext[i]) < 1e-12));
  b.profile[3].raffinate_kmol_h.forEach((v, i) => assert.ok(rel(v, raf[i]) < 1e-12));
  assert.ok(b.state.recoveries["acetic-acid"] > 0.99, `acid recovered ${b.state.recoveries["acetic-acid"]}`);
  // acetic acid goes to the ester-rich liquid: its distribution coefficient is above 1 on every stage
  for (const st of b.profile) assert.ok(st.K[1] > 1);
  // the flowsheet's default sets split this extract: warned, with the remedy
  assert.ok(b.warnings.some(w => w.code === "METHOD_SPLIT" && /extract/.test(w.message)));
  // with the joint sets in the flowsheet's thermo too: no warning, the same outlets
  const r2 = solveFs(FS(), SETS);
  assert.ok(!r2.blocks.EX1.warnings?.some(w => w.code === "METHOD_SPLIT"));
  r2.streams.RAF.flows.forEach((v, i) => assert.ok(rel(v, raf[i]) < 1e-9));
  // the person's own sets replace the joint ones (the default sets miss the tie lines: another answer)
  const own = solveFs(FS({ stages: 4, method: { model: "NRTL", sets: { "water+acetic-acid": "fitted-chang2005" } } }));
  assert.equal(own.blocks.EX1.state.sets["water+acetic-acid"], "fitted-chang2005");
  assert.ok(rel(own.streams.RAF.flows[1], raf[1]) > 0.01);
});

test("the Extraction block refuses what it cannot do, with the reason", () => {
  const code = (fs, want, re) => assert.throws(() => solveFs(fs), e => e.code === want && re.test(e.message), JSON.stringify(fs.blocks[2].spec));
  code(FS({}), "BAD_INPUT", /missing: the number of stages/);   // the flowsheet's check of what is given
  code(FS({ stages: 0 }), "BAD_INPUT", /1 to 100/);
  code(FS({ stages: 3, trays: 4 }), "BAD_INPUT", /trays/);
  code(FS({ stages: 3, method: { model: "PR" } }), "BAD_INPUT", /activity model/);
  code(FS({ stages: 3, method: { vapour: "ideal" } }), "BAD_INPUT", /vapour model does not enter/);
  // acetic acid as the "solvent": it dissolves in the feed, one liquid
  const fs = FS({ stages: 3 });
  fs.blocks[1].spec = { flow_kmol_h: { "acetic-acid": 100 }, T_K: 298.15, P_kPa: 101.325 };
  assert.throws(() => solveFs(fs), e => e.code === "BAD_INPUT" && e.details?.one_liquid && /one liquid/.test(e.message));
  // a vapour solvent
  const hot = FS({ stages: 3 });
  hot.blocks[1].spec = { flow_kmol_h: { "ethyl-acetate": 100 }, T_K: 400, P_kPa: 101.325 };
  code(hot, "BAD_INPUT", /partly vapour/);
});

test("solve_extraction through the request path: the extract, the raffinate and every stage", () => {
  const r = run({ capability: "solve_extraction", input: { components: IDS, feed: FS().blocks[0].spec, solvent: FS().blocks[1].spec, extraction: { stages: 4 } } });
  assert.equal(r.outcome, "ok", JSON.stringify(r.error));
  const v = r.value;
  assert.equal(v.extraction.profile.length, 4);
  assert.ok(v.extraction.recoveries["acetic-acid"] > 0.99);
  const direct = solveFs(FS());
  v.raffinate.flows.forEach((q, i) => assert.ok(rel(q, direct.streams.RAF.flows[i]) < 1e-12));
  const bad = run({ capability: "solve_extraction", input: { components: IDS, feed: FS().blocks[0].spec, solvent: FS().blocks[1].spec, extraction: {} } });
  assert.equal(bad.outcome, "invalid_input");
});

test("the workbench: Extraction under the Separator button, placed with a feed and a solvent, saved and reopened in format 6", async () => {
  const { addBlock, addFeedTo, setSpec, PALETTE, SEPARATORS } = await import("../src/ui/flowsheet-logic.js");
  const { readProject, projectOf, stateFromProject } = await import("../src/ui/project.js");
  const { initialState } = await import("../src/ui/app-logic.js");
  const { runFlowsheet } = await import("../src/index.js");
  assert.ok(PALETTE.includes("extraction") && SEPARATORS.includes("extraction"));
  let fs = { components: IDS, thermo: { model: "NRTL" }, blocks: [], streams: [] };
  const r = addBlock(fs, "extraction"); fs = r.fs;
  assert.equal(r.id, "EXT1");
  assert.deepEqual(fs.blocks.find(b => b.id === "EXT1").spec, { stages: 5 });
  ({ fs } = addFeedTo(fs, "EXT1.feed"));
  ({ fs } = addFeedTo(fs, "EXT1.solvent"));
  const [f1, f2] = fs.blocks.filter(b => b.type === "feed");
  fs = setSpec(fs, f1.id, FS().blocks[0].spec);
  fs = setSpec(fs, f2.id, FS().blocks[1].spec);
  const res = runFlowsheet(fs);
  assert.equal(res.blocks.EXT1.profile.length, 5);
  const doc = projectOf({ ...initialState({ components: [] }), flowsheet: fs }, { version: "9.9.9", now: new Date("2026-11-04T12:00:00Z") });
  assert.equal(doc.fugacity_project, 6);
  const back = stateFromProject(readProject(JSON.stringify(doc)));
  assert.deepEqual(back.flowsheet.blocks.find(b => b.id === "EXT1").spec, { stages: 5 });
  assert.throws(() => readProject(JSON.stringify({ ...doc, fugacity_project: 5 })), /extraction and membrane blocks need format 6/);
});

// Lab requests, 2026-11-12 (docs/decisions/2026-11-12-03-extraction-lab-requests.md): the adiabatic option, a feed with a
// little vapour, and the refusal of an extractor whose liquids boil at its pressure.
import { runUnit } from "../src/units/units.js";
import { stream } from "../src/stream/stream.js";
const LAB_SYS = () => system({ components: IDS, model: "NRTL", sets: SETS });
const lab = (sys, f, Tf, v, Tv, P = 101.325) => ({
  feed: [stream(sys, { flow_kmol_h: { water: f[0], "acetic-acid": f[1], "ethyl-acetate": f[2] }, T_K: Tf, P_kPa: P })],
  solvent: [stream(sys, { flow_kmol_h: { water: v[0], "acetic-acid": v[1], "ethyl-acetate": v[2] }, T_K: Tv, P_kPa: P })] });

test("adiabatic extraction: the one temperature equals the independent enthalpy balance (reference_extraction.py)", () => {
  const fx = load("../validation/fixtures/extraction.json");
  assert.ok(fx.adiabatic.length >= 3);
  for (const c of fx.adiabatic) {
    const sys = system({ components: c.components, model: c.model, sets: SETS });
    const r = runUnit("extraction", { sys, inlets: lab(sys, c.feed_mol_s, c.feed_T_K, c.solvent_mol_s, c.solvent_T_K), spec: { stages: c.stages, adiabatic: true } });
    assert.ok(Math.abs(r.state.T_K - c.T_K) < 0.01, `${c.model} N=${c.stages}: ${r.state.T_K} vs ${c.T_K}`);
    assert.equal(r.duty_kW, 0);
    assert.equal(r.state.adiabatic, true);
    // the outlets are the reference's liquids (the inlets are given in kmol/h with the fixture numbers, so the flows are equal)
    c.raffinate_mol_s.forEach((v, i) => assert.ok(Math.abs(r.outlets.raffinate.flows[i] - v) < 1e-5));
    assert.ok(r.notes.some(n => /one temperature for all stages/.test(n)));
  }
});

test("adiabatic extraction refuses T_K together with it, and a non-boolean", () => {
  const sys = LAB_SYS(), inlets = lab(sys, [90, 10, 0], 298.15, [0, 0, 100], 318.15);
  assert.throws(() => runUnit("extraction", { sys, inlets, spec: { stages: 3, adiabatic: true, T_K: 300 } }), e => e.code === "BAD_INPUT" && /leave out T_K/.test(e.message));
  assert.throws(() => runUnit("extraction", { sys, inlets, spec: { stages: 3, adiabatic: "yes" } }), e => e.code === "BAD_INPUT");
});

test("an extractor whose liquids are above their bubble point at its pressure is refused, with the bubble temperature", () => {
  const sys = LAB_SYS(), inlets = lab(sys, [90, 10, 0], 298.15, [0, 0, 100], 318.15);
  assert.throws(() => runUnit("extraction", { sys, inlets, spec: { stages: 3, T_K: 350.15 } }),
    e => e.code === "OUT_OF_RANGE" && /bubble point \(\d+ K\)/.test(e.message) && Array.isArray(e.details.boiling));
  // the same temperature at a pressure that keeps the liquids liquid is accepted
  const r = runUnit("extraction", { sys, inlets: lab(sys, [90, 10, 0], 298.15, [0, 0, 100], 318.15, 200), spec: { stages: 3, T_K: 350.15, P_kPa: 200 } });
  assert.ok(r.outlets.extract.VF === 0 || r.outlets.extract.VF == null || r.outlets.extract.VF < 1e-9);
});

test("a feed with a little vapour is condensed into the stages with a FEED_VAPOUR warning; much vapour is refused", () => {
  const sys = LAB_SYS();
  const inlets = lab(sys, [90, 10, 0], 298.15, [0, 0, 100], 318.15);
  const fake = { ...inlets.feed[0], VF: 0.05 };
  const r = runUnit("extraction", { sys, inlets: { ...inlets, feed: [fake] }, spec: { stages: 3, T_K: 298.15 } });
  assert.ok(r.warnings.some(w => w.code === "FEED_VAPOUR" && /condenses/.test(w.message)));
  const total = r.outlets.extract.F_kmol_h + r.outlets.raffinate.F_kmol_h;
  assert.ok(Math.abs(total - 200) < 1e-6);   // nothing leaves as vapour
  assert.throws(() => runUnit("extraction", { sys, inlets: { ...inlets, feed: [{ ...inlets.feed[0], VF: 0.5 }] }, spec: { stages: 3, T_K: 298.15 } }), e => e.code === "BAD_INPUT" && /at most 0.1/.test(e.message));
});
