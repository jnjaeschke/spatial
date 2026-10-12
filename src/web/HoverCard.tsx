import type { ReactNode } from "react";

/** A fixed card beside `rect` (below it when there is room, else above), kept open while hovered through `onEnter`/`onLeave`. */
export function HoverCard({ label, rect, testId, pinned, onEnter, onLeave, children }: { label: string; rect: DOMRect; testId: string; pinned?: boolean; onEnter(): void; onLeave(): void; children: ReactNode }) {
  const below = window.innerHeight - rect.bottom >= 326;
  return <div role="dialog" aria-label={label} data-testid={testId} className="hover-card" style={{ left: Math.min(rect.left, window.innerWidth - 360), ...(below ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6, maxHeight: rect.top - 12 }) }} onMouseEnter={onEnter} onMouseLeave={onLeave} data-pinned={pinned}>
    {children}
  </div>;
}
