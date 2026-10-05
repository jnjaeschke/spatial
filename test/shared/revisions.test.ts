import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRevisions, findSpan, revisionsOf } from "../../src/shared/revisions.ts";
import type { Artifact, Link, RevisionData } from "../../src/shared/types.ts";

test("findSpan matches collapsed whitespace and returns the original span", () => {
  const text = "We should  change\n this behavior.";
  const span = findSpan(text, "should change this");
  assert.deepEqual(span, { start: 3, end: 23 });
  assert.ok(!("error" in span));
  assert.equal(text.slice(span.start, span.end), "should  change\n this");
});

test("findSpan rejects invalid and unsafe quotes", () => {
  assert.deepEqual(findSpan("one\ntwo", "one\ntwo"), { error: "quote spans lines" });
  assert.deepEqual(findSpan("`code`", "`code"), { error: "quote splits inline code" });
  assert.deepEqual(findSpan("hello", "absent"), { error: "quote not found" });
  assert.deepEqual(findSpan("```js\nsecret\n```", "secret"), { error: "quote is inside a code block" });
});

test("applyRevisions strikes each span and preserves surrounding text", () => {
  assert.equal(applyRevisions("First wrong; then wrong.", [
    { quote: "First wrong", correction: "First right" },
    { quote: "then wrong", correction: "then right" },
  ]), "~~First wrong~~ *(corrected: First right)*; ~~then wrong~~ *(corrected: then right)*.");
});

test("revisionsOf returns linked revisions oldest first", () => {
  const artifacts = ["r1", "r2", "r3"].map((id, i) => ({ id, type: "Revision", data: { quote: id, correction: "x" } as RevisionData } as Artifact<RevisionData>));
  const links = [
    { from: "r1", to: "m", kind: "revises" }, { from: "r2", to: "other", kind: "revises" }, { from: "r3", to: "m", kind: "revises" },
  ] as Link[];
  assert.deepEqual(revisionsOf({ artifacts, links }, "m").map((a) => a.id), ["r1", "r3"]);
});
