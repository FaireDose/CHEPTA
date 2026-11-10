// The method advisor (src/thermo/method-advice.js, docs/METHOD_SELECTION.md): a note when the property
// method is not the one the selection rules recommend for the components or the pressure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { system } from "../src/index.js";
import { isPolar } from "../src/thermo/method-advice.js";

test("polar for the choice of method: heteroatoms, except the light gases", () => {
  assert.equal(isPolar("ethanol", "C2H6O"), true);
  assert.equal(isPolar("chloroform", "CHCl3"), true);
  assert.equal(isPolar("n-hexane", "C6H14"), false);
  assert.equal(isPolar("carbon-dioxide", "CO2"), false);
  assert.equal(isPolar("hydrogen-sulfide", "H2S"), false);
});

test("an equation of state with polar liquids gets a note; hydrocarbons and activity models do not", () => {
  const polar = system({ components: ["ethanol", "water"], model: "PR" });
  assert.equal(polar.info.advice.length, 1);
  assert.match(polar.info.advice[0], /Ethanol, Water/);
  assert.match(polar.info.advice[0], /NRTL or UNIQUAC/);
  // and the results carry it
  assert.ok(polar.bubbleT([0.5, 0.5], 101.325).warnings.some(w => /not the recommended method/.test(w)));
  assert.deepEqual(system({ components: ["propane", "n-butane"], model: "PR" }).info.advice, []);
  assert.deepEqual(system({ components: ["methane", "carbon-dioxide"], model: "SRK" }).info.advice, []);
  assert.deepEqual(system({ components: ["ethanol", "water"], model: "NRTL" }).info.advice, []);
});

test("an activity model above 10 bar gets a note at that pressure, not below", () => {
  const s = system({ components: ["ethanol", "water"], model: "NRTL" });
  assert.ok(!s.bubbleT([0.5, 0.5], 101.325).warnings.some(w => /10 bar/.test(w)));
  assert.ok(s.bubbleT([0.5, 0.5], 2000).warnings.some(w => /above about 10 bar/.test(w)));
});

// Above 10 bar, a light gas with a polar liquid: MHV1 is recommended (rule 4 of docs/METHOD_SELECTION.md) only where the
// engine runs it; each case is checked against system({ model, mixing: "MHV1" }) built directly.
const mhv1Note = ws => ws.filter(w => /gE mixing rule \(rule 4/.test(w));
const runs = (components, model) => {
  try { system({ components, model, mixing: "MHV1" }); return true; } catch (e) { if (e.code === "NOT_AVAILABLE") return false; throw e; }
};

test("advisor: PR above 10 bar with CO2 + methanol recommends PR + gE (MHV1), which the engine runs; not below 10 bar", () => {
  const s = system({ components: ["carbon-dioxide", "methanol"], model: "PR" });
  assert.deepEqual(mhv1Note(s.warnings(313.15, 900)), []);
  const [note] = mhv1Note(s.warnings(313.15, 5000));
  assert.match(note, /^Above 10 bar, PR \+ gE \(MHV1\) is recommended here\./);
  assert.equal(runs(["carbon-dioxide", "methanol"], "PR"), true);
  // the source it names is the one the engine uses
  const pair = system({ components: ["carbon-dioxide", "methanol"], model: "PR", mixing: "MHV1" }).info.pairs[0];
  assert.equal(pair.set, "mhv1-fitted");
  assert.match(note, /fitted inside the rule/);
  // and the results of a calculation carry it
  assert.equal(mhv1Note(s.bubbleP([0.1, 0.9], 313.15).warnings).length, 1);
});

test("advisor: SRK with CO2 + water points to PR + gE (MHV1), since the engine refuses SRK's", () => {
  const ws = mhv1Note(system({ components: ["carbon-dioxide", "water"], model: "SRK" }).warnings(323.15, 5000));
  assert.equal(ws.length, 1);
  assert.equal(runs(["carbon-dioxide", "water"], "SRK"), false);
  assert.equal(runs(["carbon-dioxide", "water"], "PR"), true);
  assert.match(ws[0], /In CHEPTA that is "PR \+ gE \(MHV1\)"/);
  assert.match(ws[0], /SRK \+ gE \(MHV1\): Carbon dioxide \+ Water, a light gas with a polar liquid, has no NRTL parameters/);
});

test("advisor: nitrogen + ethanol has no set, so MHV1 is not recommended and the engine's refusal is given", () => {
  const ws = mhv1Note(system({ components: ["nitrogen", "ethanol"], model: "PR" }).warnings(313.15, 5000));
  assert.equal(runs(["nitrogen", "ethanol"], "PR"), false);
  assert.equal(runs(["nitrogen", "ethanol"], "SRK"), false);
  assert.equal(ws.length, 1);
  assert.match(ws[0], /^Above 10 bar the gE rule \(MHV1\) would suit, but it has no set here\./);
  assert.doesNotMatch(ws[0], /In CHEPTA that is/);
  let msg;
  try { system({ components: ["nitrogen", "ethanol"], model: "PR", mixing: "MHV1" }); } catch (e) { msg = e.message; }
  assert.ok(ws[0].includes(msg));
});

test("advisor: no MHV1 note for the rule itself, for hydrocarbons, or for polar liquids without a gas", () => {
  assert.deepEqual(mhv1Note(system({ components: ["carbon-dioxide", "methanol"], model: "PR", mixing: "MHV1" }).warnings(313.15, 5000)), []);
  assert.deepEqual(mhv1Note(system({ components: ["methane", "propane"], model: "PR" }).warnings(300, 5000)), []);
  assert.deepEqual(mhv1Note(system({ components: ["ethanol", "water"], model: "PR" }).warnings(400, 2000)), []);
});

test("advisor: an activity model above 10 bar with H2 + water names PR + gE (MHV1), which runs", () => {
  const ws = mhv1Note(system({ components: ["hydrogen", "water"], model: "NRTL" }).warnings(313.15, 5000));
  assert.equal(ws.length, 1);
  assert.equal(runs(["hydrogen", "water"], "PR"), true);
  assert.match(ws[0], /"PR \+ gE \(MHV1\)"/);
});
