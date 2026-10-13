import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  Actor, Artifact, ArtifactStatus, Epoch, EpochStatus, Id, Link, LinkKind, Provenance, Ref, WorkflowId,
  LlmActivity, Progress, RuntimeEvent, Session, SessionListing, TaskRecord, TaskStatus,
} from "../shared/types.ts";
import { assertSchemaVersion, migrate, type Migration } from "./migrate.ts";
import type { SearchDoc } from "./render-ref.ts";

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, worktree TEXT NOT NULL, repo_dir TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, workflow TEXT);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), kind TEXT NOT NULL,
  status TEXT NOT NULL, input TEXT NOT NULL, output TEXT, error TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, epoch INTEGER, parent_id TEXT REFERENCES tasks(id));
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), type TEXT NOT NULL,
  status TEXT NOT NULL, data TEXT NOT NULL, provenance TEXT NOT NULL, created_at TEXT NOT NULL, epoch INTEGER);
CREATE TABLE IF NOT EXISTS epochs (
  session_id TEXT NOT NULL REFERENCES sessions(id), n INTEGER NOT NULL, phase TEXT NOT NULL, status TEXT NOT NULL,
  input TEXT NOT NULL, error TEXT, started_at TEXT NOT NULL, ended_at TEXT, PRIMARY KEY (session_id, n));
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

/** Schema history of the session database; append a migration for every change to the tables or to the shape of stored artifact data. */
export const STORE_MIGRATIONS: readonly Migration[] = [
  (db) => {
    db.exec(SCHEMA_V1);
    const columns = (table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as Row[]).map((r) => r.name).join(",");
    if (columns("sessions") !== SESSION_COLUMNS || columns("artifacts") !== "id,session_id,type,status,data,provenance,created_at,epoch" || columns("tasks") !== "id,session_id,kind,status,input,output,error,created_at,updated_at,epoch,parent_id") throw new Error("Database was created by an older development version; delete it and restart");
  },
  // `WorkflowStart.profile` predates versioned databases: starts without it take the profile their params or their session's implement branch named.
  (db) => {
    const starts = db.prepare("SELECT id, session_id, data FROM artifacts WHERE type = 'WorkflowStart' AND json_extract(data, '$.profile') IS NULL").all() as Row[];
    const branchProfile = db.prepare("SELECT json_extract(data, '$.profile') AS profile FROM artifacts WHERE session_id = ? AND type = 'ImplementBranch' AND json_extract(data, '$.profile') IS NOT NULL ORDER BY rowid DESC LIMIT 1");
    const update = db.prepare("UPDATE artifacts SET data = ? WHERE id = ?");
    for (const row of starts) {
      const data = JSON.parse(row.data as string) as { params?: { profile?: string | null }; profile?: string };
      const profile = data.params?.profile ?? (branchProfile.get(row.session_id as string) as Row | undefined)?.profile as string | undefined;
      if (profile) update.run(JSON.stringify({ ...data, profile }), row.id as string);
    }
  },
];

type Row = Record<string, unknown>;
const SESSION_COLUMNS = "id,worktree,repo_dir,title,created_at,workflow";
const now = () => new Date().toISOString();

const eventFromRow = (r: Row): RuntimeEvent => ({
  id: r.id as number, sessionId: r.session_id as string, actor: r.actor as Actor, type: r.type as string,
  payload: JSON.parse(r.payload as string), ts: r.ts as string,
});

/** Dumb persistence. Emits no events; the Runtime does that. */
export class Store {
  #db: DatabaseSync;

  constructor(path: string, opts: { readOnly?: boolean } = {}) {
    this.#db = opts.readOnly ? new DatabaseSync(path, { readOnly: true }) : new DatabaseSync(path);
    if (opts.readOnly) {
      assertSchemaVersion(this.#db, path, STORE_MIGRATIONS.length);
      return;
    }
    this.#db.exec("PRAGMA foreign_keys = ON;");
    migrate(this.#db, path, STORE_MIGRATIONS);
    if (path !== ":memory:") this.#db.exec("PRAGMA journal_mode = WAL;");
  }

  close(): void {
    this.#db.close();
  }

  createSession(fields: { worktree: string; repoDir: string; title: string; workflow?: WorkflowId }): Session {
    const s: Session = { id: randomUUID(), ...fields, workflow: fields.workflow ?? null, createdAt: now() };
    this.#db.prepare("INSERT INTO sessions (id, worktree, repo_dir, title, created_at, workflow) VALUES (?, ?, ?, ?, ?, ?)").run(s.id, s.worktree, s.repoDir, s.title, s.createdAt, s.workflow);
    return s;
  }

  /** Records the chosen workflow and the session title. */
  setSessionStart(id: Id, workflow: WorkflowId, title: string): Session {
    this.#db.prepare("UPDATE sessions SET workflow = ?, title = ? WHERE id = ?").run(workflow, title, id);
    return this.getSession(id);
  }

  getSession(id: Id): Session {
    const r = this.#db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Row | undefined;
    if (!r) throw new Error(`Unknown session: ${id}`);
    return toSession(r);
  }

  listSessions(): Session[] {
    return (this.#db.prepare("SELECT * FROM sessions ORDER BY created_at, rowid").all() as Row[]).map(toSession);
  }

  /** `listSessions` with each session's last activity: its newest event's time, else its creation. */
  listSessionListings(): SessionListing[] {
    return (this.#db.prepare("SELECT s.*, COALESCE((SELECT ts FROM events e WHERE e.session_id = s.id ORDER BY e.id DESC LIMIT 1), s.created_at) AS last_active FROM sessions s ORDER BY s.created_at, s.rowid").all() as Row[])
      .map((r) => ({ ...toSession(r), lastActive: r.last_active as string }));
  }

  /** Deletes the session and everything stored for it. */
  deleteSession(id: Id): void {
    this.getSession(id);
    this.#db.exec("BEGIN");
    try {
      for (const table of ["search_index", "events", "links", "artifacts", "tasks", "epochs"]) this.#db.prepare(`DELETE FROM ${table} WHERE session_id = ?`).run(id);
      this.#db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
      this.#db.exec("COMMIT");
    } catch (e) {
      this.#db.exec("ROLLBACK");
      throw e;
    }
  }

  createEpoch(sessionId: Id, phase: string, input: unknown): Epoch {
    const n = Number((this.#db.prepare("SELECT COALESCE(MAX(n), 0) + 1 AS n FROM epochs WHERE session_id = ?").get(sessionId) as Row).n);
    const startedAt = now();
    this.#db.prepare("INSERT INTO epochs VALUES (?, ?, ?, 'running', ?, NULL, ?, NULL)").run(sessionId, n, phase, JSON.stringify(input ?? null), startedAt);
    return this.getEpoch(sessionId, n);
  }

  updateEpoch(sessionId: Id, n: number, patch: { status: EpochStatus; error?: string | null }): Epoch {
    const cur = this.getEpoch(sessionId, n);
    const endedAt = patch.status === "running" ? null : now();
    const error = patch.error !== undefined ? patch.error : patch.status === "running" ? null : cur.error;
    this.#db.prepare("UPDATE epochs SET status = ?, error = ?, ended_at = ? WHERE session_id = ? AND n = ?").run(patch.status, error, endedAt, sessionId, n);
    return this.getEpoch(sessionId, n);
  }

  getEpoch(sessionId: Id, n: number): Epoch {
    const r = this.#db.prepare("SELECT * FROM epochs WHERE session_id = ? AND n = ?").get(sessionId, n) as Row | undefined;
    if (!r) throw new Error(`Unknown epoch: ${sessionId}/${n}`);
    return toEpoch(r);
  }

  /** Fails every running epoch and pending or running task with `reason`. Only a server process that just started may call it: they belong to a process that died. */
  failInterrupted(reason: string): void {
    const at = now();
    this.#db.prepare("UPDATE epochs SET status = 'failed', error = ?, ended_at = ? WHERE status = 'running'").run(reason, at);
    this.#db.prepare("UPDATE tasks SET status = 'failed', error = ?, updated_at = ? WHERE status IN ('pending', 'running')").run(reason, at);
  }

  listEpochs(sessionId: Id): Epoch[] {
    return (this.#db.prepare("SELECT * FROM epochs WHERE session_id = ? ORDER BY n").all(sessionId) as Row[]).map(toEpoch);
  }

  /** Stores an artifact in the session's latest epoch unless `epoch` names another. */
  putArtifact<T>(a: { sessionId: Id; type: string; status: ArtifactStatus; data: T; provenance: Provenance; epoch?: number | null }): Artifact<T> {
    const full: Artifact<T> = { id: randomUUID(), createdAt: now(), ...a, epoch: a.epoch === undefined ? this.latestEpoch(a.sessionId) : a.epoch };
    this.#db
      .prepare("INSERT INTO artifacts VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(full.id, full.sessionId, full.type, full.status, JSON.stringify(full.data), JSON.stringify(full.provenance), full.createdAt, full.epoch);
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
    return (this.#db.prepare("SELECT * FROM events WHERE session_id = ? AND id > ? ORDER BY id").all(sessionId, afterId) as Row[]).map(eventFromRow);
  }

  listEventsOfType(sessionId: Id, type: string): RuntimeEvent[] {
    return (this.#db.prepare("SELECT * FROM events WHERE session_id = ? AND type = ? ORDER BY id").all(sessionId, type) as Row[]).map(eventFromRow);
  }

  lastEventId(sessionId: Id): number {
    const r = this.#db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM events WHERE session_id = ?").get(sessionId) as Row;
    return Number(r.id);
  }

  /** The last `limit` progress values `taskId` reported, oldest first. */
  listTaskProgress(sessionId: Id, taskId: Id, limit: number): Progress[] {
    const rows = this.#db.prepare("SELECT payload FROM events WHERE session_id = ? AND actor = ? AND type = 'task.progress' ORDER BY id DESC LIMIT ?").all(sessionId, `task:${taskId}`, limit) as Row[];
    return rows.map((r) => (JSON.parse(r.payload as string) as { progress: Progress }).progress).reverse();
  }

  /** Everything `taskId`'s LLM runs reported as activity, oldest first. */
  listTaskActivity(sessionId: Id, taskId: Id): LlmActivity[] {
    const rows = this.#db.prepare("SELECT payload FROM events WHERE session_id = ? AND actor = ? AND type = 'task.activity' ORDER BY id").all(sessionId, `task:${taskId}`) as Row[];
    return rows.map((r) => (JSON.parse(r.payload as string) as { activity: LlmActivity }).activity);
  }

  createTask(t: { sessionId: Id; kind: string; input: unknown; parentId?: Id }): TaskRecord {
    const ts = now();
    const id = randomUUID();
    this.#db
      .prepare("INSERT INTO tasks VALUES (?, ?, ?, 'pending', ?, NULL, NULL, ?, ?, ?, ?)")
      .run(id, t.sessionId, t.kind, JSON.stringify(t.input ?? null), ts, ts, this.latestEpoch(t.sessionId), t.parentId ?? null);
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

  /** Pending and running tasks of `kind` in every session. */
  listActiveTasks(kind: string): TaskRecord[] {
    return (this.#db.prepare("SELECT * FROM tasks WHERE kind = ? AND status IN ('pending', 'running') ORDER BY created_at, rowid").all(kind) as Row[]).map(toTask);
  }

  private latestEpoch(sessionId: Id): number | null {
    const r = this.#db.prepare("SELECT MAX(n) AS n FROM epochs WHERE session_id = ?").get(sessionId) as Row;
    return r.n === null ? null : Number(r.n);
  }
}

function toEpoch(r: Row): Epoch {
  return { sessionId: r.session_id as string, n: Number(r.n), phase: r.phase as string, status: r.status as EpochStatus, input: JSON.parse(r.input as string), error: (r.error as string | null) ?? null, startedAt: r.started_at as string, endedAt: (r.ended_at as string | null) ?? null };
}

function toTask(r: Row): TaskRecord {
    return {
      id: r.id as string, sessionId: r.session_id as string, kind: r.kind as string, status: r.status as TaskStatus,
      input: JSON.parse(r.input as string), output: r.output === null ? null : JSON.parse(r.output as string),
      error: (r.error as string | null) ?? null, createdAt: r.created_at as string, updatedAt: r.updated_at as string,
      epoch: r.epoch === null ? null : Number(r.epoch), parentId: (r.parent_id as string | null) ?? null,
    };
}

function toSession(r: Row): Session {
  return { id: r.id as string, worktree: r.worktree as string, repoDir: r.repo_dir as string, title: r.title as string, createdAt: r.created_at as string, workflow: (r.workflow as WorkflowId | null) ?? null };
}

function toArtifact<T>(r: Row): Artifact<T> {
  return {
    id: r.id as string, sessionId: r.session_id as string, type: r.type as string, status: r.status as ArtifactStatus,
    data: JSON.parse(r.data as string), provenance: JSON.parse(r.provenance as string), createdAt: r.created_at as string, epoch: r.epoch === null ? null : Number(r.epoch),
  };
}
