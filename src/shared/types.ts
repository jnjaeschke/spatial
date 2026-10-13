/** Contract types shared by runtime, CLI, and (later) the web client. */

export type Id = string;

export type EpochStatus = "running" | "succeeded" | "failed" | "cancelled";
/** One run of a phase. `n` is 1-based and monotonic per session; artifacts and tasks record the epoch that was latest when they were created. */
export interface Epoch { sessionId: Id; n: number; phase: string; status: EpochStatus; input: unknown; error: string | null; startedAt: string; endedAt: string | null }

export type WorkflowId = string;
export type WriteMode = "auto" | "full" | "editsOnly";

/** A shell command an agent ran (source fact; artifact `CommandRun`, verified). `test` is true when the profile's `isTestCommand` matches. `output` is capped at 256 KB. */
export interface CommandRunData { command: string; exitCode: number; durationMs: number; output: string; test: boolean; /** The `callId` of the activity log's tool call that ran it; absent for commands the runtime ran itself. */ callId?: string }

/** A question the start box shows before a session exists: the workflow selector's (answered in text) or the chosen workflow's precheck (`options`; an option with `cancel` abandons the start). Answer with `POST /api/start` `{ question: id, answer }`, the answer being the text or the option's index. */
export interface StartQuestion { id: string; question: string; options?: { label: string; cancel?: true }[] }

/** A registry entry as the start box shows it: `/<id> <argHint>`, `description`. */
export interface WorkflowInfo { id: string; description: string; argHint: string }

/** Data of a `WorkflowStart` artifact: the request that started the session and the workflow chosen for it. */
export interface WorkflowStartData {
  via: "command" | "selector";
  workflow: WorkflowId;
  params: unknown;
  title: string;
  prompt: string;
  /** Id of the repo profile the session works with, chosen once when it starts; a workflow param named `profile` requests a specific one. */
  profile: string;
  /** The start box selection later phases reuse: the model for investigate and review, and how much the implement agent may do. */
  llm?: LlmSelection;
  writeMode?: WriteMode;
}

/** One choice of a `Decision`. `takesText`: the user may add text; `requiresText`: the text is mandatory; `textPattern`: source of a regular expression the text must match; `defaultText`: text the UI prefills; `takesModel`: the answer carries the LLM selection to use for the work that follows (`chosen.llm`). */
export interface DecisionOption { id: string; label: string; takesText?: boolean; requiresText?: boolean; textPattern?: string; defaultText?: string; takesModel?: boolean }

/** Data of a `Decision` artifact: a question a workflow asked after the epoch the artifact is stamped with. `key` identifies the decision within its epoch (the runtime and the workflows match on key and epoch); `question` is display text only. `chosen` is null while it is open. The user's answer is a new verified version linked `revises →` the open one; a rule's answer is stored already chosen, with its reason. */
export interface DecisionData { key: string; question: string; options: DecisionOption[]; chosen: { option: string; by: "user" | "rule"; text?: string; reason?: string; llm?: LlmSelection } | null }

/** The user's durable unit of work. Grouped by repo (`repoDir`); runs in one worktree of it. */
export interface Session {
  id: Id;
  /** Absolute toplevel of the git worktree the session runs in. */
  worktree: string;
  /** Repo identity: absolute, symlink-resolved `git rev-parse --git-common-dir`, shared by all worktrees of a repo. */
  repoDir: string;
  title: string;
  createdAt: string;
  /** The workflow the session runs; the start box creates sessions with it set, null only for sessions made without one. */
  workflow: WorkflowId | null;
}

/** `GET /api/health`. `ui`: the server serves the built web UI. */
export interface HealthResponse { app: "spatial"; ui: boolean; pid: number; commit: string | null; runningTasks: number }

/** `GET /api/repo?path=`: the repo containing `path` and all its sessions (any worktree), newest first. */
export interface RepoInfo { worktree: string; repoDir: string; name: string; sessions: SessionListing[] }

/** A session as the session lists show it, with the time of its last activity. */
export interface SessionListing extends Session { lastActive: string }

/** A repository with at least one session worktree that still exists. */
export interface RecentRepo { repoDir: string; name: string; worktree: string; sessions: number; lastActive: string }

/** `GET /api/dirs?path=`: a read-only directory listing for the folder picker. */
export interface DirectoryListing { path: string; parent: string | null; entries: { name: string; path: string; repo: boolean }[]; truncated?: true }

export type ArtifactStatus = "proposed" | "verified" | "rejected";

export type LlmBackendId = "claude" | "codex";

export interface LlmSelection {
  backend: LlmBackendId;
  model: string;
  effort: string;
}

/** One LLM run: its tokens, `null` for a run recorded before tokens were metered, and its cost in USD, `null` when unknown (an unpriced model, or unmetered tokens without a reported cost). Item of `GET /api/usage`. */
export interface UsageRun {
  ts: string;
  sessionId: string;
  backend: LlmBackendId;
  model: string;
  /** Input tokens, cached ones included. */
  tokens: { input: number; cachedInput: number; output: number } | null;
  costUsd: number | null;
}

/** One step of an LLM run as its output streams: text it wrote, its reasoning, or a tool call with the argument that names what it works on. Payload of `task.activity` events. */
export type LlmActivity = { kind: "text"; text: string } | { kind: "thinking"; text: string } | { kind: "tool"; name: string; detail: string; callId?: string }
  | { kind: "tool-result"; callId: string; exitCode: number | null; durationMs: number; output: string };

/** A task's activity so far; later activity comes as `task.activity` events after `lastEventId`. */
export interface TaskActivityResponse { activity: LlmActivity[]; lastEventId: number }

export interface ModelInfo {
  id: string;
  efforts: string[];
}

export type BackendModels = { models: ModelInfo[] } | { error: string };

export interface ModelsResponse {
  default: LlmSelection;
  backends: Record<LlmBackendId, BackendModels>;
}

export type SequenceStatus = "new" | "changed" | "existing" | "removed";
/** A cited line: 1-based `line` of `path` in the commit's tree (in its parent's tree for `before` steps). */
export interface DiagramCite { path: string; line: number }
/** One call between lanes (`from === to` for a self step). The runtime sets `verified`, `text` (the matched source line, trimmed) and moves `cite.line` to the matched line. */
export interface SequenceStep { from: string; to: string; symbol: string; call: string; what: string; when: string | null; guard: string | null; phase: string | null; status: SequenceStatus; cite: DiagramCite; verified: boolean; text: string | null }
export interface SequenceLane { id: string; label: string; note: string | null }
/** Data of a `Diagram` artifact (status `proposed`), linked `derivedFrom → assistant ChatMessage`. `before` is the parent commit's flow, null for a new flow. */
export interface DiagramData { kind: "sequence"; commit: string; commitIndex: number; title: string; summary: string; lanes: SequenceLane[]; steps: SequenceStep[]; before: SequenceStep[] | null }

/** Turns matches of `pattern` (a regex source, matched globally) in text into links to `url`, in which `$1`, `$2`, ... stand for the match's capture groups. */
export interface TextLink { pattern: string; url: string }

/** Full snapshot of one session; the web client's only data source besides events. */
export interface SessionState {
  session: Session;
  artifacts: Artifact[];
  links: Link[];
  tasks: TaskRecord[];
  epochs: Epoch[];
  /** Subscribe to events after this id to miss nothing. */
  lastEventId: number;
  /** What plugins add to the snapshot (`Plugin.sessionState`), by plugin id; a plugin with nothing for the session has no entry. */
  plugins: Record<string, unknown>;
  /** Rules that turn text such as bug references into links, from the repository's plugins. */
  textLinks: TextLink[];
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
  /** Latest epoch of the session at creation; null before the first epoch. */
  epoch: number | null;
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
/** `command` is what the user is asked about and approves (`mcpCommand` of the repo's spec); an approval holds only while the spec still yields it. */
export interface McpServerData { server: string; command: string }

/** A user-authored note attached to a session request. */
export interface NoteData { body: string }

/** Data of a `ChatMessage` artifact; linked `reply → thread`. Assistant messages record the provider session they belong to. `run`: a phase the reply asked to start after the turn; anything with outside effects still waits for the user's decision in that phase. */
export interface ChatMessageData {
  role: "user" | "assistant";
  text: string;
  llm?: LlmSelection;
  providerSessionId?: string;
  /** Questions the assistant asks the user. */
  questions?: string[];
  /** Revisions from this reply that were not applied, with the reason. */
  revisionErrors?: string[];
  /** Why a plugin-proposed artifact was dropped during deterministic validation. */
  replyErrors?: { label: string; error: string }[];
  run?: { phase: string; input: unknown };
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
  /** Latest epoch of the session at creation; null before the first epoch. */
  epoch: number | null;
  /** The task that started this one through `ctx.run`; null for a top-level task. */
  parentId: Id | null;
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

/** One commit of a log page. `date` is the author date, ISO 8601. */
export interface LogRow { sha: string; parents: string[]; author: string; email: string; date: string; subject: string }
/** A ref; `sha` is the commit it points at (tags peeled) and `date` that commit's committer date, ISO 8601. `worktree` is set for a local branch checked out in a work tree. */
export interface RefRow { name: string; kind: "head" | "remote" | "tag" | "HEAD"; sha: string; date: string; upstream?: string; worktree?: string }
export interface CommitFileStat { path: string; oldPath?: string; status: FileStatus; added: number; deleted: number; binary: boolean }
export interface CommitDetail extends LogRow { body: string; committer: string; committerDate: string; files: CommitFileStat[] }
/** Which commits a log page walks: every ref, local branches plus the remote default branch, the current branch since its merge-base with the default branch, or one revision range. */
export type LogScope = { kind: "all" } | { kind: "branches" } | { kind: "current" } | { kind: "range"; range: string };

export interface DiffFile {
  path: string;
  oldPath?: string;
  status: FileStatus;
  binary: boolean;
  hunks: Hunk[];
}

/** Data of a `Diff` artifact. */
export interface DiffData {
  /** Upstream commit the patch applies to (merge-base of base with `main`); code links pin to it. Absent when unknown. */
  upstreamRev?: string;
  baseSha: string;
  headSha: string;
  commits: Commit[];
  files: DiffFile[];
}

/** Payload of a `notify` runtime event. `action.path` is an API path the client POSTs (empty JSON body) when the user presses the action. */
export interface NotifyPayload { id: string; title: string; body?: string; action?: { label: string; path: string } }
