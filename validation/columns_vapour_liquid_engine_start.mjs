// The engine's profile of case H3 (proposal 0026: CHEPTA-Lab's methanol column with the vapour + liquid condenser,
// Peng-Robinson), as the start of the independent reference (validation/python/reference_mesh_condenser.py), which
// solves its own equations from it, perturbed: from its own bubble-point start the reference's Newton and scipy's
// hybrid method do not reach the solution of this 30-stage column with traces of gases. Only a start: the reference's
// answer is fixed by its equations.
//   node validation/columns_vapour_liquid_engine_start.mjs   -> validation/fixtures/columns-vapour-liquid-engine-start.json
import { readFileSync, writeFileSync } from "node:fs";
import { system } from "../src/index.js";
import { solveCascade } from "../src/units/columns/engine.js";

const KMOL_H = 1000 / 3600;
/** H3 by the engine; feedEnthalpy (J/mol) the reference's, so that both solve the same column (else the engine's own flash). */
export function solveH3(c, feedEnthalpy) {
  const sys = system({ components: c.components, model: c.thermo.model });
  const f = c.column.feed, P = c.pressure_kPa;
  const flows = c.components.map(id => (f.flow_kmol_h[id] ?? 0) * KMOL_H), F = flows.reduce((a, b) => a + b, 0);
  const H = feedEnthalpy ?? sys.flash({ z: flows.map(v => v / F), T: f.T_K, P }).H_J_mol;
  const get = k => c.specs.find(s => s.kind === k)?.value;
  return solveCascade({ sys, P_kPa: P, stages: c.column.stages, ends: { condenser: "vapour_liquid", condenser_spec: { kind: "T_K", value: get("condenser_T_K") } },
    feeds: [{ stage: f.stage, flows, H_W: F * H }],
    specs: [{ kind: "reflux_ratio", value: get("reflux_ratio") }, { kind: "bottoms_rate", value: get("bottoms_flow_kmol_h") * KMOL_H }] });
}
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const id = "H3-methanol-co2-pr-vapour-liquid";
  const c = JSON.parse(readFileSync(new URL(`./data/columns/vapour-liquid/${id}.json`, import.meta.url)));
  const r = solveH3(c);
  const out = { _about: "Written by validation/columns_vapour_liquid_engine_start.mjs: the engine's profile, the start of the reference (proposal 0026).",
    cases: { [id]: { stages: r.stages.map(s => ({ stage: s.stage, T_K: s.T_K, L_mol_s: s.L_mol_s, V_mol_s: s.V_mol_s, U_mol_s: s.U_mol_s ?? 0, x: s.x })),
      Q_condenser_W: r.duties.condenser_W, Q_reboiler_W: r.duties.reboiler_W } } };
  writeFileSync(new URL("./fixtures/columns-vapour-liquid-engine-start.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
  console.log("wrote validation/fixtures/columns-vapour-liquid-engine-start.json");
}
