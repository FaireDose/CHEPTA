// The short run summary of the command line (release 0.6.3; decision 2026-11-27-02; docs/models/tools.md): with
// --summary the full result is written, unchanged, to a file and only a summary is printed; `chepta summary` makes the
// same summary from a saved result. Checked here: a successful flowsheet with a design specification, failed ones
// (NO_CONVERGENCE of a loop and of a design specification, OUT_OF_TIME), one with many warnings; that every warning of
// the full result is in the summary, verbatim or in the de-duplicated list; that the full file is the result printed
// without --summary, byte for byte; and that a missing value stays missing.
// Methods (docs/METHOD_SELECTION.md): methanol + water with NRTL and an ideal-gas vapour near 1 atm. The feed at 250 K
// is below water's records on purpose, to make range warnings; benzene + glycerol with NRTL is used on purpose for its
// missing pair (estimated from Modified UNIFAC 2.0, with a warning; as in test/cli.test.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/api/dispatcher.js";
import { summarizeResult } from "../src/api/summary.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI = join(ROOT, "bin", "chepta.mjs");
const dir = mkdtempSync(join(tmpdir(), "chepta-summary-"));
const cli = (args, input) => {
  const p = spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: "utf8", input, timeout: 120000 });
  return { code: p.status, out: p.stdout, err: p.stderr, json: p.stdout.trim().startsWith("{") ? JSON.parse(p.stdout) : null };
};
const file = (name, obj) => { const f = join(dir, name); writeFileSync(f, JSON.stringify(obj)); return f; };

/** F1 and F2 (make-up water) -> M1 -> X1 (a share of each component to the top) -> SP1 (purge, recycle to M1) */
const loop = ({ T = 320, designSpecs, solver } = {}) => ({ components: ["methanol", "water"], thermo: { model: "NRTL", vapour: "ideal" },
  blocks: [
    { id: "F1", type: "feed", spec: { flow_kmol_h: { methanol: 60, water: 40 }, T_K: T, P_kPa: 101.325 } },
    { id: "F2", type: "feed", spec: { flow_kmol_h: { water: 5 }, T_K: T, P_kPa: 101.325 } },
    { id: "M1", type: "mixer" },
    { id: "X1", type: "separator", spec: { fractions: { methanol: [0.9, "rest"], water: [0.2, "rest"] } } },
    { id: "SP1", type: "splitter", spec: { fractions: [0.1, "rest"] } },
    { id: "TOP", type: "product" }, { id: "PURGE", type: "product" }],
  streams: [
    { id: "S1", from: "F1.out", to: "M1.in" }, { id: "S0", from: "F2.out", to: "M1.in" }, { id: "S2", from: "M1.out", to: "X1.in" },
    { id: "S3", from: "X1.out", to: "TOP.in" }, { id: "S4", from: "X1.out", to: "SP1.in" },
    { id: "S5", from: "SP1.out", to: "PURGE.in" }, { id: "S6", from: "SP1.out", to: "M1.in" }],
  ...(designSpecs ? { designSpecs } : {}), ...(solver ? { solver } : {}) });
const DS = (value, extra = {}) => [{ id: "DS1", vary: { block: "F2", key: "flow_kmol_h", component: "water", min: 0, max: 500 },
  target: { stream: "S6", quantity: "flow_kmol_h", value }, ...extra }];
const req = flowsheet => ({ capability: "solve_flowsheet", input: { flowsheet } });

/** Every warning of a result, found independently of src/api/summary.js: a string under a key that names a warning,
 *  the message of an object there, the messages of the records used outside their range and of the estimated pairs. */
function warningsOf(v, out = []) {
  if (Array.isArray(v)) { for (const x of v) warningsOf(x, out); return out; }
  if (!v || typeof v !== "object") return out;
  for (const [k, x] of Object.entries(v)) {
    if (/warn/i.test(k)) for (const y of [x].flat()) { if (typeof y === "string") out.push(y); else if (typeof y?.message === "string") out.push(y.message); }
    if (k === "extrapolations" || k === "estimated_pairs") for (const y of x ?? []) if (typeof y?.message === "string") out.push(y.message);
    warningsOf(x, out);
  }
  return out;
}
const stringsOf = (v, out = new Set()) => {
  if (typeof v === "string") out.add(v);
  else if (v && typeof v === "object") for (const x of Object.values(v)) stringsOf(x, out);
  return out;
};

test("summary of a small successful flowsheet: which run, outcome, timing, design specification, loop, balance, pointers", () => {
  const input = file("ok.json", req(loop({ designSpecs: DS(300) })));
  const out = join(dir, "ok-full.json");
  const r = cli(["request", input, "--summary", "--out", out]);
  assert.equal(r.code, 0, r.err);
  const s = r.json, full = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(s.chepta_summary, 1);
  assert.equal(s.outcome, "ok");
  assert.equal(s.which.capability, "solve_flowsheet");
  assert.equal(s.which.input_hash, full.reproduction.input_hash);
  assert.equal(s.which.engine.library, full.reproduction.library);
  assert.equal(s.which.input_file, input);
  assert.equal(s.which.full_result_file, out);
  assert.equal(s.elapsed_ms, full.run.elapsed_ms);
  assert.equal(s.timing.total_s, full.run.timing.total_s);
  assert.ok(s.timing.slowest_blocks.length <= 3 && s.timing.slowest_blocks.length > 0);
  const slow = Object.entries(full.run.timing.blocks).sort((a, b) => b[1].s - a[1].s)[0];
  assert.equal(s.timing.slowest_blocks[0].s, slow[1].s);
  const d = s.design_specs[0], fd = full.value.designSpecs[0];
  assert.deepEqual(d.varied, fd.varied);   // block, key, component, value, start, min, max, unit
  assert.equal(d.target.asked, 300); assert.equal(d.target.reached, fd.target.reached); assert.equal(d.target.residual, fd.target.residual);
  assert.equal(d.target.tolerance, fd.target.tolerance); assert.equal(d.met, true); assert.equal(d.solves, fd.solves);
  assert.deepEqual(s.loops, full.checks.loops.map(l => ({ tears: l.tears, iterations: l.iterations, last_change: l.residual, tolerance: l.tolerance })));
  assert.equal(s.balance.material_kmol_h, full.checks.material_kmol_h);
  assert.equal(s.balance.energy_kW, full.checks.energy_kW);
  assert.deepEqual(s.qualifications, full.qualifications);
  for (const p of ["$.value.streams", "$.value.blocks", "$.checks.blocks", "$.run.timing"]) assert.ok(p in s.left_out, p);
  // much shorter than the full result
  assert.ok(r.out.length * 3 < readFileSync(out, "utf8").length, `${r.out.length} vs ${readFileSync(out, "utf8").length}`);
  // the same summary from the saved file (the commit is known only when the run is made from a clone)
  const again = cli(["summary", out, "--input", input]);
  assert.equal(again.code, 0, again.err);
  const strip = x => ({ ...x, which: { ...x.which, engine: { ...x.which.engine, commit: null, local_changes: null } } });
  assert.deepEqual(strip(again.json), strip(s));
});

test("summary of failed flowsheets: the error code, message, where, reason, and the nearest point or the last residual", () => {
  // a design specification out of reach: NO_CONVERGENCE, reason "unreachable", with the nearest value reached
  const un = cli(["request", file("unreach.json", req(loop({ designSpecs: DS(1e6) }))), "--summary"]);
  assert.equal(un.code, 5, un.err);
  const full = JSON.parse(readFileSync(un.json.which.full_result_file, "utf8"));
  assert.equal(un.json.which.full_result_file, join(dir, "unreach.result.json"));   // the default, next to the input
  assert.equal(un.json.outcome, "not_converged");
  assert.equal(un.json.error.code, "NO_CONVERGENCE");
  assert.equal(un.json.error.message, full.error.message);
  assert.deepEqual(un.json.error.where, full.error.where);
  assert.equal(un.json.error.details.reason, "unreachable");
  assert.deepEqual(un.json.error.details.nearest, full.error.details.nearest);
  assert.deepEqual(un.json.error.details.at_bounds, full.error.details.at_bounds);
  assert.ok(un.json.error.left_out.includes("$.error.details.trail"));
  // a recycle loop stopped at its iteration limit: the last residual and the iterations
  const lp = cli(["request", file("loopfail.json", req(loop({ solver: { maxIterations: 2 } }))), "--summary"]);
  assert.equal(lp.code, 5, lp.err);
  const lfull = JSON.parse(readFileSync(lp.json.which.full_result_file, "utf8"));
  assert.equal(lp.json.error.details.last_residual, lfull.error.details.history.at(-1));
  assert.equal(lp.json.error.details.iterations, 2);
  assert.deepEqual(lp.json.error.details.tears, ["S2"]);
  // out of time: the outcome, and no value in either
  const late = cli(["request", file("late.json", req(loop({ designSpecs: DS(300) }))), "--time-ms", "1", "--summary"]);
  assert.equal(late.code, 7, late.err);
  assert.equal(late.json.outcome, "out_of_time");
  const lateFull = JSON.parse(readFileSync(late.json.which.full_result_file, "utf8"));
  assert.equal(late.json.error.code, lateFull.error.code);
  assert.equal(late.json.error.message, lateFull.error.message);
  assert.equal(lateFull.value, undefined);
});

test("every warning of the full result is in the summary, verbatim or in the de-duplicated list of the streams", () => {
  const cases = [
    // a feed below water's records (range warnings on many streams) and a tolerance tighter than the recycles allow
    req(loop({ T: 250, designSpecs: DS(300, { tolerance: 1e-9 }) })),
    // a pair with no stored set, estimated from Modified UNIFAC 2.0
    req({ components: ["benzene", "glycerol"], thermo: { model: "NRTL" },
      blocks: [{ id: "F1", type: "feed", spec: { flow_kmol_h: { benzene: 50, glycerol: 50 }, T_K: 300, P_kPa: 101.325 } }, { id: "P1", type: "product" }],
      streams: [{ id: "S1", from: "F1.out", to: "P1.in" }] }),
  ];
  for (const request of cases) {
    const full = run(request);
    assert.equal(full.outcome, "ok");
    const s = summarizeResult(full);
    const all = warningsOf(full);
    assert.ok(all.length > 0, "the case has warnings");
    const kept = stringsOf(s);
    for (const w of all) assert.ok(kept.has(w), `not in the summary: ${w}`);
    // the streams' warnings: counted, and each distinct message once with its streams
    const perStream = Object.entries(full.value.streams).flatMap(([id, st]) => (st.warnings ?? []).map(w => [id, w]));
    assert.equal(s.range_warnings.streams.count, perStream.length);
    assert.equal(s.range_warnings.streams.distinct, new Set(perStream.map(([, w]) => w)).size);
    for (const [id, w] of perStream) assert.ok(s.range_warnings.streams.messages.find(m => m.warning === w).streams.includes(id));
  }
  const first = summarizeResult(run(cases[0]));
  assert.ok(first.range_warnings.streams.count > first.range_warnings.streams.distinct, "the stream warnings are de-duplicated");
  assert.ok(first.qualifications.warnings.some(w => w.designSpec === "DS1" && /tighter than 100 times/.test(w.message)));
});

test("--summary writes the full result byte for byte as it is printed without it; nothing changes without --summary", () => {
  const input = file("bytes.json", req(loop({ T: 250, designSpecs: DS(300) })));
  const plain = cli(["request", input]);
  assert.equal(plain.code, 0, plain.err);
  assert.equal(plain.json.chepta_result, 1);   // without --summary: the full result on standard output, as before
  assert.equal(existsSync(join(dir, "bytes.result.json")), false);
  for (const compact of [false, true]) {
    const out = join(dir, `bytes-${compact}.json`);
    const plainNow = compact ? cli(["request", input, "--compact"]) : plain;
    const sum = cli(["request", input, "--summary", "--out", out, ...(compact ? ["--compact"] : [])]);
    assert.equal(sum.code, 0, sum.err);
    const written = readFileSync(out, "utf8");
    // two runs differ only in their run record (id, times): put the plain run's record in, in its place, and the
    // text must be the same, byte for byte
    const w = JSON.parse(written);
    const swapped = `${JSON.stringify({ ...w, run: plainNow.json.run }, null, compact ? 0 : 2)}\n`;
    assert.equal(swapped, plainNow.out);
    assert.equal(written, `${JSON.stringify(w, null, compact ? 0 : 2)}\n`);   // and the file is written as stdout is
  }
});

test("a missing value stays missing; the command line refuses a misplaced --out", () => {
  const s = summarizeResult({ chepta_result: 1, capability: "solve_flowsheet", outcome: "missing_data", error: { code: "MISSING_DATA", message: "m", where: [] }, reproduction: { library: "x" } });
  assert.equal(s.elapsed_ms, null);
  assert.equal(s.timing, null);
  assert.equal(s.which.input_hash, null);
  assert.equal(s.which.engine.commit, null);
  assert.equal(s.balance, undefined);   // no checks: no balance, not a balance of 0
  assert.equal(cli(["capabilities", "--summary"]).code, 1);
  assert.equal(cli(["request", file("o.json", req(loop())), "--out", join(dir, "o2.json")]).code, 1);
  assert.equal(cli(["summary", file("notresult.json", { a: 1 })]).code, 1);
});
