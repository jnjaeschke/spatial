import type { KeyboardEventHandler, ReactNode, Ref } from "react";

/** A side panel with a shared header, close button and scrolling body; the body is focusable for panel shortcuts. */
export function SidePanel({ title, closeLabel, onClose, testId, headerExtra, bodyRef, className, onKeyDown, children }: { title: ReactNode; closeLabel: string; onClose(): void; testId?: string; headerExtra?: ReactNode; bodyRef?: Ref<HTMLDivElement>; className?: string; onKeyDown?: KeyboardEventHandler<HTMLElement>; children: ReactNode }) {
  return <aside className={["side-panel", className].filter(Boolean).join(" ")} data-testid={testId} onKeyDown={onKeyDown}>
    <header><span>{title}</span>{headerExtra}<button aria-label={closeLabel} onClick={onClose}>×</button></header>
    <div className="side-panel-body" ref={bodyRef} tabIndex={-1}>{children}</div>
  </aside>;
}
