// REQUIRES_REAL_GIT
// REQUIRES_REAL_NET
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { createServer as createNetServer } from "node:http";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type WebspecCapability, type SearchfoxCapability } from "../../src/runtime/tasks.ts";
import { definePlugin } from "../../src/plugin-api.ts";
import type { ChatReplyField } from "../../src/runtime/plugins.ts";
import { makeGit } from "../../src/runtime/git.ts";
import { corePlugin } from "../../src/runtime/create.ts";
import { plugins } from "../../src/plugins/index.ts";
import { createHttpServer } from "../../src/server/http.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { DiffData, RecentRepo, Session, SessionState, WorkflowStartData } from "../../src/shared/types.ts";
import { commitRevision } from "../../src/plugins/review/shared/phabricator.ts";
import { reviewRoutes } from "../../src/plugins/review/server/routes.ts";
import { lookupSpecRef } from "../../src/plugins/review/tasks/lookup-spec-ref/task.ts";
import { makeRepo } from "../helpers/git-fixture.ts";

const NARRATIVE = { summary: "S", changes: [{ id: "c1", title: "t", explanation: "e", rationale: "r", hunkIds: ["f0h0", "f1h0"], dependsOn: [], specUrls: [] }] };
let failNarrationOnce = false;
let requestPhase = false;
const CHAT_REPLY = { answer: "hi", questions: [], revisions: [], requestMcpServers: [], diagram: null };
const replyFor = (prompt: { schema?: object }) => prompt.schema && "properties" in prompt.schema && "answer" in (prompt.schema as { properties: object }).properties;
const selectorFor = (prompt: { schema?: object }) => prompt.schema && "properties" in prompt.schema && "workflow" in (prompt.schema as { properties: object }).properties;
const reviewFor = (prompt: { schema?: object; system?: string }) => prompt.system?.includes("You review a code patch") || !!prompt.schema && "properties" in prompt.schema && "findings" in (prompt.schema as { properties: object }).properties;
const commentFor = (prompt: { schema?: object }) => !!prompt.schema && "properties" in prompt.schema && "body" in (prompt.schema as { properties: object }).properties;
const llm: LlmService = {
  defaultSelection: { backend: "claude", model: "sonnet", effort: "medium" },
  async run(selection, prompt) { if (failNarrationOnce && prompt.system?.startsWith("You explain a code patch")) { failNarrationOnce = false; throw new Error("synthetic narration failure"); } const selector = selectorFor(prompt); const chat = replyFor(prompt); const review = reviewFor(prompt); const comment = commentFor(prompt); const stack = prompt.schema && "properties" in prompt.schema && "commitIntents" in (prompt.schema as { properties: object }).properties; const commitHunks = [...prompt.prompt.matchAll(/^### (f\d+h\d+) .* \[C(\d+)\](?: \[[^\]]+\])*$/gm)].map((match) => [match[1]!, Number(match[2])]); return { text: "hi", json: prompt.schema ? selector ? { workflow: "chat", params: {}, title: "Picked" } : chat ? { ...CHAT_REPLY, requestPhase: requestPhase ? {} : null } : review ? { findings: [], verdicts: [] } : comment ? { body: "Generated review comment." } : stack ? { summary: "Adds `c.txt`, then updates `a.txt`.", commitIntents: Array.from({ length: (prompt.prompt.match(/^## C\d+: /gm) ?? []).length }, (_, i) => `Commit ${i + 1} intent.`), flowHints: Array.from({ length: (prompt.prompt.match(/^## C\d+: /gm) ?? []).length }, () => null), changes: [...new Set(commitHunks.map(([, commit]) => commit))].sort().map((commit, index, owners) => ({ id: `c${commit}`, title: `Commit ${commit}`, explanation: `Changes of commit ${commit}.`, rationale: "r", hunkIds: commitHunks.filter(([, owner]) => owner === commit).map(([id]) => id), dependsOn: index ? [`c${owners[index - 1]}`] : [], specUrls: [] })) } : NARRATIVE : undefined, providerSessionId: "p", selection: selection ?? this.defaultSelection }; },
  async listModels() { return { claude: { models: [{ id: "sonnet", efforts: ["low"] }] }, codex: { error: "no cache" } }; },
};
const repo = makeRepo();
repo.commit({ "a.txt": "1\n2\n" }, "base");
repo.commit({ "a.txt": "1\nTWO\n", "c.txt": "c\n" }, "change");
const staticDir = mkdtempSync(join(tmpdir(), "static-"));
writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>app</title>");
const runRequestField: ChatReplyField = { name: "requestPhase", label: "Run", schema: { type: "object" }, prompt: "", async accept() { return { ok: true, artifacts: [], run: { phase: "p", input: { x: 1 } } }; } };
const task6Plugin = definePlugin({ id: "http-task6-test", chatReplyFields: [runRequestField], phases: [
  { id: "p", async run() {} },
  { id: "blocking", async run() { await new Promise<void>((resolve) => { unblockPhase = resolve; }); } },
] });
let unblockPhase: (() => void) | undefined;
const rt = new Runtime({ store: new Store(":memory:"), plugins: [corePlugin, ...plugins, task6Plugin], llm, git: makeGit, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
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

// REQUIRES_REAL_GIT
test("code-links validates requests, requires an upstream Gecko Diff, and caches resolved tokens", async () => {
  const session = await newSession();
  assert.equal((await post(`/api/sessions/${session.id}/code-links`, { tokens: [] })).status, 400);
  assert.equal((await post(`/api/sessions/${session.id}/code-links`, { tokens: ["x".repeat(201)] })).status, 400);
  assert.equal((await post(`/api/sessions/${session.id}/code-links`, { tokens: ["Foo::Bar"] })).status, 409);
  writeFileSync(join(repo.dir, "mach"), "");
  writeFileSync(join(repo.dir, "moz.build"), "");
  const rev = repo.git("rev-parse", "HEAD");
  rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: { upstreamRev: rev, baseSha: rev, headSha: rev, commits: [], files: [{ path: "a.txt", status: "modified", binary: false, hunks: [] }] } satisfies DiffData, provenance: { taskId: "test" } });
  let definitions = 0;
  const searchfox = rt.searchfox as unknown as {
    tip: () => Promise<{ repoBase: string; rev: string }>;
    define: () => Promise<{ path: string; line: number; text: string }>;
  };
  const originalTip = searchfox.tip;
  const originalDefine = searchfox.define;
  try {
    searchfox.tip = async () => ({ repoBase: "https://searchfox.org/firefox-main/", rev });
    searchfox.define = async () => { definitions++; return { path: "a.txt", line: 1, text: "1" }; };
    const first = await post(`/api/sessions/${session.id}/code-links`, { tokens: ["Foo::Bar"] });
    assert.equal(first.status, 200);
    const second = await post(`/api/sessions/${session.id}/code-links`, { tokens: ["Foo::Bar"] });
    assert.equal(second.status, 200);
    assert.equal(definitions, 1);
  } finally {
    searchfox.tip = originalTip;
    searchfox.define = originalDefine;
  }
});

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

test("reviewed marks validate narrative and change, then create a user artifact", async () => {
  const session = await newSession();
  const diff = rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", provenance: { taskId: "test" },
    data: { baseSha: "b", headSha: "h", commits: [{ sha: "1", subject: "s", body: "" }], files: [{ path: "a", status: "modified", binary: false, hunks: [{ id: "h1", header: "", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "add", text: "x" }] }] }] } });
  const narrative = rt.store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed",
    data: { diffId: diff.id, summary: "s", changes: [{ id: "c1", title: "t", explanation: "e", rationale: "r", hunkIds: [], dependsOn: [], specUrls: [] }] }, provenance: { taskId: "test" } });
  const route = `/api/sessions/${session.id}/narratives/${narrative.id}/changes`;
  assert.equal((await post(`${route}/c1/reviewed`, { reviewed: "yes" })).status, 400);
  assert.equal((await post(`/api/sessions/${session.id}/narratives/missing/changes/c1/reviewed`, { reviewed: true })).status, 404);
  assert.equal((await post(`${route}/c9/reviewed`, { reviewed: true })).status, 404);
  assert.equal((await post(`${route}/unassigned-C1/reviewed`, { reviewed: true })).status, 201);
  assert.equal((await post(`${route}/unassigned-C2/reviewed`, { reviewed: true })).status, 404);
  const response = await post(`${route}/c1/reviewed`, { reviewed: true });
  assert.equal(response.status, 201);
  const { artifactId } = await response.json();
  const artifact = rt.store.getArtifact(artifactId);
  assert.equal(artifact.type, "ChangeReview");
  assert.deepEqual(artifact.data, { narrative: narrative.id, change: "c1", reviewed: true });
  assert.deepEqual(artifact.provenance, { taskId: "user" });
  assert.ok(rt.store.listLinks(session.id).some((link) => link.from === artifact.id && link.to === `${narrative.id}#c1` && link.kind === "about"));
});

test("workflow start routes support slash commands, selection, and validation", async () => {
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
  const firstResponse = await post("/api/sessions", { repo: recentRepo.dir, title: "first" });
  const first = await firstResponse.json() as Session;
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

test("narrate runs in background and state reflects the result", async () => {
  const session = await newSession();
  assert.equal((await post(`/api/sessions/${session.id}/narrate`, { base: "HEAD~1", head: "HEAD" })).status, 202);
  const state = await waitFor(async () => {
    const snapshot: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return snapshot.tasks.some((task) => task.kind === "review") && snapshot.tasks.every((task) => task.status !== "running" && task.status !== "pending") ? snapshot : undefined;
  });
  assert.ok(state.artifacts.some((artifact) => artifact.type === "PatchNarrative"));
  assert.deepEqual(state.tasks.map((task) => [task.kind, task.status]), [["importDiff", "succeeded"], ["introducedSymbols", "succeeded"], ["narrate", "succeeded"], ["resolveSpecRefs", "succeeded"], ["review", "succeeded"]]);
  assert.ok(state.lastEventId > 0);
  assert.equal(state.searchfox, null);
  const repeated = await post(`/api/sessions/${session.id}/narrate`, { base: "HEAD~1", head: "HEAD" });
  assert.equal(repeated.status, 409);
  assert.deepEqual(await repeated.json(), { error: "Session already has a narrative" });
});

test("narrate retries a failed workflow before a Diff exists", async () => {
  const session = await newSession();
  const start = rt.store.putArtifact<WorkflowStartData>({ sessionId: session.id, type: "WorkflowStart", status: "verified", provenance: { taskId: "user" }, data: { via: "command", workflow: "review", params: { base: "HEAD~1", head: "HEAD", revision: null }, title: "review", prompt: "HEAD~1..HEAD" } });
  assert.equal((await post(`/api/sessions/${session.id}/narrate`, {})).status, 202);
  const state = await waitFor(async () => {
    const snapshot: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return snapshot.tasks.some((task) => task.kind === "review" && task.status === "succeeded") ? snapshot : undefined;
  });
  assert.ok(rt.store.getArtifact(start.id));
  assert.ok(state.artifacts.some((artifact) => artifact.type === "PatchNarrative"));
});

test("narrate Retry reruns a failed review phase in the same epoch and reuses its Diff", async () => {
  const session = await newSession();
  failNarrationOnce = true;
  assert.equal((await post(`/api/sessions/${session.id}/narrate`, { base: "HEAD~1", head: "HEAD" })).status, 202);
  const failed = await waitFor(async () => {
    const snapshot: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return snapshot.epochs.at(-1)?.status === "failed" ? snapshot : undefined;
  });
  assert.deepEqual(failed.epochs.map(({ n, phase, status }) => ({ n, phase, status })), [{ n: 1, phase: "review", status: "failed" }]);
  assert.equal(failed.artifacts.filter((artifact) => artifact.type === "Diff").length, 1);
  assert.equal((await post(`/api/sessions/${session.id}/narrate`, {})).status, 202);
  const retried = await waitFor(async () => {
    const snapshot: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return snapshot.epochs.at(-1)?.status === "succeeded" ? snapshot : undefined;
  });
  assert.deepEqual(retried.epochs.map(({ n, phase, status }) => ({ n, phase, status })), [{ n: 1, phase: "review", status: "succeeded" }]);
  assert.equal(retried.artifacts.filter((artifact) => artifact.type === "Diff").length, 1);
});

test("narrate without a Diff still rejects a session without a WorkflowStart", async () => {
  const session = await newSession();
  const response = await post(`/api/sessions/${session.id}/narrate`, {});
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Missing string field: base" });
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
  const drafts = await post(`/api/sessions/${session.id}/review-submit`, { revision: 1, action: "comment", body: "" });
  assert.equal(drafts.status, 400);
  assert.deepEqual(await drafts.json(), { error: "Nothing to submit" });
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
      && current.tasks.every((task) => task.status !== "running" && task.status !== "pending")
      ? current : undefined;
  });
  assert.equal(state.artifacts.filter((artifact) => artifact.type === "Diff").length, 2);
  const updatedDiff = state.artifacts.filter((artifact) => artifact.type === "Diff").at(-1)!;
  const interdiffArtifact = state.artifacts.find((artifact) => artifact.type === "Interdiff")!;
  assert.equal((interdiffArtifact.data as { toDiff: string }).toDiff, updatedDiff.id);
  assert.deepEqual(state.tasks.slice(-7).map((task) => [task.kind, task.status]), [
    ["importDiff", "succeeded"], ["interdiff", "succeeded"], ["introducedSymbols", "succeeded"],
    ["narrate", "succeeded"], ["carryFindings", "succeeded"], ["resolveSpecRefs", "succeeded"], ["review", "succeeded"],
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
  const gatedRt = new Runtime({ store: new Store(":memory:"), plugins: [corePlugin, ...plugins], llm: gatedLlm, git: makeGit, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
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
  const gatedRt = new Runtime({ store: new Store(":memory:"), plugins: [corePlugin, ...plugins], llm: gatedLlm, git: makeGit, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
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
  requestPhase = true;
  try {
    const response = await post(`/api/sessions/${s.id}/turns`, { anchor: `${narrative.id}#c1`, text: "run", llm: { backend: "claude", model: "sonnet", effort: "medium" } });
    assert.equal(response.status, 202);
    await waitFor(async () => rt.store.listEpochs(s.id).find((epoch) => epoch.phase === "p" && epoch.status === "succeeded"));
    assert.deepEqual(rt.store.listEpochs(s.id).filter((epoch) => epoch.phase === "p").map((epoch) => epoch.input), [{ x: 1 }]);
  } finally { requestPhase = false; }
});

test("turn request notifies when its requested phase cannot start during another epoch", async () => {
  const s = await newSession();
  await post(`/api/sessions/${s.id}/narrate`, { base: "HEAD~1", head: "HEAD" });
  const narrative = await waitFor(async () => rt.store.listArtifacts(s.id, "PatchNarrative")[0]);
  await waitFor(async () => rt.store.listEpochs(s.id).every((epoch) => epoch.status !== "running") || undefined);
  const running = rt.runPhase(s.id, "blocking", null);
  await waitFor(async () => unblockPhase ? true : undefined);
  requestPhase = true;
  try {
    const response = await post(`/api/sessions/${s.id}/turns`, { anchor: `${narrative.id}#c1`, text: "run", llm: { backend: "claude", model: "sonnet", effort: "medium" } });
    assert.equal(response.status, 202);
    await waitFor(async () => rt.store.listEvents(s.id).find((event) => event.type === "notify" && (event.payload as { title?: string }).title === "Could not start p"));
    assert.equal(rt.store.listEpochs(s.id).some((epoch) => epoch.phase === "p"), false);
  } finally { requestPhase = false; unblockPhase?.(); await running; unblockPhase = undefined; }
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

test("review-submit rejects a revision without a Differential Revision trailer", async () => {
  const session = await newSession();
  rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: {
    baseSha: "base", headSha: "head", commits: [{ sha: "head", subject: "change", body: "No trailer" }], files: [],
  }, provenance: { taskId: "test" } });
  const response = await post(`/api/sessions/${session.id}/review-submit`, { revision: 1, action: "comment", body: "" });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /No commit of the stack is D1/);
});

test("review-submit posts inline drafts then submits the review action", async () => {
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
  const userComment = rt.store.putArtifact({ sessionId: session.id, type: "UserComment", status: "verified", data: { diffId: diff.id, lines: { path: "a.txt", side: "new", start: 1, end: 1 }, body: "Check this too.", replaces: null, deleted: false }, provenance: { taskId: "user" } });

  const remote = await makeGit(testRepo.dir).diff(baseSha, headSha);
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const inlineLines: number[] = [];
  let mode: "normal" | "drift" | "http-error" = "normal";
  const conduitServer = createNetServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const form = new URLSearchParams(body);
    const method = req.url!.slice("/api/".length);
    const params = JSON.parse(form.get("params")!);
    calls.push({ method, params });
    if (method === "differential.createinline") inlineLines.push(params.lineNumber);
    if (mode === "http-error") {
      res.writeHead(500).end("failure");
      return;
    }
    const result = method === "differential.revision.search" ? { data: [{ phid: "PHID-DREV-1" }] }
      : method === "differential.diff.search" ? { data: [{ id: 7 }] }
        : method === "differential.getrawdiff" ? mode === "drift" ? remote.replace("+after", "+different") : remote
      : method === "differential.createinline" ? { id: calls.filter((call) => call.method === method).length + 8 }
        : method === "differential.createcomment" ? { id: 10 }
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
    const response = await post(`/api/sessions/${session.id}/review-submit`, { revision: 1, action: "request-changes", body: "Please revise." });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { inlines: 2, skipped: [], revision: "D1" });
    assert.deepEqual(calls.map((call) => call.method), ["differential.revision.search", "differential.diff.search", "differential.getrawdiff", "differential.createinline", "differential.createinline", "differential.createcomment"]);
    const { __conduit__: _token, ...submitted } = calls.at(-1)!.params;
    assert.deepEqual(submitted, { revision_id: 1, message: "Please revise.", action: "reject", attach_inlines: true });
    assert.deepEqual(inlineLines, [8, 1]);
    const posted = rt.store.listArtifacts(session.id, "PostedComment");
    assert.equal(posted.length, 2);
    assert.deepEqual(posted[0]!.data, { comment: comment.id, source: finding.id, revision: 1, diff: 7, inlineId: 9 });
    assert.deepEqual(posted[0]!.provenance, { taskId: "runtime" });
    assert.deepEqual(posted[1]!.data, { comment: userComment.id, source: userComment.id, revision: 1, diff: 7, inlineId: 10 });
    assert.deepEqual(rt.store.listArtifacts(session.id, "ReviewSubmission").at(-1)!.data, { revision: 1, action: "request-changes", body: "Please revise.", inlines: 2 });

    mode = "normal";
    const repeat = await post(`/api/sessions/${session.id}/review-submit`, { revision: 1, action: "accept", body: "" });
    assert.equal(repeat.status, 200);
    assert.deepEqual(await repeat.json(), { inlines: 0, skipped: [], revision: "D1" });
    assert.equal(calls.filter((call) => call.method === "differential.createinline").length, 2);

    mode = "drift";
    const beforeDriftWrites = calls.length;
    const drifted = await post(`/api/sessions/${session.id}/review-submit`, { revision: 1, action: "accept", body: "" });
    assert.equal(drifted.status, 409);
    assert.match((await drifted.json()).error, /a.txt/);
    assert.equal(calls.length, beforeDriftWrites + 3);

    mode = "http-error";
    const upstreamFailure = await post(`/api/sessions/${session.id}/review-submit`, { revision: 1, action: "comment", body: "Second submit." });
    assert.equal(upstreamFailure.status, 502);
    const beforeEmpty = calls.length;
    const empty = await post(`/api/sessions/${session.id}/review-submit`, { revision: 1, action: "comment", body: "" });
    assert.equal(empty.status, 400);
    assert.equal(calls.length, beforeEmpty);
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
  const watchRuntime = new Runtime({ store: new Store(":memory:"), plugins: [corePlugin, ...plugins, watchPlugin], llm, git: makeGit, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
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

test("mapping a spec's steps needs a narrative and a spec with steps supporting its changes", async () => {
  const session = await newSession();
  const path = (specId: string) => `/api/sessions/${session.id}/specs/${specId}/map`;
  assert.equal((await post(path("none"), {})).status, 409);
  const put = (type: string, data: unknown) => rt.store.putArtifact({ sessionId: session.id, type, status: "verified", data, provenance: { taskId: "x" } });
  const diff = put("Diff", { baseSha: "B", headSha: "H", commits: [], files: [{ path: "a.txt", status: "modified", binary: false, hunks: [{ id: "f0h0", header: "", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "add", text: "x" }] }] }] });
  const narrative = put("PatchNarrative", { diffId: diff.id, summary: "s", changes: [{ id: "c1", title: "t", explanation: "e", rationale: "r", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] }] });
  const resolved = { spec: "HTML", anchor: "a", title: "a", type: "algorithm", url: "https://h/#a", content: "1. Do it." };
  const prose = put("SpecReference", { url: resolved.url, resolved: { ...resolved, content: "No steps." }, origin: "code", geckoRefs: [] });
  const steps = put("SpecReference", { url: resolved.url, resolved, origin: "code", geckoRefs: [] });
  for (const spec of [prose, steps]) rt.store.putLink({ sessionId: session.id, from: spec.id, to: `${narrative.id}#c1`, kind: "supports" });
  assert.equal((await post(path(prose.id), {})).status, 409);
  const started = await post(path(steps.id), {});
  assert.equal(started.status, 202);
  const { taskId } = await started.json() as { taskId: string };
  assert.deepEqual(rt.store.getTask(taskId).input, { narrativeId: narrative.id, specId: steps.id });
});

test("spec ref lookup reuses existing sections and caches newly linked sections", async () => {
  const routeStore = new Store(":memory:");
  const routeWebspec: WebspecCapability = {
    effect: "read-only", async analyze() { return []; },
    async query() { throw new Error("not used"); }, async search() { throw new Error("not used"); }, async refs() { throw new Error("not used"); }, async idl() { throw new Error("not used"); }, async effectPaths() { throw new Error("not used"); },
    async resolve(ref) { const anchor = ref.split("#").at(-1)!; return { found: true, spec: { spec: "HTML", anchor, title: anchor, type: "section", url: `https://html.spec.whatwg.org/#${anchor}`, content: "Section." } }; },
  };
  const routeRuntime = new Runtime({ store: routeStore, plugins: [{ id: "route-test", tasks: [lookupSpecRef] }], llm, git: () => ({}) as never, webspec: routeWebspec, searchfox: {} as SearchfoxCapability });
  const session = routeStore.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const resolved = { spec: "HTML", anchor: "existing", title: "Existing", type: "section", url: "https://html.spec.whatwg.org/#existing", content: "Existing." };
  const existing = routeStore.putArtifact({ sessionId: session.id, type: "SpecReference", status: "verified", data: { url: resolved.url, resolved, origin: "code", geckoRefs: [] }, provenance: { taskId: "x" } });
  const route = reviewRoutes(routeRuntime).find(([method, pattern]) => method === "POST" && pattern.test(`/api/sessions/${session.id}/spec-refs`))![2];
  const call = async (ref: string) => {
    let status = 0, body = "";
    const req = Readable.from([JSON.stringify({ ref })]);
    const res = { writeHead(code: number) { status = code; return this; }, end(value?: string) { body = value ?? ""; return this; } };
    await route({ req: req as never, res: res as never, params: [session.id], url: new URL(`http://local/api/sessions/${session.id}/spec-refs`) });
    return { status, body: body ? JSON.parse(body) as { specId: string } : null };
  };
  const reused = await call("HTML#existing");
  assert.equal(reused.status, 200);
  assert.deepEqual(reused.body, { specId: existing.id });
  assert.equal(routeStore.listTasks(session.id).some((task) => task.kind === "lookupSpecRef"), false);
  const created = await call("HTML#setup");
  assert.equal(created.status, 201);
  const { specId } = created.body!;
  const again = await call("HTML#setup");
  assert.equal(again.status, 200);
  assert.deepEqual(again.body, { specId });
  assert.equal(routeStore.listArtifacts(session.id, "SpecReference").length, 2);
  assert.equal(routeStore.listTasks(session.id).filter((task) => task.kind === "lookupSpecRef").length, 1);
});
