// REQUIRES_REAL_GIT
// REQUIRES_REAL_NET
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer as createNetServer } from "node:http";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type WebspecCapability, type SearchfoxCapability } from "../../src/runtime/tasks.ts";
import { makeGit } from "../../src/runtime/git.ts";
import { tasks } from "../../src/tasks/index.ts";
import { createHttpServer } from "../../src/server/http.ts";
import type { RevisionWatcher } from "../../src/runtime/revision-watcher.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { DiffData, Session, SessionState } from "../../src/shared/types.ts";
import { commitRevision } from "../../src/shared/phabricator.ts";
import { makeRepo } from "../helpers/git-fixture.ts";

const NARRATIVE = { summary: "S", changes: [{ id: "c1", title: "t", explanation: "e", rationale: "r", hunkIds: ["f0h0", "f1h0"], dependsOn: [], specUrls: [] }] };
const CHAT_REPLY = { answer: "hi", questions: [], revisions: [], requestMcpServers: [] };
const replyFor = (prompt: { schema?: object }) => prompt.schema && "properties" in prompt.schema && "answer" in (prompt.schema as { properties: object }).properties;
const selectorFor = (prompt: { schema?: object }) => prompt.schema && "properties" in prompt.schema && "workflow" in (prompt.schema as { properties: object }).properties;
const reviewFor = (prompt: { schema?: object; system?: string }) => prompt.system?.includes("You review a code patch") || !!prompt.schema && "properties" in prompt.schema && "findings" in (prompt.schema as { properties: object }).properties;
const commentFor = (prompt: { schema?: object }) => !!prompt.schema && "properties" in prompt.schema && "body" in (prompt.schema as { properties: object }).properties;
const llm: LlmService = {
  defaultSelection: { backend: "claude", model: "sonnet", effort: "medium" },
  async run(selection, prompt) { const selector = selectorFor(prompt); const chat = replyFor(prompt); const review = reviewFor(prompt); const comment = commentFor(prompt); return { text: "hi", json: prompt.schema ? selector ? { workflow: "chat", params: {}, title: "Picked" } : chat ? CHAT_REPLY : review ? { findings: [], verdicts: [] } : comment ? { body: "Generated review comment." } : NARRATIVE : undefined, providerSessionId: "p", selection: selection ?? this.defaultSelection }; },
  async listModels() { return { claude: { models: [{ id: "sonnet", efforts: ["low"] }] }, codex: { error: "no cache" } }; },
};
const repo = makeRepo();
repo.commit({ "a.txt": "1\n2\n" }, "base");
repo.commit({ "a.txt": "1\nTWO\n", "c.txt": "c\n" }, "change");
const staticDir = mkdtempSync(join(tmpdir(), "static-"));
writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>app</title>");
const rt = new Runtime({ store: new Store(":memory:"), tasks, llm, git: makeGit, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
const server = createHttpServer(rt, { staticDir });
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => server.close());

const post = (path: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
const put = (path: string, body: unknown) => fetch(base + path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function newSession(): Promise<Session> {
  const res = await post("/api/sessions", { repo: repo.dir, title: "t" });
  assert.equal(res.status, 201);
  return res.json();
}

async function waitFor<T>(fn: () => Promise<T | undefined>, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await fn();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("timeout");
}

test("sessions: create, list, validation", async () => {
  const session = await newSession();
  const list: Session[] = await (await fetch(`${base}/api/sessions`)).json();
  assert.ok(list.some((item) => item.id === session.id));
  const bad = await post("/api/sessions", { repo: tmpdir(), title: "t" });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /Not a git repository/);
  assert.equal((await post("/api/sessions", { title: "t" })).status, 400);
});

test("workflow start routes support slash commands, selection, and validation", async () => {
  const infos = await (await fetch(`${base}/api/workflows`)).json();
  assert.deepEqual(infos.map((info: { id: string }) => info.id), ["review", "chat"]);
  assert.ok(infos.every((info: { argHint?: string }) => info.argHint));

  const commandResponse = await post("/api/start", { path: repo.dir, text: "/chat hi there" });
  assert.equal(commandResponse.status, 201);
  const commandSession: Session = await commandResponse.json();
  assert.equal(commandSession.workflow, "chat");
  assert.equal(commandSession.title, "/chat hi there");
  const commandState = await waitFor(async () => {
    const state: SessionState = await (await fetch(`${base}/api/sessions/${commandSession.id}/state`)).json();
    const thread = state.artifacts.find((item) => item.type === "ChatThread");
    const messages = state.artifacts.filter((item) => item.type === "ChatMessage").map((item) => item.data as { role: string; text: string });
    return thread && messages.some((message) => message.role === "assistant") ? { state, thread, messages } : undefined;
  });
  const commandStart = commandState.state.artifacts.find((item) => item.type === "WorkflowStart")!;
  assert.equal((commandState.thread!.data as { anchor: string }).anchor, commandStart.id);
  assert.deepEqual(commandStart.data, { via: "command", workflow: "chat", params: {}, title: "/chat hi there", prompt: "hi there" });
  assert.ok(commandStart.provenance.taskId === "user");
  assert.ok(commandState.messages.some((message) => message.role === "user" && message.text === "hi there"));

  const reviewResponse = await post("/api/start", { path: repo.dir, text: "/review HEAD~1..HEAD" });
  assert.equal(reviewResponse.status, 201);
  const reviewSession: Session = await reviewResponse.json();
  assert.equal(reviewSession.workflow, "review");
  await waitFor(async () => (await (await fetch(`${base}/api/sessions/${reviewSession.id}/state`)).json() as SessionState).artifacts.find((item) => item.type === "PatchNarrative"));

  const before = rt.store.listSessions().length;
  for (const [text, error] of [["/nope x", /Unknown command \/nope/], ["/review D5x", /Usage: \/review/], ["  ", /Request is empty/]] as const) {
    const response = await post("/api/start", { path: repo.dir, text });
    assert.equal(response.status, 400);
    assert.match((await response.json() as { error: string }).error, error);
  }
  const relative = await post("/api/start", { path: ".", text: "hi" });
  assert.equal(relative.status, 400);
  assert.match((await relative.json() as { error: string }).error, /absolute/);
  const outside = await post("/api/start", { path: tmpdir(), text: "hi" });
  assert.equal(outside.status, 400);
  assert.match((await outside.json() as { error: string }).error, /Not a git repository/);
  assert.equal(rt.store.listSessions().length, before);

  const selectorResponse = await post("/api/start", { path: repo.dir, text: "what is this repo about?" });
  assert.equal(selectorResponse.status, 201);
  const pending: Session = await selectorResponse.json();
  assert.equal(pending.workflow, null);
  assert.equal(pending.title, "what is this repo about?");
  const selected = await waitFor(async () => {
    const state: SessionState = await (await fetch(`${base}/api/sessions/${pending.id}/state`)).json();
    const session = rt.store.getSession(pending.id);
    const start = state.artifacts.find((item) => item.type === "WorkflowStart");
    const thread = state.artifacts.find((item) => item.type === "ChatThread");
    return session.workflow === "chat" && start && thread ? { state, session, start, thread } : undefined;
  });
  assert.equal(selected.session.title, "Picked");
  assert.equal((selected.start!.data as { via: string }).via, "selector");
  assert.equal((selected.thread!.data as { anchor: string }).anchor, selected.start!.id);
  assert.ok(selected.state.tasks.some((task) => task.kind === "selectWorkflow" && task.status === "succeeded"));
  assert.ok(selected.state.artifacts.some((item) => item.type === "ChatMessage" && (item.data as { role: string; text: string }).role === "user" && (item.data as { text: string }).text === "what is this repo about?"));
  assert.ok(rt.store.listEvents(pending.id).some((event) => event.type === "session.updated"));
});

test("health reports whether the server serves the built UI", async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { app: "spatial-ide", ui: true });
});

test("repo route resolves paths and lists sessions across worktrees", async () => {
  const sub = join(repo.dir, "sub-dir-that-exists");
  mkdirSync(sub);
  const first = await newSession();
  await new Promise((resolve) => setTimeout(resolve, 2));
  const second = await newSession();
  const elsewhere = rt.store.createSession({ worktree: "/elsewhere", repoDir: "/elsewhere/.git", title: "x" });

  const response = await fetch(`${base}/api/repo?path=${encodeURIComponent(sub)}`);
  assert.equal(response.status, 200);
  const info = await response.json();
  assert.equal(info.worktree, realpathSync(repo.dir));
  assert.equal(info.name, basename(realpathSync(repo.dir)));
  const listedIds = info.sessions.map((s: Session) => s.id);
  assert.ok(listedIds.indexOf(second.id) < listedIds.indexOf(first.id));
  assert.ok(!listedIds.includes(elsewhere.id));

  const wt = mkdtempSync(join(tmpdir(), "repo-worktree-"));
  repo.git("worktree", "add", "-q", wt, "-b", "wt-route");
  const created = await post("/api/sessions", { repo: wt, title: "worktree session" });
  assert.equal(created.status, 201);
  const grouped = await (await fetch(`${base}/api/repo?path=${encodeURIComponent(repo.dir)}`)).json();
  const session = grouped.sessions.find((s: Session) => s.title === "worktree session");
  assert.equal(session.worktree, realpathSync(wt));
});

test("repo route requires an absolute path inside a worktree", async () => {
  const missing = await fetch(`${base}/api/repo`);
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /absolute/);
  const relative = await fetch(`${base}/api/repo?path=relative`);
  assert.equal(relative.status, 400);
  assert.match((await relative.json()).error, /absolute/);
  const outside = await fetch(`${base}/api/repo?path=${encodeURIComponent(mkdtempSync(join(tmpdir(), "not-repo-")))}`);
  assert.equal(outside.status, 400);
  assert.match((await outside.json()).error, /Not a git repository/);
});

test("POST requires JSON content type; foreign Host is rejected", async () => {
  assert.equal((await post("/api/sessions", { repo: repo.dir, title: "t" }, { "content-type": "text/plain" })).status, 415);
  const { request } = await import("node:http");
  const status = await new Promise<number>((resolve) => request(`${base}/api/sessions`, { headers: { host: "evil.example:80" } }, (res) => resolve(res.statusCode!)).end());
  assert.equal(status, 403);
});

test("narrate runs in background and state reflects the result", async () => {
  const session = await newSession();
  assert.equal((await post(`/api/sessions/${session.id}/narrate`, { base: "HEAD~1", head: "HEAD" })).status, 202);
  const state = await waitFor(async () => {
    const snapshot: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return snapshot.tasks.some((task) => task.kind === "review" && task.status !== "running" && task.status !== "pending") ? snapshot : undefined;
  });
  assert.ok(state.artifacts.some((artifact) => artifact.type === "PatchNarrative"));
  assert.deepEqual(state.tasks.map((task) => [task.kind, task.status]), [["importDiff", "succeeded"], ["narrate", "succeeded"], ["resolveSpecRefs", "succeeded"], ["review", "succeeded"]]);
  assert.ok(state.lastEventId > 0);
  assert.equal(state.searchfox, null);
  const repeated = await post(`/api/sessions/${session.id}/narrate`, { base: "HEAD~1", head: "HEAD" });
  assert.equal(repeated.status, 409);
  assert.deepEqual(await repeated.json(), { error: "Session already has a narrative" });
});

test("narrate reuses the latest Diff and rejects narrating it twice", async () => {
  const session = await newSession();
  await post(`/api/sessions/${session.id}/narrate`, { base: "HEAD~1", head: "HEAD" });
  const first = await waitFor(async () => {
    const snapshot: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return snapshot.tasks.some((task) => task.kind === "review" && task.status === "succeeded") ? snapshot : undefined;
  });
  const original = first.artifacts.find((item) => item.type === "Diff")!;
  const second = rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: { ...(original.data as DiffData), headSha: "new-head" }, provenance: { taskId: "test" } });
  assert.equal((await post(`/api/sessions/${session.id}/narrate`, {})).status, 202);
  const updated = await waitFor(async () => {
    const snapshot: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return snapshot.artifacts.some((item) => item.type === "PatchNarrative" && (item.data as { diffId: string }).diffId === second.id) ? snapshot : undefined;
  });
  assert.equal(updated.artifacts.filter((item) => item.type === "Diff").length, 2);
  const repeated = await post(`/api/sessions/${session.id}/narrate`, {});
  assert.equal(repeated.status, 409);
  assert.deepEqual(await repeated.json(), { error: "Session already has a narrative" });
  const trailered: DiffData = { ...(original.data as DiffData), headSha: "third-head", commits: [{ sha: "third-head", subject: "change", body: "Differential Revision: https://phab.example.com/D1" }] };
  rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: trailered, provenance: { taskId: "test" } });
  const drafts = await post(`/api/sessions/${session.id}/post-drafts`, {});
  assert.equal(drafts.status, 409);
  assert.deepEqual(await drafts.json(), { error: "The latest revision has no narrative" });
});

// REQUIRES_REAL_GIT
test("update imports a moved feature ref as a new epoch and detects no-op updates", async () => {
  const testRepo = makeRepo();
  const originalBase = testRepo.commit({ "a.txt": "base\n", "b.txt": "base\n" }, "base");
  testRepo.git("checkout", "-q", "-b", "feature");
  testRepo.commit({ "a.txt": "first\n", "c.txt": "feature\n" }, "first revision");
  const session: Session = await (await post("/api/sessions", { repo: testRepo.dir, title: "update" })).json();
  assert.equal((await post(`/api/sessions/${session.id}/narrate`, { base: "main", head: "feature" })).status, 202);
  await waitFor(async () => {
    const state: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return state.tasks.some((task) => task.kind === "review" && task.status === "succeeded") ? state : undefined;
  });
  testRepo.commit({ "a.txt": "second\n", "b.txt": "base\n" }, "amended revision");
  assert.equal((await post(`/api/sessions/${session.id}/update`, {})).status, 202);
  const state = await waitFor(async () => {
    const current: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return current.artifacts.filter((artifact) => artifact.type === "Diff").length === 2
      && current.tasks.filter((task) => task.kind === "review" && task.status === "succeeded").length === 2
      ? current : undefined;
  });
  assert.equal(state.artifacts.filter((artifact) => artifact.type === "Diff").length, 2);
  const updatedDiff = state.artifacts.filter((artifact) => artifact.type === "Diff").at(-1)!;
  const interdiffArtifact = state.artifacts.find((artifact) => artifact.type === "Interdiff")!;
  assert.equal((interdiffArtifact.data as { toDiff: string }).toDiff, updatedDiff.id);
  assert.deepEqual(state.tasks.slice(-6).map((task) => [task.kind, task.status]), [
    ["importDiff", "succeeded"], ["interdiff", "succeeded"], ["narrate", "succeeded"],
    ["carryFindings", "succeeded"], ["resolveSpecRefs", "succeeded"], ["review", "succeeded"],
  ]);
  assert.equal((state.artifacts.find((artifact) => artifact.type === "PatchNarrative" && (artifact.data as { diffId: string }).diffId === updatedDiff.id)!.data as { previous?: string }).previous,
    state.artifacts.find((artifact) => artifact.type === "PatchNarrative" && (artifact.data as { diffId: string }).diffId !== updatedDiff.id)!.id);
  assert.ok(rt.store.listLinks(session.id).some((link) => link.from === interdiffArtifact.id && link.to === updatedDiff.id && link.kind === "about"));
  const again = await post(`/api/sessions/${session.id}/update`, {});
  assert.equal(again.status, 409);
  assert.deepEqual(await again.json(), { error: "No new revision" });

  testRepo.git("checkout", "-q", "main");
  const movedBase = testRepo.commit({ "a.txt": "base\n", "b.txt": "upstream\n" }, "upstream moved");
  testRepo.git("checkout", "-q", "feature");
  testRepo.commit({ "a.txt": "third\n", "b.txt": "base\n" }, "feature without rebase");
  assert.equal((await post(`/api/sessions/${session.id}/update`, {})).status, 202);
  const thirdState = await waitFor(async () => {
    const current: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return current.artifacts.filter((artifact) => artifact.type === "Diff").length === 3 && current.tasks.filter((task) => task.kind === "review" && task.status === "succeeded").length === 3 ? current : undefined;
  });
  const thirdDiff = thirdState.artifacts.filter((artifact) => artifact.type === "Diff").at(-1)!;
  assert.equal((thirdDiff.data as DiffData).baseSha, originalBase);
  assert.notEqual((thirdDiff.data as DiffData).baseSha, movedBase);

  testRepo.commit({ "a.txt": "fourth\n", "b.txt": "base\n" }, "feature while task pending");
  rt.store.createTask({ sessionId: session.id, kind: "carryFindings", input: {} });
  const busy = await post(`/api/sessions/${session.id}/update`, {});
  assert.equal(busy.status, 409);
  assert.deepEqual(await busy.json(), { error: "A task is already running" });
});

// REQUIRES_REAL_GIT
test("update requires an imported diff", async () => {
  const session = await newSession();
  const response = await post(`/api/sessions/${session.id}/update`, {});
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "Session has no imported diff" });
});

test("narrate rejects a second request while narration is running", async () => {
  let started!: () => void;
  let release!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const gatedLlm: LlmService = {
    ...llm,
    async run(selection, prompt) {
      if (prompt.schema) { started(); await gate; }
      const chat = replyFor(prompt);
      const review = reviewFor(prompt);
      return { text: "hi", json: prompt.schema ? chat ? CHAT_REPLY : review ? { findings: [], verdicts: [] } : NARRATIVE : undefined, providerSessionId: "p", selection: selection ?? this.defaultSelection };
    },
  };
  const gatedRt = new Runtime({ store: new Store(":memory:"), tasks, llm: gatedLlm, git: makeGit, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const gatedServer = createHttpServer(gatedRt, { staticDir });
  await new Promise<void>((resolve) => gatedServer.listen(0, "127.0.0.1", resolve));
  try {
    const gatedBase = `http://127.0.0.1:${(gatedServer.address() as AddressInfo).port}`;
    const create = (path: string, body: unknown) => fetch(gatedBase + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const session: Session = await (await create("/api/sessions", { repo: repo.dir, title: "gated narration" })).json();
    assert.equal((await create(`/api/sessions/${session.id}/narrate`, { base: "HEAD~1", head: "HEAD" })).status, 202);
    await startedPromise;
    const repeated = await create(`/api/sessions/${session.id}/narrate`, { base: "HEAD~1", head: "HEAD" });
    assert.equal(repeated.status, 409);
    assert.deepEqual(await repeated.json(), { error: "Narration already running" });
  } finally {
    release();
    await new Promise<void>((resolve) => gatedServer.close(() => resolve()));
  }
});

test("turns: first turn creates thread; busy thread is 409", async () => {
  const s = await newSession();
  await post(`/api/sessions/${s.id}/narrate`, { base: "HEAD~1", head: "HEAD" });
  const st = await waitFor(async () => {
    const x: SessionState = await (await fetch(`${base}/api/sessions/${s.id}/state`)).json();
    return x.artifacts.some((a) => a.type === "PatchNarrative") ? x : undefined;
  });
  const narrative = st.artifacts.find((a) => a.type === "PatchNarrative")!;
  const llmSel = { backend: "claude" as const, model: "sonnet", effort: "medium" };
  const r = await post(`/api/sessions/${s.id}/turns`, { anchor: `${narrative.id}#c1`, text: "why?", llm: llmSel });
  assert.equal(r.status, 202);
  assert.equal(typeof (await r.json()).taskId, "string");
  const thread = await waitFor(async () => {
    const x: SessionState = await (await fetch(`${base}/api/sessions/${s.id}/state`)).json();
    return x.artifacts.filter((a) => a.type === "ChatMessage").length === 2 ? x.artifacts.find((a) => a.type === "ChatThread") : undefined;
  });
  assert.ok(thread);
  assert.equal((await post(`/api/sessions/${s.id}/turns`, { anchor: `${narrative.id}#c1`, llm: llmSel })).status, 400);

  let block = false;
  let started!: () => void;
  let release!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  let gate = new Promise<void>((resolve) => { release = resolve; });
  const gatedLlm: LlmService = {
    ...llm,
    async run(selection, prompt) {
      if (block && replyFor(prompt)) { started(); await gate; }
      const chat = replyFor(prompt);
      return { text: "hi", json: prompt.schema ? chat ? CHAT_REPLY : NARRATIVE : undefined, providerSessionId: "p", selection: selection ?? this.defaultSelection };
    },
  };
  const gatedRt = new Runtime({ store: new Store(":memory:"), tasks, llm: gatedLlm, git: makeGit, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const gatedServer = createHttpServer(gatedRt, { staticDir });
  await new Promise<void>((resolve) => gatedServer.listen(0, "127.0.0.1", resolve));
  try {
    const gatedBase = `http://127.0.0.1:${(gatedServer.address() as AddressInfo).port}`;
    const create = (path: string, body: unknown) => fetch(gatedBase + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const gs: Session = await (await create("/api/sessions", { repo: repo.dir, title: "gated" })).json();
    await create(`/api/sessions/${gs.id}/narrate`, { base: "HEAD~1", head: "HEAD" });
    const ns = await waitFor(async () => {
      const x: SessionState = await (await fetch(`${gatedBase}/api/sessions/${gs.id}/state`)).json();
      return x.artifacts.find((a) => a.type === "PatchNarrative");
    });
    const anchor = `${ns.id}#c1`;
    const first = await create(`/api/sessions/${gs.id}/turns`, { anchor, text: "first", llm: llmSel });
    assert.equal(first.status, 202);
    const threadArtifact = await waitFor(async () => {
      const x: SessionState = await (await fetch(`${gatedBase}/api/sessions/${gs.id}/state`)).json();
      return x.artifacts.find((a) => a.type === "ChatThread");
    });
    await waitFor(async () => {
      const x: SessionState = await (await fetch(`${gatedBase}/api/sessions/${gs.id}/state`)).json();
      return x.tasks.some((t) => t.kind === "chatTurn" && t.status === "succeeded") ? true : undefined;
    });
    block = true;
    gate = new Promise<void>((resolve) => { release = resolve; });
    const pending = await create(`/api/sessions/${gs.id}/turns`, { threadId: threadArtifact.id, text: "second", llm: llmSel });
    assert.equal(pending.status, 202);
    await startedPromise;
    const busy = await create(`/api/sessions/${gs.id}/turns`, { threadId: threadArtifact.id, text: "third", llm: llmSel });
    assert.equal(busy.status, 409);
    assert.match((await busy.json()).error, /already running/);
    release();
    await waitFor(async () => {
      const x: SessionState = await (await fetch(`${gatedBase}/api/sessions/${gs.id}/state`)).json();
      return x.tasks.filter((t) => t.kind === "chatTurn").length === 2 && x.tasks.filter((t) => t.kind === "chatTurn").every((t) => t.status === "succeeded") ? true : undefined;
    });
  } finally {
    release();
    await new Promise<void>((resolve) => gatedServer.close(() => resolve()));
  }
});

test("turns reject selected quotes over 20000 characters", async () => {
  const s = await newSession();
  const response = await post(`/api/sessions/${s.id}/turns`, {
    anchor: "anything", text: "why?", quote: "x".repeat(20001),
    llm: { backend: "claude", model: "sonnet", effort: "medium" },
  });
  assert.equal(response.status, 400);
});

test("enable MCP server is scoped to a chat thread and records user provenance", async () => {
  const session = await newSession();
  writeFileSync(join(repo.dir, ".mcp.json"), JSON.stringify({ mcpServers: {
    "firefox-devtools": { type: "stdio", command: "node", args: ["server.js"] },
    allowed: { type: "stdio", command: "node", args: ["allowed.js"] },
  } }));
  const thread = rt.store.putArtifact({ sessionId: session.id, type: "ChatThread", status: "verified", data: { anchor: "anchor" }, provenance: { taskId: "task" } });
  const path = `/api/sessions/${session.id}/threads/${thread.id}/enable-mcp-server`;
  const enabled = await post(path, { server: "firefox-devtools" });
  assert.equal(enabled.status, 201);
  const { artifactId } = await enabled.json() as { artifactId: string };
  const artifact = rt.store.getArtifact(artifactId);
  assert.equal(artifact.type, "McpServerEnabled");
  assert.equal(artifact.status, "verified");
  assert.deepEqual(artifact.data, { server: "firefox-devtools" });
  assert.deepEqual(artifact.provenance, { taskId: "user" });
  assert.ok(rt.store.listLinks(session.id).some((link) => link.from === artifactId && link.to === thread.id && link.kind === "about"));
  const nonRequestable = await post(path, { server: "allowed" });
  assert.equal(nonRequestable.status, 400);
  assert.deepEqual(await nonRequestable.json(), { error: "Not an on-request MCP server: allowed" });
  assert.equal((await post(`/api/sessions/${session.id}/threads/missing/enable-mcp-server`, { server: "firefox-devtools" })).status, 404);
  const blank = await post(path, { server: " " });
  assert.equal(blank.status, 400);
  assert.deepEqual(await blank.json(), { error: "Not an on-request MCP server:  " });
});

test("finding decisions trigger comments on accept and regeneration requires latest accept", async () => {
  const session = await newSession();
  const finding = rt.store.putArtifact({ sessionId: session.id, type: "ReviewFinding", status: "proposed",
    data: { anchor: "diff#f0h0", category: "correctness", severity: "medium", title: "Finding", body: "Finding details." },
    provenance: { taskId: "review" } });
  const path = `/api/sessions/${session.id}/findings/${finding.id}/decide`;
  assert.equal((await post(path, { decision: "other" })).status, 400);
  assert.equal((await post(`/api/sessions/${session.id}/findings/missing/decide`, { decision: "accepted" })).status, 404);

  const accepted = await post(path, { decision: "accepted" });
  assert.equal(accepted.status, 201);
  const acceptedId = (await accepted.json() as { artifactId: string }).artifactId;
  assert.equal(rt.store.getArtifact(acceptedId).type, "FindingDecision");
  assert.deepEqual(rt.store.getArtifact(acceptedId).provenance, { taskId: "user" });
  assert.ok(rt.store.listLinks(session.id).some((link) => link.from === acceptedId && link.to === finding.id && link.kind === "about"));
  await waitFor(async () => {
    const state: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return state.tasks.some((task) => task.kind === "comment" && task.status === "succeeded") ? true : undefined;
  });
  assert.equal(rt.store.listArtifacts(session.id, "ReviewComment").length, 1);

  const dismissed = await post(path, { decision: "dismissed" });
  assert.equal(dismissed.status, 201);
  const decisions = rt.store.listArtifacts(session.id, "FindingDecision");
  assert.equal(decisions.length, 2);
  assert.equal((decisions.at(-1)!.data as { decision: string }).decision, "dismissed");
  const regenerate = `/api/sessions/${session.id}/findings/${finding.id}/comment/regenerate`;
  assert.equal((await post(regenerate, {})).status, 409);
  assert.equal((await post(path, { decision: "accepted" })).status, 201);
  assert.equal((await post(regenerate, {})).status, 202);
  await waitFor(async () => {
    const state: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return state.tasks.filter((task) => task.kind === "comment").length === 3 && state.tasks.filter((task) => task.kind === "comment").every((task) => task.status === "succeeded") ? true : undefined;
  });
  assert.equal(rt.store.listArtifacts(session.id, "ReviewComment").length, 3);
});

test("editing a finding comment appends verified user artifacts", async () => {
  const session = await newSession();
  const finding = rt.store.putArtifact({ sessionId: session.id, type: "ReviewFinding", status: "proposed",
    data: { anchor: "diff#f0h0", category: "correctness", severity: "medium", title: "Finding", body: "Finding details." },
    provenance: { taskId: "review" } });
  const path = `/api/sessions/${session.id}/findings/${finding.id}/comment`;
  assert.equal((await put(path, { body: " \n " })).status, 400);
  const first = await put(path, { body: "Use a strong ref." });
  assert.equal(first.status, 201);
  const second = await put(path, { body: "Use a strong reference." });
  assert.equal(second.status, 201);
  const artifacts = rt.store.listArtifacts(session.id, "ReviewComment");
  assert.equal(artifacts.length, 2);
  assert.equal(artifacts.at(-1)!.status, "verified");
  assert.deepEqual(artifacts.at(-1)!.data, { finding: finding.id, body: "Use a strong reference." });
  assert.deepEqual(artifacts.at(-1)!.provenance, { taskId: "user" });
  assert.ok(rt.store.listLinks(session.id).some((link) => link.from === artifacts.at(-1)!.id && link.to === finding.id && link.kind === "about"));
  assert.equal((await put(`/api/sessions/${session.id}/findings/missing/comment`, { body: "x" })).status, 404);
});

test("post-drafts reports a missing Differential Revision trailer", async () => {
  const session = await newSession();
  rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: {
    baseSha: "base", headSha: "head", commits: [{ sha: "head", subject: "change", body: "No trailer" }], files: [],
  }, provenance: { taskId: "test" } });
  const response = await post(`/api/sessions/${session.id}/post-drafts`, {});
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /No commit of the stack has a Differential Revision trailer/);
});

test("post-drafts submits verified comments as Conduit drafts", async () => {
  const testRepo = makeRepo();
  const baseSha = testRepo.commit({ "a.txt": "before\n" }, "base");
  const headSha = testRepo.commit({ "a.txt": "after\n" }, "change\n\nDifferential Revision: https://phab.example.com/D1");
  const session = rt.store.createSession({ worktree: testRepo.dir, repoDir: `${testRepo.dir}/.git`, title: "draft posting" });
  const diffData: DiffData = { baseSha, headSha, commits: [{ sha: headSha, subject: "change", body: "Differential Revision: https://phab.example.com/D1" }], files: [] };
  const previousDiff = rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: { ...diffData, headSha: "previous" }, provenance: { taskId: "test" } });
  const previousNarrative = rt.store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data: { diffId: previousDiff.id, summary: "previous", changes: [] }, provenance: { taskId: "test" } });
  const diff = rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: diffData, provenance: { taskId: "test" } });
  const narrative = rt.store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data: { diffId: diff.id, summary: "s", changes: [] }, provenance: { taskId: "test" } });
  const finding = rt.store.putArtifact({ sessionId: session.id, type: "ReviewFinding", status: "proposed", data: {
    anchor: `${previousDiff.id}#f0h0`, lines: { path: "a.txt", side: "new", start: 1, end: 1 }, category: "correctness", severity: "high", title: "Finding", body: "Details",
  }, provenance: { taskId: "test" } });
  rt.store.putLink({ sessionId: session.id, from: finding.id, to: previousNarrative.id, kind: "derivedFrom" });
  const carry = rt.store.putArtifact({ sessionId: session.id, type: "FindingCarry", status: "verified", data: { finding: finding.id, toDiff: diff.id, hunkId: "f0h0", lines: { path: "a.txt", side: "new", start: 8, end: 8 } }, provenance: { taskId: "carry" } });
  rt.store.putLink({ sessionId: session.id, from: carry.id, to: finding.id, kind: "about" });
  const decision = rt.store.putArtifact({ sessionId: session.id, type: "FindingDecision", status: "verified", data: { finding: finding.id, decision: "accepted" }, provenance: { taskId: "user" } });
  rt.store.putLink({ sessionId: session.id, from: decision.id, to: finding.id, kind: "about" });
  const comment = rt.store.putArtifact({ sessionId: session.id, type: "ReviewComment", status: "verified", data: { finding: finding.id, body: "Please update this." }, provenance: { taskId: "user" } });
  rt.store.putLink({ sessionId: session.id, from: comment.id, to: finding.id, kind: "about" });

  const remote = await makeGit(testRepo.dir).diff(baseSha, headSha);
  const calls: string[] = [];
  let inlineLine: number | undefined;
  let mode: "normal" | "drift" | "http-error" = "normal";
  const conduitServer = createNetServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const form = new URLSearchParams(body);
    const method = req.url!.slice("/api/".length);
    calls.push(method);
    const params = JSON.parse(form.get("params")!);
    if (method === "differential.createinline") inlineLine = params.lineNumber;
    if (mode === "http-error") {
      res.writeHead(500).end("failure");
      return;
    }
    const result = method === "differential.revision.search" ? { data: [{ phid: "PHID-DREV-1" }] }
      : method === "differential.diff.search" ? { data: [{ id: 7 }] }
        : method === "differential.getrawdiff" ? mode === "drift" ? remote.replace("+after", "+different") : remote
          : method === "differential.createinline" ? { id: 9 }
            : null;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ error_code: null, error_info: null, result }));
  });
  await new Promise<void>((resolve) => conduitServer.listen(0, "127.0.0.1", resolve));
  const arcrc = join(mkdtempSync(join(tmpdir(), "spatial-arcrc-")), "arcrc");
  writeFileSync(arcrc, JSON.stringify({ hosts: { "https://phab.example.com/api/": { token: "test-token" } } }));
  const oldArcrc = process.env.SPATIAL_ARCRC_PATH;
  const oldConduit = process.env.SPATIAL_CONDUIT_BASE_URL;
  process.env.SPATIAL_ARCRC_PATH = arcrc;
  process.env.SPATIAL_CONDUIT_BASE_URL = `http://127.0.0.1:${(conduitServer.address() as AddressInfo).port}`;
  try {
    const response = await post(`/api/sessions/${session.id}/post-drafts`, {});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { posted: 1, skipped: [], revision: "D1" });
    assert.deepEqual(calls, ["differential.revision.search", "differential.diff.search", "differential.getrawdiff", "differential.createinline"]);
    assert.equal(inlineLine, 8);
    const posted = rt.store.listArtifacts(session.id, "PostedComment");
    assert.equal(posted.length, 1);
    assert.deepEqual(posted[0]!.data, { comment: comment.id, revision: 1, diff: 7, inlineId: 9 });
    assert.deepEqual(posted[0]!.provenance, { taskId: "runtime" });

    const nextComment = rt.store.putArtifact({ sessionId: session.id, type: "ReviewComment", status: "verified", data: { finding: finding.id, body: "Please update this too." }, provenance: { taskId: "user" } });
    rt.store.putLink({ sessionId: session.id, from: nextComment.id, to: finding.id, kind: "about" });
    mode = "drift";
    const drifted = await post(`/api/sessions/${session.id}/post-drafts`, {});
    assert.equal(drifted.status, 409);
    assert.match((await drifted.json()).error, /a.txt/);

    mode = "http-error";
    const upstreamFailure = await post(`/api/sessions/${session.id}/post-drafts`, {});
    assert.equal(upstreamFailure.status, 502);
  } finally {
    if (oldArcrc === undefined) delete process.env.SPATIAL_ARCRC_PATH;
    else process.env.SPATIAL_ARCRC_PATH = oldArcrc;
    if (oldConduit === undefined) delete process.env.SPATIAL_CONDUIT_BASE_URL;
    else process.env.SPATIAL_CONDUIT_BASE_URL = oldConduit;
    await new Promise<void>((resolve) => conduitServer.close(() => resolve()));
  }
});

test("file context endpoint serves modified text at diff head and rejects unsupported files", async () => {
  const session = await newSession();
  const { diffId } = await rt.run<{ diffId: string }>(session.id, "importDiff", { base: "HEAD~1", head: "HEAD" });
  const response = await fetch(`${base}/api/sessions/${session.id}/diffs/${diffId}/file?path=a.txt`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { lines: ["1", "TWO"] });
  const added = await fetch(`${base}/api/sessions/${session.id}/diffs/${diffId}/file?path=c.txt`);
  assert.equal(added.status, 400);
  assert.equal((await added.json()).error, "Context is only available for modified or renamed text files");
  assert.equal((await fetch(`${base}/api/sessions/${session.id}/diffs/${diffId}/file?path=missing`)).status, 404);
  assert.equal((await fetch(`${base}/api/sessions/${session.id}/diffs/nope/file?path=a.txt`)).status, 404);
  const foreign = await newSession();
  assert.equal((await fetch(`${base}/api/sessions/${foreign.id}/diffs/${diffId}/file?path=a.txt`)).status, 404);
  const notDiff = rt.store.putArtifact({ sessionId: session.id, type: "Other", status: "verified", data: {}, provenance: { taskId: "task" } });
  assert.equal((await fetch(`${base}/api/sessions/${session.id}/diffs/${notDiff.id}/file?path=a.txt`)).status, 404);
});

test("import-revision materializes a remote patch and starts narration", async () => {
  const target = makeRepo();
  const baseSha = target.commit({ "a.txt": "1\n2\n" }, "base");
  const scratch = makeRepo();
  const scratchBase = scratch.commit({ "a.txt": "1\n2\n" }, "base");
  const scratchHead = scratch.commit({ "a.txt": "1\nTWO\n", "c.txt": "c\n" }, "remote change");
  const rawDiff = `${scratch.git("diff", scratchBase, scratchHead)}\n`;
  const calls: string[] = [];
  const conduitServer = createNetServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const method = req.url!.slice("/api/".length);
    calls.push(method);
    const params = JSON.parse(new URLSearchParams(body).get("params")!);
    const result = method === "differential.revision.search" ? { data: [{ phid: "PHID-DREV-1", id: 1, fields: { title: "Remote change", status: { closed: false }, stackGraph: { "PHID-DREV-1": [] } } }] }
      : method === "differential.diff.search" ? { data: [{ id: 7, fields: { dateCreated: 1791278237, refs: [{ type: "base", identifier: baseSha }] } }] }
        : method === "differential.getrawdiff" ? rawDiff : null;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ error_code: null, error_info: null, result }));
  });
  await new Promise<void>((resolve) => conduitServer.listen(0, "127.0.0.1", resolve));
  const arcrc = join(mkdtempSync(join(tmpdir(), "spatial-arcrc-")), "arcrc");
  writeFileSync(arcrc, JSON.stringify({ hosts: { "https://phab.example.com/api/": { token: "test-token" } } }));
  const oldArcrc = process.env.SPATIAL_ARCRC_PATH;
  const oldConduit = process.env.SPATIAL_CONDUIT_BASE_URL;
  process.env.SPATIAL_ARCRC_PATH = arcrc;
  process.env.SPATIAL_CONDUIT_BASE_URL = `http://127.0.0.1:${(conduitServer.address() as AddressInfo).port}`;
  const session = await (await post("/api/sessions", { repo: target.dir, title: "remote", workflow: "review" })).json() as Session;
  const before = target.git("status", "--porcelain");
  try {
    const response = await post(`/api/sessions/${session.id}/import-revision`, { host: "https://phab.example.com", id: 1 });
    assert.equal(response.status, 202);
    const range = await response.json() as { base: string; head: string };
    assert.equal(range.base, baseSha);
    assert.notEqual(range.head, baseSha);
    await waitFor(async () => (await (await fetch(`${base}/api/sessions/${session.id}/state`)).json() as SessionState).artifacts.find((item) => item.type === "PatchNarrative"));
    const state: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    const imported = state.artifacts.find((item) => item.type === "Diff")!;
    assert.equal((imported.data as DiffData).baseSha, range.base);
    assert.equal((imported.data as DiffData).headSha, range.head);
    const data = imported.data as DiffData;
    assert.equal(data.commits.length, 1);
    assert.deepEqual(commitRevision(data.commits[0]!), { host: "https://phab.example.com", id: 1 });
    assert.ok(calls.every((method) => ["differential.revision.search", "differential.diff.search", "differential.getrawdiff"].includes(method)));
    assert.deepEqual(calls, ["differential.revision.search", "differential.diff.search", "differential.getrawdiff"]);
    assert.equal(target.git("rev-parse", "HEAD"), baseSha);
    assert.equal(target.git("status", "--porcelain"), before);
  } finally {
    if (oldArcrc === undefined) delete process.env.SPATIAL_ARCRC_PATH;
    else process.env.SPATIAL_ARCRC_PATH = oldArcrc;
    if (oldConduit === undefined) delete process.env.SPATIAL_CONDUIT_BASE_URL;
    else process.env.SPATIAL_CONDUIT_BASE_URL = oldConduit;
    await new Promise<void>((resolve) => conduitServer.close(() => resolve()));
  }
});

test("unknown session and API routes return 404 JSON", async () => {
  assert.equal((await fetch(`${base}/api/sessions/nope/state`)).status, 404);
  const response = await fetch(`${base}/api/nope`);
  assert.equal(response.status, 404);
  assert.ok((await response.json()).error);
});

test("SSE replays events after after and honors Last-Event-ID", async () => {
  const session = await newSession();
  await post(`/api/sessions/${session.id}/narrate`, { base: "HEAD~1", head: "HEAD" });
  await waitFor(async () => {
    const state: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return state.tasks.length === 4 && state.tasks.every((task) => task.status === "succeeded") ? true : undefined;
  });
  const read = async (headers: Record<string, string> = {}) => {
    const response = await fetch(`${base}/api/sessions/${session.id}/events?after=0`, { headers });
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    const reader = response.body!.getReader();
    let text = "";
    while (!text.includes("task.succeeded")) text += new TextDecoder().decode((await reader.read()).value);
    await reader.cancel();
    return [...text.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));
  };
  const all = await read();
  assert.ok(all.length >= 4);
  const tail = await read({ "last-event-id": String(all[1]) });
  assert.equal(tail[0], all[2]);
});

test("SSE subscriptions watch the session until the connection closes", async () => {
  const calls: string[] = [];
  const released: string[] = [];
  const watcher = { watch(id: string) { calls.push(id); return () => released.push(id); } } as unknown as RevisionWatcher;
  const watchServer = createHttpServer(rt, { watcher });
  await new Promise<void>((resolve) => watchServer.listen(0, "127.0.0.1", resolve));
  const session = await newSession();
  const controller = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${(watchServer.address() as AddressInfo).port}/api/sessions/${session.id}/events`, { signal: controller.signal });
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [session.id]);
    controller.abort();
    await waitFor(async () => released.includes(session.id) ? true : undefined);
  } finally {
    controller.abort();
    await new Promise<void>((resolve) => watchServer.close(() => resolve()));
  }
});

test("models endpoint returns default and per-backend results", async () => {
  assert.deepEqual(await (await fetch(`${base}/api/llm/models`)).json(), {
    default: { backend: "claude", model: "sonnet", effort: "medium" },
    backends: { claude: { models: [{ id: "sonnet", efforts: ["low"] }] }, codex: { error: "no cache" } },
  });
});

test("cancel of a non-running task is 409", async () => {
  assert.equal((await post("/api/tasks/nope/cancel", {})).status, 409);
});

test("static files with SPA fallback", async () => {
  const root = await fetch(`${base}/`);
  assert.match(await root.text(), /<title>app<\/title>/);
  assert.match(root.headers.get("content-type")!, /text\/html/);
  assert.match(await (await fetch(`${base}/some/deep/route`)).text(), /<title>app<\/title>/);
  assert.match(await (await fetch(`${base}/%2e%2e/etc/passwd`)).text(), /<title>app<\/title>/);
});
