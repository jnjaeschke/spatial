import type { Engine, TaskRecord } from "../../../plugin-api.ts";
import { engineActivity, engineTasks } from "../shared/engine.ts";

/** Whether a mapping, search or alignment of the algorithm in `engine` is running, else the error of the latest failure that no later task of its kind superseded (`engineTasks`, `engineActivity`). */
export function columnState(tasks: Pick<TaskRecord, "kind" | "status" | "input" | "error">[], algorithmId: string, engine: Engine): { busy: boolean; failed: string | null } {
  const { mapping, searching, aligning, error } = engineActivity(engineTasks(tasks), algorithmId, engine);
  const busy = mapping || searching || aligning;
  return { busy, failed: busy ? null : error };
}
