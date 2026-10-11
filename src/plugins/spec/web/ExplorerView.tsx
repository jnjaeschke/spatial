import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, SequenceDiagram, Segmented, TopbarExtras, useClosed, type CanvasModel, type CanvasProviderProps, type PhaseViewProps, type SequenceArrow } from "../../../web/plugin-api.ts";
import type { SpecAlgorithmData, SpecOpenedData, SpecTraceData } from "../shared/types.ts";
import { latestTraces, traceSequence, type TraceRow } from "../shared/traces.ts";
import { explorerGraph, explorerLayout, specNodeId } from "./graph.ts";
import { ExplorerContext, ExplorerViewContext } from "./context.ts";
import { specClient } from "./client.ts";
import { useActiveTrace } from "./trace-state.ts";
import { TracePanel } from "./TracePanel.tsx";
import type { SummaryView } from "../runtime/summaries.ts";

function ExplorerProvider({ graph, readOnly, reveal, children }: CanvasProviderProps) {
  const view = useContext(ExplorerViewContext)!;
  // Canvas recreates `reveal` and `graph` every render; refs keep the context value, and with it every box, stable.
  const latest = useRef({ graph, reveal });
  latest.current = { graph, reveal };
  const value = useMemo(() => ({
    readOnly,
    reveal(nodeId: string) { latest.current.reveal(nodeId, nodeId); },
    async open(target: string, from: SpecOpenedData["from"]) {
      const id = specNodeId(target);
      await specClient.open(view.sessionId, target, from);
      // A new or reopened box is revealed by `revealWhenAdded` once it is in the graph; an open one is focused here.
      if (view.closed.closed.has(id)) view.closed.reopen([id]);
      else if (latest.current.graph.nodes.some((node) => node.id === id)) latest.current.reveal(id, id);
    },
    async showPath(ref: string, effectId: string) { await specClient.showEffectPath(view.sessionId, ref, effectId); },
    addToTrace: view.addToTrace,
    focus: view.focus,
    summaries: view.summaries,
    flag: view.flag,
  }), [view, readOnly]);
  useEffect(() => { if (view.focus) latest.current.reveal(specNodeId(view.focus.anchor), specNodeId(view.focus.anchor)); }, [view.focus]);
  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}

/** The spec explorer: the phase view of `explore`, and a session view elsewhere. */
export function ExplorerView({ state, models, drafts, readOnly = false, onSent, onDiscard, onOpenAside }: PhaseViewProps) {
  const viewKey = `${state.session.id}:spec`;
  const closed = useClosed(viewKey);
  const traces = latestTraces(state.artifacts);
  const [activeId, setActive] = useActiveTrace(state.session.id);
  const active = traces.find((trace) => trace.traceId === activeId) ?? null;
  const [mode, setMode] = useState<"map" | "sequence">("map");
  const [panel, setPanel] = useState(false);
  const [focus, setFocus] = useState<{ anchor: string; step: string } | null>(null);
  const [summaries, setSummaries] = useState<Record<string, SummaryView>>({});
  useEffect(() => { specClient.summaries(state.session.id).then(setSummaries, (error: Error) => console.error(error)); }, [state.session.id, state.lastEventId]);
  const algorithms = useMemo(() => new Map(state.artifacts.filter((a) => a.type === "SpecAlgorithm").map((a) => { const d = a.data as SpecAlgorithmData; return [d.ref, { title: d.title, url: d.url }] as const; })), [state.artifacts]);
  const addToTrace = useCallback(async (anchor: string, step: string) => {
    const entry = { anchor, step, note: "" };
    if (active) { await specClient.saveTrace(state.session.id, { ...active, entries: [...active.entries, entry] }); return; }
    const trace: SpecTraceData = { traceId: crypto.randomUUID(), title: `Trace ${traces.length + 1}`, entries: [entry] };
    await specClient.saveTrace(state.session.id, trace);
    setActive(trace.traceId);
  }, [state.session.id, active, traces.length, setActive]);
  const model = useMemo<CanvasModel>(() => ({
    graph: (current, currentDrafts) => explorerGraph(current, currentDrafts, closed.closed, active),
    stack: { is: () => true, layout: explorerLayout },
    revealWhenAdded: (node) => node.data.kind === "spec-algorithm",
    Provider: ExplorerProvider,
  }), [closed.closed, active]);
  const flag = useCallback(async (ref: string) => { await specClient.flagSummary(state.session.id, ref); setSummaries(await specClient.summaries(state.session.id)); }, [state.session.id]);
  const view = useMemo(() => ({ sessionId: state.session.id, closed, addToTrace, focus, summaries, flag }), [state.session.id, closed, addToTrace, focus, summaries, flag]);
  return <ExplorerViewContext.Provider value={view}><>
    <TopbarExtras><button type="button" data-testid="traces-toggle" aria-pressed={panel} onClick={() => setPanel(!panel)}>Traces · {active?.entries.length ?? 0}</button>{active && <Segmented label="Explorer view" value={mode} onChange={(value: "map" | "sequence") => setMode(value)} options={[{ value: "map", label: "Map", title: "Map" }, { value: "sequence", label: "Sequence", title: "Trace sequence" }]} />}</TopbarExtras>
    <div className="session-body">{mode === "map" || !active ? <Canvas state={state} model={model} closed={closed} viewKey={viewKey} models={readOnly ? null : models} drafts={drafts} onSent={onSent} onDiscard={onDiscard} onOpenAside={onOpenAside} /> : <TraceSequenceView trace={active} algorithms={algorithms} onRow={(row) => { setFocus({ anchor: row.to, step: row.step }); setMode("map"); }} />}{panel && <TracePanel sessionId={state.session.id} traces={traces} active={active} algorithms={algorithms} readOnly={readOnly} onSelect={setActive} onClose={() => setPanel(false)} />}</div>
  </></ExplorerViewContext.Provider>;
}

function TraceSequenceView({ trace, algorithms, onRow }: { trace: SpecTraceData; algorithms: ReadonlyMap<string, { title: string; url: string }>; onRow(row: TraceRow): void }) {
  const { lanes, rows } = traceSequence(trace, new Map([...algorithms].map(([ref, algorithm]) => [ref, algorithm.title])));
  const steps: SequenceArrow[] = rows.map((row) => ({ from: row.from, to: row.to, data: { "data-kind": row.kind }, label: <div className="sequence-label"><span className="sequence-badge">{row.index + 1}</span><code className="sequence-call">step {row.step}</code>{row.note && <span className="sequence-what">{row.note}</span>}</div>, onClick: () => onRow(row) }));
  return rows.length ? <div className="trace-sequence" data-testid="trace-sequence"><SequenceDiagram title={trace.title} lanes={lanes} steps={steps} /></div> : <p className="empty">Add at least two steps to the trace.</p>;
}
