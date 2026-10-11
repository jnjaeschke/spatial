import { createContext, useMemo, useState, type KeyboardEvent } from "react";
import type { LineRange, SpecReferenceData, StepLink } from "../../spec/web/api.ts";
import { type Artifact, type Id, type LlmSelection, type SessionState, SidePanel, api, numberLines } from "../../../web/plugin-api.ts";
import { parseSteps } from "../../spec/web/api.ts";
import { latestNarrative } from "./graph.ts";
import { latestStepMap, lineKey, linksByLine, stepStatuses, unmappedByLine, worstKind, type StepStatus } from "./spec-map.ts";
import { ErrorText, useAction } from "../../../web/plugin-api.ts";
import { SpecMarkdown } from "../../spec/web/api.ts";

export interface SpecStepSelection { ranges: LineRange[]; kind: string | null }
export const SpecStepContext = createContext<SpecStepSelection | null>(null);

const STATUS_LABEL: Record<StepStatus, string> = { implements: "implements", partial: "partial", structural: "structural", deviates: "deviates", substeps: "via substeps", unmapped: "not mapped" };

type SpecPanelProps = { state: SessionState; specId: Id; llm: LlmSelection | null; onClose(): void; onBack?: () => void; onFocusRange(range: LineRange): void; onSelection(selection: SpecStepSelection): void };

/** Spec section details and the selected step's mapped source ranges. */
export function SpecPanel(props: SpecPanelProps) {
  const spec = props.state.artifacts.find((a) => a.id === props.specId) as Artifact<SpecReferenceData> | undefined;
  if (!spec) throw new Error(`Unknown spec ${props.specId}`);
  return spec.data.resolved ? <ResolvedSpecPanel {...props} spec={spec} resolved={spec.data.resolved} /> : <SidePanel className="spec-panel" title={spec.data.url} closeLabel="Close spec" onClose={props.onClose} testId="spec-panel" onBack={props.onBack}>
    <div className="spec-panel-content"><span className="badge unverified">unverified</span><p className="failed">{spec.data.reason}</p><a href={spec.data.url} target="_blank" rel="noreferrer">open spec</a></div>
  </SidePanel>;
}

function ResolvedSpecPanel({ state, specId, llm, onClose, onBack, onFocusRange, onSelection, spec, resolved }: SpecPanelProps & { spec: Artifact<SpecReferenceData>; resolved: NonNullable<SpecReferenceData["resolved"]> }) {
  const latest = latestNarrative(state);
  if (!latest) throw new Error(`Spec panel needs a narrative (${specId})`);
  const narrativeId = latest.narrative.id;
  const steps = useMemo(() => parseSteps(resolved.content), [resolved.content]);
  const map = latestStepMap(state, specId, narrativeId);
  const task = state.tasks.findLast((t) => t.kind === "mapSpecSteps" && (t.input as { specId: Id; narrativeId: Id }).specId === specId && (t.input as { narrativeId: Id }).narrativeId === narrativeId);
  const links = map?.data.links ?? [];
  const statuses = useMemo(() => stepStatuses(steps, links), [steps, links]);
  const byLine = useMemo(() => linksByLine(links), [links]);
  const unmapped = map?.data.unmapped ?? [];
  const otherByLine = useMemo(() => unmappedByLine(unmapped), [unmapped]);
  const [selected, setSelected] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const action = useAction();
  const selectedRanges = useMemo(() => selected?.startsWith("other:") ? unmapped[Number(selected.slice(6))]?.ranges ?? [] : links.filter((link) => link.step === selected).flatMap((link) => link.ranges), [links, selected, unmapped]);
  const supportedChanges = new Set(state.links.filter((link) => link.kind === "supports" && link.from === specId && link.to.startsWith(`${narrativeId}#`)).map((link) => link.to.slice(narrativeId.length + 1)));
  const supportedHunks = new Set(latest.narrative.data.changes.filter((change) => supportedChanges.has(change.id)).flatMap((change) => change.hunkIds));
  const hasSupportedChanges = supportedChanges.size > 0;
  const unexplainedAdds = latest.diff.data.files.reduce((sum, file) => sum + file.hunks.filter((hunk) => supportedHunks.has(hunk.id)).flatMap((hunk) => numberLines(hunk)).filter((row) => row.kind === "add" && !byLine.has(lineKey(file.path, "new", row.new!)) && [undefined, "unexplained"].includes(otherByLine.get(lineKey(file.path, "new", row.new!))?.reason)).length, 0);
  const running = task?.status === "pending" || task?.status === "running";
  const mapped = steps.filter((step) => statuses.get(step.number) !== "unmapped").length;
  const deviates = steps.filter((step) => statuses.get(step.number) === "deviates").length;
  const select = (step: string) => {
    setSelected(step);
    setCursor(0);
    const ranges = step.startsWith("other:") ? unmapped[Number(step.slice(6))]?.ranges ?? [] : links.filter((link) => link.step === step).flatMap((link) => link.ranges);
    const kind = step.startsWith("other:") ? unmapped[Number(step.slice(6))]?.reason ?? null : worstKind(links.filter((link) => link.step === step));
    onSelection({ ranges, kind });
    const range = ranges[0];
    if (range) onFocusRange(range);
  };
  const notesFor = (step: string): StepLink[] => links.filter((link) => link.step === step);
  const keydown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    else if ((event.key === "n" || event.key === "p") && selectedRanges.length) {
      event.preventDefault();
      const next = (cursor + (event.key === "n" ? 1 : selectedRanges.length - 1)) % selectedRanges.length;
      setCursor(next);
      onFocusRange(selectedRanges[next]!);
    }
  };

  return <>
    <SidePanel className="spec-panel" title={`${resolved.spec}#${resolved.anchor}`} closeLabel="Close spec" onClose={onClose} testId="spec-panel" onKeyDown={keydown} onBack={onBack}>
      <div className="spec-panel-content">
        <header className="spec-panel-heading"><span className="spec-view-title">{resolved.title}</span><a href={resolved.url} target="_blank" rel="noreferrer">open spec</a>{spec.status !== "verified" && <span className="badge unverified">unverified</span>}{spec.status === "verified" && spec.data.origin === "code" && <span className="badge cited">cited in code</span>}{spec.status === "verified" && spec.data.origin === "llm" && <span className="badge inferred">inferred</span>}{spec.status === "verified" && spec.data.origin === "link" && <span className="badge linked">linked</span>}</header>
        {spec.data.geckoRefs.length > 0 && <ul className="files">{spec.data.geckoRefs.map((g) => <li key={g.url}><a href={g.url} target="_blank" rel="noreferrer">{g.group}: {g.path}:{g.line}</a></li>)}</ul>}
        {spec.data.geckoRefsError && <p className="failed">Searchfox: {spec.data.geckoRefsError}</p>}
        {hasSupportedChanges && <><div className="spec-view-status" data-testid="spec-map-status">{running ? "Mapping steps…" : task?.status === "failed" ? `Mapping failed: ${task.error}` : map ? `${mapped} of ${steps.length} steps mapped${deviates ? ` · ${deviates} deviate${deviates === 1 ? "s" : ""}` : ""} · ${unexplainedAdds} added line${unexplainedAdds === 1 ? "" : "s"} unexplained` : "Steps not mapped yet"}{map?.data.dropped.length ? <span className="badge muted" title={map.data.dropped.join("\n")}>{map.data.dropped.length} dropped</span> : null}</div>
        {!running && llm && <button onClick={() => void action.run(() => api.mapSpecSteps(state.session.id, specId, llm))}>{map || task ? "Map again" : "Map steps"}</button>}<ErrorText error={action.error} /></>}
        <div className="spec-section-text"><SpecMarkdown text={resolved.content} /></div>
        {hasSupportedChanges && <div className="spec-legend">{(["implements", "partial", "structural", "deviates"] as const).map((kind) => <span key={kind} className={`legend map-${kind}`}>{kind}</span>)}{(["plumbing", "error-path", "test", "unexplained"] as const).map((reason) => <span key={reason} className={`legend map-${reason}`}>{reason}</span>)}<span className="legend map-none">not mapped</span></div>}
        <div className="spec-steps"><ol>{steps.map((step) => { const status = statuses.get(step.number)!; const notes = notesFor(step.number); return <li key={step.number} style={{ paddingLeft: `${step.depth * 18}px` }}>
          <button className={`spec-step status-${status}${selected === step.number ? " selected" : ""}`} data-testid={`step-${step.number}`} onClick={() => select(step.number)}><span className="step-number">{step.number}</span><span className="step-text">{step.text}</span><span className="step-status">{STATUS_LABEL[status]}</span></button>
          {selected === step.number && notes.length > 0 && <ul className="step-notes">{notes.map((link, i) => <li key={i}><span className={`legend map-${link.kind}`}>{link.kind}</span> {link.note}{link.ranges.length > 0 && <span className="step-ranges"> {link.ranges.map((r) => `${r.path.split("/").at(-1)}:${r.start}${r.end > r.start ? `–${r.end}` : ""}`).join(", ")}</span>}</li>)}</ul>}
        </li>; })}</ol>{unmapped.length > 0 && <><h3>Other changed lines</h3><ol>{unmapped.map((entry, index) => <li key={index}><button className={`spec-step status-${entry.reason}${selected === `other:${index}` ? " selected" : ""}`} data-testid={`unmapped-${index}`} onClick={() => select(`other:${index}`)}><span className="step-number">{entry.reason}</span><span className="step-text">{entry.note}<span className="step-ranges"> {entry.ranges.map((r) => `${r.path.split("/").at(-1)}:${r.start}${r.end > r.start ? `–${r.end}` : ""}`).join(", ")}</span></span></button></li>)}</ol></>}</div>
      </div>
    </SidePanel>
  </>;
}
