import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type WebspecCapability, type SearchfoxCapability } from "../../src/runtime/tasks.ts";
import { makeGit, createSession } from "../../src/runtime/git.ts";
import { importDiff } from "../../src/tasks/import-diff/task.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { DiffData } from "../../src/shared/types.ts";
import { hunkCommit } from "../../src/shared/review-path.ts";
import { makeRepo } from "../helpers/git-fixture.ts";

const noLlm = {
  defaultSelection: { backend: "claude", model: "m", effort: "low" },
  async run() { throw new Error("unused"); },
  async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
} satisfies LlmService;

async function setup() {
  const r = makeRepo();
  const store = new Store(":memory:");
  const rt = new Runtime({ store, tasks: [importDiff], llm: noLlm, git: makeGit, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const session = await createSession(store, r.dir, "t", "review");
  return { r, store, rt, session };
}

test("imports a range as a verified Diff artifact", async () => {
  const { r, store, rt, session } = await setup();
  const base = r.commit({ "a.txt": "1\n2\n3\n" }, "base");
  r.commit({ "a.txt": "1\nTWO\n3\n" }, "Bug 1 - part 1");
  const head = r.commit({ "c.txt": "c\n" }, "Bug 1 - part 2");
  const { diffId } = await rt.run<{ diffId: string }>(session.id, "importDiff", { base: "HEAD~2", head: "HEAD" });
  const a = store.getArtifact<DiffData>(diffId);
  assert.equal(a.type, "Diff");
  assert.equal(a.status, "verified");
  assert.equal(a.data.baseSha, base);
  assert.equal(a.data.headSha, head);
  assert.equal(a.data.upstreamRev, undefined);
  assert.deepEqual(a.data.commits.map((c) => c.subject), ["Bug 1 - part 1", "Bug 1 - part 2"]);
  assert.deepEqual(a.data.files.map((f) => [f.path, f.status, f.hunks.map((h) => h.id)]), [["a.txt", "modified", ["f0h0"]], ["c.txt", "added", ["f1h0"]]]);
  // The first commit's replacement and the second commit's added file retain stack ownership.
  assert.deepEqual(a.data.files.map((f) => f.hunks.flatMap((h) => h.lines.filter((l) => l.kind === "add").map((l) => [l.text, l.commit]))), [[["TWO", 0]], [["c", 1]]]);
});

// REQUIRES_REAL_GIT
test("splits squashed hunks when changed lines belong to different commits", async () => {
  const { r, store, rt, session } = await setup();
  r.commit({ "a.txt": "1\n2\n3\n4\n5\n" }, "base");
  r.commit({ "a.txt": "ONE\n2\n3\n4\n5\n" }, "first");
  r.commit({ "a.txt": "ONE\n2\n3\n4\nFIVE\n" }, "second");
  const { diffId } = await rt.run<{ diffId: string }>(session.id, "importDiff", { base: "HEAD~2", head: "HEAD" });
  const file = store.getArtifact<DiffData>(diffId).data.files[0]!;
  assert.deepEqual(file.hunks.map((hunk) => [hunk.id, hunkCommit(store.getArtifact<DiffData>(diffId).data, hunk), hunk.oldStart, hunk.oldLines, hunk.newStart, hunk.newLines]), [
    ["f0h0", 0, 1, 4, 1, 4], ["f0h1", 1, 5, 1, 5, 1],
  ]);
});

// REQUIRES_REAL_GIT
test("imported hunks report when a later commit rewrites an earlier addition", async () => {
  const { r, store, rt, session } = await setup();
  r.commit({ "a.txt": "one\ntwo\n" }, "base");
  r.commit({ "a.txt": "one\nintroduced\ntwo\n" }, "first");
  r.commit({ "a.txt": "one\nrewritten\ntwo\n" }, "second");
  const { diffId } = await rt.run<{ diffId: string }>(session.id, "importDiff", { base: "HEAD~2", head: "HEAD" });
  const file = store.getArtifact<DiffData>(diffId).data.files[0]!;
  assert.deepEqual(file.hunks[0]!.rewrites, [{ by: 1, of: 0, lines: 1 }]);
});

// REQUIRES_REAL_GIT
test("single-commit import stores no line attribution", async () => {
  const { r, store, rt, session } = await setup();
  r.commit({ "a.txt": "1\n2\n" }, "base");
  r.commit({ "a.txt": "1\nTWO\n" }, "one change");
  const { diffId } = await rt.run<{ diffId: string }>(session.id, "importDiff", { base: "HEAD~1", head: "HEAD" });
  assert.equal(store.getArtifact<DiffData>(diffId).data.files[0]!.hunks[0]!.lines.some((line) => line.commit !== undefined), false);
});

test("records the merge-base with main for Gecko repositories", async () => {
  const { r, store, rt, session } = await setup();
  const base = r.commit({ mach: "", "moz.build": "", "a.txt": "1\n" }, "main tip");
  const { execFileSync } = await import("node:child_process");
  execFileSync("git", ["-C", r.dir, "checkout", "-qb", "patch"]);
  const expected = r.commit({ "a.txt": "3\n" }, "patch base");
  r.commit({ "a.txt": "4\n" }, "patch head");
  const { diffId } = await rt.run<{ diffId: string }>(session.id, "importDiff", { base: expected, head: "HEAD" });
  assert.equal(store.getArtifact<DiffData>(diffId).data.upstreamRev, base);
  assert.equal(base.length, 40);
});

test("Gecko repository without main imports with upstreamRev absent", async () => {
  const { r, store, rt, session } = await setup();
  r.commit({ mach: "", "moz.build": "", "a.txt": "1\n" }, "base");
  r.commit({ "a.txt": "2\n" }, "head");
  const { execFileSync } = await import("node:child_process");
  execFileSync("git", ["-C", r.dir, "branch", "-m", "other"]);
  const { diffId } = await rt.run<{ diffId: string }>(session.id, "importDiff", { base: "HEAD~1", head: "HEAD" });
  assert.equal(store.getArtifact<DiffData>(diffId).data.upstreamRev, undefined);
});

test("fails when base is not an ancestor of head", async () => {
  const { r, rt, session } = await setup();
  r.commit({ "a.txt": "1\n" }, "one");
  r.commit({ "a.txt": "2\n" }, "two");
  await assert.rejects(rt.run(session.id, "importDiff", { base: "HEAD", head: "HEAD~1" }), /is not an ancestor of/);
});

test("fails on an empty range", async () => {
  const { r, rt, session } = await setup();
  r.commit({ "a.txt": "1\n" }, "one");
  await assert.rejects(rt.run(session.id, "importDiff", { base: "HEAD", head: "HEAD" }), /Empty diff/);
});
