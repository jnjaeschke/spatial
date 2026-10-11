import { test } from "node:test";
import assert from "node:assert/strict";
import { plainText } from "../../src/shared/plain-text.ts";

test("plainText strips Markdown and joins lines", () => {
  assert.equal(plainText("## Title\n\nSome **bold** and `code` with [a link](https://e.test/x)\n- item _one_\n> quoted"), "Title Some bold and code with a link item one quoted");
  assert.equal(plainText("```cpp\nint x;\n```\nafter"), "int x; after");
  assert.equal(plainText("![alt](u.png) snake_case_name"), "alt snake_case_name");
  assert.equal(plainText(""), "");
});

test("plainText strips spec links, emphasis and escapes, and truncates on a word boundary", () => {
  assert.equal(plainText("To **navigate** a [navigable](HTML#navigable) *navigable* to a [URL](URL#concept-url) *url*:"), "To navigate a navigable navigable to a URL url:");
  assert.equal(plainText("one two three four", 9), "one two…");
  assert.equal(plainText("Perform ! TransformStreamError(controller.[\\[\\[stream\\]\\]](STREAMS#transformstreamdefaultcontroller-stream), r)."), "Perform ! TransformStreamError(controller.[[stream]], r).");
});
