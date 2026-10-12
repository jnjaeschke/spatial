import { AsyncLocalStorage } from "node:async_hooks";
import type {
  Actor, Artifact, ArtifactStatus, CodeScope, Commit, DecisionData, Engine, Epoch, EpochStatus, GeckoSpecRef, Id, Link, LinkKind, LlmSelection, Progress, Ref, ResolvedSpec, RuntimeEvent, SpecEffectPaths, SpecIdlMember, SpecSearchResult, SpecSection, TaskRecord,
} from "../shared/types.ts";
import type { LlmPrompt, LlmRunResult, LlmService, McpServerSpec } from "./llm/types.ts";
import type { Store } from "./store.ts";
import { renderRef, searchDocs, sessionOverview, sessionView, workflowView, type SessionView, type WorkflowView } from "./render-ref.ts";
import type { RepoContext, RepoSkill } from "./repo-context.ts";
import { pluginRegistry, type Plugin, type PluginRegistry, type RepoProfile, type Step, type Workflow } from "./plugins.ts";
import { KnowledgeStore, type Knowledge } from "./knowledge.ts";
import { missingCodeSearch, type CodeSearch } from "./code-search.ts";
import { searchfoxCodeSearch } from "./searchfox.ts";

/** webspec-index's verdict on one Step comment: `line` is 1-based, `step` dotted ("4.2"), `url` the spec link whose scope the comment is in. */
export interface StepCommentCheck { line: number; step: string; text: string; result: "exact" | "fuzzy" | "mismatch" | "not_found"; url: string }

/** A read-only webspec-index lookup whose text output goes to an LLM tool. */
export type WebspecLookup =
  | { command: "query"; ref: string; steps: string | null }
  | { command: "refs"; ref: string; direction: "incoming" | "outgoing"; limit: number }
  | { command: "effects"; ref: string; step: string | null }
  | { command: "flow"; ref: string }
  | { command: "state"; selector: string };

export interface WebspecCapability {
  readonly effect: "read-only";
  /** Text output of a read-only lookup for LLM tools: markdown for `query` and `state`, JSON for `refs` and `effects` (compact), a mermaid chart for `flow`. */
  lookup(request: WebspecLookup, signal: AbortSignal): Promise<string>;
  resolve(url: string, signal: AbortSignal): Promise<{ found: true; spec: ResolvedSpec } | { found: false; reason: string }>;
  /** One section (`webspec-index query <ref>`); `ref` is a `SPEC#anchor` or a spec URL. */
  query(ref: string, signal: AbortSignal): Promise<{ found: true; section: SpecSection } | { found: false; reason: string }>;
  /** Sections matching a phrase, best first. */
  search(phrase: string, signal: AbortSignal): Promise<SpecSearchResult[]>;
  /** Sections whose steps link `ref` (`incoming`) and that `ref`'s steps link (`outgoing`), as `SPEC#anchor` refs without repeats (`webspec-index refs <ref> --kind step`). */
  refs(ref: string, signal: AbortSignal): Promise<{ incoming: string[]; outgoing: string[] }>;
  /** IDL members matching a query, `SPEC#anchor` or URL (`webspec-index idl`); empty when the section is no IDL member. */
  idl(query: string, signal: AbortSignal): Promise<SpecIdlMember[]>;
  /** The effects of `ref` with their witness paths: of one effect, or of all of them when `effectId` is null. */
  effectPaths(ref: string, effectId: string | null, signal: AbortSignal): Promise<SpecEffectPaths>;
  /** Step comments of a source file checked against the spec algorithms it links (`webspec-index analyze`, as its LSP does). `name` is the file's base name. */
  analyze(name: string, text: string, signal: AbortSignal): Promise<StepCommentCheck[]>;
}

export interface SearchfoxCapability {
  readonly effect: "read-only";
  /** Resolve a symbol to its definition at Searchfox's current indexed revision. Network. */
  define(symbol: string, signal: AbortSignal): Promise<{ path: string; line: number; text: string } | null>;
  /** Existing Gecko lines referencing a spec section, at most `limit` (default 30); Searchfox matches fragments as prefixes. Network. */
  specRefs(url: string, signal: AbortSignal, limit?: number): Promise<GeckoSpecRef[]>;
  /** Lines whose text matches `query` (case-insensitive), at most `limit` (default 30). Network. */
  search(query: string, signal: AbortSignal, limit?: number): Promise<{ path: string; line: number; snippet: string }[]>;
  /** The scopes enclosing a line, innermost first; empty at file scope. Network. */
  functionAt(path: string, line: number, signal: AbortSignal): Promise<CodeScope[]>;
  /** A file's text at Searchfox's current indexed revision. Network. */
  file(path: string, signal: AbortSignal): Promise<string>;
  /** Searchfox repository base and indexed revision; cached for at most an hour after success. Network. */
  tip(): Promise<{ repoBase: string; rev: string }>;
}

export interface BlameEntry { line: number; sha: string; origLine: number; path: string }

/** Read-only git access bound to one session's repo. */
export interface GitCapability {
  readonly effect: "read-only";
  /** True when `git status` reports staged, unstaged or untracked (non-ignored) changes. Never writes: runs with `--no-optional-locks`, so the index file is not refreshed. */
  isDirty(): Promise<boolean>;
  /** Resolves any revspec to a full commit SHA. */
  resolve(rev: string): Promise<string>;
  isAncestor(ancestor: string, descendant: string): Promise<boolean>;
  mergeBase(a: string, b: string): Promise<string | null>;
  /** Local and remote-tracking `main`/`master` branches (full ref names). */
  mainlineRefs(): Promise<string[]>;
  /** Commits in `base..head`, oldest first. */
  log(baseSha: string, headSha: string): Promise<Commit[]>;
  /** Raw `git diff` text for `base..head`. */
  diff(baseSha: string, headSha: string): Promise<string>;
  /** `git blame --porcelain`; line is in `rev` for forward, in `base` for reverse. */
  blame(baseSha: string, rev: string, file: string, direction: "forward" | "reverse"): Promise<BlameEntry[]>;
  /** Replays `oldBase..oldHead` onto `newBase` (`git merge-tree --write-tree`). `tree` is the resulting tree id; it contains conflict markers for `conflicts` (paths, possibly empty). Writes only unreachable objects. */
  replay(oldBase: string, newBase: string, oldHead: string): Promise<{ tree: string; conflicts: string[] }>;
  /** File content at a commit. */
  show(sha: string, path: string): Promise<string>;
  /** Which of `words` occur as whole words in some text file of the tree at `rev` (`git grep -w -F`, one call). */
  wordsAt(rev: string, words: string[]): Promise<Set<string>>;
}

/** Everything a task may touch. Tasks get capabilities only through this. */
export interface TaskContext {
  sessionId: Id;
  taskId: Id;
  /** The epoch the task started in; null outside a phase run. */
  epoch: number | null;
  /** Identity of the session's repository (`Session.repoDir`): the scope of per-repo knowledge. */
  repoDir: string;
  repo: string;
  signal: AbortSignal;
  git: GitCapability;
  webspec: WebspecCapability;
  searchfox: SearchfoxCapability;
  /** The knowledge store, read-only: tasks return proposals, plugin runtime code writes them. */
  knowledge: Pick<Knowledge, "get" | "list">;
  /** Read-only code search per engine. */
  codeSearch: Record<Engine, CodeSearch>;
  llm: { run(prompt: LlmPrompt, selection?: LlmSelection): Promise<LlmRunResult>; readonly defaultSelection: LlmSelection };
  /** Runs a child task: it records this task as its parent, is cancelled with it, and its failure rejects here. */
  run<O = unknown>(kind: string, input: unknown): Promise<O>;
  sessionMcp: Record<string, McpServerSpec>;
  /** Repo-specific MCP servers from .mcp.json, deny-filtered. Empty when no .mcp.json exists. */
  repoMcp: Record<string, McpServerSpec>;
  /** Denylisted repo MCP server specs that can be requested for a chat thread. */
  repoRequestableMcp: Record<string, McpServerSpec>;
  /** Repo skills available through the session MCP server. */
  repoSkills: RepoSkill[];
  /** Repo instructions from AGENTS.md or CLAUDE.md, if present. */
  repoInstructions: string | null;
  artifacts: {
    put<T>(type: string, status: ArtifactStatus, data: T, llm?: LlmSelection): Artifact<T>;
    get<T>(id: Id): Artifact<T>;
    linkedTo(to: Ref, kind: LinkKind): Artifact[];
    view(): SessionView;
    render(ref: Ref): string;
    overview(): string;
  };
  workflows: ReadonlyMap<string, Workflow<any>>;
  repoProfiles: ReadonlyMap<string, RepoProfile>;
  chat: { context(view: SessionView): string[]; replyFields: PluginRegistry["chatReplyFields"] };
  links: { put(from: Ref, to: Ref, kind: LinkKind): Link };
  progress(p: Progress): void;
  events: {
    /** The last `limit` progress lines task `taskId` of this session reported, oldest first. */
    recent(taskId: Id, limit: number): string[];
  };
}

export interface TaskDefinition<I, O> {
  kind: string;
  run(ctx: TaskContext, input: I): Promise<O>;
}

export function defineTask<I, O>(def: TaskDefinition<I, O>): TaskDefinition<I, O> {
  return def;
}

export class TaskFailedError extends Error {
  taskId: Id;
  /** `cause` is the error the task threw. */
  constructor(taskId: Id, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TaskFailedError";
    this.taskId = taskId;
  }
}

export class TaskCancelledError extends Error {
  taskId: Id;
  constructor(taskId: Id) {
    super(`Task ${taskId} cancelled`);
    this.name = "TaskCancelledError";
    this.taskId = taskId;
  }
}

/** A unit of work in a workflow; each run is one epoch. `run` orchestrates tasks; throwing fails the epoch. `next` is what the phase still needs after its epoch succeeded, while that epoch is the latest: a decision or a follow-up phase; null when the phase is done. `Runtime.advance` asks it before the workflow's `next`, in any workflow. */
export interface Phase<I> { id: string; run(rt: Runtime, sessionId: Id, input: I, epoch: Epoch): Promise<void>; next?(view: WorkflowView, epoch: Epoch): Step | null }

export class PhaseBusyError extends Error {
  constructor(id: Id, epoch: Epoch) {
    super(`Session ${id} is running epoch ${epoch.n} (${epoch.phase})`);
    this.name = "PhaseBusyError";
  }
}

/** A start refused because an active task already does the same work (`Runtime.activeTask`); the HTTP shell answers 409. */
export class BusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusyError";
  }
}

export interface RuntimeOptions {
  store: Store;
  plugins: Plugin[];
  llm: LlmService;
  git: (repo: string) => GitCapability;
  webspec: WebspecCapability;
  searchfox: SearchfoxCapability;
  /** Code search per engine; Gecko defaults to `searchfox`, engines without a tool to a code search that fails every call. */
  codeSearch?: Partial<Record<Engine, CodeSearch>>;
  /** Plugin data that outlives sessions; defaults to an in-memory store. */ knowledge?: Knowledge;
  sessionMcp?: (sessionId: Id) => Record<string, McpServerSpec>;
  /** Called once at task start to load repo MCP servers, skills, and instructions. Defaults to an empty context. */
  repoContext?: (repo: string) => RepoContext;
}

export type Listener = (e: RuntimeEvent) => void;
/** The top-level tasks a running epoch's phase started; `Runtime.cancelEpoch` aborts them. */
interface EpochRun { sessionId: Id; tasks: Map<Id, AbortController>; settled: Promise<void> }
/** Carries the running epoch to every task its phase starts, however deep in async calls: a task started from a route during the epoch is not the epoch's. */
const epochRun = new AsyncLocalStorage<EpochRun>();
const progressText = (p: Progress): string | null => p.kind === "steps" ? `${p.step} (${p.index}/${p.count})` : p.message ?? null;

export class Runtime {
  #store: Store;
  #tasks: Map<string, TaskDefinition<any, any>>;
  #phases: Map<string, Phase<any>>;
  readonly plugins: PluginRegistry;
  readonly workflows: ReadonlyMap<string, Workflow<any>>;
  #llm: LlmService;
  #git: (repo: string) => GitCapability;
  #webspec: WebspecCapability;
  #searchfox: SearchfoxCapability;
  #codeSearch: Record<Engine, CodeSearch>;
  #knowledge: Knowledge;
  #sessionMcp: (sessionId: Id) => Record<string, McpServerSpec>;
  #repoContext: (repo: string) => RepoContext;
  #running = new Map<Id, AbortController>();
  #epochRuns = new Map<Id, EpochRun>();
  #listeners = new Set<Listener>();

  constructor(opts: RuntimeOptions) {
    this.#store = opts.store;
    this.plugins = pluginRegistry(opts.plugins);
    this.workflows = this.plugins.workflows;
    this.#tasks = this.plugins.tasks;
    this.#phases = this.plugins.phases;
    for (const id of this.#store.unindexedArtifactIds()) {
      const artifact = this.#store.getArtifact(id);
      this.#store.putSearchDocs(artifact.sessionId, artifact.id, searchDocs(this.plugins.artifactKinds, sessionView(this.#store, artifact.sessionId), artifact));
    }
    this.#llm = opts.llm;
    this.#git = opts.git;
    this.#webspec = opts.webspec;
    this.#searchfox = opts.searchfox;
    this.#codeSearch = { gecko: searchfoxCodeSearch("gecko", opts.searchfox), blink: missingCodeSearch("blink"), webkit: missingCodeSearch("webkit"), ...opts.codeSearch };
    this.#knowledge = opts.knowledge ?? new KnowledgeStore(":memory:");
    this.#sessionMcp = opts.sessionMcp ?? (() => ({}));
    this.#repoContext = opts.repoContext ?? (() => ({ mcpServers: {}, requestableMcpServers: {}, skills: [], instructions: null }));
  }

  get store(): Store {
    return this.#store;
  }

  get llm(): LlmService {
    return this.#llm;
  }

  get searchfox(): SearchfoxCapability {
    return this.#searchfox;
  }

  /** Read-only code search per engine, for server code outside tasks. */
  get codeSearch(): Record<Engine, CodeSearch> {
    return this.#codeSearch;
  }

  /** Plugin data that outlives sessions. */
  get knowledge(): Knowledge {
    return this.#knowledge;
  }

  /** Read-only git for server queries outside tasks. */
  gitFor(sessionId: Id): GitCapability {
    return this.#git(this.#store.getSession(sessionId).worktree);
  }

  onEvent(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  emit(sessionId: Id, actor: Actor, type: string, payload: unknown): RuntimeEvent {
    const e = this.#store.appendEvent({ sessionId, actor, type, payload });
    for (const l of this.#listeners) l(e);
    return e;
  }

  /**
   * Starts a task and returns immediately. `done` rejects with TaskFailedError or
   * TaskCancelledError; callers that do not await it must attach a rejection handler.
   */
  start<O = unknown>(sessionId: Id, kind: string, input: unknown): { taskId: Id; done: Promise<O> } {
    return this.#start<O>(sessionId, kind, input, null);
  }

  #start<O>(sessionId: Id, kind: string, input: unknown, parent: { id: Id; signal: AbortSignal } | null): { taskId: Id; done: Promise<O> } {
    const def = this.#tasks.get(kind);
    if (!def) throw new Error(`Unknown task kind: ${kind}`);
    const session = this.#store.getSession(sessionId);
    const task = this.#store.createTask({ sessionId, kind, input, ...(parent ? { parentId: parent.id } : {}) });
    const controller = new AbortController();
    const abort = () => controller.abort();
    parent?.signal.addEventListener("abort", abort, { once: true });
    this.#running.set(task.id, controller);
    const scope = parent === null ? epochRun.getStore() : undefined;
    const owner = scope?.sessionId === sessionId ? scope : undefined;
    owner?.tasks.set(task.id, controller);
    const actor: Actor = `task:${task.id}`;
    const emit = (type: string, payload: unknown) => this.emit(sessionId, actor, type, payload);

    const ctx: TaskContext = {
      sessionId,
      taskId: task.id,
      epoch: task.epoch,
      repoDir: session.repoDir,
      repo: session.worktree,
      signal: controller.signal,
      git: this.#git(session.worktree),
      webspec: this.#webspec,
      searchfox: this.#searchfox,
      knowledge: {
        get: (scope, namespace, key) => this.#knowledge.get(scope, namespace, key),
        list: (scope, namespace, keyPrefix) => this.#knowledge.list(scope, namespace, keyPrefix),
      },
      codeSearch: Object.freeze({ ...this.#codeSearch }),
      llm: {
        run: async (prompt, selection) => {
          const r = await this.#llm.run(selection, prompt, controller.signal);
          emit("llm.usage", { selection: r.selection, usage: r.usage ?? null });
          return r;
        },
        defaultSelection: this.#llm.defaultSelection,
      },
      run: <C,>(childKind: string, childInput: unknown) => this.#start<C>(sessionId, childKind, childInput, { id: task.id, signal: controller.signal }).done,
      sessionMcp: this.#sessionMcp(sessionId),
      repoMcp: {},
      repoRequestableMcp: {},
      repoSkills: [],
      repoInstructions: null,
      artifacts: {
        put: (type, status, data, llm) => {
          const a = this.#store.putArtifact({ sessionId, type, status, data, provenance: llm ? { taskId: task.id, llm } : { taskId: task.id } });
          this.#store.putSearchDocs(sessionId, a.id, searchDocs(this.plugins.artifactKinds, sessionView(this.#store, sessionId), a));
          emit("artifact.created", { artifactId: a.id, type });
          return a;
        },
        get: (id) => this.#store.getArtifact(id),
        linkedTo: (to, linkKind) =>
          this.#store.listLinks(sessionId).filter((l) => l.to === to && l.kind === linkKind).map((l) => this.#store.getArtifact(l.from)),
        view: () => sessionView(this.#store, sessionId),
        render: (ref) => renderRef(this.plugins.artifactKinds, sessionView(this.#store, sessionId), ref),
        overview: () => sessionOverview(this.plugins, sessionView(this.#store, sessionId)).join("\n\n"),
      },
      workflows: this.workflows,
      repoProfiles: this.plugins.repoProfiles,
      chat: {
        context: (view) => this.plugins.chatContext.map((provide) => provide(view)).filter((value): value is string => Boolean(value)),
        replyFields: this.plugins.chatReplyFields,
      },
      links: {
        put: (from, to, linkKind) => {
          const l = this.#store.putLink({ sessionId, from, to, kind: linkKind });
          if (linkKind === "revises") {
            const target = this.#store.getArtifact(to);
            this.#store.putSearchDocs(sessionId, target.id, searchDocs(this.plugins.artifactKinds, sessionView(this.#store, sessionId), target));
          }
          emit("link.created", { linkId: l.id, from, to, kind: linkKind });
          return l;
        },
      },
      progress: (p) => emit("task.progress", { taskId: task.id, progress: p }),
      events: { recent: (recentTaskId, limit) => this.#store.listTaskProgress(sessionId, recentTaskId, limit).flatMap((p) => progressText(p) ?? []) },
    };

    this.#store.updateTask(task.id, { status: "running" });
    emit("task.started", { taskId: task.id, kind, input });

    const done = (async () => {
      try {
        const repoContext = this.#repoContext(session.worktree);
        ctx.repoMcp = repoContext.mcpServers;
        ctx.repoRequestableMcp = repoContext.requestableMcpServers;
        ctx.repoSkills = repoContext.skills;
        ctx.repoInstructions = repoContext.instructions;
        const output = await def.run(ctx, input);
        if (controller.signal.aborted) throw controller.signal.reason;
        this.#store.updateTask(task.id, { status: "succeeded", output });
        emit("task.succeeded", { taskId: task.id, output });
        return output as O;
      } catch (e) {
        if (controller.signal.aborted) {
          this.#store.updateTask(task.id, { status: "cancelled" });
          emit("task.cancelled", { taskId: task.id });
          throw new TaskCancelledError(task.id);
        }
        const message = e instanceof Error ? e.message : String(e);
        this.#store.updateTask(task.id, { status: "failed", error: message });
        emit("task.failed", { taskId: task.id, error: message });
        throw new TaskFailedError(task.id, message, { cause: e });
      } finally {
        parent?.signal.removeEventListener("abort", abort);
        this.#running.delete(task.id);
        owner?.tasks.delete(task.id);
      }
    })();
    return { taskId: task.id, done };
  }

  run<O = unknown>(sessionId: Id, kind: string, input: unknown): Promise<O> {
    return this.start<O>(sessionId, kind, input).done;
  }

  /** Opens the next epoch and runs the phase in it. Throws synchronously (`PhaseBusyError`) while another epoch runs. Resolves to the finished epoch (also when cancelled); rejects with the phase's error after marking the epoch failed. */
  runPhase(sessionId: Id, phaseId: string, input: unknown): Promise<Epoch> {
    const phase = this.#phases.get(phaseId);
    if (!phase) throw new Error(`Unknown phase: ${phaseId}`);
    const running = this.runningEpoch(sessionId);
    if (running) throw new PhaseBusyError(sessionId, running);
    const epoch = this.#store.createEpoch(sessionId, phaseId, input);
    this.emit(sessionId, "runtime", "epoch.started", { n: epoch.n, phase: epoch.phase });
    return this.#launch(phase, sessionId, input, epoch);
  }

  /** Reruns the latest epoch, which must have failed or been cancelled, in place with its stored input; otherwise like `runPhase`. */
  retryPhase(sessionId: Id): Promise<Epoch> {
    const epoch = this.#store.listEpochs(sessionId).at(-1);
    if (!epoch || (epoch.status !== "failed" && epoch.status !== "cancelled")) throw new Error("Latest epoch did not fail");
    const phase = this.#phases.get(epoch.phase);
    if (!phase) throw new Error(`Unknown phase: ${epoch.phase}`);
    const running = this.runningEpoch(sessionId);
    if (running) throw new PhaseBusyError(sessionId, running);
    const retry = this.#store.updateEpoch(sessionId, epoch.n, { status: "running", error: null });
    this.emit(sessionId, "runtime", "epoch.started", { n: retry.n, phase: retry.phase });
    return this.#launch(phase, sessionId, retry.input, retry);
  }

  /** The step `advance` would take now: the follow-up of the latest epoch's phase when that epoch succeeded, else the workflow's `next`; null when neither has one. */
  nextStep(sessionId: Id): Step | null {
    const session = this.#store.getSession(sessionId);
    const workflow = session.workflow ? this.workflows.get(session.workflow) : undefined;
    const view = workflowView(this.#store, sessionId);
    const last = view.epochs.at(-1);
    const followUp = last?.status === "succeeded" ? this.#phases.get(last.phase)?.next?.(view, last) ?? null : null;
    return followUp ?? workflow?.next?.(view, { repoProfiles: this.plugins.repoProfiles }) ?? null;
  }

  /** Runs the steps `nextStep` returns until it returns null. A run step is `runPhase` (a failing phase rejects and stops the loop; Retry reruns it and advances again). A decision step is stored as a `Decision` artifact once per (key, epoch): a chosen one continues the loop, an open one waits for the user. */
  async advance(sessionId: Id): Promise<void> {
    for (;;) {
      const step = this.nextStep(sessionId);
      if (step === null) return;
      if ("run" in step) { await this.runPhase(sessionId, step.run, step.input); continue; }
      const { key, question, options } = step.decide;
      const epoch = step.epoch ?? this.#store.listEpochs(sessionId).at(-1)?.n ?? null;
      const latest = this.#store.listArtifacts(sessionId, "Decision").at(-1) as Artifact<DecisionData> | undefined;
      if (latest && latest.epoch === epoch && latest.data.key === key) {
        if (latest.data.chosen) throw new Error(`Session ${sessionId} asked decision "${key}" again after it was answered`);
        return;
      }
      if (step.chosen && !options.some((option) => option.id === step.chosen!.option)) throw new Error(`Session ${sessionId} chose unknown option ${step.chosen.option}`);
      const chosen = step.chosen ? { option: step.chosen.option, by: "rule" as const, reason: step.chosen.reason } : null;
      const decision = this.#store.putArtifact<DecisionData>({ sessionId, type: "Decision", status: chosen ? "verified" : "proposed", epoch, data: { key, question, options, chosen }, provenance: { taskId: "runtime" } });
      this.emit(sessionId, "runtime", "artifact.created", { artifactId: decision.id, type: "Decision" });
      if (!chosen) return;
    }
  }

  /** The pending or running task of `kind`, in any session, whose input `matches`; null when there is none. Checked synchronously before `start`, it makes the task the guard for work that runs once at a time across sessions. */
  activeTask(kind: string, matches: (input: unknown) => boolean): TaskRecord | null {
    return this.#store.listActiveTasks(kind).find((task) => matches(task.input)) ?? null;
  }

  runningEpoch(sessionId: Id): Epoch | null {
    return this.#store.listEpochs(sessionId).filter((epoch) => epoch.status === "running").at(-1) ?? null;
  }

  #launch(phase: Phase<unknown>, sessionId: Id, input: unknown, epoch: Epoch): Promise<Epoch> {
    const run: EpochRun = { sessionId, tasks: new Map(), settled: Promise.resolve() };
    this.#epochRuns.set(sessionId, run);
    const result = epochRun.run(run, () => this.#executePhase(phase, sessionId, input, epoch));
    run.settled = result.then(() => undefined, () => undefined);
    void run.settled.then(() => { if (this.#epochRuns.get(sessionId) === run) this.#epochRuns.delete(sessionId); });
    return result;
  }

  /** Cancels the top-level tasks the running epoch's phase started (their children go with them) and resolves with the epoch and those task ids once its phase has stopped. The epoch is `cancelled`, or has ended otherwise when the phase finished first. Rejects when no epoch runs or its phase has no running task. */
  async cancelEpoch(sessionId: Id): Promise<{ epoch: Epoch; taskIds: Id[] }> {
    const epoch = this.runningEpoch(sessionId), run = this.#epochRuns.get(sessionId);
    if (!epoch || !run) throw new Error(`Session ${sessionId} has no running epoch`);
    if (run.tasks.size === 0) throw new Error(`Epoch ${epoch.n} (${epoch.phase}) has no running task`);
    const taskIds = [...run.tasks.keys()];
    for (const controller of run.tasks.values()) controller.abort();
    await run.settled;
    return { epoch: this.#store.getEpoch(sessionId, epoch.n), taskIds };
  }

  async #executePhase(phase: Phase<unknown>, sessionId: Id, input: unknown, epoch: Epoch): Promise<Epoch> {
    try {
      await phase.run(this, sessionId, input, epoch);
      const done = this.#store.updateEpoch(sessionId, epoch.n, { status: "succeeded", error: null });
      this.emit(sessionId, "runtime", "epoch.succeeded", { n: done.n, phase: done.phase });
      return done;
    } catch (e) {
      if (e instanceof TaskCancelledError) {
        const done = this.#store.updateEpoch(sessionId, epoch.n, { status: "cancelled", error: e.message });
        this.emit(sessionId, "runtime", "epoch.cancelled", { n: done.n, phase: done.phase });
        return done;
      }
      const message = e instanceof Error ? e.message : String(e);
      const done = this.#store.updateEpoch(sessionId, epoch.n, { status: "failed", error: message });
      this.emit(sessionId, "runtime", "epoch.failed", { n: done.n, phase: done.phase, error: message });
      throw e;
    }
  }

  cancel(taskId: Id): void {
    const c = this.#running.get(taskId);
    if (!c) throw new Error(`Task ${taskId} is not running`);
    c.abort();
  }
}
