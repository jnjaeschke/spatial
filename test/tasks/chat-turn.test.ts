import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { defineTask, Runtime, TaskCancelledError, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { LlmPrompt, LlmService } from "../../src/runtime/llm/types.ts";
import type { ChatMessageData, ChatThreadData, DiffData, LlmSelection, PatchNarrativeData } from "../../src/shared/types.ts";
import { chatTurn } from "../../src/tasks/chat-turn/task.ts";
import { renderRef, sessionView } from "../../src/runtime/render-ref.ts";

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

function setup(opts: { failWith?: string; hang?: boolean; replies?: ({ answer: string; questions?: string[]; revisions?: { message: string | null; quote: string; correction: string }[] } | undefined)[] } = {}) {
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
      const json = opts.replies ? opts.replies[n - 1] : { answer: `answer ${n}`, questions: [], revisions: [] };
      if (json) for (const revision of json.revisions ?? []) if (revision.message === "$USER") revision.message = store.listArtifacts(session.id, "ChatMessage").find((a) => (a.data as ChatMessageData).role === "user")!.id;
      return Promise.resolve({ text: json?.answer ?? `answer ${n}`, json, providerSessionId: `${selection!.backend}-session-${n}`, selection: selection! });
    },
    async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
  };
  const rt = new Runtime({
    store, tasks: [chatTurn], llm, git: () => ({}) as GitCapability,
    webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability,
    sessionMcp: (sessionId) => ({ spatial: { type: "stdio", command: "node", args: ["server.ts", "--session", sessionId] } }),
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

test("chat passes the reply schema on new and resumed turns and stores structured answer fields", async () => {
  const { store, calls, turn, narrativeId } = setup({ replies: [
    { answer: "The answer", questions: ["Need a choice?"], revisions: [] },
    { answer: "Second", questions: [], revisions: [] },
  ] });
  const first = await turn({ anchor: `${narrativeId}#c1`, text: "Why?", llm: SONNET });
  await turn({ threadId: first.threadId, text: "Again", llm: SONNET });
  assert.ok(calls[0].prompt.schema);
  assert.deepEqual(calls[0].prompt.schema, calls[1].prompt.schema);
  const assistant = store.getArtifact<ChatMessageData>(first.messageId).data;
  assert.equal(assistant.text, "The answer");
  assert.deepEqual(assistant.questions, ["Need a choice?"]);
});

test("chat applies exact matched revisions and links them to target and reply", async () => {
  const { store, turn, narrativeId, session } = setup({ replies: [
    { answer: "Original statement is incorrect.", revisions: [], questions: [] },
    { answer: "Corrected.", questions: [], revisions: [{ message: null, quote: "Original   statement", correction: "New statement" }] },
  ] });
  const first = await turn({ anchor: `${narrativeId}#c1`, text: "Why?", llm: SONNET });
  const second = await turn({ threadId: first.threadId, text: "Fix it", llm: SONNET });
  const revisions = store.listArtifacts(session.id, "Revision");
  assert.equal(revisions.length, 1);
  assert.deepEqual(revisions[0].data, { quote: "Original statement", correction: "New statement" });
  assert.ok(store.listLinks(session.id).some((l) => l.from === revisions[0].id && l.to === first.messageId && l.kind === "revises"));
  assert.ok(store.listLinks(session.id).some((l) => l.from === revisions[0].id && l.to === second.messageId && l.kind === "derivedFrom"));
  assert.equal(renderRef(sessionView(store, session.id), first.messageId), renderRef(sessionView(store, session.id), first.threadId));
  assert.match(renderRef(sessionView(store, session.id), first.threadId), /~~Original statement~~.*corrected: New statement/s);
  assert.ok(store.search(session.id, "statement").some((hit) => hit.ref === first.messageId));
});

test("a fresh prompt replays earlier answers with their revisions", async () => {
  const { calls, turn, narrativeId } = setup({ replies: [
    { answer: "Original statement is incorrect.", questions: [], revisions: [] },
    { answer: "Corrected.", questions: [], revisions: [{ message: null, quote: "Original statement", correction: "New statement" }] },
    { answer: "Third", questions: [], revisions: [] },
  ] });
  const first = await turn({ anchor: `${narrativeId}#c1`, text: "Why?", llm: SONNET });
  await turn({ threadId: first.threadId, text: "Fix it", llm: SONNET });
  await turn({ threadId: first.threadId, text: "Other model", llm: LUNA });
  assert.ok(calls[2].prompt.prompt.includes("~~Original statement~~ *(corrected: New statement)*"));
});

test("message null chooses the newest matching assistant message", async () => {
  const { store, turn, narrativeId, session } = setup({ replies: [
    { answer: "Earlier claim.", questions: [], revisions: [] },
    { answer: "Newest claim.", questions: [], revisions: [] },
    { answer: "Fixed.", questions: [], revisions: [{ message: null, quote: "claim", correction: "fixed claim" }] },
  ] });
  const first = await turn({ anchor: `${narrativeId}#c1`, text: "First", llm: SONNET });
  const second = await turn({ threadId: first.threadId, text: "Second", llm: SONNET });
  await turn({ threadId: first.threadId, text: "Fix", llm: SONNET });
  const revision = store.listArtifacts(session.id, "Revision")[0];
  assert.ok(store.listLinks(session.id).some((link) => link.from === revision.id && link.to === second.messageId && link.kind === "revises"));
});

test("overlapping revisions and revisions of user messages are rejected", async () => {
  const { store, turn, narrativeId, session } = setup({ replies: [
    { answer: "Two wrong claims.", questions: [], revisions: [] },
    { answer: "Attempted corrections.", questions: [], revisions: [
      { message: null, quote: "Two wrong", correction: "First" },
      { message: null, quote: "wrong claims", correction: "Second" },
      { message: "$USER", quote: "Two", correction: "Third" },
    ] },
  ] });
  const first = await turn({ anchor: `${narrativeId}#c1`, text: "User's message", llm: SONNET });
  const userMessage = store.listArtifacts(session.id, "ChatMessage").find((a) => (a.data as ChatMessageData).role === "user")!;
  await turn({ threadId: first.threadId, text: "Fix both", llm: SONNET });
  assert.equal(store.listArtifacts(session.id, "Revision").length, 1);
  const assistant = store.listArtifacts(session.id, "ChatMessage").find((a) => (a.data as ChatMessageData).role === "assistant" && (a.data as ChatMessageData).revisionErrors);
  assert.deepEqual((assistant?.data as ChatMessageData).revisionErrors, ["wrong claims: overlaps an earlier revision", `${userMessage.id}: not an assistant message`]);
});

test("invalid revisions are reported while the chat turn succeeds", async () => {
  const { store, turn, narrativeId } = setup({ replies: [
    { answer: "A strong claim here.", questions: [], revisions: [] },
    { answer: "I could not apply that.", questions: [], revisions: [
      { message: null, quote: "A powerful claim here.", correction: "Changed" },
      { message: null, quote: "A strong\nclaim", correction: "Changed" },
    ] },
  ] });
  const first = await turn({ anchor: `${narrativeId}#c1`, text: "Q", llm: SONNET });
  const second = await turn({ threadId: first.threadId, text: "Actually", llm: SONNET });
  assert.equal(store.listArtifacts(store.getArtifact(second.messageId).sessionId, "Revision").length, 0);
  assert.deepEqual(store.getArtifact<ChatMessageData>(second.messageId).data.revisionErrors, [
    "A powerful claim here.: quote not found in this chat",
    "A strong\nclaim: quote spans lines",
  ]);
});

test("missing structured JSON fails after keeping the user message", async () => {
  const { store, session, turn, narrativeId } = setup({ replies: [undefined] });
  await assert.rejects(turn({ anchor: `${narrativeId}#c1`, text: "Q", llm: SONNET }), /not valid JSON/);
  const thread = store.listArtifacts(session.id, "ChatThread")[0];
  assert.deepEqual(messages(store, session.id, thread.id).map((m) => m.role), ["user"]);
});

test("chat passes session MCP tools on first and resumed turns and includes selected quote", async () => {
  const { calls, turn, narrativeId, session } = setup();
  const first = await turn({ anchor: `${narrativeId}#c1`, text: "Why?", quote: "selected words", lines: { start: 2, end: 4, path: "dom/A.cpp", side: "new" }, llm: SONNET });
  assert.ok(calls[0].prompt.prompt.includes("selected words"));
  assert.ok(calls[0].prompt.prompt.includes("lines 2–4 of dom/A.cpp, new side"));
  const expectedServers = { spatial: { type: "stdio", command: "node", args: ["server.ts", "--session", session.id] } };
  assert.deepEqual(calls[0].prompt.mcpServers, expectedServers);
  await turn({ threadId: first.threadId, text: "Again", llm: SONNET });
  assert.deepEqual(calls[1].prompt.mcpServers, calls[0].prompt.mcpServers);
});

test("selection is stored on the thread and reused for fresh prompts", async () => {
  const { store, calls, turn, narrativeId } = setup();
  const first = await turn({ anchor: `${narrativeId}#c1`, text: "Why?", quote: "original selection", lines: { start: 2, end: 4, path: "dom/A.cpp", side: "new" }, llm: SONNET });
  const thread = store.getArtifact<ChatThreadData>(first.threadId);
  assert.equal(thread.data.quote, "original selection");
  assert.deepEqual(thread.data.lines, { start: 2, end: 4, path: "dom/A.cpp", side: "new" });
  await turn({ threadId: first.threadId, text: "Again", quote: "different selection", llm: LUNA });
  assert.ok(calls[1].prompt.prompt.includes("original selection"));
  assert.ok(!calls[1].prompt.prompt.includes("different selection"));
  await turn({ threadId: first.threadId, text: "Third", quote: "ignored", llm: SONNET });
  assert.equal(store.getArtifact<ChatThreadData>(first.threadId).data.quote, "original selection");
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
