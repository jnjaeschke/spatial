import type {
  Actor, Artifact, ArtifactStatus, Commit, DecisionData, Epoch, EpochStatus, GeckoSpecRef, Id, Link, LinkKind, LlmSelection, Progress, Ref, ResolvedSpec, RuntimeEvent,
} from "../shared/types.ts";
import type { LlmPrompt, LlmRunResult, LlmService, McpServerSpec } from "./llm/types.ts";
import type { Store } from "./store.ts";
import { renderRef, searchDocs, sessionOverview, sessionView, workflowView, type SessionView, type WorkflowView } from "./render-ref.ts";
import type { RepoContext, RepoSkill } from "./repo-context.ts";
import { pluginRegistry, type Plugin, type PluginRegistry, type RepoProfile, type Step, type Workflow } from "./plugins.ts";

/** webspec-index's verdict on one Step comment: `line` is 1-based, `step` dotted ("4.2"), `url` the spec link whose scope the comment is in. */
export interface StepCommentCheck { line: number; step: string; text: string; result: "exact" | "fuzzy" | "mismatch" | "not_found"; url: string }

export interface WebspecCapability {
  readonly effect: "read-only";
  resolve(url: string, signal: AbortSignal): Promise<{ found: true; spec: ResolvedSpec } | { found: false; reason: string }>;
  /** Step comments of a source file checked against the spec algorithms it links (`webspec-index analyze`, as its LSP does). `name` is the file's base name. */
  analyze(name: string, text: string, signal: AbortSignal): Promise<StepCommentCheck[]>;
}

export interface SearchfoxCapability {
  readonly effect: "read-only";
  /** Resolve a symbol to its definition at Searchfox's current indexed revision. Network. */
  define(symbol: string, signal: AbortSignal): Promise<{ path: string; line: number; text: string } | null>;
  /** Existing Gecko lines referencing a spec section. Network. */
  specRefs(url: string, signal: AbortSignal): Promise<GeckoSpecRef[]>;
  /** Searchfox repository base and indexed revision; cached after first success. Network. */
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
  repo: string;
  signal: AbortSignal;
  git: GitCapability;
  webspec: WebspecCapability;
  searchfox: SearchfoxCapability;
  llm: { run(prompt: LlmPrompt, selection?: LlmSelection): Promise<LlmRunResult> };
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
  constructor(taskId: Id, message: string) {
    super(message);
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

export interface RuntimeOptions {
  store: Store;
  plugins: Plugin[];
  llm: LlmService;
  git: (repo: string) => GitCapability;
  webspec: WebspecCapability;
  searchfox: SearchfoxCapability;
  sessionMcp?: (sessionId: Id) => Record<string, McpServerSpec>;
  /** Called once at task start to load repo MCP servers, skills, and instructions. Defaults to an empty context. */
  repoContext?: (repo: string) => RepoContext;
}

export type Listener = (e: RuntimeEvent) => void;

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
  #sessionMcp: (sessionId: Id) => Record<string, McpServerSpec>;
  #repoContext: (repo: string) => RepoContext;
  #running = new Map<Id, AbortController>();
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
    const def = this.#tasks.get(kind);
    if (!def) throw new Error(`Unknown task kind: ${kind}`);
    const session = this.#store.getSession(sessionId);
    const task = this.#store.createTask({ sessionId, kind, input });
    const controller = new AbortController();
    this.#running.set(task.id, controller);
    const actor: Actor = `task:${task.id}`;
    const emit = (type: string, payload: unknown) => this.emit(sessionId, actor, type, payload);

    const ctx: TaskContext = {
      sessionId,
      taskId: task.id,
      repo: session.worktree,
      signal: controller.signal,
      git: this.#git(session.worktree),
      webspec: this.#webspec,
      searchfox: this.#searchfox,
      llm: {
        run: async (prompt, selection) => {
          const r = await this.#llm.run(selection, prompt, controller.signal);
          emit("llm.usage", { selection: r.selection, usage: r.usage ?? null });
          return r;
        },
      },
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
        throw new TaskFailedError(task.id, message);
      } finally {
        this.#running.delete(task.id);
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
    return this.#executePhase(phase, sessionId, input, epoch);
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
    return this.#executePhase(phase, sessionId, retry.input, retry);
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

  /** Runs the steps `nextStep` returns until it returns null. A run step is `runPhase` (a failing phase rejects and stops the loop; Retry reruns it and advances again). A decision step is stored as a `Decision` artifact once per (question, epoch): a chosen one continues the loop, an open one waits for the user. */
  async advance(sessionId: Id): Promise<void> {
    for (;;) {
      const step = this.nextStep(sessionId);
      if (step === null) return;
      if ("run" in step) { await this.runPhase(sessionId, step.run, step.input); continue; }
      const { question, options } = step.decide;
      const epoch = step.epoch ?? this.#store.listEpochs(sessionId).at(-1)?.n ?? null;
      const latest = this.#store.listArtifacts(sessionId, "Decision").at(-1) as Artifact<DecisionData> | undefined;
      if (latest && latest.epoch === epoch && latest.data.question === question) {
        if (latest.data.chosen) throw new Error(`Session ${sessionId} asked "${question}" again after it was answered`);
        return;
      }
      if (step.chosen && !options.some((option) => option.id === step.chosen!.option)) throw new Error(`Session ${sessionId} chose unknown option ${step.chosen.option}`);
      const chosen = step.chosen ? { option: step.chosen.option, by: "rule" as const, reason: step.chosen.reason } : null;
      const decision = this.#store.putArtifact<DecisionData>({ sessionId, type: "Decision", status: chosen ? "verified" : "proposed", epoch, data: { question, options, chosen }, provenance: { taskId: "runtime" } });
      this.emit(sessionId, "runtime", "artifact.created", { artifactId: decision.id, type: "Decision" });
      if (!chosen) return;
    }
  }

  runningEpoch(sessionId: Id): Epoch | null {
    return this.#store.listEpochs(sessionId).filter((epoch) => epoch.status === "running").at(-1) ?? null;
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
