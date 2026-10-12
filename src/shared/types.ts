/** Contract types shared by runtime, CLI, and (later) the web client. */

export type Id = string;

export type EpochStatus = "running" | "succeeded" | "failed" | "cancelled";
/** One run of a phase. `n` is 1-based and monotonic per session; artifacts and tasks record the epoch that was latest when they were created. */
export interface Epoch { sessionId: Id; n: number; phase: string; status: EpochStatus; input: unknown; error: string | null; startedAt: string; endedAt: string | null }

export type WorkflowId = string;
export type WriteMode = "auto" | "full" | "editsOnly";

/** A shell command an agent ran (source fact; artifact `CommandRun`, verified). `test` is true when the profile's `isTestCommand` matches. `output` is capped at 256 KB. */
export interface CommandRunData { command: string; exitCode: number; durationMs: number; output: string; test: boolean }

/** A question the start box shows before a session exists; send the start request again with `answer` set to the index of the chosen option. An option with `cancel` abandons the start. */
export interface StartQuestion { question: string; options: { label: string; cancel?: true }[] }

/** A registry entry as the start box shows it: `/<id> <argHint>`, `description`. */
export interface WorkflowInfo { id: string; description: string; argHint: string }

/** Data of a `WorkflowStart` artifact: the request that started the session and the workflow chosen for it. */
export interface WorkflowStartData {
  via: "command" | "selector";
  workflow: WorkflowId;
  params: unknown;
  title: string;
  prompt: string;
  /** The start box selection later phases reuse: the model for investigate and review, and how much the implement agent may do. */
  llm?: LlmSelection;
  writeMode?: WriteMode;
}

/** One choice of a `Decision`. `takesText`: the user may add text; `requiresText`: the text is mandatory; `textPattern`: source of a regular expression the text must match; `defaultText`: text the UI prefills; `takesModel`: the answer carries the LLM selection to use for the work that follows (`chosen.llm`). */
export interface DecisionOption { id: string; label: string; takesText?: boolean; requiresText?: boolean; textPattern?: string; defaultText?: string; takesModel?: boolean }

/** Data of a `Decision` artifact: a question a workflow asked after the epoch the artifact is stamped with. `chosen` is null while it is open. The user's answer is a new verified version linked `revises →` the open one; a rule's answer is stored already chosen, with its reason. */
export interface DecisionData { question: string; options: DecisionOption[]; chosen: { option: string; by: "user" | "rule"; text?: string; reason?: string; llm?: LlmSelection } | null }

/** Data of a `SelectorQuestion` artifact: the workflow selector could not choose and asks the user; `prompt` is the request it was given, `round` counts questions so far (1-based). */
export interface SelectorQuestionData {
  prompt: string;
  question: string;
  round: number;
  writeMode?: WriteMode;
}

/** Data of a `SelectorAnswer` artifact: the user's answer to a `SelectorQuestion`. */
export interface SelectorAnswerData {
  question: Id;
  text: string;
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
export interface HealthResponse { app: "spatial"; ui: boolean; pid: number; commit: string | null; runningTasks: number }

/** `GET /api/repo?path=`: the repo containing `path` and all its sessions (any worktree), newest first. */
export interface RepoInfo { worktree: string; repoDir: string; name: string; sessions: Session[] }

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

/** A location in a specification, optionally narrowed to a step path. */
export interface SpecSite { spec: string; anchor: string; step_path?: number[] }
/** An effect extracted from a specification algorithm. */
export interface SpecEffect { id: string; kind: string; params: Record<string, string | number | boolean | null>; execution: string[]; location?: SpecSite & { url: string }; other_locations?: (SpecSite & { url: string })[]; additional_locations?: number }
/** Coverage and extraction status for a section's effects. */
export interface SpecEffectsStatus { state: string; semantics: string; coverage?: string; issues: string[]; omitted: number }
/** A specification section with its extracted effects and content hash. */
export interface SpecSection { spec: string; anchor: string; title: string; type: string; url: string; content: string; outgoingRefs: number; effects: SpecEffect[]; effectsStatus: SpecEffectsStatus; sha: string }
/** A specification section matching a search phrase. */
export interface SpecSearchResult { spec: string; anchor: string; title: string; type: string; snippet: string }
/** An IDL member as webspec-index knows it. */
export interface SpecIdlMember { spec: string; anchor: string; kind: string; name: string; owner: string; canonicalName: string }
/** One hop in an effect witness path. */
export interface SpecHop { from: SpecSite; to: SpecSite; site: SpecSite }
/** Effects and their witness paths. */
export interface SpecEffectPaths { effects: SpecEffect[]; explanations: { effectId: string; witnesses: SpecHop[][] }[] }

export interface GeckoSpecRef {
  group: string;
  path: string;
  line: number;
  url: string;
}

/** One scope enclosing a source line (`searchfox-cli --function-at`): its Searchfox symbol and the first line of its definition. */
export interface CodeScope { symbol: string; signature: string }

/** A browser engine whose source the runtime can search. */
export type Engine = "gecko" | "blink" | "webkit";

/** Resolved inline code links pinned to a patch's upstream revision. */
export interface CodeLinksData { rev: string; links: Record<string, string | null> }

export type SequenceStatus = "new" | "changed" | "existing" | "removed";
/** A cited line: 1-based `line` of `path` in the commit's tree (in its parent's tree for `before` steps). */
export interface DiagramCite { path: string; line: number }
/** One call between lanes (`from === to` for a self step). The runtime sets `verified`, `text` (the matched source line, trimmed) and moves `cite.line` to the matched line. */
export interface SequenceStep { from: string; to: string; symbol: string; call: string; what: string; when: string | null; guard: string | null; phase: string | null; status: SequenceStatus; cite: DiagramCite; verified: boolean; text: string | null }
export interface SequenceLane { id: string; label: string; note: string | null }
/** Data of a `Diagram` artifact (status `proposed`), linked `derivedFrom → assistant ChatMessage`. `before` is the parent commit's flow, null for a new flow. */
export interface DiagramData { kind: "sequence"; commit: string; commitIndex: number; title: string; summary: string; lanes: SequenceLane[]; steps: SequenceStep[]; before: SequenceStep[] | null }



/** Full snapshot of one session; the web client's only data source besides events. */
export interface SessionState {
  session: Session;
  artifacts: Artifact[];
  links: Link[];
  tasks: TaskRecord[];
  epochs: Epoch[];
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
export interface McpServerData { server: string }

/** A user-authored note attached to a session request. */
export interface NoteData { body: string }

export type ChangeStatus = "unchanged" | "modified" | "new";


/** Receipt of a posted Phabricator inline. Linked `about → commentId`. Provenance: runtime. */
export interface PostedCommentData { comment: Id; revision: number; diff: number; inlineId: number }
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
  /** Per stack commit, in commit order: a short phrase naming the runtime flow a sequence diagram would explain, or null. Present for stacks only. */
  flowHints?: (string | null)[];
  /** Previous epoch's narrative; present when this narrative describes what changed since it. */
  previous?: Id;
}
