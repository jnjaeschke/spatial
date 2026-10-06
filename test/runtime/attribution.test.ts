import { test } from "node:test";
import assert from "node:assert/strict";
import type { Commit } from "../../src/shared/types.ts";
import type { GitCapability } from "../../src/runtime/tasks.ts";
import { parseUnifiedDiff } from "../../src/runtime/diff-parse.ts";
import { attribute } from "../../src/runtime/attribution.ts";

const base = "0".repeat(40), a = "a".repeat(40), b = "b".repeat(40), c = "c".repeat(40);
const commits: Commit[] = [a,b,c].map((sha) => ({ sha, subject: "", body: "" }));
const raw = `diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,4 @@\n-old\n+one\n+two\n+three\n stay\n`;

test("attributes add and delete rows to commits and skips non-range lines", async () => {
  const files = parseUnifiedDiff(raw); const calls: string[] = [];
  const git = { async blame(_base: string, _head: string, _path: string, direction: string) {
    calls.push(direction);
    return direction === "forward"
      ? [{ line: 1, sha: a, origLine: 7, path: "a.txt" }, { line: 2, sha: b, origLine: 9, path: "renamed.txt" }, { line: 3, sha: base, origLine: 3, path: "a.txt" }]
      : [{ line: 1, sha: base, origLine: 4, path: "a.txt" }];
  } } as unknown as GitCapability;
  await attribute(git, base, c, commits, files);
  assert.deepEqual(files[0]!.hunks[0]!.lines.map(({ commit, commitLine, commitPath }) => [commit, commitLine, commitPath]), [
    [0,4,undefined], [0,7,undefined], [1,9,"renamed.txt"], [undefined,undefined,undefined], [undefined,undefined,undefined],
  ]);
  assert.deepEqual(calls, ["forward", "reverse"]);
});

test("a deletion blamed to the final stack commit stays unattributed", async () => {
  const files = parseUnifiedDiff(raw);
  const git = { async blame(_base: string, _head: string, _path: string, direction: string) {
    return direction === "reverse" ? [{ line: 1, sha: c, origLine: 2, path: "a.txt" }] : [];
  } } as unknown as GitCapability;
  await attribute(git, base, c, commits, files);
  assert.equal(files[0]!.hunks[0]!.lines[0]!.commit, undefined);
});

test("one-commit diff does not request blame", async () => {
  const files = parseUnifiedDiff(raw); let called = false;
  await attribute({ async blame() { called = true; return []; } } as unknown as GitCapability, base, a, [commits[0]!], files);
  assert.equal(called, false);
  assert.equal(files[0]!.hunks[0]!.lines.some((line) => line.commit !== undefined), false);
});

test("deletions map to the next stack commit, except lines surviving through the head", async () => {
  const files = parseUnifiedDiff(raw);
  const git = { async blame(_base: string, _head: string, _path: string, direction: string) {
    return direction === "forward" ? [] : [
      { line: 1, sha: base, origLine: 4, path: "a.txt" },
      { line: 2, sha: b, origLine: 12, path: "a.txt" },
      { line: 3, sha: c, origLine: 15, path: "a.txt" },
    ];
  } } as unknown as GitCapability;
  await attribute(git, base, c, commits, files);
  assert.deepEqual(files[0]!.hunks[0]!.lines.filter((line) => line.kind === "del").map((line) => [line.commit, line.commitLine]), [[0, 4]]);
});

test("does not blame deleted files forward or added files in reverse", async () => {
  const files = parseUnifiedDiff(raw);
  files[0]!.status = "deleted";
  const added = parseUnifiedDiff(raw)[0]!;
  added.status = "added";
  const calls: string[] = [];
  const git = { async blame(_base: string, _head: string, _path: string, direction: string) { calls.push(direction); return []; } } as unknown as GitCapability;
  await attribute(git, base, c, commits, [files[0]!, added]);
  assert.deepEqual(calls, ["reverse", "forward"]);
});
