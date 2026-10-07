import { createContext, useCallback, useState } from "react";

/** Closed chat and diagram ids. Client-only view state, kept per session in localStorage. */
export const ClosedContext = createContext<{ close(id: string): void; reopen(ids: string[]): void; closedOn: ReadonlyMap<string, string[]> } | null>(null);

export function useClosed(sessionId: string) {
  const key = `spatial-ide:closed:${sessionId}`;
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]));
  const update = useCallback((apply: (ids: Set<string>) => void) => setClosed((prev) => {
    const next = new Set(prev);
    apply(next);
    localStorage.setItem(key, JSON.stringify([...next]));
    return next;
  }), [key]);
  const close = useCallback((id: string) => update((ids) => ids.add(id)), [update]);
  const reopen = useCallback((ids: string[]) => update((current) => { for (const id of ids) current.delete(id); }), [update]);
  return { closed, close, reopen };
}
