import { test } from "node:test";
import assert from "node:assert/strict";
import { phabPreview } from "../../src/web/phab-preview.ts";

test("phabPreview strips Markdown from the first non-empty line", () => {
  assert.equal(phabPreview("\n\nThe analysis task [x](https://e.test/x) failed on `a_b.cpp`\nsecond"), "The analysis task x failed on a_b.cpp");
  assert.equal(phabPreview("## Summarization\n\ntext"), "Summarization");
  assert.equal(phabPreview("```\ncode\n```\n- **bold** item"), "code");
  assert.equal(phabPreview("> _quoted_ text"), "quoted text");
  assert.equal(phabPreview(""), "");
});

test("phabPreview truncates with an ellipsis", () => {
  const preview = phabPreview("x".repeat(300));
  assert.equal(preview.length, 120);
  assert.ok(preview.endsWith("…"));
});
