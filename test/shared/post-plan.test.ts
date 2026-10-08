import assert from "node:assert/strict";
import { test } from "node:test";
import { postPlan, postTarget } from "../../src/shared/post-plan.ts";
import type { Artifact, DiffData, ReviewCommentData, ReviewFindingData } from "../../src/shared/types.ts";
import type { PostableComment } from "../../src/shared/postable-comments.ts";

const commits = [
  { sha: "a11111111111", subject: "first", body: "Differential Revision: https://phab.example.com/D1" },
  { sha: "b22222222222", subject: "second", body: "Differential Revision: https://phab.example.com/D2" },
];
function diff(): DiffData {
  return { baseSha: "base", headSha: "head", commits, files: [{ path: "a.txt", status: "modified", binary: false, hunks: [{
    id: "f0h0", header: "", oldStart: 1, oldLines: 3, newStart: 1, newLines: 4,
    lines: [
      { kind: "ctx", text: "one" },
      { kind: "add", text: "first", commit: 0, commitLine: 8 },
      { kind: "del", text: "two", commit: 1, commitLine: 2 },
      { kind: "add", text: "second", commit: 1, commitLine: 9, commitPath: "renamed.txt" },
      { kind: "ctx", text: "three" },
    ],
  }] }] };
}
const lines = (side: "old" | "new", start: number, end = start) => ({ path: "a.txt", side, start, end });

test("postTarget maps changed stack lines and keeps one-commit line locations", () => {
  const d = diff();
  assert.deepEqual(postTarget(d, lines("new", 2)), { commit: 0, path: "a.txt", side: "new", start: 8, end: 8 });
  assert.deepEqual(postTarget(d, lines("new", 3)), { commit: 1, path: "renamed.txt", side: "new", start: 9, end: 9 });
  assert.deepEqual(postTarget(d, lines("old", 2)), { commit: 1, path: "a.txt", side: "old", start: 2, end: 2 });
  assert.deepEqual(postTarget({ ...d, commits: [commits[0]!] }, lines("old", 90, 91)), { commit: 0, ...lines("old", 90, 91) });
});

test("postTarget explains ranges that cannot map to one commit", () => {
  const d = diff();
  assert.deepEqual(postTarget(d, lines("new", 2, 4)), { skip: "Comment spans lines of several commits" });
  assert.deepEqual(postTarget(d, lines("new", 1, 2)), { skip: "Comment range mixes changed and unchanged lines" });
  assert.deepEqual(postTarget(d, lines("new", 2, 3)), { skip: "Comment spans lines of several commits" });
  assert.deepEqual(postTarget(d, lines("old", 1)), { skip: "Old-side line without commit attribution" });
  const unattributed = diff();
  unattributed.files[0]!.hunks[0]!.lines[1] = { kind: "add", text: "first" };
  assert.deepEqual(postTarget(unattributed, lines("new", 2)), { skip: "Line has no commit attribution" });
  assert.deepEqual(postTarget(d, lines("new", 99)), { commit: 1, ...lines("new", 99) });
});

function artifact<T>(id: string, type: string, data: T): Artifact<T> {
  return { id, sessionId: "s", type, data, status: "verified", provenance: { taskId: "test" }, createdAt: "" , epoch: null};
}
function candidate(id: string, range?: PostableComment["lines"]): PostableComment {
  const finding = artifact<ReviewFindingData>(`f${id}`, "ReviewFinding", { anchor: "x", ...(range ? { lines: range } : {}), category: "correctness", severity: "low", title: id, body: "" });
  const comment = artifact<ReviewCommentData>(`c${id}`, "ReviewComment", { finding: finding.id, body: id });
  return { finding, comment, ...(range ? { lines: range } : {}) };
}

test("postPlan groups by owning commit and reports unmappable candidates", () => {
  const d = diff();
  const candidates = [candidate("1", lines("new", 2)), candidate("2", lines("new", 4)), candidate("3", lines("new", 2, 4)), candidate("4")];
  const plan = postPlan(d, candidates);
  assert.deepEqual(plan.revisions.map(({ commit, revision, items }) => ({ commit, revision, count: items.length })), [
    { commit: 0, revision: { host: "https://phab.example.com", id: 1 }, count: 1 },
    { commit: 1, revision: { host: "https://phab.example.com", id: 2 }, count: 1 },
  ]);
  assert.deepEqual(plan.skipped, [
    { finding: "f3", reason: "Comment spans lines of several commits" },
    { finding: "f4", reason: "Finding has no line range" },
  ]);
  const withoutTrailer = diff();
  withoutTrailer.commits[0]!.body = "none";
  const missing = postPlan(withoutTrailer, [candidate("5", lines("new", 2))]);
  assert.deepEqual(missing.skipped, [{ finding: "f5", reason: "Commit a11111111111 has no Differential Revision trailer" }]);
});
