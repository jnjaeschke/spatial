import test from "node:test";
import assert from "node:assert/strict";
import { movedInlineState, parseInlineStates, shownInlineState, withInlineState } from "../../../../src/plugins/review/web/inline-state.ts";

test("parseInlineStates keeps non-default states and drops junk", () => {
  assert.deepEqual(parseInlineStates('{"a":"line","b":"expanded","c":"preview","d":3}'), { a: "line", b: "expanded" });
  assert.deepEqual(parseInlineStates("not json"), {});
  assert.deepEqual(parseInlineStates("[1]"), {});
  assert.deepEqual(parseInlineStates(null), {});
});

test("withInlineState stores only non-default states", () => {
  assert.deepEqual(withInlineState({}, "a", "expanded"), { a: "expanded" });
  assert.deepEqual(withInlineState({ a: "expanded", b: "line" }, "a", "preview"), { b: "line" });
});

test("movedInlineState carries a stored state to a new id", () => {
  assert.deepEqual(movedInlineState({ draft: "expanded" }, "draft", "thread"), { thread: "expanded" });
  const untouched = { other: "line" } as const;
  assert.equal(movedInlineState(untouched, "draft", "thread"), untouched);
});

test("shownInlineState defaults to preview and compact forces a line", () => {
  assert.equal(shownInlineState({}, "a", false), "preview");
  assert.equal(shownInlineState({ a: "expanded" }, "a", false), "expanded");
  assert.equal(shownInlineState({ a: "expanded" }, "a", true), "line");
});
