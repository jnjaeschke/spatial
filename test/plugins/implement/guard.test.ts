import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../../src/runtime/store.ts";
import type { NotifyPayload, RuntimeEvent, WorkflowStartData } from "../../../src/shared/types.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { implementWorkflow } from "../../../src/plugins/implement/workflow/implement.ts";
import { testRuntime } from "../../helpers/runtime.ts";

function setup() {
  const store = new Store(":memory:");
  const { rt } = testRuntime({ store, plugins: [specPlugin, reviewPlugin, implementPlugin] });
  const make = (worktree: string) => store.createSession({ worktree, repoDir: `${worktree}/.git`, title: "t", workflow: "implement" });
  return { store, rt, make };
}

test("the start box refuses a checkout with another running implement session before a session exists", async () => {
  const { store, rt, make } = setup();
  const busy = make("/repo");
  store.createEpoch(busy.id, "implement", null);
  await assert.rejects(implementWorkflow.precheck!("/repo", { request: "x", profile: null, checkout: "new-branch" }, rt), new RegExp(`in use by the implement session "t" ${busy.id} \\(implement running\\); finish or abandon it first`));
});

test("a checkout with another running implement session is refused with a notice", async () => {
  const { store, rt, make } = setup();
  const busy = make("/repo");
  store.putArtifact({ sessionId: busy.id, type: "ImplementBranch", status: "verified", data: { branch: "spatial/a", baseSha: "b", baseRef: null, checkout: "new-branch" }, provenance: { taskId: "t" } });
  store.createEpoch(busy.id, "implement", null);
  const mine = make("/repo");
  const start = store.putArtifact<WorkflowStartData>({ sessionId: mine.id, type: "WorkflowStart", status: "verified", provenance: { taskId: "user" }, data: { via: "command", workflow: "implement", profile: "plain-git", params: { request: "x", profile: null, checkout: null }, title: "t", prompt: "x" } });
  const events: RuntimeEvent[] = [];
  rt.onEvent((e) => events.push(e));
  await assert.rejects(implementWorkflow.start(rt, mine.id, { params: { request: "x", profile: null, checkout: null }, startId: start.id, prompt: "x" }), /in use by the implement session/);
  assert.ok(events.some((e) => e.type === "notify" && (e.payload as { title: string }).title === "Checkout in use"));
  const notice = events.find((e) => e.type === "notify")!.payload as NotifyPayload;
  assert.deepEqual(notice.action, { label: "Abandon that session", path: `/api/sessions/${busy.id}/abandon` });
  assert.match(notice.body!, new RegExp(`${busy.id}.*implement running`));
  assert.equal(store.listTasks(mine.id).length, 0);
});

test("an implement session waiting on an open decision keeps its checkout; a finished one frees it", async () => {
  const { store, rt, make } = setup();
  const waiting = make("/repo");
  const put = (type: string, data: unknown) => store.putArtifact({ sessionId: waiting.id, type, status: "verified", data, provenance: { taskId: "t" } });
  put("WorkflowStart", { via: "command", workflow: "implement", profile: "plain-git", params: { request: "x", profile: null, checkout: null }, title: "t", prompt: "x" });
  put("ImplementBranch", { branch: "spatial/a", baseSha: "b", baseRef: null, checkout: "new-branch" });
  const epoch = store.createEpoch(waiting.id, "investigate", null);
  store.updateEpoch(waiting.id, epoch.n, { status: "succeeded" });
  put("Investigation", { kind: "bugfix", summary: "S", bug: null, locations: [], testCases: [], steps: [], openQuestions: [], exploration: [] });
  const { isActive } = await import("../../../src/plugins/implement/workflow/next.ts");
  assert.equal(isActive(rt, waiting.id), true);
  put("Decision", { key: "approve", question: "Approve the investigation plan?", options: [], chosen: { option: "cancel", by: "user" } });
  assert.equal(isActive(rt, waiting.id), false);
});

test("a session whose latest own epoch failed or was cancelled keeps its checkout; a failed phase it does not own does not", async () => {
  const { store, rt, make } = setup();
  const { isActive } = await import("../../../src/plugins/implement/workflow/next.ts");
  const session = make("/repo");
  const put = (type: string, data: unknown) => store.putArtifact({ sessionId: session.id, type, status: "verified", data, provenance: { taskId: "t" } });
  put("WorkflowStart", { via: "command", workflow: "implement", profile: "plain-git", params: { request: "x", profile: null, checkout: null }, title: "t", prompt: "x" });
  put("ImplementBranch", { branch: "spatial/a", baseSha: "b", baseRef: null, checkout: "new-branch" });
  const investigate = store.createEpoch(session.id, "investigate", null);
  store.updateEpoch(session.id, investigate.n, { status: "failed", error: "boom" });
  assert.equal(isActive(rt, session.id), true, "a failed investigation can be retried");
  store.updateEpoch(session.id, investigate.n, { status: "succeeded", error: null });
  put("Investigation", { kind: "bugfix", summary: "S", bug: null, locations: [], testCases: [], steps: [], openQuestions: [], exploration: [] });
  put("Decision", { key: "approve", question: "Approve the investigation plan?", options: [], chosen: { option: "cancel", by: "user" } });
  assert.equal(isActive(rt, session.id), false);
  const push = store.createEpoch(session.id, "try", null);
  store.updateEpoch(session.id, push.n, { status: "failed", error: "mach try failed" });
  assert.equal(isActive(rt, session.id), false, "try is not an implement phase");

  const other = make("/repo");
  const putOther = (type: string, data: unknown) => store.putArtifact({ sessionId: other.id, type, status: "verified", data, provenance: { taskId: "t" } });
  putOther("WorkflowStart", { via: "command", workflow: "implement", profile: "plain-git", params: { request: "x", profile: null, checkout: null }, title: "t", prompt: "x" });
  putOther("ImplementBranch", { branch: "spatial/b", baseSha: "b", baseRef: null, checkout: "new-branch" });
  const first = store.createEpoch(other.id, "investigate", null);
  store.updateEpoch(other.id, first.n, { status: "succeeded" });
  putOther("Investigation", { kind: "bugfix", summary: "S", bug: null, locations: [], testCases: [], steps: [], openQuestions: [], exploration: [] });
  putOther("Decision", { key: "approve", question: "Approve the investigation plan?", options: [], chosen: { option: "cancel", by: "user" } });
  const writing = store.createEpoch(other.id, "implement", null);
  store.updateEpoch(other.id, writing.n, { status: "cancelled", error: "cancelled" });
  assert.equal(isActive(rt, other.id), true, "a cancelled implement epoch can be retried");
});

test("an abandoned session releases its checkout whatever state its epochs are in", async () => {
  const { store, rt, make } = setup();
  const { isActive } = await import("../../../src/plugins/implement/workflow/next.ts");
  const session = make("/repo");
  const put = (type: string, data: unknown) => store.putArtifact({ sessionId: session.id, type, status: "verified", data, provenance: { taskId: "t" } });
  put("WorkflowStart", { via: "command", workflow: "implement", profile: "plain-git", params: { request: "x", profile: null, checkout: null }, title: "t", prompt: "x" });
  put("ImplementBranch", { branch: "spatial/a", baseSha: "b", baseRef: null, checkout: "new-branch" });
  const epoch = store.createEpoch(session.id, "implement", null);
  store.updateEpoch(session.id, epoch.n, { status: "failed", error: "boom" });
  assert.equal(isActive(rt, session.id), true);
  put("Abandoned", {});
  assert.equal(isActive(rt, session.id), false);
});
