/** Contract types shared by runtime, CLI, and (later) the web client. */

export type Id = string;

export type WorkflowId = "review" | "chat";

/** A registry entry as the start box shows it: `/<id> <argHint>`, `description`. */
export interface WorkflowInfo { id: WorkflowId; description: string; argHint: string }

/** Data of a `WorkflowStart` artifact: the request that started the session and the workflow chosen for it. */
export interface WorkflowStartData {
  via: "command" | "selector";
  workflow: WorkflowId;
  params: unknown;
  title: string;
  prompt: string;
}

/** The user's durable unit of work. Grouped by repo (`repoDir`); runs in one worktree of it. */
export interface Session {
  id: Id;
  /** Absolute toplevel of the git worktree the session runs in. */
  worktree: string;
  /** Repo identity: absolute, symlink-resolved `git rev-parse --git-common-dir`, shared by all worktrees of a repo. */
  repoDir: string;
  title: string;
  createdAt: string;
  /** The workflow the session runs; null until the start request is interpreted. */
  workflow: WorkflowId | null;
}

/** `GET /api/health`. `ui`: the server serves the built web UI. */
export interface HealthResponse { app: "spatial-ide"; ui: boolean }

/** `GET /api/repo?path=`: the repo containing `path` and all its sessions (any worktree), newest first. */
export interface RepoInfo { worktree: string; repoDir: string; name: string; sessions: Session[] }

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

export type DiagramEntityKind = "class" | "struct" | "function" | "method" | "field" | "module" | "file" | "other";
export type DiagramStatus = "added" | "modified" | "removed" | "context";
export type DiagramEdgeKind = "calls" | "inherits" | "owns" | "uses";
/** A cited line: 1-based `line` of `path` in the commit's tree (in its parent's tree for `removed` nodes). */
export interface DiagramCite { path: string; line: number }
export interface DiagramNode { id: string; label: string; identifier: string; kind: DiagramEntityKind; status: DiagramStatus; cite: DiagramCite; verified: boolean }
export interface DiagramEdge { from: string; to: string; kind: DiagramEdgeKind; step: number | null; cite: DiagramCite; verified: boolean }
/** Data of a `Diagram` artifact (status `proposed`), linked `derivedFrom → assistant ChatMessage`. `verified` flags are set by the runtime. */
export interface DiagramData { commit: string; commitIndex: number; mode: "map" | "flow"; title: string; nodes: DiagramNode[]; edges: DiagramEdge[] }

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
  aside?: true;
  quote?: string;
  lines?: { path: string; side: "old" | "new"; start: number; end: number };
}

/** Data for a requested or user-enabled MCP server; artifacts link about → chat thread. */
export interface McpServerData { server: string }

/** A user-authored note attached to a session request. */
export interface NoteData { body: string }

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

/** Latest artifact of this type for a finding wins. Linked `about → findingId`. Provenance: user. */
export interface FindingDecisionData { finding: Id; decision: "accepted" | "dismissed" }

export type ChangeStatus = "unchanged" | "modified" | "new";

/** Where a finding sits in the Diff `toDiff` after re-anchoring; `hunkId` null means the code is gone. Linked `about → finding`; latest per (finding, toDiff) wins. Verified; no LLM. */
export interface FindingCarryData { finding: Id; toDiff: Id; hunkId: string | null; lines?: ChatThreadData["lines"] }

export type FindingVerdictValue = "addressed" | "partially" | "not_addressed";
/** The review's judgement whether a new revision addresses a prior finding. Linked `about → finding`, `derivedFrom → narrative`; latest per finding wins. Provenance: llm. */
export interface FindingVerdictData { finding: Id; verdict: FindingVerdictValue; reason: string }

/** First version from the `comment` task; reviewer edits create a verified version. Linked `about → findingId`. */
export interface ReviewCommentData { finding: Id; body: string }

/** Receipt of a posted Phabricator inline. Linked `about → commentId`. Provenance: runtime. */
export interface PostedCommentData { comment: Id; revision: number; diff: number; inlineId: number }

/** The Phabricator diff matching a local Diff while it was the session head, and the revision's newest diff. */
export interface PhabSyncData { revision: number; matchingDiffId: number | null; latestDiffId: number | null; localDiff: Id }

/** A comment imported from Phabricator. Provenance is runtime verified; a newer version or done state revises the prior artifact. `bot` is set when the username ends in "bot": Phabricator roles do not distinguish bots. */
export interface PhabCommentData {
  revision: number; phid: string; version: number; author: string; bot: boolean; body: string; path?: string; line?: number; length?: number; /** Text of the commented line in the raw diff of `diffId`; absent when not found. */ quote?: string;
  diffId?: number; isNewFile?: boolean; replyTo?: string; own: boolean; done: boolean; txId: number; dateCreated: number;
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
  /** Why a proposed diagram was dropped during deterministic verification. */
  diagramError?: string;
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
  /** Index into `DiffData.commits` of the commit that added (`add`) or deleted (`del`) this line. Absent for context and single-commit diffs. */
  commit?: number;
  /** Line number in that commit's own diff: new side for `add`, old side for `del`. */
  commitLine?: number;
  /** Path in that commit's own diff; only set when it differs from the file's path. */
  commitPath?: string;
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
  rewrites?: Rewrite[];
}

/** A later stack commit deleted lines introduced by an earlier stack commit. */
export interface Rewrite { by: number; of: number; lines: number }

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

/** Data of an `Interdiff` artifact: what the author changed between two revisions, without changes that only come from rebasing. Linked `about → toDiff`. Produced by the `interdiff` task; verified; no LLM. `conflicts` lists paths where replaying the old patch onto the new base conflicted; for those, `files` holds a per-file comparison of the old and new patch hunks instead. */
export interface InterdiffData { fromDiff: Id; toDiff: Id; files: DiffFile[]; conflicts: string[] }

/** Payload of a `notify` runtime event. `action.path` is an API path the client POSTs (empty JSON body) when the user presses the action. */
export interface NotifyPayload { id: string; title: string; body?: string; action?: { label: string; path: string } }

export interface SemanticChange {
  id: string;
  title: string;
  explanation: string;
  rationale: string;
  hunkIds: string[];
  dependsOn: string[];
  specUrls: string[];
  /** Set by the runtime for narratives of epoch >= 2 written in update mode; absent otherwise. */
  status?: ChangeStatus;
}

/** Data of a `PatchNarrative` artifact. */
export interface PatchNarrativeData {
  diffId: Id;
  summary: string;
  changes: SemanticChange[];
  /** One sentence per stack commit, in commit order, on what the commit achieves within the stack. Present for stacks only. */
  commitIntents?: string[];
  /** Previous epoch's narrative; present when this narrative describes what changed since it. */
  previous?: Id;
}

/** A reviewer's mark on a change of a narrative; the latest per (narrative, change) wins. Linked `about → <narrative>#<change>`. Provenance: user. */
export interface ChangeReviewData { narrative: Id; change: string; reviewed: boolean }
