import { useEffect, useMemo, useState } from "react";
import { ErrorText, IconButton, showSessionView, useAction, useUrlParam, type PhaseViewProps } from "../../../web/plugin-api.ts";
import type { Engine } from "../../../plugin-api.ts";
import type { EngineDifference, EngineMapping, EngineSite, ImplementationsData, SpecAlgorithmData, SpecOpenedData } from "../shared/types.ts";
import { codeUrl, mappedSteps, siteKey, siteName } from "../shared/engine.ts";
import { cellHighlighted, columnState, differenceTargets } from "./implementations.ts";
import { DifferencesList } from "./DifferencesList.tsx";
import { specClient } from "./client.ts";

const ENGINES: Engine[] = ["gecko", "blink", "webkit"];
const LABEL: Record<Engine, string> = { gecko: "Gecko", blink: "Blink", webkit: "WebKit" };
const METHOD: Record<EngineSite["method"], string> = { "spec-link": "spec-link comment", "spec-link-heuristic": "spec-link comment, function found by brace scan", llm: "proposed by the LLM", user: "confirmed by you" };

function SiteEntry({ sessionId, data, engine, mapping, site, readOnly }: { sessionId: string; data: ImplementationsData; engine: Engine; mapping: EngineMapping; site: EngineSite; readOnly: boolean }) {
  const action = useAction();
  const name = siteName(site);
  const key = siteKey(site);
  const proposal = site.method === "llm" && !site.stale;
  const alignable = site.method !== "llm" && !site.stale && !site.steps.some((step) => step.verdict !== "proposed");
  return <li className={`impl-site method-${site.method}${site.stale ? " stale" : ""}`}>
    <a href={codeUrl(mapping, site.path, site.line)} target="_blank" rel="noreferrer" data-testid={`impl-site-${engine}`} title={`${site.path}:${site.line}, ${METHOD[site.method]}`}>{name}</a>
    {proposal && <span className="badge">AI-proposed</span>}
    {proposal && site.why && <span className="impl-note">{site.why}</span>}
    {!readOnly && proposal && <><IconButton type="button" className="link-button" label={`Confirm ${name}`} disabled={action.busy} onClick={() => void action.run(() => specClient.decideImplementation(sessionId, data.ref, engine, key, "confirm"))}>Confirm</IconButton><IconButton type="button" className="link-button" label={`Reject ${name}`} disabled={action.busy} onClick={() => void action.run(() => specClient.decideImplementation(sessionId, data.ref, engine, key, "reject"))}>Reject</IconButton></>}
    {!readOnly && site.stale && <IconButton type="button" className="link-button" label={`Find again: ${name}`} disabled={action.busy} onClick={() => void action.run(() => specClient.findImplementation(sessionId, data.ref, engine, key))}>Find again</IconButton>}
    {!readOnly && alignable && <IconButton type="button" className="link-button" label={`Align steps ${name}`} disabled={action.busy} onClick={() => void action.run(() => specClient.alignSteps(sessionId, data.ref, engine, key))}>Align steps</IconButton>}
    <ErrorText error={action.error} />
  </li>;
}

function EngineHeader({ sessionId, data, engine, state, readOnly }: { sessionId: string; data: ImplementationsData; engine: Engine; state: { busy: boolean; failed: string | null }; readOnly: boolean }) {
  const action = useAction();
  const mapping = data.mappings[engine];
  const placed = mapping?.sites.some((site) => !site.stale) ?? false;
  return <div className="impl-col-head">
    <span className="impl-engine">{LABEL[engine]}</span>{mapping && mapping.tests.length > 0 && <span className="impl-note">{mapping.tests.length} {mapping.tests.length === 1 ? "test" : "tests"}</span>}
    {mapping ? <ul className="impl-sites">{mapping.sites.map((site) => <SiteEntry key={siteKey(site)} sessionId={sessionId} data={data} engine={engine} mapping={mapping} site={site} readOnly={readOnly} />)}</ul> : !state.busy && !state.failed && <span className="impl-note">not mapped</span>}
    {!readOnly && mapping && !placed && !state.busy && <button type="button" disabled={action.busy} onClick={() => void action.run(() => specClient.findImplementation(sessionId, data.ref, engine, null))}>Find in {LABEL[engine]}</button>}
    {state.busy && <span className="impl-note">working…</span>}
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
  const [hovered, setHovered] = useState<EngineDifference | null>(null);
  useEffect(() => { if (ref && !readOnly) specClient.ensureMappings(state.session.id, ref).catch((failure: Error) => setError(failure.message)); }, [state.session.id, ref, readOnly]);
  useEffect(() => {
    if (!ref) return;
    let live = true;
    specClient.implementations(state.session.id, ref).then((next) => { if (live) { setData(next); setError(null); } }, (failure: Error) => { if (live) setError(failure.message); });
    return () => { live = false; };
  }, [state.session.id, ref, state.lastEventId]);
  if (!ref) return <p className="empty">No algorithm open</p>;
  const shown = data?.ref === ref ? data : null;
  const targets = hovered ? differenceTargets(hovered) : null;
  const comparing = state.tasks.some((task) => (task.kind === "compareEngines" || task.kind === "verifyComparison") && (task.status === "pending" || task.status === "running") && (task.input as { algorithmId?: string }).algorithmId === shown?.algorithmId);
  return <div className="impl-view" data-testid="impl-view">
    <header className="impl-head"><label>Algorithm <select aria-label="Algorithm" value={ref} onChange={(event) => showSessionView("impl", { ref: event.target.value })}>{refs.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}</select></label>{shown && <span className="impl-note">{shown.title}</span>}</header>
    <ErrorText error={error} />
    {shown && <DifferencesList sessionId={state.session.id} data={shown} readOnly={readOnly} running={comparing} onHover={setHovered} />}
    {shown ? <table className="impl-grid">
      <thead><tr><th>Spec</th>{ENGINES.map((engine) => <th key={engine} data-testid={`impl-col-${engine}`}><EngineHeader sessionId={state.session.id} data={shown} engine={engine} state={columnState(state.tasks, shown.algorithmId, engine)} readOnly={readOnly} /></th>)}</tr></thead>
      <tbody>{shown.steps.map((step) => <tr key={step.number} data-step={step.number} className={targets?.steps.has(step.number) ? "highlight" : undefined}>
        <td className="impl-step" style={{ paddingLeft: 6 + step.depth * 14 }}><span className="impl-note">{step.number}</span> {step.text}</td>
        {ENGINES.map((engine) => { const mapping = shown.mappings[engine]; return <td key={engine}>{mapping && mappedSteps(mapping, step.number).map(({ site, step: entry }) => <span key={`${siteKey(site)}:${entry.line}`} className={`impl-cell ${entry.verdict}${cellHighlighted(targets, engine, site.path, entry.line, entry.end ?? entry.line) ? " highlight" : ""}`}><a href={codeUrl(mapping, site.path, entry.line)} target="_blank" rel="noreferrer" data-testid={`impl-cell-${engine}`} title={entry.detail}>L{entry.line}{entry.end !== undefined && entry.end !== entry.line ? `–${entry.end}` : ""}</a><code>{entry.quote?.trim()}</code></span>)}</td>; })}
      </tr>)}</tbody>
    </table> : !error && <p className="empty">Loading…</p>}
  </div>;
}
