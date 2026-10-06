import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  Actor, Artifact, ArtifactStatus, Id, Link, LinkKind, Provenance, Ref,
  RuntimeEvent, Session, TaskRecord, TaskStatus,
} from "../shared/types.ts";
import type { SearchDoc } from "./render-ref.ts";

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, worktree TEXT NOT NULL, repo_dir TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), kind TEXT NOT NULL,
  status TEXT NOT NULL, input TEXT NOT NULL, output TEXT, error TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), type TEXT NOT NULL,
  status TEXT NOT NULL, data TEXT NOT NULL, provenance TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  from_ref TEXT NOT NULL, to_ref TEXT NOT NULL, kind TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES sessions(id),
  actor TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, ts TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS artifacts_session ON artifacts(session_id, type);
CREATE INDEX IF NOT EXISTS links_session ON links(session_id);
CREATE INDEX IF NOT EXISTS events_session ON events(session_id, id);
CREATE INDEX IF NOT EXISTS tasks_session ON tasks(session_id);
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  session_id UNINDEXED, artifact_id UNINDEXED, ref UNINDEXED, kind UNINDEXED, body,
  tokenize = "unicode61 tokenchars '_'"
);
`;

type Row = Record<string, unknown>;
const SESSION_COLUMNS = "id,worktree,repo_dir,title,created_at";
const now = () => new Date().toISOString();

/** Dumb persistence. Emits no events; the Runtime does that. */
export class Store {
  #db: DatabaseSync;

  constructor(path: string, opts: { readOnly?: boolean } = {}) {
    this.#db = opts.readOnly ? new DatabaseSync(path, { readOnly: true }) : new DatabaseSync(path);
    if (!opts.readOnly) {
      if (path !== ":memory:") this.#db.exec("PRAGMA journal_mode = WAL;");
      this.#db.exec(SCHEMA);
      const columns = (this.#db.prepare("PRAGMA table_info(sessions)").all() as Row[]).map((r) => r.name).join(",");
      if (columns !== SESSION_COLUMNS) throw new Error(`Database ${path} has an outdated schema (sessions are disposable): delete it and restart`);
    }
  }

  close(): void {
    this.#db.close();
  }

  createSession(fields: { worktree: string; repoDir: string; title: string }): Session {
    const s: Session = { id: randomUUID(), ...fields, createdAt: now() };
    this.#db.prepare("INSERT INTO sessions (id, worktree, repo_dir, title, created_at) VALUES (?, ?, ?, ?, ?)").run(s.id, s.worktree, s.repoDir, s.title, s.createdAt);
    return s;
  }

  getSession(id: Id): Session {
    const r = this.#db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Row | undefined;
    if (!r) throw new Error(`Unknown session: ${id}`);
    return toSession(r);
  }

  listSessions(): Session[] {
    return (this.#db.prepare("SELECT * FROM sessions ORDER BY created_at, rowid").all() as Row[]).map(toSession);
  }

  putArtifact<T>(a: { sessionId: Id; type: string; status: ArtifactStatus; data: T; provenance: Provenance }): Artifact<T> {
    const full: Artifact<T> = { id: randomUUID(), createdAt: now(), ...a };
    this.#db
      .prepare("INSERT INTO artifacts VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(full.id, full.sessionId, full.type, full.status, JSON.stringify(full.data), JSON.stringify(full.provenance), full.createdAt);
    return full;
  }

  getArtifact<T = unknown>(id: Id): Artifact<T> {
    const r = this.#db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id) as Row | undefined;
    if (!r) throw new Error(`Unknown artifact: ${id}`);
    return toArtifact<T>(r);
  }

  listArtifacts(sessionId: Id, type?: string): Artifact[] {
    const rows = type
      ? this.#db.prepare("SELECT * FROM artifacts WHERE session_id = ? AND type = ? ORDER BY rowid").all(sessionId, type)
      : this.#db.prepare("SELECT * FROM artifacts WHERE session_id = ? ORDER BY rowid").all(sessionId);
    return (rows as Row[]).map((r) => toArtifact(r));
  }

  putSearchDocs(sessionId: Id, artifactId: Id, docs: SearchDoc[]): void {
    this.#db.prepare("DELETE FROM search_index WHERE artifact_id = ?").run(artifactId);
    const insert = this.#db.prepare("INSERT INTO search_index (session_id, artifact_id, ref, kind, body) VALUES (?, ?, ?, ?, ?)");
    for (const doc of docs) insert.run(sessionId, artifactId, doc.ref, doc.kind, doc.body);
  }

  search(sessionId: Id, query: string, opts: { kinds?: SearchDoc["kind"][]; limit?: number } = {}): { ref: Ref; kind: string; snippet: string; score: number }[] {
    const kinds = opts.kinds ?? [];
    const filter = kinds.length ? " AND kind IN (" + kinds.map(() => "?").join(", ") + ")" : "";
    const sql = "SELECT ref, kind, snippet(search_index, 4, '«', '»', '…', 12) AS snippet, bm25(search_index) AS score FROM search_index WHERE search_index MATCH ? AND session_id = ?" + filter + " ORDER BY bm25(search_index) LIMIT ?";
    try {
      return (this.#db.prepare(sql).all(query, sessionId, ...kinds, opts.limit ?? 10) as Row[]).map((row) => ({
        ref: row.ref as Ref, kind: row.kind as string, snippet: row.snippet as string, score: Number(row.score),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/fts5:|syntax error|unterminated|no such column/i.test(message)) throw new Error("Invalid search query: " + message);
      throw error;
    }
  }

  unindexedArtifactIds(): Id[] {
    return (this.#db.prepare("SELECT a.id FROM artifacts a LEFT JOIN search_index s ON s.artifact_id = a.id WHERE s.artifact_id IS NULL ORDER BY a.rowid").all() as Row[]).map((row) => row.id as Id);
  }

  putLink(l: { sessionId: Id; from: Ref; to: Ref; kind: LinkKind }): Link {
    const full: Link = { id: randomUUID(), ...l };
    this.#db.prepare("INSERT INTO links VALUES (?, ?, ?, ?, ?)").run(full.id, full.sessionId, full.from, full.to, full.kind);
    return full;
  }

  listLinks(sessionId: Id): Link[] {
    return (this.#db.prepare("SELECT * FROM links WHERE session_id = ? ORDER BY rowid").all(sessionId) as Row[]).map((r) => ({
      id: r.id as string, sessionId: r.session_id as string, from: r.from_ref as string, to: r.to_ref as string, kind: r.kind as LinkKind,
    }));
  }

  appendEvent(e: { sessionId: Id; actor: Actor; type: string; payload: unknown }): RuntimeEvent {
    const ts = now();
    const res = this.#db
      .prepare("INSERT INTO events (session_id, actor, type, payload, ts) VALUES (?, ?, ?, ?, ?)")
      .run(e.sessionId, e.actor, e.type, JSON.stringify(e.payload ?? null), ts);
    return { id: Number(res.lastInsertRowid), ts, ...e, payload: e.payload ?? null };
  }

  listEvents(sessionId: Id, afterId = 0): RuntimeEvent[] {
    return (this.#db.prepare("SELECT * FROM events WHERE session_id = ? AND id > ? ORDER BY id").all(sessionId, afterId) as Row[]).map((r) => ({
      id: r.id as number, sessionId: r.session_id as string, actor: r.actor as Actor, type: r.type as string,
      payload: JSON.parse(r.payload as string), ts: r.ts as string,
    }));
  }

  lastEventId(sessionId: Id): number {
    const r = this.#db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM events WHERE session_id = ?").get(sessionId) as Row;
    return Number(r.id);
  }

  createTask(t: { sessionId: Id; kind: string; input: unknown }): TaskRecord {
    const ts = now();
    const id = randomUUID();
    this.#db
      .prepare("INSERT INTO tasks VALUES (?, ?, ?, 'pending', ?, NULL, NULL, ?, ?)")
      .run(id, t.sessionId, t.kind, JSON.stringify(t.input ?? null), ts, ts);
    return this.getTask(id);
  }

  updateTask(id: Id, patch: { status?: TaskStatus; output?: unknown; error?: string }): TaskRecord {
    const cur = this.getTask(id);
    this.#db
      .prepare("UPDATE tasks SET status = ?, output = ?, error = ?, updated_at = ? WHERE id = ?")
      .run(
        patch.status ?? cur.status,
        JSON.stringify(patch.output !== undefined ? patch.output : cur.output),
        patch.error ?? cur.error,
        now(),
        id,
      );
    return this.getTask(id);
  }

  getTask(id: Id): TaskRecord {
    const r = this.#db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Row | undefined;
    if (!r) throw new Error(`Unknown task: ${id}`);
    return toTask(r);
  }

  listTasks(sessionId: Id): TaskRecord[] {
    return (this.#db.prepare("SELECT * FROM tasks WHERE session_id = ? ORDER BY created_at, rowid").all(sessionId) as Row[]).map(toTask);
  }
}

function toTask(r: Row): TaskRecord {
    return {
      id: r.id as string, sessionId: r.session_id as string, kind: r.kind as string, status: r.status as TaskStatus,
      input: JSON.parse(r.input as string), output: r.output === null ? null : JSON.parse(r.output as string),
      error: (r.error as string | null) ?? null, createdAt: r.created_at as string, updatedAt: r.updated_at as string,
    };
}

function toSession(r: Row): Session {
  return { id: r.id as string, worktree: r.worktree as string, repoDir: r.repo_dir as string, title: r.title as string, createdAt: r.created_at as string };
}

function toArtifact<T>(r: Row): Artifact<T> {
  return {
    id: r.id as string, sessionId: r.session_id as string, type: r.type as string, status: r.status as ArtifactStatus,
    data: JSON.parse(r.data as string), provenance: JSON.parse(r.provenance as string), createdAt: r.created_at as string,
  };
}
