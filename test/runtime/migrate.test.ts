import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../../src/runtime/migrate.ts";
import { Store, STORE_MIGRATIONS } from "../../src/runtime/store.ts";
import { KnowledgeStore, KNOWLEDGE_MIGRATIONS } from "../../src/runtime/knowledge.ts";

const tmp = (name: string) => join(mkdtempSync(join(tmpdir(), "migrate-")), name);
const withDb = <T>(path: string, f: (db: DatabaseSync) => T): T => {
  const db = new DatabaseSync(path);
  try { return f(db); } finally { db.close(); }
};
const version = (path: string) => withDb(path, (db) => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
const setVersion = (path: string, v: number) => withDb(path, (db) => db.exec(`PRAGMA user_version = ${v}`));
const count = (path: string, table: string) => withDb(path, (db) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);

const extra = (db: DatabaseSync) => db.exec("CREATE TABLE extra (x TEXT)");

test("a fresh session database ends at the latest version and works", () => {
  const path = tmp("runtime.sqlite");
  const store = new Store(path);
  const s = store.createSession({ worktree: "/w", repoDir: "/r", title: "t" });
  assert.deepEqual(store.listSessions().map((x) => x.id), [s.id]);
  store.close();
  assert.equal(version(path), STORE_MIGRATIONS.length);
});

test("an up-to-date pre-versioning session database is adopted without a backup", () => {
  const path = tmp("runtime.sqlite");
  const first = new Store(path);
  const s = first.createSession({ worktree: "/w", repoDir: "/r", title: "t" });
  first.close();
  setVersion(path, 0);
  const store = new Store(path);
  assert.deepEqual(store.listSessions().map((x) => x.id), [s.id]);
  store.close();
  assert.equal(version(path), STORE_MIGRATIONS.length);
  assert.deepEqual(readdirSync(join(path, "..")).filter((f) => f.endsWith(".bak")), []);
});

test("a pre-versioning session database with an outdated layout is refused", () => {
  const path = tmp("runtime.sqlite");
  withDb(path, (db) => db.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT)"));
  assert.throws(() => new Store(path), /created by an older development version; delete it and restart/);
  assert.equal(version(path), 0);
});

test("a database from a newer spatial is refused and left untouched", () => {
  const path = tmp("runtime.sqlite");
  new Store(path).close();
  setVersion(path, STORE_MIGRATIONS.length + 1);
  const before = readFileSync(path);
  assert.throws(() => new Store(path), /written by a newer spatial \(schema version \d+, this version knows \d+\); update spatial/);
  assert.deepEqual(readFileSync(path), before);
});

test("a pending migration backs the database up first, then runs and bumps the version", () => {
  const path = tmp("runtime.sqlite");
  const store = new Store(path);
  store.createSession({ worktree: "/w", repoDir: "/r", title: "t" });
  store.close();
  const old = STORE_MIGRATIONS.length;
  withDb(path, (db) => migrate(db, path, [...STORE_MIGRATIONS, extra]));
  assert.equal(version(path), old + 1);
  assert.equal(count(path, "extra"), 0);
  const backup = `${path}.v${old}.bak`;
  assert.equal(version(backup), old);
  assert.equal(count(backup, "sessions"), 1);
  assert.throws(() => count(backup, "extra"));
});

test("an existing backup is never overwritten", () => {
  const path = tmp("runtime.sqlite");
  new Store(path).close();
  const old = STORE_MIGRATIONS.length;
  const first = `${path}.v${old}.bak`;
  withDb(first, (db) => db.exec("CREATE TABLE marker (x)"));
  const before = readFileSync(first);
  withDb(path, (db) => migrate(db, path, [...STORE_MIGRATIONS, extra]));
  assert.deepEqual(readFileSync(first), before);
  assert.equal(readdirSync(join(path, "..")).filter((f) => f.includes(".bak")).length, 2);
  assert.equal(version(path), old + 1);
});

test("a failing migration leaves the version and data unchanged", () => {
  const path = tmp("runtime.sqlite");
  const store = new Store(path);
  store.createSession({ worktree: "/w", repoDir: "/r", title: "t" });
  store.close();
  const old = STORE_MIGRATIONS.length;
  const failing = (db: DatabaseSync) => {
    db.exec("CREATE TABLE half (x)");
    db.exec("DELETE FROM sessions");
    throw new Error("boom");
  };
  assert.throws(() => withDb(path, (db) => migrate(db, path, [...STORE_MIGRATIONS, failing])), /boom/);
  assert.equal(version(path), old);
  assert.equal(count(path, "sessions"), 1);
  assert.throws(() => count(path, "half"));
});

test("an in-memory database migrates without a backup", () => {
  const db = new DatabaseSync(":memory:");
  migrate(db, ":memory:", [...STORE_MIGRATIONS]);
  migrate(db, ":memory:", [...STORE_MIGRATIONS, extra]);
  assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, STORE_MIGRATIONS.length + 1);
  db.close();
});

test("a read-only store refuses a database whose version differs", () => {
  const path = tmp("runtime.sqlite");
  new Store(path).close();
  new Store(path, { readOnly: true }).close();
  setVersion(path, STORE_MIGRATIONS.length + 1);
  assert.throws(() => new Store(path, { readOnly: true }), /schema version/);
  setVersion(path, 0);
  assert.throws(() => new Store(path, { readOnly: true }), /schema version/);
});

test("a pre-versioning knowledge database is adopted with its entries", () => {
  const path = tmp("knowledge.db");
  const first = new KnowledgeStore(path);
  first.put("global", "ns", "k", { a: 1 }, { by: "user", sessionId: "S" });
  first.close();
  setVersion(path, 0);
  const store = new KnowledgeStore(path);
  assert.deepEqual(store.get("global", "ns", "k").state, "current");
  store.close();
  assert.equal(version(path), KNOWLEDGE_MIGRATIONS.length);
  assert.equal(count(path, "entries"), 1);
  assert.equal(existsSync(`${path}.v0.bak`), false);
});

test("a knowledge database from a newer spatial is refused and left untouched", () => {
  const path = tmp("knowledge.db");
  new KnowledgeStore(path).close();
  setVersion(path, KNOWLEDGE_MIGRATIONS.length + 1);
  const before = readFileSync(path);
  assert.throws(() => new KnowledgeStore(path), /newer spatial/);
  assert.deepEqual(readFileSync(path), before);
});

test("a read-only knowledge store refuses a database whose version differs", () => {
  const path = tmp("knowledge.db");
  new KnowledgeStore(path).close();
  setVersion(path, 0);
  assert.throws(() => new KnowledgeStore(path, { readOnly: true }), /schema version/);
});
