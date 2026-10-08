import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, DiffData, Hunk, SemanticChange } from "../../src/shared/types.ts";
import { changeCommit, hunkCommit, reviewedChanges } from "../../src/shared/review-path.ts";

const diff: DiffData = {
  baseSha: "b", headSha: "h",
  commits: ["1", "2", "3"].map((sha) => ({ sha, subject: sha, body: "" })),
  files: [{ path: "a", status: "modified", binary: false, hunks: [] }],
};
const hunk = (id: string, lines: Hunk["lines"]): Hunk => ({ id, header: "", oldStart: 0, oldLines: 0, newStart: 0, newLines: 0, lines });

test("hunkCommit uses the first attributed changed line, with last-commit fallback", () => {
  const single = { ...diff, commits: [diff.commits[0]!] };
  assert.equal(hunkCommit({ ...single, files: [] }, hunk("h", [{ kind: "add", text: "x" }])), 0);
  assert.equal(hunkCommit(diff, hunk("h", [
    { kind: "ctx", text: "context", commit: 2 }, { kind: "add", text: "unattributed" },
    { kind: "add", text: "added", commit: 1 }, { kind: "del", text: "removed", commit: 0 },
  ])), 1);
  assert.equal(hunkCommit(diff, hunk("h", [{ kind: "add", text: "x" }, { kind: "del", text: "y" }])), 2);
});

test("changeCommit uses its first hunk and falls back for empty changes", () => {
  const owned = hunk("owned", [{ kind: "add", text: "x", commit: 1 }]);
  const data = { ...diff, files: [{ ...diff.files[0]!, hunks: [owned] }] };
  const change = (hunkIds: string[]): SemanticChange => ({ id: "c", title: "", explanation: "", rationale: "", hunkIds, dependsOn: [], specUrls: [] });
  assert.equal(changeCommit(data, change(["owned"])), 1);
  assert.equal(changeCommit(data, change([])), 2);
});

test("reviewedChanges returns the latest reviewed marks for one narrative", () => {
  const mark = (id: string, narrative: string, change: string, reviewed: boolean): Artifact => ({
    id, sessionId: "S", type: "ChangeReview", status: "verified", createdAt: id,
    provenance: { taskId: "user" }, data: { narrative, change, reviewed },
    epoch: null,});
  assert.deepEqual(reviewedChanges([], "N"), new Set());
  assert.deepEqual(reviewedChanges([
    mark("1", "N", "c1", true), mark("2", "N", "c2", true), mark("3", "N", "c1", false),
    mark("4", "other", "c3", true),
  ], "N"), new Set(["c2"]));
});
