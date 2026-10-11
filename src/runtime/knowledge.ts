import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { Id } from "../shared/types.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL, namespace TEXT NOT NULL, key TEXT NOT NULL,
  value TEXT NOT NULL, provenance TEXT NOT NULL, created_at TEXT NOT NULL, superseded_by TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS entries_current ON entries(scope, namespace, key) WHERE superseded_by IS NULL;
`;

/** Who wrote a knowledge entry, and in which session. */
export type KnowledgeProvenance = { by: "plugin" | "user"; sessionId: Id } | { by: "llm"; taskId: Id; sessionId: Id };
/** One stored version of a key; `value` is opaque JSON, null for a tombstone. */
export interface KnowledgeEntry { id: Id; scope: string; namespace: string; key: string; value: unknown; provenance: KnowledgeProvenance; createdAt: string }
/** The current version of a key: none, a tombstone (`deleted`), or a value. */
export type KnowledgeRead = { state: "absent" } | { state: "deleted"; entry: KnowledgeEntry } | { state: "current"; entry: KnowledgeEntry };
/**
 * Plugin data that outlives sessions. `scope` is `"global"` or a repository identity (`RepoInfo.repoDir`); `namespace` is the plugin id.
 * Nothing is deleted: `put` supersedes the current entry of its key, and a `null` value is a tombstone.
 */
export interface Knowledge {
  get(scope: string, namespace: string, key: string): KnowledgeRead;
  /** Current entries (tombstones included) whose key starts with `keyPrefix`, ordered by key. */
  list(scope: string, namespace: string, keyPrefix: string): KnowledgeEntry[];
  put(scope: string, namespace: string, key: string, value: unknown, provenance: KnowledgeProvenance): KnowledgeEntry;
}

type Row = Record<string, unknown>;
const toEntry = (r: Row): KnowledgeEntry => ({ id: r.id as string, scope: r.scope as string, namespace: r.namespace as string, key: r.key as string, value: JSON.parse(r.value as string), provenance: JSON.parse(r.provenance as string) as KnowledgeProvenance, createdAt: r.created_at as string });

/** `Knowledge` in its own SQLite file, apart from the disposable session database. */
export class KnowledgeStore implements Knowledge {
  #db: DatabaseSync;

  constructor(path: string) {
    this.#db = new DatabaseSync(path);
    if (path !== ":memory:") this.#db.exec("PRAGMA journal_mode = WAL;");
    this.#db.exec(SCHEMA);
  }

  close(): void {
    this.#db.close();
  }

  get(scope: string, namespace: string, key: string): KnowledgeRead {
    const r = this.#db.prepare("SELECT * FROM entries WHERE scope = ? AND namespace = ? AND key = ? AND superseded_by IS NULL").get(scope, namespace, key) as Row | undefined;
    if (!r) return { state: "absent" };
    const entry = toEntry(r);
    return entry.value === null ? { state: "deleted", entry } : { state: "current", entry };
  }

  list(scope: string, namespace: string, keyPrefix: string): KnowledgeEntry[] {
    return (this.#db.prepare("SELECT * FROM entries WHERE scope = ? AND namespace = ? AND substr(key, 1, ?) = ? AND superseded_by IS NULL ORDER BY key").all(scope, namespace, keyPrefix.length, keyPrefix) as Row[]).map(toEntry);
  }

  put(scope: string, namespace: string, key: string, value: unknown, provenance: KnowledgeProvenance): KnowledgeEntry {
    if (value === undefined) throw new Error("Knowledge value must not be undefined; null is a tombstone");
    const entry: KnowledgeEntry = { id: randomUUID(), scope, namespace, key, value, provenance, createdAt: new Date().toISOString() };
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare("UPDATE entries SET superseded_by = ? WHERE scope = ? AND namespace = ? AND key = ? AND superseded_by IS NULL").run(entry.id, scope, namespace, key);
      this.#db.prepare("INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, NULL)").run(entry.id, scope, namespace, key, JSON.stringify(value), JSON.stringify(provenance), entry.createdAt);
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
    return entry;
  }
}
