import { runProcess, type Artifact, type Id, type NotifyPayload, type Runtime } from "../../../plugin-api.ts";
import type { TryFailure, TryPushData, TryRunData } from "../shared/types.ts";

interface CliJob { job: { id: number; job_type_name: string; platform: string; result: string }; errors: { test?: string | null; status?: string | null; message?: string | null; signature?: string | null; action?: string }[] }

/** Failing jobs from `treeherder-cli <url> --json`. Versions before 0.3.0 print plain text when nothing failed. */
export function parseTreeherderJson(stdout: string): { revision: string; pushId: number; failures: TryFailure[] } {
  let json: { revision: string; push_id: number; jobs: CliJob[] };
  try { json = JSON.parse(stdout); } catch { throw new Error(`treeherder-cli printed no JSON (version 0.3.0 or later is needed): ${stdout.trim().split("\n", 1)[0]}`); }
  return { revision: json.revision, pushId: json.push_id, failures: json.jobs.map(({ job, errors }) => ({
    jobId: job.id, name: job.job_type_name, platform: job.platform, result: job.result,
    errors: errors.map((e) => ({ test: e.test ?? null, message: [e.status, e.message ?? e.signature ?? e.action].filter(Boolean).join(" ") })),
  })) };
}

/** Treeherder's push status counts say every scheduled job finished. */
export const isComplete = (counts: Record<string, number>) => (counts.completed ?? 0) > 0 && !counts.pending && !counts.running;
/** A push is polled on its own for this long after it was created; later states come from a manual refresh. */
export const WATCH_LIMIT_MS = 24 * 60 * 60 * 1000;
export const STOPPED_ERROR = "Stopped watching after 24 hours; refresh to check again";

const plural = (n: number) => `${n} failing job${n === 1 ? "" : "s"}`;
const same = (a: TryRunData, b: TryRunData) => JSON.stringify([a.counts, a.failures, a.error, a.complete]) === JSON.stringify([b.counts, b.failures, b.error, b.complete]);
const carried = (push: Artifact<TryPushData>, last: TryRunData | null, error: string): TryRunData =>
  ({ push: push.id, url: push.data.url, revision: last?.revision ?? null, pushId: last?.pushId ?? null, counts: last?.counts ?? {}, complete: false, failures: last?.failures ?? [], error });

/** Polls Treeherder for every try push whose last observed state is not complete and that is younger than 24 hours, in all sessions, and stores a `TryRun` when the state changed. Reads everything it needs from the store, so a restarted server resumes. */
export class TryWatcher {
  #rt: Pick<Runtime, "store" | "emit">;
  #intervalMs: number;
  #now: () => number;
  #treeherder: (url: string) => Promise<{ code: number; stdout: string; stderr: string }>;
  #status: (pushId: number) => Promise<Record<string, number>>;
  #timer: ReturnType<typeof setInterval> | undefined;
  #ticking = false;

  constructor(rt: Pick<Runtime, "store" | "emit">, opts: { intervalMs?: number; now?: () => number; treeherder?: (url: string) => Promise<{ code: number; stdout: string; stderr: string }>; status?: (pushId: number) => Promise<Record<string, number>> } = {}) {
    this.#rt = rt;
    this.#intervalMs = opts.intervalMs ?? 300_000;
    this.#now = opts.now ?? Date.now;
    this.#treeherder = opts.treeherder ?? ((url) => runProcess(process.env.SPATIAL_TREEHERDER_CLI ?? "treeherder-cli", [url, "--json"], { stdin: "", signal: AbortSignal.timeout(120_000) }));
    this.#status = opts.status ?? (async (pushId) => {
      const base = process.env.SPATIAL_TREEHERDER_URL ?? "https://treeherder.mozilla.org";
      const res = await fetch(`${base}/api/project/try/push/${pushId}/status/`, { headers: { "user-agent": "spatial" } });
      if (!res.ok) throw new Error(`Treeherder push status answered ${res.status}`);
      return await res.json() as Record<string, number>;
    });
  }

  async tick(): Promise<void> {
    if (this.#ticking) return;
    this.#ticking = true;
    try {
      for (const session of this.#rt.store.listSessions()) {
        const runs = this.#rt.store.listArtifacts(session.id, "TryRun") as Artifact<TryRunData>[];
        for (const push of this.#rt.store.listArtifacts(session.id, "TryPush") as Artifact<TryPushData>[]) {
          const last = runs.findLast((run) => run.data.push === push.id)?.data ?? null;
          if (last?.complete) continue;
          if (this.#now() - Date.parse(push.createdAt) < WATCH_LIMIT_MS) await this.#poll(session.id, push, last);
          else if (!runs.some((run) => run.data.push === push.id && run.data.error === STOPPED_ERROR)) this.#store(session.id, push, carried(push, last, STOPPED_ERROR), "try-watcher");
        }
      }
    } finally {
      this.#ticking = false;
    }
  }

  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => void this.tick(), this.#intervalMs);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  async #observe(push: Artifact<TryPushData>, last: TryRunData | null): Promise<TryRunData> {
    const base = { push: push.id, url: push.data.url };
    try {
      const out = await this.#treeherder(push.data.url);
      if (out.code !== 0) throw new Error((out.stderr || out.stdout).trim().split("\n").filter((line) => !line.startsWith("Note:") && !line.includes("cargo binstall")).join(" ") || `treeherder-cli exited ${out.code}`);
      const parsed = parseTreeherderJson(out.stdout);
      const counts = await this.#status(parsed.pushId);
      // Right after the decision task, Treeherder may not list the jobs it scheduled yet; finished counts must hold for a second poll.
      const complete = isComplete(counts) && JSON.stringify(counts) === JSON.stringify(last?.counts);
      return { ...base, revision: parsed.revision, pushId: parsed.pushId, counts, complete, failures: parsed.failures, error: null };
    } catch (e) {
      return carried(push, last, (e as Error).message);
    }
  }

  #store(sessionId: Id, push: Artifact<TryPushData>, data: TryRunData, taskId: string): Artifact<TryRunData> {
    const run = this.#rt.store.putArtifact<TryRunData>({ sessionId, type: "TryRun", status: "verified", epoch: push.epoch, data, provenance: { taskId } });
    this.#rt.emit(sessionId, "runtime", "artifact.created", { artifactId: run.id, type: "TryRun" });
    return run;
  }

  async #poll(sessionId: Id, push: Artifact<TryPushData>, last: TryRunData | null): Promise<void> {
    const next = await this.#observe(push, last);
    if (last && same(last, next)) return;
    this.#store(sessionId, push, next, "try-watcher");
    const failed = next.failures.length;
    const notice: NotifyPayload | null = next.complete
      ? { id: `try-${push.id}`, title: failed ? `Try finished: ${plural(failed)}` : "Try finished: all jobs passed", body: push.data.command }
      : failed > (last?.failures.length ?? 0) ? { id: `try-${push.id}`, title: `Try: ${plural(failed)}`, body: push.data.command } : null;
    if (notice) this.#rt.emit(sessionId, "runtime", "notify", notice);
  }
}
