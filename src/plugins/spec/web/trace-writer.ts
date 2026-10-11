import type { Artifact } from "../../../plugin-api.ts";
import { latestTraces } from "../shared/traces.ts";
import type { SpecTraceData } from "../shared/types.ts";

/**
 * Applies trace edits one at a time, each against the newest version known: the version this writer last saved until the session's
 * artifacts catch up with it, the session's own version after. Edits made in quick succession therefore compose instead of overwriting each other.
 */
export class TraceWriter {
  #tail: Promise<unknown> = Promise.resolve();
  #artifacts: Artifact[] = [];
  readonly #saved = new Map<string, { artifactId: string; data: SpecTraceData }>();

  readonly #save: (trace: SpecTraceData) => Promise<string>;

  /** `save` stores a version and returns the id of the artifact it became. */
  constructor(save: (trace: SpecTraceData) => Promise<string>) { this.#save = save; }

  observe(artifacts: Artifact[]): void { this.#artifacts = artifacts; }

  /** The newest known version of every trace, in creation order. */
  known(): SpecTraceData[] {
    const traces = new Map(latestTraces(this.#artifacts).map((trace) => [trace.traceId, trace]));
    for (const [traceId, saved] of this.#saved) {
      const mine = this.#artifacts.findIndex((a) => a.id === saved.artifactId);
      const latest = this.#artifacts.findLastIndex((a) => a.type === "SpecTrace" && (a.data as SpecTraceData).traceId === traceId);
      if (mine !== -1 && latest >= mine) this.#saved.delete(traceId);
      else traces.set(traceId, saved.data);
    }
    return [...traces.values()];
  }

  /** Saves what `update` makes of the known traces: the new version of one trace, or null to save nothing. `saved` runs before the next edit starts. */
  edit(update: (known: SpecTraceData[]) => SpecTraceData | null, saved?: (trace: SpecTraceData) => void): Promise<SpecTraceData | null> {
    const run = async () => {
      const trace = update(this.known());
      if (!trace) return null;
      this.#saved.set(trace.traceId, { artifactId: await this.#save(trace), data: trace });
      saved?.(trace);
      return trace;
    };
    const result = this.#tail.then(run, run);
    this.#tail = result.catch(() => {});
    return result;
  }

  /** Saves `update` of the newest version of one trace. */
  editTrace(traceId: string, update: (trace: SpecTraceData) => SpecTraceData): Promise<SpecTraceData | null> {
    return this.edit((known) => {
      const trace = known.find((candidate) => candidate.traceId === traceId);
      if (!trace) throw new Error(`Unknown trace ${traceId}`);
      return update(trace);
    });
  }
}
