import { test } from "node:test";
import assert from "node:assert/strict";
import { geckoProfile } from "../../../src/plugins/gecko/profile.ts";

test("gecko commit messages need Bug N - summary, optionally with reviewers", () => {
  for (const ok of ["Bug 12 - Fix the thing", "Bug 12 - Fix the thing r?alice", "Bug 12 - Fix r?alice,bob", "Bug 1 - Handle r? in docs of x"]) assert.equal(geckoProfile.messageCheck!(ok), null, ok);
  for (const bad of ["Fix the thing", "bug 12 - x", "Bug 12 -x", "Bug - x", "Bug 12 - r?alice", "Bug 12 - Fix r?"]) assert.notEqual(geckoProfile.messageCheck!(bad), null, bad);
});

test("gecko test commands are ./mach test runners", () => {
  for (const yes of ["./mach test dom/x", "./mach mochitest dom/x", "./mach wpt a/b", "./mach gtest Foo.*", "./mach xpcshell-test x", "  ./mach test x"]) assert.equal(geckoProfile.isTestCommand!(yes), true, yes);
  for (const no of ["./mach build", "git status", "./mach testing"]) assert.equal(geckoProfile.isTestCommand!(no), false, no);
});

test("gecko check command builds then tests the changed paths, quoted", () => {
  assert.equal(geckoProfile.checkCommand!(["dom/a.cpp", "it's.js"]), "./mach build && ./mach test 'dom/a.cpp' 'it'\\''s.js'");
});

test("gecko is a stack profile that requires a bug and runs try after Accept", () => {
  assert.equal(geckoProfile.commitStyle, "stack");
  assert.equal(geckoProfile.requiresBug, true);
  assert.deepEqual(geckoProfile.afterAccept, ["try"]);
  assert.equal(geckoProfile.suggestReviewers, "./mach file-info reviewers");
});
