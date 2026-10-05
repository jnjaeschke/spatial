import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { Runtime } from "../../src/runtime/tasks.ts";
import { makeGit, createSession } from "../../src/runtime/git.ts";
import { importDiff } from "../../src/tasks/import-diff/task.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { DiffData } from "../../src/shared/types.ts";
import { makeRepo } from "../helpers/git-fixture.ts";

const noLlm = {} as LlmService;

async function setup() {
  const r = makeRepo();
  const store = new Store(":memory:");
  const rt = new Runtime({ store, tasks: [importDiff], llm: noLlm, git: makeGit });
  const session = await createSession(store, r.dir, "t");
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
  assert.deepEqual(a.data.commits.map((c) => c.subject), ["Bug 1 - part 1", "Bug 1 - part 2"]);
  assert.deepEqual(a.data.files.map((f) => [f.path, f.status, f.hunks.map((h) => h.id)]), [["a.txt", "modified", ["f0h0"]], ["c.txt", "added", ["f1h0"]]]);
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
