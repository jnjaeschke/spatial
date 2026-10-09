import { test } from "node:test";
import assert from "node:assert/strict";
import { commitColors, commitLabel } from "../../src/web/diff/commit-colors.ts";

test("commitColors is stable and gives nearby stack commits distinct row colors", () => {
  const colors = Array.from({ length: 6 }, (_, i) => commitColors(i));
  assert.deepEqual(colors, Array.from({ length: 6 }, (_, i) => commitColors(i)));
  assert.equal(new Set(colors.map(({ row }) => row)).size, 6);
});

test("commitLabel includes stack position, short sha, and subject", () => {
  assert.equal(commitLabel(1, { sha: "abcdef012345", subject: "Fix parser", body: "" }), "C2 abcdef0 Fix parser");
});
