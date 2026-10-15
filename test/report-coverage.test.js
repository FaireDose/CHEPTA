// The engineering report (validation/report/cases.json) must reach every component, so that a new batch of
// components shows in the report of the next pull requests. When this test fails after adding components, rerun
//   python validation/report/make_cases.py && python validation/report/make_reference.py
// The cases come from the component registry (CoolProp fluids: boiling point and properties against CoolProp; the
// others: boiling point against the NIST WebBook) and, for the components built from measured data alone, the WebBook
// average of the measured boiling points.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const cases = read("../validation/report/cases.json");
const comps = read("../src/data/components.json").components;

// Components taken from the ChemSep databank as they are (docs/DATA_RULES.md, section 1; the maintainer, 2026-10-14)
// need no case: their records are not compared with other sources.
const fromChemSep = id => /^ChemSep pure-component database/.test(comps[id].constants_source ?? "");
// A nonvolatile component (proposal 0009, step 5) has no boiling point or vapour pressure to compare, and its liquid
// heat capacity may be predicted (no reference to compare with): test/nonvolatile.test.js checks it instead.
const nonvolatile = id => comps[id].class === "nonvolatile";

test("every component whose records are built here is in at least one case of the engineering report", () => {
  const used = new Set();
  for (const g of cases.groups) for (const c of g.cases) {
    if (c.component) used.add(c.component);
    for (const id of c.components ?? []) used.add(id);
  }
  assert.deepEqual(Object.keys(comps).filter(id => !used.has(id) && !fromChemSep(id) && !nonvolatile(id)), [],
    "components without a case: rerun the report scripts");
});

test("every case of the report has its reference entry (or a stated reason for none)", () => {
  const refs = {};
  for (const g of cases.groups) {
    const r = read(`../validation/report/reference/${g.id}.json`).values;
    for (const c of g.cases) refs[c.id] = r[c.id];
  }
  const missing = Object.entries(refs).filter(([, r]) => !r).map(([id]) => id);
  assert.deepEqual(missing, [], "cases without a reference entry: rerun make_reference.py");
});
