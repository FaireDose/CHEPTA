/**
 * The three-phase flash near the ternary heterogeneous azeotrope of water + ethanol + cyclohexane (NRTL, default sets;
 * docs/METHOD_SELECTION.md rules 3 and 7: polar, two liquids), where it failed until 2026-11-18 (the liquid-liquid
 * split by successive substitution fell back to one liquid near the plait point; src/equilibrium/flash.js, splitLL,
 * now minimizes the Gibbs energy where substitution fails). Against the independent reference
 * validation/python/reference_three_phase.py --gomis (Gibbs minimum with scipy, no shared code), fixture
 * validation/fixtures/three_phase_gomis.json: the bubble points of the mean of each of Gomis et al.'s (2005) 11 measured
 * tie lines, and T-P flashes of the feed of the line nearest the azeotrope below its bubble point
 * (docs/decisions/2026-11-18-01-vll-columns-rigorous.md).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { system } from "../src/index.js";

const ref = JSON.parse(readFileSync(new URL("../validation/fixtures/three_phase_gomis.json", import.meta.url)));
const sys = system({ components: ["water", "ethanol", "cyclohexane"], model: "NRTL", vapour: "ideal" });
const close = (a, b, tol, what) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= tol, `${what} ${i}: ${v} vs ${b[i]}`));
// the two liquids, matched by their cyclohexane content
const byOrganic = ph => ph.filter(p => (p.type ?? "liquid") === "liquid").map(p => ({ f: p.fraction, x: p.composition ?? p.x })).sort((a, b) => a.x[2] - b.x[2]);

ref.bubble.forEach((c, k) => {
  test(`Gomis et al. (2005) tie line ${k + 1} (measured ${c.measured_T_K} K): the bubble point of its two liquids as the reference's`, () => {
    const f = sys.flash({ z: c.z, P: c.P_kPa, VF: 0 });
    assert.ok(Math.abs(f.T - c.T_K) < 1e-6, `T ${f.T} vs ${c.T_K}`);
    close(f.incipient.composition, c.y, 1e-6, "vapour");
    const e = byOrganic(f.phases), r = byOrganic(c.phases);
    assert.equal(e.length, 2);
    e.forEach((p, j) => { close(p.x, r[j].x, 1e-6, `liquid ${j}`); assert.ok(Math.abs(p.f - r[j].f) < 1e-6, `fraction ${j}`); });
  });
});

for (const c of ref.tp) {
  test(`T-P flash at ${c.T_K} K below the bubble point near the heteroazeotrope: two liquids as the reference's`, () => {
    const f = sys.flash({ z: c.z, T: c.T_K, P: c.P_kPa });
    assert.ok(!f.phases.some(p => p.type === "vapour" && p.fraction > 0), "no vapour");
    const e = byOrganic(f.phases), r = byOrganic(c.phases);
    assert.equal(e.length, 2);
    e.forEach((p, j) => { close(p.x, r[j].x, 1e-8, `liquid ${j}`); assert.ok(Math.abs(p.f - r[j].f) < 1e-8, `fraction ${j}`); });
  });
}
