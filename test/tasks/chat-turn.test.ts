import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { defineTask, Runtime, TaskCancelledError, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { LlmPrompt, LlmService, McpServerSpec } from "../../src/runtime/llm/types.ts";
import type { ChatMessageData, ChatThreadData, DiagramData, DiffData, LlmSelection, McpServerData, PatchNarrativeData } from "../../src/shared/types.ts";
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

function setup(opts: { failWith?: string; hang?: boolean; repoMcp?: boolean; repoRequestable?: string[]; repo?: string; git?: GitCapability; replies?: ({ answer: string; questions?: string[]; revisions?: { message: string | null; quote: string; correction: string }[]; requestMcpServers?: string[]; diagram?: unknown } | undefined)[] } = {}) {
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
      const reply = opts.replies ? opts.replies[n - 1] : { answer: `answer ${n}`, questions: [], revisions: [], diagram: null };
      const json = reply && { requestMcpServers: [], diagram: null, ...reply };
      if (json) for (const revision of json.revisions ?? []) if (revision.message === "$USER") revision.message = store.listArtifacts(session.id, "ChatMessage").find((a) => (a.data as ChatMessageData).role === "user")!.id;
      return Promise.resolve({ text: json?.answer ?? `answer ${n}`, json, providerSessionId: `${selection!.backend}-session-${n}`, selection: selection! });
    },
    async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
  };
  const rt = new Runtime({
    store, tasks: [chatTurn], llm, git: () => opts.git ?? ({} as GitCapability),
    webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability,
    sessionMcp: (sessionId) => ({ spatial: { type: "stdio", command: "node", args: ["server.ts", "--session", sessionId] } }),
    ...(opts.repoMcp || opts.repoRequestable ? { repoContext: () => ({ mcpServers: (opts.repoMcp ? { moz: { type: "http", url: "https://example.com/mcp" } } : {}) as Record<string, McpServerSpec>, requestableMcpServers: Object.fromEntries((opts.repoRequestable ?? []).map((name) => [name, { type: "stdio", command: "node", args: [`${name}.js`] }])), skills: [], instructions: null }) } : {}),
  });
  const session = store.createSession({ worktree: opts.repo ?? "/repo", repoDir: `${opts.repo ?? "/repo"}/.git`, title: "t" });
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
  assert.ok(p.prompt.includes("# Commits in the reviewed range\n1. 1 Bug 1 - Add flag"));
  assert.ok(!p.prompt.includes("other();"));
});

test("aside first turn records an aside thread without changing its anchor", async () => {
  const { store, session, narrativeId, turn } = setup();
  const { threadId } = await turn({ anchor: `${narrativeId}#c1`, aside: true, text: "Side question", llm: SONNET });
  assert.deepEqual(store.getArtifact<ChatThreadData>(threadId).data, { anchor: `${narrativeId}#c1`, aside: true });
  assert.ok(store.listLinks(session.id).some((link) => link.from === threadId && link.to === `${narrativeId}#c1` && link.kind === "about"));
});

test("chat system prompt includes repo instructions and skill index on every turn", async () => {
  const store = new Store(":memory:");
  const calls: LlmPrompt[] = [];
  const llm: LlmService = {
    defaultSelection: SONNET,
    async run(selection, prompt) {
      calls.push(prompt);
      return { text: "ok", json: { answer: "ok", questions: [], revisions: [], requestMcpServers: [], diagram: null }, providerSessionId: `p${calls.length}`, selection: selection! };
    },
    async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
  };
  const rt = new Runtime({ store, tasks: [chatTurn], llm, git: () => ({}) as GitCapability,
    webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability,
    repoContext: () => ({ mcpServers: {}, requestableMcpServers: {}, instructions: "Follow repo rules.", skills: [{ name: "review-skill", description: "Review changes." }] }),
  });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const diffId = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: DIFF, provenance: { taskId: "x" } }).id;
  const narrativeId = store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "verified", data: {
    diffId, summary: "s", changes: [{ id: "c1", title: "Add flag", explanation: "e", rationale: "r", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] }],
  }, provenance: { taskId: "x" } }).id;
  const first = await rt.run<{ threadId: string }>(session.id, "chatTurn", { anchor: `${narrativeId}#c1`, text: "Why?", llm: SONNET });
  await rt.run(session.id, "chatTurn", { threadId: first.threadId, text: "Again", llm: SONNET });
  for (const call of calls) {
    assert.ok(call.system?.startsWith("Follow repo rules."));
    assert.match(call.system!, /- review-skill: Review changes\./);
    assert.match(call.system!, /read_skill\(name\)/);
  }
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

test("chat verifies a proposed diagram and links it to the assistant reply", async () => {
  const git: GitCapability = { effect: "read-only", isDirty: async () => false, resolve: async () => "", isAncestor: async () => true, mergeBase: async () => null, blame: async () => [], log: async () => [], diff: async () => "", replay: async () => ({ tree: "", conflicts: [] }), async show() { return "call target()"; } };
  const diagram = { commit: 1, mode: "flow", title: "Calls", nodes: [
    { id: "a", label: "caller", identifier: "call", kind: "function", status: "modified", cite: { path: "dom/A.cpp", line: 1 } },
    { id: "b", label: "target", identifier: "target", kind: "function", status: "context", cite: { path: "dom/A.cpp", line: 1 } },
  ], edges: [{ from: "a", to: "b", kind: "calls", step: 1, cite: { path: "dom/A.cpp", line: 1 } }] };
  const { store, turn, narrativeId, session } = setup({ git, replies: [{ answer: "Flow", revisions: [], questions: [], diagram }] });
  const { messageId } = await turn({ anchor: `${narrativeId}#c1`, text: "Show the flow", llm: SONNET });
  const artifacts = store.listArtifacts(session.id, "Diagram");
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0]!.status, "proposed");
  assert.deepEqual((artifacts[0]!.data as DiagramData).nodes.map((node) => node.verified), [true, true]);
  assert.deepEqual((artifacts[0]!.data as DiagramData).edges.map((edge) => edge.verified), [true]);
  assert.ok(store.listLinks(session.id).some((link) => link.from === artifacts[0]!.id && link.to === messageId && link.kind === "derivedFrom"));
});

test("invalid diagrams are dropped with an error on the assistant message", async () => {
  for (const diagram of [
    "not a diagram",
    { commit: 2, mode: "map", title: "Bad commit", nodes: [], edges: [] },
    { commit: 1, mode: "map", title: "Bad edge", nodes: [], edges: [{ from: "missing", to: "also-missing", kind: "uses", step: null, cite: { path: "x", line: 1 } }] },
  ]) {
    const { store, turn, narrativeId, session } = setup({ replies: [{ answer: "Kept", revisions: [], questions: [], diagram }] });
    const { messageId } = await turn({ anchor: `${narrativeId}#c1`, text: "Draw", llm: SONNET });
    assert.equal(store.getArtifact<ChatMessageData>(messageId).data.diagramError !== undefined, true);
    assert.equal(store.listArtifacts(session.id, "Diagram").length, 0);
  }
});

test("a null diagram stores no Diagram artifact", async () => {
  const { store, turn, narrativeId, session } = setup({ replies: [{ answer: "Plain", revisions: [], questions: [], diagram: null }] });
  await turn({ anchor: `${narrativeId}#c1`, text: "Explain", llm: SONNET });
  assert.equal(store.listArtifacts(session.id, "Diagram").length, 0);
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

test("chat merges repo MCP servers with session MCP servers on first and resumed turns", async () => {
  const { calls, turn, narrativeId, session } = setup({ repoMcp: true });
  const first = await turn({ anchor: `${narrativeId}#c1`, text: "Why?", llm: SONNET });
  const expected = {
    spatial: { type: "stdio", command: "node", args: ["server.ts", "--session", session.id] },
    moz: { type: "http", url: "https://example.com/mcp" },
  };
  assert.deepEqual(calls[0].prompt.mcpServers, expected);
  await turn({ threadId: first.threadId, text: "Again", llm: SONNET });
  assert.deepEqual(calls[1].prompt.mcpServers, expected);
});

test("chat stores requests only for on-request repo MCP servers and lists them in the system prompt", async () => {
  const { store, turn, narrativeId, calls, session } = setup({
    repoMcp: true,
    repoRequestable: ["firefox-devtools"],
    replies: [
      { answer: "Need access", questions: [], revisions: [], requestMcpServers: ["firefox-devtools", "moz", "unknown"] },
    ],
  });
  const { threadId } = await turn({ anchor: `${narrativeId}#c1`, text: "Inspect", llm: SONNET });
  const requests = store.listArtifacts(session.id, "McpServerRequest");
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0]!.data, { server: "firefox-devtools" });
  assert.ok(store.listLinks(session.id).some((link) => link.from === requests[0]!.id && link.to === threadId && link.kind === "about"));
  assert.match(calls[0]!.prompt.system!, /Repo MCP servers available on request/);
  assert.match(calls[0]!.prompt.system!, /firefox-devtools/);
});

test("non-requestable MCP names in a reply create no request", async () => {
  const { store, turn, narrativeId, session } = setup({
    repoMcp: true,
    replies: [{ answer: "No request", questions: [], revisions: [], requestMcpServers: ["moz"] }],
  });
  await turn({ anchor: `${narrativeId}#c1`, text: "Inspect", llm: SONNET });
  assert.equal(store.listArtifacts(session.id, "McpServerRequest").length, 0);
});

test("enabled on-request MCP server is merged on the next turn of that thread", async () => {
  const { store, turn, narrativeId, calls, session } = setup({ repoRequestable: ["firefox-devtools"] });
  const { threadId } = await turn({ anchor: `${narrativeId}#c1`, text: "First", llm: SONNET });
  const enabled = store.putArtifact({ sessionId: session.id, type: "McpServerEnabled", status: "verified", data: { server: "firefox-devtools" } satisfies McpServerData, provenance: { taskId: "user" } });
  store.putLink({ sessionId: session.id, from: enabled.id, to: threadId, kind: "about" });
  await turn({ threadId, text: "Second", llm: SONNET });
  assert.deepEqual(calls[1]!.prompt.mcpServers?.["firefox-devtools"], { type: "stdio", command: "node", args: ["firefox-devtools.js"] });
  assert.equal(calls[0]!.prompt.mcpServers?.["firefox-devtools"], undefined);
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
