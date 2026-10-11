import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../../src/runtime/tasks.ts";
import type { LlmService } from "../../../src/runtime/llm/types.ts";
import { corePlugin } from "../../../src/runtime/create.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { makeWebspec } from "../../../src/runtime/webspec.ts";
import { runWorkflow } from "../../../src/workflows/start.ts";
import type { DecisionData, WorkflowStartData } from "../../../src/shared/types.ts";
import type { SpecOpenedData } from "../../../src/plugins/spec/shared/types.ts";

const fake = makeWebspec({ bin: fileURLToPath(new URL("../../stubs/fake-webspec.mjs", import.meta.url)) });
function setup(webspec: WebspecCapability = fake) {
  const rt = new Runtime({ store: new Store(":memory:"), plugins: [corePlugin, specPlugin], llm: {} as LlmService, git: () => ({}) as GitCapability, webspec, searchfox: {} as SearchfoxCapability });
  const session = rt.store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const start = (query: string) => rt.store.putArtifact<WorkflowStartData>({ sessionId: session.id, type: "WorkflowStart", status: "verified", provenance: { taskId: "user" }, data: { via: "command", workflow: "explore", params: { query }, title: query, prompt: query } });
  return { rt, session, start };
}
const opened = (rt: Runtime, sessionId: string) => rt.store.listArtifacts(sessionId, "SpecOpened").map((a) => a.data as SpecOpenedData);

test("a ref opens its algorithm as the root box", async () => {
  const { rt, session, start } = setup();
  await runWorkflow(rt, session.id, start("HTML#navigate").id);
  assert.deepEqual(opened(rt, session.id), [{ anchor: "HTML#navigate", from: null }]);
  assert.equal(rt.store.listArtifacts(session.id, "SpecAlgorithm").length, 1);
});

test("a phrase asks which result to open, and the answer opens it", async () => {
  const { rt, session, start } = setup();
  await runWorkflow(rt, session.id, start("navigate").id);
  const open = rt.store.listArtifacts(session.id, "Decision").at(-1)!;
  const data = open.data as DecisionData;
  assert.equal(data.question, 'Which section for "navigate"?');
  assert.deepEqual(data.options.map((o) => o.id), ["HTML#navigate", "HTML#navigate-fragid"]);
  rt.store.putArtifact<DecisionData>({ sessionId: session.id, type: "Decision", status: "verified", epoch: open.epoch, provenance: { taskId: "user" }, data: { ...data, chosen: { option: "HTML#navigate", by: "user" } } });
  await rt.advance(session.id);
  assert.deepEqual(opened(rt, session.id), [{ anchor: "HTML#navigate", from: null }]);
  assert.deepEqual(rt.store.listEpochs(session.id).map((e) => [e.phase, e.status]), [["explore", "succeeded"], ["explore", "succeeded"]]);
});

test("a phrase without results fails the epoch", async () => {
  const { rt, session, start } = setup({ ...fake, search: async () => [] });
  await assert.rejects(runWorkflow(rt, session.id, start("zzz").id), /No spec section matches "zzz"/);
  assert.equal(rt.store.listEpochs(session.id)[0]!.status, "failed");
});
