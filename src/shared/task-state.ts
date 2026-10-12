import type { TaskRecord } from "./types.ts";

/** Whether a task is pending or running. */
export const isActive = (task: Pick<TaskRecord, "status">) => task.status === "pending" || task.status === "running";

/** Whether a task of `kinds` whose input `matches` is active, else the error of the latest such task when it failed. */
export function taskState(tasks: Pick<TaskRecord, "kind" | "status" | "input" | "error">[], kinds: string[], matches: (input: unknown) => boolean): { busy: boolean; failed: string | null } {
  const own = tasks.filter((task) => kinds.includes(task.kind) && matches(task.input));
  const busy = own.some(isActive);
  const last = own.at(-1);
  return { busy, failed: !busy && last?.status === "failed" ? last.error : null };
}
