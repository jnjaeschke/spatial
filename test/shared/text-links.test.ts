import { test } from "node:test";
import assert from "node:assert/strict";
import { linkMarkdown, linkText } from "../../src/shared/text-links.ts";

const rules = [{ pattern: "\\b(?:ticket|T)-(\\d+)\\b", url: "https://t.example/$1" }];

test("linkText splits text around matches and fills capture groups into the url", () => {
  assert.deepEqual(linkText("see T-12, then ticket-3", rules), [
    { text: "see " }, { text: "T-12", href: "https://t.example/12" }, { text: ", then " }, { text: "ticket-3", href: "https://t.example/3" },
  ]);
  assert.deepEqual(linkText("nothing here", rules), [{ text: "nothing here" }]);
  assert.deepEqual(linkText("T-1", []), [{ text: "T-1" }]);
});

test("an earlier rule keeps its match when a later rule overlaps it", () => {
  const both = [{ pattern: "T-(\\d+)", url: "A$1" }, { pattern: "\\d+", url: "B" }];
  assert.deepEqual(linkText("T-12 and 7", both), [{ text: "T-12", href: "A12" }, { text: " and " }, { text: "7", href: "B" }]);
});

test("linkMarkdown links matches in prose but not in code spans, fences or existing links", () => {
  const md = "Fix T-1 `T-2`\n\n```\nT-3\n```\n\n[T-4](https://x.example) and T-5";
  assert.equal(linkMarkdown(md, rules), "Fix [T-1](https://t.example/1) `T-2`\n\n```\nT-3\n```\n\n[T-4](https://x.example) and [T-5](https://t.example/5)");
  assert.equal(linkMarkdown(md, []), md);
});
