// Writes src/data/vle-points.json: the measured binary vapour-liquid sets of validation/data/ in a compact form, for the
// diagrams of the interface (proposal 0021, answer 7: the measured points on the T-x-y and P-x-y diagrams).
//
//   node scripts/vle-points.mjs            write the file
//   node scripts/vle-points.mjs --check    exit 1 when the file is not what the data files give
//
// Taken: every file of validation/data/, validation/data/vle/ and validation/data/eos/ with two components, rows, and
// the columns x_1 with T_K, and y_1 or P_kPa or a pressure of the whole set (a missing x_1 or y_1 of a row is null). Of each row only T_K, P_kPa, x_1 and y_1
// are kept, as they are in the file (no conversion, no rounding); the citation stays in src/data/sources.json, which
// lists each file. Nothing is calculated here and no point is added: a pair without such a file has no entry.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../validation/data/", import.meta.url);
const OUT = new URL("../src/data/vle-points.json", import.meta.url);
const KEEP = ["T_K", "P_kPa", "x_1", "y_1"];

export function vlePoints() {
  const sets = [], skipped = [];
  for (const dir of ["", "vle/", "eos/"]) {
    for (const name of readdirSync(new URL(dir, ROOT)).filter(n => n.endsWith(".json")).sort()) {
      const file = dir + name;
      const d = JSON.parse(readFileSync(new URL(file, ROOT), "utf8"));
      if (!d || Array.isArray(d) || !Array.isArray(d.rows) || !Array.isArray(d.columns)) continue;
      const kind = String(d.kind ?? "");
      if (!/^(isobaric|isothermal|tpx)/.test(kind)) continue;
      const cols = KEEP.filter(c => d.columns.includes(c));
      const P = typeof d.P_kPa === "number" ? d.P_kPa : null, T = typeof d.T_K === "number" ? d.T_K : null;
      const ok = Array.isArray(d.components) && d.components.length === 2 && d.rows.length && cols.includes("x_1")
        && (cols.includes("T_K") || T != null) && (cols.includes("P_kPa") || P != null) && (cols.includes("y_1") || cols.includes("P_kPa") || cols.includes("T_K"));
      if (!ok) { skipped.push(file); continue; }
      const at = cols.map(c => d.columns.indexOf(c));
      const rows = d.rows.map(r => at.map(i => r[i]));
      // a row may lack x_1 or y_1 (a bubble or a dew point alone: null), never both, nor its temperature or pressure
      const num = v => typeof v === "number" && Number.isFinite(v);
      const xi = cols.indexOf("x_1"), yi = cols.indexOf("y_1");
      const good = r => r.every((v, i) => num(v) || (v === null && (i === xi || i === yi))) && (num(r[xi]) || num(r[yi]));
      if (!rows.every(good)) { skipped.push(file); continue; }
      sets.push({
        file, components: d.components, kind: kind.split(" ")[0],
        ...(P != null && !cols.includes("P_kPa") ? { P_kPa: P } : {}), ...(T != null && !cols.includes("T_K") ? { T_K: T } : {}),
        ...(d.source?.tables ? { tables: d.source.tables } : {}), columns: cols, rows,
      });
    }
  }
  return {
    doc: {
      _about: "Measured binary vapour-liquid sets of validation/data/, written by scripts/vle-points.mjs (never by hand): of each row the columns T_K, P_kPa, x_1 (liquid mole fraction of the first component) and y_1 (vapour), as in the data file; P_kPa or T_K of a whole set beside it. The citation of a file is the source of src/data/sources.json that lists it. Shown on the diagrams; the fits read the data files themselves.",
      sets,
    },
    skipped,
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const { doc, skipped } = vlePoints();
  const text = JSON.stringify(doc) + "\n";
  if (process.argv.includes("--check")) {
    if (readFileSync(OUT, "utf8") !== text) { console.error("src/data/vle-points.json is not what validation/data gives: run node scripts/vle-points.mjs"); process.exit(1); }
    console.log("src/data/vle-points.json is up to date.");
  } else {
    writeFileSync(OUT, text);
    console.log(`Wrote src/data/vle-points.json: ${doc.sets.length} sets, ${doc.sets.reduce((n, s) => n + s.rows.length, 0)} points, ${(text.length / 1024).toFixed(0)} kB.`);
    if (skipped.length) console.log(`Not taken (another layout): ${skipped.join(", ")}`);
  }
}
