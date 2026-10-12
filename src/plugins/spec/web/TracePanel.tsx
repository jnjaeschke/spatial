import { useState } from "react";
import { Dialog, ErrorText, IconButton, SidePanel, useAction, type TaskRecord } from "../../../web/plugin-api.ts";
import type { SpecTraceData } from "../shared/types.ts";
import { hopOf, traceMarkdown, type TraceStatus } from "../shared/traces.ts";
import type { TraceWriter } from "./trace-writer.ts";
import { AskComposer } from "./AskComposer.tsx";
import { PendingTrace, TraceCheckHeader } from "./TraceCheck.tsx";
import { specClient } from "./client.ts";

/** Traces of the session: new, rename, select active; the active trace's entries with editable notes; Export. */
export function TracePanel({ writer, traces, active, algorithms, readOnly, onSelect, onClose, sessionId, activeId, status, tasks, openRefs }: { writer: TraceWriter; traces: SpecTraceData[]; active: SpecTraceData | null; algorithms: ReadonlyMap<string, { title: string; url: string }>; readOnly: boolean; onSelect(traceId: string): void; onClose(): void; sessionId: string; activeId: string | null; status: TraceStatus | null; tasks: TaskRecord[]; openRefs: string[] }) {
  const action = useAction();
  const [exported, setExported] = useState<string | null>(null);
  const edit = (traceId: string, update: (trace: SpecTraceData) => SpecTraceData) => action.run(() => writer.editTrace(traceId, update));
  return <SidePanel title="Traces" closeLabel="Close traces" onClose={onClose} testId="trace-panel" className="trace-panel">
    <div className="trace-list">
      {traces.map((trace) => <label key={trace.traceId}><input type="radio" name="active-trace" checked={trace.traceId === active?.traceId} onChange={() => onSelect(trace.traceId)} />{trace.title}</label>)}
      {!readOnly && <button type="button" onClick={() => void action.run(() => writer.edit((known) => ({ traceId: crypto.randomUUID(), title: `Trace ${known.length + 1}`, entries: [] }), (trace) => onSelect(trace.traceId)))}>New trace</button>}
    </div>
    {!readOnly && <AskComposer sessionId={sessionId} anchors={openRefs} contextTraceId={active?.traceId ?? null} onAsked={onSelect} />}
    {activeId !== null && !active && <PendingTrace traceId={activeId} tasks={tasks} />}
    {active && <>
      {active.question && status && <TraceCheckHeader question={active.question} status={status} tasks={tasks} readOnly={readOnly} onRecheck={async () => { await specClient.recheckTrace(sessionId, active.traceId); }} />}
      <input aria-label="Trace title" key={active.traceId} defaultValue={active.title} readOnly={readOnly} onBlur={(event) => { const title = event.currentTarget.value.trim(); if (title && title !== active.title) void edit(active.traceId, (trace) => ({ ...trace, title })); }} />
      <ol className="trace-entries">{active.entries.map((entry, index) => { const current = status && !status.outdated ? status.check?.data : undefined; const hopResult = current?.hops[index], noteResult = current?.notes[index]; return <li key={`${active.traceId}:${index}:${entry.anchor}:${entry.step}`} data-testid={`trace-entry-${index}`} className={hopResult && !hopResult.ok ? "unverified" : undefined}>
        {active.question && <span className={`trace-hop-kind hop-${hopOf(active.entries, index)}`}>{hopOf(active.entries, index)}</span>}
        <span className="trace-step">{algorithms.get(entry.anchor)?.title ?? entry.anchor} step {entry.step}</span>
        {hopResult && !hopResult.ok && <span className="trace-unverified" title={hopResult.reason}>unverified hop</span>}
        <textarea aria-label={`Note for entry ${index + 1}`} className={noteResult && !noteResult.supported ? "unsupported" : undefined} defaultValue={entry.note} readOnly={readOnly} rows={2} onBlur={(event) => { const note = event.currentTarget.value; if (note !== entry.note) void edit(active.traceId, (trace) => ({ ...trace, entries: trace.entries.map((item, i) => i === index ? { ...item, note } : item) })); }} />
        {noteResult && !noteResult.supported && <p className="trace-note-reason">Unsupported: {noteResult.reason}</p>}
        {!readOnly && <IconButton label={`Remove entry ${index + 1}`} onClick={() => void edit(active.traceId, (trace) => ({ ...trace, entries: trace.entries.filter((_, i) => i !== index) }))}>×</IconButton>}
      </li>; })}</ol>
      <button type="button" disabled={!active.entries.length} onClick={() => void action.run(async () => { const markdown = traceMarkdown(active, algorithms); setExported(markdown); await navigator.clipboard.writeText(markdown).catch((error: Error) => action.fail(`Could not copy: ${error.message}`)); })}>Export</button>
    </>}
    <ErrorText error={action.error} />
    {exported !== null && <Dialog title="Trace markdown" testId="trace-export" onClose={() => setExported(null)} footer={<button type="button" onClick={() => setExported(null)}>Done</button>}><textarea readOnly aria-label="Trace markdown" rows={10} value={exported} /></Dialog>}
  </SidePanel>;
}
