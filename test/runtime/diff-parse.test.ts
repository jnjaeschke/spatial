import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUnifiedDiff } from "../../src/runtime/diff-parse.ts";

const DIFF = [
  "diff --git a/dom/A.cpp b/dom/A.cpp", "index 111..222 100644", "--- a/dom/A.cpp", "+++ b/dom/A.cpp",
  "@@ -1,3 +1,3 @@ void Foo()", " ctx", "-old", "+new", " ctx2", "@@ -10 +10,2 @@",
  "--- removed line starting with dashes", "+++ added line starting with pluses", "+second", "\\ No newline at end of file",
  "diff --git a/old/name.h b/new/name.h", "similarity index 90%", "rename from old/name.h", "rename to new/name.h",
  "--- a/old/name.h", "+++ b/new/name.h", "@@ -5,1 +5,1 @@", "-x", "+y",
  "diff --git a/img.png b/img.png", "new file mode 100644", "index 000..333", "Binary files /dev/null and b/img.png differ",
  "diff --git a/gone.txt b/gone.txt", "deleted file mode 100644", "--- a/gone.txt", "+++ /dev/null", "@@ -1,2 +0,0 @@", "-a", "-b",
  "diff --git a/script.sh b/script.sh", "old mode 100644", "new mode 100755", "",
].join("\n");

test("parses files, statuses, hunks, and line kinds", () => {
  const files = parseUnifiedDiff(DIFF);
  assert.deepEqual(files.map((f) => [f.path, f.status, f.binary, f.hunks.length]), [
    ["dom/A.cpp", "modified", false, 2], ["new/name.h", "renamed", false, 1], ["img.png", "added", true, 0],
    ["gone.txt", "deleted", false, 1], ["script.sh", "modified", false, 0],
  ]);
  assert.equal(files[1].oldPath, "old/name.h");
});

test("hunk ids, ranges, and content", () => {
  const [a, , , gone] = parseUnifiedDiff(DIFF);
  assert.deepEqual(a.hunks.map((h) => h.id), ["f0h0", "f0h1"]);
  assert.equal(gone.hunks[0].id, "f3h0");
  const [h0, h1] = a.hunks;
  assert.equal(h0.header, "@@ -1,3 +1,3 @@ void Foo()");
  assert.deepEqual([h0.oldStart, h0.oldLines, h0.newStart, h0.newLines], [1, 3, 1, 3]);
  assert.deepEqual(h0.lines, [{ kind: "ctx", text: "ctx" }, { kind: "del", text: "old" }, { kind: "add", text: "new" }, { kind: "ctx", text: "ctx2" }]);
  assert.deepEqual([h1.oldStart, h1.oldLines, h1.newStart, h1.newLines], [10, 1, 10, 2]);
  assert.deepEqual(h1.lines, [{ kind: "del", text: "-- removed line starting with dashes" }, { kind: "add", text: "++ added line starting with pluses" }, { kind: "add", text: "second" }]);
});

test("empty input yields no files; garbage before a header throws", () => {
  assert.deepEqual(parseUnifiedDiff(""), []);
  assert.throws(() => parseUnifiedDiff("hello\n"), /before file header/);
});

test("paths with spaces lose the tab git appends to their ---/+++ lines", () => {
  const files = parseUnifiedDiff([
    "diff --git a/a b.txt b/a b.txt", "index 1..2 100644", "--- a/a b.txt\t", "+++ b/a b.txt\t", "@@ -1 +1 @@", "-a", "+b",
    "diff --git a/gone file.txt b/gone file.txt", "deleted file mode 100644", "--- a/gone file.txt\t", "+++ /dev/null", "@@ -1 +0,0 @@", "-a",
  ].join("\n"));
  assert.deepEqual(files.map((f) => [f.path, f.status]), [["a b.txt", "modified"], ["gone file.txt", "deleted"]]);
});
