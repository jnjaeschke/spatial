import { useState } from "react";
import { Dialog, ErrorText, IconButton, SidePanel, useAction } from "../../../web/plugin-api.ts";
import type { SpecTraceData } from "../shared/types.ts";
import { traceMarkdown } from "../shared/traces.ts";
import type { TraceWriter } from "./trace-writer.ts";

/** Traces of the session: new, rename, select active; the active trace's entries with editable notes; Export. */
export function TracePanel({ writer, traces, active, algorithms, readOnly, onSelect, onClose }: { writer: TraceWriter; traces: SpecTraceData[]; active: SpecTraceData | null; algorithms: ReadonlyMap<string, { title: string; url: string }>; readOnly: boolean; onSelect(traceId: string): void; onClose(): void }) {
  const action = useAction();
  const [exported, setExported] = useState<string | null>(null);
  const edit = (traceId: string, update: (trace: SpecTraceData) => SpecTraceData) => action.run(() => writer.editTrace(traceId, update));
  return <SidePanel title="Traces" closeLabel="Close traces" onClose={onClose} testId="trace-panel" className="trace-panel">
    <div className="trace-list">
      {traces.map((trace) => <label key={trace.traceId}><input type="radio" name="active-trace" checked={trace.traceId === active?.traceId} onChange={() => onSelect(trace.traceId)} />{trace.title}</label>)}
      {!readOnly && <button type="button" onClick={() => void action.run(() => writer.edit((known) => ({ traceId: crypto.randomUUID(), title: `Trace ${known.length + 1}`, entries: [] }), (trace) => onSelect(trace.traceId)))}>New trace</button>}
    </div>
    {active && <>
      <input aria-label="Trace title" key={active.traceId} defaultValue={active.title} readOnly={readOnly} onBlur={(event) => { const title = event.currentTarget.value.trim(); if (title && title !== active.title) void edit(active.traceId, (trace) => ({ ...trace, title })); }} />
      <ol className="trace-entries">{active.entries.map((entry, index) => <li key={`${active.traceId}:${index}:${entry.anchor}:${entry.step}`} data-testid={`trace-entry-${index}`}>
        <span>{algorithms.get(entry.anchor)?.title ?? entry.anchor} step {entry.step}</span>
        <textarea aria-label={`Note for entry ${index + 1}`} defaultValue={entry.note} readOnly={readOnly} rows={2} onBlur={(event) => { const note = event.currentTarget.value; if (note !== entry.note) void edit(active.traceId, (trace) => ({ ...trace, entries: trace.entries.map((item, i) => i === index ? { ...item, note } : item) })); }} />
        {!readOnly && <IconButton label={`Remove entry ${index + 1}`} onClick={() => void edit(active.traceId, (trace) => ({ ...trace, entries: trace.entries.filter((_, i) => i !== index) }))}>×</IconButton>}
      </li>)}</ol>
      <button type="button" disabled={!active.entries.length} onClick={() => void action.run(async () => { const markdown = traceMarkdown(active, algorithms); setExported(markdown); await navigator.clipboard.writeText(markdown).catch((error: Error) => action.fail(`Could not copy: ${error.message}`)); })}>Export</button>
    </>}
    <ErrorText error={action.error} />
    {exported !== null && <Dialog title="Trace markdown" testId="trace-export" onClose={() => setExported(null)} footer={<button type="button" onClick={() => setExported(null)}>Done</button>}><textarea readOnly aria-label="Trace markdown" rows={10} value={exported} /></Dialog>}
  </SidePanel>;
}
