// REQUIRES_REAL_GIT
// REQUIRES_REAL_NET
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Store } from "../../src/runtime/store.ts";
import { Runtime } from "../../src/runtime/tasks.ts";
import { makeGit } from "../../src/runtime/git/read.ts";
import { corePlugin } from "../../src/runtime/create.ts";
import { plugins } from "../../src/plugins/index.ts";
import { createHttpServer } from "../../src/server/http.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { RecentRepo, Session, SessionState } from "../../src/shared/types.ts";
import { makeRepo } from "../helpers/git-fixture.ts";
import { CHAT_REPLY, NARRATIVE, base, llm, newSession, post, repo, replyFor, rt, staticDir, state, waitFor } from "../helpers/http-server.ts";

test("sessions: create, list, validation", async () => {
  const session = await newSession();
  const list: Session[] = await (await fetch(`${base}/api/sessions`)).json();
  assert.ok(list.some((item) => item.id === session.id));
  const bad = await post("/api/sessions", { repo: tmpdir(), title: "t" });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /Not a git repository/);
  assert.equal((await post("/api/sessions", { title: "t" })).status, 400);
});

// REQUIRES_REAL_GIT

test("dirs lists directories, marks git roots, validates paths, and defaults to injected home", async () => {
  const home = mkdtempSync(join(tmpdir(), "dirs-home-"));
  const child = join(home, "child");
  const repoDir = join(home, "repo");
  const hidden = join(home, ".hidden");
  mkdirSync(child);
  mkdirSync(join(repoDir, ".git"), { recursive: true });
  mkdirSync(hidden);
  const dirsServer = createHttpServer(rt, { homeDir: home });
  await new Promise<void>((resolve) => dirsServer.listen(0, "127.0.0.1", resolve));
  try {
    const addr = dirsServer.address() as AddressInfo;
    const origin = `http://127.0.0.1:${addr.port}`;
    const root = await (await fetch(`${origin}/api/dirs`)).json() as { path: string; parent: string | null; entries: { name: string; path: string; repo: boolean }[] };
    assert.equal(root.path, home);
    assert.equal(root.parent, dirname(home));
    assert.deepEqual(root.entries.map((entry) => entry.name), ["child", "repo"]);
    assert.equal((await fetch(`${origin}/api/dirs?path=relative`)).status, 400);
    assert.equal((await fetch(`${origin}/api/dirs?path=${encodeURIComponent(join(home, "missing"))}`)).status, 404);
    const repoResponse = await fetch(`${origin}/api/dirs?path=${encodeURIComponent(home)}`);
    const listing = await repoResponse.json() as { entries: { path: string; repo: boolean }[] };
    assert.equal(listing.entries.find((entry) => entry.path === repoDir)?.repo, true);
  } finally {
    await new Promise<void>((resolve) => dirsServer.close(() => resolve()));
    rmSync(home, { recursive: true, force: true });
  }
});

test("workflow start routes support slash commands, selection, and validation", async () => {
  writeFileSync(join(repo.dir, "mach"), "");
  writeFileSync(join(repo.dir, "moz.build"), "");
  const infos = await (await fetch(`${base}/api/workflows`)).json();
  assert.deepEqual(infos.map((info: { id: string }) => info.id), ["review", "chat", "implement", "explore"]);
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
  assert.deepEqual(commandStart.data, { via: "command", workflow: "chat", profile: "gecko", params: {}, title: "/chat hi there", prompt: "hi there" });
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
  const selectedSession: Session = await selectorResponse.json();
  assert.equal(selectedSession.workflow, "chat");
  assert.equal(selectedSession.title, "Picked");
  const selected = await waitFor(async () => {
    const state: SessionState = await (await fetch(`${base}/api/sessions/${selectedSession.id}/state`)).json();
    const start = state.artifacts.find((item) => item.type === "WorkflowStart");
    const thread = state.artifacts.find((item) => item.type === "ChatThread");
    return start && thread ? { state, start, thread } : undefined;
  });
  assert.equal((selected.start!.data as { via: string }).via, "selector");
  assert.equal((selected.thread!.data as { anchor: string }).anchor, selected.start!.id);
  assert.ok(selected.state.artifacts.some((item) => item.type === "ChatMessage" && (item.data as { role: string; text: string }).role === "user" && (item.data as { text: string }).text === "what is this repo about?"));

  for (const body of [{ question: "nope", answer: 0 }, { question: "nope", answer: true }]) assert.equal((await post("/api/start", body)).status, 400);
});

test("notes require a nonempty body and a session start request", async () => {
  const session = await newSession();
  const path = `/api/sessions/${session.id}/notes`;
  assert.equal((await post(path, { body: "   " })).status, 400);
  assert.equal((await post(path, { body: "draft note" })).status, 400);
  rt.store.putArtifact({ sessionId: session.id, type: "WorkflowStart", status: "verified", data: { via: "command", workflow: "chat", params: {}, title: "Chat", prompt: "Start" }, provenance: { taskId: "user" } });
  const response = await post(path, { body: "draft note" });
  assert.equal(response.status, 201);
  const { artifactId } = await response.json();
  assert.deepEqual(rt.store.getArtifact(artifactId).data, { body: "draft note" });
  assert.ok(rt.store.listLinks(session.id).some((link) => link.from === artifactId && link.kind === "about"));
  assert.equal(rt.store.search(session.id, "draft note").some((hit) => hit.ref === artifactId), true);
});

test("health reports whether the server serves the built UI", async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.deepEqual(health, { app: "spatial", ui: true, pid: process.pid, commit: null, runningTasks: 0 });
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

test("recent repos lists each live checkout with its own sessions, newest first", async () => {
  const recentRepo = makeRepo();
  const otherRepo = makeRepo();
  const other = await post("/api/sessions", { repo: otherRepo.dir, title: "other" });
  assert.equal(other.status, 201);
  assert.equal((await post("/api/sessions", { repo: recentRepo.dir, title: "first" })).status, 201);
  await new Promise((resolve) => setTimeout(resolve, 2));
  const secondResponse = await post("/api/sessions", { repo: recentRepo.dir, title: "second" });
  const second = await secondResponse.json() as Session;
  const worktree = mkdtempSync(join(tmpdir(), "recent-repo-worktree-"));
  recentRepo.git("worktree", "add", "-q", worktree, "-b", "recent-repo-worktree");
  const worktreeSession = await post("/api/sessions", { repo: worktree, title: "worktree" });
  assert.equal(worktreeSession.status, 201);
  rt.store.createSession({ worktree: "/missing-worktree", repoDir: realpathSync(recentRepo.dir) + "/.git", title: "stale" });
  rt.store.createSession({ worktree: "/deleted-repository", repoDir: "/deleted-repository/.git", title: "deleted" });

  const response = await fetch(`${base}/api/repos`);
  assert.equal(response.status, 200);
  const repos = await response.json();
  const checkouts = repos.filter((item: { repoDir: string }) => item.repoDir === realpathSync(recentRepo.dir) + "/.git");
  assert.deepEqual(checkouts.map((item: RecentRepo) => ({ name: item.name, worktree: item.worktree, sessions: item.sessions })), [
    { name: basename(realpathSync(recentRepo.dir)), worktree: realpathSync(worktree), sessions: 1 },
    { name: basename(realpathSync(recentRepo.dir)), worktree: realpathSync(recentRepo.dir), sessions: 2 },
  ]);
  assert.equal(checkouts[1].lastActive, second.createdAt);
  assert.ok(!repos.some((item: { repoDir: string }) => item.repoDir === "/deleted-repository/.git"));
  assert.ok(repos.findIndex((item: RecentRepo) => item.worktree === realpathSync(worktree)) < repos.findIndex((item: { repoDir: string }) => item.repoDir === realpathSync(otherRepo.dir) + "/.git"));
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

test("API requests from other sites are rejected; the app's own pages and CLI clients pass", async () => {
  const get = (path: string, headers: Record<string, string>) => fetch(base + path, { headers });
  assert.equal((await get("/api/workflows", { "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await get("/api/workflows", { "sec-fetch-site": "same-site" })).status, 403);
  assert.equal((await get("/api/workflows", { origin: "https://evil.example" })).status, 403);
  assert.equal((await get("/api/workflows", { "sec-fetch-site": "same-origin", origin: "http://localhost:5173" })).status, 200);
  assert.equal((await get("/api/workflows", { "sec-fetch-site": "none" })).status, 200);
  assert.equal((await get("/api/workflows", {})).status, 200);
});

test("responses forbid framing and sniffing; pages carry a content security policy", async () => {
  const api = await fetch(`${base}/api/workflows`);
  assert.equal(api.headers.get("x-frame-options"), "DENY");
  assert.equal(api.headers.get("x-content-type-options"), "nosniff");
  const page = await fetch(`${base}/`);
  assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(page.headers.get("content-security-policy") ?? "", /img-src 'self' data:/);
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
  const gatedRt = new Runtime({ store: new Store(":memory:"), plugins: [corePlugin, ...plugins], llm: gatedLlm, git: makeGit });
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

test("turn request starts its requested phase after the chat task completes", async () => {
  const s = await newSession();
  await post(`/api/sessions/${s.id}/narrate`, { base: "HEAD~1", head: "HEAD" });
  const narrative = await waitFor(async () => rt.store.listArtifacts(s.id, "PatchNarrative")[0]);
  await waitFor(async () => rt.store.listEpochs(s.id).every((epoch) => epoch.status !== "running") || undefined);
  state.requestPhase = true;
  try {
    const response = await post(`/api/sessions/${s.id}/turns`, { anchor: `${narrative.id}#c1`, text: "run", llm: { backend: "claude", model: "sonnet", effort: "medium" } });
    assert.equal(response.status, 202);
    await waitFor(async () => rt.store.listEpochs(s.id).find((epoch) => epoch.phase === "p" && epoch.status === "succeeded"));
    assert.deepEqual(rt.store.listEpochs(s.id).filter((epoch) => epoch.phase === "p").map((epoch) => epoch.input), [{ x: 1 }]);
  } finally { state.requestPhase = false; }
});

test("turn request notifies when its requested phase cannot start during another epoch", async () => {
  const s = await newSession();
  await post(`/api/sessions/${s.id}/narrate`, { base: "HEAD~1", head: "HEAD" });
  const narrative = await waitFor(async () => rt.store.listArtifacts(s.id, "PatchNarrative")[0]);
  await waitFor(async () => rt.store.listEpochs(s.id).every((epoch) => epoch.status !== "running") || undefined);
  const running = rt.runPhase(s.id, "blocking", null);
  await waitFor(async () => state.unblockPhase ? true : undefined);
  state.requestPhase = true;
  try {
    const response = await post(`/api/sessions/${s.id}/turns`, { anchor: `${narrative.id}#c1`, text: "run", llm: { backend: "claude", model: "sonnet", effort: "medium" } });
    assert.equal(response.status, 202);
    await waitFor(async () => rt.store.listEvents(s.id).find((event) => event.type === "notify" && (event.payload as { title?: string }).title === "Could not start p"));
    assert.equal(rt.store.listEpochs(s.id).some((epoch) => epoch.phase === "p"), false);
  } finally { state.requestPhase = false; state.unblockPhase?.(); await running; state.unblockPhase = undefined; }
});

test("turns reject selected quotes over 20000 characters", async () => {
  const s = await newSession();
  const response = await post(`/api/sessions/${s.id}/turns`, {
    anchor: "anything", text: "why?", quote: "x".repeat(20001),
    llm: { backend: "claude", model: "sonnet", effort: "medium" },
  });
  assert.equal(response.status, 400);
});

test("turns validate aside as an anchored session-level chat only", async () => {
  const s = await newSession();
  const llm = { backend: "claude", model: "sonnet", effort: "medium" };
  const postTurn = (body: unknown) => post(`/api/sessions/${s.id}/turns`, body);
  assert.equal((await postTurn({ anchor: "W", aside: "yes", text: "x", llm })).status, 400);
  assert.equal((await postTurn({ aside: true, text: "x", llm })).status, 400);
  assert.equal((await postTurn({ threadId: "T", aside: true, text: "x", llm })).status, 400);
});

test("turns reject non-string threadId and anchor", async () => {
  const s = await newSession();
  const llm = { backend: "claude", model: "sonnet", effort: "medium" };
  const postTurn = (body: unknown) => post(`/api/sessions/${s.id}/turns`, body);
  assert.equal((await postTurn({ threadId: 7, text: "x", llm })).status, 400);
  assert.equal((await postTurn({ anchor: {}, text: "x", llm })).status, 400);
});

test("enable MCP server is scoped to a chat thread and records user provenance", async () => {
  const session = await newSession();
  writeFileSync(join(repo.dir, ".mcp.json"), JSON.stringify({ mcpServers: {
    "firefox-devtools": { type: "stdio", command: "node", args: ["server.js"] },
    allowed: { type: "http", url: "https://example.test/mcp" },
  } }));
  const thread = rt.store.putArtifact({ sessionId: session.id, type: "ChatThread", status: "verified", data: { anchor: "anchor" }, provenance: { taskId: "task" } });
  const path = `/api/sessions/${session.id}/threads/${thread.id}/enable-mcp-server`;
  const stale = await post(path, { server: "firefox-devtools", command: "node other.js" });
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), { error: "The command of firefox-devtools changed; ask again" });
  assert.equal(rt.store.listArtifacts(session.id, "McpServerEnabled").length, 0);
  const enabled = await post(path, { server: "firefox-devtools", command: "node server.js" });
  assert.equal(enabled.status, 201);
  const { artifactId } = await enabled.json() as { artifactId: string };
  const artifact = rt.store.getArtifact(artifactId);
  assert.equal(artifact.type, "McpServerEnabled");
  assert.equal(artifact.status, "verified");
  assert.deepEqual(artifact.data, { server: "firefox-devtools", command: "node server.js" });
  assert.deepEqual(artifact.provenance, { taskId: "user" });
  assert.ok(rt.store.listLinks(session.id).some((link) => link.from === artifactId && link.to === thread.id && link.kind === "about"));
  const nonRequestable = await post(path, { server: "allowed", command: "https://example.test/mcp" });
  assert.equal(nonRequestable.status, 400);
  assert.deepEqual(await nonRequestable.json(), { error: "Not an on-request MCP server: allowed" });
  assert.equal((await post(`/api/sessions/${session.id}/threads/missing/enable-mcp-server`, { server: "firefox-devtools", command: "node server.js" })).status, 404);
  const blank = await post(path, { server: " ", command: "node server.js" });
  assert.equal(blank.status, 400);
  assert.deepEqual(await blank.json(), { error: "Not an on-request MCP server:  " });
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
    return state.tasks.length === 5 && state.tasks.every((task) => task.status === "succeeded") ? true : undefined;
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
  const watchPlugin = { id: "watch-test", server() { return { watch(id: string) { calls.push(id); return () => released.push(id); } }; } };
  const watchRuntime = new Runtime({ store: new Store(":memory:"), plugins: [corePlugin, ...plugins, watchPlugin], llm, git: makeGit });
  const watchServer = createHttpServer(watchRuntime);
  await new Promise<void>((resolve) => watchServer.listen(0, "127.0.0.1", resolve));
  const session = watchRuntime.store.createSession({ worktree: repo.dir, repoDir: `${repo.dir}/.git`, title: "watch" });
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
