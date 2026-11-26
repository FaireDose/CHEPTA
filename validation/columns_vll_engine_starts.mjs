// The engine's profiles of the two-liquid column cases F4 and F5 (proposal 0024, test 3), as the start of the
// independent three-phase reference (validation/python/reference_mesh_vll.py --three-phase), which solves its own
// equations from them, perturbed. Only a start: the reference's answer is fixed by its equations.
//   node validation/columns_vll_engine_starts.mjs     -> validation/fixtures/columns-vll-engine-starts.json
// With --entrainer, the cases of proposal 0025, step 1 (the entrainer start: F6, F7, F8), for
// reference_mesh_vll.py --entrainer:
//   node validation/columns_vll_engine_starts.mjs --entrainer -> validation/fixtures/columns-vll-entrainer-starts.json
// With --purity, the cases of proposal 0025, step 2 (a bottoms purity among the MESH equations: F9 to F12), for
// reference_mesh_vll.py --purity:
//   node validation/columns_vll_engine_starts.mjs --purity    -> validation/fixtures/columns-vll-purity-starts.json
// With --mesh, the case of proposal 0028, item 1 (CHEPTA-Lab's column SCDS15 at its phase boundary: F13), for
// reference_mesh_vll.py --mesh:
//   node validation/columns_vll_engine_starts.mjs --mesh      -> validation/fixtures/columns-vll-mesh-starts.json
import { readFileSync, writeFileSync } from "node:fs";
import { system } from "../src/index.js";
import { solveCascade } from "../src/units/columns/engine.js";

const SPEC_OF = { reflux_ratio: "reflux_ratio", distillate_flow_mol_s: "distillate_rate", bottoms_flow_mol_s: "bottoms_rate" };
export function solveCase(c, twoLiquidStage, feedEnthalpy) {
  const sys = system({ components: c.components, model: c.thermo.model, vapour: c.thermo.vapour });
  const f = c.column.feed, P = c.pressure_kPa;
  const T = f.T_K ?? sys.bubbleT(f.z, P).T;
  // (feedEnthalpy: the reference's, J/mol, so that both solve the same column: a saturated liquid feed that would
  // split is not described the same way by the reference's bubble point and the engine's one-liquid one)
  const H = feedEnthalpy ?? (f.T_K != null ? sys.flash({ z: f.z, T, P }).H_J_mol : sys.enthalpy("liquid", T, P, f.z));
  return solveCascade({ sys, P_kPa: P, stages: c.column.stages, phases: "VLL", ...(twoLiquidStage ? { twoLiquidStage } : {}),
    ends: { condenser: c.column.condenser, ...(c.column.reflux_liquid ? { reflux_liquid: c.column.reflux_liquid } : {}) },
    feeds: [{ stage: f.stage, flows: f.z.map(z => z * f.flow_mol_s), H_W: f.flow_mol_s * H }],
    // (a purity is a design specification of the engine, passed as it is: proposal 0025, step 2)
    specs: c.specs.map(s => (s.kind.endsWith("_purity") ? { ...s } : { kind: SPEC_OF[s.kind], value: s.value })) });
}
/** Proposal 0025, step 1: the columns that converge from the entrainer start. */
export const ENTRAINER_CASES = ["F6-ethanol-dehydration-entrainer-20-stages", "F7-ethanol-dehydration-entrainer-30-stages", "F8-ethanol-water-cyclohexane-decanter-10-percent"];
/** Proposal 0025, step 2: the columns specified by a bottoms purity among the MESH equations. */
export const PURITY_CASES = ["F9-ethanol-dehydration-bottoms-purity-20-stages", "F10-ethanol-dehydration-bottoms-purity-30-stages", "F11-ethanol-dehydration-near-dry-30-stages", "F12-ethanol-dehydration-near-dry-40-stages"];
/** Proposal 0028, item 1: a reflux ratio and a bottoms purity of a total condenser's column, among the MESH equations. */
export const MESH_CASES = ["F13-scds15-water-column-lab-boundary"];
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const entrainer = process.argv.includes("--entrainer"), purity = process.argv.includes("--purity"), mesh = process.argv.includes("--mesh");
  const out = { _about: "Written by validation/columns_vll_engine_starts.mjs: the engine's profiles, the start of the three-phase reference.", cases: {} };
  const ids = mesh ? MESH_CASES : purity ? PURITY_CASES : entrainer ? ENTRAINER_CASES : ["F4-ethanol-water-cyclohexane-decanter", "F5-ethyl-acetate-product-column-lab"];
  for (const id of ids) {
    const c = JSON.parse(readFileSync(new URL(`./data/columns/vll/${id}.json`, import.meta.url)));
    const r = solveCase(c);
    const liq = q => ({ x: q.x, flow_mol_s: q.flow });
    out.cases[id] = {
      stages: r.stages.map((s, j) => ({ stage: s.stage, T_K: s.T_K, L_mol_s: s.L_mol_s, V_mol_s: s.V_mol_s, x: s.x, y: s.y,
        liquids: j > 0 && s.liquids ? { light: liq(s.liquids.light), heavy: liq(s.liquids.heavy) } : null })),
      D_mol_s: r.products.distillate.flows.reduce((a, b) => a + b, 0),
      ...(c.column.condenser === "decanter" ? { x_D: r.stages[0].x_distillate } : {}),
      Q_condenser_W: r.duties.condenser_W, Q_reboiler_W: r.duties.reboiler_W,
    };
    console.log(id, r.iterations, r.solver.start);
  }
  writeFileSync(new URL(`./fixtures/columns-vll-${mesh ? "mesh" : purity ? "purity" : entrainer ? "entrainer" : "engine"}-starts.json`, import.meta.url), JSON.stringify(out, null, 1) + "\n");
}
