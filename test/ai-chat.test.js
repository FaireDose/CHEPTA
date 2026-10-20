// The AI chat panel (the maintainer, 2026-10-20): a new chat with Claude, ChatGPT or Gemini, with a message that loads
// the workbench as a live page on the current components, model and pressure, using the person's own account; for
// Ollama, whose chats show no live pages, the page as a file and a message for the chat.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aiChatMessage, workbenchPage, AI_CHATS } from "../src/ui/app-logic.js";
import pkg from "../package.json" with { type: "json" };

const opts = { version: pkg.version, components: ["methanol", "acetone", "chloroform"], model: "NRTL", P_kPa: 101.325, view: "ternary" };

test("the page is the start prompts' one-line page, opened on the current setup", () => {
  assert.equal(workbenchPage(opts),
    `<div id="app"></div><script src="https://cdn.jsdelivr.net/npm/chepta@${pkg.version}/dist/chepta.js"></script>` +
    '<script>CHEPTA.app("#app", {"start":"ternary","components":["methanol","acetone","chloroform"],"model":"NRTL","P_kPa":101.325})</script>');
  // nothing chosen: the workbench opens empty; no start for a view CHEPTA.app does not take
  assert.ok(workbenchPage({ version: "1.2.3", components: [], model: "NRTL", P_kPa: 101.325, view: "flowsheet" })
    .includes('CHEPTA.app("#app", {"components":[]})'));
});

test("Claude, ChatGPT and Gemini: build the page, do not comment on it, introduce; the link fills the message where the site takes it", () => {
  for (const id of ["claude", "chatgpt", "gemini"]) {
    const { message, url, page } = aiChatMessage(id, opts);
    assert.ok(message.startsWith(`Load the CHEPTA workbench. ${AI_CHATS[id].page}, and do not download or inspect the library first:\n${page}\n\n`), id);
    assert.match(message, /Do not check or describe the page or the library: I see the page myself\. Right after it, introduce yourself/, id);
    assert.match(message, /https:\/\/fairedose\.github\.io\/CHEPTA\/use\.md/, id);
    if (AI_CHATS[id].prefill) {
      assert.equal(decodeURIComponent(new URL(url).searchParams.get("q")), message, id);
      assert.ok(url.length < 2000, `${id}: ${url.length} characters`);
    } else assert.equal(url, AI_CHATS[id].url, `${id}: the site does not take a message from a link`);
  }
  assert.match(aiChatMessage("claude", opts).url, /^https:\/\/claude\.ai\/new\?q=/);
  assert.match(aiChatMessage("chatgpt", opts).url, /^https:\/\/chatgpt\.com\/\?q=/);
  assert.match(aiChatMessage("claude", opts).message, /HTML artifact/);
  assert.match(aiChatMessage("chatgpt", opts).message, /canvas/);
});

test("Ollama: no link (it runs on the person's computer); the message asks for help with the workbench open in the browser", () => {
  const { message, url, page } = aiChatMessage("ollama", opts);
  assert.equal(url, null);
  assert.ok(!message.includes("<script"), "no page in the chat: Ollama's chats show no live pages");
  assert.match(message, /I have the CHEPTA workbench open in my browser/);
  assert.ok(page.includes("CHEPTA.app"), "the page to download");
  assert.throws(() => aiChatMessage("copilot", opts), /Unknown assistant "copilot"/);
});

test("the person's own components are left out and named", () => {
  const own = aiChatMessage("claude", { version: "1.2.3", components: ["water", "user:my-oil"], model: "ideal", P_kPa: 50, view: "txy" });
  assert.ok(own.message.includes('{"start":"txy","components":["water"],"model":"ideal","P_kPa":50}'));
  assert.deepEqual(own.left, ["user:my-oil"]);
});
