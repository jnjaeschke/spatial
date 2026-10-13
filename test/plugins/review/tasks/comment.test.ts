import { test } from "node:test";
import assert from "node:assert/strict";
import { testRuntime } from "../../../helpers/runtime.ts";
import type { ReviewCommentData, ReviewFindingData } from "../../../../src/plugins/review/shared/types.ts";
import type { ChatMessageData, LlmSelection } from "../../../../src/shared/types.ts";
import { comment } from "../../../../src/plugins/review/tasks/comment/task.ts";

const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };

function setup(replies: unknown[]) {
  let index = 0;
  const { rt, store, session, prompts: calls } = testRuntime({ plugins: [{ id: "test", tasks: [comment] }], selection, reply: () => replies[index++], session: {} });
  const finding = store.putArtifact({ sessionId: session.id, type: "ReviewFinding", status: "proposed",
    data: { anchor: "diff#f0h0", quote: "mFlag = true", lines: { path: "dom/A.cpp", side: "new", start: 8, end: 8 },
      category: "correctness", severity: "high", title: "Flag never reset", body: "The flag remains set after teardown." } satisfies ReviewFindingData,
    provenance: { taskId: "review" } });
  return { rt, store, session, finding, calls };
}

test("finding with chat thread produces a proposed ReviewComment", async () => {
  const { rt, store, session, finding, calls } = setup([{ body: "Reset the flag during teardown." }]);
  const thread = store.putArtifact({ sessionId: session.id, type: "ChatThread", status: "verified", data: { anchor: finding.id }, provenance: { taskId: "chatTurn" } });
  store.putLink({ sessionId: session.id, from: thread.id, to: finding.id, kind: "about" });
  for (const [role, text] of [["user", "Does teardown clear it?"], ["assistant", "No, the flag stays set."]] as const) {
    const message = store.putArtifact({ sessionId: session.id, type: "ChatMessage", status: "verified", data: { role, text } satisfies ChatMessageData, provenance: { taskId: "chatTurn" } });
    store.putLink({ sessionId: session.id, from: message.id, to: thread.id, kind: "reply" });
  }

  const { commentId } = await rt.run<{ commentId: string }>(session.id, "comment", { findingId: finding.id });
  const artifact = store.getArtifact<ReviewCommentData>(commentId);
  assert.equal(artifact.type, "ReviewComment");
  assert.equal(artifact.status, "proposed");
  assert.deepEqual(artifact.data, { finding: finding.id, body: "Reset the flag during teardown." });
  assert.ok(store.listLinks(session.id).some((link) => link.from === commentId && link.to === finding.id && link.kind === "about"));
  assert.equal(calls[0]!.tools, "none");
  for (const text of ["Flag never reset", "The flag remains set after teardown.", "Does teardown clear it?", "No, the flag stays set."]) {
    assert.ok(calls[0]!.prompt.includes(text), text);
  }
});

test("finding without chat uses finding body only", async () => {
  const { rt, finding, calls } = setup([{ body: "Reset the flag during teardown." }]);
  await rt.run(rt.store.getSession(finding.sessionId).id, "comment", { findingId: finding.id });
  assert.ok(calls[0]!.prompt.includes("The flag remains set after teardown."));
  assert.ok(!calls[0]!.prompt.includes("# Conversation"));
});

test("invalid LLM reply is repaired", async () => {
  const { rt, finding, calls } = setup([{ summary: "x" }, { body: "valid" }]);
  await rt.run(finding.sessionId, "comment", { findingId: finding.id });
  assert.equal(calls.length, 2);
  assert.match(calls[1]!.prompt, /Your previous answer was invalid/);
});
