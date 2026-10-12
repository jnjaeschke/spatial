import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KnowledgeStore } from "../../src/runtime/knowledge.ts";
import { createRuntime } from "../../src/runtime/create.ts";

const by = { by: "plugin" as const, sessionId: "S" };

test("put then get returns the current value with provenance", () => {
  const store = new KnowledgeStore(":memory:");
  const entry = store.put("global", "spec", "HTML#navigate@1", { clauses: [] }, { by: "llm", taskId: "T", sessionId: "S" });
  assert.deepEqual(store.get("global", "spec", "HTML#navigate@1"), { state: "current", entry });
  assert.deepEqual(entry.provenance, { by: "llm", taskId: "T", sessionId: "S" });
});

test("a read-only store reads current entries and cannot write", () => {
  const path = join(mkdtempSync(join(tmpdir(), "knowledge-")), "knowledge.db");
  const writer = new KnowledgeStore(path);
  writer.put("global", "spec", "k", 1, by);
  const reader = new KnowledgeStore(path, { readOnly: true });
  assert.equal(reader.get("global", "spec", "k").state, "current");
  assert.throws(() => reader.put("global", "spec", "k", 2, by), /readonly/i);
  reader.close();
  writer.close();
});

test("a second put supersedes the first and keeps it in the file", () => {
  const path = join(mkdtempSync(join(tmpdir(), "knowledge-")), "knowledge.db");
  const store = new KnowledgeStore(path);
  const first = store.put("global", "spec", "k", 1, by);
  const second = store.put("global", "spec", "k", 2, by);
  assert.equal((store.get("global", "spec", "k") as { entry: { value: unknown } }).entry.value, 2);
  store.close();
  const db = new DatabaseSync(path, { readOnly: true });
  assert.deepEqual(db.prepare("SELECT id, superseded_by FROM entries ORDER BY rowid").all().map((row) => ({ ...row })), [{ id: first.id, superseded_by: second.id }, { id: second.id, superseded_by: null }]);
  db.close();
  assert.equal((new KnowledgeStore(path).get("global", "spec", "k") as { entry: { value: unknown } }).entry.value, 2);
});

test("a tombstone reads as deleted, a never-written key as absent", () => {
  const store = new KnowledgeStore(":memory:");
  store.put("global", "spec", "k", { a: 1 }, by);
  const tombstone = store.put("global", "spec", "k", null, { by: "user", sessionId: "S" });
  assert.deepEqual(store.get("global", "spec", "k"), { state: "deleted", entry: tombstone });
  assert.deepEqual(store.get("global", "spec", "other"), { state: "absent" });
  assert.throws(() => store.put("global", "spec", "k", undefined, by), /must not be undefined/);
});

test("list returns current entries by key prefix, tombstones included, literal prefix", () => {
  const store = new KnowledgeStore(":memory:");
  store.put("global", "spec", "a@1", 1, by);
  store.put("global", "spec", "a@1", 2, by);
  store.put("global", "spec", "a@2", null, by);
  store.put("global", "spec", "b@1", 3, by);
  store.put("global", "spec", "x_1", 4, by);
  store.put("global", "spec", "xa1", 5, by);
  assert.deepEqual(store.list("global", "spec", "a@").map((e) => [e.key, e.value]), [["a@1", 2], ["a@2", null]]);
  assert.deepEqual(store.list("global", "spec", "x_").map((e) => e.key), ["x_1"]);
  assert.equal(store.list("global", "spec", "").length, 5);
});

test("scopes and namespaces are isolated", () => {
  const store = new KnowledgeStore(":memory:");
  store.put("global", "spec", "k", "g", by);
  store.put("/repo/.git", "spec", "k", "r", by);
  store.put("global", "other", "k", "o", by);
  assert.equal((store.get("/repo/.git", "spec", "k") as { entry: { value: unknown } }).entry.value, "r");
  assert.equal((store.get("global", "spec", "k") as { entry: { value: unknown } }).entry.value, "g");
  assert.deepEqual(store.list("/repo/.git", "other", ""), []);
});

test("createRuntime keeps knowledge.db next to the session database", () => {
  const dir = mkdtempSync(join(tmpdir(), "rt-"));
  const rt = createRuntime({ dbPath: join(dir, "runtime.sqlite") });
  rt.knowledge.put("global", "spec", "k", 1, by);
  assert.ok(existsSync(join(dir, "knowledge.db")));
  assert.equal(createRuntime({ dbPath: ":memory:" }).knowledge.get("global", "spec", "k").state, "absent");
});

test("list matches a prefix by characters, not UTF-16 units", () => {
  const store = new KnowledgeStore(":memory:");
  store.put("global", "spec", "😀a", 1, by);
  store.put("global", "spec", "😀b", 2, by);
  store.put("global", "spec", "x", 3, by);
  assert.deepEqual(store.list("global", "spec", "😀").map((entry) => entry.key), ["😀a", "😀b"]);
});

test("values that would not survive JSON are rejected instead of becoming a tombstone", () => {
  const store = new KnowledgeStore(":memory:");
  store.put("global", "spec", "k", 1, by);
  for (const value of [NaN, Infinity, { a: [() => 1] }, Symbol("s"), 1n]) assert.throws(() => store.put("global", "spec", "k", value, by), /Knowledge value/);
  assert.equal((store.get("global", "spec", "k") as { entry: { value: unknown } }).entry.value, 1);
});

test("a put that fails inside its transaction leaves the previous version current", () => {
  const store = new KnowledgeStore(":memory:");
  store.put("global", "spec", "k", 1, by);
  assert.throws(() => store.put("global", "spec", "k", 2, { by: "plugin", sessionId: 1n as unknown as string }));
  assert.equal((store.get("global", "spec", "k") as { entry: { value: unknown } }).entry.value, 1);
  assert.equal(store.put("global", "spec", "k", 3, by).value, 3);
});
