import { createContext, useEffect, useMemo, useRef, useState } from "react";
import type { Artifact, DiffFile, Hunk, Id, LineRange, LlmSelection, SessionState, SpecReferenceData, StepLink } from "../shared/types.ts";
import { numberLines, type Row } from "../shared/diff-lines.ts";
import { parseSteps } from "../shared/spec-text.ts";
import { DiffRows } from "./FilePanel.tsx";
import { latestNarrative } from "./graph.ts";
import { api } from "./api.ts";
import { latestStepMap, lineKey, linksByLine, stepStatuses, unmappedByLine, worstKind, type StepStatus } from "./spec-map.ts";

/** Opens the spec view for a SpecReference; null where there is none (static export). */
export const SpecViewContext = createContext<((specId: Id) => void) | null>(null);

const STATUS_LABEL: Record<StepStatus, string> = { implements: "implements", partial: "partial", structural: "structural", deviates: "deviates", substeps: "via substeps", unmapped: "not mapped" };
const rowSide = (row: Row): LineRange["side"] => row.kind === "del" ? "old" : "new";
const rowLine = (row: Row) => row.kind === "del" ? row.old! : row.new!;

/** A spec section's steps beside the hunks of the changes citing it, colored by the step map. */
export function SpecView({ state, specId, llm, onClose }: { state: SessionState; specId: Id; llm: LlmSelection; onClose: () => void }) {
  const spec = state.artifacts.find((a) => a.id === specId) as Artifact<SpecReferenceData> | undefined;
  const resolved = spec?.data.resolved;
  const latest = latestNarrative(state);
  if (!resolved || !latest) throw new Error(`Spec view needs a resolved spec and a narrative (${specId})`);
  const narrativeId = latest.narrative.id;
  const steps = useMemo(() => parseSteps(resolved.content), [resolved.content]);
  const map = latestStepMap(state, specId, narrativeId);
  const task = state.tasks.findLast((t) => t.kind === "mapSpecSteps" && (t.input as { specId: Id; narrativeId: Id }).specId === specId && (t.input as { narrativeId: Id }).narrativeId === narrativeId);
  const links = useMemo(() => map?.data.links ?? [], [map]);
  const statuses = useMemo(() => stepStatuses(steps, links), [steps, links]);
  const byLine = useMemo(() => linksByLine(links), [links]);
  const unmapped = useMemo(() => map?.data.unmapped ?? [], [map]);
  const otherByLine = useMemo(() => unmappedByLine(unmapped), [unmapped]);
  const hunks = useMemo(() => {
    const changes = new Set(state.links.filter((l) => l.kind === "supports" && l.from === specId && l.to.startsWith(`${narrativeId}#`)).map((l) => l.to.slice(narrativeId.length + 1)));
    const ids = new Set(latest.narrative.data.changes.filter((c) => changes.has(c.id)).flatMap((c) => c.hunkIds));
    return latest.diff.data.files.flatMap((file) => file.hunks.filter((hunk) => ids.has(hunk.id)).map((hunk) => ({ file, hunk, rows: numberLines(hunk).map((row) => ({ ...row, hunkId: hunk.id })) })));
  }, [state.links, specId, narrativeId, latest]);
  const unexplainedAdds = hunks.reduce((sum, { file, rows }) => sum + rows.filter((row) => row.kind === "add" && !byLine.has(lineKey(file.path, "new", row.new!)) && [undefined, "unexplained"].includes(otherByLine.get(lineKey(file.path, "new", row.new!))?.reason)).length, 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const code = useRef<HTMLDivElement>(null);
  const selectedRanges = useMemo(() => selected?.startsWith("other:") ? unmapped[Number(selected.slice(6))]?.ranges ?? [] : links.filter((link) => link.step === selected).flatMap((link) => link.ranges), [links, selected, unmapped]);

  useEffect(() => {
    const range = selectedRanges[cursor];
    if (!range || !code.current) return;
    code.current.querySelector(`tr[data-path="${CSS.escape(range.path)}"][data-${range.side}="${range.start}"]`)?.scrollIntoView({ block: "center" });
  }, [selectedRanges, cursor]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable]")) return;
      if (event.key === "Escape") onClose();
      else if ((event.key === "n" || event.key === "p") && selectedRanges.length) setCursor((c) => (c + (event.key === "n" ? 1 : selectedRanges.length - 1)) % selectedRanges.length);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, selectedRanges.length]);

  const select = (step: string, range = 0) => { setSelected(step); setCursor(range); };
  const rowClass = (path: string) => (row: Row) => {
    const covering = byLine.get(lineKey(path, rowSide(row), rowLine(row)));
    if (covering) return `map-${worstKind(covering)}${covering.some((link) => link.step === selected) ? " map-selected" : ""}`;
    const other = otherByLine.get(lineKey(path, rowSide(row), rowLine(row)));
    if (other) return `map-${other.reason}${selected === `other:${unmapped.indexOf(other)}` ? " map-selected" : ""}`;
    return row.kind === "add" ? "map-none" : undefined;
  };
  const onRowClick = (path: string) => (row: Row) => {
    const side = rowSide(row), line = rowLine(row);
    const link = byLine.get(lineKey(path, side, line))?.[0];
    if (!link) {
      const other = otherByLine.get(lineKey(path, side, line));
      if (!other) return;
      const index = unmapped.indexOf(other);
      select(`other:${index}`, Math.max(0, other.ranges.findIndex((r) => r.path === path && r.side === side && r.start <= line && line <= r.end)));
      return;
    }
    const ranges = links.filter((item) => item.step === link.step).flatMap((item) => item.ranges);
    select(link.step, Math.max(0, ranges.findIndex((r) => r.path === path && r.side === side && r.start <= line && line <= r.end)));
  };
  const running = task?.status === "pending" || task?.status === "running";
  const mapped = steps.filter((step) => statuses.get(step.number) !== "unmapped").length;
  const deviates = steps.filter((step) => statuses.get(step.number) === "deviates").length;
  const notesFor = (step: string): StepLink[] => links.filter((link) => link.step === step);

  return <section className="spec-view" data-testid="spec-view">
    <header>
      <b>{resolved.spec}#{resolved.anchor}</b><span className="spec-view-title">{resolved.title}</span>
      <a href={resolved.url} target="_blank" rel="noreferrer">open spec</a>
      <span className="spec-view-status" data-testid="spec-map-status">
        {running ? "Mapping steps…" : task?.status === "failed" ? `Mapping failed: ${task.error}` : map ? `${mapped} of ${steps.length} steps mapped${deviates ? ` · ${deviates} deviate${deviates === 1 ? "s" : ""}` : ""} · ${unexplainedAdds} added line${unexplainedAdds === 1 ? "" : "s"} unexplained` : "Steps not mapped yet"}
        {map?.data.dropped.length ? <span className="badge muted" title={map.data.dropped.join("\n")}>{map.data.dropped.length} dropped</span> : null}
      </span>
      {!running && <button onClick={() => { setError(null); api.mapSpecSteps(state.session.id, specId, llm).catch((e: Error) => setError(e.message)); }}>{map || task ? "Map again" : "Map steps"}</button>}
      {error && <span className="failed">{error}</span>}
      <span className="spacer" />
      <span className="spec-legend">{(["implements", "partial", "structural", "deviates"] as const).map((kind) => <span key={kind} className={`legend map-${kind}`}>{kind}</span>)}{(["plumbing", "error-path", "test", "unexplained"] as const).map((reason) => <span key={reason} className={`legend map-${reason}`}>{reason}</span>)}<span className="legend map-none">not mapped</span></span>
      <button aria-label="Close spec view" onClick={onClose}>×</button>
    </header>
    <div className="spec-view-body">
      <div className="spec-steps"><ol>
        {steps.map((step) => {
          const status = statuses.get(step.number)!;
          const notes = notesFor(step.number);
          return <li key={step.number} style={{ paddingLeft: `${step.depth * 18}px` }}>
            <button className={`spec-step status-${status}${selected === step.number ? " selected" : ""}`} data-testid={`step-${step.number}`} onClick={() => select(step.number)}>
              <span className="step-number">{step.number}</span><span className="step-text">{step.text}</span><span className="step-status">{STATUS_LABEL[status]}</span>
            </button>
            {selected === step.number && notes.length > 0 && <ul className="step-notes">{notes.map((link, i) => <li key={i}><span className={`legend map-${link.kind}`}>{link.kind}</span> {link.note}{link.ranges.length > 0 && <span className="step-ranges"> {link.ranges.map((r) => `${r.path.split("/").at(-1)}:${r.start}${r.end > r.start ? `–${r.end}` : ""}`).join(", ")}</span>}</li>)}{selectedRanges.length > 1 && <li className="step-cycle">n / p: range {cursor + 1} of {selectedRanges.length}</li>}</ul>}
          </li>;
        })}
      </ol>{unmapped.length > 0 && <><h3>Other changed lines</h3><ol>{unmapped.map((entry, index) => <li key={index}><button className={`spec-step status-${entry.reason}${selected === `other:${index}` ? " selected" : ""}`} data-testid={`unmapped-${index}`} onClick={() => select(`other:${index}`)}><span className="step-number">{entry.reason}</span><span className="step-text">{entry.note}<span className="step-ranges"> {entry.ranges.map((r) => `${r.path.split("/").at(-1)}:${r.start}${r.end > r.start ? `–${r.end}` : ""}`).join(", ")}</span></span></button>{selected === `other:${index}` && selectedRanges.length > 1 && <div className="step-cycle">n / p: range {cursor + 1} of {selectedRanges.length}</div>}</li>)}</ol></>}</div>
      <div className="spec-code" ref={code}>
        {hunks.map(({ file, hunk, rows }: { file: DiffFile; hunk: Hunk; rows: Row[] }) => <div className="diff" key={hunk.id} data-testid={`spec-hunk-${hunk.id}`}>
          <div className="diff-head">{file.path} <span className="hunk-header">{hunk.header}</span></div>
          <table><tbody><DiffRows rows={rows} diffId={latest.diff.id} path={file.path} rowClass={rowClass(file.path)} onRowClick={onRowClick(file.path)} /></tbody></table>
        </div>)}
      </div>
    </div>
  </section>;
}
