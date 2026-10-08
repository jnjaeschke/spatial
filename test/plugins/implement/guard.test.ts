import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../../src/runtime/tasks.ts";
import type { LlmService } from "../../../src/runtime/llm/types.ts";
import type { RuntimeEvent, WorkflowStartData } from "../../../src/shared/types.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { implementWorkflow } from "../../../src/plugins/implement/workflow/implement.ts";

const llm: LlmService = { defaultSelection: { backend: "claude", model: "m", effort: "low" }, async run() { throw new Error("unused"); }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } };
function setup() {
  const store = new Store(":memory:");
  const rt = new Runtime({ store, plugins: [reviewPlugin, implementPlugin], llm, git: () => ({}) as GitCapability, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const make = (worktree: string) => store.createSession({ worktree, repoDir: `${worktree}/.git`, title: "t", workflow: "implement" });
  return { store, rt, make };
}

test("a checkout with another running implement session is refused with a notice", async () => {
  const { store, rt, make } = setup();
  const busy = make("/repo");
  store.putArtifact({ sessionId: busy.id, type: "ImplementBranch", status: "verified", data: { branch: "spatial/a", baseSha: "b", baseRef: null, profile: "plain-git", checkout: "new-branch" }, provenance: { taskId: "t" } });
  store.createEpoch(busy.id, "implement", null);
  const mine = make("/repo");
  const start = store.putArtifact<WorkflowStartData>({ sessionId: mine.id, type: "WorkflowStart", status: "verified", provenance: { taskId: "user" }, data: { via: "command", workflow: "implement", params: { request: "x", profile: null, checkout: null }, title: "t", prompt: "x" } });
  const events: RuntimeEvent[] = [];
  rt.onEvent((e) => events.push(e));
  await assert.rejects(implementWorkflow.start(rt, mine.id, { params: { request: "x", profile: null, checkout: null }, startId: start.id, prompt: "x" }), /in use by the implement session/);
  assert.ok(events.some((e) => e.type === "notify" && (e.payload as { title: string }).title === "Checkout in use"));
  assert.equal(store.listTasks(mine.id).length, 0);
});

test("an implement session waiting on an open decision keeps its checkout; a finished one frees it", async () => {
  const { store, rt, make } = setup();
  const waiting = make("/repo");
  const put = (type: string, data: unknown) => store.putArtifact({ sessionId: waiting.id, type, status: "verified", data, provenance: { taskId: "t" } });
  put("WorkflowStart", { via: "command", workflow: "implement", params: { request: "x", profile: null, checkout: null }, title: "t", prompt: "x" });
  put("ImplementBranch", { branch: "spatial/a", baseSha: "b", baseRef: null, profile: "plain-git", checkout: "new-branch" });
  const epoch = store.createEpoch(waiting.id, "investigate", null);
  store.updateEpoch(waiting.id, epoch.n, { status: "succeeded" });
  put("Investigation", { kind: "bugfix", summary: "S", bug: null, locations: [], testCases: [], steps: [], openQuestions: [], exploration: [] });
  const { isActive } = await import("../../../src/plugins/implement/workflow/next.ts");
  assert.equal(isActive(rt, waiting.id), true);
  put("Decision", { question: "Approve the investigation plan?", options: [], chosen: { option: "cancel", by: "user" } });
  assert.equal(isActive(rt, waiting.id), false);
});
