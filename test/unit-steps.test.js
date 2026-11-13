// The numbered steps of the Flash, the Heat exchanger and the Pipe in the reorganized layout (proposal 0021, step 3;
// src/ui/unit-steps.js): their DOM-free part. The steps themselves are checked on screenshots
// (docs/ui-review/2026-11-13-0021-numbered-steps/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, applyPatch, viewCheck } from "../src/ui/app-logic.js";
import { unitSteps, stepOpen, stepState, STEP_WORKSPACES } from "../src/ui/unit-steps.js";

const at = patch => applyPatch(initialState(), patch);
// the Inputs-panel section titles each workspace builds (app.js, hx-view.js, pipe-view.js), in order
const FLASH_TITLES = ["Components", "Feed, mole fractions", "Specification: pressure and vapour fraction", "Feed state", "Parameter sets, NRTL"];
const PIPE_TITLES = ["Components", "Inlet", "Pipe", "Fittings", "Heat", "Options", "Parameter sets, NRTL"];
const HX_UTIL_TITLES = ["Components", "Process stream", "Process outlet", "Utility", "Heat transfer coefficient U", "Arrangement", "Wall thickness for the pressure", "Parameter sets, NRTL"];
const HX_TWO_TITLES = ["Hot stream", "Cold stream", "Specification", "Heat transfer coefficient U", "Arrangement", "Wall thickness for the pressure"];

test("only the Flash, the Heat exchanger and the Pipe have numbered steps here", () => {
  assert.deepEqual(STEP_WORKSPACES, ["flash", "hx", "pipe"]);
  const s = at({ workspace: "equilibrium", inputs: { txy: ["ethanol", "water"] } });
  assert.deepEqual(unitSteps(s, ["Components", "Conditions"], viewCheck(s)), []);
});

test("the Flash's three steps gather the right sections and read their summaries", () => {
  const s = at({ workspace: "flash", inputs: { flash: ["ethanol", "water"] } });
  const steps = unitSteps(s, FLASH_TITLES, viewCheck(s), id => id);
  assert.deepEqual(steps.map(x => x.title), ["Components", "Feed", "Flash"]);
  assert.deepEqual(steps.map(x => x.n), [1, 2, 3]);
  // the Feed step takes both the feed composition and the feed state; the parameter sets stay out of the steps
  assert.deepEqual(steps[0].sections, [0]);
  assert.deepEqual(steps[1].sections, [1, 3]);
  assert.deepEqual(steps[2].sections, [2]);
  assert.equal(steps[0].summary, "ethanol, water");
  assert.ok(steps[1].summary.includes("kmol/h"));
  assert.ok(steps[2].summary.includes("VF"));
  assert.ok(steps.every(x => x.status === "done"));
});

test("the Pipe: the unit step gathers Pipe, Fittings and Heat; Options is optional", () => {
  const s = at({ workspace: "pipe", inputs: { pipe: ["water"] } });
  const steps = unitSteps(s, PIPE_TITLES, viewCheck(s), id => id);
  assert.deepEqual(steps.map(x => x.title), ["Components", "Inlet", "Pipe", "Options"]);
  const unit = steps.find(x => x.id === "unit");
  assert.deepEqual(unit.sections, [2, 3, 4]);
  const options = steps.find(x => x.id === "options");
  assert.equal(options.optional, true);
  assert.equal(options.status, "optional");
  assert.ok(unit.summary.includes("no fittings"));
});

test("a utility exchanger: Components, Process stream, Exchanger, and an optional Wall thickness", () => {
  const s = at({ workspace: "hx", inputs: { hx: ["methanol", "water"] } });
  const steps = unitSteps(s, HX_UTIL_TITLES, viewCheck(s), id => id);
  assert.deepEqual(steps.map(x => x.title), ["Components", "Process stream", "Exchanger", "Wall thickness"]);
  // the Exchanger step pulls together the outlet, the utility, U and the arrangement
  assert.deepEqual(steps.find(x => x.id === "unit").sections, [2, 3, 4, 5]);
  assert.equal(steps.find(x => x.id === "wall").optional, true);
  assert.ok(steps.find(x => x.id === "wall").summary.includes("allowable stress"));
});

test("a process exchanger: a step per stream, each with its own components", () => {
  const s = at({ workspace: "hx", hx: { mode: "two" }, inputs: { hx: ["methanol", "water"] } });
  const steps = unitSteps(s, HX_TWO_TITLES, viewCheck(s), id => id);
  assert.deepEqual(steps.map(x => x.id), ["hot", "cold", "unit", "wall"]);
  assert.ok(steps[0].summary.includes("methanol, water"));
  assert.ok(steps[0].summary.includes("kmol/h"));
});

test("a step with a problem is 'to do' and counts its problems; an empty stream says nothing is chosen yet", () => {
  const s = at({ workspace: "hx", hx: { mode: "two", hot: { components: [] } }, inputs: { hx: ["methanol", "water"] } });
  const check = viewCheck(s);
  const steps = unitSteps(s, HX_TWO_TITLES, check, id => id);
  const hot = steps.find(x => x.id === "hot");
  assert.equal(hot.status, "todo");
  assert.ok(hot.problems >= 1);
  assert.equal(hot.summary, "nothing chosen yet");
  assert.equal(stepState(hot), `${hot.problems} problem${hot.problems === 1 ? "" : "s"}`);
});

test("stepOpen: a step the person has not touched is open while it is 'to do', folded when done", () => {
  assert.equal(stepOpen({ id: "unit", status: "todo" }), true);
  assert.equal(stepOpen({ id: "unit", status: "done" }), false);
  assert.equal(stepOpen({ id: "unit", status: "optional" }), false);
  // the person's own choice wins
  assert.equal(stepOpen({ id: "unit", status: "done" }, { choice: true }), true);
  assert.equal(stepOpen({ id: "unit", status: "todo" }, { choice: false }), false);
  // the step the person is working in stays open
  assert.equal(stepOpen({ id: "feed", status: "done" }, { active: "feed" }), true);
  assert.equal(stepOpen({ id: "feed", status: "done" }, { active: "unit" }), false);
});

test("stepState names each status for a screen reader", () => {
  assert.equal(stepState({ status: "done" }), "complete");
  assert.equal(stepState({ status: "optional" }), "optional");
  assert.equal(stepState({ status: "todo", problems: 0 }), "to do");
});
