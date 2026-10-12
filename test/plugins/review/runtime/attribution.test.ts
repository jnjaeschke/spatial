import { test } from "node:test";
import assert from "node:assert/strict";
import type { Commit } from "../../../../src/shared/types.ts";
import type { GitCapability } from "../../../../src/runtime/tasks.ts";
import { parseUnifiedDiff } from "../../../../src/runtime/diff-parse.ts";
import { attribute, splitByCommit } from "../../../../src/plugins/review/runtime/attribution.ts";
import { fileRows } from "../../../../src/plugin-api.ts";

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

test("splits hunks at changed-line commit boundaries and preserves file rows", () => {
  const files = parseUnifiedDiff(`diff --git a/x.txt b/x.txt\n--- a/x.txt\n+++ b/x.txt\n@@ -1,1 +1,1 @@\n-old\n+new\n`);
  const split = parseUnifiedDiff(`diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -2,4 +2,5 @@ fn\n o2\n-o3\n+N3\n o4\n+X\n o5\n@@ -8,1 +9,1 @@\n+P\n-o8\n`);
  for (const line of files[0]!.hunks[0]!.lines) if (line.kind !== "ctx") line.commit = 0;
  const a = split[0]!;
  const [hunkA, hunkB] = a.hunks;
  hunkA!.lines[1]!.commit = 0;
  hunkA!.lines[2]!.commit = 0;
  hunkA!.lines[4]!.commit = 1;
  hunkB!.lines[0]!.commit = 0;
  hunkB!.lines[1]!.commit = 1;
  const unchangedHunk = files[0]!.hunks[0];
  const beforeRows = fileRows(structuredClone(a), ["o1", "o2", "N3", "o4", "X", "o5", "o6", "o7", "P", "o9", "o10"])
    .map(({ kind, text, old, new: n }) => [kind, text, old, n]);

  splitByCommit([...files, a], 2);

  assert.equal(files[0]!.hunks[0], unchangedHunk);
  assert.deepEqual(files[0]!.hunks.map((hunk) => hunk.id), ["f0h0"]);
  assert.deepEqual(a.hunks.map(({ id, header }) => [id, header]), [
    ["f1h0", "@@ -2,3 +2,3 @@ fn"], ["f1h1", "@@ -5,1 +5,2 @@ fn"],
    ["f1h2", "@@ -7,0 +9,1 @@"], ["f1h3", "@@ -8,1 +9,0 @@"],
  ]);
  assert.ok(a.hunks.every((hunk) => new Set(hunk.lines.filter((line) => line.kind !== "ctx").map((line) => line.commit)).size === 1));
  assert.deepEqual(fileRows(a, ["o1", "o2", "N3", "o4", "X", "o5", "o6", "o7", "P", "o9", "o10"])
    .map(({ kind, text, old, new: n }) => [kind, text, old, n]), beforeRows);
});

test("does not split single-commit diffs or changed runs joined by unattributed lines", () => {
  const files = parseUnifiedDiff(`diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1,0 +1,3 @@\n+A\n+B\n+C\n`);
  const [a, b, c] = files[0]!.hunks[0]!.lines;
  a!.commit = 0;
  c!.commit = 0;
  b!.commit = undefined;
  const before = structuredClone(files);
  splitByCommit(files, 2);
  assert.deepEqual(files, before);
  splitByCommit(files, 1);
  assert.deepEqual(files, before);
});

test("does not split when the first attributed changed line follows an unattributed line", () => {
  const files = parseUnifiedDiff(`diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1,0 +1,2 @@\n+A\n+B\n`);
  files[0]!.hunks[0]!.lines[1]!.commit = 1;
  splitByCommit(files, 2);
  assert.equal(files[0]!.hunks.length, 1);
});
