import { createContext, useContext } from "react";
import type { Progress, TaskRecord } from "../shared/types.ts";
import { api } from "./api.ts";
import { OpenActivityLogContext } from "./activity-log-context.ts";

/** The latest progress of each running task, by task id. */
export const TaskProgressContext = createContext<Record<string, Progress>>({});

export const describeProgress = (p: Progress | undefined) =>
  !p ? "" : p.kind === "steps" ? p.step : p.kind === "determinate" ? `${p.done}/${p.total}` : (p.message ?? "");

/** The progress text of a running task with buttons to open its activity log and to cancel it, for tasks shown inline in a conversation. */
export function TaskControls({ task }: { task: TaskRecord }) {
  const progress = describeProgress(useContext(TaskProgressContext)[task.id]);
  const openLog = useContext(OpenActivityLogContext);
  return <span className="task-controls">
    {progress && <span className="task-progress">{progress}</span>}
    {openLog && <button type="button" className="nodrag" onClick={() => openLog({ taskId: task.id })}>Log</button>}
    <button type="button" className="nodrag" onClick={() => api.cancel(task.id).catch(console.error)}>Cancel</button>
  </span>;
}
