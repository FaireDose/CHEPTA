// Reactions page and reactor blocks of the Flowsheet workspace (proposal 0010, step 7), DOM-free: the edits of
// src/ui/flowsheet-logic.js. A flowsheet built with them solves as one written by hand (test/reactors.test.js).
// Method: Peng-Robinson, as for the gas-phase reactors of test/reactors.test.js (hydrogen and CO2 above their
// critical temperatures; docs/METHOD_SELECTION.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { flowsheetDocStatus, runFlowsheet } from "../src/index.js";
import { emptyFlowsheet } from "../src/flowsheet/document.js";
import {
  addBlock, addFeedTo, setSpec, setComponents, streamsOf, PALETTE, REACTORS,
  addReaction, setReaction, removeReaction, reactionsFile, importReactions, usedReactions,
} from "../src/ui/flowsheet-logic.js";

const COMPS = ["carbon-dioxide", "hydrogen", "methanol", "water"];
const base = () => ({ ...emptyFlowsheet(), components: COMPS, thermo: { model: "PR" } });
const methanol = fs => {
  const r = addReaction(fs);
  return { fs: setReaction(r.fs, r.id, { name: "Methanol synthesis", stoichiometry: { "carbon-dioxide": -1, hydrogen: -3, methanol: 1, water: 1 } }), id: r.id };
};

test("reactions are written on the Reactions page: added, changed coefficient by coefficient, removed", () => {
  let { fs, id } = methanol(base());
  assert.equal(id, "r1");
  assert.deepEqual(fs.reactions[0], { id: "r1", name: "Methanol synthesis", phase: "vapour",
    stoichiometry: { "carbon-dioxide": -1, hydrogen: -3, methanol: 1, water: 1 } });
  // a coefficient of 0 or empty takes the component out; the phase and a given heat of reaction
  fs = setReaction(fs, "r1", { stoichiometry: { water: 0 }, phase: "liquid", heatOfReaction: { dH_J_mol: -1, source: "x" } });
  assert.equal("water" in fs.reactions[0].stoichiometry, false);
  assert.equal(fs.reactions[0].phase, "liquid");
  fs = setReaction(fs, "r1", { heatOfReaction: null });
  assert.equal("heatOfReaction" in fs.reactions[0], false);
  ({ fs, id } = methanol(fs));
  assert.equal(id, "r2");
  const r = removeReaction(fs, "r1");
  assert.deepEqual(r.fs.reactions.map(x => x.id), ["r2"]);
  assert.equal("reactions" in removeReaction(r.fs, "r2").fs, false);
});

test("the reactor blocks are in the palette; a conversion reactor starts with the first reaction and its first reactant", () => {
  assert.ok(REACTORS.every(t => PALETTE.includes(t)));
  let { fs } = methanol(base());
  let id;
  ({ fs, id } = addBlock(fs, "conversion-reactor"));
  assert.equal(id, "R1");
  assert.deepEqual(fs.blocks.find(b => b.id === "R1").spec, { reactions: [{ reaction: "r1", key: "carbon-dioxide" }], order: "parallel" });
  assert.equal(streamsOf(fs, "R1").out.length, 1, "one outlet, a product until connected");
  ({ fs, id } = addBlock(fs, "yield-reactor"));
  assert.equal(id, "RY1");
  assert.deepEqual(fs.blocks.find(b => b.id === "RY1").spec, { basis: "mass", yields: {} });
  // removing a reaction removes it from the reactors that use it, and says so
  const r = removeReaction(fs, "r1");
  assert.deepEqual(r.fs.blocks.find(b => b.id === "R1").spec.reactions, []);
  assert.match(r.note, /R1 no longer uses it/);
  // removing a component takes it out of the reactions, the keys and the yields
  let y = setSpec(fs, "RY1", { key: "methanol", conversion: 0.5, yields: { water: 1 }, closure: "water" });
  y = setComponents(y, ["carbon-dioxide", "hydrogen", "methanol"]).fs;
  assert.equal("water" in y.reactions[0].stoichiometry, false);
  assert.deepEqual(y.blocks.find(b => b.id === "RY1").spec.yields, {});
  assert.equal(y.blocks.find(b => b.id === "RY1").spec.closure, undefined);
});

test("a reaction still being written does not stop the flowsheet; only the reactions a reactor uses are checked", () => {
  let { fs } = methanol(base());
  fs = addReaction(fs).fs;   // r2: no coefficients yet, would not pass checkReaction
  let id;
  ({ fs, id } = addBlock(fs, "conversion-reactor"));
  ({ fs } = addFeedTo(fs, `${id}.in`));
  fs = setSpec(fs, "F1", { flow_kmol_h: { "carbon-dioxide": 100, hydrogen: 300 }, T_K: 523.15, P_kPa: 5000 });
  fs = setSpec(fs, id, { reactions: [{ reaction: "r1", key: "carbon-dioxide", conversion: 0.25 }], T_K: 523.15 });
  assert.throws(() => flowsheetDocStatus(fs), /r2|coefficient|reactant/i, "the whole document with the unfinished reaction");
  const used = usedReactions(fs);
  assert.deepEqual(used.reactions.map(r => r.id), ["r1"]);
  assert.ok(flowsheetDocStatus(used).ready);
  const res = runFlowsheet(used);
  assert.ok(Math.abs(res.blocks[id].reaction.extents_kmol_h.r1 - 25) < 1e-9);
  assert.ok(Math.abs(res.balance.generation_kmol_h.methanol - 25) < 1e-9);
  assert.ok(Math.abs(res.balance.energy_kW) < 1e-6 * Math.abs(res.blocks[id].duty_kW));
});

test("reactions are exported as a file of their own and imported into another project, with new ids where taken", () => {
  const { fs } = methanol(base());
  const file = reactionsFile(fs);
  assert.equal(file.chepta_reactions, 1);
  const other = methanol({ ...emptyFlowsheet(), components: ["carbon-dioxide", "hydrogen", "methanol"] }).fs;
  const r = importReactions(other, JSON.parse(JSON.stringify(file)));
  assert.deepEqual(r.fs.reactions.map(x => x.id), ["r1", "r2"]);
  assert.match(r.note, /Added 1 reaction \(new ids: r1 → r2\)/);
  assert.match(r.note, /water, not among the components/);
  assert.throws(() => importReactions(other, { something: 1 }), /no reaction list/);
  assert.throws(() => importReactions(other, [{ id: "x" }]), /needs its stoichiometry/);
});

test("an equilibrium reactor (proposal 0010, step 4): added with the first reaction, solved in a flowsheet, and losing a removed reaction", () => {
  let { fs } = methanol(base());
  let id;
  ({ fs, id } = addBlock(fs, "equilibrium-reactor"));
  assert.equal(id, "RE1");
  assert.deepEqual(fs.blocks.find(b => b.id === "RE1").spec, { reactions: [{ reaction: "r1" }] });
  ({ fs } = addFeedTo(fs, `${id}.in`));
  fs = setSpec(fs, "F1", { flow_kmol_h: { "carbon-dioxide": 100, hydrogen: 300 }, T_K: 523.15, P_kPa: 5000 });
  fs = setSpec(fs, id, { reactions: [{ reaction: "r1", approach: { dT_K: 10 } }], T_K: 523.15 });
  // a second reaction still being written is not checked: only the reactions the reactors use
  fs = addReaction(fs).fs;
  const used = usedReactions(fs);
  assert.deepEqual(used.reactions.map(r => r.id), ["r1"]);
  const res = runFlowsheet(used);
  const rx = res.blocks[id].reaction;
  assert.equal(rx.equilibrium.reactions.r1.T_K, 533.15, "K at the outlet temperature plus the approach");
  assert.ok(rx.extents_kmol_h.r1 > 0 && rx.extents_kmol_h.r1 < 100);
  assert.ok(Math.abs(res.balance.generation_kmol_h.methanol - rx.extents_kmol_h.r1) < 1e-9);
  assert.ok(Math.abs(res.balance.energy_kW) < 1e-6 * Math.abs(res.blocks[id].duty_kW));
  const r = removeReaction(fs, "r1");
  assert.deepEqual(r.fs.blocks.find(b => b.id === "RE1").spec.reactions, []);
  assert.match(r.note, /RE1 no longer uses it/);
});
