import type {
  Actor, Artifact, ArtifactStatus, Commit, Id, Link, LinkKind, LlmSelection, Progress, Ref, RuntimeEvent,
} from "../shared/types.ts";
import type { LlmPrompt, LlmRunResult, LlmService } from "./llm/types.ts";
import type { Store } from "./store.ts";

/** Read-only git access bound to one session's repo. */
export interface GitCapability {
  readonly effect: "read-only";
  /** Resolves any revspec to a full commit SHA. */
  resolve(rev: string): Promise<string>;
  isAncestor(ancestor: string, descendant: string): Promise<boolean>;
  /** Commits in `base..head`, oldest first. */
  log(baseSha: string, headSha: string): Promise<Commit[]>;
  /** Raw `git diff` text for `base..head`. */
  diff(baseSha: string, headSha: string): Promise<string>;
  /** File content at a commit. */
  show(sha: string, path: string): Promise<string>;
}

/** Everything a task may touch. Tasks get capabilities only through this. */
export interface TaskContext {
  sessionId: Id;
  taskId: Id;
  repo: string;
  signal: AbortSignal;
  git: GitCapability;
  llm: { run(prompt: LlmPrompt, selection?: LlmSelection): Promise<LlmRunResult> };
  artifacts: {
    put<T>(type: string, status: ArtifactStatus, data: T, llm?: LlmSelection): Artifact<T>;
    get<T>(id: Id): Artifact<T>;
  };
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

export interface RuntimeOptions {
  store: Store;
  tasks: TaskDefinition<any, any>[];
  llm: LlmService;
  git: (repo: string) => GitCapability;
}

export type Listener = (e: RuntimeEvent) => void;

export class Runtime {
  #store: Store;
  #tasks = new Map<string, TaskDefinition<unknown, unknown>>();
  #llm: LlmService;
  #git: (repo: string) => GitCapability;
  #running = new Map<Id, AbortController>();
  #listeners = new Set<Listener>();

  constructor(opts: RuntimeOptions) {
    this.#store = opts.store;
    this.#llm = opts.llm;
    this.#git = opts.git;
    for (const t of opts.tasks) {
      if (this.#tasks.has(t.kind)) throw new Error(`Duplicate task kind: ${t.kind}`);
      this.#tasks.set(t.kind, t);
    }
  }

  get store(): Store {
    return this.#store;
  }

  get llm(): LlmService {
    return this.#llm;
  }

  /** Read-only git for server queries outside tasks. */
  gitFor(sessionId: Id): GitCapability {
    return this.#git(this.#store.getSession(sessionId).repo);
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
      repo: session.repo,
      signal: controller.signal,
      git: this.#git(session.repo),
      llm: {
        run: async (prompt, selection) => {
          const r = await this.#llm.run(selection, prompt, controller.signal);
          emit("llm.usage", { selection: r.selection, usage: r.usage ?? null });
          return r;
        },
      },
      artifacts: {
        put: (type, status, data, llm) => {
          const a = this.#store.putArtifact({ sessionId, type, status, data, provenance: llm ? { taskId: task.id, llm } : { taskId: task.id } });
          emit("artifact.created", { artifactId: a.id, type });
          return a;
        },
        get: (id) => this.#store.getArtifact(id),
      },
      links: {
        put: (from, to, linkKind) => {
          const l = this.#store.putLink({ sessionId, from, to, kind: linkKind });
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

  cancel(taskId: Id): void {
    const c = this.#running.get(taskId);
    if (!c) throw new Error(`Task ${taskId} is not running`);
    c.abort();
  }
}
