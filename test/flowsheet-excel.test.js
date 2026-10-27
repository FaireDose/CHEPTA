// Excel export of a flowsheet (src/ui/flowsheet-excel.js, src/ui/xlsx.js): a valid zip of
// spreadsheet XML; formulas where Excel can calculate (feeds, mixers, splitters, separators,
// totals, duties) and values from CHEPTA where the thermodynamic model is needed (drums).
// The workbooks were also opened and recalculated in LibreOffice (see the pull request).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";
import { runFlowsheet, normalizeFlowsheet } from "../src/index.js";
import { crc32, colName, xlsx } from "../src/ui/xlsx.js";
import { flowsheetSheets, flowsheetXlsx } from "../src/ui/flowsheet-excel.js";

/** The stored entries of a zip: { path: text }, checking each CRC-32. */
function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), dec = new TextDecoder(), out = {};
  for (let p = 0; dv.getUint32(p, true) === 0x04034b50;) {
    const method = dv.getUint16(p + 8, true), crc = dv.getUint32(p + 14, true), size = dv.getUint32(p + 18, true);
    const nlen = dv.getUint16(p + 26, true), xlen = dv.getUint16(p + 28, true);
    const name = dec.decode(bytes.subarray(p + 30, p + 30 + nlen)), data = bytes.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + size);
    assert.equal(method, 0, "stored");
    assert.equal(crc32(data), crc, `CRC of ${name}`);
    out[name] = dec.decode(data);
    p += 30 + nlen + xlen + size;
  }
  return out;
}

test("the zip writer: CRC-32 as Node's zlib computes it; column names", () => {
  for (const t of ["", "a", "CHEPTA", "x".repeat(1000)]) assert.equal(crc32(new TextEncoder().encode(t)), zlib.crc32(t));
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(colName), ["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  const files = unzip(xlsx([{ name: "S", rows: [["a", 1, { f: "B1*2", v: 2 }]] }]));
  assert.ok(files["xl/workbook.xml"].includes('<sheet name="S"'));
  assert.ok(files["xl/worksheets/sheet1.xml"].includes("<f>B1*2</f><v>2</v>"));
});

test("a recycle flowsheet: formulas for the balances, values for the drum, iterative calculation on", () => {
  const p = JSON.parse(readFileSync(new URL("../examples/flowsheet-recycle.chepta.json", import.meta.url)));
  const fs = normalizeFlowsheet(p.flowsheet), res = runFlowsheet(fs);
  const files = unzip(flowsheetXlsx(fs, res, { version: "test" }));
  assert.ok(files["xl/workbook.xml"].includes('iterate="1"'), "circular references allowed (recycles)");
  const { sheets } = flowsheetSheets(fs, res);
  const streams = sheets.find(s => s.name === "Streams"), header = streams.rows[0].map(c => c?.v ?? c);
  const cell = (label, sid) => streams.rows.find(r => r?.[0] === label)[header.indexOf(sid)];
  // S1 (feed): from the Inputs sheet; S2 (mixer): sum of its inlets; S5 (splitter): inlet × fraction
  assert.match(cell("Flow Ethanol", "S1").f, /^Inputs!C\d+$/);
  assert.match(cell("Flow Ethanol", "S2").f, /^[A-Z]+\d+\+[A-Z]+\d+$/);
  assert.match(cell("Flow Ethanol", "S5").f, /\*Inputs!C\d+$/);
  // S3 (drum vapour): a value from CHEPTA, marked as such
  assert.equal(cell("Flow Ethanol", "S3").s, "value");
  assert.ok(Math.abs(cell("Flow Ethanol", "S3").v - res.streams.S3.flows[0]) < 1e-12);
  // cached values are CHEPTA's results
  assert.ok(Math.abs(cell("Flow Water", "S5").v - res.streams.S5.flows[1]) < 1e-12);
  assert.match(cell("Mass flow", "S2").f, /^SUMPRODUCT\(/);
  // the splitter's "rest" fraction is 1 minus the others
  const inputs = sheets.find(s => s.name === "Inputs");
  assert.ok(inputs.rows.some(r => r?.[2]?.f?.startsWith("1-SUM(")), "rest fraction as a formula");
  // the drum's duty: enthalpy flows out minus in
  const energy = sheets.find(s => s.name === "Energy and balances");
  const q = energy.rows.find(r => r?.[0] === "Q-V1");
  assert.match(q[2].f, /^Streams!/);
  assert.ok(Math.abs(q[2].v - res.energy["Q-V1"].duty_kW) < 1e-9);
});

test("the concept model: drums as formulas (K = γ Psat / P, Rachford-Rice), recycles solved by passes, no circular reference", () => {
  const p = JSON.parse(readFileSync(new URL("../examples/flowsheet-recycle.chepta.json", import.meta.url)));
  const fs = normalizeFlowsheet(p.flowsheet), res = runFlowsheet(fs);
  const w = flowsheetSheets(fs, res, { concept: true });
  assert.equal(w.circular, false);
  const files = unzip(flowsheetXlsx(fs, res, { concept: true }));
  assert.ok(!files["xl/workbook.xml"].includes('iterate="1"'), "no iterative calculation needed");
  const sheet = name => w.sheets.find(s => s.name === name);
  const streams = sheet("Streams"), header = streams.rows[0].map(c => c?.v ?? c);
  const cell = (label, sid) => streams.rows.find(r => r?.[0] === label)[header.indexOf(sid)];
  // the drum outlets (S3 vapour, S4 liquid) are formulas on the Flash models sheet; the tear stream comes from the last pass
  assert.match(cell("Flow Ethanol", "S3").f, /^'Flash models'!N\d+$/);
  assert.match(cell("Flow Water", "S4").f, /^'Flash models'!O\d+$/);
  assert.match(cell("Temperature", "S3").f, /^'Flash models'!B\d+$/);
  const tear = res.loops[0].tears[0];
  assert.match(cell("Flow Ethanol", tear).f, /^'Recycle passes'!/);
  // Flash models: Psat as the DIPPR 101 formula, K = γ Psat / P, and γ chosen so that K is CHEPTA's y / x
  const fm = sheet("Flash models").rows;
  const eth = fm.find(r => r?.[0] === "Ethanol");
  assert.match(eth[8].f, /^EXP\(D\d+\+E\d+\/\$B\$\d+\+F\d+\*LN\(\$B\$\d+\)\+G\d+\*\$B\$\d+\^H\d+\)\/1000$/);
  assert.match(eth[10].f, /^J\d+\*I\d+\/\$B\$\d+$/);
  const [A, B, C, D, E] = eth.slice(3, 8).map(c => c.v);
  const T = res.blocks.V1.state.T_K, P = res.blocks.V1.state.P_kPa;
  const psat = Math.exp(A + B / T + C * Math.log(T) + D * T ** E) / 1000;
  const y = res.streams.S3.z[0], x = res.streams.S4.z[0];
  assert.ok(Math.abs(eth[9].v * psat / P / (y / x) - 1) < 1e-12, "γ reproduces CHEPTA's K");
  assert.equal(eth[9].s, "input");
  // the vapour fraction: bisection rows; cached value CHEPTA's
  const vfRow = fm.find(r => r?.[0] === "Vapour fraction VF");
  assert.ok(Math.abs(vfRow[1].v - res.blocks.V1.state.VF) < 1e-12);
  assert.ok(fm.filter(r => /^step \d+$/.test(r?.[0] ?? "")).length === 50);
  // recycle passes: direct substitution, then bounded Wegstein
  const passes = sheet("Recycle passes").rows;
  assert.ok(passes.some(r => r?.some(c => /^MAX\(0,[A-Z]+\d+\*[A-Z]+\d+\+\(1-[A-Z]+\d+\)\*[A-Z]+\d+\)$/.test(c?.f ?? ""))), "Wegstein step");
  assert.ok(passes.some(r => r?.some(c => /MIN\(0,MAX\(-5,/.test(c?.f ?? ""))), "q bounded to [-5, 0]");
  // the export without the concept model is unchanged: drum outlets are values, iterative calculation on
  assert.equal(flowsheetSheets(fs, res).circular, true);
  assert.ok(!flowsheetSheets(fs, res).sheets.some(s => s.name === "Flash models"));
});

test("a conversion reactor: its outlet flows are formulas of the conversions (in parallel and in series), its duty adds the heat of the reactions", () => {
  // methanol synthesis and the reverse water-gas shift on one key (CO2), Peng-Robinson (gases above their critical
  // temperatures, as in test/reactors.test.js)
  const reactions = [
    { id: "meoh", name: "Methanol", stoichiometry: { "carbon-dioxide": -1, hydrogen: -3, methanol: 1, water: 1 }, phase: "vapour" },
    { id: "rwgs", name: "RWGS", stoichiometry: { "carbon-dioxide": -1, hydrogen: -1, "carbon-monoxide": 1, water: 1 }, phase: "vapour" },
  ];
  for (const order of ["parallel", "series"]) {
    const fs = normalizeFlowsheet({
      components: ["carbon-dioxide", "hydrogen", "methanol", "water", "carbon-monoxide"], thermo: { model: "PR" }, reactions,
      blocks: [
        { id: "F1", type: "feed", spec: { flow_kmol_h: { "carbon-dioxide": 100, hydrogen: 300 }, T_K: 523.15, P_kPa: 5000 } },
        { id: "R1", type: "conversion-reactor", spec: { reactions: [{ reaction: "meoh", key: "carbon-dioxide", conversion: 0.3 }, { reaction: "rwgs", key: "carbon-dioxide", conversion: 0.2 }], order, T_K: 523.15 } },
        { id: "P1", type: "product" },
      ],
      streams: [{ id: "S1", from: "F1.out", to: "R1.in" }, { id: "S2", from: "R1.out", to: "P1.in" }],
    });
    const res = runFlowsheet(fs);
    const { sheets } = flowsheetSheets(fs, res);
    const byName = Object.fromEntries(sheets.map(s => [s.name, s.rows]));
    // a small evaluator: the references replaced by the cells' cached values (inputs and formulas alike)
    const valueOf = (sheet, ref) => {
      const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref), col = [...m[1]].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const c = byName[sheet][+m[2] - 1][col];
      return typeof c === "object" && c !== null ? c.v : c;
    };
    const evaluate = f => Function(`return ${f.replace(/(?:(Inputs|Streams)!)?(\$?[A-Z]+\$?\d+)/g, (_, sh, ref) => String(valueOf(sh ?? "Streams", ref)))}`)();
    const streams = byName.Streams, header = streams[0].map(c => c?.v ?? c);
    res.streams.S2.flows.forEach((v, i) => {
      const cell = streams[6 + i][header.indexOf("S2")];
      assert.ok(cell.f, `${order}: component ${i} is a formula`);
      assert.ok(Math.abs(evaluate(cell.f) - v) < 1e-9 * 400, `${order}: the formula gives ${evaluate(cell.f)}, CHEPTA ${v}`);
    });
    // the conversions are inputs
    assert.ok(byName.Inputs.some(r => /Methanol: conversion of/.test(r?.[0] ?? "") && r[2]?.s === "input"));
    // the duty: out minus in plus the heat of the reactions
    const q = byName["Energy and balances"].find(r => r?.[0] === "Q-R1");
    assert.match(q[3], /plus the heat of the reactions/);
    assert.ok(Math.abs(q[2].v - res.blocks.R1.duty_kW) < 1e-9);
  }
});

test("an equilibrium reactor: its outlet flows are values from CHEPTA, its K and extents listed on the Inputs sheet", () => {
  // Peng-Robinson, as for the conversion reactor above (gases above their critical temperatures)
  const fs = normalizeFlowsheet({
    components: ["carbon-dioxide", "hydrogen", "methanol", "water"], thermo: { model: "PR" },
    reactions: [{ id: "meoh", name: "Methanol", stoichiometry: { "carbon-dioxide": -1, hydrogen: -3, methanol: 1, water: 1 }, phase: "vapour" }],
    blocks: [
      { id: "F1", type: "feed", spec: { flow_kmol_h: { "carbon-dioxide": 100, hydrogen: 300 }, T_K: 523.15, P_kPa: 5000 } },
      { id: "RE1", type: "equilibrium-reactor", spec: { reactions: ["meoh"], T_K: 523.15 } },
      { id: "P1", type: "product" },
    ],
    streams: [{ id: "S1", from: "F1.out", to: "RE1.in" }, { id: "S2", from: "RE1.out", to: "P1.in" }],
  });
  const res = runFlowsheet(fs);
  const byName = Object.fromEntries(flowsheetSheets(fs, res).sheets.map(s => [s.name, s.rows]));
  const streams = byName.Streams, col = streams[0].map(c => c?.v ?? c).indexOf("S2");
  res.streams.S2.flows.forEach((v, i) => {
    const cell = streams[6 + i][col];
    assert.ok(!cell.f && Math.abs(cell.v - v) < 1e-12, `component ${i}: a value`);
  });
  const k = byName.Inputs.find(r => /^Methanol: K at 523\.15 K$/.test(r?.[0] ?? ""));
  assert.ok(Math.abs(k[2].v - res.blocks.RE1.reaction.equilibrium.reactions.meoh.K) < 1e-12);
});
