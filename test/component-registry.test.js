// The component registry (validation/data/component_registry.json) is the one list the data scripts read
// (validation/python/registry.py): a component in src/data/components.json that is not in it would not be refitted
// or checked against the ThermoML Archive. Components built from measured data alone are in measured_components.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const reg = read("../validation/data/component_registry.json");
const comps = read("../src/data/components.json").components;
// measured_components.py (proposal 0008, Part B; proposal 0009, batch 3)
const FROM_MEASURED = ["dichloromethane", "2-methoxyethanol", "furan", "2-methylfuran", "2-methyltetrahydrofuran",
  "1-3-propanediol", "levulinic-acid", "methyl-levulinate", "ethyl-levulinate", "butyl-levulinate", "gbl", "isoamyl-alcohol"];

test("every component is in the registry once, and every registry entry is a component", () => {
  const ids = [...reg.base.components, ...reg.batches.flatMap(b => b.components)].map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, "a component is listed twice");
  const missing = Object.keys(comps).filter(id => !ids.includes(id) && !FROM_MEASURED.includes(id));
  assert.deepEqual(missing, [], "components not in the registry");
  assert.deepEqual(ids.filter(id => !comps[id]), [], "registry entries that are not components");
});

test("registry entries agree with the components: CAS, CoolProp, ChemSep file", () => {
  for (const b of reg.batches) {
    assert.match(b.proposal, /^\d{4}$/);
    for (const c of b.components) {
      assert.ok(c.name && Array.isArray(c.aliases), `${c.id}: name and aliases`);
      if (c.cas) assert.equal(c.cas, comps[c.id].cas, `${c.id}: CAS`);
      // a component that is not a CoolProp fluid comes from ChemSep: its CAS is needed to find it there
      if (!c.coolprop) assert.ok(c.cas, `${c.id}: CAS for ChemSep`);
      if (c.chemsep_file !== undefined) assert.equal(c.chemsep_file, 2, `${c.id}: chemsep_file`);
    }
  }
});
