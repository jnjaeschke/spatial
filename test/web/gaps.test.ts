import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleRows } from "../../src/web/diff/gaps.ts";
import { fileRows } from "../../src/shared/diff-lines.ts";
import { parseUnifiedDiff } from "../../src/runtime/diff-parse.ts";

const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
const [file] = parseUnifiedDiff([
  "diff --git a/f.txt b/f.txt", "index 1..2 100644", "--- a/f.txt", "+++ b/f.txt",
  "@@ -4,3 +4,3 @@", " line 4", "-old 5", "+line 5", " line 6",
  "@@ -20,3 +20,3 @@", " line 20", "-old 21", "+line 21", " line 22",
].join("\n"));

test("without the file, gaps sit between and around hunks; the end is unknown", () => {
  const { rows, gaps } = visibleRows(file!, null, new Set());
  assert.equal(rows.length, 8);
  assert.deepEqual(gaps, [{ id: 0, at: 0, count: 3 }, { id: 1, at: 4, count: 13 }, { id: 2, at: 8, count: null }]);
});

test("with the file, an open gap shows its lines and the end gap has a count", () => {
  const { rows, gaps } = visibleRows(file!, lines, new Set([1]));
  assert.deepEqual(gaps, [{ id: 0, at: 0, count: 3 }, { id: 2, at: 21, count: 8 }]);
  assert.deepEqual(rows.slice(4, 6).map((row) => [row.kind, row.text, row.old, row.new]), [["ctx", "line 7", 7, 7], ["ctx", "line 8", 8, 8]]);
});

test("all gaps open gives the whole file", () => {
  assert.deepEqual(visibleRows(file!, lines, new Set([0, 1, 2])).rows, fileRows(file!, lines));
});

test("added and deleted files have no gaps", () => {
  const [added] = parseUnifiedDiff(["diff --git a/n.txt b/n.txt", "new file mode 100644", "--- /dev/null", "+++ b/n.txt", "@@ -0,0 +1,2 @@", "+a", "+b"].join("\n"));
  assert.deepEqual(visibleRows(added!, null, new Set()).gaps, []);
});
