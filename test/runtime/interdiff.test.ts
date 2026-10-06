import { test } from "node:test";
import assert from "node:assert/strict";
import { computeInterdiff } from "../../src/runtime/interdiff.ts";
import type { DiffData, DiffFile } from "../../src/shared/types.ts";
import type { GitCapability } from "../../src/runtime/tasks.ts";

const hunk = (text: string) => ({ id: "old", header: "@@ -1 +1 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "del" as const, text: "before" }, { kind: "add" as const, text }] });
const file = (path: string, text: string) => ({ path, status: "modified" as const, binary: false, hunks: [hunk(text)] });
const diffData = (baseSha: string, headSha: string, files: DiffFile[] = []): DiffData => ({ baseSha, headSha, commits: [], files });
const patchText = (path: string, value: string) => `diff --git a/${path} b/${path}\nindex 1..2 100644\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-before\n+${value}\n`;

test("same base compares heads directly", async () => {
  const calls: unknown[][] = [];
  const git = { diff: async (...args: string[]) => { calls.push(args); return patchText("a.txt", "after"); }, replay: async () => { throw new Error("unexpected replay"); } } as unknown as GitCapability;
  const result = await computeInterdiff(git, diffData("B", "H1"), diffData("B", "H2"));
  assert.deepEqual(calls, [["H1", "H2"]]);
  assert.equal(result.files[0]!.path, "a.txt");
  assert.deepEqual(result.conflicts, []);
});

test("different clean base diffs the replay tree against the new head", async () => {
  const calls: unknown[][] = [];
  const git = {
    replay: async (...args: string[]) => { calls.push(["replay", ...args]); return { tree: "TREE", conflicts: [] }; },
    diff: async (...args: string[]) => { calls.push(["diff", ...args]); return patchText("a.txt", "after"); },
  } as unknown as GitCapability;
  const result = await computeInterdiff(git, diffData("B1", "H1"), diffData("B2", "H2"));
  assert.deepEqual(calls, [["replay", "B1", "B2", "H1"], ["diff", "TREE", "H2"]]);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.files[0]!.path, "a.txt");
});

test("replays across bases, removes meaningless conflicts, and renumbers mixed hunks", async () => {
  const calls: unknown[][] = [];
  const git = {
    replay: async (...args: string[]) => { calls.push(["replay", ...args]); return { tree: "TREE", conflicts: ["a.txt"] }; },
    diff: async (...args: string[]) => { calls.push(["diff", ...args]); return patchText("a.txt", "marker") + patchText("b.txt", "other"); },
  } as unknown as GitCapability;
  const result = await computeInterdiff(git, diffData("B1", "H1", [file("a.txt", "old")]), diffData("B2", "H2", [file("a.txt", "new")]));
  assert.deepEqual(calls, [["replay", "B1", "B2", "H1"], ["diff", "TREE", "H2"]]);
  assert.deepEqual(result.conflicts, ["a.txt"]);
  assert.deepEqual(result.files.map((f) => [f.path, f.hunks[0]!.id]), [["b.txt", "f0h0"], ["a.txt", "f1h0"]]);
  assert.deepEqual(result.files[1]!.hunks[0]!.lines, hunk("new").lines);
});

test("conflicts unchanged by the author and dropped from the patch are omitted", async () => {
  const git = { replay: async () => ({ tree: "TREE", conflicts: ["same.txt", "dropped.txt"] }), diff: async () => patchText("same.txt", "marker") } as unknown as GitCapability;
  const result = await computeInterdiff(git, diffData("B1", "H1", [file("same.txt", "same"), file("dropped.txt", "gone")]), diffData("B2", "H2", [file("same.txt", "same")]));
  assert.deepEqual(result.files, []);
  assert.deepEqual(result.conflicts, ["same.txt", "dropped.txt"]);
});
