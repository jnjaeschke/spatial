import { AsyncLocalStorage } from "node:async_hooks";
import type {
  Actor, Artifact, ArtifactStatus, Commit, DecisionData, Epoch, Id, Link, LinkKind, LlmActivity, LlmSelection, Progress, Ref, RuntimeEvent, TaskRecord,
} from "../shared/types.ts";
import type { LlmEvent, LlmPrompt, LlmRunResult, LlmService, LlmUsage, McpServerSpec } from "./llm/types.ts";
import type { Store } from "./store.ts";
import { MAX_RESULT_OUTPUT } from "./llm/events.ts";
import { capOutput } from "./process.ts";
import { renderRef, searchDocs, sessionOverview, sessionView, workflowView, type SessionView, type WorkflowView } from "./render-ref.ts";
import type { RepoContext, RepoSkill } from "./repo-context.ts";
import { pluginRegistry, pluginServices, type Plugin, type PluginRegistry, type RepoProfile, type Step, type Workflow } from "./plugins.ts";
import { KnowledgeStore, type Knowledge } from "./knowledge.ts";
import { isActive } from "../shared/task-state.ts";

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
  /** Plugin services by plugin id (`Plugin.services`, or the `RuntimeOptions.services` override); plugins read their own through a typed accessor. */
  services: Readonly<Record<string, unknown>>;
  /** The knowledge store, read-only: tasks return proposals, plugin runtime code writes them. */
  knowledge: Pick<Knowledge, "get" | "list">;
  llm: { run(prompt: LlmPrompt, selection?: LlmSelection): Promise<LlmRunResult>; readonly defaultSelection: LlmSelection };
  /** Runs a child task: it records this task as its parent, is cancelled with it, and its failure rejects here. */
  run<O = unknown>(kind: string, input: unknown): Promise<O>;
  sessionMcp: Record<string, McpServerSpec>;
  /** Repo-specific MCP servers from .mcp.json, deny-filtered. Empty when no .mcp.json exists. */
  repoMcp: Record<string, McpServerSpec>;
  /** Session MCP servers followed by repo servers, with repo names taking precedence. */
  mcpServers(): Record<string, McpServerSpec>;
  /** Denylisted repo MCP server specs that can be requested for a chat thread. */
  repoRequestableMcp: Record<string, McpServerSpec>;
  /** Repo skills available through the session MCP server. */
  repoSkills: RepoSkill[];
  /** Repo instructions from AGENTS.md or CLAUDE.md, if present. */
  repoInstructions: string | null;
  artifacts: {
    put<T>(type: string, status: ArtifactStatus, data: T, llm?: LlmSelection): Artifact<T>;
    get<T>(id: Id): Artifact<T>;
    get<T>(id: Id, type: string): Artifact<T>;
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
  /** Adds to the task's activity log, beside its LLM runs' activity: for work the task does itself, such as a command the runtime runs. A result's output is capped like a reader's. */
  activity(activity: LlmActivity): void;
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
  /** `signal` is the calling task's: aborting it stops the capability's git work. */
  git: (repo: string, signal?: AbortSignal) => GitCapability;
  /** Per-plugin-id service objects that replace what `Plugin.services` would build (tests). */
  services?: Record<string, unknown>;
  /** Plugin data that outlives sessions; defaults to an in-memory store. */ knowledge?: Knowledge;
  sessionMcp?: (sessionId: Id) => Record<string, McpServerSpec>;
  /** MCP servers for LLM work in a repository before any session exists. */
  repoMcp?: (repo: string) => Record<string, McpServerSpec>;
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
  #git: (repo: string, signal?: AbortSignal) => GitCapability;
  readonly services: Readonly<Record<string, unknown>>;
  #knowledge: Knowledge;
  #sessionMcp: (sessionId: Id) => Record<string, McpServerSpec>;
  #repoMcp: (repo: string) => Record<string, McpServerSpec>;
  #repoContext: (repo: string) => RepoContext;
  #running = new Map<Id, AbortController>();
  /** The input senders of LLM runs that read live input, by task. */
  #live = new Map<Id, { sessionId: Id; send: (text: string) => void }>();
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
    this.services = pluginServices(opts.plugins, process.env, opts.services);
    this.#knowledge = opts.knowledge ?? new KnowledgeStore(":memory:");
    this.#sessionMcp = opts.sessionMcp ?? (() => ({}));
    this.#repoMcp = opts.repoMcp ?? (() => ({}));
    this.#repoContext = opts.repoContext ?? (() => ({ mcpServers: {}, requestableMcpServers: {}, skills: [], instructions: null }));
  }

  get store(): Store {
    return this.#store;
  }

  /** The only artifact write path outside the store; keeps the search index and event stream in step. */
  putArtifact<T>(actor: Actor, artifact: { sessionId: Id; type: string; status: ArtifactStatus; data: T; provenance: Artifact["provenance"]; epoch?: number | null }): Artifact<T> {
    const created = this.#store.putArtifact(artifact);
    this.#store.putSearchDocs(artifact.sessionId, created.id, searchDocs(this.plugins.artifactKinds, sessionView(this.#store, artifact.sessionId), created));
    this.emit(artifact.sessionId, actor, "artifact.created", { artifactId: created.id, type: created.type });
    return created;
  }

  /** The only link write path outside the store; keeps revised artifact search docs and the event stream in step. */
  putLink(actor: Actor, link: { sessionId: Id; from: Ref; to: Ref; kind: LinkKind }): Link {
    const created = this.#store.putLink(link);
    if (link.kind === "revises") {
      const target = this.#store.getArtifact(link.to);
      this.#store.putSearchDocs(link.sessionId, target.id, searchDocs(this.plugins.artifactKinds, sessionView(this.#store, link.sessionId), target));
    }
    this.emit(link.sessionId, actor, "link.created", { linkId: created.id, from: created.from, to: created.to, kind: created.kind });
    return created;
  }

  get llm(): LlmService {
    return this.#llm;
  }

  /** Plugin data that outlives sessions. */
  get knowledge(): Knowledge {
    return this.#knowledge;
  }

  /** The repo context (MCP servers, skills, instructions) of `repo`. */
  repoContext(repo: string): RepoContext {
    return this.#repoContext(repo);
  }

  /** What LLM work in `repo` gets before any session exists: the repo context and MCP servers that need no session. */
  repoLlmContext(repo: string): { context: RepoContext; mcpServers: Record<string, McpServerSpec> } {
    const context = this.#repoContext(repo);
    return { context, mcpServers: { ...this.#repoMcp(repo), ...context.mcpServers } };
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
      git: this.#git(session.worktree, controller.signal),
      services: this.services,
      knowledge: {
        get: (scope, namespace, key) => this.#knowledge.get(scope, namespace, key),
        list: (scope, namespace, keyPrefix) => this.#knowledge.list(scope, namespace, keyPrefix),
      },
      llm: {
        run: async (prompt, selection) => {
          let providerSessionId: string | undefined;
          let usage: LlmUsage | null = null;
          const onEvent = (event: LlmEvent) => {
            if (event.kind === "activity") emit("task.activity", { taskId: task.id, activity: event.activity });
            else if (event.kind === "session") providerSessionId = event.providerSessionId;
            else if (event.kind === "usage") usage = event.usage;
            prompt.onEvent?.(event);
          };
          const onLiveInput = (send: ((text: string) => void) | null) => { if (send) this.#live.set(task.id, { sessionId, send }); else this.#live.delete(task.id); };
          const resolved = selection ?? this.#llm.defaultSelection;
          try {
            const r = await this.#llm.run(resolved, { ...prompt, onEvent, ...(prompt.liveInput ? { onLiveInput } : {}) }, controller.signal);
            providerSessionId = r.providerSessionId;
            return r;
          }
          finally {
            this.#live.delete(task.id);
            // A failed or cancelled run is billed too; one the provider never started is not.
            if (providerSessionId !== undefined || usage) emit("llm.usage", { selection: resolved, providerSessionId, usage });
          }
        },
        defaultSelection: this.#llm.defaultSelection,
      },
      run: <C,>(childKind: string, childInput: unknown) => this.#start<C>(sessionId, childKind, childInput, { id: task.id, signal: controller.signal }).done,
      sessionMcp: this.#sessionMcp(sessionId),
      repoMcp: {},
      mcpServers() { return { ...this.sessionMcp, ...this.repoMcp }; },
      repoRequestableMcp: {},
      repoSkills: [],
      repoInstructions: null,
      artifacts: {
        put: (type, status, data, llm) => this.putArtifact(`task:${task.id}`, { sessionId, type, status, data, provenance: llm ? { taskId: task.id, llm } : { taskId: task.id } }),
        get: <T>(id: Id, type?: string): Artifact<T> => {
          const artifact = this.#store.getArtifact(id);
          if (type !== undefined && artifact.type !== type) throw new Error(`Artifact ${id} is not a ${type} (got ${artifact.type})`);
          return artifact as Artifact<T>;
        },
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
        put: (from, to, linkKind) => this.putLink(`task:${task.id}`, { sessionId, from, to, kind: linkKind }),
      },
      progress: (p) => emit("task.progress", { taskId: task.id, progress: p }),
      activity: (activity) => emit("task.activity", { taskId: task.id, activity: activity.kind === "tool-result" ? { ...activity, output: capOutput(activity.output, MAX_RESULT_OUTPUT) } : activity }),
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
      this.putArtifact<DecisionData>("runtime", { sessionId, type: "Decision", status: chosen ? "verified" : "proposed", epoch, data: { key, question, options, chosen }, provenance: { taskId: "runtime" } });
      if (!chosen) return;
    }
  }

  /** The pending or running task of `kind`, in any session, whose input `matches`; null when there is none. Checked synchronously before `start`, it makes the task the guard for work that runs once at a time across sessions. */
  activeTask(kind: string, matches: (input: unknown) => boolean): TaskRecord | null {
    return this.#store.listActiveTasks(kind).find((task) => matches(task.input)) ?? null;
  }

  /** Deletes the session and everything stored for it; refused while one of its tasks is pending or running. Its git branches and commits stay. */
  deleteSession(sessionId: Id): void {
    if (this.store.listTasks(sessionId).some(isActive)) throw new BusyError(`Session ${sessionId} has running work; cancel it first`);
    this.store.deleteSession(sessionId);
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

  /** Hands `text` to the session's LLM runs that read live input; the ids of their tasks, empty when none does right now. */
  sendLiveInput(sessionId: Id, text: string): Id[] {
    const runs = [...this.#live].filter(([, run]) => run.sessionId === sessionId);
    for (const [, run] of runs) run.send(text);
    return runs.map(([taskId]) => taskId);
  }

  cancel(taskId: Id): void {
    const c = this.#running.get(taskId);
    if (!c) throw new Error(`Task ${taskId} is not running`);
    c.abort();
  }
}
