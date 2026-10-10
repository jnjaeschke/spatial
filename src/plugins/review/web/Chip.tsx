import type { MouseEvent } from "react";

/** One-line inline marker for an item shown in the details panel. */
export function Chip({ kind, label, count, severity, selected, testId, onOpen }: { kind: "chat" | "comment" | "finding" | "phab" | "spec"; label: string; count?: number; severity?: string; selected: boolean; testId: string; onOpen(): void }) {
  const stop = (event: MouseEvent<HTMLButtonElement>) => event.stopPropagation();
  return <button type="button" className={`review-chip kind-${kind}${severity ? ` severity-${severity}` : ""}`} aria-label={`${kind}: ${label}`} aria-pressed={selected} data-testid={testId} title={label} onMouseDown={stop} onClick={(event) => { stop(event); onOpen(); }}><span>{label}</span>{count !== undefined && <small>{count}</small>}</button>;
}
