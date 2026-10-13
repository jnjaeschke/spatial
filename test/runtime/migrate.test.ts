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

test("migration 2 gives a workflow start without a profile the one its params or its implement branch named", () => {
  const path = tmp("runtime.sqlite");
  withDb(path, (db) => {
    STORE_MIGRATIONS[0]!(db);
    db.exec("PRAGMA user_version = 1");
    const put = (id: string, session: string, type: string, data: object) => db.prepare("INSERT INTO artifacts VALUES (?, ?, ?, 'verified', ?, '{}', '', NULL)").run(id, session, type, JSON.stringify(data));
    for (const s of ["params", "branch", "neither", "has"]) db.prepare("INSERT INTO sessions VALUES (?, '/w', '/r', 't', '', 'implement')").run(s);
    put("a", "params", "WorkflowStart", { workflow: "implement", params: { request: "x", profile: "gecko" } });
    put("b", "branch", "WorkflowStart", { workflow: "implement", params: { request: "x", profile: null } });
    put("b-branch", "branch", "ImplementBranch", { branch: "x", baseSha: "s", baseRef: null, checkout: "new-branch", profile: "gecko" });
    put("c", "neither", "WorkflowStart", { workflow: "review", params: {} });
    put("d", "has", "WorkflowStart", { workflow: "implement", params: { profile: "gecko" }, profile: "plain-git" });
  });
  const store = new Store(path);
  const profile = (id: string) => (store.getArtifact<{ profile?: string }>(id).data).profile;
  assert.deepEqual(["a", "b", "c", "d"].map(profile), ["gecko", "gecko", undefined, "plain-git"]);
  store.close();
});

test("migration 3 gives each rebuilt Phabricator round the time of the next submit", () => {
  const path = tmp("runtime.sqlite");
  const entry = (diffId: number, dateCreated: number) => ({ revision: 1, diffId, base: "b", dateCreated, title: "t", latestDiffId: 30 });
  withDb(path, (db) => {
    STORE_MIGRATIONS[0]!(db);
    STORE_MIGRATIONS[1]!(db);
    db.exec("PRAGMA user_version = 2");
    db.prepare("INSERT INTO sessions VALUES ('s', '/w', '/r', 't', '', 'implement')").run();
    const epoch = (n: number, phase: string, input: object) => db.prepare("INSERT INTO epochs VALUES ('s', ?, ?, 'succeeded', ?, NULL, '', NULL)").run(n, phase, JSON.stringify(input));
    epoch(1, "adoptRange", { planId: "p", branch: "x", head: "h" });
    epoch(2, "round", { round: { kind: "phabricator", host: "H", stack: [entry(10, 100), entry(11, 104)] }, narrate: false });
    epoch(3, "round", { round: { kind: "phabricator", host: "H", stack: [entry(20, 200)] }, narrate: false });
    epoch(4, "round", { round: { kind: "local", base: "b", head: "h", host: "H", phab: [entry(30, 300)] }, narrate: true });
  });
  const store = new Store(path);
  assert.deepEqual(store.listEpochs("s").map((e) => (e.input as { until?: number }).until), [undefined, 200, 300, undefined]);
  store.close();
});
