import type { LlmSelection, SessionState } from "../shared/types.ts";
import { latestDiff } from "../plugins/review/shared/diffs.ts";

export type Step = "importRevision" | "reviewRange" | "importDiff" | "narrate";
export type Analysis = { state: "none" } | { state: "running"; step: Step | null } | { state: "failed"; step: Step; error: string };
const STEPS = new Set<Step>(["importRevision", "reviewRange", "importDiff", "narrate"]);

/** Progress for the latest review analysis while its epoch has no narrative. */
export function analysisStatus(state: SessionState): Analysis {
  const last = state.tasks.filter((task) => STEPS.has(task.kind as Step)).at(-1);
  if (last?.status === "failed" || last?.status === "cancelled") return { state: "failed", step: last.kind as Step, error: last.error ?? "Cancelled" };
  if (last?.status === "running" || last?.status === "pending") return { state: "running", step: last.kind as Step };
  return last || state.artifacts.some((artifact) => artifact.type === "WorkflowStart") ? { state: "running", step: null } : { state: "none" };
}

/** Request body for retrying analysis, or null when this session cannot be rerun. */
export function retryBody(state: SessionState, fallback: LlmSelection): { llm: LlmSelection } | null {
  if (!latestDiff(state.artifacts) && !state.artifacts.some((artifact) => artifact.type === "WorkflowStart")) return null;
  return { llm: (state.tasks.filter((task) => task.kind === "narrate").at(-1)?.input as { llm?: LlmSelection } | null)?.llm ?? fallback };
}
