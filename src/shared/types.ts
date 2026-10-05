/** Contract types shared by runtime, CLI, and (later) the web client. */

export type Id = string;

/** The user's durable unit of work inside a repo. */
export interface Session {
  id: Id;
  /** Absolute path of the repo toplevel. */
  repo: string;
  title: string;
  createdAt: string;
}

export type ArtifactStatus = "proposed" | "verified" | "rejected";

export type LlmBackendId = "claude" | "codex";

export interface LlmSelection {
  backend: LlmBackendId;
  model: string;
  effort: string;
}

export interface ModelInfo {
  id: string;
  efforts: string[];
}

export interface Provenance {
  taskId: Id;
  /** Present when the artifact content was produced by an LLM. */
  llm?: LlmSelection;
}

export interface Artifact<T = unknown> {
  id: Id;
  sessionId: Id;
  type: string;
  status: ArtifactStatus;
  data: T;
  provenance: Provenance;
  createdAt: string;
}

/** An artifact id, or `<artifactId>#<subId>` addressing a part of one (change id, hunk id). */
export type Ref = string;

export type LinkKind = "derivedFrom" | "supports" | "about" | "reply";

export interface Link {
  id: Id;
  sessionId: Id;
  from: Ref;
  to: Ref;
  kind: LinkKind;
}

export type Actor = "user" | "runtime" | `task:${string}`;

export interface RuntimeEvent {
  id: number;
  sessionId: Id;
  actor: Actor;
  type: string;
  payload: unknown;
  ts: string;
}

export type TaskStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export interface TaskRecord {
  id: Id;
  sessionId: Id;
  kind: string;
  status: TaskStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Progress =
  | { kind: "indeterminate"; message?: string }
  | { kind: "determinate"; done: number; total: number; message?: string }
  | { kind: "steps"; step: string; index: number; count: number };

export interface Commit {
  sha: string;
  subject: string;
  body: string;
}

export interface DiffLine {
  kind: "ctx" | "add" | "del";
  text: string;
}

export interface Hunk {
  /** `f<fileIndex>h<hunkIndex>`; stable because a Diff artifact is immutable and pinned to SHAs. */
  id: string;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export type FileStatus = "added" | "deleted" | "modified" | "renamed";

export interface DiffFile {
  path: string;
  oldPath?: string;
  status: FileStatus;
  binary: boolean;
  hunks: Hunk[];
}

/** Data of a `Diff` artifact. */
export interface DiffData {
  baseSha: string;
  headSha: string;
  commits: Commit[];
  files: DiffFile[];
}

export interface SemanticChange {
  id: string;
  title: string;
  explanation: string;
  rationale: string;
  hunkIds: string[];
  dependsOn: string[];
  specUrls: string[];
}

/** Data of a `PatchNarrative` artifact. */
export interface PatchNarrativeData {
  diffId: Id;
  summary: string;
  changes: SemanticChange[];
}
