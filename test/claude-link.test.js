// Open in Claude (the maintainer, 2026-10-20): a new claude.ai chat with a message that loads the workbench as an
// artifact, with the current components, model and pressure, using the person's own account.
import { test } from "node:test";
import assert from "node:assert/strict";
import { claudeMessage, CLAUDE_NEW_CHAT } from "../src/ui/app-logic.js";
import pkg from "../package.json" with { type: "json" };

test("the message loads the workbench with the same one-line page as the start prompts, and asks for an introduction", () => {
  const { message, url, left } = claudeMessage({ version: pkg.version, components: ["methanol", "acetone", "chloroform"],
    model: "NRTL", P_kPa: 101.325, view: "ternary" });
  assert.match(message, /^Load the CHEPTA workbench\. Make an HTML artifact with exactly this code, and do not download or inspect the library first:/);
  assert.ok(message.includes(`https://cdn.jsdelivr.net/npm/chepta@${pkg.version}/dist/chepta.js`));
  assert.ok(message.includes('CHEPTA.app("#app", {"start":"ternary","components":["methanol","acetone","chloroform"],"model":"NRTL","P_kPa":101.325})'));
  assert.match(message, /introduce yourself/);
  assert.match(message, /https:\/\/fairedose\.github\.io\/CHEPTA\/use\.md/);
  assert.equal(url, `${CLAUDE_NEW_CHAT}?q=${encodeURIComponent(message)}`);
  assert.equal(decodeURIComponent(new URL(url).searchParams.get("q")), message);
  assert.deepEqual(left, []);
  // short enough for a link (about 2,000 characters is the usual limit)
  assert.ok(url.length < 2000, `${url.length} characters`);
});

test("with nothing chosen the workbench opens empty; the person's own components are left out and named", () => {
  const empty = claudeMessage({ version: "1.2.3", components: [], model: "NRTL", P_kPa: 101.325, view: "flowsheet" });
  assert.ok(empty.message.includes('CHEPTA.app("#app", {"components":[]})'), "no model or pressure without components; no start for a view CHEPTA.app does not take");
  const own = claudeMessage({ version: "1.2.3", components: ["water", "user:my-oil"], model: "ideal", P_kPa: 50, view: "txy" });
  assert.ok(own.message.includes('{"start":"txy","components":["water"],"model":"ideal","P_kPa":50}'));
  assert.deepEqual(own.left, ["user:my-oil"]);
});
