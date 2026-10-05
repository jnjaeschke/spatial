import { test } from "node:test";
import assert from "node:assert/strict";
import { specUrlsNear } from "../../src/tasks/resolve-spec-refs/cited.ts";
import type { Hunk } from "../../src/shared/types.ts";

const hunk = (newStart: number, newLines: number): Hunk => ({
  id: "f0h0", header: "", oldStart: 1, oldLines: 1, newStart, newLines, lines: [],
});

test("finds URLs in the containing function and its doc comment, not the previous function", () => {
  const lines = [
    "// https://html.spec.whatwg.org/#previous",
    "void Previous() {", "  return;", "}",
    "// https://html.spec.whatwg.org/#navigate",
    "void Navigate() {", "  Changed();", "}",
  ];
  assert.deepEqual(specUrlsNear(lines, hunk(7, 1)), ["https://html.spec.whatwg.org/#navigate"]);
});

test("finds URLs on changed lines and ignores URLs without a fragment", () => {
  const lines = ["// https://bugzilla.mozilla.org/show_bug.cgi?id=1", "// https://html.spec.whatwg.org/#navigate"];
  assert.deepEqual(specUrlsNear(lines, hunk(2, 1)), ["https://html.spec.whatwg.org/#navigate"]);
});

test("scans from the beginning when there is no column-zero closing brace", () => {
  const lines = ["// https://html.spec.whatwg.org/#navigate", "  }", "Changed();"];
  assert.deepEqual(specUrlsNear(lines, hunk(3, 1)), ["https://html.spec.whatwg.org/#navigate"]);
});

test("strips trailing punctuation", () => {
  assert.deepEqual(specUrlsNear(["// https://html.spec.whatwg.org/#scroll-to-fragid."], hunk(1, 1)), [
    "https://html.spec.whatwg.org/#scroll-to-fragid",
  ]);
});
