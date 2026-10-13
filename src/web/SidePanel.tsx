import type { KeyboardEventHandler, ReactNode, Ref } from "react";
import { IconButton } from "./IconButton.tsx";

/** A side panel with a shared header, close button and scrolling body; the body is focusable for panel shortcuts. */
export function SidePanel({ title, closeLabel, onClose, onBack, testId, headerExtra, bodyRef, className, onKeyDown, children }: { title: ReactNode; closeLabel: string; onClose(): void; onBack?(): void; testId?: string; headerExtra?: ReactNode; bodyRef?: Ref<HTMLDivElement>; className?: string; onKeyDown?: KeyboardEventHandler<HTMLElement>; children: ReactNode }) {
  const handleKeyDown: KeyboardEventHandler<HTMLElement> = (event) => {
    onKeyDown?.(event);
    if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); onClose(); }
  };
  return <aside className={["side-panel", className].filter(Boolean).join(" ")} data-testid={testId} onKeyDown={handleKeyDown}>
    <header><span>{title}</span>{onBack && <IconButton className="link-button" label="Back" onClick={onBack}>←</IconButton>}{headerExtra}<IconButton className="link-button" label={closeLabel} onClick={onClose}>×</IconButton></header>
    <div className="side-panel-body" ref={bodyRef} tabIndex={-1}>{children}</div>
  </aside>;
}
