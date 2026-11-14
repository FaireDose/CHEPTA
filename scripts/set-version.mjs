// Set CHEPTA's version everywhere it is written, so a release never fails on a forgotten file:
// package.json, package-lock.json, the README's status line, and every CDN link (chepta@x.y.z) in the pages and
// instructions people and assistants copy (every .md and .html file except the design documents and decision records,
// which keep the versions they mention: VERSION_EXEMPT). test/versions.test.js checks the same files.
//
//   node scripts/set-version.mjs 0.5.0      (also accepts v0.5.0, V0.5.0 and v.0.5.0, as release tags are typed)
//
// Used by .github/workflows/publish.yml with the release's tag; also by hand. Prints the files it changed; running it
// twice changes nothing the second time.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/** "v0.5.0", "V0.5.0", "v.0.5.0" or "0.5.0" → "0.5.0"; throws when it is not a version. */
export function normalizeVersion(tag) {
  const v = String(tag ?? "").trim().replace(/^[vV]\.?/, "");
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(v)) throw new Error(`"${tag}" is not a version such as 0.5.0 or v0.5.0.`);
  return v;
}

/** CDN links to the package, under its name and its name before version 0.3. */
export const VERSION_LINKS = /\b(chepta|fugacity)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/g;
/** Files and folders whose versions are history or examples, not links to use. */
export const VERSION_EXEMPT = ["ARCHITECTURE.md", "ROADMAP.md", "proposals", "decisions", "DECISIONS.md", "node_modules", "dist"];

/** The .md and .html files whose CDN links must carry the current version, relative to root. */
export function versionFiles(root, dir = root) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (n.startsWith(".") || VERSION_EXEMPT.includes(n)) return [];
    return statSync(p).isDirectory() ? versionFiles(root, p) : /\.(md|html)$/.test(n) ? [p.slice(root.length).replace(/^[\\/]/, "")] : [];
  });
}

/** Set the version in the repository at `root`; returns the files changed. */
export function setVersion(root, tag) {
  const v = normalizeVersion(tag);
  const changed = new Set();
  const edit = (file, fn) => {
    const p = join(root, file);
    if (!existsSync(p)) return;
    const before = readFileSync(p, "utf8"), after = fn(before);
    if (after !== before) { writeFileSync(p, after); changed.add(file); }
  };
  edit("package.json", s => s.replace(/("version":\s*")[^"]+(")/, `$1${v}$2`));
  // the lock file: its own version and the root package's (the first two "version" keys)
  edit("package-lock.json", s => {
    const j = JSON.parse(s);
    j.version = v;
    if (j.packages?.[""]) j.packages[""].version = v;
    return JSON.stringify(j, null, 2) + "\n";
  });
  edit("README.md", s => s.replace(/(\*\*Status: [^*]*?\(v)\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\)\.?\*\*)/, `$1${v}$3`));
  for (const f of versionFiles(root)) edit(f, s => s.replace(VERSION_LINKS, (_, name) => `${name}@${v}`));
  return { version: v, changed: [...changed] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { version, changed } = setVersion(process.cwd(), process.argv[2]);
    console.log(changed.length ? `Version ${version}: ${changed.join(", ")}` : `Version ${version}: nothing to change`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
