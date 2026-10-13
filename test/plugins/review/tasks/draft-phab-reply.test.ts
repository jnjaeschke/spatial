import { test } from "node:test";
import assert from "node:assert/strict";
import { testRuntime } from "../../../helpers/runtime.ts";
import type { PhabCommentData, SuggestedReplyData } from "../../../../src/plugins/review/shared/types.ts";
import type { ChatMessageData, LlmSelection } from "../../../../src/shared/types.ts";
import { draftPhabReply } from "../../../../src/plugins/review/tasks/draft-phab-reply/task.ts";

const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };

function setup(reply: unknown) {
  const { rt, store, session, prompts: calls } = testRuntime({ plugins: [{ id: "test", tasks: [draftPhabReply] }], selection, reply: () => reply, session: {} });
  const phab = (phid: string, txId: number, author: string, body: string, replyTo?: string) => store.putArtifact({ sessionId: session.id, type: "PhabComment", status: "verified",
    data: { revision: 7, phid, version: 1, author, bot: false, byMe: false, body, replyTo, own: false, done: false, txId, dateCreated: txId } satisfies PhabCommentData, provenance: { taskId: "runtime" } });
  const root = phab("ROOT", 1, "alice", "Why THIRTY?");
  phab("R2", 2, "bob", "Agreed, please name it.", "ROOT");
  const thread = store.putArtifact({ sessionId: session.id, type: "ChatThread", status: "verified", data: { anchor: root.id }, provenance: { taskId: "chatTurn" } });
  const say = (role: "user" | "assistant", text: string) => {
    const message = store.putArtifact({ sessionId: session.id, type: "ChatMessage", status: "verified", data: { role, text } satisfies ChatMessageData, provenance: { taskId: "chatTurn" } });
    store.putLink({ sessionId: session.id, from: message.id, to: thread.id, kind: "reply" });
  };
  return { rt, store, session, root, thread, say, calls };
}

test("draftPhabReply prompts with the thread and the chat and stores a proposed SuggestedReply about the thread", async () => {
  const { rt, store, session, root, thread, say, calls } = setup({ body: "Good point, I will name it." });
  say("user", "Is the name needed?");
  say("assistant", "Yes, the literal is unexplained.");
  const result = await rt.run<{ replyId: string; body: string }>(session.id, "draftPhabReply", { anchorId: root.id, threadId: thread.id });
  assert.equal(result.body, "Good point, I will name it.");
  const artifact = store.getArtifact<SuggestedReplyData>(result.replyId);
  assert.equal(artifact.type, "SuggestedReply");
  assert.equal(artifact.status, "proposed");
  assert.deepEqual(artifact.data, { anchor: root.id, body: "Good point, I will name it." });
  assert.ok(store.listLinks(session.id).some((link) => link.from === result.replyId && link.to === root.id && link.kind === "about"));
  assert.equal(calls[0]!.tools, "none");
  const prompt = calls[0]!.prompt;
  for (const text of ["@alice: Why THIRTY?", "@bob: Agreed, please name it.", "User: Is the name needed?", "Assistant: Yes, the literal is unexplained."]) assert.ok(prompt.includes(text), text);
  assert.ok(prompt.indexOf("@alice") < prompt.indexOf("@bob"));
});

test("draftPhabReply needs an answer in the chat", async () => {
  const { rt, session, root, thread, say, calls } = setup({ body: "x" });
  say("user", "Is the name needed?");
  await assert.rejects(rt.run(session.id, "draftPhabReply", { anchorId: root.id, threadId: thread.id }), /no answer/);
  assert.equal(calls.length, 0);
});
