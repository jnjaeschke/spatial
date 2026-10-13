import { taskState, type Artifact, type Id, type Runtime } from "../../../plugin-api.ts";
import type { SpecAlgorithmData, SpecSummary, SummaryRejectedData } from "../shared/types.ts";
import { parseSteps } from "../shared/steps.ts";
import { checkSummary } from "../shared/summary-check.ts";

/** Knowledge key of an algorithm's summary. */
export const summaryKey = (algorithm: SpecAlgorithmData) => `${algorithm.ref}@${algorithm.sha}`;
/** What an algorithm box shows of its summary. */
export type SummaryView = { state: "ready"; clauses: SpecSummary["clauses"] } | { state: "flagged" } | { state: "rejected" } | { state: "absent" };

const rejected = (rt: Runtime, sessionId: Id, algorithm: SpecAlgorithmData) => rt.store.listArtifacts(sessionId, "SummaryRejected").some((a) => (a.data as SummaryRejectedData).anchor === algorithm.ref && (a.data as SummaryRejectedData).sha === algorithm.sha);

/** Summarizes an algorithm unless it has no steps, already has a summary or tombstone, was rejected in this session, or is being summarized; stores a verified summary in the knowledge store or a `SummaryRejected`. */
export async function ensureSummary(rt: Runtime, sessionId: Id, algorithm: Artifact<SpecAlgorithmData>): Promise<void> {
  const steps = parseSteps(algorithm.data.content);
  if (!steps.length || rt.knowledge.get("global", "spec", summaryKey(algorithm.data)).state !== "absent" || rejected(rt, sessionId, algorithm.data)) return;
  if (taskState(rt.store.listTasks(sessionId), ["summarizeAlgorithm", "verifySummary"], (input) => (input as { algorithmId: Id }).algorithmId === algorithm.id).busy) return;
  const summary = rt.start<SpecSummary>(sessionId, "summarizeAlgorithm", { algorithmId: algorithm.id });
  const { clauses } = await summary.done;
  const reasons = checkSummary(clauses, steps);
  if (!reasons.length) {
    const verdicts = await rt.run<{ clauses: { supported: boolean; reason: string }[] }>(sessionId, "verifySummary", { algorithmId: algorithm.id, clauses });
    verdicts.clauses.forEach((verdict, index) => { if (!verdict.supported) reasons.push(`Clause ${index + 1}: ${verdict.reason}`); });
  }
  if (reasons.length) {
    rt.putArtifact<SummaryRejectedData>("runtime", { sessionId, type: "SummaryRejected", status: "verified", data: { anchor: algorithm.data.ref, sha: algorithm.data.sha, reasons }, provenance: { taskId: summary.taskId } });
    return;
  }
  rt.knowledge.put("global", "spec", summaryKey(algorithm.data), { clauses } satisfies SpecSummary, { by: "llm", taskId: summary.taskId, sessionId });
  rt.emit(sessionId, "runtime", "spec.summary", { ref: algorithm.data.ref });
}

/** The summary state of each algorithm of the session (its latest version per ref). */
export function summaryViews(rt: Runtime, sessionId: Id): Record<string, SummaryView> {
  const latest = new Map<string, SpecAlgorithmData>();
  for (const a of rt.store.listArtifacts(sessionId, "SpecAlgorithm")) latest.set((a.data as SpecAlgorithmData).ref, a.data as SpecAlgorithmData);
  return Object.fromEntries([...latest].map(([ref, algorithm]) => {
    const read = rt.knowledge.get("global", "spec", summaryKey(algorithm));
    const view: SummaryView = read.state === "current" ? { state: "ready", clauses: (read.entry.value as SpecSummary).clauses } : read.state === "deleted" ? { state: "flagged" } : rejected(rt, sessionId, algorithm) ? { state: "rejected" } : { state: "absent" };
    return [ref, view];
  }));
}
