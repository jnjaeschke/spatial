import { latestDiff, sessionRefs } from "../shared/diffs.ts";
import { isActive, type Id, type NotifyPayload, type Runtime } from "../../../plugin-api.ts";

/** Announces new head SHAs of the refs a session imported. Polls only sessions with a live subscriber; never imports. */
export class RevisionWatcher {
  #rt: Runtime;
  #intervalMs: number;
  #watchers = new Map<Id, number>();
  #announced = new Map<Id, string>();
  #errors = new Map<Id, string>();
  #timer: ReturnType<typeof setInterval> | undefined;
  #ticking = false;

  constructor(rt: Runtime, opts: { intervalMs?: number } = {}) {
    this.#rt = rt;
    this.#intervalMs = opts.intervalMs ?? 5000;
  }

  /** Marks `sessionId` as watched (reference counted) until the returned function is called. */
  watch(sessionId: Id): () => void {
    this.#watchers.set(sessionId, (this.#watchers.get(sessionId) ?? 0) + 1);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const count = this.#watchers.get(sessionId) ?? 0;
      if (count <= 1) {
        this.#watchers.delete(sessionId);
        this.#announced.delete(sessionId);
        this.#errors.delete(sessionId);
      } else this.#watchers.set(sessionId, count - 1);
    };
  }

  /** Watched session ids, once each, in subscription order. */
  watchedSessions(): Id[] { return [...this.#watchers.keys()]; }

  /** One polling pass; resolves when done. Never rejects. */
  async tick(): Promise<void> {
    if (this.#ticking) return;
    this.#ticking = true;
    try {
      for (const id of this.#watchers.keys()) {
        const tasks = this.#rt.store.listTasks(id);
        if (tasks.some((task) => (task.kind === "importDiff" || task.kind === "interdiff") && isActive(task))) continue;
        const artifacts = this.#rt.store.listArtifacts(id);
        const diff = latestDiff(artifacts);
        const refs = sessionRefs(artifacts, tasks);
        // A commit SHA never moves; sessions that import by SHA (implement) re-import themselves.
        if (!diff || !refs || /^[0-9a-f]{40}$/.test(refs.head)) continue;
        try {
          const sha = await this.#rt.gitFor(id).resolve(refs.head);
          this.#errors.delete(id);
          if (sha === diff.data.headSha) {
            this.#announced.delete(id);
            continue;
          }
          if (sha === this.#announced.get(id)) continue;
          this.#announced.set(id, sha);
          const payload: NotifyPayload = {
            id: `revision:${sha}`,
            title: "New revision available",
            body: `${refs.head} moved to ${sha.slice(0, 12)}`,
            action: { label: "Update", path: `/api/sessions/${id}/update` },
          };
          this.#rt.emit(id, "runtime", "notify", payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message !== this.#errors.get(id)) {
            console.error(`revision watcher failed for session ${id}: ${message}`);
            this.#errors.set(id, message);
          }
        }
      }
    } finally {
      this.#ticking = false;
    }
  }

  /** Runs `tick` every `intervalMs` (timer is unref'd). */
  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => void this.tick(), this.#intervalMs);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }
}
