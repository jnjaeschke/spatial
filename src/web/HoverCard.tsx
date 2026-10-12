import { useEffect, useMemo, useRef, useState, type ReactNode, type SetStateAction } from "react";

/** A fixed card beside `rect` (below it when there is room, else above), kept open while hovered through `onEnter`/`onLeave`. */
export function HoverCard({ label, rect, testId, pinned, onEnter, onLeave, children }: { label: string; rect: DOMRect; testId: string; pinned?: boolean; onEnter(): void; onLeave(): void; children: ReactNode }) {
  const below = window.innerHeight - rect.bottom >= 326;
  return <div role="dialog" aria-label={label} data-testid={testId} className="hover-card" style={{ left: Math.min(rect.left, window.innerWidth - 360), ...(below ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6, maxHeight: rect.top - 12 }) }} onMouseEnter={onEnter} onMouseLeave={onLeave} data-pinned={pinned}>
    {children}
  </div>;
}

const SHOW_DELAY = 300;
const HIDE_DELAY = 200;

/**
 * The open card of a hover target: `show` opens it after a delay, `hide` closes it after a shorter one, and `keep` cancels either
 * (the card's `onEnter` is `keep`, its `onLeave` is `hide`). `set` changes it at once. `hide` leaves open a card that `pinned` holds.
 * The functions are stable across renders.
 */
export function useHoverCard<T>(pinned?: (card: T) => boolean): { open: T | null; show(card: SetStateAction<T | null>): void; hide(): void; keep(): void; set(card: T | null): void } {
  const [open, setOpen] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(pinned);
  held.current = pinned;
  const actions = useMemo(() => {
    const keep = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
    const later = (delay: number, card: SetStateAction<T | null>) => { keep(); timer.current = setTimeout(() => setOpen(card), delay); };
    return {
      show: (card: SetStateAction<T | null>) => later(SHOW_DELAY, card),
      hide: () => later(HIDE_DELAY, (current) => current && held.current?.(current) ? current : null),
      keep,
      set: (card: T | null) => { keep(); setOpen(card); },
    };
  }, []);
  useEffect(() => actions.keep, [actions]);
  return { open, ...actions };
}
