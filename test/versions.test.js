import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { versionFiles, VERSION_LINKS, normalizeVersion } from "../scripts/set-version.mjs";

// Every page and instruction that loads CHEPTA from the CDN must use the current version, so assistants never build
// pages with an outdated or unpublished release. scripts/set-version.mjs sets them all (the publish workflow runs it with
// the release's tag); design documents and decision records keep the versions they mention (VERSION_EXEMPT).
const root = new URL("..", import.meta.url).pathname;
const version = JSON.parse(readFileSync(join(root, "package.json"))).version;

test("CDN references match the package version", () => {
  const files = versionFiles(root);
  assert.ok(files.includes("README.md") && files.some(f => f.startsWith("ai/")), "the README and the AI instructions are checked");
  for (const f of files) {
    for (const m of readFileSync(join(root, f), "utf8").matchAll(VERSION_LINKS)) {
      assert.equal(m[2], version, `${f} loads ${m[1]}@${m[2]}, package is ${version}`);
    }
  }
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json")));
  assert.equal(lock.version, version, "package-lock.json");
  assert.equal(lock.packages[""].version, version, "package-lock.json, the root package");
});

test("release tags as people type them", () => {
  for (const t of ["0.5.0", "v0.5.0", "V0.5.0", "v.0.5.0", " v0.5.0 "]) assert.equal(normalizeVersion(t), "0.5.0", t);
  assert.equal(normalizeVersion("v1.0.0-beta.1"), "1.0.0-beta.1");
  for (const t of ["", "v0.5", "release-0.5.0", "0.5.0.1"]) assert.throws(() => normalizeVersion(t), /is not a version/, t);
});
