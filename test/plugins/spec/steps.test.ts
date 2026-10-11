import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSteps } from "../../../src/plugins/spec/shared/steps.ts";

const INSERT = [
  "To **insert** a [node](DOM#concept-node) *node* into a *parent*:",
  "",
  "1. Let *nodes* be *node*’s [children](DOM#concept-tree-child).",
  "2. Let *count* be *nodes*’s [size](INFRA#list-size).",
  "3. If *count* is 0, then return.",
  "4. If *node* is a [`DocumentFragment`](DOM#documentfragment) node:",
  "",
  "    1. [Remove](DOM#concept-node-remove) its children",
  "       with *suppressObservers* set to true.",
  "    2. Queue a tree mutation record for *node*.",
  "",
  "        > **Note:** This step intentionally does not pay attention to *suppressObservers*.",
  "5. Return *nodes*.",
  "",
  "Some prose after the algorithm.",
  "",
  "1. A second list that is not part of the algorithm.",
].join("\n");

test("parseSteps reads the first numbered algorithm with nested numbers and continuation lines", () => {
  assert.deepEqual(parseSteps(INSERT), [
    { number: "1", depth: 0, text: "Let nodes be node’s children." },
    { number: "2", depth: 0, text: "Let count be nodes’s size." },
    { number: "3", depth: 0, text: "If count is 0, then return." },
    { number: "4", depth: 0, text: "If node is a DocumentFragment node:" },
    { number: "4.1", depth: 1, text: "Remove its children with suppressObservers set to true." },
    { number: "4.2", depth: 1, text: "Queue a tree mutation record for node. Note: This step intentionally does not pay attention to suppressObservers." },
    { number: "5", depth: 0, text: "Return nodes." },
  ]);
  assert.deepEqual(parseSteps("A definition without steps."), []);
});

test("parseSteps keeps unpaired markers, identifiers and leading list or quote markers in step text", () => {
  const steps = parseSteps(["1. Let *x* be _foo and `bar` ~ 4.", "2. Compute a * b.", "3. > quoted - dash"].join("\n"));
  assert.deepEqual(steps.map((step) => step.text), ["Let x be _foo and bar ~ 4.", "Compute a * b.", "> quoted - dash"]);
});
