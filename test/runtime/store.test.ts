import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function fresh() {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  return { store, session };
}

test("sessions round-trip and list newest last", () => {
  const { store, session } = fresh();
  const s2 = store.createSession({ worktree: "/repo2", repoDir: "/repo2/.git", title: "t2" });
  assert.deepEqual(store.getSession(session.id), session);
  assert.deepEqual(store.listSessions().map((s) => s.id), [session.id, s2.id]);
});

test("sessions store a nullable workflow and set the chosen workflow and title", () => {
  const { store, session } = fresh();
  assert.equal(session.workflow, null);
  const updated = store.setSessionStart(session.id, "chat", "New title");
  assert.equal(updated.workflow, "chat");
  assert.equal(updated.title, "New title");
  assert.deepEqual(store.getSession(session.id), updated);
});

test("getSession throws for unknown id", () => {
  const { store } = fresh();
  assert.throws(() => store.getSession("nope"), /Unknown session: nope/);
});

test("artifacts store JSON data and provenance", () => {
  const { store, session } = fresh();
  const a = store.putArtifact({
    sessionId: session.id,
    type: "Diff",
    status: "verified",
    data: { x: [1, 2] },
    provenance: { taskId: "t1" },
  });
  assert.deepEqual(store.getArtifact(a.id), a);
  assert.deepEqual(store.listArtifacts(session.id, "Diff").map((x) => x.id), [a.id]);
  assert.deepEqual(store.listArtifacts(session.id, "Other"), []);
  assert.throws(() => store.getArtifact("nope"), /Unknown artifact: nope/);
});

test("links and events", () => {
  const { store, session } = fresh();
  const l = store.putLink({ sessionId: session.id, from: "a", to: "b#f0h0", kind: "about" });
  assert.deepEqual(store.listLinks(session.id), [l]);
  const e1 = store.appendEvent({ sessionId: session.id, actor: "runtime", type: "x", payload: { n: 1 } });
  const e2 = store.appendEvent({ sessionId: session.id, actor: "user", type: "y", payload: null });
  assert.ok(e2.id > e1.id);
  assert.deepEqual(store.listEvents(session.id).map((e) => e.type), ["x", "y"]);
  assert.deepEqual(store.listEvents(session.id, e1.id).map((e) => e.type), ["y"]);
});

test("tasks are created pending and updated", () => {
  const { store, session } = fresh();
  const t = store.createTask({ sessionId: session.id, kind: "k", input: { a: 1 } });
  assert.equal(t.status, "pending");
  assert.equal(t.output, null);
  const t2 = store.updateTask(t.id, { status: "failed", error: "boom" });
  assert.equal(t2.status, "failed");
  assert.equal(t2.error, "boom");
  assert.deepEqual(store.getTask(t.id), t2);
  const t3 = store.updateTask(t.id, { status: "succeeded", output: { ok: true } });
  assert.deepEqual(t3.output, { ok: true });
  assert.equal(t3.error, "boom");
});

test("epochs are numbered and stamped on tasks and artifacts", () => {
  const { store, session } = fresh();
  const before = store.putArtifact({ sessionId: session.id, type: "Before", status: "verified", data: {}, provenance: { taskId: "t" } });
  const taskBefore = store.createTask({ sessionId: session.id, kind: "k", input: null });
  assert.equal(before.epoch, null);
  assert.equal(taskBefore.epoch, null);

  const first = store.createEpoch(session.id, "review", { base: "a" });
  assert.equal(first.n, 1);
  assert.equal(first.status, "running");
  assert.deepEqual(first.input, { base: "a" });
  const after = store.putArtifact({ sessionId: session.id, type: "After", status: "verified", data: {}, provenance: { taskId: "t" } });
  const taskAfter = store.createTask({ sessionId: session.id, kind: "k", input: null });
  assert.equal(after.epoch, 1);
  assert.equal(taskAfter.epoch, 1);

  const ended = store.updateEpoch(session.id, 1, { status: "failed", error: "boom" });
  assert.equal(ended.error, "boom");
  assert.ok(ended.endedAt);
  const second = store.createEpoch(session.id, "chat", null);
  assert.equal(second.n, 2);
  assert.equal(store.listEpochs(session.id).length, 2);
  const running = store.updateEpoch(session.id, 2, { status: "running" });
  assert.equal(running.endedAt, null);
});

test("data persists across Store instances on a file", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const path = join(mkdtempSync(join(tmpdir(), "store-")), "db.sqlite");
  const s1 = new Store(path);
  const session = s1.createSession({ worktree: "/r", repoDir: "/r/.git", title: "t" });
  s1.close();
  const s2 = new Store(path);
  assert.equal(s2.getSession(session.id).title, "t");
  s2.close();
});

test("old session schema is rejected", () => {
  const dir = mkdtempSync(join(tmpdir(), "store-old-schema-"));
  const path = join(dir, "db.sqlite");
  new DatabaseSync(path).exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, repo TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL)");
  assert.throws(() => new Store(path), /outdated schema/);
});

test("old task and artifact schemas are rejected", () => {
  const dir = mkdtempSync(join(tmpdir(), "store-old-epochs-schema-"));
  const path = join(dir, "db.sqlite");
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, worktree TEXT NOT NULL, repo_dir TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, workflow TEXT);
    CREATE TABLE tasks (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, input TEXT NOT NULL, output TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE artifacts (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, provenance TEXT NOT NULL, created_at TEXT NOT NULL);`);
  db.close();
  assert.throws(() => new Store(path), /outdated schema/);
});

test("listTasks and lastEventId", () => {
  const { store, session } = fresh();
  assert.equal(store.lastEventId(session.id), 0);
  const t1 = store.createTask({ sessionId: session.id, kind: "a", input: null });
  const t2 = store.createTask({ sessionId: session.id, kind: "b", input: null });
  assert.deepEqual(store.listTasks(session.id).map((t) => t.id), [t1.id, t2.id]);
  const e = store.appendEvent({ sessionId: session.id, actor: "runtime", type: "x", payload: null });
  assert.equal(store.lastEventId(session.id), e.id);
});

test("failInterrupted fails running epochs and tasks left by a previous server process", () => {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/w", repoDir: "/r", title: "t" });
  store.createEpoch(session.id, "review", {});
  const task = store.createTask({ sessionId: session.id, kind: "narrate", input: {} });
  store.updateTask(task.id, { status: "running" });
  const done = store.createTask({ sessionId: session.id, kind: "importDiff", input: {} });
  store.updateTask(done.id, { status: "succeeded", output: {} });
  store.failInterrupted("Interrupted by a server restart");
  const [epoch] = store.listEpochs(session.id);
  assert.equal(epoch!.status, "failed");
  assert.equal(epoch!.error, "Interrupted by a server restart");
  assert.ok(epoch!.endedAt);
  assert.deepEqual(store.listTasks(session.id).map((t) => [t.kind, t.status, t.error]), [["narrate", "failed", "Interrupted by a server restart"], ["importDiff", "succeeded", null]]);
});
