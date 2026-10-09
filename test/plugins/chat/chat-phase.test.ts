import { test } from "node:test";
import assert from "node:assert/strict";
import { chatPhase } from "../../../src/plugins/chat/index.ts";
import type { Artifact, ChatMessageData, Epoch } from "../../../src/shared/types.ts";
import type { WorkflowView } from "../../../src/runtime/render-ref.ts";
import { runWorkflow } from "../../../src/workflows/start.ts";
import type { Runtime } from "../../../src/runtime/tasks.ts";

const epoch = (n: number): Epoch => ({ sessionId: "S", n, phase: "chat", status: "succeeded", input: null, error: null, startedAt: "", endedAt: "" });
const message = (n: number, data: ChatMessageData): Artifact<ChatMessageData> => ({ id: `M${n}`, sessionId: "S", type: "ChatMessage", status: "proposed", data, provenance: { taskId: "chatTurn" }, epoch: n, createdAt: "" });
const view = (artifacts: Artifact[], epochs: Epoch[]): WorkflowView => ({ artifacts, links: [], epochs });

test("chat phase follows a reply's requested run only for its epoch", () => {
  const first = epoch(1);
  assert.deepEqual(chatPhase.next!(view([message(1, { role: "assistant", text: "go", run: { phase: "p", input: { x: 1 } } })], [first]), first), { run: "p", input: { x: 1 } });
  assert.equal(chatPhase.next!(view([message(1, { role: "assistant", text: "no" })], [first]), first), null);
  assert.equal(chatPhase.next!(view([message(2, { role: "assistant", text: "later", run: { phase: "p", input: null } })], [first]), first), null);
});

test("runWorkflow advances after a workflow start even when that workflow has no next", async () => {
  let advanced = 0;
  const rt = {
    store: { getArtifact: () => ({ data: { workflow: "chat", title: "t", params: {}, prompt: "hi", llm: undefined } }), setSessionStart() {} },
    emit() {}, workflows: { get: () => ({ start: async () => {} }) }, async advance() { advanced++; },
  } as unknown as Runtime;
  await runWorkflow(rt, "S", "start");
  assert.equal(advanced, 1);
});
