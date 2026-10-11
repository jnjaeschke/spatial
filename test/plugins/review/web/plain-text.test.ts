import test from "node:test";
import assert from "node:assert/strict";
import { plainText } from "../../../../src/plugins/review/web/plain-text.ts";

test("plainText strips Markdown and joins lines", () => {
  assert.equal(plainText("## Title\n\nSome **bold** and `code` with [a link](https://e.test/x)\n- item _one_\n> quoted"), "Title Some bold and code with a link item one quoted");
  assert.equal(plainText("```cpp\nint x;\n```\nafter"), "int x; after");
  assert.equal(plainText("![alt](u.png) snake_case_name"), "alt snake_case_name");
  assert.equal(plainText(""), "");
});
