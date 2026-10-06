import { test } from "node:test";
import assert from "node:assert/strict";
import { reanchorFinding } from "../../src/shared/reanchor.ts";
import type { DiffData, Hunk } from "../../src/shared/types.ts";

const h = (id: string, newStart: number, lines: Hunk["lines"], oldStart = newStart): Hunk => ({ id, header: "", oldStart, oldLines: lines.filter((l) => l.kind !== "add").length, newStart, newLines: lines.filter((l) => l.kind !== "del").length, lines });
const diff = (files: DiffData["files"]): DiffData => ({ baseSha: "b", headSha: "h", commits: [], files });
const file = (path: string, hunks: Hunk[], oldPath?: string) => ({ path, ...(oldPath ? { oldPath } : {}), status: "modified" as const, binary: false, hunks });
const old = (path: string, hunk: Hunk) => ({ path, hunk });

test("quote reanchoring selects closest matching line, honors side and rename, and matches whitespace flexibly", () => {
  const next = diff([file("renamed", [h("f0h0", 30, [
    { kind: "del", text: "before quote here" }, { kind: "add", text: "before" },
    { kind: "ctx", text: "the   important quote" }, { kind: "add", text: "important quote" },
  ])], "old")]);
  assert.deepEqual(reanchorFinding({ quote: "important quote", lines: { path: "old", side: "new", start: 33, end: 33 }, oldHunks: [old("old", h("old", 2, [{ kind: "ctx", text: "important quote" }]))] }, next), { hunkId: "f0h0", lines: { path: "renamed", side: "new", start: 32, end: 32 } });
  assert.deepEqual(reanchorFinding({ quote: "before quote", lines: { path: "old", side: "old", start: 30, end: 30 }, oldHunks: [] }, next), { hunkId: "f0h0", lines: { path: "renamed", side: "old", start: 30, end: 30 } });
  assert.equal(reanchorFinding({ quote: "important quote", lines: { path: "old", side: "old", start: 32, end: 32 }, oldHunks: [] }, next), null);
});

test("missing quotes return null; quote-less findings use +/- content signatures", () => {
  const previous = h("old", 4, [{ kind: "ctx", text: "context A" }, { kind: "del", text: "removed" }, { kind: "add", text: "replacement" }]);
  const next = diff([file("a", [h("new", 40, [{ kind: "ctx", text: "different context" }, { kind: "del", text: "removed" }, { kind: "add", text: "replacement" }])])]);
  assert.deepEqual(reanchorFinding({ quote: "gone", lines: { path: "a", side: "new", start: 4, end: 4 }, oldHunks: [old("a", previous)] }, next), null);
  assert.deepEqual(reanchorFinding({ oldHunks: [old("a", previous)] }, next), { hunkId: "new" });
  assert.equal(reanchorFinding({ oldHunks: [old("a", h("old", 4, [{ kind: "add", text: "different" }]))] }, next), null);
  assert.equal(reanchorFinding({ oldHunks: [] }, next), null);
});
