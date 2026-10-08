import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import { Store } from "../../src/runtime/store.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import { importRevision } from "../../src/tasks/import-revision/task.ts";

test("host resolution failure is recorded as a failed importRevision task", async () => {
  const repo = mkdtempSync(join(tmpdir(), "import-revision-task-"));
  try {
    const store = new Store(":memory:");
    const session = store.createSession({ worktree: repo, repoDir: join(repo, ".git"), title: "Review", workflow: "review" });
    const llm = { defaultSelection: { backend: "claude", model: "sonnet", effort: "medium" }, async run() { throw new Error("unexpected llm call"); }, async listModels() { return {}; } } as unknown as LlmService;
    const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [importRevision] }], llm, git: () => ({}) as GitCapability,
      webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });

    await assert.rejects(rt.run(session.id, "importRevision", { host: null, id: 1 }));
    const [task] = store.listTasks(session.id);
    assert.equal(task?.kind, "importRevision");
    assert.equal(task?.status, "failed");
    assert.match(task?.error ?? "", /\.arcconfig/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
