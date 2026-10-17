// Flowsheet workspace (proposal 0006, step 5): the canvas edits, DOM-free. Products are
// automatic, so after any edit the structure is complete and only the specifications (the
// degrees of freedom) are left; a flowsheet built with these edits solves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { flowsheetDocStatus, runFlowsheet } from "../src/index.js";
import { emptyFlowsheet } from "../src/flowsheet/document.js";
import { initialState, applyPatch } from "../src/ui/app-logic.js";
import { WORKSPACES } from "../src/ui/workspaces.js";
import {
  addBlock, addFeedTo, connect, deleteBlock, removeBlock, deleteStream, addOutlet, removeOutlet, setSpec, moveBlock, setTear,
  setComponents, openInlets, endOf, streamsOf, setStreamLabel, streamName, setBlockLabel, blockName, feedOf, feedStreamOf,
} from "../src/ui/flowsheet-logic.js";

const base = () => ({ ...emptyFlowsheet(), components: ["ethanol", "water"] });
const structureOk = fs => assert.deepEqual(flowsheetDocStatus(fs).structure, [], "no connection problems");

test("the Flowsheet workspace is in the navigation and keeps its document in the state", () => {
  assert.ok(WORKSPACES.some(w => w.id === "flowsheet"));
  const s = applyPatch(initialState({ components: [] }), { workspace: "flowsheet" });
  assert.equal(s.view, "flowsheet");
  assert.deepEqual(s.flowsheet.blocks, []);
  const s2 = applyPatch(s, { flowsheet: { ...base(), thermo: { model: "uniquac" } } });
  assert.equal(s2.flowsheet.thermo.model, "UNIQUAC");
});

test("placing a unit gives it product streams; the structure is always complete", () => {
  let { fs, id } = addBlock(base(), "flash");
  assert.equal(id, "V1");
  assert.deepEqual(Object.keys(streamsOf(fs, "V1")).sort(), ["liquid", "vapour"]);
  assert.equal(endOf(fs, streamsOf(fs, "V1").vapour[0]).kind, "product");
  ({ fs } = addFeedTo(fs, "V1.in"));
  structureOk(fs);
  const st = flowsheetDocStatus(fs);
  assert.equal(st.ready, false);
  assert.match(st.message, /specifications missing/);
  fs = setSpec(fs, "F1", { flow_kmol_h: { ethanol: 30, water: 70 }, T_K: 300, P_kPa: 101.325 });
  fs = setSpec(fs, "V1", { P_kPa: 101.325, duty_kW: 1200 });
  assert.ok(flowsheetDocStatus(fs).ready);
  const r = runFlowsheet(fs);
  assert.ok(Math.abs(r.energy["Q-V1"].duty_kW - 1200) < 1e-6, "the duty as given");
  assert.ok(r.blocks.V1.state.VF > 0 && r.blocks.V1.state.VF < 1);
  // a value removed by the person: the specification goes back to missing
  assert.equal(flowsheetDocStatus(setSpec(fs, "V1", { duty_kW: "" })).blocks.V1.status, "missing");
});

test("a recycle built with the edits converges", () => {
  let fs = base(), r;
  ({ fs } = addBlock(fs, "mixer"));
  ({ fs } = addFeedTo(fs, "M1.in"));
  ({ fs } = addBlock(fs, "flash"));
  ({ fs } = addBlock(fs, "splitter"));
  const mixOut = streamsOf(fs, "M1").out[0], liquid = streamsOf(fs, "V1").liquid[0];
  fs = connect(fs, mixOut, "V1.in");
  fs = connect(fs, liquid, "SP1.in");
  const back = streamsOf(fs, "SP1").out[0];
  assert.ok(openInlets(fs).includes("M1.in"), "the mixer takes more streams");
  fs = connect(fs, back, "M1.in");
  structureOk(fs);
  assert.equal(fs.blocks.filter(b => b.type === "product").length, 2, "vapour and purge leave");
  fs = setSpec(fs, "F1", { flow_kmol_h: { ethanol: 30, water: 70 }, T_K: 300, P_kPa: 101.325 });
  fs = setSpec(fs, "V1", { T_K: 360, P_kPa: 101.325 });
  fs = setSpec(fs, "SP1", { fractions: [0.7, "rest"] });
  r = runFlowsheet(fs);
  assert.equal(r.loops.length, 1);
  assert.ok(r.loops[0].iterations < 25);
  for (const v of Object.values(r.balance.material_kmol_h)) assert.ok(Math.abs(v) < 1e-6);
  // marking the recycle stream as the tear stream gives the same answer
  const r2 = runFlowsheet(setTear(fs, back, true));
  assert.deepEqual(r2.loops[0].tears, [back]);
  assert.ok(Math.abs(r2.streams[back].F_kmol_h - r.streams[back].F_kmol_h) < 1e-6);
  // sending the recycle out again leaves it as a product
  const open = connect(fs, back, null);
  assert.equal(endOf(open, back).kind, "product");
  structureOk(open);
});

test("deleting blocks, outlets and components keeps the flowsheet consistent", () => {
  let fs = base();
  ({ fs } = addBlock(fs, "heater"));
  ({ fs } = addFeedTo(fs, "E1.in"));
  ({ fs } = addBlock(fs, "separator"));
  fs = connect(fs, streamsOf(fs, "E1").out[0], "X1.in");
  fs = addOutlet(fs, "X1");
  assert.equal(streamsOf(fs, "X1").out.length, 3);
  assert.deepEqual(fs.blocks.find(b => b.id === "X1").spec.fractions.ethanol, [0.5, 0, "rest"]);
  fs = removeOutlet(fs, "X1");
  assert.equal(streamsOf(fs, "X1").out.length, 2);
  structureOk(fs);
  // deleting the separator gives the heater its product back
  const d = deleteBlock(fs, "X1");
  assert.equal(endOf(d, streamsOf(d, "E1").out[0]).kind, "product");
  structureOk(d);
  // deleting the heater keeps its feed and its stream (decision of the maintainer, 2026-10-13: deleting a unit
  // does not delete its streams); the feed's stream now leaves the flowsheet
  const feedStream = streamsOf(d, "E1").in[0];
  const d2 = deleteBlock(d, "E1");
  assert.ok(d2.blocks.some(b => b.id === "F1") && d2.streams.some(s => s.id === feedStream));
  assert.equal(endOf(d2, feedStream).kind, "product");
  structureOk(d2);
  // components: a removed one leaves the feeds and separators; a new one starts at zero
  fs = setSpec(fs, "F1", { flow_kmol_h: { ethanol: 30, water: 70 } });
  const c = setComponents(fs, ["water", "methanol"]);
  assert.deepEqual(c.fs.blocks.find(b => b.id === "F1").spec.flow_kmol_h, { water: 70 });
  assert.deepEqual(Object.keys(c.fs.blocks.find(b => b.id === "X1").spec.fractions).sort(), ["methanol", "water"]);
  assert.match(c.note, /Removed ethanol/);
  assert.equal(moveBlock(fs, "E1", 10.4, 20.6).blocks.find(b => b.id === "E1").x, 10);
});

test("a recycle back into a separator (feed → separator → drum → back to the separator) converges", () => {
  let fs = base();
  ({ fs } = addBlock(fs, "separator"));
  ({ fs } = addFeedTo(fs, "X1.in"));
  ({ fs } = addBlock(fs, "flash"));
  const [top] = streamsOf(fs, "X1").out;
  fs = connect(fs, top, "V1.in");
  const liquid = streamsOf(fs, "V1").liquid[0];
  assert.ok(openInlets(fs).includes("X1.in"), "the separator takes another inlet");
  fs = connect(fs, liquid, "X1.in");
  structureOk(fs);
  fs = setSpec(fs, "F1", { flow_kmol_h: { ethanol: 30, water: 70 }, T_K: 300, P_kPa: 101.325 });
  fs = setSpec(fs, "X1", { fractions: { ethanol: [0.9, "rest"], water: [0.3, "rest"] } });
  fs = setSpec(fs, "V1", { T_K: 355, P_kPa: 101.325 });
  const r = runFlowsheet(fs);
  assert.equal(r.loops.length, 1);
  for (const v of Object.values(r.balance.material_kmol_h)) assert.ok(Math.abs(v) < 1e-6, `balance ${v}`);
});

test("deleting streams: what each kind of stream allows", () => {
  let fs = base(), r;
  ({ fs } = addBlock(fs, "heater"));
  ({ fs } = addFeedTo(fs, "E1.in"));
  ({ fs } = addBlock(fs, "splitter"));
  const hOut = streamsOf(fs, "E1").out[0];
  fs = connect(fs, hOut, "SP1.in");
  fs = addOutlet(fs, "SP1");
  fs = setSpec(fs, "SP1", { fractions: [0.2, 0.3, "rest"] });
  // a stream into a unit: disconnected, it leaves the flowsheet
  r = deleteStream(fs, hOut);
  assert.equal(endOf(r.fs, hOut).kind, "product");
  assert.match(r.note, /now leaves the flowsheet/);
  // the splitter has lost its inlet, and the status says so
  assert.deepEqual(flowsheetDocStatus(r.fs).structure.map(p => p.message), ["Splitter SP1: connect a stream to its in inlet."]);
  // an extra splitter outlet: removed with its fraction ("rest" moves to the last one)
  const outs = streamsOf(fs, "SP1").out;
  r = deleteStream(fs, outs[2]);
  assert.deepEqual(streamsOf(r.fs, "SP1").out, outs.slice(0, 2));
  assert.deepEqual(r.fs.blocks.find(b => b.id === "SP1").spec.fractions, [0.2, "rest"]);
  structureOk(r.fs);
  // with two outlets left, an outlet that already leaves cannot go: the unit needs it
  r = deleteStream(r.fs, streamsOf(r.fs, "SP1").out[0]);
  assert.match(r.note, /every outlet must go somewhere/);
  // a feed's stream: the feed goes with it
  const feedStream = streamsOf(fs, "E1").in[0];
  r = deleteStream(fs, feedStream);
  assert.ok(!r.fs.blocks.some(b => b.type === "feed"));
  assert.match(r.note, new RegExp(`Deleted the feed stream ${feedStream}`));
  // a feed stream that leaves the flowsheet: its Product end goes too, nothing is left behind
  ({ fs } = addBlock(base(), "feed"));
  const [lone] = streamsOf(fs, "F1").out;
  r = deleteStream(fs, lone);
  assert.deepEqual(r.fs.blocks, [], "no feed and no Product end left");
  assert.deepEqual(r.fs.streams, []);
});

test("deleting a unit keeps every stream connected to it", () => {
  // F1 -> V1 (flash) -> vapour to E1 (heater), liquid out; delete V1
  let fs = base();
  ({ fs } = addBlock(fs, "flash"));
  ({ fs } = addFeedTo(fs, "V1.in"));
  ({ fs } = addBlock(fs, "heater"));
  const [inlet] = streamsOf(fs, "V1").in, [vap] = streamsOf(fs, "V1").vapour, [liq] = streamsOf(fs, "V1").liquid;
  fs = connect(fs, vap, "E1.in");
  const before = fs.streams.map(s => s.id).sort();
  const { fs: d, note } = removeBlock(fs, "V1");
  assert.ok(!d.blocks.some(b => b.id === "V1"));
  assert.deepEqual(d.streams.map(s => s.id).sort(), before, "no stream is deleted");
  // the stream into V1 leaves the flowsheet; its feed stays
  assert.equal(endOf(d, inlet).kind, "product");
  assert.ok(d.blocks.some(b => b.id === "F1"));
  // the streams out of V1 start from new feeds and still go where they went
  for (const sid of [vap, liq]) {
    const s = d.streams.find(x => x.id === sid);
    assert.equal(d.blocks.find(b => b.id === s.from.split(".")[0]).type, "feed");
  }
  assert.equal(endOf(d, vap).block, "E1");
  assert.match(note, new RegExp(`${inlet} now leaves the flowsheet`));
  assert.match(note, new RegExp(`${vap}, ${liq} now start as feed streams where V1 was`));
  structureOk(d);
});

test("products of one unit are not drawn on top of each other", () => {
  // a flash whose vapour and liquid both go into a mixer; deleting the mixer gives both back as products
  let fs = base();
  ({ fs } = addBlock(fs, "flash"));
  ({ fs } = addFeedTo(fs, "V1.in"));
  ({ fs } = addBlock(fs, "mixer"));
  fs = connect(fs, streamsOf(fs, "V1").vapour[0], "M1.in");
  fs = connect(fs, streamsOf(fs, "V1").liquid[0], "M1.in");
  const d = deleteBlock(fs, "M1");
  const spots = d.blocks.map(b => `${b.x},${b.y}`);
  assert.equal(new Set(spots).size, spots.length, `two blocks on one spot: ${spots.join(" ")}`);
  structureOk(d);
});

test("deleting a feed deletes its stream too, and nothing is made again in its place", () => {
  // F1 -> V1 (flash); delete V1: its products start from new feeds; delete those feeds
  let fs = base();
  ({ fs } = addBlock(fs, "flash"));
  ({ fs } = addFeedTo(fs, "V1.in"));
  const [vap] = streamsOf(fs, "V1").vapour, [liq] = streamsOf(fs, "V1").liquid;
  ({ fs } = removeBlock(fs, "V1"));
  const feedOf = sid => fs.streams.find(s => s.id === sid).from.split(".")[0];
  for (const sid of [vap, liq]) {
    const fid = feedOf(sid), nBlocks = fs.blocks.length;
    const r = removeBlock(fs, fid);
    assert.ok(!r.fs.blocks.some(b => b.id === fid), `${fid} is deleted`);
    assert.ok(!r.fs.streams.some(s => s.id === sid), `${sid} is deleted with its feed`);
    assert.equal(r.fs.blocks.length, nBlocks - 2, "the feed and the product of its stream go, no new feed appears");
    assert.match(r.note, new RegExp(`Deleted the feed stream ${sid}`));
    fs = r.fs;
    structureOk(fs);
  }
  // a feed into a unit: the unit only loses that inlet
  ({ fs } = addBlock(fs, "heater"));
  ({ fs } = addFeedTo(fs, "E1.in"));
  const [into] = streamsOf(fs, "E1").in, fid = feedOf(into);
  const d = deleteBlock(fs, fid);
  assert.ok(d.blocks.some(b => b.id === "E1"));
  assert.ok(!d.streams.some(s => s.id === into));
  assert.equal(d.blocks.filter(b => b.type === "feed").length, fs.blocks.filter(b => b.type === "feed").length - 1);
});

test("a stream can be given a name, and the name can be cleared", () => {
  let fs = base();
  ({ fs } = addBlock(fs, "flash"));
  ({ fs } = addFeedTo(fs, "V1.in"));
  const [sid] = streamsOf(fs, "V1").in;
  const named = setStreamLabel(fs, sid, "  Crude   feed ");
  assert.equal(named.streams.find(s => s.id === sid).label, "Crude feed");
  assert.equal(streamName(named.streams.find(s => s.id === sid)), "Crude feed");
  assert.equal(fs.streams.find(s => s.id === sid).label, undefined, "the original document is not changed");
  for (const empty of ["", "   ", sid]) {
    const s = setStreamLabel(named, sid, empty).streams.find(x => x.id === sid);
    assert.equal(s.label, undefined);
    assert.equal(streamName(s), sid);
  }
  assert.equal(setStreamLabel(fs, sid, "x".repeat(60)).streams.find(s => s.id === sid).label.length, 40);
  assert.throws(() => setStreamLabel(fs, "S99", "a"), /No stream S99/);
  // a named flowsheet is a valid document and solves the same
  structureOk(named);
  assert.equal(flowsheetDocStatus(named).ok, flowsheetDocStatus(fs).ok);
});

test("a feed or a unit can be given a name; a product end cannot", () => {
  let fs = base();
  ({ fs } = addBlock(fs, "flash"));
  ({ fs } = addFeedTo(fs, "V1.in"));
  const fid = fs.blocks.find(b => b.type === "feed").id, pid = fs.blocks.find(b => b.type === "product").id;
  let named = setBlockLabel(fs, "V1", " Flash   drum 1 ");
  named = setBlockLabel(named, fid, "Crude");
  assert.equal(blockName(named.blocks.find(b => b.id === "V1")), "Flash drum 1");
  assert.equal(blockName(named.blocks.find(b => b.id === fid)), "Crude");
  assert.equal(fs.blocks.find(b => b.id === "V1").label, undefined, "the original document is not changed");
  for (const empty of ["", "  ", "V1"]) assert.equal(blockName(setBlockLabel(named, "V1", empty).blocks.find(b => b.id === "V1")), "V1");
  assert.throws(() => setBlockLabel(fs, pid, "End"), /give the stream a name instead/);
  assert.throws(() => setBlockLabel(fs, "X9", "a"), /No block X9/);
  // the names change nothing in the connections, so the flowsheet is valid and solves the same
  structureOk(named);
  assert.deepEqual(named.streams, fs.streams);
});

test("on the drawing a feed is its stream: feedOf and feedStreamOf", () => {
  let fs = base();
  ({ fs } = addBlock(fs, "flash"));
  const r = addFeedTo(fs, "V1.in");
  fs = r.fs;
  assert.equal(feedOf(fs, r.stream).id, r.id);
  assert.equal(feedStreamOf(fs, r.id).id, r.stream);
  const [vap] = streamsOf(fs, "V1").vapour;
  assert.equal(feedOf(fs, vap), null, "a unit's outlet is not a feed stream");
  assert.equal(feedStreamOf(fs, "V1")?.id, vap, "feedStreamOf is only asked of feeds; for a unit it gives its first outlet");
  // the name of a feed stream is the stream's name
  fs = setStreamLabel(fs, r.stream, "Wine");
  assert.equal(streamName(feedStreamOf(fs, r.id)), "Wine");
});

// The flowsheet uses the parameter sets of the Library (the rule for every pair, and a pair's own choice), as the
// diagrams and the flash do (the maintainer, 2026-10-17). NRTL for ethanol + water at 1 atm (docs/METHOD_SELECTION.md).
test("the flowsheet follows the Library's rule and a pair's chosen set", async () => {
  const { calculatedFlowsheet, setsLabel } = await import("../src/ui/app-logic.js");
  const { flowsheetKey } = await import("../src/ui/flowsheet-view.js");
  let { fs } = addBlock(base(), "flash");
  ({ fs } = addFeedTo(fs, "V1.in"));
  fs = setSpec(fs, "F1", { flow_kmol_h: { ethanol: 30, water: 70 }, T_K: 300, P_kPa: 101.325 });
  fs = setSpec(fs, "V1", { P_kPa: 101.325, VF: 0.4 });
  const state = applyPatch(initialState({ components: ["ethanol", "water"] }), { workspace: "flowsheet", flowsheet: { ...fs, thermo: { model: "NRTL" } } });
  const T = st => runFlowsheet(calculatedFlowsheet(st)).blocks.V1.state.T_K;
  // the defaults: the flowsheet as it is
  assert.equal(calculatedFlowsheet(state), state.flowsheet);
  assert.equal(setsLabel(state), "each pair's default");
  const Tdef = T(state);
  // "Databank only": the ChemSep set, the same as naming it in the flowsheet document
  const bank = applyPatch(state, { prefer: "databank" });
  assert.deepEqual(calculatedFlowsheet(bank).thermo.prefer, ["databank"]);
  assert.equal(T(bank), runFlowsheet({ ...state.flowsheet, thermo: { model: "NRTL", sets: { "ethanol+water": "chemsep" } } }).blocks.V1.state.T_K);
  assert.notEqual(T(bank), Tdef);
  assert.notEqual(flowsheetKey(bank), flowsheetKey(state), "a new rule calculates the flowsheet again");
  // a pair's own set (chosen in a diagram's Inputs panel)
  const hand = applyPatch(state, { sets: { "water+ethanol": "fitted-kamihama2012-etal" } });
  assert.equal(T(hand), runFlowsheet({ ...state.flowsheet, thermo: { model: "NRTL", sets: { "ethanol+water": "fitted-kamihama2012-etal" } } }).blocks.V1.state.T_K);
  assert.match(setsLabel(hand), /1 pair set by hand/);
  // the same set name under UNIQUAC is used too; Peng-Robinson has no set of that name, so the choice is not passed
  const uq = applyPatch(hand, { flowsheet: { ...hand.flowsheet, thermo: { model: "UNIQUAC" } } });
  assert.deepEqual(calculatedFlowsheet(uq).thermo.sets, { "ethanol+water": "fitted-kamihama2012-etal" });
  const pr = applyPatch(hand, { flowsheet: { ...hand.flowsheet, thermo: { model: "PR" } } });
  assert.equal(calculatedFlowsheet(pr), pr.flowsheet);
});
