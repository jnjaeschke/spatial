import { test } from "node:test";
import assert from "node:assert/strict";
import type { Commit, DiffFile } from "../../../../src/shared/types.ts";
import type { GitCapability } from "../../../../src/runtime/tasks.ts";
import { parseUnifiedDiff } from "../../../../src/plugins/review/runtime/diff-parse.ts";
import { findRewrites } from "../../../../src/plugins/review/runtime/rewrites.ts";

const base = "0".repeat(40), a = "a".repeat(40), b = "b".repeat(40), c = "c".repeat(40);
const commits: Commit[] = [a, b, c].map((sha) => ({ sha, subject: "", body: "" }));
const diff = (oldText: string, newText: string) => `diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-${oldText}\n+${newText}\n`;

test("flags a later commit replacing a line introduced earlier", async () => {
  const squashed: DiffFile[] = parseUnifiedDiff(diff("original", "replacement"));
  squashed[0]!.hunks[0]!.lines[1]!.commit = 1;
  const git = {
    async diff(from: string, to: string) {
      if (from === base && to === a) return diff("original", "introduced");
      if (from === a && to === b) return diff("introduced", "replacement");
      throw new Error(`Unexpected diff ${from}..${to}`);
    },
    async blame(_base: string, rev: string) {
      assert.equal(rev, a);
      return [{ line: 1, sha: a, origLine: 1, path: "a.txt" }];
    },
  } as unknown as GitCapability;
  await findRewrites(git, base, commits.slice(0, 2), squashed);
  assert.deepEqual(squashed[0]!.hunks[0]!.rewrites, [{ by: 1, of: 0, lines: 1 }]);
});

test("ignores base deletions, untouched paths, and replacements absent from the squashed hunk", async () => {
  const squashed: DiffFile[] = parseUnifiedDiff(diff("base", "later"));
  squashed[0]!.hunks[0]!.lines[1]!.commit = 2;
  const calls: string[] = [];
  const git = {
    async diff(from: string, to: string) {
      calls.push(`diff:${from}:${to}`);
      if (from === base && to === a) return diff("x", "introduced");
      if (from === a && to === b) return diff("introduced", "replaced");
      if (from === b && to === c) return "diff --git a/other.txt b/other.txt\n--- a/other.txt\n+++ b/other.txt\n@@ -1 +1 @@\n-base\n+other\n";
      throw new Error(`Unexpected diff ${from}..${to}`);
    },
    async blame(_base: string, rev: string, path: string) {
      calls.push(`blame:${rev}:${path}`);
      if (rev === a) return [{ line: 1, sha: base, origLine: 1, path: "a.txt" }];
      return [{ line: 1, sha: base, origLine: 4, path: "a.txt" }];
    },
  } as unknown as GitCapability;
  await findRewrites(git, base, commits, squashed);
  assert.equal(squashed[0]!.hunks[0]!.rewrites, undefined);
  assert.deepEqual(calls.filter((call) => call.startsWith("blame:")), ["blame:" + a + ":a.txt"]);
});

test("does not flag a replacement whose own line was replaced later", async () => {
  const squashed: DiffFile[] = parseUnifiedDiff(diff("original", "final"));
  squashed[0]!.hunks[0]!.lines[1]!.commit = 2;
  const git = {
    async diff(from: string, to: string) {
      if (from === base && to === a) return diff("original", "first");
      if (from === a && to === b) return diff("first", "second");
      if (from === b && to === c) return diff("second", "final");
      throw new Error(`Unexpected diff ${from}..${to}`);
    },
    async blame(_base: string, rev: string) {
      return [{ line: 1, sha: rev === a ? a : b, origLine: 1, path: "a.txt" }];
    },
  } as unknown as GitCapability;
  await findRewrites(git, base, commits, squashed);
  assert.deepEqual(squashed[0]!.hunks[0]!.rewrites, [{ by: 2, of: 1, lines: 1 }]);
  assert.equal(squashed[0]!.hunks[0]!.rewrites!.some(({ by }) => by === 1), false);
});

test("single commit does not request per-commit diffs or blame", async () => {
  let called = false;
  const git = { async diff() { called = true; return ""; }, async blame() { called = true; return []; } } as unknown as GitCapability;
  await findRewrites(git, base, [commits[0]!], []);
  assert.equal(called, false);
});
