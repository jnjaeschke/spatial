import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { defineTask, Runtime, TaskCancelledError, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { LlmPrompt, LlmService } from "../../src/runtime/llm/types.ts";
import type { ChatMessageData, ChatThreadData, DiffData, LlmSelection, PatchNarrativeData } from "../../src/shared/types.ts";
import { chatTurn } from "../../src/tasks/chat-turn/task.ts";

const SONNET: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };
const LUNA: LlmSelection = { backend: "codex", model: "gpt-6-luna", effort: "medium" };

const DIFF: DiffData = {
  baseSha: "b", headSha: "h",
  commits: [{ sha: "1", subject: "Bug 1 - Add flag", body: "Because teardown." }],
  files: [{ path: "dom/A.cpp", status: "modified", binary: false, hunks: [
    { id: "f0h0", header: "@@ -1 +1 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "del", text: "old" }, { kind: "add", text: "mFlag = true;" }] },
    { id: "f0h1", header: "@@ -9 +9 @@", oldStart: 9, oldLines: 1, newStart: 9, newLines: 1, lines: [{ kind: "add", text: "other();" }] },
  ] }],
};

function setup(opts: { failWith?: string; hang?: boolean } = {}) {
  const store = new Store(":memory:");
  const calls: { prompt: LlmPrompt; selection?: LlmSelection }[] = [];
  let n = 0;
  const llm: LlmService = {
    defaultSelection: SONNET,
    run(selection, prompt, signal) {
      calls.push({ prompt, selection });
      if (opts.hang) return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
      if (opts.failWith) return Promise.reject(new Error(opts.failWith));
      n++;
      return Promise.resolve({ text: `answer ${n}`, providerSessionId: `${selection!.backend}-session-${n}`, selection: selection! });
    },
    async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
  };
  const rt = new Runtime({
    store, tasks: [chatTurn], llm, git: () => ({}) as GitCapability,
    webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability,
    sessionMcp: (sessionId) => ({ spatial: { command: "node", args: ["server.ts", "--session", sessionId] } }),
  });
  const session = store.createSession("/repo", "t");
  const put = <T>(type: string, data: T) => store.putArtifact({ sessionId: session.id, type, status: "verified", data, provenance: { taskId: "x" } });
  const diffId = put("Diff", DIFF).id;
  const narrativeId = put<PatchNarrativeData>("PatchNarrative", {
    diffId, summary: "s",
    changes: [{ id: "c1", title: "Add flag", explanation: "Adds mFlag.", rationale: "Teardown after commit.", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] },
              { id: "c2", title: "Other", explanation: "x", rationale: "y", hunkIds: ["f0h1"], dependsOn: [], specUrls: [] }],
  }).id;
  store.putLink({ sessionId: session.id, from: narrativeId, to: diffId, kind: "derivedFrom" });
  const turn = (input: object) => rt.run<{ threadId: string; messageId: string }>(session.id, "chatTurn", input);
  return { store, rt, session, diffId, narrativeId, calls, turn };
}

const messages = (store: Store, sessionId: string, threadId: string) =>
  store.listLinks(sessionId).filter((l) => l.to === threadId && l.kind === "reply").map((l) => store.getArtifact<ChatMessageData>(l.from).data);

test("first turn on a change creates the thread and injects change context", async () => {
  const { store, session, narrativeId, calls, turn } = setup();
  const { threadId, messageId } = await turn({ anchor: `${narrativeId}#c1`, text: "Why the flag?", llm: SONNET });
  const thread = store.getArtifact<ChatThreadData>(threadId);
  assert.equal(thread.type, "ChatThread");
  assert.deepEqual(thread.data, { anchor: `${narrativeId}#c1` });
  assert.ok(store.listLinks(session.id).some((l) => l.from === threadId && l.to === `${narrativeId}#c1` && l.kind === "about"));
  assert.deepEqual(messages(store, session.id, threadId), [
    { role: "user", text: "Why the flag?" },
    { role: "assistant", text: "answer 1", llm: SONNET, providerSessionId: "claude-session-1" },
  ]);
  assert.equal(store.getArtifact(messageId).id, messageId);
  const p = calls[0].prompt;
  assert.equal(p.tools, "read-only");
  assert.equal(p.cwd, "/repo");
  assert.equal(p.resumeProviderSession, undefined);
  assert.match(p.system!, /read-only access/);
  for (const s of ["Add flag", "Adds mFlag.", "Teardown after commit.", "mFlag = true;", "Bug 1 - Add flag", "Why the flag?"]) assert.ok(p.prompt.includes(s), s);
  assert.ok(p.prompt.includes("# Session"));
  assert.ok(p.prompt.includes("# You are asked about"));
  assert.ok(!p.prompt.includes("other();"));
});

test("chat passes session MCP tools on first and resumed turns and includes selected quote", async () => {
  const { calls, turn, narrativeId, session } = setup();
  const first = await turn({ anchor: `${narrativeId}#c1`, text: "Why?", quote: "selected words", lines: { start: 2, end: 4, path: "dom/A.cpp", side: "new" }, llm: SONNET });
  assert.ok(calls[0].prompt.prompt.includes("selected words"));
  assert.ok(calls[0].prompt.prompt.includes("lines 2–4 of dom/A.cpp, new side"));
  const expectedServers = { spatial: { command: "node", args: ["server.ts", "--session", session.id] } };
  assert.deepEqual(calls[0].prompt.mcpServers, expectedServers);
  await turn({ threadId: first.threadId, text: "Again", llm: SONNET });
  assert.deepEqual(calls[1].prompt.mcpServers, calls[0].prompt.mcpServers);
});

test("same selection resumes the provider session with only the new text", async () => {
  const { calls, turn, narrativeId } = setup();
  const { threadId } = await turn({ anchor: `${narrativeId}#c1`, text: "Q1", llm: SONNET });
  await turn({ threadId, text: "Q2", llm: SONNET });
  assert.equal(calls[1].prompt.resumeProviderSession, "claude-session-1");
  assert.equal(calls[1].prompt.prompt, "Q2");
});

test("changed selection starts fresh and replays the transcript", async () => {
  const { calls, turn, narrativeId } = setup();
  const { threadId } = await turn({ anchor: `${narrativeId}#c1`, text: "Q1", llm: SONNET });
  await turn({ threadId, text: "Q2", llm: LUNA });
  const p = calls[1].prompt;
  assert.equal(p.resumeProviderSession, undefined);
  assert.deepEqual(calls[1].selection, LUNA);
  for (const s of ["Adds mFlag.", "Q1", "answer 1", "Q2"]) assert.ok(p.prompt.includes(s), s);
});

test("hunk anchor injects that hunk and its covering change", async () => {
  const { calls, turn, diffId } = setup();
  await turn({ anchor: `${diffId}#f0h1`, text: "What is this?", llm: SONNET });
  const p = calls[0].prompt.prompt;
  assert.ok(p.includes("other();"));
  assert.ok(p.includes("Other"));
  assert.ok(!p.includes("mFlag = true;"));
});

test("input validation", async () => {
  const { turn, narrativeId } = setup();
  await assert.rejects(turn({ text: "x", llm: SONNET }), /exactly one of threadId or anchor/);
  await assert.rejects(turn({ threadId: "t", anchor: `${narrativeId}#c1`, text: "x", llm: SONNET }), /exactly one of threadId or anchor/);
  await assert.rejects(turn({ anchor: `${narrativeId}#c9`, text: "x", llm: SONNET }), /Unknown ref: .*#c9/);
  await assert.rejects(turn({ anchor: `${narrativeId}#c1`, text: "  ", llm: SONNET }), /empty/);
});

test("LLM failure keeps the user message and adds no assistant message", async () => {
  const { store, session, turn, narrativeId } = setup({ failWith: "claude: No conversation found with session ID x" });
  await assert.rejects(turn({ anchor: `${narrativeId}#c1`, text: "Q", llm: SONNET }), /No conversation found/);
  const thread = store.listArtifacts(session.id, "ChatThread")[0];
  assert.deepEqual(messages(store, session.id, thread.id).map((m) => m.role), ["user"]);
});

test("cancel keeps the user message", async () => {
  const { store, rt, session, narrativeId } = setup({ hang: true });
  const { taskId, done } = rt.start(session.id, "chatTurn", { anchor: `${narrativeId}#c1`, text: "Q", llm: SONNET });
  await new Promise((r) => setTimeout(r, 20));
  rt.cancel(taskId);
  await assert.rejects(done, (e: unknown) => e instanceof TaskCancelledError);
  const thread = store.listArtifacts(session.id, "ChatThread")[0];
  assert.deepEqual(messages(store, session.id, thread.id).map((m) => m.role), ["user"]);
});

test("linkedTo returns matching source artifacts oldest first", async () => {
  const { store, rt, session } = setup();
  const put = (type: string) => store.putArtifact({ sessionId: session.id, type, status: "verified", data: {}, provenance: { taskId: "test" } });
  const first = put("ChatMessage");
  const second = put("ChatMessage");
  const other = put("ChatThread");
  store.putLink({ sessionId: session.id, from: first.id, to: "X", kind: "reply" });
  store.putLink({ sessionId: session.id, from: other.id, to: "X", kind: "about" });
  store.putLink({ sessionId: session.id, from: second.id, to: "X", kind: "reply" });
  const probe = defineTask<{ to: string }, string[]>({
    kind: "linkedToProbe",
    async run(ctx, { to }) { return ctx.artifacts.linkedTo(to, "reply").map((a) => a.id); },
  });
  // The runtime's task registry is fixed at construction, so probe the existing context contract
  // through a temporary runtime configured with the same store and capabilities.
  const probeRuntime = new Runtime({
    store, tasks: [probe], llm: rt.llm,
    git: () => ({}) as GitCapability,
    webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability,
  });
  assert.deepEqual(await probeRuntime.run(session.id, "linkedToProbe", { to: "X" }), [first.id, second.id]);
});
