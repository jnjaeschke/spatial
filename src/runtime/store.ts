import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  Actor, Artifact, ArtifactStatus, Id, Link, LinkKind, Provenance, Ref,
  RuntimeEvent, Session, TaskRecord, TaskStatus,
} from "../shared/types.ts";

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, repo TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL);
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
`;

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();

/** Dumb persistence. Emits no events; the Runtime does that. */
export class Store {
  #db: DatabaseSync;

  constructor(path: string) {
    this.#db = new DatabaseSync(path);
    if (path !== ":memory:") this.#db.exec("PRAGMA journal_mode = WAL;");
    this.#db.exec(SCHEMA);
  }

  close(): void {
    this.#db.close();
  }

  createSession(repo: string, title: string): Session {
    const s: Session = { id: randomUUID(), repo, title, createdAt: now() };
    this.#db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?)").run(s.id, s.repo, s.title, s.createdAt);
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
    return {
      id: r.id as string, sessionId: r.session_id as string, kind: r.kind as string, status: r.status as TaskStatus,
      input: JSON.parse(r.input as string), output: r.output === null ? null : JSON.parse(r.output as string),
      error: (r.error as string | null) ?? null, createdAt: r.created_at as string, updatedAt: r.updated_at as string,
    };
  }
}

function toSession(r: Row): Session {
  return { id: r.id as string, repo: r.repo as string, title: r.title as string, createdAt: r.created_at as string };
}

function toArtifact<T>(r: Row): Artifact<T> {
  return {
    id: r.id as string, sessionId: r.session_id as string, type: r.type as string, status: r.status as ArtifactStatus,
    data: JSON.parse(r.data as string), provenance: JSON.parse(r.provenance as string), createdAt: r.created_at as string,
  };
}
