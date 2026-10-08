import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSteps, plainSpecText } from "../../../../src/plugins/review/shared/spec-text.ts";

test("strips markdown links and emphasis, truncates on a word boundary", () => {
  const md = "To **navigate** a [navigable](HTML#navigable) *navigable* to a [URL](URL#concept-url) *url*:";
  assert.equal(plainSpecText(md, 1000), "To navigate a navigable navigable to a URL url:");
  assert.equal(plainSpecText("one two three four", 9), "one two…");
  assert.equal(plainSpecText("Perform ! TransformStreamError(controller.[\\[\\[stream\\]\\]](STREAMS#transformstreamdefaultcontroller-stream), r).", 1000), "Perform ! TransformStreamError(controller.[[stream]], r).");
});

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
