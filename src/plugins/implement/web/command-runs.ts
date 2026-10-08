import type { CommandRunData, ImplementResultData } from "../shared/types.ts";
import type { Artifact, SessionState } from "../../../web/plugin-api.ts";

/** A `CommandRun` as the implement view shows it. */
export interface CommandChip extends CommandRunData { id: string }

/** The command runs stamped with `epoch`, oldest first. */
export function commandChips(state: SessionState, epoch: number | null): CommandChip[] {
  return state.artifacts.filter((a) => a.type === "CommandRun" && a.epoch === epoch).map((a) => ({ id: a.id, ...(a.data as CommandRunData) }));
}
export const chipStatus = (chip: CommandChip): "pass" | "fail" => chip.exitCode === 0 ? "pass" : "fail";
export const chipLabel = (chip: CommandChip): string => chip.command.length > 40 ? `${chip.command.slice(0, 39)}…` : chip.command;

/** What the agent reported in `epoch`: its summary, or that the plan does not hold; null when it left no result. */
export function implementSummary(state: SessionState, epoch: number | null): string | null {
  const result = state.artifacts.findLast((a) => a.type === "ImplementResult" && a.epoch === epoch) as Artifact<ImplementResultData> | undefined;
  return result ? result.data.planInvalid ? `Plan does not hold: ${result.data.planInvalid}` : result.data.summary : null;
}
