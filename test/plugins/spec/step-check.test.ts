import { test } from "node:test";
import assert from "node:assert/strict";
import { describedStep } from "../../../src/plugins/spec/shared/step-comments.ts";
import { parseSteps } from "../../../src/plugins/spec/shared/steps.ts";
import type { StepCommentCheck } from "../../../src/plugins/spec/runtime/webspec.ts";
import type { StepLink } from "../../../src/plugins/spec/api.ts";
import { checkStepComment, commentBlock, misplacedStepComment } from "../../../src/plugins/spec/runtime/step-check.ts";

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
const check = (step: string, text: string, result: StepCommentCheck["result"], url = URL) => checkStepComment({ line: 1, url, step, text, result }, spec, steps);

test("exact and fuzzy matches pass", () => {
  assert.equal(check("1", "Let nodes be node's children.", "exact"), null);
  assert.equal(check("2", "If count is 0, then return.", "fuzzy"), null);
});

test("a mismatch that describes no other step passes: ranges, explanations, relative numbering", () => {
  assert.equal(check("1", "to step 1.3", "mismatch"), null);
  assert.equal(check("3", "Callers never pass an empty fragment here.", "mismatch"), null);
});

test("a mismatch whose text is another step's is a stale step number", () => {
  assert.deepEqual(check("2", "If count is 0, then return.", "mismatch"), {
    severity: "medium",
    title: "Step 2 comment describes step 3 of DOM#concept-node-insert",
    body: "The comment says: “If count is 0, then return.”\n\nThat is step 3: “If count is 0, then return.” Step 2 says: “Let count be nodes’s size.”",
  });
  assert.equal(check("7", "If count is 0, then return.", "not_found")!.title, "Step 7 comment describes step 3 of DOM#concept-node-insert");
});

test("a step the algorithm does not have is a low finding", () => {
  assert.deepEqual(check("1.5", "", "not_found"), {
    severity: "low",
    title: "Comment cites step 1.5, which DOM#concept-node-insert does not have",
    body: "The comment says: “”\n\nThe algorithm has steps 1–4.",
  });
});

test("a finding on a spec snapshot URL says that the current spec was compared", () => {
  const snapshot = "https://dom.spec.whatwg.org/commit-snapshots/abc/#concept-node-insert";
  assert.match(check("7", "Something entirely unrelated here.", "not_found", snapshot)!.body, /links a spec snapshot; the check compared the current spec/);
});

const lines = ["  // Step 1. Fire navigate.", "  if (pending) {", "    Defer();", "}", "", "  Continue();", "  // Step 2. Commit."];
const mappedCheck: StepCommentCheck = { line: 1, step: "1", text: "Fire navigate.", result: "exact", url: "https://html.spec.whatwg.org/#navigate" };
const mappedSteps = [
  { number: "1", depth: 0, text: "Fire navigate." },
  { number: "2", depth: 0, text: "Commit." },
  { number: "2.1", depth: 1, text: "Defer." },
];
const link = (step: string): StepLink => ({ step, kind: "implements", ranges: [{ path: "N.cpp", side: "new", start: 2, end: 3 }], note: "" });

test("commentBlock stops at blank lines, another Step comment, dedents and 20 lines", () => {
  assert.deepEqual(commentBlock(lines, 1, new Set()), [1, 2, 3]);
  assert.deepEqual(commentBlock(["// Step 1. Go.", "  Do();", "  // Step 2. Stop.", "  Stop();"], 1, new Set([3])), [1, 2]);
  assert.deepEqual(commentBlock(["// Step 1. Go.", ...Array.from({ length: 25 }, (_, i) => `  Line ${i + 1}.`)], 1, new Set()), Array.from({ length: 20 }, (_, i) => i + 1));
});

test("misplacedStepComment only flags blocks linked exclusively to unrelated steps", () => {
  assert.equal(misplacedStepComment(mappedCheck, "HTML#navigate", mappedSteps, []), null);
  assert.equal(misplacedStepComment(mappedCheck, "HTML#navigate", mappedSteps, [link("1")]), null);
  assert.equal(misplacedStepComment(mappedCheck, "HTML#navigate", mappedSteps, [link("1.1")]), null);
  assert.equal(misplacedStepComment({ ...mappedCheck, step: "2.1" }, "HTML#navigate", mappedSteps, [link("2")]), null);
  assert.equal(misplacedStepComment(mappedCheck, "HTML#navigate", mappedSteps, [link("2")])?.title, "Step 1 comment sits on code mapped to step 2 of HTML#navigate");
});

test("describedStep: a comment whose number went stale when the spec inserted a step describes the step after it", () => {
  const steps = [{ number: "21", depth: 0, text: "If url's scheme is \"javascript\":" }, { number: "21.1", depth: 1, text: "Let request be a new request, with URL url, client sourceSnapshotParams's fetch client." }, { number: "21.2", depth: 1, text: "Queue a global task on the navigation and traversal task source given navigable's active window to navigate to a javascript: URL given navigable, request, historyHandling, initiatorOriginSnapshot, userInvolvement, cspNavigationType, initialInsertion, and navigationId." }, { number: "21.3", depth: 1, text: "Return." }];
  const comment = "Queue a global task on the navigation and traversal task source given navigable's active window to navigate to a javascript: URL given navigable, url, historyHandling, sourceSnapshotParams, initiatorOriginSnapshot, userInvolvement, cspNavigationType, initialInsertion, and navigationId.";
  assert.equal(describedStep(comment, "21.1", steps)?.number, "21.2");
  assert.equal(describedStep(comment, "21.2", steps), null);
  assert.equal(describedStep("Return.", "21.2", steps), null);
});
