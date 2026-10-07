import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSteps } from "../../src/shared/spec-text.ts";
import { checkStepComment } from "../../src/tasks/resolve-spec-refs/step-check.ts";

const URL = "https://dom.spec.whatwg.org/#concept-node-insert";
const steps = parseSteps([
  "1. Let *nodes* be *node*’s [children](DOM#concept-tree-child).",
  "2. Let *count* be *nodes*’s [size](INFRA#list-size).",
  "3. If *count* is 0, then return.",
  "4. If *node* is a `DocumentFragment` node:",
  "",
  "    1. Remove its children with *suppressObservers* set to true.",
].join("\n"));
const spec = "DOM#concept-node-insert";
const check = (number: string, text: string, url = URL) => checkStepComment({ line: 1, url, number, text }, spec, steps);

test("a Step comment describing its step passes", () => {
  assert.equal(check("1", "Let nodes be node's children."), null);
  assert.equal(check("4.1", "Remove the children, suppressing observers."), null);
});

test("a Step comment that paraphrases or explains its step passes", () => {
  assert.equal(check("2", "Done."), null);
  assert.equal(check("3", "Callers never pass an empty fragment here."), null);
});

test("a Step comment whose text is another step's is a stale step number", () => {
  assert.deepEqual(check("2", "If count is 0, then return."), {
    severity: "medium",
    title: "Step 2 comment describes step 3 of DOM#concept-node-insert",
    body: "The comment says: “If count is 0, then return.”\n\nThat is step 3: “If count is 0, then return.” Step 2 says: “Let count be nodes’s size.”",
  });
  assert.equal(check("7", "If count is 0, then return.")!.title, "Step 7 comment describes step 3 of DOM#concept-node-insert");
});

test("a Step comment citing a step the algorithm does not have is a low finding", () => {
  assert.deepEqual(check("1.5", ""), {
    severity: "low",
    title: "Comment cites step 1.5, which DOM#concept-node-insert does not have",
    body: "The comment says: “”\n\nThe algorithm has steps 1–4.",
  });
});

test("a finding on a spec snapshot URL says that the current spec was compared", () => {
  const snapshot = "https://dom.spec.whatwg.org/commit-snapshots/abc/#concept-node-insert";
  assert.match(check("7", "Something entirely unrelated here.", snapshot)!.body, /links a spec snapshot; the check compared the current spec/);
});
