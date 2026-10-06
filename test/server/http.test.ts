import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer as createNetServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type WebspecCapability, type SearchfoxCapability } from "../../src/runtime/tasks.ts";
import { makeGit } from "../../src/runtime/git.ts";
import { tasks } from "../../src/tasks/index.ts";
import { createHttpServer } from "../../src/server/http.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { DiffData, Session, SessionState } from "../../src/shared/types.ts";
import { makeRepo } from "../helpers/git-fixture.ts";

const NARRATIVE = { summary: "S", changes: [{ id: "c1", title: "t", explanation: "e", rationale: "r", hunkIds: ["f0h0", "f1h0"], dependsOn: [], specUrls: [] }] };
const CHAT_REPLY = { answer: "hi", questions: [], revisions: [], requestMcpServers: [] };
const replyFor = (prompt: { schema?: object }) => prompt.schema && "properties" in prompt.schema && "answer" in (prompt.schema as { properties: object }).properties;
const reviewFor = (prompt: { schema?: object; system?: string }) => prompt.system?.includes("You review a code patch") || !!prompt.schema && "properties" in prompt.schema && "findings" in (prompt.schema as { properties: object }).properties;
const commentFor = (prompt: { schema?: object }) => !!prompt.schema && "properties" in prompt.schema && "body" in (prompt.schema as { properties: object }).properties;
const llm: LlmService = {
  defaultSelection: { backend: "claude", model: "sonnet", effort: "medium" },
  async run(selection, prompt) { const chat = replyFor(prompt); const review = reviewFor(prompt); const comment = commentFor(prompt); return { text: "hi", json: prompt.schema ? chat ? CHAT_REPLY : review ? { findings: [] } : comment ? { body: "Generated review comment." } : NARRATIVE : undefined, providerSessionId: "p", selection: selection ?? this.defaultSelection }; },
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
      return { text: "hi", json: prompt.schema ? chat ? CHAT_REPLY : review ? { findings: [] } : NARRATIVE : undefined, providerSessionId: "p", selection: selection ?? this.defaultSelection };
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
  assert.match((await response.json()).error, /no Differential Revision trailer/);
});

test("post-drafts submits verified comments as Conduit drafts", async () => {
  const testRepo = makeRepo();
  const baseSha = testRepo.commit({ "a.txt": "before\n" }, "base");
  const headSha = testRepo.commit({ "a.txt": "after\n" }, "change\n\nDifferential Revision: https://phab.example.com/D1");
  const session = rt.store.createSession(testRepo.dir, "draft posting");
  const diffData: DiffData = { baseSha, headSha, commits: [{ sha: headSha, subject: "change", body: "Differential Revision: https://phab.example.com/D1" }], files: [] };
  rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: diffData, provenance: { taskId: "test" } });
  const finding = rt.store.putArtifact({ sessionId: session.id, type: "ReviewFinding", status: "proposed", data: {
    anchor: "diff#f0h0", lines: { path: "a.txt", side: "new", start: 1, end: 1 }, category: "correctness", severity: "high", title: "Finding", body: "Details",
  }, provenance: { taskId: "test" } });
  const decision = rt.store.putArtifact({ sessionId: session.id, type: "FindingDecision", status: "verified", data: { finding: finding.id, decision: "accepted" }, provenance: { taskId: "user" } });
  rt.store.putLink({ sessionId: session.id, from: decision.id, to: finding.id, kind: "about" });
  const comment = rt.store.putArtifact({ sessionId: session.id, type: "ReviewComment", status: "verified", data: { finding: finding.id, body: "Please update this." }, provenance: { taskId: "user" } });
  rt.store.putLink({ sessionId: session.id, from: comment.id, to: finding.id, kind: "about" });

  const remote = await makeGit(testRepo.dir).diff(baseSha, headSha);
  const calls: string[] = [];
  let mode: "normal" | "drift" | "http-error" = "normal";
  const conduitServer = createNetServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const form = new URLSearchParams(body);
    const method = req.url!.slice("/api/".length);
    calls.push(method);
    JSON.parse(form.get("params")!);
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
    const posted = rt.store.listArtifacts(session.id, "PostedComment");
    assert.equal(posted.length, 1);
    assert.deepEqual(posted[0]!.data, { comment: comment.id, revision: 1, diff: 7, inlineId: 9 });
    assert.deepEqual(posted[0]!.provenance, { taskId: "runtime" });

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
