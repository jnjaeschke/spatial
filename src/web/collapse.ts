import { createContext, useCallback, useState } from "react";

/** Collapsed node ids. Client-only view state, kept per session in localStorage. */
export const CollapseContext = createContext<{ collapsed: ReadonlySet<string>; toggle(id: string): void } | null>(null);

export function useCollapsed(sessionId: string) {
  const key = `spatial-ide:collapsed:${sessionId}`;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]));
  const save = useCallback((next: ReadonlySet<string>) => { localStorage.setItem(key, JSON.stringify([...next])); setCollapsed(next); }, [key]);
  const toggle = useCallback((id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    localStorage.setItem(key, JSON.stringify([...next]));
    return next;
  }), [key]);
  return { collapsed, toggle, expandAll: () => save(new Set()) };
}

declare global {
  interface HighlightRegistry {
    highlightsFromPoint(x: number, y: number): { highlight: Highlight; ranges: AbstractRange[] }[];
  }
}
