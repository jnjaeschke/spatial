import type { CommandRunData } from "../../../web/plugin-api.ts";
import type { ImplementResultData } from "../shared/types.ts";
import type { Artifact, SessionState } from "../../../web/plugin-api.ts";

/** The command runs stamped with `epoch` and the task whose activity log holds them; null when there are none. */
export function commandSummary(state: SessionState, epoch: number | null): { count: number; failed: number; taskId: string } | null {
  const runs = state.artifacts.filter((a) => a.type === "CommandRun" && a.epoch === epoch) as Artifact<CommandRunData>[];
  const last = runs.at(-1);
  return last ? { count: runs.length, failed: runs.filter((a) => a.data.exitCode !== 0).length, taskId: last.provenance.taskId } : null;
}
export const commandSummaryLabel = (s: { count: number; failed: number }): string => `${s.count} ${s.count === 1 ? "command" : "commands"}, ${s.failed} failed`;

/** Where the activity log shows the command run `runId`: its task and tool call; no call for a command the runtime ran itself. */
export function commandRunLog(state: SessionState, runId: string): { taskId: string; callId?: string } | null {
  const run = state.artifacts.find((a) => a.id === runId && a.type === "CommandRun") as Artifact<CommandRunData> | undefined;
  return run ? { taskId: run.provenance.taskId, ...(run.data.callId ? { callId: run.data.callId } : {}) } : null;
}

/** What the agent reported in `epoch`: its summary, or that the plan does not hold; null when it left no result. */
export function implementSummary(state: SessionState, epoch: number | null): string | null {
  const result = state.artifacts.findLast((a) => a.type === "ImplementResult" && a.epoch === epoch) as Artifact<ImplementResultData> | undefined;
  return result ? result.data.planInvalid ? `Plan does not hold: ${result.data.planInvalid}` : result.data.summary : null;
}
