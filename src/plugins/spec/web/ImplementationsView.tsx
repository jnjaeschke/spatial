import { useEffect, useMemo, useState } from "react";
import { ENGINE_LABEL, ENGINES, ErrorText, plural, showSessionView, useAction, useUrlParam, type PhaseViewProps } from "../../../web/plugin-api.ts";
import type { Engine } from "../../../plugin-api.ts";
import type { EngineDifference, ImplementationsData, SpecAlgorithmData, SpecOpenedData } from "../shared/types.ts";
import { codeUrl, mappedSteps, nothingFound, siteKey } from "../shared/engine.ts";
import { cellHighlighted, columnState, taskState, differenceTargets } from "./implementations.ts";
import { EngineStatus, SiteItem, type SiteActions } from "./EngineSites.tsx";
import { DifferencesList } from "./DifferencesList.tsx";
import { specClient } from "./client.ts";

function EngineHeader({ sessionId, data, engine, state, notFound, readOnly }: { sessionId: string; data: ImplementationsData; engine: Engine; state: { busy: boolean; failed: string | null }; notFound: { note: string; reasons: string[] } | null; readOnly: boolean }) {
  const action = useAction();
  const mapping = data.mappings[engine];
  const ref = data.ref;
  const actions: SiteActions | null = readOnly ? null : {
    find: (stale) => specClient.findImplementation(sessionId, ref, engine, stale),
    decide: (key, decision) => specClient.decideImplementation(sessionId, ref, engine, key, decision),
    align: (key) => specClient.alignSteps(sessionId, ref, engine, key),
  };
  return <div className="impl-col-head">
    <span className="impl-engine">{ENGINE_LABEL[engine]}</span>{mapping && mapping.tests.length > 0 && <span className="impl-note">{plural(mapping.tests.length, "test")}</span>}
    {mapping && <ul className="impl-sites">{mapping.sites.map((site) => <SiteItem key={siteKey(site)} sessionId={sessionId} engine={engine} mapping={mapping} site={site} actions={actions} />)}</ul>}
    <EngineStatus engine={engine} mapping={mapping} working={state.busy ? "working…" : null} notFound={notFound} find={actions && { run: () => void action.run(() => actions.find(null)), busy: action.busy }} testIds={{ notFound: `impl-not-found-${engine}` }} />
    <ErrorText error={action.error ?? state.failed} />
  </div>;
}

/** The engine overview of one algorithm: its steps as rows, Spec | Gecko | Blink | WebKit as columns. A projection of the stored mappings. */
export function ImplementationsView({ state, readOnly = false }: PhaseViewProps) {
  const refs = useMemo(() => [...new Set(state.artifacts.filter((a) => a.type === "SpecAlgorithm").map((a) => (a.data as SpecAlgorithmData).ref))], [state.artifacts]);
  const root = state.artifacts.find((a) => a.type === "SpecOpened" && (a.data as SpecOpenedData).from === null)?.data as SpecOpenedData | undefined;
  const wanted = useUrlParam("ref");
  const ref = wanted && refs.includes(wanted) ? wanted : root?.anchor ?? refs[0] ?? null;
  const [data, setData] = useState<ImplementationsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ensureError, setEnsureError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<(EngineDifference & { index: number }) | null>(null);
  useEffect(() => {
    setEnsureError(null);
    if (ref && !readOnly) specClient.ensureMappings(state.session.id, ref).catch((failure: Error) => setEnsureError(failure.message));
  }, [state.session.id, ref, readOnly]);
  useEffect(() => {
    if (!ref) return;
    let live = true;
    specClient.implementations(state.session.id, ref).then((next) => { if (live) { setData(next); setError(null); } }, (failure: Error) => { if (live) setError(failure.message); });
    return () => { live = false; };
  }, [state.session.id, ref, state.lastEventId]);
  if (!ref) return <p className="empty">No algorithm open</p>;
  const shown = data?.ref === ref ? data : null;
  // A flagged or replaced difference leaves the list without a mouseleave.
  const live = hovered && shown?.comparison.state === "ready" && shown.comparison.differences.some((difference) => difference.index === hovered.index && difference.summary === hovered.summary) ? hovered : null;
  const targets = live ? differenceTargets(live) : null;
  const comparison = shown ? taskState(state.tasks, ["compareEngines", "verifyComparison"], (input) => (input as { algorithmId?: string }).algorithmId === shown.algorithmId) : { busy: false, failed: null };
  return <div className="impl-view" data-testid="impl-view">
    <header className="impl-head"><label>Algorithm <select aria-label="Algorithm" value={ref} onChange={(event) => showSessionView("impl", { ref: event.target.value })}>{refs.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}</select></label>{shown && <span className="impl-note">{shown.title}</span>}</header>
    <ErrorText error={error ?? ensureError} />
    {shown && <DifferencesList sessionId={state.session.id} data={shown} readOnly={readOnly} running={comparison.busy} failed={comparison.failed} onHover={setHovered} />}
    {shown ? <table className="impl-grid">
      <thead><tr><th>Spec</th>{ENGINES.map((engine) => <th key={engine} data-testid={`impl-col-${engine}`}><EngineHeader sessionId={state.session.id} data={shown} engine={engine} state={columnState(state.tasks, shown.algorithmId, engine)} notFound={nothingFound(state.tasks, shown.algorithmId, engine)} readOnly={readOnly} /></th>)}</tr></thead>
      <tbody>{shown.steps.map((step) => <tr key={step.number} data-step={step.number} className={targets?.steps.has(step.number) ? "highlight" : undefined}>
        <td className="impl-step" style={{ paddingLeft: 6 + step.depth * 14 }}><span className="impl-note">{step.number}</span> {step.text}</td>
        {ENGINES.map((engine) => { const mapping = shown.mappings[engine]; return <td key={engine}>{mapping && mappedSteps(mapping, step.number).map(({ site, step: entry }) => <span key={`${siteKey(site)}:${entry.line}`} className={`impl-cell ${entry.verdict}${cellHighlighted(targets, engine, site.path, entry.line, entry.end ?? entry.line) ? " highlight" : ""}`}><a href={codeUrl(mapping, site.path, entry.line)} target="_blank" rel="noreferrer" data-testid={`impl-cell-${engine}`} title={entry.detail}>L{entry.line}{entry.end !== undefined && entry.end !== entry.line ? `–${entry.end}` : ""}</a><code>{entry.quote?.trim()}</code></span>)}</td>; })}
      </tr>)}</tbody>
    </table> : !error && <p className="empty">Loading…</p>}
  </div>;
}
