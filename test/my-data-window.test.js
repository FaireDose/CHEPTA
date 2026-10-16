// My data in a window of its own (proposal 0012, step 4; src/ui/my-data-window.js). The paths without a browser:
// where a window is offered, and the fallback when the browser or the host page refuses one (pages inside AI chats
// usually do): the panel stays docked with the reason. The open window itself (built by the main window, edits in
// both directions, closing and docking again) was checked in Chromium; the repository has no DOM tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canOpenWindow, openDataWindow, BLOCKED_NOTE } from "../src/ui/my-data-window.js";

test("a window is offered only where one can open: not on a phone, not without window.open", () => {
  const win = { open: () => null };
  assert.equal(canOpenWindow({ size: "wide", win }), true);
  assert.equal(canOpenWindow({ size: "mid", win }), true);
  assert.equal(canOpenWindow({ size: "narrow", win }), false, "phones have no windows");
  assert.equal(canOpenWindow({ size: "wide", win: {} }), false);
  assert.equal(canOpenWindow({ size: "wide", win: null }), false);
});

test("a refused window leaves the panel docked, with the reason", () => {
  let closed = 0;
  const args = { name: "chepta-mydata-test", render: () => assert.fail("nothing is drawn"), onClose: () => closed++ };
  for (const open of [() => null, () => { throw new Error("blocked by the sandbox"); }, () => ({ closed: true })]) {
    const r = openDataWindow({ ...args, win: { open } });
    assert.deepEqual(r, { ok: false, reason: BLOCKED_NOTE });
  }
  assert.equal(closed, 0);
  assert.match(BLOCKED_NOTE, /My data stays here/);
});
