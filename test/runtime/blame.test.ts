import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBlame } from "../../src/runtime/blame.ts";

const a = "a".repeat(40), b = "b".repeat(40), base = "0".repeat(40);
test("parses blame porcelain metadata once per sha and both header forms", () => {
  const text = [
    `${a} 4 1 3`, "author A", `filename renamed.txt`, "\tone", `${a} 5 2`, "\ttwo", `${a} 6 3`, "\tthree",
    `${b} 9 4 1`, "author B", "\tother", `${base} 10 5 1`, "boundary", "\tbase",
  ].join("\n");
  assert.deepEqual(parseBlame(text, "requested.txt"), [
    { line: 1, sha: a, origLine: 4, path: "renamed.txt" }, { line: 2, sha: a, origLine: 5, path: "renamed.txt" },
    { line: 3, sha: a, origLine: 6, path: "renamed.txt" }, { line: 4, sha: b, origLine: 9, path: "requested.txt" },
    { line: 5, sha: base, origLine: 10, path: "requested.txt" },
  ]);
});
