import { test } from "node:test";
import assert from "node:assert/strict";
import { specUrlsNear, stepCommentsNear } from "../../src/tasks/resolve-spec-refs/cited.ts";
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

test("stepCommentsNear reads Step comments on added lines with the nearest URL above them", () => {
  const lines = [
    "// https://dom.spec.whatwg.org/#concept-node-insert",
    "void Insert() {",
    "  // Step 1. Let nodes be node's children.",
    "  Foo();",
    "  // step 3: If count is zero,",
    "  // then return.",
    "  Bar();",
    "  // https://html.spec.whatwg.org/#navigate",
    "  // Step 20. Fire navigatesuccess.",
    "  // Note: callers rely on this.",
    "  // Step 4. An unchanged comment.",
    "  // This is done by the spec in step 1 and",
    "  // step 2 of #fire-a-traverse-navigate-event.",
    "}",
  ];
  const kinds = ["add", "ctx", "add", "add", "add", "ctx", "add", "add", "ctx", "add", "add"] as const;
  const h: Hunk = { ...hunk(3, kinds.length), lines: kinds.map((kind, i) => ({ kind, text: lines[i + 2]! })) };
  assert.deepEqual(stepCommentsNear(lines, h), [
    { line: 3, url: "https://dom.spec.whatwg.org/#concept-node-insert", number: "1", text: "Let nodes be node's children." },
    { line: 5, url: "https://dom.spec.whatwg.org/#concept-node-insert", number: "3", text: "If count is zero, then return." },
    { line: 9, url: "https://html.spec.whatwg.org/#navigate", number: "20", text: "Fire navigatesuccess." },
  ]);
});

test("stepCommentsNear skips Step comments with no URL above them", () => {
  const h: Hunk = { ...hunk(1, 1), lines: [{ kind: "add", text: "// Step 1. Do it." }] };
  assert.deepEqual(stepCommentsNear(["// Step 1. Do it."], h), []);
});
