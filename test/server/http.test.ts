import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/runtime/store.ts";
import { Runtime } from "../../src/runtime/tasks.ts";
import { makeGit } from "../../src/runtime/git.ts";
import { tasks } from "../../src/tasks/index.ts";
import { createHttpServer } from "../../src/server/http.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { Session, SessionState } from "../../src/shared/types.ts";
import { makeRepo } from "../helpers/git-fixture.ts";

const NARRATIVE = { summary: "S", changes: [{ id: "c1", title: "t", explanation: "e", rationale: "r", hunkIds: ["f0h0", "f1h0"], dependsOn: [], specUrls: [] }] };
const llm: LlmService = {
  defaultSelection: { backend: "claude", model: "sonnet", effort: "medium" },
  async run(selection) { return { text: "", json: NARRATIVE, providerSessionId: "p", selection: selection ?? this.defaultSelection }; },
  async listModels() { return { claude: { models: [{ id: "sonnet", efforts: ["low"] }] }, codex: { error: "no cache" } }; },
};
const repo = makeRepo();
repo.commit({ "a.txt": "1\n2\n" }, "base");
repo.commit({ "a.txt": "1\nTWO\n", "c.txt": "c\n" }, "change");
const staticDir = mkdtempSync(join(tmpdir(), "static-"));
writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>app</title>");
const rt = new Runtime({ store: new Store(":memory:"), tasks, llm, git: makeGit });
const server = createHttpServer(rt, { staticDir });
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => server.close());

const post = (path: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });

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
    return snapshot.artifacts.some((artifact) => artifact.type === "PatchNarrative") ? snapshot : undefined;
  });
  assert.deepEqual(state.tasks.map((task) => [task.kind, task.status]), [["importDiff", "succeeded"], ["narrate", "succeeded"]]);
  assert.ok(state.lastEventId > 0);
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
    return state.tasks.length === 2 && state.tasks.every((task) => task.status === "succeeded") ? true : undefined;
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
