// Errors and problems as small warnings (src/ui/warning.js; the maintainer, 2026-10-21): the closed line is the
// message's first sentence, short enough for the Inputs panel; the whole message is in the details.
import { test } from "node:test";
import assert from "node:assert/strict";
import { summaryOf } from "../src/ui/warning.js";

test("the closed line of a warning: the first sentence, at most 64 characters", () => {
  assert.equal(summaryOf("Choose a gas."), "Choose a gas");
  assert.equal(summaryOf("Ethanol is above its critical temperature (513.9 K) at 600.00 K: it has no saturated vapour."),
    "Ethanol is above its critical temperature (513.9 K) at 600.00 K");
  // decimals do not end a sentence; a long first sentence is cut at a word, with an ellipsis
  const s = summaryOf("A fluid chart needs an equation of state, which describes the gas and the liquid up to the critical point: choose Peng–Robinson or SRK.");
  assert.ok(s.length <= 64 && s.endsWith("…") && s.startsWith("A fluid chart needs an equation of state"), s);
  assert.equal(summaryOf("  two\n lines  "), "two lines");
});
