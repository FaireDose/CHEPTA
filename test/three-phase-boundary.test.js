/**
 * The three-phase flash on the boundary of the three-phase region (2026-11-18; docs/decisions/
 * 2026-11-18-01-vll-columns-rigorous.md): CHEPTA-Lab's column 5 (ethanol + water + ethyl acetate + acetic acid, UNIQUAC
 * with an ideal-gas vapour, the request's own method) with the smooth two-liquid stage gave a product whose P-H flash
 * failed at 346.01 K, its bubble point: there the vapour's fraction is zero, and successive substitution jittered at
 * round-off for 500 steps (src/equilibrium/flash.js, splitThree, the end of the iteration). Checked against the
 * definition of that state, not a fitted number: just below the bubble point the flash gives two liquids, and the
 * answer at it is their split (the two liquids' bubble pressure equals P there).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system } from "../src/index.js";
import { run } from "../src/api/dispatcher.js";

const sys = system({ components: ["ethanol", "water", "ethyl-acetate", "acetic-acid"], model: "UNIQUAC", vapour: "ideal" });
// the product of CHEPTA-Lab's column 5 (iso-scds5-paper-reflux70000, smooth stage) where the flash failed
const z = [0.09766367818585975, 0.7721703432366184, 0.07521818099926172, 0.05494779757826014];
const P = 100;

test("a three-phase flash at the bubble point of two liquids (vapour fraction zero) returns the state, not NO_CONVERGENCE", () => {
  const Tb = sys.flash({ z, P, VF: 0 }).T;
  assert.ok(Math.abs(Tb - 346.0143046) < 1e-5, `bubble ${Tb}`);
  for (const T of [346.0143046187345, 346.01430462596204, 346.01430462635375]) {
    const f = sys.flash({ z, T, P });
    const liq = f.phases.filter(p => p.type === "liquid" && p.fraction > 0);
    assert.equal(liq.length, 2, `${T}: two liquids`);
    assert.ok(f.VF < 1e-6, `${T}: VF ${f.VF}`);
    // the two liquids are those just below the bubble point (a continuous state), within the distance in T
    const g = sys.flash({ z, T: Tb - 1e-4, P }).phases.filter(p => p.type === "liquid").sort((a, b) => a.composition[1] - b.composition[1]);
    liq.sort((a, b) => a.composition[1] - b.composition[1]).forEach((p, k) => p.composition.forEach((v, i) => assert.ok(Math.abs(v - g[k].composition[i]) < 1e-5, `${T} liquid ${k} ${i}`)));
    // and they boil at P: the bubble pressure of either liquid is P within the distance from Tb
    const e = sys.equilibrium(liq[0].composition, T);
    assert.ok(Math.abs(e.P - P) < 1e-5 * P, `${T}: P3 ${e.P}`);
  }
});

test("CHEPTA-Lab's column 5 at a reflux of 70,000 kg/h converges with the smooth two-liquid stage (it failed on this flash)", () => {
  const req = JSON.parse(readFileSync(new URL("../validation/data/columns/lab-requests-0.6.2/iso-scds5-paper-reflux70000.request.json", import.meta.url)));
  req.input.flowsheet.blocks.find(b => b.id === "SCDS5").spec.two_liquid_stage = "smooth";
  const r = run(req);
  assert.equal(r.outcome, "ok", r.error?.message);
  const st = r.value.streams, s = req.input.flowsheet.streams;
  const ins = s.filter(x => x.to.startsWith("SCDS5.")).map(x => x.id), outs = s.filter(x => x.from.startsWith("SCDS5.")).map(x => x.id);
  const tot = ids => ids.reduce((a, k) => a + Object.values(st[k].flow_kmol_h).reduce((p, q) => p + q, 0), 0);
  assert.ok(Math.abs(tot(ins) - tot(outs)) <= 1e-6 * tot(ins), "material balance");
  assert.equal(r.value.blocks.SCDS5.state.solver.two_liquid_stage.formulation, "smooth");
});
