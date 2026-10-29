// The command line (bin/chepta.mjs; proposal 0015, milestone M1, W8): the same saved input gives the same numbers as the
// library, a missing-data request stays missing_data with no value, the notes and the reproduction block survive, and
// each outcome has its exit code. The flowsheets are ethanol + water with NRTL and an ideal-gas vapour, the method
// docs/METHOD_SELECTION.md gives for this pair near 1 atm; benzene + glycerol with NRTL is used on purpose for its
// missing pair (as in test/api.test.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/api/dispatcher.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI = join(ROOT, "bin", "chepta.mjs");
const EXAMPLE = join(ROOT, "examples", "heater-flash.chepta.json");
const project = JSON.parse(readFileSync(EXAMPLE, "utf8"));
const dir = mkdtempSync(join(tmpdir(), "chepta-cli-"));

const cli = (args, input) => {
  const p = spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: "utf8", input, timeout: 60000 });
  return { code: p.status, out: p.stdout, err: p.stderr, json: p.stdout.trim().startsWith("{") ? JSON.parse(p.stdout) : null };
};
const file = (name, obj) => { const f = join(dir, name); writeFileSync(f, JSON.stringify(obj)); return f; };
/** What must be the same through every path: everything but the run's id and times. */
const same = r => { const { run: _run, ...rest } = JSON.parse(JSON.stringify(r)); return rest; };

// a pump without its efficiency: the result carries a note (the typical value used)
const PUMP = { components: ["ethanol", "water"], thermo: { model: "NRTL", vapour: "ideal" },
  blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { ethanol: 40, water: 60 }, T_K: 300, P_kPa: 101.325 } },
    { id: "M1", type: "pump", spec: { P_kPa: 300 } }, { id: "P1", type: "product" }],
  streams: [{ id: "S1", from: "F1.out", to: "M1.in" }, { id: "S2", from: "M1.out", to: "P1.in" }] };
const MISSING = { components: ["benzene", "glycerol"], thermo: { model: "NRTL" },
  blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { benzene: 50, glycerol: 50 }, T_K: 300, P_kPa: 101.325 } }, { id: "P1", type: "product" }],
  streams: [{ id: "S1", from: "F1.out", to: "P1.in" }] };

test("chepta run: the saved project gives the library's numbers, identical, with its reproduction block", () => {
  const r = cli(["run", EXAMPLE]);
  assert.equal(r.code, 0, r.err);
  const lib = run({ capability: "solve_flowsheet", input: { project } });
  // identical, not only within a tolerance: the same code on the same input (JSON keeps every digit of a double)
  assert.deepEqual(same(r.json), same(lib));
  assert.equal(r.json.reproduction.input_hash, lib.reproduction.input_hash);
  assert.equal(r.json.reproduction.databank_hash, lib.reproduction.databank_hash);
  assert.equal(r.json.run.status, "done");
  assert.equal(r.json.value.blocks.V1.state.T_K, lib.value.blocks.V1.state.T_K);
});

test("chepta request: notes and qualifications survive; missing data stays missing data, with no value", () => {
  const ok = cli(["request", file("pump.json", { capability: "solve_flowsheet", input: { flowsheet: PUMP } })]);
  assert.equal(ok.code, 0, ok.err);
  assert.deepEqual(same(ok.json), same(run({ capability: "solve_flowsheet", input: { flowsheet: PUMP } })));
  assert.match(ok.json.qualifications.notes[0].note, /typical value; give the pump's own/);
  const md = cli(["request", file("missing.json", { capability: "solve_flowsheet", input: { flowsheet: MISSING } })]);
  assert.equal(md.code, 3);
  assert.equal(md.json.outcome, "missing_data");
  assert.equal(md.json.value, undefined);
  assert.match(md.json.error.message, /No NRTL parameters for: Benzene \+ Glycerol/);
  // standard input, and the capabilities
  const caps = cli(["request", "-", "--compact"], JSON.stringify({ capability: "capabilities", input: {} }));
  assert.equal(caps.code, 0);
  assert.equal(caps.out.trim().split("\n").length, 1);
  assert.deepEqual(cli(["capabilities"]).json.value, caps.json.value);
});

test("chepta: exit codes per outcome, and the command line's own errors", () => {
  assert.equal(cli(["request", file("bad.json", { capability: "solve_flowsheet", input: {} })]).code, 2);
  assert.equal(cli(["request", file("col.json", { capability: "solve_column", input: { components: ["benzene", "toluene"], thermo: { model: "ideal" },
    feed: { flow_kmol_h: { benzene: 50, toluene: 50 }, P_kPa: 101.325, VF: 0 }, column: { mode: "rigorous", stages: 10, feed_stage: 5, reflux_ratio: 2, distillate_purity: 0.99 } } })]).code, 4);   // a purity: M4 (the rigorous mode itself landed with M2a)
  const late = cli(["run", EXAMPLE, "--time-ms", "1"]);
  assert.equal(late.code, 7);
  assert.equal(late.json.outcome, "out_of_time");
  assert.equal(late.json.value, undefined);
  for (const args of [[], ["nonsense"], ["run"], ["run", join(dir, "nowhere.json")], ["run", EXAMPLE, "--time-ms", "-3"]]) {
    assert.equal(cli(args).code, 1, args.join(" "));
  }
  const notJson = join(dir, "x.json");
  writeFileSync(notJson, "{ not json");
  assert.match(cli(["run", notJson]).err, /not JSON/);
  assert.match(cli(["--version"]).out, /^\d+\.\d+\.\d+/);
});
