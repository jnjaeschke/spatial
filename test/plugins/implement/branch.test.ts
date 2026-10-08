import { test } from "node:test";
import assert from "node:assert/strict";
import { branchSlug, freeBranchName } from "../../../src/plugins/implement/branch.ts";

test("slug is lowercase words of the request, at most six, joined by dashes", () => {
  assert.equal(branchSlug("Fix the crash on close, please!"), "fix-the-crash-on-close-please");
  assert.equal(branchSlug("a b c d e f g h"), "a-b-c-d-e-f");
  assert.equal(branchSlug("  !!! "), "change");
  assert.ok(branchSlug("x".repeat(100)).length <= 40);
});

test("a taken branch name gets a numeric suffix", async () => {
  const taken = new Set(["spatial/fix-it", "spatial/fix-it-2"]);
  assert.equal(await freeBranchName("Fix it", async (name) => taken.has(name)), "spatial/fix-it-3");
  assert.equal(await freeBranchName("Other", async (name) => taken.has(name)), "spatial/other");
});
