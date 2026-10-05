import type { Progress, TaskRecord } from "../shared/types.ts";
import { api } from "./api.ts";

const describe = (p: Progress | undefined) =>
  !p ? "" : p.kind === "steps" ? p.step : p.kind === "determinate" ? `${p.done}/${p.total}` : (p.message ?? "");

/** Running tasks plus the three most recent finished ones; failures show their error. */
export function ActivityStrip({ tasks, progress }: { tasks: TaskRecord[]; progress: Record<string, Progress> }) {
  const running = tasks.filter((t) => t.status === "running" || t.status === "pending");
  const finished = tasks.filter((t) => !running.includes(t)).slice(-3).reverse();
  return <div className="activity">
    {[...running, ...finished].map((t) => <span key={t.id} className={`task ${t.status}`} data-testid={`task-${t.kind}`} data-status={t.status}>
      <b>{t.kind}</b> {t.status}
      {t.status === "running" && <> {describe(progress[t.id])} <button onClick={() => api.cancel(t.id).catch(console.error)}>Cancel</button></>}
      {t.status === "failed" && <> {t.error}</>}
      {t.kind === "review" && t.status === "succeeded" && (() => {
        const errors = (t.output as { findingErrors?: string[] } | null)?.findingErrors ?? [];
        return errors.length > 0 ? <span className="dropped" title={errors.join("\n")}> · {errors.length} findings dropped</span> : null;
      })()}
    </span>)}
  </div>;
}
