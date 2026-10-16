// The browser fit of the user's own points (proposal 0012, step 3; src/thermo/user-fit.js): the same least-squares
// problems as validation/python/reference_user_fit.py, which solves them with numpy (lstsq). The points are the
// databank's own records evaluated and rounded (no new data). Also the unit conversions, the table parser and the
// record the fit makes, checked by checkUserData.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fitPoints, autoFit, recordFromFit, parseTable, toRecordUnits, INPUT_UNITS, T_UNITS, FIT_EQUATION } from "../src/thermo/user-fit.js";
import { checkUserData, RECORD_UNITS } from "../src/thermo/user-data.js";
import { pure } from "../src/index.js";

const fixture = JSON.parse(readFileSync(new URL("../validation/fixtures/user-fit.json", import.meta.url)));

test("the browser fit gives numpy's coefficients to 1e-9 relative", () => {
  for (const c of fixture.cases) {
    const f = fitPoints(c.points, { equation: c.equation, terms: c.terms, E: c.E ?? 1 });
    const what = `${c.component} ${c.property} ${c.equation}/${c.terms}`;
    for (const [k, v] of Object.entries(c.coefficients)) {
      assert.ok(Math.abs(f.coefficients[k] - v) <= 1e-9 * Math.abs(v) + 1e-300, `${what}: ${k} ${f.coefficients[k]} vs ${v}`);
    }
    assert.ok(Math.abs(f.maxDev - c.maxDev) <= 1e-9 + 1e-6 * c.maxDev, `${what}: max deviation ${f.maxDev} vs ${c.maxDev}`);
  }
});

test("the default fit takes the fewest terms within 0.5 %, and its record is accepted as user data", () => {
  const pts = fixture.cases.find(c => c.property === "vapourPressure").points;
  const f = autoFit("vapourPressure", pts);
  assert.equal(f.equation, "DIPPR101");
  assert.equal(f.terms, 3, "A + B/T misses by 2 %, A + B/T + C ln T is within 0.5 %");
  assert.ok(f.maxDev <= 0.005);
  const rec = recordFromFit("vapourPressure", f, pts, "own measurement, lab book 12");
  assert.match(rec.source.fit, /DIPPR101, 3 coefficients fitted to 7 points; maximum deviation 0\.065 %/);
  // the record works: toluene's own vapour pressure replaced by the fit, within its deviation
  const ud = checkUserData({ properties: { toluene: { vapourPressure: rec } } });
  const p = pure("toluene", { userData: ud });
  for (const [T, P] of pts) assert.ok(Math.abs(p.property("vapourPressure", T) * 1000 / P - 1) <= f.maxDev + 1e-12);   // kPa vs Pa
  assert.equal(p.record("vapourPressure").tier, "user");
  for (const prop of Object.keys(FIT_EQUATION)) assert.ok(RECORD_UNITS[prop] && INPUT_UNITS[prop][RECORD_UNITS[prop]] === 1, prop);
});

test("units, tables and refusals", () => {
  assert.equal(toRecordUnits("liquidDensity", "g/cm3", 0.789), 789);
  assert.equal(toRecordUnits("liquidHeatCapacity", "J/g/K", 2.4, 46.07), 2.4 * 46.07);
  assert.throws(() => toRecordUnits("liquidHeatCapacity", "J/g/K", 2.4), /molar mass is needed/);
  assert.equal(toRecordUnits("vapourPressure", "mmHg", 760), 101325);
  assert.equal(toRecordUnits("liquidViscosity", "cP", 1.2), 1.2e-3);
  assert.equal(T_UNITS["°C"](25), 298.15);
  assert.ok(Math.abs(T_UNITS["°F"](212) - 373.15) < 1e-12);
  assert.throws(() => toRecordUnits("liquidDensity", "lb/ft3", 1), /Unknown unit "lb\/ft3"/);
  // pasted from a spreadsheet: a header, tabs and decimal commas; or commas; or spaces
  assert.deepEqual(parseTable("T (°C)\tdensity (g/cm3)\n20\t1,2091\n40\t1,1935\n"), { header: ["T (°C)", "density (g/cm3)"], rows: [[20, 1.2091], [40, 1.1935]] });
  assert.deepEqual(parseTable("20,1.2091\n40,1.1935").rows, [[20, 1.2091], [40, 1.1935]]);
  assert.deepEqual(parseTable("20 1.2091\n\n40   1.1935").rows, [[20, 1.2091], [40, 1.1935]]);
  assert.deepEqual(parseTable("20;1,2091").rows, [[20, 1.2091]]);
  assert.throws(() => parseTable("20\t1.2\nabc\t1"), /Line 2/);
  const pts = [[300, 1000], [320, 990], [340, 975]];
  assert.throws(() => fitPoints(pts, { equation: "DIPPR100", terms: 4 }), /4 coefficients need at least 4 points/);
  assert.throws(() => fitPoints([[300, 1], [300, 2]], { equation: "DIPPR100", terms: 2 }), /do not fix this many coefficients/);
  assert.throws(() => fitPoints([[300, -1], [310, 2]], { equation: "DIPPR101", terms: 2 }), /must be positive/);
  assert.throws(() => autoFit("colour", pts), /Unknown property "colour"/);
});
