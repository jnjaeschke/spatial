import { useLayoutEffect, useRef, useState } from "react";
import type { Progress, TaskRecord } from "../shared/types.ts";
import { isActive } from "../shared/task-state.ts";
import { api, useTaskActivity } from "./api.ts";
import { IconButton } from "./IconButton.tsx";

const describe = (p: Progress | undefined) =>
  !p ? "" : p.kind === "steps" ? p.step : p.kind === "determinate" ? `${p.done}/${p.total}` : (p.message ?? "");

const label = (kind: string) => kind === "narrate" ? "analyze" : kind === "importDiff" ? "read patch" : kind === "importRevision" ? "fetch revision" : kind;

/** Running tasks plus the three most recent finished ones; failures show their error. A task's name opens its LLM activity log. */
export function ActivityStrip({ sessionId, tasks, progress }: { sessionId: string; tasks: TaskRecord[]; progress: Record<string, Progress> }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const running = tasks.filter(isActive);
  const finished = tasks.filter((t) => !running.includes(t)).slice(-3).reverse();
  const open = tasks.find((t) => t.id === openId);
  return <div className="activity">
    {[...running, ...finished].map((t) => <span key={t.id} className={`task ${t.status}`} data-testid={`task-${t.kind}`} data-status={t.status}>
      <button type="button" className="task-name" aria-expanded={t.id === openId} title="Show what the LLM is doing" onClick={() => setOpenId(t.id === openId ? null : t.id)}>{label(t.kind)}</button> {t.status}
      {t.status === "running" && <> {describe(progress[t.id])} <button onClick={() => api.cancel(t.id).catch(console.error)}>Cancel</button></>}
      {t.status === "failed" && <> {t.error}</>}
      {t.kind === "review" && t.status === "succeeded" && (() => {
        const errors = (t.output as { findingErrors?: string[] } | null)?.findingErrors ?? [];
        return errors.length > 0 ? <span className="dropped" title={errors.join("\n")}> · {errors.length} findings dropped</span> : null;
      })()}
    </span>)}
    {open && <ActivityLog sessionId={sessionId} task={open} onClose={() => setOpenId(null)} />}
  </div>;
}

/** The text, reasoning and tool calls of a task's LLM runs, following new activity while scrolled to the end. */
function ActivityLog({ sessionId, task, onClose }: { sessionId: string; task: TaskRecord; onClose(): void }) {
  const { activity, error } = useTaskActivity(sessionId, task.id);
  const list = useRef<HTMLOListElement>(null);
  const atEnd = useRef(true);
  useLayoutEffect(() => { if (atEnd.current && list.current) list.current.scrollTop = list.current.scrollHeight; }, [activity]);
  return <section className="activity-log" role="dialog" aria-label={`${label(task.kind)} activity`} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
    <header><b>{label(task.kind)}</b> {task.status}<IconButton label="Close activity" onClick={onClose}>×</IconButton></header>
    {error ? <p className="failed">{error}</p>
      : !activity ? <p className="empty">Loading…</p>
      : !activity.length ? <p className="empty">No LLM activity{isActive(task) ? " yet" : ""}.</p>
      : <ol ref={list} onScroll={(e) => { const el = e.currentTarget; atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}>
        {activity.map((a, i) => <li key={i} className={`activity-${a.kind}`}>{a.kind === "tool" ? <><code>{a.name}</code> {a.detail}</> : a.text}</li>)}
      </ol>}
  </section>;
}
