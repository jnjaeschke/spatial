import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Artifact, CommandRunData, Progress, SessionState, TaskRecord } from "../shared/types.ts";
import { isActive } from "../shared/task-state.ts";
import { activityRows, duration } from "./activity-rows.ts";
import { isSessionLog, type ActivityLogTarget, type OpenLog } from "./activity-log-context.ts";
import { api, useTaskActivity } from "./api.ts";
import { IconButton } from "./IconButton.tsx";
import { SessionChip, SessionPopover, hasSessionChip } from "./SessionChip.tsx";

const describe = (p: Progress | undefined) =>
  !p ? "" : p.kind === "steps" ? p.step : p.kind === "determinate" ? `${p.done}/${p.total}` : (p.message ?? "");

const label = (kind: string) => kind === "narrate" ? "analyze" : kind === "importDiff" ? "read patch" : kind === "importRevision" ? "fetch revision" : kind;

/** The session chip, running tasks and the three most recent finished ones; failures show their error. A task's name opens its LLM activity log, the chip the session chat; one popover is open at a time, named by `log`, which `onLog` lets the session change from elsewhere. */
export function ActivityStrip({ state, progress, log, onLog }: { state: SessionState; progress: Record<string, Progress>; log: OpenLog | null; onLog(log: OpenLog | null): void }) {
  const { tasks, artifacts } = state;
  const sessionId = state.session.id;
  const openId = log !== null && !isSessionLog(log) ? log.taskId : null;
  const running = tasks.filter(isActive);
  const finished = tasks.filter((t) => !running.includes(t)).slice(-3).reverse();
  const open = tasks.find((t) => t.id === openId);
  const chip = hasSessionChip(state);
  const sessionOpen = isSessionLog(log);
  return <div className="activity">
    {chip && <SessionChip state={state} open={sessionOpen} onOpen={(next) => onLog(next ? { kind: "session" } : null)} />}
    {[...running, ...finished].map((t) => <span key={t.id} className={`task ${t.status}`} data-testid={`task-${t.kind}`} data-status={t.status}>
      <button type="button" className="task-name" aria-expanded={t.id === openId} title="Show what the LLM is doing" onClick={() => onLog(t.id === openId ? null : { taskId: t.id })}>{label(t.kind)}</button> {t.status}
      {t.status === "running" && <> {describe(progress[t.id])} <button onClick={() => api.cancel(t.id).catch(console.error)}>Cancel</button></>}
      {t.status === "failed" && <> {t.error}</>}
      {t.kind === "review" && t.status === "succeeded" && (() => {
        const errors = (t.output as { findingErrors?: string[] } | null)?.findingErrors ?? [];
        return errors.length > 0 ? <span className="dropped" title={errors.join("\n")}> · {errors.length} findings dropped</span> : null;
      })()}
    </span>)}
    {chip && sessionOpen && <SessionPopover state={state} onClose={() => onLog(null)} />}
    {open && log !== null && !isSessionLog(log) && <ActivityLog sessionId={sessionId} task={open} target={log} artifacts={artifacts} onClose={() => onLog(null)} />}
  </div>;
}

/** The text, reasoning and tool calls of a task's LLM runs, following new activity while scrolled to the end. A tool call with its result is one row that expands to the output; the row of `target.callId` starts expanded and scrolled to. */
function ActivityLog({ sessionId, task, target, artifacts, onClose }: { sessionId: string; task: TaskRecord; target: ActivityLogTarget; artifacts: Artifact[]; onClose(): void }) {
  const { activity, error } = useTaskActivity(sessionId, task.id);
  const list = useRef<HTMLOListElement>(null);
  const atEnd = useRef(true);
  const scrolledTo = useRef<ActivityLogTarget | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(target.callId ? [target.callId] : []));
  useEffect(() => { if (target.callId) setExpanded((open) => new Set(open).add(target.callId!)); }, [target]);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const row = target.callId && scrolledTo.current !== target ? el.querySelector(`[data-call-id="${CSS.escape(target.callId)}"]`) : null;
    if (row) { scrolledTo.current = target; atEnd.current = false; row.scrollIntoView({ block: "nearest" }); }
    else if (atEnd.current) el.scrollTop = el.scrollHeight;
  }, [activity, target]);
  const toggle = (callId: string) => setExpanded((open) => { const next = new Set(open); if (!next.delete(callId)) next.add(callId); return next; });
  const fullOutput = (callId: string, captured: string) => (artifacts.find((a) => a.type === "CommandRun" && (a.data as CommandRunData).callId === callId)?.data as CommandRunData | undefined)?.output ?? captured;
  return <section className="activity-log" role="dialog" aria-label={`${label(task.kind)} activity`} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
    <header><b>{label(task.kind)}</b> {task.status}<IconButton label="Close activity" onClick={onClose}>×</IconButton></header>
    {error ? <p className="failed">{error}</p>
      : !activity ? <p className="empty">Loading…</p>
      : !activity.length ? <p className="empty">No LLM activity{isActive(task) ? " yet" : ""}.</p>
      : <ol ref={list} onScroll={(e) => { const el = e.currentTarget; atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}>
        {activityRows(activity).map((row, i) => row.kind !== "tool" ? <li key={i} className={`activity-${row.kind}`}>{row.text}</li>
          : !row.result || !row.call.callId ? <li key={i} className="activity-tool"><code>{row.call.name}</code> {row.call.detail}</li>
          : <li key={i} className="activity-tool" data-testid="activity-tool" data-call-id={row.call.callId}>
            <button type="button" className="tool-row" aria-expanded={expanded.has(row.call.callId)} onClick={() => toggle(row.call.callId!)}>
              <code>{row.call.name}</code> {row.call.detail} <span className={row.result.exitCode ? "exit-failed" : undefined}>{row.result.exitCode === null ? "" : row.result.exitCode === 0 ? "✓" : `✗ ${row.result.exitCode}`}</span> <span className="duration">{duration(row.result.durationMs)}</span>
            </button>
            {expanded.has(row.call.callId) && <pre className="tool-output" data-testid="tool-output">{fullOutput(row.call.callId, row.result.output)}</pre>}
          </li>)}
      </ol>}
  </section>;
}
