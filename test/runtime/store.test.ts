import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";

function fresh() {
  const store = new Store(":memory:");
  const session = store.createSession("/repo", "t");
  return { store, session };
}

test("sessions round-trip and list newest last", () => {
  const { store, session } = fresh();
  const s2 = store.createSession("/repo2", "t2");
  assert.deepEqual(store.getSession(session.id), session);
  assert.deepEqual(store.listSessions().map((s) => s.id), [session.id, s2.id]);
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

test("data persists across Store instances on a file", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const path = join(mkdtempSync(join(tmpdir(), "store-")), "db.sqlite");
  const s1 = new Store(path);
  const session = s1.createSession("/r", "t");
  s1.close();
  const s2 = new Store(path);
  assert.equal(s2.getSession(session.id).title, "t");
  s2.close();
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
