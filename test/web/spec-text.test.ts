import { test } from "node:test";
import assert from "node:assert/strict";
import { plainSpecText } from "../../src/web/spec-text.ts";

test("strips markdown links and emphasis, truncates on a word boundary", () => {
  const md = "To **navigate** a [navigable](HTML#navigable) *navigable* to a [URL](URL#concept-url) *url*:";
  assert.equal(plainSpecText(md, 1000), "To navigate a navigable navigable to a URL url:");
  assert.equal(plainSpecText("one two three four", 9), "one two…");
});
