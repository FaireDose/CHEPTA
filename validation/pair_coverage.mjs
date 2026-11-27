#!/usr/bin/env node
/**
 * Which parameter set each gas + liquid pair of a mixture has, per method, so that a pair without one is seen before a
 * case is run (2026-11-25: Lab's methanol separator holds N2, which had no set for PR + gE (MHV1); the pairs had been
 * chosen from an earlier separator without it; docs/decisions/2026-11-25-01-nitrogen-mhv1.md).
 *
 * For every pair of a light gas (the gases of src/thermo/method-advice.js RULE_GASES, or a component whose critical
 * temperature is below 310 K) with a component that is not one, it prints:
 *   - PR and SRK k_ij: the set src/data/kij.json gives by default (tier and set), "refused" where the record says the
 *     pair may not be used in the liquid, or "none (k_ij = 0)";
 *   - PR + gE (MHV1) and SRK + gE (MHV1): what the engine itself does (system() is built and asked): the set fitted
 *     inside the rule (src/data/mhv1.json), the pair's databank NRTL set carried into the rule, g^E = 0, or "REFUSED";
 *   - NRTL (activity model): the default set of src/data/binaries.json, or "none" (the engine then estimates it from
 *     Modified UNIFAC 2.0, tier predicted; DATA_RULES.md section 5);
 *   - Henry: an entry of src/data/henry.json for the gas in this solvent (used by the activity models).
 * With --all it prints every pair, not only gas + liquid. Nothing is decided here; it reads the data and the engine.
 *
 * Usage: node validation/pair_coverage.mjs carbon-dioxide hydrogen carbon-monoxide nitrogen methanol water [--all] [--md]
 */
import { readFileSync } from "node:fs";
import { system } from "../src/index.js";
import { choosePair } from "../src/thermo/library.js";
import { RULE_GASES } from "../src/thermo/method-advice.js";

const ROOT = new URL("../", import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, ROOT), "utf8"));
const COMPS = read("src/data/components.json");
const comp = id => COMPS.components[id];
const HENRY = read("src/data/henry.json").pairs;

export const isGas = id => RULE_GASES.has(id) || (comp(id)?.Tc_K != null && comp(id).Tc_K < 310);

function kij(model, a, b) {
  const c = choosePair(model, a, b);
  if (!c) return "none (k_ij = 0)";
  const p = c.chosen;
  if (p.not_usable) return `refused (${p.set}, ${p.tier})`;
  return `${p.tier}${p.set ? ` (${p.set})` : ""}${p.quality_warning ? ", fit-quality warning" : ""}`;
}

function mhv1(model, a, b) {
  try {
    const s = system({ components: [a, b], model, mixing: "MHV1" });
    const p = s.info.pairs[0];
    if (p.tier === "none") return "g^E = 0 (no set)";
    return `${p.set === "mhv1-fitted" ? "fitted in the rule" : `databank NRTL (${p.set ?? p.tier})`}${p.quality_warning ? ", fit-quality warning" : ""}`;
  } catch (e) {
    return e?.code === "NOT_AVAILABLE" ? `REFUSED${/critical/i.test(e.message) ? " (no critical constants)" : ""}` : `error: ${e.message.slice(0, 60)}`;
  }
}

function nrtl(a, b) {
  const c = choosePair("NRTL", a, b);
  return c ? `${c.chosen.tier} (${c.chosen.set})` : "none (Mod. UNIFAC 2.0 estimate at run time)";
}

const henry = (g, l) => (HENRY.some(h => h.gas === g && h.solvent === l) ? "yes" : "no");

/** The rows for a list of component ids. */
export function coverage(ids, { all = false } = {}) {
  for (const id of ids) if (!comp(id)) throw new Error(`unknown component id: ${id}`);
  const rows = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    let [a, b] = [ids[i], ids[j]];
    if (isGas(b) && !isGas(a)) [a, b] = [b, a];
    const gasLiquid = isGas(a) && !isGas(b);
    if (!all && !gasLiquid) continue;
    rows.push({ pair: `${a} + ${b}`, kind: gasLiquid ? "gas + liquid" : isGas(a) ? "gas + gas" : "liquid + liquid",
      "PR k_ij": kij("PR", a, b), "SRK k_ij": kij("SRK", a, b), "PR + gE (MHV1)": mhv1("PR", a, b), "SRK + gE (MHV1)": mhv1("SRK", a, b),
      NRTL: nrtl(a, b), Henry: gasLiquid ? henry(a, b) : "" });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const ids = args.filter(a => !a.startsWith("--"));
  if (!ids.length) { console.error("Usage: node validation/pair_coverage.mjs ID ID ... [--all] [--md]"); process.exit(1); }
  const rows = coverage(ids, { all: args.includes("--all") });
  const cols = ["pair", "kind", "PR k_ij", "SRK k_ij", "PR + gE (MHV1)", "SRK + gE (MHV1)", "NRTL", "Henry"];
  if (args.includes("--md")) {
    console.log(`| ${cols.join(" | ")} |\n|${cols.map(() => "---").join("|")}|`);
    for (const r of rows) console.log(`| ${cols.map(c => r[c]).join(" | ")} |`);
  } else {
    const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c]).length)));
    console.log(cols.map((c, k) => c.padEnd(w[k])).join("  "));
    for (const r of rows) console.log(cols.map((c, k) => String(r[c]).padEnd(w[k])).join("  "));
  }
  const gaps = rows.filter(r => /REFUSED|none \(k_ij|g\^E = 0|refused/.test(Object.values(r).join(" ")));
  console.log(`\n${rows.length} pairs; ${gaps.length} with a method that refuses or has no set: ${gaps.map(r => r.pair).join(", ") || "none"}`);
}
