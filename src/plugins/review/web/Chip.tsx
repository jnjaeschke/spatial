import { useContext, type MouseEvent } from "react";
import type { FindingData, PhabThreadData } from "./graph.ts";
import { DetailsContext } from "./details.ts";

/** One-line inline marker for an item shown in the details panel. */
export function Chip({ kind, label, count, severity, dimmed, selected, testId, onOpen }: { kind: "chat" | "comment" | "finding" | "phab" | "spec"; label: string; count?: number; severity?: string; dimmed?: boolean; selected: boolean; testId: string; onOpen(): void }) {
  const stop = (event: MouseEvent<HTMLButtonElement>) => event.stopPropagation();
  return <button type="button" className={`review-chip kind-${kind}${severity ? ` severity-${severity}` : ""}${dimmed ? " dismissed" : ""}`} aria-label={`${kind}: ${label}`} aria-pressed={selected} data-testid={testId} title={label} onMouseDown={stop} onClick={(event) => { stop(event); onOpen(); }}><span>{label}</span>{count !== undefined && <small>{count}</small>}</button>;
}

/** The chip of a finding; dismissed findings are dimmed. */
export function FindingChip({ finding }: { finding: FindingData }) {
  const details = useContext(DetailsContext);
  return <Chip kind="finding" label={finding.title} count={finding.thread?.messages.length} severity={finding.severity} dimmed={finding.decision === "dismissed"} selected={details?.current?.kind === "finding" && details.current.id === finding.findingId} testId={`finding-chip-${finding.findingId}`} onOpen={() => details?.open({ kind: "finding", id: finding.findingId })} />;
}

/** The inline chip for a Phabricator thread. */
export function PhabChip({ thread }: { thread: PhabThreadData }) {
  const details = useContext(DetailsContext);
  return <Chip kind="phab" label={thread.comments[0]!.data.body.split("\n")[0]!} count={thread.comments.length} dimmed={thread.done} selected={details?.current?.kind === "phab" && details.current.anchorId === thread.anchorId} testId={`phab-chip-${thread.anchorId}`} onOpen={() => details?.open({ kind: "phab", anchorId: thread.anchorId })} />;
}

/** The inline chip for a spec section a change supports. */
export function SpecChip({ specId, title }: { specId: string; title: string }) {
  const details = useContext(DetailsContext);
  return <Chip kind="spec" label={title} selected={details?.current?.kind === "spec" && details.current.specId === specId} testId={`spec-chip-${specId}`} onOpen={() => details?.open({ kind: "spec", specId })} />;
}
