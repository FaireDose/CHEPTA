// The source ids of every set fitted inside the MHV1 rule (src/data/mhv1.json) belong to the data of its own pair
// (Lab request 5, 2026-11-11). An id may be named after another system of the same article (the article of
// pokki2018-furfural-gvl also measured CO2 + water, a binary record of the ThermoML Archive), but the article must have
// a data file of THIS pair among the files the fit used; and every data file of the pair the fit used has its article.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import mhv1 from "../src/data/mhv1.json" with { type: "json" };
import sourcesData from "../src/data/sources.json" with { type: "json" };

const S = sourcesData.sources;
const ofPair = (f, p) => f.includes(`_${p.i}_${p.j}_`) || f.includes(`_${p.j}_${p.i}_`);

test("every MHV1 set has source ids that exist and name its own pair's data", () => {
  for (const p of mhv1.pairs) {
    const label = `${p.model} ${p.i} + ${p.j}`;
    assert.ok(p.source_ids?.length, `${label}: no source ids`);
    for (const id of p.source_ids) assert.ok(S[id], `${label}: unknown source id ${id}`);
    const data = p.source.data ?? [];
    if (data.every(f => f === "src/data/henry.json")) { // fitted to Henry's law constants (IAPWS G7-04)
      assert.deepEqual(p.source_ids, ["iapws-g7-04"], label);
      continue;
    }
    const own = data.filter(f => ofPair(f, p));
    assert.equal(own.length, data.length, `${label}: the fit used data files of another pair: ${data.filter(f => !ofPair(f, p))}`);
    for (const id of p.source_ids) {
      const files = (S[id].files ?? []).filter(f => own.some(o => f.endsWith(o)));
      assert.ok(files.length, `${label}: source ${id} has no data file of this pair among the fit's files`);
    }
    for (const o of own) {
      assert.ok(p.source_ids.some(id => (S[id].files ?? []).some(f => f.endsWith(o))), `${label}: ${o} has no source id`);
      readFileSync(new URL(`../${o}`, import.meta.url)); // the file exists
    }
  }
});
