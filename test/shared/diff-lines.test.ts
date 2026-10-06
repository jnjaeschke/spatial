import { test } from "node:test";
import assert from "node:assert/strict";
import { fileRows, numberLines } from "../../src/shared/diff-lines.ts";
import type { DiffFile } from "../../src/shared/types.ts";

test("numbers old/new sides per line kind", () => {
  const out = numberLines({
    id: "f0h0", header: "@@ -10,3 +20,3 @@", oldStart: 10, oldLines: 3, newStart: 20, newLines: 3,
    lines: [{ kind: "ctx", text: "a" }, { kind: "del", text: "b" }, { kind: "add", text: "c" }, { kind: "ctx", text: "d" }],
  });
  assert.deepEqual(out, [
    { kind: "ctx", text: "a", old: 10, new: 20 },
    { kind: "del", text: "b", old: 11 },
    { kind: "add", text: "c", new: 21 },
    { kind: "ctx", text: "d", old: 12, new: 22 },
  ]);
});

test("numbers attributed lines and preserves commit metadata", () => {
  const out = numberLines({
    id: "f0h0", header: "@@ -10 +20 @@", oldStart: 10, oldLines: 1, newStart: 20, newLines: 1,
    lines: [
      { kind: "del", text: "old", commit: 0, commitLine: 7, commitPath: "old-name.txt" },
      { kind: "add", text: "new", commit: 1, commitLine: 22 },
    ],
  });
  assert.deepEqual(out, [
    { kind: "del", text: "old", old: 10, commit: 0, commitLine: 7, commitPath: "old-name.txt" },
    { kind: "add", text: "new", new: 20, commit: 1, commitLine: 22 },
  ]);
});

const head = Array.from({ length: 10 }, (_, i) => `n${i + 1}`);
const file = (hunks: DiffFile["hunks"]): DiffFile => ({ path: "a", status: "modified", binary: false, hunks });

test("fileRows splices hunks into head lines with consistent numbering", () => {
  const rows = fileRows(file([{
    id: "f0h0", header: "@@ -4,3 +4,3 @@", oldStart: 4, oldLines: 3, newStart: 4, newLines: 3,
    lines: [{ kind: "ctx", text: "n4" }, { kind: "del", text: "X" }, { kind: "add", text: "n5" }, { kind: "ctx", text: "n6" }],
  }]), head);
  assert.deepEqual(rows.slice(0, 3), [
    { kind: "ctx", text: "n1", old: 1, new: 1 }, { kind: "ctx", text: "n2", old: 2, new: 2 }, { kind: "ctx", text: "n3", old: 3, new: 3 },
  ]);
  assert.deepEqual(rows.filter((r) => r.hunkId).map((r) => r.text), ["n4", "X", "n5", "n6"]);
  assert.deepEqual(rows.at(-1), { kind: "ctx", text: "n10", old: 10, new: 10 });
  assert.equal(rows.length, 11);
});

test("fileRows handles pure insertion and pure deletion offsets", () => {
  const ins = fileRows(file([{
    id: "f0h0", header: "@@ -2,0 +3,2 @@", oldStart: 2, oldLines: 0, newStart: 3, newLines: 2,
    lines: [{ kind: "add", text: "n3" }, { kind: "add", text: "n4" }],
  }]), head);
  assert.deepEqual(ins[1], { kind: "ctx", text: "n2", old: 2, new: 2 });
  assert.deepEqual(ins[4], { kind: "ctx", text: "n5", old: 3, new: 5 });
  const del = fileRows(file([{
    id: "f0h0", header: "@@ -3,2 +2,0 @@", oldStart: 3, oldLines: 2, newStart: 2, newLines: 0,
    lines: [{ kind: "del", text: "o3" }, { kind: "del", text: "o4" }],
  }]), head);
  assert.deepEqual(del.slice(0, 4).map((r) => [r.text, r.old, r.new]), [["n1", 1, 1], ["n2", 2, 2], ["o3", 3, undefined], ["o4", 4, undefined]]);
  assert.deepEqual(del[4], { kind: "ctx", text: "n3", old: 5, new: 3 });
});
