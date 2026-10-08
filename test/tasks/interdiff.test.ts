import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { DiffData } from "../../src/shared/types.ts";
import { interdiff } from "../../src/plugins/review/tasks/interdiff/task.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";

test("interdiff task records verified artifact and about link", async () => {
  const store = new Store(":memory:");
  const repo = "/repo";
  const session = store.createSession({ worktree: repo, repoDir: `${repo}/.git`, title: "test" });
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [interdiff] }], llm: {} as LlmService, git: () => ({ diff: async () => "", replay: async () => ({ tree: "T", conflicts: [] }) } as unknown as GitCapability), webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const data: DiffData = { baseSha: "B", headSha: "H", commits: [], files: [] };
  const from = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data, provenance: { taskId: "seed" } });
  const to = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: { ...data, headSha: "H2" }, provenance: { taskId: "seed" } });
  const { interdiffId } = await rt.run<{ interdiffId: string }>(session.id, "interdiff", { fromDiffId: from.id, toDiffId: to.id });
  const artifact = store.getArtifact(interdiffId);
  assert.equal(artifact.type, "Interdiff");
  assert.equal(artifact.status, "verified");
  assert.equal(artifact.provenance.llm, undefined);
  assert.deepEqual(artifact.data, { fromDiff: from.id, toDiff: to.id, files: [], conflicts: [] });
  assert.deepEqual(store.listLinks(session.id).map((link) => [link.from, link.to, link.kind]), [[interdiffId, to.id, "about"]]);
  const other = store.putArtifact({ sessionId: session.id, type: "Other", status: "verified", data: {}, provenance: { taskId: "seed" } });
  await assert.rejects(rt.run(session.id, "interdiff", { fromDiffId: other.id, toDiffId: to.id }), /is not a Diff/);
});
