// The Reactor workspace of the Unit models and the flowsheet's reactors (the maintainer, 2026-10-28): one document of
// its own (feed, reactor, product), the same engine as the flowsheet, the reactor type changed in place, saved with the
// project; the flowsheet's kinetic reactors and the reactions they share with the other reactors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runFlowsheet } from "../src/flowsheet/document.js";
import { reactorDocument } from "../src/ui/reactor-workspace.js";
import { setBlockType, setSpec, usedReactions, REACTORS, addBlock } from "../src/ui/flowsheet-logic.js";
import { initialState, applyPatch } from "../src/ui/app-logic.js";
import { projectOf, stateFromProject } from "../src/ui/project.js";

// ethane to ethylene and hydrogen, first order (Rawlings and Ekerdt, Example 4.4's numbers); Peng-Robinson for the
// hydrogen (METHOD_SELECTION.md: gases with an equation of state)
const base = () => {
  let fs = reactorDocument({ components: ["ethane", "ethylene", "hydrogen"], thermo: { model: "PR" }, blocks: [], streams: [],
    reactions: [{ id: "r1", name: "Dehydrogenation", phase: "vapour", stoichiometry: { ethane: -1, ethylene: 1, hydrogen: 1 },
      rate: { form: "power-law", forward: { k: 0.05, orders: { ethane: 1 } } } }] }, "pfr");
  const feed = fs.blocks.find(b => b.type === "feed").id, pfr = fs.blocks.find(b => b.type === "pfr").id;
  // 35 L/min at 518 °C and 2 atm, in kmol/h
  fs = setSpec(fs, feed, { flow_kmol_h: { ethane: 202650 * 35e-3 / 60 / (8.314462618 * 791.15) * 3.6 }, T_K: 791.15, P_kPa: 202.65 });
  return setSpec(fs, pfr, { reactions: [{ reaction: "r1" }], L_m: 12.2, D_m: 0.025, T_K: 791.15 });
};

test("the workspace's document: a feed, the reactor and its product, solved by the flowsheet engine", () => {
  const fs = base();
  assert.deepEqual(fs.blocks.map(b => b.type).sort(), ["feed", "pfr", "product"]);
  const res = runFlowsheet(fs);
  const r = res.blocks.PF1.reaction;
  assert.ok(Math.abs(r.keyConversion.ethane - 0.35) < 0.002);
  assert.ok(r.kinetic.profile.length > 5 && r.kinetic.profile.at(-1).z_m === 12.2);
});

test("changing the reactor type keeps its streams, renames it, and starts its new spec", () => {
  const fs = base();
  const eq = setBlockType(fs, "PF1", "equilibrium-reactor");
  const b = eq.blocks.find(x => x.type === "equilibrium-reactor");
  assert.equal(b.id, "RE1");
  assert.equal(b.spec.T_K, 791.15);
  assert.ok(eq.streams.some(s => s.to === "RE1.in") && eq.streams.some(s => s.from === "RE1.out"));
  const gibbs = setSpec(eq, "RE1", { mode: "gibbs", reactions: null });
  assert.ok(runFlowsheet(gibbs).blocks.RE1.reaction.generated.length === 1);
  for (const t of REACTORS) assert.ok(setBlockType(fs, "PF1", t).blocks.some(x => x.type === t));
});

test("a rate still being written stops only the kinetic reactors that use it", () => {
  let fs = base();
  fs = { ...fs, reactions: [{ ...fs.reactions[0], rate: { form: "power-law", forward: {} } }] };   // k missing
  const conv = addBlock(fs, "conversion-reactor").fs;
  const used = usedReactions({ ...conv, blocks: conv.blocks.filter(b => b.type !== "pfr") });
  assert.equal(used.reactions[0].rate, undefined);
  assert.ok(usedReactions(conv).reactions[0].rate);
});

test("the Reactor workspace is saved with the project and opens again", () => {
  const s0 = initialState({ components: ["ethanol", "water"] });
  assert.equal(projectOf(s0).reactor, undefined);
  const s1 = applyPatch(s0, { reactor: base() });
  const doc = projectOf(s1);
  assert.equal(doc.reactor.blocks.find(b => b.type === "pfr").spec.L_m, 12.2);
  const back = stateFromProject(JSON.stringify(doc));
  assert.deepEqual(back.reactor.reactions, s1.reactor.reactions);
});
