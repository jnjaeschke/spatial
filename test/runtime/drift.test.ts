import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDrift } from "../../src/runtime/drift.ts";

const d = "diff --git a/dom/A.cpp b/dom/A.cpp\nindex 123..456 100644\n--- a/dom/A.cpp\n+++ b/dom/A.cpp\n@@ -1,2 +1,2 @@\n same\n-old\n+new\n";

test("identical diffs pass", () => assert.equal(checkDrift(d, d), null));

test("different hunk content returns first differing file", () => {
  const remote = d.replace("+new", "+other");
  assert.equal(checkDrift(d, remote), "dom/A.cpp");
});

test("header-only differences are ignored", () => {
  const local = d.replace("index 123..456 100644", "index aaa..bbb 100755").replace("@@ -1,2 +1,2 @@", "@@ -1 +1 @@");
  assert.equal(checkDrift(d, local), null);
});

test("full-file context on one side is ignored", () => {
  const full = "diff --git a/dom/A.cpp b/dom/A.cpp\n--- a/dom/A.cpp\n+++ b/dom/A.cpp\n@@ -1,4 +1,4 @@\n same\n-old\n+new\n tail1\n tail2\n";
  assert.equal(checkDrift(d, full), null);
});

test("the same change at a different line is drift", () => {
  const moved = "diff --git a/dom/A.cpp b/dom/A.cpp\n--- a/dom/A.cpp\n+++ b/dom/A.cpp\n@@ -5,2 +5,2 @@\n same\n-old\n+new\n";
  assert.equal(checkDrift(d, moved), "dom/A.cpp");
});

test("removed lines starting with dashes are content, not headers", () => {
  const dashed = d.replace("-old", "--- old");
  assert.equal(checkDrift(d, dashed), "dom/A.cpp");
});

test("a file present in only one diff is reported", () => {
  const extra = "diff --git a/dom/B.cpp b/dom/B.cpp\nindex 1..2 100644\n--- a/dom/B.cpp\n+++ b/dom/B.cpp\n@@ -0,0 +1 @@\n+added\n";
  assert.equal(checkDrift(d + extra, d), "dom/B.cpp");
});
