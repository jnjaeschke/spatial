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

export type BackendModels = { models: ModelInfo[] } | { error: string };

export interface ModelsResponse {
  default: LlmSelection;
  backends: Record<LlmBackendId, BackendModels>;
}

export interface ResolvedSpec {
  spec: string;
  anchor: string;
  title: string;
  type: string;
  /** Canonical URL from webspec-index. */
  url: string;
  /** Section text as markdown with `[text](SPEC#anchor)` links. */
  content: string;
}

export interface GeckoSpecRef {
  group: string;
  path: string;
  line: number;
  url: string;
}

/** Data of a `SpecReference` artifact. `resolved` null means webspec-index could not resolve `url`. */
export interface SpecReferenceData {
  url: string;
  resolved: ResolvedSpec | null;
  /** Whether the reference was found in changed code or inferred by the narrative. */
  origin?: "code" | "llm";
  reason?: string;
  geckoRefs: GeckoSpecRef[];
  geckoRefsError?: string;
}

/** Full snapshot of one session; the web client's only data source besides events. */
export interface SessionState {
  session: Session;
  artifacts: Artifact[];
  links: Link[];
  tasks: TaskRecord[];
  /** Subscribe to events after this id to miss nothing. */
  lastEventId: number;
  /** Searchfox repository base and indexed tip for Gecko repos, else null. */
  searchfox: { repoBase: string; tipRev: string } | null;
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

export type LinkKind = "derivedFrom" | "supports" | "about" | "reply" | "revises";

/** Data of a `Revision` artifact: a wrong span and its correction. Linked `revises → message`, `derivedFrom → the assistant message that made the revision`. */
export interface RevisionData { quote: string; correction: string }

/** Data of a `ChatThread` artifact; linked `about → anchor`. */
export interface ChatThreadData {
  anchor: Ref;
  quote?: string;
  lines?: { path: string; side: "old" | "new"; start: number; end: number };
}

/** Data for a requested or user-enabled MCP server; artifacts link about → chat thread. */
export interface McpServerData { server: string }

/** Data of a `ReviewFinding` artifact; linked `derivedFrom → narrative` and `about → anchor`. `anchor`, `quote`, `lines` mean the same as on `ChatThreadData`. */
export interface ReviewFindingData {
  anchor: Ref;
  quote?: string;
  lines?: ChatThreadData["lines"];
  category: "correctness" | "spec" | "tests" | "style";
  severity: "high" | "medium" | "low";
  title: string;
  body: string;
}

/** Data of a `ChatMessage` artifact; linked `reply → thread`. Assistant messages record the provider session they belong to. */
export interface ChatMessageData {
  role: "user" | "assistant";
  text: string;
  llm?: LlmSelection;
  providerSessionId?: string;
  /** Questions the assistant asks the user. */
  questions?: string[];
  /** Revisions from this reply that were not applied, with the reason. */
  revisionErrors?: string[];
}

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
  /** Upstream commit the patch applies to (merge-base of base with `main`); Searchfox links pin to it. Absent when unknown. */
  upstreamRev?: string;
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
